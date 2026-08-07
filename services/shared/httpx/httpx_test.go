package httpx_test

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(io.Discard, nil))
}

// freeAddr lấy một port trống. Không dùng ":0" trực tiếp vì srv.Addr được đọc
// trước khi listener mở, nên test sẽ không biết nối vào đâu.
func freeAddr(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("không lấy được port trống: %v", err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()
	return addr
}

func TestHealthzReturns200(t *testing.T) {
	obs := httpx.NewObservability("orchestrator", "v0.0.0")

	rec := httptest.NewRecorder()
	obs.Mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("/healthz = %d, muốn %d", rec.Code, http.StatusOK)
	}
}

func TestMetricsExposesBuildInfo(t *testing.T) {
	obs := httpx.NewObservability("terminal-gateway", "v1.2.3")

	rec := httptest.NewRecorder()
	obs.Mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("/metrics = %d, muốn %d", rec.Code, http.StatusOK)
	}

	body := rec.Body.String()
	want := `dlp_build_info{service="terminal-gateway",version="v1.2.3"}`
	if !strings.Contains(body, want) {
		t.Errorf("/metrics thiếu build info %s, nhận:\n%s", want, body)
	}
	// Acceptance criteria P0: "/metrics có metric" — không chỉ 200 rỗng.
	if !strings.Contains(body, "go_goroutines") {
		t.Errorf("/metrics thiếu metric runtime Go, nhận:\n%s", body)
	}
}

// Registry toàn cục sẽ làm lần gọi thứ hai panic vì duplicate collector — nghĩa là
// chỉ chạy được một service mỗi process, và test thứ hai sẽ nổ.
func TestNewObservabilityIsCallableTwice(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("NewObservability panic ở lần gọi thứ hai (%v) — registry đang là global?", r)
		}
	}()

	_ = httpx.NewObservability("a", "v1")
	_ = httpx.NewObservability("b", "v2")
}

func TestNewServerSetsTimeouts(t *testing.T) {
	srv := httpx.NewServer(":0", http.NewServeMux())

	for name, got := range map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout,
		"ReadTimeout":       srv.ReadTimeout,
		"WriteTimeout":      srv.WriteTimeout,
		"IdleTimeout":       srv.IdleTimeout,
	} {
		if got == 0 {
			t.Errorf("%s = 0 — kết nối im lặng sẽ giữ goroutine vĩnh viễn", name)
		}
	}
}

// Deadline tuyệt đối vẫn hiệu lực sau khi WS hijack connection, nên
// Read/WriteTimeout khác 0 ở port WS sẽ cắt mọi phiên terminal đúng giây thứ 30.
func TestNewStreamingServerHasNoAbsoluteDeadlines(t *testing.T) {
	srv := httpx.NewStreamingServer(":0", http.NewServeMux())

	if srv.ReadTimeout != 0 {
		t.Errorf("ReadTimeout = %v, muốn 0 — sẽ giết phiên WS dài", srv.ReadTimeout)
	}
	if srv.WriteTimeout != 0 {
		t.Errorf("WriteTimeout = %v, muốn 0 — sẽ giết phiên WS dài", srv.WriteTimeout)
	}
	// Nhưng vẫn phải chặn được handshake lề mề (slowloris).
	if srv.ReadHeaderTimeout == 0 {
		t.Error("ReadHeaderTimeout = 0 — mất luôn phòng tuyến slowloris")
	}
}

func TestListenAndServeReturnsNilOnContextCancel(t *testing.T) {
	srv := httpx.NewServer(freeAddr(t), http.NewServeMux())
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- httpx.ListenAndServe(ctx, discardLogger(), srv, 5*time.Second) }()

	waitUntilServing(t, srv.Addr)
	cancel()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("ListenAndServe() = %v, muốn nil khi shutdown sạch", err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("ListenAndServe() không trả về sau khi ctx bị huỷ — treo ở shutdown")
	}
}

func TestListenAndServeReturnsErrorOnBadAddr(t *testing.T) {
	srv := httpx.NewServer("127.0.0.1:-1", http.NewServeMux())

	err := httpx.ListenAndServe(context.Background(), discardLogger(), srv, time.Second)
	if err == nil {
		t.Fatal("ListenAndServe() = nil với addr sai — lỗi listen bị nuốt")
	}
}

// Grace hết mà handler còn chạy: Shutdown trả DeadlineExceeded và KHÔNG tự đóng
// kết nối còn lại. Không Close() thì hàm treo mãi ở `<-errCh` vì goroutine
// ListenAndServe chưa bao giờ trả về.
func TestListenAndServeForceClosesWhenGraceExpires(t *testing.T) {
	release := make(chan struct{})
	defer close(release)

	mux := http.NewServeMux()
	mux.HandleFunc("/slow", func(w http.ResponseWriter, _ *http.Request) {
		select {
		case <-release:
		case <-time.After(30 * time.Second):
		}
		w.WriteHeader(http.StatusOK)
	})

	srv := httpx.NewServer(freeAddr(t), mux)
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- httpx.ListenAndServe(ctx, discardLogger(), srv, 300*time.Millisecond) }()

	waitUntilServing(t, srv.Addr)

	// Giữ một request đang chạy để shutdown mềm không thể hoàn tất.
	inflight := make(chan struct{})
	go func() {
		defer close(inflight)
		client := &http.Client{Timeout: 20 * time.Second}
		resp, err := client.Get("http://" + srv.Addr + "/slow") //nolint:noctx // test
		if err == nil {
			_ = resp.Body.Close()
		}
	}()

	// Chờ request thật sự tới handler rồi mới huỷ.
	time.Sleep(200 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		if err == nil {
			t.Fatal("ListenAndServe() = nil dù grace đã hết — lẽ ra phải báo DeadlineExceeded")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("ListenAndServe() treo sau khi hết grace — thiếu srv.Close()")
	}
}

func waitUntilServing(t *testing.T, addr string) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 200*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("server không lắng nghe trên %s sau 5s", addr)
}
