// Package config đọc cấu hình terminal-gateway từ biến môi trường.
package config

import (
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/envx"
)

// Config là toàn bộ cấu hình runtime của terminal-gateway.
type Config struct {
	// PublicAddr phục vụ /ws/session/{id} — port NÀY ra tới trình duyệt.
	PublicAddr string

	// AdminAddr phục vụ /healthz + /metrics, KHÔNG ra internet.
	//
	// Tách khỏi PublicAddr vì /metrics không có authz: dlp_build_info lộ chính xác
	// version (tra CVE) và go_goroutines/process_* cho phép người ngoài đếm số
	// session đang chạy. Gateway bắt buộc phải mở port công khai cho WS, nên gộp
	// chung mux là biếu không thông tin đó.
	AdminAddr string

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
		PublicAddr:           envx.String("PUBLIC_ADDR", ":8082"),
		AdminAddr:            envx.String("ADMIN_ADDR", "127.0.0.1:8083"),
		LogLevel:             envx.String("LOG_LEVEL", "info"),
		ShutdownGrace:        shutdownGrace,
		OrchestratorGRPCAddr: envx.String("ORCHESTRATOR_GRPC_ADDR", "localhost:9090"),
	}, nil
}
