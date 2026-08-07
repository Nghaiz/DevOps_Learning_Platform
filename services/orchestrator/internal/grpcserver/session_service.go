// Package grpcserver hiện thực SessionService định nghĩa ở proto/orchestrator/v1.
package grpcserver

import (
	"context"
	"log/slog"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// SessionService là skeleton P0: contract đã khoá, hành vi thì chưa.
//
// Mọi RPC trả codes.Unimplemented một cách TƯỜNG MINH thay vì mock ra Session giả.
// Mock sẽ khiến apps/web code dựa trên hành vi bịa, rồi vỡ khi P1 nối K8s thật;
// Unimplemented làm caller thấy ngay chỗ chưa xong.
type SessionService struct {
	orchestratorv1.UnimplementedSessionServiceServer

	log *slog.Logger
}

// NewSessionService dựng service với logger cho trước.
func NewSessionService(log *slog.Logger) *SessionService {
	return &SessionService{log: log}
}

// CreateSession cấp một session mới. Chưa hiện thực ở P0.
func (s *SessionService) CreateSession(
	_ context.Context, req *orchestratorv1.CreateSessionRequest,
) (*orchestratorv1.CreateSessionResponse, error) {
	s.log.Info("CreateSession (chưa hiện thực)", slog.String("user_id", req.GetUserId()))
	return nil, errUnimplemented("CreateSession")
}

// ClaimSession gắn một session WARM trong pool cho user. Chưa hiện thực ở P0.
func (s *SessionService) ClaimSession(
	_ context.Context, req *orchestratorv1.ClaimSessionRequest,
) (*orchestratorv1.ClaimSessionResponse, error) {
	s.log.Info("ClaimSession (chưa hiện thực)", slog.String("session_id", req.GetSessionId()))
	return nil, errUnimplemented("ClaimSession")
}

// GetSession trả trạng thái session. Chưa hiện thực ở P0.
func (s *SessionService) GetSession(
	_ context.Context, req *orchestratorv1.GetSessionRequest,
) (*orchestratorv1.GetSessionResponse, error) {
	s.log.Info("GetSession (chưa hiện thực)", slog.String("session_id", req.GetSessionId()))
	return nil, errUnimplemented("GetSession")
}

// ReapSession dọn session hết hạn. Phải idempotent. Chưa hiện thực ở P0.
func (s *SessionService) ReapSession(
	_ context.Context, req *orchestratorv1.ReapSessionRequest,
) (*orchestratorv1.ReapSessionResponse, error) {
	s.log.Info("ReapSession (chưa hiện thực)", slog.String("session_id", req.GetSessionId()))
	return nil, errUnimplemented("ReapSession")
}

func errUnimplemented(rpc string) error {
	return status.Errorf(codes.Unimplemented, "%s sẽ được hiện thực ở P1 (sandbox session engine)", rpc)
}
