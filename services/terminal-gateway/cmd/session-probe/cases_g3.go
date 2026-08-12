// Các ca đo của chặng 1.G-3 — bốn ô AC còn trống của 1.G-2 cộng vế `stty size`
// của luật 5. Tách khỏi `main.go` vì ba ca dưới đây quan sát VÒNG ĐỜI của phiên
// (gia hạn, hết hạn, khoá khe WS) chứ không đo một đại lượng tức thời như
// `attach`/`luat5`, nên chúng cần một bộ trợ giúp riêng: đợi-tới-khi-đóng và
// đếm control `expiring`.
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// ---------------------------------------------------------------- trợ giúp chung

// ketQuaPhien là thứ quan sát được từ phía client trong trọn vòng đời một WS.
type ketQuaPhien struct {
	ten        string
	soExpiring int                  // số control `expiring` — mỗi cái = một lượt expiresAt TIẾN LÊN
	moc        []time.Duration      // thời điểm của từng `expiring`, tính từ lúc `ready`
	closeCode  websocket.StatusCode // -1 nếu chưa đóng khi hết hạn quan sát
	songDuoc   time.Duration        // sống được bao lâu tính từ `ready`
	conSong    bool
	err        error
}

// theoDoiPhien mở một phiên thật rồi quan sát tới khi WS đóng (hoặc hết `hen`).
//
// `goMoi != 0` ⇒ gửi một ký tự mỗi `goMoi` (phiên CÓ traffic). `goMoi == 0` ⇒
// không gõ gì sau khi prompt vẽ xong (phiên IM LẶNG).
//
// ⛔ ĐẾM `expiring` LÀ PHÉP ĐO, KHÔNG PHẢI ĐẾM RPC. Gateway chỉ phát `expiring`
// khi `expiresAt` THẬT SỰ tiến lên (`heartbeat.go`), nên một `expiring` = một
// lượt `ExtendSession` có tác dụng. Đây là tín hiệu nằm trong contract, quan sát
// được từ client — hơn hẳn việc đọc counter `extend_total` của server, vì với
// HAI replica gateway thì counter nằm rải trên hai pod và ta không biết trước
// pod nào nhận phiên này.
func theoDoiPhien(ctx context.Context, webURL, gwURL, origin, ten string, goMoi, hen time.Duration) ketQuaPhien {
	kq := ketQuaPhien{ten: ten, closeCode: -1}

	s, err := taoSession(ctx, webURL)
	if err != nil {
		kq.err = fmt.Errorf("tạo session: %w", err)
		return kq
	}
	c, err := dialChoNha(ctx, s, gwURL, origin)
	if err != nil {
		kq.err = fmt.Errorf("dial: %w", err)
		return kq
	}
	defer func() { _ = c.CloseNow() }()

	w := wrap(ctx, c)
	if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		kq.err = fmt.Errorf("gửi init: %w", err)
		return kq
	}
	if _, err := doiControl(w, "ready", 60*time.Second); err != nil {
		kq.err = fmt.Errorf("đợi ready: %w", err)
		return kq
	}
	t0 := time.Now()
	fmt.Printf("   [%s] ready · pod=%s · sid=%s\n", ten, s.pod, s.sid)

	var tickGo <-chan time.Time
	if goMoi > 0 {
		tk := time.NewTicker(goMoi)
		defer tk.Stop()
		tickGo = tk.C
	}
	hetHan := time.After(hen)

	for {
		select {
		case <-ctx.Done():
			kq.songDuoc = time.Since(t0)
			kq.conSong = true
			kq.err = ctx.Err()
			return kq

		case <-hetHan:
			kq.songDuoc = time.Since(t0)
			kq.conSong = true
			return kq

		case <-tickGo:
			// Một ký tự in được, KHÔNG kèm newline: đủ để đánh dấu activity mà
			// không chạy lệnh nào (chạy lệnh sinh stdout, và stdout CŨNG đánh
			// dấu activity — trộn hai nguồn thì không quy được nguyên nhân).
			if err := gui(ctx, c, "x"); err != nil {
				kq.songDuoc = time.Since(t0)
				kq.closeCode = websocket.CloseStatus(err)
				kq.err = fmt.Errorf("gõ phím: %w", err)
				return kq
			}

		case err := <-w.errc:
			kq.songDuoc = time.Since(t0)
			kq.closeCode = websocket.CloseStatus(err)
			if kq.closeCode == -1 {
				kq.err = fmt.Errorf("kết nối đứt KHÔNG kèm close code: %w", err)
			}
			return kq

		case f := <-w.ch:
			if f.mt != websocket.MessageText {
				continue
			}
			var co controlOut
			if json.Unmarshal(f.data, &co) != nil {
				continue
			}
			if co.Type == "expiring" {
				kq.soExpiring++
				kq.moc = append(kq.moc, time.Since(t0).Round(time.Second))
				fmt.Printf("   [%s] expiring #%d tại +%s (expiresAt=%s)\n",
					ten, kq.soExpiring, time.Since(t0).Round(time.Second), co.ExpiresAt)
			}
		}
	}
}

// ---------------------------------------------------------------- ca idle (N2)

// caseIdle đóng cả BA vế của ô AC idle bằng HAI phiên chạy song song.
//
// | Phiên | Làm gì | Phải thấy |
// |---|---|---|
// | A | không gõ gì | `expiring` ĐÚNG MỘT lần, rồi đóng `4404` |
// | B | gõ một phím mỗi 25s | `expiring` NHIỀU lần, sống qua mốc hết hạn gốc |
//
// ⛔ VÌ SAO PHIÊN A VẪN CÓ ĐÚNG MỘT `expiring` — và vì sao đó là ĐÚNG, không
// phải lỗi: cờ `activity` được đặt bởi cả stdin LẪN stdout (`bridge.go`), mà
// `ready` theo định nghĩa phát ra ở byte stdout ĐẦU TIÊN. Nghĩa là mọi phiên
// attach thành công đều đã bật cờ trước tick 60s đầu tiên, và tick đó đọc-rồi-xoá
// cờ (`takeActivity`) nên nó gia hạn đúng MỘT lần. Từ tick thứ hai trở đi phiên A
// im thật.
//
// Chính vì thế con số 1 mới là phép đo sắc nhất cho vế "ping/pong KHÔNG gia hạn":
// `pingInterval=20s` nên trong quãng sống của A có khoảng 8 lượt ping. Nếu ping
// đánh dấu activity thì A sẽ có `expiring` ở MỌI tick và KHÔNG BAO GIỜ chết.
// Thấy đúng một lần rồi chết = ping không gia hạn. Đếm ≥2 ⇒ AC ĐỎ.
//
// Phiên B là ĐỐI CHỨNG DƯƠNG, không phải phần trang trí: một phiên chết đúng hẹn
// trông y hệt một phiên hỏng từ đầu (pod câm, session tạo lỗi, gateway từ chối).
// B sống qua đúng cái mốc mà A chết ⇒ cái giết A là sự im lặng, không phải hạ tầng.
func caseIdle(ctx context.Context, webURL, gwURL, origin string, hen time.Duration) error {
	fmt.Printf("Quan sát tối đa %s. Cấu hình cụm phải là TTL nén (sessionTtl=90s, extendDefault=120s, hardCap=300s).\n\n", hen)

	ch := make(chan ketQuaPhien, 2)
	go func() { ch <- theoDoiPhien(ctx, webURL, gwURL, origin, "A-im-lặng", 0, hen) }()
	// Lệch 2s để hai lượt sign-up + session.create không đấm cùng một nhịp.
	time.Sleep(2 * time.Second)
	go func() { ch <- theoDoiPhien(ctx, webURL, gwURL, origin, "B-có-traffic", 25*time.Second, hen) }()

	var a, b ketQuaPhien
	for i := 0; i < 2; i++ {
		kq := <-ch
		if strings.HasPrefix(kq.ten, "A") {
			a = kq
		} else {
			b = kq
		}
	}

	fmt.Printf("\n%-14s | %-9s | %-10s | %-8s | %s\n", "Phiên", "expiring", "close", "sống", "mốc expiring")
	fmt.Printf("%s\n", strings.Repeat("-", 74))
	for _, kq := range []ketQuaPhien{a, b} {
		cc := "còn sống"
		if !kq.conSong {
			cc = fmt.Sprintf("%d", kq.closeCode)
		}
		fmt.Printf("%-14s | %-9d | %-10s | %-8s | %v\n",
			kq.ten, kq.soExpiring, cc, kq.songDuoc.Round(time.Second), kq.moc)
	}
	fmt.Println()

	if a.err != nil && a.closeCode == -1 {
		return fmt.Errorf("phiên A hỏng trước khi kết luận được: %w", a.err)
	}
	if b.err != nil && b.closeCode == -1 {
		return fmt.Errorf("phiên B hỏng trước khi kết luận được: %w", b.err)
	}

	// --- Vế 3: im lặng → 4404 -------------------------------------------------
	if a.conSong {
		return fmt.Errorf("phiên A VẪN SỐNG sau %s — phiên im lặng phải hết hạn rồi bị reap. "+
			"Hoặc TTL chưa nén, hoặc có nguồn nào đó đang gia hạn hộ nó (số expiring = %d)", a.songDuoc.Round(time.Second), a.soExpiring)
	}
	if a.closeCode != 4404 {
		return fmt.Errorf("phiên A đóng bằng %d, AC đòi 4404 — %d nghĩa là nó chết vì lý do KHÁC "+
			"(4409=hard-cap, 4400=protocol, 1006=đứt không lời)", a.closeCode, a.closeCode)
	}

	// --- Vế 2: ping/pong KHÔNG gia hạn ---------------------------------------
	if a.soExpiring > 1 {
		return fmt.Errorf("phiên A gia hạn %d lần dù không gõ gì (mốc %v) — nhiều hơn MỘT lần "+
			"nghĩa là có gì đó ngoài stdin/stdout đang đánh dấu activity; ping/pong là nghi can đầu tiên", a.soExpiring, a.moc)
	}

	// --- Vế 1: có traffic → ExtendSession được gọi ---------------------------
	if b.soExpiring < 2 {
		return fmt.Errorf("phiên B chỉ gia hạn %d lần dù gõ đều 25s/lần — vế 'có traffic → ExtendSession' KHÔNG đứng. "+
			"(Một lần là mức của phiên IM LẶNG, do stdout lúc vẽ prompt.)", b.soExpiring)
	}
	if b.songDuoc <= a.songDuoc {
		return fmt.Errorf("phiên B (%s) KHÔNG sống lâu hơn phiên A (%s) — đối chứng dương hỏng, "+
			"nên việc A chết không quy được cho sự im lặng", b.songDuoc.Round(time.Second), a.songDuoc.Round(time.Second))
	}

	fmt.Println("KẾT LUẬN: ĐẠT cả ba vế.")
	fmt.Printf("  · im lặng → đóng %d sau %s\n", a.closeCode, a.songDuoc.Round(time.Second))
	fmt.Printf("  · ping/pong KHÔNG gia hạn — A chỉ có %d lượt expiring (lượt của prompt), qua ~%d lượt ping\n",
		a.soExpiring, int(a.songDuoc.Seconds())/20)
	fmt.Printf("  · có traffic → gia hạn %d lượt, sống %s > A %s\n",
		b.soExpiring, b.songDuoc.Round(time.Second), a.songDuoc.Round(time.Second))
	return nil
}

// ---------------------------------------------------------------- ca resize (N6)

var reKichThuoc = regexp.MustCompile(`SZ=(\d+) (\d+)`)

// caseResize đóng vế còn nợ của luật 5 (a): pty THẬT SỰ đổi kích thước.
//
// Hai test đơn vị đã có (`TestKeoCuaSoBinhThuongKhongBiChan`,
// `TestBaoControlThiDong4400`) phủ vế "đóng / không đóng". Không test nào chạm
// pty thật — chúng dừng ở chỗ gateway NHẬN control, tức chứng minh "server không
// từ chối", không phải "cửa sổ đã đổi". Vế dưới đây là vế phân biệt hai điều đó.
//
// ⛔ GỬI DƯỚI TRẦN CÓ CHỦ Ý. Trần control đã pin là burst 100 + 100/s. 50 lượt
// giãn 20ms = 50/s, nằm gọn dưới trần — đúng cảnh KÉO CỬA SỔ THẬT, vì FE debounce
// ~50ms (contract §4) nên một cơn kéo tới server chỉ còn vài chục sự kiện. Bản AC
// cũ viết "bão 200 resize/s → KHÔNG đóng" là tự mâu thuẫn với chính trần đó.
//
// ⛔ ĐỌC BẰNG MARKER `SZ=`, KHÔNG regex trần trụi hai con số: dòng lệnh được
// terminal echo lại trước khi chạy, nên `\d+ \d+` sẽ khớp nhầm vào chính lệnh
// hoặc vào rác prompt. `SZ=%s` trong lệnh không chứa chữ số ⇒ chỉ output khớp.
func caseResize(ctx context.Context, webURL, gwURL, origin string) error {
	const soLuot = 50
	const colsDau = 100
	const rows = 30
	colsCuoi := colsDau + soLuot - 1

	s, err := taoSession(ctx, webURL)
	if err != nil {
		return fmt.Errorf("tạo session: %w", err)
	}
	c, err := dialChoNha(ctx, s, gwURL, origin)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer func() { _ = c.CloseNow() }()
	w := wrap(ctx, c)
	if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return fmt.Errorf("gửi init: %w", err)
	}
	if _, err := doiControl(w, "ready", 60*time.Second); err != nil {
		return fmt.Errorf("đợi ready: %w", err)
	}
	fmt.Printf("1. ready · pod=%s\n", s.pod)
	if err := doiPromptLang(w); err != nil {
		return fmt.Errorf("đợi prompt: %w", err)
	}

	t0 := time.Now()
	for i := 0; i < soLuot; i++ {
		if err := writeJSON(ctx, c, map[string]any{
			"type": "resize", "cols": colsDau + i, "rows": rows,
		}); err != nil {
			return fmt.Errorf("resize lượt %d/%d hỏng: %w (close=%d) — dưới trần mà đóng nghĩa là "+
				"trần control quá chặt: một cơn kéo cửa sổ thường ngày cũng mất phiên",
				i+1, soLuot, err, websocket.CloseStatus(err))
		}
		time.Sleep(20 * time.Millisecond)
	}
	toc := float64(soLuot) / time.Since(t0).Seconds()
	fmt.Printf("2. gửi %d resize trong %s (~%.0f/s — dưới trần 100/s), cols %d→%d, rows %d\n",
		soLuot, time.Since(t0).Round(time.Millisecond), toc, colsDau, colsCuoi, rows)

	// Kết nối phải CÒN SỐNG — vế "không đóng".
	select {
	case err := <-w.errc:
		return fmt.Errorf("kết nối ĐÓNG sau cơn resize dưới trần: %w (close=%d)", err, websocket.CloseStatus(err))
	case <-time.After(1500 * time.Millisecond):
	}
	fmt.Println("3. kết nối còn sống sau cơn resize (vế 'không đóng' ĐẠT)")

	// Hỏi chính pty xem nó đang bao nhiêu.
	if err := gui(ctx, c, "printf 'SZ=%s\\n' \"$(stty size)\"\n"); err != nil {
		return fmt.Errorf("gửi lệnh stty: %w", err)
	}
	out, err := docDenKhiKhop(w, reKichThuoc, 20*time.Second)
	if err != nil {
		return fmt.Errorf("đọc stty size: %w (đuôi stdout: %s)", err, duoi(out, 200))
	}
	m := reKichThuoc.FindStringSubmatch(out)
	gotRows, _ := strconv.Atoi(m[1])
	gotCols, _ := strconv.Atoi(m[2])
	fmt.Printf("4. stty size trong pod: rows=%d cols=%d\n", gotRows, gotCols)

	if gotCols != colsCuoi || gotRows != rows {
		return fmt.Errorf("pty là %dx%d, giá trị resize CUỐI là %dx%d — lệch nghĩa là hoặc coalesce "+
			"giữ nhầm giá trị (không phải giá trị cuối), hoặc status bar tmux chưa tắt (lệch đúng 1 dòng, xem E4)",
			gotCols, gotRows, colsCuoi, rows)
	}
	fmt.Printf("KẾT LUẬN: ĐẠT. Coalesce giữ ĐÚNG giá trị cuối (%dx%d), không lệch 1 ⇒ status bar tmux đã tắt (E4).\n", colsCuoi, rows)
	return nil
}

// ---------------------------------------------------------------- ca m9 (N5)

// caseM9 mở/đóng n WS TUẦN TỰ trên cùng một session qua LB hai replica.
//
// ⛔ "n lượt, 0 lỗi" MỘT MÌNH NÓ KHÔNG CHỨNG MINH ĐƯỢC GÌ VỀ HAI REPLICA.
// LB round-robin hoàn toàn có thể dồn cả n lượt vào một pod, và phép đo vẫn
// xanh trong khi replica thứ hai chưa từng phục vụ byte nào — cùng họ với một
// suite xanh vì mọi test đều skip. Nên ta đọc histogram attach của TỪNG pod và
// đòi: tổng delta = n, VÀ mỗi pod > 0.
//
// TUẦN TỰ chứ không đồng thời: trần là 1 WS/session (D17), nên n kết nối chồng
// lấn sẽ ăn 429 `SESSION_IN_USE` — đó là trần đang làm đúng việc, không phải lỗi LB.
func caseM9(ctx context.Context, webURL, gwURL, origin string, podMetrics []string, n int) error {
	if len(podMetrics) < 2 {
		return fmt.Errorf("-pod-metrics cần ÍT NHẤT hai URL (mỗi replica một cái), nhận %d: %v — "+
			"không có đủ hai thì không phân biệt được 'LB rải đều' với 'dồn hết vào một pod'", len(podMetrics), podMetrics)
	}

	truoc := make([]*histogram, len(podMetrics))
	for i, u := range podMetrics {
		h, err := docHistogram(ctx, u)
		if err != nil {
			return fmt.Errorf("đọc histogram TRƯỚC của %s: %w", u, err)
		}
		truoc[i] = h
	}

	s, err := taoSession(ctx, webURL)
	if err != nil {
		return fmt.Errorf("tạo session: %w", err)
	}
	fmt.Printf("1. session %s · pod %s\n", s.sid, s.pod)

	var so429 int
	for i := 0; i < n; i++ {
		c, err := dial(ctx, s, gwURL, origin)
		if err != nil {
			if strings.Contains(err.Error(), "429") {
				so429++
				// Khe WS của lượt trước chưa được nhả (DECR nằm trong defer).
				// Chờ rồi thử lại — không tính là lỗi, nhưng ĐẾM để báo cáo.
				time.Sleep(400 * time.Millisecond)
				i--
				continue
			}
			return fmt.Errorf("lượt %d/%d dial hỏng: %w", i+1, n, err)
		}
		w := wrap(ctx, c)
		if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
			_ = c.CloseNow()
			return fmt.Errorf("lượt %d/%d gửi init: %w", i+1, n, err)
		}
		if _, err := doiControl(w, "ready", 60*time.Second); err != nil {
			_ = c.CloseNow()
			return fmt.Errorf("lượt %d/%d đợi ready: %w", i+1, n, err)
		}
		if err := c.Close(websocket.StatusNormalClosure, "xong"); err != nil {
			return fmt.Errorf("lượt %d/%d đóng hỏng: %w", i+1, n, err)
		}
		// Nhường thời gian cho defer DECR chạy trước lượt sau.
		time.Sleep(300 * time.Millisecond)
	}
	fmt.Printf("2. %d lượt mở/đóng TUẦN TỰ xong, 0 lỗi (%d lượt phải chờ khe WS được nhả)\n", n, so429)

	tong := int64(0)
	fmt.Printf("\n%-42s | %s\n", "pod /metrics", "attach mới")
	fmt.Printf("%s\n", strings.Repeat("-", 60))
	var thieu []string
	for i, u := range podMetrics {
		h, err := docHistogram(ctx, u)
		if err != nil {
			return fmt.Errorf("đọc histogram SAU của %s: %w", u, err)
		}
		d := h.count - truoc[i].count
		tong += d
		fmt.Printf("%-42s | %d\n", u, d)
		if d <= 0 {
			thieu = append(thieu, u)
		}
	}
	fmt.Println()

	if len(thieu) > 0 {
		return fmt.Errorf("replica KHÔNG nhận lượt nào: %v — %d lượt đã dồn vào các pod còn lại, "+
			"nên phép đo này KHÔNG chứng minh được gì về cảnh hai replica (LB có thể đang sticky, "+
			"hoặc pod kia chưa vào Endpoints)", thieu, tong)
	}
	if tong != int64(n) {
		return fmt.Errorf("tổng attach mới = %d, đã mở %d lượt — lệch nghĩa là có lượt attach "+
			"KHÔNG được ghi histogram (sai tên metric / pod ngoài danh sách), nên mọi con số trên đây đáng ngờ", tong, n)
	}

	fmt.Printf("KẾT LUẬN: ĐẠT. %d lượt tuần tự, 0 lỗi, tổng histogram khớp %d, và MỖI replica đều phục vụ ≥1 lượt.\n", n, n)
	return nil
}

// ---------------------------------------------------------------- ca m3 (N3)

// caseM3 đo ca "giết gateway giữa phiên rồi chờ TTL" của trần 1 WS/session (D17).
//
// Cơ chế đang thử: `AcquireWS` chạy MỘT script Lua vừa `INCR` vừa `PEXPIRE`, nên
// khe WS không bao giờ tồn tại mà thiếu TTL. Đường trả khe bình thường là `DECR`
// trong một `defer` — mà SIGKILL thì KHÔNG cho defer chạy. TTL vì thế là lưới an
// toàn DUY NHẤT giữa "gateway chết" và "phiên bị khoá vĩnh viễn".
//
// ⛔ TTL CỦA `session:{id}:ws` KHÔNG PHẢI HẰNG SỐ — nó được SUY RA tại lúc nhận
// WS: `ttl = expiresAt(lúc đó) − now`, và KHÔNG heartbeat nào làm mới nó
// (`AcquireWS` là nơi ghi duy nhất). Hệ quả trực tiếp lên cách dựng phép đo: nếu
// mở WS ngay sau khi tạo session thì khe WS và CHÍNH PHIÊN hết hạn CÙNG LÚC —
// và khi đó "mở lại được sau khi TTL hết" là điều không thể quan sát, vì lúc khe
// được nhả thì phiên cũng đã chết. Phép đo chỉ có nghĩa khi phiên SỐNG LÂU HƠN
// khe WS, tức phải để phiên gia hạn thêm SAU khi khe đã được cấp.
//
// Nên trình tự bắt buộc là:
//
//	t+0    tạo session (expiresAt = t+SESSION_TTL)
//	t+60   heartbeat #1 đẩy expiresAt lên  → phiên dài hơn
//	t+62   ĐÓNG rồi MỞ LẠI WS             → khe WS lấy TTL MỚI, dài hơn
//	t+124  heartbeat #2 đẩy expiresAt tiếp → phiên lại dài hơn khe
//	t+130  SIGKILL                         → defer không chạy, khe kẹt
//	…      mở lại → 429 (khe còn) → rồi 101 (khe hết TTL, phiên vẫn sống)
//
// ⛔ VẾ 429 LÀ ĐỐI CHỨNG DƯƠNG, KHÔNG PHẢI PHẦN PHỤ. Không có nó thì "mở lại
// được sau khi chờ" cũng đúng y hệt với "chưa bao giờ bị khoá" — tức phép đo
// không phân biệt được bản vá đang chạy với việc trần WS không tồn tại.
func caseM3(ctx context.Context, webURL, gwURL, origin, killCmd string) error {
	if strings.TrimSpace(killCmd) == "" {
		return errors.New("-kill-cmd rỗng — ca này cần một lệnh GIẾT gateway thật (SIGKILL), ví dụ: " +
			"-kill-cmd 'kubectl -n default delete pod -l app.kubernetes.io/component=gateway --force --grace-period=0'; " +
			"truyền lệnh từ ngoài thay vì nhúng cứng kubectl vì probe không nên tự quyết cách giết tiến trình")
	}

	s, err := taoSession(ctx, webURL)
	if err != nil {
		return fmt.Errorf("tạo session: %w", err)
	}
	fmt.Printf("1. session %s · pod %s\n", s.sid, s.pod)

	// --- WS #1: chỉ để kích một lượt heartbeat, kéo expiresAt ra xa ----------
	c1, err := dialChoNha(ctx, s, gwURL, origin)
	if err != nil {
		return fmt.Errorf("dial WS#1: %w", err)
	}
	w1 := wrap(ctx, c1)
	if err := writeJSON(ctx, c1, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return fmt.Errorf("init WS#1: %w", err)
	}
	if _, err := doiControl(w1, "ready", 60*time.Second); err != nil {
		return fmt.Errorf("ready WS#1: %w", err)
	}
	co, err := doiControl(w1, "expiring", 100*time.Second)
	if err != nil {
		return fmt.Errorf("đợi heartbeat #1 (WS#1): %w", err)
	}
	fmt.Printf("2. heartbeat #1 đã đẩy expiresAt → %s\n", co.ExpiresAt)
	_ = c1.Close(websocket.StatusNormalClosure, "nhường khe cho WS#2")
	time.Sleep(1500 * time.Millisecond) // để defer DECR của WS#1 chạy xong

	// --- WS #2: khe WS này mới là khe sẽ bị kẹt ------------------------------
	c2, err := dialChoNha(ctx, s, gwURL, origin)
	if err != nil {
		return fmt.Errorf("dial WS#2: %w", err)
	}
	w2 := wrap(ctx, c2)
	if err := writeJSON(ctx, c2, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return fmt.Errorf("init WS#2: %w", err)
	}
	if _, err := doiControl(w2, "ready", 60*time.Second); err != nil {
		return fmt.Errorf("ready WS#2: %w", err)
	}
	tKhe := time.Now() // khe WS#2 được cấp quanh mốc này; TTL của nó tính từ đây
	fmt.Printf("3. WS#2 mở — khe WS được cấp lúc %s\n", tKhe.Format("15:04:05"))

	// ⛔ ĐỢI HAI lượt heartbeat trên WS#2, không phải một. KHOẢNG TRỐNG giữa
	// "khe WS hết TTL" và "phiên hết hạn" ĐÚNG BẰNG số heartbeat đã chạy SAU khi
	// khe được cấp, nhân với 60s — vì khe lấy TTL = expiresAt LÚC CẤP, còn phiên
	// thì mỗi heartbeat lại đẩy expiresAt thêm một nhịp. Một heartbeat ⇒ cửa sổ
	// 60s để quan sát "mở lại được", quá hẹp khi gateway còn phải khởi động lại
	// mất ~25s. Hai heartbeat ⇒ ~120s.
	//
	// ⛔ VÀ PHẢI GÕ ĐỀU TRONG LÚC ĐỢI. `extendLoop` chỉ gọi `ExtendSession` khi
	// cờ activity đang bật, mà cờ đó được đọc-rồi-XOÁ mỗi tick. Một WS im lặng
	// vì thế gia hạn ĐÚNG MỘT lần — lượt của stdout lúc tmux vẽ lại màn hình khi
	// attach — rồi thôi. (Đo đúng chuyện này ở lượt chạy trước: heartbeat #3
	// không bao giờ tới, và đó là hành vi ĐÚNG, cùng cơ chế đã đóng ô idle-4404.)
	// Không gõ thì cửa sổ quan sát không bao giờ mở ra được.
	dungGo := make(chan struct{})
	go func() {
		tk := time.NewTicker(20 * time.Second)
		defer tk.Stop()
		for {
			select {
			case <-dungGo:
				return
			case <-tk.C:
				_ = gui(ctx, c2, "x")
			}
		}
	}()
	for i := 2; i <= 3; i++ {
		co2, err := doiControl(w2, "expiring", 100*time.Second)
		if err != nil {
			close(dungGo)
			return fmt.Errorf("đợi heartbeat #%d (WS#2): %w", i, err)
		}
		fmt.Printf("4.%d heartbeat #%d đẩy expiresAt → %s\n", i-1, i, co2.ExpiresAt)
	}
	close(dungGo)
	fmt.Println("   ⇒ phiên nay SỐNG LÂU HƠN khe WS khoảng hai nhịp heartbeat (~120s)")

	// --- SIGKILL -------------------------------------------------------------
	fmt.Printf("5. GIẾT gateway: %s\n", killCmd)
	// #nosec G204 -- `killCmd` là THAM SỐ CỦA NGƯỜI VẬN HÀNH (`-kill-cmd`), và
	// việc nó chạy tuỳ ý là chủ đích: probe cố tình KHÔNG nhúng cứng `kubectl`
	// để không tự quyết cách giết tiến trình. Đây là công cụ lab chạy bằng tay
	// trên node (xem cảnh báo "CHỈ DÙNG TRÊN LAB" ở đầu main.go); không có
	// đường nào cho input từ mạng tới đây.
	out, err := exec.CommandContext(ctx, "sh", "-c", killCmd).CombinedOutput()
	if err != nil {
		return fmt.Errorf("lệnh giết hỏng: %w (output: %s)", err, truncate(string(out), 300))
	}
	tGiet := time.Now()
	fmt.Printf("   %s\n", truncate(strings.TrimSpace(string(out)), 300))

	// WS#2 phải ĐỨT — nếu nó còn sống thì ta chưa giết đúng pod đang giữ phiên,
	// và mọi kết luận phía dưới sẽ nói về một khe chưa bao giờ bị kẹt.
	select {
	case err := <-w2.errc:
		fmt.Printf("6. WS#2 đứt sau %s (close=%d) ⇒ đã giết ĐÚNG pod đang giữ phiên\n",
			time.Since(tGiet).Round(time.Millisecond), websocket.CloseStatus(err))
	case <-time.After(30 * time.Second):
		return fmt.Errorf("WS#2 VẪN SỐNG 30s sau lệnh giết — lệnh không giết đúng pod đang giữ phiên, " +
			"nên ca này chưa đo được gì về khe WS bị kẹt")
	}

	// --- Chờ: phải thấy 429 TRƯỚC, rồi mới tới 101 ---------------------------
	var thay429 bool
	var tMo429, tMoOK time.Time
	hetHan := time.After(6 * time.Minute)
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("hết budget khi đang chờ khe WS được nhả (đã thấy 429: %v)", thay429)
		case <-hetHan:
			return fmt.Errorf("6 phút sau SIGKILL vẫn chưa mở lại được — khe WS KHÔNG được nhả, "+
				"tức phiên bị KHOÁ VĨNH VIỄN (đã thấy 429: %v)", thay429)
		default:
		}

		// Mint lại cookie TRƯỚC mỗi lượt thử. Cookie sandbox hết hạn đúng bằng
		// `expiresAt` LÚC MINT, mà ta đang cố tình chờ quá mốc đó — không mint
		// lại thì mọi lượt dial ăn 401 UNAUTHENTICATED ở tầng authz và KHÔNG BAO
		// GIỜ chạm tới tầng khe WS, tức ca này đo nhầm sang chuyện khác. (Đã đo
		// đúng lỗi đó ở lượt chạy đầu: gateway log "sandbox token không hợp lệ:
		// hết hạn lúc …" suốt 6 phút, không một lượt 429 nào.)
		if err := lamMoiCookie(ctx, webURL, s); err != nil {
			// Phiên đã chết hẳn ⇒ không còn gì để kết luận về khe WS.
			return fmt.Errorf("không mint lại được cookie (phiên có thể đã hết hạn): %w", err)
		}

		c, err := dial(ctx, s, gwURL, origin)
		switch {
		case err == nil:
			_ = c.CloseNow()
			tMoOK = time.Now()
			if !thay429 {
				return fmt.Errorf("mở lại được NGAY (sau %s) mà chưa hề thấy 429 — khe WS chưa từng bị kẹt. "+
					"Hoặc gateway kịp DECR (lệnh giết không phải SIGKILL thật), hoặc trần 1-WS không có hiệu lực",
					tMoOK.Sub(tGiet).Round(time.Second))
			}
			fmt.Printf("7. mở lại THÀNH CÔNG sau %s kể từ lúc giết (%s kể từ lúc khe được cấp)\n",
				tMoOK.Sub(tGiet).Round(time.Second), tMoOK.Sub(tKhe).Round(time.Second))
			fmt.Println("\nKẾT LUẬN: ĐẠT.")
			fmt.Printf("  · khe WS bị KẸT sau SIGKILL — mở lại trả 429 SESSION_IN_USE (lần đầu quan sát được: +%s)\n",
				tMo429.Sub(tGiet).Round(time.Second))
			fmt.Printf("  · khe tự nhả khi TTL hết — mở lại thành công ở +%s, KHÔNG cần can thiệp tay\n",
				tMoOK.Sub(tGiet).Round(time.Second))
			fmt.Println("  · không khoá vĩnh viễn.")
			return nil

		case strings.Contains(err.Error(), "429"):
			if !thay429 {
				thay429 = true
				tMo429 = time.Now()
				fmt.Printf("6b. mở lại → 429 SESSION_IN_USE (+%s sau khi giết) ⇒ khe WS ĐANG bị kẹt đúng như dự đoán\n",
					tMo429.Sub(tGiet).Round(time.Second))
			}

		default:
			// Gateway đang khởi động lại: connection refused / no route. Không
			// phải kết quả, chỉ là chưa tới lúc hỏi được.
		}
		time.Sleep(3 * time.Second)
	}
}

// ---------------------------------------------------------------- ca jwks (N4)

// kidCuaToken đọc `kid` từ header của một JWT (segment đầu, base64url).
func kidCuaToken(token string) (string, error) {
	phan := strings.Split(token, ".")
	if len(phan) != 3 {
		return "", fmt.Errorf("token không có 3 segment (%d)", len(phan))
	}
	raw, err := base64.RawURLEncoding.DecodeString(phan[0])
	if err != nil {
		return "", fmt.Errorf("giải base64 header: %w", err)
	}
	var h struct {
		Kid string `json:"kid"`
		Alg string `json:"alg"`
	}
	if err := json.Unmarshal(raw, &h); err != nil {
		return "", fmt.Errorf("giải JSON header: %w", err)
	}
	if h.Kid == "" {
		return "", fmt.Errorf("header không có kid (alg=%s)", h.Alg)
	}
	return h.Kid, nil
}

// caseJWKS đo một lượt xoay khoá Better Auth THẬT (D15).
//
// Cho tới nay vế này chỉ có `TestVerifyTuRefetchKhiGapKidLa`, chạy trên một
// endpoint JWKS GIẢ — nó chứng minh logic cache/refetch đúng, nhưng không chứng
// minh Better Auth thật sự đẻ kid mới, cũng không chứng minh gateway thật đọc
// được JWKS thật. Ca này đi trọn đường đó.
//
// ⛔ XOAY BẰNG `UPDATE … SET expires_at`, TUYỆT ĐỐI KHÔNG `DELETE`. Lượt mint kế
// tiếp thấy khoá hiện tại đã hết hạn nên đẻ hàng MỚI với `id` mới (`id` CHÍNH LÀ
// `kid`), trong khi `/api/auth/jwks` vẫn công bố kid CŨ thêm 30 ngày grace. `DELETE`
// cũng sinh kid mới nhưng XOÁ kid cũ khỏi JWKS, làm HỎNG đúng nửa sau của AC
// ("token cũ vẫn verify được nếu JWKS còn công bố kid đó") — hai lệnh trông tương
// đương và chỉ một lệnh đo được thứ AC hỏi.
//
// ⛔ NỬA SAU MỚI LÀ NỬA DỄ TRƯỢT. Nếu chỉ kiểm "token mới verify được" thì một
// gateway XOÁ SẠCH cache mỗi lần refetch cũng qua — và nó sẽ đá văng mọi phiên
// đang mở mỗi lần khoá xoay. Token cũ phải CÒN verify được thì mới phân biệt
// "refetch có chọn lọc" với "reset toàn bộ".
func caseJWKS(ctx context.Context, webURL, gwURL, origin, rotateCmd string) error {
	if strings.TrimSpace(rotateCmd) == "" {
		return fmt.Errorf("-rotate-cmd rỗng. Ca này cần lệnh xoay khoá THẬT — nội dung SQL phải là " +
			"`UPDATE jwks SET expires_at = now() - interval '1 minute';` chạy qua psql trong pod postgres. " +
			"KHÔNG dùng DELETE: nó xoá kid cũ khỏi JWKS và làm hỏng nửa sau của AC")
	}

	// --- Trước khi xoay: một phiên + token mang kid CŨ ------------------------
	cu, err := taoSession(ctx, webURL)
	if err != nil {
		return fmt.Errorf("tạo session TRƯỚC khi xoay: %w", err)
	}
	kidCu, err := kidCuaToken(cu.jar.get("dlp_sandbox"))
	if err != nil {
		return fmt.Errorf("đọc kid của token cũ: %w", err)
	}
	fmt.Printf("1. phiên CŨ %s · kid=%s\n", cu.sid, kidCu)

	// --- Xoay ---------------------------------------------------------------
	fmt.Printf("2. XOAY khoá: %s\n", rotateCmd)
	// #nosec G204 -- cùng lý do với `killCmd` ở caseM3: `-rotate-cmd` là tham số
	// của người vận hành, và probe cố tình không nhúng cứng lệnh SQL xoay khoá.
	out, err := exec.CommandContext(ctx, "sh", "-c", rotateCmd).CombinedOutput()
	if err != nil {
		return fmt.Errorf("lệnh xoay hỏng: %w (output: %s)", err, truncate(string(out), 400))
	}
	fmt.Printf("   %s\n", truncate(strings.TrimSpace(string(out)), 200))

	// --- Sau khi xoay: phiên mới PHẢI mang kid KHÁC --------------------------
	moi, err := taoSession(ctx, webURL)
	if err != nil {
		return fmt.Errorf("tạo session SAU khi xoay: %w — nếu lỗi nhắc tới cột `alg`/`crv` thì "+
			"adapter drizzle đang truyền thẳng field mà schema không khai báo, và lượt mint khoá mới chết ở đó", err)
	}
	kidMoi, err := kidCuaToken(moi.jar.get("dlp_sandbox"))
	if err != nil {
		return fmt.Errorf("đọc kid của token mới: %w", err)
	}
	fmt.Printf("3. phiên MỚI %s · kid=%s\n", moi.sid, kidMoi)

	if kidMoi == kidCu {
		return fmt.Errorf("kid KHÔNG đổi (%s) — lượt xoay không đẻ khoá mới, nên phần còn lại của ca này "+
			"sẽ chỉ chứng minh 'token verify được', không chứng minh gì về rotation", kidCu)
	}

	// --- Vế 1: token kid MỚI verify được, gateway KHÔNG restart --------------
	c1, err := dialChoNha(ctx, moi, gwURL, origin)
	if err != nil {
		return fmt.Errorf("WS với token kid MỚI (%s) bị từ chối: %w — gateway chưa refetch JWKS. "+
			"Có sàn %s giữa hai lượt fetch, nên chờ qua mốc đó rồi mới kết luận", kidMoi, err, "10s")
	}
	w1 := wrap(ctx, c1)
	if err := writeJSON(ctx, c1, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return fmt.Errorf("init WS kid mới: %w", err)
	}
	if _, err := doiControl(w1, "ready", 60*time.Second); err != nil {
		return fmt.Errorf("ready WS kid mới: %w", err)
	}
	_ = c1.Close(websocket.StatusNormalClosure, "xong")
	fmt.Printf("4. WS bằng token kid MỚI: ready ⇒ gateway TỰ refetch JWKS (không restart)\n")

	// --- Vế 2: token kid CŨ vẫn verify được ---------------------------------
	c2, err := dialChoNha(ctx, cu, gwURL, origin)
	if err != nil {
		return fmt.Errorf("WS với token kid CŨ (%s) bị từ chối: %w — JWKS còn công bố kid cũ trong 30 ngày "+
			"grace, nên từ chối ở đây nghĩa là gateway ĐÃ XOÁ SẠCH cache khi refetch. Hệ quả thật: mỗi lượt "+
			"xoay khoá đá văng mọi phiên đang mở", kidCu, err)
	}
	w2 := wrap(ctx, c2)
	if err := writeJSON(ctx, c2, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return fmt.Errorf("init WS kid cũ: %w", err)
	}
	if _, err := doiControl(w2, "ready", 60*time.Second); err != nil {
		return fmt.Errorf("ready WS kid cũ: %w", err)
	}
	_ = c2.Close(websocket.StatusNormalClosure, "xong")
	fmt.Printf("5. WS bằng token kid CŨ: ready ⇒ refetch có CHỌN LỌC, không reset sạch cache\n")

	fmt.Println("\nKẾT LUẬN: ĐẠT.")
	fmt.Printf("  · Better Auth đẻ kid mới thật: %s → %s\n", kidCu, kidMoi)
	fmt.Println("  · gateway verify được token kid MỚI mà không cần restart (tự refetch JWKS)")
	fmt.Println("  · token kid CŨ (chưa hết hạn) VẪN verify được — JWKS còn công bố kid đó")
	return nil
}
