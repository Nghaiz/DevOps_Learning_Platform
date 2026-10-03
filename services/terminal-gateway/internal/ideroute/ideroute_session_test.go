package ideroute_test

import (
	"net/http"
	"testing"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/sessionauth"
)

// ─────────────────────────────────────────────── cookie theo từng phiên (D7.1)

// tokenFor ký một sandbox token hợp lệ cho `sid` (cùng chủ testUser).
func tokenFor(h *harness, sid string) string {
	c := validClaims()
	c.SessionID = sid
	return h.signer.Mint(c)
}

// withCookieHeader đặt NGUYÊN VĂN header Cookie — thứ tự cookie là thứ đang bị
// kiểm, nên không đi qua `AddCookie`.
func withCookieHeader(raw string) func(*http.Request) {
	return func(r *http.Request) { r.Header.Set("Cookie", raw) }
}

// Hai tab, hai phiên. Từ khi cookie mang `Path=/ide/session/<id>`, cookie của
// phiên KHÁC không còn đè lên cookie của phiên này nữa; nhưng cookie `Path=/ide`
// rộng do bản cũ phát vẫn sống tới hết Max-Age và vẫn được gửi kèm. RFC 6265
// §5.4 xếp cookie path dài lên trước, nên ở thứ tự này `r.Cookie` (lấy cookie
// ĐẦU) vốn đã chọn đúng — ca này là đối chứng dương cho ca dưới.
func TestIDEPicksCookieOfThisSessionWhenSentFirst(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	raw := sessionauth.CookieName + "=" + tokenFor(h, testSession) + "; " +
		sessionauth.CookieName + "=" + tokenFor(h, "sess-other-tab")

	if res := h.get(t, testSession, "", withCookieHeader(raw)); res.Status != http.StatusOK {
		t.Fatalf("cookie đúng phiên đứng đầu phải qua, nhận %d %s", res.Status, res.Body)
	}
}

// Thứ tự NGƯỢC: cookie của phiên khác đứng đầu. Trước bản vá chuỗi authz chỉ đọc
// cookie đầu tiên, nên trả 403 dù trình duyệt CÓ gửi đúng chìa — thứ tự
// header là thứ của user-agent/proxy quyết định, không phải của ta. Chuỗi phải
// chọn cookie theo `sid`, không theo vị trí.
func TestIDEPicksCookieOfThisSessionWhateverTheOrder(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	raw := sessionauth.CookieName + "=" + tokenFor(h, "sess-other-tab") + "; " +
		sessionauth.CookieName + "=" + tokenFor(h, testSession)

	if res := h.get(t, testSession, "", withCookieHeader(raw)); res.Status != http.StatusOK {
		t.Fatalf("có cookie đúng phiên ở vị trí 2 phải qua, nhận %d %s", res.Status, res.Body)
	}
}

// Đối chứng âm: chỉ có cookie của phiên khác ⇒ vẫn 403 FORBIDDEN như cũ (bước e),
// KHÔNG 401 — mã trả về là hợp đồng với FE.
func TestIDEOnlyForeignCookiesStillForbidden(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	raw := sessionauth.CookieName + "=" + tokenFor(h, "sess-other-1") + "; " +
		sessionauth.CookieName + "=" + tokenFor(h, "sess-other-2")

	res := h.get(t, testSession, "", withCookieHeader(raw))
	if res.Status != http.StatusForbidden || res.code(t) != sessionauth.CodeForbidden {
		t.Fatalf("chỉ có cookie phiên khác phải 403 FORBIDDEN, nhận %d %s", res.Status, res.Body)
	}
}

// Một cookie rác đứng đầu không được che cookie hợp lệ phía sau.
func TestIDEGarbageCookieDoesNotShadowValidOne(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	raw := sessionauth.CookieName + "=not-a-jwt; " + sessionauth.CookieName + "=" + tokenFor(h, testSession)

	if res := h.get(t, testSession, "", withCookieHeader(raw)); res.Status != http.StatusOK {
		t.Fatalf("cookie hợp lệ sau cookie rác phải qua, nhận %d %s", res.Status, res.Body)
	}
}

// Trần số cookie được thử: mỗi cookie là một lượt verify chữ ký, nên một header
// nhồi hàng trăm cookie không được biến thành hàng trăm lượt verify.
func TestIDECookieCandidatesAreCapped(t *testing.T) {
	h := newHarness(t, &spySessions{sess: activeSession()}, 8)
	raw := ""
	for i := 0; i < 10; i++ {
		raw += sessionauth.CookieName + "=garbage; "
	}
	raw += sessionauth.CookieName + "=" + tokenFor(h, testSession)

	res := h.get(t, testSession, "", withCookieHeader(raw))
	if res.Status != http.StatusUnauthorized {
		t.Fatalf("cookie hợp lệ nằm ngoài trần phải không được thử (401), nhận %d %s", res.Status, res.Body)
	}
}
