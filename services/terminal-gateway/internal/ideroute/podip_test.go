package ideroute_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/ideroute"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

const (
	podNS   = "dlp-sandboxes"
	podName = "sandbox-abc"
	podAddr = "10.42.0.7"
)

func sandboxPod(deleting bool) *corev1.Pod {
	p := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Namespace: podNS, Name: podName},
		Status:     corev1.PodStatus{PodIP: podAddr},
	}
	if deleting {
		// Đúng hình dạng apiserver trả trong grace period: pod VẪN còn IP, vẫn
		// `Running`, chỉ khác ở `deletionTimestamp`. Chính vì IP còn đó mà cache
		// cũ coi nó là đích hợp lệ.
		ts := metav1.NewTime(time.Now())
		p.DeletionTimestamp = &ts
	}
	return p
}

// Đối chứng dương: thiếu ca này thì ca dưới xanh cả khi resolver từ chối MỌI pod.
func TestPodIPReturnsIPOfLivePod(t *testing.T) {
	r := ideroute.NewCachedPodIP(fake.NewClientset(sandboxPod(false)), time.Minute)

	ip, err := r.PodIP(context.Background(), podNS, podName)
	if err != nil || ip != podAddr {
		t.Fatalf("pod sống phải trả IP %q, nhận ip=%q err=%v", podAddr, ip, err)
	}
}

// D7.5 — pod đang bị xoá (`deletionTimestamp` đã đặt) KHÔNG còn là đích proxy.
//
// Trong grace period pod vẫn giữ IP, nên trước bản vá resolver trả IP đó và còn
// CACHE nó: IDE bị proxy vào một Theia đang tắt, rồi tới đúng cửa sổ mà IP được
// tái cấp cho pod của người khác (xem chú thích rủi ro ở podip.go). `ErrPodNotReady`
// là câu trả lời đúng — route đã ánh xạ nó sang 503 `SESSION_NO_POD`, tức FE hiện
// "IDE đang khởi động" thay vì một trang hỏng.
func TestPodIPSkipsPodBeingDeleted(t *testing.T) {
	cs := fake.NewClientset(sandboxPod(true))
	r := ideroute.NewCachedPodIP(cs, time.Minute)

	ip, err := r.PodIP(context.Background(), podNS, podName)
	if !errors.Is(err, ideroute.ErrPodNotReady) {
		t.Fatalf("pod đang xoá phải trả ErrPodNotReady, nhận ip=%q err=%v", ip, err)
	}

	// Không được cache kết luận "có IP": lượt sau vẫn phải hỏi lại apiserver.
	// Đổi pod về trạng thái sống rồi hỏi lại — nếu IP đã bị cache ở lượt trên
	// thì ca này vẫn qua mà không chứng minh gì; nên kiểm theo chiều ngược: pod
	// VẪN đang xoá ở lượt hai cũng phải bị từ chối.
	if _, err := r.PodIP(context.Background(), podNS, podName); !errors.Is(err, ideroute.ErrPodNotReady) {
		t.Fatalf("lượt hai: pod đang xoá vẫn phải bị từ chối, nhận err=%v", err)
	}
}
