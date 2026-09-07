package ideroute

import "net/http"

// ─── Header an ninh cho MỌI response dưới `/ide` (P13 S1) ───────────────────
//
// LỖ ĐƯỢC ĐÓNG: `/ide/**` phục vụ trên CHÍNH origin của app (D8 chốt iframe
// cùng origin để cookie `dlp_sandbox` host-only tới được gateway). Trước bản
// này KHÔNG một header an ninh nào chạm tới đường đó — ba tầng đều trượt:
// Traefik định tuyến `PathPrefix('/ide')` thẳng sang Service gateway nên request
// KHÔNG BAO GIỜ tới Next, tức `applySecurityHeaders` của `apps/web/src/proxy.ts`
// không chạy; Ingress `-ide` chỉ gắn `bodylimit` + `ratelimit-ide`; và package
// này chỉ viết lại REQUEST. Hệ quả: mã chạy dưới `/ide` cùng origin với toàn app
// ⇒ gọi được `/api/trpc/*` kèm cookie phiên, đọc `localStorage`, chạm
// `parent.document`.
//
// ⛔ VÌ SAO ĐẶT Ở ĐÂY CHỨ KHÔNG PHẢI MỘT `Middleware` HEADERS CỦA TRAEFIK.
// Cả hai tầng đều đóng được lỗ trên đường production, nên lý do phải là thứ
// khác con số:
//
//  1. Header đi THEO RESPONSE, không theo topology deploy. `ingress.middleware`
//     mặc định TẮT (values.yaml: trung lập nhà cung cấp — CRD `traefik.io` không
//     tồn tại trên nginx/HAProxy). Đặt ở Traefik nghĩa là một cụm non-Traefik,
//     hoặc một lượt `helm upgrade --reuse-values` đánh rơi khối `ingress`, sẽ
//     mất SẠCH header mà `helm upgrade` vẫn STATUS: deployed — đúng chế độ hỏng
//     im lặng mà `required` ở đầu `ingress.yaml` được dựng lên để chặn. Một
//     kiểm soát an ninh không được có công tắc tắt câm.
//  2. `/ide` CHƯA TỪNG đi qua Traefik (6.A/6.B/6.E đều `port-forward`; §3bis
//     ràng buộc 10). Chồng một kiểm soát MỚI chưa đo lên hai middleware CŨNG
//     chưa đo là nhân đôi ẩn số. Bản ở đây có test chạy được ngay, và đo lại
//     bằng `port-forward` + `curl -I` — không cần dựng cả đường TLS/NodePort.
//  3. Gateway BIẾT nó đang phục vụ gì, Traefik thì không: ở đây tách được
//     response proxy của Theia, JSON lỗi của chính ta, và redirect 308 — trong
//     khi `customResponseHeaders` áp đều lên mọi thứ đi qua, gồm cả 101.
//
// GIÁ PHẢI TRẢ, nói thẳng: image gateway đang chạy trên cụm là
// `dlp-terminal-gateway:p12fix` và nó KHỚP mã nhánh này, nên thay đổi ở đây làm
// nó cũ đi ⇒ đợt 3 phải xây + side-load ảnh THỨ TƯ (`:p13`) ngoài ba ảnh
// web/orchestrator/migrator của §3ter mục 4. Bù lại thay đổi này KHÔNG có ràng
// buộc thứ tự với web: nó chỉ thêm header response, không đụng wire-protocol —
// nên nó không nối dài chuỗi "cùng lượt hoặc không lượt nào" của D15.
//
// ⛔ KHÔNG khai ba giá trị này thành values Helm. Chúng là HẰNG an ninh, không
// phải nút vặn; một knob ở đây chỉ tạo ra đường nới lỏng chúng trong im lặng.
var securityHeaders = []struct{ Name, Value string }{
	// Đóng đúng đường khai thác đáng lo nhất, và rẻ nhất trong ba cái.
	// Theia phục vụ FILE DO NGƯỜI HỌC TẢI LÊN / tạo ra trong sandbox. Không có
	// header này, một file mang content-type vắng hoặc chung chung được trình
	// duyệt sniff thành `text/html` ⇒ script trong nó chạy trên origin của app,
	// tức đã ở phía trong mọi phép kiểm SameSite/Origin. Đường tới nạn nhân
	// KHÔNG phải self-XSS: nội dung bài học do người có vai `author` đẩy vào
	// sandbox của người HỌC, nên nó là đường chéo người dùng.
	{"X-Content-Type-Options", "nosniff"},

	// Chặn một site NGOÀI nhúng `/ide/**` vào iframe của họ để clickjack thao
	// tác của người học trong IDE/terminal.
	//
	// SAMEORIGIN chứ không DENY: D8 nhúng chính `/ide/session/{id}/` vào iframe
	// TRÊN CÙNG ORIGIN (`https://<host>/` nhúng `https://<host>/ide/...`).
	// DENY sẽ giết đúng tính năng vừa dựng.
	{"X-Frame-Options", "SAMEORIGIN"},

	// URL của đường này CHỨA session id (`/ide/session/{id}/`). Không có header
	// này, một điều hướng hay subresource đi RA ngoài từ trong Theia mang id đó
	// trong `Referer`.
	//
	// `same-origin` chứ không `no-referrer`, và đây là lựa chọn HẸP-NHẤT-MÀ-CHẠY
	// chứ không phải nhân nhượng: `same-origin` vẫn cắt sạch Referer khi ra
	// origin khác (đúng thứ cần chặn), nhưng GIỮ Referer cho request cùng origin
	// — nên nếu Theia có phép kiểm CSRF dựa trên Referer thì nó không chết.
	// Ta CHƯA đo Theia có phép kiểm đó hay không; chọn cái chặt hơn khi chưa đo
	// là đúng cái "hứa suông" mà bản vá này cố ý không làm.
	{"Referrer-Policy", "same-origin"},

	// ⛔ CSP CỐ Ý VẮNG MẶT — CHƯA ĐO, nên không khai.
	//
	// Theia tự phục vụ HTML/JS/CSS/WebSocket/web-worker của chính nó. Một CSP
	// quá chặt làm IDE TRẮNG MÀN — mà đó là hỏng CHỨC NĂNG, và chế độ hỏng đó
	// kết thúc bằng việc ai đó nới bừa từng directive cho tới khi CSP vô nghĩa.
	// Đặt một CSP chưa chạy thử rồi trình bày như đã xong là tệ hơn không đặt:
	// nó tạo ra niềm tin sai ở người đọc chart.
	//
	// VIỆC CỦA ĐỢT 3 (đo TRÊN CỤM, không suy luận). Đo trực tiếp qua gateway,
	// không cần Traefik:
	//
	//   kubectl port-forward -n default svc/platform-gateway 8080:8080 &
	//   # 1. Xác nhận ba header ĐANG có (đối chứng dương của chính bản vá này):
	//   curl -sI http://127.0.0.1:8080/ide/session/<id>/ -H "Origin: https://<host>" \
	//        --cookie "dlp_sandbox=<token>" | grep -iE 'x-content-type|x-frame|referrer'
	//   # 2. Mở IDE bằng TRÌNH DUYỆT THẬT rồi đọc console: mọi vi phạm CSP báo
	//   #    BẤT ĐỒNG BỘ ở console, KHÔNG ném lỗi ở chỗ nạp (bài học
	//   #    zero-violation-needs-negative-control). `curl` KHÔNG đo được việc này.
	//   # 3. Chạy CSP ở chế độ CHỈ-BÁO trước khi ép: thêm tạm
	//   #    `Content-Security-Policy-Report-Only` với ứng viên hẹp nhất
	//   #    (`default-src 'self'; script-src 'self' 'unsafe-eval'; worker-src 'self' blob:;
	//   #     style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:`),
	//   #    dùng IDE một vòng đủ (mở file, sửa, lưu, mở terminal trong IDE),
	//   #    rồi đọc `report-only` violations. CHỈ khi một vòng sạch mới đổi
	//   #    sang header ép thật.
	//   # 4. Đối chứng ÂM bắt buộc: chèn một inline script vi phạm và chứng minh
	//   #    nó BỊ chặn — "0 vi phạm" trên một CSP không enforce đọc y hệt
	//   #    "0 vi phạm" trên một CSP đúng.
}

// ideCSP — ứng viên CSP cho `/ide`, ĐANG Ở CHẾ ĐỘ CHỈ-BÁO.
//
// ## Cơ sở của từng directive (đo trên cụm 2026-09-07, IDE chạy thật qua Traefik)
//
// Workbench Theia đã tải xong (`Welcome - root - Theia IDE`, socket.io handshake
// 200, 0 lỗi console). Số đo của trang lúc đó:
//
//	mọi tài nguyên  same-origin, chỉ scheme https  ⇒ default-src 'self'
//	script inline   0                              ⇒ KHÔNG cần 'unsafe-inline'
//	style inline    688 thuộc tính + 6 thẻ <style> ⇒ style-src cần 'unsafe-inline'
//	WebSocket       có (socket.io upgrades)        ⇒ connect-src ws: wss:
//	Worker          có                             ⇒ worker-src 'self' blob:
//
// `'unsafe-eval'` giữ lại vì Theia biên dịch cấu hình/plugin lúc chạy; bỏ nó là
// đúng thứ làm IDE trắng màn, và ta CHƯA đo được là bỏ được. Đó là lý do bản này
// đi qua chế độ chỉ-báo trước.
//
// `img-src` thêm `data:` (icon nhúng) và `font-src 'self'` — cả hai suy từ số đo
// trên, không phải chép từ một mẫu CSP trên mạng.
//
// ## ĐANG ÉP THẬT — và đây là vòng đo đã cho phép chuyển
//
// Bước chỉ-báo chạy trước, trên chính cụm, với một vòng dùng IDE thật: nạp trang,
// dựng workbench (`Welcome - root - Theia IDE`, socket.io handshake 200), mở
// command palette, mở một file `.ts` trong Monaco (`csp-probe.ts - root - Theia
// IDE`), gõ phím trong trình soạn. **0 vi phạm.**
//
// Và đối chứng ÂM ở CHÍNH vòng đó chứng minh chính sách được đánh giá thật, chứ
// không phải một header không ai đọc — chèn một inline script + một ảnh origin
// khác vào DOM cho ra:
//
//	script-src-elem  blockedURI=inline                      disposition=report
//	img-src          blockedURI=https://example.com/…       disposition=report
//
// (`disposition=report` và inline script VẪN CHẠY — đúng nghĩa chỉ-báo. Sau khi
// đổi sang header ép, cùng phép chèn đó phải cho `disposition=enforce` và script
// KHÔNG chạy; đó là phép kiểm bắt buộc của bước này.)
//
// ⚠⚠ VÒNG CHỈ-BÁO ĐÃ BÁO "0 VI PHẠM" VÀ ĐIỀU ĐÓ SAI.
//
// Ba directive dưới đây (`font-src data:`, `connect-src data:`, hash của script
// inline) KHÔNG đến từ vòng chỉ-báo — chúng đến từ vòng ÉP, khi trình duyệt bắt
// đầu chặn thật:
//
//	Executing inline script violates … 'script-src 'self' 'unsafe-eval''
//	Loading the font 'data:font/ttf;base64,…' violates … "font-src 'self'"
//	Connecting to 'data:application/wasm;base64,…' violates … "connect-src …"
//	→ fetchOnigasm → TypeError: Failed to fetch   (mất tô màu cú pháp)
//
// Vì sao vòng chỉ-báo bỏ lọt: máy thu (`securitypolicyviolation`) được cài SAU
// khi trang tải xong, nên mọi vi phạm ở PHA NẠP đã bắn trước khi có ai nghe. Đây
// đúng là bẫy mà `apps/web/e2e/csp.spec.ts` ghi ngay ở đầu file — "đăng ký chỗ
// nghe SAU `goto()` cũng xanh" — và nó vẫn cắn, ở một harness khác.
//
// Bài học cho lần đo CSP kế tiếp: cài máy thu qua `addInitScript` (chạy TRƯỚC mọi
// script của trang), hoặc đọc console errors của CHÍNH lượt nạp. Một vòng chỉ-báo
// "sạch" mà không làm thế thì không chứng minh được gì.
//
// ⚠ MỘT PHẦN VẪN CHƯA ĐO: terminal TRONG IDE. Lượt đo lái được Monaco nhưng
// không mở nổi terminal của Theia bằng bàn phím qua harness, nên đường xterm của
// IDE chưa đi qua chính sách này. `connect-src` đã khai `ws: wss:` nên nó *nên*
// qua, nhưng "nên" không phải "đã đo".
const ideCSP = "default-src 'self'; " +
	// `sha256-3DWD…` là script bootstrap inline của chính Theia ở dòng 102 của
	// trang. Dùng HASH chứ không `'unsafe-inline'`: hash cho phép ĐÚNG một khối
	// mã đã biết, còn `'unsafe-inline'` mở cửa cho mọi inline script — kể cả
	// khối do kẻ tấn công chèn, tức xoá sạch giá trị của `script-src`.
	"script-src 'self' 'unsafe-eval' 'sha256-3DWDOMaFT41swT2oqFaj2TkXqRy4gdtNgXOPPISdvO4='; " +
	"worker-src 'self' blob:; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; " +
	// `data:` BẮT BUỘC — Theia nhúng bộ icon codicon dưới dạng `data:font/ttf`
	// và `data:font/woff2`. Không có nó thì IDE mất toàn bộ icon.
	"font-src 'self' data:; " +
	// `data:` BẮT BUỘC — `fetchOnigasm` tải engine grammar TextMate từ một
	// `data:application/wasm` nhúng sẵn. Chặn nó là mất TÔ MÀU CÚ PHÁP, và lỗi
	// hiện ra chỉ là `TypeError: Failed to fetch`, không nhắc gì tới CSP.
	"connect-src 'self' ws: wss: data:"

// ideCSPHeaderName là tên header đang dùng cho `ideCSP`.
//
// Đổi NGƯỢC lại `Content-Security-Policy-Report-Only` là đường lùi an toàn nếu
// một tính năng IDE nào đó hoá ra bị chặn: nó giữ nguyên phép đo mà không làm
// trắng màn ai.
const ideCSPHeaderName = "Content-Security-Policy"

// setSecurityHeaders đặt bộ header lên response sắp phát ra.
//
// `Set` chứ không `Add`: gọi hai lần không được đẻ ra hai giá trị, và với
// `X-Frame-Options` thì hai giá trị mâu thuẫn là hành vi KHÔNG xác định giữa các
// trình duyệt.
func setSecurityHeaders(h http.Header) {
	for _, sh := range securityHeaders {
		h.Set(sh.Name, sh.Value)
	}
	h.Set(ideCSPHeaderName, ideCSP)
}

// dropUpstreamSecurityHeaders xoá bộ header này khỏi response CỦA THEIA trước
// khi `ReverseProxy` sao chép nó sang response ra ngoài.
//
// ⛔ BẮT BUỘC, không phải dọn dẹp. `httputil.copyHeader` dùng `dst.Add(...)`
// (đọc lại `net/http/httputil/reverseproxy.go` — `Add`, KHÔNG phải `Set`), nên
// nếu Theia tự gửi `X-Frame-Options: DENY` thì client nhận HAI giá trị
// `SAMEORIGIN, DENY`. Trình duyệt xử lý cặp mâu thuẫn đó mỗi bản một kiểu, và
// nhánh "chọn cái chặt hơn" chính là nhánh làm TRẮNG iframe của D8 — một lỗi
// chỉ lộ trên trình duyệt thật, không lộ ở `curl` hay ở test đọc một giá trị.
func dropUpstreamSecurityHeaders(h http.Header) {
	for _, sh := range securityHeaders {
		h.Del(sh.Name)
	}
	// CSP đi theo cùng lý lẽ: `copyHeader` dùng `Add`, nên một CSP của Theia
	// nằm CẠNH của ta. Với CSP, hai header KHÔNG phải "cái nào thắng" — trình
	// duyệt giao NHAU hai chính sách, tức kết quả chặt hơn cả hai và không đọc
	// ra được từ bên nào. Xoá cả hai tên vì ta có thể đang phát bản chỉ-báo hôm
	// nay và bản ép ngày mai.
	h.Del("Content-Security-Policy")
	h.Del("Content-Security-Policy-Report-Only")
}
