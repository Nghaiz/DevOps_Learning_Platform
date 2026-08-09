package pool

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// sessionExistsMarker là đoạn chữ trong error_reply của claim.lua khi
// `EXISTS session:{id}` trả 1. Redis không cho script trả mã lỗi có cấu trúc,
// nên khớp chuỗi là đường duy nhất — giữ nó trùng KHÍT với claim.lua.
const sessionExistsMarker = "claim: session da ton tai"

// ErrSessionOwnedByAnother là ca không bao giờ được lặng lẽ đi qua: hash
// `session:{id}` tồn tại nhưng userId trong đó KHÔNG phải người đang gọi.
//
// Với sessionID 128-bit thì trùng ngẫu nhiên là không thể — nên nếu ca này xảy
// ra, hoặc bộ sinh id hỏng, hoặc có ai đó đang thăm dò. Cả hai đều phải nổ ra
// chứ không được trả về podName của người khác.
var ErrSessionOwnedByAnother = errors.New("pool: session:{id} đã tồn tại nhưng thuộc user khác")

// ClaimIdempotent gọi Claim, và biến ca "session đã tồn tại" thành ĐỌC LẠI.
//
// ⛔ VÌ SAO CẦN HÀM NÀY — "claim: session da ton tai" KHÔNG PHẢI LỖI:
// claim.lua chặn claim đè bằng `EXISTS session:{id}`. Nhưng nếu lời gọi Redis
// timeout ở TẦNG MẠNG *sau khi* script đã chạy trọn, caller nhận error và tin
// là thất bại; một retry với cùng sessionID đụng đúng guard đó. Coi nó là lỗi
// ⇒ caller rẽ cold-path ⇒ TẠO POD THỨ HAI trong khi pod thứ nhất đã claim cho
// chính session đó — và pod thứ nhất rò VĨNH VIỄN, vì hash `session:{id}` tồn
// tại nên heuristic "pod mồ côi" của reaper (B7) không bao giờ thấy nó.
//
// Đường `idempotency_key` KHÔNG cứu ca này: nó dedupe ở NGOÀI Claim (một
// CreateSession với một sessionID), còn đây là retry BÊN TRONG một lần claim.
func ClaimIdempotent(ctx context.Context, rdb redis.Cmdable, p ClaimParams) (string, error) {
	pod, err := Claim(ctx, rdb, p)
	if err == nil {
		return pod, nil
	}
	if !isSessionExists(err) {
		// ErrPoolEmpty và mọi lỗi thật đi thẳng ra — caller phân biệt chúng.
		return "", err
	}

	sessionKey, keyErr := rediskeys.Session(p.SessionID)
	if keyErr != nil {
		return "", keyErr
	}

	vals, readErr := rdb.HMGet(ctx, sessionKey,
		rediskeys.FieldPodName, rediskeys.FieldUserID).Result()
	if readErr != nil {
		return "", fmt.Errorf("pool: đọc lại %s sau khi claim báo session đã tồn tại: %w", sessionKey, readErr)
	}

	podName, _ := vals[0].(string)
	userID, _ := vals[1].(string)

	if podName == "" {
		// Hash tồn tại lúc script chạy nhưng giờ không còn podName: session đã
		// hết hạn/bị reap giữa hai lượt, hoặc ai đó ghi tay vào Redis. Không
		// bịa ra một pod — trả nguyên lỗi gốc để caller thấy đúng chuyện đã xảy ra.
		return "", fmt.Errorf("pool: session %q đã tồn tại nhưng không có podName: %w", p.SessionID, err)
	}
	if userID != p.UserID {
		return "", fmt.Errorf("%w (session=%q)", ErrSessionOwnedByAnother, p.SessionID)
	}

	return podName, nil
}

func isSessionExists(err error) bool {
	return err != nil && strings.Contains(err.Error(), sessionExistsMarker)
}
