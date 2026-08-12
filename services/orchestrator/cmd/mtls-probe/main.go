// Command mtls-probe đo cổng gRPC của orchestrator TỪ TRONG CỤM.
//
// ⛔ VÌ SAO PHẢI LÀ MỘT BINARY TRONG REPO, KHÔNG PHẢI MẤY DÒNG grpcurl.
// Ba vế quan trọng nhất của chặng 1.C-4 không đo được từ ngoài:
//
//   - Ghim CN chỉ phân biệt được khi có HAI cert hợp lệ do CÙNG một CA ký
//     (gateway và web). grpcurl dùng được một cert, nhưng cert đó nằm trong
//     Secret của cụm — muốn cầm nó thì phải ở trong cụm.
//   - `permissive` khác `require` ở chỗ client KHÔNG cert vẫn nối được. Phân
//     biệt hai nấc cần chạy cùng một phép thử ở hai cấu hình và so kết quả.
//   - Cụm này side-load image, không pull được (mạng VM ~52 KiB/s), nên "cài
//     grpcurl vào một pod" không phải một bước, nó là một chặng.
//
// Nó cũng là công cụ CHẨN ĐOÁN sau này: khi ai đó báo "session không tạo được",
// câu hỏi đầu tiên là mTLS đang ở nấc nào và cert nào đang được trình.
//
// Dùng:
//
//	mtls-probe -addr platform-orchestrator:9090 -server-name platform-orchestrator \
//	           -ca /etc/dlp/mtls/ca.crt [-cert X.crt -key X.key]
//
// Bỏ -cert/-key để đo ca "client không trình cert".
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"os"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

func main() {
	addr := flag.String("addr", "platform-orchestrator:9090", "địa chỉ gRPC")
	serverName := flag.String("server-name", "platform-orchestrator", "tên khớp SAN cert server")
	caFile := flag.String("ca", "", "CA bundle; rỗng ⇒ dial plaintext (h2c)")
	certFile := flag.String("cert", "", "client cert; rỗng ⇒ TLS nhưng KHÔNG trình cert")
	keyFile := flag.String("key", "", "client key")
	sessionID := flag.String("session", "probe-khong-ton-tai", "session id để gọi ReapSession")
	flag.Parse()

	if err := run(*addr, *serverName, *caFile, *certFile, *keyFile, *sessionID); err != nil {
		fmt.Fprintf(os.Stderr, "probe lỗi: %v\n", err)
		os.Exit(1)
	}
}

func run(addr, serverName, caFile, certFile, keyFile, sessionID string) error {
	var opt grpc.DialOption
	switch {
	case caFile == "":
		fmt.Println("mode-client: PLAINTEXT (h2c, không TLS)")
		opt = grpc.WithTransportCredentials(insecure.NewCredentials())
	case certFile == "":
		// TLS nhưng không trình cert. Dựng tay thay vì qua tlsx.ClientConfig vì
		// hàm đó CỐ Ý bắt buộc đủ ba file — production không bao giờ cần nhánh
		// "TLS mà không cert", chỉ phép đo mới cần.
		pool, err := caPoolFrom(caFile)
		if err != nil {
			return err
		}
		fmt.Println("mode-client: TLS, KHÔNG trình client cert")
		opt = grpc.WithTransportCredentials(credentials.NewTLS(&tls.Config{
			RootCAs: pool, ServerName: serverName, MinVersion: tls.VersionTLS12,
		}))
	default:
		cfg, err := tlsx.ClientConfig(
			tlsx.Files{CertFile: certFile, KeyFile: keyFile, CAFile: caFile}, serverName)
		if err != nil {
			return err
		}
		fmt.Printf("mode-client: mTLS, cert=%s\n", certFile)
		opt = grpc.WithTransportCredentials(credentials.NewTLS(cfg))
	}

	conn, err := grpc.NewClient(addr, opt)
	if err != nil {
		return fmt.Errorf("dựng client: %w", err)
	}
	defer func() { _ = conn.Close() }()

	client := orchestratorv1.NewSessionServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// ⛔ ReapSession với actor=system_component là phép thử DUY NHẤT phân biệt
	// được ba mức cùng lúc:
	//   Unavailable      → bắt tay TLS hỏng (không cert ở nấc require, CA lệch)
	//   PermissionDenied → bắt tay XONG nhưng không đủ quyền (CN không trong
	//                      allowlist, hoặc không cert ở nấc permissive)
	//   NotFound         → authz CHO QUA, lifecycle chạy thật và không thấy session
	// Vế thứ ba là thứ chứng minh nhánh system_component thật sự mở — một phép
	// thử chỉ có hai kết cục ĐỎ không phân biệt được "chặn đúng" với "chặn tất cả".
	_, err = client.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{
		SessionId: sessionID,
		Actor:     &orchestratorv1.ReapSessionRequest_SystemComponent{SystemComponent: "mtls-probe"},
	})
	st := status.Convert(err)
	fmt.Printf("ReapSession(system_component) → code=%s\n", st.Code())
	if msg := st.Message(); msg != "" {
		fmt.Printf("  message: %s\n", msg)
	}
	return nil
}

func caPoolFrom(caFile string) (*x509.CertPool, error) {
	// #nosec G304 — đường dẫn CA là tham số dòng lệnh của công cụ chẩn đoán.
	pemBytes, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("đọc CA %s: %w", caFile, err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pemBytes) {
		return nil, fmt.Errorf("CA %s không chứa certificate PEM hợp lệ", caFile)
	}
	return pool, nil
}
