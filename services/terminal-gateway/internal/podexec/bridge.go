package podexec

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/coder/websocket"
	"golang.org/x/time/rate"
	"k8s.io/client-go/tools/remotecommand"
)

// SessionAliveFunc tra Redis xem session còn sống không.
//
// ⛔ TỒN TẠI VÌ MỘT SỐ ĐO, KHÔNG PHẢI VÌ GỌN: xoá pod giữa phiên làm
// `StreamWithContext` trả `CodeExitError` với `ExitStatus() == 137` (SIGKILL) —
// TRÙNG KHÍT với thứ nhận được khi người dùng `kill -9` hợp lệ bên trong pod
// của chính họ. Bridge nào coi mọi CodeExitError là thoát bình thường sẽ đóng
// bằng `1000`, và theo contract §6 thì `1000` nghĩa là "tự gõ exit, ĐỪNG retry"
// — sinh viên bị reap giữa bài sẽ thấy terminal đóng êm, không tín hiệu nào để
// FE hiện "phiên đã hết hạn". Exit code KHÔNG đủ; phải hỏi Redis.
//
// Một lượt đọc trên ĐƯỜNG ĐÓNG, không phải đường nóng.
type SessionAliveFunc func(ctx context.Context, sessionID string) (bool, error)

// Các hằng thời gian của cầu. Cố ý KHÔNG phơi ra env: mỗi biến env là 4 nơi
// phải sửa (G11), và chưa con số nào ở đây có người vận hành cần chỉnh.
const (
	// initTimeout: chờ frame `init` mang cols/rows trước khi dial (contract §3
	// bước 4–5). Hết hạn → 80×24.
	initTimeout = 3 * time.Second

	// attachGrace: trần chờ bằng chứng "đã attach" trước khi phát `ready`.
	// Xem waitAttached.
	attachGrace = 2 * time.Second

	// writeTimeout: trần cho MỘT lượt ghi stdout ra client. Vượt = client quá
	// chậm ⇒ đóng 4429 (contract §6, luật 5). Đây là vế "backpressure" của G5:
	// ta KHÔNG đệm vô hạn, ta cắt.
	writeTimeout = 10 * time.Second

	// closeProbeTimeout: trần cho lượt hỏi Redis trên đường đóng. Ngắn có chủ
	// ý — nó chạy khi phiên đã kết thúc, không được kéo dài thêm.
	closeProbeTimeout = 3 * time.Second

	// MaxFrameBytes là trần MỘT frame client gửi lên (luật 5). Báo cho FE trong
	// `ready` để nó tự chia nhỏ khi sinh viên dán một manifest YAML dài, thay vì
	// bị đóng đột ngột giữa lúc dán.
	//
	// Vượt trần → `coder/websocket` TỰ đóng bằng `1009` ngay trong tầng thư
	// viện; code ứng dụng không bao giờ thấy frame vi phạm nên không có chỗ nào
	// phát một mã ứng dụng. Đo trực tiếp ở spike; contract §6 đã pin `1009`.
	MaxFrameBytes = 32 * 1024
)

// Trần tốc độ cho chiều client → pod (G8, luật 5).
//
// ⛔ ĐÂY LÀ TẦNG KHÁC VỚI MaxFrameBytes, KHÔNG PHẢI BẢN DỰ PHÒNG CỦA NÓ.
// Read-limit chặn MỘT frame to; token-bucket chặn NHIỀU frame nhỏ đi liên tục —
// 32 KiB × 1000 frame/giây lọt qua read-limit sạch sẽ mà vẫn là một vòi bơm vào
// stdin của pod. Hai trần, hai chế độ lạm dụng.
const (
	// stdinBytesPerSec: 256 KiB/s. Người gõ nhanh nhất cũng chưa tới 100 B/s;
	// trần này nhắm vào paste lớn và script tự động, và nó vẫn rộng gấp nhiều
	// lần một lần dán manifest.
	stdinBytesPerSec = 256 * 1024
	// stdinBurstBytes: 512 KiB. Burst PHẢI lớn hơn MaxFrameBytes, nếu không một
	// frame hợp lệ đơn độc cũng không bao giờ đủ token và mọi lần dán to đều
	// chết — trần khi đó không chặn lạm dụng, nó chặn tính năng.
	stdinBurstBytes = 512 * 1024

	// controlPerSec / controlBurst: trần cho control message (contract §4).
	// Resize dồn dập là ca bình thường (kéo cửa sổ sinh ~200 sự kiện), nên burst
	// phải chịu được một cơn kéo; vượt hẳn 100/s KÉO DÀI mới là bão.
	controlPerSec = 100
	controlBurst  = 100
)

// closeIntent ghi nhận LÝ DO ĐẦU TIÊN khiến phiên phải đóng, do bất kỳ goroutine
// nào phát hiện ra.
//
// Vì sao cần nó: mọi đường hỏng đều kết thúc bằng `cancel()`, và sau `cancel()`
// thì stream trả về một lỗi context — tức là tới lúc `finish` chạy, MỌI nguyên
// nhân trông giống hệt nhau. Không có trường này thì "client vượt trần tốc độ",
// "session bị thu hồi" và "apiserver chết" cùng đóng bằng `4500`, và người vận
// hành đi tìm apiserver trong cả ba trường hợp.
type closeIntent int32

const (
	intentNone        closeIntent = iota
	intentSlow                    // client không đọc kịp stdout → 4429
	intentRateLimited             // client vượt trần byte-rate → 4429
	intentGone                    // session không còn hiệu lực → 4404
	intentHardCap                 // đã qua trần cứng → 4409
	intentProtocol                // control hỏng / bão control → 4400 (đã tự đóng)
)

// connState là trạng thái của ĐÚNG MỘT kết nối đang mở.
//
// ⛔ Nó sống trên STACK của Serve, không phải trên Bridge. Bridge là singleton
// dùng chung cho mọi phiên (G9 — stateless): đặt hai trường này lên Bridge là
// để phiên của sinh viên A quyết định close code cho phiên của sinh viên B.
type connState struct {
	// activity: có traffic THẬT (stdin/stdout) từ lần đọc trước không.
	// Ping/pong không bao giờ chạm vào đây — xem heartbeat.
	//
	// ATOMIC vì nó được GHI từ goroutine đọc-WS và goroutine copy-stdout của
	// client-go, rồi ĐỌC từ goroutine heartbeat. Ba goroutine, một biến.
	activity atomic.Bool

	// intent giữ lý do ĐẦU TIÊN. CompareAndSwap chứ không phải Store: nguyên
	// nhân đầu là nguyên nhân THẬT, những cái sau là hệ quả của nó.
	intent atomic.Int32

	// hardCapSeen: đã từng nhận `hard_cap_reached=true` từ orchestrator chưa.
	//
	// ⛔ ĐÂY LÀ THỨ DUY NHẤT PHÂN BIỆT ĐƯỢC "HẾT GIỜ" VỚI "BỊ THU HỒI", và nó
	// phải sống ở đây vì HAI goroutine khác nhau cần nó (heartbeat lúc gia hạn
	// hỏng, và `finish` lúc stream đứt vì reaper xoá pod — hai đường đua nhau).
	//
	// Vì sao không hỏi lại orchestrator: nhánh `extend: hardcap:` của
	// `extend.lua` gần như KHÔNG BAO GIỜ chạy được. Script đặt TTL của
	// `session:{id}` đúng bằng `expiresAt`, nên tới thời điểm `newExpiresAt <=
	// now` thì hash đã BIẾN MẤT — lượt gia hạn kế tiếp thấy "không tồn tại", tức
	// chính là ca `4404`. Đo được trên cluster 2026-08-11: phiên chạm trần cứng
	// đóng bằng `4404` kèm `SESSION_GONE`, và người vừa dùng hết thời lượng
	// nhận được thông báo "phiên của bạn bị thu hồi".
	//
	// Gateway thì BIẾT: nó đã phát `expiring{hardCapReached:true}` hai phút
	// trước đó. Nhớ lấy một bit là đủ để nói đúng sự thật.
	hardCapSeen atomic.Bool
}

func (s *connState) markActivity()      { s.activity.Store(true) }
func (s *connState) takeActivity() bool { return s.activity.Swap(false) }

func (s *connState) setIntent(i closeIntent) {
	s.intent.CompareAndSwap(int32(intentNone), int32(i))
}

func (s *connState) currentIntent() closeIntent {
	return closeIntent(s.intent.Load())
}

// Bridge nối một WS đã qua đủ 9 bước authz vào PTY của pod.
//
// ⛔ MỘT INSTANCE PHỤC VỤ MỌI PHIÊN (G9). Không có map session→pod, không có
// cache nào ở đây: đích exec tra từ Redis mỗi lần connect, và state duy nhất
// được giữ là vòng đời của chính kết nối đang mở (`connState`, sống trên stack
// của Serve). Thêm một trường phụ thuộc-phiên vào struct này là bỏ G9 và mở
// đường cho phiên này đọc trạng thái của phiên kia.
type Bridge struct {
	newExecutor ExecutorFactory
	alive       SessionAliveFunc
	extender    Extender
	log         *slog.Logger
	met         *metrics.Metrics

	// Nhịp heartbeat. Là TRƯỜNG chứ không phải hằng chỉ vì test: một suite chờ
	// đủ 20s/60s thật thì hoặc chạy hàng phút, hoặc (tệ hơn) không ai viết nó.
	// Giá trị production nằm ở pingInterval/pongTimeout/extendInterval và New
	// luôn đặt đúng chúng — xem SetHeartbeatTiming.
	pingEvery   time.Duration
	pongWait    time.Duration
	extendEvery time.Duration
}

// New dựng Bridge.
func New(f ExecutorFactory, alive SessionAliveFunc, extender Extender, log *slog.Logger, met *metrics.Metrics) *Bridge {
	return &Bridge{
		newExecutor: f,
		alive:       alive,
		extender:    extender,
		log:         log,
		met:         met,
		pingEvery:   pingInterval,
		pongWait:    pongTimeout,
		extendEvery: extendInterval,
	}
}

// SetHeartbeatTiming rút ngắn nhịp heartbeat. CHỈ DÙNG TRONG TEST — cùng khuôn
// với sessionstore.SetClock.
//
// Gọi TRƯỚC lời gọi Serve đầu tiên: đọc/ghi các trường này không có đồng bộ nào,
// và đổi chúng khi một phiên đang chạy là data race thật.
func (b *Bridge) SetHeartbeatTiming(ping, pong, extend time.Duration) {
	b.pingEvery, b.pongWait, b.extendEvery = ping, pong, extend
}

// sizeQueue nối control `resize` vào remotecommand.TerminalSizeQueue.
//
// ⛔ `Next()` PHẢI BLOCK. Trả `nil` nghĩa là "queue ĐÓNG VĨNH VIỄN, đừng hỏi
// nữa": client-go chạy `Next()` trong một goroutine vòng lặp riêng và THOÁT HẲN
// vòng đó khi nhận `nil`, không có đường quay lại. Trả `nil` "tạm" lúc channel
// rỗng là cách resize CHẾT ÂM THẦM giữa phiên — WS vẫn sống, người dùng vẫn gõ
// được, nhưng mọi lần kéo cửa sổ sau đó rơi vào hư không và chỉ lộ khi có người
// phàn nàn "vim vẽ sai từ lúc nào". Chỉ trả `nil` khi ctx đóng (kết nối chết thật).
type sizeQueue struct {
	ch  chan remotecommand.TerminalSize
	ctx context.Context
}

func (q *sizeQueue) Next() *remotecommand.TerminalSize {
	select {
	case s, ok := <-q.ch:
		if !ok {
			return nil
		}
		return &s
	case <-q.ctx.Done():
		return nil
	}
}

// push giữ GIÁ TRỊ CUỐI khi resize dồn dập (coalesce), không chặn goroutine đọc WS.
//
// Lưu ý phạm vi: spike đo 201 resize liên tiếp cần ~900ms để PTY lắng, trong khi
// một resize đơn lẻ chỉ mất 20ms — nghĩa là coalesce buffer-1 GIẢM chứ không
// CHẶN lưu lượng (Next() được gọi liên tục nên phần lớn giá trị trung gian vẫn
// lọt). Thứ thật sự chặn bão là debounce ~50ms phía FE (contract §4). Đừng bỏ
// debounce FE vì "server đã coalesce rồi".
func (q *sizeQueue) push(s remotecommand.TerminalSize) {
	for {
		select {
		case q.ch <- s:
			return
		case <-q.ctx.Done():
			return
		default:
			// Channel đầy: rút cái cũ ra rồi thử lại — resize là "trạng thái
			// mong muốn mới nhất", không phải hàng đợi sự kiện.
			select {
			case <-q.ch:
			default:
			}
		}
	}
}

// wsWriter đưa stdout của PTY ra binary frame.
//
// `coder/websocket` cho phép Write từ nhiều goroutine (serialize nội bộ) — đó
// chính là lý do chọn nó thay gorilla, vốn PANIC khi hai goroutine cùng
// WriteMessage, mà cầu này có đúng bài toán đó (goroutine đọc-pod ghi binary,
// đường đóng ghi control JSON).
//
// Ràng buộc còn lại của thư viện là MỘT READER tại một thời điểm ⇒ kiến trúc
// một-goroutine-đọc bên dưới là bắt buộc, không phải lựa chọn.
type wsWriter struct {
	c   *websocket.Conn
	ctx context.Context
	st  *connState
	met *metrics.Metrics

	// firstByte đóng đúng một lần, khi byte stdout ĐẦU TIÊN từ pod tới nơi —
	// bằng chứng "đã attach vào pod thật". Xem waitAttached.
	firstByte chan struct{}
	once      sync.Once
}

func (w *wsWriter) Write(p []byte) (int, error) {
	w.once.Do(func() { close(w.firstByte) })
	// Byte pod trả về là traffic THẬT: một lệnh chạy lâu đang in log giữ phiên
	// sống dù sinh viên không chạm bàn phím — đó đúng là "phiên còn người dùng"
	// mà ExtendSession tồn tại để báo.
	w.st.markActivity()

	// Deadline cho TỪNG lượt ghi: không có nó thì một client ngừng đọc (tab bị
	// treo, mạng nghẽn) làm goroutine này chặn vô hạn trong khi pod vẫn bơm
	// byte — bộ nhớ dồn ở tầng TCP/thư viện. Đây là vế "buffer có trần" của
	// luật 5: ta không đệm thêm, ta cắt.
	ctx, cancel := context.WithTimeout(w.ctx, writeTimeout)
	defer cancel()
	if err := w.c.Write(ctx, websocket.MessageBinary, p); err != nil {
		if ctx.Err() != nil && w.ctx.Err() == nil {
			// Hết deadline của RIÊNG lượt ghi này (ctx cha còn sống) ⇒ client
			// chậm, không phải phiên bị huỷ.
			w.st.setIntent(intentSlow)
		}
		return 0, err
	}
	w.met.WSBytesTotal.WithLabelValues(metrics.DirectionOut).Add(float64(len(p)))
	return len(p), nil
}

// Serve chạy trọn một phiên terminal trên `c`, rồi ĐÓNG `c` với mã đúng ngữ nghĩa.
//
// Caller (wsroute) đã qua đủ 9 bước authz của contract §3 và đã chiếm khe WS.
func (b *Bridge) Serve(ctx context.Context, c *websocket.Conn, t Target) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Mốc đo `dlp_gateway_attach_duration_seconds`: caller gọi Serve ngay sau
	// khi Accept trả 101, nên đây CHÍNH LÀ mốc 101 của contract.
	attachStart := time.Now()

	// Timer chia mốc tổng thành năm chặng (1.G-4 M1). Phải gắn vào ctx TRƯỚC
	// khi dial: RoundTripper đo `upgrade` tìm nó qua `req.Context()`, mà request
	// đó thừa hưởng đúng ctx ta truyền cho `StreamWithContext`.
	at := newAttachTimer(attachStart)
	ctx = withAttachTimer(ctx, at)

	c.SetReadLimit(MaxFrameBytes)
	st := &connState{}

	// ---- contract §3 bước 4: đợi `init` TRƯỚC khi dial ---------------------
	size, pendingStdin := b.readInit(ctx, c, t)
	at.markInit(time.Now())

	q := &sizeQueue{ch: make(chan remotecommand.TerminalSize, 1), ctx: ctx}
	q.push(size)

	// ---- stdin: WS binary → pipe → exec -----------------------------------
	//
	// ⛔ `defer stdinR.Close()` KHÔNG phải dọn dẹp cho gọn — thiếu nó là RÒ
	// GOROUTINE THẬT. Goroutine `copyStdin` của client-go không nằm trong
	// WaitGroup của executor, nên khi shell thoát nó ghi vào stream đã đóng,
	// lỗi, rồi CHẾT — từ lúc đó pipe không còn reader nào. Frame binary tiếp
	// theo làm `stdinW.Write` chặn VĨNH VIỄN, và goroutine đó không nằm trong
	// `c.Read` nên `cancel()` lẫn `CloseNow()` đều không gỡ được.
	//
	// Kịch bản đời thường: sinh viên gõ thêm phím trong lúc shell đang thoát.
	// Mỗi lần là một goroutine + một kết nối WS rò vĩnh viễn. Spike KHÔNG thấy
	// nó vì harness gõ `exit` rồi ngừng hẳn — phát hiện khi review đối kháng.
	stdinR, stdinW := io.Pipe()
	defer func() { _ = stdinR.Close() }()

	readerDone := make(chan struct{})
	go b.pumpClientToPod(ctx, cancel, c, stdinW, q, t, st, pendingStdin, readerDone)

	// ---- dial exec ---------------------------------------------------------
	exec, err := b.newExecutor(t)
	if err != nil {
		b.log.Error("dựng executor thất bại",
			slog.String("session_id", t.SessionID), slog.String("err", err.Error()))
		b.met.ExecErrorsTotal.WithLabelValues(metrics.KindDial).Inc()
		b.sendControl(ctx, c, ControlOut{Type: "error", Code: "EXEC_FAILED", Message: "không mở được phiên tới pod"})
		_ = c.Close(4500, "khong dung duoc executor")
		return
	}
	at.markExec(time.Now())

	w := &wsWriter{c: c, ctx: ctx, st: st, met: b.met, firstByte: make(chan struct{})}

	streamDone := make(chan error, 1)
	go func() {
		streamDone <- exec.StreamWithContext(ctx, remotecommand.StreamOptions{
			Stdin:  &timedStdinReader{r: stdinR, t: at},
			Stdout: w,
			// ⛔ Stderr VẮNG MẶT khi TTY — xem execURL.
			Tty:               true,
			TerminalSizeQueue: q,
		})
	}()

	// ---- contract §3 bước 6: `ready` -------------------------------------
	if done, streamErr := b.waitAttached(ctx, w.firstByte, streamDone); done {
		b.finish(ctx, c, t, streamErr, st)
		<-readerDone
		return
	}
	// Mốc `ready` lấy MỘT lần rồi dùng cho cả hai phép đo: nếu lấy hai lần thì
	// tổng năm chặng không còn bằng đúng mẫu tổng, và phép đối chứng ±5% của
	// probe sẽ lệch vì chính dụng cụ đo chứ không vì hệ thống.
	readyAt := time.Now()
	b.sendControl(ctx, c, b.buildReady(t))
	b.met.AttachDuration.Observe(readyAt.Sub(attachStart).Seconds())
	at.observe(b.met, readyAt)

	// ---- keepalive + gia hạn (G7) -----------------------------------------
	//
	// Bắt đầu SAU `ready` có chủ ý: trước mốc đó phiên còn bị chặn bởi
	// `initTimeout` + `attachGrace` (tổng ≤ 5s), ngắn hơn một nhịp ping, nên
	// chạy sớm hơn chỉ thêm một goroutine không đo được gì.
	// ⛔ `hbStop` LÀ MỘT KÊNH RIÊNG, KHÔNG PHẢI `cancel()`.
	//
	// Heartbeat phải dừng TRƯỚC `finish`, nếu không một `expiring` có thể chen
	// vào giữa control `exit`/`error` và close frame — contract §5 hứa "`error`
	// luôn đi ngay trước một close frame", và FE dựa vào đúng lời hứa đó để biết
	// vì sao phiên kết thúc.
	//
	// Nhưng KHÔNG được dừng nó bằng `cancel()`: `coder/websocket` đóng phăng kết
	// nối khi context của một thao tác bị huỷ, nên `finish` sau đó sẽ không gửi
	// nổi `exit` lẫn close code và client chỉ thấy `1006`. Một kênh riêng dừng
	// đúng cái cần dừng mà không đụng tới kết nối.
	hbStop := make(chan struct{})
	hbDone := make(chan struct{})
	go func() {
		defer close(hbDone)
		b.heartbeat(ctx, cancel, c, t, st, hbStop)
	}()

	// ---- chạy tới khi stream kết thúc -------------------------------------
	streamErr := <-streamDone
	close(hbStop)
	<-hbDone

	b.finish(ctx, c, t, streamErr, st)
	cancel()
	<-readerDone
}

// readInit đọc frame `init` (contract §3 bước 4), trả kích thước và phần stdin
// lỡ tới sớm.
//
// ⛔ `pendingStdin` giữ frame binary tới TRƯỚC `init`. Vứt nó đi là MẤT PHÍM ĐẦU
// TIÊN của người dùng: FE nào gửi stdin trước khi `document.fonts.ready` kịp cho
// FitAddon đo xong sẽ rơi đúng vào ca này, và triệu chứng ("thỉnh thoảng mất ký
// tự đầu") gần như không chẩn đoán được.
func (b *Bridge) readInit(ctx context.Context, c *websocket.Conn, t Target) (remotecommand.TerminalSize, []byte) {
	size := remotecommand.TerminalSize{Width: 80, Height: 24}

	initCtx, cancel := context.WithTimeout(ctx, initTimeout)
	defer cancel()

	typ, data, err := c.Read(initCtx)
	switch {
	case err != nil:
		b.log.Info("không nhận được init trong hạn — dùng 80x24",
			slog.String("session_id", t.SessionID), slog.String("err", err.Error()))
	case typ == websocket.MessageText:
		var ci ControlIn
		if json.Unmarshal(data, &ci) == nil && ci.Type == "init" && ci.Cols > 0 && ci.Rows > 0 {
			cols, c1 := clampDim(ci.Cols)
			rows, c2 := clampDim(ci.Rows)
			if c1 || c2 {
				b.log.Warn("init ngoài khoảng hợp lệ, đã clamp",
					slog.String("session_id", t.SessionID),
					slog.Int("cols", int(cols)), slog.Int("rows", int(rows)))
			}
			size = remotecommand.TerminalSize{Width: cols, Height: rows}
		} else {
			// Chỉ log ĐỘ DÀI, không log nội dung: frame do client soạn, đưa
			// thẳng vào log là chèn được dòng giả. Nội dung frame hỏng gần như
			// không giúp chẩn đoán, còn log bị đầu độc thì có.
			b.log.Warn("frame đầu không phải init hợp lệ — dùng 80x24",
				slog.String("session_id", t.SessionID), slog.Int("bytes", len(data)))
		}
	default:
		b.log.Warn("frame đầu là binary — contract bắt init trước; giữ lại làm stdin",
			slog.String("session_id", t.SessionID), slog.Int("bytes", len(data)))
		return size, append([]byte(nil), data...)
	}
	return size, nil
}

// pumpClientToPod là GOROUTINE ĐỌC DUY NHẤT của kết nối (ràng buộc một-reader
// của coder/websocket). Binary → stdin của pod; Text → control.
func (b *Bridge) pumpClientToPod(
	ctx context.Context, cancel context.CancelFunc,
	c *websocket.Conn, stdinW *io.PipeWriter, q *sizeQueue,
	t Target, st *connState, pending []byte, done chan<- struct{},
) {
	defer close(done)
	defer func() { _ = stdinW.Close() }()

	// Hai limiter sống trên STACK của goroutine này ⇒ mỗi kết nối một bộ token
	// riêng. Đặt chúng lên Bridge là biến trần-mỗi-phiên thành trần-toàn-service:
	// một sinh viên dán một file to sẽ bóp cổ terminal của mọi người còn lại.
	stdinLimit := rate.NewLimiter(stdinBytesPerSec, stdinBurstBytes)
	controlLimit := rate.NewLimiter(controlPerSec, controlBurst)

	// Byte lỡ tới trước `init` đi vào stdin TRƯỚC mọi frame sau đó — giữ đúng
	// thứ tự người dùng đã gõ.
	if len(pending) > 0 {
		if _, err := stdinW.Write(pending); err != nil {
			return
		}
	}

	for {
		typ, data, err := c.Read(ctx)
		if err != nil {
			// Client đóng / mạng đứt / vượt read-limit (thư viện tự đóng 1009).
			_ = stdinW.CloseWithError(err)
			cancel()
			return
		}

		switch typ {
		case websocket.MessageBinary:
			// ⛔ KIỂM TRẦN TRƯỚC KHI GHI. Ghi rồi mới kiểm nghĩa là frame vi
			// phạm đã vào stdin của pod — trần khi đó chỉ là một cách đóng kết
			// nối muộn, không phải một cách chặn.
			//
			// AllowN(now, n), KHÔNG WaitN: chờ là đệm, và đệm là đúng thứ luật 5
			// cấm. Vượt trần thì cắt.
			if !stdinLimit.AllowN(time.Now(), len(data)) {
				b.log.Warn("client vượt trần tốc độ stdin — đóng 4429",
					slog.String("session_id", t.SessionID), slog.Int("bytes", len(data)))
				st.setIntent(intentRateLimited)
				// Đóng TRƯỚC cancel — xem ghi chú ở extendOnce: cancel() làm
				// coder/websocket đóng phăng kết nối và mã đóng thật không bao
				// giờ tới được client.
				b.sendControl(ctx, c, ControlOut{
					Type: "error", Code: "RATE_LIMITED", Message: "vượt trần tốc độ gửi dữ liệu"})
				_ = c.Close(4429, "vuot tran toc do")
				cancel()
				return
			}
			st.markActivity()
			b.met.WSBytesTotal.WithLabelValues(metrics.DirectionIn).Add(float64(len(data)))

			// Byte thô đi THẲNG: không parse, không decode UTF-8. Một glyph
			// Nerd Font 3–4 byte bị cắt qua ranh giới hai frame mà đem decode
			// sẽ thành ký tự hỏng (contract §1).
			if _, err := stdinW.Write(data); err != nil {
				return
			}
		case websocket.MessageText:
			// Control KHÔNG đánh dấu activity: resize là FE tự phát theo
			// ResizeObserver, không phải bằng chứng có người ở đó. Một tab bỏ
			// quên trong cửa sổ đang được kéo qua kéo lại vẫn là tab bỏ quên.
			if !controlLimit.Allow() {
				b.log.Warn("bão control message — đóng 4400",
					slog.String("session_id", t.SessionID))
				st.setIntent(intentProtocol)
				_ = c.Close(4400, "bao control message")
				cancel()
				return
			}
			if !b.handleControl(ctx, c, q, t, st, data) {
				cancel()
				return
			}
		}
	}
}

// handleControl xử lý một control message. Trả false nghĩa là đã đóng kết nối.
func (b *Bridge) handleControl(ctx context.Context, c *websocket.Conn, q *sizeQueue, t Target, st *connState, data []byte) bool {
	var ci ControlIn
	if err := json.Unmarshal(data, &ci); err != nil {
		b.log.Warn("control JSON hỏng",
			slog.String("session_id", t.SessionID), slog.Int("bytes", len(data)))
		st.setIntent(intentProtocol)
		_ = c.Close(4400, "control JSON hong")
		return false
	}

	switch ci.Type {
	case "resize", "init": // `init` thứ hai xử lý như `resize` (contract §4)
		cols, c1 := clampDim(ci.Cols)
		rows, c2 := clampDim(ci.Rows)
		if c1 || c2 {
			// Clamp + log, KHÔNG đóng: FE có bug layout không đáng bị ngắt terminal.
			b.log.Warn("resize ngoài khoảng hợp lệ, đã clamp",
				slog.String("session_id", t.SessionID),
				slog.Int("cols", int(cols)), slog.Int("rows", int(rows)))
		}
		q.push(remotecommand.TerminalSize{Width: cols, Height: rows})
		_ = ctx
		return true
	default:
		// KHÔNG nội suy ci.Type vào reason: nó là chuỗi client soạn, và reason
		// đi thẳng vào close frame lẫn log.
		b.log.Warn("control type lạ", slog.String("session_id", t.SessionID))
		st.setIntent(intentProtocol)
		_ = c.Close(4400, "type control khong hop le")
		return false
	}
}

// waitAttached chờ bằng chứng đã attach vào pod, trước khi phát `ready`.
//
// `ready` theo contract §5 nghĩa là "ĐÃ attach vào pod thật" — 101 chỉ nghĩa là
// "tới được gateway". client-go không phơi callback "đã attach" nào, nên bằng
// chứng mạnh nhất có sẵn là BYTE STDOUT ĐẦU TIÊN: nó chỉ tới được khi stream đã
// dựng xong tới PTY.
//
// `attachGrace` là lưới an toàn cho ca lệnh exec không in gì ngay: tới lúc đó
// dial đã hoặc thành công hoặc thất bại (thất bại thì nhánh streamDone bắt
// trước). Với `tmux new-session -A` mặc định thì tmux luôn vẽ ngay, nên nhánh
// grace gần như không chạy — nó tồn tại để một GATEWAY_EXEC_COMMAND im lặng
// không làm FE treo vĩnh viễn.
//
// Trả `done=true` nghĩa là stream đã kết thúc TRƯỚC khi attach — caller đi
// thẳng đường đóng, KHÔNG phát `ready` (phát rồi mới báo lỗi là nói dối FE).
func (b *Bridge) waitAttached(ctx context.Context, attached <-chan struct{}, streamDone <-chan error) (done bool, streamErr error) {
	timer := time.NewTimer(attachGrace)
	defer timer.Stop()

	select {
	case <-attached:
		return false, nil
	case err := <-streamDone:
		return true, err
	case <-timer.C:
		return false, nil
	case <-ctx.Done():
		return true, ctx.Err()
	}
}

// buildReady dựng control `ready`.
//
// ⛔ `hardCapAt` CỐ Ý VẮNG dù contract §5 liệt kê nó. Gateway KHÔNG tính được
// mốc đó: nó = `createdAt + HARD_CAP`, mà `HARD_CAP` là config của ORCHESTRATOR
// (2h). Thêm một `GATEWAY_HARD_CAP` ở đây là dựng ra hằng số thứ hai cho cùng
// một con số, đúng thứ phase-1 đã trả giá vài lần vì để trôi.
//
// Đường đúng là G7: `ExtendSessionResponse.hard_cap_reached` tới từ orchestrator
// và gateway chuyển tiếp thành control `expiring`. Tới lúc đó FE dùng
// `expiresAt` cho đồng hồ đếm ngược — đủ cho mọi thứ FE cần ở chặng này.
func (b *Bridge) buildReady(t Target) ControlOut {
	return ControlOut{
		Type:          "ready",
		SessionID:     t.SessionID,
		PodName:       t.PodName,
		ExpiresAt:     epochToRFC3339(t.ExpiresAt),
		MaxFrameBytes: MaxFrameBytes,
	}
}

// finish chọn close code theo contract §6 rồi đóng kết nối.
func (b *Bridge) finish(ctx context.Context, c *websocket.Conn, t Target, streamErr error, st *connState) {
	// ⛔ INTENT ĐƯỢC HỎI TRƯỚC exit code, KHÔNG PHẢI SAU.
	//
	// Mọi nguyên nhân dưới đây đều kết thúc bằng `cancel()`, và sau cancel thì
	// stream trả về một lỗi context — tức exit code KHÔNG CÒN mang thông tin
	// phân biệt. Không hỏi intent trước thì cả bốn ca rơi vào nhánh 4500 "lỗi hạ
	// tầng" và người trực đi tìm apiserver cho một tab đang treo.
	switch st.currentIntent() {
	case intentSlow:
		// Ca DUY NHẤT `finish` còn phải tự đóng. Nó được phát hiện bên trong
		// `wsWriter.Write` — tức trong goroutine copy-stdout của client-go, nơi
		// không có ai sở hữu vòng đời kết nối để gửi close frame cho tử tế.
		// Đường đó không gọi cancel(), nên kết nối vẫn còn sống tới đây.
		b.log.Warn("client không đọc kịp — đóng 4429", slog.String("session_id", t.SessionID))
		b.sendControl(ctx, c, ControlOut{Type: "error", Code: "RATE_LIMITED", Message: "client không đọc kịp dữ liệu"})
		_ = c.Close(4429, "client qua cham")
		return

	case intentRateLimited, intentGone, intentHardCap, intentProtocol:
		// Bốn ca này ĐÃ gửi `error` + close frame ngay tại chỗ phát hiện, kèm
		// đúng mã của nó, rồi mới cancel(). Im lặng ở đây là có chủ ý: đi tiếp
		// sẽ log "stream lỗi hạ tầng" cho một phiên chết vì lý do đã biết rõ, và
		// dạy người đọc log bỏ qua đúng dòng đáng tin nhất.
		return
	}

	code, isExit := exitStatus(streamErr)

	// Thoát bình thường và KHÔNG phải mã tín hiệu → không cần hỏi Redis.
	if isExit && !isSignalExit(code) {
		b.sendControl(ctx, c, ControlOut{Type: "exit", ExitCode: &code})
		_ = c.Close(websocket.StatusNormalClosure, "exit")
		return
	}

	// Còn lại là hai ca KHÔNG phân biệt được bằng riêng exit code:
	//   - exit ∈ {137,143}: pod bị reap, HAY người dùng tự `kill -9`?
	//   - lỗi hạ tầng: session đã biến mất, HAY apiserver trục trặc?
	// Cả hai phải hỏi Redis (contract §6).
	if b.sessionGone(ctx, t.SessionID) {
		// Đường ĐUA với heartbeat: reaper xoá pod làm stream đứt ở đây, trong
		// khi heartbeat có thể đang phát hiện cùng chuyện đó qua lượt gia hạn.
		// Cùng một hàm ⇒ cùng một mã, bất kể ai tới trước.
		b.closeTerminal(ctx, c, t, st)
		return
	}

	if isExit {
		// Session còn sống ⇒ tín hiệu đến từ BÊN TRONG pod, tức người dùng tự
		// giết tiến trình của mình. Đó là thoát thật.
		b.sendControl(ctx, c, ControlOut{Type: "exit", ExitCode: &code})
		_ = c.Close(websocket.StatusNormalClosure, "exit")
		return
	}

	b.log.Error("stream lỗi hạ tầng",
		slog.String("session_id", t.SessionID), slog.String("err", errText(streamErr)))
	b.met.ExecErrorsTotal.WithLabelValues(metrics.KindStream).Inc()
	b.sendControl(ctx, c, ControlOut{Type: "error", Code: "EXEC_FAILED", Message: "phiên tới pod bị gián đoạn"})
	_ = c.Close(4500, truncateReason("loi stream: "+errText(streamErr)))
}

// closeTerminal đóng một phiên đã hết hiệu lực, chọn giữa `4404` và `4409` theo
// thứ gateway ĐÃ QUAN SÁT được.
//
// ⛔ HAI GOROUTINE CÙNG TỚI ĐƯỢC ĐÂY VÀ CHÚNG ĐUA NHAU — đó là lý do hàm này
// tồn tại thay vì hai đoạn giống nhau. Khi phiên chạm trần cứng, có hai thứ xảy
// ra gần như cùng lúc: heartbeat gọi gia hạn và thấy session biến mất, VÀ reaper
// xoá pod làm stream đứt (`finish` chạy). Ai tới trước cũng phải đóng bằng CÙNG
// một mã, nếu không close code của cùng một sự kiện phụ thuộc vào việc hôm đó
// reaper nhanh hay chậm.
//
// `intent` (CompareAndSwap) giữ cho lần đóng thứ hai thành no-op.
func (b *Bridge) closeTerminal(ctx context.Context, c *websocket.Conn, t Target, st *connState) {
	if st.hardCapSeen.Load() {
		b.log.Info("phiên kết thúc vì hết thời lượng tối đa — đóng 4409",
			slog.String("session_id", t.SessionID))
		st.setIntent(intentHardCap)
		b.sendControl(ctx, c, ControlOut{
			Type: "error", Code: "HARD_CAP_REACHED", Message: "phiên đã chạy hết thời lượng tối đa"})
		_ = c.Close(4409, "hard cap reached")
		return
	}
	b.log.Info("session không còn hiệu lực — đóng 4404", slog.String("session_id", t.SessionID))
	st.setIntent(intentGone)
	b.sendControl(ctx, c, ControlOut{Type: "error", Code: "SESSION_GONE", Message: "phiên đã kết thúc"})
	_ = c.Close(4404, "session gone")
}

// sessionGone hỏi Redis. Lỗi khi hỏi → coi là CÒN SỐNG (fail-open có chủ ý):
// đóng `4404` bảo FE "đừng retry", nên đoán sai theo hướng đó là khoá người dùng
// khỏi một phiên vẫn còn hạn. Đoán sai hướng kia chỉ tốn một lượt retry vô hại.
func (b *Bridge) sessionGone(ctx context.Context, sessionID string) bool {
	probeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), closeProbeTimeout)
	defer cancel()

	alive, err := b.alive(probeCtx, sessionID)
	if err != nil {
		b.log.Warn("không tra được trạng thái session trên đường đóng — coi như còn sống",
			slog.String("session_id", sessionID), slog.String("err", err.Error()))
		return false
	}
	return !alive
}

// sendControl gửi một control message dạng text.
//
// ctx của phiên có thể đã huỷ khi tới đây (đường đóng), nên dùng context tách
// rời — nếu không, mọi `error`/`exit` cuối phiên đều im lặng không tới FE, và
// contract §5 ("`error` luôn đi ngay trước một close frame") thành lời hứa suông.
func (b *Bridge) sendControl(ctx context.Context, c *websocket.Conn, msg ControlOut) {
	payload, err := json.Marshal(msg)
	if err != nil {
		return
	}
	wctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
	defer cancel()
	_ = c.Write(wctx, websocket.MessageText, payload)
}

// exitStatus trích exit code.
//
// Dùng `errors.As` với INTERFACE thay vì import kiểu cứng
// `k8s.io/client-go/util/exec.CodeExitError` — spike chốt kiểu thật bằng đúng
// cách này. Lỗi KHÔNG khớp interface là lỗi hạ tầng (dial fail, apiserver 4xx/5xx,
// mạng đứt), phải map sang 4500 chứ không phải `exit`.
func exitStatus(err error) (int, bool) {
	if err == nil {
		return 0, true
	}
	var exitErr interface {
		error
		ExitStatus() int
	}
	if errors.As(err, &exitErr) {
		return exitErr.ExitStatus(), true
	}
	return -1, false
}

// isSignalExit: 137 = 128+SIGKILL, 143 = 128+SIGTERM. Đây đúng là hai mã mà pod
// bị xoá và người dùng tự giết tiến trình KHÔNG phân biệt được với nhau.
func isSignalExit(code int) bool { return code == 137 || code == 143 }

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
