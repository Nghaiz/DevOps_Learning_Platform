package podexec

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"k8s.io/client-go/tools/remotecommand"
	utilexec "k8s.io/client-go/util/exec"
)

// ---------------------------------------------------------------- cappedWriter

// TestCappedWriterAlwaysReportsFullWrite là ca quan trọng nhất của file.
//
// `io.Copy` phía client-go coi `n < len(p)` là `io.ErrShortWrite` và HUỶ stream.
// Một cappedWriter "thành thật" (trả số byte đã giữ) vì thế sẽ làm mọi script in
// nhiều hơn trần MẤT LUÔN exit code và biến thành "lỗi hạ tầng" — tức ô AC "cắt
// cỡ output" sẽ phá ô AC "trả pass/fail đúng".
func TestCappedWriterAlwaysReportsFullWrite(t *testing.T) {
	w := &cappedWriter{limit: 4}

	n, err := w.Write([]byte("abcdefghij"))
	if err != nil {
		t.Fatalf("Write trả lỗi: %v", err)
	}
	if n != 10 {
		t.Fatalf("n = %d, muốn 10 — trả số nhỏ hơn là io.ErrShortWrite và client-go sẽ huỷ stream", n)
	}

	// Lượt ghi SAU khi đã đầy cũng phải "thành công".
	n, err = w.Write([]byte("xyz"))
	if n != 3 || err != nil {
		t.Fatalf("Write sau khi đầy = (%d, %v), muốn (3, nil)", n, err)
	}

	got, truncated := w.result()
	if got != "abcd" {
		t.Fatalf("output = %q, muốn %q", got, "abcd")
	}
	if !truncated {
		t.Fatal("truncated = false dù đã bỏ byte")
	}
}

func TestCappedWriterUnderLimitIsNotTruncated(t *testing.T) {
	w := &cappedWriter{limit: 16}
	if _, err := io.WriteString(w, "ok\n"); err != nil {
		t.Fatalf("Write: %v", err)
	}
	got, truncated := w.result()
	if got != "ok\n" || truncated {
		t.Fatalf("(%q, %v), muốn (\"ok\\n\", false)", got, truncated)
	}
}

// TestCappedWriterExactLimitIsNotTruncated — biên: đúng bằng trần thì KHÔNG cắt.
//
// Sai ở đây làm FE hiện "output đã bị cắt bớt" cho một script in vừa khít, tức
// một cảnh báo sai mà người đọc sẽ học cách bỏ qua.
func TestCappedWriterExactLimitIsNotTruncated(t *testing.T) {
	w := &cappedWriter{limit: 3}
	if _, err := io.WriteString(w, "abc"); err != nil {
		t.Fatalf("Write: %v", err)
	}
	if got, truncated := w.result(); got != "abc" || truncated {
		t.Fatalf("(%q, %v), muốn (\"abc\", false)", got, truncated)
	}
}

// ---------------------------------------------------------------- OneShotRunner

// fakeExecutor thay stream tới apiserver: bơm sẵn output rồi trả một lỗi dựng sẵn.
type fakeExecutor struct {
	stdout   string
	stderr   string
	err      error
	gotStdin string
	gotTTY   bool
}

func (f *fakeExecutor) Stream(remotecommand.StreamOptions) error { return errors.New("không dùng") }

func (f *fakeExecutor) StreamWithContext(_ context.Context, opts remotecommand.StreamOptions) error {
	f.gotTTY = opts.Tty
	if opts.Stdin != nil {
		b, _ := io.ReadAll(opts.Stdin)
		f.gotStdin = string(b)
	}
	if opts.Stdout != nil && f.stdout != "" {
		_, _ = io.WriteString(opts.Stdout, f.stdout)
	}
	if opts.Stderr != nil && f.stderr != "" {
		_, _ = io.WriteString(opts.Stderr, f.stderr)
	}
	return f.err
}

func runnerWith(exec *fakeExecutor, maxOutput int) *OneShotRunner {
	return NewOneShotRunner(func(Target) (remotecommand.Executor, error) { return exec, nil }, maxOutput)
}

func TestOneShotRunSendsScriptOnStdinWithoutTTY(t *testing.T) {
	exec := &fakeExecutor{stdout: "ok\n"}
	res, err := runnerWith(exec, 1024).Run(context.Background(), Target{}, "stat /var/run/netns/loxilb")
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if exec.gotStdin != "stat /var/run/netns/loxilb" {
		t.Fatalf("stdin = %q — script phải đi qua stdin, không qua argv (URL apiserver có trần độ dài)", exec.gotStdin)
	}
	if exec.gotTTY {
		t.Fatal("Tty = true — với TTY thì client-go không tạo stream stderr và exit code không đọc được")
	}
	if res.ExitCode != 0 || res.Output != "ok\n" {
		t.Fatalf("res = %+v, muốn exit 0 + output \"ok\\n\"", res)
	}
}

// TestOneShotRunReturnsExitCodeNotError — contract Killercoda: 0 = pass, khác 0
// = fail. Cả hai đều là KẾT QUẢ; chỉ hỏng hạ tầng mới là lỗi.
func TestOneShotRunReturnsExitCodeNotError(t *testing.T) {
	exec := &fakeExecutor{
		stderr: "cm not found\n",
		err:    utilexec.CodeExitError{Err: errors.New("command terminated with exit code 1"), Code: 1},
	}
	res, err := runnerWith(exec, 1024).Run(context.Background(), Target{}, "kubectl get cm x")
	if err != nil {
		t.Fatalf("Run trả lỗi cho một lượt fail hợp lệ: %v", err)
	}
	if res.ExitCode != 1 {
		t.Fatalf("ExitCode = %d, muốn 1", res.ExitCode)
	}
	if !strings.Contains(res.Output, "cm not found") {
		t.Fatalf("Output = %q — stderr phải được gộp vào (nó là hint cho người học)", res.Output)
	}
}

// TestOneShotRunInfraErrorIsAnError: lỗi KHÔNG mang exit code (dial hỏng,
// apiserver 500) phải nổi lên thành lỗi, không thành "fail".
func TestOneShotRunInfraErrorIsAnError(t *testing.T) {
	exec := &fakeExecutor{err: errors.New("upgrade request required")}
	if _, err := runnerWith(exec, 1024).Run(context.Background(), Target{}, "true"); err == nil {
		t.Fatal("Run trả nil — lỗi hạ tầng bị nhầm thành một lượt fail")
	}
}

func TestOneShotRunFactoryErrorIsAnError(t *testing.T) {
	r := NewOneShotRunner(func(Target) (remotecommand.Executor, error) {
		return nil, errors.New("thiếu RBAC pods/exec")
	}, 1024)
	if _, err := r.Run(context.Background(), Target{}, "true"); err == nil {
		t.Fatal("Run trả nil khi không dựng được executor")
	}
}

func TestOneShotRunTruncatesOutput(t *testing.T) {
	exec := &fakeExecutor{stdout: strings.Repeat("x", 100)}
	res, err := runnerWith(exec, 10).Run(context.Background(), Target{}, "cat big")
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(res.Output) != 10 || !res.Truncated {
		t.Fatalf("res = (len %d, truncated %v), muốn (10, true)", len(res.Output), res.Truncated)
	}
	// Vế còn lại của cùng một ô AC: cắt cỡ KHÔNG được làm mất exit code.
	if res.ExitCode != 0 {
		t.Fatalf("ExitCode = %d — cắt cỡ không được làm hỏng kết quả chấm", res.ExitCode)
	}
}

// TestOneShotRunCancelledContextIsAnError — ctx hết hạn phải là lỗi, không phải
// exit code 0 (thứ sẽ làm mọi step treo thành "pass").
func TestOneShotRunCancelledContextIsAnError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	exec := &fakeExecutor{}
	if _, err := runnerWith(exec, 1024).Run(ctx, Target{}, "true"); err == nil {
		t.Fatal("Run trả nil cho ctx đã huỷ — một lượt chấm quá hạn sẽ thành pass")
	}
}

// ---------------------------------------------------------------- URL exec

// TestOneShotURLDiffersFromTerminalURL khẳng định hai đường exec KHÔNG dùng cùng
// tham số.
//
// Đây là phép kiểm chống hồi quy cho đúng cái bẫy mà chú thích của `execURL`
// cảnh báo: `Stderr: true` cùng `TTY: true` KHÔNG sinh lỗi ở bất kỳ tầng nào —
// stream stderr chỉ đơn giản không được tạo. Nếu ai đó "gộp cho gọn" hai hàm URL
// này lại, lượt chấm sẽ im lặng mất stderr và exit code.
func TestOneShotURLDiffersFromTerminalURL(t *testing.T) {
	// Clientset THẬT trỏ vào host không tồn tại — cùng lý do đã ghi ở
	// executor_test.newTestClientset: fake clientset trả `RESTClient() == nil`,
	// và dựng URL là đúng đường mã hoá ta muốn kiểm.
	cs := newTestClientset(t)
	target := Target{PodName: "p", Namespace: "ns"}

	oneShot := oneShotURL(cs, target, []string{"sh"}).Query()
	terminal := execURL(cs, target, []string{"tmux"}).Query()

	// ⚠ `tty` VẮNG MẶT hẳn khi false — `scheme.ParameterCodec` bỏ field bool
	// zero-value thay vì ghi `tty=false`, và apiserver đọc "vắng" là false. Nên
	// phép kiểm phải là "không có tty=true", không phải "có tty=false"; viết
	// nhầm vế đó cho ra một test luôn đỏ dù mã đúng.
	if oneShot.Get("stderr") != "true" || oneShot.Get("tty") == "true" {
		t.Fatalf("one-shot query = %v, muốn stderr=true và KHÔNG có tty=true", oneShot)
	}
	if terminal.Get("tty") != "true" {
		t.Fatalf("terminal query = %v, muốn tty=true", terminal)
	}
	if oneShot.Get("command") != "sh" {
		t.Fatalf("command = %q, muốn \"sh\"", oneShot.Get("command"))
	}
}
