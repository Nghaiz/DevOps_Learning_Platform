// Ca đo của chặng 3.H — WS scale layer.
//
// Tách khỏi `cases_g3.go` vì ca dưới đây quan sát một sự kiện VẬN HÀNH (rollout
// gateway) chứ không quan sát vòng đời tự nhiên của phiên: nó cần một hàng rào
// "mọi phiên đã ready" trước khi kích sự kiện, rồi cần một pha THỨ HAI (nối lại)
// sau khi sự kiện xong. `theoDoiPhien` không dựng được hình dạng đó vì nó mở và
// quan sát đúng một phiên cho tới lúc đóng, không có chỗ chen sự kiện vào giữa.
package main

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// tranPhienDongThoi là trần phiên đồng thời của cụm lab, ĐO ĐƯỢC chứ không đoán.
//
// 2026-08-16 (3.I mắt 5): 3 → 21. Trần cũ đến từ `requests` 500m/512Mi mà mắt 3
// chứng minh là thổi phồng — `memory.current` đỉnh 428–464Mi gộp page cache, còn
// workingSet (đại lượng kubelet thật sự dùng) chỉ 158–163Mi. Sau khi đặt lại
// 250m/256Mi: `requests.cpu 5400m ÷ 250m = 21 pod`. Đo lại bằng k6 `ceiling.js`:
// 21 phiên id phân biệt, lượt #22 bị từ chối đúng lý do quota.
//
// ⛔ ĐÂY LÀ MỘT BẢN SAO CỦA CẤU HÌNH, VÀ BẢN SAO THÌ TRÔI. Nguồn thật là
// ResourceQuota × LimitRange trên cụm; `infra/k8s/reaper-verify.sh`
// § `quota_pod_ceiling` tính đúng công thức 5-ràng-buộc từ đối tượng SỐNG. Hằng
// số ở đây chỉ để chặn một cờ `-n` vô lý sớm, KHÔNG phải nguồn sự thật — mỗi lần
// nới quota phải sửa nó, nếu không ca drain/storm từ chối chạy dù cụm còn chỗ.
const tranPhienDongThoi = 21

// cuaSoNoiLai là trần thời gian chờ khe WS được nhả ở pha 3.
//
// Đặt qua -reconnect-wait. Mặc định 15s hợp cho ca drain êm (khe trả ngay);
// ca SIGKILL cần > lease khe WS (mặc định 90s) — xem doiKheNha.
var cuaSoNoiLai = 15 * time.Second

// doiKheNha thử nối lại tới khi được, hoặc hết `hen`.
//
// Tách khỏi `dialChoNha` (trần 10s cứng) vì hai ca cần hai thang thời gian khác
// hẳn nhau, và dùng nhầm thang cho ra kết luận sai chứ không chỉ ra số sai:
//   - drain êm  : khe được trả trong mili-giây
//   - SIGKILL   : khe chỉ rụng khi hết lease
//
// In tiến trình mỗi 15s: một lượt chờ 90s im lặng đọc ra như treo.
func doiKheNha(ctx context.Context, s *session, gwURL, origin string, hen time.Duration) (*websocket.Conn, error) {
	batDau := time.Now()
	inLan := batDau
	for {
		c, err := dial(ctx, s, gwURL, origin)
		if err == nil {
			return c, nil
		}
		if !strings.Contains(err.Error(), "429") {
			return nil, err
		}
		if time.Since(batDau) >= hen {
			return nil, fmt.Errorf("khe vẫn kẹt sau %v: %w", hen.Round(time.Second), err)
		}
		if time.Since(inLan) >= 15*time.Second {
			fmt.Printf("      …vẫn 429 sau %v\n", time.Since(batDau).Round(time.Second))
			inLan = time.Now()
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Second):
		}
	}
}

// phienDrain là thứ quan sát được về MỘT phiên xuyên suốt ba pha của ca drain.
type phienDrain struct {
	ten string
	s   *session
	c   *websocket.Conn
	w   *conn

	// Pha 2 — đóng.
	closeCode websocket.StatusCode // -1 = đứt KHÔNG kèm close code (client thấy như 1006)
	doiDong   time.Duration        // từ lúc kích rollout tới lúc socket đóng

	// Pha 3 — nối lại.
	noiLaiMa      string        // "101" | "429" | mã/lỗi khác
	noiLai429Trc  bool          // lượt đầu tiên có ăn 429 SESSION_IN_USE không
	noiLaiSau     time.Duration // mất bao lâu mới nối lại được (từ lúc bắt đầu thử)
	noiLaiPodKhop bool          // pod sandbox sau khi nối lại có TRÙNG pod trước không

	err error
}

// caseDrain đo điều gì xảy ra với các WS đang mở khi gateway bị rollout.
//
// Ba pha, và ô AC nằm ở ranh giới giữa chúng:
//
//	pha 1  mở n phiên thật, đợi TẤT CẢ `ready`  → hàng rào
//	pha 2  chạy rolloutCmd, quan sát close code → AC-H1
//	pha 3  nối lại từng phiên                   → AC-H2 (khe đã trả?) + AC-H3 (đúng pod cũ?)
//
// ⛔ VÌ SAO PHẢI CÓ HÀNG RÀO Ở PHA 1: nếu kích rollout trong lúc còn phiên chưa
// `ready`, phiên đó đứt vì đang dial dở chứ không vì drain — và triệu chứng
// (socket đóng) giống hệt nhau. Ô AC-H1 khi đó đọc một con số trộn hai nguyên nhân.
//
// ⛔ VÌ SAO PHA 3 DÙNG `dial` THÔ CHỨ KHÔNG `dialChoNha`: `dialChoNha` tự nuốt
// 429 và retry 10s. Chính cái 429 ấy LÀ phép đo ở đây (khe WS còn kẹt hay đã
// trả). Dùng bản có retry thì ô AC-H2 xanh y hệt ở cả hai giả thuyết.
//
// ⛔ `n` BỊ TRẦN QUOTA CHẶN: 3.F đo được trần phiên đồng thời của lab là 3
// (`requests.cpu 2100m ÷ 500m = 4 pod`, trừ `POOL_TARGET=1`). Đặt n > 3 thì
// phiên thừa chết ở `session.create` vì quota — một lý do KHÔNG liên quan gì tới
// drain, nhưng đọc ra vẫn là "phiên không mở được".
func caseDrain(ctx context.Context, webURL, gwURL, origin, rolloutCmd string, n int) error {
	if rolloutCmd == "" {
		return fmt.Errorf("ca drain cần -rollout-cmd (ví dụ: 'kubectl -n default rollout restart deploy/platform-gateway && kubectl -n default rollout status deploy/platform-gateway --timeout=180s')")
	}
	if n < 1 {
		return fmt.Errorf("-n phải ≥ 1")
	}
	// `-n` mặc định của công cụ là 50 (hợp cho ca `attach`, vô nghĩa ở đây). Chặn
	// tường minh thay vì để lượt chạy chết giữa chừng ở `session.create` với lỗi
	// quota — lỗi đó đọc ra như "hệ hỏng" trong khi nguyên nhân là cờ dòng lệnh.
	if n > tranPhienDongThoi {
		return fmt.Errorf("-n=%d vượt trần phiên đồng thời của lab (%d, đo ở 3.F: requests.cpu 2100m ÷ 500m = 4 pod, trừ POOL_TARGET=1). "+
			"Truyền -n ≤ %d", n, tranPhienDongThoi, tranPhienDongThoi)
	}

	fmt.Printf("== ca drain · n=%d phiên ==\n", n)
	fmt.Printf("   rollout-cmd: %s\n\n", rolloutCmd)

	// ---------------------------------------------------------------- pha 1
	fmt.Println("PHA 1 — mở phiên và đợi tất cả ready")
	ps := make([]*phienDrain, 0, n)
	for i := 0; i < n; i++ {
		p := &phienDrain{ten: fmt.Sprintf("s%d", i+1), closeCode: -1}
		ps = append(ps, p)

		// TUẦN TỰ chứ không song song: `session.create` chạm quota, và hai lượt
		// create đồng thời ở sát trần cho ra lỗi quota không xác định được của ai.
		s, err := taoSession(ctx, webURL)
		if err != nil {
			return fmt.Errorf("[%s] tạo session: %w", p.ten, err)
		}
		p.s = s

		c, err := dialChoNha(ctx, s, gwURL, origin)
		if err != nil {
			return fmt.Errorf("[%s] dial: %w", p.ten, err)
		}
		p.c = c
		p.w = wrap(ctx, c)

		if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
			return fmt.Errorf("[%s] gửi init: %w", p.ten, err)
		}
		if _, err := doiControl(p.w, "ready", 60*time.Second); err != nil {
			return fmt.Errorf("[%s] đợi ready: %w", p.ten, err)
		}
		fmt.Printf("   [%s] ready · pod=%s · sid=%s\n", p.ten, s.pod, s.sid)
	}
	fmt.Printf("   hàng rào: %d/%d phiên ready\n\n", len(ps), n)

	// ---------------------------------------------------------------- pha 2
	fmt.Println("PHA 2 — kích rollout, quan sát close code")
	tKich := time.Now()

	// Chạy rollout ĐỒNG THỜI với việc quan sát: `rollout status` chặn tới khi
	// xong, mà socket đóng TRƯỚC đó. Chờ lệnh xong rồi mới đọc thì mốc thời gian
	// `doiDong` mất nghĩa.
	xong := make(chan error, 1)
	go func() {
		// #nosec G204 -- rolloutCmd là hằng số phía probe (cờ dòng lệnh của công
		// cụ vận hành, không phải input người dùng); probe này không chạy trong
		// service, chỉ chạy tay khi đo 3.H.
		out, err := exec.CommandContext(ctx, "sh", "-c", rolloutCmd).CombinedOutput()
		if err != nil {
			xong <- fmt.Errorf("%w — output: %s", err, duoi(string(out), 300))
			return
		}
		xong <- nil
	}()

	for _, p := range ps {
		// Vòng TRONG: đọc tới khi socket thật sự đóng. Một frame lạc (byte stdout
		// còn trên đường, hay một control `expiring` đúng nhịp) KHÔNG phải sự kiện
		// ta đợi — thoát ở đó thì `closeCode` giữ nguyên -1 và ô AC-H1 đọc một
		// phiên còn sống thành "đứt trần".
		doiXong := false
		for !doiXong {
			select {
			case <-ctx.Done():
				return fmt.Errorf("[%s] hết budget khi đợi close: %w", p.ten, ctx.Err())
			case err := <-p.w.errc:
				p.doiDong = time.Since(tKich)
				p.closeCode = websocket.CloseStatus(err)
				if p.closeCode == -1 {
					fmt.Printf("   [%s] đóng sau %v · KHÔNG kèm close code (client đọc như 1006) · %v\n",
						p.ten, p.doiDong.Round(time.Millisecond), truncate(err.Error(), 120))
				} else {
					fmt.Printf("   [%s] đóng sau %v · close code = %d\n",
						p.ten, p.doiDong.Round(time.Millisecond), int(p.closeCode))
				}
				doiXong = true
			case <-p.w.ch:
				// frame lạc — bỏ qua, đợi tiếp
			}
		}
	}

	if err := <-xong; err != nil {
		return fmt.Errorf("rollout-cmd hỏng: %w", err)
	}
	fmt.Printf("   rollout xong sau %v\n\n", time.Since(tKich).Round(time.Second))

	// ---------------------------------------------------------------- pha 3
	fmt.Println("PHA 3 — nối lại (429 trước = khe còn kẹt; 101 ngay = khe đã trả)")
	for _, p := range ps {
		tThu := time.Now()

		// Lượt ĐẦU TIÊN dùng dial thô: đây là lượt mang thông tin.
		c, err := dial(ctx, p.s, gwURL, origin)
		switch {
		case err == nil:
			p.noiLaiMa = "101"
			p.noiLai429Trc = false
		case strings.Contains(err.Error(), "429"):
			p.noiLaiMa = "429"
			p.noiLai429Trc = true
		default:
			p.noiLaiMa = truncate(err.Error(), 100)
		}

		// Nếu lượt đầu 429 thì thử lại có nhịp để đo BAO LÂU khe mới nhả.
		//
		// ⛔ CỬA SỔ CHỜ PHẢI VƯỢT LEASE KHE WS. `dialChoNha` chỉ retry 10s — đủ cho
		// ca drain êm (khe được trả ngay), nhưng KHÔNG đủ cho ca SIGKILL: ở đó
		// `defer` không chạy nên khe chỉ rụng khi hết lease (mặc định 90s). Dùng
		// cửa sổ 10s cho ca SIGKILL sẽ đọc ra "không bao giờ nối lại được", trong
		// khi sự thật là "nối lại được sau 90s" — hai kết luận khác hẳn nhau về
		// mức nghiêm trọng.
		if p.noiLai429Trc {
			c, err = doiKheNha(ctx, p.s, gwURL, origin, cuaSoNoiLai)
			if err != nil {
				p.err = fmt.Errorf("nối lại: %w", err)
				fmt.Printf("   [%s] 429 rồi KHÔNG nối lại được trong %v: %v\n", p.ten, cuaSoNoiLai, err)
				continue
			}
		} else if err != nil {
			p.err = fmt.Errorf("nối lại: %w", err)
			fmt.Printf("   [%s] lỗi không phải 429: %v\n", p.ten, err)
			continue
		}
		p.noiLaiSau = time.Since(tThu)

		w2 := wrap(ctx, c)
		if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err == nil {
			if _, err := doiControl(w2, "ready", 60*time.Second); err != nil {
				p.err = fmt.Errorf("nối lại rồi nhưng không ready: %w", err)
			}
		}

		// Pod sandbox có còn là pod cũ không — vế (b) của AC-H3. Đọc lại từ
		// `session.get` qua web thay vì tin bộ nhớ của probe: chính Redis là nơi
		// gateway tra pod, nên hỏi cùng nguồn mới chứng minh được cùng một điều.
		podMoi, err := docPodCuaSession(ctx, webURL, p.s)
		if err != nil {
			p.err = fmt.Errorf("đọc lại pod: %w", err)
		} else {
			p.noiLaiPodKhop = podMoi == p.s.pod
			if !p.noiLaiPodKhop {
				fmt.Printf("   [%s] ⚠ pod ĐỔI: %s → %s\n", p.ten, p.s.pod, podMoi)
			}
		}

		fmt.Printf("   [%s] nối lại: đầu=%s · mất %v · pod khớp=%v\n",
			p.ten, p.noiLaiMa, p.noiLaiSau.Round(time.Millisecond), p.noiLaiPodKhop)
		_ = c.CloseNow()
	}

	return ketLuanDrain(ps)
}

// docPodCuaSession hỏi SERVER pod hiện tại của phiên, thay vì tin bộ nhớ probe.
//
// Đường hỏi là `session.create` lặp lại với ĐÚNG `idempotencyKey` cũ — cùng cơ
// chế `lamMoiCookie` dùng: lượt này KHÔNG claim thêm pod (`replayIdempotent`),
// chỉ trả lại phiên cũ kèm `podName` hiện tại và một cookie mới. Hai công dụng
// trong một lượt, và quan trọng hơn: nó đọc từ CÙNG nguồn mà gateway tra pod.
//
// ⛔ So `podName` với bộ nhớ của probe là so hai bản sao của cùng một lượt đọc
// ban đầu — luôn khớp, kể cả khi server đã đổi pod. Phải hỏi lại server.
func docPodCuaSession(ctx context.Context, webURL string, s *session) (string, error) {
	var lai struct {
		Result struct {
			Data struct {
				Session struct {
					ID      string `json:"id"`
					PodName string `json:"podName"`
				} `json:"session"`
			} `json:"data"`
		} `json:"result"`
	}
	if err := postJSON(ctx, s.jar, webURL+"/api/trpc/session.create", map[string]any{
		"userId":         s.userID,
		"tier":           1,
		"ttlSeconds":     0,
		"idempotencyKey": s.idem,
	}, &lai); err != nil {
		return "", fmt.Errorf("đọc lại session: %w", err)
	}
	if got := lai.Result.Data.Session.ID; got != s.sid {
		return "", fmt.Errorf("lượt đọc lại trả session KHÁC (%s ≠ %s) — idempotencyKey hết hiệu lực, "+
			"nên lượt này đã claim thêm pod thay vì tái dùng phiên cũ", got, s.sid)
	}
	return lai.Result.Data.Session.PodName, nil
}

// ketLuanDrain in bảng và quyết định đạt/không. Tách ra để phần quyết định nằm
// một chỗ, đọc được, thay vì rải `if` khắp ba pha.
func ketLuanDrain(ps []*phienDrain) error {
	fmt.Println("\n== BẢNG KẾT QUẢ ==")
	fmt.Printf("%-5s %-12s %-10s %-8s %-10s %s\n", "phiên", "close", "đóng sau", "nối lại", "429 trước", "pod khớp")

	var soDung1012, soDutTran, soNoiLai, soPodKhop, so429 int
	for _, p := range ps {
		ma := "đứt-trần"
		if p.closeCode != -1 {
			ma = fmt.Sprintf("%d", int(p.closeCode))
		}
		if p.closeCode == websocket.StatusServiceRestart {
			soDung1012++
		}
		if p.closeCode == -1 {
			soDutTran++
		}
		if p.noiLaiMa == "101" || p.noiLai429Trc {
			if p.err == nil {
				soNoiLai++
			}
		}
		if p.noiLaiPodKhop {
			soPodKhop++
		}
		if p.noiLai429Trc {
			so429++
		}
		fmt.Printf("%-5s %-12s %-10v %-8s %-10v %v\n",
			p.ten, ma, p.doiDong.Round(time.Millisecond), p.noiLaiMa, p.noiLai429Trc, p.noiLaiPodKhop)
	}

	n := len(ps)
	fmt.Printf("\nTỔNG: 1012=%d/%d · đứt-trần=%d/%d · nối lại được=%d/%d · pod khớp=%d/%d · 429-lượt-đầu=%d/%d\n",
		soDung1012, n, soDutTran, n, soNoiLai, n, soPodKhop, n, so429, n)

	// Phát biểu kết luận theo ĐÚNG thứ quan sát được, không quy kết.
	switch {
	case soDung1012 == n:
		fmt.Println("\nĐỌC: gateway phát 1012 SERVICE_RESTART cho MỌI phiên ⇒ drain êm đang chạy.")
	case soDutTran == n:
		// KHÔNG kết luận "chưa có drain êm": ca SIGKILL cho ra ĐÚNG hình dạng này
		// dù drain chạy hoàn hảo — `defer` không chạy thì không có close frame nào
		// để gửi. Chỉ người chạy mới biết `-rollout-cmd` là rollout hay là `kill -9`,
		// nên câu kết luận phải mô tả, không quy nhân quả.
		fmt.Println("\nĐỌC: MỌI phiên đứt KHÔNG kèm close code. Nếu -rollout-cmd là rollout ⇒ chưa có drain êm;")
		fmt.Println("     nếu là SIGKILL ⇒ ĐÚNG NHƯ MONG ĐỢI (defer không chạy được, lease khe WS là lưới duy nhất).")
	default:
		fmt.Println("\nĐỌC: hỗn hợp — một số phiên êm, một số đứt trần. Không kết luận được, xem từng dòng.")
	}
	if so429 > 0 {
		fmt.Printf("ĐỌC: %d/%d phiên ăn 429 ở lượt nối lại ĐẦU ⇒ khe WS còn kẹt sau khi replica cũ chết.\n", so429, n)
	} else {
		fmt.Println("ĐỌC: 0 phiên ăn 429 ở lượt nối lại đầu ⇒ khe WS đã được trả trước khi client quay lại.")
	}

	if soNoiLai < n {
		return fmt.Errorf("chỉ %d/%d phiên nối lại được", soNoiLai, n)
	}
	if soPodKhop < n {
		return fmt.Errorf("chỉ %d/%d phiên attach lại ĐÚNG pod cũ — nối lại được nhưng vào nhầm pod còn tệ hơn không nối được", soPodKhop, n)
	}
	return nil
}
