package ideroute_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
)

// ─────────────────────────────────────────────── Deps.Timeout (D7 mục 7)

// Theia treo (nhận kết nối, không bao giờ trả header) không được giữ request —
// và khe trần-riêng của phiên — vô hạn. Trước bản vá `Deps.Timeout` được truyền
// vào nhưng không ai đọc: request này treo tới khi CLIENT bỏ cuộc.
func TestIDEUpstreamThatNeverAnswersTimesOut(t *testing.T) {
	hang := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		<-r.Context().Done() // proxy cắt kết nối ⇒ handler thoát, server đóng được
	})
	h := newHarness(t, &spySessions{sess: activeSession()}, 8,
		withUpstream(hang), withTimeout(200*time.Millisecond))

	client := h.srv.Client()
	client.Timeout = 5 * time.Second
	req, err := http.NewRequest(http.MethodGet, h.srv.URL+"/ide/session/"+testSession+"/", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Origin", testOrigin)
	req.AddCookie(&http.Cookie{Name: sessionauth.CookieName, Value: tokenFor(h, testSession)}) //nolint:gosec

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request treo tới khi client bỏ cuộc (%v) — Deps.Timeout không có hiệu lực", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("upstream treo phải ra 503, nhận %d", resp.StatusCode)
	}
	if took := time.Since(start); took > 3*time.Second {
		t.Fatalf("503 tới sau %s — không phải do Timeout 200ms", took)
	}
}
