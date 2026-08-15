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

// TestExtendKhongBaoGioKeoLuiHan (H-3).
//
// ⛔ CÔNG THỨC `min(now + extend, createdAt + hardCap)` MỘT MÌNH KÉO HẠN VỀ QUÁ
// KHỨ. Đo được trước khi vá: session tạo với SESSION_TTL=1h, một heartbeat với
// EXTEND_DEFAULT=300s hạ TTL từ 1h xuống 5m và đẩy `expires_at` LÙI 55 phút.
// Ba hậu quả: (1) AC "đóng WS → nối lại trong TTL vào đúng pod cũ" gãy vì cửa
// sổ nối lại thành EXTEND_DEFAULT; (2) BFF mint sandbox token với
// `exp = expires_at` nên token ĐÃ CẤP sống lâu hơn session, và FE thấy đồng hồ
// đếm ngược nhảy giật lùi; (3) TTL hash bị rút ngắn ⇒ reaper tầng 1 bắn sớm.
func TestExtendKhongBaoGioKeoLuiHan(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	before := sess.GetExpiresAt().AsTime()
	sessionKey, _ := rediskeys.Session(sess.GetId())
	ttlBefore, err := h.rdb.TTL(ctx, sessionKey).Result()
	if err != nil {
		t.Fatalf("TTL: %v", err)
	}

	// Xin THÊM 600s — ngắn hơn nhiều so với 1h còn lại.
	got, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 600, 0))
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}

	after := got.GetExpiresAt().AsTime()
	if after.Before(before) {
		t.Fatalf("expires_at ĐI LÙI: %s → %s (lùi %s). Token đã cấp sẽ sống lâu hơn session.",
			before, after, before.Sub(after))
	}
	ttlAfter, err := h.rdb.TTL(ctx, sessionKey).Result()
	if err != nil {
		t.Fatalf("TTL sau: %v", err)
	}
	if ttlAfter < ttlBefore-2*time.Second {
		t.Fatalf("TTL bị RÚT NGẮN %s → %s — reaper tầng 1 sẽ bắn sớm", ttlBefore, ttlAfter)
	}

	// Và con trỏ pod vẫn phải sống LÂU HƠN hash.
	podPtrKey, _ := rediskeys.SessionPod(sess.GetId())
	ptrTTL, err := h.rdb.TTL(ctx, podPtrKey).Result()
	if err != nil {
		t.Fatalf("TTL con trỏ: %v", err)
	}
	if ptrTTL <= ttlAfter {
		t.Fatalf("TTL con trỏ (%s) phải LỚN HƠN TTL hash (%s) — bằng nhau là reaper tầng 1 mù",
			ptrTTL, ttlAfter)
	}
}

// TestExtendVANDayDuocHanVeTuongLai — vế đối xứng của forward-only: khi khoảng
// xin THẬT SỰ xa hơn hạn hiện tại thì hạn phải nhích lên. Không có ca này thì
// một hiện thực "không bao giờ đổi expiresAt" cũng qua được test trên.
func TestExtendVanDayDuocHanVeTuongLai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	before := sess.GetExpiresAt().AsTime()

	// 90 phút > 1h còn lại, và vẫn dưới HARD_CAP 2h.
	got, hardCap, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", int32((90*time.Minute).Seconds()), 0))
	if err != nil {
		t.Fatalf("Extend: %v", err)
	}
	if hardCap {
		t.Fatal("hard_cap_reached=true cho một lần gia hạn còn dưới trần")
	}
	after := got.GetExpiresAt().AsTime()
	if !after.After(before) {
		t.Fatalf("expires_at đứng yên %s → %s — RPC này phải ĐẨY ĐƯỢC hạn về phía trước", before, after)
	}

	sessionKey, _ := rediskeys.Session(sess.GetId())
	ttl, _ := h.rdb.TTL(ctx, sessionKey).Result()
	if ttl < 80*time.Minute {
		t.Fatalf("TTL = %s, cần ~90ph — TTL không đi theo expiresAt", ttl)
	}
}

// TestExtendThieuCreatedAtLaLoiTrangThaiKhongPhaiHaTang (M-2).
//
// Gộp nó vào Unavailable làm retry policy của gRPC thử lại VĨNH VIỄN một request
// không bao giờ thành công, và dashboard đọc nó như hạ tầng chết.
func TestExtendThieuCreatedAtLaLoiTrangThai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)

	sessionKey, _ := rediskeys.Session(sess.GetId())
	if err := h.rdb.HDel(ctx, sessionKey, rediskeys.FieldCreatedAt).Err(); err != nil {
		t.Fatalf("HDEL: %v", err)
	}

	_, _, err := h.svc.Extend(ctx, extendReq(sess.GetId(), "u1", 0, 0))
	wantCode(t, err, codes.FailedPrecondition)
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

// TestReapExpiredDonPodDuSessionDaBienMat (H-4).
//
// Đây là đường của reaper cho session hết hạn tự nhiên. `ReapSystem` cũ đã bị
// XOÁ vì nó không có call-site sản phẩm nào — đúng lỗi mà review PR trước tìm
// ra với `ClaimIdempotent`, và là chỗ khiến `expired` không bao giờ được audit.
func TestReapExpiredDonPodDuSessionDaBienMat(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)
	podName := sess.GetPodName()

	// Mô phỏng hết hạn: hash session biến mất, hash pod còn (TTL của nó là -1).
	sessionKey, _ := rediskeys.Session(sess.GetId())
	if err := h.rdb.Del(ctx, sessionKey).Err(); err != nil {
		t.Fatalf("DEL: %v", err)
	}

	if err := h.svc.ReapExpired(ctx, sess.GetId(), podName); err != nil {
		t.Fatalf("ReapExpired: %v", err)
	}

	if got := h.pods.deletedNames(); len(got) != 1 || got[0] != podName {
		t.Fatalf("xoá %v, cần [%s]", got, podName)
	}
	podKey, _ := rediskeys.Pod(podName)
	if n, _ := h.rdb.Exists(ctx, podKey).Result(); n != 0 {
		t.Fatal("hash pod:{name} còn — TTL của nó là -1, không ai dọn thì nó sống mãi")
	}
	claimed, _ := h.rdb.LRange(ctx, rediskeys.PoolClaimed, 0, -1).Result()
	for _, n := range claimed {
		if n == podName {
			t.Fatal("pod vẫn nằm trong pool:claimed")
		}
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

// TestMarkFailedDonIndexPoolCuaSessionMa (P3/3.C, đo được trên cụm 2026-08-15).
//
// Trước bản vá, `MarkFailed` chỉ đổi status. Tên pod ở lại `pool:claimed` và hash
// `pod:{name}` ở lại, mà KHÔNG tầng nào của reaper nhặt được: tầng 2b bỏ qua mọi
// status cuối, tầng 2c chỉ dọn khi `EXISTS session:{id}` == 0 — mà hash FAILED
// vẫn còn tới hết TTL. Đo trên cụm: `pool:claimed` giữ 6 tên trong khi namespace
// chỉ có 1 pod thật, tức `dlp_pool_claimed_size` sai gấp 6 lần suốt tới một giờ.
//
// ⛔ VẾ THỨ HAI MỚI LÀ VẾ CÓ GIÁ TRỊ. Một hàm dọn SẠCH `pool:claimed` cũng làm
// vế thứ nhất xanh y hệt. Session B — vẫn CLAIMED, pod vẫn sống — phải còn
// nguyên sau lượt dọn, nếu không thì thứ vừa viết là một cái chổi quét bừa chứ
// không phải một bản vá nhắm đúng session ma.
func TestMarkFailedDonIndexPoolCuaSessionMa(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	ghost := startSession(t, h) // dùng sandbox-warm01
	alive, err := h.svc.Create(ctx, createReq("u2", "k2"))
	if err != nil {
		t.Fatalf("Create session đối chứng: %v", err)
	}
	ghostPod, alivePod := ghost.GetPodName(), alive.GetPodName()
	if ghostPod == alivePod {
		t.Fatalf("hai session dùng chung pod %q — cảnh dựng sai, đối chứng vô nghĩa", ghostPod)
	}

	if err := h.svc.MarkFailed(ctx, ghost.GetId(), "pod biến mất khỏi cluster"); err != nil {
		t.Fatalf("MarkFailed: %v", err)
	}

	// ── Vế 1: dấu vết của session ma đã sạch ──────────────────────────────────
	claimed, _ := h.rdb.LRange(ctx, rediskeys.PoolClaimed, 0, -1).Result()
	for _, n := range claimed {
		if n == ghostPod {
			t.Fatal("pod của session FAILED vẫn nằm trong pool:claimed — dlp_pool_claimed_size sẽ đếm một pod không tồn tại")
		}
	}
	ghostPodKey, _ := rediskeys.Pod(ghostPod)
	if n, _ := h.rdb.Exists(ctx, ghostPodKey).Result(); n != 0 {
		t.Fatal("hash pod:{name} của session FAILED còn — TTL của nó là -1, không ai dọn thì nó sống mãi")
	}

	// Hash session PHẢI còn: FE đọc lý do phiên chết ở đây. Đây là ranh giới giữa
	// "dọn index" và "xoá session" — vượt qua nó là đổi hợp đồng với FE.
	if got, err := h.svc.Get(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: ghost.GetId(), UserId: "u1",
	}); err != nil {
		t.Fatalf("Get sau MarkFailed: %v — FE mất đường đọc lý do phiên chết", err)
	} else if got.GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_FAILED {
		t.Fatalf("status = %v, cần FAILED", got.GetStatus())
	}

	// ── Vế 2 (đối chứng âm): session còn sống KHÔNG bị đụng tới ───────────────
	var aliveStillClaimed bool
	for _, n := range claimed {
		if n == alivePod {
			aliveStillClaimed = true
		}
	}
	if !aliveStillClaimed {
		t.Fatalf("pod %q của session CLAIMED bị gỡ khỏi pool:claimed — bản vá đang quét bừa", alivePod)
	}
	alivePodKey, _ := rediskeys.Pod(alivePod)
	if n, _ := h.rdb.Exists(ctx, alivePodKey).Result(); n != 1 {
		t.Fatalf("hash pod:{name} của session CLAIMED bị xoá — bản vá đang quét bừa")
	}
	for _, n := range h.pods.deletedNames() {
		if n == alivePod {
			t.Fatalf("pod %q của session CLAIMED bị XOÁ khỏi cụm — đây là mất dữ liệu người dùng, không phải dọn rác", alivePod)
		}
	}
	if got := h.pods.deletedNames(); len(got) != 1 || got[0] != ghostPod {
		t.Fatalf("xoá %v, cần đúng [%s]", got, ghostPod)
	}

	// Con trỏ phải đi cùng hash pod: để lại thì đúng mốc TTL, tầng 1 sẽ gọi
	// ReapExpired trên một session đã chốt, không đọc được userId/tier (hash pod
	// vừa xoá) và log WARN "audit thủng" cho một việc bình thường.
	ghostPtr, _ := rediskeys.SessionPod(ghost.GetId())
	if n, _ := h.rdb.Exists(ctx, ghostPtr).Result(); n != 0 {
		t.Fatal("con trỏ session:{id}:pod của session ma còn — tầng 1 sẽ bắn cảnh báo sai lúc TTL rụng")
	}
}

// TestMarkFailedDonLaiSauKhiChetGiuaChung.
//
// Ca crash-giữa-chừng: script Lua đã HSET FAILED nhưng tiến trình chết trước khi
// dọn index (rollout, OOM, SIGKILL trong lúc audit chờ Postgres). Trạng thái còn
// lại là ĐÚNG chỗ rò mà bản vá này sinh ra để vá.
//
// ⛔ VÀ KHÔNG TẦNG NÀO CỦA REAPER NHẶT ĐƯỢC NÓ: 2b bỏ qua status cuối và không
// bao giờ thăm lại; 2c thấy `EXISTS session:{id}` == 1 nên coi là session sống;
// 2a đòi hash pod VẮNG mà hash này còn; tầng 4 chỉ quét `pool:free`. Nên đường
// tự lành duy nhất là chính `MarkFailed` chịu chạy lại — tức lời gọi thứ hai
// PHẢI dọn, dù script trả `changed == 0`.
func TestMarkFailedDonLaiSauKhiChetGiuaChung(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	sess := startSession(t, h)
	podName := sess.GetPodName()

	// Lượt 1 — chốt FAILED và dọn.
	if err := h.svc.MarkFailed(ctx, sess.GetId(), "pod biến mất"); err != nil {
		t.Fatalf("MarkFailed lượt 1: %v", err)
	}

	// Dựng lại đúng cảnh "chết giữa chừng": status đã FAILED, index thì chưa dọn.
	if err := h.rdb.RPush(ctx, rediskeys.PoolClaimed, podName).Err(); err != nil {
		t.Fatalf("dựng lại index: %v", err)
	}
	podKey, _ := rediskeys.Pod(podName)
	if err := h.rdb.HSet(ctx, podKey, "sessionId", sess.GetId()).Err(); err != nil {
		t.Fatalf("dựng lại hash pod: %v", err)
	}

	// Lượt 2 — script trả changed == 0 (đã ở trạng thái cuối). Vẫn PHẢI dọn.
	if err := h.svc.MarkFailed(ctx, sess.GetId(), "lượt hai sau crash"); err != nil {
		t.Fatalf("MarkFailed lượt 2: %v", err)
	}

	claimed, _ := h.rdb.LRange(ctx, rediskeys.PoolClaimed, 0, -1).Result()
	for _, n := range claimed {
		if n == podName {
			t.Fatal("lượt hai KHÔNG dọn: chỗ rò sống lại sau một lần crash, và không tầng nào của reaper nhặt được nó")
		}
	}
	if n, _ := h.rdb.Exists(ctx, podKey).Result(); n != 0 {
		t.Fatal("lượt hai KHÔNG xoá hash pod dựng lại")
	}
}
