package wsroute_test

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/redistest"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/wsroute"
	"github.com/coder/websocket"
	"github.com/redis/go-redis/v9"
)

// G13 — acceptance IDOR, chạy trên Redis THẬT.
//
// ⛔ VÌ SAO PHẢI CÓ CẢ HAI VẾ, VÀ VÌ SAO VẾ g PHẢI FORGE TOKEN:
// bước e (`token.sid == {id}`) chạy TRƯỚC bước g (`hash.userId == token.sub`).
// Mọi ca "user B mở session của A" dựng bằng một client hợp lệ đều dừng ở e và
// KHÔNG BAO GIỜ chạm g. Nếu bộ acceptance chỉ có những ca đó thì một implement
// thiếu HẲN bước g vẫn xanh trọn vẹn — đúng loại tautology mà phase-1 §D-17′
// phê phán. Ca cho g bắt buộc dùng một token mà BFF thật không mint được.

type realHarness struct {
	srv    *httptest.Server
	signer *testjwt.Signer
	rdb    *redis.Client
}

func newRealHarness(t *testing.T) *realHarness {
	t.Helper()
	rdb := redistest.New(t, redistest.DBWSRoute)
	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)

	mux := http.NewServeMux()
	wsroute.Register(mux, wsroute.Deps{
		Log:             slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier:        authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:        sessionstore.New(rdb),
		AllowedOrigins:  []string{testOrigin},
		MaxWSPerSession: 1,
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &realHarness{srv: srv, signer: signer, rdb: rdb}
}

func (h *realHarness) seed(t *testing.T, sessionID, userID string) {
	t.Helper()
	key, err := rediskeys.Session(sessionID)
	if err != nil {
		t.Fatalf("dựng key: %v", err)
	}
	if err := h.rdb.HSet(context.Background(), key,
		rediskeys.FieldUserID, userID,
		rediskeys.FieldPodName, "sandbox-deadbeef",
		rediskeys.FieldNamespace, "dlp-sandbox",
		rediskeys.FieldStatus, sessionstore.StatusRunning,
		rediskeys.FieldExpiresAt, time.Now().Add(time.Hour).Unix(),
	).Err(); err != nil {
		t.Fatalf("seed session: %v", err)
	}
}

// do gửi handshake với token cho sẵn.
func (h *realHarness) do(t *testing.T, sessionID, token string) *result {
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
	// G124 không áp dụng: đây là cookie đi kèm REQUEST của client. Secure/
	// HttpOnly/SameSite là thuộc tính của Set-Cookie phía RESPONSE — trình duyệt
	// không gửi chúng lên, và net/http bỏ qua chúng ở chiều này.
	r.AddCookie(&http.Cookie{Name: wsroute.CookieName, Value: token}) //nolint:gosec

	resp, err := h.srv.Client().Do(r)
	if err != nil {
		t.Fatalf("gọi handshake: %v", err)
	}
	return finish(t, resp)
}

// ⛔ ĐỐI CHỨNG BẮT BUỘC. Không có ca 101 này thì mọi test dưới đây xanh trọn vẹn
// với một handler chặn TẤT CẢ — "một phép kiểm không thể đỏ thì không kiểm gì
// cả", và ở đây là "một cổng không thể MỞ thì không chứng minh được nó đóng
// đúng chỗ".
func TestG13_ChuThatVaoDuoc101(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a", "user-a")

	resp := h.do(t, "sess-a", h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a")))
	if resp.Status != http.StatusSwitchingProtocols {
		t.Fatalf("chủ thật nhận %d, muốn 101 (body: %s)", resp.Status, resp.Body)
	}
	if got := resp.Header.Get("Sec-WebSocket-Protocol"); got != wsroute.Subprotocol {
		t.Fatalf("echo subprotocol %q, muốn %q", got, wsroute.Subprotocol)
	}
}

// Vế e — user B có token hợp lệ CỦA CHÍNH MÌNH, mở session của A.
func TestG13_VeE_UserBMoSessionCuaA(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a", "user-a")
	h.seed(t, "sess-b", "user-b")

	assertDeny(t, h.do(t, "sess-a", h.signer.Mint(testjwt.SandboxClaims("user-b", "sess-b"))),
		http.StatusForbidden, "FORBIDDEN")
}

// ⛔ Vế g — ca DUY NHẤT chứng minh bước g tồn tại.
//
// Token ký bằng khoá THẬT nhưng mang `sid=sess-a` với `sub=user-b`: nó qua được
// bước d (chữ ký đúng) và bước e (sid khớp URL), rồi phải chết ở g khi đối chiếu
// với `hash.userId` trong Redis. BFF thật không bao giờ mint được token này —
// nó chỉ mint sid của session vừa tạo cho chính user đó — nên không có cách nào
// dựng ca này mà không forge.
func TestG13_VeG_ForgeTokenSidCuaANhungSubLaB(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a", "user-a")

	forged := h.signer.Mint(testjwt.SandboxClaims("user-b", "sess-a"))
	assertDeny(t, h.do(t, "sess-a", forged), http.StatusForbidden, "FORBIDDEN")
}

// Dùng lại token chéo session của CHÍNH MÌNH (A sở hữu cả hai) vẫn là vế e.
func TestG13_TokenDungLaiCheoSessionCuaChinhMinh(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a1", "user-a")
	h.seed(t, "sess-a2", "user-a")

	assertDeny(t, h.do(t, "sess-a2", h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a1"))),
		http.StatusForbidden, "FORBIDDEN")
}

// ⛔ `{id}` ĐOÁN BỪA → 403, KHÔNG PHẢI 404 (contract §3b).
//
// Token chỉ mang đúng một `sid`, nên mọi id lạ chết ở bước e. Tính chất này là
// TỐT: "id không tồn tại" và "id của người khác" trả cùng mã, ở cùng bước, qua
// cùng đường code ⇒ không có kênh phụ để liệt kê session. Đừng "sửa" thứ tự cho
// 404 dễ gặp hơn.
func TestG13_IdDoanBuaTra403ChuKhongPhai404(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a", "user-a")

	for _, guess := range []string{"sess-khong-ton-tai", "sess-b", "aaaaaaaa"} {
		t.Run(guess, func(t *testing.T) {
			assertDeny(t, h.do(t, guess, h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a"))),
				http.StatusForbidden, "FORBIDDEN")
		})
	}
}

// 404 chỉ tới được khi sid KHỚP mà Redis đã mất key — "session của CHÍNH BẠN đã
// biến mất". Đây là ca DUY NHẤT bước f chạm tới.
func TestG13_404ChiKhiSessionCuaChinhMinhBienMat(t *testing.T) {
	h := newRealHarness(t)
	// KHÔNG seed: sid khớp URL nhưng hash không tồn tại.
	assertDeny(t, h.do(t, "sess-a", h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a"))),
		http.StatusNotFound, "SESSION_NOT_FOUND")
}

// ⛔ TRẦN 1 WS (D17) trên đường HTTP thật, và — quan trọng hơn — nó KHÔNG được
// giết reconnect: đóng WS thứ nhất rồi mở lại phải thành công, không dính 429.
func TestG13_TranMotWSChanDongThoiNhungKhongChanNoiLai(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a", "user-a")
	token := h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a"))

	// Dial thật (không phải http.Client) để giữ kết nối MỞ trong lúc thử cái thứ hai.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dial := func() (*websocket.Conn, *http.Response, error) {
		return websocket.Dial(ctx, h.srv.URL+"/ws/session/sess-a", &websocket.DialOptions{
			HTTPClient:   h.srv.Client(),
			Subprotocols: []string{wsroute.Subprotocol},
			HTTPHeader: http.Header{
				"Origin": []string{testOrigin},
				"Cookie": []string{wsroute.CookieName + "=" + token},
			},
		})
	}

	conn, dialResp, err := dial()
	if err != nil {
		t.Fatalf("WS thứ nhất phải mở được: %v", err)
	}
	// coder/websocket trả *http.Response cả khi dial THÀNH CÔNG (để đọc header
	// thương lượng). Body của nó đã được thư viện xử lý, nhưng đóng tường minh
	// là thứ giữ cho phép kiểm rò-connection ở tầng lint còn nói được sự thật.
	closeDialResp(t, dialResp)

	// WS thứ hai trong khi cái thứ nhất còn sống → 429 + SESSION_IN_USE.
	assertDeny(t, h.do(t, "sess-a", token), http.StatusTooManyRequests, "SESSION_IN_USE")

	// Đóng cái thứ nhất → bộ đếm về 0 → mở lại được. Trần chặn ĐỒNG THỜI, không
	// chặn NỐI LẠI: thiếu tính chất này thì mọi lần mất mạng là một lần sinh
	// viên bị khoá khỏi bài của chính mình.
	_ = conn.Close(websocket.StatusNormalClosure, "")
	waitWSCounterCleared(t, h.rdb, "sess-a")

	conn2, dialResp2, err := dial()
	if err != nil {
		t.Fatalf("nối lại sau khi đóng phải thành công (không dính 429): %v", err)
	}
	closeDialResp(t, dialResp2)
	_ = conn2.Close(websocket.StatusNormalClosure, "")
}

// waitWSCounterCleared chờ DECR của handler tới được Redis.
//
// Đóng WS từ phía client trả về NGAY, còn handler phía server mới đang chạy
// defer — không chờ thì test đo một trạng thái chưa tồn tại và đỏ ngẫu nhiên
// theo tải máy.
func waitWSCounterCleared(t *testing.T, rdb *redis.Client, sessionID string) {
	t.Helper()
	key, err := rediskeys.SessionWS(sessionID)
	if err != nil {
		t.Fatalf("dựng key: %v", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		n, err := rdb.Exists(context.Background(), key).Result()
		if err != nil {
			t.Fatalf("EXISTS %s: %v", key, err)
		}
		if n == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("bộ đếm %s không về 0 sau 5s — DECR trong defer không chạy", key)
}

// Bộ đếm WS phải được XOÁ ngay cả khi handshake dừng SAU bước i vì một lý do
// khác (ở chặng này: gateway tự đóng bằng 4500 vì chưa có cầu exec). Rò một khe
// ở đây khoá session cho tới khi TTL hết — một giờ, với sinh viên đang thi.
func TestBoDemWSDuocTraLaiSauKhiHandlerKetThuc(t *testing.T) {
	h := newRealHarness(t)
	h.seed(t, "sess-a", "user-a")

	resp := h.do(t, "sess-a", h.signer.Mint(testjwt.SandboxClaims("user-a", "sess-a")))
	if resp.Status != http.StatusSwitchingProtocols {
		t.Fatalf("status = %d, muốn 101", resp.Status)
	}

	waitWSCounterCleared(t, h.rdb, "sess-a")
}

// closeDialResp đóng body của response mà websocket.Dial trả kèm.
func closeDialResp(t *testing.T, resp *http.Response) {
	t.Helper()
	if resp == nil || resp.Body == nil {
		return
	}
	_ = resp.Body.Close()
}
