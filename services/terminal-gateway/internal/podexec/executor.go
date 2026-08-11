package podexec

import (
	"fmt"
	"net/url"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/util/httpstream"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// Target là đích của một phiên exec. Mọi trường tới từ hash `session:{id}` trong
// Redis — KHÔNG từ URL hay frame của client (phase-1 G4).
type Target struct {
	SessionID string
	PodName   string
	Namespace string
	// ExpiresAt (epoch giây) là mốc `ready` báo cho FE vẽ đồng hồ, và cũng là
	// mốc heartbeat so để biết khi nào hạn ĐÃ DỊCH và phải phát `expiring`.
	ExpiresAt int64

	// UserID là `hash.userId` — đã được bước g của handshake xác nhận TRÙNG với
	// `sub` của token, nên hai nguồn ở đây là một.
	//
	// Gửi làm `user_id` của ExtendSession (G7): proto nói rõ gateway điền từ
	// token đã verify chứ KHÔNG lấy từ input client, và đây là vế authz duy
	// nhất orchestrator có ở RPC đó.
	UserID string
}

// ExecutorFactory dựng executor cho một Target. Là một seam để test chạy được
// TOÀN BỘ cầu (handshake init, hai chiều bơm, chọn close code) mà không cần
// cluster — thứ quyết định việc phần logic này có được gác ở PR hay không.
type ExecutorFactory func(t Target) (remotecommand.Executor, error)

// NewExecutorFactory trả factory nối vào apiserver thật.
//
// `command` là HẰNG SỐ PHÍA SERVER (GATEWAY_EXEC_COMMAND). Tuyệt đối không lấy
// từ frame client: cho client chọn lệnh là cho client chọn thứ chạy trong pod —
// kể cả pod của chính họ, đó là bề mặt không cần mở (contract §3c).
func NewExecutorFactory(cfg *rest.Config, cs kubernetes.Interface, command []string) ExecutorFactory {
	return func(t Target) (remotecommand.Executor, error) {
		u := execURL(cs, t, command)

		// NewFallbackExecutor(ws, spdy, IsUpgradeFailure) — đúng khuôn mẫu
		// `kubectl exec`. Spike đo trên cluster 1.34.10: apiserver chọn
		// `v5.channel.k8s.io`, WS luôn thắng, SPDY CHƯA TỪNG chạy, và `fallback`
		// (404.6ms) không tốn thêm gì so với `ws` thuần (405.8ms). Giữ SPDY vì
		// nó là lưới an toàn miễn phí cho apiserver cũ hơn / tắt feature gate.
		wsExec, err := remotecommand.NewWebSocketExecutor(cfg, "POST", u.String())
		if err != nil {
			return nil, fmt.Errorf("podexec: dựng ws executor: %w", err)
		}
		spdyExec, err := remotecommand.NewSPDYExecutor(cfg, "POST", u)
		if err != nil {
			return nil, fmt.Errorf("podexec: dựng spdy executor: %w", err)
		}

		// ⛔ Predicate KHÔNG được nuốt lỗi authz. `httpstream.IsUpgradeFailure`
		// hẹp đúng mức: một 403 vì thiếu quyền `pods/exec` KHÔNG phải
		// upgrade-failure, nên nó nổi lên nguyên vẹn thay vì hiện ra dưới dạng
		// "SPDY failed" — người đọc log sẽ đi sửa RBAC chứ không đi sửa transport.
		exec, err := remotecommand.NewFallbackExecutor(wsExec, spdyExec, httpstream.IsUpgradeFailure)
		if err != nil {
			return nil, fmt.Errorf("podexec: dựng fallback executor: %w", err)
		}
		return exec, nil
	}
}

// execURL dựng URL của subresource `pods/exec`.
//
// ⛔ `Stderr` để FALSE, và đó là quyết định có số đo đứng sau, không phải sơ
// suất. Spike đo: đặt `Stderr: true` cùng `TTY: true` KHÔNG sinh lỗi ở bất kỳ
// tầng nào — `client-go/tools/remotecommand/v2.go:80` có `if p.Stderr != nil &&
// !p.Tty`, nền của cả V4 (SPDY) lẫn V5 (WS), nên stream stderr không được tạo và
// writer truyền vào KHÔNG BAO GIỜ nhận byte nào. Với TTY thật thì fd1/fd2 đã gộp
// ở tầng PTY trong kernel, đúng như một terminal.
//
// Plan bản cũ viết "apiserver từ chối" — SAI, và im lặng nguy hiểm hơn từ chối:
// một `Stderr: w` để nhầm sẽ không có exception, không log, không cách nào phân
// biệt với "chương trình không ghi stderr".
func execURL(cs kubernetes.Interface, t Target, command []string) *url.URL {
	return cs.CoreV1().RESTClient().Post().
		Resource("pods").Namespace(t.Namespace).Name(t.PodName).SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Command: command,
			Stdin:   true,
			Stdout:  true,
			Stderr:  false,
			TTY:     true,
		}, scheme.ParameterCodec).URL()
}
