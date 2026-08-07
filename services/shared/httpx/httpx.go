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

// NewObservability tạo registry + mux. Caller gắn thêm route của mình vào Mux.
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

// NewServer tạo http.Server có sẵn timeout.
//
// http.Server mặc định KHÔNG có timeout nào: một client mở kết nối rồi im lặng sẽ
// giữ goroutine mãi mãi. Với gateway phải ôm hàng nghìn kết nối thì đó là kênh DoS.
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
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), grace)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return <-errCh
	}
}
