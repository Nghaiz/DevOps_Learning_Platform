// Command terminal-gateway cầu nối WebSocket ⇄ pod exec.
//
// P0: chỉ có khung HTTP + observability; /ws/session/{id} trả 401 vì per-session
// authz chưa hiện thực. Streaming thật ở P1.
package main

import (
	"context"
	"fmt"
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

	obs := httpx.NewObservability(serviceName, version)
	wsroute.Register(obs.Mux, log)

	srv := httpx.NewServer(cfg.HTTPAddr, obs.Mux)
	if err := httpx.ListenAndServe(ctx, log, srv, cfg.ShutdownGrace); err != nil {
		return fmt.Errorf("http server: %w", err)
	}

	log.Info("đã dừng sạch")
	return nil
}
