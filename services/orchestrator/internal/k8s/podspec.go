// Package k8s dựng spec Pod sandbox và bọc các thao tác Pod trên K8s API.
//
// ĐÂY LÀ SSOT CỦA POD SPEC (phase-1 D8). Không có YAML tĩnh nào sinh ra pod
// sandbox: orchestrator phải tính tên/label/image động nên một file YAML chỉ có
// thể là bản sao đi sau. `infra/k8s/pod-template-sandbox.yaml` nếu có ngày nào
// tồn tại thì chỉ để test ValidatingAdmissionPolicy bằng tay.
package k8s

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/validation"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// Label trên mọi pod sandbox.
//
// LabelApp là thứ reaper tầng 2 (B7) dùng để liệt kê pod mồ côi: "pod mang
// app=sandbox mà không có hash pod:{name}". Đổi giá trị này mà quên reaper thì
// sweep không thấy pod nào và quota rò trong im lặng.
const (
	LabelApp      = "app"
	LabelAppValue = "sandbox"

	LabelManagedBy      = "app.kubernetes.io/managed-by"
	LabelManagedByValue = "dlp-orchestrator"

	// ContainerName cố định để `pods/exec` của gateway (G4) không phải đoán —
	// exec vào pod nhiều container mà không nêu tên sẽ trúng container đầu tiên
	// theo thứ tự spec, một hợp đồng ngầm không ai gác.
	ContainerName = "sandbox"
)

// SelectorSandbox là label selector liệt kê mọi pod sandbox do orchestrator tạo.
const SelectorSandbox = LabelApp + "=" + LabelAppValue

// PodConfig là phần cấu hình của pod spec đến từ env — không hardcode trong
// builder để lab và prod dùng chung một đường code.
type PodConfig struct {
	Namespace string
	// Image của sandbox. Ở giai đoạn này mặc định là `pause`: 1.E chưa đẩy
	// images/sandbox-base lên ghcr, và pool + VAP + quota đo được đầy đủ mà
	// không cần image thật.
	Image string
	// RuntimeClassName BẮT BUỘC khớp RuntimeClass Sysbox đã cài trên cluster.
	// Thiếu hoặc sai ⇒ VAP validation #1 từ chối pod ngay ở admission.
	RuntimeClassName string
}

func (c PodConfig) validate() error {
	if c.Namespace == "" {
		return fmt.Errorf("k8s: PodConfig.Namespace rỗng")
	}
	if c.Image == "" {
		return fmt.Errorf("k8s: PodConfig.Image rỗng")
	}
	if c.RuntimeClassName == "" {
		// Để rỗng KHÔNG phải "dùng runtime mặc định" — nó là pod chạy runc
		// thường, tức mất trọn cô lập user-namespace của Sysbox. VAP sẽ chặn,
		// nhưng chặn ở đây cho thông báo hiểu được thay vì một CEL message.
		return fmt.Errorf("k8s: PodConfig.RuntimeClassName rỗng — pod sẽ chạy runc thường, mất cô lập Sysbox")
	}
	return nil
}

// BuildSandboxPod dựng spec pod sandbox thoả ĐỦ 8 validation CEL của
// ValidatingAdmissionPolicy `*-sandbox-isolation`
// (infra/helm/platform/templates/sandbox-admissionpolicy.yaml).
//
// VÌ SAO KHÔNG NHẬN sessionID: pod KHÔNG mang label session. Ánh xạ pod→session
// sống đúng một chỗ là hash `pod:{name}` trong Redis. Gắn thêm nhãn ở đây là tạo
// nguồn thứ hai trả lời "pod này của session nào" — chính thứ plan.md §4
// (no-derived-fields) cấm, và là lý do `sessions_audit` cũng không được có cột
// đó. Pod ấm trong pool còn chưa có session nào để mà gắn.
//
// VÌ SAO KHÔNG ĐẶT `resources`: LimitRange của namespace ép defaultRequest
// 500m/512Mi và default limit 1/1Gi. Toàn bộ số học quota của D16 ("trần hiệu
// lực = 4 pod") dựa trên hai con số đó. Tự khai resources ở đây là âm thầm đổi
// trần đồng thời mà không ai sửa D16.
func BuildSandboxPod(name string, cfg PodConfig) (*corev1.Pod, error) {
	if err := validatePodName(name); err != nil {
		return nil, err
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}

	falsePtr := func() *bool { b := false; return &b }

	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: cfg.Namespace,
			Labels: map[string]string{
				LabelApp:       LabelAppValue,
				LabelManagedBy: LabelManagedByValue,
			},
		},
		Spec: corev1.PodSpec{
			// CEL #1 — thiếu field này là pod chạy runc thường.
			RuntimeClassName: &cfg.RuntimeClassName,
			// CEL #2 — bật Linux user-namespace. `false` nghĩa là KHÔNG dùng
			// user-namespace của host, tức pod có namespace riêng.
			HostUsers: falsePtr(),
			// CEL #3, #4, #5 — để mặc định false. Đặt tường minh để `kubectl get
			// pod -o yaml` đọc ra ý định, không phải sự vắng mặt.
			HostNetwork: false,
			HostPID:     false,
			HostIPC:     false,

			// Pod sandbox KHÔNG được cầm token ServiceAccount. Không nằm trong
			// CEL nào — đây là khoảng trống mà VAP không gác: một token mặc
			// định trong /var/run/secrets cho sinh viên gọi thẳng apiserver.
			AutomountServiceAccountToken: falsePtr(),
			// Tắt biến môi trường tự sinh về mọi Service trong namespace: nó rò
			// topology nội bộ vào shell của sinh viên mà chẳng ai dùng.
			EnableServiceLinks: falsePtr(),

			// Never chứ không Always: container chết là phiên đó hỏng thật. Tự
			// restart sẽ dựng lại một shell TRỐNG dưới cùng tên pod — tmux mất,
			// bài làm mất, mà không tín hiệu nào cho FE biết. Reaper dọn.
			RestartPolicy: corev1.RestartPolicyNever,

			SecurityContext: &corev1.PodSecurityContext{
				SeccompProfile: &corev1.SeccompProfile{
					Type: corev1.SeccompProfileTypeRuntimeDefault,
				},
				// KHÔNG đặt RunAsNonRoot: Sysbox cấp root TRONG user-namespace,
				// và dockerd (1.E, INCLUDE_DOCKER=1) cần root đó. Ép non-root ở
				// đây là làm AC "DinD offline" đỏ theo kiểu khó chẩn đoán.
			},

			Containers: []corev1.Container{{
				Name:            ContainerName,
				Image:           cfg.Image,
				ImagePullPolicy: corev1.PullIfNotPresent,
				SecurityContext: &corev1.SecurityContext{
					// CEL #6 — tường minh false.
					Privileged:               falsePtr(),
					AllowPrivilegeEscalation: falsePtr(),
					Capabilities: &corev1.Capabilities{
						Drop: []corev1.Capability{"ALL"},
					},
					// PHÒNG THỦ CHIỀU SÂU, KHÔNG PHẢI CƠ CHẾ ĐANG CÓ HIỆU LỰC
					// (phase-1 D-17′): đo trên pod thật cho thấy Sysbox BỎ QUA
					// drop ALL ở runtime — CapEff = CapBnd = 000001ffffffffff,
					// đủ 41 cap. Giữ ba field này vì nếu một ngày
					// runtimeClassName rơi mất thì pod chạy runc thường và lúc
					// đó chúng mới là thứ duy nhất còn cô lập. Đừng viết AC
					// "runtime có drop ALL" — đó là tautology.
				},
				// Volumes/VolumeMounts để trống: CEL #8 cấm hostPath, và pod
				// sandbox ở P1 chưa mount gì. Dotfiles (1.E E8) sẽ là volume
				// KHÔNG-hostPath khi tới lượt nó.
			}},
			// CEL #7 — không initContainer nào. Để nil thay vì slice rỗng:
			// `!has(object.spec.initContainers)` là nhánh rẻ nhất của CEL.
			InitContainers: nil,
			// CEL #8 — không volume nào, nên chắc chắn không hostPath.
			Volumes: nil,
		},
	}, nil
}

// validatePodName ép tên qua CẢ HAI cổng, vì tên pod sống ở hai thế giới:
//   - Kubernetes: phải là RFC1123 label (thường, chữ-số-gạch ngang).
//   - Redis: `pod:{name}` là một key, và rediskeys chặn ký tự bẻ được namespace.
//
// Kiểm một cổng thôi là đủ để lọt: "Pod_1" hợp lệ với rediskeys nhưng apiserver
// từ chối; "a.b" hợp lệ với DNS subdomain nhưng không phải label.
func validatePodName(name string) error {
	if errs := validation.IsDNS1123Label(name); len(errs) > 0 {
		return fmt.Errorf("k8s: tên pod %q không hợp lệ: %v", name, errs)
	}
	if err := rediskeys.ValidateID(name); err != nil {
		return fmt.Errorf("k8s: tên pod không dùng được làm Redis key: %w", err)
	}
	return nil
}

// PodNamePrefix mở đầu mọi tên pod sandbox. Cố định để reaper/ops lọc nhanh
// bằng mắt; label mới là thứ dùng để query.
const PodNamePrefix = "sandbox-"

// NewPodName sinh tên pod ngẫu nhiên, thoả cả RFC1123 label lẫn rediskeys.
//
// 6 byte = 48 bit ngẫu nhiên. Tên pod KHÔNG phải secret (nó lộ ra trong
// `kubectl get pods` và trong hash session mà gateway đọc), nên đây là chống
// TRÙNG chứ không phải chống đoán — thứ chống đoán là sessionID.
func NewPodName() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("k8s: sinh tên pod: %w", err)
	}
	return PodNamePrefix + hex.EncodeToString(buf), nil
}
