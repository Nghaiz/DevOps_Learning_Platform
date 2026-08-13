package podexec

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// One-shot exec — chạy MỘT script trong pod session rồi lấy exit code (P2 / 2.C).
//
// ⛔ ĐÂY LÀ MỘT EXECUTOR KHÁC HẲN `NewExecutorFactory`, không phải một tuỳ chọn
// của nó. Ba khác biệt, cả ba đều bắt buộc (docs/scenario-format.md §4):
//
//  1. `TTY: false` + `Stderr: true`. Đường terminal đặt `TTY: true`, và với TTY
//     thì client-go KHÔNG tạo stream stderr (`v2.go:80` — `if p.Stderr != nil &&
//     !p.Tty`) vì fd1/fd2 đã gộp ở tầng PTY. Chấm điểm thì cần đọc được stderr
//     của script, và quan trọng hơn: cần EXIT CODE, thứ chỉ tới qua status của
//     `remotecommand` khi stream không phải PTY.
//  2. Script đi qua STDIN, không qua argv. `execURL` nhét `Command` vào QUERY
//     STRING của URL apiserver — một verify script vài KB sẽ phình URL tới ngưỡng
//     apiserver từ chối, và triệu chứng ("bài này bấm Check thì lỗi 400, bài kia
//     thì không") không trỏ về độ dài script. `sh` đọc stdin là đường `kubectl
//     exec -i` vẫn dùng và nó không có trần đó.
//  3. KHÔNG chiếm khe WS. Trần D17=1: nếu lượt chấm chiếm một khe thì bấm "Check"
//     sẽ đá văng chính terminal người học đang mở. execroute vì thế bỏ hẳn bước i.
//
// Điểm chung với đường terminal — và là điểm quyết định của ô AC "verifyScript
// chạy TRONG pod cô lập": `Target` tới từ Redis, không từ input client.

// OneShotResult là kết quả một lượt chạy script trong pod.
type OneShotResult struct {
	// ExitCode theo contract Killercoda: 0 = pass, khác 0 = fail
	// (docs/scenario-format.md §1 — "verify pass khi exit code = 0").
	ExitCode int
	// Output là stdout+stderr đã gộp và ĐÃ cắt cỡ. Gộp vì đó là thứ người học
	// thấy nếu tự gõ lệnh; tách ra không giúp gì cho một cái hint.
	Output string
	// Truncated = output thật dài hơn trần, phần đuôi đã bị bỏ.
	Truncated bool
}

// OneShotFactory dựng executor one-shot cho một Target. Là seam để test chạy
// được toàn bộ execroute mà không cần apiserver — cùng lý do ExecutorFactory là
// một kiểu hàm chứ không phải một struct cụ thể.
type OneShotFactory func(t Target) (remotecommand.Executor, error)

// NewOneShotFactory trả factory nối vào apiserver thật.
//
// `shell` là HẰNG SỐ PHÍA SERVER, cùng ranh giới với `GATEWAY_EXEC_COMMAND`:
// client không chọn được lệnh. Thứ client-side duy nhất đi vào đây là NỘI DUNG
// script, và nó bị chặn một tầng nữa ở BFF (script đọc từ đĩa theo
// `Scenario.steps[i].verifyScript`, không lấy từ body người dùng).
func NewOneShotFactory(cfg *rest.Config, cs kubernetes.Interface, shell []string) OneShotFactory {
	return func(t Target) (remotecommand.Executor, error) {
		u := oneShotURL(cs, t, shell)

		// Cùng khuôn fallback WS→SPDY với đường terminal: apiserver hiện đại chọn
		// `v5.channel.k8s.io`, SPDY là lưới an toàn miễn phí cho bản cũ hơn.
		wsExec, err := remotecommand.NewWebSocketExecutor(cfg, "POST", u.String())
		if err != nil {
			return nil, fmt.Errorf("podexec: dựng ws executor one-shot: %w", err)
		}
		spdyExec, err := remotecommand.NewSPDYExecutor(cfg, "POST", u)
		if err != nil {
			return nil, fmt.Errorf("podexec: dựng spdy executor one-shot: %w", err)
		}
		exec, err := remotecommand.NewFallbackExecutor(wsExec, spdyExec, httpstream.IsUpgradeFailure)
		if err != nil {
			return nil, fmt.Errorf("podexec: dựng fallback executor one-shot: %w", err)
		}
		return exec, nil
	}
}

// oneShotURL dựng URL `pods/exec` cho lượt chấm.
//
// So với `execURL`: `Stderr: true` và `TTY: false` — xem chú thích đầu file.
func oneShotURL(cs kubernetes.Interface, t Target, shell []string) *url.URL {
	return cs.CoreV1().RESTClient().Post().
		Resource("pods").Namespace(t.Namespace).Name(t.PodName).SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Command: shell,
			Stdin:   true,
			Stdout:  true,
			Stderr:  true,
			TTY:     false,
		}, scheme.ParameterCodec).URL()
}

// OneShotRunner chạy script chấm điểm. MỘT instance phục vụ mọi phiên — không
// giữ state theo session, cùng ràng buộc G9 với Bridge.
type OneShotRunner struct {
	newExecutor OneShotFactory
	maxOutput   int
}

// NewOneShotRunner dựng runner. `maxOutput` là trần byte của output trả về.
func NewOneShotRunner(f OneShotFactory, maxOutput int) *OneShotRunner {
	return &OneShotRunner{newExecutor: f, maxOutput: maxOutput}
}

// Run chạy `script` trong pod của `t` và trả exit code + output đã cắt cỡ.
//
// Lỗi trả về CHỈ dành cho hỏng hạ tầng (không dựng được executor, apiserver
// chết, hết hạn ctx). Script chạy xong với exit code khác 0 KHÔNG phải lỗi — đó
// là một kết quả "fail" hợp lệ, và trộn hai thứ đó lại làm nút "Check" không
// phân biệt được "bài chưa đúng" với "hệ thống hỏng".
func (r *OneShotRunner) Run(ctx context.Context, t Target, script string) (OneShotResult, error) {
	exec, err := r.newExecutor(t)
	if err != nil {
		return OneShotResult{}, fmt.Errorf("dựng executor: %w", err)
	}

	out := &cappedWriter{limit: r.maxOutput}
	streamErr := exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin: strings.NewReader(script),
		// CÙNG một writer cho cả hai chiều — nó tự khoá, xem cappedWriter.
		Stdout: out,
		Stderr: out,
		Tty:    false,
	})

	// ctx hết hạn phải nổi lên thành LỖI, không phải "fail". Nếu không, một
	// verify script treo 30 giây sẽ hiện ra ở FE giống hệt một bài làm sai, và
	// người học đi sửa bài trong khi thứ hỏng là cụm.
	if ctxErr := ctx.Err(); ctxErr != nil {
		return OneShotResult{}, fmt.Errorf("script chạy quá hạn: %w", ctxErr)
	}

	code, isExit := exitStatus(streamErr)
	if !isExit {
		return OneShotResult{}, fmt.Errorf("stream tới pod hỏng: %w", streamErr)
	}

	text, truncated := out.result()
	return OneShotResult{ExitCode: code, Output: text, Truncated: truncated}, nil
}

// cappedWriter gom output tới một trần byte rồi bỏ phần dư.
//
// ⛔ `Write` LUÔN trả `len(p), nil` KỂ CẢ KHI ĐÃ BỎ BYTE. Trả số nhỏ hơn là
// `io.ErrShortWrite` với `io.Copy` phía client-go, và nó sẽ HUỶ stream — tức một
// script in nhiều hơn trần sẽ mất luôn exit code và biến thành "lỗi hạ tầng".
// Đúng cái ô AC "output verify bị cắt cỡ" khi đó lại làm hỏng ô "trả pass/fail
// đúng". Cắt nghĩa là bỏ byte, không phải bỏ kết quả.
//
// Có mutex vì client-go copy stdout và stderr bằng HAI goroutine
// (`v4.go`/`v2.go` — mỗi stream một `io.Copy`), và ở đây cả hai ghi vào cùng một
// buffer.
type cappedWriter struct {
	mu    sync.Mutex
	buf   []byte
	limit int
	over  bool
}

func (w *cappedWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()

	remain := w.limit - len(w.buf)
	switch {
	case remain <= 0:
		if len(p) > 0 {
			w.over = true
		}
	case len(p) <= remain:
		w.buf = append(w.buf, p...)
	default:
		w.buf = append(w.buf, p[:remain]...)
		w.over = true
	}
	return len(p), nil
}

func (w *cappedWriter) result() (string, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	return string(w.buf), w.over
}
