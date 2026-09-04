// Package execroute giữ endpoint exec ONE-SHOT của terminal-gateway — đường mà
// nút "Check" của trụ cột Lessons đi qua (P2 / 2.C, docs/scenario-format.md §4).
//
// Quan hệ với `wsroute`: hai package, một chuỗi authz. execroute chạy LẠI đúng
// các bước a→h của docs/ws-terminal-protocol.md §3, và CỐ Ý BỎ bước i (trần WS).
// Nó không dùng chung mã với wsroute vì hai lý do:
//
//   - Bước b (subprotocol) chỉ có nghĩa với một handshake WebSocket. Ép nó vào
//     một endpoint HTTP thường là dựng một nghi thức không ai đọc được.
//   - Bước i PHẢI vắng mặt, và "vắng mặt" là thứ dễ bị vô tình thêm lại nhất khi
//     hai đường dùng chung một hàm. Trần D17=1 nghĩa là một khe WS đang bị
//     terminal của người học chiếm; nếu lượt chấm cũng xin khe thì bấm "Check"
//     sẽ ĐÁ VĂNG chính terminal đó. Tách package làm điều kiện này đọc được.
//
// Điều package này KHÔNG làm: chọn lệnh chạy trong pod, và tự tra pod. `podName`
// / `namespace` tới từ Redis qua bước f — không từ URL, không từ body. Đó là
// thứ làm ô AC "verifyScript chạy TRONG pod cô lập" đúng theo cấu trúc chứ
// không theo lời hứa.
package execroute

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"golang.org/x/time/rate"
)

// CookieName mang sandbox token — CÙNG cookie với đường WS (luật 8).
//
// ⚠ Trình duyệt KHÔNG BAO GIỜ gửi cookie này tới đây: apps/web đặt nó với
// `Path=/ws` (server/trpc/routers/session.ts), nên nó không kèm vào request tới
// `/exec/...`. Người gọi hợp lệ DUY NHẤT là BFF, và BFF tự mint token
// server-side rồi đặt header `Cookie` khi gọi. Không phải sơ suất — đó chính là
// điều làm endpoint này không phơi ra trình duyệt.
// CookieName giữ lại làm alias; SSOT là sessionauth.
const CookieName = sessionauth.CookieName

// Mã lỗi — dùng LẠI đúng từ vựng của wsroute để FE chỉ phải học một bảng mã.
const (
	codeOriginNotAllowed = "ORIGIN_NOT_ALLOWED"
	codeUnauthenticated  = "UNAUTHENTICATED"
	codeForbidden        = "FORBIDDEN"
	codeSessionNotFound  = "SESSION_NOT_FOUND"
	codeSessionInactive  = "SESSION_NOT_ACTIVE"
	codeBadRequest       = "BAD_REQUEST"
	codeExecFailed       = "EXEC_FAILED"
	codeInternal         = "INTERNAL"
)

// maxBodyBytes là trần thân request. Script chấm thật dài vài trăm byte tới vài
// KB; 64 KiB rộng gấp nhiều lần mà vẫn chặn được một body vô hạn làm cạn RAM
// gateway. Trần này nằm ở `http.MaxBytesReader` nên nó cắt ở tầng đọc, không
// phải sau khi đã nuốt hết vào bộ nhớ.
const maxBodyBytes = 64 * 1024

// TokenVerifier verify sandbox token (bước d).
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (*authz.Claims, error)
}

// SessionReader đọc hash session:{id} (bước f, g, h).
//
// ⛔ KHÔNG có `AcquireWS` — xem chú thích đầu package. Interface hẹp lại chính
// là cách bước i không thể lẻn vào.
type SessionReader interface {
	Get(ctx context.Context, sessionID string) (*sessionstore.Session, error)
}

// ScriptRunner chạy script trong pod và trả exit code.
type ScriptRunner interface {
	Run(ctx context.Context, t podexec.Target, script string) (podexec.OneShotResult, error)
}

// Deps là mọi thứ handler cần.
type Deps struct {
	Log            *slog.Logger
	Verifier       TokenVerifier
	Sessions       SessionReader
	Runner         ScriptRunner
	Metrics        *metrics.Metrics
	AllowedOrigins []string
	// Timeout là trần cho MỘT lượt chạy script. Vượt → 504, không phải "fail":
	// một script treo không phải một bài làm sai.
	Timeout time.Duration
}

// denyCodes là mọi mã một bước kiểm ở đây có thể trả. Danh sách sống trong
// package phát ra chúng, cùng lý lẽ với wsroute.
var denyCodes = []string{
	codeOriginNotAllowed,
	codeUnauthenticated,
	codeForbidden,
	codeSessionNotFound,
	codeSessionInactive,
	codeBadRequest,
}

// Register gắn POST /exec/session/{id} vào mux.
func Register(mux *http.ServeMux, deps Deps) {
	h := &handler{
		deps: deps,
		// Cùng lý do với wsroute: endpoint public, chưa xác thực ở thời điểm log.
		denyLimiter: rate.NewLimiter(rate.Every(time.Second), 5),
	}

	deps.Metrics.ExecOneShotTotal.WithLabelValues(metrics.ResultAccepted, metrics.ReasonOK)
	for _, c := range denyCodes {
		deps.Metrics.ExecOneShotTotal.WithLabelValues(metrics.ResultDenied, c)
	}
	for _, c := range []string{codeExecFailed, codeInternal} {
		deps.Metrics.ExecOneShotTotal.WithLabelValues(metrics.ResultError, c)
	}

	mux.HandleFunc("POST /exec/session/{id}", h.serve)
}

type handler struct {
	deps        Deps
	denyLimiter *rate.Limiter
}

// execRequest là thân request.
//
// Chỉ một field, và nó KHÔNG phải "lệnh": nội dung script chấm mà BFF đọc từ
// `Scenario.steps[i].verifyScript` trên đĩa. Ranh giới "script không tới từ
// người dùng" được giữ ở BFF, không ở đây — gateway không có cách nào biết một
// chuỗi đến từ đĩa hay từ form. Điều gateway ĐẢM BẢO là chuỗi đó chỉ chạy được
// trong pod của chính chủ token, và không hơn.
type execRequest struct {
	Script string `json:"script"`
}

type execResponse struct {
	ExitCode  int    `json:"exitCode"`
	Output    string `json:"output"`
	Truncated bool   `json:"truncated"`
}

func (h *handler) serve(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionID := r.PathValue("id")

	// ---- a. Origin ------------------------------------------------------
	//
	// Người gọi hợp lệ (BFF, server-to-server) KHÔNG gửi Origin, nên nhánh
	// "vắng header ⇒ cho qua" của contract §3a là nhánh chạy thật. Phép kiểm vẫn
	// ở đây cho ca một trang web lạ thử gọi từ trình duyệt: nó sẽ có Origin, và
	// nó sẽ không nằm trong allowlist. (Cookie `Path=/ws` đã chặn ca đó một
	// tầng trước, nhưng hai hàng rào rẻ hơn một hàng rào phụ thuộc thuộc tính
	// cookie mà người khác có thể sửa.)
	if d := h.chain().CheckOrigin(r); d != nil {
		h.denyOf(w, r, d)
		return
	}

	// ---- c–h. chuỗi dùng chung ------------------------------------------
	//
	// Trước 6.C khối này là một BẢN CHÉP TAY của wsroute — cùng thứ tự, cùng mã,
	// hai bản trôi độc lập. Giờ chỉ còn một bản, trong `sessionauth`.
	res, denial, err := h.chain().CheckSession(ctx, r, sessionID)
	if denial != nil {
		h.denyOf(w, r, denial)
		return
	}
	if err != nil {
		h.fail(w, r, codeInternal, "đọc session từ Redis", err)
		return
	}
	sess := res.Session

	// ---- thân request ----------------------------------------------------
	//
	// Đọc SAU authz, không trước: một body 64 KiB từ người chưa chứng minh được
	// danh tính không đáng để gateway đọc.
	//
	// 6.C dời chỗ đọc từ GIỮA bước e và f ra SAU trọn chuỗi c–h, vì chuỗi giờ là
	// một khối không chia được. Chặt hơn bản cũ chứ không lỏng hơn: body chỉ được
	// đọc khi đã qua ĐỦ authz. Hệ quả nhìn thấy được: một request vừa sai body
	// vừa trỏ vào phiên đã chết nay trả mã của PHIÊN chứ không phải BAD_REQUEST —
	// đúng thứ tự ưu tiên, vì "phiên của bạn đã hết" là thứ người dùng cần biết.
	script, ok := h.readScript(w, r)
	if !ok {
		return
	}

	// ---- i. KHÔNG CÓ ------------------------------------------------------
	//
	// Trần WS cố ý không áp ở đây — xem chú thích đầu package. Một lượt chấm
	// KHÔNG được đá văng terminal đang mở của chính người học.

	// ---- chạy -------------------------------------------------------------
	runCtx, cancel := context.WithTimeout(ctx, h.deps.Timeout)
	defer cancel()

	startedAt := time.Now()
	result, err := h.deps.Runner.Run(runCtx, podexec.Target{
		SessionID: sessionID,
		PodName:   sess.PodName,
		Namespace: sess.Namespace,
		ExpiresAt: sess.ExpiresAt,
		UserID:    sess.UserID,
	}, script)
	// Quan sát CẢ lượt hỏng lẫn lượt hết hạn: đuôi của histogram này chính là
	// bằng chứng để nâng/hạ GATEWAY_EXEC_TIMEOUT; chỉ đo lượt thành công là
	// cắt đúng phần đuôi cần nhìn.
	h.deps.Metrics.ExecOneShotDuration.Observe(time.Since(startedAt).Seconds())
	if err != nil {
		// Quá hạn tách khỏi hỏng thật: 504 nói "thử lại/bài chạy lâu", 500 nói
		// "gọi người trực". Gộp chúng là dạy người đọc log bỏ qua cả hai.
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) {
			h.fail(w, r, codeExecFailed, "script chạy quá hạn", err)
			return
		}
		h.fail(w, r, codeExecFailed, "chạy script trong pod", err)
		return
	}

	h.deps.Metrics.ExecOneShotTotal.WithLabelValues(metrics.ResultAccepted, metrics.ReasonOK).Inc()

	// ---- dấu vết kiểm toán -------------------------------------------------
	//
	// Nợ P2 §1. Trước dòng này, đường nóng CHỈ log lượt bị TỪ CHỐI: một lượt chấm
	// thành công — tức mã VỪA CHẠY trong pod của một người thật — không để lại dấu
	// vết nào. Danh sách lượt bị chặn tự nó không trả lời được "ai đã chạy gì, ở
	// đâu, lúc nào", mà đó mới là câu hỏi của một cuộc điều tra sự cố.
	//
	// KHÔNG rate-limit như `deny`. Sampling ở `deny` có lý do thật (endpoint public,
	// một vòng `curl` đốt quota Loki), nhưng tới được đây nghĩa là đã qua trọn a→h
	// với token hợp lệ của ĐÚNG chủ phiên. Một audit log tự bỏ bớt dòng thì không
	// còn là audit log — nó thành một mẫu ngẫu nhiên, và khoảng trống trong nó
	// không phân biệt được với "không có gì xảy ra".
	//
	// `exit_code` vào log vì nó là KẾT QUẢ chấm — thứ duy nhất phân biệt "chạy
	// được script" với "chạy được script VÀ bài đúng". `output` thì KHÔNG: tới
	// 8 KiB mỗi lượt, và nó là bài làm của người học chứ không phải dữ kiện kiểm
	// toán. Script cũng không: nó đến từ đĩa, đã biết trước theo `phase`.
	h.deps.Log.Info("chạy exec one-shot",
		slog.String("session_id", sessionID),
		slog.String("user_id", sess.UserID),
		slog.String("pod", sess.PodName),
		slog.String("namespace", sess.Namespace),
		slog.Int("exit_code", result.ExitCode),
		slog.Bool("truncated", result.Truncated),
		slog.Duration("duration", time.Since(startedAt)))

	writeJSON(w, http.StatusOK, execResponse{
		ExitCode:  result.ExitCode,
		Output:    result.Output,
		Truncated: result.Truncated,
	})
}

// readScript đọc + kiểm thân request. Trả false nghĩa là đã ghi lỗi ra `w`.
func (h *handler) readScript(w http.ResponseWriter, r *http.Request) (string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req execRequest
	dec := json.NewDecoder(r.Body)
	// Field lạ → từ chối (luật 3, cùng kỷ luật với Zod `.strict()` phía BFF).
	dec.DisallowUnknownFields()
	if err := dec.Decode(&req); err != nil {
		h.deny(w, r, http.StatusBadRequest, codeBadRequest,
			"thân request không hợp lệ", "reason", err.Error())
		return "", false
	}
	if req.Script == "" {
		// Script rỗng nghĩa là `sh` đọc EOF ngay và thoát 0 — tức mọi step sẽ
		// PASS. Một lỗi lập trình ở BFF khi đó hiện ra dưới dạng "bài nào cũng
		// đúng", chế độ hỏng tệ nhất mà một bộ chấm có thể có.
		h.deny(w, r, http.StatusBadRequest, codeBadRequest,
			"script rỗng — sh sẽ thoát 0 và mọi step thành pass")
		return "", false
	}
	return req.Script, true
}

// chain dựng chuỗi authz dùng chung từ Deps của route này.
func (h *handler) chain() sessionauth.Deps {
	return sessionauth.Deps{
		Verifier:       h.deps.Verifier,
		Sessions:       h.deps.Sessions,
		AllowedOrigins: h.deps.AllowedOrigins,
	}
}

// denyOf dịch Denial của chuỗi sang deny của route này.
func (h *handler) denyOf(w http.ResponseWriter, r *http.Request, d *sessionauth.Denial) {
	h.deny(w, r, d.Status, d.Code, d.Message, d.LogAttrs...)
}

func (h *handler) deny(w http.ResponseWriter, r *http.Request, status int, code, message string, logAttrs ...string) {
	h.deps.Metrics.ExecOneShotTotal.WithLabelValues(metrics.ResultDenied, code).Inc()

	if h.denyLimiter.Allow() {
		attrs := []any{
			slog.String("session_id", r.PathValue("id")),
			slog.Int("status", status),
			slog.String("code", code),
		}
		for i := 0; i+1 < len(logAttrs); i += 2 {
			attrs = append(attrs, slog.String(logAttrs[i], logAttrs[i+1]))
		}
		h.deps.Log.Warn("từ chối exec one-shot", attrs...)
	}
	writeJSON(w, status, errorBody{Code: code, Message: message})
}

// fail là lỗi của CHÍNH hệ thống (Redis chết, apiserver hỏng, script quá hạn) —
// không phải người gọi sai. Log ở mức Error.
func (h *handler) fail(w http.ResponseWriter, r *http.Request, code, what string, err error) {
	h.deps.Metrics.ExecOneShotTotal.WithLabelValues(metrics.ResultError, code).Inc()
	h.deps.Log.Error("exec one-shot lỗi nội bộ",
		slog.String("session_id", r.PathValue("id")),
		slog.String("op", what),
		slog.String("err", err.Error()))

	status := http.StatusInternalServerError
	if code == codeExecFailed {
		// 502: gateway đã làm đúng phần của nó, thứ hỏng nằm ở pod/apiserver.
		status = http.StatusBadGateway
	}
	// Lý do chi tiết CHỈ vào log — nó có thể mang tên pod/namespace.
	writeJSON(w, status, errorBody{Code: code, Message: "không chạy được script trong pod"})
}

type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
