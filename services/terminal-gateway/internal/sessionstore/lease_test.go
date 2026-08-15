package sessionstore_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/redistest"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
)

// Lease của khe WS — chặng 3.H.
//
// Bối cảnh đo được ở baseline 3.H (2026-08-15, trên cụm): rollout gateway làm
// 2/2 phiên đứt KHÔNG kèm close code, và 2/2 ăn 429 SESSION_IN_USE khi nối lại —
// không phiên nào vào lại được trong 10 giây. Nguyên nhân là TTL của khe bằng cả
// phần đời còn lại của session (hàng chục phút), nên "đường thoát duy nhất" mà
// `acquire_ws.lua` nói tới dài ngang việc không có đường thoát.

func keyWS(t *testing.T, id string) string {
	t.Helper()
	k, err := rediskeys.SessionWS(id)
	if err != nil {
		t.Fatalf("dựng key: %v", err)
	}
	return k
}

// Lease ngắn phải THẮNG expiresAt xa — đó là toàn bộ mục đích của 3.H.
func TestAcquireWSDungLeaseNganKhiSessionConDai(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	// Session còn 1 giờ, lease 90s.
	if _, err := store.AcquireWS(context.Background(), "sess-lease", 1,
		time.Now().Add(time.Hour).Unix(), 90*time.Second); err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}

	ttl, err := rdb.PTTL(context.Background(), keyWS(t, "sess-lease")).Result()
	if err != nil {
		t.Fatalf("PTTL: %v", err)
	}
	if ttl <= 0 || ttl > 90*time.Second {
		t.Fatalf("TTL muốn ≤ 90s (lease), nhận %v — lease không được áp, khe sẽ kẹt cả giờ khi gateway chết đột ngột", ttl)
	}
}

// ⛔ ĐỐI CHỨNG: lease KHÔNG được vượt phần đời còn lại của session.
//
// Thiếu vế này thì một khe sống lâu hơn chính phiên nó bảo vệ — rác giữ khoá cho
// một session đã chết, và người dùng tạo phiên MỚI vẫn thấy "đang mở ở tab khác".
func TestAcquireWSCatTranLeaseTheoExpiresAt(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	// Session chỉ còn 20s, lease 90s ⇒ TTL phải là ~20s, không phải 90s.
	if _, err := store.AcquireWS(context.Background(), "sess-ngan", 1,
		time.Now().Add(20*time.Second).Unix(), 90*time.Second); err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}

	ttl, err := rdb.PTTL(context.Background(), keyWS(t, "sess-ngan")).Result()
	if err != nil {
		t.Fatalf("PTTL: %v", err)
	}
	if ttl > 25*time.Second {
		t.Fatalf("TTL muốn ≈20s (phần đời còn lại), nhận %v — lease đã vượt qua hạn của chính session", ttl)
	}
}

// Refresh phải THẬT SỰ đẩy hạn ra xa, không chỉ trả nil.
func TestRefreshWSKeoDaiLease(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	exp := time.Now().Add(time.Hour).Unix()
	key := keyWS(t, "sess-refresh")

	if _, err := store.AcquireWS(context.Background(), "sess-refresh", 1, exp, 2*time.Second); err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}

	// Để hạn tụt đi một phần rồi mới gia hạn — nếu không, "trước" và "sau" gần
	// bằng nhau và phép so không phân biệt được gia hạn thật với không làm gì.
	time.Sleep(1100 * time.Millisecond)
	truoc, err := rdb.PTTL(context.Background(), key).Result()
	if err != nil {
		t.Fatalf("PTTL trước: %v", err)
	}

	if err := store.RefreshWS(context.Background(), "sess-refresh", exp, 2*time.Second); err != nil {
		t.Fatalf("RefreshWS: %v", err)
	}

	sau, err := rdb.PTTL(context.Background(), key).Result()
	if err != nil {
		t.Fatalf("PTTL sau: %v", err)
	}
	if sau <= truoc {
		t.Fatalf("TTL sau gia hạn (%v) phải LỚN HƠN trước (%v)", sau, truoc)
	}
}

// ⛔ ĐỐI CHỨNG ÂM QUAN TRỌNG NHẤT CỦA 3.H.
//
// Vòng gia hạn chạy theo ticker, `release` chạy trong defer của phiên — không có
// gì xếp thứ tự hai cái đó. Một lượt refresh tới SAU release mà dựng lại key thì
// sinh ra "khe ma": không ai đang mở, nhưng session bị khoá tới hết lease. Đó
// chính là chế độ hỏng 3.H đang đi vá, chỉ khác nguyên nhân.
//
// `refresh_ws.lua` chống bằng cách CHỈ dùng PEXPIRE — lệnh này trả 0 và KHÔNG
// tạo key khi key không tồn tại. Test này gác đúng tính chất đó: đổi script sang
// SET/SETEX là test đỏ.
func TestRefreshWSKhongHoiSinhKheDaTra(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)
	exp := time.Now().Add(time.Hour).Unix()
	key := keyWS(t, "sess-dua-release")

	release, err := store.AcquireWS(context.Background(), "sess-dua-release", 1, exp, 90*time.Second)
	if err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}
	if err := release(context.Background()); err != nil {
		t.Fatalf("release: %v", err)
	}

	// Lượt gia hạn tới MUỘN, sau khi khe đã được trả.
	err = store.RefreshWS(context.Background(), "sess-dua-release", exp, 90*time.Second)
	if !errors.Is(err, sessionstore.ErrWSSlotGone) {
		t.Fatalf("muốn ErrWSSlotGone, nhận %v", err)
	}

	n, err := rdb.Exists(context.Background(), key).Result()
	if err != nil {
		t.Fatalf("EXISTS: %v", err)
	}
	if n != 0 {
		t.Fatalf("khe đã được trả nhưng refresh DỰNG LẠI nó (EXISTS=%d) — session bị khoá dù không ai đang mở", n)
	}

	// Và hệ quả người dùng thấy được: nối lại phải chiếm được khe.
	if _, err := store.AcquireWS(context.Background(), "sess-dua-release", 1, exp, 90*time.Second); err != nil {
		t.Fatalf("sau release + refresh muộn, nối lại phải được: %v", err)
	}
}

// Session đã quá hạn: không gia hạn, và nói rõ vì sao.
func TestRefreshWSTuChoiSessionQuaHan(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	err := store.RefreshWS(context.Background(), "sess-het-han",
		time.Now().Add(-time.Minute).Unix(), 90*time.Second)
	if !errors.Is(err, sessionstore.ErrWSSlotGone) {
		t.Fatalf("muốn ErrWSSlotGone cho session quá hạn, nhận %v", err)
	}
}

// lease = 0 giữ NGUYÊN hành vi trước 3.H (TTL = phần đời còn lại).
//
// Có test cho đường này vì nó là đường mà mọi test cũ đang đi: nếu nó lệch, các
// ô AC cũ vẫn xanh nhưng đang đo một thứ khác.
func TestLeaseKhongDatGiuHanhViCu(t *testing.T) {
	rdb := redistest.New(t, redistest.DBSessionStore)
	store := sessionstore.New(rdb)

	if _, err := store.AcquireWS(context.Background(), "sess-cu", 1,
		time.Now().Add(30*time.Minute).Unix(), 0); err != nil {
		t.Fatalf("AcquireWS: %v", err)
	}

	ttl, err := rdb.PTTL(context.Background(), keyWS(t, "sess-cu")).Result()
	if err != nil {
		t.Fatalf("PTTL: %v", err)
	}
	if ttl < 29*time.Minute {
		t.Fatalf("lease=0 phải cho TTL ≈ 30 phút (hành vi cũ), nhận %v", ttl)
	}
}
