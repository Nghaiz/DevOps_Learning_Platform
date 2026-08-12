package podexec_test

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/coder/websocket"
	"github.com/prometheus/client_golang/prometheus"
	"k8s.io/client-go/tools/remotecommand"
)

// fastTiming là nhịp heartbeat rút gọn cho test: ping 40ms, pong 200ms, extend
// 60ms. Đủ nhanh để một ca chạy dưới một giây, đủ chậm để không đua với chính
// việc dựng kết nối.
func fastTiming(e podexec.Extender) bridgeOpts {
	return bridgeOpts{
		extender:    e,
		pingEvery:   40 * time.Millisecond,
		pongWait:    200 * time.Millisecond,
		extendEvery: 60 * time.Millisecond,
	}
}

// blockUntilCtx là executor giữ phiên mở cho tới khi ctx đóng — cần cho mọi ca
// heartbeat, vì heartbeat chỉ chạy khi phiên còn sống.
//
// ⛔ PHẢI RÚT STDIN LIÊN TỤC. `io.Pipe` là ĐỒNG BỘ: một `Write` chặn cho tới khi
// có ai đó `Read`. Executor giả nào không đọc stdin sẽ làm frame binary ĐẦU TIÊN
// chặn vĩnh viễn goroutine đọc-WS — từ đó không frame nào được xử lý nữa, và
// mọi ca "gõ liên tục" âm thầm biến thành "gõ đúng một lần". Hai ca đã đỏ vì
// đúng chuyện này (bão byte-rate không bao giờ vượt trần vì limiter chỉ thấy 1
// frame). Chính pipe đó là thứ `Serve` phải `defer stdinR.Close()` để khỏi rò
// goroutine — cùng một cạnh sắc, nhìn từ phía test.
func blockUntilCtx() *fakeExecutor {
	return &fakeExecutor{fn: func(ctx context.Context, o remotecommand.StreamOptions) error {
		// Ghi một byte để `ready` được phát (waitAttached cần bằng chứng attach).
		_, _ = o.Stdout.Write([]byte("$ "))
		go func() { _, _ = io.Copy(io.Discard, o.Stdin) }()
		<-ctx.Done()
		return ctx.Err()
	}}
}

// scriptedExtender trả lần lượt từng bước rồi lặp lại bước cuối — cần cho các
// ca mà hành vi ĐỔI giữa chừng (chạm trần rồi mới biến mất).
type scriptedExtender struct {
	mu    sync.Mutex
	steps []podexec.ExtendResult
	n     int
}

func (s *scriptedExtender) Extend(context.Context, string, string) (podexec.ExtendResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	i := s.n
	if i >= len(s.steps) {
		i = len(s.steps) - 1
	}
	s.n++
	return s.steps[i], nil
}

// ---------------------------------------------------------------- harness bổ sung

// readUntilCloseWhileTyping gõ đều đặn cho tới khi server đóng, rồi trả những gì
// đã nhận.
//
// Vế gõ là bắt buộc: heartbeat chỉ gọi ExtendSession khi có traffic THẬT, nên
// một harness chỉ-đọc sẽ không bao giờ tới được nhánh đang cần đo.
func (h *bridgeHarness) readUntilCloseWhileTyping(t *testing.T) ([]podexec.ControlOut, []byte, websocket.StatusCode) {
	t.Helper()
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		tk := time.NewTicker(20 * time.Millisecond)
		defer tk.Stop()
		for {
			select {
			case <-stop:
				return
			case <-tk.C:
				wctx, wcancel := context.WithTimeout(context.Background(), time.Second)
				err := h.client.Write(wctx, websocket.MessageBinary, []byte("x"))
				wcancel()
				if err != nil {
					return
				}
			}
		}
	}()
	controls, stdout, code := h.readUntilClose(t)
	close(stop)
	<-done
	return controls, stdout, code
}

func (h *bridgeHarness) sendStdin(t *testing.T, b []byte) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.client.Write(ctx, websocket.MessageBinary, b); err != nil {
		t.Fatalf("gửi stdin: %v", err)
	}
}

// waitReady đọc tới khi thấy control `ready`. Mọi ca heartbeat phải bắt đầu từ
// đây: heartbeat chỉ khởi động SAU `ready`.
func (h *bridgeHarness) waitReady(t *testing.T) podexec.ControlOut {
	t.Helper()
	return h.waitControl(t, "ready", 10*time.Second)
}

func (h *bridgeHarness) waitControl(t *testing.T, typ string, timeout time.Duration) podexec.ControlOut {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	for {
		mt, data, err := h.client.Read(ctx)
		if err != nil {
			t.Fatalf("chờ control %q: %v", typ, err)
		}
		if mt != websocket.MessageText {
			continue
		}
		var co podexec.ControlOut
		if err := json.Unmarshal(data, &co); err != nil {
			t.Fatalf("control không phải JSON: %v", err)
		}
		if co.Type == typ {
			return co
		}
	}
}

// drainFor đọc và VỨT trong khoảng d, không gửi gì cả.
//
// Phải đọc chứ không phải ngủ: pong được `coder/websocket` trả tự động NGAY
// TRONG vòng đọc, nên một test chỉ `time.Sleep` sẽ không bao giờ trả pong và
// server đóng kết nối vì tưởng client chết — ca test khi đó đo nhầm thứ khác.
func (h *bridgeHarness) drainFor(t *testing.T, d time.Duration) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()
	for {
		if _, _, err := h.client.Read(ctx); err != nil {
			return
		}
	}
}

// pumpAndCollect vừa gõ phím đều đặn vừa gom control message trong khoảng d.
//
// Có vế GÕ PHÍM mới đo được gì: heartbeat chỉ gọi ExtendSession khi có traffic,
// nên một harness chỉ-đọc sẽ sinh ĐÚNG MỘT lượt gia hạn (từ byte stdout đầu
// tiên) và mọi ca "chỉ cảnh báo một lần" trở thành tautology — nó xanh vì chỉ
// có một lượt, không phải vì logic chống lặp chạy đúng.
//
// Trả thêm `closedEarly`: SERVER đã đóng kết nối trước khi hết cửa sổ hay chưa.
// Cần phân biệt vì chính `pumpAndCollect` cũng làm kết nối đóng khi hết cửa sổ —
// `coder/websocket` đóng phăng conn lúc context của một thao tác hết hạn. Không
// có cờ này thì "server giết phiên" và "test hết giờ" trông y hệt nhau, và mọi
// khẳng định kiểu "phiên phải còn sống" trở thành vô nghĩa.
func (h *bridgeHarness) pumpAndCollect(t *testing.T, d time.Duration) (controls []podexec.ControlOut, closedEarly bool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), d)
	defer cancel()

	done := make(chan struct{})
	go func() {
		defer close(done)
		tick := time.NewTicker(20 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				wctx, wcancel := context.WithTimeout(context.Background(), time.Second)
				err := h.client.Write(wctx, websocket.MessageBinary, []byte("x"))
				wcancel()
				if err != nil {
					return
				}
			}
		}
	}()

	for {
		mt, data, err := h.client.Read(ctx)
		if err != nil {
			<-done
			// ctx CHƯA hết hạn mà Read đã lỗi ⇒ đầu kia chủ động đóng.
			return controls, ctx.Err() == nil
		}
		if mt != websocket.MessageText {
			continue
		}
		var co podexec.ControlOut
		if err := json.Unmarshal(data, &co); err == nil {
			controls = append(controls, co)
		}
	}
}

// ---------------------------------------------------------------- G7: gia hạn

// ⛔ TestImLangThiKHONGGiaHan — vế "ping/pong không tính là traffic" (contract §8).
//
// Đây là ca giữ cho một tab bỏ quên KHÔNG tự nuôi chính nó tới trần cứng. Nếu
// heartbeat gọi ExtendSession theo đồng hồ thay vì theo traffic, hoặc nếu
// ping/pong được tính là hoạt động, thì pod giữ một trong bốn khe quota (D16)
// cho một cửa sổ không ai nhìn — và không có gì trong hệ thống báo điều đó.
//
// Ca chạy qua NHIỀU nhịp ping (40ms) lẫn nhịp extend (60ms) trong 400ms, nên
// một implement tính nhầm ping thành traffic sẽ thấy `calls > 0`.
func TestImLangThiKHONGGiaHan(t *testing.T) {
	ext := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendOK}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	// ⛔ ĐO TỪ MỘT MỐC, KHÔNG PHẢI TỪ 0. Byte stdout đầu tiên (`"$ "`, thứ làm
	// `ready` phát được) LÀ traffic thật, nên nhịp extend đầu tiên sau `ready`
	// đúng ra phải chạy. Khẳng định `calls == 0` sẽ đỏ vì một hành vi ĐÚNG.
	// Tính chất thật cần khoá là: sau khi hoạt động đó được tiêu thụ, im lặng
	// KHÔNG sinh thêm lượt gia hạn nào nữa.
	h.drainFor(t, 150*time.Millisecond)
	base := ext.callCount()

	// ~6 nhịp extend và ~10 nhịp ping trôi qua trong im lặng hoàn toàn.
	h.drainFor(t, 400*time.Millisecond)

	if n := ext.callCount(); n != base {
		t.Fatalf("gia hạn tăng %d → %d trong 400ms client im lặng hoàn toàn — "+
			"ping/pong đang bị tính là traffic, và một tab bỏ quên sẽ giữ pod tới trần cứng",
			base, n)
	}
}

// TestGoPhimThiCoGiaHan — vế đối chứng của ca trên.
//
// Không có nó thì "0 lần gọi" ở ca trên cũng xanh với một implement KHÔNG BAO
// GIỜ gia hạn — tức bộ test sẽ chấp nhận việc bỏ hẳn G7.
func TestGoPhimThiCoGiaHan(t *testing.T) {
	ext := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendOK}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	// pumpAndCollect vừa gõ vừa ĐỌC. Vế đọc là bắt buộc, không phải tiện tay:
	// `coder/websocket` trả pong NGAY TRONG vòng đọc, nên một vòng lặp chỉ-ghi
	// sẽ không bao giờ trả pong và server đóng kết nối vì tưởng client đã chết —
	// ca test khi đó đỏ vì một hành vi ĐÚNG.
	_, _ = h.pumpAndCollect(t, 500*time.Millisecond)

	if ext.callCount() == 0 {
		t.Fatal("gõ phím liên tục 500ms mà không có lượt ExtendSession nào — G7 không chạy")
	}
}

// TestStdoutCungLaTraffic — lệnh chạy lâu đang in log giữ phiên sống dù không ai
// chạm bàn phím. Đó đúng là "phiên còn người dùng".
func TestStdoutCungLaTraffic(t *testing.T) {
	exec := &fakeExecutor{fn: func(ctx context.Context, o remotecommand.StreamOptions) error {
		for {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(20 * time.Millisecond):
				if _, err := o.Stdout.Write([]byte("log line\n")); err != nil {
					return err
				}
			}
		}
	}}
	ext := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendOK}}
	h := newBridge(t, exec, alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	h.drainFor(t, 500*time.Millisecond)

	// ≥ 2 chứ không phải ≥ 1: lượt đầu có thể đến từ byte stdout mở màn của bất
	// kỳ executor nào. Chỉ lượt thứ hai mới chứng minh stdout ĐANG CHẢY được
	// tính là hoạt động.
	if n := ext.callCount(); n < 2 {
		t.Fatalf("pod bơm stdout liên tục 500ms mà chỉ có %d lượt gia hạn — "+
			"sinh viên chạy `tail -f` sẽ bị reap giữa chừng", n)
	}
}

// TestExpiringPhatKhiHanDich.
//
// Đây là lỗ hổng mà chính chặng này lôi ra: FE lấy `expiresAt` MỘT LẦN từ
// `ready`, nhưng `max(current, min(now+extend, cap))` giữ hạn đứng yên ~55 phút
// rồi mới đẩy 5 phút mỗi lượt. Không phát `expiring` thì đồng hồ đếm ngược của
// FE chạy về 0 trong khi terminal vẫn sống — với SESSION_TTL=1h thì mọi phiên
// dài hơn 55 phút đều dính, không phải ca hiếm.
func TestExpiringPhatKhiHanDich(t *testing.T) {
	newExpiry := time.Date(2026, 8, 9, 13, 0, 0, 0, time.UTC).Unix() // muộn hơn `ready`
	ext := &stubExtender{res: podexec.ExtendResult{
		Outcome:   podexec.ExtendOK,
		ExpiresAt: newExpiry,
	}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	co := h.waitControl(t, "expiring", 3*time.Second)
	if co.ExpiresAt != "2026-08-09T13:00:00Z" {
		t.Errorf("expiring.expiresAt = %q, muốn 2026-08-09T13:00:00Z", co.ExpiresAt)
	}
	if co.HardCapReached {
		t.Error("hardCapReached = true khi hạn mới chỉ dịch — FE sẽ cảnh báo nhầm")
	}
}

// TestHanKhongDoiThiKhongPhatExpiring.
//
// Trong ~55 phút đầu, `max()` giữ hạn Y NGUYÊN qua mỗi lượt gia hạn. Phát
// `expiring` cho những lượt đó là gửi FE một message mỗi 60 giây suốt cả phiên,
// và một cảnh báo lặp là một cảnh báo bị bỏ qua.
func TestHanKhongDoiThiKhongPhatExpiring(t *testing.T) {
	sameExpiry := time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC).Unix() // đúng bằng `ready`
	ext := &stubExtender{res: podexec.ExtendResult{
		Outcome:   podexec.ExtendOK,
		ExpiresAt: sameExpiry,
	}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	got, _ := h.pumpAndCollect(t, 500*time.Millisecond)
	if ext.callCount() == 0 {
		t.Fatal("không có lượt gia hạn nào — ca này không đo được gì")
	}
	if co, ok := findControl(got, "expiring"); ok {
		t.Fatalf("phát `expiring` dù hạn không đổi: %+v", co)
	}
}

// TestChamTranCungChiCanhBaoMotLan.
func TestChamTranCungChiCanhBaoMotLan(t *testing.T) {
	capped := time.Date(2026, 8, 9, 12, 30, 0, 0, time.UTC).Unix()
	ext := &stubExtender{res: podexec.ExtendResult{
		Outcome:        podexec.ExtendOK,
		ExpiresAt:      capped,
		HardCapReached: true,
	}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	got, _ := h.pumpAndCollect(t, 600*time.Millisecond)

	// Không có khẳng định này thì ca test là tautology: "đúng 1 expiring" cũng
	// xanh khi chỉ có ĐÚNG MỘT lượt gia hạn chạy, tức nó đo số nhịp chứ không đo
	// logic chống lặp.
	if calls := ext.callCount(); calls < 2 {
		t.Fatalf("chỉ %d lượt gia hạn trong 600ms — chưa đủ nhịp để đo việc chống lặp", calls)
	}

	var n int
	for _, c := range got {
		if c.Type == "expiring" {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("nhận %d control `expiring` trong 600ms (≈10 nhịp extend), muốn đúng 1 — "+
			"cảnh báo lặp mỗi nhịp là cảnh báo bị bỏ qua", n)
	}
}

// TestSessionGoneGiuaPhienThiDong4404.
func TestSessionGoneGiuaPhienThiDong4404(t *testing.T) {
	ext := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendGone}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)
	h.sendStdin(t, []byte("x"))

	controls, _, code := h.readUntilClose(t)
	if code != 4404 {
		t.Fatalf("close code = %d, muốn 4404", code)
	}
	if co, ok := findControl(controls, "error"); !ok || co.Code != "SESSION_GONE" {
		t.Errorf("control error = %+v, muốn code=SESSION_GONE", co)
	}
}

// ⛔ TestQuaTranCungThiDong4409ChuKhongPhai4404.
//
// Hai mã, hai câu nói với sinh viên: `4404` là "phiên của bạn bị thu hồi",
// `4409` là "bạn đã dùng hết thời lượng tối đa". Gộp chúng lại thì người dùng
// hết giờ sẽ đi báo lỗi hệ thống.
func TestQuaTranCungThiDong4409ChuKhongPhai4404(t *testing.T) {
	ext := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendHardCap}}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)
	h.sendStdin(t, []byte("x"))

	controls, _, code := h.readUntilClose(t)
	if code != 4409 {
		t.Fatalf("close code = %d, muốn 4409 (HARD_CAP_REACHED)", code)
	}
	if co, ok := findControl(controls, "error"); !ok || co.Code != "HARD_CAP_REACHED" {
		t.Errorf("control error = %+v, muốn code=HARD_CAP_REACHED", co)
	}
}

// ⛔ TestChamTranRoiSessionBienMatThiDong4409ChuKhongPhai4404.
//
// Ca này tới từ một lượt chạy THẬT trên cluster, không từ suy luận — prover
// `cmd/verify-heartbeat` đỏ đúng ở đây.
//
// Nhánh `extend: hardcap:` của `extend.lua` gần như KHÔNG BAO GIỜ chạy: script
// đặt TTL của `session:{id}` đúng bằng `expiresAt`, nên tới lúc `newExpiresAt <=
// now` thì hash đã biến mất và lượt gia hạn kế tiếp nhận "không tồn tại". Đo
// được: phiên chạm trần cứng đóng bằng `4404` + `SESSION_GONE`, tức nói với
// người vừa dùng hết 2 giờ rằng "phiên của bạn bị thu hồi".
//
// Gateway thì BIẾT rõ hơn thế: nó vừa phát `expiring{hardCapReached:true}`.
// Ca này khoá đúng tính chất đó — cùng một `ExtendGone`, hai close code khác
// nhau tuỳ vào việc trước đó đã báo chạm trần hay chưa.
func TestChamTranRoiSessionBienMatThiDong4409ChuKhongPhai4404(t *testing.T) {
	capped := time.Date(2026, 8, 9, 12, 30, 0, 0, time.UTC).Unix()
	ext := &scriptedExtender{steps: []podexec.ExtendResult{
		// Lượt 1: còn gia hạn được, nhưng đã bị trần cắt → `expiring(true)`.
		{Outcome: podexec.ExtendOK, ExpiresAt: capped, HardCapReached: true},
		// Lượt 2+: hash đã hết TTL ⇒ orchestrator/store nói "không tồn tại".
		{Outcome: podexec.ExtendGone},
	}}
	h := newBridge(t, blockUntilCtx(), alwaysGone, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	controls, _, code := h.readUntilCloseWhileTyping(t)
	if code != 4409 {
		t.Fatalf("close code = %d, muốn 4409 — sau khi đã báo hardCapReached, "+
			"session biến mất nghĩa là HẾT GIỜ chứ không phải bị thu hồi", code)
	}
	if co, ok := findControl(controls, "error"); !ok || co.Code != "HARD_CAP_REACHED" {
		t.Errorf("control error = %+v, muốn code=HARD_CAP_REACHED", co)
	}
}

// TestChuaChamTranMaBienMatThiVan4404 — vế đối chứng.
//
// Không có nó thì ca trên cũng xanh với một implement đóng 4409 cho MỌI session
// biến mất, tức xoá mất khả năng nói "phiên của bạn bị thu hồi".
func TestChuaChamTranMaBienMatThiVan4404(t *testing.T) {
	ext := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendGone}}
	h := newBridge(t, blockUntilCtx(), alwaysGone, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	controls, _, code := h.readUntilCloseWhileTyping(t)
	if code != 4404 {
		t.Fatalf("close code = %d, muốn 4404 — chưa từng báo chạm trần thì đây là thu hồi", code)
	}
	if co, ok := findControl(controls, "error"); !ok || co.Code != "SESSION_GONE" {
		t.Errorf("control error = %+v, muốn code=SESSION_GONE", co)
	}
}

// TestLoiGiaHanKhongGietPhien.
//
// Orchestrator rollout / Redis chớp tắt là chuyện tự khỏi, và không nói gì về
// việc session còn hợp lệ hay không. Đóng terminal vì gateway không hỏi được
// người khác là biến một sự cố hạ tầng 10 giây thành mất bài của sinh viên.
func TestLoiGiaHanKhongGietPhien(t *testing.T) {
	ext := &stubExtender{err: context.DeadlineExceeded}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, fastTiming(ext))
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	got, closedEarly := h.pumpAndCollect(t, 600*time.Millisecond)

	if ext.callCount() == 0 {
		t.Fatal("không lượt gia hạn nào chạy — ca này không đo được gì")
	}
	if closedEarly {
		t.Fatal("server đóng kết nối sau khi gia hạn lỗi — " +
			"orchestrator rollout 10 giây không được biến thành mất bài của sinh viên")
	}
	if co, ok := findControl(got, "error"); ok {
		t.Fatalf("gateway phát control error %+v cho một lỗi gia hạn tạm thời", co)
	}
}

// ---------------------------------------------------------------- G8: rate limit

// TestVuotTranTocDoStdinThiDong4429.
//
// Trần byte-rate là tầng KHÁC với read-limit: read-limit chặn một frame to,
// token-bucket chặn nhiều frame nhỏ đi liên tục. 40 frame × 32 KiB = 1.25 MiB
// vượt hẳn burst 512 KiB, trong khi từng frame đều hợp lệ với read-limit.
func TestVuotTranTocDoStdinThiDong4429(t *testing.T) {
	h := newBridge(t, blockUntilCtx(), alwaysAlive)
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	frame := make([]byte, podexec.MaxFrameBytes)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for i := 0; i < 40; i++ {
		if err := h.client.Write(ctx, websocket.MessageBinary, frame); err != nil {
			break // server đã đóng — đúng thứ ta chờ
		}
	}

	controls, _, code := h.readUntilClose(t)
	if code != 4429 {
		t.Fatalf("close code = %d, muốn 4429 sau 1.25 MiB trong một nhịp", code)
	}
	if co, ok := findControl(controls, "error"); !ok || co.Code != "RATE_LIMITED" {
		t.Errorf("control error = %+v, muốn code=RATE_LIMITED", co)
	}
}

// TestDanMotFrameToVanQuaDuoc — vế đối chứng: trần phải chặn LẠM DỤNG, không
// chặn TÍNH NĂNG. Burst 512 KiB > MaxFrameBytes 32 KiB chính là để một lần dán
// manifest YAML không bao giờ chết vì thiếu token.
func TestDanMotFrameToVanQuaDuoc(t *testing.T) {
	got := make(chan []byte, 1)
	exec := &fakeExecutor{fn: func(ctx context.Context, o remotecommand.StreamOptions) error {
		_, _ = o.Stdout.Write([]byte("$ "))
		buf := make([]byte, podexec.MaxFrameBytes)
		n, _ := io.ReadFull(o.Stdin, buf)
		got <- buf[:n]
		<-ctx.Done()
		return ctx.Err()
	}}
	h := newBridge(t, exec, alwaysAlive)
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	h.sendStdin(t, make([]byte, podexec.MaxFrameBytes))
	select {
	case b := <-got:
		if len(b) != podexec.MaxFrameBytes {
			t.Fatalf("pod nhận %d byte, muốn %d", len(b), podexec.MaxFrameBytes)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("frame 32 KiB hợp lệ không tới được pod — trần đang chặn tính năng, không phải lạm dụng")
	}
}

// TestBaoControlThiDong4400.
func TestBaoControlThiDong4400(t *testing.T) {
	h := newBridge(t, blockUntilCtx(), alwaysAlive)
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	// 300 resize liên tiếp: vượt hẳn burst 100 + 100/s trong khoảng thời gian
	// một vòng lặp chặt.
	raw, _ := json.Marshal(map[string]any{"type": "resize", "cols": 100, "rows": 30})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for i := 0; i < 300; i++ {
		if err := h.client.Write(ctx, websocket.MessageText, raw); err != nil {
			break
		}
	}

	_, _, code := h.readUntilClose(t)
	if code != 4400 {
		t.Fatalf("close code = %d, muốn 4400 sau 300 control liên tiếp", code)
	}
}

// TestKeoCuaSoBinhThuongKhongBiChan — vế đối chứng của ca bão.
//
// Kéo một cửa sổ sinh ~200 sự kiện, nhưng FE debounce ~50ms (contract §4) nên
// tới server chỉ còn vài chục. Burst 100 phải nuốt được nguyên một cơn kéo;
// nếu không, trần này biến thao tác thường ngày nhất thành mất phiên.
func TestKeoCuaSoBinhThuongKhongBiChan(t *testing.T) {
	h := newBridge(t, blockUntilCtx(), alwaysAlive)
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	for i := 0; i < 50; i++ {
		h.sendControl(t, map[string]any{"type": "resize", "cols": 100 + i, "rows": 30})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := h.client.Write(ctx, websocket.MessageBinary, []byte("x")); err != nil {
		t.Fatalf("kết nối chết sau 50 lần resize: %v — một cơn kéo cửa sổ không đáng mất phiên", err)
	}
}

// TestFrameVuotReadLimitDongBang1009.
//
// ⛔ ĐÂY LÀ HẰNG SỐ DUY NHẤT CỦA LUẬT 5 ĐẾN TỪ THỰC NGHIỆM MÀ TRƯỚC BẢN NÀY
// KHÔNG CÓ GÌ GÁC. Plan bản 2026-08-07 đoán `4413` — một mã ỨNG DỤNG. Spike
// 1.A-1 đo được sự thật khác: `coder/websocket` TỰ đóng bằng `1009`
// (StatusMessageTooBig) ngay trong tầng thư viện, nên code ứng dụng không bao
// giờ thấy frame vi phạm và không có chỗ nào để phát một mã của riêng ta.
// Contract §6 pin `1009` theo phép đo đó.
//
// Vì sao nó cần một ca riêng dù đã có `TestVuotTranTocDoStdinThiDong4429`: hai
// ca đo HAI TẦNG khác nhau (một frame to ↔ nhiều frame nhỏ đi liên tục), và
// tầng read-limit là tầng KHÔNG có dòng code nào của ta bên trong. Ngày ai đó
// nâng `SetReadLimit` lên 1 MiB "cho fastfetch đỡ bị cắt" — đúng thứ
// `cmd/spike-exec/bridge.go` đang làm ở dòng 156 — thì contract §6 sai mà không
// test nào đỏ, và FE sẽ switch trên một mã không bao giờ tới.
//
// Ca này CỐ Ý không đòi control `error` đi kèm: thư viện đóng TRƯỚC khi code
// ứng dụng thấy gì, nên đòi một control ở đây là đòi một thứ không thể tồn tại.
// Vế đối chứng — frame ĐÚNG bằng `MaxFrameBytes` vẫn qua — đã có ở
// `TestDanMotFrameToVanQuaDuoc`, nên không nhân bản lại ở đây.
func TestFrameVuotReadLimitDongBang1009(t *testing.T) {
	h := newBridge(t, blockUntilCtx(), alwaysAlive)
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// ĐÚNG MỘT BYTE quá trần — ranh giới, không phải một frame khổng lồ. Một
	// frame to gấp nhiều lần cũng đỏ khi guard mất, nhưng nó không nói được trần
	// nằm ở ĐÂU, mà chính vị trí đó là thứ contract §6 pin cho FE.
	over := make([]byte, podexec.MaxFrameBytes+1)
	_ = h.client.Write(ctx, websocket.MessageBinary, over)

	_, _, code := h.readUntilClose(t)
	if code != websocket.StatusMessageTooBig {
		t.Fatalf("close code = %d, muốn %d (1009) — contract §6 pin mã này theo phép đo của spike 1.A-1, không phải theo phỏng đoán",
			code, websocket.StatusMessageTooBig)
	}
}

// ---------------------------------------------------------------- G9: stateless

// ⛔ TestHaiPhienSongSongKhongDungChungTrangThai.
//
// G9 nói gateway không giữ map session→pod trong RAM. Cách nó hỏng KHÔNG phải
// là ai đó cố tình thêm một map — mà là một trường tiện tay đặt lên `Bridge`
// (singleton dùng chung) thay vì lên `connState` (mỗi kết nối một bản). Ca này
// chạy HAI phiên đồng thời trên CÙNG một Bridge và ép chúng đi hai đường đóng
// khác nhau: nếu `intent` sống trên Bridge, phiên B sẽ nhận close code của A.
//
// Chạy dưới `-race` thì nó còn bắt luôn việc chia sẻ không đồng bộ.
func TestHaiPhienSongSongKhongDungChungTrangThai(t *testing.T) {
	reg := prometheus.NewRegistry()
	met := metrics.New(reg)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	// Phiên "gone" đóng 4404; phiên "ok" để shell thoát sạch → 1000.
	goneExt := &stubExtender{res: podexec.ExtendResult{Outcome: podexec.ExtendGone}}

	b := podexec.New(
		func(podexec.Target) (remotecommand.Executor, error) { return blockUntilCtx(), nil },
		alwaysAlive,
		goneExt,
		log,
		met,
	)
	b.SetHeartbeatTiming(40*time.Millisecond, 200*time.Millisecond, 60*time.Millisecond)

	// Server phục vụ nhiều phiên, mỗi phiên một Target khác nhau.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			Subprotocols:       []string{"dlp.terminal.v1"},
			InsecureSkipVerify: true,
		})
		if err != nil {
			return
		}
		defer func() { _ = c.CloseNow() }()
		id := r.URL.Query().Get("sid")
		b.Serve(r.Context(), c, podexec.Target{
			SessionID: id,
			PodName:   "sandbox-" + id,
			Namespace: "dlp-sandbox",
			ExpiresAt: time.Date(2026, 8, 9, 12, 0, 0, 0, time.UTC).Unix(),
			UserID:    "user-" + id,
		})
	}))
	t.Cleanup(srv.Close)

	dial := func(sid string) *websocket.Conn {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		t.Cleanup(cancel)
		c, resp, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(srv.URL, "http")+"?sid="+sid,
			&websocket.DialOptions{HTTPClient: srv.Client(), Subprotocols: []string{"dlp.terminal.v1"}})
		if resp != nil && resp.Body != nil {
			_ = resp.Body.Close()
		}
		if err != nil {
			t.Fatalf("dial %s: %v", sid, err)
		}
		t.Cleanup(func() { _ = c.CloseNow() })
		return c
	}

	a, bconn := dial("aaa"), dial("bbb")

	var wg sync.WaitGroup
	codes := make([]websocket.StatusCode, 2)
	pods := make([]string, 2)
	for i, c := range []*websocket.Conn{a, bconn} {
		wg.Add(1)
		go func(i int, c *websocket.Conn) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			raw, _ := json.Marshal(map[string]any{"type": "init", "cols": 80, "rows": 24})
			_ = c.Write(ctx, websocket.MessageText, raw)
			_ = c.Write(ctx, websocket.MessageBinary, []byte("x"))
			for {
				typ, data, err := c.Read(ctx)
				if err != nil {
					codes[i] = websocket.CloseStatus(err)
					return
				}
				if typ == websocket.MessageText {
					var co podexec.ControlOut
					if json.Unmarshal(data, &co) == nil && co.Type == "ready" {
						pods[i] = co.PodName
					}
				}
			}
		}(i, c)
	}
	wg.Wait()

	// Mỗi phiên phải thấy ĐÚNG pod của mình — bằng chứng đích exec đi theo
	// Target chứ không theo một biến dùng chung.
	if pods[0] != "sandbox-aaa" || pods[1] != "sandbox-bbb" {
		t.Fatalf("podName của hai phiên = %q / %q, muốn sandbox-aaa / sandbox-bbb", pods[0], pods[1])
	}
	for i, c := range codes {
		if c != 4404 {
			t.Errorf("phiên %d đóng bằng %d, muốn 4404", i, c)
		}
	}
}
