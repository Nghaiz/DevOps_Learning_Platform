package podexec_test

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
)

// Dòng "Phiên" của màn chào (A6) — phía GATEWAY.
//
// Nửa trong pod (`images/sandbox-base/bin/dlp-session-deadline`) đã chạy thật
// 7/7 ca ở lane trước. Thứ CHƯA ai chứng minh là gateway có GỌI nó không, gọi
// đúng epoch không, và gọi lại sau khi gia hạn không — trước file này thì
// không, và dòng "Phiên" trống trên cụm chính vì thế.
//
// Điều các ca dưới đây gác, xếp theo mức độ đắt khi hỏng:
//
//  1. Pod thiếu script (ảnh cũ trong warm pool — chuyện BÌNH THƯỜNG lúc rollout)
//     KHÔNG được giết phiên terminal, và cũng không được hỏng im lặng.
//  2. Lượt gia hạn phải ghi lại mốc mới, nếu không người học bấm "Thêm giờ" rồi
//     vẫn đọc mốc cũ.
//  3. Hạn không dịch thì KHÔNG ghi lại — đó là cổng giá, không phải cổng đúng-sai.
//  4. Mốc rác không được biến thành một lượt `pods/exec`.

// ---------------------------------------------------------------- test double

// fakeDeadlineRunner ghi lại mọi lượt gọi và trả kết quả đã cài sẵn.
//
// Có kênh `seen` vì lượt ghi chạy NỀN: một ca test khẳng định "đã gọi" bằng
// cách đọc field ngay sau `waitReady` sẽ xanh/đỏ tuỳ lịch goroutine — tức một
// ca flaky đo đúng thứ nó không định đo.
type fakeDeadlineRunner struct {
	mu    sync.Mutex
	calls []deadlineCall
	seen  chan struct{}

	res podexec.OneShotResult
	err error
}

type deadlineCall struct {
	target podexec.Target
	script string
}

func newFakeDeadlineRunner() *fakeDeadlineRunner {
	return &fakeDeadlineRunner{seen: make(chan struct{}, 16)}
}

func (f *fakeDeadlineRunner) Run(_ context.Context, t podexec.Target, script string) (podexec.OneShotResult, error) {
	f.mu.Lock()
	f.calls = append(f.calls, deadlineCall{target: t, script: script})
	f.mu.Unlock()

	// Không chặn khi không ai đọc: một ca chỉ quan tâm lượt đầu vẫn phải chạy
	// được trong lúc heartbeat bắn thêm lượt nữa.
	select {
	case f.seen <- struct{}{}:
	default:
	}
	return f.res, f.err
}

// waitCalls chờ tới khi có đủ `n` lượt gọi, hoặc hết hạn.
func (f *fakeDeadlineRunner) waitCalls(t *testing.T, n int, d time.Duration) []deadlineCall {
	t.Helper()
	hetHan := time.After(d)
	for {
		if got := f.snapshot(); len(got) >= n {
			return got
		}
		select {
		case <-f.seen:
		case <-hetHan:
			t.Fatalf("chờ %s mà chỉ có %d/%d lượt ghi mốc — dòng Phiên sẽ trống trên cụm",
				d, len(f.snapshot()), n)
		}
	}
}

func (f *fakeDeadlineRunner) snapshot() []deadlineCall {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]deadlineCall(nil), f.calls...)
}

// safeBuf là bộ đệm log ghi được từ goroutine nền và đọc được từ ca test.
// `bytes.Buffer` trần ở đây là data race THẬT, và `-race` sẽ bắt.
type safeBuf struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *safeBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *safeBuf) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

// waitLog chờ tới khi log chứa `phan`, hoặc hết hạn. Log tới từ goroutine nền,
// nên đọc một lần ngay sau `waitReady` là một cuộc đua.
func waitLog(t *testing.T, b *safeBuf, phan string, d time.Duration) {
	t.Helper()
	hetHan := time.After(d)
	for {
		if strings.Contains(b.String(), phan) {
			return
		}
		select {
		case <-hetHan:
			t.Fatalf("chờ %s mà log không có %q — hỏng ĐANG bị nuốt im lặng. Log: %s",
				d, phan, b.String())
		case <-time.After(5 * time.Millisecond):
		}
	}
}

// ---------------------------------------------------------------- ca test

// TestDungPhienThiGhiMocHetHanVaoPod — ca gốc. Không có nó thì `dlp-motd` đọc
// một file KHÔNG AI GHI, và dòng "Phiên" không bao giờ hiện ra.
func TestDungPhienThiGhiMocHetHanVaoPod(t *testing.T) {
	run := newFakeDeadlineRunner()
	h := newBridge(t, blockUntilCtx(), alwaysAlive, bridgeOpts{deadline: run})
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	calls := run.waitCalls(t, 1, 3*time.Second)

	// Epoch, không phải RFC3339: script chuẩn hoá về epoch, và gửi thẳng epoch
	// bỏ hẳn một vòng phân giải chuỗi có múi giờ để đọc nhầm.
	want := "dlp-session-deadline 1786276800" // = 2026-08-09T12:00:00Z
	if calls[0].script != want {
		t.Errorf("script = %q, muốn %q", calls[0].script, want)
	}

	// Target tới từ Redis qua `Serve`, không từ input client — cùng ràng buộc G4
	// với đường attach. Ghi nhầm pod là ghi mốc của người này vào pod người kia.
	if calls[0].target.PodName != "sandbox-deadbeef" || calls[0].target.Namespace != "dlp-sandbox" {
		t.Errorf("target = %s/%s, muốn dlp-sandbox/sandbox-deadbeef",
			calls[0].target.Namespace, calls[0].target.PodName)
	}
}

// TestPodThieuScriptThiKhongGietPhien.
//
// Ảnh cũ còn trong warm pool là chuyện BÌNH THƯỜNG suốt một lượt rollout, và
// `bash` trả 127 cho lệnh không có. Một dòng trang trí không được phép biến
// khoảng đó thành "không ai vào được terminal".
func TestPodThieuScriptThiKhongGietPhien(t *testing.T) {
	run := newFakeDeadlineRunner()
	run.res = podexec.OneShotResult{
		ExitCode: 127,
		Output:   "bash: line 1: dlp-session-deadline: command not found\n",
	}
	logs := &safeBuf{}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, bridgeOpts{deadline: run, logs: logs})
	h.sendInit(t, 80, 24)

	// `ready` tới = attach KHÔNG bị chặn bởi lượt ghi hỏng.
	ready := h.waitReady(t)
	if ready.Type != "ready" {
		t.Fatalf("control đầu = %q, muốn ready", ready.Type)
	}

	run.waitCalls(t, 1, 3*time.Second)

	// ...nhưng KHÔNG được im lặng. `exit_code` phải có trong log: nó là thứ duy
	// nhất phân biệt "ảnh cũ" (127, tự khỏi khi warm pool xoay hết) với "script
	// từ chối" (phải đọc output).
	waitLog(t, logs, "thoát khác 0", 3*time.Second)
	waitLog(t, logs, "exit_code=127", time.Second)

	// Và phiên vẫn gõ được sau đó.
	h.sendStdin(t, []byte("echo hi\n"))
	h.drainFor(t, 100*time.Millisecond)
}

// TestGhiMocHongThiKhongGietPhien — cùng luật, nhánh hỏng HẠ TẦNG (apiserver
// chết, không dựng được executor). Tách khỏi ca 127 vì hai chẩn đoán khác hẳn.
func TestGhiMocHongThiKhongGietPhien(t *testing.T) {
	run := newFakeDeadlineRunner()
	run.err = errors.New("dựng executor: apiserver không trả lời")
	logs := &safeBuf{}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, bridgeOpts{deadline: run, logs: logs})
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	run.waitCalls(t, 1, 3*time.Second)
	waitLog(t, logs, "không ghi được mốc hết hạn vào pod", 3*time.Second)
}

// TestGiaHanThanhCongThiGhiLaiMocMoi.
//
// Vế thứ hai của A6, và là vế dễ quên nhất: thiếu nó thì người học bấm "Thêm
// giờ" xong banner vẫn báo mốc cũ. Sai về hướng an toàn (báo THIẾU giờ — luật
// không-lùi trong script đảm bảo thế), nhưng vẫn là sai.
func TestGiaHanThanhCongThiGhiLaiMocMoi(t *testing.T) {
	newExpiry := time.Date(2026, 8, 9, 13, 0, 0, 0, time.UTC).Unix()
	ext := &stubExtender{res: podexec.ExtendResult{
		Outcome:   podexec.ExtendOK,
		ExpiresAt: newExpiry,
	}}
	run := newFakeDeadlineRunner()
	opts := fastTiming(ext)
	opts.deadline = run

	h := newBridge(t, blockUntilCtx(), alwaysAlive, opts)
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	// Gia hạn chỉ chạy khi có traffic THẬT — cùng lý do với mọi ca heartbeat.
	// `pumpAndCollect` vừa gõ vừa ĐỌC; chỉ-ghi thì server không nhận được pong
	// và đóng kết nối vì tưởng client đã chết.
	go func() { _, _ = h.pumpAndCollect(t, 2*time.Second) }()

	calls := run.waitCalls(t, 2, 3*time.Second)
	want := "dlp-session-deadline 1786280400" // = 2026-08-09T13:00:00Z
	if calls[1].script != want {
		t.Errorf("lượt ghi sau gia hạn = %q, muốn %q", calls[1].script, want)
	}
}

// TestHanKhongDichThiKhongGhiLai.
//
// Cổng GIÁ, không phải cổng đúng-sai: script tự chặn ghi lùi nên ghi lại cùng
// một giá trị là vô hại. Nhưng `max(current, …)` của extend.lua giữ hạn ĐỨNG YÊN
// gần hết SESSION_TTL, nên bỏ cổng này là hàng chục `pods/exec` mỗi phút để ghi
// lại thứ không đổi — lên một apiserver đã restart 41 lần.
func TestHanKhongDichThiKhongGhiLai(t *testing.T) {
	ext := &stubExtender{res: podexec.ExtendResult{
		Outcome:   podexec.ExtendOK,
		ExpiresAt: defaultExpiresAt, // ĐÚNG BẰNG mốc của `ready`
	}}
	run := newFakeDeadlineRunner()
	opts := fastTiming(ext)
	opts.deadline = run

	h := newBridge(t, blockUntilCtx(), alwaysAlive, opts)
	h.sendInit(t, 80, 24)
	h.waitReady(t)
	run.waitCalls(t, 1, 3*time.Second)

	// extendEvery=60ms ⇒ ~10 tick trôi qua trong 700ms.
	_, _ = h.pumpAndCollect(t, 700*time.Millisecond)

	if n := len(run.snapshot()); n != 1 {
		t.Errorf("có %d lượt ghi mốc sau ~10 tick gia hạn KHÔNG dịch hạn, muốn 1 — "+
			"cổng giá không giữ, apiserver ăn một lượt pods/exec mỗi tick", n)
	}
	// Đối chứng dương của chính ca này: không có lượt gia hạn nào thì phép đếm
	// ở trên xanh vì lý do sai hoàn toàn.
	if ext.callCount() < 2 {
		t.Fatalf("chỉ %d lượt gia hạn — ca test chưa tới được nhánh đang đo", ext.callCount())
	}
}

// TestMocKhongHopLeThiKhongGoiPod — hash thiếu `expiresAt`. Script cũng sẽ từ
// chối, nhưng đốt một lượt `pods/exec` cho một giá trị đã biết là sai thì vô
// nghĩa; và dòng log phải nói về DỮ LIỆU chứ không về pod.
func TestMocKhongHopLeThiKhongGoiPod(t *testing.T) {
	var zero int64
	run := newFakeDeadlineRunner()
	logs := &safeBuf{}
	h := newBridge(t, blockUntilCtx(), alwaysAlive, bridgeOpts{
		deadline:  run,
		logs:      logs,
		expiresAt: &zero,
	})
	h.sendInit(t, 80, 24)
	h.waitReady(t)

	waitLog(t, logs, "không có mốc hết hạn hợp lệ", 3*time.Second)
	if n := len(run.snapshot()); n != 0 {
		t.Errorf("có %d lượt gọi pod với mốc 0, muốn 0", n)
	}
}
