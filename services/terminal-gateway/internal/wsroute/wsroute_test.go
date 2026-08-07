package wsroute_test

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/wsroute"
)

func newMux() *http.ServeMux {
	mux := http.NewServeMux()
	wsroute.Register(mux, slog.New(slog.NewJSONHandler(io.Discard, nil)))
	return mux
}

// Fail-closed: chưa có per-session authz thì KHÔNG được có đường vào pod.
//
// Chỉ dùng id KHỚP pattern route. Bản trước còn thử "" và "../etc" — nhưng
// /ws/session/ không khớp {id} (404) và "../etc" bị ServeMux clean path (301),
// nên cả hai thoả assertion mà CHƯA TỪNG chạm handler: test trông như gác
// path-traversal, thực ra chỉ gác routing của stdlib.
func TestWSEndpointRejectsUntilAuthzExists(t *testing.T) {
	mux := newMux()

	for _, id := range []string{"abc123", "A-b_C", "0"} {
		t.Run(id, func(t *testing.T) {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/session/"+id, nil))

			if rec.Code != http.StatusUnauthorized {
				t.Fatalf("/ws/session/%s = %d, muốn %d — endpoint không được mở khi chưa có authz",
					id, rec.Code, http.StatusUnauthorized)
			}
		})
	}
}

// Token qua query string là vi phạm luật 8 — và cũng không được biến thành đường vòng.
func TestWSEndpointRejectsEvenWithTokenInQuery(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/ws/session/abc123?token=phe-du-lieu", nil)
	newMux().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("token qua query string cho ra %d, muốn %d", rec.Code, http.StatusUnauthorized)
	}
}

// Handler không được trả nội dung gì ngoài lời từ chối.
func TestWSEndpointLeaksNothing(t *testing.T) {
	rec := httptest.NewRecorder()
	newMux().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/session/abc123", nil))

	if got := rec.Body.String(); got != "unauthorized\n" {
		t.Fatalf("body = %q, muốn %q", got, "unauthorized\n")
	}
	if got := rec.Header().Get("Upgrade"); got != "" {
		t.Fatalf("header Upgrade = %q — không được bắt đầu handshake WS", got)
	}
}
