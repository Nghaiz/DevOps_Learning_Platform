// Package httpx dựng HTTP server observability (/healthz + /metrics) và vòng
// đời shutdown mềm dùng chung cho mọi Go service.
package httpx

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Observability gói registry Prometheus và mux đã gắn sẵn /healthz + /metrics.
//
// Registry là instance RIÊNG chứ không phải prometheus.DefaultRegisterer: registry
// toàn cục làm hàm này chỉ gọi được một lần trong một process, nên test thứ hai sẽ
// panic vì duplicate collector.
type Observability struct {
	Registry *prometheus.Registry
	Mux      *http.ServeMux
}

// NewObservability tạo registry + mux gắn sẵn /healthz và /metrics.
//
// Caller gắn thêm route của mình vào Mux — NHƯNG chỉ khi mux này không phục vụ
// port công khai. /metrics không có authz: `dlp_build_info` lộ chính xác version
// (tra CVE), và go_goroutines/process_* cho phép đếm số session đang chạy. Service
// nào có port ra internet thì dựng mux thứ hai cho traffic đó.
func NewObservability(service, version string) *Observability {
	registry := prometheus.NewRegistry()
	registry.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)

	buildInfo := prometheus.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "dlp_build_info",
			Help: "Luôn bằng 1; label mang danh tính service để join trong PromQL.",
		},
		[]string{"service", "version"},
	)
	buildInfo.WithLabelValues(service, version).Set(1)
	registry.MustRegister(buildInfo)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok\n"))
	})
	mux.Handle("GET /metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{
		Registry: registry,
	}))

	return &Observability{Registry: registry, Mux: mux}
}

// NewServer tạo http.Server cho traffic request/response thông thường.
//
// http.Server mặc định KHÔNG có timeout nào: một client mở kết nối rồi im lặng sẽ
// giữ goroutine mãi mãi — kênh DoS rẻ tiền.
//
// KHÔNG dùng cho port mang WebSocket: ReadTimeout/WriteTimeout ở đây là deadline
// tuyệt đối trên connection, và deadline đó VẪN hiệu lực sau khi WS hijack, nên
// mọi phiên terminal sẽ đứt đúng giây thứ 30. Dùng NewStreamingServer.
func NewServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}

// NewStreamingServer tạo http.Server cho port mang kết nối long-lived (WebSocket
// ⇄ pod exec).
//
// ReadTimeout/WriteTimeout để 0 (không giới hạn) một cách CÓ CHỦ Ý: một phiên
// terminal sống hàng giờ và im lặng hàng phút giữa hai lần gõ. ReadHeaderTimeout
// vẫn giữ — nó chỉ chặn handshake lề mề, không đụng tới stream sau upgrade, nên
// vẫn đóng được đường slowloris.
func NewStreamingServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
}

// ListenAndServe chạy srv cho tới khi ctx bị huỷ, rồi shutdown mềm trong grace.
// Trả nil khi dừng sạch.
func ListenAndServe(ctx context.Context, log *slog.Logger, srv *http.Server, grace time.Duration) error {
	errCh := make(chan error, 1)
	go func() {
		log.Info("http server đang lắng nghe", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("http server đang shutdown", slog.Duration("grace", grace))
		// WithoutCancel: ctx đã huỷ rồi, cần parent không-huỷ thì WithTimeout mới
		// có tác dụng.
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), grace)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			// Hết grace mà vẫn còn kết nối: Shutdown trả DeadlineExceeded và KHÔNG
			// đóng số kết nối còn lại. Không Close() ở đây thì chúng sống tiếp cùng
			// goroutine của chúng — process không bao giờ thoát sạch.
			log.Warn("shutdown mềm hết hạn, đóng cưỡng bức", slog.String("err", err.Error()))
			if closeErr := srv.Close(); closeErr != nil {
				return errors.Join(err, closeErr)
			}
			<-errCh
			return err
		}
		return <-errCh
	}
}
