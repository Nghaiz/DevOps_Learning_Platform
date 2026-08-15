package sessionstore_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/redistest"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/redis/go-redis/v9"
)

// seedSession ghi hash session:{id} giống hệt cách orchestrator ghi.
func seedSession(t *testing.T, rdb *redis.Client, id, userID, status string, expiresAt time.Time) {
	t.Helper()
	key, err := rediskeys.Session(id)
	if err != nil {
		t.Fatalf("dựng key: %v", err)
	}
	if err := rdb.HSet(context.Background(), key,
		rediskeys.FieldUserID, userID,
		rediskeys.FieldPodName, "sandbox-deadbeef",
		rediskeys.FieldNamespace, "dlp-sandbox",
		rediskeys.FieldStatus, status,
		rediskeys.FieldExpiresAt, expiresAt.Unix(),
	).Err(); err != nil {
		t.Fatalf("seed session: %v", err)
	}
}

func TestGetDocDuocHashOrchestratorGhi(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	seedSession(t, rdb, "sess-a", "user-a", sessionstore.StatusClaimed, time.Now().Add(time.Hour))

	got, err := store.Get(context.Background(), "sess-a")
	if err != nil {
		t.Fatalf("Get() lỗi: %v", err)
	}
	if got.UserID != "user-a" || got.PodName != "sandbox-deadbeef" || got.Namespace != "dlp-sandbox" {
		t.Fatalf("Get() = %+v — lệch với thứ orchestrator ghi", got)
	}
	if !got.Active() {
		t.Fatalf("status %q phải Active()", got.Status)
	}
}

// HMGET trên key KHÔNG tồn tại trả một mảng toàn nil — không error, không
// redis.Nil. Bỏ qua chỗ đó thì "session không tồn tại" đi tiếp dưới dạng một
// Session rỗng và bước g của handshake so userId với chuỗi rỗng.
func TestGetKeyVangTraErrNotFoundChuKhongPhaiSessionRong(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	if _, err := store.Get(context.Background(), "khong-ton-tai"); !errors.Is(err, sessionstore.ErrNotFound) {
		t.Fatalf("Get() key vắng muốn ErrNotFound, nhận %v", err)
	}
}

// Id không qua nổi cổng pattern trả ĐÚNG "không tồn tại", không phải một lỗi
// riêng: một thông báo tách "id sai định dạng" khỏi "không tìm thấy" là một
// oracle bé để dò không gian id.
func TestGetIdBeNamespaceTraCungMotLoi(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	for _, id := range []string{"a:ws", "a:pod", ""} {
		if _, err := store.Get(context.Background(), id); !errors.Is(err, sessionstore.ErrNotFound) {
			t.Fatalf("Get(%q) muốn ErrNotFound, nhận %v", id, err)
		}
	}
}

func TestActiveChiNhanClaimedVaRunning(t *testing.T) {
	for status, want := range map[string]bool{
		"CLAIMED": true, "RUNNING": true,
		"EXPIRED": false, "REAPED": false, "FAILED": false, "": false,
		// Dạng ĐẦY ĐỦ của enum proto phải KHÔNG khớp: Redis giữ dạng ngắn và
		// bất đối xứng đó là contract. Nếu ca này xanh thì ai đó đã nới điều
		// kiện, và authz sẽ cho qua một session mà orchestrator coi là chết.
		"SESSION_STATUS_CLAIMED": false,
	} {
		s := &sessionstore.Session{Status: status}
		if got := s.Active(); got != want {
			t.Errorf("Active() với status=%q = %v, muốn %v", status, got, want)
		}
	}
}

// ⛔ TRẦN 1 WS (D17). Hai client attach cùng một tmux session ép MỘT kích thước
// cửa sổ theo client hoạt động gần nhất — tab thứ hai không "thêm terminal", nó
// CO tab thứ nhất xuống rồi lật qua lại mỗi keystroke.
func TestAcquireWSChanKetNoiThuHai(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	exp := time.Now().Add(time.Hour).Unix()

	release, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0)
	if err != nil {
		t.Fatalf("khe đầu tiên phải chiếm được: %v", err)
	}

	if _, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0); !errors.Is(err, sessionstore.ErrWSLimitReached) {
		t.Fatalf("khe thứ hai muốn ErrWSLimitReached, nhận %v", err)
	}

	// ...và trần chặn ĐỒNG THỜI chứ không chặn NỐI LẠI.
	if err := release(context.Background()); err != nil {
		t.Fatalf("release: %v", err)
	}
	release2, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0)
	if err != nil {
		t.Fatalf("sau khi đóng WS thứ nhất, mở lại phải được (reconnect): %v", err)
	}
	_ = release2(context.Background())
}

// ⛔ CA CHỐNG "KHOÁ VĨNH VIỄN". Gateway bị SIGKILL giữa phiên thì DECR nằm trong
// defer của một tiến trình đã chết — nó KHÔNG BAO GIỜ chạy. TTL trên
// session:{id}:ws là đường thoát DUY NHẤT; thiếu nó thì session của sinh viên
// kẹt ở "đang mở ở tab khác" cho tới khi có người vào Redis xoá tay.
func TestAcquireWSLuonDatTTLTrongCungMotLuot(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	if _, err := store.AcquireWS(context.Background(), "sess-a", 1, time.Now().Add(30*time.Minute).Unix(), 0); err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}

	key, err := rediskeys.SessionWS("sess-a")
	if err != nil {
		t.Fatalf("dựng key: %v", err)
	}
	ttl, err := rdb.TTL(context.Background(), key).Result()
	if err != nil {
		t.Fatalf("TTL: %v", err)
	}
	// -1 = key tồn tại nhưng KHÔNG có hạn — đúng chế độ hỏng nói ở trên.
	if ttl <= 0 {
		t.Fatalf("TTL(%s) = %v — bộ đếm WS không có hạn thì một lần gateway crash khoá session vĩnh viễn", key, ttl)
	}
	if ttl > 30*time.Minute {
		t.Fatalf("TTL(%s) = %v, dài hơn hạn của session — khoá sống lâu hơn thứ nó khoá", key, ttl)
	}
}

// Session đã quá hạn theo chính field của nó (reaper chưa kịp chạy) phải bị từ
// chối, KHÔNG phải đặt TTL ≤ 0: PEXPIRE với giá trị ≤ 0 XOÁ key ngay, nên khe
// vừa chiếm biến mất và trần WS im lặng mất tác dụng đúng ở session này.
func TestAcquireWSTuChoiSessionDaQuaHan(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	_, err := store.AcquireWS(context.Background(), "sess-a", 1, time.Now().Add(-time.Minute).Unix(), 0)
	if !errors.Is(err, sessionstore.ErrNotFound) {
		t.Fatalf("AcquireWS với expiresAt đã qua muốn ErrNotFound, nhận %v", err)
	}
	key, _ := rediskeys.SessionWS("sess-a")
	if n, _ := rdb.Exists(context.Background(), key).Result(); n != 0 {
		t.Fatalf("ca bị từ chối vẫn để lại key %s — bộ đếm rò", key)
	}
}

// Release cuối cùng phải XOÁ key, không để lại một key giá trị "0": key rác đó
// vẫn hiện trong mọi lượt SCAN của người đi chẩn đoán và làm "session này có ai
// đang mở không" đọc thành CÓ trong khi câu trả lời là KHÔNG.
func TestReleaseCuoiCungXoaKey(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	release, err := store.AcquireWS(context.Background(), "sess-a", 1, time.Now().Add(time.Hour).Unix(), 0)
	if err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}
	if err := release(context.Background()); err != nil {
		t.Fatalf("release: %v", err)
	}

	key, _ := rediskeys.SessionWS("sess-a")
	if n, _ := rdb.Exists(context.Background(), key).Result(); n != 0 {
		t.Fatalf("key %s còn lại sau lần release cuối", key)
	}
}

// Double-release (bug ở caller) không được đẩy bộ đếm xuống ÂM: số âm thì vĩnh
// viễn nhỏ hơn trần, tức trần WS lặng lẽ biến mất đúng ở session đó.
func TestReleaseThuaKhongDayBoDemXuongAm(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	exp := time.Now().Add(time.Hour).Unix()

	release, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0)
	if err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}
	for i := 0; i < 3; i++ {
		if err := release(context.Background()); err != nil {
			t.Fatalf("release lần %d: %v", i, err)
		}
	}

	// Trần vẫn phải còn tác dụng sau khi bị release thừa.
	if _, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0); err != nil {
		t.Fatalf("chiếm lại sau release thừa: %v", err)
	}
	if _, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0); !errors.Is(err, sessionstore.ErrWSLimitReached) {
		t.Fatalf("trần WS mất tác dụng sau release thừa: %v", err)
	}
}

// Script Lua phải sống qua SCRIPT FLUSH: go-redis thử EVALSHA rồi rơi về EVAL
// khi gặp NOSCRIPT. Đây chính là bài học A5 của spike claim, áp cho script mới.
//
// ⛔ `SCRIPT FLUSH` LÀ LỆNH TOÀN SERVER, KHÔNG THEO DB. Việc mỗi package test
// dùng một DB riêng (xem internal/redistest) cô lập được KEY nhưng KHÔNG cô lập
// được cache script — nên test này xoá cache của MỌI package, ở MỌI module,
// đang dùng chung Redis đó.
//
// Điều đó đã có hậu quả thật: nó làm đỏ `TestClaimIdempotentDocLaiKhiMatReply`
// bên services/orchestrator, một test mà chặng này không hề chạm. Bug nằm ở hook
// của test kia (nó nuốt reply của cả lời gọi trả NOSCRIPT, tức lời gọi mà script
// CHƯA chạy) và đã được vá cùng chặng — nhưng bài học chung là: thêm một lệnh
// toàn-server vào một suite chạy song song thì phải soát các suite khác, vì
// không có cổng nào ép chúng độc lập.
func TestScriptSongSotSauScriptFlush(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	exp := time.Now().Add(time.Hour).Unix()

	release, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0)
	if err != nil {
		t.Fatalf("AcquireWS lần đầu: %v", err)
	}
	if err := release(context.Background()); err != nil {
		t.Fatalf("release: %v", err)
	}

	if err := rdb.ScriptFlush(context.Background()).Err(); err != nil {
		t.Fatalf("SCRIPT FLUSH: %v", err)
	}

	release2, err := store.AcquireWS(context.Background(), "sess-a", 1, exp, 0)
	if err != nil {
		t.Fatalf("sau SCRIPT FLUSH, AcquireWS phải tự rơi về EVAL: %v", err)
	}
	if err := release2(context.Background()); err != nil {
		t.Fatalf("sau SCRIPT FLUSH, release phải tự rơi về EVAL: %v", err)
	}
}

// Đua thật: N goroutine cùng chiếm một session với trần 1 → đúng 1 thắng.
// Trần WS chạy trên đường công khai và hai tab mở gần như đồng thời là chuyện
// bình thường, nên "đúng 1" phải đúng cả dưới -race.
func TestAcquireWSDuaChiMotThang(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	exp := time.Now().Add(time.Hour).Unix()

	const n = 50
	results := make(chan error, n)
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		go func() {
			<-start
			_, err := store.AcquireWS(context.Background(), "sess-dua", 1, exp, 0)
			results <- err
		}()
	}
	close(start)

	won, limited := 0, 0
	for i := 0; i < n; i++ {
		switch err := <-results; {
		case err == nil:
			won++
		case errors.Is(err, sessionstore.ErrWSLimitReached):
			limited++
		default:
			t.Fatalf("lỗi ngoài dự kiến: %v", err)
		}
	}
	if won != 1 || limited != n-1 {
		t.Fatalf("%d thắng / %d bị chặn, muốn 1 / %d", won, limited, n-1)
	}
}
