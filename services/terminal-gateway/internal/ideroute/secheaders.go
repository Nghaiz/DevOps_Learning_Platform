package ideroute

import (
	"net/http"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/secheaders"
)

// Header an ninh dưới `/ide` = bộ NỀN dùng chung + một CSP đo riêng cho Theia.
//
// Bộ nền (nosniff, X-Frame-Options, Referrer-Policy) và lý lẽ "vì sao đặt trong
// mã Go chứ không ở một middleware của Traefik" đã dời sang `internal/secheaders`
// ở A3, để `/ws` và `/exec` dùng chung ĐÚNG MỘT bản thay vì có thêm hai bản chép.
// Ở lại đây chỉ phần thật sự riêng của `/ide`: chính sách CSP — thứ duy nhất
// trong bộ này phải đo trên chính Theia mới khai được.

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

// setSecurityHeaders đặt bộ header lên response sắp phát ra: bộ nền dùng chung
// + CSP riêng của `/ide`.
//
// ⛔ KHÔNG thay bằng `secheaders.SetAPI`. CSP `default-src 'none'` của hàm đó
// đúng cho một body JSON và làm TRẮNG MÀN một workbench Theia — nó chặn sạch
// script, style, font, worker và WebSocket mà IDE cần.
func setSecurityHeaders(h http.Header) {
	secheaders.SetBase(h)
	h.Set(ideCSPHeaderName, ideCSP)
}

// dropUpstreamSecurityHeaders xoá bộ header này khỏi response CỦA THEIA trước
// khi `ReverseProxy` sao chép nó sang response ra ngoài.
//
// Vì sao đây là BẮT BUỘC chứ không phải dọn dẹp — `httputil.copyHeader` dùng
// `Add` nên một header trùng thành HAI giá trị mâu thuẫn, và nhánh "trình duyệt
// chọn cái chặt hơn" làm trắng iframe của D8: xem `secheaders.DropUpstream`.
func dropUpstreamSecurityHeaders(h http.Header) {
	secheaders.DropUpstream(h)
}
