// Command terminal-gateway cầu nối WebSocket ⇄ pod exec.
//
// P0: chỉ có khung HTTP + observability; /ws/session/{id} trả 401 vì per-session
// authz chưa hiện thực. Streaming thật ở P1.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/httpx"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/logging"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/config"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/wsroute"
)

const serviceName = "terminal-gateway"

// version được ghi đè lúc build: -ldflags "-X main.version=$(git describe --tags)".
var version = "dev"

func main() {
	if err := run(); err != nil {
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

	// Hai mux, hai port. Admin (/healthz + /metrics) không ra internet; public chỉ
	// mang WS. Xem config.AdminAddr.
	obs := httpx.NewObservability(serviceName, version)
	adminSrv := httpx.NewServer(cfg.AdminAddr, obs.Mux)

	publicMux := http.NewServeMux()
	wsroute.Register(publicMux, log)
	// NewStreamingServer, không phải NewServer: phiên terminal sống hàng giờ và im
	// lặng hàng phút, ReadTimeout/WriteTimeout 30s sẽ cắt ngang từ P1.
	publicSrv := httpx.NewStreamingServer(cfg.PublicAddr, publicMux)

	adminErr := make(chan error, 1)
	go func() { adminErr <- httpx.ListenAndServe(ctx, log, adminSrv, cfg.ShutdownGrace) }()

	publicErr := make(chan error, 1)
	go func() { publicErr <- httpx.ListenAndServe(ctx, log, publicSrv, cfg.ShutdownGrace) }()

	// adminDone/publicDone chặn việc đọc lại một channel buffered đã cạn — đọc lại
	// sẽ treo vĩnh viễn.
	var runErr error
	adminDone, publicDone := false, false

	select {
	case err := <-adminErr:
		adminDone = true
		if err != nil {
			runErr = fmt.Errorf("admin server: %w", err)
		}
	case err := <-publicErr:
		publicDone = true
		if err != nil {
			runErr = fmt.Errorf("public server: %w", err)
		}
	case <-ctx.Done():
		log.Info("nhận tín hiệu dừng, đang shutdown")
	}

	stop()

	if !adminDone {
		if err := <-adminErr; err != nil && runErr == nil {
			runErr = fmt.Errorf("admin shutdown: %w", err)
		}
	}
	if !publicDone {
		if err := <-publicErr; err != nil && runErr == nil {
			runErr = fmt.Errorf("public shutdown: %w", err)
		}
	}
	if runErr != nil {
		return runErr
	}

	log.Info("đã dừng sạch")
	return nil
}
