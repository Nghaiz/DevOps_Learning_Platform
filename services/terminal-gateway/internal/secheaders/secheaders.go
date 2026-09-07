// Package secheaders giữ bộ header an ninh mà MỌI response của terminal-gateway
// phải mang, và là SSOT duy nhất của bộ đó cho cả ba route (`/ws`, `/exec`,
// `/ide`).
//
// LỖ ĐƯỢC ĐÓNG: cả ba route phục vụ trên CHÍNH origin của app (D8 chốt iframe
// cùng origin để cookie `dlp_sandbox` host-only tới được gateway). Ba tầng
// trước đó đều trượt: Traefik định tuyến `PathPrefix('/ws' | '/exec' | '/ide')`
// thẳng sang Service gateway nên request KHÔNG BAO GIỜ tới Next, tức
// `applySecurityHeaders` của `apps/web/src/proxy.ts` không chạy; Ingress chỉ
// gắn `bodylimit` + `ratelimit`; và không package nào ở đây viết lại RESPONSE.
// Hệ quả: mọi byte gateway phát ra — gồm cả body JSON của một lượt 401/403 —
// đứng cùng origin với toàn app.
//
// P13 S1 đóng lỗ đó cho `/ide`. Bộ header khi ấy nằm trong chính package
// `ideroute`, nên `/ws` và `/exec` — hai đường phát JSON, cũ hơn `/ide` — vẫn
// trần. A3 dời bộ header ra đây và gọi từ cả ba, thay vì chép nó sang hai chỗ
// nữa: ba bản chép là ba thứ trôi khỏi nhau, và cái trôi trước sẽ là cái không
// ai đọc lại.
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
//  2. Gateway BIẾT nó đang phục vụ gì, Traefik thì không: ở đây tách được
//     response proxy của Theia (cần một CSP đo theo Theia) khỏi JSON của `/ws`
//     và `/exec` (cần CSP chặt nhất có thể) — trong khi `customResponseHeaders`
//     áp đều lên mọi thứ đi qua.
//
// ⛔ KHÔNG khai các giá trị này thành values Helm. Chúng là HẰNG an ninh, không
// phải nút vặn; một knob ở đây chỉ tạo ra đường nới lỏng chúng trong im lặng.
//
// ⚠ ĐIỀU PACKAGE NÀY KHÔNG PHỦ: response do CHÍNH `http.ServeMux` sinh ra trước
// khi handler chạy — 404 của một path lạ, 405 của `GET /exec/session/{id}`.
// Chúng không đi qua route nào nên không hàm nào ở đây chạm tới. Chấp nhận có ý
// thức: body của chúng là hằng `text/plain` của thư viện chuẩn, không mang nội
// dung do người dùng điều khiển — tức không phải lớp lỗ mà `nosniff` được dựng
// lên để đóng. Muốn phủ nốt thì đó là một middleware bọc `publicMux` trong
// `cmd/terminal-gateway`, không phải một lời gọi nữa ở đây.
package secheaders

import "net/http"

// base là bộ header KHÔNG phụ thuộc vào nội dung response, nên nó đúng cho cả
// ba route mà không cần đo lại từng route (khác hẳn CSP — xem `apiCSP`).
var base = []struct{ Name, Value string }{
	// Đóng đúng đường khai thác đáng lo nhất, và rẻ nhất trong ba cái.
	//
	// Trên `/ide`: Theia phục vụ FILE DO NGƯỜI HỌC TẢI LÊN / tạo ra trong
	// sandbox — một file mang content-type vắng hoặc chung chung được trình
	// duyệt sniff thành `text/html` ⇒ script trong nó chạy trên origin của app,
	// tức đã ở phía trong mọi phép kiểm SameSite/Origin. Đường tới nạn nhân
	// KHÔNG phải self-XSS: nội dung bài học do người có vai `author` đẩy vào
	// sandbox của người HỌC, nên nó là đường chéo người dùng.
	//
	// Trên `/ws` và `/exec`: response là JSON, và `writeJSON` của cả hai route
	// đã đặt `Content-Type: application/json`. Header này vì thế KHÔNG sửa một
	// bug đang có — nó khoá lại vế "content-type luôn đúng", vế mà một lượt sửa
	// tương lai (thêm một nhánh lỗi quên `writeJSON`, một `http.Error` chen
	// vào) làm hỏng được mà không test nào đỏ. Một kiểm soát rẻ đặt trước khi
	// cần vẫn rẻ hơn một lượt điều tra sau khi cần.
	{"X-Content-Type-Options", "nosniff"},

	// Chặn một site NGOÀI nhúng response của gateway vào iframe của họ để
	// clickjack thao tác của người học.
	//
	// SAMEORIGIN chứ không DENY: D8 nhúng chính `/ide/session/{id}/` vào iframe
	// TRÊN CÙNG ORIGIN (`https://<host>/` nhúng `https://<host>/ide/...`).
	// DENY sẽ giết đúng tính năng đó.
	//
	// `/ws` và `/exec` không bao giờ được nhúng, nên DENY sẽ chặt hơn một chút
	// ở đó. Vẫn dùng CHUNG một giá trị, và đây là lựa chọn chứ không phải lười:
	// khác biệt đó KHÔNG quan sát được (`/exec` chỉ nhận POST nên một iframe
	// lấy về 405; `/ws` thiếu subprotocol nên lấy về 400 JSON — không có gì để
	// clickjack trong cả hai), còn hai hằng khác nhau cho cùng một mục đích là
	// hai thứ trôi khỏi nhau theo thời gian.
	{"X-Frame-Options", "SAMEORIGIN"},

	// URL của cả ba route CHỨA session id (`/ws/session/{id}`,
	// `/exec/session/{id}`, `/ide/session/{id}/`). Không có header này, một
	// điều hướng hay subresource đi RA ngoài mang id đó trong `Referer`.
	//
	// `same-origin` chứ không `no-referrer`, và đây là lựa chọn HẸP-NHẤT-MÀ-CHẠY
	// chứ không phải nhân nhượng: `same-origin` vẫn cắt sạch Referer khi ra
	// origin khác (đúng thứ cần chặn), nhưng GIỮ Referer cho request cùng origin
	// — nên nếu Theia có phép kiểm CSRF dựa trên Referer thì nó không chết.
	{"Referrer-Policy", "same-origin"},
}

// cspHeaderNames là mọi tên header CSP mà gateway có thể phát. Hai tên vì một
// chính sách đi qua chế độ CHỈ-BÁO trước khi ép (xem `ideroute.ideCSP`), nên
// đường nào cũng có thể đang phát bản chỉ-báo hôm nay và bản ép ngày mai.
var cspHeaderNames = []string{
	"Content-Security-Policy",
	"Content-Security-Policy-Report-Only",
}

// apiCSP là chính sách cho response KHÔNG-PHẢI-TÀI-LIỆU: JSON của `/ws` và
// `/exec`.
//
// `default-src 'none'` và KHÔNG gì khác. Ba lý do nó không cần một vòng đo như
// CSP của `/ide` đã phải đi qua:
//
//  1. Một body JSON không nạp subresource nào, nên không có gì để chặn nhầm.
//     Chế độ hỏng đắt của CSP — "chặt quá ⇒ trắng màn" — cần một tài liệu có
//     script/style/font để xảy ra; ở đây không có.
//  2. Người gọi thật KHÔNG phải trình duyệt: `/exec` chỉ BFF gọi server-side
//     (cookie đặt `Path=/ws` nên trình duyệt không gửi tới đó), còn `/ws` là
//     handshake. Cả hai bỏ qua CSP hoàn toàn. Header này chỉ có nghĩa ở đúng
//     ca một người mở thẳng URL trong thanh địa chỉ — và đó cũng đúng là ca
//     duy nhất nó cần có nghĩa.
//  3. KHÔNG khai `frame-ancestors`: nó không kế thừa `default-src`, nên bỏ nó
//     đi để `X-Frame-Options` ở trên là NGUỒN DUY NHẤT quyết định việc nhúng
//     khung. Khai cả hai với hai mức khác nhau (`'none'` vs `SAMEORIGIN`) là
//     dựng một mâu thuẫn mà kết quả phụ thuộc trình duyệt.
//
// ⛔ KHÔNG dùng CSP của `/ide` ở đây. Nó mang `'unsafe-eval'` và một sha256 của
// script bootstrap Theia — dán nó lên `/ws`/`/exec` là khai một chính sách rộng
// hơn nhu cầu và mô tả sai thứ đang phục vụ.
const apiCSP = "default-src 'none'"

// SetBase đặt bộ header nền lên response sắp phát ra.
//
// `Set` chứ không `Add`: gọi hai lần không được đẻ ra hai giá trị, và với
// `X-Frame-Options` thì hai giá trị mâu thuẫn là hành vi KHÔNG xác định giữa các
// trình duyệt.
func SetBase(h http.Header) {
	for _, sh := range base {
		h.Set(sh.Name, sh.Value)
	}
}

// SetAPI đặt bộ nền + CSP cho một endpoint JSON (`/ws`, `/exec`).
//
// ⚠ PHẢI GỌI TRƯỚC KHI GHI STATUS. Với `/ws` điều đó nghĩa là trước
// `websocket.Accept`: sau khi handshake 101 xong, kết nối đã bị hijack và
// `http.ResponseWriter` không còn dùng được. Vế "header vẫn có trong response
// 101" được ghim bằng test chứ không suy luận — xem
// `TestWSDatHeaderAnNinhTrenHandshake101`.
func SetAPI(h http.Header) {
	SetBase(h)
	h.Set(cspHeaderNames[0], apiCSP)
	// Một endpoint JSON không bao giờ ở chế độ chỉ-báo: không có gì để đo dần.
	// Xoá tên kia phòng ca một lượt sửa tương lai để sót nó lại.
	h.Del(cspHeaderNames[1])
}

// DropUpstream xoá bộ header này khỏi response CỦA UPSTREAM (Theia) trước khi
// `ReverseProxy` sao chép nó sang response ra ngoài.
//
// ⛔ BẮT BUỘC, không phải dọn dẹp. `httputil.copyHeader` dùng `dst.Add(...)`
// (đọc lại `net/http/httputil/reverseproxy.go` — `Add`, KHÔNG phải `Set`), nên
// nếu Theia tự gửi `X-Frame-Options: DENY` thì client nhận HAI giá trị
// `SAMEORIGIN, DENY`. Trình duyệt xử lý cặp mâu thuẫn đó mỗi bản một kiểu, và
// nhánh "chọn cái chặt hơn" chính là nhánh làm TRẮNG iframe của D8 — một lỗi
// chỉ lộ trên trình duyệt thật, không lộ ở `curl` hay ở test đọc một giá trị.
//
// CSP đi theo cùng lý lẽ, và nặng hơn: với CSP hai header KHÔNG phải "cái nào
// thắng" — trình duyệt giao NHAU hai chính sách, tức kết quả chặt hơn cả hai và
// không đọc ra được từ bên nào.
func DropUpstream(h http.Header) {
	for _, sh := range base {
		h.Del(sh.Name)
	}
	for _, name := range cspHeaderNames {
		h.Del(name)
	}
}
