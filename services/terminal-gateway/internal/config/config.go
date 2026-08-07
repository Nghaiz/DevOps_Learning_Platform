// Package config đọc cấu hình terminal-gateway từ biến môi trường.
package config

import (
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
)

// Config là toàn bộ cấu hình runtime của terminal-gateway.
type Config struct {
	HTTPAddr      string
	LogLevel      string
	ShutdownGrace time.Duration

	// OrchestratorGRPCAddr chưa dùng ở P0 (gateway chưa nối pod), nhưng seam đã
	// khoá từ đây để P1 không phải sửa hình dạng config.
	OrchestratorGRPCAddr string
}

// Load đọc env. Mọi biến đều có default — terminal-gateway ở P0 chưa nối tới
// dịch vụ nào nên không có biến bắt buộc.
func Load() (*Config, error) {
	shutdownGrace, err := envx.Duration("SHUTDOWN_GRACE", 15*time.Second)
	if err != nil {
		return nil, err
	}

	return &Config{
		HTTPAddr:             envx.String("HTTP_ADDR", ":8082"),
		LogLevel:             envx.String("LOG_LEVEL", "info"),
		ShutdownGrace:        shutdownGrace,
		OrchestratorGRPCAddr: envx.String("ORCHESTRATOR_GRPC_ADDR", "localhost:9090"),
	}, nil
}
