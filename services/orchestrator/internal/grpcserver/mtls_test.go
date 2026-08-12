package grpcserver_test

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

// ⛔ VÌ SAO FILE NÀY TỒN TẠI RIÊNG, KHÔNG GỘP VÀO authz_test.go.
//
// Năm test của authz_test.go dựng `peer.Peer` BẰNG TAY và không bắt tay TLS lần
// nào. Chúng chứng minh được logic rẽ nhánh, nhưng KHÔNG chứng minh được ba
// điều mà chính chặng này bán:
//
//  1. cert do CA LẠ ký thì bị chặn — nhánh đó nằm ở crypto/tls, trước
//     interceptor, nên một peer.Peer giả không bao giờ chạm tới nó;
//  2. CommonName đọc ra ĐÚNG — `VerifiedChains` do runtime TLS điền, và một
//     hiện thực đọc nhầm `PeerCertificates` sẽ cho cùng kết quả trong mọi test
//     dùng peer giả;
//  3. `permissive` thật sự nhận được client không cert TRÊN MỘT KẾT NỐI THẬT.
//
// Nói cách khác: bộ test cũ có thể xanh trọn vẹn trên một hiện thực mTLS không
// bao giờ bắt tay được. File này là chỗ duy nhất trả lời "nó có chạy không".

// ============================================================ hạ tầng cert

type certPair struct{ certPEM, keyPEM []byte }

// newCA sinh một CA tự ký. Dùng ECDSA P-256 thay vì RSA-2048 vì nó nhanh hơn
// hai bậc độ lớn khi sinh khoá — bộ test này sinh 6 cặp khoá, và với RSA thì
// chỉ riêng việc đó đã đủ làm `go test` chậm thấy rõ.
func newCA(t *testing.T, cn string) (*x509.Certificate, *ecdsa.PrivateKey, certPair) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("sinh khoá CA: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: cn},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("ký cert CA: %v", err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse cert CA: %v", err)
	}
	return parsed, key, certPair{certPEM: pemBlock(t, "CERTIFICATE", der)}
}

// newLeaf ký một cert lá bằng CA đã cho. dnsNames rỗng ⇒ cert client (không cần
// SAN vì client không bị verify hostname).
func newLeaf(
	t *testing.T, ca *x509.Certificate, caKey *ecdsa.PrivateKey, cn string, dnsNames []string,
) certPair {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("sinh khoá lá: %v", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth,
		},
		DNSNames: dnsNames,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca, &key.PublicKey, caKey)
	if err != nil {
		t.Fatalf("ký cert lá: %v", err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatalf("marshal khoá lá: %v", err)
	}
	return certPair{
		certPEM: pemBlock(t, "CERTIFICATE", der),
		keyPEM:  pemBlock(t, "EC PRIVATE KEY", keyDER),
	}
}

func pemBlock(t *testing.T, typ string, der []byte) []byte {
	t.Helper()
	return pem.EncodeToMemory(&pem.Block{Type: typ, Bytes: der})
}

// writeFiles đổ cert ra đĩa vì tlsx.Files nhận ĐƯỜNG DẪN, không nhận []byte.
//
// Đó là chủ ý chứ không phải bất tiện: trên cụm nguồn cert LÀ file mount từ
// Secret, nên test đi qua đúng đường mà production đi — gồm cả nhánh
// Files.Validate() kiểm file đọc được.
func writeFiles(t *testing.T, ca certPair, leaf certPair) tlsx.Files {
	t.Helper()
	dir := t.TempDir()
	write := func(name string, data []byte) string {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, data, 0o600); err != nil {
			t.Fatalf("ghi %s: %v", name, err)
		}
		return p
	}
	return tlsx.Files{
		CertFile: write("tls.crt", leaf.certPEM),
		KeyFile:  write("tls.key", leaf.keyPEM),
		CAFile:   write("ca.crt", ca.certPEM),
	}
}

// ============================================================ server thật

const testServerName = "platform-orchestrator"

// startServer dựng một gRPC server THẬT có TLS + interceptor, trên một cổng
// loopback ngẫu nhiên. Trả về địa chỉ dial và fake lifecycle để soi kết quả.
//
// ⛔ LIFECYCLE PHẢI KHÁC nil, VÀ ĐÓ LÀ MỘT PHÁT HIỆN CHỨ KHÔNG PHẢI CHI TIẾT.
// `ReapSession` gọi `s.ready()` TRƯỚC `resolveReapActor`, nên với lifecycle=nil
// mọi lời gọi dừng ở `Unavailable` và nhánh authz — gồm cả phép ghim CN —
// KHÔNG BAO GIỜ CHẠY. Bản đầu của file này dùng nil và có hai test xanh mà chưa
// từng thực thi dòng nào của thứ chúng khẳng định đang gác. Một bộ test mTLS
// xanh trên một hiện thực không ghim CN là đúng thứ chặng này tồn tại để tránh.
func startServer(
	t *testing.T, mode tlsx.Mode, serverFiles tlsx.Files, systemCNs []string,
) (string, *fakeLifecycle) {
	t.Helper()
	fake := &fakeLifecycle{sess: &orchestratorv1.Session{Id: "s-test"}}
	tlsCfg, err := tlsx.ServerConfig(serverFiles, mode)
	if err != nil {
		t.Fatalf("ServerConfig: %v", err)
	}
	srv := grpc.NewServer(
		grpc.Creds(credentials.NewTLS(tlsCfg)),
		grpc.UnaryInterceptor(grpcserver.NewAuthInterceptor(discardLogger(), mode)),
	)
	orchestratorv1.RegisterSessionServiceServer(srv,
		grpcserver.NewSessionService(discardLogger(), fake, systemCNs))

	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	go func() { _ = srv.Serve(lis) }()
	t.Cleanup(srv.Stop)
	return lis.Addr().String(), fake
}

// clientTLS dựng cấu hình client tin CA của server và trình cert `leaf`.
func clientTLS(t *testing.T, leaf tlsx.Files) *tls.Config {
	t.Helper()
	cfg, err := tlsx.ClientConfig(leaf, testServerName)
	if err != nil {
		t.Fatalf("ClientConfig: %v", err)
	}
	return cfg
}

// clientTLSKhongCert — tin CA của server nhưng KHÔNG trình cert nào.
//
// ⚠ CA phải là CA THẬT của server. Bản đầu dùng một CA vứt đi cho tiện, và test
// đỏ vì CLIENT từ chối SERVER — tức đo ngược chiều, trong khi thông báo lỗi
// ("certificate signed by unknown authority") đọc y hệt ca ta đang muốn đo.
func clientTLSKhongCert(t *testing.T, f fixture) *tls.Config {
	t.Helper()
	cfg := clientTLS(t, f.gateway)
	cfg.Certificates = nil
	return cfg
}

// clientTLSEPGuiCert ÉP client gửi cert kể cả khi server bảo không nhận CA đó.
//
// ⛔ ĐÂY LÀ PHÁT HIỆN CỦA CHẶNG NÀY, KHÔNG PHẢI MẸO TEST. Client Go LỊCH SỰ: ở
// bước CertificateRequest, server công bố danh sách CA nó chấp nhận
// (`ClientCAs`), và client chỉ gửi cert nào KHỚP danh sách đó. Một cert do CA lạ
// ký vì thế **không bao giờ được gửi** — client tự rơi về "không cert", server
// thấy vắng cert, và ở nấc `permissive` thì kết nối được CHẤP NHẬN rồi mới bị
// chặn ở authz.
//
// Hệ quả phải ghi lại: khẳng định "cert CA lạ làm hỏng bắt tay" là SAI với một
// client Go bình thường. Nó chỉ đúng khi bên kia CỐ TÌNH gửi — tức đúng ca của
// kẻ tấn công. `GetClientCertificate` bỏ qua phép lọc theo CA, nên nó là cách
// duy nhất để test dựng được kẻ tấn công thật thay vì một client lịch sự.
func clientTLSEpGuiCert(t *testing.T, rogue tlsx.Files) *tls.Config {
	t.Helper()
	cfg := clientTLS(t, rogue)
	certs := cfg.Certificates
	cfg.Certificates = nil
	cfg.GetClientCertificate = func(*tls.CertificateRequestInfo) (*tls.Certificate, error) {
		return &certs[0], nil
	}
	return cfg
}

// callReap gọi ReapSession với actor=system_component qua một kênh THẬT.
//
// Chọn ReapSession vì nó là RPC DUY NHẤT phân biệt được ba mức: bắt tay hỏng
// (lỗi transport), bắt tay xong nhưng không đủ quyền (PermissionDenied), và đủ
// quyền (đi tới lifecycle — ở đây lifecycle=nil nên trả Unavailable, và chính
// Unavailable là bằng chứng authz đã CHO QUA).
func callReap(t *testing.T, addr string, cfg *tls.Config) error {
	t.Helper()
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(credentials.NewTLS(cfg)))
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}
	defer func() { _ = conn.Close() }()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err = orchestratorv1.NewSessionServiceClient(conn).ReapSession(ctx,
		&orchestratorv1.ReapSessionRequest{
			SessionId: "s-test",
			Actor:     &orchestratorv1.ReapSessionRequest_SystemComponent{SystemComponent: "gateway"},
		})
	return err
}

// ============================================================ các ca

// fixture dựng CA + cert server + cert gateway + cert web, tất cả cùng một CA.
type fixture struct {
	caPEM   certPair
	server  tlsx.Files
	gateway tlsx.Files
	web     tlsx.Files
	cnGw    string
	cnWeb   string
}

func newFixture(t *testing.T) fixture {
	t.Helper()
	ca, caKey, caPEM := newCA(t, "dlp-grpc-ca")
	const cnGw, cnWeb = "platform-gateway", "platform-web"
	return fixture{
		caPEM: caPEM,
		server: writeFiles(t, caPEM,
			newLeaf(t, ca, caKey, testServerName, []string{testServerName, "localhost"})),
		gateway: writeFiles(t, caPEM, newLeaf(t, ca, caKey, cnGw, nil)),
		web:     writeFiles(t, caPEM, newLeaf(t, ca, caKey, cnWeb, nil)),
		cnGw:    cnGw,
		cnWeb:   cnWeb,
	}
}

// TestRequireChanClientKhongCert — vế cơ bản nhất của `require`.
func TestRequireChanClientKhongCert(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModeRequire, f.server, []string{f.cnGw})

	err := callReap(t, addr, clientTLSKhongCert(t, f))
	if err == nil {
		t.Fatal("require ĐÃ CHO QUA client không trình cert")
	}
	if fake.gotReapID != "" {
		t.Fatal("lifecycle.Reap ĐÃ CHẠY dù bắt tay phải hỏng — chặn xảy ra sau khi đã làm việc")
	}
	// Bắt tay hỏng ở tầng TLS ⇒ gRPC báo Unavailable, KHÔNG phải Unauthenticated.
	// Ghi rõ ở đây vì kỳ vọng sai chỗ này là lý do phổ biến khiến người ta nới
	// assert thành `err != nil` rồi mất luôn khả năng phân biệt hai chế độ hỏng.
	if got := status.Code(err); got != codes.Unavailable {
		t.Fatalf("code = %v (err=%v), cần Unavailable — bắt tay TLS phải hỏng ở transport", got, err)
	}
}

// TestRequireChoQuaClientCoCertDungCA — vế KHẲNG ĐỊNH, và nó phải đo bằng thứ
// chỉ xảy ra khi authz cho qua: `lifecycle.Reap` được gọi với `System=true`.
//
// Đo bằng "không lỗi" là không đủ ở đây. Cả một hiện thực đúng lẫn một hiện
// thực bỏ qua authz đều cho err=nil; chỉ `gotActor.System` phân biệt được
// "server CHỨNG MINH được người gọi là hệ thống" với "server tin lời client khai".
func TestRequireChoQuaClientCoCertDungCA(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModeRequire, f.server, []string{f.cnGw})

	if err := callReap(t, addr, clientTLS(t, f.gateway)); err != nil {
		t.Fatalf("cert đúng CA + CN trong allowlist mà vẫn bị từ chối: %v", err)
	}
	if fake.gotReapID != "s-test" {
		t.Fatalf("lifecycle.Reap không được gọi (gotReapID=%q) — authz chặn nhầm", fake.gotReapID)
	}
	if !fake.gotActor.System {
		t.Fatal("actor không được đánh dấu System — nhánh system_component chưa thật sự được chấp nhận")
	}
}

// TestPermissiveChoQuaClientKhongCert — nấc giữa, trên kết nối THẬT.
func TestPermissiveChoQuaClientKhongCert(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModePermissive, f.server, []string{f.cnGw})

	err := callReap(t, addr, clientTLSKhongCert(t, f))
	// Client không cert ⇒ InCluster=false ⇒ nhánh system_component bị từ chối.
	// Đó là ĐÚNG: permissive khoan dung ở tầng TLS, KHÔNG ở tầng authz.
	if got := status.Code(err); got != codes.PermissionDenied {
		t.Fatalf("code = %v (err=%v), cần PermissionDenied — bắt tay phải THÀNH CÔNG rồi authz mới từ chối",
			got, err)
	}
	if fake.gotReapID != "" {
		t.Fatal("lifecycle.Reap ĐÃ CHẠY dù lời gọi phải bị từ chối — chặn xảy ra SAU khi đã làm việc")
	}
}

// TestPermissiveVanChanCertCuaCALa.
//
// ⛔ CA NÀY LÀ ĐỐI CHỨNG ÂM QUAN TRỌNG NHẤT CỦA CẢ FILE. Không có nó, một hiện
// thực dùng `tls.RequestClientCert` (nhận cert nhưng KHÔNG verify) sẽ làm mọi
// test khác xanh: client hợp lệ vẫn qua, client không cert vẫn qua. Chỉ ca này
// đỏ — và nó đỏ đúng chỗ mTLS mất hết ý nghĩa, vì khi đó bất kỳ ai tự ký một
// cert CN="platform-gateway" cũng reap được session của người khác.
func TestPermissiveVanChanCertCuaCALa(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModePermissive, f.server, []string{f.cnGw})

	// CA khác hoàn toàn, nhưng CN giả mạo ĐÚNG tên gateway.
	otherCA, otherKey, otherCAPEM := newCA(t, "ke-tan-cong-ca")
	rogue := writeFiles(t, otherCAPEM, newLeaf(t, otherCA, otherKey, f.cnGw, nil))
	// CA file phải là CA THẬT của server, nếu không client tự từ chối server và
	// ta đo nhầm chiều. Chỉ cert/key là đồ giả.
	rogue.CAFile = f.server.CAFile

	err := callReap(t, addr, clientTLSEpGuiCert(t, rogue))
	if err == nil {
		t.Fatal("cert do CA lạ ký ĐƯỢC CHẤP NHẬN — mTLS không verify gì cả")
	}
	if got := status.Code(err); got != codes.Unavailable {
		t.Fatalf("code = %v (err=%v), cần Unavailable — cert CA lạ phải làm hỏng BẮT TAY", got, err)
	}
	if fake.gotReapID != "" {
		t.Fatal("lifecycle.Reap ĐÃ CHẠY dù lời gọi phải bị từ chối — chặn xảy ra SAU khi đã làm việc")
	}
}

// TestClientLichSuKhongGuiCertCALa — ghim ĐƯỜNG THẬT, không phải đường tấn công.
//
// Ca trên (TestPermissiveVanChanCertCuaCALa) đo kẻ tấn công CỐ TÌNH gửi. Ca này
// đo thứ xảy ra khi một service cấu hình nhầm CA: client Go **không gửi** cert
// mà server đã báo không nhận, nên nó tự rơi về "không cert".
//
// ⛔ VÌ SAO PHẢI GHIM CẢ HAI. Hai đường cho hai triệu chứng KHÁC HẲN nhau, và
// người vận hành sẽ gặp đường này chứ không phải đường kia: cấu hình nhầm CA
// KHÔNG cho lỗi TLS nào cả — nó cho `PermissionDenied` ở nhánh system_component,
// tức một thông báo nói về AUTHZ trong khi nguyên nhân nằm ở CERT. Không ghim
// thì lần chẩn đoán đó bắt đầu từ chỗ sai.
func TestClientLichSuKhongGuiCertCALa(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModePermissive, f.server, []string{f.cnGw})

	otherCA, otherKey, otherCAPEM := newCA(t, "ca-cau-hinh-nham")
	rogue := writeFiles(t, otherCAPEM, newLeaf(t, otherCA, otherKey, f.cnGw, nil))
	rogue.CAFile = f.server.CAFile

	err := callReap(t, addr, clientTLS(t, rogue))
	if got := status.Code(err); got != codes.PermissionDenied {
		t.Fatalf("code = %v (err=%v), cần PermissionDenied — client lịch sự rơi về không-cert, "+
			"bắt tay THÀNH CÔNG rồi authz mới chặn", got, err)
	}
	if fake.gotReapID != "" {
		t.Fatal("lifecycle.Reap ĐÃ CHẠY dù lời gọi phải bị từ chối")
	}
}

// TestGhimCNChanWebDungNhanhSystemComponent.
//
// Đây là ca chứng minh mTLS không chỉ chặn kẻ ngoài mà còn PHÂN QUYỀN được giữa
// hai người trong. apps/web có cert hoàn toàn hợp lệ do đúng CA của cụm ký — và
// vẫn phải bị từ chối nhánh system_component.
//
// Không có ca này thì lỗ hổng im lặng: đường user_id của web vẫn chạy đúng, nên
// không test chức năng nào đỏ, trong khi web reap được session của bất kỳ ai.
func TestGhimCNChanWebDungNhanhSystemComponent(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModeRequire, f.server, []string{f.cnGw})

	err := callReap(t, addr, clientTLS(t, f.web))
	if got := status.Code(err); got != codes.PermissionDenied {
		t.Fatalf("code = %v (err=%v), cần PermissionDenied — cert của web hợp lệ nhưng CN không trong allowlist",
			got, err)
	}
	if fake.gotReapID != "" {
		t.Fatal("lifecycle.Reap ĐÃ CHẠY dù lời gọi phải bị từ chối — chặn xảy ra SAU khi đã làm việc")
	}
}

// TestAllowlistRongThiKhongAiDuocSystemComponent — fail-closed ở tầng service.
//
// config.Load đã chặn ca allowlist rỗng khi mTLS bật, nhưng tầng này KHÔNG được
// dựa vào điều đó: hai tuyến phòng thủ ở hai package, và một trong hai có thể bị
// gỡ mà không ai nhận ra. Ca này gác tuyến thứ hai.
func TestAllowlistRongThiKhongAiDuocSystemComponent(t *testing.T) {
	f := newFixture(t)
	addr, fake := startServer(t, tlsx.ModeRequire, f.server, nil)

	err := callReap(t, addr, clientTLS(t, f.gateway))
	if got := status.Code(err); got != codes.PermissionDenied {
		t.Fatalf("code = %v (err=%v), cần PermissionDenied — allowlist rỗng KHÔNG có nghĩa là cho phép tất cả",
			got, err)
	}
	if fake.gotReapID != "" {
		t.Fatal("lifecycle.Reap ĐÃ CHẠY dù lời gọi phải bị từ chối — chặn xảy ra SAU khi đã làm việc")
	}
}

func containsAny(err error, subs ...string) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, s := range subs {
		if len(s) > 0 && len(msg) >= len(s) && contains(msg, s) {
			return true
		}
	}
	return false
}

func contains(haystack, needle string) bool {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
