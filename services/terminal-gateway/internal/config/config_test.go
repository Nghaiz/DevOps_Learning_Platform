package config_test

import (
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/config"
)

func TestLoadAppliesDefaults(t *testing.T) {
	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if cfg.HTTPAddr != ":8082" {
		t.Errorf("HTTPAddr = %q, muốn %q", cfg.HTTPAddr, ":8082")
	}
	if cfg.ShutdownGrace != 15*time.Second {
		t.Errorf("ShutdownGrace = %v, muốn %v", cfg.ShutdownGrace, 15*time.Second)
	}
}

func TestLoadFailsOnMalformedDuration(t *testing.T) {
	t.Setenv("SHUTDOWN_GRACE", "một-lát")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() muốn error với SHUTDOWN_GRACE sai định dạng, nhận nil")
	}
}
