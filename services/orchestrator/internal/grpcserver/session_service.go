// Package grpcserver hiện thực SessionService định nghĩa ở proto/orchestrator/v1.
package grpcserver

import (
	"context"
	"log/slog"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
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
}

// SessionService là adapter gRPC: nó dịch request/response và KHÔNG chứa logic.
//
// ExtendSession/ReapSession vẫn trả Unimplemented một cách TƯỜNG MINH (B5/B6
// chưa làm) thay vì mock ra một Session giả. Mock sẽ khiến gateway code dựa
// trên hành vi bịa rồi vỡ khi hai RPC đó có thật; Unimplemented làm caller thấy
// ngay chỗ chưa xong.
type SessionService struct {
	orchestratorv1.UnimplementedSessionServiceServer

	log       *slog.Logger
	lifecycle Lifecycle
}

// NewSessionService dựng service. lifecycle có thể là nil khi orchestrator chạy
// mà không có datastore — khi đó cả ba RPC trả Unavailable với lý do rõ ràng,
// chứ KHÔNG panic ở request đầu tiên.
func NewSessionService(log *slog.Logger, lifecycle Lifecycle) *SessionService {
	return &SessionService{log: log, lifecycle: lifecycle}
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
// Hard cap tính từ created_at KHÔNG gia hạn được — xem contract. Chưa hiện thực (B5).
func (s *SessionService) ExtendSession(
	_ context.Context, req *orchestratorv1.ExtendSessionRequest,
) (*orchestratorv1.ExtendSessionResponse, error) {
	s.log.Info("ExtendSession (chưa hiện thực)", slog.String("session_id", req.GetSessionId()))
	return nil, errUnimplemented("ExtendSession", "B5")
}

// ReapSession dọn session hết hạn. Phải idempotent. Chưa hiện thực (B6).
func (s *SessionService) ReapSession(
	_ context.Context, req *orchestratorv1.ReapSessionRequest,
) (*orchestratorv1.ReapSessionResponse, error) {
	s.log.Info("ReapSession (chưa hiện thực)", slog.String("session_id", req.GetSessionId()))
	return nil, errUnimplemented("ReapSession", "B6")
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

func errUnimplemented(rpc, task string) error {
	return status.Errorf(codes.Unimplemented, "%s sẽ được hiện thực ở task %s của phase 1", rpc, task)
}
