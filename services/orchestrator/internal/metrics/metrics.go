// Package metrics gom mọi collector Prometheus của orchestrator vào một chỗ.
//
// Một struct thay vì biến package-level: registry của httpx là instance RIÊNG
// (không phải DefaultRegisterer), nên collector toàn cục sẽ panic "duplicate
// collector" ngay ở test thứ hai trong cùng process.
//
// KHÔNG label nào mang session_id / user_id / pod_name: cardinality nổ theo số
// sinh viên, và cả ba đều là dữ liệu định danh trên một endpoint không có authz.
package metrics

import "github.com/prometheus/client_golang/prometheus"

// Nhãn cho dlp_claim_duration_seconds.
const (
	// PathWarm — claim trúng pod có sẵn trong pool. ĐÂY là đường mà AC
	// "p95 < 1s" nói tới.
	PathWarm = "warm"
	// PathCold — pool rỗng, phải tạo pod đồng bộ rồi mới claim. Chậm hơn hàng
	// giây theo bản chất; gộp chung một histogram sẽ kéo p95 lên và làm AC
	// hoặc đỏ oan, hoặc (tệ hơn) được nới ra cho vừa.
	PathCold = "cold"
)

// Metrics giữ mọi collector của orchestrator.
type Metrics struct {
	ClaimDuration *prometheus.HistogramVec

	PoolFreeSize       prometheus.Gauge
	PoolQuarantineSize prometheus.Gauge

	ColdPathTotal prometheus.Counter

	ReplenishFailuresTotal     prometheus.Counter
	ReplenishQuotaBlockedTotal prometheus.Counter
}

// New dựng và ĐĂNG KÝ mọi collector vào registry cho trước.
//
// MustRegister có chủ ý: trùng tên metric là lỗi lập trình phát hiện được lúc
// khởi động, không phải điều kiện runtime cần xử lý mềm.
func New(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		ClaimDuration: prometheus.NewHistogramVec(
			prometheus.HistogramOpts{
				Name: "dlp_claim_duration_seconds",
				Help: "Thời gian claim một pod cho session, tách theo đường warm/cold.",
				// Bucket dồn quanh 1s vì AC là p95 < 1s. Bucket mặc định của
				// Prometheus (.005 … 10) chỉ có .5, 1, 2.5 quanh vùng đó — quá
				// thưa để nói được p95 là 0.9 hay 1.1.
				Buckets: []float64{
					0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75,
					1, 1.5, 2, 3, 5, 10, 30,
				},
			},
			[]string{"path"},
		),

		PoolFreeSize: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "dlp_pool_free_size",
			Help: "Số pod ấm đang nằm trong pool:free, chờ được claim.",
		}),

		PoolQuarantineSize: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "dlp_pool_quarantine_size",
			Help: "Số pod bị claim.lua cách ly. Mỗi mục là −1 trên trần đồng thời (D16) và là tín hiệu DUY NHẤT cho biết có nguồn ghi sai vào pool:free.",
		}),

		ColdPathTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_cold_path_total",
			Help: "Số lần pool rỗng buộc phải tạo pod đồng bộ.",
		}),

		ReplenishFailuresTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_pool_replenish_failures_total",
			Help: "Số lần replenish thất bại vì lỗi THẬT (không tính chạm quota).",
		}),

		ReplenishQuotaBlockedTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_pool_replenish_quota_blocked_total",
			Help: "Số lần replenish bị ResourceQuota chặn. Đây là nền tảng chạy hết công suất, KHÔNG phải lỗi — tách khỏi replenish_failures để cảnh báo không trộn hai chuyện.",
		}),
	}

	reg.MustRegister(
		m.ClaimDuration,
		m.PoolFreeSize,
		m.PoolQuarantineSize,
		m.ColdPathTotal,
		m.ReplenishFailuresTotal,
		m.ReplenishQuotaBlockedTotal,
	)

	// Khởi tạo cả hai nhãn về 0 ngay lúc đăng ký. Không có dòng này thì
	// `dlp_claim_duration_seconds{path="cold"}` VẮNG MẶT cho tới lần cold-path
	// đầu tiên, và mọi alert/dashboard viết trên nó im lặng không khớp series
	// nào — trông y hệt "mọi thứ đều ổn".
	m.ClaimDuration.WithLabelValues(PathWarm)
	m.ClaimDuration.WithLabelValues(PathCold)

	return m
}
