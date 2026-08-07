package grpcserver_test

import (
	"context"
	"io"
	"log/slog"
	"testing"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func newService() *grpcserver.SessionService {
	return grpcserver.NewSessionService(slog.New(slog.NewJSONHandler(io.Discard, nil)))
}

// P0 khoá contract chứ chưa khoá hành vi: mọi RPC phải nói rõ "chưa hiện thực"
// thay vì trả Session bịa ra.
func TestAllRPCsReturnUnimplemented(t *testing.T) {
	svc := newService()
	ctx := context.Background()

	calls := map[string]func() error{
		"CreateSession": func() error {
			_, err := svc.CreateSession(ctx, &orchestratorv1.CreateSessionRequest{UserId: "u1"})
			return err
		},
		"ClaimSession": func() error {
			_, err := svc.ClaimSession(ctx, &orchestratorv1.ClaimSessionRequest{SessionId: "s1"})
			return err
		},
		"GetSession": func() error {
			_, err := svc.GetSession(ctx, &orchestratorv1.GetSessionRequest{SessionId: "s1"})
			return err
		},
		"ReapSession": func() error {
			_, err := svc.ReapSession(ctx, &orchestratorv1.ReapSessionRequest{SessionId: "s1"})
			return err
		},
	}

	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			err := call()
			if err == nil {
				t.Fatalf("%s trả nil error — skeleton không được giả vờ thành công", name)
			}
			if got := status.Code(err); got != codes.Unimplemented {
				t.Fatalf("%s trả code %v, muốn %v", name, got, codes.Unimplemented)
			}
		})
	}
}

// Gác việc SessionService thật sự khớp interface sinh từ proto. Nếu ai đó sửa
// .proto mà quên regenerate/cập nhật service, dòng này sẽ không compile.
var _ orchestratorv1.SessionServiceServer = (*grpcserver.SessionService)(nil)
