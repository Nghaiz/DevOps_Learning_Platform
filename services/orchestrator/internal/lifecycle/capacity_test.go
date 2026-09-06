package lifecycle

import (
	"context"
	"testing"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// TestGetCapacityDocLLENThat — GetCapacity phải đọc ĐÚNG ba list Redis mà
// pool.Manager.observeSizes cũng đọc (LLEN trực tiếp), không phải một bản sao
// nào khác — lệch nguồn là "còn N chỗ" nói dối FE.
func TestGetCapacityDocLLENThat(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	// pool:free — 2 pod ấm.
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	// pool:claimed — 1 session ĐANG SỐNG (Create claim sandbox-warm01,
	// claim.lua tự LMOVE free→claimed).
	if _, err := h.svc.Create(ctx, createReq("u1", "k1")); err != nil {
		t.Fatalf("Create: %v", err)
	}

	// pool:quarantine — đẩy tay một pod cách ly. Đường THẬT là claim.lua khi
	// pod:{name}.state != free; ở đây chỉ cần đúng list, không cần tái tạo
	// nguyên nhân cách ly.
	if err := h.rdb.RPush(ctx, rediskeys.PoolQuarantine, "sandbox-bad01").Err(); err != nil {
		t.Fatalf("seed quarantine: %v", err)
	}

	resp, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity: %v", err)
	}
	if resp.GetActiveSessions() != 1 {
		t.Errorf("ActiveSessions = %d, cần 1 (đúng len(pool:claimed))", resp.GetActiveSessions())
	}
	if resp.GetPoolFree() != 1 {
		// warm02 vẫn free — warm01 đã bị claim.
		t.Errorf("PoolFree = %d, cần 1", resp.GetPoolFree())
	}
	if resp.GetPoolQuarantine() != 1 {
		t.Errorf("PoolQuarantine = %d, cần 1", resp.GetPoolQuarantine())
	}
	if resp.GetHardCapacity() != 23 {
		// newHarnessWithProfiles ghim CapacityHardLimit=23 (xem service_test.go).
		t.Errorf("HardCapacity = %d, cần 23 (env CAPACITY_HARD_LIMIT của harness)", resp.GetHardCapacity())
	}
	if resp.GetSoftCapacity() != 20 {
		// 23 − PoolTarget 3 = 20. TÍNH, không phải một env riêng.
		t.Errorf("SoftCapacity = %d, cần 20 (= HardCapacity 23 − PoolTarget 3)", resp.GetSoftCapacity())
	}
}

// TestSoftCapacityLaHieuChuKhongPhaiHangSo — CỔNG CHÍNH của quyết định
// no-derived-fields ở P13.
//
// Đổi PoolTarget mà trần mềm KHÔNG đổi theo nghĩa nó đã bị ghim lại thành hằng
// số ở đâu đó, và đó chính xác là chế độ hỏng mà báo cáo P12 §2.4 ghi lại: chú
// thích cũ nói trần 20 trong khi pool đã lên 3 và trần thật là 18. Ô này đỏ
// ngay khi ai đó "đơn giản hoá" softCapacity() thành một field đọc thẳng.
//
// Ba cặp, KHÔNG phải một: một cặp duy nhất thoả mãn được bằng một hằng số may
// mắn trùng, ba cặp thì không.
func TestSoftCapacityLaHieuChuKhongPhaiHangSo(t *testing.T) {
	for _, tc := range []struct {
		hard, pool, wantSoft int
	}{
		{23, 3, 20}, // cấu hình lab hôm nay
		{23, 1, 22}, // pool nhỏ hơn ⇒ trần mềm CAO hơn
		{23, 8, 15}, // pool lớn hơn ⇒ trần mềm THẤP hơn
		{10, 3, 7},  // trần cứng khác hẳn
	} {
		svc := &Service{cfg: Config{CapacityHardLimit: tc.hard, PoolTarget: tc.pool}}
		if got := svc.softCapacity(); got != tc.wantSoft {
			t.Errorf("softCapacity(hard=%d, pool=%d) = %d, cần %d",
				tc.hard, tc.pool, got, tc.wantSoft)
		}
	}
}

// TestGetCapacityPoolRong — pool trống hoàn toàn vẫn phải trả 0 cho cả ba
// field, KHÔNG lỗi. Đây là trạng thái BÌNH THƯỜNG lúc cluster vừa khởi động.
func TestGetCapacityPoolRong(t *testing.T) {
	h := newHarness(t)
	resp, err := h.svc.GetCapacity(context.Background(), &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity trên pool rỗng: %v", err)
	}
	if resp.GetActiveSessions() != 0 || resp.GetPoolFree() != 0 || resp.GetPoolQuarantine() != 0 {
		t.Errorf("pool rỗng nhưng resp = %+v", resp)
	}
	if resp.GetSoftCapacity() != 20 || resp.GetHardCapacity() != 23 {
		t.Errorf("Soft/Hard = %d/%d, cần 20/23 ngay cả khi pool rỗng — hai số này tới từ cấu hình, "+
			"không phải từ phép đo pool", resp.GetSoftCapacity(), resp.GetHardCapacity())
	}
}
