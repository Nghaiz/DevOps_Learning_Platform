package podexec

import (
	"context"
	"log/slog"
	"strconv"
	"time"
)

// Ghi mốc hết hạn của phiên vào pod, cho dòng "Phiên" của màn chào (A6).
//
// # Nửa kia của một vòng đã có sẵn phía đọc
//
// `dlp-motd --field session` trong image sandbox đọc `/run/dlp/session-deadline`
// và in ra thời hạn còn lại. Phía GHI thì tới 2026-09-08 mới có
// (`images/sandbox-base/bin/dlp-session-deadline`, commit 5eaf76b), nên trước
// file này dòng "Phiên" CHƯA TỪNG hiện ra một lần nào: fastfetch bỏ hẳn dòng khi
// module `command` trả output rỗng.
//
// # Vì sao gateway là người gọi, không phải pod tự biết
//
// Pod sandbox đến từ **warm pool** — nó được tạo TRƯỚC khi biết phiên nào claim
// nó và có thể nằm chờ hàng phút. Nên `podStart + SESSION_TTL` sai đúng bằng
// khoảng chờ đó, và env của PID 1 không mang nổi một mốc riêng cho phiên.
// Gateway là chỗ đầu tiên biết `ExpiresAt` thật (nó đọc hash `session:{id}`),
// nên nó là chỗ đúng để ghi.
//
// # Vì sao CHẠY NỀN, và cái giá của lựa chọn đó
//
// Đây là một dòng TRANG TRÍ. Đường attach đã có một lượt gọi apiserver đồng bộ
// (`podAlive` → `pods.Get`, ~75ms ở load 5.8) và p95 attach đang ở 3.7–3.9s —
// tức ô AC đang HỞ. Thêm một `pods/exec` đồng bộ (spike đo ~400ms chỉ riêng
// chặng bắt tay) vào đúng đường đó là làm tệ hơn một thứ đang hở, để đổi lấy
// một dòng chữ.
//
// Cái giá phải trả và phải nói thẳng: lượt ghi ĐUA với chính màn chào nó phục
// vụ. `Serve` bắn goroutine ở dòng đầu tiên — sớm hơn `readInit` (chờ tới 3s) và
// sớm hơn lượt dial exec của terminal — nên nó có lợi thế xuất phát, nhưng
// KHÔNG có đảm bảo nào. Thua cuộc đua ⇒ banner ĐẦU TIÊN thiếu dòng "Phiên",
// những lượt `dlp-motd` sau (pane mới, cửa sổ mới) thì có. Chưa đo trên cụm.
//
// # Vì sao KHÔNG cần cẩn thận với việc ghi lùi
//
// Luật không-lùi nằm TRONG script: nó từ chối ghi một mốc sớm hơn mốc đang giữ
// và thoát 0. Vòng đời phiên chỉ đẩy hạn về sau, nên bất biến đó mua được "giá
// trị hiển thị không bao giờ MUỘN hơn sự thật". Ép luật ở một chỗ (script) thay
// vì ở mọi chỗ gọi là lý do gateway ở đây không phải so gì cả — kể cả khi hai
// lượt ghi tới lệch thứ tự.

// deadlineBinary là tên lệnh trên PATH của pod.
//
// Tên trần, không phải đường tuyệt đối: image đặt nó ở `/usr/local/bin`, và
// PATH của `ubuntu:24.04` có sẵn thư mục đó (Dockerfile chỉ PREPEND thêm
// `/usr/local/dlp-bin`). Cùng cách `dlp-tools` / `dlp-motd` được gọi ở mọi chỗ
// khác — gateway không nên là chỗ duy nhất chép cứng layout của image.
const deadlineBinary = "dlp-session-deadline"

// deadlineWriteTimeout là trần cho MỘT lượt ghi.
//
// Rộng hơn nhiều lần thời gian thật (bắt tay ~400ms + một lượt chạy bash), vì
// nó không phải trần hiệu năng mà là dây buộc goroutine: không có nó thì một
// apiserver treo giữ lại một goroutine mỗi phiên, vĩnh viễn.
const deadlineWriteTimeout = 15 * time.Second

// DeadlineRunner là phần `*OneShotRunner` mà cầu cần.
//
// Interface do CONSUMER khai — cùng lối với `Extender`, và cùng lý do: test của
// cầu phải chạy được mà không dựng apiserver. Bản thật là chính runner đang
// phục vụ nút "Check" (`podexec.NewOneShotRunner`), dùng CHUNG một instance:
// nó không giữ state theo phiên (G9), và dựng bản thứ hai là dựng thêm một ngân
// sách QPS thứ hai lên cùng một apiserver.
type DeadlineRunner interface {
	Run(ctx context.Context, t Target, script string) (OneShotResult, error)
}

// SetDeadlineRunner gắn runner ghi mốc. Gọi TRƯỚC lời gọi Serve đầu tiên.
//
// nil ⇒ TẮT HẲN tính năng, không lỗi. Đó là mặc định của mọi test cũ (chúng
// không khai một thứ chúng không quan tâm), cùng khuôn với `SetPodProbe`.
// ⚠ Hệ quả: production chỉ có dòng "Phiên" nếu `cmd/terminal-gateway/main.go`
// THẬT SỰ gọi hàm này — file có mặt không đủ, phải có người nối dây.
func (b *Bridge) SetDeadlineRunner(r DeadlineRunner) { b.deadlineRunner = r }

// deadlineCommand dựng lệnh chạy trong pod.
//
// `expiresAt` là int64 in ra hệ 10 ⇒ chỉ có chữ số và dấu trừ, không có khoảng
// trắng hay metachar nào của shell. Nên nối chuỗi ở đây không mở bề mặt inject:
// không có đường nào để một giá trị từ Redis biến thành một lệnh thứ hai.
func deadlineCommand(expiresAt int64) string {
	return deadlineBinary + " " + strconv.FormatInt(expiresAt, 10)
}

// pushDeadline ghi mốc hết hạn vào pod — KHÔNG CHẶN người gọi.
//
// ⛔ Không trả lỗi, và đó là hợp đồng chứ không phải lười: không lượt gọi nào
// của hàm này được phép làm hỏng một phiên. Pod dựng bởi ảnh cũ (chuyện bình
// thường trong lúc rollout warm pool) sẽ trả `127 command not found`, và một
// phiên terminal KHÔNG được chết vì thiếu một dòng trang trí.
//
// Nhưng cũng KHÔNG nuốt im lặng: mọi nhánh hỏng đều để lại đúng một dòng log
// đọc được, đủ để phân biệt "ảnh chưa có script" với "apiserver hỏng".
func (b *Bridge) pushDeadline(ctx context.Context, t Target, expiresAt int64) {
	if b.deadlineRunner == nil {
		return
	}
	if expiresAt <= 0 {
		// Hash thiếu `expiresAt`. Script cũng sẽ từ chối (`mốc phải > 0`), nhưng
		// bắt ở đây thì không tốn một lượt `pods/exec` cho một giá trị đã biết
		// là sai — và dòng log này nói về DỮ LIỆU, không về pod.
		b.log.Warn("session không có mốc hết hạn hợp lệ — bỏ qua lượt ghi dòng \"Phiên\"",
			slog.String("session_id", t.SessionID),
			slog.Int64("expires_at", expiresAt))
		return
	}

	// ⛔ `WithoutCancel`: lượt ghi KHÔNG được chết theo chính kết nối mà nó phục
	// vụ. Ở đường attach, goroutine này chạy song song với phần còn lại của
	// `Serve`; nếu nó mượn ctx của phiên thì một lượt attach hỏng sớm (hoặc một
	// người dùng đóng tab ngay) sẽ huỷ lượt ghi giữa chừng và để lại một file
	// rỗng — hỏng nhẹ, nhưng hỏng theo kiểu không ai chẩn đoán được.
	// Timeout ở trên là thứ giữ cho nó không thành goroutine treo.
	go b.pushDeadlineNow(context.WithoutCancel(ctx), t, expiresAt)
}

// pushDeadlineNow là thân đồng bộ của pushDeadline. Tách ra để đọc được, và để
// test gọi thẳng khi cần một phép đo không có cuộc đua.
func (b *Bridge) pushDeadlineNow(ctx context.Context, t Target, expiresAt int64) {
	ctx, cancel := context.WithTimeout(ctx, deadlineWriteTimeout)
	defer cancel()

	res, err := b.deadlineRunner.Run(ctx, t, deadlineCommand(expiresAt))
	switch {
	case err != nil:
		// Hỏng HẠ TẦNG: không dựng được executor, apiserver chết, hết hạn ctx.
		b.log.Warn("không ghi được mốc hết hạn vào pod — dòng \"Phiên\" sẽ trống",
			slog.String("session_id", t.SessionID),
			slog.String("pod", t.PodName),
			slog.Int64("expires_at", expiresAt),
			slog.String("err", err.Error()))
	case res.ExitCode != 0:
		// Script CHẠY nhưng từ chối, hoặc không có trong ảnh (`127`). Tách khỏi
		// nhánh trên vì hai chẩn đoán khác hẳn: `127` nghĩa là pod đến từ ảnh cũ
		// và sẽ tự khỏi khi warm pool xoay hết; mã khác thì đọc `output`.
		b.log.Warn("dlp-session-deadline thoát khác 0 — dòng \"Phiên\" có thể trống",
			slog.String("session_id", t.SessionID),
			slog.String("pod", t.PodName),
			slog.Int64("expires_at", expiresAt),
			slog.Int("exit_code", res.ExitCode),
			slog.String("output", res.Output))
	}
}
