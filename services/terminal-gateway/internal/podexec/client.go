// Package podexec nối một kết nối WebSocket đã qua authz vào PTY của pod
// sandbox (phase-1 G4–G6).
//
// Toàn bộ package này dựng trên số đo của spike 1.A-1
// (plans/devops-learning-platform/reports/2026-08-09-spike-ws-exec.md). Mỗi
// ràng buộc phi hiển nhiên ở đây đều có một phép đo đứng sau, và chú thích ghi
// rõ phép đo đó — đừng "dọn cho gọn" mà không đọc chúng.
package podexec

import (
	"errors"
	"fmt"
	"net/http"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

// Trần rate-limit phía client. Gateway gọi apiserver ĐÚNG MỘT LẦN mỗi phiên
// (dial exec), nên nó không cần ngân sách rộng như warm-pool của orchestrator —
// nhưng mặc định 5 QPS / 10 burst của client-go vẫn quá hẹp cho một đợt nhiều
// sinh viên vào lab cùng lúc, và vượt trần thì client-go KHÔNG lỗi, nó LÀM CHẬM
// trong im lặng (triệu chứng hiện ra là "terminal lâu mở", không phải "bị chặn").
const (
	clientQPS   = 20
	clientBurst = 40
)

// NewExecConfig dựng rest.Config cho ĐƯỜNG STREAM.
//
// ⛔ `Timeout` CỐ Ý ĐỂ 0 (vô hạn), và đây là khác biệt QUAN TRỌNG so với
// `k8s.NewClientset` của orchestrator (đặt 30s).
//
// `rest.Config.Timeout` chảy thẳng vào `http.Client.Timeout`, vốn là deadline
// TUYỆT ĐỐI trên cả vòng đời request — không phải idle-timeout. Với orchestrator
// thì 30s là đúng: mọi lời gọi của nó đều ngắn, và một `Get` treo từng suýt làm
// reaper xoá nhầm pod. Với exec thì cùng con số đó nghĩa là **mọi phiên terminal
// chết đúng 30 giây sau khi mở**, bất kể sinh viên đang gõ gì.
//
// Đây chính xác là lý do `httpx` trong repo này tách `NewStreamingServer` khỏi
// `NewServer` — cùng một cái bẫy, ở đầu ngược lại của kết nối.
//
// Không rơi về kubeconfig khi in-cluster config CÓ mặt nhưng hỏng: lúc đó một
// `~/.kube/config` lạc vào image sẽ âm thầm chiếm quyền exec vào pod của cluster
// thật. Cùng lý lẽ với orchestrator.
func NewExecConfig() (*rest.Config, *kubernetes.Clientset, error) {
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
			return nil, nil, fmt.Errorf("podexec: không có config in-cluster và kubeconfig cũng không nạp được: %w", err)
		}
	default:
		return nil, nil, fmt.Errorf("podexec: config in-cluster có mặt nhưng hỏng: %w", err)
	}

	cfg.QPS = clientQPS
	cfg.Burst = clientBurst
	cfg.Timeout = 0 // xem chú thích hàm — KHÔNG đặt trần ở đây.

	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("podexec: dựng clientset: %w", err)
	}

	// Hook đo chặng `upgrade` (1.G-4 M1). Gắn SAU `NewForConfig` có chủ ý:
	// `NewForConfig` chụp một bản sao nông của cfg, nên chỉ đường exec — thứ
	// dùng `cfg` trực tiếp qua `NewExecutorFactory` — đi qua wrapper này. Mọi
	// lời gọi REST thường của clientset không bị chạm tới, và số đo vì thế
	// không lẫn lượt nào ngoài attach.
	//
	// Nối chuỗi thay vì gán đè: gán đè sẽ âm thầm vứt wrapper của một lớp khác
	// (auth exec-plugin, proxy) nếu sau này có ai đặt — một mất mát không lỗi.
	truoc := cfg.WrapTransport
	cfg.WrapTransport = func(rt http.RoundTripper) http.RoundTripper {
		if truoc != nil {
			rt = truoc(rt)
		}
		return UpgradeTimingWrapper(rt)
	}

	return cfg, cs, nil
}
