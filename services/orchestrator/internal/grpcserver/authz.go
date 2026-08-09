package grpcserver

import (
	"context"
	"log/slog"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
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
// requireMTLS=false là mặc định có chủ ý ở giai đoạn này: lane gateway (1.C)
// chưa tồn tại nên chưa ai trình được cert, và bật cứng bây giờ sẽ giết
// `grpcurl` trong Verify commands lẫn đường BFF→orchestrator của G12.
func NewAuthInterceptor(log *slog.Logger, requireMTLS bool) grpc.UnaryServerInterceptor {
	if !requireMTLS {
		log.Warn("GRPC_REQUIRE_MTLS=false — cổng gRPC KHÔNG xác thực người gọi. " +
			"`user_id` trong request là field client tự khai, và nhánh system_component sẽ bị TỪ CHỐI. " +
			"Xem R25/B0′ trong phase-1.md: phải bật trước khi apps/web nối vào (G12).")
	}

	return func(
		ctx context.Context,
		req interface{},
		_ *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		trust := PeerTrust{}
		if p, ok := peer.FromContext(ctx); ok {
			trust.Addr = p.Addr.String()
			if requireMTLS {
				tlsInfo, ok := p.AuthInfo.(credentials.TLSInfo)
				if !ok || len(tlsInfo.State.VerifiedChains) == 0 {
					// Bật mTLS mà peer không trình được cert hợp lệ ⇒ chặn hẳn,
					// không hạ xuống "external". Nửa vời ở đây là bật một cổng
					// rồi để nó không gác gì.
					return nil, status.Error(codes.Unauthenticated,
						"cổng này yêu cầu mTLS: không có client certificate hợp lệ")
				}
				trust.InCluster = true
			}
		}
		return handler(context.WithValue(ctx, peerTrustKey{}, trust), req)
	}
}
