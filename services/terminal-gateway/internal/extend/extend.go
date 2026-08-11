// Package extend gọi `ExtendSession` của orchestrator thay cho cầu terminal (G7).
//
// Nó tồn tại tách khỏi `podexec` vì hai lý do:
//
//  1. Cầu terminal không nên biết gì về gRPC. `podexec` khai một interface hẹp
//     (`podexec.Extender`) và package này hiện thực nó — consumer định nghĩa
//     interface, đúng lối Go, và test của cầu chạy được mà không cần dựng server.
//  2. Việc PHÂN LOẠI một `FailedPrecondition` cần đọc lại Redis, tức cần cả
//     client gRPC lẫn store. Nhét nó vào cầu là trộn ba mối quan tâm.
//
// # Vì sao phải phân loại — và vì sao không so chuỗi
//
// `mapExtendError` của orchestrator trả `FailedPrecondition` cho BA nguyên nhân
// khác hẳn nhau: revision lệch, trạng thái không cho gia hạn, và đã qua trần
// cứng. Ba nguyên nhân đó đòi ba hành vi khác nhau ở gateway — thử lại, đóng
// `4404`, đóng `4409` — nên gộp chúng làm một là chọn sai ít nhất hai trong ba
// lần.
//
// Đường phân loại HIỂN NHIÊN là so `err.Error()` với thông báo tiếng Việt của
// orchestrator. Nó bị loại: chuỗi đó là văn xuôi cho người đọc, không ai coi nó
// là contract, và ngày ai đó sửa một dấu phẩy thì gateway lặng lẽ phân loại sai
// mà không test nào của HAI service đỏ. Thay vào đó `classify` đọc LẠI hash và
// suy ra nguyên nhân từ BẰNG CHỨNG — revision đã đổi chưa, status còn chạy được
// không, `createdAt` có tồn tại không. Cùng dữ liệu mà script đã dùng để quyết
// định, đọc từ cùng một nguồn.
package extend

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// errPrecondition là `FailedPrecondition` chưa phân loại — sống trong đúng một
// hàm, không bao giờ ra khỏi package.
var errPrecondition = errors.New("extend: orchestrator từ chối, chưa rõ nguyên nhân")

// Reader là phần store mà package này cần. Hẹp có chủ ý: nó chỉ ĐỌC.
type Reader interface {
	Get(ctx context.Context, sessionID string) (*sessionstore.Session, error)
}

// Extender hiện thực podexec.Extender bằng gRPC tới orchestrator.
type Extender struct {
	client orchestratorv1.SessionServiceClient
	store  Reader
	log    *slog.Logger
	met    *metrics.Metrics
}

// New dựng Extender.
func New(client orchestratorv1.SessionServiceClient, store Reader, log *slog.Logger, met *metrics.Metrics) *Extender {
	return &Extender{client: client, store: store, log: log, met: met}
}

// Extend đẩy idle-deadline của session về phía trước.
//
// `userID` tới từ `sub` của token ĐÃ VERIFY (wsroute bước d/g), KHÔNG từ frame
// client — proto nói rõ điều đó, và nó là vế authz duy nhất orchestrator có ở
// RPC này.
//
// Thử lại ĐÚNG MỘT LẦN khi va revision, và chỉ sau khi đã xác minh session còn
// đúng chủ + còn sống. Không có phép xác minh đó thì "thử lại" biến thành hồi
// sinh một session mà reaper vừa chuyển sang EXPIRED — chính cái race mà
// `revision` sinh ra để chặn.
func (e *Extender) Extend(ctx context.Context, sessionID, userID string) (podexec.ExtendResult, error) {
	res, err := e.try(ctx, sessionID, userID)
	if !errors.Is(err, errPrecondition) {
		return e.record(res, err)
	}

	cause, cerr := e.classify(ctx, sessionID, userID, res.sentRevision)
	if cerr != nil {
		return e.record(attempt{}, cerr)
	}
	if cause != causeRevision {
		return e.record(attempt{result: cause.result()}, nil)
	}

	// Va revision THẬT: có tiến trình khác vừa ghi session này.
	e.met.ExtendRevisionRetryTotal.Inc()
	res, err = e.try(ctx, sessionID, userID)
	if !errors.Is(err, errPrecondition) {
		return e.record(res, err)
	}

	// Vẫn lệch sau một lần đọc lại. KHÔNG thử tiếp: hoặc có một tiến trình đang
	// ghi liên tục (thử lại chỉ nối dài cuộc đua), hoặc lần này là nguyên nhân
	// khác. Phân loại lần cuối rồi trả về — mặc định của nhánh này là `gone`,
	// đúng theo hợp đồng G7 "vẫn lệch → đóng 4404".
	cause, cerr = e.classify(ctx, sessionID, userID, res.sentRevision)
	if cerr != nil {
		return e.record(attempt{}, cerr)
	}
	if cause == causeRevision {
		cause = causeGone
	}
	return e.record(attempt{result: cause.result()}, nil)
}

// attempt là kết quả một lượt gọi RPC, kèm revision đã gửi để `classify` so lại.
type attempt struct {
	result       podexec.ExtendResult
	sentRevision int64
}

// try đọc revision hiện tại rồi gọi RPC đúng một lần.
func (e *Extender) try(ctx context.Context, sessionID, userID string) (attempt, error) {
	sess, err := e.store.Get(ctx, sessionID)
	switch {
	case errors.Is(err, sessionstore.ErrNotFound):
		return attempt{result: podexec.ExtendResult{Outcome: podexec.ExtendGone}}, nil
	case err != nil:
		return attempt{}, fmt.Errorf("extend: đọc session trước khi gia hạn: %w", err)
	}
	if sess.UserID != userID || !sess.Active() {
		// Chủ đã lệch hoặc trạng thái đã sang cuối đời trong lúc phiên đang chạy.
		// Bắt ở đây thay vì để RPC bắt: cùng kết luận, ít hơn một round-trip, và
		// không mượn oracle của orchestrator để tự trả lời câu mình đọc được.
		return attempt{result: podexec.ExtendResult{Outcome: podexec.ExtendGone}}, nil
	}

	resp, err := e.client.ExtendSession(ctx, &orchestratorv1.ExtendSessionRequest{
		SessionId: sessionID,
		UserId:    userID,
		// 0 = dùng idle-window mặc định của SERVER. Gateway cố ý không mang con
		// số riêng: `EXTEND_DEFAULT` là config của orchestrator, và dựng bản sao
		// thứ hai của nó ở đây là đúng thứ phase-1 đã trả giá vài lần.
		ExtendSeconds:    0,
		ExpectedRevision: sess.Revision,
	})
	if err != nil {
		switch status.Code(err) {
		case codes.FailedPrecondition:
			return attempt{sentRevision: sess.Revision}, errPrecondition
		case codes.NotFound, codes.PermissionDenied:
			// NotFound gộp cả "không tồn tại" lẫn "sai chủ" — orchestrator cố ý
			// không tách hai thứ đó để khỏi thành oracle dò id. Gateway không
			// cần tách chúng: cả hai đều là "đừng cho gõ tiếp".
			return attempt{result: podexec.ExtendResult{Outcome: podexec.ExtendGone}}, nil
		default:
			return attempt{}, fmt.Errorf("extend: gọi ExtendSession: %w", err)
		}
	}

	return attempt{
		sentRevision: sess.Revision,
		result: podexec.ExtendResult{
			Outcome:        podexec.ExtendOK,
			ExpiresAt:      resp.GetSession().GetExpiresAt().GetSeconds(),
			HardCapReached: resp.GetHardCapReached(),
		},
	}, nil
}

// cause là nguyên nhân THẬT của một FailedPrecondition, suy ra từ hash.
type cause int

const (
	causeRevision cause = iota // revision đã đổi ⇒ đáng thử lại
	causeGone                  // session mất / sai chủ / trạng thái cuối đời
	causeHardCap               // đã qua trần cứng, không còn gì để gia hạn
)

func (c cause) result() podexec.ExtendResult {
	if c == causeHardCap {
		return podexec.ExtendResult{Outcome: podexec.ExtendHardCap}
	}
	return podexec.ExtendResult{Outcome: podexec.ExtendGone}
}

// classify đọc lại hash và suy ra nguyên nhân. Thứ tự các phép kiểm là thứ tự
// của chính `extend.lua` — đọc song song hai file sẽ thấy chúng khớp nhau.
func (e *Extender) classify(ctx context.Context, sessionID, userID string, sentRevision int64) (cause, error) {
	sess, err := e.store.Get(ctx, sessionID)
	switch {
	case errors.Is(err, sessionstore.ErrNotFound):
		return causeGone, nil
	case err != nil:
		return 0, fmt.Errorf("extend: đọc lại session để phân loại: %w", err)
	}

	if sess.UserID != userID || !sess.Active() {
		return causeGone, nil
	}

	if sess.CreatedAt == 0 {
		// `extend.lua` cũng trả `state:` cho ca này, nhưng nó KHÔNG phải trạng
		// thái cuối đời — nó là hash hỏng, và đóng `4409`/`4404` cho nó là giấu
		// một sự cố dữ liệu sau một thông báo vòng đời bình thường.
		return 0, fmt.Errorf("extend: session %s thiếu createdAt — hash hỏng, không suy được trần cứng",
			sessionID)
	}

	if sess.Revision != sentRevision {
		return causeRevision, nil
	}

	// Còn đúng chủ, còn chạy được, hash lành, revision KHÔNG đổi ⇒ thứ script
	// từ chối không phải revision và không phải state. Chỉ còn trần cứng.
	return causeHardCap, nil
}

// record cập nhật metric rồi trả kết quả ra ngoài. Một lượt gọi Extend đóng góp
// ĐÚNG MỘT lần tăng — xem comment của metrics.ExtendRevisionRetryTotal.
func (e *Extender) record(a attempt, err error) (podexec.ExtendResult, error) {
	if err != nil {
		e.met.ExtendTotal.WithLabelValues(metrics.ExtendError).Inc()
		return podexec.ExtendResult{}, err
	}
	switch {
	case a.result.Outcome == podexec.ExtendGone:
		e.met.ExtendTotal.WithLabelValues(metrics.ExtendGone).Inc()
	case a.result.Outcome == podexec.ExtendHardCap, a.result.HardCapReached:
		e.met.ExtendTotal.WithLabelValues(metrics.ExtendHardCap).Inc()
	default:
		e.met.ExtendTotal.WithLabelValues(metrics.ExtendOK).Inc()
	}
	return a.result, nil
}
