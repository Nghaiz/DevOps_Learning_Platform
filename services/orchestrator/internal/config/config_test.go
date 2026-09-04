package config_test

import (
	"os"
	"path/filepath"
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
		"SANDBOX_IMAGE", "SANDBOX_PROFILES",
		"GRPC_MTLS_MODE", "GRPC_TLS_CERT_FILE", "GRPC_TLS_KEY_FILE", "GRPC_TLS_CA_FILE",
		"GRPC_MTLS_SYSTEM_CNS",
	} {
		t.Setenv(key, "")
	}
	// SANDBOX_IMAGE là biến BẮT BUỘC không có default (1.E-1) — `pause` từng là
	// default và đó là fallback im lặng: pod Ready, claim thành công, rồi mới
	// hỏng lúc gateway exec vào vì image không có shell. Các test dưới đây kiểm
	// những default KHÁC, nên cấp cho chúng một giá trị hợp lệ; ca "để rỗng"
	// có test riêng (TestSandboxImageBatBuoc).
	t.Setenv("SANDBOX_IMAGE", "ghcr.io/nghaiz/dlp-sandbox-base:test")
}

// SANDBOX_IMAGE rỗng phải CHẶN khởi động, không được rơi về một default chạy được.
//
// Ca này tồn tại vì chế độ hỏng của nó không nằm ở orchestrator: `pause` khởi
// động bình thường, pod vào `pool:free`, sinh viên claim THÀNH CÔNG — triệu
// chứng chỉ xuất hiện ở gateway (G4) khi `tmux new-session` không tìm thấy shell
// nào. Ba thành phần cách nhau giữa nguyên nhân và triệu chứng.
func TestSandboxImageBatBuoc(t *testing.T) {
	clearEnv(t)
	t.Setenv("SANDBOX_IMAGE", "")

	_, err := config.Load()
	if err == nil {
		t.Fatal("Load() muốn error khi SANDBOX_IMAGE rỗng, nhận nil")
	}
	if !strings.Contains(err.Error(), "SANDBOX_IMAGE") {
		t.Fatalf("error phải nêu tên biến để người vận hành sửa được, nhận: %v", err)
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

// TestMTLSBatMaThieuCertThiTuChoiKhoiDong (H-2, viết lại ở 1.C-4).
//
// ⛔ ĐIỀU KIỆN ĐỔI, CHẾ ĐỘ HỎNG THÌ KHÔNG. Bản trước từ chối khởi động khi BẬT
// cờ, vì lúc đó chưa có đường nào để cert tồn tại. Nay có, nên điều kiện đúng
// là: bật mà THIẾU cert. Cả hai bản chống cùng một thứ — pod lên xanh, health
// probe xanh, và mọi RPC trả Unauthenticated vì server không có creds. Đó là
// một cổng an ninh GIẢ, và nó tệ hơn không có cổng nào vì dashboard nói ngược lại.
func TestMTLSBatMaThieuCertThiTuChoiKhoiDong(t *testing.T) {
	for _, mode := range []string{"permissive", "require"} {
		t.Run(mode, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("GRPC_MTLS_MODE", mode)

			_, err := config.Load()
			if err == nil {
				t.Fatalf("Load() chấp nhận GRPC_MTLS_MODE=%s không cert — orchestrator sẽ lên xanh rồi chặn mọi RPC", mode)
			}
			if !strings.Contains(err.Error(), "GRPC_MTLS_MODE") {
				t.Fatalf("thông báo %q không nêu tên biến gây lỗi", err)
			}
		})
	}
}

// TestSplitCNsBoMucRong — dấu phẩy thừa KHÔNG được sinh ra một CN rỗng.
//
// ⛔ CA NÀY KHÔNG PHẢI CHI TIẾT CÚ PHÁP. `"platform-gateway,"` với
// `strings.Split` trần cho ra `["platform-gateway", ""]`, và một cert **không có
// CN** đọc ra `""` ⇒ khớp allowlist ⇒ được phong `system_component`. Tức đúng
// một dấu phẩy thừa trong values mở lại cái cửa mà cả chương này đóng. Không có
// test thì một hiện thực `strings.Split` trần vẫn xanh toàn bộ suite.
func TestSplitCNsBoMucRong(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"tls.crt", "tls.key", "ca.crt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatalf("ghi %s: %v", name, err)
		}
	}
	for _, tc := range []struct {
		raw  string
		want []string
	}{
		{"platform-gateway,", []string{"platform-gateway"}},
		{",platform-gateway", []string{"platform-gateway"}},
		{" platform-gateway , , platform-web ", []string{"platform-gateway", "platform-web"}},
	} {
		t.Run(tc.raw, func(t *testing.T) {
			clearEnv(t)
			t.Setenv("GRPC_MTLS_MODE", "require")
			t.Setenv("GRPC_TLS_CERT_FILE", filepath.Join(dir, "tls.crt"))
			t.Setenv("GRPC_TLS_KEY_FILE", filepath.Join(dir, "tls.key"))
			t.Setenv("GRPC_TLS_CA_FILE", filepath.Join(dir, "ca.crt"))
			t.Setenv("GRPC_MTLS_SYSTEM_CNS", tc.raw)

			cfg, err := config.Load()
			if err != nil {
				t.Fatalf("Load(): %v", err)
			}
			if len(cfg.MTLSSystemCNs) != len(tc.want) {
				t.Fatalf("MTLSSystemCNs = %q, cần %q", cfg.MTLSSystemCNs, tc.want)
			}
			for i, cn := range tc.want {
				if cfg.MTLSSystemCNs[i] != cn {
					t.Fatalf("MTLSSystemCNs = %q, cần %q", cfg.MTLSSystemCNs, tc.want)
				}
			}
			for _, cn := range cfg.MTLSSystemCNs {
				if cn == "" {
					t.Fatal("allowlist chứa CN RỖNG — một cert không có CN sẽ khớp nó")
				}
			}
		})
	}
}

// TestMTLSModeLaChuoiLaThiTuChoi.
//
// Một typo (`permisive`, `require ` thừa dấu cách) rơi về `off` nghĩa là cổng an
// ninh TẮT trong im lặng đúng lúc người vận hành tin rằng vừa bật nó — và không
// có triệu chứng nào để lần ra, vì `off` là trạng thái chạy được.
func TestMTLSModeLaChuoiLaThiTuChoi(t *testing.T) {
	clearEnv(t)
	t.Setenv("GRPC_MTLS_MODE", "permisive")

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() nuốt một mode viết sai — nó sẽ chạy với mTLS TẮT trong khi env nói ngược lại")
	}
}

// TestMTLSAllowlistCNRongThiTuChoiKhoiDong.
//
// Rỗng KHÔNG được hiểu là "cho phép mọi CN": đó là cách ghim CN tự vô hiệu hoá
// trong im lặng khi ai đó xoá biến khỏi values. Một quyết định chưa có thì không
// được suy ra hộ — nhất là khi đường suy ra mặc định lại là đường mở nhất.
func TestMTLSAllowlistCNRongThiTuChoiKhoiDong(t *testing.T) {
	clearEnv(t)
	dir := t.TempDir()
	// Nội dung không cần hợp lệ: Validate() chỉ kiểm ĐỌC ĐƯỢC, và ca này dừng
	// trước khi có ai parse chúng.
	for _, name := range []string{"tls.crt", "tls.key", "ca.crt"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatalf("ghi %s: %v", name, err)
		}
	}
	t.Setenv("GRPC_MTLS_MODE", "require")
	t.Setenv("GRPC_TLS_CERT_FILE", filepath.Join(dir, "tls.crt"))
	t.Setenv("GRPC_TLS_KEY_FILE", filepath.Join(dir, "tls.key"))
	t.Setenv("GRPC_TLS_CA_FILE", filepath.Join(dir, "ca.crt"))

	_, err := config.Load()
	if err == nil {
		t.Fatal("Load() chấp nhận allowlist CN rỗng — mọi cert do CA cụm ký sẽ dùng được system_component")
	}
	if !strings.Contains(err.Error(), "GRPC_MTLS_SYSTEM_CNS") {
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

// TestSandboxProfilesRongLaHopLe — RỖNG (không đặt) phải ⇒ map rỗng, KHÔNG
// phải lỗi. Đây là hành vi mặc định trước P7 7.C (chỉ profile mặc định tồn
// tại) và phải giữ nguyên cho mọi cụm chưa cấu hình SANDBOX_PROFILES.
func TestSandboxProfilesRongLaHopLe(t *testing.T) {
	clearEnv(t)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	if len(cfg.SandboxProfiles) != 0 {
		t.Fatalf("SandboxProfiles = %v, muốn rỗng khi SANDBOX_PROFILES không đặt", cfg.SandboxProfiles)
	}
}

// TestSandboxProfilesParseThanhCong — JSON hợp lệ ⇒ đúng bốn quantity phân
// giải được, và env đi kèm profile được giữ nguyên.
func TestSandboxProfilesParseThanhCong(t *testing.T) {
	clearEnv(t)
	t.Setenv("SANDBOX_PROFILES", `{
		"k8s": {
			"requestsCpu": "500m",
			"requestsMemory": "2Gi",
			"limitsCpu": "2",
			"limitsMemory": "3Gi",
			"env": {"DLP_K8S_ENABLE": "1"}
		}
	}`)

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() lỗi bất ngờ: %v", err)
	}
	p, ok := cfg.SandboxProfiles["k8s"]
	if !ok {
		t.Fatalf("SandboxProfiles thiếu profile %q: %v", "k8s", cfg.SandboxProfiles)
	}
	if got := p.RequestsCPU.String(); got != "500m" {
		t.Errorf("RequestsCPU = %q, muốn 500m", got)
	}
	if got := p.RequestsMemory.String(); got != "2Gi" {
		t.Errorf("RequestsMemory = %q, muốn 2Gi", got)
	}
	if got := p.LimitsCPU.String(); got != "2" {
		t.Errorf("LimitsCPU = %q, muốn 2", got)
	}
	if got := p.LimitsMemory.String(); got != "3Gi" {
		t.Errorf("LimitsMemory = %q, muốn 3Gi", got)
	}
	if p.Env["DLP_K8S_ENABLE"] != "1" {
		t.Errorf("Env[DLP_K8S_ENABLE] = %q, muốn %q", p.Env["DLP_K8S_ENABLE"], "1")
	}
}

// TestSandboxProfilesJSONHongThiTuChoiKhoiDong — JSON không parse được phải
// CHẶN khởi động, không được âm thầm coi như "không có profile nào".
func TestSandboxProfilesJSONHongThiTuChoiKhoiDong(t *testing.T) {
	clearEnv(t)
	t.Setenv("SANDBOX_PROFILES", `{not-json`)

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() chấp nhận SANDBOX_PROFILES là JSON hỏng")
	}
}

// TestSandboxProfilesQuantityHongThiTuChoiKhoiDong — một field gõ sai
// ("768M" thay vì "768Mi", hoặc thiếu hẳn) phải nổ ra LÚC KHỞI ĐỘNG, không phải
// lúc CreateSession đầu tiên dùng profile đó (xem doc của parseSandboxProfiles).
func TestSandboxProfilesQuantityHongThiTuChoiKhoiDong(t *testing.T) {
	clearEnv(t)
	t.Setenv("SANDBOX_PROFILES", `{
		"k8s": {
			"requestsCpu": "500m",
			"requestsMemory": "khong-phai-quantity",
			"limitsCpu": "2",
			"limitsMemory": "3Gi"
		}
	}`)

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() chấp nhận requestsMemory không parse được")
	}
}

// TestSandboxProfilesTenRongBiTuChoi — "" đã có nghĩa cố định là profile mặc
// định (session.proto); một entry tên rỗng trong SANDBOX_PROFILES là mâu
// thuẫn và không bao giờ khớp được từ phía client.
func TestSandboxProfilesTenRongBiTuChoi(t *testing.T) {
	clearEnv(t)
	t.Setenv("SANDBOX_PROFILES", `{
		"": {
			"requestsCpu": "500m",
			"requestsMemory": "1Gi",
			"limitsCpu": "1",
			"limitsMemory": "1Gi"
		}
	}`)

	if _, err := config.Load(); err == nil {
		t.Fatal("Load() chấp nhận profile tên rỗng")
	}
}
