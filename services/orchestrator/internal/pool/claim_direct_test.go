package pool

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// directTestParams — testParams() (claim_test.go) mang một Profile RỖNG có chủ
// ý (đường mặc định không biết gì về profile). ClaimDirect tồn tại CHỈ CHO
// đường profiled, nên mọi test ở đây cần Profile khác rỗng để không lặng lẽ
// kiểm nhầm đường mặc định.
func directTestParams(sessionID string) ClaimParams {
	p := testParams(sessionID)
	p.Profile = "k8s"
	return p
}

// TestClaimDirectWritesFullState kiểm claim_direct.lua ghi TRỌN bộ state cho
// một pod ĐÃ TẠO SẴN (mirror TestClaimWritesFullState của claim.lua, cộng field
// "profile" mà chỉ nhánh này ghi — xem lifecycle/session.go fieldProfile).
func TestClaimDirectWritesFullState(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	const podName = "sandbox-direct-full"
	p := directTestParams("sess-direct-full")

	if err := ClaimDirect(ctx, rdb, podName, p); err != nil {
		t.Fatalf("ClaimDirect: %v", err)
	}

	sessionKey, _ := rediskeys.Session(p.SessionID)
	h := rdb.HGetAll(ctx, sessionKey).Val()
	want := map[string]string{
		rediskeys.FieldUserID:       p.UserID,
		rediskeys.FieldPodName:      podName,
		rediskeys.FieldNamespace:    p.Namespace,
		rediskeys.FieldStatus:       "CLAIMED",
		rediskeys.FieldTier:         p.Tier,
		rediskeys.FieldCreatedAt:    fmt.Sprint(p.NowUnix),
		rediskeys.FieldExpiresAt:    fmt.Sprint(p.ExpiresAtUnix),
		rediskeys.FieldRevision:     "1",
		rediskeys.FieldLastActiveAt: fmt.Sprint(p.NowUnix),
		"profile":                   p.Profile,
	}
	for k, v := range want {
		if h[k] != v {
			t.Errorf("session hash field %q = %q, muốn %q", k, h[k], v)
		}
	}
	if len(h) != len(want) {
		t.Errorf("session hash có %d field, muốn %d — field lạ hoặc thiếu: %v", len(h), len(want), h)
	}

	podHashKey, _ := rediskeys.Pod(podName)
	ph := rdb.HGetAll(ctx, podHashKey).Val()
	if ph["state"] != "claimed" || ph["sessionId"] != p.SessionID {
		t.Errorf("pod hash = %v, muốn state=claimed sessionId=%s", ph, p.SessionID)
	}

	sessionPodKey, _ := rediskeys.SessionPod(p.SessionID)
	if got := rdb.Get(ctx, sessionPodKey).Val(); got != podName {
		t.Errorf("session:{id}:pod = %q, muốn %q", got, podName)
	}

	if ttl := rdb.TTL(ctx, sessionKey).Val(); ttl <= 0 || ttl > time.Duration(p.TTLSeconds)*time.Second {
		t.Errorf("TTL session = %v, muốn trong (0, %ds]", ttl, p.TTLSeconds)
	}
	ttlPtr := rdb.TTL(ctx, sessionPodKey).Val()
	if ttlPtr <= time.Duration(p.TTLSeconds)*time.Second {
		t.Errorf("TTL session:{id}:pod = %v, phải LỚN HƠN TTL hash (%ds)", ttlPtr, p.TTLSeconds)
	}
}

// TestClaimDirectPutsPodInPoolClaimedForTang2c — chứng minh đúng lý do
// claim_direct.lua thêm RPUSH: KHÔNG có bước này, pod của một session profiled
// hết hạn đúng lúc reaper tầng 1 lỡ event sẽ không tầng sweep nào thấy được nó
// (xem comment "điểm mù thứ tư" trong claim_direct.lua và reaper.go).
//
// Tách RIÊNG khỏi TestClaimDirectWritesFullState để một lượt "xoá RPUSH rồi
// xem test nào đỏ" chỉ ra ĐÚNG MỘT test, không phải một test tổng hợp nhiều
// khẳng định.
func TestClaimDirectPutsPodInPoolClaimedForTang2c(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	const podName = "sandbox-direct-2c"
	p := directTestParams("sess-direct-2c")

	if err := ClaimDirect(ctx, rdb, podName, p); err != nil {
		t.Fatalf("ClaimDirect: %v", err)
	}

	q := rdb.LRange(ctx, rediskeys.PoolClaimed, 0, -1).Val()
	if len(q) != 1 || q[0] != podName {
		t.Fatalf("pool:claimed = %v, muốn [%s] — thiếu RPUSH này thì tầng 2c (reaper) mù với pod profiled hết hạn khi tầng 1 lỡ event",
			q, podName)
	}
}

// TestClaimDirectRejectsExistingSession: gọi ClaimDirect hai lần cùng
// sessionID là lỗi lập trình (mirror TestClaimRejectsExistingSession của
// claim.lua) — không chặn thì lần hai ghi đè hash và pod của lần một rò VĨNH
// VIỄN, vì `pool:claimed` vẫn còn tên NHƯNG `session:{id}` TỒN TẠI nên
// heuristic mồ côi của reaper không bao giờ thấy.
func TestClaimDirectRejectsExistingSession(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	p := directTestParams("sess-direct-dup")
	if err := ClaimDirect(ctx, rdb, "sandbox-direct-dup-1", p); err != nil {
		t.Fatalf("claim 1: %v", err)
	}
	err := ClaimDirect(ctx, rdb, "sandbox-direct-dup-2", p)
	if err == nil {
		t.Fatal("claim lần hai cùng sessionID phải lỗi, nhận nil")
	}

	sessionKey, _ := rediskeys.Session(p.SessionID)
	if got := rdb.HGet(ctx, sessionKey, rediskeys.FieldPodName).Val(); got != "sandbox-direct-dup-1" {
		t.Errorf("podName = %q, muốn sandbox-direct-dup-1 — lần hai không được ghi đè", got)
	}
	// Pod thứ hai (chưa từng ghi) không được để lại state rác nào.
	if n := rdb.Exists(ctx, rediskeys.PodPrefix+"sandbox-direct-dup-2").Val(); n != 0 {
		t.Errorf("pod:sandbox-direct-dup-2 tồn tại — lần gọi bị chặn nhưng vẫn để lại rác")
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != 1 {
		t.Errorf("LLEN pool:claimed = %d, muốn 1 — lần hai không được rút/ghi thêm pod", n)
	}
}

// TestClaimDirectRollsBackOnWriteFailure — mirror TestClaimRollsBackOnWriteFailure
// của claim.lua: Redis Lua KHÔNG có rollback, nên claim_direct.lua phải TỰ hoàn
// tác. Ép lỗi ở lệnh EXPIRE cuối cùng bằng ttl vô lý (gọi thẳng script, bỏ qua
// validate() của Go — đang kiểm script tự bảo vệ khi CALLER truyền sai).
//
// KHÔNG có hoàn tác thì: hash pod:{name} còn state=claimed (không session nào
// biết để dọn), tên nằm lại pool:claimed vĩnh viễn, và session:{id} có thể ghi
// dở không TTL — đúng chế độ hỏng mà undo() của claim_direct.lua tồn tại để
// chặn (nó KHÁC undo() của claim.lua: không có pool:free để trả pod về, vì pod
// profiled chưa từng ở đó — xem comment trong claim_direct.lua).
func TestClaimDirectRollsBackOnWriteFailure(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	const podName = "sandbox-direct-abort"
	const sessionID = "sess-direct-abort"
	sessionKey, _ := rediskeys.Session(sessionID)
	sessionPodKey, _ := rediskeys.SessionPod(sessionID)
	keys := []string{rediskeys.PoolClaimed, sessionKey, sessionPodKey}
	now := time.Now().Unix()

	err := claimDirectScript.Run(ctx, rdb, keys,
		sessionID, "user-test", "dlp-sandbox", "SANDBOX_TIER_SYSBOX",
		fmt.Sprint(now), fmt.Sprint(now+600),
		"99999999999999999", // ttl vô lý → EXPIRE lỗi ở lệnh CUỐI
		rediskeys.PodPrefix, "99999999999999999",
		podName, "k8s",
	).Err()
	if err == nil {
		t.Fatal("muốn lỗi khi EXPIRE nhận ttl vô lý, nhận nil")
	}
	if !strings.Contains(err.Error(), "hoan tac") {
		t.Errorf("lỗi = %v, muốn thông báo có nhắc tới hoàn tác", err)
	}

	// Đây mới là phần quan trọng: KHÔNG state dở nào được để lại.
	podKey, _ := rediskeys.Pod(podName)
	if n := rdb.Exists(ctx, podKey).Val(); n != 0 {
		t.Errorf("pod hash %q còn tồn tại sau abort — pod claimed vĩnh viễn mà không session nào biết", podKey)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != 0 {
		t.Errorf("LLEN pool:claimed = %d, muốn 0 — pod mồ côi còn sót lại sau abort", n)
	}
	if n := rdb.Exists(ctx, sessionKey).Val(); n != 0 {
		t.Errorf("session:{id} còn tồn tại sau abort — caller nhận lỗi mà Redis vẫn giữ session (và không TTL)")
	}
	if n := rdb.Exists(ctx, sessionPodKey).Val(); n != 0 {
		t.Errorf("session:{id}:pod còn tồn tại sau abort")
	}

	// Và claim lại (đường Go bình thường, TTL hợp lệ) phải thành công cho CÙNG
	// tên pod — không state rác nào chặn đường nó.
	p := directTestParams(sessionID)
	if err := ClaimDirect(ctx, rdb, podName, p); err != nil {
		t.Fatalf("claim lại sau abort: %v", err)
	}
}

// TestClaimDirectIdempotentDocLaiKhiMatReply — mirror
// TestClaimIdempotentDocLaiKhiMatReply (claim_idempotent_test.go): claim_direct.lua
// chạy TRỌN VẸN trên server rồi reply mất ở tầng mạng. ClaimDirectIdempotent
// phải PHỤC HỒI được bằng đọc-lại, không được để caller nhả khoá idempotency
// rồi retry tạo một session/pod THỨ HAI.
func TestClaimDirectIdempotentDocLaiKhiMatReply(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	hook := &lostReplyHook{}
	rdb.AddHook(hook)
	hook.arm()

	const podName = "sandbox-direct-lostreply"
	p := directTestParams("sess-direct-lostreply")

	got, err := ClaimDirectIdempotent(ctx, rdb, podName, p)
	if err != nil {
		t.Fatalf("ClaimDirectIdempotent phải PHỤC HỒI được từ mất-reply, nhận: %v", err)
	}
	if got != podName {
		t.Fatalf("trả %q, muốn %q", got, podName)
	}
	if hook.firedCount() != 1 {
		t.Fatalf("hook bắn %d lần, cần 1 — mô phỏng không trúng lệnh EVALSHA", hook.firedCount())
	}

	sessionKey, _ := rediskeys.Session(p.SessionID)
	stored, err := rdb.HGet(ctx, sessionKey, rediskeys.FieldPodName).Result()
	if err != nil {
		t.Fatalf("HGET podName: %v", err)
	}
	if stored != podName {
		t.Fatalf("trả %q nhưng Redis ghi %q", podName, stored)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolClaimed).Result(); n != 1 {
		t.Fatalf("pool:claimed = %d, cần 1 — chỉ đúng một pod được ghi", n)
	}
}

// TestClaimDirectIdempotentGoiLaiTraCungPodKhongTaoSessionThuHai — "gọi lại"
// tường minh với sessionID CŨ nhưng một podName MỚI (mô phỏng: caller ở tầng
// lifecycle nghĩ lần một đã thất bại và tự tạo pod thứ hai trước khi retry).
//
// ClaimDirectIdempotent phải trả về ĐÚNG pod của lần một (đọc lại từ hash đã
// ghi), KHÔNG được ghi bất cứ thứ gì cho podName mới — nếu không thì mỗi lần
// "retry" như vậy tạo thêm một session/pod thứ hai không ai dọn.
func TestClaimDirectIdempotentGoiLaiTraCungPodKhongTaoSessionThuHai(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	const firstPod = "sandbox-direct-repeat-1"
	const secondPod = "sandbox-direct-repeat-2"
	p := directTestParams("sess-direct-repeat")

	first, err := ClaimDirectIdempotent(ctx, rdb, firstPod, p)
	if err != nil {
		t.Fatalf("claim lần 1: %v", err)
	}
	if first != firstPod {
		t.Fatalf("lần 1 trả %q, muốn %q", first, firstPod)
	}

	second, err := ClaimDirectIdempotent(ctx, rdb, secondPod, p)
	if err != nil {
		t.Fatalf("lần gọi lại (idempotent) phải phục hồi, nhận lỗi: %v", err)
	}
	if second != firstPod {
		t.Fatalf("lần gọi lại trả %q, muốn %q (pod của lần một) — idempotent variant phải trả CÙNG session, không tạo pod thứ hai",
			second, firstPod)
	}

	// pod "thứ hai" mà caller định dùng KHÔNG được có state nào — chứng minh
	// không có session/pod thứ hai nào được tạo.
	secondPodKey, _ := rediskeys.Pod(secondPod)
	if n := rdb.Exists(ctx, secondPodKey).Val(); n != 0 {
		t.Errorf("pod:%s tồn tại — lần gọi lại đã ghi state cho pod thứ hai", secondPod)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != 1 {
		t.Errorf("LLEN pool:claimed = %d, muốn 1 (chỉ pod của lần một)", n)
	}
	sessionKey, _ := rediskeys.Session(p.SessionID)
	if got := rdb.HGet(ctx, sessionKey, rediskeys.FieldPodName).Val(); got != firstPod {
		t.Errorf("session podName = %q, muốn %q", got, firstPod)
	}
}

// TestClaimDirectIdempotentThamSoHongKhongDiDocLai — mirror
// TestClaimIdempotentThamSoHongKhongDiDocLai: validate lỗi nghĩa là script còn
// chưa được gửi đi, nên caller nhả khoá idempotency được an toàn.
func TestClaimDirectIdempotentThamSoHongKhongDiDocLai(t *testing.T) {
	rdb := newTestRedis(t)

	p := directTestParams("sess-direct-tham-so-hong")
	p.Tier = "SANDBOX_TIER_KHONG_CO_THAT"

	_, err := ClaimDirectIdempotent(context.Background(), rdb, "sandbox-direct-invalid", p)
	if !errors.Is(err, ErrInvalidClaimParams) {
		t.Fatalf("cần ErrInvalidClaimParams, nhận %v", err)
	}
	if errors.Is(err, ErrClaimMayHaveWritten) {
		t.Fatal("tham số hỏng là ca CHẮC CHẮN chưa ghi")
	}
}
