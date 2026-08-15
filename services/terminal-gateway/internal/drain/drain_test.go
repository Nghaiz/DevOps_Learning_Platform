package drain_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/drain"
)

// ⛔ TEST HỒI QUY CHO LỖI MÀ UNIT TEST CŨ KHÔNG THỂ THẤY (3.H).
//
// Bản đầu của 3.H đặt WaitGroup quanh `podexec.Serve`. Trên cụm, kết quả là:
// close code đúng `1012`, mà khe `session:{id}:ws` VẪN CÒN (val=1, pttl≈19s) —
// tức `release` chưa từng chạy. Lý do: `release` là defer của HANDLER, chạy SAU
// khi `Serve` trả về; `Drain` báo xong ở thời điểm `Serve` trả về nên `main`
// thoát trước, giết luôn defer.
//
// Ca này mô phỏng đúng hình dạng ấy: "handler" Enter, gọi "Serve" (kết thúc
// sớm), rồi mới chạy defer dọn dẹp. `Drain` PHẢI đợi qua cả defer.
func TestDrainDoiCaDeferCuaHandler(t *testing.T) {
	d := drain.New()

	var daDon atomic.Bool
	batDau := make(chan struct{})

	go func() {
		xong := d.Enter()
		defer xong() // ← tương đương `defer release(...)` của wsroute

		// Đây là phần "Serve": kết thúc khi nhận tín hiệu drain.
		defer func() {
			// Việc dọn dẹp tốn thời gian thật (một lượt Redis), chạy SAU Serve.
			time.Sleep(200 * time.Millisecond)
			daDon.Store(true)
		}()

		close(batDau)
		<-d.Signal()
	}()

	<-batDau
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if conTreo := d.Drain(ctx); conTreo != 0 {
		t.Fatalf("Drain báo còn treo %d — phải drain sạch", conTreo)
	}
	if !daDon.Load() {
		t.Fatal("Drain trả về TRƯỚC khi defer dọn dẹp của handler chạy xong — " +
			"đây đúng là lỗi đo được trên cụm: close code 1012 tử tế nhưng khe WS không bao giờ được trả")
	}
}

// Hết hạn ctx ⇒ trả về SỐ phiên còn treo, không phải 0.
//
// Phân biệt "drain sạch" với "hết giờ chờ" là toàn bộ giá trị của giá trị trả về:
// gộp cả hai thành 0 thì log vận hành nói dối đúng lúc cần nói thật nhất.
func TestDrainHetHanTraSoConTreo(t *testing.T) {
	d := drain.New()
	xong := d.Enter()
	defer xong()

	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()

	if conTreo := d.Drain(ctx); conTreo != 1 {
		t.Fatalf("muốn còn treo 1, nhận %d", conTreo)
	}
}

// Gọi hàm dừng nhiều lần không được đẩy bộ đếm xuống âm.
//
// Một WaitGroup bị Done thừa sẽ panic ("negative counter") và giết cả tiến trình
// ĐÚNG LÚC ĐANG TẮT MÁY — chỗ không ai nhìn log.
func TestEnterGoiDungHaiLanKhongPanic(t *testing.T) {
	d := drain.New()
	xong := d.Enter()
	xong()
	xong()

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if conTreo := d.Drain(ctx); conTreo != 0 {
		t.Fatalf("muốn 0, nhận %d", conTreo)
	}
}

// Drain gọi hai lần không được panic vì `close` kênh đã đóng.
func TestDrainGoiHaiLanKhongPanic(t *testing.T) {
	d := drain.New()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = d.Drain(ctx)
	_ = d.Drain(ctx)
}

func TestDangDrain(t *testing.T) {
	d := drain.New()
	if d.DangDrain() {
		t.Fatal("chưa drain mà báo đang drain")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = d.Drain(ctx)
	if !d.DangDrain() {
		t.Fatal("đã drain mà không báo")
	}
}
