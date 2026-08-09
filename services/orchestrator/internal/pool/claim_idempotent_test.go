package pool

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// lostReplyHook để script chạy TRỌN VẸN trên server rồi mới nuốt reply — mô
// phỏng trung thực timeout TCP xảy ra SAU khi Redis đã thực thi xong.
//
// Mọi cách giả lập khác (trả lỗi trước khi gửi, đóng client) chỉ mô phỏng ca DỄ,
// tức ca mà code vốn đã xử lý đúng.
type lostReplyHook struct {
	mu    sync.Mutex
	armed bool
	fired int
}

func (h *lostReplyHook) arm() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.armed = true
}

func (h *lostReplyHook) firedCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.fired
}

func (h *lostReplyHook) DialHook(next redis.DialHook) redis.DialHook { return next }

func (h *lostReplyHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		err := next(ctx, cmd)
		if name := cmd.Name(); name != "evalsha" && name != "eval" {
			return err
		}
		h.mu.Lock()
		defer h.mu.Unlock()
		if !h.armed {
			return err
		}
		h.armed = false
		h.fired++
		lost := errors.New("mô phỏng: mất reply sau khi script đã chạy trọn")
		cmd.SetErr(lost)
		return lost
	}
}

func (h *lostReplyHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

// TestClaimIdempotentDocLaiKhiMatReply — ca sống THẬT của nhánh đọc-lại.
//
// ⛔ BẢN ĐẦU CỦA HÀM NÀY LÀ MÃ CHẾT. Nó chỉ đọc lại khi claim.lua trả đúng
// marker "session da ton tai" — mà nhánh ấy không có đường nào chạm tới, vì
// CreateSession sinh sessionID 128-bit MỚI ở mỗi lời gọi nên `EXISTS session:{id}`
// bên trong script không bao giờ bằng 1 cho một lời gọi thật.
//
// Chế độ hỏng THẬT lại là loại khác hẳn: script chạy TRỌN VẸN rồi reply mất ở
// tầng mạng. Lỗi khi đó là một timeout bình thường, không mang marker nào — nên
// điều kiện đúng không phải "lỗi có nói session tồn tại không" mà là "ta có CHẮC
// CHẮN Redis chưa ghi gì không".
func TestClaimIdempotentDocLaiKhiMatReply(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()
	seedPool(t, rdb, 1)

	hook := &lostReplyHook{}
	rdb.AddHook(hook)
	hook.arm()

	p := claimParams("sess-mat-reply")

	pod, err := ClaimIdempotent(ctx, rdb, p)
	if err != nil {
		t.Fatalf("ClaimIdempotent phải PHỤC HỒI được từ mất-reply, nhận: %v", err)
	}
	if pod == "" {
		t.Fatal("trả podName rỗng")
	}
	if hook.firedCount() != 1 {
		t.Fatalf("hook bắn %d lần, cần 1 — mô phỏng không trúng lệnh EVALSHA", hook.firedCount())
	}

	// Và nó phải trả ĐÚNG pod mà script đã ghi, không phải một pod khác.
	sessionKey, err := rediskeys.Session(p.SessionID)
	if err != nil {
		t.Fatalf("rediskeys.Session: %v", err)
	}
	stored, err := rdb.HGet(ctx, sessionKey, rediskeys.FieldPodName).Result()
	if err != nil {
		t.Fatalf("HGET podName: %v", err)
	}
	if stored != pod {
		t.Fatalf("trả %q nhưng Redis ghi %q", pod, stored)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 0 {
		t.Fatalf("pool:free = %d, cần 0 — chỉ đúng một pod được tiêu", n)
	}
}

// TestClaimIdempotentKhongNuotLoiKhiChuaGhiGi — vế đối xứng.
//
// Khi Redis CHƯA ghi gì, hàm phải trả lỗi GỐC để caller biết chắc là an toàn
// mà nhả khoá idempotency. Trả nhầm "thành công" ở đây thì tệ hơn nhiều.
func TestClaimIdempotentKhongNuotLoiKhiChuaGhiGi(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	// Pool rỗng: script chạy, trả sentinel, KHÔNG ghi gì.
	_, err := ClaimIdempotent(ctx, rdb, claimParams("sess-pool-rong"))
	if !errors.Is(err, ErrPoolEmpty) {
		t.Fatalf("pool rỗng phải trả ErrPoolEmpty, nhận %v", err)
	}
	if errors.Is(err, ErrClaimMayHaveWritten) {
		t.Fatal("pool rỗng là ca CHẮC CHẮN chưa ghi — không được đánh dấu 'có thể đã ghi'")
	}
}

// TestClaimIdempotentThamSoHongKhongDiDocLai — validate lỗi nghĩa là script còn
// chưa được gửi đi, nên không có gì để đọc lại và caller nhả khoá được.
func TestClaimIdempotentThamSoHongKhongDiDocLai(t *testing.T) {
	rdb := newTestRedis(t)

	p := claimParams("sess-tham-so-hong")
	p.Tier = "SANDBOX_TIER_KHONG_CO_THAT"

	_, err := ClaimIdempotent(context.Background(), rdb, p)
	if !errors.Is(err, ErrInvalidClaimParams) {
		t.Fatalf("cần ErrInvalidClaimParams, nhận %v", err)
	}
	if errors.Is(err, ErrClaimMayHaveWritten) {
		t.Fatal("tham số hỏng là ca CHẮC CHẮN chưa ghi")
	}
}

// TestClaimIdempotentKhongTraPodCuaNguoiKhac — hash tồn tại nhưng userId lệch.
//
// Với sessionID 128-bit thì trùng ngẫu nhiên là không thể, nên ca này nghĩa là
// bộ sinh id hỏng hoặc có người đang thăm dò. Cả hai phải nổ ra, tuyệt đối
// không được trả podName của người khác.
func TestClaimIdempotentKhongTraPodCuaNguoiKhac(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()
	seedPool(t, rdb, 1)

	// userA claim trước.
	pA := claimParams("sess-dung-chung-id")
	pA.UserID = "userA"
	if _, err := Claim(ctx, rdb, pA); err != nil {
		t.Fatalf("claim của A: %v", err)
	}

	// userB đâm vào cùng sessionID: claim.lua chặn bằng EXISTS, rồi nhánh
	// đọc-lại phải phát hiện userId lệch.
	pB := claimParams("sess-dung-chung-id")
	pB.UserID = "userB"

	_, err := ClaimIdempotent(ctx, rdb, pB)
	if !errors.Is(err, ErrSessionOwnedByAnother) {
		t.Fatalf("cần ErrSessionOwnedByAnother, nhận %v — nhánh đọc-lại vừa rò pod của A sang B", err)
	}
}

// TestSessionExistsMarkerKhopKhitVoiLua — chuỗi trong Go phải là prefix thật của
// error_reply trong claim.lua. Drift ở đây không làm mất cơ chế bảo vệ nữa (đọc
// lại đã chạy trên MỌI lỗi), nhưng làm mất khả năng phân loại.
func TestSessionExistsMarkerKhopKhitVoiLua(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()
	seedPool(t, rdb, 1)

	p := claimParams("sess-kiem-marker")
	if _, err := Claim(ctx, rdb, p); err != nil {
		t.Fatalf("claim lần 1: %v", err)
	}
	_, err := Claim(ctx, rdb, p)
	if err == nil {
		t.Fatal("claim lần 2 cùng sessionID phải lỗi")
	}
	if !IsSessionExistsReply(err) {
		t.Fatalf("marker %q không còn khớp error_reply của claim.lua: %v", sessionExistsMarker, err)
	}
	if !strings.Contains(err.Error(), sessionExistsMarker) {
		t.Fatalf("lỗi %q không chứa marker", err)
	}
}
