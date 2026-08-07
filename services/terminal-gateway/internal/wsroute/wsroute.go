// Package wsroute giữ endpoint WebSocket của terminal-gateway.
package wsroute

import (
	"log/slog"
	"net/http"
)

// Register gắn /ws/session/{id} vào mux.
//
// P0 CỐ Ý trả 401 cho mọi request: per-session authz (luật 8 + luật 10) là thứ
// phải có TRƯỚC khi có đường vào pod, không phải thứ bọc thêm sau. Handler mở
// sẵn rồi hứa "chặn sau" là cách một sandbox bị lọt.
//
// P1 thay thân hàm bằng: verify token per-session (cookie/subprotocol, KHÔNG qua
// query string) → upgrade WS → nối pod exec SPDY.
func Register(mux *http.ServeMux, log *slog.Logger) {
	mux.HandleFunc("GET /ws/session/{id}", func(w http.ResponseWriter, r *http.Request) {
		log.Info("từ chối WS: per-session authz chưa hiện thực (P1)",
			slog.String("session_id", r.PathValue("id")),
			slog.String("remote", r.RemoteAddr),
		)

		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte("unauthorized\n"))
	})
}
