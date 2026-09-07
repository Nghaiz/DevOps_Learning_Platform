package k8s

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

// ── Số THẬT của cụm, đọc 2026-09-08 ──────────────────────────────────────────
//
// `kubectl get resourcequota -n dlp-sandbox -o yaml` trên VM lab:
//
//	hard: pods 28 · requests.cpu 5850m · requests.memory 5952Mi ·
//	      limits.cpu 48 · limits.memory 24Gi
//	used: pods  3 · requests.cpu  750m · requests.memory  768Mi ·
//	      limits.cpu  6 · limits.memory  3Gi
//
// Dùng số thật chứ không số tròn cho đẹp: `5952 ÷ 256 = 23.25` là chỗ phép chia
// nguyên thật sự cắt, và một bộ số tròn sẽ giấu mất điều đó.
func clusterQuota20260908() corev1.ResourceQuota {
	return corev1.ResourceQuota{
		Status: corev1.ResourceQuotaStatus{
			Hard: corev1.ResourceList{
				corev1.ResourcePods:           resource.MustParse("28"),
				corev1.ResourceRequestsCPU:    resource.MustParse("5850m"),
				corev1.ResourceRequestsMemory: resource.MustParse("5952Mi"),
				corev1.ResourceLimitsCPU:      resource.MustParse("48"),
				corev1.ResourceLimitsMemory:   resource.MustParse("24Gi"),
			},
			Used: corev1.ResourceList{
				corev1.ResourcePods:           resource.MustParse("3"),
				corev1.ResourceRequestsCPU:    resource.MustParse("750m"),
				corev1.ResourceRequestsMemory: resource.MustParse("768Mi"),
				corev1.ResourceLimitsCPU:      resource.MustParse("6"),
				corev1.ResourceLimitsMemory:   resource.MustParse("3Gi"),
			},
		},
	}
}

// labLimitRange dựng ĐÚNG LimitRange của chart (templates/sandbox-quota.yaml
// + values.yaml § sandbox.limitRange): 250m/256Mi requests, 2/1Gi limits.
func labLimitRange() corev1.LimitRange {
	return corev1.LimitRange{
		Spec: corev1.LimitRangeSpec{
			Limits: []corev1.LimitRangeItem{{
				Type: corev1.LimitTypeContainer,
				DefaultRequest: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("250m"),
					corev1.ResourceMemory: resource.MustParse("256Mi"),
				},
				Default: corev1.ResourceList{
					corev1.ResourceCPU:    resource.MustParse("2"),
					corev1.ResourceMemory: resource.MustParse("1Gi"),
				},
			}},
		},
	}
}

// profileCost dựng Cost từ bốn chuỗi quantity — đúng hình dạng
// `sandbox.profiles.*` trong values.yaml đi qua config.parseSandboxProfiles.
func profileCost(t *testing.T, reqCPU, reqMem, limCPU, limMem string) Cost {
	t.Helper()
	return ProfileCost(&SandboxProfile{
		RequestsCPU:    resource.MustParse(reqCPU),
		RequestsMemory: resource.MustParse(reqMem),
		LimitsCPU:      resource.MustParse(limCPU),
		LimitsMemory:   resource.MustParse(limMem),
	})
}

// TestTranTheoProfileTrenSoThatCuaCum — Ô CHÍNH của bản vá.
//
// Đây là con số mà ô AC P13 nói là SAI: giao diện in "trần cứng 23" cho MỌI
// bài, trong khi `ide` chỉ vào được 7 khi quota trống và 6 ở trạng thái cụm
// hôm nay. Bốn profile, hai vế (`còn lại` và `trần khi trống`) — tám con số,
// tất cả suy ra từ quota, không một hằng số nào viết tay trong mã sản phẩm.
func TestTranTheoProfileTrenSoThatCuaCum(t *testing.T) {
	budget, err := budgetFromQuotas([]corev1.ResourceQuota{clusterQuota20260908()})
	if err != nil {
		t.Fatalf("budgetFromQuotas: %v", err)
	}
	budget.DefaultPodCost = defaultCostFromLimitRanges([]corev1.LimitRange{labLimitRange()})
	if budget.DefaultPodCost == nil {
		t.Fatal("DefaultPodCost nil — LimitRange của chart phải đọc ra được")
	}

	for _, tc := range []struct {
		name                string
		cost                Cost
		wantFree, wantTotal int64
	}{
		// mặc định: min(25, 5100/250=20, 5184/256=20, 42000/2000=21, 21504/1024=21)
		// total:    min(28, 5850/250=23, 5952/256=23, 48000/2000=24, 24576/1024=24)
		{"mặc định (LimitRange)", budget.DefaultPodCost, 20, 23},
		// ide: RAM là vế chặn ở CẢ HAI vế — 5184/768=6.75→6, 5952/768=7.75→7.
		{"ide", profileCost(t, "250m", "768Mi", "2", "1Gi"), 6, 7},
		{"k8s", profileCost(t, "500m", "1Gi", "4", "2Gi"), 5, 5},
		{"k8s-multinode", profileCost(t, "500m", "1536Mi", "4", "3Gi"), 3, 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			free, ok := Slots(budget.Remaining, tc.cost)
			if !ok {
				t.Fatal("Slots trả ok=false trên một budget + cost đầy đủ")
			}
			if free != tc.wantFree {
				t.Errorf("còn lại = %d, cần %d", free, tc.wantFree)
			}
			total, ok := Slots(budget.Total, tc.cost)
			if !ok {
				t.Fatal("Slots(Total) trả ok=false")
			}
			if total != tc.wantTotal {
				t.Errorf("trần khi quota trống = %d, cần %d", total, tc.wantTotal)
			}
		})
	}
}

// TestSlotsLaMinQuaNamRangBuoc — mỗi ràng buộc lần lượt là vế CHẶN.
//
// Năm ca, không phải một: một ca duy nhất xanh được với bất kỳ hiện thực nào
// tình cờ chọn đúng vế đó. Đây là cổng của bài học `quota-ceiling-is-min-of-five`
// — bỏ một khoá ra khỏi `quotaKeys` thì đúng một dòng dưới đây đỏ.
func TestSlotsLaMinQuaNamRangBuoc(t *testing.T) {
	// Chi phí một pod: 1 pod · 250m · 256Mi · 2000m · 1024Mi.
	cost := Cost{
		corev1.ResourcePods:           1,
		corev1.ResourceRequestsCPU:    250,
		corev1.ResourceRequestsMemory: 256 << 20,
		corev1.ResourceLimitsCPU:      2000,
		corev1.ResourceLimitsMemory:   1024 << 20,
	}
	// Ngân sách rộng rãi ở mọi vế (100 pod), rồi từng vế bị siết xuống 4.
	roomy := func() Budget {
		return Budget{
			corev1.ResourcePods:           100,
			corev1.ResourceRequestsCPU:    250 * 100,
			corev1.ResourceRequestsMemory: (256 << 20) * 100,
			corev1.ResourceLimitsCPU:      2000 * 100,
			corev1.ResourceLimitsMemory:   (1024 << 20) * 100,
		}
	}
	for _, tc := range []struct {
		key    corev1.ResourceName
		narrow int64
	}{
		{corev1.ResourcePods, 4},
		{corev1.ResourceRequestsCPU, 250 * 4},
		{corev1.ResourceRequestsMemory, (256 << 20) * 4},
		{corev1.ResourceLimitsCPU, 2000 * 4},
		{corev1.ResourceLimitsMemory, (1024 << 20) * 4},
	} {
		t.Run(string(tc.key), func(t *testing.T) {
			b := roomy()
			b[tc.key] = tc.narrow
			got, ok := Slots(b, cost)
			if !ok {
				t.Fatal("ok=false")
			}
			if got != 4 {
				t.Errorf("Slots = %d, cần 4 — %q không được tính vào min", got, tc.key)
			}
		})
	}
}

// TestSlotsChiChiaRAMSeNoiDoi — ĐỐI CHỨNG DƯƠNG cho vế `pods`.
//
// Chứng minh cổng trên KHÔNG vô nghĩa: trên một ngân sách mà `pods` là vế chặn,
// công thức "chỉ chia RAM" (hình dạng của hằng số `CAPACITY_HARD_LIMIT` cũ, vốn
// đúng bằng `requests.memory ÷ 256Mi`) cho một con số LỚN HƠN — tức nó hứa chỗ
// không có. Nếu ai đó rút `Slots` về chỉ một trục, ô này là bằng chứng số học
// rằng hai công thức KHÔNG tương đương.
func TestSlotsChiChiaRAMSeNoiDoi(t *testing.T) {
	cost := Cost{
		corev1.ResourcePods:           1,
		corev1.ResourceRequestsMemory: 256 << 20,
	}
	// Nhiều RAM (đủ 40 pod) nhưng chỉ còn 5 khe `pods`.
	budget := Budget{
		corev1.ResourcePods:           5,
		corev1.ResourceRequestsMemory: (256 << 20) * 40,
	}

	got, ok := Slots(budget, cost)
	if !ok {
		t.Fatal("ok=false")
	}
	if got != 5 {
		t.Fatalf("Slots = %d, cần 5 (vế `pods` chặn)", got)
	}

	// Công thức CŨ, viết lại tại chỗ để so — chỉ trục RAM.
	ramOnly := budget[corev1.ResourceRequestsMemory] / cost[corev1.ResourceRequestsMemory]
	if ramOnly != 40 {
		t.Fatalf("phép so hỏng: chỉ-RAM = %d, cần 40", ramOnly)
	}
	if ramOnly == got {
		t.Fatal("chỉ-RAM trùng min-of-five trên ca này ⇒ ca này KHÔNG phân biệt được " +
			"hai công thức, và cổng ở TestSlotsLaMinQuaNamRangBuoc chưa được chứng minh")
	}
}

// TestSlotsBienVuaDuVaThieuMotByte — hai ca biên đối xứng.
//
// "Vừa đủ đúng một pod" và "thiếu đúng một byte" là hai bên của cùng một lằn
// ranh, và một hiện thực dùng `<=` thay `<` hay làm tròn lên sẽ đỏ đúng một
// trong hai.
func TestSlotsBienVuaDuVaThieuMotByte(t *testing.T) {
	cost := Cost{
		corev1.ResourcePods:           1,
		corev1.ResourceRequestsMemory: 768 << 20,
	}
	for _, tc := range []struct {
		name      string
		remaining int64
		want      int64
	}{
		{"vừa đủ 1 pod", 768 << 20, 1},
		{"thiếu đúng 1 byte", (768 << 20) - 1, 0},
		{"dư 1 byte vẫn chưa đủ pod thứ hai", (768 << 20) + 1, 1},
		{"vừa đủ 2 pod", (768 << 20) * 2, 2},
		{"cạn sạch", 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := Budget{corev1.ResourcePods: 100, corev1.ResourceRequestsMemory: tc.remaining}
			got, ok := Slots(b, cost)
			if !ok {
				t.Fatal("ok=false")
			}
			if got != tc.want {
				t.Errorf("Slots(remaining=%d) = %d, cần %d", tc.remaining, got, tc.want)
			}
		})
	}
}

// TestSlotsRemainingAmVeKhong — `helm upgrade` hạ `hard` xuống DƯỚI mức đang
// dùng cho `hard − used` âm. Chia số âm ra số âm rồi để tầng trên kẹp là muộn:
// một `-2` lọt tới FE đọc thành "còn −2 chỗ".
func TestSlotsRemainingAmVeKhong(t *testing.T) {
	b := Budget{corev1.ResourcePods: -2, corev1.ResourceRequestsMemory: -(512 << 20)}
	cost := Cost{corev1.ResourcePods: 1, corev1.ResourceRequestsMemory: 256 << 20}
	got, ok := Slots(b, cost)
	if !ok {
		t.Fatal("ok=false — quota bị thu hẹp vẫn là một trạng thái ĐỌC ĐƯỢC")
	}
	if got != 0 {
		t.Errorf("Slots = %d, cần 0", got)
	}
}

// TestSlotsKhongTinhDuoc — ok=false phải KHÁC "bằng 0".
//
// Đây là ranh giới mà cả bản vá dựa lên: "chưa rõ sức chứa" và "hết chỗ" là hai
// câu khác nhau với người học. Gộp chúng lại là đúng lớp lỗi
// `errors-over-silent-fallbacks` cấm.
func TestSlotsKhongTinhDuoc(t *testing.T) {
	full := Budget{corev1.ResourcePods: 10, corev1.ResourceRequestsMemory: 10 << 30}

	for _, tc := range []struct {
		name   string
		budget Budget
		cost   Cost
	}{
		{"cost rỗng — không biết pod tiêu thụ gì", full, Cost{}},
		{"cost nil (profile mặc định chưa đọc được LimitRange)", full, nil},
		{"cost toàn số 0", full, Cost{corev1.ResourcePods: 0}},
		{"budget rỗng — quota không gác gì", Budget{}, Cost{corev1.ResourcePods: 1}},
		{
			"budget và cost không giao nhau khoá nào",
			Budget{corev1.ResourceServices: 5},
			Cost{corev1.ResourcePods: 1},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := Slots(tc.budget, tc.cost)
			if ok {
				t.Errorf("ok=true (got=%d) — ca này phải là CHƯA BIẾT, không phải một con số", got)
			}
		})
	}
}

// TestSlotsCpuTinhTheoMilli — `250m` KHÔNG được đọc thành 1 core.
//
// `Quantity.Value()` làm tròn LÊN số nguyên, nên `250m` ra 1. Với ngân sách
// 5850m thì công thức đúng cho 23 khe CPU, còn công thức sai cho 5. Không cổng
// nào khác trong repo bắt được nhầm này.
func TestSlotsCpuTinhTheoMilli(t *testing.T) {
	q := resource.MustParse("250m")
	if got := quotaAmount(corev1.ResourceRequestsCPU, q); got != 250 {
		t.Fatalf("quotaAmount(requests.cpu, 250m) = %d, cần 250 (milli) — đang dùng Value() thay MilliValue()", got)
	}
	if got := q.Value(); got != 1 {
		t.Fatalf("tiền đề của test hỏng: Quantity(250m).Value() = %d, tưởng là 1", got)
	}

	cpuHard := resource.MustParse("5850m")
	budget := Budget{corev1.ResourceRequestsCPU: cpuHard.MilliValue()}
	got, ok := Slots(budget, Cost{corev1.ResourceRequestsCPU: 250})
	if !ok || got != 23 {
		t.Errorf("Slots = %d (ok=%v), cần 23", got, ok)
	}
}

// TestBudgetFromQuotasTuChoiNguonKhongDocDuoc — fail-closed.
//
// Không có ResourceQuota, hoặc quota chưa có `status.hard`, thì trần KHÔNG xác
// định. Trả "vô hạn" ở đây là hỏng theo chiều tệ nhất: giao diện khoe rất nhiều
// chỗ đúng lúc không ai biết còn bao nhiêu.
func TestBudgetFromQuotasTuChoiNguonKhongDocDuoc(t *testing.T) {
	for _, tc := range []struct {
		name   string
		quotas []corev1.ResourceQuota
	}{
		{"không có quota nào", nil},
		{"danh sách rỗng", []corev1.ResourceQuota{}},
		{"quota chưa có status.hard", []corev1.ResourceQuota{{}}},
		{
			"quota có status nhưng không gác đại lượng nào của pod",
			[]corev1.ResourceQuota{{Status: corev1.ResourceQuotaStatus{
				Hard: corev1.ResourceList{corev1.ResourceServices: resource.MustParse("5")},
			}}},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := budgetFromQuotas(tc.quotas); err == nil {
				t.Error("budgetFromQuotas trả nil error — phải là LỖI, không phải trần vô hạn")
			}
		})
	}
}

// TestBudgetFromQuotasNhieuQuotaLayChatNhat — một pod phải thoả TẤT CẢ quota
// trong namespace, nên vế chặt nhất thắng ở cả `Remaining` lẫn `Total`.
func TestBudgetFromQuotasNhieuQuotaLayChatNhat(t *testing.T) {
	rong := corev1.ResourceQuota{Status: corev1.ResourceQuotaStatus{
		Hard: corev1.ResourceList{corev1.ResourcePods: resource.MustParse("50")},
		Used: corev1.ResourceList{corev1.ResourcePods: resource.MustParse("10")},
	}}
	chat := corev1.ResourceQuota{Status: corev1.ResourceQuotaStatus{
		Hard: corev1.ResourceList{corev1.ResourcePods: resource.MustParse("12")},
		Used: corev1.ResourceList{corev1.ResourcePods: resource.MustParse("10")},
	}}
	b, err := budgetFromQuotas([]corev1.ResourceQuota{rong, chat})
	if err != nil {
		t.Fatalf("budgetFromQuotas: %v", err)
	}
	if b.Remaining[corev1.ResourcePods] != 2 {
		t.Errorf("Remaining[pods] = %d, cần 2 (quota chặt nhất)", b.Remaining[corev1.ResourcePods])
	}
	if b.Total[corev1.ResourcePods] != 12 {
		t.Errorf("Total[pods] = %d, cần 12", b.Total[corev1.ResourcePods])
	}
}

// TestBudgetFromQuotasThieuUsedCoiNhuChuaDung — `status.used` vắng một khoá
// (quota vừa thi hành, chưa có pod nào) không được đọc thành 0 chỗ còn lại.
func TestBudgetFromQuotasThieuUsedCoiNhuChuaDung(t *testing.T) {
	q := corev1.ResourceQuota{Status: corev1.ResourceQuotaStatus{
		Hard: corev1.ResourceList{corev1.ResourcePods: resource.MustParse("7")},
	}}
	b, err := budgetFromQuotas([]corev1.ResourceQuota{q})
	if err != nil {
		t.Fatalf("budgetFromQuotas: %v", err)
	}
	if b.Remaining[corev1.ResourcePods] != 7 {
		t.Errorf("Remaining[pods] = %d, cần 7", b.Remaining[corev1.ResourcePods])
	}
}

// TestDefaultCostFromLimitRanges — pod mặc định KHÔNG khai resources, nên chi
// phí quota của nó do LimitRange quyết định. Đọc sai bốn số này là sai trần của
// đại đa số bài trong giáo trình.
func TestDefaultCostFromLimitRanges(t *testing.T) {
	got := defaultCostFromLimitRanges([]corev1.LimitRange{labLimitRange()})
	if got == nil {
		t.Fatal("nil trên LimitRange đầy đủ của chart")
	}
	for key, want := range map[corev1.ResourceName]int64{
		corev1.ResourcePods:           1,
		corev1.ResourceRequestsCPU:    250,
		corev1.ResourceRequestsMemory: 256 << 20,
		corev1.ResourceLimitsCPU:      2000,
		corev1.ResourceLimitsMemory:   1024 << 20,
	} {
		if got[key] != want {
			t.Errorf("cost[%s] = %d, cần %d", key, got[key], want)
		}
	}
}

// TestDefaultCostFromLimitRangesThieuThiNil — nil = CHƯA BIẾT.
//
// Một LimitRange thiếu `default` (chỉ có `defaultRequest`) hay chỉ khai cho
// type Pod là cấu hình có thật; đoán bù bốn con số ở đó sẽ khiến trần của bài
// thường sai mà không ai biết vì sao.
func TestDefaultCostFromLimitRangesThieuThiNil(t *testing.T) {
	item := func(mod func(*corev1.LimitRangeItem)) []corev1.LimitRange {
		it := labLimitRange().Spec.Limits[0]
		mod(&it)
		return []corev1.LimitRange{{Spec: corev1.LimitRangeSpec{Limits: []corev1.LimitRangeItem{it}}}}
	}
	for _, tc := range []struct {
		name   string
		ranges []corev1.LimitRange
	}{
		{"không có LimitRange nào", nil},
		{"thiếu hẳn default (chỉ có defaultRequest)", item(func(i *corev1.LimitRangeItem) { i.Default = nil })},
		{"thiếu defaultRequest", item(func(i *corev1.LimitRangeItem) { i.DefaultRequest = nil })},
		{"thiếu defaultRequest.memory", item(func(i *corev1.LimitRangeItem) {
			delete(i.DefaultRequest, corev1.ResourceMemory)
		})},
		{"chỉ khai cho type Pod", item(func(i *corev1.LimitRangeItem) { i.Type = corev1.LimitTypePod })},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := defaultCostFromLimitRanges(tc.ranges); got != nil {
				t.Errorf("cost = %v, cần nil (CHƯA BIẾT, không phải một bộ số đoán)", got)
			}
		})
	}
}

// TestProfileCostNilTraNil — profile mặc định đi qua đường LimitRange, không
// qua đây. Trả Cost{} thay vì nil sẽ khiến Slots báo "chưa biết" vì lý do sai.
func TestProfileCostNilTraNil(t *testing.T) {
	if got := ProfileCost(nil); got != nil {
		t.Errorf("ProfileCost(nil) = %v, cần nil", got)
	}
}
