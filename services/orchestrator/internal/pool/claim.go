// Package pool giữ warm-pool của sandbox pod (phase-1 1.B).
//
// File này là sản phẩm của spike 1.A-2: chứng minh claim atomic dưới đua
// 200 goroutine trên Redis THẬT. Warm-pool manager (B2) sẽ xây quanh nó.
package pool

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed claim.lua
var claimLua string

// claimScript được nạp một lần cho cả process. redis.NewScript tự làm đúng
// nghi thức EVALSHA-trước-EVAL-sau: Run() thử EVALSHA bằng SHA1 tính sẵn,
// gặp NOSCRIPT (Redis restart làm trống script cache) thì tự fallback EVAL —
// tức là nạp lại script trong cùng một lời gọi, không mất claim nào.
// Test TestClaimSurvivesScriptFlush chứng minh hành vi này trên Redis thật.
var claimScript = redis.NewScript(claimLua)

// ErrPoolEmpty là sentinel cho cold-path: pool rỗng KHÔNG phải lỗi hệ thống.
// Caller (B3) bắt nó để tự tạo pod đồng bộ thay vì claim từ pool.
var ErrPoolEmpty = errors.New("pool: không còn pod ấm trong pool:free")

// ClaimParams là đầu vào cho một lượt claim. Mọi field bắt buộc.
type ClaimParams struct {
	SessionID string
	UserID    string
	Namespace string
	Tier      string
	// NowUnix ghi vào createdAt/lastActiveAt/pod.updatedAt — truyền từ ngoài
	// để test kiểm được giá trị và để không gọi time.Now() trong đường nóng.
	NowUnix int64
	// ExpiresAtUnix ghi vào field expiresAt của hash session.
	ExpiresAtUnix int64
	// TTLSeconds đặt EXPIRE cho session:{id} và session:{id}:pod.
	TTLSeconds int64
}

func (p ClaimParams) validate() error {
	if p.NowUnix <= 0 || p.ExpiresAtUnix <= 0 {
		return fmt.Errorf("pool: NowUnix/ExpiresAtUnix phải > 0 (nhận %d/%d)", p.NowUnix, p.ExpiresAtUnix)
	}
	if p.TTLSeconds <= 0 {
		return fmt.Errorf("pool: TTLSeconds phải > 0 (nhận %d)", p.TTLSeconds)
	}
	if p.Namespace == "" || p.Tier == "" {
		return errors.New("pool: Namespace/Tier không được rỗng")
	}
	return nil
}

// Claim rút pod cũ nhất khỏi pool:free và gắn trọn bộ state cho session trong
// MỘT lượt Redis (Lua atomic). Pool rỗng → ErrPoolEmpty.
//
// SessionID/UserID đi qua validator của rediskeys trước khi chạm Redis —
// idempotency-key và mọi định danh từ client là dữ liệu không tin được.
func Claim(ctx context.Context, rdb redis.Scripter, p ClaimParams) (podName string, err error) {
	if err := p.validate(); err != nil {
		return "", err
	}
	sessionKey, err := rediskeys.Session(p.SessionID)
	if err != nil {
		return "", err
	}
	sessionPodKey, err := rediskeys.SessionPod(p.SessionID)
	if err != nil {
		return "", err
	}
	// UserID không nằm trong key nào của script này nhưng vẫn phải qua cổng
	// validator: nó được ghi vào hash mà gateway so sánh nguyên văn (vế g).
	if err := rediskeys.ValidateID(p.UserID); err != nil {
		return "", fmt.Errorf("pool: user id không hợp lệ: %w", err)
	}

	keys := []string{rediskeys.PoolFree, rediskeys.PoolClaimed, sessionKey, sessionPodKey}
	argv := []interface{}{
		p.SessionID,
		p.UserID,
		p.Namespace,
		p.Tier,
		strconv.FormatInt(p.NowUnix, 10),
		strconv.FormatInt(p.ExpiresAtUnix, 10),
		strconv.FormatInt(p.TTLSeconds, 10),
	}

	pod, err := claimScript.Run(ctx, rdb, keys, argv...).Text()
	if errors.Is(err, redis.Nil) {
		// Lua `return nil` → redis trả bulk nil → go-redis map thành redis.Nil.
		return "", ErrPoolEmpty
	}
	if err != nil {
		return "", fmt.Errorf("pool: chạy claim.lua: %w", err)
	}
	return pod, nil
}
