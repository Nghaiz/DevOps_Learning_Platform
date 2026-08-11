package podexec

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// ExtendOutcome là kết luận của một lượt gia hạn.
//
// Ba giá trị vì cầu phải làm ba việc KHÁC nhau, không phải vì thích enum: chạy
// tiếp, đóng `4404`, đóng `4409`. Một `bool gone` gộp hai mã cuối lại và FE mất
// khả năng phân biệt "phiên của bạn bị thu hồi" với "phiên đã chạy hết thời
// lượng tối đa" — hai câu nói với sinh viên hai chuyện khác hẳn nhau.
type ExtendOutcome int

const (
	// ExtendOK — hạn đã đẩy về phía trước (hoặc giữ nguyên vì hạn cũ còn xa hơn).
	ExtendOK ExtendOutcome = iota
	// ExtendGone — session không còn, sai chủ, hoặc trạng thái không cho gia hạn.
	ExtendGone
	// ExtendHardCap — đã QUA trần cứng, không còn gì để gia hạn.
	ExtendHardCap
)

// ExtendResult là kết quả một lượt gia hạn.
type ExtendResult struct {
	Outcome ExtendOutcome
	// ExpiresAt là hạn MỚI (epoch giây), chỉ có nghĩa khi Outcome == ExtendOK.
	ExpiresAt int64
	// HardCapReached: lần này còn thành công nhưng đã bị trần cắt ⇒ lần sau sẽ
	// không đẩy thêm được. Khác hẳn ExtendHardCap (đã QUA trần) — đây là cảnh
	// báo trước, cái kia là hết đường.
	HardCapReached bool
}

// Extender gia hạn idle-deadline của session (G7).
//
// Interface do CONSUMER khai: cầu terminal không được biết gì về gRPC, và test
// của nó phải chạy được mà không dựng server. Bản thật ở `internal/extend`.
type Extender interface {
	Extend(ctx context.Context, sessionID, userID string) (ExtendResult, error)
}

// Nhịp của keepalive và heartbeat. Cố ý KHÔNG phơi ra env — mỗi biến env là 4
// nơi phải sửa (G11), và chưa con số nào ở đây có người vận hành cần chỉnh.
const (
	// pingInterval / pongTimeout: contract §8. Ping là WS ping frame CHUẨN —
	// trình duyệt tự trả pong ở tầng dưới, JS không thấy gì, nên FE không phải
	// viết một dòng nào cho nó.
	pingInterval = 20 * time.Second
	pongTimeout  = 10 * time.Second

	// extendInterval là nhịp TỐI ĐA của heartbeat gia hạn — mỗi tick chỉ gọi
	// RPC khi có traffic THẬT từ tick trước.
	//
	// 60s so với `EXTEND_DEFAULT=300s` của orchestrator cho biên an toàn 5 lần:
	// bốn tick liên tiếp hỏng (orchestrator rollout, Redis nghẽn) vẫn chưa làm
	// phiên của sinh viên đang gõ hết hạn. Nhỏ hơn nữa thì tốn RPC mà không mua
	// thêm gì; lớn hơn thì biên đó mỏng đi đúng lúc hạ tầng đang xấu.
	extendInterval = 60 * time.Second
)

// heartbeat chạy keepalive và gia hạn cho tới khi `stop` đóng (hoặc ctx huỷ).
//
// ⛔ PING/PONG KHÔNG TÍNH LÀ TRAFFIC (contract §8): nhánh ping KHÔNG chạm tới
// `activity`. Tính nó vào thì một tab bỏ quên tự gia hạn chính nó tới tận trần
// cứng — pod giữ một trong bốn khe quota cho một cửa sổ không ai nhìn.
//
// ⛔ HAI GOROUTINE, KHÔNG PHẢI MỘT `select` HAI NHÁNH. `c.Ping` CHẶN cho tới khi
// nhận pong hoặc hết `pongWait`. Trong một select chung, mỗi lượt ping vì thế
// đóng băng luôn nhánh gia hạn tới 10 giây — traffic thật của sinh viên vẫn tới
// nhưng heartbeat không kịp báo, và với hạ tầng đang chậm thì đó đúng là lúc
// biên an toàn cần nhất. (Phát hiện khi test: nhịp ping ngắn làm nhánh extend
// KHÔNG BAO GIỜ chạy — cùng một lỗi, chỉ khác thang thời gian.)
func (b *Bridge) heartbeat(
	ctx context.Context, cancel context.CancelFunc,
	c *websocket.Conn, t Target, st *connState, stop <-chan struct{},
) {
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); b.pingLoop(ctx, cancel, c, t, stop) }()
	go func() { defer wg.Done(); b.extendLoop(ctx, cancel, c, t, st, stop) }()
	wg.Wait()
}

// pingLoop giữ keepalive (contract §8).
func (b *Bridge) pingLoop(
	ctx context.Context, cancel context.CancelFunc,
	c *websocket.Conn, t Target, stop <-chan struct{},
) {
	ticker := time.NewTicker(b.pingEvery)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-ticker.C:
			if !b.pingOnce(ctx, c, t) {
				// Không gửi close frame: kết nối đã chết theo đúng định nghĩa
				// của phép thử này (không ai trả pong), nên không có ai ở đầu
				// kia để đọc một mã đóng.
				cancel()
				return
			}
		}
	}
}

// extendLoop báo "phiên này còn người dùng" cho orchestrator.
func (b *Bridge) extendLoop(
	ctx context.Context, cancel context.CancelFunc,
	c *websocket.Conn, t Target, st *connState, stop <-chan struct{},
) {
	ticker := time.NewTicker(b.extendEvery)
	defer ticker.Stop()

	// Mốc FE đã biết, khởi đầu từ chính con số `ready` vừa gửi. Chỉ phát
	// `expiring` khi con số này THAY ĐỔI — xem sendExpiring.
	announced := t.ExpiresAt
	hardCapAnnounced := false

	for {
		select {
		case <-ctx.Done():
			return
		case <-stop:
			return
		case <-ticker.C:
			// Đọc-và-xoá: im lặng suốt tick vừa rồi ⇒ KHÔNG gia hạn. Đây là chỗ
			// idle-window thật sự được thực thi.
			if !st.takeActivity() {
				continue
			}
			if !b.extendOnce(ctx, cancel, c, t, st, &announced, &hardCapAnnounced) {
				return
			}
		}
	}
}

// pingOnce gửi một ping và chờ pong. Trả false nghĩa là kết nối coi như chết.
func (b *Bridge) pingOnce(ctx context.Context, c *websocket.Conn, t Target) bool {
	pctx, cancel := context.WithTimeout(ctx, b.pongWait)
	defer cancel()

	if err := c.Ping(pctx); err != nil {
		if ctx.Err() != nil {
			// Phiên đang đóng vì lý do khác (shell thoát, client ngắt). Ping
			// hỏng ở đây là HỆ QUẢ, không phải nguyên nhân — log nó ở mức cảnh
			// báo là dạy người trực bỏ qua một dòng vốn có nghĩa.
			return false
		}
		b.log.Info("không nhận pong trong hạn — coi kết nối đã chết",
			slog.String("session_id", t.SessionID),
			slog.Duration("timeout", b.pongWait),
			slog.String("err", err.Error()))
		return false
	}
	return true
}

// extendOnce chạy một lượt gia hạn. Trả false nghĩa là heartbeat phải dừng hẳn.
func (b *Bridge) extendOnce(
	ctx context.Context, cancel context.CancelFunc,
	c *websocket.Conn, t Target, st *connState,
	announced *int64, hardCapAnnounced *bool,
) bool {
	res, err := b.extender.Extend(ctx, t.SessionID, t.UserID)
	if err != nil {
		if ctx.Err() != nil {
			return false
		}
		// ⛔ LỖI GIA HẠN KHÔNG GIẾT PHIÊN. Orchestrator đang rollout, Redis chớp
		// tắt, mạng nghẽn — cả ba đều tự khỏi, và cả ba đều không nói gì về việc
		// session còn hợp lệ hay không. Đóng terminal của sinh viên vì gateway
		// không hỏi được người khác là biến một sự cố hạ tầng ngắn thành mất bài.
		// Biên 5 lần của extendInterval tồn tại chính cho khoảng này.
		b.log.Warn("gia hạn session thất bại — sẽ thử lại ở nhịp sau",
			slog.String("session_id", t.SessionID), slog.String("err", err.Error()))
		return true
	}

	// ⛔ ĐÓNG NGAY TẠI CHỖ PHÁT HIỆN, KHÔNG ĐỂ `finish` ĐÓNG HỘ.
	//
	// `cancel()` KHÔNG phải một tín hiệu hiền lành: `coder/websocket` đóng phăng
	// kết nối khi context của một thao tác đọc/ghi bị huỷ, nên mọi close frame
	// gửi SAU đó rơi vào hư không và client chỉ thấy `1006`. Thứ tự bắt buộc là
	// gửi `error` + close frame TRƯỚC, `cancel()` sau. Đây cũng là khuôn mà
	// nhánh control-hỏng (4400) đã dùng từ 1.C-2.
	switch res.Outcome {
	case ExtendGone:
		b.log.Info("session không còn hiệu lực giữa phiên — đóng 4404",
			slog.String("session_id", t.SessionID))
		st.setIntent(intentGone)
		b.sendControl(ctx, c, ControlOut{Type: "error", Code: "SESSION_GONE", Message: "phiên đã kết thúc"})
		_ = c.Close(4404, "session gone")
		cancel()
		return false
	case ExtendHardCap:
		b.log.Info("phiên đã qua trần cứng — đóng 4409",
			slog.String("session_id", t.SessionID))
		st.setIntent(intentHardCap)
		b.sendControl(ctx, c, ControlOut{
			Type: "error", Code: "HARD_CAP_REACHED", Message: "phiên đã chạy hết thời lượng tối đa"})
		_ = c.Close(4409, "hard cap reached")
		cancel()
		return false
	}

	b.sendExpiring(ctx, c, res, announced, hardCapAnnounced)
	return true
}

// sendExpiring phát control `expiring` khi — và CHỈ khi — FE cần biết thêm điều gì.
//
// Contract §5: `expiring` mang `expiresAt` mới, và `hardCapReached` phân biệt
// "hạn vừa dịch" với "hết đường gia hạn" (FE chỉ cảnh báo ở vế sau). Không có
// message này thì đồng hồ đếm ngược của FE — lấy một lần từ `ready` — chạy về 0
// trong khi terminal vẫn sống: với `SESSION_TTL=1h` và `EXTEND_DEFAULT=300s`,
// `max(current, …)` giữ hạn đứng yên ~55 phút rồi mới đẩy 5 phút mỗi lượt, nên
// sai lệch đó KHÔNG phải giả định, nó xảy ra ở mọi phiên chạy quá 55 phút.
//
// Hai điều kiện phát, cả hai đều là "có tin MỚI":
//   - hạn tiến lên (hạn không bao giờ lùi — `max()` trong extend.lua)
//   - lần đầu chạm trần cứng
//
// Thiếu vế `hardCapAnnounced` thì mỗi tick sau khi chạm trần lại phát một
// `expiring` giống hệt, tức 60 giây một lần bảo FE "sắp hết hạn" cho tới lúc
// phiên chết — cảnh báo lặp là cảnh báo bị bỏ qua.
func (b *Bridge) sendExpiring(
	ctx context.Context, c *websocket.Conn, res ExtendResult,
	announced *int64, hardCapAnnounced *bool,
) {
	moved := res.ExpiresAt > *announced
	firstHardCap := res.HardCapReached && !*hardCapAnnounced
	if !moved && !firstHardCap {
		return
	}

	*announced = max(*announced, res.ExpiresAt)
	*hardCapAnnounced = *hardCapAnnounced || res.HardCapReached

	b.sendControl(ctx, c, ControlOut{
		Type:           "expiring",
		ExpiresAt:      epochToRFC3339(*announced),
		HardCapReached: res.HardCapReached,
	})
}
