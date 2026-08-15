// Package drain điều phối việc tắt ÊM các phiên WS đang mở (P3/3.H).
//
// ⛔ VÌ SAO LÀ MỘT PACKAGE RIÊNG THAY VÌ MẤY TRƯỜNG TRONG `podexec.Bridge`.
//
// Bản đầu của 3.H đặt kênh drain + WaitGroup ngay trong `Bridge`, và `Serve` tự
// `wg.Add(1)` / `defer wg.Done()`. Unit test xanh. Trên cụm thì HỎNG, và hỏng
// theo kiểu chỉ phép đo thật mới thấy:
//
//	khe `session:{id}:ws` vẫn còn sau rollout — val=1, pttl≈19s
//
// Lý do: `release` (DECR khe) là một `defer` của HANDLER trong `wsroute`, không
// phải của `Serve`. `wg.Done()` bắn khi `Serve` trả về, tức TRƯỚC khi defer của
// handler chạy. `Drain` vì thế báo "xong" quá sớm, `main` return, process thoát,
// và defer trả khe chết giữa chừng — đúng chế độ hỏng mà cả chặng này đi vá,
// chỉ khác là bây giờ nó nấp sau một close code 1012 trông rất tử tế.
//
// Unit test của `Bridge` KHÔNG BAO GIỜ bắt được: nó gọi `Serve` trực tiếp, nên
// tầng `wsroute` — nơi cái defer quan trọng sống — không tồn tại trong ca test.
//
// Sửa đúng là để phạm vi đếm bao TRỌN handler. Muốn thế thì cả `wsroute` (đếm
// vòng đời) lẫn `podexec` (nhận tín hiệu đóng) phải dùng CHUNG một đối tượng, và
// không tầng nào trong hai tầng đó nên sở hữu nó.
package drain

import (
	"context"
	"sync"
	"sync/atomic"
)

// Coordinator phát tín hiệu drain và đếm số phiên còn sống.
//
// Zero value KHÔNG dùng được — phải qua New (kênh phải khác nil).
type Coordinator struct {
	ch     chan struct{}
	once   sync.Once
	wg     sync.WaitGroup
	dangMo atomic.Int64
}

// New dựng một Coordinator chưa drain, sẵn sàng nhận Enter.
func New() *Coordinator {
	return &Coordinator{ch: make(chan struct{})}
}

// Enter đánh dấu một phiên bắt đầu; hàm trả về đánh dấu nó KẾT THÚC HẲN.
//
// ⛔ GỌI Ở ĐẦU HANDLER VÀ `defer` NGAY, TRƯỚC khi chiếm khe WS. Đặt muộn hơn thì
// khoảng giữa "đã chiếm khe" và "đã Enter" là một cửa sổ mà phiên vừa giữ tài
// nguyên vừa vô hình với Drain — và đó chính là tài nguyên Drain sinh ra để bảo vệ.
func (d *Coordinator) Enter() func() {
	d.wg.Add(1)
	d.dangMo.Add(1)
	var motLan sync.Once
	return func() {
		motLan.Do(func() {
			d.dangMo.Add(-1)
			d.wg.Done()
		})
	}
}

// Signal trả kênh đóng khi drain bắt đầu. Chọn trên nó để đóng phiên tử tế.
func (d *Coordinator) Signal() <-chan struct{} { return d.ch }

// DangDrain cho biết drain đã bắt đầu chưa (dùng để từ chối phiên MỚI).
func (d *Coordinator) DangDrain() bool {
	select {
	case <-d.ch:
		return true
	default:
		return false
	}
}

// Drain ra hiệu rồi ĐỢI mọi phiên dứt hẳn, trần theo ctx.
//
// Trả số phiên còn treo khi hết hạn — 0 nghĩa là sạch. Con số này được TRẢ RA
// thay vì chỉ log vì nó là thứ duy nhất phân biệt "đã drain xong" với "đã hết
// giờ chờ", và hai cái đó đòi hai phản ứng vận hành khác nhau.
func (d *Coordinator) Drain(ctx context.Context) int64 {
	d.once.Do(func() { close(d.ch) })

	xong := make(chan struct{})
	go func() {
		d.wg.Wait()
		close(xong)
	}()

	select {
	case <-xong:
		return 0
	case <-ctx.Done():
		return d.dangMo.Load()
	}
}
