package tlsx_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

// Cert tự ký sinh lúc chạy, KHÔNG hardcode chuỗi PEM.
//
// Một cert dán cứng có hạn dùng, và ngày nó hết hạn thì cả file test này đỏ vì
// một lý do không liên quan gì tới thứ nó đang kiểm — đúng loại bảo trì mà
// không ai đoán trước được từ thông báo lỗi.
var testCertPEM, testKeyPEM = mustSelfSigned()

func mustSelfSigned() (string, string) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "tlsx-test"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		panic(err)
	}
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}))
}

// Test ở đây chỉ phủ phần KHÔNG cần bắt tay: parse mode, kiểm file, và ba hằng
// ClientAuth. Vế "nó bắt tay được thật" nằm ở
// services/orchestrator/internal/grpcserver/mtls_test.go, nơi có server thật —
// package này cố ý không import grpc nên không dựng được server ở đây.

func TestParseModeChiNhanBaGiaTri(t *testing.T) {
	for _, ok := range []string{"off", "permissive", "require"} {
		if _, err := tlsx.ParseMode(ok); err != nil {
			t.Errorf("ParseMode(%q) lỗi: %v", ok, err)
		}
	}
}

// TestParseModeChuoiLaLaLoiChuKhongRoiVeOff.
//
// ⛔ ĐÂY LÀ CA QUAN TRỌNG NHẤT CỦA FILE. Rơi về `off` khi gặp typo nghĩa là cổng
// an ninh TẮT trong im lặng đúng lúc người vận hành tin rằng vừa bật nó — và
// `off` là trạng thái CHẠY ĐƯỢC, nên không có triệu chứng nào để lần ra. Một
// `default:` trả ModeOff thay vì error làm ca này đỏ và không làm gì khác đỏ.
func TestParseModeChuoiLaLaLoiChuKhongRoiVeOff(t *testing.T) {
	for _, bad := range []string{"", "permisive", "Require", "require ", "true", "1"} {
		got, err := tlsx.ParseMode(bad)
		if err == nil {
			t.Errorf("ParseMode(%q) = %q, không lỗi — một typo sẽ tắt mTLS trong im lặng", bad, got)
		}
	}
}

func TestEnabledChiDungVoiHaiNacCoCert(t *testing.T) {
	if tlsx.ModeOff.Enabled() {
		t.Error("ModeOff.Enabled() = true — sẽ đi tìm cert không tồn tại")
	}
	if !tlsx.ModePermissive.Enabled() || !tlsx.ModeRequire.Enabled() {
		t.Error("permissive/require phải Enabled() — nếu không thì server chạy plaintext dù env nói ngược lại")
	}
}

// writeTrio ghi ba file với nội dung tuỳ ý. Nội dung không cần hợp lệ cho các ca
// chỉ kiểm Validate().
func writeTrio(t *testing.T, cert, key, ca string) tlsx.Files {
	t.Helper()
	dir := t.TempDir()
	w := func(name, body string) string {
		if body == "" {
			return "" // rỗng = "không cấu hình", khác với "file rỗng"
		}
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
			t.Fatalf("ghi %s: %v", name, err)
		}
		return p
	}
	return tlsx.Files{
		CertFile: w("tls.crt", cert),
		KeyFile:  w("tls.key", key),
		CAFile:   w("ca.crt", ca),
	}
}

// TestValidateKiemFileDOCDUOCChuKhongChiKhacRong.
//
// Khác biệt này không phải chi tiết: Secret mount sai key (`tls.crt` thay vì
// `server.crt`) cho ra một path KHÁC RỖNG trỏ vào chỗ không có file. Một phép
// kiểm khác-rỗng sẽ cho qua, và lỗi chỉ lộ ở lần bắt tay đầu tiên — tức ở
// request của người dùng, không phải lúc pod khởi động.
func TestValidateKiemFileDocDuocChuKhongChiKhacRong(t *testing.T) {
	f := writeTrio(t, "x", "y", "z")
	thieu := tlsx.Files{
		CertFile: f.CertFile + "-khong-ton-tai",
		KeyFile:  f.KeyFile,
		CAFile:   f.CAFile,
	}
	if err := thieu.Validate(); err == nil {
		t.Fatal("Validate() cho qua một path khác rỗng trỏ vào file không tồn tại")
	}
}

func TestValidateBaoLoiNeuThieuBatKyDuongDanNao(t *testing.T) {
	for _, tc := range []struct{ name, cert, key, ca string }{
		{"thiếu cert", "", "y", "z"},
		{"thiếu key", "x", "", "z"},
		{"thiếu CA", "x", "y", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := writeTrio(t, tc.cert, tc.key, tc.ca).Validate(); err == nil {
				t.Fatal("Validate() cho qua dù thiếu đường dẫn")
			}
		})
	}
}

// TestCAKhongPhaiPEMThiBaoLoi.
//
// `AppendCertsFromPEM` chỉ trả bool. Một file rỗng hoặc base64 hỏng cho ra pool
// RỖNG mà không lỗi nào — và pool rỗng làm MỌI cert fail verify, với triệu chứng
// ("bad certificate" ở phía client) trỏ về client chứ không về file CA hỏng ở
// server. Không kiểm bool đó là để một lỗi cấu hình đi lạc qua hai service.
func TestCAKhongPhaiPEMThiBaoLoi(t *testing.T) {
	f := writeTrio(t, testCertPEM, testKeyPEM, "day khong phai PEM")
	_, err := tlsx.ServerConfig(f, tlsx.ModeRequire)
	if err == nil {
		t.Fatal("ServerConfig chấp nhận CA không phải PEM — pool rỗng sẽ chặn mọi client")
	}
	if !strings.Contains(err.Error(), "PEM") {
		t.Fatalf("thông báo %q không nói vấn đề nằm ở nội dung CA", err)
	}
}

// TestServerConfigDatDungClientAuthTheoNac.
//
// ⛔ HAI HẰNG NÀY LÀ TOÀN BỘ KHÁC BIỆT GIỮA `permissive` VÀ `require`. Dùng nhầm
// RequireAndVerifyClientCert cho permissive thì nấc giữa thành require đội lốt,
// và cùng với nó là trình tự bật an toàn (mọi client cắm cert TRƯỚC, rồi mới
// siết). Hỏng theo kiểu không test chức năng nào đỏ — chỉ ca này đỏ.
func TestServerConfigDatDungClientAuthTheoNac(t *testing.T) {
	f := writeTrio(t, testCertPEM, testKeyPEM, testCertPEM)
	for _, tc := range []struct {
		mode tlsx.Mode
		want tls.ClientAuthType
	}{
		{tlsx.ModePermissive, tls.VerifyClientCertIfGiven},
		{tlsx.ModeRequire, tls.RequireAndVerifyClientCert},
	} {
		cfg, err := tlsx.ServerConfig(f, tc.mode)
		if err != nil {
			t.Fatalf("ServerConfig(%s): %v", tc.mode, err)
		}
		if cfg.ClientAuth != tc.want {
			t.Errorf("mode=%s ClientAuth = %v, cần %v", tc.mode, cfg.ClientAuth, tc.want)
		}
	}
}

// TestServerConfigTuChoiModeOff — gọi nhầm phải ồn ào, không trả một config
// "TLS nhưng không kiểm gì" trông như đang hoạt động.
func TestServerConfigTuChoiModeOff(t *testing.T) {
	f := writeTrio(t, testCertPEM, testKeyPEM, testCertPEM)
	if _, err := tlsx.ServerConfig(f, tlsx.ModeOff); err == nil {
		t.Fatal("ServerConfig(off) trả config thay vì lỗi")
	}
}

// TestClientConfigBatBuocServerName.
//
// Để rỗng thì crypto/tls lấy hostname từ địa chỉ dial — ĐÚNG khi dial bằng tên,
// SAI trong im lặng khi dial bằng IP (SAN của ta không có IP nào). Bắt buộc
// truyền tường minh để lỗi đó không tồn tại được.
func TestClientConfigBatBuocServerName(t *testing.T) {
	f := writeTrio(t, testCertPEM, testKeyPEM, testCertPEM)
	if _, err := tlsx.ClientConfig(f, ""); err == nil {
		t.Fatal("ClientConfig chấp nhận serverName rỗng")
	}
}

// TestClientConfigKhongDungCAHeThong.
//
// CA hệ thống là hàng trăm CA công cộng; chấp nhận chúng nghĩa là bất kỳ ai mua
// được một cert hợp lệ cũng thành "in-cluster". Vòng tin cậy phải đúng bằng CA
// của ta — đo bằng cách khẳng định RootCAs KHÁC nil (nil = dùng CA hệ thống).
func TestClientConfigKhongDungCAHeThong(t *testing.T) {
	f := writeTrio(t, testCertPEM, testKeyPEM, testCertPEM)
	cfg, err := tlsx.ClientConfig(f, "platform-orchestrator")
	if err != nil {
		t.Fatalf("ClientConfig: %v", err)
	}
	if cfg.RootCAs == nil {
		t.Fatal("RootCAs = nil ⇒ crypto/tls rơi về CA hệ thống — mọi CA công cộng thành đáng tin")
	}
	if cfg.ServerName != "platform-orchestrator" {
		t.Fatalf("ServerName = %q", cfg.ServerName)
	}
}
