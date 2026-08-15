// Ca đo AC-H6 (P3/3.H) — BÃO NỐI-LẠI sau khi rollout gateway.
//
// ⛔ VÌ SAO PHẢI LÀ MỘT CA RIÊNG, KHÔNG PHẢI MỘT CỜ CỦA `caseDrain`.
// `caseDrain` nối lại TUẦN TỰ (`for _, p := range ps`), mỗi phiên một lượt, chờ
// xong mới sang phiên kế. Hình dạng đó đúng cho AC-H1/H2/H3 (nó cần đọc close
// code và khe WS của TỪNG phiên, không lẫn) nhưng nó **không thể tạo ra bão**:
// bão là mọi client đâm vào biên trong CÙNG một khoảnh khắc. Chạy tuần tự thì
// trần rate-limit không bao giờ bị đụng, và ô AC sẽ báo "biên không chật" cho
// một phép đo chưa từng gây áp lực nào lên biên.
//
// ⛔ VÌ SAO PHẢI ĐI ĐÚNG LỊCH BACKOFF CỦA FE, KHÔNG PHẢI "thử lại ngay".
// Cả giả thuyết của chặng nằm ở chỗ `packages/terminal/src/backoff.ts` cố ý BỎ
// JITTER, với lý do ghi rõ: "không có đàn client nào cùng nối lại một lúc". Tiền
// đề ấy đúng cho ca đứt mạng lẻ tẻ và SAI chính xác vào lúc rollout — drain đóng
// mọi phiên cùng một khoảnh khắc, nên mọi client chạy cùng lịch 1/2/4/8/15s
// KHÔNG LỆCH PHA. Một probe thử-lại-ngay đo một hình dạng tải khác hẳn thứ trình
// duyệt thật tạo ra, nên số nó cho không nói gì về rủi ro thật.
//
// ⛔ VÌ SAO 429 PHẢI PHÂN LOẠI BẰNG BODY, KHÔNG BẰNG MÃ.
// Hai nguồn 429 khác hẳn nhau về ý nghĩa và trùng nhau về mã:
//
//	· Traefik (biên)  — "cả lớp học đang đâm vào rate-limit". Body text thuần.
//	· gateway         — `SESSION_IN_USE`: khe WS của CHÍNH phiên đó còn kẹt.
//	  Body JSON có trường `code`.
//
// Gộp hai thứ này là mất đúng thông tin mà H-5 cần để quyết định jitter: một bên
// bảo "biên chật, rải client ra"; bên kia bảo "khe chưa nhả, chờ lease". Đo được
// 429 mà không biết của ai thì không kết luận được gì.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

// lichBackoffFE là ĐÚNG lịch của `packages/terminal/src/backoff.ts`
// (SCHEDULE_MS + MAX_BACKOFF_MS). Chép sang đây là trùng lặp có chủ ý và có
// giới hạn: probe này chạy ngoài bundle TS, không import được. Đổi một bên mà
// quên bên kia thì phép đo mô phỏng một FE không tồn tại — nên nếu `backoff.ts`
// đổi, ô AC-H6 phải chạy lại chứ không chỉ sửa hằng số ở đây.
var lichBackoffFE = []time.Duration{
	1 * time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second,
}

const tranBackoffFE = 15 * time.Second

func khoanNghi(luot int) time.Duration {
	if luot < 1 {
		return lichBackoffFE[0]
	}
	if luot <= len(lichBackoffFE) {
		return lichBackoffFE[luot-1]
	}
	return tranBackoffFE
}

// loaiKetQua là năm ô mà AC-H6 đòi tách rời. Chúng KHÔNG được cộng chung:
// 3.E đã đo đúng ca ramp song song ra `000` (lỗi vận chuyển) chứ không ra 429,
// và hai thứ đó dẫn tới hai kết luận trái ngược về việc biên có chật hay không.
type loaiKetQua string

const (
	kqOK        loaiKetQua = "101-noi-lai-duoc"
	kq429Bien   loaiKetQua = "429-cua-BIEN(traefik)"
	kq429InUse  loaiKetQua = "429-SESSION_IN_USE(gateway)"
	kq429Next   loaiKetQua = "429-cua-NEXT"
	kqVanChuyen loaiKetQua = "loi-VAN-CHUYEN(dns/tcp/tls/reset)"
	kqKhac      loaiKetQua = "khac"
)

// thuNoiLai mở một lượt dial và PHÂN LOẠI kết quả, có đọc body.
//
// `dial` sẵn có đóng body mà không đọc — đủ cho các ca khác, nhưng ở đây body
// CHÍNH LÀ thứ phân biệt hai nguồn 429. Nên ca này có đường dial riêng.
func thuNoiLai(ctx context.Context, s *session, gwURL, origin string) (loaiKetQua, string, *websocket.Conn) {
	hdr := http.Header{}
	hdr.Set("Origin", origin)
	hdr.Set("Cookie", s.jar.header())

	c, resp, err := websocket.Dial(ctx, gwURL+"/ws/session/"+s.sid, &websocket.DialOptions{
		HTTPHeader:   hdr,
		Subprotocols: []string{"dlp.terminal.v1"},
		HTTPClient:   wsDialClient,
	})

	var body string
	if resp != nil && resp.Body != nil {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		_ = resp.Body.Close()
		body = strings.TrimSpace(string(b))
	}

	if err == nil {
		return kqOK, "", c
	}

	// KHÔNG có response ⇒ không tới được tầng HTTP: DNS/TCP/TLS/reset. Đây là ô
	// (d), và nó tuyệt đối không được gộp vào 429.
	if resp == nil {
		return kqVanChuyen, truncate(err.Error(), 140), nil
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		// Gateway trả JSON có `code`; Traefik trả text thuần. Thử JSON trước —
		// nếu parse ra `code` thì chắc chắn là gateway, không cần đoán theo chuỗi.
		var j struct {
			Code  string `json:"code"`
			Error string `json:"error"`
		}
		if json.Unmarshal([]byte(body), &j) == nil && j.Code != "" {
			if j.Code == "SESSION_IN_USE" {
				return kq429InUse, j.Code, nil
			}
			return kq429Next, j.Code, nil
		}
		if strings.Contains(body, "SESSION_IN_USE") {
			return kq429InUse, truncate(body, 140), nil
		}
		return kq429Bien, truncate(body, 140), nil
	}

	return kqKhac, fmt.Sprintf("HTTP %d · %s", resp.StatusCode, truncate(body, 120)), nil
}

// userSan là một user ĐÃ DỰNG SẴN, đọc từ pool của k6 (`infra/k6/.users.json`).
//
// ⛔ VÌ SAO KHÔNG DÙNG `taoSession` (nó tự sign-up mỗi phiên).
// Better Auth rate-limit ĐĂNG KÝ theo IP: ~2–3 lượt rồi 429. Ca này cần n > 10
// phiên, nên đường sign-up-mỗi-phiên chết ở PHA 1 — đo được: lượt đầu tiên chạy
// `-n 14` dừng ở `[s4] tạo session: sign-up: HTTP 429`. Và triệu chứng ấy đọc y
// hệt "hệ đã chặn tải", tức phép đo tự nói dối về đúng thứ nó định đo.
//
// `infra/k6/provision-users.sh` đã giải đúng bài này cho 3.F (dựng một lần,
// cache lại, có backoff). Tái dùng pool đó thay vì dựng cơ chế thứ hai — hai
// đường tạo user sẽ trôi khỏi nhau, và bản trôi thì im lặng.
type userSan struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Cookie string `json:"cookie"`
}

func napUsers(path string) ([]userSan, error) {
	b, err := os.ReadFile(path) // #nosec G304 -- cờ dòng lệnh của công cụ vận hành
	if err != nil {
		return nil, fmt.Errorf("đọc pool user %q: %w", path, err)
	}
	var us []userSan
	if err := json.Unmarshal(b, &us); err != nil {
		return nil, fmt.Errorf("parse pool user %q: %w", path, err)
	}
	var ok []userSan
	for _, u := range us {
		if u.UserID != "" && u.Cookie != "" {
			ok = append(ok, u)
		}
	}
	if len(ok) == 0 {
		return nil, fmt.Errorf("pool user %q rỗng — chạy infra/k6/provision-users.sh trước", path)
	}
	return ok, nil
}

// taoSessionVoiUser dựng session cho một user CÓ SẴN. Khác `taoSession` đúng ở
// chỗ bỏ bước sign-up; phần `session.create` giữ nguyên hình dạng để hai đường
// không lệch nhau về ngữ nghĩa (tier, ttl, idempotencyKey).
func taoSessionVoiUser(ctx context.Context, webURL string, u userSan, idemHau string) (*session, error) {
	jar := &cookieJar{pairs: map[string]string{}}
	for _, phan := range strings.Split(u.Cookie, "; ") {
		ten, gt, co := strings.Cut(strings.TrimSpace(phan), "=")
		if co && ten != "" {
			jar.pairs[ten] = gt
		}
	}

	var created struct {
		Result struct {
			Data struct {
				Session struct {
					ID      string `json:"id"`
					PodName string `json:"podName"`
				} `json:"session"`
			} `json:"data"`
		} `json:"result"`
	}
	if err := postJSON(ctx, jar, webURL+"/api/trpc/session.create", map[string]any{
		"userId":         u.UserID,
		"tier":           1,
		"ttlSeconds":     0,
		"idempotencyKey": "storm-" + idemHau,
	}, &created); err != nil {
		return nil, fmt.Errorf("session.create (user %s): %w", u.Email, err)
	}
	if created.Result.Data.Session.ID == "" {
		return nil, fmt.Errorf("session.create không trả session.id (user %s)", u.Email)
	}
	// `userID`/`idem` là BẮT BUỘC, không phải tuỳ chọn: chúng là đường mint lại
	// cookie `dlp_sandbox` (xem `session` struct). Thiếu chúng thì mọi lượt đo
	// kéo dài hơn `expiresAt` ban đầu ăn 401 ở tầng authz — và 401 lúc nối lại
	// đọc ra như "biên/gateway từ chối", tức lẫn thẳng vào ô AC-H6 đang đếm.
	return &session{
		jar:    jar,
		sid:    created.Result.Data.Session.ID,
		pod:    created.Result.Data.Session.PodName,
		userID: u.UserID,
		idem:   "storm-" + idemHau,
	}, nil
}

// phienBao là kết quả nối-lại của MỘT phiên trong bão.
type phienBao struct {
	ten     string
	s       *session
	c       *websocket.Conn
	w       *conn
	dongLuc time.Time
	// Mọi lượt thử, theo thứ tự — giữ đủ để report in được cả đường đi, không
	// chỉ kết cục. Một phiên "cuối cùng nối lại được" sau khi ăn 4 lượt 429 của
	// biên là một dữ kiện khác hẳn một phiên nối lại ngay lượt đầu.
	luot    []loaiKetQua
	chiTiet []string
	cuoi    loaiKetQua
	mat     time.Duration
}

// caseStorm — AC-H6. Ba pha; khác `caseDrain` ở chỗ PHA 3 chạy ĐỒNG THỜI.
func caseStorm(ctx context.Context, webURL, gwURL, origin, rolloutCmd, usersFile string, n int) error {
	if rolloutCmd == "" {
		return fmt.Errorf("ca storm cần -rollout-cmd")
	}
	if n < 1 {
		return fmt.Errorf("-n phải ≥ 1")
	}
	// ⚠ Ô AC-H6 chỉ có nghĩa khi n ĐỦ LỚN để đụng trần biên. Trần WS hiện là
	// `average 20/1m, burst 10` (values.yaml § ingress.middleware.rateLimit).
	// Với n ≤ 10 thì "không thấy 429 của biên" KHÔNG phân biệt được với "biên
	// rộng rãi" — đợt nối lại đầu tiên chỉ có n request, dưới burst, nên nó
	// không thể đụng trần dù trần chật tới đâu. Cảnh báo thay vì chặn: một lượt
	// n nhỏ vẫn hữu ích để so sánh, miễn là report không đọc nó thành kết luận.
	if n <= 10 {
		fmt.Printf("⚠ n=%d ≤ burst 10 của trần biên — lượt này KHÔNG thể chứng minh\n"+
			"  biên rộng rãi. Nó chỉ là đối chứng âm; muốn kết luận phải n > 10.\n\n", n)
	}

	us, err := napUsers(usersFile)
	if err != nil {
		return err
	}
	if len(us) < n {
		return fmt.Errorf("pool chỉ có %d user mà -n=%d. Mỗi phiên PHẢI một user riêng: "+
			"trần per-user của tRPC là 20 mutation/1m, dùng chung user sẽ biến một ô đo BIÊN "+
			"thành một ô đo trần per-user. Chạy: USERS=%d bash infra/k6/provision-users.sh",
			len(us), n, n)
	}

	fmt.Printf("== ca storm (AC-H6) · n=%d phiên ==\n", n)
	fmt.Printf("   pool user: %s (%d user, dùng %d)\n", usersFile, len(us), n)
	fmt.Printf("   lịch backoff mô phỏng FE: %v, trần %v, KHÔNG jitter\n", lichBackoffFE, tranBackoffFE)
	fmt.Printf("   rollout-cmd: %s\n\n", rolloutCmd)

	// ---------------------------------------------------------------- pha 1
	fmt.Println("PHA 1 — mở phiên và đợi tất cả ready")
	// Mốc để idempotencyKey của lượt chạy này KHÔNG trùng lượt trước: trùng thì
	// `session.create` trả lại phiên CŨ (replayIdempotent) và bão đo trên những
	// phiên đã chết.
	tKhoi := time.Now().UnixNano()
	ps := make([]*phienBao, 0, n)
	for i := 0; i < n; i++ {
		p := &phienBao{ten: fmt.Sprintf("s%d", i+1)}
		s, err := taoSessionVoiUser(ctx, webURL, us[i], fmt.Sprintf("%d-%d", tKhoi, i+1))
		if err != nil {
			return fmt.Errorf("[%s] tạo session: %w", p.ten, err)
		}
		p.s = s
		c, err := dialChoNha(ctx, s, gwURL, origin)
		if err != nil {
			return fmt.Errorf("[%s] dial: %w", p.ten, err)
		}
		p.c, p.w = c, wrap(ctx, c)
		if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
			return fmt.Errorf("[%s] gửi init: %w", p.ten, err)
		}
		if _, err := doiControl(p.w, "ready", 90*time.Second); err != nil {
			return fmt.Errorf("[%s] đợi ready: %w", p.ten, err)
		}
		ps = append(ps, p)
		fmt.Printf("   [%s] ready · pod=%s\n", p.ten, s.pod)
	}
	fmt.Printf("   hàng rào: %d/%d phiên ready\n\n", len(ps), n)

	// ---------------------------------------------------------------- pha 2
	fmt.Println("PHA 2 — kích rollout, đợi MỌI socket đóng (mốc backoff của từng phiên)")
	tKich := time.Now()
	xong := make(chan error, 1)
	go func() {
		// #nosec G204 -- cờ dòng lệnh của công cụ vận hành, không phải input người dùng.
		out, err := exec.CommandContext(ctx, "sh", "-c", rolloutCmd).CombinedOutput()
		if err != nil {
			xong <- fmt.Errorf("%w — output: %s", err, duoi(string(out), 300))
			return
		}
		xong <- nil
	}()

	var wgDong sync.WaitGroup
	for _, p := range ps {
		wgDong.Add(1)
		go func(p *phienBao) {
			defer wgDong.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case err := <-p.w.errc:
					p.dongLuc = time.Now()
					cc := websocket.CloseStatus(err)
					fmt.Printf("   [%s] đóng sau %v · close=%d\n",
						p.ten, time.Since(tKich).Round(time.Millisecond), int(cc))
					return
				case <-p.w.ch:
					// frame lạc — chưa phải sự kiện đóng
				}
			}
		}(p)
	}
	wgDong.Wait()
	if err := <-xong; err != nil {
		return fmt.Errorf("rollout-cmd hỏng: %w", err)
	}
	fmt.Printf("   rollout xong sau %v\n\n", time.Since(tKich).Round(time.Second))

	// ---------------------------------------------------------------- pha 3
	// ĐỒNG THỜI, mỗi phiên theo lịch FE tính từ mốc đóng CỦA CHÍNH NÓ. Drain đóng
	// mọi phiên gần như cùng lúc nên các mốc trùng nhau — và chính sự trùng đó là
	// hiện tượng cần đo.
	fmt.Println("PHA 3 — bão nối-lại ĐỒNG THỜI theo lịch FE")
	const maxLuot = 6
	var wg sync.WaitGroup
	for _, p := range ps {
		wg.Add(1)
		go func(p *phienBao) {
			defer wg.Done()
			batDau := p.dongLuc
			if batDau.IsZero() {
				batDau = tKich
			}
			for luot := 1; luot <= maxLuot; luot++ {
				select {
				case <-ctx.Done():
					p.cuoi = kqKhac
					return
				case <-time.After(time.Until(batDau.Add(tongNghi(luot)))):
				}
				kq, ct, c := thuNoiLai(ctx, p.s, gwURL, origin)
				p.luot = append(p.luot, kq)
				if ct != "" {
					p.chiTiet = append(p.chiTiet, fmt.Sprintf("luot%d:%s", luot, ct))
				}
				if kq == kqOK {
					p.cuoi = kqOK
					p.mat = time.Since(batDau)
					_ = c.CloseNow()
					return
				}
				p.cuoi = kq
			}
			p.mat = time.Since(batDau)
		}(p)
	}
	wg.Wait()

	return ketLuanStorm(ps)
}

// tongNghi là thời điểm của lượt thứ `luot` tính từ mốc đóng — cộng dồn lịch,
// đúng cách FE làm (mỗi lượt nghỉ rồi mới thử, không phải mọi lượt cùng mốc).
func tongNghi(luot int) time.Duration {
	var t time.Duration
	for i := 1; i <= luot; i++ {
		t += khoanNghi(i)
	}
	return t
}

func ketLuanStorm(ps []*phienBao) error {
	fmt.Println()
	fmt.Println("── AC-H6 — CÁC CON SỐ TÁCH RỜI (ô này GHI SỐ, không gác ngưỡng) ──")

	dem := map[loaiKetQua]int{}
	demLuot := map[loaiKetQua]int{}
	for _, p := range ps {
		dem[p.cuoi]++
		for _, l := range p.luot {
			demLuot[l]++
		}
	}

	thuTu := []loaiKetQua{kqOK, kq429Bien, kq429Next, kq429InUse, kqVanChuyen, kqKhac}
	fmt.Printf("   %-34s %8s %8s\n", "loại", "kết cục", "tổng lượt")
	for _, k := range thuTu {
		fmt.Printf("   %-34s %8d %8d\n", string(k), dem[k], demLuot[k])
	}

	tongLuot := 0
	for _, v := range demLuot {
		tongLuot += v
	}
	fmt.Printf("\n   tổng lượt thử: %d trên %d phiên\n", tongLuot, len(ps))

	for _, p := range ps {
		if len(p.chiTiet) > 0 {
			fmt.Printf("   [%s] %v  ·  %s\n", p.ten, p.luot, strings.Join(p.chiTiet, " | "))
		}
	}

	// Ô này KHÔNG gác ngưỡng (plan §H4 AC-H6): mục tiêu là biết trần biên có chật
	// không, và câu trả lời là dữ liệu cho quyết định H-5, không phải một cổng.
	// Nhưng hai điều kiện dưới đây làm PHÉP ĐO vô hiệu, nên chúng vẫn phải đỏ.
	if tongLuot == 0 {
		return fmt.Errorf("0 lượt thử — phép đo không chạy, đừng đọc thành 'không có 429'")
	}
	if demLuot[kqVanChuyen] > 0 {
		fmt.Printf("\n   ⚠ CÓ %d lượt lỗi VẬN CHUYỂN. Chúng KHÔNG phải bằng chứng biên chật —\n"+
			"     3.E đã đo ca ramp song song ra `000` chứ không ra 429. Xem chi tiết trên.\n",
			demLuot[kqVanChuyen])
	}

	fmt.Printf("\n   → H-5 (jitter) quyết theo cột `%s`: %d lượt.\n",
		kq429Bien, demLuot[kq429Bien])
	if demLuot[kq429Bien] == 0 {
		fmt.Println("     0 ⇒ ở quy mô n này biên KHÔNG chật; kết luận chỉ áp cho đúng n đã đo.")
	}
	return nil
}
