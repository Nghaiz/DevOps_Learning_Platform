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
	"strconv"
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

//go:embed refresh_ws.lua
var refreshWSSrc string

// redis.NewScript tự thử EVALSHA rồi rơi về EVAL khi gặp NOSCRIPT — đúng thứ
// cần sau một lần Redis restart / SCRIPT FLUSH (bài học A5 của spike claim).
var (
	acquireWSScript = redis.NewScript(acquireWSSrc)
	releaseWSScript = redis.NewScript(releaseWSSrc)
	refreshWSScript = redis.NewScript(refreshWSSrc)
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

	// Revision là bộ đếm tăng đơn điệu của hash, gửi làm `expected_revision`
	// trong ExtendSession (G7). Đọc ở đây thay vì gọi thêm một RPC `GetSession`:
	// D2 cho phép gateway ĐỌC hash, và đây đúng là một lượt đọc.
	Revision int64

	// CreatedAt là mốc tạo session (epoch giây).
	//
	// ⛔ TỒN TẠI VÌ MỘT NHÁNH LỖI, KHÔNG PHẢI VÌ ĐỦ BỘ. `extend.lua` từ chối
	// bằng `state:` cho HAI chuyện khác hẳn nhau — trạng thái cuối đời, VÀ hash
	// thiếu `createdAt` (không tính được trần cứng). Cả hai tới gateway dưới
	// cùng một mã gRPC `FailedPrecondition`. Không đọc field này thì nhánh hash
	// hỏng bị phân loại nhầm thành "chạm trần cứng" và sinh viên nhận `4409`
	// cho một sự cố dữ liệu. Xem extend.classify.
	CreatedAt int64
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
		rediskeys.FieldRevision,
		rediskeys.FieldCreatedAt,
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
	// Số hỏng/thiếu để về 0, KHÔNG phải lỗi. Với `expiresAt` thì TTL của bộ đếm
	// WS suy ra từ nó và AcquireWS đã có nhánh từ chối cho giá trị ≤ 0; với
	// `revision` thì 0 nghĩa là "bỏ qua kiểm" đúng theo proto; với `createdAt`
	// thì 0 là tín hiệu hash hỏng mà extend.classify đọc. Cả ba đều có người
	// đọc số 0 và biết phải làm gì, nên trả lỗi ở đây chỉ đẩy quyết định lên
	// một tầng không đủ ngữ cảnh để quyết.
	out.ExpiresAt = parseEpoch(str(4))
	out.Revision = parseEpoch(str(5))
	out.CreatedAt = parseEpoch(str(6))

	// HMGET trên key KHÔNG tồn tại trả một mảng toàn nil — không phải error,
	// không phải redis.Nil. Bỏ qua chỗ này thì "session không tồn tại" đi tiếp
	// dưới dạng một Session rỗng và bước g so sánh userId với chuỗi rỗng.
	if out.UserID == "" {
		return nil, ErrNotFound
	}
	return out, nil
}

// parseEpoch đọc một field số của hash. Rỗng / không parse được → 0.
//
// strconv chứ không phải fmt.Sscanf: Sscanf CHẤP NHẬN tiền tố số rồi bỏ qua
// phần đuôi, nên `"123abc"` trả 123 không lỗi — một hash bị ghi hỏng sẽ đi tiếp
// dưới dạng một con số trông hợp lệ.
func parseEpoch(raw string) int64 {
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0
	}
	return n
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
// leaseTTL tính TTL cho khe WS: lease ngắn, nhưng KHÔNG bao giờ dài hơn phần
// đời còn lại của session.
//
// ⛔ VÌ SAO LEASE NGẮN THAY VÌ `expiresAt - now` (đổi ở 3.H).
// `DECR` khe nằm trong defer của phiên. SIGKILL, OOM-kill, mất node — không ca
// nào cho defer chạy, và `http.Server.Shutdown` KHÔNG theo dõi kết nối đã hijack
// nên rollout cũng không. TTL vì thế là đường thoát duy nhất khỏi "session khoá
// ở trạng thái đang mở ở tab khác", đúng như `acquire_ws.lua` đã ghi. Nhưng một
// TTL dài bằng cả phiên (tới hàng chục phút) thì đường thoát ấy dài ngang việc
// không có đường thoát: đo được ở baseline 3.H — 2/2 phiên KHÔNG vào lại được.
//
// Lease ngắn + gia hạn theo nhịp đổi chi phí ấy lấy một lượt PEXPIRE mỗi nhịp.
//
// ⛔ VẪN PHẢI CẮT TRẦN Ở `expiresAt`: một khe sống lâu hơn chính phiên là rác
// giữ khoá cho một session đã chết.
func (s *Store) leaseTTL(expiresAt int64, lease time.Duration) time.Duration {
	conLai := time.Unix(expiresAt, 0).Sub(s.now())
	if conLai <= 0 {
		return conLai
	}
	if lease > 0 && lease < conLai {
		return lease
	}
	return conLai
}

// AcquireWS giữ một khe WS của session (trần `limit`), với lease tự hết hạn để
// khe không kẹt vĩnh viễn khi tiến trình giữ nó chết đột ngột. Hàm release trả
// về nhả khe đó.
func (s *Store) AcquireWS(ctx context.Context, sessionID string, limit int, expiresAt int64, lease time.Duration) (release func(context.Context) error, err error) {
	noop := func(context.Context) error { return nil }

	key, err := rediskeys.SessionWS(sessionID)
	if err != nil {
		return noop, fmt.Errorf("sessionstore: dựng key đếm WS: %w", err)
	}

	ttl := s.leaseTTL(expiresAt, lease)
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

// ErrWSSlotGone nghĩa là khe không còn tồn tại lúc gia hạn.
//
// Phân biệt với lỗi Redis là CÓ CHỦ Ý: "khe biến mất" và "Redis không trả lời"
// đòi hai phản ứng khác nhau. Khe biến mất giữa phiên nghĩa là hoặc TTL đã hết
// (nhịp gia hạn không theo kịp — một lỗi cấu hình), hoặc ai đó đã release nhầm.
// Gộp cả hai vào một `error` chung thì cái thứ nhất lẫn vào nhiễu hạ tầng.
var ErrWSSlotGone = errors.New("sessionstore: khe WS không còn tồn tại")

// RefreshWS gia hạn lease của khe WS đang giữ (3.H).
//
// Gọi theo nhịp trong suốt vòng đời phiên. Không gia hạn được KHÔNG phải lý do
// đóng phiên: khe hết hạn chỉ làm một client KHÁC chiếm được chỗ, mà trần WS là
// tiện nghi chống-hai-tab chứ không phải hàng rào an ninh (authz đã chặn ở chín
// bước trước đó). Cắt phiên của người đang gõ vì một lượt PEXPIRE lỗi là đổi một
// phiền toái nhỏ lấy một sự cố thật.
func (s *Store) RefreshWS(ctx context.Context, sessionID string, expiresAt int64, lease time.Duration) error {
	key, err := rediskeys.SessionWS(sessionID)
	if err != nil {
		return fmt.Errorf("sessionstore: dựng key đếm WS: %w", err)
	}

	ttl := s.leaseTTL(expiresAt, lease)
	if ttl <= 0 {
		// Phiên đã quá hạn: để khe tự rụng. Gia hạn ở đây là kéo dài một khe
		// thuộc về session không còn sống.
		return ErrWSSlotGone
	}

	n, err := refreshWSScript.Run(ctx, s.rdb, []string{key}, ttl.Milliseconds()).Int64()
	if err != nil {
		return fmt.Errorf("sessionstore: gia hạn khe WS %s: %w", key, err)
	}
	if n == 0 {
		return ErrWSSlotGone
	}
	return nil
}
