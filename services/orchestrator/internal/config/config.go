// Package config đọc cấu hình orchestrator từ biến môi trường.
package config

import (
	"fmt"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
)

// Config là toàn bộ cấu hình runtime của orchestrator.
type Config struct {
	GRPCAddr string
	HTTPAddr string
	LogLevel string

	// GRPCReflection mặc định false. Reflection phơi toàn bộ API surface cho
	// `grpcurl list` — tiện lúc dev, là do thám miễn phí ở prod.
	GRPCReflection bool

	// DatabaseURL/RedisURL để RỖNG được ở P0: server chưa chạm tới cả hai (chỉ
	// cmd/dbsmoke dùng). Bắt buộc chúng ở đây sẽ làm pod CrashLoop với thông báo
	// gây hiểu nhầm trong khi thật ra nó chạy được. P1 — khi warm-pool và reaper
	// thực sự đọc Redis — thì chuyển sang bắt buộc qua RequireDataStores().
	DatabaseURL string
	RedisURL    string

	SessionTTL       time.Duration
	ShutdownGrace    time.Duration
	SandboxNamespace string
}

// Load đọc env và áp default.
func Load() (*Config, error) {
	sessionTTL, err := envx.Duration("SESSION_TTL", time.Hour)
	if err != nil {
		return nil, err
	}
	shutdownGrace, err := envx.Duration("SHUTDOWN_GRACE", 15*time.Second)
	if err != nil {
		return nil, err
	}
	grpcReflection, err := envx.Bool("GRPC_REFLECTION", false)
	if err != nil {
		return nil, err
	}

	return &Config{
		GRPCAddr:         envx.String("GRPC_ADDR", ":9090"),
		HTTPAddr:         envx.String("HTTP_ADDR", ":8081"),
		LogLevel:         envx.String("LOG_LEVEL", "info"),
		GRPCReflection:   grpcReflection,
		DatabaseURL:      envx.String("DATABASE_URL", ""),
		RedisURL:         envx.String("REDIS_URL", ""),
		SessionTTL:       sessionTTL,
		ShutdownGrace:    shutdownGrace,
		SandboxNamespace: envx.String("SANDBOX_NAMESPACE", "dlp-sandbox"),
	}, nil
}

// RequireDataStores kiểm DATABASE_URL và REDIS_URL đã được đặt.
//
// Gọi từ đường thật sự nối tới data store (cmd/dbsmoke hôm nay, orchestrator
// server từ P1) — thà chết lúc khởi động còn hơn chết ở request đầu tiên. Không
// có default an toàn cho địa chỉ dữ liệu: đoán bừa localhost trong cluster là nối
// nhầm chỗ, im lặng.
func (c *Config) RequireDataStores() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("env DATABASE_URL: bắt buộc nhưng chưa đặt")
	}
	if c.RedisURL == "" {
		return fmt.Errorf("env REDIS_URL: bắt buộc nhưng chưa đặt")
	}
	return nil
}
