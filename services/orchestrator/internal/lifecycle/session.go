// Package lifecycle hiện thực vòng đời session: tạo, claim, đọc.
//
// SSOT của một session ĐANG SỐNG là hash `session:{id}` trong Redis — không
// phải Postgres (chỉ audit), không phải bộ nhớ của process này (orchestrator
// chạy 2 replica). Mọi hàm ở đây đọc/ghi hash đó qua helper của `rediskeys`.
package lifecycle

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/protobuf/types/known/timestamppb"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// ErrSessionNotFound là "hash session:{id} không còn trong Redis".
//
// Tầng RPC dịch nó thành codes.NotFound — và dịch cả ca "session tồn tại nhưng
// của user khác" thành ĐÚNG mã đó. Xem ownerOrNotFound.
var ErrSessionNotFound = errors.New("lifecycle: session không tồn tại")

// statusPrefix nối giá trị NGẮN trong Redis với tên đầy đủ của enum proto.
//
// Redis giữ dạng ngắn ("CLAIMED") còn `tier` thì giữ dạng ĐẦY ĐỦ
// ("SANDBOX_TIER_SYSBOX") — bất đối xứng có thật, và nó là CONTRACT chứ không
// phải nhầm lẫn: `docs/ws-terminal-protocol.md` bắt gateway kiểm
// `status ∈ {CLAIMED, RUNNING}` bằng đúng chuỗi ngắn đó. Đổi sang dạng đầy đủ
// ở đây là làm authz của gateway so sánh trượt trong im lặng.
const statusPrefix = "SESSION_STATUS_"

// fieldProfile là field "profile" của hash session:{id} (P7 7.C).
//
// ⛔ CỐ Ý KHÔNG nằm trong rediskeys.SessionFields. Field đó là vector CROSS-
// SERVICE — gateway (module Go RIÊNG) đọc nó cho authz per-session, và mọi
// thay đổi ở đó buộc phải đi cùng docs/redis-key-vectors.json +
// packages/shared-types/src/redis-keys.ts (test hai-bên-song-sinh). "profile"
// KHÔNG phải dữ liệu gateway cần: gateway chỉ nối vào pod theo `podName`, và
// resources của pod đã CHỐT lúc tạo (podspec.go) — biết "profile" thêm lần
// nữa ở tầng authz không mở khả năng nào mới. Chỉ orchestrator tự đọc field
// này (Load bên dưới), nên nó ở lại như một hằng CỤC BỘ của package này.
//
// Field VẮNG trên hash (mọi session đường mặc định — claim.lua không ghi nó)
// ⇒ HMGET trả nil cho vị trí đó ⇒ Session.Profile = "" — đúng nghĩa "profile
// mặc định" mà session.proto quy định. Không cần giá trị default nào khác.
const fieldProfile = "profile"

// sessionFieldsWithProfile = rediskeys.SessionFields + "profile", dựng MỘT
// LẦN cho cả process. KHÔNG append() thẳng vào rediskeys.SessionFields (slice
// export của package khác) — append có thể ghi đè lên mảng nền của slice đó
// nếu capacity còn dư, và hai package dùng chung một mảng là đúng loại race âm
// thầm mà "một biến, một chủ sở hữu" tồn tại để tránh.
var sessionFieldsWithProfile = func() []string {
	out := make([]string, 0, len(rediskeys.SessionFields)+1)
	out = append(out, rediskeys.SessionFields...)
	out = append(out, fieldProfile)
	return out
}()

// Session là hash `session:{id}` đã giải mã. Tên field khớp
// rediskeys.SessionFields — nguồn duy nhất cho cả Go lẫn TS — CỘNG "profile",
// field cục bộ của orchestrator (xem fieldProfile).
type Session struct {
	ID           string
	UserID       string
	PodName      string
	Namespace    string
	Status       string
	Tier         string
	CreatedAt    int64
	ExpiresAt    int64
	Revision     int64
	LastActiveAt int64
	// Profile rỗng = profile mặc định (session.proto). Xem fieldProfile.
	Profile string
}

// Load đọc hash session:{id}. Không tồn tại → ErrSessionNotFound.
func Load(ctx context.Context, rdb redis.Cmdable, sessionID string) (*Session, error) {
	key, err := rediskeys.Session(sessionID)
	if err != nil {
		// ID không qua nổi cổng pattern KHÔNG được trả lỗi riêng: nó tới thẳng
		// từ client, và một thông báo "id sai định dạng" khác với "không tìm
		// thấy" là một oracle bé xíu để dò không gian id.
		return nil, ErrSessionNotFound
	}

	vals, err := rdb.HMGet(ctx, key, sessionFieldsWithProfile...).Result()
	if err != nil {
		return nil, fmt.Errorf("lifecycle: HMGET %s: %w", key, err)
	}

	str := func(i int) string {
		s, _ := vals[i].(string)
		return s
	}
	num := func(i int) int64 {
		n, _ := strconv.ParseInt(str(i), 10, 64)
		return n
	}

	s := &Session{
		ID:           sessionID,
		UserID:       str(0),
		PodName:      str(1),
		Namespace:    str(2),
		Status:       str(3),
		Tier:         str(4),
		CreatedAt:    num(5),
		ExpiresAt:    num(6),
		Revision:     num(7),
		LastActiveAt: num(8),
		Profile:      str(9),
	}

	// HMGET trên key không tồn tại trả về một mảng toàn nil — KHÔNG phải lỗi,
	// KHÔNG phải redis.Nil. Không kiểm ở đây thì "session không tồn tại" đi
	// tiếp dưới dạng một Session rỗng, và mọi so sánh authz sau đó là so với
	// chuỗi rỗng.
	if s.UserID == "" {
		return nil, ErrSessionNotFound
	}
	return s, nil
}

// OwnedBy trả session nếu userID khớp, ngược lại trả ErrSessionNotFound.
//
// ⛔ TRẢ NotFound CHỨ KHÔNG PHẢI PermissionDenied — đây là quyết định bảo mật,
// không phải lười. `PermissionDenied` XÁC NHẬN session đó tồn tại, biến chính
// RPC này thành oracle dò id: kẻ tấn công quét id và tách được "có thật" khỏi
// "không có" chỉ bằng mã lỗi. Hai ca trả cùng một mã, ở cùng một bước, qua cùng
// một đường code thì không còn kênh phụ nào để đếm.
func (s *Session) OwnedBy(userID string) (*Session, error) {
	if s.UserID != userID {
		return nil, ErrSessionNotFound
	}
	return s, nil
}

// ToProto chuyển sang message của contract.
func (s *Session) ToProto() *orchestratorv1.Session {
	out := &orchestratorv1.Session{
		Id:        s.ID,
		UserId:    s.UserID,
		Status:    parseStatus(s.Status),
		PodName:   s.PodName,
		Namespace: s.Namespace,
		Tier:      parseTier(s.Tier),
		Revision:  s.Revision,
		Profile:   s.Profile,
	}
	if s.CreatedAt > 0 {
		out.CreatedAt = timestamppb.New(time.Unix(s.CreatedAt, 0))
	}
	// expires_at RỖNG cho tới khi session được claim (comment trong proto). Giữ
	// nil thay vì Unix(0) — 1970 đi ra FE là "phiên đã hết hạn 56 năm trước".
	if s.ExpiresAt > 0 {
		out.ExpiresAt = timestamppb.New(time.Unix(s.ExpiresAt, 0))
	}
	return out
}

func parseStatus(short string) orchestratorv1.SessionStatus {
	if short == "" {
		return orchestratorv1.SessionStatus_SESSION_STATUS_UNSPECIFIED
	}
	if v, ok := orchestratorv1.SessionStatus_value[statusPrefix+short]; ok {
		return orchestratorv1.SessionStatus(v)
	}
	return orchestratorv1.SessionStatus_SESSION_STATUS_UNSPECIFIED
}

func parseTier(full string) orchestratorv1.SandboxTier {
	if v, ok := orchestratorv1.SandboxTier_value[full]; ok {
		return orchestratorv1.SandboxTier(v)
	}
	return orchestratorv1.SandboxTier_SANDBOX_TIER_UNSPECIFIED
}

// sessionIDBytes = 16 byte = 128 bit.
//
// Khác hẳn tên pod (48 bit, chỉ chống trùng): sessionID nằm trong URL
// `/ws/session/{id}` và là thứ bước authz `e` so sánh, nên nó phải CHỐNG ĐOÁN.
// Với 128 bit thì quét không gian id là vô vọng, và nhờ vậy nhánh "id lạ → 403"
// của gateway không bao giờ bị dùng làm oracle đếm session đang sống.
const sessionIDBytes = 16

// NewSessionID sinh id ngẫu nhiên khớp cổng pattern của rediskeys.
func NewSessionID() (string, error) {
	buf := make([]byte, sessionIDBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("lifecycle: sinh session id: %w", err)
	}
	return hex.EncodeToString(buf), nil
}
