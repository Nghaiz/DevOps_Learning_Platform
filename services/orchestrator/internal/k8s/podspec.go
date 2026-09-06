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
	"sort"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
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

	// RegistryMirror là URL mirror docker.io trong cụm (P3/3.I, mắt 1). Đi vào
	// pod qua env `DLP_REGISTRY_MIRROR`; entrypoint.sh ghi `/etc/docker/daemon.json`
	// TRƯỚC khi khởi động dockerd. RỖNG = KHÔNG thêm env, tức sandbox chạy y hệt
	// hôm nay (dockerd không có mirror) — đó là hành vi mặc định để không hồi quy.
	// Sản phẩm phụ có chủ ý: đây là env, KHÔNG phải volume, nên KHÔNG chạm CEL #8
	// của ValidatingAdmissionPolicy (chỉ cấm hostPath).
	RegistryMirror string

	// Profile chọn resources CÓ TÊN cho pod (P7 7.C — ví dụ "k8s" cho lab
	// Kubernetes-trong-pod, cần nhiều RAM hơn LimitRange mặc định).
	//
	// nil = HÀNH VI HÔM NAY: container KHÔNG khai resources, LimitRange của
	// namespace là nơi DUY NHẤT quyết định requests/limits — xem chú thích ở
	// BuildSandboxPod. Khác nil ⇒ container mang Requests/Limits TƯỜNG MINH
	// theo đúng bốn số của profile, và env của profile được NỐI vào SAU
	// DLP_REGISTRY_MIRROR (không thay thế nó).
	Profile *SandboxProfile
}

// SandboxProfile là một bộ resources + env TƯỜNG MINH cho một profile sandbox
// có tên (P7 7.C). Server phân giải TÊN → giá trị này từ `SANDBOX_PROFILES`
// (xem internal/config) — package k8s chỉ biết cầm giá trị đã phân giải, không
// biết gì về cơ chế đặt tên profile.
type SandboxProfile struct {
	RequestsCPU    resource.Quantity
	RequestsMemory resource.Quantity
	LimitsCPU      resource.Quantity
	LimitsMemory   resource.Quantity

	// Env NỐI VÀO SAU env của RegistryMirror trong container sandbox — không
	// thay thế danh sách đó. Duyệt theo thứ tự KEY đã sort: map Go không có thứ
	// tự lặp ổn định, và một pod spec đổi thứ tự env giữa hai lần build cùng
	// input là một diff giả trong `kubectl diff` / GitOps.
	Env map[string]string
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
// VÌ SAO KHÔNG ĐẶT `resources` KHI Profile == nil: LimitRange của namespace ép
// defaultRequest 250m/256Mi và default limit 2/1Gi. Toàn bộ số học quota của
// D16 ("trần hiệu lực = N pod") dựa trên hai con số đó. Tự khai resources ở đây
// cho MỌI pod là âm thầm đổi trần đồng thời mà không ai sửa D16.
//
// P7 7.C mở đúng MỘT lối thoát có chủ ý, không phải xoá bỏ luật trên: một pod
// mang `cfg.Profile != nil` khai resources TƯỜNG MINH theo đúng bốn số của
// profile đó — LimitRange không còn là nơi quyết định cho RIÊNG pod này, và
// trần đồng thời của profile đó được tính lại RIÊNG (xem values.yaml, D16 vẫn
// đúng cho profile mặc định). `cfg.Profile == nil` (đường mặc định) giữ nguyên
// hành vi hôm nay byte-for-byte — xem TestPodSpecProfileNilByteIdenticalToDefault.
func BuildSandboxPod(name string, cfg PodConfig) (*corev1.Pod, error) {
	if err := validatePodName(name); err != nil {
		return nil, err
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}

	falsePtr := func() *bool { b := false; return &b }

	// Env của container sandbox. Xây trước để nhánh RegistryMirror chỉ THÊM khi
	// có giá trị — RỖNG ⇒ slice rỗng ⇒ pod không mang env nào, tức hành vi cũ.
	// Đây là điểm DUY NHẤT đọc RegistryMirror; không có nguồn thứ hai.
	var sandboxEnv []corev1.EnvVar
	if cfg.RegistryMirror != "" {
		sandboxEnv = append(sandboxEnv, corev1.EnvVar{
			Name:  "DLP_REGISTRY_MIRROR",
			Value: cfg.RegistryMirror,
		})
	}
	// Env của profile (nếu có) NỐI VÀO SAU — không thay thế DLP_REGISTRY_MIRROR.
	// Sort key: map Go lặp KHÔNG có thứ tự ổn định, và một pod spec đổi thứ tự
	// env giữa hai lần build cùng input là một diff giả.
	if cfg.Profile != nil && len(cfg.Profile.Env) > 0 {
		keys := make([]string, 0, len(cfg.Profile.Env))
		for k := range cfg.Profile.Env {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			sandboxEnv = append(sandboxEnv, corev1.EnvVar{Name: k, Value: cfg.Profile.Env[k]})
		}
	}

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
				// RỖNG khi không cấu hình mirror — corev1 serialize `env: null`,
				// không đổi hành vi so với bản chưa có field này.
				Env: sandboxEnv,
				// Profile == nil ⇒ ResourceRequirements{} (zero value, `omitempty`
				// trên cả Requests lẫn Limits) — marshal ra JSON giống hệt việc
				// không có field Resources nào cả. Xem profileResources.
				Resources: profileResources(cfg.Profile),
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
			// Trỏ các host Docker Hub về loopback KHI VÀ CHỈ KHI cụm có mirror.
			// Xem hostAliasesDockerHub — đây là điểm DUY NHẤT đọc quyết định đó.
			HostAliases: hostAliasesDockerHub(cfg.RegistryMirror),

			// CEL #7 — không initContainer nào. Để nil thay vì slice rỗng:
			// `!has(object.spec.initContainers)` là nhánh rẻ nhất của CEL.
			InitContainers: nil,
			// CEL #8 — không volume nào, nên chắc chắn không hostPath.
			Volumes: nil,
		},
	}, nil
}

// hostDockerHub là các host của Docker Hub mà pod sandbox KHÔNG BAO GIỜ được
// phép chạm tới trực tiếp: egress ra internet đã bị netpol chặn (luật 10), và
// mọi thứ docker.io mà sandbox thật sự cần đều đi qua registry-mirror trong cụm.
//
// `production.cloudflare.docker.com` là CDN blob của Hub — nó nằm đây vì cùng
// một lý do, không phải vì đã quan sát thấy nó treo.
var hostDockerHub = []string{
	"registry-1.docker.io",
	"index.docker.io",
	"auth.docker.io",
	"production.cloudflare.docker.com",
}

// hostAliasesDockerHub trỏ các host Docker Hub về loopback trong pod sandbox.
//
// ── VÌ SAO CẦN, VÀ VÌ SAO KHÔNG PHẢI "CHẶN CHO CHẮC" ────────────────────────
// Đo được 2026-09-06 trên cụm lab (P12 §5b, và tái hiện lại lần này với
// `dockerd --debug`): `docker pull nginx:alpine` trong sandbox đi đúng ba nhịp
//
//  1. HEAD  <mirror>/v2/library/nginx/manifests/alpine?ns=docker.io   → 200
//  2. GET   <mirror>/v2/library/nginx/referrers/<digest>?ns=docker.io → 404
//  3. GET   https://registry-1.docker.io/v2/library/nginx/referrers/… → TREO
//
// `registry:2` (và cả `registry:3` — đã thử, cùng 404 với body `404 page not
// found`) KHÔNG phục vụ OCI referrers API ở chế độ pull-through. Nhịp 2 trả 404
// nên containerd làm đúng thứ nó được thiết kế để làm: **fallback sang upstream**.
// Upstream thì netpol DROP IM LẶNG — không RST, không ICMP — nên socket nằm
// SYN_SENT tới hết timeout của client. Mọi layer đã tải xong từ nhịp 1 mà lệnh
// vẫn treo rồi thoát 125.
//
// Hệ quả đã đo: 16/23 worker hỏng đúng bước này ở lượt tải P12, cả ba lượt retry
// đều treo. Và cái nó ĐỂ LẠI mới nguy: tiến trình treo sống lâu hơn cả pod, kéo
// theo `FailedKillPod` → sysbox-fs wedge → node mất khả năng tạo pod trong khi
// `/api/health` vẫn 200.
//
// ⛔ ĐÂY KHÔNG PHẢI THÊM MỘT LỚP CHẶN. Egress đã bị chặn rồi; thứ duy nhất thay
// đổi là **cách nó hỏng**: TREO 45s+ → TỪ CHỐI TỨC THÌ (không có gì nghe
// 127.0.0.1:443 trong netns của pod ⇒ RST ngay). containerd ghi "error fetching
// referrers" rồi ĐI TIẾP — referrers là metadata tuỳ chọn, không có nó thì pull
// vẫn đúng. Đây chính là khuyến nghị "trả RST thay vì DROP" của report P12 §10,
// đặt vào chỗ ta sở hữu thay vì đi sửa Calico.
//
// ⚠ PHẠM VI, nói trước để không ai đọc quá: chỉ bốn host của Docker Hub. Một
// `docker pull ghcr.io/...` trong sandbox VẪN treo y như cũ, vì mirror chỉ trong
// suốt với docker.io ([[dockerd-mirror-only-docker-hub]]) và không có tên nào để
// alias. Đóng CẢ LỚP đó cần luật REJECT cho egress ngoài cụm — việc của netpol/
// CNI, không phải của pod spec.
//
// ⚠ Cạnh đã biết: containerd thử `127.0.0.1:80` (đo được 2026-09-06, không phải
// suy đoán — nó hạ scheme khi host phân giải về loopback), nên nếu người học tự
// `docker run -p 80:80 …` thì lượt referrers chạm container của chính họ thay vì
// bị từ chối. Container ấy trả 404 cho `/v2/…/referrers/…`, containerd ghi
// "not found" rồi đi tiếp — vẫn là hỏng NHANH, hành vi mong muốn không đổi.
//
// RỖNG ⇒ nil: cụm không có mirror thì sandbox chạy y hệt hôm nay.
func hostAliasesDockerHub(mirror string) []corev1.HostAlias {
	if mirror == "" {
		return nil
	}
	return []corev1.HostAlias{{
		IP:        "127.0.0.1",
		Hostnames: append([]string(nil), hostDockerHub...),
	}}
}

// profileResources trả ResourceRequirements cho container sandbox.
//
// nil ⇒ zero-value ResourceRequirements{}. corev1.ResourceRequirements khai
// `Requests`/`Limits` với tag json `omitempty`, và giá trị zero của cả hai là
// map nil — nên marshal ra JSON của zero-value struct này TUYỆT ĐỐI không khác
// gì việc field `Resources` chưa từng tồn tại trong container literal (đây
// chính là cơ sở của TestPodSpecProfileNilByteIdenticalToDefault).
func profileResources(p *SandboxProfile) corev1.ResourceRequirements {
	if p == nil {
		return corev1.ResourceRequirements{}
	}
	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    p.RequestsCPU,
			corev1.ResourceMemory: p.RequestsMemory,
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    p.LimitsCPU,
			corev1.ResourceMemory: p.LimitsMemory,
		},
	}
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
