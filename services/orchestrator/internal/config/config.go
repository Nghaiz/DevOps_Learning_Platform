// Package config đọc cấu hình orchestrator từ biến môi trường.
package config

import (
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
)

// Config là toàn bộ cấu hình runtime của orchestrator.
type Config struct {
	GRPCAddr         string
	HTTPAddr         string
	LogLevel         string
	DatabaseURL      string
	RedisURL         string
	SessionTTL       time.Duration
	ShutdownGrace    time.Duration
	SandboxNamespace string
}

// Load đọc env. DATABASE_URL và REDIS_URL bắt buộc — không có default an toàn cho
// địa chỉ dữ liệu, đoán bừa localhost trong cluster là nối nhầm chỗ.
func Load() (*Config, error) {
	databaseURL, err := envx.Require("DATABASE_URL")
	if err != nil {
		return nil, err
	}
	redisURL, err := envx.Require("REDIS_URL")
	if err != nil {
		return nil, err
	}
	sessionTTL, err := envx.Duration("SESSION_TTL", time.Hour)
	if err != nil {
		return nil, err
	}
	shutdownGrace, err := envx.Duration("SHUTDOWN_GRACE", 15*time.Second)
	if err != nil {
		return nil, err
	}

	return &Config{
		GRPCAddr:         envx.String("GRPC_ADDR", ":9090"),
		HTTPAddr:         envx.String("HTTP_ADDR", ":8081"),
		LogLevel:         envx.String("LOG_LEVEL", "info"),
		DatabaseURL:      databaseURL,
		RedisURL:         redisURL,
		SessionTTL:       sessionTTL,
		ShutdownGrace:    shutdownGrace,
		SandboxNamespace: envx.String("SANDBOX_NAMESPACE", "dlp-sandbox"),
	}, nil
}
