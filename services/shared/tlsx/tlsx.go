// Package tlsx dựng tls.Config cho mTLS nội cụm giữa orchestrator, gateway và
// apps/web (D13/R13/R25, chặng 1.C-4).
//
// Vì sao ở services/shared: CẢ HAI service Go đều cần nó, và chúng là hai Go
// module khác nhau — đúng tiền lệ D7 đã chốt cho `rediskeys`. Đặt trong
// internal/ của một service nghĩa là service kia không compile được, và đó là
// lỗi ở compile chứ không phải rủi ro thiết kế.
//
// Package này CỐ Ý không import grpc: nó chỉ trả *tls.Config. Mỗi service tự
// bọc bằng credentials.NewTLS. Giữ được như thế thì tlsx test được không cần
// dựng server gRPC, và module shared không kéo theo dependency của grpc.
package tlsx

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// Mode là ba nấc bật mTLS, dùng CHUNG cho cả server lẫn client.
//
// ⛔ MỘT BIẾN CHO CẢ BA SERVICE LÀ CÓ CHỦ Ý, không phải tiết kiệm tên.
// Trình tự an toàn duy nhất để bật mTLS trên một hệ đang chạy là: mọi bên có
// cert TRƯỚC, rồi mới siết. Với ba biến riêng thì trình tự đó là thứ người vận
// hành phải nhớ; với một biến thì `permissive` nghĩa là "server nhận cả hai
// loại, client nào cũng đã trình cert" và `require` chỉ là một lần đổi giá trị
// sau khi đã NHÌN thấy điều đó đúng.
type Mode string

const (
	// ModeOff — plaintext hoàn toàn. Server không có TLS, client dial h2c.
	// Nhánh `system_component` bị từ chối vì server không chứng minh được gì.
	ModeOff Mode = "off"

	// ModePermissive — server CÓ TLS và nhận cả client có cert lẫn không.
	//
	// ⚠ "Nhận client không cert" KHÁC "bỏ qua cert sai": cert do CA lạ ký làm
	// bắt tay HỎNG ở nấc này, không phải bị lờ đi. Nấc này chỉ khoan dung với
	// việc VẮNG cert, không khoan dung với cert giả.
	ModePermissive Mode = "permissive"

	// ModeRequire — client không trình cert hợp lệ thì bắt tay hỏng.
	ModeRequire Mode = "require"
)

// ParseMode đọc giá trị env. Chuỗi lạ là LỖI, không phải "về mặc định".
//
// Một typo (`permisive`, `require ` thừa dấu cách) rơi về `off` nghĩa là cổng
// an ninh tắt trong im lặng đúng lúc người vận hành tin rằng nó vừa được bật —
// và không có triệu chứng nào để lần ra. Thà chết lúc khởi động.
func ParseMode(s string) (Mode, error) {
	switch Mode(s) {
	case ModeOff, ModePermissive, ModeRequire:
		return Mode(s), nil
	default:
		return "", fmt.Errorf("giá trị mTLS mode không hợp lệ %q: chỉ nhận %q, %q, %q",
			s, ModeOff, ModePermissive, ModeRequire)
	}
}

// Enabled trả về true khi mode cần tới cert (permissive hoặc require).
func (m Mode) Enabled() bool { return m == ModePermissive || m == ModeRequire }

// Files là ba đường dẫn cert. Rỗng khi Mode=off.
type Files struct {
	CertFile string
	KeyFile  string
	CAFile   string
}

// Validate kiểm ba file THẬT SỰ MỞ ĐƯỢC ĐỂ ĐỌC, không chỉ khác rỗng và không
// chỉ tồn tại.
//
// ⛔ `os.Stat` LÀ SAI Ở ĐÂY, VÀ SAI ĐÚNG CHỖ HAY HỎNG NHẤT. Bản đầu dùng
// `os.Stat` kèm chính doc comment này nói "ĐỌC ĐƯỢC" — nhưng `os.Stat` chỉ cần
// quyền duyệt thư mục, KHÔNG cần quyền đọc file. Đo được trên cụm 2026-08-12:
// Secret mount `defaultMode: 0400` vào container non-root cho ra file
// `root:root -r--------`; `ls`/`stat` chạy bình thường, `cat` trả
// `Permission denied`. Tức cổng fail-fast mà cả hai service dựa vào **cho qua
// đúng họ lỗi duy nhất mà cert mount từ Secret thực sự hay gặp**, và lỗi lộ ra
// muộn hơn ở `LoadX509KeyPair` (hoặc ở phía web thì không lộ ra ở tầng
// Kubernetes chút nào — pod `Ready`, mọi RPC 500).
//
// Ca gốc vẫn được giữ: Secret mount sai key cho ra path khác rỗng trỏ vào chỗ
// không có file.
func (f Files) Validate() error {
	for _, item := range []struct {
		name string
		path string
	}{
		{"cert", f.CertFile},
		{"key", f.KeyFile},
		{"CA", f.CAFile},
	} {
		if item.path == "" {
			return fmt.Errorf("mTLS đang bật nhưng thiếu đường dẫn %s", item.name)
		}
		// #nosec G304 — đường dẫn đến từ env do người vận hành/Helm đặt, không
		// từ input người dùng; đây chính là phép kiểm quyền đọc của file đó.
		fh, err := os.Open(item.path)
		if err != nil {
			return fmt.Errorf("không mở được file %s tại %s để đọc: %w", item.name, item.path, err)
		}
		_ = fh.Close()
	}
	return nil
}

// caPool đọc CA bundle thành CertPool.
//
// Dùng pool RỖNG làm nền (không phải SystemCertPool): CA hệ thống ở đây là
// hàng trăm CA công cộng, và chấp nhận chúng nghĩa là bất kỳ ai mua được một
// cert hợp lệ cũng thành "in-cluster". Vòng tin cậy phải đúng bằng CA của ta.
func caPool(caFile string) (*x509.CertPool, error) {
	// #nosec G304 — đường dẫn CA đến từ env do người vận hành/Helm đặt.
	pem, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("đọc CA %s: %w", caFile, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		// AppendCertsFromPEM chỉ trả bool, không trả lỗi — một file rỗng hoặc
		// base64 hỏng cho ra pool RỖNG mà không lỗi nào. Pool rỗng thì mọi cert
		// đều fail verify, và triệu chứng ("bad certificate" ở client) trỏ về
		// phía client chứ không về file CA hỏng ở server.
		return nil, fmt.Errorf("CA %s không chứa certificate PEM nào hợp lệ", caFile)
	}
	return pool, nil
}

// ServerConfig dựng tls.Config cho cổng gRPC của orchestrator.
func ServerConfig(f Files, mode Mode) (*tls.Config, error) {
	if !mode.Enabled() {
		return nil, fmt.Errorf("ServerConfig gọi với mode=%q: chỉ dựng TLS khi mode là %q hoặc %q",
			mode, ModePermissive, ModeRequire)
	}
	if err := f.Validate(); err != nil {
		return nil, err
	}
	cert, err := tls.LoadX509KeyPair(f.CertFile, f.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("nạp cert/key server: %w", err)
	}
	pool, err := caPool(f.CAFile)
	if err != nil {
		return nil, err
	}

	// ⛔ HAI HẰNG NÀY LÀ TOÀN BỘ KHÁC BIỆT GIỮA HAI NẤC.
	// VerifyClientCertIfGiven: vắng cert thì cho qua, CÓ cert thì phải verify
	// được — nên nấc permissive không phải "tắt kiểm", nó là "chưa bắt buộc".
	// Dùng nhầm RequireAndVerify ở đây thì permissive thành require đội lốt, và
	// cả trình tự rollout an toàn mất ý nghĩa mà không lỗi nào nói ra.
	clientAuth := tls.VerifyClientCertIfGiven
	if mode == ModeRequire {
		clientAuth = tls.RequireAndVerifyClientCert
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientCAs:    pool,
		ClientAuth:   clientAuth,
		// TLS 1.2 làm sàn chứ không phải 1.3: cả hai đầu (Go 1.26, Node 22) đàm
		// phán 1.3 trong thực tế, nhưng ghim sàn 1.3 biến mọi trục trặc bắt tay
		// tương lai — một proxy chen giữa, một client cũ — thành lỗi khó đọc.
		// Version đàm phán ĐƯỢC là số phải ĐO trên cụm, không phải số để tin.
		MinVersion: tls.VersionTLS12,
	}, nil
}

// ClientConfig dựng tls.Config cho gateway (và mọi client Go khác).
//
// serverName phải khớp một SAN của cert server. Đây là lý do chart phải phát
// SAN cho CẢ tên Service ngắn LẪN FQDN: client dial bằng tên nào thì tên đó
// phải nằm trong SAN, và hai service trong repo này dial bằng hai dạng khác nhau.
func ClientConfig(f Files, serverName string) (*tls.Config, error) {
	if err := f.Validate(); err != nil {
		return nil, err
	}
	cert, err := tls.LoadX509KeyPair(f.CertFile, f.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("nạp cert/key client: %w", err)
	}
	pool, err := caPool(f.CAFile)
	if err != nil {
		return nil, err
	}
	if serverName == "" {
		// Để rỗng thì crypto/tls lấy hostname từ địa chỉ dial. Điều đó ĐÚNG khi
		// dial bằng tên, nhưng SAI im lặng khi dial bằng IP (SAN của ta không có
		// IP nào). Bắt buộc truyền tường minh để lỗi đó không tồn tại được.
		return nil, fmt.Errorf("ClientConfig: serverName rỗng — phải truyền tên khớp SAN của cert server")
	}
	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      pool,
		ServerName:   serverName,
		MinVersion:   tls.VersionTLS12,
	}, nil
}
