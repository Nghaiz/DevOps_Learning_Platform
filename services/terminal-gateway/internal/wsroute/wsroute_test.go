package wsroute_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"regexp"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/wsroute"
	"github.com/coder/websocket"
	"github.com/prometheus/client_golang/prometheus"
)

const testOrigin = "https://app.example.test"

// spySessions đếm số lần Redis bị chạm.
//
// Đếm là điểm chính, không phải trả dữ liệu: acceptance của phase-1 đòi các ca
// IDOR phải chết TRƯỚC UPGRADE và "apiserver không nhận request nào". Vế tương
// đương ở tầng này là "Redis không bị hỏi" — không đếm thì một implement kiểm
// sai thứ tự (đọc Redis trước rồi mới so sid) vẫn cho toàn bộ test xanh.
type spySessions struct {
	getCalls     atomic.Int32
	acquireCalls atomic.Int32
	sess         *sessionstore.Session
	getErr       error
	acquireErr   error
}

func (s *spySessions) Get(context.Context, string) (*sessionstore.Session, error) {
	s.getCalls.Add(1)
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.sess, nil
}

func (s *spySessions) AcquireWS(context.Context, string, int, int64) (func(context.Context) error, error) {
	s.acquireCalls.Add(1)
	noop := func(context.Context) error { return nil }
	if s.acquireErr != nil {
		return noop, s.acquireErr
	}
	return noop, nil
}

// fakeBridge thay cầu exec thật: ghi lại Target rồi đóng kết nối ngay.
//
// Ghi lại Target là điểm chính, không phải đóng cho gọn — nó cho test khẳng
// định `podName`/`namespace` tới từ REDIS chứ không từ URL. Thiếu phép khẳng
// định đó thì một implement lấy pod từ path vẫn cho toàn bộ suite xanh, và
// "gõ được lệnh trong pod" lặng lẽ thành "gõ được lệnh trong pod NGƯỜI KHÁC".
type fakeBridge struct {
	mu      sync.Mutex
	targets []podexec.Target
}

func (f *fakeBridge) Serve(_ context.Context, c *websocket.Conn, t podexec.Target) {
	f.mu.Lock()
	f.targets = append(f.targets, t)
	f.mu.Unlock()
	_ = c.Close(websocket.StatusNormalClosure, "fake")
}

func (f *fakeBridge) last() (podexec.Target, bool) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if len(f.targets) == 0 {
		return podexec.Target{}, false
	}
	return f.targets[len(f.targets)-1], true
}

// waitLast chờ tới khi cầu exec ĐƯỢC GỌI, tối đa d.
//
// ⛔ ĐỌC `last()` MỘT LẦN NGAY SAU 101 LÀ MỘT CUỘC ĐUA, VÀ NÓ ĐÃ NỔ THẬT trên CI
// (run của PR #44, 2026-08-12): `Serve` chạy ở goroutine PHÍA SERVER, còn client
// thấy 101 ngay khi handshake xong — không có gì buộc `Serve` append xong trước
// khi test đọc. Trên máy dev nó luôn kịp (30/30 lượt xanh), trên runner tải nặng
// thì không.
//
// Vế đắt của loại lỗi này không phải một lượt CI đỏ: một test đỏ theo TẢI dạy
// người đọc bỏ qua màu đỏ, và ngày nó đỏ vì lý do thật thì không ai tin nó nữa.
//
// Chờ có hạn chứ KHÔNG phải `time.Sleep` cố định: sleep đủ dài thì chậm mọi lượt
// chạy, sleep ngắn thì vẫn đua. Hết hạn mà chưa được gọi vẫn là ĐỎ — vế "cầu
// exec phải được gọi" không bị nới thành "có thể được gọi".
func (f *fakeBridge) waitLast(t *testing.T, d time.Duration) (podexec.Target, bool) {
	t.Helper()
	deadline := time.Now().Add(d)
	for {
		if target, ok := f.last(); ok {
			return target, true
		}
		if time.Now().After(deadline) {
			return podexec.Target{}, false
		}
		time.Sleep(5 * time.Millisecond)
	}
}

type harness struct {
	srv      *httptest.Server
	signer   *testjwt.Signer
	sessions *spySessions
	bridge   *fakeBridge
}

func newHarness(t *testing.T, sessions *spySessions) *harness {
	t.Helper()
	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)

	bridge := &fakeBridge{}
	mux := http.NewServeMux()
	wsroute.Register(mux, wsroute.Deps{
		Log:             slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier:        authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:        sessions,
		Bridge:          bridge,
		Metrics:         metrics.New(prometheus.NewRegistry()),
		AllowedOrigins:  []string{testOrigin},
		MaxWSPerSession: 1,
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &harness{srv: srv, signer: signer, sessions: sessions, bridge: bridge}
}

// newWSKey sinh giá trị Sec-WebSocket-Key (16 byte ngẫu nhiên, base64 — RFC 6455
// §4.1). Server không kiểm NỘI DUNG của nó, chỉ kiểm có mặt và đúng độ dài.
//
// Sinh thay vì hardcode nonce ví dụ của RFC: một hằng base64 22 ký tự đứng cạnh
// một tên header chứa chữ "Key" là đúng hình dạng mà rule `generic-api-key` của
// gitleaks tìm, và nó ĐÃ làm đỏ cổng secret-scan ở PR đầu tiên. Nới allowlist
// cho nó là nới một rule vẫn cần để bắt secret thật cùng hình dạng.
func newWSKey(t *testing.T) string {
	t.Helper()
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		t.Fatalf("sinh Sec-WebSocket-Key: %v", err)
	}
	return base64.StdEncoding.EncodeToString(nonce)
}

// result là câu trả lời của handshake, ĐÃ đọc và đóng body.
//
// Không trả *http.Response ra ngoài helper có chủ ý: response của một handshake
// 101 mang một connection đã hijack, nên "đọc body" và "đóng body" là hai việc
// khác nhau tuỳ theo mã trả về, và để mỗi ca test tự nhớ điều đó là cách rò
// connection trong một suite có hàng chục ca.
type result struct {
	Status int
	Header http.Header
	Body   []byte
}

// finish đọc + đóng body đúng theo mã trả về.
func finish(t *testing.T, resp *http.Response) *result {
	t.Helper()
	out := &result{Status: resp.StatusCode, Header: resp.Header}
	// 101: body LÀ connection đã hijack — ReadAll trên đó chặn cho tới khi phía
	// kia đóng. Chỉ đóng, không đọc.
	if resp.StatusCode != http.StatusSwitchingProtocols {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("đọc body: %v", err)
		}
		out.Body = body
	}
	if err := resp.Body.Close(); err != nil {
		t.Fatalf("đóng body: %v", err)
	}
	return out
}

// req dựng một handshake WS đủ header, rồi cho phép sửa từng phần.
func (h *harness) req(t *testing.T, sessionID string, mutate ...func(*http.Request)) *result {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, h.srv.URL+"/ws/session/"+sessionID, nil)
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	r.Header.Set("Origin", testOrigin)
	r.Header.Set("Sec-WebSocket-Protocol", wsroute.Subprotocol)
	r.Header.Set("Connection", "Upgrade")
	r.Header.Set("Upgrade", "websocket")
	r.Header.Set("Sec-WebSocket-Version", "13")
	r.Header.Set("Sec-WebSocket-Key", newWSKey(t))
	for _, m := range mutate {
		m(r)
	}

	resp, err := h.srv.Client().Do(r)
	if err != nil {
		t.Fatalf("gọi handshake: %v", err)
	}
	return finish(t, resp)
}

func (h *harness) cookie(t *testing.T, c testjwt.Claims) func(*http.Request) {
	t.Helper()
	token := h.signer.Mint(c)
	// G124 không áp dụng: đây là cookie đi kèm REQUEST của client. Secure/
	// HttpOnly/SameSite là thuộc tính của Set-Cookie phía RESPONSE — trình duyệt
	// không gửi chúng lên, và net/http bỏ qua chúng ở chiều này.
	return func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: wsroute.CookieName, Value: token}) //nolint:gosec
	}
}

// assertDeny kiểm cả mã HTTP lẫn `code` trong body. Kiểm `code` là bắt buộc:
// hai bước khác nhau có thể cùng trả 403 và một test chỉ nhìn status sẽ không
// phân biệt được "chặn đúng bước" với "chặn nhầm bước".
func assertDeny(t *testing.T, res *result, wantStatus int, wantCode string) {
	t.Helper()
	if res.Status != wantStatus {
		t.Fatalf("status = %d, muốn %d (body: %s)", res.Status, wantStatus, res.Body)
	}
	var got struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(res.Body, &got); err != nil {
		t.Fatalf("body không phải JSON: %v", err)
	}
	if got.Code != wantCode {
		t.Fatalf("code = %q, muốn %q", got.Code, wantCode)
	}
}

// ---- bước a: Origin -------------------------------------------------------

// CSWSH: handshake WS KHÔNG chịu CORS, nên allowlist này là lớp duy nhất.
func TestBuocA_OriginSaiBiTuChoi(t *testing.T) {
	spy := &spySessions{}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a",
		func(r *http.Request) { r.Header.Set("Origin", "https://evil.example") },
		h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))

	assertDeny(t, resp, http.StatusForbidden, "ORIGIN_NOT_ALLOWED")
	if spy.getCalls.Load() != 0 {
		t.Fatalf("Redis bị hỏi %d lần ở một request chết ở bước a", spy.getCalls.Load())
	}
}

// ⛔ VẮNG Origin thì CHO QUA (contract §3a) — quyết định, không phải lỗ hổng.
// Trình duyệt LUÔN gửi Origin và không tắt được từ JS nên CSWSH vẫn đóng kín;
// fail-closed ở đây sẽ chặn chính các lệnh wscat của §Verify commands.
func TestBuocA_VangOriginThiChoQua(t *testing.T) {
	spy := &spySessions{sess: &sessionstore.Session{UserID: "user-a", Status: sessionstore.StatusRunning,
		ExpiresAt: time.Now().Add(time.Hour).Unix()}}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a",
		func(r *http.Request) { r.Header.Del("Origin") },
		h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))

	if resp.Status != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d, muốn 101 (body: %s)", resp.Status, resp.Body)
	}
}

// ---- bước b: subprotocol --------------------------------------------------

func TestBuocB_ThieuSubprotocol(t *testing.T) {
	spy := &spySessions{}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a",
		func(r *http.Request) { r.Header.Del("Sec-WebSocket-Protocol") },
		h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))

	assertDeny(t, resp, http.StatusBadRequest, "SUBPROTOCOL_REQUIRED")
}

// Client chào nhiều subprotocol trong một header — dạng hợp lệ theo RFC 6455
// và client thật dùng nó. Phải nhận ra cái của mình trong danh sách.
func TestBuocB_NhieuSubprotocolTrongMotHeader(t *testing.T) {
	spy := &spySessions{sess: &sessionstore.Session{UserID: "user-a", Status: sessionstore.StatusRunning,
		ExpiresAt: time.Now().Add(time.Hour).Unix()}}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a",
		func(r *http.Request) {
			r.Header.Set("Sec-WebSocket-Protocol", "khac.v9, "+wsroute.Subprotocol)
		},
		h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))

	if resp.Status != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d, muốn 101", resp.Status)
	}
	if got := resp.Header.Get("Sec-WebSocket-Protocol"); got != wsroute.Subprotocol {
		t.Fatalf("server echo subprotocol %q, muốn %q", got, wsroute.Subprotocol)
	}
}

// ---- bước c/d: cookie + token ---------------------------------------------

func TestBuocC_ThieuCookie(t *testing.T) {
	spy := &spySessions{}
	h := newHarness(t, spy)

	assertDeny(t, h.req(t, "sess-a"), http.StatusUnauthorized, "UNAUTHENTICATED")
	if spy.getCalls.Load() != 0 {
		t.Fatal("Redis bị hỏi ở một request không có token")
	}
}

// ⛔ LUẬT 8: token CHỈ tới từ cookie. Query string phải bị BỎ QUA hoàn toàn —
// URL đi vào access log, vào history trình duyệt, vào header Referer.
func TestLuat8_TokenQuaQueryStringBiBoQua(t *testing.T) {
	spy := &spySessions{}
	h := newHarness(t, spy)

	token := h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a"))
	r, err := http.NewRequest(http.MethodGet, h.srv.URL+"/ws/session/sess-a?token="+token, nil)
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	r.Header.Set("Origin", testOrigin)
	r.Header.Set("Sec-WebSocket-Protocol", wsroute.Subprotocol)
	resp, err := h.srv.Client().Do(r)
	if err != nil {
		t.Fatalf("gọi: %v", err)
	}

	assertDeny(t, finish(t, resp), http.StatusUnauthorized, "UNAUTHENTICATED")
}

func TestBuocD_TokenHong(t *testing.T) {
	spy := &spySessions{}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a", func(r *http.Request) {
		r.AddCookie(&http.Cookie{Name: wsroute.CookieName, Value: "khong-phai-jwt"}) //nolint:gosec // cookie phía request, xem chú thích ở h.cookie
	})
	assertDeny(t, resp, http.StatusUnauthorized, "UNAUTHENTICATED")
	if spy.getCalls.Load() != 0 {
		t.Fatal("Redis bị hỏi ở một request token hỏng")
	}
}

// ---- bước h: trạng thái ---------------------------------------------------

func TestBuocH_SessionKhongOTrangThaiChayDuoc(t *testing.T) {
	spy := &spySessions{sess: &sessionstore.Session{UserID: "user-a", Status: "EXPIRED",
		ExpiresAt: time.Now().Add(time.Hour).Unix()}}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a", h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))
	assertDeny(t, resp, http.StatusConflict, "SESSION_NOT_ACTIVE")
	if spy.acquireCalls.Load() != 0 {
		t.Fatal("bước i chạy dù bước h đã hỏng — thứ tự sai")
	}
}

// ---- bước i: trần WS ------------------------------------------------------

func TestBuocI_TranWSTra429KemMaSessionInUse(t *testing.T) {
	spy := &spySessions{
		sess: &sessionstore.Session{UserID: "user-a", Status: sessionstore.StatusRunning,
			ExpiresAt: time.Now().Add(time.Hour).Unix()},
		acquireErr: sessionstore.ErrWSLimitReached,
	}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a", h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))
	assertDeny(t, resp, http.StatusTooManyRequests, "SESSION_IN_USE")
}

// ⛔ LUẬT 8, vế log: sau một vòng đầy đủ (cả ca hỏng lẫn ca qua), log gateway
// KHÔNG được chứa chuỗi nào trông như JWT.
//
// AC của phase-1 kiểm việc này bằng `grep -cE 'eyJ[A-Za-z0-9_-]{10,}'` trên log
// THẬT sau khi chạy tay. Ràng buộc nó ở đây thì hồi quy lộ ra ở PR chứ không
// phải ở một lượt soát log thủ công mà chẳng ai nhớ chạy — token trong log là
// token đã lộ, vì log đi tới Loki và ở lại đó nhiều tuần.
func TestLuat8_LogKhongBaoGioChuaToken(t *testing.T) {
	var logs bytes.Buffer
	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)
	spy := &spySessions{sess: &sessionstore.Session{UserID: "user-a", Status: sessionstore.StatusRunning,
		ExpiresAt: time.Now().Add(time.Hour).Unix()}}

	mux := http.NewServeMux()
	wsroute.Register(mux, wsroute.Deps{
		// Debug: mức ồn NHẤT có thể. Test này chỉ có giá trị nếu nó nhìn thấy
		// mọi dòng log mà handler có khả năng phát ra.
		Log:             slog.New(slog.NewTextHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		Verifier:        authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:        spy,
		Bridge:          &fakeBridge{},
		Metrics:         metrics.New(prometheus.NewRegistry()),
		AllowedOrigins:  []string{testOrigin},
		MaxWSPerSession: 1,
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	valid := signer.Mint(testjwt.SandboxClaims("user-a", "sess-a"))
	expired := signer.Mint(func() testjwt.Claims {
		c := testjwt.SandboxClaims("user-a", "sess-a")
		c.ExpiresAt = time.Now().Add(-time.Minute)
		return c
	}())

	for _, token := range []string{valid, expired, "eyJhbGciOiJub25lIn0.e30."} {
		r, err := http.NewRequest(http.MethodGet, srv.URL+"/ws/session/sess-a", nil)
		if err != nil {
			t.Fatalf("dựng request: %v", err)
		}
		r.Header.Set("Origin", testOrigin)
		r.Header.Set("Sec-WebSocket-Protocol", wsroute.Subprotocol)
		r.AddCookie(&http.Cookie{Name: wsroute.CookieName, Value: token}) //nolint:gosec // cookie phía request, xem chú thích ở h.cookie
		resp, err := srv.Client().Do(r)
		if err != nil {
			t.Fatalf("gọi: %v", err)
		}
		finish(t, resp)
	}

	if m := jwtLike.FindString(logs.String()); m != "" {
		t.Fatalf("log chứa chuỗi giống JWT: %q\n--- log đầy đủ ---\n%s", m, logs.String())
	}
}

// Cùng regex mà AC của phase-1 dùng trên log thật.
var jwtLike = regexp.MustCompile(`eyJ[A-Za-z0-9_-]{10,}`)

// ---- lỗi của chính gateway ------------------------------------------------

// Redis chết là lỗi của GATEWAY, không phải của người dùng: 500, và tuyệt đối
// không được biến thành 403/404 — một lỗi hạ tầng đội lốt "không có quyền" là
// thứ khiến người ta đi sửa RBAC đang đúng.
func TestRedisChetTra500ChuKhongPhai403(t *testing.T) {
	spy := &spySessions{getErr: context.DeadlineExceeded}
	h := newHarness(t, spy)

	resp := h.req(t, "sess-a", h.cookie(t, testjwt.SandboxClaims("user-a", "sess-a")))
	assertDeny(t, resp, http.StatusInternalServerError, "INTERNAL")
}
