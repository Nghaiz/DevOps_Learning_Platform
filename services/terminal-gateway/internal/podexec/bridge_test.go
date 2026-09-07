package podexec_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/coder/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"k8s.io/client-go/tools/remotecommand"
)

// ---------------------------------------------------------------- test double

// fakeExecutor thay `remotecommand.Executor` để CẢ CẦU chạy được mà không cần
// apiserver.
//
// Đây là thứ quyết định phần logic này có được gác ở PR hay không: mọi nhánh
// đáng sợ của G4–G6 (chọn close code khi exit 137, `ready` phát đúng lúc, phím
// gõ trước `init` không mất) đều nằm TRONG cầu, và không có seam này thì chúng
// chỉ kiểm được bằng tay trên cluster — tức là không được kiểm.
type fakeExecutor struct {
	fn func(ctx context.Context, o remotecommand.StreamOptions) error
}

func (f *fakeExecutor) Stream(o remotecommand.StreamOptions) error {
	return f.fn(context.Background(), o)
}

func (f *fakeExecutor) StreamWithContext(ctx context.Context, o remotecommand.StreamOptions) error {
	return f.fn(ctx, o)
}

// codeExitError phản chiếu `k8s.io/client-go/util/exec.CodeExitError`. Cầu trích
// exit code bằng `errors.As` trên INTERFACE `ExitStatus() int` (đúng cách spike
// chốt kiểu thật), nên một kiểu tự định nghĩa ở đây khớp y hệt kiểu thật — và ca
// test vì thế đo đúng cơ chế đang chạy trên production.
type codeExitError struct{ code int }

func (e codeExitError) Error() string   { return "command terminated with exit code " + itoa(e.code) }
func (e codeExitError) ExitStatus() int { return e.code }

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// ---------------------------------------------------------------- harness

type bridgeHarness struct {
	client *websocket.Conn
	served chan struct{}
	met    *metrics.Metrics
	reg    *prometheus.Registry
}

// stubExtender là Extender mặc định cho các ca không quan tâm tới gia hạn: nó
// trả OK với hạn KHÔNG đổi, nên heartbeat không bao giờ phát `expiring` và
// không ca test cũ nào phải biết G7 tồn tại.
type stubExtender struct {
	mu    sync.Mutex
	calls int
	res   podexec.ExtendResult
	err   error
}

func (s *stubExtender) Extend(context.Context, string, string) (podexec.ExtendResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	return s.res, s.err
}

func (s *stubExtender) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

// bridgeOpts là các nút chỉnh mà chỉ vài ca test cần. Zero value = hành vi của
// mọi ca cũ, nên chúng không phải đổi một dòng nào.
type bridgeOpts struct {
	extender podexec.Extender
	// timing rút nhịp heartbeat xuống mức test chờ được. 0 = giữ nhịp production
	// (20s/10s/60s), tức heartbeat không bao giờ tick trong một ca test ngắn.
	pingEvery, pongWait, extendEvery time.Duration
	// podGone là phép hỏi apiserver trên đường đóng. nil = KHÔNG gắn probe, tức
	// hành vi trước 2026-09-06 — mọi ca test cũ chạy ở nhánh đó.
	podGone podexec.PodGoneFunc
	// deadline ghi mốc hết hạn vào pod (A6). nil = KHÔNG gắn runner, tức tính
	// năng tắt — hành vi của mọi ca test cũ.
	deadline podexec.DeadlineRunner
	// logs nhận log của cầu. nil = io.Discard như mọi ca cũ. Ca nào khẳng định
	// "hỏng mà KHÔNG nuốt im lặng" thì phải đọc được chúng.
	logs io.Writer
	// expiresAt ghi đè mốc hết hạn của Target. nil = mốc mặc định dưới đây.
	// Con trỏ chứ không phải int64 vì 0 là một giá trị CẦN TEST (hash hỏng), nên
	// nó không dùng được làm sentinel "chưa đặt".
	expiresAt *int64
}

// defaultExpiresAt là mốc hết hạn mà mọi ca test cũ trông đợi ở `ready`.
var defaultExpiresAt = time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC).Unix()

// newBridge dựng một server WS chạy Bridge thật, và trả kết nối phía CLIENT.
func newBridge(t *testing.T, exec *fakeExecutor, alive podexec.SessionAliveFunc, opts ...bridgeOpts) *bridgeHarness {
	t.Helper()

	var o bridgeOpts
	if len(opts) > 0 {
		o = opts[0]
	}
	if o.extender == nil {
		o.extender = &stubExtender{}
	}

	// Registry RIÊNG mỗi test: registry toàn cục làm ca thứ hai trong cùng
	// process panic "duplicate collector".
	reg := prometheus.NewRegistry()
	met := metrics.New(reg)

	logDst := io.Writer(io.Discard)
	if o.logs != nil {
		logDst = o.logs
	}

	h := &bridgeHarness{served: make(chan struct{}), met: met, reg: reg}
	b := podexec.New(
		func(podexec.Target) (remotecommand.Executor, error) { return exec, nil },
		alive,
		o.extender,
		slog.New(slog.NewTextHandler(logDst, nil)),
		met,
	)
	if o.pingEvery > 0 {
		b.SetHeartbeatTiming(o.pingEvery, o.pongWait, o.extendEvery)
	}
	if o.podGone != nil {
		b.SetPodProbe(o.podGone)
	}
	if o.deadline != nil {
		b.SetDeadlineRunner(o.deadline)
	}

	expiresAt := defaultExpiresAt
	if o.expiresAt != nil {
		expiresAt = *o.expiresAt
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer close(h.served)
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			Subprotocols:       []string{"dlp.terminal.v1"},
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}
		defer func() { _ = c.CloseNow() }()
		b.Serve(r.Context(), c, podexec.Target{
			SessionID: "sess-a",
			PodName:   "sandbox-deadbeef",
			Namespace: "dlp-sandbox",
			ExpiresAt: expiresAt,
			UserID:    "user-a",
		})
	}))
	t.Cleanup(srv.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	t.Cleanup(cancel)
	c, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http"), &websocket.DialOptions{
		HTTPClient:   srv.Client(),
		Subprotocols: []string{"dlp.terminal.v1"},
	})
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	t.Cleanup(func() { _ = c.CloseNow() })
	h.client = c
	return h
}

// alwaysAlive / alwaysGone là hai câu trả lời của Redis trên đường đóng.
func alwaysAlive(context.Context, string) (bool, error) { return true, nil }
func alwaysGone(context.Context, string) (bool, error)  { return false, nil }

// sendInit gửi frame `init` bắt buộc (contract §3 bước 4).
func (h *bridgeHarness) sendInit(t *testing.T, cols, rows int) {
	t.Helper()
	h.sendControl(t, map[string]any{"type": "init", "cols": cols, "rows": rows})
}

func (h *bridgeHarness) sendControl(t *testing.T, m map[string]any) {
	t.Helper()
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.client.Write(ctx, websocket.MessageText, raw); err != nil {
		t.Fatalf("gửi control: %v", err)
	}
}

// readUntilClose đọc tới khi kết nối đóng; trả các control message text đã nhận,
// toàn bộ byte binary, và close code.
func (h *bridgeHarness) readUntilClose(t *testing.T) (controls []podexec.ControlOut, stdout []byte, closeCode websocket.StatusCode) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	for {
		typ, data, err := h.client.Read(ctx)
		if err != nil {
			return controls, stdout, websocket.CloseStatus(err)
		}
		switch typ {
		case websocket.MessageText:
			var co podexec.ControlOut
			if err := json.Unmarshal(data, &co); err != nil {
				t.Fatalf("control không phải JSON: %v", err)
			}
			controls = append(controls, co)
		case websocket.MessageBinary:
			stdout = append(stdout, data...)
		}
	}
}

func findControl(cs []podexec.ControlOut, typ string) (podexec.ControlOut, bool) {
	for _, c := range cs {
		if c.Type == typ {
			return c, true
		}
	}
	return podexec.ControlOut{}, false
}

// ---------------------------------------------------------------- G6: init

// Contract §3 bước 4–5: server đợi `init` mang cols/rows TRƯỚC khi dial, để
// prompt oh-my-posh vẽ đúng bề rộng NGAY lần đầu thay vì vẽ 80 cột rồi nhảy.
func TestInitTruocKhiDialQuyetDinhKichThuocBanDau(t *testing.T) {
	gotSize := make(chan remotecommand.TerminalSize, 1)
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		gotSize <- *o.TerminalSizeQueue.Next()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 120, 34)
	h.readUntilClose(t)

	select {
	case s := <-gotSize:
		if s.Width != 120 || s.Height != 34 {
			t.Fatalf("kích thước lúc dial = %dx%d, muốn 120x34", s.Width, s.Height)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("executor không bao giờ nhận được kích thước")
	}
}

// Không có `init` trong hạn → 80×24, và phiên VẪN chạy. Fail-closed ở đây sẽ
// chặn mọi client không phải trình duyệt (wscat, probe vận hành).
func TestVangInitThiDung80x24ChuKhongChet(t *testing.T) {
	gotSize := make(chan remotecommand.TerminalSize, 1)
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		gotSize <- *o.TerminalSizeQueue.Next()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	// KHÔNG gửi init. initTimeout là 3s.
	h.readUntilClose(t)

	select {
	case s := <-gotSize:
		if s.Width != 80 || s.Height != 24 {
			t.Fatalf("kích thước mặc định = %dx%d, muốn 80x24", s.Width, s.Height)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("executor không bao giờ nhận được kích thước")
	}
}

// ⛔ Frame binary tới TRƯỚC `init` phải được GIỮ, không được vứt.
//
// FE nào gửi stdin trước khi `document.fonts.ready` kịp cho FitAddon đo xong sẽ
// rơi đúng vào ca này. Vứt đi là MẤT PHÍM ĐẦU TIÊN của người dùng, và triệu
// chứng ("thỉnh thoảng mất ký tự đầu") gần như không chẩn đoán được.
func TestByteGoTruocInitKhongBiMat(t *testing.T) {
	gotStdin := make(chan []byte, 1)
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		buf := make([]byte, 5)
		n, _ := io.ReadFull(o.Stdin, buf)
		gotStdin <- buf[:n]
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.client.Write(ctx, websocket.MessageBinary, []byte("hello")); err != nil {
		t.Fatalf("gửi stdin sớm: %v", err)
	}
	h.readUntilClose(t)

	select {
	case got := <-gotStdin:
		if string(got) != "hello" {
			t.Fatalf("stdin = %q, muốn %q — phím gõ trước init bị mất", got, "hello")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("pod không nhận được stdin nào")
	}
}

// ---------------------------------------------------------------- G6: resize

func TestResizeToiDuocPTY(t *testing.T) {
	sizes := make(chan remotecommand.TerminalSize, 4)
	exec := &fakeExecutor{fn: func(ctx context.Context, o remotecommand.StreamOptions) error {
		for i := 0; i < 2; i++ {
			s := o.TerminalSizeQueue.Next()
			if s == nil {
				return nil
			}
			sizes <- *s
		}
		<-ctx.Done()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)
	h.sendControl(t, map[string]any{"type": "resize", "cols": 200, "rows": 50})

	// Bỏ qua giá trị init, lấy giá trị resize.
	<-sizes
	select {
	case s := <-sizes:
		if s.Width != 200 || s.Height != 50 {
			t.Fatalf("resize = %dx%d, muốn 200x50", s.Width, s.Height)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("resize không tới được PTY")
	}
	_ = h.client.Close(websocket.StatusNormalClosure, "")
}

// ⛔ `Next()` PHẢI BLOCK khi hàng rỗng, KHÔNG được trả nil.
//
// client-go thoát HẲN vòng đọc size khi nhận nil, nên trả nil "tạm" là cách
// resize chết âm thầm giữa phiên: WS vẫn sống, người dùng vẫn gõ được, nhưng
// mọi lần kéo cửa sổ sau đó rơi vào hư không. Ca này gọi Next() lần thứ hai lúc
// hàng chắc chắn rỗng và khẳng định nó KHÔNG trả về ngay.
func TestNextBlockKhiHangRongChuKhongTraNil(t *testing.T) {
	secondReturned := make(chan *remotecommand.TerminalSize, 1)
	exec := &fakeExecutor{fn: func(ctx context.Context, o remotecommand.StreamOptions) error {
		o.TerminalSizeQueue.Next() // giá trị init
		go func() { secondReturned <- o.TerminalSizeQueue.Next() }()
		<-ctx.Done()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	select {
	case s := <-secondReturned:
		t.Fatalf("Next() trả về %v khi hàng rỗng — client-go sẽ thoát hẳn vòng đọc size "+
			"và mọi resize sau đó rơi vào hư không", s)
	case <-time.After(500 * time.Millisecond):
		// Đúng: vẫn đang block.
	}
	_ = h.client.Close(websocket.StatusNormalClosure, "")
}

// cols/rows ngoài khoảng → CLAMP + log, KHÔNG đóng kết nối: một bug layout phía
// FE không đáng để sinh viên mất phiên (contract §4).
func TestKichThuocNgoaiKhoangThiClampChuKhongDong(t *testing.T) {
	sizes := make(chan remotecommand.TerminalSize, 4)
	exec := &fakeExecutor{fn: func(ctx context.Context, o remotecommand.StreamOptions) error {
		for i := 0; i < 2; i++ {
			s := o.TerminalSizeQueue.Next()
			if s == nil {
				return nil
			}
			sizes <- *s
		}
		<-ctx.Done()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)
	h.sendControl(t, map[string]any{"type": "resize", "cols": 65535, "rows": 0})

	<-sizes
	select {
	case s := <-sizes:
		if s.Width != 1000 || s.Height != 1 {
			t.Fatalf("clamp = %dx%d, muốn 1000x1", s.Width, s.Height)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("resize ngoài khoảng bị nuốt hẳn thay vì clamp")
	}
	_ = h.client.Close(websocket.StatusNormalClosure, "")
}

// ---------------------------------------------------------------- G5: control hỏng

func TestControlJSONHongDong4400(t *testing.T) {
	exec := &fakeExecutor{fn: func(ctx context.Context, _ remotecommand.StreamOptions) error {
		<-ctx.Done()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.client.Write(ctx, websocket.MessageText, []byte("{khong-phai-json")); err != nil {
		t.Fatalf("gửi: %v", err)
	}
	if _, _, code := h.readUntilClose(t); code != 4400 {
		t.Fatalf("close code = %d, muốn 4400", code)
	}
}

func TestControlTypeLaDong4400(t *testing.T) {
	exec := &fakeExecutor{fn: func(ctx context.Context, _ remotecommand.StreamOptions) error {
		<-ctx.Done()
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)
	h.sendControl(t, map[string]any{"type": "chay-lenh-nay-di", "cols": 80, "rows": 24})

	if _, _, code := h.readUntilClose(t); code != 4400 {
		t.Fatalf("close code = %d, muốn 4400", code)
	}
}

// ---------------------------------------------------------------- G5: ready

// `ready` là frame ĐẦU TIÊN server gửi, và nó mang sẵn expiresAt để FE vẽ đồng
// hồ đếm ngược mà không phải gọi thêm tRPC (contract §5).
func TestReadyMangDuThongTinChoFE(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("prompt$ "))
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 120, 34)

	controls, stdout, _ := h.readUntilClose(t)
	ready, ok := findControl(controls, "ready")
	if !ok {
		t.Fatalf("không có control `ready`; nhận: %+v", controls)
	}
	if ready.SessionID != "sess-a" || ready.PodName != "sandbox-deadbeef" {
		t.Fatalf("ready = %+v — sessionId/podName sai", ready)
	}
	if ready.ExpiresAt != "2026-08-09T12:00:00Z" {
		t.Fatalf("ready.expiresAt = %q, muốn RFC3339 UTC", ready.ExpiresAt)
	}
	if ready.MaxFrameBytes != podexec.MaxFrameBytes {
		t.Fatalf("ready.maxFrameBytes = %d, muốn %d — FE cần nó để tự chia nhỏ paste lớn",
			ready.MaxFrameBytes, podexec.MaxFrameBytes)
	}
	if string(stdout) != "prompt$ " {
		t.Fatalf("stdout = %q — byte của PTY phải đi thẳng ra binary frame", stdout)
	}
}

// ⛔ Stream chết TRƯỚC khi attach ⇒ TUYỆT ĐỐI không phát `ready`.
//
// `ready` nghĩa là "đã attach vào pod thật". Phát nó rồi mới báo lỗi là nói dối
// FE: FE sẽ vẽ terminal, tắt spinner, rồi mới nhận close — và người dùng thấy
// một terminal chớp lên rồi biến mất mà không hiểu vì sao.
func TestStreamChetTruocAttachThiKhongPhatReady(t *testing.T) {
	exec := &fakeExecutor{fn: func(context.Context, remotecommand.StreamOptions) error {
		return errors.New("apiserver: 500")
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	if _, ok := findControl(controls, "ready"); ok {
		t.Fatalf("phát `ready` dù chưa bao giờ attach: %+v", controls)
	}
	if code != 4500 {
		t.Fatalf("close code = %d, muốn 4500", code)
	}
}

// ---------------------------------------------------------------- G5: close code

func TestThoatBinhThuongDong1000KemControlExit(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("bye"))
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	exit, ok := findControl(controls, "exit")
	if !ok {
		t.Fatalf("thiếu control `exit`: %+v", controls)
	}
	if exit.ExitCode == nil || *exit.ExitCode != 0 {
		t.Fatalf("exitCode = %v, muốn 0", exit.ExitCode)
	}
	if code != websocket.StatusNormalClosure {
		t.Fatalf("close code = %d, muốn 1000", code)
	}
}

// ⛔ CA TRUNG TÂM CỦA G5, và là thứ spike phải chạy mới phát hiện được.
//
// Xoá pod giữa phiên trả `CodeExitError(137)` — TRÙNG KHÍT với `kill -9` hợp lệ
// bên trong pod. Phân biệt bằng exit code là bất khả; phải hỏi Redis. Hai ca
// dưới đây có ĐÚNG cùng một exit code và phải ra HAI close code khác nhau —
// không có cặp này thì một implement bỏ hẳn lượt hỏi Redis vẫn xanh.
func TestExit137_SessionDaMat_Dong4404(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return codeExitError{code: 137}
	}}
	h := newBridge(t, exec, alwaysGone)
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	if code != 4404 {
		t.Fatalf("close code = %d, muốn 4404 — pod bị reap phải khác 'tự gõ exit'", code)
	}
	if e, ok := findControl(controls, "error"); !ok || e.Code != "SESSION_GONE" {
		t.Fatalf("thiếu control error SESSION_GONE: %+v", controls)
	}
}

func TestExit137_SessionConSong_Dong1000(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return codeExitError{code: 137}
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	if code != websocket.StatusNormalClosure {
		t.Fatalf("close code = %d, muốn 1000 — session còn sống nghĩa là người dùng "+
			"tự giết tiến trình của chính mình, đó là thoát thật", code)
	}
	if _, ok := findControl(controls, "exit"); !ok {
		t.Fatalf("thiếu control `exit`: %+v", controls)
	}
}

// ⛔ BỘ BA DƯỚI ĐÂY GÁC CUỘC ĐUA REDIS-ĐI-SAU (P12 §8, sửa 2026-09-06).
//
// Cả ba có ĐÚNG cùng input phía Redis (`alwaysAlive`) và cùng exit code 137 —
// thứ duy nhất khác là apiserver trả lời gì. Không có cả ba thì một implement
// bỏ hẳn lượt hỏi apiserver, hoặc hỏi rồi kết luận sai chiều lúc lỗi, vẫn xanh.
func TestExit137_SessionConSong_PodDaMat_Dong4404(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return codeExitError{code: 137}
	}}
	h := newBridge(t, exec, alwaysAlive, bridgeOpts{
		podGone: func(context.Context, string, string) (bool, error) { return true, nil },
	})
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	if code != 4404 {
		t.Fatalf("close code = %d, muốn 4404 — pod biến mất trong khi Redis chưa kịp "+
			"cập nhật KHÔNG phải 'người dùng tự gõ exit'", code)
	}
	if e, ok := findControl(controls, "error"); !ok || e.Code != "SESSION_GONE" {
		t.Fatalf("thiếu control error SESSION_GONE: %+v", controls)
	}
}

func TestExit137_SessionConSong_PodConDo_Dong1000(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return codeExitError{code: 137}
	}}
	h := newBridge(t, exec, alwaysAlive, bridgeOpts{
		podGone: func(context.Context, string, string) (bool, error) { return false, nil },
	})
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	if code != websocket.StatusNormalClosure {
		t.Fatalf("close code = %d, muốn 1000 — pod CÒN ĐÓ và session còn sống nghĩa là "+
			"tín hiệu đến từ bên trong pod, đó là thoát thật", code)
	}
	if _, ok := findControl(controls, "exit"); !ok {
		t.Fatalf("thiếu control `exit`: %+v", controls)
	}
}

// Apiserver trả lỗi ⇒ GIỮ NGUYÊN kết luận từ Redis (1000), KHÔNG suy diễn.
// `4404` bảo FE "đừng retry"; phát nó vì một lượt apiserver hỏng là khoá người
// dùng khỏi phiên còn hạn. Chiều fail-open này phải được gác tường minh.
func TestExit137_HoiApiserverLoi_GiuNguyen1000(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return codeExitError{code: 137}
	}}
	h := newBridge(t, exec, alwaysAlive, bridgeOpts{
		podGone: func(context.Context, string, string) (bool, error) {
			return false, errors.New("apiserver 503")
		},
	})
	h.sendInit(t, 80, 24)

	if _, _, code := h.readUntilClose(t); code != websocket.StatusNormalClosure {
		t.Fatalf("close code = %d, muốn 1000 — hỏi apiserver lỗi thì không được đổi kết luận", code)
	}
}

// Thoát BÌNH THƯỜNG (exit 0) KHÔNG được chạm apiserver.
//
// Không có ca này thì một implement hỏi pod ở mọi lần đóng vẫn xanh — và nó sẽ
// đóng `4404` cho người vừa tự gõ `exit` đúng lúc pod đang bị thu hồi, tức dựng
// lại chính cái bug này ở chiều ngược lại. Kèm luôn vế "không tốn lượt gọi".
func TestExit0_KhongHoiApiserver(t *testing.T) {
	var hoi atomic.Int32
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive, bridgeOpts{
		podGone: func(context.Context, string, string) (bool, error) {
			hoi.Add(1)
			return true, nil // nếu BỊ hỏi thì trả "mất" để ca sai lộ ra thành 4404
		},
	})
	h.sendInit(t, 80, 24)

	if _, _, code := h.readUntilClose(t); code != websocket.StatusNormalClosure {
		t.Fatalf("close code = %d, muốn 1000", code)
	}
	if n := hoi.Load(); n != 0 {
		t.Fatalf("apiserver bị hỏi %d lần ở đường thoát bình thường, muốn 0", n)
	}
}

// Lỗi hạ tầng (không phải CodeExitError) cũng phải hỏi Redis trước khi chọn mã.
func TestLoiHaTang_SessionDaMat_Dong4404(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return errors.New("mạng đứt giữa chừng")
	}}
	h := newBridge(t, exec, alwaysGone)
	h.sendInit(t, 80, 24)

	if _, _, code := h.readUntilClose(t); code != 4404 {
		t.Fatalf("close code = %d, muốn 4404", code)
	}
}

func TestLoiHaTang_SessionConSong_Dong4500(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return errors.New("apiserver 503")
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	controls, _, code := h.readUntilClose(t)
	if code != 4500 {
		t.Fatalf("close code = %d, muốn 4500", code)
	}
	if e, ok := findControl(controls, "error"); !ok || e.Code != "EXEC_FAILED" {
		t.Fatalf("thiếu control error EXEC_FAILED: %+v", controls)
	}
}

// Redis không trả lời được trên đường đóng → coi như CÒN SỐNG (fail-open có chủ
// ý): `4404` bảo FE "đừng retry", nên đoán sai theo hướng đó là khoá người dùng
// khỏi một phiên vẫn còn hạn. Đoán sai hướng kia chỉ tốn một lượt retry vô hại.
func TestRedisHongTrenDuongDongThiKhongDong4404(t *testing.T) {
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("x"))
		return codeExitError{code: 137}
	}}
	h := newBridge(t, exec, func(context.Context, string) (bool, error) {
		return false, errors.New("redis: connection refused")
	})
	h.sendInit(t, 80, 24)

	if _, _, code := h.readUntilClose(t); code == 4404 {
		t.Fatal("đóng 4404 dựa trên một câu trả lời KHÔNG có — FE sẽ không retry " +
			"một phiên có thể vẫn còn sống")
	}
}

// ---------------------------------------------------------------- stdin/stdout

func TestStdinTuClientToiPodVaStdoutQuayVe(t *testing.T) {
	var mu sync.Mutex
	var got []byte
	exec := &fakeExecutor{fn: func(_ context.Context, o remotecommand.StreamOptions) error {
		buf := make([]byte, 3)
		n, _ := io.ReadFull(o.Stdin, buf)
		mu.Lock()
		got = append(got, buf[:n]...)
		mu.Unlock()
		_, _ = o.Stdout.Write([]byte("ok"))
		return nil
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.client.Write(ctx, websocket.MessageBinary, []byte("ls\n")); err != nil {
		t.Fatalf("gửi stdin: %v", err)
	}

	_, stdout, _ := h.readUntilClose(t)
	mu.Lock()
	defer mu.Unlock()
	if string(got) != "ls\n" {
		t.Fatalf("pod nhận stdin = %q, muốn %q", got, "ls\n")
	}
	if string(stdout) != "ok" {
		t.Fatalf("client nhận stdout = %q, muốn %q", stdout, "ok")
	}
}
