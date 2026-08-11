package podexec

import (
	"time"
	"unicode/utf8"
)

// ControlIn là control message Client → Server (contract §4, camelCase).
//
// `init` CHỈ mang cols/rows. KHÔNG có field `shell`/`command`: lệnh exec là hằng
// số phía server, và cho client chọn lệnh là cho client chọn thứ chạy trong pod.
type ControlIn struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

// ControlOut là control message Server → Client (contract §5).
//
// `hardCapAt` CỐ Ý VẮNG ở chặng 1.C-2 dù contract §5 có liệt kê nó — xem
// buildReady.
type ControlOut struct {
	Type string `json:"type"`

	// ready
	SessionID     string `json:"sessionId,omitempty"`
	PodName       string `json:"podName,omitempty"`
	ExpiresAt     string `json:"expiresAt,omitempty"`
	MaxFrameBytes int    `json:"maxFrameBytes,omitempty"`

	// expiring
	//
	// `omitempty` như mọi field khác của struct này: một ControlOut phục vụ đủ
	// bốn `type`, nên field không thuộc về message đang gửi phải BIẾN MẤT, không
	// phải xuất hiện dưới dạng zero value — `ready` mang theo `hardCapReached:
	// false` là mời FE đọc một câu trả lời cho câu hỏi chưa ai hỏi.
	//
	// Hệ quả FE phải biết (và contract §5 nói rõ): trên `expiring`, vắng field
	// đồng nghĩa `false` — "hạn vừa dịch, chưa chạm trần". Trong TS thì
	// `!msg.hardCapReached` xử lý đúng cả hai dạng.
	HardCapReached bool `json:"hardCapReached,omitempty"`

	// error
	Code    string `json:"code,omitempty"`
	Message string `json:"message,omitempty"`

	// exit
	ExitCode *int `json:"exitCode,omitempty"`
}

// Giới hạn kích thước cửa sổ theo contract §4. Ngoài khoảng thì CLAMP và log,
// KHÔNG đóng kết nối: một bug layout phía FE không đáng để sinh viên mất phiên.
const (
	minTermDim = 1
	maxTermDim = 1000
)

// clampDim ép cols/rows về khoảng hợp lệ. Trả cờ `clamped` để caller log đúng
// một lần thay vì im lặng sửa số của client.
func clampDim(v uint16) (uint16, bool) {
	switch {
	case v < minTermDim:
		return minTermDim, true
	case v > maxTermDim:
		return maxTermDim, true
	default:
		return v, false
	}
}

// maxCloseReasonBytes là trần cho `reason` của close frame.
//
// Payload close frame tối đa 125 byte, 2 byte đầu là mã ⇒ còn 123 cho reason.
// Tiếng Việt có dấu là 2–3 byte mỗi ký tự nên một câu ngắn đã vượt — cắt ở tầng
// gửi, đừng tin caller (contract §6).
const maxCloseReasonBytes = 123

// truncateReason cắt theo BYTE nhưng KHÔNG cắt giữa một rune.
//
// Cắt bừa giữa rune tạo ra byte UTF-8 không hợp lệ trong close frame; RFC 6455
// bắt reason phải là UTF-8 hợp lệ, nên thư viện phía kia có quyền coi cả close
// frame là lỗi giao thức — biến một lần đóng có lý do thành một lần đóng hỏng.
func truncateReason(s string) string {
	if len(s) <= maxCloseReasonBytes {
		return s
	}
	cut := maxCloseReasonBytes
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}

// epochToRFC3339 đổi epoch giây (dạng Redis lưu) sang RFC3339 UTC — đúng dạng
// contract §5 ví dụ (`"2026-08-09T12:00:00Z"`), thứ mà `new Date()` của FE nuốt
// trực tiếp.
//
// ts ≤ 0 trả chuỗi rỗng để `omitempty` bỏ hẳn field: FE đọc field VẮNG dễ hơn
// nhiều so với đọc một mốc "1970-01-01" trông như dữ liệu thật.
func epochToRFC3339(ts int64) string {
	if ts <= 0 {
		return ""
	}
	return time.Unix(ts, 0).UTC().Format(time.RFC3339)
}
