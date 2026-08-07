// Command dbsmoke chứng minh Go client nối được Postgres và chạy được vòng
// SET/GET/EXPIRE trên Redis (phase-0.md 0.C task 12, acceptance criteria P0).
//
//	go run ./cmd/dbsmoke
//
// Bản song sinh phía TypeScript: apps/web src/scripts/db-smoke.ts.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/config"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/rediskeys"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/store"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/logging"
)

const (
	smokeSessionID = "smoke-go"
	smokeTTL       = 30 * time.Second
	smokeTimeout   = 15 * time.Second
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "dbsmoke FAIL: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("nạp config: %w", err)
	}
	// Đây là đường thật sự nối tới data store, nên DSN là bắt buộc ở đây (server
	// P0 thì chưa — xem config.RequireDataStores).
	if err := cfg.RequireDataStores(); err != nil {
		return err
	}

	log, err := logging.New(os.Stdout, cfg.LogLevel, "dbsmoke", "dev")
	if err != nil {
		return fmt.Errorf("dựng logger: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), smokeTimeout)
	defer cancel()

	pool, err := store.NewPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := store.SmokePostgres(ctx, pool); err != nil {
		return err
	}
	log.Info("postgres: SELECT 1 ok")

	client, err := store.NewRedis(ctx, cfg.RedisURL)
	if err != nil {
		return err
	}
	defer func() { _ = client.Close() }()

	key, err := rediskeys.Session(smokeSessionID)
	if err != nil {
		return err
	}
	if err := store.SmokeRedis(ctx, client, key, smokeTTL); err != nil {
		return err
	}

	log.Info("redis: SET/GET/EXPIRE ok",
		slog.String("key", key),
		slog.String("pool_key", rediskeys.PoolFree),
	)
	log.Info("dbsmoke PASS")
	return nil
}
