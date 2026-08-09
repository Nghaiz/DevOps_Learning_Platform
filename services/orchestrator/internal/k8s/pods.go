package k8s

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// PodClient là bề mặt K8s API mà warm-pool và reaper thật sự cần.
//
// Seam này tồn tại vì hai lý do cụ thể, không phải vì "nên trừu tượng hoá":
//  1. warm-pool và reaper là nơi dễ sai nhất của P1 (thứ tự ghi, xử lý quota,
//     idempotency) và chúng phải test được mà không có cluster;
//  2. `kubernetes.Interface` là một bề mặt khổng lồ — fake nó trong test nghĩa
//     là phụ thuộc client-go/fake, thứ kéo theo cả một scheme và làm test kể
//     câu chuyện về client-go thay vì về logic của ta.
type PodClient interface {
	Create(ctx context.Context, pod *corev1.Pod) (*corev1.Pod, error)
	Get(ctx context.Context, name string) (*corev1.Pod, error)
	// Delete xoá pod. IsNotFound được NUỐT có chủ ý: mọi caller của nó
	// (reaper, hoàn tác của warm-pool, ReapSession) đều phải idempotent, và
	// "pod đã biến mất" đúng là kết quả mong muốn của chúng.
	Delete(ctx context.Context, name string, gracePeriodSeconds int64) error
	List(ctx context.Context, labelSelector string) ([]corev1.Pod, error)
}

// podClient hiện thực PodClient trên một namespace duy nhất.
//
// Namespace bị khoá lúc dựng chứ không nhận theo từng lời gọi: orchestrator có
// RBAC create pod trong `dlp-sandbox` và KHÔNG có ở `default` (xác minh trên
// cluster). Một tham số namespace ở mỗi call là một chỗ để truyền nhầm.
type podClient struct {
	api       kubernetes.Interface
	namespace string
}

// NewPodClient khoá clientset vào đúng namespace sandbox.
func NewPodClient(api kubernetes.Interface, namespace string) PodClient {
	return &podClient{api: api, namespace: namespace}
}

func (c *podClient) Create(ctx context.Context, pod *corev1.Pod) (*corev1.Pod, error) {
	created, err := c.api.CoreV1().Pods(c.namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		// Trả NGUYÊN VĂN lỗi từ API server. Message của VAP reject nêu đúng
		// validation CEL nào trượt; gói nó lại thành "tạo pod thất bại" là vứt
		// đi thông tin duy nhất có ích.
		return nil, fmt.Errorf("k8s: tạo pod %q trong %q: %w", pod.Name, c.namespace, err)
	}
	return created, nil
}

func (c *podClient) Get(ctx context.Context, name string) (*corev1.Pod, error) {
	pod, err := c.api.CoreV1().Pods(c.namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("k8s: đọc pod %q: %w", name, err)
	}
	return pod, nil
}

func (c *podClient) Delete(ctx context.Context, name string, gracePeriodSeconds int64) error {
	err := c.api.CoreV1().Pods(c.namespace).Delete(ctx, name, metav1.DeleteOptions{
		GracePeriodSeconds: &gracePeriodSeconds,
	})
	if err != nil && !apierrors.IsNotFound(err) {
		return fmt.Errorf("k8s: xoá pod %q: %w", name, err)
	}
	return nil
}

func (c *podClient) List(ctx context.Context, labelSelector string) ([]corev1.Pod, error) {
	list, err := c.api.CoreV1().Pods(c.namespace).List(ctx, metav1.ListOptions{
		LabelSelector: labelSelector,
	})
	if err != nil {
		return nil, fmt.Errorf("k8s: liệt kê pod (%s): %w", labelSelector, err)
	}
	return list.Items, nil
}

// IsReady trả true khi pod đã sẵn sàng nhận `pods/exec`.
//
// Phase == Running LÀ CHƯA ĐỦ: pod chuyển Running ngay khi container bắt đầu,
// còn readiness mới là lúc nó phục vụ được. Đẩy một pod chưa ready vào
// `pool:free` nghĩa là người claim được nó trong 1s rồi ngồi nhìn exec lỗi —
// tệ hơn hẳn so với chờ thêm vài giây ở phía pool.
func IsReady(pod *corev1.Pod) bool {
	if pod == nil || pod.Status.Phase != corev1.PodRunning {
		return false
	}
	for _, cond := range pod.Status.Conditions {
		if cond.Type == corev1.PodReady {
			return cond.Status == corev1.ConditionTrue
		}
	}
	return false
}

// IsTerminal trả true khi pod đã vào trạng thái không bao giờ Ready nữa.
//
// Không có nhánh này thì vòng chờ-ready của warm-pool sẽ ngồi hết timeout với
// một pod đã Failed — mỗi lần như thế là một khe quota bị giữ vô ích, và với
// trần 4 pod (D16) đó là chuyện lớn.
func IsTerminal(pod *corev1.Pod) bool {
	if pod == nil {
		return false
	}
	return pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodSucceeded
}

// IsQuotaExceeded nhận diện "ResourceQuota chặn", tách khỏi mọi lỗi API khác.
//
// VÌ SAO PHẢI TÁCH: chạm quota KHÔNG phải lỗi hệ thống — nó là nền tảng đang
// chạy đúng công suất tối đa (D16: trần hiệu lực 4 pod). Coi nó là lỗi thì
// warm-pool sẽ backoff theo cấp số nhân và log ERROR ở đúng lúc đông người
// nhất, chôn vùi các lỗi thật.
//
// Nhận diện bằng chuỗi vì apiserver KHÔNG đặt Details.Causes cho quota reject —
// nó trả 403 Forbidden với message `exceeded quota: <tên>, requested: …`. Đây là
// điểm giòn có ý thức: nếu upstream đổi câu chữ, nhánh này im lặng rơi về nhánh
// "lỗi khác" (backoff + ERROR), tức là hỏng về phía ồn ào chứ không phải về
// phía im lặng.
func IsQuotaExceeded(err error) bool {
	if err == nil || !apierrors.IsForbidden(err) {
		return false
	}
	return strings.Contains(err.Error(), "exceeded quota")
}

// IsNotFound phơi lại helper của apierrors để caller không phải import thêm.
func IsNotFound(err error) bool { return apierrors.IsNotFound(err) }
