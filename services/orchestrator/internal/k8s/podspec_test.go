package k8s

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func testConfig() PodConfig {
	return PodConfig{
		Namespace:        "dlp-sandbox",
		Image:            "registry.k8s.io/pause:3.10",
		RuntimeClassName: "sysbox-runc",
	}
}

func mustBuild(t *testing.T) *corev1.Pod {
	t.Helper()
	name, err := NewPodName()
	if err != nil {
		t.Fatalf("NewPodName: %v", err)
	}
	pod, err := BuildSandboxPod(name, testConfig())
	if err != nil {
		t.Fatalf("BuildSandboxPod: %v", err)
	}
	return pod
}

// TestPodSpecSatisfiesAdmissionPolicy soi lại ĐỦ 8 validation CEL của
// ValidatingAdmissionPolicy `*-sandbox-isolation` bằng Go.
//
// VÌ SAO CÓ TEST NÀY THAY VÌ TIN VÀO CLUSTER: VAP từ chối ở admission, nên một
// field thiếu chỉ lộ ra khi có cluster thật với chart đã cài — tức là ở CI thì
// không bao giờ, và ở lab thì lộ dưới dạng "warm-pool không bao giờ đầy" kèm
// một message CEL trong log. Đây là bản sao CÓ CHỦ Ý của một quy tắc sống nơi
// khác; nó phải được sửa cùng lúc với YAML, và tên test nêu rõ file đó.
//
// Nguồn: infra/helm/platform/templates/sandbox-admissionpolicy.yaml
func TestPodSpecSatisfiesAdmissionPolicy(t *testing.T) {
	pod := mustBuild(t)
	spec := pod.Spec

	t.Run("CEL#1 has(runtimeClassName) && == sysbox-runc", func(t *testing.T) {
		if spec.RuntimeClassName == nil {
			t.Fatal("runtimeClassName vắng — pod sẽ chạy runc thường, mất cô lập Sysbox")
		}
		if *spec.RuntimeClassName != testConfig().RuntimeClassName {
			t.Fatalf("runtimeClassName = %q, cần %q", *spec.RuntimeClassName, testConfig().RuntimeClassName)
		}
	})

	t.Run("CEL#2 has(hostUsers) && hostUsers == false", func(t *testing.T) {
		if spec.HostUsers == nil {
			t.Fatal("hostUsers vắng — VAP đòi field này CÓ MẶT và bằng false, vắng cũng bị từ chối")
		}
		if *spec.HostUsers {
			t.Fatal("hostUsers = true — root trong pod ánh xạ thẳng ra root của node")
		}
	})

	t.Run("CEL#3 hostNetwork != true", func(t *testing.T) {
		if spec.HostNetwork {
			t.Fatal("hostNetwork = true")
		}
	})

	t.Run("CEL#4 hostPID != true", func(t *testing.T) {
		if spec.HostPID {
			t.Fatal("hostPID = true")
		}
	})

	t.Run("CEL#5 hostIPC != true", func(t *testing.T) {
		if spec.HostIPC {
			t.Fatal("hostIPC = true")
		}
	})

	t.Run("CEL#6 containers.all(privileged != true)", func(t *testing.T) {
		if len(spec.Containers) == 0 {
			t.Fatal("không container nào — pod không hợp lệ")
		}
		for _, c := range spec.Containers {
			if c.SecurityContext != nil && c.SecurityContext.Privileged != nil && *c.SecurityContext.Privileged {
				t.Fatalf("container %q privileged = true", c.Name)
			}
		}
	})

	t.Run("CEL#7 initContainers.all(privileged != true)", func(t *testing.T) {
		for _, c := range spec.InitContainers {
			if c.SecurityContext != nil && c.SecurityContext.Privileged != nil && *c.SecurityContext.Privileged {
				t.Fatalf("initContainer %q privileged = true", c.Name)
			}
		}
	})

	t.Run("CEL#8 volumes.all(!has(hostPath))", func(t *testing.T) {
		for _, v := range spec.Volumes {
			if v.HostPath != nil {
				t.Fatalf("volume %q dùng hostPath %q — đường thoát ra filesystem node", v.Name, v.HostPath.Path)
			}
		}
	})
}

// TestPodSpecHardeningBeyondVAP gác các field mà KHÔNG CEL nào gác.
//
// Chúng là khoảng trống thật của VAP: policy chỉ nói về host-namespace và
// privileged, không nói gì về token ServiceAccount hay biến môi trường rò
// topology. Không có test này thì xoá nhầm một dòng trong builder là mất phòng
// thủ mà mọi cổng vẫn xanh.
func TestPodSpecHardeningBeyondVAP(t *testing.T) {
	spec := mustBuild(t).Spec

	if spec.AutomountServiceAccountToken == nil || *spec.AutomountServiceAccountToken {
		t.Error("automountServiceAccountToken phải là false — không thì sinh viên có token gọi thẳng apiserver")
	}
	if spec.EnableServiceLinks == nil || *spec.EnableServiceLinks {
		t.Error("enableServiceLinks phải là false — không thì env của pod rò danh sách Service nội bộ")
	}
	if spec.RestartPolicy != corev1.RestartPolicyNever {
		t.Errorf("restartPolicy = %q, cần Never — restart âm thầm dựng lại shell trống, mất tmux", spec.RestartPolicy)
	}
	if spec.SecurityContext == nil || spec.SecurityContext.SeccompProfile == nil ||
		spec.SecurityContext.SeccompProfile.Type != corev1.SeccompProfileTypeRuntimeDefault {
		t.Error("seccompProfile phải là RuntimeDefault")
	}

	c := spec.Containers[0]
	if c.SecurityContext.AllowPrivilegeEscalation == nil || *c.SecurityContext.AllowPrivilegeEscalation {
		t.Error("allowPrivilegeEscalation phải là false")
	}
	if c.SecurityContext.Capabilities == nil || len(c.SecurityContext.Capabilities.Drop) != 1 ||
		c.SecurityContext.Capabilities.Drop[0] != "ALL" {
		t.Error("capabilities.drop phải là [ALL]")
	}
	if c.Name != ContainerName {
		t.Errorf("tên container = %q, cần %q — gateway exec theo tên này", c.Name, ContainerName)
	}
}

// TestPodSpecKhongKhaiResources bảo vệ số học quota của D16.
//
// LimitRange ép defaultRequest 500m/512Mi; toàn bộ "trần hiệu lực = 4 pod" dựa
// vào đó. Một ngày nào đó ai đó thêm `resources` vào builder "cho tường minh"
// sẽ đổi trần đồng thời của cả nền tảng mà không ai sửa D16 — và triệu chứng là
// pod thứ N bị quota chặn, không phải một lỗi trỏ về commit đó.
func TestPodSpecKhongKhaiResources(t *testing.T) {
	c := mustBuild(t).Spec.Containers[0]
	if len(c.Resources.Requests) != 0 || len(c.Resources.Limits) != 0 {
		t.Fatalf("container khai resources (%v / %v) — LimitRange phải là nơi duy nhất đặt số này (D16)",
			c.Resources.Requests, c.Resources.Limits)
	}
}

// TestRegistryMirrorEnv — P3/3.I mắt 1.
//
// Hai vế, và vế RỖNG mới là vế chống hồi quy: RegistryMirror rỗng ⇒ container
// KHÔNG mang env DLP_REGISTRY_MIRROR (sandbox chạy y hệt trước 3.I). Có giá trị
// ⇒ đúng một env với đúng giá trị đó, không hơn.
func TestRegistryMirrorEnv(t *testing.T) {
	t.Run("rỗng thì không có env", func(t *testing.T) {
		cfg := testConfig() // RegistryMirror để zero-value = ""
		name, _ := NewPodName()
		pod, err := BuildSandboxPod(name, cfg)
		if err != nil {
			t.Fatalf("BuildSandboxPod: %v", err)
		}
		for _, e := range pod.Spec.Containers[0].Env {
			if e.Name == "DLP_REGISTRY_MIRROR" {
				t.Fatalf("RegistryMirror rỗng nhưng container vẫn mang env %q=%q — đó là hồi quy cho mọi cụm chưa bật mirror", e.Name, e.Value)
			}
		}
	})

	t.Run("có giá trị thì đúng một env", func(t *testing.T) {
		cfg := testConfig()
		want := "http://platform-registry-mirror.dlp-registry.svc.cluster.local:5000"
		cfg.RegistryMirror = want
		name, _ := NewPodName()
		pod, err := BuildSandboxPod(name, cfg)
		if err != nil {
			t.Fatalf("BuildSandboxPod: %v", err)
		}
		found := 0
		for _, e := range pod.Spec.Containers[0].Env {
			if e.Name == "DLP_REGISTRY_MIRROR" {
				found++
				if e.Value != want {
					t.Fatalf("env DLP_REGISTRY_MIRROR = %q, muốn %q", e.Value, want)
				}
			}
		}
		if found != 1 {
			t.Fatalf("env DLP_REGISTRY_MIRROR xuất hiện %d lần, muốn đúng 1", found)
		}
	})
}

// TestPodKhongMangNhanSession — no-derived-fields (plan.md §4).
//
// Ánh xạ pod→session chỉ sống ở hash `pod:{name}`. Một label session trên pod là
// nguồn thứ hai trả lời cùng câu hỏi, và hai nguồn thì sớm muộn lệch nhau.
func TestPodKhongMangNhanSession(t *testing.T) {
	for k, v := range mustBuild(t).Labels {
		if strings.Contains(strings.ToLower(k), "session") {
			t.Fatalf("pod mang label %q=%q — ánh xạ pod→session chỉ được sống ở hash pod:{name}", k, v)
		}
	}
}

func TestBuildSandboxPodTuChoiDauVaoHong(t *testing.T) {
	valid := testConfig()

	tests := []struct {
		name    string
		podName string
		cfg     PodConfig
		wantErr string
	}{
		{
			name:    "tên hoa — hợp lệ với rediskeys nhưng apiserver từ chối",
			podName: "Sandbox-01",
			cfg:     valid,
			wantErr: "không hợp lệ",
		},
		{
			name:    "tên có gạch dưới — RFC1123 label không cho",
			podName: "sandbox_01",
			cfg:     valid,
			wantErr: "không hợp lệ",
		},
		{
			name:    "tên có dấu chấm — DNS subdomain hợp lệ, DNS label thì không",
			podName: "sandbox.01",
			cfg:     valid,
			wantErr: "không hợp lệ",
		},
		{
			name:    "tên rỗng",
			podName: "",
			cfg:     valid,
			wantErr: "không hợp lệ",
		},
		{
			name:    "runtimeClassName rỗng — mất cô lập Sysbox trong im lặng",
			podName: "sandbox-abc123",
			cfg:     PodConfig{Namespace: "dlp-sandbox", Image: "x", RuntimeClassName: ""},
			wantErr: "RuntimeClassName rỗng",
		},
		{
			name:    "image rỗng",
			podName: "sandbox-abc123",
			cfg:     PodConfig{Namespace: "dlp-sandbox", Image: "", RuntimeClassName: "sysbox-runc"},
			wantErr: "Image rỗng",
		},
		{
			name:    "namespace rỗng",
			podName: "sandbox-abc123",
			cfg:     PodConfig{Namespace: "", Image: "x", RuntimeClassName: "sysbox-runc"},
			wantErr: "Namespace rỗng",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := BuildSandboxPod(tt.podName, tt.cfg)
			if err == nil {
				t.Fatalf("cần lỗi chứa %q, nhận nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("lỗi = %q, cần chứa %q", err, tt.wantErr)
			}
		})
	}
}

// TestNewPodNameDungDuocOCaHaiThe GioI — tên sinh ra phải qua CẢ hai cổng.
func TestNewPodNameDungDuocOCaHaiTheGioi(t *testing.T) {
	seen := make(map[string]bool, 256)
	for i := 0; i < 256; i++ {
		name, err := NewPodName()
		if err != nil {
			t.Fatalf("NewPodName: %v", err)
		}
		if err := validatePodName(name); err != nil {
			t.Fatalf("tên sinh ra không qua chính cổng của mình: %v", err)
		}
		if !strings.HasPrefix(name, PodNamePrefix) {
			t.Fatalf("tên %q thiếu tiền tố %q", name, PodNamePrefix)
		}
		if seen[name] {
			t.Fatalf("trùng tên %q sau %d lần — entropy hỏng", name, i)
		}
		seen[name] = true
	}
}

func TestIsReady(t *testing.T) {
	ready := func(phase corev1.PodPhase, cond *corev1.ConditionStatus) *corev1.Pod {
		p := &corev1.Pod{}
		p.Status.Phase = phase
		if cond != nil {
			p.Status.Conditions = []corev1.PodCondition{{Type: corev1.PodReady, Status: *cond}}
		}
		return p
	}
	condTrue, condFalse := corev1.ConditionTrue, corev1.ConditionFalse

	if IsReady(nil) {
		t.Error("nil pod không thể ready")
	}
	if IsReady(ready(corev1.PodRunning, nil)) {
		t.Error("Running mà CHƯA có condition Ready thì chưa ready — đẩy nó vào pool là bán một pod chưa exec được")
	}
	if IsReady(ready(corev1.PodRunning, &condFalse)) {
		t.Error("Ready=False không phải ready")
	}
	if IsReady(ready(corev1.PodPending, &condTrue)) {
		t.Error("Pending không thể ready dù condition nói gì")
	}
	if !IsReady(ready(corev1.PodRunning, &condTrue)) {
		t.Error("Running + Ready=True phải là ready")
	}
}

// TestIsDoomedBatDuocPodDangBiXoa — pod đang Terminating giữ nguyên phase
// Running suốt grace period, nên một phép kiểm chỉ đọc phase sẽ nói "còn sống"
// ở đúng cửa sổ pod chắc chắn chết.
func TestIsDoomedBatDuocPodDangBiXoa(t *testing.T) {
	running := &corev1.Pod{Status: corev1.PodStatus{Phase: corev1.PodRunning}}
	if IsDoomed(running) {
		t.Error("pod Running bình thường không phải doomed")
	}

	now := metav1.Now()
	terminating := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{DeletionTimestamp: &now},
		Status:     corev1.PodStatus{Phase: corev1.PodRunning},
	}
	if IsTerminal(terminating) {
		t.Error("tiền đề của test hỏng: IsTerminal đọc phase, và phase vẫn là Running")
	}
	if !IsDoomed(terminating) {
		t.Error("pod có deletionTimestamp PHẢI là doomed — đây là ca kubectl delete/evict")
	}

	if !IsDoomed(&corev1.Pod{Status: corev1.PodStatus{Phase: corev1.PodFailed}}) {
		t.Error("pod Failed phải là doomed")
	}
	if IsDoomed(nil) {
		t.Error("nil không phải doomed (giữ khuôn với IsTerminal)")
	}
}

func TestIsTerminal(t *testing.T) {
	phase := func(p corev1.PodPhase) *corev1.Pod {
		pod := &corev1.Pod{}
		pod.Status.Phase = p
		return pod
	}
	if IsTerminal(phase(corev1.PodRunning)) || IsTerminal(phase(corev1.PodPending)) {
		t.Error("Running/Pending chưa terminal")
	}
	if !IsTerminal(phase(corev1.PodFailed)) || !IsTerminal(phase(corev1.PodSucceeded)) {
		t.Error("Failed/Succeeded phải là terminal — không thì vòng chờ-ready ngồi hết timeout giữ một khe quota")
	}
}
