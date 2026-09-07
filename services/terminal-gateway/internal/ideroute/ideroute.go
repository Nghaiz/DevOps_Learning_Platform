// Package ideroute phục vụ IDE (Theia) của một phiên qua reverse-proxy, dưới
// `/ide/session/{id}/`.
//
// ⛔ CHUỖI AUTHZ KHÔNG NẰM Ở ĐÂY. Nó nằm trong `internal/sessionauth`, cùng bản
// mà `/ws` và `/exec` dùng. Phase-6 task 9 ghi thẳng "KHÔNG viết chuỗi thứ ba",
// và cách duy nhất giữ được lời đó là package này KHÔNG có một dòng nào kiểm
// cookie/token/ownership. Nếu bạn đang định thêm một bước kiểm ở đây: thêm vào
// `sessionauth` để cả ba route cùng được, hoặc đừng thêm.
//
// ĐÍCH PROXY LÀ `podIP:<port>`, KHÔNG PHẢI LOOPBACK — và đó là một đánh đổi đã
// cân, không phải lười. Bản đầu của 6.C ghim Theia vào `127.0.0.1`; nhưng gateway
// và sandbox là hai network namespace, nên loopback buộc mọi byte IDE đi qua
// `portforward` của apiserver. Trên cụm đích (8 vCPU, apiserver đã restart 41
// lần) đó là mua một lớp phòng thủ bằng một điểm hỏng duy nhất cho MỌI phiên.
// Lý lẽ đầy đủ + ai đang gánh phần bảo mật: `images/sandbox-base/entrypoint.sh`
// § start_theia.
//
// TIỀN TỐ PATH CHẠY ĐƯỢC VÌ ĐÃ ĐO, KHÔNG VÌ ĐOÁN: index của Theia dùng 3 đường
// tương đối và **0** đường tuyệt đối (đếm trên pod `ide-verify`, 2026-09-04).
// Nên gắn nó dưới `/ide/session/{id}/` là hợp lệ — MIỄN LÀ URL kết thúc bằng
// `/`. Thiếu dấu `/` cuối thì trình duyệt phân giải `./lib/x.js` thành
// `/ide/session/lib/x.js` và cả trang trắng, nên `serve` redirect 308 trước khi
// proxy chứ không im lặng chấp nhận.
package ideroute

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"sync"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
	"golang.org/x/time/rate"
)

const (
	codeInternal      = "INTERNAL"
	codeIDEUnavail    = "IDE_UNAVAILABLE"
	codeIDETooManyWS  = "IDE_TOO_MANY_CONNECTIONS"
	codeSessionNoPod  = "SESSION_NO_POD"
	pathPrefixPattern = "/ide/session/{id}/"
)

// Deps là mọi thứ handler cần.
type Deps struct {
	Log            *slog.Logger
	Verifier       sessionauth.TokenVerifier
	Sessions       sessionauth.SessionReader
	Metrics        *metrics.Metrics
	AllowedOrigins []string

	// PodIPs phân giải tên pod → IP. Session hash CHỈ có PodName, và IP cố ý
	// KHÔNG được lưu vào Redis: nó là ảnh chụp trạng thái k8s, pod tạo lại là
	// lệch ngay, và một IP lệch ở đây proxy người này vào pod người kia.
	PodIPs PodIPResolver

	// Port là cổng Theia nghe trong pod sandbox. Phải KHỚP `DLP_IDE_PORT` của
	// entrypoint; lệch nhau thì mọi phiên trả 502 và triệu chứng không trỏ vào
	// đây mà trỏ vào "IDE hỏng".
	Port int

	// MaxPerSession là trần kết nối IDE đồng thời của MỘT phiên.
	//
	// ⛔ ĐÂY LÀ MỘT TRẦN RIÊNG, KHÔNG PHẢI `GATEWAY_MAX_WS_PER_SESSION`.
	// Phase-6 task 10: mở IDE KHÔNG được ăn khe WS của terminal. Bảo đảm đó ở
	// đây là CẤU TRÚC chứ không phải kỷ luật — package này không import
	// `sessionstore` và `sessionauth.SessionReader` không có `AcquireWS`, nên
	// không có đường nào chạm tới khe của terminal kể cả khi ai đó muốn.
	//
	// ⚠ Giới hạn đã biết: trần này đếm TRONG TIẾN TRÌNH. Với một replica gateway
	// (hiện tại) nó đúng; nâng lên nhiều replica thì mỗi replica có trần riêng
	// và tổng thật là N lần. Đừng đọc nó như một trần phân tán. Khi cần trần
	// thật thì nó phải về Redis như khe WS — và lúc đó vẫn là KEY RIÊNG.
	MaxPerSession int

	// Timeout là trần cho một request proxy KHÔNG phải upgrade. Kết nối
	// WebSocket/SSE được miễn: chúng sống suốt phiên theo thiết kế, và áp một
	// deadline lên chúng là tự tay ngắt IDE mỗi N giây.
	Timeout time.Duration
}

// Register gắn route vào mux.
func Register(mux *http.ServeMux, deps Deps) {
	if deps.Port == 0 {
		deps.Port = 4000
	}
	if deps.MaxPerSession == 0 {
		deps.MaxPerSession = 8
	}
	h := &handler{
		deps: deps,
		// Cùng lý do với wsroute/execroute: endpoint public, chưa xác thực ở
		// thời điểm log — một vòng `curl` là log flood rẻ tiền.
		denyLimiter: rate.NewLimiter(rate.Every(time.Second), 5),
		live:        map[string]int{},
	}

	// Khởi tạo series về 0 ngay lúc đăng ký. Không có bước này thì mọi cảnh báo
	// dựng trên metric của route mới trả NO-DATA cho tới lần từ chối đầu tiên,
	// và no-data trông y hệt "chưa ai tấn công".
	deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultAccepted, metrics.ReasonOK)
	for _, c := range sessionauth.Codes {
		deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultDenied, c)
	}
	deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultDenied, codeIDETooManyWS)
	for _, c := range []string{codeInternal, codeIDEUnavail, codeSessionNoPod} {
		deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultError, c)
	}

	mux.HandleFunc(pathPrefixPattern, h.serve)
	// Không có dấu `/` cuối ⇒ redirect. Xem chú thích đầu package: thiếu nó là
	// trang trắng, và trang trắng đọc y hệt "IDE hỏng".
	mux.HandleFunc(ideSessionPrefix+"{id}", h.redirectToSlash)
}

type handler struct {
	deps        Deps
	denyLimiter *rate.Limiter

	mu   sync.Mutex
	live map[string]int
}

// Tien to TINH cua route IDE. Mot hang, hai cho dung (dang ky route va dich
// redirect) — de chung khong the lech nhau.
const ideSessionPrefix = "/ide/session/"

func (h *handler) redirectToSlash(w http.ResponseWriter, r *http.Request) {
	// Dung LAI dich den tu tien to TINH cua route + mot segment da escape, thay
	// vi noi them "/" vao `r.URL.Path`.
	//
	// Ly do khong phai chieu long linter: `r.URL.Path` do client dieu khien, va
	// mot duong dang `//evil.com` duoc TRINH DUYET doc la protocol-relative URL —
	// nen mot redirect trong nhu "tuong doi" van day nguoi dung sang host khac.
	// Route nay chi co MOT hinh dang (`/ide/session/{id}`), nen dich den suy ra
	// duoc tron ven ma khong can cham vao duong do; va `url.PathEscape` bao dam
	// segment id khong the chen them dau `/`. (gosec G710.)
	target := ideSessionPrefix + url.PathEscape(r.PathValue("id")) + "/"
	// Nhanh nay KHONG di qua serve(), nen no phai tu dat header (P13 S1).
	setSecurityHeaders(w.Header())
	// 308 chu khong 302: 302 cho phep client doi POST thanh GET, va Theia POST
	// len chinh duong nay.
	http.Redirect(w, r, target, http.StatusPermanentRedirect)
}

func (h *handler) serve(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("id")

	// Header an ninh đặt TRƯỚC mọi nhánh, kể cả nhánh từ chối (P13 S1 — xem
	// secheaders.go). Body JSON của một lượt 401/403 cũng phát ra trên origin
	// của app, nên `nosniff` cần cho nó y như cho response của Theia. Đặt ở đây
	// một lần thay vì rải vào từng nhánh: mỗi `return` sớm là một chỗ quên.
	setSecurityHeaders(w.Header())

	chain := sessionauth.Deps{
		Verifier:       h.deps.Verifier,
		Sessions:       h.deps.Sessions,
		AllowedOrigins: h.deps.AllowedOrigins,
	}

	// ---- a. Origin ------------------------------------------------------
	if d := chain.CheckOrigin(r); d != nil {
		h.denyOf(w, r, d)
		return
	}

	// ---- c–h. chuỗi dùng chung ------------------------------------------
	//
	// Không có bước b (subprotocol): IDE không chào subprotocol nào — WS của nó
	// là WS thường, không phải giao thức terminal của ta.
	// Không có bước i: xem Deps.MaxPerSession.
	res, denial, err := chain.CheckSession(r.Context(), r, sessionID)
	if denial != nil {
		h.denyOf(w, r, denial)
		return
	}
	if err != nil {
		h.fail(w, r, codeInternal, "đọc session từ Redis", err)
		return
	}

	// PodIP rỗng nghĩa là pod chưa được cấp IP (vừa tạo, hoặc đang Terminating).
	// Tách khỏi 500: đây KHÔNG phải lỗi hệ thống, nó là "chưa sẵn sàng", và FE
	// phải phân biệt được để hiện "IDE đang khởi động" thay vì "hỏng" (6.D
	// task 14 — một iframe trắng 20s đọc y hệt một trang hỏng).
	podIP, err := h.deps.PodIPs.PodIP(r.Context(), res.Session.Namespace, res.Session.PodName)
	switch {
	case errors.Is(err, ErrPodNotReady):
		h.fail(w, r, codeSessionNoPod, "pod chưa có IP", err)
		return
	case err != nil:
		h.fail(w, r, codeIDEUnavail, "phân giải IP pod", err)
		return
	}

	// ---- trần riêng của IDE ---------------------------------------------
	release, ok := h.acquire(sessionID)
	if !ok {
		h.denyOf(w, r, &sessionauth.Denial{
			Status:  http.StatusTooManyRequests,
			Code:    codeIDETooManyWS,
			Message: "phiên đang mở quá nhiều kết nối IDE",
		})
		return
	}
	defer release()

	h.deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultAccepted, metrics.ReasonOK).Inc()
	h.proxy(podIP, res.Session.Namespace, res.Session.PodName).ServeHTTP(w, r)
}

// acquire giữ một khe trần-riêng. Trả `false` khi đã đầy.
func (h *handler) acquire(sessionID string) (func(), bool) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.live[sessionID] >= h.deps.MaxPerSession {
		return nil, false
	}
	h.live[sessionID]++
	var once sync.Once
	return func() {
		once.Do(func() {
			h.mu.Lock()
			defer h.mu.Unlock()
			// XOÁ key khi về 0, không để lại số 0: map này sống suốt đời tiến
			// trình và mỗi phiên đã đóng để lại một entry là một rò rỉ chậm mà
			// không metric nào nhìn thấy.
			if h.live[sessionID] <= 1 {
				delete(h.live, sessionID)
				return
			}
			h.live[sessionID]--
		})
	}, true
}

func (h *handler) proxy(podIP, ns, pod string) *httputil.ReverseProxy {
	target := &url.URL{
		Scheme: "http",
		Host:   net.JoinHostPort(podIP, strconv.Itoa(h.deps.Port)),
	}
	return &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			// Cắt tiền tố `/ide/session/{id}` — Theia phục vụ từ gốc của chính
			// nó. `SetURL` đã nối path của target (rỗng) vào, nên chỉ cần thay
			// path của request.
			pr.Out.URL.Path = stripPrefix(pr.In.URL.Path)
			pr.Out.URL.RawPath = ""

			// ⛔ KHÔNG chuyển tiếp cookie `dlp_sandbox` vào pod. Theia không cần
			// nó, và một token phiên đi vào tiến trình mà NGƯỜI HỌC điều khiển
			// được là trao cho họ chính thứ chứng minh danh tính của họ ở
			// gateway. Luật 8 nói không có token trong URL; đây là cùng một luật
			// ở một cửa khác.
			//
			// ⚠ Bỏ ĐÚNG cookie của ta, KHÔNG bỏ cả header.
			//
			// Bản trước gọi `pr.Out.Header.Del("Cookie")`, và câu đó xoá MỌI
			// cookie — kể cả `theia-connection-token` mà chính Theia vừa phát ra
			// ở lượt tải trang gốc. Theia đòi token đó trên mọi lượt nâng cấp
			// socket:
			//
			//     allowWsUpgrade: token := getTokenFromCookie(req)
			//                     if token != "" { return isTokenValid(token) }
			//                     return false
			//
			// nên IDE dựng được vỏ rồi kẹt ở đó: `/ide/session/{id}/` trả 200,
			// còn `/ide/session/{id}/socket.io/…` trả 403 `{"code":4,"message":
			// "Forbidden"}` — không backend, không terminal, không file.
			//
			// Đo trên cụm 2026-09-07, TRONG chính pod sandbox qua loopback (nên
			// loại hẳn proxy, Traefik và CSP khỏi diện nghi):
			//
			//     socket.io CÓ cookie theia-connection-token → 200
			//     socket.io KHÔNG cookie                     → 403
			//
			// Ba biến thể `Origin` và ba biến thể `Host` đều 403 như nhau, nên
			// đây KHÔNG phải lệch origin — một giả thuyết đã thử và bị bác bỏ
			// trước khi tìm ra dòng trên.
			forwardCookiesExceptOurs(pr)

			// X-Forwarded-* do SetURL đặt; giữ nguyên.
		},
		ModifyResponse: func(res *http.Response) error {
			// Chạy TRƯỚC `copyHeader(rw.Header(), res.Header)` của
			// ReverseProxy, và `copyHeader` dùng `Add` — nên không xoá ở đây
			// thì header của Theia nằm CẠNH header của ta, không đè lên nó.
			// Chi tiết chế độ hỏng: secheaders.go § dropUpstreamSecurityHeaders.
			dropUpstreamSecurityHeaders(res.Header)
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// Đẩy IP ra khỏi cache NGAY ở lượt hỏng đầu tiên thay vì chờ hết
			// TTL — xem chú thích rủi ro tái-sử-dụng-IP trong podip.go. Chỉ
			// resolver có cache mới làm được, nên type-assert chứ không mở rộng
			// interface: một `Invalidate` bắt buộc sẽ ép mọi fake trong test
			// phải cài một hàm chúng không dùng.
			if inv, ok := h.deps.PodIPs.(interface{ Invalidate(string, string) }); ok {
				inv.Invalidate(ns, pod)
			}
			h.fail(w, r, codeIDEUnavail, "proxy tới IDE", err)
		},
	}
}

// forwardCookiesExceptOurs dựng lại header `Cookie` đi tới Theia, bỏ đúng cookie
// phiên của ta và giữ nguyên phần còn lại.
//
// Vì sao không `Del` rồi thôi: Theia tự phát `theia-connection-token` và TỪ CHỐI
// mọi lượt nâng cấp socket thiếu nó (`allowWsUpgrade`). Xoá cả header là xoá luôn
// token ấy, và IDE mất backend trong khi trang gốc vẫn 200 — một chế độ hỏng
// không có gì trên cụm phát hiện được, vì `rollout status` xanh và pod `Running`.
//
// Vì sao vẫn bỏ `dlp_sandbox`: nó chứng minh danh tính của người học ở GATEWAY,
// còn tiến trình bên trong sandbox thì chính người học điều khiển. Đưa nó vào là
// tự tay trao cho họ thứ ta dùng để nhận ra họ.
func forwardCookiesExceptOurs(pr *httputil.ProxyRequest) {
	cookies := pr.In.Cookies()
	pr.Out.Header.Del("Cookie")
	for _, c := range cookies {
		if c.Name == sessionauth.CookieName {
			continue
		}
		pr.Out.AddCookie(c)
	}
}

// stripPrefix cắt `/ide/session/{id}` khỏi đầu path và LUÔN trả về một path bắt
// đầu bằng `/`.
//
// Tự viết thay vì `http.StripPrefix`: tiền tố chứa một segment động, và
// `StripPrefix` chỉ nhận chuỗi tĩnh. Cắt bằng số segment thì đúng với mọi id mà
// không cần dựng lại chuỗi tiền tố — và không có đường nào để một id lạ làm lệch
// phép cắt, vì `sessionauth` đã `ValidateID` trước khi tới đây.
func stripPrefix(p string) string {
	// p luôn có dạng /ide/session/<id>/... vì mux chỉ khớp pattern đó.
	//
	// 3, KHÔNG phải 4. Ta đang tìm dấu `/` ĐÓNG segment thứ ba (`<id>`), không
	// phải đếm số segment: lượt 1 dừng ở `/` sau "ide", lượt 2 sau "session",
	// lượt 3 sau `<id>` — và đó chính là chỗ phần đuôi bắt đầu. Đặt 4 thì hàm
	// nuốt luôn segment đầu của đuôi, `/lib/app.js` thành `/app.js`, mọi asset
	// 404, và triệu chứng đọc ra là "IDE hỏng" chứ không trỏ vào dòng này.
	// (Test đối chứng dương bắt được đúng lỗi đó, 2026-09-04.)
	const segments = 3
	idx := 0
	for i := 0; i < segments; i++ {
		next := indexByteFrom(p, '/', idx+1)
		if next < 0 {
			return "/"
		}
		idx = next
	}
	if idx >= len(p) {
		return "/"
	}
	return p[idx:]
}

func indexByteFrom(s string, c byte, from int) int {
	if from >= len(s) {
		return -1
	}
	for i := from; i < len(s); i++ {
		if s[i] == c {
			return i
		}
	}
	return -1
}

func (h *handler) denyOf(w http.ResponseWriter, r *http.Request, d *sessionauth.Denial) {
	// Counter tăng VÔ ĐIỀU KIỆN, khác log bên dưới: sampling log là để một vòng
	// `curl` không đốt quota Loki; sampling counter làm hỏng chính con số đo tần
	// suất tấn công.
	h.deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultDenied, d.Code).Inc()
	if h.denyLimiter.Allow() {
		attrs := []any{
			slog.String("session_id", r.PathValue("id")),
			slog.Int("status", d.Status),
			slog.String("code", d.Code),
		}
		for i := 0; i+1 < len(d.LogAttrs); i += 2 {
			attrs = append(attrs, slog.String(d.LogAttrs[i], d.LogAttrs[i+1]))
		}
		h.deps.Log.Warn("từ chối request IDE", attrs...)
	}
	writeJSON(w, d.Status, d.Code, d.Message)
}

func (h *handler) fail(w http.ResponseWriter, r *http.Request, code, what string, err error) {
	h.deps.Metrics.IDESessionsTotal.WithLabelValues(metrics.ResultError, code).Inc()
	attrs := []any{
		slog.String("session_id", r.PathValue("id")),
		slog.String("op", what),
	}
	if err != nil {
		attrs = append(attrs, slog.String("err", err.Error()))
	}
	h.deps.Log.Error("request IDE lỗi", attrs...)

	status := http.StatusInternalServerError
	if code == codeIDEUnavail || code == codeSessionNoPod {
		// 503 chứ không 500: "chưa sẵn sàng, thử lại" khác "gọi người trực".
		// Gộp chúng là dạy người đọc log bỏ qua cả hai.
		status = http.StatusServiceUnavailable
	}
	writeJSON(w, status, code, "IDE chưa dùng được")
}

// writeJSON MARSHAL thật, không nối chuỗi.
//
// Bản cũ ghép `code`/`message` thẳng vào một literal JSON. Hôm nay cả hai đều là
// hằng trong file này nên chưa vỡ, nhưng nó chỉ đúng chừng nào không ai truyền
// vào một chuỗi có `"` hay `<` — và không có gì trong chữ ký hàm nói điều đó.
// `json.Marshal` làm cho lớp lỗi ấy không tồn tại thay vì phụ thuộc vào kỷ luật
// của người gọi. (gosec G705.)
func writeJSON(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: message})
}
