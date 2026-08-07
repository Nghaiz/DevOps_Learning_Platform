package httpx_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
)

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

	if srv.ReadHeaderTimeout == 0 {
		t.Error("ReadHeaderTimeout = 0 — kết nối im lặng sẽ giữ goroutine vĩnh viễn")
	}
	if srv.IdleTimeout == 0 {
		t.Error("IdleTimeout = 0")
	}
}
