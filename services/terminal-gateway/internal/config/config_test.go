package config_test

import (
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/config"
)

// clearEnv xoá mọi biến config để test không phụ thuộc shell của người chạy,
// rồi đặt lại đúng các biến BẮT BUỘC.
//
// REDIS_URL nằm trong nhóm bắt buộc kể từ 1.C-1 — nó được set lại ở đây chứ
// không xoá, vì mọi test khác trong file này đo DEFAULT của các biến tuỳ chọn và
// sẽ chết ở một lỗi không liên quan nếu Load() bỏ cuộc sớm.
func clearEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"PUBLIC_ADDR", "ADMIN_ADDR", "LOG_LEVEL", "SHUTDOWN_GRACE", "ORCHESTRATOR_GRPC_ADDR",
		"GATEWAY_JWKS_URL", "GATEWAY_TOKEN_ISSUER", "GATEWAY_ALLOWED_ORIGINS",
		"GATEWAY_MAX_WS_PER_SESSION",
	} {
		t.Setenv(key, "")
	}
	t.Setenv("REDIS_URL", "redis://127.0.0.1:6379/0")
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

// REDIS_URL không có default an toàn: đoán bừa localhost trong cluster là nối
// nhầm chỗ, im lặng — và "im lặng" ở đây nghĩa là mọi handshake trả 500 sau khi
// đã qua hết phần verify token, tức triệu chứng nằm rất xa nguyên nhân.
//
// Kèm KIỂM ĐỘT BIẾN: khôi phục một default (bất kỳ) làm test này ĐỎ.
func TestRedisURLBatBuocKhongCoDefault(t *testing.T) {
	clearEnv(t)
	t.Setenv("REDIS_URL", "")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() phải từ chối khởi động khi thiếu REDIS_URL — gateway không có " +
			"chế độ chạy hợp lệ nào mà thiếu authz per-session")
	}
}

// D17: trần WS mặc định là 1. Đây là số ĐO ĐƯỢC trên tmux 3.4 (client thứ hai
// attach làm cửa sổ của client thứ nhất tụt từ 200×50 xuống 80×23 rồi lật qua
// lại mỗi keystroke), không phải một giới hạn tuỳ tiện — nên default đổi là
// contract đổi.
func TestMaxWSPerSessionMacDinhLaMot(t *testing.T) {
	clearEnv(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi: %v", err)
	}
	if cfg.MaxWSPerSession != 1 {
		t.Fatalf("MaxWSPerSession = %d, muốn 1 (D17)", cfg.MaxWSPerSession)
	}
}

// 0 nghĩa là không ai mở được terminal — một cách tắt nền tảng mà không lỗi nào
// nói vì sao. Fail-fast thay vì phục vụ 429 cho mọi người.
func TestMaxWSPerSessionTuChoiGiaTriVoNghia(t *testing.T) {
	for _, v := range []string{"0", "-1"} {
		t.Run(v, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("GATEWAY_MAX_WS_PER_SESSION", v)
			if _, err := config.Load(); err == nil {
				t.Fatalf("Load() muốn error với GATEWAY_MAX_WS_PER_SESSION=%s", v)
			}
		})
	}
}

// Allowlist Origin là thứ DUY NHẤT đóng CSWSH (handshake WS không chịu CORS).
// Tách bằng dấu phẩy, bỏ khoảng trắng, bỏ mục rỗng.
func TestAllowedOriginsTachDungDanhSach(t *testing.T) {
	clearEnv(t)
	t.Setenv("GATEWAY_ALLOWED_ORIGINS", "https://a.test, https://b.test ,")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi: %v", err)
	}
	want := []string{"https://a.test", "https://b.test"}
	if len(cfg.AllowedOrigins) != len(want) {
		t.Fatalf("AllowedOrigins = %q, muốn %q", cfg.AllowedOrigins, want)
	}
	for i := range want {
		if cfg.AllowedOrigins[i] != want[i] {
			t.Fatalf("AllowedOrigins = %q, muốn %q", cfg.AllowedOrigins, want)
		}
	}
}

// GATEWAY_TOKEN_ISSUER KHÔNG được suy ra từ GATEWAY_JWKS_URL: trong cluster
// JWKS là DNS nội bộ còn `iss` là URL công khai trình duyệt thấy. Hai giá trị
// độc lập, và ca này ràng buộc chúng độc lập.
func TestTokenIssuerDocLapVoiJWKSURL(t *testing.T) {
	clearEnv(t)
	t.Setenv("GATEWAY_JWKS_URL", "http://platform-web:3000/api/auth/jwks")
	t.Setenv("GATEWAY_TOKEN_ISSUER", "https://app.example.com")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi: %v", err)
	}
	if cfg.TokenIssuer != "https://app.example.com" {
		t.Fatalf("TokenIssuer = %q — bị suy ra từ JWKSURL?", cfg.TokenIssuer)
	}
}
