package wsroute_test

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/wsroute"
)

func newMux() *http.ServeMux {
	obs := httpx.NewObservability("terminal-gateway", "test")
	wsroute.Register(obs.Mux, slog.New(slog.NewJSONHandler(io.Discard, nil)))
	return obs.Mux
}

// Fail-closed: chưa có authz thì KHÔNG được có đường vào pod.
func TestWSEndpointRejectsUntilAuthzExists(t *testing.T) {
	mux := newMux()

	for _, id := range []string{"abc123", "", "../etc"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/session/"+id, nil))

		if rec.Code == http.StatusSwitchingProtocols || rec.Code == http.StatusOK {
			t.Fatalf("/ws/session/%q = %d — endpoint không được mở khi chưa có authz", id, rec.Code)
		}
	}
}

func TestWSEndpointReturns401ForValidShape(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/session/abc123", nil))

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("/ws/session/abc123 = %d, muốn %d", rec.Code, http.StatusUnauthorized)
	}
}

// Observability không được bị route WS che mất.
func TestObservabilityStillReachable(t *testing.T) {
	mux := newMux()

	for _, path := range []string{"/healthz", "/metrics"} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("%s = %d, muốn %d", path, rec.Code, http.StatusOK)
		}
	}
}
