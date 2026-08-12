package grpcserver_test

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/grpcserver"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/lifecycle"
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

	hardCapReached bool

	gotCreate *orchestratorv1.CreateSessionRequest
	gotClaim  *orchestratorv1.ClaimSessionRequest
	gotGet    *orchestratorv1.GetSessionRequest
	gotExtend *orchestratorv1.ExtendSessionRequest
	gotReapID string
	gotActor  lifecycle.ReapActor
}

func (f *fakeLifecycle) Extend(
	_ context.Context, req *orchestratorv1.ExtendSessionRequest,
) (*orchestratorv1.Session, bool, error) {
	f.gotExtend = req
	return f.sess, f.hardCapReached, f.err
}

func (f *fakeLifecycle) Reap(
	_ context.Context, sessionID string, actor lifecycle.ReapActor,
) (*orchestratorv1.Session, error) {
	f.gotReapID = sessionID
	f.gotActor = actor
	return f.sess, f.err
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

// TestReapActorPhaiDuocSERVERXacMinh (B0′ / R25).
//
// ⛔ `oneof actor` trong proto là thứ client TUYÊN BỐ. Nếu server tin nó, thì
// bất kỳ ai gọi được RPC cũng tự phong mình là `system_component` — và
// session_id KHÔNG phải bí mật (nó nằm trong URL /ws/session/{id}), nên
// "biết id = reap được session của người khác". Đây chính là lý do proto BẮT
// BUỘC field này thay vì để nó optional.
func TestReapActorPhaiDuocSERVERXacMinh(t *testing.T) {
	sess := &orchestratorv1.Session{Id: "s1"}

	t.Run("system_component từ peer không chứng minh được là in-cluster → PermissionDenied", func(t *testing.T) {
		fake := &fakeLifecycle{sess: sess}
		svc := grpcserver.NewSessionService(discardLogger(), fake, nil)

		// Không interceptor ⇒ PeerTrust rỗng ⇒ InCluster=false. Đây ĐÚNG là
		// trạng thái khi GRPC_REQUIRE_MTLS=false, tức mặc định hôm nay.
		_, err := svc.ReapSession(context.Background(), &orchestratorv1.ReapSessionRequest{
			SessionId: "s1",
			Actor:     &orchestratorv1.ReapSessionRequest_SystemComponent{SystemComponent: "reaper"},
		})
		if got := status.Code(err); got != codes.PermissionDenied {
			t.Fatalf("code = %v, cần PermissionDenied — nếu qua được thì ai cũng reap được session của người khác", got)
		}
		if fake.gotReapID != "" {
			t.Fatal("lifecycle.Reap ĐÃ được gọi — việc từ chối phải xảy ra TRƯỚC khi chạm tầng dưới")
		}
	})

	t.Run("thiếu actor → InvalidArgument", func(t *testing.T) {
		fake := &fakeLifecycle{sess: sess}
		svc := grpcserver.NewSessionService(discardLogger(), fake, nil)
		_, err := svc.ReapSession(context.Background(), &orchestratorv1.ReapSessionRequest{SessionId: "s1"})
		if got := status.Code(err); got != codes.InvalidArgument {
			t.Fatalf("code = %v, cần InvalidArgument", got)
		}
		if fake.gotReapID != "" {
			t.Fatal("lifecycle.Reap được gọi dù không có actor")
		}
	})

	t.Run("user_id đi qua nguyên vẹn xuống lifecycle", func(t *testing.T) {
		fake := &fakeLifecycle{sess: sess}
		svc := grpcserver.NewSessionService(discardLogger(), fake, nil)
		_, err := svc.ReapSession(context.Background(), &orchestratorv1.ReapSessionRequest{
			SessionId: "s1",
			Actor:     &orchestratorv1.ReapSessionRequest_UserId{UserId: "userA"},
		})
		if err != nil {
			t.Fatalf("ReapSession: %v", err)
		}
		if fake.gotActor.UserID != "userA" || fake.gotActor.System {
			t.Fatalf("actor = %+v, cần {UserID:userA, System:false}", fake.gotActor)
		}
	})
}

// TestExtendBocDungCoHardCap — cờ này là thứ FE dùng để báo trước "phiên sắp
// hết hạn" thay vì để terminal chết đột ngột. Nuốt nó ở tầng adapter là làm
// người dùng mất cảnh báo mà không test nào ở tầng dưới thấy được.
func TestExtendBocDungCoHardCap(t *testing.T) {
	fake := &fakeLifecycle{sess: &orchestratorv1.Session{Id: "s1"}, hardCapReached: true}
	svc := grpcserver.NewSessionService(discardLogger(), fake, nil)

	resp, err := svc.ExtendSession(context.Background(), &orchestratorv1.ExtendSessionRequest{
		SessionId: "s1", UserId: "u1",
	})
	if err != nil {
		t.Fatalf("ExtendSession: %v", err)
	}
	if !resp.GetHardCapReached() {
		t.Fatal("hard_cap_reached bị nuốt ở tầng adapter")
	}
}

// TestKhongCoDatastoreThiUnavailableChuKhongPanic.
//
// orchestrator chạy được mà không có REDIS_URL (health probe xanh, /metrics
// chạy). Ba RPC session khi đó phải trả Unavailable kèm lý do — nil pointer
// dereference ở đây là pod chết ở request đầu tiên, đúng lúc khó chẩn đoán nhất.
func TestKhongCoDatastoreThiUnavailableChuKhongPanic(t *testing.T) {
	svc := grpcserver.NewSessionService(discardLogger(), nil, nil)
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
	svc := grpcserver.NewSessionService(discardLogger(), fake, nil)
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
	svc := grpcserver.NewSessionService(discardLogger(), &fakeLifecycle{err: want}, nil)

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
