package grpcserver

import (
	"context"
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

// peerTrustKey là khoá context mang KẾT LUẬN của interceptor về peer.
//
// Kiểu riêng (không phải string) để không đụng khoá của package khác — đây là
// yêu cầu của chính context.WithValue, không phải sở thích.
type peerTrustKey struct{}

// PeerTrust là những gì SERVER XÁC MINH ĐƯỢC về người gọi.
//
// ⛔ TÁCH BẠCH VỚI `oneof actor` CỦA PROTO. Field trong request là thứ client
// TUYÊN BỐ; struct này là thứ server CHỨNG MINH. Trộn hai thứ đó nghĩa là bất
// kỳ ai gọi được RPC cũng tự phong mình là `system_component` — và session_id
// KHÔNG phải bí mật (nó nằm trong URL /ws/session/{id}), nên "biết id = reap
// được session của người khác".
type PeerTrust struct {
	// InCluster chỉ đúng khi peer đã trình client cert được CA của ta ký.
	InCluster bool
	// CommonName là CN của client cert ĐÃ VERIFY. Rỗng khi InCluster=false.
	//
	// ⛔ ĐỌC TỪ VerifiedChains, KHÔNG PHẢI PeerCertificates. Hai mảng khác nhau ở
	// đúng chỗ quan trọng: `PeerCertificates[0]` là cert client GỬI LÊN (chưa qua
	// verify), còn `VerifiedChains[0][0]` là cert đã được kiểm bằng ClientCAs.
	// Đọc nhầm mảng đầu nghĩa là bất kỳ ai cũng tự khai CN bằng một cert tự ký —
	// tức allowlist CN biến thành trang trí, và nó hỏng IM LẶNG vì hai mảng có
	// cùng kiểu và thường có cùng nội dung khi mọi thứ đang đúng.
	CommonName string
	// Addr chỉ để log/chẩn đoán. TUYỆT ĐỐI không dùng làm căn cứ authz: địa chỉ
	// nguồn giả được, và trong cluster thì mọi thứ đều nằm trong dải pod CIDR.
	Addr string
}

// TrustFromContext đọc kết luận của interceptor.
//
// Không có kết luận ⇒ zero value ⇒ InCluster=false. Fail-closed theo mặc định
// của Go, không cần nhánh riêng.
func TrustFromContext(ctx context.Context) PeerTrust {
	t, _ := ctx.Value(peerTrustKey{}).(PeerTrust)
	return t
}

// NewAuthInterceptor dựng unary interceptor xác lập PeerTrust.
//
// ⛔ VÌ SAO KHÔNG ĐOÁN "IN-CLUSTER" BẰNG DẢI IP KHI mTLS TẮT:
// mọi pod trong cluster đều nằm trong pod CIDR, kể cả pod của sinh viên nếu một
// ngày nào đó NetworkPolicy hở. Một heuristic theo IP sẽ cho kết quả "in-cluster"
// cho chính thứ nó phải chặn, và nó làm việc đó IM LẶNG. Nên khi mTLS tắt,
// interceptor nói thẳng: KHÔNG chứng minh được gì (InCluster=false), và nhánh
// `system_component` bị từ chối. Đó là fail-closed, và nó khiến việc bật mTLS
// có hậu quả NHÌN THẤY ĐƯỢC thay vì là một cờ ai cũng quên.
//
// BA NẤC (1.C-4) — và nấc giữa là toàn bộ lý do bản trước không bật được:
//
//	off        server không có TLS. Không chứng minh được gì ⇒ InCluster=false,
//	           nhánh system_component bị từ chối.
//	permissive server CÓ TLS, nhận cả client có cert lẫn không. Client có cert
//	           hợp lệ ⇒ InCluster=true; client không cert ⇒ đi tiếp với
//	           InCluster=false. Nấc này để QUAN SÁT ai đã cắm cert trước khi siết.
//	require    không có cert hợp lệ ⇒ Unauthenticated.
//
// ⚠ `permissive` KHÔNG khoan dung với cert SAI. Cert do CA lạ ký làm hỏng bắt
// tay TLS ngay ở tầng dưới (crypto/tls VerifyClientCertIfGiven), interceptor
// không bao giờ thấy request đó. Nấc này chỉ khoan dung với việc VẮNG cert.
func NewAuthInterceptor(log *slog.Logger, mode tlsx.Mode) grpc.UnaryServerInterceptor {
	if mode == tlsx.ModeOff {
		log.Warn("GRPC_MTLS_MODE=off — cổng gRPC KHÔNG xác thực người gọi. " +
			"`user_id` trong request là field client tự khai, và nhánh system_component sẽ bị TỪ CHỐI. " +
			"Xem R25/B0′ trong phase-1.md.")
	}

	return func(
		ctx context.Context,
		req interface{},
		_ *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		trust := PeerTrust{}
		p, hasPeer := peer.FromContext(ctx)
		if hasPeer {
			trust.Addr = p.Addr.String()
		}

		// ⛔ NHÁNH TỪ CHỐI PHẢI NẰM NGOÀI `if hasPeer`.
		//
		// Bản đầu đặt nó BÊN TRONG, nên một request KHÔNG có peer trong context
		// đi thẳng qua handler dù cổng đang bật — fail-OPEN, ngược hẳn với lập
		// luận ngay phía trên. Đo được: `không có peer, mTLS bật →
		// err=<nil>, handler đã chạy=true`.
		if mode.Enabled() {
			cn, verified := verifiedCN(p, hasPeer)
			if !verified && mode == tlsx.ModeRequire {
				return nil, status.Error(codes.Unauthenticated,
					"cổng này yêu cầu mTLS: không có client certificate hợp lệ")
			}
			// permissive: !verified ⇒ giữ nguyên zero value (InCluster=false) và
			// đi tiếp. Đó là ĐỊNH NGHĨA của nấc giữa, không phải một nhánh sót.
			trust.InCluster = verified
			trust.CommonName = cn
		}
		return handler(context.WithValue(ctx, peerTrustKey{}, trust), req)
	}
}

// verifiedCN rút CommonName từ chuỗi cert ĐÃ VERIFY của peer.
//
// Trả (cn, false) khi không có gì verify được. Go chỉ điền `VerifiedChains` SAU
// khi kiểm bằng `ClientCAs`, nên cert của CA khác cho mảng RỖNG — đó là lý do
// phép kiểm ở đây là `len(VerifiedChains) > 0` chứ không phải `PeerCertificates`.
func verifiedCN(p *peer.Peer, hasPeer bool) (string, bool) {
	if !hasPeer {
		return "", false
	}
	tlsInfo, ok := p.AuthInfo.(credentials.TLSInfo)
	if !ok || len(tlsInfo.State.VerifiedChains) == 0 || len(tlsInfo.State.VerifiedChains[0]) == 0 {
		return "", false
	}
	return tlsInfo.State.VerifiedChains[0][0].Subject.CommonName, true
}

// NewStreamDenyInterceptor TỪ CHỐI mọi RPC dạng stream.
//
// ⛔ ĐÂY LÀ CỔNG CHO MỘT LỖI CHƯA XẢY RA, KHÔNG PHẢI PHÒNG THỦ THỪA.
// `NewAuthInterceptor` là UnaryServerInterceptor: gRPC-Go KHÔNG áp nó cho
// stream handler. Hôm nay điều đó vô hại vì cả 5 RPC của `session.proto` đều
// unary. Nhưng ngày ai đó thêm một RPC `stream` — ví dụ theo dõi trạng thái
// session realtime — nó sẽ chạy với PeerTrust RỖNG mà không một dòng lỗi nào:
// `PeerTrustFrom(ctx)` trả zero value, `InCluster=false`, và toàn bộ B0′ bị đi
// vòng qua. Không có gì trong review, trong test, hay trong compiler bắt được
// việc đó — nó chỉ là một interceptor không được gọi.
//
// Vì thế: chặn ở đây, ồn ào. Ai thêm stream RPC sẽ thấy `Unimplemented` ngay
// lần gọi đầu tiên kèm chỉ dẫn phải làm gì, thay vì thấy nó chạy tốt và phát
// hiện lỗ hổng sau khi đã ship. Khi thật sự cần stream, thay hàm này bằng một
// StreamServerInterceptor xác lập PeerTrust y hệt bản unary — ĐỪNG chỉ xoá nó.
//
// Nợ `unverifiedClaims` của review PR #27: "Interceptor chỉ là UnaryInterceptor…
// KHÔNG có cổng nào chặn việc một stream RPC thêm sau này đi vòng qua B0′."
func NewStreamDenyInterceptor() grpc.StreamServerInterceptor {
	return func(
		_ interface{},
		_ grpc.ServerStream,
		info *grpc.StreamServerInfo,
		_ grpc.StreamHandler,
	) error {
		return status.Errorf(codes.Unimplemented,
			"RPC dạng stream (%s) bị từ chối: authz của orchestrator (B0′/R25) mới chỉ có "+
				"UnaryServerInterceptor, nên stream sẽ chạy với PeerTrust rỗng. "+
				"Muốn thêm stream RPC thì viết StreamServerInterceptor xác lập PeerTrust trước, "+
				"đừng gỡ cổng này.", info.FullMethod)
	}
}
