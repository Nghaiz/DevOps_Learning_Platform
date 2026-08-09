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

	// HardCap là trần TUYỆT ĐỐI của một session, tính từ created_at và KHÔNG
	// gia hạn được (D11). Nó chặn `ttl_seconds` do client gửi ở CreateSession,
	// và B5 sẽ dùng đúng con số này cho ExtendSession — hai đồng hồ, một trần.
	HardCap time.Duration

	// PoolTarget là số pod ấm giữ sẵn trong `pool:free`.
	//
	// ⛔ CÔNG THỨC PHẢI NHỚ (D16): trần session đồng thời = quota_hiệu_lực −
	// PoolTarget. Trên lab quota hiệu lực đo được là 4 pod, nên PoolTarget=3
	// phục vụ đúng MỘT user rồi replenish chết vĩnh viễn vì quota. Mặc định 1.
	PoolTarget int

	// SandboxImage là image của pod sandbox.
	//
	// Mặc định `pause` vì 1.E chưa đẩy images/sandbox-base lên ghcr: pool, VAP,
	// quota và số đo claim < 1s đều kiểm được mà không cần image thật. Đổi bằng
	// env khi 1.E merge — KHÔNG phải sửa code.
	SandboxImage string

	// SandboxRuntimeClass PHẢI khớp `sandbox.runtimeClassName` trong Helm
	// values. Lệch một chữ là ValidatingAdmissionPolicy từ chối MỌI pod, và
	// triệu chứng là "warm-pool không bao giờ đầy" chứ không phải một lỗi trỏ
	// về đây.
	SandboxRuntimeClass string
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
	hardCap, err := envx.Duration("HARD_CAP", 2*time.Hour)
	if err != nil {
		return nil, err
	}
	poolTarget, err := envx.Int("POOL_TARGET", 1)
	if err != nil {
		return nil, err
	}
	if poolTarget < 1 {
		// 0 KHÔNG phải "tắt warm-pool" — nó là mọi session đi cold path, tức
		// bỏ hẳn mục tiêu claim < 1s. Muốn tắt thì phải là một quyết định có
		// tên, không phải một số 0 lọt vào env.
		return nil, fmt.Errorf("env POOL_TARGET: phải >= 1 (nhận %d)", poolTarget)
	}
	if sessionTTL > hardCap {
		// Bắt ở đây thay vì để CreateSession âm thầm cắt mọi session xuống
		// HARD_CAP: cấu hình mâu thuẫn thì SESSION_TTL không còn nghĩa gì, và
		// một mặc định vô nghĩa là thứ không ai phát hiện ra.
		return nil, fmt.Errorf("env SESSION_TTL (%s) > HARD_CAP (%s): mọi session sẽ bị cắt xuống trần cứng",
			sessionTTL, hardCap)
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

		HardCap:             hardCap,
		PoolTarget:          poolTarget,
		SandboxImage:        envx.String("SANDBOX_IMAGE", "registry.k8s.io/pause:3.10"),
		SandboxRuntimeClass: envx.String("SANDBOX_RUNTIME_CLASS", "sysbox-runc"),
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
