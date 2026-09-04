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
	if resp.GetSoftCapacity() != 20 {
		// newHarnessWithProfiles ghim CapacitySoftLimit=20 (xem service_test.go).
		t.Errorf("SoftCapacity = %d, cần 20 (env CAPACITY_SOFT_LIMIT của harness)", resp.GetSoftCapacity())
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
	if resp.GetSoftCapacity() != 20 {
		t.Errorf("SoftCapacity = %d, cần 20 ngay cả khi pool rỗng — đây là cấu hình, không phải đo đạc",
			resp.GetSoftCapacity())
	}
}
