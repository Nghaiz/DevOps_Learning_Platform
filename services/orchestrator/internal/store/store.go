// Package store giữ client Postgres + Redis của orchestrator.
//
// P0 chỉ cần nối được và chứng minh vòng SET/GET/EXPIRE chạy. Logic warm-pool
// và reaper thuộc P1.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// NewPostgres mở connection pool và ping ngay — thà chết lúc khởi động còn hơn
// chết ở request đầu tiên.
func NewPostgres(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("mở pool postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return pool, nil
}

// NewRedis phân giải REDIS_URL và ping.
func NewRedis(ctx context.Context, url string) (*redis.Client, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("phân giải REDIS_URL: %w", err)
	}
	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return client, nil
}

// SmokePostgres chạy một query tầm thường để chứng minh đường đi tới DB thông.
func SmokePostgres(ctx context.Context, pool *pgxpool.Pool) error {
	var one int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&one); err != nil {
		return fmt.Errorf("SELECT 1: %w", err)
	}
	if one != 1 {
		return fmt.Errorf("SELECT 1 trả %d", one)
	}
	return nil
}

// SmokeRedis chạy đúng vòng SET → GET → EXPIRE → TTL mà phase-0.md 0.C yêu cầu,
// rồi dọn key.
func SmokeRedis(ctx context.Context, client *redis.Client, key string, ttl time.Duration) error {
	if err := client.Set(ctx, key, "ok", 0).Err(); err != nil {
		return fmt.Errorf("SET %s: %w", key, err)
	}

	value, err := client.Get(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("GET %s: %w", key, err)
	}
	if value != "ok" {
		return fmt.Errorf("GET %s trả %q, muốn %q", key, value, "ok")
	}

	if err := client.Expire(ctx, key, ttl).Err(); err != nil {
		return fmt.Errorf("EXPIRE %s: %w", key, err)
	}

	remaining, err := client.TTL(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("TTL %s: %w", key, err)
	}
	if remaining <= 0 || remaining > ttl {
		return fmt.Errorf("TTL %s = %v, muốn trong khoảng (0, %v]", key, remaining, ttl)
	}

	if err := client.Del(ctx, key).Err(); err != nil {
		return fmt.Errorf("DEL %s: %w", key, err)
	}
	return nil
}
