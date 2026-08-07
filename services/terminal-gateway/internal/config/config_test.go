package config_test

import (
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/config"
)

// clearEnv xoá mọi biến config để test không phụ thuộc shell của người chạy.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"PUBLIC_ADDR", "ADMIN_ADDR", "LOG_LEVEL", "SHUTDOWN_GRACE", "ORCHESTRATOR_GRPC_ADDR",
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
	if cfg.PublicAddr != ":8082" {
		t.Errorf("PublicAddr = %q, muốn %q", cfg.PublicAddr, ":8082")
	}
	if cfg.ShutdownGrace != 15*time.Second {
		t.Errorf("ShutdownGrace = %v, muốn %v", cfg.ShutdownGrace, 15*time.Second)
	}
}

// /metrics không có authz và lộ version + số goroutine. Port admin mặc định PHẢI
// bind loopback, để lỡ ai deploy mà quên cấu hình thì cũng không phơi ra mạng.
func TestAdminAddrDefaultsToLoopback(t *testing.T) {
	clearEnv(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if cfg.AdminAddr != "127.0.0.1:8083" {
		t.Fatalf("AdminAddr = %q, muốn %q — /metrics không được mặc định phơi ra mạng",
			cfg.AdminAddr, "127.0.0.1:8083")
	}
	if cfg.AdminAddr == cfg.PublicAddr {
		t.Fatal("AdminAddr trùng PublicAddr — /metrics đi chung port công khai với WS")
	}
}

func TestLoadFailsOnMalformedDuration(t *testing.T) {
	clearEnv(t)
	t.Setenv("SHUTDOWN_GRACE", "một-lát")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() muốn error với SHUTDOWN_GRACE sai định dạng, nhận nil")
	}
}
