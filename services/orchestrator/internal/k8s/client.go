package k8s

import (
	"errors"
	"fmt"

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

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("k8s: dựng clientset: %w", err)
	}
	return clientset, nil
}
