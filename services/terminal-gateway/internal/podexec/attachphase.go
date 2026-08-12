package podexec

import (
	"context"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
)

// attachTimer gom các mốc thời gian của MỘT lượt attach để chia
// `dlp_gateway_attach_duration_seconds` thành năm chặng (1.G-4 M1).
//
// Vì sao cần: con số tổng 0.75s đo được ở 1.G-2 không quy được trách nhiệm —
// nó có thể là client gửi `init` muộn, gateway dựng TLS chậm, apiserver bắt tay
// lâu, hay `tmux attach` trong pod ì. Bốn nguyên nhân đó đòi bốn hành động khác
// nhau, và một histogram tổng không phân biệt được cái nào.
//
// ⛔ HAI MỐC TỚI TỪ GOROUTINE KHÁC, nên struct này phải khoá. `upgrade` do
// RoundTripper của client-go đặt; `streams` do goroutine `copyStdin` của
// client-go đặt. Cả hai chạy song song với `Serve`.
type attachTimer struct {
	mu sync.Mutex

	start   time.Time // 101 — cùng mốc mà AttachDuration dùng
	init    time.Time // nhận xong frame `init` (contract §3 bước 4)
	exec    time.Time // executor dựng xong
	upgrade time.Time // RoundTrip tới apiserver trả về (101 từ apiserver)
	streams time.Time // client-go dựng xong stream (proxy: Read đầu trên stdin)
}

func newAttachTimer(start time.Time) *attachTimer {
	return &attachTimer{start: start}
}

func (t *attachTimer) markInit(at time.Time) { t.set(&t.init, at) }
func (t *attachTimer) markExec(at time.Time) { t.set(&t.exec, at) }

// markUpgrade / markStreams được gọi từ goroutine KHÁC, và chỉ mốc ĐẦU TIÊN
// được giữ: một lượt attach có thể sinh nhiều RoundTrip (fallback WS→SPDY) và
// `Read` trên stdin thì chạy suốt phiên.
func (t *attachTimer) markUpgrade(at time.Time) { t.setOnce(&t.upgrade, at) }
func (t *attachTimer) markStreams(at time.Time) { t.setOnce(&t.streams, at) }

func (t *attachTimer) set(dst *time.Time, at time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	*dst = at
}

func (t *attachTimer) setOnce(dst *time.Time, at time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if dst.IsZero() {
		*dst = at
	}
}

// observe phát năm mẫu chặng, hoặc từ chối phát và đếm một lượt "không đầy đủ".
//
// ⛔ KHÔNG KẸP SỐ ÂM VỀ 0, và đây là quyết định trung tâm của phép đo này. Mốc
// `streams` đến từ goroutine `copyStdin` mà client-go SPAWN (`v2.go:95`), nên
// thứ tự của nó với byte stdout đầu tiên KHÔNG được ngôn ngữ đảm bảo — chỉ gần
// như luôn đúng vì `pty` tính bằng trăm mili-giây còn lập lịch goroutine tính
// bằng micro-giây. Kẹp về 0 thì một lượt lệch thứ tự vẫn cho ra bảng phân bổ
// "hợp lý" trong khi nó đang bịa; bỏ qua lượt đó và đếm riêng thì phép so
// `count(phase) == count(attach)` ở probe phát hiện được ngay.
//
// Cùng luật với `wantImage == ""` của tầng 4 (1.G-1 W2): không đủ căn cứ thì
// KHÔNG kết luận gì, chứ không kết luận bừa rồi ghi log nghe có lý.
func (t *attachTimer) observe(met *metrics.Metrics, ready time.Time) {
	t.mu.Lock()
	moc := []struct {
		phase string
		at    time.Time
	}{
		{metrics.PhaseWaitInit, t.init},
		{metrics.PhaseBuildExec, t.exec},
		{metrics.PhaseUpgrade, t.upgrade},
		{metrics.PhaseStreams, t.streams},
		{metrics.PhasePTY, ready},
	}
	t.mu.Unlock()

	truoc := t.start
	dur := make([]float64, 0, len(moc))
	for _, m := range moc {
		// Hai lý do loại, hai chẩn đoán khác hẳn nhau — xem `ReasonMissingMark`
		// / `ReasonOutOfOrder`. Thứ tự kiểm quan trọng: mốc rỗng là năm 1 nên
		// nó CŨNG thoả `Before`, và hỏi `Before` trước sẽ dán nhãn mọi hook
		// không chạy thành "lệch lịch" — tức chôn một lỗi hệ thống dưới một
		// nhãn nói rằng mọi thứ vẫn bình thường.
		switch {
		case m.at.IsZero():
			met.AttachPhaseIncompleteTotal.WithLabelValues(metrics.ReasonMissingMark).Inc()
			return
		case m.at.Before(truoc):
			met.AttachPhaseIncompleteTotal.WithLabelValues(metrics.ReasonOutOfOrder).Inc()
			return
		}
		dur = append(dur, m.at.Sub(truoc).Seconds())
		truoc = m.at
	}

	for i, m := range moc {
		met.AttachPhase.WithLabelValues(m.phase).Observe(dur[i])
	}

	// Phần gateway kiểm soát được = mọi chặng TRỪ `pty` (chặng cuối). Cộng ở
	// đây chứ không ở PromQL vì p95 của một tổng không suy ra được từ p95 của
	// các thành phần — phải cộng TỪNG LƯỢT rồi mới phát một mẫu.
	var controlled float64
	for _, d := range dur[:len(dur)-1] {
		controlled += d
	}
	met.AttachControlled.Observe(controlled)
}

// ---------------------------------------------------------------- hook upgrade

type attachTimerKey struct{}

// withAttachTimer gắn timer vào ctx để RoundTripper tìm lại được.
//
// Đi qua context chứ không qua field của factory vì transport là MỘT instance
// dùng chung cho mọi phiên, còn timer thì mỗi lượt attach một cái. Request của
// `StreamWithContext` mang đúng ctx này (`websocket.go:119`
// `http.NewRequestWithContext(ctx, ...)`), nên đường truyền là có thật chứ
// không phải quy ước.
func withAttachTimer(ctx context.Context, t *attachTimer) context.Context {
	return context.WithValue(ctx, attachTimerKey{}, t)
}

func attachTimerFrom(ctx context.Context) *attachTimer {
	t, _ := ctx.Value(attachTimerKey{}).(*attachTimer)
	return t
}

// UpgradeTimingWrapper là `rest.Config.WrapTransport` đo lượt bắt tay tới
// apiserver (TCP + TLS + HTTP-101).
//
// ⛔ HOOK NÀY CÓ CHẠY TRÊN ĐƯỜNG WS — đã đọc mã, không suy đoán:
// `websocket.RoundTripperFor` gọi `transport.HTTPWrappersForConfig`, và hàm đó
// áp `config.WrapTransport` ở dòng đầu tiên (`round_trippers.go:42-44`).
//
// ⛔ `rest.Config.Dial` thì KHÔNG được honor: `transport/websocket.RoundTripper`
// chỉ có `TLSConfig`/`Proxier`/`Conn`, không có field Dial. Nên `upgrade` là số
// GỘP và không tách được TCP khỏi TLS nếu không fork client-go — ghi ra ở đây
// để người đọc sau không đi tìm một hook không tồn tại.
func UpgradeTimingWrapper(rt http.RoundTripper) http.RoundTripper {
	return roundTripperFunc(func(req *http.Request) (*http.Response, error) {
		t := attachTimerFrom(req.Context())
		resp, err := rt.RoundTrip(req)
		// Đặt mốc kể cả khi lỗi: một lượt bắt tay hỏng vẫn tiêu thời gian, và
		// lượt attach đó sẽ chết trước khi tới `observe` nên không mẫu nào phát.
		if t != nil {
			t.markUpgrade(time.Now())
		}
		return resp, err
	})
}

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// ---------------------------------------------------------------- hook streams

// timedStdinReader đặt mốc `streams` ở lượt Read ĐẦU TIÊN.
//
// Vì sao lượt Read đầu trên stdin là mốc "stream đã dựng xong":
// `streamProtocolV4.stream` chạy `createStreams` → `close(ready)` → `copyStdin()`
// (`v4.go:55-70`) TRƯỚC `copyStdout` (`:73`), và `copyStdin` gọi
// `io.Copy(remoteStdin, Stdin)` nên nó chạm `Read` ngay.
//
// ⛔ ĐẶT MỐC LÚC VÀO `Read`, KHÔNG PHẢI LÚC `Read` TRẢ VỀ. Nguồn là `io.Pipe`,
// chặn tới khi có người ghi — đo lúc trả về là đo thời gian người dùng gõ phím
// đầu tiên, một con số vừa vô nghĩa vừa lớn hơn cả phiên.
//
// ⛔ ĐÂY LÀ PROXY, không phải mốc chính xác: `copyStdin` spawn goroutine
// (`v2.go:95`) nên số đo cộng thêm độ trễ lập lịch. Chấp nhận được vì nó nhỏ
// hơn thứ đang đo vài bậc, nhưng nó là lý do `observe` phải chịu được ca lệch
// thứ tự thay vì tin vào thứ tự.
type timedStdinReader struct {
	r    io.Reader
	t    *attachTimer
	once sync.Once
}

func (r *timedStdinReader) Read(p []byte) (int, error) {
	r.once.Do(func() { r.t.markStreams(time.Now()) })
	return r.r.Read(p)
}
