package k8s

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// quotaKeys là NĂM đại lượng mà ResourceQuota của namespace sandbox gác.
//
// ⛔ NĂM, KHÔNG PHẢI MỘT. Trần đồng thời là `min` qua CẢ NĂM ràng buộc — đúng
// bài học `quota-ceiling-is-min-of-five`. Một phép tính chỉ chia RAM sẽ nói
// "còn 20 chỗ" trên một cụm mà `pods` hoặc `limits.cpu` đã cạn trước, và nó
// hỏng theo đúng chiều nguy hiểm: hứa nhiều hơn thứ apiserver cho vào.
//
// Vế `pods` KHÔNG phải thừa. Quota cụm 2026-09-08 gác `pods: 28` trong khi
// `requests.memory 5952Mi ÷ 256Mi = 23.25`, tức CAPACITY_HARD_LIMIT=23 là trần
// RAM chứ không phải trần pods — hai trần khác nhau, và ở một cụm nhiều RAM ít
// pod thì vế còn lại mới là vế chặn. Bỏ nó ra là dựng lại đúng hạng lỗi đang
// vá, chỉ đổi trục.
//
// Kiểm được bằng số thật (quota cụm 2026-09-08, hard 28 pod · 5850m · 5952Mi ·
// 48 · 24Gi, used 3 pod · 750m · 768Mi · 6 · 3Gi ⇒ còn 25 · 5100m · 5184Mi ·
// 42000m · 21504Mi):
//
//	mặc định (250m/256Mi/2/1Gi)   min(25, 20, 20, 21, 21) = 20
//	ide      (250m/768Mi/2/1Gi)   min(25, 20,  6, 21, 21) =  6   ← RAM chặn
//	k8s      (500m/1Gi/4/2Gi)     min(25, 10,  5, 10, 10) =  5
//	multinode(500m/1536Mi/4/3Gi)  min(25, 10,  3, 10,  7) =  3
var quotaKeys = []corev1.ResourceName{
	corev1.ResourcePods,
	corev1.ResourceRequestsCPU,
	corev1.ResourceRequestsMemory,
	corev1.ResourceLimitsCPU,
	corev1.ResourceLimitsMemory,
}

// Budget là phần CÒN LẠI (`hard − used`) của quota namespace, theo từng đại
// lượng, ĐỌC TẠI MỘT THỜI ĐIỂM.
//
// Khoá VẮNG MẶT nghĩa là quota KHÔNG gác đại lượng đó, tức nó không giới hạn
// gì — khác hẳn với giá trị 0 (gác, và đã cạn). Dùng map chứ không phải một
// struct năm field chính vì sự khác biệt đó: một `int64` zero-value không nói
// được "không gác".
//
// Đơn vị KHÔNG đồng nhất theo chủ ý, và nó khớp đúng cách Kubernetes tự đo:
// CPU tính bằng MILLI (`Quantity.MilliValue`), RAM bằng BYTE, `pods` bằng đơn
// vị đếm. Quy tất cả về một đơn vị là chỗ để mất chính xác — `250m` không biểu
// diễn được bằng số nguyên core.
type Budget map[corev1.ResourceName]int64

// Cost là chi phí quota của MỘT pod — cùng khoá, cùng đơn vị với Budget.
//
// Luôn chứa `pods: 1`: mọi pod ăn đúng một khe `pods` bất kể profile nào.
type Cost map[corev1.ResourceName]int64

// NamespaceBudget là ảnh chụp ngân sách quota của namespace sandbox.
type NamespaceBudget struct {
	// Remaining là `hard − used` gộp qua MỌI ResourceQuota trong namespace
	// (lấy min từng khoá): một pod phải thoả TẤT CẢ quota, không phải một cái.
	Remaining Budget

	// Total là `hard` gộp cùng cách — ngân sách khi namespace TRỐNG HOÀN TOÀN.
	//
	// Có mặt để tính MẪU SỐ ("còn 6/7 chỗ") và ngưỡng "sắp hết" theo tỉ lệ.
	// KHÔNG được dùng thay Remaining để trả lời "còn mấy chỗ": chúng chỉ bằng
	// nhau trên một namespace rỗng, tức đúng cái trạng thái mà mọi phép đo
	// sức chứa đều xanh một cách vô nghĩa.
	Total Budget

	// DefaultPodCost là chi phí của pod KHÔNG khai `resources` — tức profile
	// mặc định (`PodConfig.Profile == nil`). Do LimitRange quyết định, KHÔNG
	// do orchestrator khai, nên nó phải được ĐỌC chứ không được đoán.
	//
	// nil = không đọc được (namespace không có LimitRange nào cấp
	// defaultRequest/default cho Container). Caller PHẢI đọc nil là "chưa biết
	// trần của profile mặc định" và nói ra điều đó, KHÔNG được rơi về một hằng
	// số — xem lifecycle.GetCapacity.
	DefaultPodCost Cost
}

// Slots trả số pod chi phí `cost` còn tạo thêm được trong `budget`.
//
// ok=false nghĩa là KHÔNG TÍNH ĐƯỢC (không phải "bằng 0"). Hai ca:
//   - `cost` rỗng/không dương ở mọi khoá — ta không biết pod tiêu thụ gì;
//   - `budget` không gác khoá nào mà `cost` có — trần là vô hạn, và trả một
//     con số hữu hạn ở đây sẽ là bịa.
//
// Phân biệt ok=false với 0 là TOÀN BỘ lý do hàm này trả hai giá trị: "chưa rõ
// sức chứa" và "hết chỗ" là hai câu khác nhau với người học, và gộp chúng lại
// đúng là lớp lỗi mà `errors-over-silent-fallbacks` cấm.
func Slots(budget Budget, cost Cost) (int64, bool) {
	best := int64(0)
	found := false
	for key, remaining := range budget {
		per, ok := cost[key]
		if !ok || per <= 0 {
			// Pod không tiêu thụ đại lượng này ⇒ nó không bị đại lượng này
			// giới hạn. KHÔNG phải lỗi: một ResourceQuota có thể gác
			// `services` hay `configmaps`, những thứ pod sandbox không đụng.
			continue
		}
		n := remaining / per
		if remaining < 0 {
			// `hard` bị hạ xuống DƯỚI mức đang dùng (helm upgrade thu quota
			// lại) cho `remaining` âm. Chia ra số âm rồi kẹp ở tầng trên là
			// muộn — kẹp ở đây để mọi caller thấy cùng một 0.
			n = 0
		}
		if !found || n < best {
			best, found = n, true
		}
	}
	return best, found
}

// ProfileCost dịch một SandboxProfile đã phân giải sang chi phí quota.
//
// nil ⇒ nil: profile mặc định KHÔNG khai resources, nên chi phí của nó do
// LimitRange quyết định (xem NamespaceBudget.DefaultPodCost). Trả một Cost
// rỗng ở đây thay vì nil sẽ khiến Slots đọc ra "không tính được" vì lý do sai.
func ProfileCost(p *SandboxProfile) Cost {
	if p == nil {
		return nil
	}
	return Cost{
		corev1.ResourcePods:           1,
		corev1.ResourceRequestsCPU:    p.RequestsCPU.MilliValue(),
		corev1.ResourceRequestsMemory: p.RequestsMemory.Value(),
		corev1.ResourceLimitsCPU:      p.LimitsCPU.MilliValue(),
		corev1.ResourceLimitsMemory:   p.LimitsMemory.Value(),
	}
}

// quotaAmount đọc một Quantity về đơn vị của Budget/Cost.
//
// CPU phải đi qua MilliValue: `Value()` LÀM TRÒN LÊN số nguyên core, nên `250m`
// đọc ra 1 — sai 4 lần. Không có cổng nào bắt được nhầm này ngoài chính chú
// thích và ô test biên `TestSlotsCpuTinhTheoMilli`.
func quotaAmount(name corev1.ResourceName, q resource.Quantity) int64 {
	if name == corev1.ResourceRequestsCPU || name == corev1.ResourceLimitsCPU || name == corev1.ResourceCPU {
		return q.MilliValue()
	}
	return q.Value()
}

// budgetFromQuotas gộp danh sách ResourceQuota thành phần còn lại.
//
// Tách khỏi lời gọi API để test được KHÔNG cần cụm — đây là chỗ số học thật sự
// xảy ra, và nó là chỗ sai được trong im lặng.
//
// ⛔ ĐỌC `status`, KHÔNG ĐỌC `spec`. `spec.hard` là thứ ta YÊU CẦU; `status` là
// thứ apiserver ĐANG THI HÀNH, và chỉ `status.used` mới nói đã tiêu bao nhiêu.
// Một quota vừa tạo có `spec.hard` đầy đủ nhưng `status` rỗng — lúc đó nó CHƯA
// gác gì, và đọc `spec` sẽ khẳng định một trần chưa có hiệu lực.
//
// Không có quota nào, hoặc quota chưa có `status.hard`: trả LỖI chứ không trả
// "vô hạn". Namespace sandbox không có quota là một sự cố cấu hình, và im lặng
// báo "còn rất nhiều chỗ" ở đúng lúc đó là hỏng theo chiều tệ nhất.
func budgetFromQuotas(quotas []corev1.ResourceQuota) (*NamespaceBudget, error) {
	if len(quotas) == 0 {
		return nil, fmt.Errorf("k8s: namespace không có ResourceQuota nào — không xác định được trần")
	}
	remaining, total := Budget{}, Budget{}
	for i := range quotas {
		st := quotas[i].Status
		if len(st.Hard) == 0 {
			return nil, fmt.Errorf("k8s: ResourceQuota %q chưa có status.hard — chưa thi hành", quotas[i].Name)
		}
		for _, key := range quotaKeys {
			hard, ok := st.Hard[key]
			if !ok {
				continue
			}
			hardAmount := quotaAmount(key, hard)
			left := hardAmount
			if used, seen := st.Used[key]; seen {
				left -= quotaAmount(key, used)
			}
			// Nhiều quota cùng gác một khoá ⇒ cái chặt nhất thắng, ở CẢ HAI vế.
			if cur, seen := remaining[key]; !seen || left < cur {
				remaining[key] = left
			}
			if cur, seen := total[key]; !seen || hardAmount < cur {
				total[key] = hardAmount
			}
		}
	}
	if len(remaining) == 0 {
		return nil, fmt.Errorf("k8s: ResourceQuota có mặt nhưng không gác đại lượng nào của pod")
	}
	return &NamespaceBudget{Remaining: remaining, Total: total}, nil
}

// defaultCostFromLimitRanges dựng chi phí của pod KHÔNG khai resources.
//
// Trả nil (KHÔNG phải lỗi) khi không tìm được: caller phân biệt "chưa biết trần
// của profile mặc định" với "cả ngân sách không đọc được".
//
// ⚠ Lấy mục Container ĐẦU TIÊN có đủ `defaultRequest` + `default`. Kubernetes
// áp MỌI LimitRange trong namespace và luật gộp default của nó không đơn giản
// là "cái đầu tiên"; ta chỉ đúng vì chart dựng ĐÚNG MỘT LimitRange
// (`templates/sandbox-quota.yaml`). Thêm cái thứ hai vào namespace sandbox là
// làm hàm này nói sai — ghi ra đây chứ không giấu trong một giả định.
func defaultCostFromLimitRanges(ranges []corev1.LimitRange) Cost {
	for i := range ranges {
		for _, item := range ranges[i].Spec.Limits {
			if item.Type != corev1.LimitTypeContainer {
				continue
			}
			reqCPU, okReqCPU := item.DefaultRequest[corev1.ResourceCPU]
			reqMem, okReqMem := item.DefaultRequest[corev1.ResourceMemory]
			limCPU, okLimCPU := item.Default[corev1.ResourceCPU]
			limMem, okLimMem := item.Default[corev1.ResourceMemory]
			if !okReqCPU || !okReqMem || !okLimCPU || !okLimMem {
				continue
			}
			return Cost{
				corev1.ResourcePods:           1,
				corev1.ResourceRequestsCPU:    reqCPU.MilliValue(),
				corev1.ResourceRequestsMemory: reqMem.Value(),
				corev1.ResourceLimitsCPU:      limCPU.MilliValue(),
				corev1.ResourceLimitsMemory:   limMem.Value(),
			}
		}
	}
	return nil
}

// QuotaAccess là bề mặt K8s API mà GetCapacity cần để trả lời "còn mấy chỗ".
//
// Hẹp đúng một phương thức, cùng lý lẽ với PodAccess: chỗ đọc nói rõ nó chỉ ĐỌC
// ngân sách, không sửa được gì.
type QuotaAccess interface {
	Budget(ctx context.Context) (*NamespaceBudget, error)
}

type quotaClient struct {
	api       kubernetes.Interface
	namespace string
}

// NewQuotaClient khoá clientset vào đúng namespace sandbox — cùng lý do với
// NewPodClient: một tham số namespace ở mỗi call là một chỗ để truyền nhầm.
//
// ⚠ Đòi RBAC `get`/`list` trên `resourcequotas` VÀ `limitranges` trong namespace
// sandbox (templates/rbac.yaml). Thiếu quyền KHÔNG hỏng lúc build, nó hỏng lúc
// chạy bằng một 403 — và trước bản này Role chỉ có `pods` + `pods/status`.
func NewQuotaClient(api kubernetes.Interface, namespace string) QuotaAccess {
	return &quotaClient{api: api, namespace: namespace}
}

func (c *quotaClient) Budget(ctx context.Context) (*NamespaceBudget, error) {
	quotas, err := c.api.CoreV1().ResourceQuotas(c.namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("k8s: đọc ResourceQuota trong %q: %w", c.namespace, err)
	}
	budget, err := budgetFromQuotas(quotas.Items)
	if err != nil {
		return nil, err
	}

	// LimitRange lỗi KHÔNG làm hỏng cả phép đọc: trần của các profile CÓ TÊN
	// (ide, k8s, k8s-multinode) không phụ thuộc LimitRange chút nào, và giữ
	// được ba con số đó vẫn hơn là mất cả bốn. Profile mặc định sẽ vắng mặt
	// trong map trả về, tức FE nói "chưa rõ" cho riêng nó.
	if ranges, lrErr := c.api.CoreV1().LimitRanges(c.namespace).List(ctx, metav1.ListOptions{}); lrErr == nil {
		budget.DefaultPodCost = defaultCostFromLimitRanges(ranges.Items)
	}

	return budget, nil
}
