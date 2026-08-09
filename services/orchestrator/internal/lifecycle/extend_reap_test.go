package lifecycle

import (
	"context"
	"testing"
	"time"

	"google.golang.org/grpc/codes"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// startSession tạo một session sẵn sàng để gia hạn/reap.
func startSession(t *testing.T, h *harness) *orchestratorv1.Session {
	t.Helper()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")
	sess, err := h.svc.Create(context.Background(), createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	return sess
}

func extendReq(sessionID, userID string, seconds int32, expectedRev int64) *orchestratorv1.ExtendSessionRequest {
	return &orchestratorv1.ExtendSessionRequest{
		SessionId:        sessionID,
		UserId:           userID,
		ExtendSeconds:    seconds,
		ExpectedRevision: expectedRev,
	}
}

// ---------------------------------------------------------------- B5 Extend

// TestExtendTangRevisionDungMotMoiLanGhi (AC §Chức năng).
//
// Revision là thứ chặn gateway hồi sinh một session mà reaper vừa reap. Nó tăng
// KHÔNG ĐỀU (nhảy 2, hoặc đứng yên) nghĩa là optimistic lock đang nói dối.
func TestExtendTangRevisionDungMotMoiLanGhi(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	rev := sess.GetRevision()
	for i := 0; i < 3; i++ {
		got, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, 0))
		if err != nil {
			t.Fatalf("Extend lần %d: %v", i, err)
		}
		if got.GetRevision() != rev+1 {
			t.Fatalf("lần %d: revision %d → %d, cần +1", i, rev, got.GetRevision())
		}
		rev = got.GetRevision()
	}
}

// TestExtendVoiRevisionCuTraFailedPrecondition (AC §Chức năng).
func TestExtendVoiRevisionCuTraFailedPrecondition(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)
	stale := sess.GetRevision()

	if _, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, stale)); err != nil {
		t.Fatalf("Extend với revision đúng: %v", err)
	}

	// Revision cũ giờ đã lệch.
	_, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, stale))
	wantCode(t, err, codes.FailedPrecondition)

	// expected_revision = 0 nghĩa là BỎ QUA kiểm (theo proto) — phải vẫn chạy.
	if _, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, 0)); err != nil {
		t.Fatalf("expected_revision=0 phải bỏ qua kiểm, nhận: %v", err)
	}
}

// TestExtendKhongVuotTranCung (AC §Chức năng).
//
// "Gia hạn liên tục quá HARD_CAP → expires_at đứng yên, hard_cap_reached=true".
// Đây là thứ khiến RPC này KHÔNG BAO GIỜ là đường giữ pod sống vĩnh viễn: một
// client bị chiếm quyền spam heartbeat cũng chỉ tới được trần cứng.
func TestExtendKhongVuotTranCung(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	// Xin NHIỀU HƠN HARD_CAP (2h). 90 phút KHÔNG đủ — nó nằm dưới trần, và một
	// test dùng 90 phút sẽ xanh vì lý do sai.
	huge := int32((3 * time.Hour).Seconds())

	got, hardCap, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", huge, 0))
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if !hardCap {
		t.Fatal("hard_cap_reached = false — FE sẽ không báo trước và terminal chết đột ngột")
	}

	capAt := sess.GetCreatedAt().AsTime().Add(2 * time.Hour)
	if !got.GetExpiresAt().AsTime().Equal(capAt) {
		t.Fatalf("expires_at = %s, cần đúng created_at + HARD_CAP = %s",
			got.GetExpiresAt().AsTime(), capAt)
	}

	// Gia hạn tiếp: expires_at phải ĐỨNG YÊN.
	got2, hardCap2, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", huge, 0))
	if err != nil {
		t.Fatalf("Extend lần 2: %v", err)
	}
	if !hardCap2 || !got2.GetExpiresAt().AsTime().Equal(capAt) {
		t.Fatalf("expires_at nhích lên %s — trần cứng không giữ", got2.GetExpiresAt().AsTime())
	}
}

// TestExtendCuaNguoiKhacTraNotFound.
//
// Mã riêng cho "không phải chủ" sẽ XÁC NHẬN session tồn tại và biến RPC này
// thành oracle dò id — cùng lý do GetSession trả NotFound.
func TestExtendCuaNguoiKhacTraNotFound(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	_, _, errOther := h.svc.Extend(ctx, extendReq(sess.GetId(), "userB", 0, 0))
	wantCode(t, errOther, codes.NotFound)

	_, _, errMissing := h.svc.Extend(ctx, extendReq("khongtontai00000000000000000000", "userB", 0, 0))
	wantCode(t, errMissing, codes.NotFound)
}

// TestExtendKhongHoiSinhSessionDaReap.
//
// ⛔ ĐÂY LÀ VẾ THỨ HAI CỦA THỨ REVISION BẢO VỆ. Reaper vừa chuyển session sang
// REAPED thì gateway KHÔNG được đẩy hạn của nó về tương lai — làm thế là hồi
// sinh một session đã chết, và pod của nó thì đã bị xoá.
func TestExtendKhongHoiSinhSessionDaReap(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	if _, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "u1"}); err != nil {
		t.Fatalf("Reap: %v", err)
	}

	_, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, 0))
	wantCode(t, err, codes.FailedPrecondition)
}

// TestExtendCapNhatTTLCuaKey — TTL của key phải đi theo expiresAt, nếu không
// hash biến mất trước hạn (hoặc sống quá hạn) và reaper tầng 1 nghe nhầm lúc.
func TestExtendCapNhatTTLCuaKey(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	if _, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 600, 0)); err != nil {
		t.Fatalf("Extend: %v", err)
	}

	sessionKey, _ := rediskeys.Session(sess.GetId())
	ttl, err := h.rdb.TTL(ctx, sessionKey).Result()
	if err != nil {
		t.Fatalf("TTL: %v", err)
	}
	if ttl <= 0 || ttl > 601*time.Second {
		t.Fatalf("TTL session = %s, cần ~600s — TTL không đi theo expiresAt", ttl)
	}

	podPtrKey, _ := rediskeys.SessionPod(sess.GetId())
	ptrTTL, err := h.rdb.TTL(ctx, podPtrKey).Result()
	if err != nil {
		t.Fatalf("TTL con trỏ: %v", err)
	}
	if ptrTTL <= ttl {
		t.Fatalf("TTL con trỏ (%s) phải LỚN HƠN TTL hash (%s) — bằng nhau là reaper tầng 1 mù",
			ptrTTL, ttl)
	}
}

// ---------------------------------------------------------------- B6 Reap

// TestReapGoiHaiLanDeuOK (AC §Chức năng).
func TestReapGoiHaiLanDeuOK(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	first, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "u1"})
	if err != nil {
		t.Fatalf("Reap lần 1: %v", err)
	}
	if first.GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_REAPED {
		t.Fatalf("status = %v, cần REAPED", first.GetStatus())
	}

	second, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "u1"})
	if err != nil {
		t.Fatalf("Reap lần 2 phải OK (idempotent), nhận: %v", err)
	}

	// Lần hai KHÔNG được tăng revision: làm thế khiến một gateway đang cầm
	// revision đúng bỗng thấy lệch và tưởng có ai vừa ghi.
	if second.GetRevision() != first.GetRevision() {
		t.Fatalf("revision đổi giữa hai lần reap: %d → %d",
			first.GetRevision(), second.GetRevision())
	}
}

// TestReapCuaNguoiKhacBiTuChoiVaPodVanSONG (AC §Chức năng).
//
// ⛔ session_id KHÔNG phải bí mật (nó nằm trong URL /ws/session/{id}). Nếu reap
// không kiểm chủ sở hữu thì "biết id = xoá được session của người khác" — chính
// lý do proto BẮT BUỘC field actor thay vì để nó optional.
func TestReapCuaNguoiKhacBiTuChoiVaPodVanSong(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	_, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "userB"})
	wantCode(t, err, codes.NotFound)

	if got := h.pods.deletedNames(); len(got) != 0 {
		t.Fatalf("pod %v ĐÃ BỊ XOÁ dù reap bị từ chối — kiểm authz xảy ra sau khi đã xoá?", got)
	}

	// Và session vẫn sống nguyên: chủ thật vẫn gia hạn được.
	if _, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, 0)); err != nil {
		t.Fatalf("session của u1 hỏng sau một lần reap bị từ chối: %v", err)
	}
}

// TestReapXoaPodVaDonIndex.
func TestReapXoaPodVaDonIndex(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)
	podName := sess.GetPodName()

	if _, err := h.svc.Reap(ctx, sess.GetId(), ReapActor{UserID: "u1"}); err != nil {
		t.Fatalf("Reap: %v", err)
	}

	if got := h.pods.deletedNames(); len(got) != 1 || got[0] != podName {
		t.Fatalf("xoá %v, cần [%s]", got, podName)
	}
	podKey, _ := rediskeys.Pod(podName)
	if n, _ := h.rdb.Exists(ctx, podKey).Result(); n != 0 {
		t.Fatal("hash pod:{name} còn sau reap")
	}
	claimed, _ := h.rdb.LRange(ctx, rediskeys.PoolClaimed, 0, -1).Result()
	for _, n := range claimed {
		if n == podName {
			t.Fatal("pod vẫn nằm trong pool:claimed — reaper sẽ coi nó là rác mãi")
		}
	}
	// Con trỏ pod bị DEL: pod đã xoá rồi nên để lại chỉ khiến tầng 1 làm một
	// vòng thừa khi hash hết hạn.
	ptrKey, _ := rediskeys.SessionPod(sess.GetId())
	if n, _ := h.rdb.Exists(ctx, ptrKey).Result(); n != 0 {
		t.Fatal("con trỏ session:{id}:pod còn sau reap")
	}
}

// TestReapSystemKhongCanChuSoHuu — reaper nội bộ reap được session của bất kỳ
// ai. Đó là lý do nhánh `system_component` phải được xác thực ở tầng vận chuyển.
func TestReapSystemKhongCanChuSoHuu(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	if err := h.svc.ReapSystem(ctx, sess.GetId(), "reaper-ttl"); err != nil {
		t.Fatalf("ReapSystem: %v", err)
	}
	if got := h.pods.deletedNames(); len(got) != 1 {
		t.Fatalf("xoá %v, cần 1 pod", got)
	}

	// Gọi lại trên session đã biến mất hẳn KHÔNG phải lỗi — đó là kết quả mong
	// muốn của reaper, và trả lỗi ở đây sẽ làm sweep log ERROR mỗi chu kỳ.
	if err := h.svc.ReapSystem(ctx, "khongtontai00000000000000000000", "reaper-ttl"); err != nil {
		t.Fatalf("ReapSystem trên session không tồn tại phải là no-op, nhận: %v", err)
	}
}

// TestMarkFailedChiDoiSessionDangSong.
func TestMarkFailedChiDoiSessionDangSong(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	if err := h.svc.MarkFailed(ctx, sess.GetId(), "pod biến mất"); err != nil {
		t.Fatalf("MarkFailed: %v", err)
	}
	got, err := h.svc.Get(ctx, &orchestratorv1.GetSessionRequest{SessionId: sess.GetId(), UserId: "u1"})
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_FAILED {
		t.Fatalf("status = %v, cần FAILED", got.GetStatus())
	}
	revAfterFail := got.GetRevision()

	// Gọi lại: KHÔNG được ghi thêm và KHÔNG được tăng revision.
	if err := h.svc.MarkFailed(ctx, sess.GetId(), "lần hai"); err != nil {
		t.Fatalf("MarkFailed lần 2: %v", err)
	}
	got2, _ := h.svc.Get(ctx, &orchestratorv1.GetSessionRequest{SessionId: sess.GetId(), UserId: "u1"})
	if got2.GetRevision() != revAfterFail {
		t.Fatalf("revision tăng vô cớ: %d → %d — gateway đang cầm revision đúng sẽ tưởng có người vừa ghi",
			revAfterFail, got2.GetRevision())
	}
}
