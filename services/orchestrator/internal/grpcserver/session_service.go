// Package grpcserver hiện thực SessionService định nghĩa ở proto/orchestrator/v1.
package grpcserver

import (
	"context"
	"log/slog"
	"slices"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/lifecycle"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Lifecycle là phần vòng đời session mà tầng gRPC gọi xuống.
//
// Interface (không phải *lifecycle.Service) giữ hai tính chất: server dựng được
// mà KHÔNG có Redis (đường P0 / smoke, xem NewSessionService), và test của tầng
// này không phải dựng datastore chỉ để kiểm việc định tuyến.
type Lifecycle interface {
	Create(ctx context.Context, req *orchestratorv1.CreateSessionRequest) (*orchestratorv1.Session, error)
	Claim(ctx context.Context, req *orchestratorv1.ClaimSessionRequest) (*orchestratorv1.Session, error)
	Get(ctx context.Context, req *orchestratorv1.GetSessionRequest) (*orchestratorv1.Session, error)
	Extend(ctx context.Context, req *orchestratorv1.ExtendSessionRequest) (*orchestratorv1.Session, bool, error)
	Reap(ctx context.Context, sessionID string, actor lifecycle.ReapActor) (*orchestratorv1.Session, error)
	// GetCapacity và ListSessions (P13 D5/D6) trả THẲNG message response của
	// contract — không cần bọc lại như Create/Claim/Get/Extend (những RPC đó
	// bọc Session vào một Response riêng ở tầng adapter; hai RPC này KHÔNG có
	// gì để bọc, response proto CHÍNH LÀ shape lifecycle trả ra).
	GetCapacity(ctx context.Context, req *orchestratorv1.GetCapacityRequest) (*orchestratorv1.GetCapacityResponse, error)
	ListSessions(ctx context.Context, req *orchestratorv1.ListSessionsRequest) (*orchestratorv1.ListSessionsResponse, error)
}

// SessionService là adapter gRPC: nó dịch request/response và KHÔNG chứa logic.
//
// Từ B5/B6, cả 5 RPC của contract đều có hành vi thật — không còn nhánh
// Unimplemented nào. Mọi quyết định (mã lỗi, authz, idempotency) sống ở
// internal/lifecycle; tầng này chỉ định tuyến và đối chiếu `oneof actor` với
// thứ interceptor CHỨNG MINH được (xem resolveReapActor).
type SessionService struct {
	orchestratorv1.UnimplementedSessionServiceServer

	log       *slog.Logger
	lifecycle Lifecycle

	// systemCNs là allowlist CommonName được dùng nhánh `actor.system_component`.
	//
	// ⛔ CHÍNH SÁCH Ở ĐÂY, SỰ THẬT Ở INTERCEPTOR. Interceptor chỉ nói "cert này
	// verify được và CN của nó là X" — một sự thật. Việc X có được phong
	// system_component hay không là một quyết định, và quyết định thuộc về tầng
	// biết `oneof actor` nghĩa là gì. Nhét allowlist vào interceptor sẽ buộc nó
	// biết về proto, và mọi RPC khác phải chịu một phép kiểm chỉ ReapSession cần.
	systemCNs []string
}

// NewSessionService dựng service. lifecycle có thể là nil khi orchestrator chạy
// mà không có datastore — khi đó cả ba RPC trả Unavailable với lý do rõ ràng,
// chứ KHÔNG panic ở request đầu tiên.
//
// systemCNs rỗng ⇒ KHÔNG CN nào được dùng nhánh system_component. Fail-closed:
// một danh sách chưa cấu hình không được suy thành "cho phép tất cả" (config.Load
// đã chặn ca đó khi mTLS bật, nhưng tầng này không được phụ thuộc vào điều đó —
// đây là tuyến phòng thủ thứ hai, không phải bản sao).
func NewSessionService(log *slog.Logger, lifecycle Lifecycle, systemCNs []string) *SessionService {
	return &SessionService{log: log, lifecycle: lifecycle, systemCNs: systemCNs}
}

// CreateSession cấp session mới và claim pod cho nó.
func (s *SessionService) CreateSession(
	ctx context.Context, req *orchestratorv1.CreateSessionRequest,
) (*orchestratorv1.CreateSessionResponse, error) {
	if err := s.ready("CreateSession"); err != nil {
		return nil, err
	}
	sess, err := s.lifecycle.Create(ctx, req)
	if err != nil {
		return nil, err
	}
	return &orchestratorv1.CreateSessionResponse{Session: sess}, nil
}

// ClaimSession đọc lại session đã có pod (idempotent). Xem lifecycle.Claim.
func (s *SessionService) ClaimSession(
	ctx context.Context, req *orchestratorv1.ClaimSessionRequest,
) (*orchestratorv1.ClaimSessionResponse, error) {
	if err := s.ready("ClaimSession"); err != nil {
		return nil, err
	}
	sess, err := s.lifecycle.Claim(ctx, req)
	if err != nil {
		return nil, err
	}
	return &orchestratorv1.ClaimSessionResponse{Session: sess}, nil
}

// GetSession trả trạng thái session của chính người gọi.
func (s *SessionService) GetSession(
	ctx context.Context, req *orchestratorv1.GetSessionRequest,
) (*orchestratorv1.GetSessionResponse, error) {
	if err := s.ready("GetSession"); err != nil {
		return nil, err
	}
	sess, err := s.lifecycle.Get(ctx, req)
	if err != nil {
		return nil, err
	}
	return &orchestratorv1.GetSessionResponse{Session: sess}, nil
}

// ExtendSession đẩy idle-deadline về phía trước (heartbeat từ gateway).
// Hard cap tính từ created_at KHÔNG gia hạn được — xem contract.
func (s *SessionService) ExtendSession(
	ctx context.Context, req *orchestratorv1.ExtendSessionRequest,
) (*orchestratorv1.ExtendSessionResponse, error) {
	if err := s.ready("ExtendSession"); err != nil {
		return nil, err
	}
	sess, hardCapReached, err := s.lifecycle.Extend(ctx, req)
	if err != nil {
		return nil, err
	}
	return &orchestratorv1.ExtendSessionResponse{
		Session:        sess,
		HardCapReached: hardCapReached,
	}, nil
}

// ReapSession dọn session. Idempotent.
//
// ⛔ ĐÂY LÀ NƠI `oneof actor` ĐƯỢC ĐỐI CHIẾU VỚI THỰC TẾ. Field trong request
// nói client TUYÊN BỐ mình là ai; PeerTrust là thứ server CHỨNG MINH được. Tin
// field thì bất kỳ ai gọi được RPC cũng tự phong mình là `system_component` —
// và session_id không phải bí mật (nó nằm trong URL /ws/session/{id}), nên
// "biết id = reap được session của người khác". Chính vì thế proto BẮT BUỘC
// field này thay vì để nó optional.
func (s *SessionService) ReapSession(
	ctx context.Context, req *orchestratorv1.ReapSessionRequest,
) (*orchestratorv1.ReapSessionResponse, error) {
	if err := s.ready("ReapSession"); err != nil {
		return nil, err
	}

	actor, err := s.resolveReapActor(ctx, req)
	if err != nil {
		return nil, err
	}

	sess, err := s.lifecycle.Reap(ctx, req.GetSessionId(), actor)
	if err != nil {
		return nil, err
	}
	return &orchestratorv1.ReapSessionResponse{Session: sess}, nil
}

// GetCapacity trả sức chứa nền tảng. Sẵn cho MỌI user đã đăng nhập — không có
// authz thêm ở tầng này (session.proto), khác hẳn ReapSession/system_component.
func (s *SessionService) GetCapacity(
	ctx context.Context, req *orchestratorv1.GetCapacityRequest,
) (*orchestratorv1.GetCapacityResponse, error) {
	if err := s.ready("GetCapacity"); err != nil {
		return nil, err
	}
	return s.lifecycle.GetCapacity(ctx, req)
}

// ListSessions liệt kê session ĐANG SỐNG, lọc theo user_id. Vai trò "ai được
// gửi user_id rỗng hay user_id của người khác" là quyết định của BFF — xem
// comment đầy đủ trong session.proto và trong lifecycle.Service.ListSessions.
func (s *SessionService) ListSessions(
	ctx context.Context, req *orchestratorv1.ListSessionsRequest,
) (*orchestratorv1.ListSessionsResponse, error) {
	if err := s.ready("ListSessions"); err != nil {
		return nil, err
	}
	return s.lifecycle.ListSessions(ctx, req)
}

// resolveReapActor dịch `oneof actor` sang thứ lifecycle tin được.
func (s *SessionService) resolveReapActor(
	ctx context.Context, req *orchestratorv1.ReapSessionRequest,
) (lifecycle.ReapActor, error) {
	switch a := req.GetActor().(type) {
	case *orchestratorv1.ReapSessionRequest_UserId:
		if a.UserId == "" {
			return lifecycle.ReapActor{}, status.Error(codes.InvalidArgument, "actor.user_id rỗng")
		}
		return lifecycle.ReapActor{UserID: a.UserId}, nil

	case *orchestratorv1.ReapSessionRequest_SystemComponent:
		if a.SystemComponent == "" {
			return lifecycle.ReapActor{}, status.Error(codes.InvalidArgument, "actor.system_component rỗng")
		}
		trust := TrustFromContext(ctx)
		if !trust.InCluster {
			// Với GRPC_MTLS_MODE=off, server KHÔNG chứng minh được peer là
			// in-cluster, nên nhánh này bị từ chối thẳng thay vì đoán bằng IP.
			// Reaper nội bộ KHÔNG đi qua đây — nó gọi thẳng lifecycle.Reap
			// trong cùng process, nên việc từ chối ở đây không chặn gì đang chạy.
			s.log.Warn("từ chối actor=system_component từ peer không chứng minh được là in-cluster",
				slog.String("component", a.SystemComponent),
				slog.String("peer", trust.Addr))
			return lifecycle.ReapActor{}, status.Error(codes.PermissionDenied,
				"actor.system_component chỉ chấp nhận trên kết nối in-cluster đã xác thực (mTLS); "+
					"xem GRPC_MTLS_MODE")
		}
		// ⛔ "CÓ CERT" CHƯA ĐỦ — CA CỦA TA KÝ CHO CẢ apps/web LẪN gateway.
		//
		// Không có phép kiểm này thì mTLS chặn được kẻ ngoài nhưng gộp hai người
		// TRONG có quyền khác nhau làm một: apps/web sẽ reap được session của bất
		// kỳ ai qua nhánh system_component, trong khi việc của nó chỉ là reap
		// phiên của chính người đang đăng nhập (nhánh user_id). Và nó hỏng im
		// lặng — đường user_id vẫn chạy đúng, nên không test chức năng nào đỏ.
		if !slices.Contains(s.systemCNs, trust.CommonName) {
			s.log.Warn("từ chối actor=system_component: CommonName không nằm trong allowlist",
				slog.String("component", a.SystemComponent),
				slog.String("cn", trust.CommonName),
				slog.String("peer", trust.Addr))
			return lifecycle.ReapActor{}, status.Error(codes.PermissionDenied,
				"actor.system_component: client certificate hợp lệ nhưng CommonName không được cấp quyền "+
					"system_component; xem GRPC_MTLS_SYSTEM_CNS")
		}
		return lifecycle.ReapActor{System: true, Component: a.SystemComponent}, nil

	case *orchestratorv1.ReapSessionRequest_AdminUserId:
		if a.AdminUserId == "" {
			return lifecycle.ReapActor{}, status.Error(codes.InvalidArgument, "actor.admin_user_id rỗng")
		}
		trust := TrustFromContext(ctx)
		// ⛔ CỔNG Ở ĐÂY HẸP HƠN `system_component` MỘT CÁCH CÓ CHỦ Ý — hai bậc,
		// và cả hai bậc đều phải giải thích được:
		//
		//  · KHÔNG đòi allowlist CN. Đòi nó nghĩa là phải nhét apps/web vào
		//    `GRPC_MTLS_SYSTEM_CNS`, mà làm thế là cấp bypass chủ-sở-hữu cho MỌI
		//    lời gọi reap của apps/web — kể cả `me.endSession` của người dùng
		//    thường. Đổi một nút quản trị lấy một lỗ hổng ở đường đông người
		//    nhất là một cuộc đổi chác tồi (orchestrator-deployment.yaml nói
		//    thẳng điều này ngay chỗ khai biến).
		//
		//  · NHƯNG có cổng thì phải qua cổng. `MTLSEnabled && !InCluster` là ca
		//    "server ĐANG kiểm cert mà peer này không trình được cái hợp lệ" —
		//    từ chối. Với `GRPC_MTLS_MODE=off` server không kiểm gì cả và
		//    `user_id` của mọi RPC khác cũng là field client tự khai, nên chặn
		//    riêng nhánh này chỉ làm nút admin chết trong khi đường vòng
		//    `ListSessions("") → reap theo user_id` vẫn mở: bịt cửa sổ, để ngỏ
		//    cửa chính.
		//
		// Hệ quả vận hành cần biết: ở nấc `permissive`, một apps/web CHƯA gắn
		// cert sẽ mất nút này trong khi mọi thứ khác vẫn chạy. Đó là hỏng ỒN ÀO
		// (PermissionDenied kèm lý do), không phải NOT_FOUND câm như trước D15.
		if trust.MTLSEnabled && !trust.InCluster {
			s.log.Warn("từ chối actor=admin_user_id: cổng mTLS đang bật nhưng peer không có client certificate hợp lệ",
				slog.String("admin_user_id", a.AdminUserId),
				slog.String("peer", trust.Addr))
			return lifecycle.ReapActor{}, status.Error(codes.PermissionDenied,
				"actor.admin_user_id chỉ chấp nhận trên kết nối đã xác thực khi mTLS bật; xem GRPC_MTLS_MODE")
		}
		// ⚠ Tới đây server KHÔNG chứng minh được id này thuộc về một admin — nó
		// chỉ chứng minh được người gọi là một peer đã xác thực (hoặc cổng đang
		// tắt). Vai trò là quyết định của BFF (`adminProcedure`), đúng ranh giới
		// tin cậy §2 C3. Khối lý lẽ đầy đủ nằm trong session.proto.
		return lifecycle.ReapActor{AdminUserID: a.AdminUserId}, nil

	default:
		// Comment trong proto nói rõ: thiếu actor thì server trả InvalidArgument.
		// Không có nhánh "đoán hộ" — đó là cả điểm của việc field này bắt buộc.
		return lifecycle.ReapActor{}, status.Error(codes.InvalidArgument,
			"actor bắt buộc: đặt user_id, admin_user_id hoặc system_component")
	}
}

// ready chặn sớm khi orchestrator chạy không có datastore.
//
// Unavailable (không phải Internal): đây là tình trạng cấu hình của server mà
// client thử lại được sau khi ops sửa, và gRPC retry policy đối xử đúng với nó.
func (s *SessionService) ready(rpc string) error {
	if s.lifecycle == nil {
		s.log.Error("RPC bị gọi khi datastore chưa cấu hình", slog.String("rpc", rpc))
		return status.Errorf(codes.Unavailable,
			"%s cần Redis: orchestrator đang chạy không có REDIS_URL/DATABASE_URL", rpc)
	}
	return nil
}
