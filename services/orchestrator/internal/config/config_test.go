package config_test

import (
	"strings"
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

// TestRequireMTLSTuChoiKhoiDong (H-2).
//
// ⛔ Service chưa có `grpc.Creds`/`ClientCAs` nào (mTLS thật thuộc D13, làm cùng
// lane gateway), nên bật cờ = 100% RPC trả Unauthenticated. Để nó khởi động
// được là dựng một cổng an ninh GIẢ: health probe xanh, dashboard xanh, và
// không request nào chạy. Thà chết lúc khởi động với thông báo nói đúng chuyện
// gì thiếu.
func TestRequireMTLSTuChoiKhoiDong(t *testing.T) {
	clearEnv(t)
	t.Setenv("GRPC_REQUIRE_MTLS", "true")

	_, err := config.Load()
	if err == nil {
		t.Fatal("Load() chấp nhận GRPC_REQUIRE_MTLS=true — orchestrator sẽ lên xanh rồi chặn mọi RPC")
	}
	if !strings.Contains(err.Error(), "GRPC_REQUIRE_MTLS") {
		t.Fatalf("thông báo %q không nêu tên biến gây lỗi", err)
	}
}

// TestReapIntervalKhongDuocLaZero — 0 không phải "tắt reaper", nó là pod sống
// mãi và ăn hết quota trong im lặng.
func TestReapIntervalKhongDuocLaZero(t *testing.T) {
	clearEnv(t)
	t.Setenv("REAP_INTERVAL", "0s")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() chấp nhận REAP_INTERVAL=0")
	}
}
