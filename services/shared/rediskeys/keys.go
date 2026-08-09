// Package rediskeys dựng key Redis theo namespace v0.
//
// SSOT của quy ước: docs/redis-key-namespace.md.
// Bản song sinh TypeScript: packages/shared-types/src/redis-keys.ts.
// Test của cả hai bản đọc chung đúng một file: docs/redis-key-vectors.json.
//
// VÌ SAO Ở `services/shared/` CHỨ KHÔNG PHẢI `services/orchestrator/internal/`:
// terminal-gateway là module Go RIÊNG và nó bắt buộc phải đọc `session:{id}` cho
// authz per-session (phase-1 D2). Package dưới `internal/` của orchestrator thì
// module khác không import được — đó là lỗi ở compile, không phải rủi ro kiến
// trúc. Để ở đây thì gateway dùng chung đúng bộ helper này thay vì nối chuỗi tay,
// và "nối chuỗi tay" chính là cách contract key trôi đi trong im lặng.
package rediskeys

import (
	"fmt"
	"regexp"
)

// Index của warm-pool. Cả hai đều là LIST (phase-1 D6): LMOVE là O(1) và FIFO,
// nên pod cũ nhất được claim trước và pod hỏng lộ sớm. Set thì SPOP trả ngẫu
// nhiên, pod hỏng có thể nằm hàng giờ trước khi ai đó rút trúng.
const (
	// PoolFree chứa tên pod đang WARM, chờ được claim.
	PoolFree = "pool:free"

	// PoolClaimed chứa pod vừa rời pool nhưng chưa gắn xong session. Pod nằm
	// đây mà không có session:{id} tương ứng là dấu hiệu pod mồ côi cho reaper.
	PoolClaimed = "pool:claimed"

	// PoolQuarantine chứa pod bị claim.lua từ chối vì `pod:{name}.state` không
	// phải "free" — thường là một tên pod lọt vào pool:free hai lần (replenish
	// retry, reaper trả pod hai lần, hai instance cùng replenish).
	//
	// Pod ở đây KHÔNG tự quay lại pool: đẩy lại là vòng lặp vô tận trên cùng
	// một pod hỏng. Reaper/ops dọn tay hoặc theo chính sách riêng. List dài ra
	// là tín hiệu có nguồn ghi sai vào pool:free — không phải chuyện bình thường.
	PoolQuarantine = "pool:quarantine"
)

// PodPrefix là tiền tố của key hash pod. Phơi ra vì `claim.lua` phải dựng
// `pod:{name}` ĐỘNG bên trong script (tên pod chỉ biết sau LMOVE) — truyền
// prefix này qua ARGV giữ SSOT thay vì để chuỗi "pod:" nằm lặp trong file Lua,
// nơi không vector test nào gác được.
const PodPrefix = "pod:"

// Field của hash session:{id}. camelCase để khớp bản TS và khớp JSON đi ra FE —
// KHÔNG phải snake_case của proto.
//
// Pin ở đây vì đây là contract liên-service VÔ HÌNH: orchestrator ghi, gateway
// đọc, mà proto không mô tả hash này ở đâu cả. Ghi "user_id" rồi đọc "userId" thì
// cả hai bên vẫn typecheck xanh và authz vế g im lặng so sánh với chuỗi rỗng.
const (
	FieldUserID       = "userId"
	FieldPodName      = "podName"
	FieldNamespace    = "namespace"
	FieldStatus       = "status"
	FieldTier         = "tier"
	FieldCreatedAt    = "createdAt"
	FieldExpiresAt    = "expiresAt"
	FieldRevision     = "revision"
	FieldLastActiveAt = "lastActiveAt"
)

// SessionFields liệt kê đủ field của hash session:{id}, ĐÚNG THỨ TỰ trong
// docs/redis-key-vectors.json. Test so sánh cả thứ tự, nên field mới thêm vào
// CUỐI, ở cả ba nơi, trong cùng một commit.
var SessionFields = []string{
	FieldUserID,
	FieldPodName,
	FieldNamespace,
	FieldStatus,
	FieldTier,
	FieldCreatedAt,
	FieldExpiresAt,
	FieldRevision,
	FieldLastActiveAt,
}

// idPattern chặn ký tự bẻ được namespace: id "a:pod" sẽ biến "session:a:pod"
// thành key thuộc về session khác, và "a:ws" đâm thẳng vào bộ đếm WS.
//
// Cùng một pattern gác cả ba loại định danh — session id, tên pod, và
// idempotency key. Tên pod orchestrator sinh là RFC1123 label (sandbox-<hex>),
// tập con thực sự của pattern này. idempotency key thì TỚI TỪ CLIENT (proto bắt
// buộc field đó), nên nó là dữ liệu không tin được và phải qua đúng cổng này.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Session trả key hash trạng thái session — SSOT của session đang sống.
func Session(sessionID string) (string, error) {
	if err := validateID(sessionID); err != nil {
		return "", err
	}
	return "session:" + sessionID, nil
}

// SessionPod trả key ánh xạ session → tên pod đang phục vụ nó.
func SessionPod(sessionID string) (string, error) {
	if err := validateID(sessionID); err != nil {
		return "", err
	}
	return "session:" + sessionID + ":pod", nil
}

// SessionWS trả key đếm số WS đang mở của session (trần
// GATEWAY_MAX_WS_PER_SESSION, phase-1 D17).
//
// Key này PHẢI được đặt TTL bằng TTL của session: bộ đếm INCR trước upgrade và
// DECR trong defer, nên gateway bị SIGKILL giữa phiên sẽ không bao giờ DECR —
// không TTL thì session khoá vĩnh viễn ở trạng thái "đang mở ở tab khác".
func SessionWS(sessionID string) (string, error) {
	if err := validateID(sessionID); err != nil {
		return "", err
	}
	return "session:" + sessionID + ":ws", nil
}

// Pod trả key hash state machine của một pod sandbox
// (free → claimed → active → reaping → gone).
func Pod(podName string) (string, error) {
	if err := validateID(podName); err != nil {
		return "", err
	}
	return "pod:" + podName, nil
}

// Idem trả key dedupe cho idempotency_key của CreateSession, SCOPE THEO USER.
//
// VÌ SAO CÓ userID TRONG KEY — không phải để cho gọn namespace:
// `session.proto` quy định trúng key cũ thì "trả lại đúng session cũ". Với một
// namespace `idem:{key}` toàn cục, user B gửi trùng idempotency_key của user A
// sẽ nhận lại **session của A** — tức là B biết `sessionId` của A (chính thứ mà
// toàn bộ mô hình chống IDOR bảo vệ), và BFF sẽ mint cho B một token
// `sub=B, sid=sessionA` đi qua được bước e và f của handshake, chỉ chết ở bước g.
// Vế g khi đó không còn là phòng thủ chiều sâu mà là lớp DUY NHẤT chặn B vào
// shell của A. Kèm theo là DoS chéo: A đoán trúng key của B thì terminal của A
// 403 vĩnh viễn.
//
// Cả hai đoạn đều được validate riêng, nên `:` không thể dùng để nhảy scope.
// Đối số thứ hai tới từ client — proto bắt buộc field đó và không ràng buộc nội
// dung, nên đây là bề mặt tấn công thật, không phải kiểm tra hình thức.
func Idem(userID, idempotencyKey string) (string, error) {
	if err := validateID(userID); err != nil {
		return "", fmt.Errorf("user id cho idem key: %w", err)
	}
	if err := validateID(idempotencyKey); err != nil {
		return "", fmt.Errorf("idempotency key: %w", err)
	}
	return "idem:" + userID + ":" + idempotencyKey, nil
}

// ValidateID phơi cổng validate cho caller cần kiểm định danh TRƯỚC khi nó
// được ghi vào một hash (không chỉ khi dựng key). Ví dụ: pool.Claim ghi userId
// vào hash session:{id} — gateway sẽ so sánh nguyên văn giá trị đó (authz vế g),
// nên nó phải qua đúng cổng này dù không xuất hiện trong tên key nào.
func ValidateID(id string) error {
	return validateID(id)
}

func validateID(id string) error {
	if !idPattern.MatchString(id) {
		return fmt.Errorf("định danh %q không hợp lệ cho Redis key (cần khớp %s)", id, idPattern)
	}
	return nil
}
