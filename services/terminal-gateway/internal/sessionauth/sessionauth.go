// Package sessionauth giữ MỘT bản duy nhất của chuỗi kiểm quyền phiên (bước
// a, c→h của contract) mà mọi route chạm tới pod của người học đều phải đi qua.
//
// VÌ SAO PACKAGE NÀY TỒN TẠI — nó trả một khoản nợ, không thêm một tầng.
//
// Chuỗi này ban đầu sống trong `wsroute`. Khi `/exec` ra đời, nó được CHÉP TAY
// sang `execroute`: cùng thứ tự bước, cùng mã trả về, cùng lý lẽ trong comment,
// hai bản. Hai bản đồng nghĩa hai thứ có thể trôi khỏi nhau, và cái trôi lệch ở
// đây không đỏ ở đâu cả — nó chỉ mở một cửa mà cửa kia đã đóng. Phase-6 thêm
// route thứ ba (reverse-proxy IDE) và ghi thẳng vào task 9: "dùng LẠI nguyên
// chuỗi authz a→h/a→i của /ws và /exec, KHÔNG viết chuỗi thứ ba." Cách duy nhất
// giữ được lời đó là chuỗi chỉ còn một bản, và đây là bản đó.
//
// ⛔ HAI BƯỚC CỐ Ý KHÔNG NẰM Ở ĐÂY:
//
//   - **b. Subprotocol** — chỉ WebSocket có. Nhét vào đây thì hai route kia phải
//     mang một tham số luôn tắt, và một cờ luôn tắt là một cờ sẽ bị bật nhầm.
//   - **i. Trần WS đồng thời** — nó CHIẾM một khe (INCR + defer release), tức là
//     một side-effect có vòng đời dài hơn hàm này. Gói nó vào một hàm "kiểm tra"
//     là đặt một cái defer vào tay caller mà chữ ký hàm không hề nói ra. Nó ở
//     lại `wsroute`, nơi cái defer nhìn thấy được. Đây cũng chính là lý do
//     `SessionReader` dưới đây KHÔNG có `AcquireWS`: interface hẹp làm bước i
//     không lẻn vào được.
//
// Caller giữ nguyên `deny`/`fail` của mình vì mỗi route bắn một series metric
// khác nhau; package này chỉ TRẢ VỀ quyết định, không tự ghi response.
package sessionauth

import (
	"context"
	"errors"
	"net/http"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
)

// CookieName là cookie mang sandbox token. Một hằng cho cả ba route.
const CookieName = "dlp_sandbox"

// Mã từ chối. Giá trị PHẢI giữ nguyên chuỗi mà wsroute/execroute đã trả từ
// trước — chúng là hợp đồng với FE, không phải chi tiết nội bộ.
const (
	CodeOriginNotAllowed = "ORIGIN_NOT_ALLOWED"
	CodeUnauthenticated  = "UNAUTHENTICATED"
	CodeForbidden        = "FORBIDDEN"
	CodeSessionNotFound  = "SESSION_NOT_FOUND"
	CodeSessionInactive  = "SESSION_NOT_ACTIVE"
)

// Codes là mọi mã chuỗi này có thể phát. Route dùng nó để khởi tạo series metric
// về 0 lúc đăng ký — không có bước đó thì cảnh báo IDOR trả NO-DATA cho tới lần
// tấn công đầu tiên, và no-data trông y hệt "chưa ai tấn công".
var Codes = []string{
	CodeOriginNotAllowed,
	CodeUnauthenticated,
	CodeForbidden,
	CodeSessionNotFound,
	CodeSessionInactive,
}

// TokenVerifier verify sandbox token (bước d).
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (*authz.Claims, error)
}

// SessionReader đọc hash session:{id} (bước f, g, h).
//
// ⛔ KHÔNG có `AcquireWS` — xem chú thích đầu package.
type SessionReader interface {
	Get(ctx context.Context, sessionID string) (*sessionstore.Session, error)
}

// Deps là mọi thứ chuỗi cần. Toàn interface để test chạy được mà không cần Redis
// cho các ca chết trước bước f.
type Deps struct {
	Verifier       TokenVerifier
	Sessions       SessionReader
	AllowedOrigins []string
}

// Denial là một lượt TỪ CHỐI đã có kết luận: status + mã + thông điệp cho client,
// kèm các cặp key/value chỉ dành cho LOG.
//
// Lý do chi tiết chỉ đi vào `LogAttrs`, không vào `Message`: tách các kiểu hỏng
// của token (chữ ký, aud, exp, iss) ra thành thông điệp khác nhau là chỉ cho
// người đang dò biết họ sai ở đâu.
type Denial struct {
	Status   int
	Code     string
	Message  string
	LogAttrs []string
}

// Result là thứ chuỗi trả về khi qua hết.
type Result struct {
	Claims  *authz.Claims
	Session *sessionstore.Session
}

// CheckOrigin là bước a, tách riêng vì `wsroute` phải chèn bước b (subprotocol)
// vào GIỮA a và c, và thứ tự đó là một phần của contract chứ không tuỳ tiện.
//
// Đây là thứ DUY NHẤT đóng CSWSH: handshake WebSocket KHÔNG chịu CORS, nên không
// có lớp nào của trình duyệt chặn giúp.
//
// VẮNG hẳn header thì CHO QUA (contract §3a) — quyết định, không phải sơ suất:
// trình duyệt LUÔN gửi Origin và không tắt được từ JS, nên CSWSH vẫn đóng kín;
// còn fail-closed ở đây chặn wscat/websocat/probe vận hành/test e2e, tức chặn
// chính bộ acceptance IDOR của phase-1.
func (d Deps) CheckOrigin(r *http.Request) *Denial {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return nil
	}
	for _, allowed := range d.AllowedOrigins {
		if origin == allowed {
			return nil
		}
	}
	return &Denial{
		Status:   http.StatusForbidden,
		Code:     CodeOriginNotAllowed,
		Message:  "origin không nằm trong allowlist",
		LogAttrs: []string{"origin", origin},
	}
}

// CheckSession chạy bước c→h và trả session đã xác thực.
//
// Ba đường ra, phân biệt được: qua (Result, nil, nil) · bị từ chối có kết luận
// (nil, *Denial, nil) · lỗi hạ tầng (nil, nil, error) — caller ánh xạ vế thứ ba
// sang `fail`/500 của chính nó, vì chỉ nó biết series metric nào phải tăng.
func (d Deps) CheckSession(ctx context.Context, r *http.Request, sessionID string) (*Result, *Denial, error) {
	// ---- c. Cookie ------------------------------------------------------
	cookie, err := r.Cookie(CookieName)
	if err != nil || cookie.Value == "" {
		return nil, &Denial{
			Status:  http.StatusUnauthorized,
			Code:    CodeUnauthenticated,
			Message: "thiếu cookie " + CookieName,
		}, nil
	}

	// ---- d. Token hợp lệ ------------------------------------------------
	claims, err := d.Verifier.Verify(ctx, cookie.Value)
	if err != nil {
		return nil, &Denial{
			Status:   http.StatusUnauthorized,
			Code:     CodeUnauthenticated,
			Message:  "token không hợp lệ",
			LogAttrs: []string{"reason", err.Error()},
		}, nil
	}

	// ---- e. token.sid == {id} -------------------------------------------
	//
	// Chạy TRƯỚC khi chạm Redis (contract §3b). Hệ quả có chủ ý: mọi `{id}` lạ
	// chết ở đây với 403, KHÔNG phải 404 — nên "id không tồn tại" và "id của
	// người khác" đi qua cùng một dòng code, cùng một mã, không còn kênh phụ
	// thời gian nào để đếm. Đừng đảo thứ tự cho 404 dễ gặp hơn.
	if err := rediskeys.ValidateID(sessionID); err != nil || sessionID != claims.SessionID {
		return nil, &Denial{
			Status:   http.StatusForbidden,
			Code:     CodeForbidden,
			Message:  "token không cấp cho session này",
			LogAttrs: []string{"sub", claims.Subject},
		}, nil
	}

	// ---- f. session:{id} tồn tại ----------------------------------------
	sess, err := d.Sessions.Get(ctx, sessionID)
	switch {
	case errors.Is(err, sessionstore.ErrNotFound):
		// Ca DUY NHẤT chạm được 404: sid khớp mà key đã mất — "session của
		// CHÍNH BẠN đã biến mất" (reap / TTL hết / Redis mất dữ liệu).
		return nil, &Denial{
			Status:   http.StatusNotFound,
			Code:     CodeSessionNotFound,
			Message:  "phiên không còn tồn tại",
			LogAttrs: []string{"sub", claims.Subject},
		}, nil
	case err != nil:
		return nil, nil, err
	}

	// ---- g. hash.userId == token.sub ------------------------------------
	//
	// Vế thứ hai của luật 10. BFF thật không bao giờ mint được token vi phạm nó
	// (nó chỉ mint sid của session vừa tạo cho chính user đó), nên bước này chỉ
	// đỏ khi (1) ai đó forge token, hoặc (2) Redis bị ghi đè. Cả hai đều phải
	// chặn, và cả hai đều KHÔNG tái hiện được bằng một client hợp lệ.
	if sess.UserID != claims.Subject {
		return nil, &Denial{
			Status:   http.StatusForbidden,
			Code:     CodeForbidden,
			Message:  "session không thuộc về chủ token",
			LogAttrs: []string{"sub", claims.Subject},
		}, nil
	}

	// ---- h. status ∈ {CLAIMED, RUNNING} ---------------------------------
	if !sess.Active() {
		return nil, &Denial{
			Status:   http.StatusConflict,
			Code:     CodeSessionInactive,
			Message:  "phiên không ở trạng thái chạy được",
			LogAttrs: []string{"status", sess.Status},
		}, nil
	}

	return &Result{Claims: claims, Session: sess}, nil, nil
}
