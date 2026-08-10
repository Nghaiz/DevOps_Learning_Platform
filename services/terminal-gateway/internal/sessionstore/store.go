// Package sessionstore là cửa duy nhất gateway chạm Redis.
//
// PHẠM VI ĐƯỢC PHÉP (phase-1 D2): ĐỌC hash `session:{id}` cho authz per-session,
// và ghi bộ đếm `session:{id}:ws` do CHÍNH gateway sở hữu. KHÔNG ghi bất kỳ
// field nào của trạng thái session — `session.proto` cấm cụ thể một kênh
// mutation thứ hai; mọi thay đổi trạng thái đi qua ExtendSession/ReapSession.
//
// VÌ SAO KHÔNG DÙNG LẠI lifecycle.Load CỦA ORCHESTRATOR: nó nằm dưới
// `services/orchestrator/internal/` nên module khác KHÔNG import được — chặn ở
// compile, không phải lựa chọn kiến trúc (D7). Thứ hai bản song sinh này KHÔNG
// được phép trôi là TÊN FIELD, và tên field tới từ `services/shared/rediskeys`
// dùng chung. Bộ giải mã ở đây cố ý chỉ đọc đúng 5 field authz cần.
package sessionstore

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
	"github.com/redis/go-redis/v9"
)

// ErrNotFound là "hash session:{id} không còn trong Redis" — bước f của
// contract §3 (404).
var ErrNotFound = errors.New("sessionstore: session không tồn tại")

// ErrWSLimitReached là "session đã có đủ WS đang mở" — bước i (429).
var ErrWSLimitReached = errors.New("sessionstore: đã chạm trần WS của session")

// Trạng thái session được phép mở terminal (bước h). Chuỗi NGẮN, đúng như
// orchestrator ghi — nó giữ dạng ngắn trong Redis trong khi `tier` giữ dạng đầy
// đủ của enum proto. Bất đối xứng đó là CONTRACT, không phải nhầm lẫn: đổi sang
// "SESSION_STATUS_CLAIMED" ở đây làm authz trượt trong im lặng.
const (
	StatusClaimed = "CLAIMED"
	StatusRunning = "RUNNING"
)

//go:embed acquire_ws.lua
var acquireWSSrc string

//go:embed release_ws.lua
var releaseWSSrc string

// redis.NewScript tự thử EVALSHA rồi rơi về EVAL khi gặp NOSCRIPT — đúng thứ
// cần sau một lần Redis restart / SCRIPT FLUSH (bài học A5 của spike claim).
var (
	acquireWSScript = redis.NewScript(acquireWSSrc)
	releaseWSScript = redis.NewScript(releaseWSSrc)
)

// Session là phần hash `session:{id}` mà authz dùng.
type Session struct {
	// UserID là vế `hash.userId` của bước g.
	UserID string
	// PodName + Namespace là đích của exec ở G4 (1.C-2).
	PodName   string
	Namespace string
	// Status quyết định bước h.
	Status string
	// ExpiresAt là hạn của session (epoch giây). Dùng để đặt TTL cho bộ đếm WS.
	ExpiresAt int64
}

// Active trả true khi session được phép mở terminal (bước h).
func (s *Session) Active() bool {
	return s.Status == StatusClaimed || s.Status == StatusRunning
}

// Store đọc Redis cho gateway.
type Store struct {
	rdb redis.UniversalClient
	now func() time.Time
}

// New dựng store trên một client sẵn có.
func New(rdb redis.UniversalClient) *Store {
	return &Store{rdb: rdb, now: time.Now}
}

// SetClock thay đồng hồ (chỉ dùng trong test).
func (s *Store) SetClock(now func() time.Time) { s.now = now }

// Get đọc hash session:{id}.
func (s *Store) Get(ctx context.Context, sessionID string) (*Session, error) {
	key, err := rediskeys.Session(sessionID)
	if err != nil {
		// Id không qua nổi cổng pattern trả ĐÚNG lỗi "không tồn tại", không
		// phải một lỗi riêng: một thông báo "id sai định dạng" tách được khỏi
		// "không tìm thấy" là một oracle bé để dò không gian id. Cùng lý lẽ với
		// lifecycle.Load bên orchestrator.
		return nil, ErrNotFound
	}

	vals, err := s.rdb.HMGet(ctx, key,
		rediskeys.FieldUserID,
		rediskeys.FieldPodName,
		rediskeys.FieldNamespace,
		rediskeys.FieldStatus,
		rediskeys.FieldExpiresAt,
	).Result()
	if err != nil {
		return nil, fmt.Errorf("sessionstore: HMGET %s: %w", key, err)
	}

	str := func(i int) string {
		v, _ := vals[i].(string)
		return v
	}

	out := &Session{
		UserID:    str(0),
		PodName:   str(1),
		Namespace: str(2),
		Status:    str(3),
	}
	if raw := str(4); raw != "" {
		// Hạn hỏng KHÔNG được coi là session hợp lệ: TTL của bộ đếm WS suy ra
		// từ nó, và một giá trị 0 sẽ làm PEXPIRE lỗi ⇒ handshake trả 500 ở tận
		// bước i. Để 0 và để CheckWS quyết định — xem AcquireWS.
		if _, err := fmt.Sscanf(raw, "%d", &out.ExpiresAt); err != nil {
			out.ExpiresAt = 0
		}
	}

	// HMGET trên key KHÔNG tồn tại trả một mảng toàn nil — không phải error,
	// không phải redis.Nil. Bỏ qua chỗ này thì "session không tồn tại" đi tiếp
	// dưới dạng một Session rỗng và bước g so sánh userId với chuỗi rỗng.
	if out.UserID == "" {
		return nil, ErrNotFound
	}
	return out, nil
}

// Alive trả true khi session vẫn còn và vẫn ở trạng thái chạy được.
//
// Dùng trên ĐƯỜNG ĐÓNG của một phiên terminal (contract §6): exit code 137/143
// KHÔNG phân biệt được "pod bị reap" với "người dùng tự `kill -9` trong pod của
// mình", nên gateway phải hỏi Redis mới chọn được `4404` hay `1000`.
//
// "Không tồn tại" trả `(false, nil)` chứ KHÔNG phải lỗi: với câu hỏi này thì
// key đã mất là một CÂU TRẢ LỜI hợp lệ ("đã reap"), không phải sự cố. Trộn hai
// thứ đó buộc caller phải phân loại lỗi để biết ý nghĩa, và đó là cách nhánh
// 4404 lặng lẽ không bao giờ chạy.
func (s *Store) Alive(ctx context.Context, sessionID string) (bool, error) {
	sess, err := s.Get(ctx, sessionID)
	switch {
	case errors.Is(err, ErrNotFound):
		return false, nil
	case err != nil:
		return false, err
	}
	return sess.Active(), nil
}

// AcquireWS chiếm một khe WS của session (bước i).
//
// Trả hàm release để caller `defer`. Chạm trần → ErrWSLimitReached và release là
// hàm rỗng (KHÔNG nil — một `defer release()` trên nil là panic đúng lúc gateway
// đang từ chối một request, tức biến một 429 thành một 500 kèm stack trace).
//
// release trả error CHỨ KHÔNG nuốt: khi nó hỏng, TTL là thứ DUY NHẤT còn lại gỡ
// khoá session, và người vận hành cần thấy dấu vết trước khi sinh viên báo
// "terminal của em bảo đang mở ở tab khác" suốt một giờ.
func (s *Store) AcquireWS(ctx context.Context, sessionID string, limit int, expiresAt int64) (release func(context.Context) error, err error) {
	noop := func(context.Context) error { return nil }

	key, err := rediskeys.SessionWS(sessionID)
	if err != nil {
		return noop, fmt.Errorf("sessionstore: dựng key đếm WS: %w", err)
	}

	ttl := time.Unix(expiresAt, 0).Sub(s.now())
	if ttl <= 0 {
		// Session đã quá hạn theo chính field của nó nhưng hash vẫn còn (reaper
		// chưa kịp chạy). Từ chối luôn thay vì đặt một TTL âm/0: PEXPIRE với giá
		// trị ≤ 0 XOÁ key ngay, nên khe vừa chiếm biến mất và trần WS im lặng
		// mất tác dụng đúng ở session này.
		return noop, fmt.Errorf("%w: session hết hạn theo expiresAt", ErrNotFound)
	}

	n, err := acquireWSScript.Run(ctx, s.rdb, []string{key}, limit, ttl.Milliseconds()).Int64()
	if err != nil {
		return noop, fmt.Errorf("sessionstore: chiếm khe WS %s: %w", key, err)
	}
	if n < 0 {
		return noop, ErrWSLimitReached
	}

	return func(ctx context.Context) error {
		if err := releaseWSScript.Run(ctx, s.rdb, []string{key}).Err(); err != nil {
			return fmt.Errorf("sessionstore: trả khe WS %s: %w", key, err)
		}
		return nil
	}, nil
}
