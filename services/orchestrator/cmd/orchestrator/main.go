// Command orchestrator chạy gRPC SessionService + HTTP observability.
//
// P0: contract đã khoá, RPC trả Unimplemented. Vòng đời pod thật ở P1.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/config"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/lifecycle"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/store"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/logging"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthv1 "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

const (
	serviceName = "orchestrator"
	// Tên service gRPC đầy đủ, dùng cho health check theo-service.
	sessionServiceName = "orchestrator.v1.SessionService"
)

// version được ghi đè lúc build: -ldflags "-X main.version=$(git describe --tags)".
var version = "dev"

func main() {
	if err := run(); err != nil {
		// Logger có thể chưa dựng được (lỗi config), nên báo lỗi khởi động ra stderr thô.
		fmt.Fprintf(os.Stderr, "%s: %v\n", serviceName, err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("nạp config: %w", err)
	}

	log, err := logging.New(os.Stdout, cfg.LogLevel, serviceName, version)
	if err != nil {
		return fmt.Errorf("dựng logger: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	obs := httpx.NewObservability(serviceName, version)
	met := metrics.New(obs.Registry)

	// Warm-pool + lifecycle chỉ dựng được khi có Redis VÀ có đường tới K8s API.
	// Thiếu một trong hai thì server vẫn lên (health probe xanh, /metrics chạy)
	// nhưng ba RPC trả Unavailable với lý do rõ ràng — thay vì CrashLoop, thứ
	// che mất chính thông báo cần đọc.
	sessions, poolMgr, closeStores, err := buildSessionEngine(ctx, cfg, log, met)
	if err != nil {
		return err
	}
	defer closeStores()

	grpcSrv := grpc.NewServer()
	orchestratorv1.RegisterSessionServiceServer(grpcSrv, grpcserver.NewSessionService(log, sessions))

	if poolMgr != nil {
		go func() {
			if err := poolMgr.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
				log.Error("warm-pool dừng bất thường", slog.String("err", err.Error()))
			}
		}()
	}

	// gRPC health service: probe của K8s cho cổng gRPC dùng cái này, không dùng /healthz.
	// Đăng ký CẢ service rỗng "" (mặc định của grpc_health_probe) lẫn tên service đầy
	// đủ, để probe cấu hình kiểu `grpc: {service: orchestrator.v1.SessionService}`
	// không nhận NotFound.
	healthSrv := health.NewServer()
	healthv1.RegisterHealthServer(grpcSrv, healthSrv)
	healthSrv.SetServingStatus("", healthv1.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus(sessionServiceName, healthv1.HealthCheckResponse_SERVING)

	// Reflection phơi toàn bộ API surface cho `grpcurl list`. Comment "tắt ở prod"
	// không phải cơ chế — mặc định TẮT, bật bằng env khi cần debug.
	if cfg.GRPCReflection {
		log.Warn("gRPC reflection ĐANG BẬT — chỉ dùng khi debug, không để ở prod")
		reflection.Register(grpcSrv)
	}

	listener, err := net.Listen("tcp", cfg.GRPCAddr)
	if err != nil {
		return fmt.Errorf("listen gRPC %s: %w", cfg.GRPCAddr, err)
	}

	grpcErr := make(chan error, 1)
	go func() {
		log.Info("gRPC server đang lắng nghe", slog.String("addr", cfg.GRPCAddr))
		grpcErr <- grpcSrv.Serve(listener)
	}()

	httpSrv := httpx.NewServer(cfg.HTTPAddr, obs.Mux)

	httpErr := make(chan error, 1)
	go func() {
		httpErr <- httpx.ListenAndServe(ctx, log, httpSrv, cfg.ShutdownGrace)
	}()

	// httpDone theo dõi việc httpErr đã được đọc chưa. Đọc lại một channel buffered
	// đã cạn sẽ treo vĩnh viễn — chính là deadlock lúc shutdown.
	var runErr error
	httpDone := false

	select {
	case err := <-grpcErr:
		if err != nil && !errors.Is(err, grpc.ErrServerStopped) {
			runErr = fmt.Errorf("gRPC server: %w", err)
		}
	case err := <-httpErr:
		httpDone = true
		if err != nil {
			runErr = fmt.Errorf("http server: %w", err)
		}
	case <-ctx.Done():
		log.Info("nhận tín hiệu dừng, đang shutdown")
	}

	// Lật health sang NOT_SERVING TRƯỚC khi đóng listener. Endpoints controller cần
	// vài trăm ms tới vài giây để rút pod khỏi Service; trong khoảng đó pod vẫn nhận
	// kết nối mới. Báo not-serving sớm để LB ngừng gửi, thay vì trả RST/502.
	healthSrv.SetServingStatus("", healthv1.HealthCheckResponse_NOT_SERVING)
	healthSrv.SetServingStatus(sessionServiceName, healthv1.HealthCheckResponse_NOT_SERVING)

	// stop() huỷ ctx, đó là tín hiệu để httpx.ListenAndServe shutdown mềm.
	stop()

	// GracefulStop chặn VÔ THỜI HẠN nếu còn RPC đang chạy (P1 sẽ có call K8s API
	// treo được). Quá grace thì Stop() cắt cứng — thà mất một RPC còn hơn bị SIGKILL
	// và mất luôn cơ hội trả pod về pool.
	forceStop := time.AfterFunc(cfg.ShutdownGrace, func() {
		log.Warn("gRPC shutdown mềm hết hạn, dừng cưỡng bức",
			slog.Duration("grace", cfg.ShutdownGrace))
		grpcSrv.Stop()
	})
	grpcSrv.GracefulStop()
	forceStop.Stop()

	if !httpDone {
		if err := <-httpErr; err != nil && runErr == nil {
			runErr = fmt.Errorf("http shutdown: %w", err)
		}
	}
	if runErr != nil {
		return runErr
	}

	log.Info("đã dừng sạch")
	return nil
}

// buildSessionEngine dựng Redis + client K8s + warm-pool + lifecycle.
//
// Trả (nil, nil, no-op, nil) khi REDIS_URL chưa đặt: server vẫn phục vụ
// /healthz và /metrics, còn ba RPC session trả Unavailable kèm lý do. Đó là chế
// độ hỏng ỒN ÀO NHƯNG SỐNG — CrashLoop ở đây khiến pod restart liên tục và
// thông báo cần đọc bị cuộn mất trong log của các lần restart trước.
//
// Ngược lại, khi REDIS_URL CÓ đặt thì mọi lỗi đều là lỗi cứng: đã khai ý định
// nối datastore thì nối không được là sự cố, không phải chế độ chạy.
func buildSessionEngine(
	ctx context.Context,
	cfg *config.Config,
	log *slog.Logger,
	met *metrics.Metrics,
) (grpcserver.Lifecycle, *pool.Manager, func(), error) {
	noop := func() {}

	if cfg.RedisURL == "" {
		log.Warn("REDIS_URL trống — warm-pool và 3 RPC session TẮT; server chỉ phục vụ health/metrics")
		return nil, nil, noop, nil
	}

	rdb, err := store.NewRedis(ctx, cfg.RedisURL)
	if err != nil {
		return nil, nil, noop, fmt.Errorf("nối Redis: %w", err)
	}

	clientset, err := k8s.NewClientset()
	if err != nil {
		_ = rdb.Close()
		return nil, nil, noop, fmt.Errorf("dựng client Kubernetes: %w", err)
	}
	pods := k8s.NewPodClient(clientset, cfg.SandboxNamespace)

	podCfg := k8s.PodConfig{
		Namespace:        cfg.SandboxNamespace,
		Image:            cfg.SandboxImage,
		RuntimeClassName: cfg.SandboxRuntimeClass,
	}
	mgr := pool.NewManager(rdb, pods, podCfg, cfg.PoolTarget, log, met)

	svc := lifecycle.NewService(rdb, mgr, lifecycle.Config{
		Namespace:  cfg.SandboxNamespace,
		SessionTTL: cfg.SessionTTL,
		HardCap:    cfg.HardCap,
	}, log, met)

	log.Info("warm-pool bật",
		slog.Int("pool_target", cfg.PoolTarget),
		slog.String("namespace", cfg.SandboxNamespace),
		slog.String("image", cfg.SandboxImage),
		slog.String("runtime_class", cfg.SandboxRuntimeClass),
		slog.Duration("session_ttl", cfg.SessionTTL),
		slog.Duration("hard_cap", cfg.HardCap))

	return svc, mgr, func() { _ = rdb.Close() }, nil
}
