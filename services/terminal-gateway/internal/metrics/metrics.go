// Package metrics gom mọi collector Prometheus của terminal-gateway vào một chỗ.
//
// Một struct thay vì biến package-level: registry của httpx là instance RIÊNG
// (không phải DefaultRegisterer), nên collector toàn cục sẽ panic "duplicate
// collector" ngay ở test thứ hai trong cùng process. Cùng khuôn với
// `services/orchestrator/internal/metrics` — hai service, hai registry, một lối
// viết.
//
// ⛔ KHÔNG label nào mang session_id / user_id / pod_name (G10). Cardinality nổ
// theo số sinh viên, và cả ba đều là dữ liệu định danh trên một endpoint KHÔNG
// có authz — /metrics nằm ở admin port chính vì thế, nhưng port riêng là hàng
// rào thứ hai, không phải giấy phép đưa PII vào nhãn.
package metrics

import "github.com/prometheus/client_golang/prometheus"

// Nhãn `result` của dlp_gateway_ws_connections_total.
const (
	// ResultAccepted — qua đủ chín bước kiểm và đã upgrade lên 101.
	ResultAccepted = "accepted"
	// ResultDenied — bị một bước kiểm từ chối (4xx). Đây là NGƯỜI GỌI sai.
	ResultDenied = "denied"
	// ResultError — gateway tự hỏng (500). Tách khỏi `denied` vì hai con số này
	// gọi hai người khác nhau dậy lúc nửa đêm.
	ResultError = "error"
)

// ReasonOK là nhãn `reason` cho nhánh accepted — nhãn rỗng làm PromQL
// `sum by (reason)` đẻ ra một series không tên mà không ai đọc được.
const ReasonOK = "ok"

// Nhãn `direction` của dlp_gateway_ws_bytes_total, theo hướng NHÌN TỪ GATEWAY.
const (
	// DirectionIn — byte client gửi lên (stdin của pod).
	DirectionIn = "in"
	// DirectionOut — byte pod trả về (stdout ra client).
	DirectionOut = "out"
)

// Nhãn `kind` của dlp_gateway_exec_errors_total.
const (
	// KindDial — không dựng được executor tới apiserver (RBAC, config hỏng).
	KindDial = "dial"
	// KindStream — stream đang chạy thì đứt vì lỗi hạ tầng (không phải exit code).
	KindStream = "stream"
)

// Nhãn `result` của dlp_gateway_extend_total. Một lượt gọi Extend đóng góp ĐÚNG
// MỘT lần tăng, vào kết quả CUỐI CÙNG của nó.
const (
	// ExtendOK — gia hạn thành công, còn đường gia hạn tiếp.
	ExtendOK = "ok"
	// ExtendHardCap — thành công NHƯNG đã bị trần cứng cắt, hoặc đã qua trần.
	ExtendHardCap = "hard_cap"
	// ExtendGone — session không còn / sai chủ / trạng thái không cho gia hạn.
	ExtendGone = "gone"
	// ExtendError — lỗi hạ tầng (Redis, gRPC, orchestrator chết). Phiên KHÔNG bị
	// giết vì cái này; lần tick sau thử lại.
	ExtendError = "error"
)

// Metrics giữ mọi collector của gateway.
type Metrics struct {
	// WSActive là số kết nối terminal đang mở. GAUGE — câu hỏi là "bây giờ có
	// bao nhiêu", không phải "từ đầu tới giờ bao nhiêu".
	WSActive prometheus.Gauge

	// WSConnectionsTotal tách theo kết quả VÀ lý do. `reason` lấy đúng chuỗi
	// `code` mà handshake trả về trong body, nên dashboard và thứ FE nhìn thấy
	// là CÙNG một từ vựng — không phải hai bảng mã phải dịch qua lại.
	WSConnectionsTotal *prometheus.CounterVec

	// ExecErrorsTotal tách theo tầng hỏng. Exit code KHÔNG vào đây: shell thoát
	// là chuyện bình thường, trộn nó vào đây làm "lỗi exec" mất nghĩa báo động.
	ExecErrorsTotal *prometheus.CounterVec

	// WSBytesTotal đo lưu lượng hai chiều. Không có nó thì "terminal chậm" không
	// phân biệt được với "terminal không có ai gõ".
	WSBytesTotal *prometheus.CounterVec

	// AttachDuration đo 101 → `ready`, tức thời gian dựng stream tới PTY.
	//
	// ⛔ ĐÂY LÀ ATTACH, KHÔNG PHẢI CLAIM. Claim xảy ra ở orchestrator TRƯỚC khi
	// WS tồn tại (`dlp_claim_duration_seconds`) — gateway không đo được nó, và
	// đặt tên nhầm là mời người đọc so hai con số không cùng đơn vị việc.
	AttachDuration prometheus.Histogram

	// ExtendTotal tách theo kết quả CUỐI của mỗi lượt gia hạn.
	ExtendTotal *prometheus.CounterVec

	// ExtendRevisionRetryTotal đếm SỰ KIỆN "va revision rồi thử lại", tách hẳn
	// khỏi ExtendTotal.
	//
	// Vì sao không nhét thành một nhãn của ExtendTotal: một lượt gọi có thể va
	// revision RỒI thành công. Đếm cả hai vào cùng counter làm tổng số lượt gọi
	// lớn hơn số lượt gọi thật, và khi đó không ai đọc được tỉ lệ lỗi từ nó nữa.
	// Đây là tín hiệu của đúng cái race mà `revision` sinh ra để chặn (hai tiến
	// trình cùng ghi một session), nên nó đáng một collector riêng.
	ExtendRevisionRetryTotal prometheus.Counter
}

// New dựng và ĐĂNG KÝ mọi collector vào registry cho trước.
//
// MustRegister có chủ ý: trùng tên metric là lỗi lập trình phát hiện được lúc
// khởi động, không phải điều kiện runtime cần xử lý mềm.
func New(reg prometheus.Registerer) *Metrics {
	m := &Metrics{
		WSActive: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "dlp_gateway_ws_active",
			Help: "Số kết nối terminal WebSocket đang mở.",
		}),

		WSConnectionsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_ws_connections_total",
			Help: "Lượt handshake WS, tách theo kết quả (accepted/denied/error) và lý do — `reason` dùng đúng mã `code` trả về cho client.",
		}, []string{"result", "reason"}),

		ExecErrorsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_exec_errors_total",
			Help: "Lỗi của cầu exec, tách theo tầng (dial/stream). Exit code của shell KHÔNG tính là lỗi.",
		}, []string{"kind"}),

		WSBytesTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_ws_bytes_total",
			Help: "Byte đi qua cầu terminal, theo hướng nhìn từ gateway (in = client→pod, out = pod→client).",
		}, []string{"direction"}),

		AttachDuration: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name: "dlp_gateway_attach_duration_seconds",
			Help: "Thời gian từ 101 tới control `ready` — dựng stream tới PTY của pod. KHÔNG phải claim latency (đó là dlp_claim_duration_seconds bên orchestrator).",
			// Spike đo attach ~0.4s trên cluster lab. Bucket mặc định của
			// Prometheus chỉ có .25/.5/1 quanh vùng đó — quá thưa để nói được
			// 0.4 đã thành 0.9 hay chưa. Kéo dài tới 30s vì `attachGrace` +
			// dial chậm khi apiserver nghẽn vẫn phải rơi vào một bucket thật
			// thay vì dồn hết vào +Inf.
			Buckets: []float64{
				0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10, 30,
			},
		}),

		ExtendTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_extend_total",
			Help: "Lượt ExtendSession gateway gọi, tách theo kết quả cuối (ok/hard_cap/gone/error). Đúng một lần tăng cho mỗi lượt gọi.",
		}, []string{"result"}),

		ExtendRevisionRetryTotal: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "dlp_gateway_extend_revision_retry_total",
			Help: "Lượt gia hạn va revision rồi phải đọc lại và thử lại — dấu vết hai tiến trình cùng ghi một session.",
		}),
	}

	reg.MustRegister(
		m.WSActive,
		m.WSConnectionsTotal,
		m.ExecErrorsTotal,
		m.WSBytesTotal,
		m.AttachDuration,
		m.ExtendTotal,
		m.ExtendRevisionRetryTotal,
	)

	// Khởi tạo về 0 mọi nhãn biết trước. Không có bước này thì một alert kiểu
	// `rate(dlp_gateway_extend_total{result="gone"}[5m]) > 0` trả NO-DATA cho
	// tới lần đầu tiên nó xảy ra — và no-data trông y hệt "mọi thứ đều ổn" trên
	// dashboard. Cùng lý lẽ với orchestrator/internal/metrics.
	//
	// Nhãn `reason` của WSConnectionsTotal KHÔNG khởi tạo ở đây: từ vựng của nó
	// thuộc về wsroute (nó là mã trả cho client), và chỉ wsroute biết mã nào đi
	// với `denied` còn mã nào đi với `error`. Nhân bản danh sách sang package
	// này là dựng hai bảng mã rồi chờ chúng trôi khỏi nhau.
	for _, r := range []string{DirectionIn, DirectionOut} {
		m.WSBytesTotal.WithLabelValues(r)
	}
	for _, k := range []string{KindDial, KindStream} {
		m.ExecErrorsTotal.WithLabelValues(k)
	}
	for _, r := range []string{ExtendOK, ExtendHardCap, ExtendGone, ExtendError} {
		m.ExtendTotal.WithLabelValues(r)
	}

	return m
}
