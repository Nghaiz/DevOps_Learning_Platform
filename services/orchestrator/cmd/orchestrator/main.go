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

	grpcSrv := grpc.NewServer()
	orchestratorv1.RegisterSessionServiceServer(grpcSrv, grpcserver.NewSessionService(log))

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

	obs := httpx.NewObservability(serviceName, version)
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
