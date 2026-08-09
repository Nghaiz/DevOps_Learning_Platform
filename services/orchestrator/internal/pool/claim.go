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
	"time"

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

// Trần của TTL. Không phải con số cho đẹp: `EXPIRE` từ chối giá trị vượt
// khoảng nó chấp nhận, và lỗi đó nổ ra ở lệnh CUỐI của claim.lua — sau khi
// session đã ghi xong. Script tự hoàn tác được, nhưng chặn từ biên thì rẻ hơn
// và cho thông báo hiểu được thay vì "invalid expire time in 'expire' command".
//
// 24h là trần kỹ thuật, KHÔNG phải chính sách: HARD_CAP thật (D11: 2h) do B5
// áp. Cái này chỉ chặn giá trị vô nghĩa lọt xuống Redis.
const maxTTLSeconds = int64(24 * 60 * 60)

// podPointerGrace là khoảng `session:{id}:pod` sống LÂU HƠN hash session.
//
// Reaper tầng 1 nghe `__keyevent@0__:expired` của `session:{id}`; lúc event
// tới thì hash ĐÃ biến mất và không còn chỗ nào đọc được podName để xoá pod.
// Con trỏ sống thêm khoảng này chính là thứ trả lời "session vừa hết hạn đang
// ở pod nào". Đặt hai TTL bằng nhau là reaper mù.
const podPointerGrace = 10 * time.Minute

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
	// TTLSeconds đặt EXPIRE cho session:{id}.
	TTLSeconds int64
}

func (p ClaimParams) validate() error {
	// SessionID/UserID: định danh, qua cổng pattern của rediskeys.
	if err := rediskeys.ValidateID(p.SessionID); err != nil {
		return fmt.Errorf("pool: session id: %w", err)
	}
	// UserID không nằm trong key nào của script này, nhưng nó được ghi vào hash
	// mà gateway so sánh NGUYÊN VĂN cho authz vế g — cùng miền định danh với
	// Idem(userID, …), nên phải qua cùng một cổng.
	if err := rediskeys.ValidateID(p.UserID); err != nil {
		return fmt.Errorf("pool: user id: %w", err)
	}
	// Namespace đi ra khỏi Redis rồi thành một đoạn trong URL `pods/exec` mà
	// gateway gọi (G4 đọc field này thay vì hardcode). Một giá trị không kiểm
	// vượt biên tin cậy Redis → K8s API, nên nó qua cùng cổng với định danh.
	if err := rediskeys.ValidateID(p.Namespace); err != nil {
		return fmt.Errorf("pool: namespace: %w", err)
	}
	// Tier là enum của proto. Chuỗi tự do ở đây nghĩa là gõ sai tồn tại im lặng
	// trong Redis rồi đi thẳng ra FE.
	if !validTiers[p.Tier] {
		return fmt.Errorf("pool: tier %q không hợp lệ (cần một trong %v)", p.Tier, tierNames())
	}
	if p.NowUnix <= 0 {
		return fmt.Errorf("pool: NowUnix phải > 0 (nhận %d)", p.NowUnix)
	}
	if p.TTLSeconds <= 0 || p.TTLSeconds > maxTTLSeconds {
		return fmt.Errorf("pool: TTLSeconds phải trong (0, %d] (nhận %d)", maxTTLSeconds, p.TTLSeconds)
	}
	// Không kiểm thì tạo được session sinh ra đã hết hạn — gateway sẽ từ chối
	// mọi kết nối vào nó với 409 và không ai hiểu vì sao.
	if p.ExpiresAtUnix <= p.NowUnix {
		return fmt.Errorf("pool: ExpiresAtUnix (%d) phải sau NowUnix (%d)", p.ExpiresAtUnix, p.NowUnix)
	}
	return nil
}

// validTiers khớp enum SandboxTier của proto. UNSPECIFIED bị loại có chủ ý:
// comment trong session.proto yêu cầu fail-closed với giá trị đó.
var validTiers = map[string]bool{
	"SANDBOX_TIER_SYSBOX": true,
	"SANDBOX_TIER_KATA":   true,
}

func tierNames() []string {
	names := make([]string, 0, len(validTiers))
	for k := range validTiers {
		names = append(names, k)
	}
	return names
}

// Claim rút pod cũ nhất ĐANG FREE khỏi pool:free và gắn trọn bộ state cho
// session trong MỘT lượt Redis. Pool rỗng → ErrPoolEmpty.
//
// Script tự hoàn tác nếu một lệnh ghi lỗi giữa chừng, nên một lỗi trả về từ
// đây nghĩa là Redis KHÔNG còn state dở của lượt claim này — pod đã về lại
// pool:free và retry là an toàn.
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

	keys := []string{
		rediskeys.PoolFree,
		rediskeys.PoolClaimed,
		sessionKey,
		sessionPodKey,
		rediskeys.PoolQuarantine,
	}
	argv := []interface{}{
		p.SessionID,
		p.UserID,
		p.Namespace,
		p.Tier,
		strconv.FormatInt(p.NowUnix, 10),
		strconv.FormatInt(p.ExpiresAtUnix, 10),
		strconv.FormatInt(p.TTLSeconds, 10),
		rediskeys.PodPrefix,
		strconv.FormatInt(p.TTLSeconds+int64(podPointerGrace.Seconds()), 10),
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
