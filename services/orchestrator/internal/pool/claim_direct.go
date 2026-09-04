package pool

import (
	"context"
	_ "embed"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed claim_direct.lua
var claimDirectLua string

// claimDirectScript — xem doc của claimScript trong claim.go: cùng nghi thức
// EVALSHA-trước-EVAL-sau, cùng lý do (Redis restart làm trống script cache).
var claimDirectScript = redis.NewScript(claimDirectLua)

// ClaimDirect ghi trạng thái CLAIMED cho một pod ĐÃ TẠO SẴN và ĐÃ READY, dùng
// cho session mang profile khác mặc định (P7 7.C — xem claim_direct.lua).
//
// ⛔ KHÁC Claim(): hàm này KHÔNG chọn pod và KHÔNG chạm `pool:free`. Caller
// (lifecycle.claimWithColdPath) PHẢI tự tạo pod bằng đúng profile
// (pool.Manager.ProvisionWithProfile) và chờ nó Ready TRƯỚC KHI gọi hàm này —
// ClaimDirect chỉ còn việc ghi Redis.
func ClaimDirect(ctx context.Context, rdb redis.Scripter, podName string, p ClaimParams) error {
	if err := p.validate(); err != nil {
		return err
	}
	if podName == "" {
		return fmt.Errorf("%w: podName rỗng", ErrInvalidClaimParams)
	}
	sessionKey, err := rediskeys.Session(p.SessionID)
	if err != nil {
		return err
	}
	sessionPodKey, err := rediskeys.SessionPod(p.SessionID)
	if err != nil {
		return err
	}

	keys := []string{rediskeys.PoolClaimed, sessionKey, sessionPodKey}
	argv := []interface{}{
		p.SessionID,
		p.UserID,
		p.Namespace,
		p.Tier,
		strconv.FormatInt(p.NowUnix, 10),
		strconv.FormatInt(p.ExpiresAtUnix, 10),
		strconv.FormatInt(p.TTLSeconds, 10),
		rediskeys.PodPrefix,
		strconv.FormatInt(p.TTLSeconds+int64(PodPointerGrace.Seconds()), 10),
		podName,
		p.Profile,
	}

	if _, err := claimDirectScript.Run(ctx, rdb, keys, argv...).Text(); err != nil {
		return fmt.Errorf("pool: chạy claim_direct.lua: %w", err)
	}
	return nil
}
