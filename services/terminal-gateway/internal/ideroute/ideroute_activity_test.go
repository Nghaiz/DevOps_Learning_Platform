package ideroute_test

import (
	"bufio"
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/ideroute"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
	"github.com/prometheus/client_golang/prometheus"
)

// spyExtender ghi lại mọi lượt gia hạn mà route IDE gửi đi.
type spyExtender struct {
	mu    sync.Mutex
	calls []string // "sessionID/userID"
}

func (s *spyExtender) Extend(_ context.Context, sessionID, userID string) (podexec.ExtendResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls = append(s.calls, sessionID+"/"+userID)
	return podexec.ExtendResult{Outcome: podexec.ExtendOK, ExpiresAt: time.Now().Add(5 * time.Minute).Unix()}, nil
}

func (s *spyExtender) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.calls)
}

// waitCount chờ tới khi số lượt gia hạn đạt `want` (gia hạn chạy NỀN, không
// chặn request) rồi giữ thêm một nhịp để bắt lượt THỪA.
func waitCount(t *testing.T, s *spyExtender, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for s.count() < want && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	time.Sleep(30 * time.Millisecond)
	if got := s.count(); got != want {
		t.Fatalf("số lượt gia hạn = %d, muốn %d (%v)", got, want, s.calls)
	}
}

// activityHarness dựng route IDE với Extender + nhịp tuỳ chỉnh, và một pod giả
// trả lời cả request thường lẫn nâng cấp WebSocket (echo).
type activityHarness struct {
	srv    *httptest.Server
	signer *testjwt.Signer
	ext    *spyExtender
}

func newActivityHarness(t *testing.T, every time.Duration) *activityHarness {
	t.Helper()

	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			_, _ = w.Write([]byte("theia-index"))
			return
		}
		conn, brw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			return
		}
		defer func() { _ = conn.Close() }()
		_, _ = brw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		_ = brw.Flush()
		// Pod giả CHỈ đọc, không bao giờ tự gửi gì: ca dưới phải chứng minh rằng
		// byte của NGƯỜI HỌC (client → pod) là thứ gia hạn.
		_, _ = io.Copy(io.Discard, conn)
	}))
	t.Cleanup(up.Close)
	u, err := url.Parse(up.URL)
	if err != nil {
		t.Fatal(err)
	}
	port := 0
	if _, err := fmtSscan(u.Port(), &port); err != nil {
		t.Fatal(err)
	}

	signer := testjwt.NewSigner(t, "kid-1")
	jwks := testjwt.NewJWKSServer(t, signer)
	ext := &spyExtender{}
	mux := http.NewServeMux()
	ideroute.Register(mux, ideroute.Deps{
		Log:            slog.New(slog.NewTextHandler(io.Discard, nil)),
		Verifier:       authz.NewVerifier(authz.NewJWKSCache(jwks.URL), testjwt.Issuer),
		Sessions:       &spySessions{sess: activeSession()},
		PodIPs:         &fakePodIP{ip: u.Hostname()},
		Metrics:        metrics.New(prometheus.NewRegistry()),
		AllowedOrigins: []string{testOrigin},
		Port:           port,
		Extender:       ext,
		ExtendEvery:    every,
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &activityHarness{srv: srv, signer: signer, ext: ext}
}

func (h *activityHarness) get(t *testing.T, origin string) int {
	t.Helper()
	req, err := http.NewRequest(http.MethodGet, h.srv.URL+"/ide/session/"+testSession+"/", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", origin)
	req.AddCookie(&http.Cookie{Name: sessionauth.CookieName, Value: h.signer.Mint(validClaims())}) //nolint:gosec
	resp, err := h.srv.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	_ = resp.Body.Close()
	return resp.StatusCode
}

// upgrade mở một kết nối nâng cấp WebSocket thô qua route IDE.
func (h *activityHarness) upgrade(t *testing.T) net.Conn {
	t.Helper()
	conn, err := net.Dial("tcp", strings.TrimPrefix(h.srv.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	req := "GET /ide/session/" + testSession + "/socket.io/?EIO=4&transport=websocket HTTP/1.1\r\n" +
		"Host: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n" +
		"Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
		"Origin: " + testOrigin + "\r\n" +
		"Cookie: " + sessionauth.CookieName + "=" + h.signer.Mint(validClaims()) + "\r\n\r\n"
	if _, err := conn.Write([]byte(req)); err != nil {
		t.Fatal(err)
	}
	resp, err := http.ReadResponse(bufio.NewReader(conn), nil)
	if err != nil {
		t.Fatal(err)
	}
	// 101 không có body (NoBody); đóng nó không đụng tới kết nối đã nâng cấp.
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("nâng cấp WS qua route IDE phải 101, nhận %d", resp.StatusCode)
	}
	return conn
}

// D7.2 — dùng IDE là bằng chứng có người, như gõ terminal. Trước bản vá route IDE
// không gọi ExtendSession lần nào: người học chỉ sửa file trong Theia mất phiên
// ở idle-deadline dù đang làm bài ngay trước màn hình.
func TestIDERequestExtendsSessionOfTokenOwner(t *testing.T) {
	h := newActivityHarness(t, time.Hour)

	if code := h.get(t, testOrigin); code != http.StatusOK {
		t.Fatalf("request IDE hợp lệ phải 200, nhận %d", code)
	}
	waitCount(t, h.ext, 1)
	// userID phải là `sub` của token ĐÃ VERIFY — vế authz duy nhất orchestrator
	// có ở RPC này.
	if h.ext.calls[0] != testSession+"/"+testUser {
		t.Fatalf("gia hạn sai đích: %q", h.ext.calls[0])
	}
}

// Cùng nhịp với heartbeat terminal: dồn dập request trong một nhịp chỉ ra MỘT
// lượt gia hạn. Một trang Theia tải hàng trăm asset; mỗi asset một RPC là đổ tải
// lên orchestrator + Redis đúng lúc mở IDE.
func TestIDEExtendIsThrottledPerSession(t *testing.T) {
	h := newActivityHarness(t, time.Hour)

	for i := 0; i < 5; i++ {
		h.get(t, testOrigin)
	}
	waitCount(t, h.ext, 1)
}

// Qua một nhịp, hoạt động mới gia hạn tiếp — thiếu ca này thì ca throttle ở trên
// xanh cả khi route chỉ gia hạn đúng một lần trong đời tiến trình.
func TestIDEExtendsAgainAfterInterval(t *testing.T) {
	h := newActivityHarness(t, 80*time.Millisecond)

	h.get(t, testOrigin)
	waitCount(t, h.ext, 1)
	time.Sleep(100 * time.Millisecond)
	h.get(t, testOrigin)
	waitCount(t, h.ext, 2)
}

// Phần lớn thời gian dùng IDE đi qua MỘT WebSocket sống lâu, không sinh request
// HTTP mới nào. Byte người học gửi lên qua kết nối đó phải gia hạn được phiên.
func TestIDEWebSocketTrafficExtendsSession(t *testing.T) {
	h := newActivityHarness(t, 80*time.Millisecond)

	conn := h.upgrade(t)
	waitCount(t, h.ext, 1) // lượt nâng cấp

	time.Sleep(100 * time.Millisecond)
	if _, err := conn.Write([]byte("42[\"message\",\"gõ phím\"]")); err != nil {
		t.Fatal(err)
	}
	waitCount(t, h.ext, 2)

	// Im lặng (không byte nào từ người học) qua nhiều nhịp ⇒ không gia hạn thêm.
	time.Sleep(250 * time.Millisecond)
	waitCount(t, h.ext, 2)
}

// Request bị từ chối KHÔNG được gia hạn — kể cả ở bước Origin, trước khi chạm token.
func TestIDEDeniedRequestDoesNotExtend(t *testing.T) {
	h := newActivityHarness(t, time.Hour)

	if code := h.get(t, "https://evil.example.test"); code != http.StatusForbidden {
		t.Fatalf("origin lạ phải 403, nhận %d", code)
	}
	waitCount(t, h.ext, 0)
}
