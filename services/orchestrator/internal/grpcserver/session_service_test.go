package grpcserver_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func discardLogger() *slog.Logger {
	return slog.New(slog.NewJSONHandler(io.Discard, nil))
}

// fakeLifecycle ghi lại request nhận được và trả về thứ được đặt sẵn.
type fakeLifecycle struct {
	sess *orchestratorv1.Session
	err  error

	gotCreate *orchestratorv1.CreateSessionRequest
	gotClaim  *orchestratorv1.ClaimSessionRequest
	gotGet    *orchestratorv1.GetSessionRequest
}

func (f *fakeLifecycle) Create(
	_ context.Context, req *orchestratorv1.CreateSessionRequest,
) (*orchestratorv1.Session, error) {
	f.gotCreate = req
	return f.sess, f.err
}

func (f *fakeLifecycle) Claim(
	_ context.Context, req *orchestratorv1.ClaimSessionRequest,
) (*orchestratorv1.Session, error) {
	f.gotClaim = req
	return f.sess, f.err
}

func (f *fakeLifecycle) Get(
	_ context.Context, req *orchestratorv1.GetSessionRequest,
) (*orchestratorv1.Session, error) {
	f.gotGet = req
	return f.sess, f.err
}

// TestB5B6ChuaHienThucVanNoiRo — ExtendSession/ReapSession phải trả
// Unimplemented TƯỜNG MINH, không được mock ra Session giả.
//
// Mock sẽ khiến lane gateway code dựa trên hành vi bịa rồi vỡ khi hai RPC đó có
// thật; Unimplemented làm caller thấy ngay chỗ chưa xong.
func TestB5B6ChuaHienThucVanNoiRo(t *testing.T) {
	svc := grpcserver.NewSessionService(discardLogger(), &fakeLifecycle{})
	ctx := context.Background()

	calls := map[string]func() error{
		"ExtendSession": func() error {
			_, err := svc.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{SessionId: "s1"})
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

// TestKhongCoDatastoreThiUnavailableChuKhongPanic.
//
// orchestrator chạy được mà không có REDIS_URL (health probe xanh, /metrics
// chạy). Ba RPC session khi đó phải trả Unavailable kèm lý do — nil pointer
// dereference ở đây là pod chết ở request đầu tiên, đúng lúc khó chẩn đoán nhất.
func TestKhongCoDatastoreThiUnavailableChuKhongPanic(t *testing.T) {
	svc := grpcserver.NewSessionService(discardLogger(), nil)
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
	}

	for name, call := range calls {
		t.Run(name, func(t *testing.T) {
			err := call()
			if got := status.Code(err); got != codes.Unavailable {
				t.Fatalf("%s trả code %v, muốn %v", name, got, codes.Unavailable)
			}
		})
	}
}

// TestAdapterKhongDoiRequestVaBocResponse — tầng này chỉ được định tuyến.
func TestAdapterKhongDoiRequestVaBocResponse(t *testing.T) {
	want := &orchestratorv1.Session{Id: "sess-1", UserId: "u1"}
	fake := &fakeLifecycle{sess: want}
	svc := grpcserver.NewSessionService(discardLogger(), fake)
	ctx := context.Background()

	createReq := &orchestratorv1.CreateSessionRequest{
		UserId: "u1", Tier: orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX, IdempotencyKey: "k1",
	}
	createResp, err := svc.CreateSession(ctx, createReq)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if fake.gotCreate != createReq {
		t.Error("CreateSession không truyền nguyên request xuống lifecycle")
	}
	if createResp.GetSession() != want {
		t.Error("CreateSession không bọc đúng Session vào response")
	}

	claimResp, err := svc.ClaimSession(ctx, &orchestratorv1.ClaimSessionRequest{SessionId: "sess-1", UserId: "u1"})
	if err != nil || claimResp.GetSession() != want {
		t.Errorf("ClaimSession: err=%v session=%v", err, claimResp.GetSession())
	}

	getResp, err := svc.GetSession(ctx, &orchestratorv1.GetSessionRequest{SessionId: "sess-1", UserId: "u1"})
	if err != nil || getResp.GetSession() != want {
		t.Errorf("GetSession: err=%v session=%v", err, getResp.GetSession())
	}
}

// TestLoiCuaLifecycleDiRaNguyenVen — mã lỗi LÀ contract (NotFound vs
// PermissionDenied là quyết định chống-oracle). Adapter bọc lại nó thành mã
// khác sẽ phá đúng tính chất đó mà không test nào ở tầng dưới thấy được.
func TestLoiCuaLifecycleDiRaNguyenVen(t *testing.T) {
	want := status.Error(codes.NotFound, "session không tồn tại")
	svc := grpcserver.NewSessionService(discardLogger(), &fakeLifecycle{err: want})

	_, err := svc.GetSession(context.Background(), &orchestratorv1.GetSessionRequest{SessionId: "s", UserId: "u"})
	if !errors.Is(err, want) {
		t.Fatalf("lỗi bị đổi: %v", err)
	}
	if got := status.Code(err); got != codes.NotFound {
		t.Fatalf("code = %v, muốn NotFound", got)
	}
}

// Gác việc SessionService thật sự khớp interface sinh từ proto. Nếu ai đó sửa
// .proto mà quên regenerate/cập nhật service, dòng này sẽ không compile.
var _ orchestratorv1.SessionServiceServer = (*grpcserver.SessionService)(nil)
