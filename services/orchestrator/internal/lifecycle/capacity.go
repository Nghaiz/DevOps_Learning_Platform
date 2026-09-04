package lifecycle

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// GetCapacity đọc sức chứa nền tảng NGAY LÚC GỌI — không cache, không lưu lại
// phía server (session.proto).
//
// ⛔ ĐỌC LLEN TRỰC TIẾP, KHÔNG ĐỌC GAUGE `dlp_pool_*_size`. Gauge chỉ được
// pool.Manager.observeSizes cập nhật mỗi vòng replenish (mặc định 10s — xem
// config.PoolTarget doc và defaultTick trong pool/manager.go), nên đọc gauge ở
// đây là cho FE một con số có thể cũ tới 10s ngay sau khi ai đó vừa
// claim/reap một session — đúng lúc "còn N chỗ" cần đúng nhất. Ba lệnh LLEN
// dưới đây là ĐÚNG NGUỒN mà observeSizes cũng đọc (rediskeys.PoolFree/
// PoolClaimed/PoolQuarantine), chỉ khác là đọc trực tiếp thay vì qua gauge đã
// cache.
func (s *Service) GetCapacity(
	ctx context.Context, _ *orchestratorv1.GetCapacityRequest,
) (*orchestratorv1.GetCapacityResponse, error) {
	claimed, err := s.rdb.LLen(ctx, rediskeys.PoolClaimed).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc %s: %v", rediskeys.PoolClaimed, err)
	}
	free, err := s.rdb.LLen(ctx, rediskeys.PoolFree).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc %s: %v", rediskeys.PoolFree, err)
	}
	quarantine, err := s.rdb.LLen(ctx, rediskeys.PoolQuarantine).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc %s: %v", rediskeys.PoolQuarantine, err)
	}

	return &orchestratorv1.GetCapacityResponse{
		ActiveSessions: int32(claimed),
		SoftCapacity:   int32(s.cfg.CapacitySoftLimit),
		PoolFree:       int32(free),
		PoolQuarantine: int32(quarantine),
	}, nil
}
