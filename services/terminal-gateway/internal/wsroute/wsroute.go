// Package wsroute giữ endpoint WebSocket của terminal-gateway.
//
// Toàn bộ file này hiện thực ĐÚNG MỘT THỨ: chín bước kiểm TRƯỚC upgrade của
// docs/ws-terminal-protocol.md §3 (a→i). Thứ tự các bước là CONTRACT, không phải
// phong cách — xem §3b: bước e chạy trước bước f là lý do "id đoán bừa" trả 403
// chứ không phải 404, và đó là thứ khoá kênh phụ liệt kê session.
//
// Sau khi qua đủ chín bước, kết nối được giao cho `internal/podexec` — nó nối
// stdin/stdout vào PTY của pod và tự chọn close code khi phiên kết thúc (G4–G6).
// Package này KHÔNG biết gì về exec, và đó là ranh giới cố ý: authz phải đọc
// được trọn vẹn mà không phải cuộn qua logic streaming.
package wsroute

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/drain"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/podexec"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/secheaders"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionstore"
	"github.com/coder/websocket"
	"golang.org/x/time/rate"
)

// Subprotocol là tên + version của giao thức (contract §0). Version nằm ở ĐÂY
// chứ không phải một field `v` trong mỗi message: lệch version thì hỏng ngay ở
// handshake với lỗi rõ ràng, thay vì hỏng ở frame thứ 500 với một `type` lạ.
const Subprotocol = "dlp.terminal.v1"

// CookieName mang sandbox token. Contract §2 + luật 8: token CHỈ tới từ đây —
// không query string, không header tự chế.
// CookieName giữ lại làm alias để test và caller cũ không phải sửa; SSOT là
// sessionauth.
const CookieName = sessionauth.CookieName

// Mã lỗi trả trong body của các bước kiểm. FE switch trên `code`; `message` là
// tiếng Việt cho người đọc (contract §5).
//
// ⛔ codeForbidden dùng CHUNG cho bước e và bước g — cố ý. Tách chúng ra là dựng
// lại đúng kênh phụ mà §3b vừa đóng: kẻ tấn công sẽ phân biệt được "id không tồn
// tại" với "id của người khác".
const (
	codeOriginNotAllowed = "ORIGIN_NOT_ALLOWED"
	codeSubprotocol      = "SUBPROTOCOL_REQUIRED"
	codeUnauthenticated  = "UNAUTHENTICATED"
	codeForbidden        = "FORBIDDEN"
	codeSessionNotFound  = "SESSION_NOT_FOUND"
	codeSessionInactive  = "SESSION_NOT_ACTIVE"
	codeSessionInUse     = "SESSION_IN_USE"
	codeInternal         = "INTERNAL"
)

// TokenVerifier verify sandbox token (bước d).
type TokenVerifier interface {
	Verify(ctx context.Context, raw string) (*authz.Claims, error)
}

// SessionReader đọc trạng thái session và giữ trần WS (bước f, h, i).
type SessionReader interface {
	Get(ctx context.Context, sessionID string) (*sessionstore.Session, error)
	AcquireWS(ctx context.Context, sessionID string, limit int, expiresAt int64, lease time.Duration) (func(context.Context) error, error)
	RefreshWS(ctx context.Context, sessionID string, expiresAt int64, lease time.Duration) error
}

// SessionBridge nhận kết nối SAU khi qua đủ authz và chạy trọn phiên terminal,
// rồi tự đóng nó với mã đúng ngữ nghĩa (contract §6).
//
// Là interface để test của package này dựng được ca 101 mà không cần apiserver —
// cùng lý do `SessionReader` là interface.
type SessionBridge interface {
	Serve(ctx context.Context, c *websocket.Conn, t podexec.Target)
}

// Deps là mọi thứ handler cần. Toàn interface để test chạy được mà không cần
// Redis cho các ca chết trước bước f.
type Deps struct {
	Log             *slog.Logger
	Verifier        TokenVerifier
	Sessions        SessionReader
	Bridge          SessionBridge
	Metrics         *metrics.Metrics
	AllowedOrigins  []string
	MaxWSPerSession int

	// WSLease là lease của khe `session:{id}:ws`, được gia hạn theo nhịp suốt
	// vòng đời phiên (3.H). 0 ⇒ giữ hành vi cũ (TTL = phần đời còn lại của
	// session), tức không có lease ngắn.
	WSLease time.Duration

	// Drain điều phối tắt êm (3.H). nil ⇒ không drain.
	//
	// ⛔ ĐẾM PHẢI Ở TẦNG NÀY, KHÔNG PHẢI TRONG `podexec.Serve`. `release` khe WS
	// là defer của handler dưới đây; một WaitGroup bao quanh riêng `Serve` báo
	// "drain xong" khi Serve trả về — TRƯỚC khi defer đó chạy — nên process
	// thoát và khe không bao giờ được trả. Đo được trên cụm: close code đúng
	// 1012 mà khe vẫn còn val=1. Unit test của Bridge không thấy vì nó gọi
	// `Serve` trực tiếp, không qua tầng này.
	Drain *drain.Coordinator
}

// wsLeaseRefreshChia quyết định nhịp gia hạn từ lease: gia hạn ở 1/3 lease.
//
// ⛔ KHÔNG gia hạn ở 1/2 hay sát lease. Với 1/3, phải LỠ hai nhịp liên tiếp khe
// mới rụng — một lượt Redis chậm hay một lượt GC không đủ giết phiên của người
// đang gõ. Sát lease thì mọi trục trặc thoáng qua đều thành mất khe, và triệu
// chứng của nó (429 SESSION_IN_USE ở tab của chính mình) là thứ khó chẩn đoán
// nhất trong cả hệ vì nó tự khỏi trước khi ai kịp nhìn.
const wsLeaseRefreshChia = 3

// denyCodes là mọi mã mà một bước kiểm có thể trả về. Danh sách sống Ở ĐÂY vì
// package này là nơi phát ra chúng — xem comment khởi tạo series bên dưới.
var denyCodes = []string{
	codeOriginNotAllowed,
	codeSubprotocol,
	codeUnauthenticated,
	codeForbidden,
	codeSessionNotFound,
	codeSessionInactive,
	codeSessionInUse,
}

// Register gắn /ws/session/{id} vào mux.
func Register(mux *http.ServeMux, deps Deps) {
	h := &handler{
		deps: deps,
		// Endpoint này PUBLIC và chưa xác thực ở thời điểm log — một vòng lặp
		// `curl` là log flood rẻ tiền (DoS vào quota Loki) và RemoteAddr là PII
		// ghi vô điều kiện cho một peer chưa chứng minh danh tính. Sampling ở
		// đây là yêu cầu của G3, không phải tối ưu.
		denyLimiter: rate.NewLimiter(rate.Every(time.Second), 5),
	}

	// Khởi tạo mọi series về 0 ngay lúc đăng ký route. Không có bước này thì
	// `rate(dlp_gateway_ws_connections_total{reason="FORBIDDEN"}[5m]) > 0` trả
	// NO-DATA cho tới lần IDOR đầu tiên — và no-data trông y hệt "chưa ai tấn
	// công" trên dashboard, tức đúng cảnh báo đó im lặng đúng lúc cần nhất.
	//
	// Làm ở đây chứ không trong metrics.New: chỉ package này biết mã nào đi với
	// `denied` còn mã nào đi với `error`, và mã đó là thứ nó trả cho client —
	// một danh sách, không phải hai bảng chờ trôi khỏi nhau.
	deps.Metrics.WSConnectionsTotal.WithLabelValues(metrics.ResultAccepted, metrics.ReasonOK)
	for _, c := range denyCodes {
		deps.Metrics.WSConnectionsTotal.WithLabelValues(metrics.ResultDenied, c)
	}
	deps.Metrics.WSConnectionsTotal.WithLabelValues(metrics.ResultError, codeInternal)

	mux.HandleFunc("GET /ws/session/{id}", h.serve)
}

type handler struct {
	deps        Deps
	denyLimiter *rate.Limiter
}

func (h *handler) serve(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	sessionID := r.PathValue("id")

	// ---- header an ninh: TRƯỚC mọi nhánh, kể cả nhánh từ chối và kể cả 101 ---
	//
	// Đặt ở đây một lần thay vì rải vào từng nhánh: handler này có tám `return`
	// sớm, và mỗi cái là một chỗ quên. Một header an ninh chỉ có trên đường
	// hạnh phúc là một header không có.
	//
	// ⚠ VỊ TRÍ NÀY LÀ BẮT BUỘC, KHÔNG PHẢI PHONG CÁCH. `websocket.Accept` ở dưới
	// gọi `w.WriteHeader(101)` rồi HIJACK kết nối; sau lượt hijack đó
	// `http.ResponseWriter` không còn dùng được, nên mọi header phải đã nằm
	// trong `w.Header()` từ trước. Vế "header vẫn ra được trong response 101"
	// KHÔNG suy luận — nó được ghim bằng `TestWSDatHeaderAnNinhTrenHandshake101`.
	secheaders.SetAPI(w.Header())

	// ---- drain: đếm TRỌN handler, kể cả các defer ------------------------
	//
	// Đặt Ở ĐÂY, trước mọi bước authz và trước khi chiếm khe WS. `Enter` phải bao
	// được cái defer `release` phía dưới — đó là toàn bộ lý do việc đếm nằm ở
	// tầng này chứ không trong `podexec.Serve` (xem Deps.Drain).
	if h.deps.Drain != nil {
		xong := h.deps.Drain.Enter()
		defer xong()
	}

	// ---- a. Origin ------------------------------------------------------
	//
	// Đây là thứ DUY NHẤT đóng CSWSH: handshake WebSocket KHÔNG chịu CORS, nên
	// không có lớp nào của trình duyệt chặn giúp.
	//
	// VẮNG hẳn header thì CHO QUA (contract §3a) — quyết định, không phải sơ
	// suất: trình duyệt LUÔN gửi Origin và không tắt được từ JS, nên CSWSH vẫn
	// đóng kín; còn fail-closed ở đây chặn wscat/websocat/probe vận hành/test
	// e2e, tức chặn chính bộ acceptance IDOR của phase-1.
	if d := h.chain().CheckOrigin(r); d != nil {
		h.denyOf(w, r, d)
		return
	}

	// ---- b. Subprotocol -------------------------------------------------
	if !clientOffers(r, Subprotocol) {
		h.deny(w, r, http.StatusBadRequest, codeSubprotocol,
			"client phải chào subprotocol "+Subprotocol,
			"offered", r.Header.Get("Sec-WebSocket-Protocol"))
		return
	}

	// ---- c–h. chuỗi dùng chung ------------------------------------------
	//
	// Bước b Ở TRÊN phải nằm GIỮA a và c, nên chuỗi được gọi làm hai vế thay vì
	// một — thứ tự đó là contract, không phải tuỳ tiện. Bước i ở DƯỚI ở lại đây
	// vì nó chiếm một khe và cái defer trả khe phải nhìn thấy được (xem
	// sessionauth doc).
	res, denial, err := h.chain().CheckSession(ctx, r, sessionID)
	if denial != nil {
		h.denyOf(w, r, denial)
		return
	}
	if err != nil {
		h.fail(w, r, "đọc session từ Redis", err)
		return
	}
	claims, sess := res.Claims, res.Session

	// ---- i. trần WS đồng thời (D17 = 1) ---------------------------------
	release, err := h.deps.Sessions.AcquireWS(ctx, sessionID, h.deps.MaxWSPerSession, sess.ExpiresAt, h.deps.WSLease)
	switch {
	case errors.Is(err, sessionstore.ErrWSLimitReached):
		h.deny(w, r, http.StatusTooManyRequests, codeSessionInUse,
			"phiên đang mở ở một kết nối khác")
		return
	case errors.Is(err, sessionstore.ErrNotFound):
		// expiresAt đã qua nhưng hash còn (reaper chưa kịp). Cùng nghĩa với
		// bước f, nên cùng mã — không đẻ thêm một trạng thái FE phải học.
		h.deny(w, r, http.StatusNotFound, codeSessionNotFound,
			"phiên không còn tồn tại", "sub", claims.Subject)
		return
	case err != nil:
		h.fail(w, r, "chiếm khe WS", err)
		return
	}
	// defer chạy cả khi upgrade hỏng — đó là điểm của việc INCR ở bước i chứ
	// không phải sau upgrade.
	defer func() {
		// context của request đã huỷ khi WS đóng, nên release phải có context
		// riêng, nếu không DECR không bao giờ tới được Redis và trần WS chỉ gỡ
		// được bằng TTL.
		rctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		if err := release(rctx); err != nil {
			h.deps.Log.Error("trả khe WS thất bại — session chỉ gỡ khoá được khi TTL hết",
				slog.String("session_id", sessionID), slog.String("err", err.Error()))
		}
	}()

	// ---- 101 -------------------------------------------------------------
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols: []string{Subprotocol},
		// Bước a Ở TRÊN đã kiểm Origin theo allowlist của chúng ta, và nó là
		// nguồn sự thật. Kiểm mặc định của thư viện so Origin với r.Host — sai
		// ở đúng topology mà D1 bắt buộc phải có: gateway ngồi SAU một reverse
		// proxy gộp origin, nên Host mà gateway thấy (`platform-gateway:8082`)
		// không bao giờ là origin trình duyệt gửi. Bật nó lên thì mọi handshake
		// hợp lệ trả 403. Đây KHÔNG phải nới lỏng bảo mật: nó là dời phép kiểm
		// lên chỗ đọc được cấu hình thật.
		InsecureSkipVerify: true,
	})
	if err != nil {
		// Accept đã tự ghi mã lỗi HTTP.
		h.deps.Log.Warn("upgrade WS thất bại",
			slog.String("session_id", sessionID), slog.String("err", err.Error()))
		return
	}

	h.deps.Metrics.WSConnectionsTotal.WithLabelValues(metrics.ResultAccepted, metrics.ReasonOK).Inc()
	h.deps.Metrics.WSActive.Inc()
	defer h.deps.Metrics.WSActive.Dec()

	// ---- dấu vết kiểm toán -------------------------------------------------
	//
	// Nợ P2 §1. Trước dòng này, đường nóng CHỈ log lượt bị TỪ CHỐI, nên một phiên
	// mở THÀNH CÔNG — một người thật vừa có shell trong một pod — không để lại dòng
	// nào. Counter `WSConnectionsTotal` biết ĐÃ CÓ bao nhiêu lượt, nhưng không biết
	// lượt nào của ai: một con số không đứng tên được thì không dùng để điều tra.
	//
	// KHÔNG rate-limit như `deny`: tới đây là đã qua trọn a→i, và trần WS D17=1 đã
	// tự chặn việc một phiên đẻ ra nhiều dòng. Xem chú thích cùng tên ở execroute.
	//
	// Hai dòng chứ không một: chỉ "mở" thì mọi phiên trong log trông như còn đang
	// mở, kể cả phiên đã đóng từ lâu — và "phiên nào CÒN mở" là đúng câu hỏi người
	// trực hỏi lúc 3 giờ sáng.
	attachedAt := time.Now()
	h.deps.Log.Info("mở phiên WS",
		slog.String("session_id", sessionID),
		slog.String("user_id", sess.UserID),
		slog.String("pod", sess.PodName),
		slog.String("namespace", sess.Namespace))
	defer func() {
		h.deps.Log.Info("đóng phiên WS",
			slog.String("session_id", sessionID),
			slog.String("user_id", sess.UserID),
			slog.String("pod", sess.PodName),
			slog.Duration("duration", time.Since(attachedAt)))
	}()

	// Từ đây là việc của podexec: nó sở hữu vòng đời kết nối và ĐÓNG nó.
	//
	// `podName`/`namespace` lấy từ REDIS, không từ URL hay frame client — đó là
	// điều kiện để "gõ được lệnh trong pod" không bao giờ có nghĩa là "gõ được
	// lệnh trong pod NGƯỜI KHÁC". Cùng lý lẽ cho `userId`: nó là thứ G7 gửi cho
	// orchestrator làm vế authz của ExtendSession, và bước g vừa chứng minh nó
	// trùng `claims.Subject`.
	// Lease của khe WS phải được gia hạn suốt phiên (3.H). Vòng này sống ĐÚNG
	// bằng `Serve`: dừng ngay khi Serve trả về, tức trước cả `release` ở defer
	// phía trên — nên không có lượt gia hạn nào chạy sau khi khe đã được trả.
	// (Kể cả nếu có, `refresh_ws.lua` chỉ PEXPIRE nên nó không hồi sinh key.)
	if h.deps.WSLease > 0 {
		stopLease := h.batDauGiaHanLease(ctx, sessionID, sess.ExpiresAt)
		defer stopLease()
	}

	h.deps.Bridge.Serve(ctx, conn, podexec.Target{
		SessionID: sessionID,
		PodName:   sess.PodName,
		Namespace: sess.Namespace,
		ExpiresAt: sess.ExpiresAt,
		UserID:    sess.UserID,
	})
}

// batDauGiaHanLease chạy vòng gia hạn khe WS và trả hàm dừng.
//
// ⛔ CONTEXT RIÊNG, KHÔNG DÙNG ctx CỦA REQUEST. Hai lý do, và cái thứ hai mới là
// cái đắt: (1) ta cần dừng vòng này ngay khi Serve trả về, sớm hơn lúc ctx của
// request huỷ; (2) mỗi lượt gia hạn cần một context CÒN SỐNG để nói chuyện với
// Redis — dùng ctx đã huỷ thì lượt gia hạn cuối cùng lặng lẽ hỏng, đúng khuôn
// bẫy mà `release` ở trên đã phải né bằng `context.WithoutCancel`.
//
// Lỗi gia hạn KHÔNG cắt phiên — xem `sessionstore.RefreshWS`.
func (h *handler) batDauGiaHanLease(ctx context.Context, sessionID string, expiresAt int64) func() {
	nhip := h.deps.WSLease / wsLeaseRefreshChia
	if nhip <= 0 {
		return func() {}
	}

	lctx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	done := make(chan struct{})

	go func() {
		defer close(done)
		ticker := time.NewTicker(nhip)
		defer ticker.Stop()
		for {
			select {
			case <-lctx.Done():
				return
			case <-ticker.C:
				rctx, rcancel := context.WithTimeout(lctx, 5*time.Second)
				err := h.deps.Sessions.RefreshWS(rctx, sessionID, expiresAt, h.deps.WSLease)
				rcancel()
				switch {
				case err == nil:
				case errors.Is(err, sessionstore.ErrWSSlotGone):
					// Khe rụng giữa phiên: nhịp gia hạn không theo kịp lease, hoặc
					// phiên đã quá hạn. Không đóng kết nối — chỉ báo, vì tới đây
					// người dùng vẫn đang gõ được và cắt họ không sửa được gì.
					h.deps.Log.Warn("khe WS đã rụng giữa phiên — một client khác có thể chiếm chỗ",
						slog.String("session_id", sessionID))
					return
				default:
					h.deps.Log.Warn("gia hạn khe WS thất bại",
						slog.String("session_id", sessionID), slog.String("err", err.Error()))
				}
			}
		}
	}()

	return func() {
		cancel()
		<-done
	}
}

// originAllowed so khớp NGUYÊN VĂN với allowlist.
//
// Không so prefix, không so suffix, không parse rồi so host: `https://app.example.com`
// và `https://app.example.com.evil.tld` chỉ khác nhau ở phần đuôi, và mọi phép
// so "gần đúng" đều có một biến thể cho attacker. Danh sách là danh sách.
// chain dựng chuỗi authz dùng chung từ Deps của route này.
func (h *handler) chain() sessionauth.Deps {
	return sessionauth.Deps{
		Verifier:       h.deps.Verifier,
		Sessions:       h.deps.Sessions,
		AllowedOrigins: h.deps.AllowedOrigins,
	}
}

// denyOf dịch một Denial của chuỗi sang deny của route này — metric series là
// của route, quyết định là của chuỗi.
func (h *handler) denyOf(w http.ResponseWriter, r *http.Request, d *sessionauth.Denial) {
	h.deny(w, r, d.Status, d.Code, d.Message, d.LogAttrs...)
}

// clientOffers kiểm client có chào `want` trong Sec-WebSocket-Protocol không.
//
// Tự tách thay vì hỏi thư viện: `coder/websocket` không phơi hàm đọc danh sách
// đề nghị, và `Accept` chỉ ÂM THẦM bỏ trống subprotocol khi không khớp — không
// lỗi, không 400. Contract §0 thì bắt "không khớp → không upgrade (400)", nên
// phép kiểm phải nằm ở đây, trước Accept.
//
// Header có thể lặp lại nhiều dòng và mỗi dòng là danh sách ngăn bằng dấu phẩy
// (RFC 6455 §4.1) — cả hai dạng đều hợp lệ và client thật dùng cả hai.
func clientOffers(r *http.Request, want string) bool {
	for _, line := range r.Header.Values("Sec-WebSocket-Protocol") {
		for _, offered := range strings.Split(line, ",") {
			if strings.TrimSpace(offered) == want {
				return true
			}
		}
	}
	return false
}

// deny trả một bước kiểm hỏng: JSON `{code, message}` + mã HTTP thật.
//
// Mã HTTP THẬT chứ không phải upgrade-rồi-đóng: trình duyệt không đọc được
// status của handshake hỏng (contract §7) nhưng wscat/curl/test tích hợp thì
// đọc được, và bộ acceptance IDOR của phase-1 dựa vào đúng chỗ đó. FE lấy lý do
// thật qua tRPC `session.get` khi thấy 1006.
func (h *handler) deny(w http.ResponseWriter, r *http.Request, status int, code, message string, logAttrs ...string) {
	// Counter tăng VÔ ĐIỀU KIỆN, khác hẳn log bên dưới. Sampling log là để một
	// vòng `curl` không đốt quota Loki; sampling counter thì làm chính con số
	// đo tần suất tấn công trở nên sai — và đó là con số duy nhất còn lại khi
	// log đã bị bỏ bớt.
	h.deps.Metrics.WSConnectionsTotal.WithLabelValues(metrics.ResultDenied, code).Inc()

	if h.denyLimiter.Allow() {
		attrs := []any{
			slog.String("session_id", r.PathValue("id")),
			slog.Int("status", status),
			slog.String("code", code),
		}
		for i := 0; i+1 < len(logAttrs); i += 2 {
			attrs = append(attrs, slog.String(logAttrs[i], logAttrs[i+1]))
		}
		h.deps.Log.Warn("từ chối handshake WS", attrs...)
	}
	writeJSON(w, status, code, message)
}

// fail là lỗi của CHÍNH gateway (Redis chết, script hỏng) — 500, và lý do đi
// vào log ở mức Error chứ không phải Warn: đây không phải người dùng làm sai.
func (h *handler) fail(w http.ResponseWriter, r *http.Request, what string, err error) {
	h.deps.Metrics.WSConnectionsTotal.WithLabelValues(metrics.ResultError, codeInternal).Inc()
	h.deps.Log.Error("handshake WS lỗi nội bộ",
		slog.String("session_id", r.PathValue("id")),
		slog.String("op", what),
		slog.String("err", err.Error()))
	writeJSON(w, http.StatusInternalServerError, codeInternal, "lỗi nội bộ")
}

func writeJSON(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": code, "message": message})
}
