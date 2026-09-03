package ideroute

import (
	"context"
	"errors"
	"sync"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ErrPodNotReady là pod tồn tại nhưng chưa được cấp IP (vừa tạo, hoặc đang
// Terminating). Tách khỏi lỗi hạ tầng vì FE phải phân biệt "đang khởi động" với
// "hỏng" — 6.D task 14.
var ErrPodNotReady = errors.New("pod chưa có IP")

// PodIPResolver trả IP của pod sandbox.
//
// Là interface để test của `ideroute` chạy được mà không cần apiserver, cùng lý
// do `sessionauth.SessionReader` là interface.
type PodIPResolver interface {
	PodIP(ctx context.Context, namespace, name string) (string, error)
}

// CachedPodIP hỏi apiserver và nhớ kết quả trong một khoảng NGẮN.
//
// VÌ SAO PHẢI CÓ CACHE: một phiên IDE sinh hàng trăm request (mỗi asset, mỗi
// lượt autocomplete). Một `GET pod` cho mỗi request là biến apiserver — thứ đã
// restart 41 lần trên cụm này — thành đường nóng của IDE, tức đúng cái mà việc
// bỏ `portforward` được quyết định để tránh.
//
// ⚠ VÌ SAO TTL PHẢI NGẮN, VÀ RỦI RO TỒN DƯ CÒN LẠI SAU ĐÓ:
//
// Kubernetes TÁI SỬ DỤNG IP pod. Nếu pod A chết và IP của nó được cấp lại cho
// pod B trong lúc mục cache còn hạn, gateway sẽ proxy người dùng của A vào pod
// của B — một IDOR đi qua tầng mạng, KHÔNG phải qua chuỗi authz (chuỗi vẫn đúng:
// nó cho phép A vào pod của A; thứ sai là ánh xạ tên-pod → IP).
//
// Cái này KHÔNG được đóng hoàn toàn ở đây, và nói thẳng ra thì tốt hơn là giả vờ:
//   - TTL 5 giây thu hẹp cửa sổ xuống mức mà một pod phải chết VÀ IP phải được
//     tái cấp trong cùng 5 giây đó. Pod sandbox sống 30+ phút, nên cửa sổ này
//     hẹp — nhưng không phải bằng không.
//   - `Invalidate` được gọi ở mọi lỗi proxy, nên một IP đã chết bị đẩy khỏi cache
//     ngay lượt hỏng đầu tiên thay vì chờ hết TTL.
//   - Đóng THẬT thì cần đích proxy tự chứng minh danh tính (mTLS theo pod, hoặc
//     một header bí mật gateway ↔ pod). Đó là việc chưa làm, và nó nên là điều
//     kiện để mở IDE cho nhiều người dùng thật ngoài lớp học.
type CachedPodIP struct {
	cs  kubernetes.Interface
	ttl time.Duration

	mu sync.Mutex
	m  map[string]podIPEntry
}

type podIPEntry struct {
	ip   string
	when time.Time
}

// NewCachedPodIP dựng resolver. ttl <= 0 ⇒ 5 giây.
func NewCachedPodIP(cs kubernetes.Interface, ttl time.Duration) *CachedPodIP {
	if ttl <= 0 {
		ttl = 5 * time.Second
	}
	return &CachedPodIP{cs: cs, ttl: ttl, m: map[string]podIPEntry{}}
}

func (c *CachedPodIP) key(ns, name string) string { return ns + "/" + name }

// PodIP trả IP, hỏi apiserver khi cache hết hạn.
func (c *CachedPodIP) PodIP(ctx context.Context, namespace, name string) (string, error) {
	k := c.key(namespace, name)
	now := time.Now()

	c.mu.Lock()
	if e, ok := c.m[k]; ok && now.Sub(e.when) < c.ttl {
		c.mu.Unlock()
		return e.ip, nil
	}
	c.mu.Unlock()

	// Gọi NGOÀI lock: một apiserver chậm không được phép chặn mọi phiên khác.
	// Đánh đổi: hai request cùng lúc cho một pod hết hạn có thể cùng gọi — một
	// lượt GET thừa, rẻ hơn nhiều so với một mutex giữ suốt round-trip mạng.
	pod, err := c.cs.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", err
	}
	if pod.Status.PodIP == "" {
		return "", ErrPodNotReady
	}

	c.mu.Lock()
	c.m[k] = podIPEntry{ip: pod.Status.PodIP, when: now}
	c.mu.Unlock()
	return pod.Status.PodIP, nil
}

// Invalidate đẩy một mục ra khỏi cache. Gọi ở mọi lỗi proxy — xem chú thích rủi
// ro tồn dư ở trên.
func (c *CachedPodIP) Invalidate(namespace, name string) {
	c.mu.Lock()
	delete(c.m, c.key(namespace, name))
	c.mu.Unlock()
}
