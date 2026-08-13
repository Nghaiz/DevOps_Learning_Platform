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

// Nhãn `phase` của dlp_gateway_attach_phase_seconds — năm chặng con, nối đuôi
// nhau, phủ ĐÚNG khoảng mà dlp_gateway_attach_duration_seconds đo (1.G-4 M1).
//
// Thứ tự thời gian:
//
//	101 ─PhaseWaitInit─► init ─PhaseBuildExec─► executor ─PhaseUpgrade─►
//	101-từ-apiserver ─PhaseStreams─► stream đã dựng ─PhasePTY─► `ready`
const (
	// PhaseWaitInit — 101 tới lúc nhận frame `init` của client.
	//
	// ⛔ ĐÂY LÀ THỜI GIAN CỦA CLIENT, không phải công của gateway. Contract §3
	// bước 4 bắt đợi `init` TRƯỚC khi dial (để dial đúng kích thước cửa sổ ngay
	// từ đầu), nên nó nằm trong khoảng 101→`ready` một cách hợp lệ — nhưng đọc
	// nó thành "gateway chậm" là quy sai trách nhiệm.
	PhaseWaitInit = "wait_init"

	// PhaseBuildExec — dựng executor: hai lượt TLSConfigFor (WS + SPDY), mỗi
	// lượt đọc và parse CA. Thuần CPU + đĩa cục bộ, không chạm mạng.
	PhaseBuildExec = "build_exec"

	// PhaseUpgrade — TCP + TLS + HTTP-101 tới apiserver, đo quanh RoundTrip.
	//
	// ⛔ LÀ MỘT SỐ GỘP, và ranh giới đó không phải lười: `transport/websocket`.
	// RoundTripper chỉ có TLSConfig/Proxier/Conn — KHÔNG có field Dial — nên
	// rest.Config.Dial bị bỏ qua trên đường WS và không có chỗ nào tách được
	// TCP khỏi TLS mà không fork client-go.
	PhaseUpgrade = "upgrade"

	// PhaseStreams — upgrade xong tới lúc client-go dựng xong các stream.
	//
	// Đo bằng lượt Read ĐẦU TIÊN trên pipe stdin: streamProtocolV4.stream gọi
	// createStreams → close(ready) → copyStdin trước copyStdout. Là một PROXY,
	// vì copyStdin spawn goroutine (v2.go:95) nên nó cộng thêm độ trễ lập lịch.
	PhaseStreams = "streams"

	// PhasePTY — stream đã dựng tới byte stdout ĐẦU TIÊN, tức `ready`.
	//
	// Gộp apiserver → kubelet → CRI → `tmux attach` → shell vẽ ký tự đầu. Toàn
	// bộ nằm NGOÀI gateway; gateway chỉ ngồi đợi.
	PhasePTY = "pty"
)

// Nhãn `reason` của dlp_gateway_attach_phase_incomplete_total.
//
// ⛔ HAI NHÃN VÌ HAI CHẨN ĐOÁN, KHÔNG PHẢI VÌ CHI TIẾT. Gộp một counter thì
// không phân biệt được "hook không bao giờ chạy" (lỗi hệ thống, phải đi sửa)
// với "goroutine lệch lịch" (hiếm, vô hại, kệ nó) — đúng lý lẽ đã dùng để tách
// dlp_reaper_stale_image_pods_total khỏi dlp_reaper_dead_free_pods_total.
//
// Kèm một tác dụng phụ đáng giá: tách ra thì guard mốc-rỗng mới có ca test giết
// được nó. Trước khi tách, `IsZero()` là mã không thể đỏ (mốc rỗng là năm 1 nên
// luôn thoả `Before`), và một guard không thể đỏ là guard không gác gì.
const (
	// ReasonMissingMark — một mốc chưa bao giờ được đặt: hook không chạy. Khác 0
	// một cách đều đặn nghĩa là instrumentation HỎNG, không phải hệ thống chậm.
	ReasonMissingMark = "missing_mark"

	// ReasonOutOfOrder — mốc có đủ nhưng lệch thứ tự thời gian, tức goroutine
	// `copyStdin` của client-go được lập lịch sau byte stdout đầu tiên. Vài lượt
	// lẻ là bình thường.
	ReasonOutOfOrder = "out_of_order"
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

	// AttachPhase chia AttachDuration thành năm chặng nối đuôi (1.G-4 M1).
	//
	// Tồn tại vì con số tổng KHÔNG quy được trách nhiệm: 0.75s có thể là gateway
	// chậm, apiserver chậm, hay client gửi `init` muộn — ba nguyên nhân đòi ba
	// hành động khác nhau và một histogram tổng không phân biệt được.
	AttachPhase *prometheus.HistogramVec

	// AttachControlled đo phần của attach mà GATEWAY KIỂM SOÁT ĐƯỢC — tức tổng
	// bốn chặng đầu, KHÔNG gồm `pty`.
	//
	// Tồn tại vì đây là đại lượng mà AC gác (1.G-4 P4). Không suy ra được từ
	// AttachPhase: p95 của một tổng KHÔNG bằng tổng các p95, nên muốn gác p95
	// của tổng thì phải cộng từng lượt rồi phát một mẫu — đúng việc histogram
	// này làm.
	//
	// ⛔ VÌ SAO TÁCH KHỎI AttachDuration. Đo 1.G-4 trên cụm: `pty` (apiserver →
	// kubelet → CRI → tmux) chiếm 62–78% và KHÔNG đổi khi trần CPU gateway đi
	// từ 150m lên 2000m — nó là sàn hạ tầng, gateway không chạm tới được ở P1.
	// Một ô AC gác trên tổng vì thế đỏ vì hạ tầng và không bao giờ đỏ vì
	// gateway: chính chế độ hỏng mà nó tồn tại để bắt thì nó lại mù. Đại lượng
	// này thì đỏ đúng khi gateway chậm đi.
	AttachControlled prometheus.Histogram

	// AttachPhaseIncompleteTotal đếm lượt attach mà phép chia chặng KHÔNG dùng
	// được (thiếu mốc, hoặc các mốc lệch thứ tự thời gian).
	//
	// ⛔ TỒN TẠI ĐỂ PHÉP ĐO BIẾT TỰ NHẬN SAI. Mốc PhaseStreams đến từ một
	// goroutine (client-go copyStdin) nên thứ tự với byte stdout đầu tiên KHÔNG
	// được đảm bảo — chỉ gần như luôn đúng. Kẹp số âm về 0 thì bảng phân bổ vẫn
	// "hợp lý" trong khi nó đang bịa; bỏ qua lượt đó và đếm riêng thì phép so
	// `count(phase) == count(attach)` của probe phát hiện được ngay.
	AttachPhaseIncompleteTotal *prometheus.CounterVec

	// ExtendTotal tách theo kết quả CUỐI của mỗi lượt gia hạn.
	ExtendTotal *prometheus.CounterVec

	// ExecOneShotTotal đếm lượt gọi `POST /exec/session/{id}` — nút "Check" của
	// trụ cột Lessons (P2 / 2.C).
	//
	// ⛔ TÁCH KHỎI WSConnectionsTotal dù cùng chuỗi authz và cùng từ vựng `code`.
	// Hai đường có tần suất khác nhau vài bậc (một lượt attach mỗi phiên, so với
	// một lượt chấm mỗi lần bấm Check) và hai chế độ hỏng khác nhau. Gộp chúng
	// thì một cơn bão "Check" sẽ dìm tỉ lệ từ chối của handshake xuống dưới
	// ngưỡng alert, và đúng cảnh báo IDOR mà G3 dựng lên sẽ im lặng.
	//
	// KHÔNG đếm exit code ở đây: script chấm trả khác 0 là KẾT QUẢ hợp lệ ("bài
	// chưa đúng"), không phải lỗi — cùng lý lẽ với việc ExecErrorsTotal không
	// đếm exit code của shell.
	ExecOneShotTotal *prometheus.CounterVec

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

		AttachPhase: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "dlp_gateway_attach_phase_seconds",
			Help: "Năm chặng con nối đuôi của 101 → `ready`. Tổng năm chặng của một lượt attach bằng đúng một mẫu của dlp_gateway_attach_duration_seconds.",
			// ⛔ KHÔNG dùng lại bucket của AttachDuration. Các chặng nhỏ hơn tổng
			// một bậc: `build_exec` tính bằng mili-giây, `wait_init` trong cụm
			// gần bằng một RTT. Bucket nhỏ nhất của AttachDuration là 0.05, nên
			// bốn trong năm chặng sẽ dồn hết vào bucket đầu và bảng phân bổ mất
			// sạch độ phân giải — một histogram "có số" mà không nói được gì.
			Buckets: []float64{
				0.001, 0.0025, 0.005, 0.01, 0.025, 0.05,
				0.1, 0.15, 0.2, 0.3, 0.5, 0.75, 1, 2, 5,
			},
		}, []string{"phase"}),

		AttachControlled: prometheus.NewHistogram(prometheus.HistogramOpts{
			Name: "dlp_gateway_attach_controlled_seconds",
			Help: "Phần của 101 → `ready` mà gateway kiểm soát được: wait_init + build_exec + upgrade + streams. KHÔNG gồm `pty` (apiserver → kubelet → CRI → tmux), vốn là sàn hạ tầng.",
			// 0.15 là MỘT MỐC BUCKET có chủ ý: đó đúng là ngưỡng AC, và p95 của
			// histogram Prometheus đọc ra là chặn trên của bucket. Không có mốc
			// đó thì "p95 < 150ms" không bao giờ khẳng định được — con số gần
			// nhất sẽ là 0.2, và ô AC sẽ đỏ vì độ phân giải của dụng cụ chứ
			// không vì hệ thống. Cùng bài học với bucket 0.5→0.75 của
			// AttachDuration, thứ khiến 1.G-4 không phân biệt nổi 0.52 với 0.74.
			Buckets: []float64{
				0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.125, 0.15, 0.2, 0.3, 0.5, 1,
			},
		}),

		AttachPhaseIncompleteTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_attach_phase_incomplete_total",
			Help: "Lượt attach bị loại khỏi phép chia chặng, tách theo lý do (missing_mark = hook không chạy; out_of_order = goroutine lệch lịch). Khác 0 nghĩa là bảng phân bổ KHÔNG phủ hết mẫu.",
		}, []string{"reason"}),

		ExtendTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_extend_total",
			Help: "Lượt ExtendSession gateway gọi, tách theo kết quả cuối (ok/hard_cap/gone/error). Đúng một lần tăng cho mỗi lượt gọi.",
		}, []string{"result"}),

		ExecOneShotTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "dlp_gateway_exec_oneshot_total",
			Help: "Lượt exec one-shot (chấm step của Lessons), tách theo kết quả (accepted/denied/error) và lý do — `reason` dùng đúng mã `code` trả về cho người gọi. Exit code của script KHÔNG tính vào đây.",
		}, []string{"result", "reason"}),

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
		m.AttachPhase,
		m.AttachControlled,
		m.AttachPhaseIncompleteTotal,
		m.ExtendTotal,
		m.ExecOneShotTotal,
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
	// Năm chặng khởi tạo về 0 vì probe của 1.G-4 so `count` của TỪNG chặng với
	// `count` của AttachDuration để biết bảng phân bổ có phủ hết mẫu không. Một
	// nhãn vắng mặt trả NO-DATA, mà no-data trông y hệt "chặng đó bằng 0".
	for _, p := range []string{PhaseWaitInit, PhaseBuildExec, PhaseUpgrade, PhaseStreams, PhasePTY} {
		m.AttachPhase.WithLabelValues(p)
	}
	for _, r := range []string{ReasonMissingMark, ReasonOutOfOrder} {
		m.AttachPhaseIncompleteTotal.WithLabelValues(r)
	}

	return m
}
