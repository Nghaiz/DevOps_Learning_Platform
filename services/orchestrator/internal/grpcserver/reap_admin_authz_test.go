package grpcserver_test

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"net"
	"testing"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/lifecycle"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/tlsx"
)

// ctxWithVerifiedPeer dựng peer đã có chuỗi cert ĐÃ VERIFY, CN cho trước.
//
// ⚠ Cùng giới hạn đã ghi ở `runInterceptor`: không bắt tay TLS thật, nên nó chỉ
// chứng minh logic rẽ nhánh. Vế "CA lạ bị chặn" nằm ở mtls_test.go.
func ctxWithVerifiedPeer(cn string) context.Context {
	cert := &x509.Certificate{Subject: pkix.Name{CommonName: cn}}
	return peer.NewContext(context.Background(), &peer.Peer{
		Addr: &net.TCPAddr{IP: net.ParseIP("10.244.0.9"), Port: 40001},
		AuthInfo: credentials.TLSInfo{
			State: tls.ConnectionState{VerifiedChains: [][]*x509.Certificate{{cert}}},
		},
	})
}

// TestReapNhanhAdminUserId — P13 D15, cổng của nhánh actor thứ ba.
//
// ⛔ HAI CÂU HỎI, VÀ CHÚNG KHÁC NHAU:
//
//	(1) Nhánh `admin_user_id` có mở được đường cho admin không? (D15 nói: phải)
//	(2) Nó có kéo theo `system_component` mở ra không? (phải: KHÔNG)
//
// Bảng dưới hỏi cả hai trong cùng một khuôn, vì một bản vá chỉ trả lời (1) mà
// làm hỏng (2) sẽ trông y hệt một bản vá đúng ở mọi test chức năng.
//
// Ba trạng thái của PeerTrust được dựng qua CHÍNH interceptor thật (không nhét
// tay vào context), nên bảng này cũng gác luôn liên kết
// `mode → PeerTrust.MTLSEnabled` — thứ mà một `PeerTrust{}` viết tay sẽ bỏ qua.
func TestReapNhanhAdminUserId(t *testing.T) {
	sess := &orchestratorv1.Session{Id: "s1", UserId: "u1"}
	// Allowlist CHỈ có gateway — đúng như chart cấu hình. apps/web KHÔNG ở đây,
	// và cả điểm của D15 là nó không cần ở đây.
	systemCNs := []string{"dlp-gateway"}

	adminArm := func(id string) *orchestratorv1.ReapSessionRequest {
		return &orchestratorv1.ReapSessionRequest{
			SessionId: "s1",
			Reason:    "admin_terminated",
			Actor:     &orchestratorv1.ReapSessionRequest_AdminUserId{AdminUserId: id},
		}
	}

	tests := []struct {
		name string
		mode tlsx.Mode
		ctx  context.Context
		req  *orchestratorv1.ReapSessionRequest
		// codes.OK nghĩa là lời gọi phải tới được lifecycle.
		wantCode  codes.Code
		wantActor lifecycle.ReapActor
	}{
		{
			name: "mTLS TẮT: admin đi qua — server không kiểm gì, y như user_id ở mọi RPC khác",
			mode: tlsx.ModeOff,
			ctx:  ctxWithPeer(),
			req:  adminArm("adm-1"),
			// Chặn riêng nhánh này khi cổng tắt chỉ làm nút admin chết trong
			// khi đường vòng ListSessions("") → reap theo user_id vẫn mở.
			wantCode:  codes.OK,
			wantActor: lifecycle.ReapActor{AdminUserID: "adm-1"},
		},
		{
			name:     "mTLS BẬT, peer không cert: TỪ CHỐI — có cổng thì phải qua cổng",
			mode:     tlsx.ModePermissive,
			ctx:      ctxWithPeer(),
			req:      adminArm("adm-1"),
			wantCode: codes.PermissionDenied,
		},
		{
			name: "mTLS BẬT, cert hợp lệ, CN NGOÀI allowlist: đi qua — nhánh này KHÔNG đòi allowlist",
			mode: tlsx.ModeRequire,
			ctx:  ctxWithVerifiedPeer("dlp-web"),
			req:  adminArm("adm-1"),
			// Đòi allowlist ở đây nghĩa là phải nhét apps/web vào
			// GRPC_MTLS_SYSTEM_CNS — tức cấp bypass chủ-sở-hữu cho MỌI reap của
			// nó, kể cả me.endSession của người dùng thường.
			wantCode:  codes.OK,
			wantActor: lifecycle.ReapActor{AdminUserID: "adm-1"},
		},
		{
			name:     "admin_user_id rỗng: InvalidArgument, không đoán hộ",
			mode:     tlsx.ModeRequire,
			ctx:      ctxWithVerifiedPeer("dlp-web"),
			req:      adminArm(""),
			wantCode: codes.InvalidArgument,
		},
		{
			name: "system_component với CÙNG cert ngoài allowlist: VẪN TỪ CHỐI",
			mode: tlsx.ModeRequire,
			ctx:  ctxWithVerifiedPeer("dlp-web"),
			req: &orchestratorv1.ReapSessionRequest{
				SessionId: "s1",
				Actor:     &orchestratorv1.ReapSessionRequest_SystemComponent{SystemComponent: "reaper"},
			},
			// Đây là vế "không nới cái gì khác". Cùng một peer, cùng một cert:
			// nhánh admin đi qua, nhánh system vẫn dừng ở allowlist.
			wantCode: codes.PermissionDenied,
		},
		{
			name: "user_id không đổi: đi thẳng xuống lifecycle, KHÔNG thành admin",
			mode: tlsx.ModeRequire,
			ctx:  ctxWithVerifiedPeer("dlp-web"),
			req: &orchestratorv1.ReapSessionRequest{
				SessionId: "s1",
				Actor:     &orchestratorv1.ReapSessionRequest_UserId{UserId: "u1"},
			},
			wantCode:  codes.OK,
			wantActor: lifecycle.ReapActor{UserID: "u1"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fake := &fakeLifecycle{sess: sess}
			svc := grpcserver.NewSessionService(discardLogger(), fake, systemCNs)
			interceptor := grpcserver.NewAuthInterceptor(discardLogger(), tt.mode)

			_, err := interceptor(tt.ctx, tt.req, &grpc.UnaryServerInfo{
				FullMethod: "/orchestrator.v1.SessionService/ReapSession",
			}, func(inner context.Context, req interface{}) (interface{}, error) {
				return svc.ReapSession(inner, req.(*orchestratorv1.ReapSessionRequest))
			})

			if got := status.Code(err); got != tt.wantCode {
				t.Fatalf("code = %v (err=%v), cần %v", got, err, tt.wantCode)
			}
			if tt.wantCode != codes.OK {
				if fake.gotReapID != "" {
					t.Fatal("lifecycle.Reap ĐÃ được gọi — việc từ chối phải xảy ra TRƯỚC khi chạm tầng dưới")
				}
				return
			}
			if fake.gotActor != tt.wantActor {
				t.Fatalf("actor xuống lifecycle = %+v, cần %+v", fake.gotActor, tt.wantActor)
			}
		})
	}
}
