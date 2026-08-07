package config_test

import (
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/config"
)

// clearEnv xoá mọi biến config để test không phụ thuộc shell của người chạy —
// một `export GRPC_ADDR=...` trên máy dev không được làm test đỏ vì lý do không
// liên quan.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"GRPC_ADDR", "HTTP_ADDR", "LOG_LEVEL", "GRPC_REFLECTION",
		"DATABASE_URL", "REDIS_URL", "SESSION_TTL", "SHUTDOWN_GRACE", "SANDBOX_NAMESPACE",
	} {
		t.Setenv(key, "")
	}
}

func TestLoadAppliesDefaults(t *testing.T) {
	clearEnv(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if cfg.GRPCAddr != ":9090" || cfg.HTTPAddr != ":8081" {
		t.Errorf("addr mặc định sai: grpc=%q http=%q", cfg.GRPCAddr, cfg.HTTPAddr)
	}
	if cfg.SessionTTL != time.Hour {
		t.Errorf("SessionTTL = %v, muốn %v", cfg.SessionTTL, time.Hour)
	}
}

// Reflection phơi toàn bộ API surface — mặc định phải TẮT, bật là hành động có ý thức.
func TestReflectionDefaultsOff(t *testing.T) {
	clearEnv(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if cfg.GRPCReflection {
		t.Fatal("GRPCReflection mặc định true — phải false")
	}

	t.Setenv("GRPC_REFLECTION", "true")
	cfg, err = config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if !cfg.GRPCReflection {
		t.Fatal("GRPC_REFLECTION=true nhưng cfg.GRPCReflection = false")
	}
}

// P0: server không chạm data store, nên thiếu DSN KHÔNG được chặn khởi động.
func TestLoadSucceedsWithoutDataStoreURLs(t *testing.T) {
	clearEnv(t)

	if _, err := config.Load(); err != nil {
		t.Fatalf("Load() lỗi khi thiếu DATABASE_URL/REDIS_URL: %v", err)
	}
}

// Nhưng đường THẬT SỰ dùng data store thì phải chặn.
func TestRequireDataStores(t *testing.T) {
	clearEnv(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if err := cfg.RequireDataStores(); err == nil {
		t.Fatal("RequireDataStores() muốn error khi thiếu DSN, nhận nil")
	}

	t.Setenv("DATABASE_URL", "postgresql://u:p@localhost:5432/dlp")
	t.Setenv("REDIS_URL", "redis://localhost:6379")
	cfg, err = config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if err := cfg.RequireDataStores(); err != nil {
		t.Fatalf("RequireDataStores() lỗi khi đã đủ DSN: %v", err)
	}
}

func TestLoadFailsOnMalformedDuration(t *testing.T) {
	clearEnv(t)
	t.Setenv("SESSION_TTL", "một-tiếng")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() muốn error với SESSION_TTL sai định dạng, nhận nil")
	}
}
