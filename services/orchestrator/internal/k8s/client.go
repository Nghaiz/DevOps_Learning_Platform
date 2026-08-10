package k8s

import (
	"errors"
	"fmt"
	"time"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Trần rate-limit phía client. Mặc định của client-go là 5 QPS / 10 burst —
// đủ cho một controller nhàn rỗi, không đủ cho warm-pool đang replenish nhiều
// pod cùng lúc trong khi reaper sweep. Vượt trần thì client-go KHÔNG lỗi, nó
// LÀM CHẬM lời gọi trong im lặng, và triệu chứng hiện ra ở đầu kia là "claim
// chậm" chứ không phải "bị throttle".
const (
	clientQPS   = 20
	clientBurst = 40

	// clientTimeout là trần cho MỖI lời gọi HTTP tới API server.
	//
	// ⛔ Mặc định của client-go là KHÔNG CÓ TRẦN (`rest.Config.Timeout` = 0 ⇒
	// http.Client.Timeout = 0 = vô hạn). Giả thuyết chưa đóng của review PR #27
	// đi đúng từ chỗ này: `pool.Manager.waitReady` poll `pods.Get` với ngân sách
	// 2 phút, nhưng một lời gọi `Get` TREO không bao giờ trả về thì ngân sách đó
	// không bao giờ được kiểm — waitReady vượt qua `reaper.orphanGrace` (5 phút)
	// và sweep xoá đúng pod mà warm-pool đang chờ. Không dựng được API server
	// treo để đo, nên vá bằng cách LOẠI BỎ tiền đề: có trần thì `Get` treo hoá
	// thành `Get` lỗi, waitReady thấy lỗi và tôn trọng deadline của chính nó.
	//
	// 30s: rộng hơn nhiều so với p99 của một `Get`/`Create` bình thường, và nhỏ
	// hơn nhiều so với readyTimeout 2 phút, nên nó không bao giờ cắt ngang một
	// vòng poll hợp lệ.
	clientTimeout = 30 * time.Second
)

// NewClientset dựng client Kubernetes: in-cluster trước, kubeconfig sau.
//
// Thứ tự đó là cố ý. In-cluster là đường CHẠY THẬT; kubeconfig chỉ là tiện nghi
// cho dev. Thử kubeconfig trước sẽ khiến một file ~/.kube/config lạc vào image
// âm thầm chiếm quyền điều khiển pod trong cluster thật.
//
// Kubeconfig lấy theo quy tắc chuẩn của client-go (biến KUBECONFIG rồi
// ~/.kube/config). Cố ý KHÔNG đọc KUBECONFIG bằng envx: nó là biến của hệ sinh
// thái kubectl, không phải cấu hình của service này — khai nó trong
// .env.example + Helm chỉ để làm vui lòng cổng env-drift là nói dối về nguồn.
func NewClientset() (*kubernetes.Clientset, error) {
	cfg, err := rest.InClusterConfig()
	switch {
	case err == nil:
		// Đang chạy trong pod.
	case errors.Is(err, rest.ErrNotInCluster):
		cfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
			clientcmd.NewDefaultClientConfigLoadingRules(),
			&clientcmd.ConfigOverrides{},
		).ClientConfig()
		if err != nil {
			return nil, fmt.Errorf("k8s: không có config in-cluster và kubeconfig cũng không nạp được: %w", err)
		}
	default:
		// ErrNotInCluster đã tách ở trên, nên tới đây là ta ĐANG trong cluster
		// mà token/CA hỏng. Rơi về kubeconfig lúc này là che một sự cố thật.
		return nil, fmt.Errorf("k8s: config in-cluster có mặt nhưng hỏng: %w", err)
	}

	cfg.QPS = clientQPS
	cfg.Burst = clientBurst
	cfg.Timeout = clientTimeout

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("k8s: dựng clientset: %w", err)
	}
	return clientset, nil
}
