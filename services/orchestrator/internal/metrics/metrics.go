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

	// ExtendTotal tách theo KẾT QUẢ, không phải theo session. `revision_mismatch`
	// tăng đều là dấu hiệu hai tiến trình đang tranh cùng một session — chính
	// cái race mà `revision` sinh ra để chặn, nên nó phải nhìn thấy được.
	ExtendTotal *prometheus.CounterVec
	// ReapTotal tách theo ai gọi (`user` / `system`) và kết quả.
	ReapTotal *prometheus.CounterVec

	// ReaperOrphanPodsTotal đếm pod mang label app=sandbox mà không có hash
	// pod:{name}. > 0 kéo dài = báo động: có nguồn tạo pod ngoài warm-pool,
	// hoặc một đường dọn dẹp đang hỏng.
	ReaperOrphanPodsTotal prometheus.Counter
	// ReaperPodsTerminating là số pod sandbox đang có DeletionTimestamp tại vòng
	// sweep gần nhất. GAUGE, không phải counter — pod kẹt Terminating phải đọc
	// là "vẫn đang kẹt" chứ không cộng dồn mỗi 60s (bẫy M-6, xem sweepOrphanPods).
	// Đây cũng là thứ giữ cho ReaperOrphanPodsTotal còn dùng được làm báo động:
	// pod kẹt không còn bơm vào counter kia nữa, nên counter kia tăng nghĩa là
	// có pod mồ côi MỚI thật.
	ReaperPodsTerminating prometheus.Gauge
	// ReaperGhostSessionsTotal đếm session:{id} còn mà pod đã biến mất.
	ReaperGhostSessionsTotal prometheus.Counter
	// ReaperClaimedOrphanTotal đếm pod nằm trong pool:claimed mà session không
	// còn — dấu vết của một event keyspace bị LỠ. > 0 sau mỗi lần rollout là
	// bình thường; > 0 liên tục nghĩa là tầng 1 đã chết.
	ReaperClaimedOrphanTotal prometheus.Counter
	// ReaperQuarantineReapedTotal đếm pod bị cách ly đã được dọn khỏi cluster.
	ReaperQuarantineReapedTotal prometheus.Counter
	// ReaperSweepFailuresTotal đếm vòng sweep lỗi. Sweep là ĐƯỜNG CHÍNH của
	// reaper (keyspace notification chỉ là đường nhanh, best-effort), nên nó
	// hỏng âm thầm là pod sống mãi và ăn hết quota.
	ReaperSweepFailuresTotal prometheus.Counter
	// ReaperKeyspaceEventsTotal đếm event `expired` nhận được. Bằng 0 kéo dài
	// trong khi session vẫn hết hạn = `notify-keyspace-events` chưa bật, và
	// SUBSCRIBE vẫn THÀNH CÔNG trong ca đó nên không lỗi nào báo.
	ReaperKeyspaceEventsTotal prometheus.Counter

	// AuditWriteFailuresTotal — audit KHÔNG được chặn đường claim, nên lỗi ghi
	// chỉ log + đếm. Counter này là thứ duy nhất cho biết audit trail đang thủng.
	AuditWriteFailuresTotal prometheus.Counter
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

		ExtendTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_extend_total",
			Help: "Số lần ExtendSession, tách theo kết quả (ok/revision_mismatch/bad_state/hard_cap/not_found/error).",
		}, []string{"result"}),

		ReapTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_reap_total",
			Help: "Số lần ReapSession, tách theo người gọi và kết quả.",
		}, []string{"actor", "result"}),

		ReaperOrphanPodsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_reaper_orphan_pods_total",
			Help: "Pod mang label app=sandbox mà không có hash pod:{name}. > 0 kéo dài = báo động.",
		}),
		ReaperPodsTerminating: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "dlp_reaper_pods_terminating",
			Help: "Pod sandbox đang có DeletionTimestamp ở vòng sweep gần nhất. Dương kéo dài = finalizer treo / kubelet không dọn được.",
		}),
		ReaperGhostSessionsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_reaper_ghost_sessions_total",
			Help: "session:{id} còn trong Redis mà pod đã biến mất — chuyển FAILED.",
		}),
		ReaperClaimedOrphanTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_reaper_claimed_orphan_total",
			Help: "Pod trong pool:claimed mà session không còn — dấu vết một event keyspace bị lỡ. Trước khi có tầng 2c, đây là pod rò VĨNH VIỄN mà không tầng nào chạm được.",
		}),
		ReaperQuarantineReapedTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_reaper_quarantine_reaped_total",
			Help: "Pod bị cách ly đã được dọn khỏi cluster. Không có nhánh này thì mỗi lần cách ly là −1 vĩnh viễn trên trần đồng thời (D16).",
		}),
		ReaperSweepFailuresTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_reaper_sweep_failures_total",
			Help: "Vòng sweep định kỳ thất bại. Sweep là ĐƯỜNG CHÍNH của reaper — pub/sub chỉ là đường nhanh.",
		}),
		ReaperKeyspaceEventsTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_reaper_keyspace_events_total",
			Help: "Event __keyevent@N__:expired nhận được. Bằng 0 kéo dài trong khi session vẫn hết hạn = notify-keyspace-events chưa bật (và SUBSCRIBE vẫn thành công trong ca đó, nên không lỗi nào báo).",
		}),

		AuditWriteFailuresTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_audit_write_failures_total",
			Help: "Lỗi ghi sessions_audit. Audit không được chặn đường claim, nên đây là tín hiệu DUY NHẤT cho biết audit trail đang thủng.",
		}),
	}

	reg.MustRegister(
		m.ClaimDuration,
		m.PoolFreeSize,
		m.PoolQuarantineSize,
		m.ColdPathTotal,
		m.ReplenishFailuresTotal,
		m.ReplenishQuotaBlockedTotal,
		m.ExtendTotal,
		m.ReapTotal,
		m.ReaperOrphanPodsTotal,
		m.ReaperPodsTerminating,
		m.ReaperGhostSessionsTotal,
		m.ReaperClaimedOrphanTotal,
		m.ReaperQuarantineReapedTotal,
		m.ReaperSweepFailuresTotal,
		m.ReaperKeyspaceEventsTotal,
		m.AuditWriteFailuresTotal,
	)

	// Khởi tạo cả hai nhãn về 0 ngay lúc đăng ký. Không có dòng này thì
	// `dlp_claim_duration_seconds{path="cold"}` VẮNG MẶT cho tới lần cold-path
	// đầu tiên, và mọi alert/dashboard viết trên nó im lặng không khớp series
	// nào — trông y hệt "mọi thứ đều ổn".
	m.ClaimDuration.WithLabelValues(PathWarm)
	m.ClaimDuration.WithLabelValues(PathCold)

	// Cùng lý do cho hai CounterVec mới: một alert kiểu
	// `rate(dlp_extend_total{result="revision_mismatch"}[5m]) > 0` sẽ trả
	// NO-DATA thay vì 0 cho tới lần đầu tiên nó xảy ra — và no-data trông y hệt
	// "mọi thứ đều ổn" trên dashboard.
	for _, r := range []string{"ok", "not_found", "revision_mismatch", "bad_state", "hard_cap", "error"} {
		m.ExtendTotal.WithLabelValues(r)
	}
	for _, actor := range []string{"user", "system"} {
		for _, r := range []string{"ok", "already_reaped", "not_found", "error"} {
			m.ReapTotal.WithLabelValues(actor, r)
		}
	}

	return m
}
