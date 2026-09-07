package lifecycle

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// fakeQuota thay cho apiserver. Interface QuotaAccess hẹp đúng một phương thức
// nên fake này là toàn bộ bề mặt — không mượn client-go/fake, không dựng cụm.
type fakeQuota struct {
	budget *k8s.NamespaceBudget
	err    error
	calls  int
}

func (f *fakeQuota) Budget(context.Context) (*k8s.NamespaceBudget, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return f.budget, nil
}

// labProfiles là ĐÚNG ba profile có tên trong `values.yaml § sandbox.profiles`.
func labProfiles(t *testing.T) map[string]*k8s.SandboxProfile {
	t.Helper()
	mk := func(reqCPU, reqMem, limCPU, limMem string) *k8s.SandboxProfile {
		return &k8s.SandboxProfile{
			RequestsCPU:    resource.MustParse(reqCPU),
			RequestsMemory: resource.MustParse(reqMem),
			LimitsCPU:      resource.MustParse(limCPU),
			LimitsMemory:   resource.MustParse(limMem),
		}
	}
	return map[string]*k8s.SandboxProfile{
		"ide":           mk("250m", "768Mi", "2", "1Gi"),
		"k8s":           mk("500m", "1Gi", "4", "2Gi"),
		"k8s-multinode": mk("500m", "1536Mi", "4", "3Gi"),
	}
}

// budgetLucBiTuChoi tái dựng ngân sách quota ở ĐÚNG thời điểm 2026-09-07 mà
// `lessons.startSession` trả 429 (ô AC P13): `5376/5952Mi`.
//
//	còn lại: pods 7 · requests.cpu 600m · requests.memory 576Mi ·
//	         limits.cpu 6000m · limits.memory 3072Mi
//
// 576Mi KHÔNG đủ 768Mi cho một pod `ide` ⇒ trần của bài IDE lúc đó là 0.
func budgetLucBiTuChoi() *k8s.NamespaceBudget {
	return &k8s.NamespaceBudget{
		Remaining: k8s.Budget{
			corev1.ResourcePods:           7,
			corev1.ResourceRequestsCPU:    600,
			corev1.ResourceRequestsMemory: 576 << 20,
			corev1.ResourceLimitsCPU:      6000,
			corev1.ResourceLimitsMemory:   3072 << 20,
		},
		Total: k8s.Budget{
			corev1.ResourcePods:           28,
			corev1.ResourceRequestsCPU:    5850,
			corev1.ResourceRequestsMemory: 5952 << 20,
			corev1.ResourceLimitsCPU:      48000,
			corev1.ResourceLimitsMemory:   24576 << 20,
		},
		DefaultPodCost: k8s.Cost{
			corev1.ResourcePods:           1,
			corev1.ResourceRequestsCPU:    250,
			corev1.ResourceRequestsMemory: 256 << 20,
			corev1.ResourceLimitsCPU:      2000,
			corev1.ResourceLimitsMemory:   1024 << 20,
		},
	}
}

// newCapacityHarness dựng Service với một QuotaAccess giả.
//
// Không dùng newHarness: nó ghim quota = nil (mọi test cũ không quan tâm), và
// thêm tham số biến đổi vào đó sẽ bắt ~40 test hiện có truyền nil — cùng lý lẽ
// mà newHarnessWithProfiles đã dùng.
func newCapacityHarness(t *testing.T, quota k8s.QuotaAccess, profiles map[string]*k8s.SandboxProfile) *harness {
	t.Helper()
	rdb := newTestRedis(t)
	fp := &fakePool{rdb: rdb}
	pods := &fakePodDeleter{}
	met := metrics.New(prometheus.NewRegistry())
	svc, err := NewService(rdb, fp, pods, quota, nil, Config{
		Namespace:         "dlp-sandbox",
		SessionTTL:        time.Hour,
		HardCap:           2 * time.Hour,
		ExtendDefault:     5 * time.Minute,
		SandboxProfiles:   profiles,
		CapacityHardLimit: 23,
		PoolTarget:        3,
	}, slog.New(slog.NewJSONHandler(io.Discard, nil)), met)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return &harness{svc: svc, rdb: rdb, pool: fp, pods: pods, met: met}
}

// TestGetCapacityTaiDungMauThuan20260907 — Ô CHÍNH của ô AC P13.
//
// Tái dựng đúng cảnh đã ĐO: giao diện in "Đang chạy 6/20 phiên (trần cứng 23)
// → Còn 14 chỗ" ngay lúc `startSession` trả 429 cho một bài IDE. Hai bên đếm
// hai thứ khác nhau — và bên nói "còn 14" là bên sai.
//
// ⛔ ĐỐI CHỨNG DƯƠNG NẰM TRONG CHÍNH Ô NÀY. Test không chỉ khẳng định con số
// mới đúng; nó CHẠY LẠI công thức cũ (`soft − active` = `hard − poolTarget −
// claimed`) trên cùng một trạng thái và cho thấy nó ra 14. Nếu ai đó nối
// `profile_capacity` trở lại công thức cũ thì `ide` sẽ đọc 14 thay vì 0 và ô
// này ĐỎ — tức cổng đã được chứng minh là có thể đỏ, không phải một dòng trang
// trí (`green-that-proves-nothing`).
func TestGetCapacityTaiDungMauThuan20260907(t *testing.T) {
	h := newCapacityHarness(t, &fakeQuota{budget: budgetLucBiTuChoi()}, labProfiles(t))
	ctx := context.Background()

	// 6 pod đang claimed — đúng con số "Đang chạy 6" trên màn hình hôm đó.
	// (`pool:claimed` đếm POD CLAIMED, khác `used.pods` của quota, vốn còn gồm
	// pod ấm chưa ai claim — xem chú thích `active_sessions` trong proto.)
	for _, name := range []string{"p1", "p2", "p3", "p4", "p5", "p6"} {
		if err := h.rdb.RPush(ctx, rediskeys.PoolClaimed, "sandbox-"+name).Err(); err != nil {
			t.Fatalf("seed claimed: %v", err)
		}
	}

	resp, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity: %v", err)
	}
	if !resp.GetQuotaReadable() {
		t.Fatalf("QuotaReadable = false (%q) — fake quota trả thành công", resp.GetQuotaError())
	}

	// ── Vế 1: con số CŨ vẫn y nguyên, và nó vẫn ra 14. ────────────────────
	legacyRemaining := resp.GetSoftCapacity() - resp.GetActiveSessions()
	if resp.GetActiveSessions() != 6 || resp.GetSoftCapacity() != 20 {
		t.Fatalf("tiền đề hỏng: active/soft = %d/%d, cần 6/20 để tái dựng đúng cảnh cũ",
			resp.GetActiveSessions(), resp.GetSoftCapacity())
	}
	if legacyRemaining != 14 {
		t.Fatalf("công thức cũ = %d, cần 14 — không tái dựng được cảnh đã đo", legacyRemaining)
	}

	// ── Vế 2: con số MỚI, theo từng profile. ──────────────────────────────
	for _, tc := range []struct {
		profile             string
		wantFree, wantTotal int32
	}{
		// 576Mi < 768Mi ⇒ KHÔNG tạo được pod IDE nào. Đây là con số mà
		// apiserver đã thi hành bằng một 429.
		{"ide", 0, 7},
		// min(7, 600/250=2, 576/256=2, 6000/2000=3, 3072/1024=3) = 2
		{"", 2, 23},
		{"k8s", 0, 5},
		{"k8s-multinode", 0, 3},
	} {
		got, ok := resp.GetProfileCapacity()[tc.profile]
		if !ok {
			t.Errorf("profile %q vắng mặt trong profile_capacity", tc.profile)
			continue
		}
		if got.GetSlotsFree() != tc.wantFree || got.GetSlotsTotal() != tc.wantTotal {
			t.Errorf("profile %q: còn %d/%d, cần %d/%d",
				tc.profile, got.GetSlotsFree(), got.GetSlotsTotal(), tc.wantFree, tc.wantTotal)
		}
	}

	// ── Vế 3: hai vế MÂU THUẪN, và đó là cả lý do bản vá tồn tại. ─────────
	ide := resp.GetProfileCapacity()["ide"]
	if int32(legacyRemaining) == ide.GetSlotsFree() {
		t.Fatal("công thức cũ và trần-theo-profile cho CÙNG một số trên trạng thái này ⇒ " +
			"ca này không phân biệt được hai công thức, và cổng ở trên chưa chứng minh gì")
	}
}

// TestGetCapacityQuotaLoiThiNoiChuaRO — `errors-over-silent-fallbacks`.
//
// Đọc quota hỏng (403 thiếu RBAC là ca THẬT — Role sandbox không có
// `resourcequotas` cho tới bản vá này) thì response mang `quota_readable=false`
// + lý do, và `profile_capacity` RỖNG. Tuyệt đối KHÔNG rơi về `soft_capacity`
// rồi khẳng định như thật: một "còn 14 chỗ" sai tệ hơn một "chưa rõ".
//
// Và lời gọi vẫn THÀNH CÔNG: năm field đọc-Redis ở trên vẫn đúng, giết cả
// response vì một 403 là làm mất luôn "pool còn mấy pod ấm".
func TestGetCapacityQuotaLoiThiNoiChuaRO(t *testing.T) {
	for _, tc := range []struct {
		name  string
		quota k8s.QuotaAccess
	}{
		{
			"apiserver từ chối (403 thiếu RBAC resourcequotas)",
			&fakeQuota{err: errors.New(`resourcequotas is forbidden: User "system:serviceaccount:default:platform-orchestrator" cannot list resource "resourcequotas"`)},
		},
		{"orchestrator chạy ngoài cluster (quota nil)", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := newCapacityHarness(t, tc.quota, labProfiles(t))
			resp, err := h.svc.GetCapacity(context.Background(), &orchestratorv1.GetCapacityRequest{})
			if err != nil {
				t.Fatalf("GetCapacity trả lỗi cả lời gọi: %v — năm field đọc-Redis vẫn phải đi được", err)
			}
			if resp.GetQuotaReadable() {
				t.Error("QuotaReadable = true trong khi đọc quota thất bại")
			}
			if len(resp.GetProfileCapacity()) != 0 {
				t.Errorf("profile_capacity = %v, cần RỖNG — không được đoán bù", resp.GetProfileCapacity())
			}
			if resp.GetQuotaError() == "" {
				t.Error("quota_error rỗng — 'chưa rõ' phải nói được VÌ SAO, nếu không nó không truy ngược được")
			}
			// Năm field cũ vẫn phải nguyên vẹn.
			if resp.GetSoftCapacity() != 20 || resp.GetHardCapacity() != 23 {
				t.Errorf("Soft/Hard = %d/%d, cần 20/23", resp.GetSoftCapacity(), resp.GetHardCapacity())
			}
		})
	}
}

// TestGetCapacityThieuLimitRangeThiChiMatProfileMacDinh — hỏng CỤC BỘ.
//
// Không đọc được LimitRange thì chi phí pod của profile MẶC ĐỊNH là ẩn số, còn
// ba profile CÓ TÊN khai resources tường minh nên vẫn tính được. Mất một con số
// vẫn hơn mất cả bốn — nhưng con số mất phải VẮNG MẶT, không được thay bằng 0
// (khoá vắng = "chưa rõ"; 0 = "hết chỗ", hai câu khác nhau).
func TestGetCapacityThieuLimitRangeThiChiMatProfileMacDinh(t *testing.T) {
	budget := budgetLucBiTuChoi()
	budget.DefaultPodCost = nil

	h := newCapacityHarness(t, &fakeQuota{budget: budget}, labProfiles(t))
	resp, err := h.svc.GetCapacity(context.Background(), &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity: %v", err)
	}
	if !resp.GetQuotaReadable() {
		t.Fatal("QuotaReadable = false — quota vẫn đọc được, chỉ LimitRange thiếu")
	}
	if _, ok := resp.GetProfileCapacity()[""]; ok {
		t.Error(`profile "" có mặt — chi phí pod mặc định do LimitRange quyết định, ` +
			"không đọc được thì phải VẮNG MẶT chứ không được đoán")
	}
	if got, ok := resp.GetProfileCapacity()["ide"]; !ok || got.GetSlotsFree() != 0 {
		t.Errorf(`profile "ide" = %v (có mặt: %v), cần còn 0 — profile có tên không phụ thuộc LimitRange`, got, ok)
	}
}

// TestGetCapacityKhongKhaiProfileThiKhongCoKhoa — profile KHÔNG RÕ.
//
// Server chỉ trả khoá cho profile nó THỰC SỰ khai (`SANDBOX_PROFILES`), cùng
// nguyên tắc fail-closed với `Create`: một tên gõ sai không được im lặng nhận
// trần của profile mặc định. Client tra không thấy khoá ⇒ nói "chưa rõ".
func TestGetCapacityKhongKhaiProfileThiKhongCoKhoa(t *testing.T) {
	// Server chỉ khai "ide" — "k8s" và một tên bịa đều không được có mặt.
	only := map[string]*k8s.SandboxProfile{"ide": labProfiles(t)["ide"]}
	h := newCapacityHarness(t, &fakeQuota{budget: budgetLucBiTuChoi()}, only)

	resp, err := h.svc.GetCapacity(context.Background(), &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity: %v", err)
	}
	got := resp.GetProfileCapacity()
	if _, ok := got["ide"]; !ok {
		t.Error(`profile "ide" phải có mặt — server có khai nó`)
	}
	if _, ok := got[""]; !ok {
		t.Error(`profile "" (mặc định) phải có mặt — nó luôn tồn tại`)
	}
	for _, name := range []string{"k8s", "k8s-multinode", "khong-ton-tai"} {
		if _, ok := got[name]; ok {
			t.Errorf("profile %q có mặt trong khi SANDBOX_PROFILES không khai nó", name)
		}
	}
}

// TestGetCapacityDocQuotaMoiLanGoi — "TÍNH LÚC ĐỌC", không cache.
//
// Cache một trần suy-ra-được là đúng thứ `no-derived-fields` cấm, chỉ đổi chỗ
// lưu từ env sang RAM. Hai lời gọi ⇒ hai lượt đọc, và trần đổi theo quota.
func TestGetCapacityDocQuotaMoiLanGoi(t *testing.T) {
	fq := &fakeQuota{budget: budgetLucBiTuChoi()}
	h := newCapacityHarness(t, fq, labProfiles(t))
	ctx := context.Background()

	if _, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{}); err != nil {
		t.Fatalf("GetCapacity #1: %v", err)
	}

	// Một phiên IDE kết thúc ⇒ quota nhả 768Mi ⇒ bài IDE lại vào được.
	freed := budgetLucBiTuChoi()
	freed.Remaining[corev1.ResourceRequestsMemory] = (576 + 768) << 20
	fq.budget = freed

	resp, err := h.svc.GetCapacity(ctx, &orchestratorv1.GetCapacityRequest{})
	if err != nil {
		t.Fatalf("GetCapacity #2: %v", err)
	}
	if fq.calls != 2 {
		t.Errorf("Budget() gọi %d lần cho 2 lượt GetCapacity — đang cache", fq.calls)
	}
	if got := resp.GetProfileCapacity()["ide"].GetSlotsFree(); got != 1 {
		t.Errorf(`sau khi nhả 768Mi, "ide" còn %d chỗ, cần 1 — trần không đọc lại theo quota`, got)
	}
}
