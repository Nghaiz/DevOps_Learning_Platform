package podexec

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// PodGoneFunc hỏi apiserver: pod này còn phục vụ được không?
//
// ⛔ TỒN TẠI VÌ MỘT CUỘC ĐUA, KHÔNG PHẢI VÌ THIẾU NHÁNH CODE.
//
// `SessionAliveFunc` (Redis) đã tách được "pod bị reap" khỏi "người dùng tự
// kill -9" — nhưng CHỈ khi Redis kịp biết. Đo được 2026-09-05 (P12 §8, ba lượt
// độc lập): xoá pod của một phiên đang mở WS làm stream đứt sau 330–385ms với
// `exitCode=137`, và tại đúng khoảnh khắc đó Redis VẪN ghi phiên còn sống —
// Redis chỉ chuyển sang FAILED/REAPED khi reaper chạy vòng sau. Nhánh "session
// còn sống ⇒ người dùng tự giết tiến trình" vì thế thắng, và người bị thu hồi
// pod đọc được "bạn đã tự gõ exit".
//
// Đường reaper bình thường KHÔNG dính: reaper ghi Redis TRƯỚC rồi mới xoá pod.
// Dính là mọi cái chết khác của pod — evict, OOMKill, node pressure, xoá tay —
// tức đúng những ca xảy ra khi cụm quá tải.
//
// Apiserver là nguồn DUY NHẤT biết ngay lập tức, và nó không đua với ai: pod
// biến mất là `NotFound`, pod đang bị xoá là `deletionTimestamp != nil`.
//
// Một lượt đọc trên ĐƯỜNG ĐÓNG, không phải đường nóng — cùng ngân sách với
// `SessionAliveFunc`, và chỉ chạy cho `exit ∈ {137,143}`.
type PodGoneFunc func(ctx context.Context, namespace, name string) (bool, error)

// NewPodGoneProbe dựng PodGoneFunc trên chính clientset đang dùng cho exec.
//
// KHÔNG cần quyền RBAC mới: Role `…-gateway-sandbox` đã có `pods: [get, list]`
// (nó là thứ `ideroute.CachedPodIP` dựa vào để phân giải IP pod cho đường IDE).
func NewPodGoneProbe(cs kubernetes.Interface) PodGoneFunc {
	return func(ctx context.Context, namespace, name string) (bool, error) {
		pod, err := cs.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
		return podGone(pod, err)
	}
}

// podGone phân loại kết quả một lượt GET pod.
//
// ⛔ `DeletionTimestamp`, KHÔNG CHỈ `Phase`. Một pod đang bị xoá giữ NGUYÊN
// `phase: Running` suốt grace period (mặc định 30s, và `--force` cũng không
// phải SIGKILL ngay) — chỉ `metadata.deletionTimestamp` nói ra sự thật. Phép
// kiểm chỉ đọc `phase` sẽ trả "còn sống" ở ĐÚNG cửa sổ mà hàm này tồn tại để
// bắt, tức nó sẽ xanh mà không gác gì.
//
// Cùng ngữ nghĩa với `k8s.IsDoomed` của orchestrator; viết lại vì Go cấm import
// chéo `services/orchestrator/internal/…`. Đổi một bên thì đổi cả hai.
//
// Lỗi KHÁC NotFound trả (false, err): người gọi fail-open, xem Bridge.podBienMat.
func podGone(pod *corev1.Pod, err error) (bool, error) {
	if err != nil {
		if apierrors.IsNotFound(err) {
			return true, nil
		}
		return false, err
	}
	if pod == nil {
		return false, nil
	}
	return pod.Status.Phase == corev1.PodFailed ||
		pod.Status.Phase == corev1.PodSucceeded ||
		pod.DeletionTimestamp != nil, nil
}
