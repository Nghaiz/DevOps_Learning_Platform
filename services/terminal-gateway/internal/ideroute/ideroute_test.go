package ideroute_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/ideroute"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
	"github.com/prometheus/client_golang/prometheus"
)

const (
	testOrigin  = "https://app.example.test"
	testSession = "sess-abc123"
	testUser    = "user-owner"
)

// spySessions đếm số lần Redis bị chạm VÀ bẫy đường type-assertion tới AcquireWS.
//
// ⛔ `AcquireWS` ở đây là điểm chính, không phải phần thừa cho đủ bộ. Phase-6
// task 10 nói mở IDE KHÔNG được ăn khe WS của terminal (trần D17=1). Package
// `ideroute` không khai `AcquireWS` ở interface, nhưng một implement dùng type
// assertion vẫn gọi tới được. Không đếm thì chế độ hỏng "mở IDE là terminal bị
// đá văng" lọt qua toàn bộ suite — và triệu chứng của nó (429 SESSION_IN_USE ở
// tab của chính mình) là thứ khó chẩn đoán nhất.
//
// Chữ ký phải khớp NGUYÊN VĂN `sessionstore.Store.AcquireWS`: assertion chỉ khớp
// khi chữ ký trùng khít, nên một chữ ký cũ ở đây là tự vô hiệu hoá cái bẫy.
type spySessions struct {
	getCalls     atomic.Int32
	acquireCalls atomic.Int32
	sess         *sessionstore.Session
	getErr       error
}

func (s *spySessions) Get(context.Context, string) (*sessionstore.Session, error) {
	s.getCalls.Add(1)
	if s.getErr != nil {
		return nil, s.getErr
	}
	return s.sess, nil
}

func (s *spySessions) AcquireWS(context.Context, string, int, int64, time.Duration) (func(context.Context) error, error) {
	s.acquireCalls.Add(1)
	return func(context.Context) error { return nil }, nil
}

// fakePodIP trả IP của upstream giả, không cần apiserver.
type fakePodIP struct {
	ip   string
	err  error
	last struct{ ns, pod string }
}

func (f *fakePodIP) PodIP(_ context.Context, ns, pod string) (string, error) {
	f.last.ns, f.last.pod = ns, pod
	if f.err != nil {
		return "", f.err
	}
	return f.ip, nil
}

func activeSession() *sessionstore.Session {
	return &sessionstore.Session{
		UserID:    testUser,
		PodName:   "sandbox-real-pod",
		Namespace: "dlp-sandboxes",
		Status:    sessionstore.StatusRunning,
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}
}

func validClaims() testjwt.Claims {
	return testjwt.Claims{
		Subject:   testUser,
		SessionID: testSession,
		Audience:  "gateway",
		Issuer:    testjwt.Issuer,
		ExpiresAt: time.Now().Add(time.Hour),
	}
}

// upstreamRecord ghi lại thứ pod THẬT SỰ nhận được — đó là cách duy nhất khẳng
// định cookie không rò và path được cắt đúng.
type upstreamRecord struct {
	path   string
	cookie string
	hits   atomic.Int32
}

type harness struct {
	srv      *httptest.Server
	up       *httptest.Server
	rec      *upstreamRecord
	signer   *testjwt.Signer
	sessions *spySessions
	pods     *fakePodIP
	logs     *bytes.Buffer
}

// harnessOpt chinh harness truoc khi dung. Bien the duy nhat hom nay la cho
// upstream gia tu phat header — can cho doi chung "khong nhan doi header".
type harnessOpt func(*harnessCfg)

type harnessCfg struct{ upstreamHeaders map[string]string }

// withUpstreamHeaders bat upstream gia phat dung bo header ma ta cung dat, de
// chung minh client chi nhan MOT gia tri chu khong phai hai.
func withUpstreamHeaders(m map[string]string) harnessOpt {
	return func(c *harnessCfg) { c.upstreamHeaders = m }
}

func newHarness(t *testing.T, sessions *spySessions, maxPerSession int, opts ...harnessOpt) *harness {
	t.Helper()

	cfg := &harnessCfg{}
	for _, o := range opts {
		o(cfg)
	}

	rec := &upstreamRecord{}
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rec.hits.Add(1)
		rec.path = r.URL.Path
		rec.cookie = r.Header.Get("Cookie")
		for k, v := range cfg.upstreamHeaders {
			w.Header().Set(k, v)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("theia-index"))
	}))
	t.Cleanup(up.Close)

	u, err := url.Parse(up.URL)
	if err != nil {
		t.Fatalf("parse url upstream: %v", err)
	}
	port := 0
	if _, err := fmtSscan(u.Port(), &port); err != nil {
		t.Fatalf("đọc port upstream %q: %v", u.Port(), err)
	}

	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)
	pods := &fakePodIP{ip: u.Hostname()}

	logs := &bytes.Buffer{}
	mux := http.NewServeMux()
	ideroute.Register(mux, ideroute.Deps{
		Log:            slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})),
		Verifier:       authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:       sessions,
		PodIPs:         pods,
		Metrics:        metrics.New(prometheus.NewRegistry()),
		AllowedOrigins: []string{testOrigin},
		Port:           port,
		MaxPerSession:  maxPerSession,
		Timeout:        2 * time.Second,
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &harness{srv: srv, up: up, rec: rec, signer: signer, sessions: sessions, pods: pods, logs: logs}
}

type result struct {
	Status int
	Body   []byte
	Header http.Header
}

func (r *result) code(t *testing.T) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(r.Body, &body); err != nil {
		t.Fatalf("giải mã body %q: %v", string(r.Body), err)
	}
	return body.Code
}

// get gửi một request IDE đủ header hợp lệ, rồi cho phép sửa từng phần.
func (h *harness) get(t *testing.T, sessionID, suffix string, mutate ...func(*http.Request)) *result {
	t.Helper()
	r, err := http.NewRequest(http.MethodGet, h.srv.URL+"/ide/session/"+sessionID+"/"+suffix, nil)
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	r.Header.Set("Origin", testOrigin)
	r.AddCookie(&http.Cookie{Name: sessionauth.CookieName, Value: h.signer.Mint(validClaims())}) //nolint:gosec
	for _, m := range mutate {
		m(r)
	}
	resp, err := h.srv.Client().Do(r)
	if err != nil {
		t.Fatalf("gọi ide: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("đọc body: %v", err)
	}
	return &result{Status: resp.StatusCode, Body: body, Header: resp.Header.Clone()}
}

func withCookie(raw string) func(*http.Request) {
	return func(r *http.Request) {
		r.Header.Del("Cookie")
		if raw != "" {
			r.AddCookie(&http.Cookie{Name: sessionauth.CookieName, Value: raw}) //nolint:gosec
		}
	}
}

// ─────────────────────────────────────────────── đối chứng DƯƠNG

// Không có test này thì mọi test từ-chối bên dưới xanh trọn vẹn kể cả khi route
// từ chối SẠCH mọi request — tức bộ test chứng minh đúng thứ nó không định
// chứng minh.
func TestIDEProxiesToOwnPodAndStripsPrefix(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, 8)

	res := h.get(t, testSession, "lib/app.js")
	if res.Status != http.StatusOK {
		t.Fatalf("status %d, muốn 200 (body %q)", res.Status, string(res.Body))
	}
	if got := string(res.Body); got != "theia-index" {
		t.Fatalf("body %q, muốn nội dung của upstream", got)
	}
	// Tiền tố PHẢI bị cắt: Theia phục vụ từ gốc của chính nó, nên một path
	// chưa cắt sẽ thành 404 ở pod và triệu chứng trỏ vào "IDE hỏng".
	if h.rec.path != "/lib/app.js" {
		t.Fatalf("upstream nhận path %q, muốn /lib/app.js", h.rec.path)
	}
	// Đích phải lấy từ Redis, không phải từ URL.
	if h.pods.last.pod != "sandbox-real-pod" || h.pods.last.ns != "dlp-sandboxes" {
		t.Fatalf("phân giải pod %q/%q, muốn dlp-sandboxes/sandbox-real-pod",
			h.pods.last.ns, h.pods.last.pod)
	}
}

// ⛔ Luật 8 ở một cửa khác: token phiên KHÔNG được đi vào tiến trình mà người
// học điều khiển được. Rò nó là trao cho họ chính thứ chứng minh danh tính của
// họ ở gateway.
func TestIDEDoesNotForwardSessionCookieToPod(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, 8)

	if res := h.get(t, testSession, ""); res.Status != http.StatusOK {
		t.Fatalf("status %d, muốn 200", res.Status)
	}
	if h.rec.cookie != "" {
		t.Fatalf("pod nhận được Cookie %q — token phiên đã rò vào tiến trình của người học", h.rec.cookie)
	}
}

// ─────────────────────────────────────────────── đối chứng ÂM (IDOR)

func TestIDERejectsForeignSession(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, 8)

	res := h.get(t, "sess-someone-else", "")
	if res.Status != http.StatusForbidden {
		t.Fatalf("status %d, muốn 403 (body %q)", res.Status, string(res.Body))
	}
	if got := res.code(t); got != sessionauth.CodeForbidden {
		t.Fatalf("code %q, muốn %q", got, sessionauth.CodeForbidden)
	}
	// Chết TRƯỚC khi chạm Redis — cùng bất biến mà /ws và /exec giữ: một id lạ
	// và một id của người khác đi qua cùng một dòng, không còn kênh phụ thời
	// gian nào để đếm.
	if n := sessions.getCalls.Load(); n != 0 {
		t.Fatalf("Redis bị chạm %d lần cho một session lạ, muốn 0", n)
	}
	if h.rec.hits.Load() != 0 {
		t.Fatalf("upstream bị chạm %d lần, muốn 0", h.rec.hits.Load())
	}
}

func TestIDERejectsSessionOfAnotherUser(t *testing.T) {
	other := activeSession()
	other.UserID = "user-attacker-is-not-owner"
	sessions := &spySessions{sess: other}
	h := newHarness(t, sessions, 8)

	res := h.get(t, testSession, "")
	if res.Status != http.StatusForbidden {
		t.Fatalf("status %d, muốn 403", res.Status)
	}
	if h.rec.hits.Load() != 0 {
		t.Fatalf("upstream bị chạm dù session không thuộc chủ token")
	}
}

func TestIDERejectsMissingCookie(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	res := h.get(t, testSession, "", withCookie(""))
	if res.Status != http.StatusUnauthorized {
		t.Fatalf("status %d, muốn 401", res.Status)
	}
	if got := res.code(t); got != sessionauth.CodeUnauthenticated {
		t.Fatalf("code %q, muốn %q", got, sessionauth.CodeUnauthenticated)
	}
}

func TestIDERejectsForeignOrigin(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	res := h.get(t, testSession, "", func(r *http.Request) {
		r.Header.Set("Origin", "https://evil.example")
	})
	if res.Status != http.StatusForbidden {
		t.Fatalf("status %d, muốn 403", res.Status)
	}
	if got := res.code(t); got != sessionauth.CodeOriginNotAllowed {
		t.Fatalf("code %q, muốn %q", got, sessionauth.CodeOriginNotAllowed)
	}
}

// ─────────────────────────────────────────────── task 10: trần RIÊNG

// Bẫy đường type-assertion. Xem chú thích của spySessions.
func TestIDENeverTouchesTerminalWSSlot(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}
	h := newHarness(t, sessions, 8)

	for i := 0; i < 3; i++ {
		if res := h.get(t, testSession, ""); res.Status != http.StatusOK {
			t.Fatalf("lượt %d: status %d, muốn 200", i, res.Status)
		}
	}
	if n := sessions.acquireCalls.Load(); n != 0 {
		t.Fatalf("AcquireWS bị gọi %d lần — mở IDE đang ăn khe WS của terminal", n)
	}
}

// Trần riêng phải CHẶN được, nếu không nó là một con số trang trí.
func TestIDEEnforcesItsOwnCap(t *testing.T) {
	sessions := &spySessions{sess: activeSession()}

	// Upstream giữ request lại để cả hai lượt cùng "đang mở".
	hold := make(chan struct{})
	released := make(chan struct{})
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(released)
		<-hold
		w.WriteHeader(http.StatusOK)
	}))
	defer up.Close()

	u, _ := url.Parse(up.URL)
	port := 0
	if _, err := fmtSscan(u.Port(), &port); err != nil {
		t.Fatalf("đọc port: %v", err)
	}

	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)
	mux := http.NewServeMux()
	ideroute.Register(mux, ideroute.Deps{
		Log:            slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)),
		Verifier:       authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:       sessions,
		PodIPs:         &fakePodIP{ip: u.Hostname()},
		Metrics:        metrics.New(prometheus.NewRegistry()),
		AllowedOrigins: []string{testOrigin},
		Port:           port,
		MaxPerSession:  1,
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	// ⛔ ĐĂNG KÝ SAU `srv.Close()` là CỐ Ý. defer chạy LIFO, và `srv.Close()`
	// CHỜ mọi request đang bay — trong đó có lượt 1 đang bị upstream giữ lại
	// bằng `hold`. Đảo thứ tự hai dòng này là test treo vĩnh viễn, và triệu
	// chứng (một test timeout không thông báo gì) không hề trỏ vào chỗ này.
	defer close(hold)

	do := func() int {
		r, _ := http.NewRequest(http.MethodGet, srv.URL+"/ide/session/"+testSession+"/", nil)
		r.Header.Set("Origin", testOrigin)
		r.AddCookie(&http.Cookie{Name: sessionauth.CookieName, Value: signer.Mint(validClaims())}) //nolint:gosec
		resp, err := srv.Client().Do(r)
		if err != nil {
			t.Errorf("gọi ide: %v", err)
			return 0
		}
		defer func() { _ = resp.Body.Close() }()
		_, _ = io.Copy(io.Discard, resp.Body)
		return resp.StatusCode
	}

	go do()
	<-released // lượt 1 chắc chắn đang giữ khe

	if got := do(); got != http.StatusTooManyRequests {
		t.Fatalf("lượt 2 status %d, muốn 429 — trần riêng không chặn được gì", got)
	}
}

// ─────────────────────────────────────────────── dấu / cuối

// Thiếu `/` cuối thì trình duyệt phân giải `./lib/x.js` thành
// `/ide/session/lib/x.js` và cả trang trắng — một trang trắng đọc y hệt "IDE
// hỏng", nên phải redirect chứ không im lặng chấp nhận.
func TestIDERedirectsToTrailingSlash(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)

	cl := *h.srv.Client()
	cl.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }

	r, _ := http.NewRequest(http.MethodGet, h.srv.URL+"/ide/session/"+testSession, nil)
	r.Header.Set("Origin", testOrigin)
	resp, err := cl.Do(r)
	if err != nil {
		t.Fatalf("gọi ide: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusPermanentRedirect {
		t.Fatalf("status %d, muốn 308", resp.StatusCode)
	}
	if got := resp.Header.Get("Location"); !strings.HasSuffix(got, "/") {
		t.Fatalf("Location %q không kết thúc bằng /", got)
	}
}

// fmtSscan tách ra để tránh import fmt chỉ cho một lời gọi trong file test.
func fmtSscan(s string, out *int) (int, error) {
	n := 0
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, errBadPort
		}
		n = n*10 + int(s[i]-'0')
	}
	*out = n
	return 1, nil
}

var errBadPort = errorString("port không phải số")

type errorString string

func (e errorString) Error() string { return string(e) }

// ─────────────────────────────────────── P13 S1: header an ninh cho `/ide`

// wantSecurityHeaders là bộ ĐÍCH, viết TAY chứ không đọc lại
// `ideroute.securityHeaders`.
//
// Cố ý chép giá trị: một test đọc chính hằng nó gác sẽ xanh kể cả khi ai đó đổi
// hằng đó thành `X-Frame-Options: ALLOWALL` — nó chỉ khẳng định "mã bằng chính
// mã", một tautology. Đổi giá trị ở đây phải là một quyết định có người đọc.
var wantSecurityHeaders = map[string]string{
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options":        "SAMEORIGIN",
	"Referrer-Policy":        "same-origin",
}

// assertSecurityHeaders kiểm CẢ giá trị LẪN số lượng giá trị.
//
// Đếm là nửa quan trọng hơn: `httputil.copyHeader` dùng `Add`, nên chế độ hỏng
// thật không phải "thiếu header" mà là "hai header mâu thuẫn" — và một phép
// kiểm chỉ gọi `Header.Get()` (trả về giá trị ĐẦU) đọc ra XANH trên đúng ca đó.
func assertSecurityHeaders(t *testing.T, h http.Header, ctx string) {
	t.Helper()
	for name, want := range wantSecurityHeaders {
		got := h.Values(name)
		if len(got) == 0 {
			t.Errorf("%s: thiếu header %s (muốn %q)", ctx, name, want)
			continue
		}
		if len(got) != 1 {
			t.Errorf("%s: %s có %d giá trị %q — trình duyệt xử lý cặp mâu thuẫn mỗi bản một kiểu", ctx, name, len(got), got)
			continue
		}
		if got[0] != want {
			t.Errorf("%s: %s = %q, muốn %q", ctx, name, got[0], want)
		}
	}
}

func TestIDESetsSecurityHeadersOnProxiedResponse(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)

	res := h.get(t, testSession, "")
	if res.Status != http.StatusOK {
		t.Fatalf("status %d, muốn 200 (body %q)", res.Status, string(res.Body))
	}
	assertSecurityHeaders(t, res.Header, "response proxy của Theia")
}

// Đối chứng ÂM cho lớp lỗi THẬT: Theia tự phát cùng bộ header.
//
// Không có `dropUpstreamSecurityHeaders`, client nhận `SAMEORIGIN, DENY` — và
// nhánh "trình duyệt chọn cái chặt hơn" làm TRẮNG iframe của D8. Test này là thứ
// duy nhất trong suite bắt được nó; mọi test còn lại đi qua một upstream không
// phát header nên chúng xanh dù bug có mặt.
func TestIDEDoesNotDuplicateSecurityHeadersFromUpstream(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8, withUpstreamHeaders(map[string]string{
		"X-Frame-Options":        "DENY",
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy":        "unsafe-url",
	}))

	res := h.get(t, testSession, "")
	if res.Status != http.StatusOK {
		t.Fatalf("status %d, muốn 200", res.Status)
	}
	assertSecurityHeaders(t, res.Header, "upstream cũng phát cùng bộ header")
}

// Nhánh từ chối cũng phát JSON trên origin của app — `nosniff` cần cho nó y hệt.
func TestIDESetsSecurityHeadersOnDenial(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)

	res := h.get(t, testSession, "", func(r *http.Request) {
		r.Header.Set("Origin", "https://evil.example")
	})
	if res.Status != http.StatusForbidden {
		t.Fatalf("status %d, muốn 403", res.Status)
	}
	assertSecurityHeaders(t, res.Header, "nhánh từ chối 403")
}

// `redirectToSlash` KHÔNG đi qua `serve`, nên nó là chỗ dễ quên nhất.
func TestIDESetsSecurityHeadersOnRedirect(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)

	// Client KHÔNG đi theo redirect: ta cần đọc chính response 308, không phải
	// response ở đích.
	client := &http.Client{
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	r, err := http.NewRequest(http.MethodGet, h.srv.URL+"/ide/session/"+testSession, nil)
	if err != nil {
		t.Fatalf("dựng request: %v", err)
	}
	r.Header.Set("Origin", testOrigin)
	r.AddCookie(&http.Cookie{Name: sessionauth.CookieName, Value: h.signer.Mint(validClaims())}) //nolint:gosec
	resp, err := client.Do(r)
	if err != nil {
		t.Fatalf("gọi ide: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusPermanentRedirect {
		t.Fatalf("status %d, muốn 308", resp.StatusCode)
	}
	assertSecurityHeaders(t, resp.Header, "redirect 308 thiếu dấu / cuối")
}

// CSP CỐ Ý VẮNG — ghim điều đó lại để nó là một quyết định, không phải một chỗ
// quên.
//
// ⚠ ĐÂY LÀ MỘT PINNED BASELINE: nó khẳng định trạng thái CHƯA-XONG. Khi đợt 3 đo
// được CSP Theia chịu được và đặt header đó, test này ĐỎ — và cách xử lý đúng là
// ĐẢO nó (khẳng định CSP có mặt + đúng giá trị đo được), KHÔNG phải nới nó ra
// hay xoá đi. Đỏ ở đây nghĩa là "việc đã xong", không phải "có hồi quy".
func TestIDEHasNoCSPYet_KnownGap(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)

	res := h.get(t, testSession, "")
	if res.Status != http.StatusOK {
		t.Fatalf("status %d, muốn 200", res.Status)
	}
	for _, name := range []string{"Content-Security-Policy", "Content-Security-Policy-Report-Only"} {
		if v := res.Header.Values(name); len(v) != 0 {
			t.Fatalf("%s = %q đã được đặt — nếu đợt 3 vừa đo xong CSP thì ĐẢO test này "+
				"(khẳng định giá trị đo được), đừng xoá nó; xem secheaders.go § CSP", name, v)
		}
	}
}
