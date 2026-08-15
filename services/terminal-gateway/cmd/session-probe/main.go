// Command session-probe đo hai thứ trên CLUSTER THẬT mà test đơn vị không chạm
// tới được: độ trễ attach (101 → `ready`) và việc một tiến trình đang chạy có
// SỐNG QUA một lần ngắt WS hay không.
//
// # Vì sao hai ca này cần một công cụ riêng
//
// `verify-heartbeat` (1.C-3) chứng minh đường GIA HẠN; nó mở đúng một WS rồi
// quan sát tới lúc đóng. Hai ca dưới đây cần thứ nó không làm: mở/đóng WS
// NHIỀU LẦN trên cùng một session (ca `attach`), và mở lại sau khi đã đóng để
// đọc trạng thái để lại từ lượt trước (ca `survive`).
//
//	-case attach   M1: N lượt mở/đóng, rồi đọc p95 từ histogram CỦA SERVER
//	-case survive  M2: `sleep` chạy nền → ngắt WS → mở lại → tiến trình còn sống?
//
// # Cách chạy (từ chính node — ClusterIP tới được nhờ kube-proxy)
//
//	GOOS=linux go build -o /tmp/session-probe ./cmd/session-probe
//	scp /tmp/session-probe <node>:/tmp/
//	ssh <node> '/tmp/session-probe -case attach -n 50 \
//	    -web http://<web-clusterip>:3000 -gateway ws://<gw-clusterip>:8082'
//
// ⚠ CHỈ DÙNG TRÊN LAB. Nó tạo tài khoản thật và tiêu một khe quota sandbox.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// probeHTTP là client HTTP dùng cho MỌI lượt gọi web/metrics. Mặc định là
// DefaultClient; `-insecure` thay bằng client bỏ verify TLS — cần khi đi QUA
// Traefik (`https://…sslip.io:30443`) với cert tự ký của lab. wsDialClient là
// client mà `websocket.Dial` dùng; nil = mặc định (verify TLS).
//
// ⚠ CHỈ cho lab: bỏ verify TLS mở đường MITM. Công cụ này vốn đã "CHỈ DÙNG TRÊN
// LAB" (header file), và ca `hold` (AC-H7) BẮT BUỘC đi qua Traefik để đo được
// idleTimeout của biên — không có đường nào khác chạm tới lớp đó.
var (
	probeHTTP    = http.DefaultClient
	wsDialClient *http.Client
)

func main() {
	webURL := flag.String("web", "http://localhost:3000", "gốc của apps/web (BFF tRPC + Better Auth)")
	gwURL := flag.String("gateway", "ws://localhost:8082", "gốc WS của terminal-gateway")
	metricsURL := flag.String("metrics", "", "gốc /metrics của gateway (mặc định: suy ra từ -gateway, cổng 8081)")
	origin := flag.String("origin", "", "header Origin (mặc định: bằng -web)")
	kase := flag.String("case", "attach", "attach | survive | hold | luat5 | idle | resize | m3 | jwks | m9 | drain | storm")
	n := flag.Int("n", 50, "số mẫu cho ca attach (và số lượt cho ca m9)")
	budget := flag.Duration("budget", 10*time.Minute, "trần thời gian")
	// Ca m9 cần đọc /metrics của TỪNG replica: `-pod-metrics` nhận danh sách
	// ngăn bằng dấu phẩy. Không suy ra được từ -gateway vì đó là ClusterIP của
	// Service, mà /metrics lại KHÔNG đi qua Service (xem suyRaMetricsURL).
	podMetrics := flag.String("pod-metrics", "", "danh sách gốc /metrics của từng replica gateway, ngăn bằng dấu phẩy (ca m9)")
	quanSat := flag.Duration("quan-sat", 6*time.Minute, "thời gian quan sát tối đa cho ca idle")
	// Ca m3 cần một lệnh SIGKILL thật. Truyền từ ngoài thay vì nhúng cứng
	// `kubectl`: cách giết tiến trình là quyết định của người vận hành, và để nó
	// hiện nguyên văn trong dòng lệnh khiến báo cáo tự chứng minh đã giết cái gì.
	killCmd := flag.String("kill-cmd", "", "lệnh shell giết gateway (ca m3)")
	rotateCmd := flag.String("rotate-cmd", "", "lệnh shell xoay khoá Better Auth (ca jwks)")
	// Ca drain cần một lượt rollout THẬT. Truyền từ ngoài cùng lý do như
	// -kill-cmd: cách rollout là quyết định của người vận hành, và để nó hiện
	// nguyên văn trong dòng lệnh khiến báo cáo tự chứng minh đã kích cái gì.
	rolloutCmd := flag.String("rollout-cmd", "", "lệnh shell rollout gateway (ca drain, storm)")
	usersFile := flag.String("users-file", "", "pool user dựng sẵn cho ca storm (infra/k6/.users.json — xem provision-users.sh)")
	// Ca drain dùng cho HAI kịch bản có thang thời gian khác hẳn nhau: rollout êm
	// (khe trả ngay) và SIGKILL (khe chỉ rụng khi hết lease). Trần chờ vì thế phải
	// đặt được từ ngoài — xem cuaSoNoiLai.
	reconnectWait := flag.Duration("reconnect-wait", 15*time.Second, "trần chờ khe WS được nhả ở pha 3 (ca drain)")
	insecure := flag.Bool("insecure", false, "bỏ verify TLS (đi qua Traefik cert tự ký của lab; CHỈ dùng lab)")
	flag.Parse()

	if *insecure {
		// #nosec G402 -- lab-only: ca hold BẮT BUỘC đi qua Traefik (:30443, cert
		// tự ký) để đo idleTimeout của biên; xem chú thích probeHTTP.
		tr := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}}
		probeHTTP = &http.Client{Transport: tr}
		wsDialClient = probeHTTP
	}

	if *origin == "" {
		*origin = *webURL
	}
	if *metricsURL == "" {
		*metricsURL = suyRaMetricsURL(*gwURL)
	}

	ctx, cancel := context.WithTimeout(context.Background(), *budget)
	defer cancel()

	var err error
	switch *kase {
	case "attach":
		err = caseAttach(ctx, *webURL, *gwURL, *metricsURL, *origin, *n)
	case "survive":
		err = caseSurvive(ctx, *webURL, *gwURL, *origin)
	case "hold":
		err = caseHold(ctx, *webURL, *gwURL, *origin, *budget)
	case "luat5":
		err = caseLuat5(ctx, *webURL, *gwURL, *metricsURL, *origin)
	case "idle":
		err = caseIdle(ctx, *webURL, *gwURL, *origin, *quanSat)
	case "resize":
		err = caseResize(ctx, *webURL, *gwURL, *origin)
	case "m3":
		err = caseM3(ctx, *webURL, *gwURL, *origin, *killCmd)
	case "jwks":
		err = caseJWKS(ctx, *webURL, *gwURL, *origin, *rotateCmd)
	case "m9":
		var ds []string
		for _, u := range strings.Split(*podMetrics, ",") {
			if u = strings.TrimSpace(u); u != "" {
				ds = append(ds, u)
			}
		}
		err = caseM9(ctx, *webURL, *gwURL, *origin, ds, *n)
	case "drain":
		cuaSoNoiLai = *reconnectWait
		err = caseDrain(ctx, *webURL, *gwURL, *origin, *rolloutCmd, *n)
	case "storm":
		err = caseStorm(ctx, *webURL, *gwURL, *origin, *rolloutCmd, *usersFile, *n)
	default:
		err = fmt.Errorf("-case không hợp lệ: %q (cần attach | survive | hold | luat5 | idle | resize | m3 | jwks | m9 | drain | storm)", *kase)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nFAIL: %v\n", err)
		os.Exit(1)
	}
}

// suyRaMetricsURL đổi ws://host:8082 thành http://host:8083.
//
// ⛔ HAI THỨ PHẢI BIẾT TRƯỚC KHI ĐỔI CON SỐ NÀY, cả hai đo được trên cụm:
//
//  1. Cổng admin là **8083**, không phải 8081. Cổng admin tách khỏi cổng data có
//     chủ ý (`httpx.NewStreamingServer` vs `NewServer`), nên nó KHÔNG suy ra được
//     từ cổng data — phải đọc `ADMIN_ADDR` của deployment.
//  2. Service `platform-gateway` chỉ phơi cổng `public` (8082). `/metrics` KHÔNG
//     đi qua Service, nên phải trỏ thẳng **pod IP**. Và image gateway là
//     distroless (không có `sh`), nên đường `kubectl exec ... curl` cũng không có.
//
// Mặc định dưới đây chỉ đúng khi -gateway đã trỏ pod IP; trỏ ClusterIP thì phải
// truyền -metrics tường minh.
func suyRaMetricsURL(gw string) string {
	h := strings.TrimPrefix(strings.TrimPrefix(gw, "ws://"), "wss://")
	if i := strings.LastIndex(h, ":"); i >= 0 {
		h = h[:i]
	}
	return "http://" + h + ":8083"
}

// ---------------------------------------------------------------- ca attach

// caseAttach mở/đóng WS n lượt trên CÙNG một session rồi đọc p95 từ histogram.
//
// ⛔ ĐỌC p95 TỪ SERVER, KHÔNG TỪ ĐỒNG HỒ CỦA CLIENT — cùng lý lẽ mà `bench-claim`
// đã dùng cho claim p95. Đồng hồ client cộng thêm cả round-trip mạng và thời gian
// probe tự lập lịch; AC trỏ vào `dlp_gateway_attach_duration_seconds`, tức thứ
// gateway tự đo. Con số client vẫn được in ra để so, nhưng nó KHÔNG phải phép đo.
//
// Dùng LẠI một session cho mọi lượt là chủ ý: mỗi session tiêu một khe trong trần
// 4 pod (D16), nên 50 session sẽ chết ở lượt thứ tư. Trần 1 WS/session (D17) chỉ
// chặn ĐỒNG THỜI, không chặn nối lại — chính tính chất mà ca này khai thác.
func caseAttach(ctx context.Context, webURL, gwURL, metricsURL, origin string, n int) error {
	s, err := taoSession(ctx, webURL)
	if err != nil {
		return err
	}
	fmt.Printf("1. session %s, pod %s\n", s.sid, s.pod)

	truoc, err := docHistogram(ctx, metricsURL)
	if err != nil {
		return fmt.Errorf("đọc histogram TRƯỚC: %w", err)
	}
	changTruoc, err := docBangChang(ctx, metricsURL)
	if err != nil {
		return fmt.Errorf("đọc bảng chặng TRƯỚC: %w", err)
	}
	fmt.Printf("2. histogram trước: %d mẫu\n", truoc.count)

	// Mốc chụp SAU LƯỢT ĐẦU tách mẫu nguội khỏi mẫu ấm.
	//
	// 1.G-2 đã ghi: từ lượt 2 trở đi phiên tmux đã tồn tại, nên lượt đầu gánh
	// thêm `tmux new-session` còn 49 lượt sau là chi phí NỐI LẠI. Trộn chung
	// rồi lấy p95 là để một mẫu nguội quyết định kết luận cho phần còn lại.
	var changSauNguoi *bangChang

	var clientMs []float64
	for i := 0; i < n; i++ {
		if ctx.Err() != nil {
			return fmt.Errorf("hết ngân sách sau %d/%d lượt", i, n)
		}
		d, err := motLuotAttach(ctx, s, gwURL, origin)
		if err != nil {
			return fmt.Errorf("lượt %d/%d: %w", i+1, n, err)
		}
		clientMs = append(clientMs, float64(d.Milliseconds()))
		if i == 0 {
			if changSauNguoi, err = docBangChang(ctx, metricsURL); err != nil {
				return fmt.Errorf("đọc bảng chặng sau lượt nguội: %w", err)
			}
		}
		if (i+1)%10 == 0 {
			fmt.Printf("   %d/%d lượt\n", i+1, n)
		}
	}

	sau, err := docHistogram(ctx, metricsURL)
	if err != nil {
		return fmt.Errorf("đọc histogram SAU: %w", err)
	}
	changSau, err := docBangChang(ctx, metricsURL)
	if err != nil {
		return fmt.Errorf("đọc bảng chặng SAU: %w", err)
	}
	them := sau.count - truoc.count
	fmt.Printf("3. histogram sau: %d mẫu (thêm %d)\n", sau.count, them)
	if them < int64(n) {
		return fmt.Errorf("histogram chỉ tăng %d mẫu cho %d lượt attach — "+
			"phép đo KHÔNG đo được thứ nó tưởng đang đo", them, n)
	}

	p95Server := sau.p95Delta(truoc)
	sort.Float64s(clientMs)
	p95Client := clientMs[int(float64(len(clientMs))*0.95)]

	fmt.Printf("\n=== M1 ===\n")
	fmt.Printf("p95 (server, dlp_gateway_attach_duration_seconds) = %.3fs\n", p95Server)
	fmt.Printf("p95 (client, chỉ để so)                          = %.3fs\n", p95Client/1000)
	fmt.Printf("số lượt phải chờ khe WS của lượt trước (429)     = %d\n", tongRetry429)
	if p95Server > 0.5 {
		fmt.Printf("KẾT LUẬN: VƯỢT ngưỡng 500ms — AC này ĐỎ, không phải chỉ cần sửa câu chữ.\n")
	} else {
		fmt.Printf("KẾT LUẬN: ĐẠT ngưỡng 500ms.\n")
	}

	// ---- 1.G-4 M1: quy con số trên về từng chặng ---------------------------
	//
	// In CẢ HAI bảng thay vì chọn một: bảng "mọi mẫu" là thứ khớp với con số
	// p95 vừa in ở trên, còn bảng "chỉ mẫu ấm" mới là thứ trả lời câu hỏi thật
	// ("sinh viên nối lại tốn bao lâu"). Chọn sẵn một bảng cho người đọc là
	// giấu đi mất nửa còn lại của câu trả lời.
	fmt.Printf("\n--- mọi mẫu (%d lượt, gồm cả lượt nguội đầu tiên) ---", n)
	if err := inBangPhanBo(changTruoc, changSau, n); err != nil {
		return fmt.Errorf("bảng phân bổ (mọi mẫu): %w", err)
	}

	if n > 1 && changSauNguoi != nil {
		fmt.Printf("\n--- CHỈ mẫu ấm (%d lượt, bỏ lượt nguội đầu tiên) ---", n-1)
		if err := inBangPhanBo(changSauNguoi, changSau, n-1); err != nil {
			return fmt.Errorf("bảng phân bổ (mẫu ấm): %w", err)
		}
	}
	return nil
}

// tongRetry429 đếm tổng số lần phải chờ `DECR` của lượt trước.
//
// In ra ở cuối chứ không nuốt: nó là phép đo GIÁN TIẾP cho độ trễ nhả khe WS, và
// nếu con số này phình lên thì "đóng WS → mở lại được ngay" (một vế AC của D17)
// đang xấu đi mà không ô nào khác nói ra.
var tongRetry429 int

// motLuotAttach mở WS, gửi init, đợi `ready`, rồi đóng. Trả khoảng 101 → ready.
//
// ⛔ PHẢI CHỊU ĐƯỢC 429 GIỮA HAI LƯỢT, và đó KHÔNG phải nới lỏng phép đo. Trần 1
// WS/session (D17) đếm bằng `session:{id}:ws`, và `DECR` nằm trong defer của
// handler phía server — tức nó chạy SAU khi client đã đóng xong. Hai lượt attach
// liên tiếp vì thế đua với chính cái defer đó; quan sát được: lượt 3/50 trả 429.
// Đồng hồ đo chỉ bắt đầu SAU khi dial thành công, nên lượt chờ không lọt vào số
// liệu. Vế "429 khi thật sự có hai WS đồng thời" đã được gác ở một ca riêng.
func motLuotAttach(ctx context.Context, s *session, gwURL, origin string) (time.Duration, error) {
	c, err := dialChoNha(ctx, s, gwURL, origin)
	if err != nil {
		return 0, err
	}
	defer func() { _ = c.CloseNow() }()
	w := wrap(ctx, c)

	// Mốc bắt đầu đặt NGAY SAU khi Dial trả về: đó chính là lúc 101 tới, cùng mốc
	// mà `Bridge.Serve` dùng cho histogram của nó.
	t0 := time.Now()
	if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return 0, fmt.Errorf("gửi init: %w", err)
	}
	if _, err := doiControl(w, "ready", 60*time.Second); err != nil {
		return 0, err
	}
	d := time.Since(t0)

	// Đóng TỬ TẾ (không CloseNow) để bộ đếm `session:{id}:ws` được DECR ngay —
	// nếu không, lượt sau dính 429 SESSION_IN_USE và cả phép đo sụp theo.
	_ = c.Close(websocket.StatusNormalClosure, "xong một lượt đo")
	return d, nil
}

// ---------------------------------------------------------------- ca survive

var (
	reStarted = regexp.MustCompile(`STARTED\[(\d+)\]`)
	reAlive   = regexp.MustCompile(`ALIVE=(\d)`)
	reTmuxCnt = regexp.MustCompile(`TMUX=(\d+)`)
)

// caseSurvive đo vế CÒN LẠI của AC reconnect (D3): tiến trình đang chạy không chết.
//
// Hai vế kia đã đóng 2026-08-10 (vào đúng pod cũ; scrollback còn). Vế này chưa,
// và nó là vế nói lên lời hứa thật của tmux: sinh viên chạy một lệnh dài, mất
// mạng, vào lại và bài làm VẪN ĐANG CHẠY. Không có nó thì "reconnect" chỉ chứng
// minh được màn hình cũ còn đó, không chứng minh công việc còn sống.
//
// ⛔ MARKER PHẢI KHÁC GIỮA LỆNH VÀ KẾT QUẢ. Terminal vọng lại nguyên văn lệnh
// vừa gõ, nên một marker như `ALIVE[yes]` sẽ xuất hiện trong tiếng vọng TRƯỚC khi
// shell chạy bất cứ thứ gì — và phép đo sẽ xanh với một pod đã chết. Ở đây lệnh
// chứa `ALIVE=$?` (literal) còn kết quả chứa `ALIVE=0`, nên regex đòi một CHỮ SỐ
// mới khớp. Cùng bài học với "marker trả về đúng 2 lần" của G12.
func caseSurvive(ctx context.Context, webURL, gwURL, origin string) error {
	s, err := taoSession(ctx, webURL)
	if err != nil {
		return err
	}
	fmt.Printf("1. session %s, pod %s\n", s.sid, s.pod)

	// ---- lượt 1: khởi động một tiến trình dài -------------------------------
	c1, err := dial(ctx, s, gwURL, origin)
	if err != nil {
		return err
	}
	w1 := wrap(ctx, c1)
	if err := writeJSON(ctx, c1, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return err
	}
	if _, err := doiControl(w1, "ready", 60*time.Second); err != nil {
		return err
	}
	fmt.Println("2. WS #1 ready")

	// ⛔ ĐỢI SHELL SẴN SÀNG TRƯỚC KHI GÕ, và đây KHÔNG phải sự thận trọng thừa.
	// `ready` được phát ở byte stdout ĐẦU TIÊN (quyết định của 1.C-2), tức trước
	// khi zsh + oh-my-posh vẽ xong prompt và bắt đầu đọc stdin. Gõ vào khe đó thì
	// ký tự rơi vào hư không và phép đo đỏ vì lý do chẳng liên quan tới AC.
	if err := doiPromptLang(w1); err != nil {
		return err
	}

	// ⛔ TẮT MỞ RỘNG LỊCH SỬ TRƯỚC, VÀ PHẢI Ở MỘT DÒNG RIÊNG.
	//
	// zsh tương tác mở rộng `!` NGAY CẢ TRONG NHÁY KÉP, nên `echo "STARTED[$!]"`
	// chết ở `zsh: event not found: ]` trước khi shell chạy bất cứ thứ gì — quan
	// sát được ở lượt chạy đầu của probe này. Đặt `setopt` cùng dòng thì vô ích:
	// zsh mở rộng lịch sử lúc ĐỌC cả dòng, tức trước khi `setopt` kịp có hiệu lực.
	//
	// Vì sao không né bằng `sh -c '...'` (nháy đơn thì không bị mở rộng): làm thế
	// thì `sleep` thành con của một `sh` thoát ngay và được nhận nuôi bởi tini —
	// nó sống sót một cách TẦM THƯỜNG, không còn nằm trong nhóm tiến trình của
	// phiên tmux. Ta muốn đo đúng cái mà sinh viên sẽ gặp: một lệnh chạy nền
	// TRONG shell của họ.
	if err := gui(ctx, c1, "setopt nobanghist 2>/dev/null || set +H\n"); err != nil {
		return err
	}
	if err := doiPromptLang(w1); err != nil {
		return err
	}

	// `sleep 3000` chứ không `sleep 300`: một con số không trùng với bất cứ tiến
	// trình nền nào của image, nên `kill -0` không thể trúng nhầm.
	if err := gui(ctx, c1, "sleep 3000 & echo \"STARTED[$!]\"\n"); err != nil {
		return err
	}
	out, err := docDenKhiKhop(w1, reStarted, 25*time.Second)
	if err != nil {
		return fmt.Errorf("không thấy STARTED[pid]: %w\nstdout đã gom: %s", err, duoi(out, 600))
	}
	pid := reStarted.FindStringSubmatch(out)[1]
	fmt.Printf("3. tiến trình nền đã chạy, pid=%s\n", pid)

	// ---- ngắt: đóng WS như một lần mất mạng --------------------------------
	//
	// CloseNow (không close frame) mô phỏng mất mạng đúng hơn Close tử tế: đó là
	// ca mà AC mô tả ("ngắt mạng 5s"). Bộ đếm WS được TTL đỡ, không cần DECR.
	_ = c1.CloseNow()
	fmt.Println("4. WS #1 ĐÃ NGẮT (CloseNow, không close frame — mô phỏng mất mạng)")
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(6 * time.Second):
	}

	// ---- lượt 2: nối lại và hỏi tiến trình còn sống không -------------------
	c2, err := dial(ctx, s, gwURL, origin)
	if err != nil {
		return fmt.Errorf("nối lại: %w (nếu 429 SESSION_IN_USE thì TTL của session:{id}:ws chưa hết — đó là một phát hiện, không phải lỗi probe)", err)
	}
	defer func() { _ = c2.CloseNow() }()
	w2 := wrap(ctx, c2)
	if err := writeJSON(ctx, c2, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return err
	}
	ready, err := doiControl(w2, "ready", 60*time.Second)
	if err != nil {
		return err
	}
	if ready.PodName != s.pod {
		return fmt.Errorf("nối lại vào pod %q, muốn %q — vế 'đúng pod cũ' vỡ", ready.PodName, s.pod)
	}
	fmt.Printf("5. WS #2 ready, ĐÚNG pod cũ (%s)\n", ready.PodName)
	if err := doiPromptLang(w2); err != nil {
		return err
	}

	if err := gui(ctx, c2, fmt.Sprintf("kill -0 %s 2>/dev/null; echo \"ALIVE=$?\"\n", pid)); err != nil {
		return err
	}
	out, err = docDenKhiKhop(w2, reAlive, 25*time.Second)
	if err != nil {
		return fmt.Errorf("không thấy ALIVE=<số>: %w\nstdout đã gom: %s", err, duoi(out, 600))
	}
	alive := reAlive.FindStringSubmatch(out)[1]

	if err := gui(ctx, c2, "echo \"TMUX=$(tmux ls | wc -l)\"\n"); err != nil {
		return err
	}
	out, err = docDenKhiKhop(w2, reTmuxCnt, 25*time.Second)
	if err != nil {
		return fmt.Errorf("không thấy TMUX=<số>: %w\nstdout đã gom: %s", err, duoi(out, 600))
	}
	tmuxCnt := reTmuxCnt.FindStringSubmatch(out)[1]

	fmt.Printf("\n=== M2 ===\n")
	fmt.Printf("kill -0 %s  → ALIVE=%s  (0 = tiến trình CÒN SỐNG)\n", pid, alive)
	fmt.Printf("tmux ls | wc -l → TMUX=%s (cần 1)\n", tmuxCnt)
	if alive != "0" {
		return fmt.Errorf("tiến trình %s ĐÃ CHẾT qua lần ngắt — vế thứ ba của AC reconnect ĐỎ", pid)
	}
	if tmuxCnt != "1" {
		return fmt.Errorf("tmux có %s session, cần đúng 1 — mỗi lần nối lại đang sinh session MỚI", tmuxCnt)
	}
	fmt.Println("KẾT LUẬN: ĐẠT — tiến trình sống qua lần ngắt, và tmux vẫn đúng MỘT session.")
	return nil
}

// ---------------------------------------------------------------- ca luật 5

var reRSS = regexp.MustCompile(`(?m)^process_resident_memory_bytes\s+([0-9.e+]+)`)

// caseLuat5 đo hai vế ĐO ĐƯỢC của luật 5: bơm quá trần byte-rate → `4429`, và
// RSS của gateway không phình theo lượng byte bị chặn.
//
// ⛔ VẾ RSS MỚI LÀ VẾ ĐẮT, không phải vế `4429`. Một hiện thực đọc hết frame vào
// RAM rồi mới đếm token vẫn trả `4429` đúng lúc — và vẫn là một cần gạt OOM: kẻ
// tấn công trả giá bằng một kết nối, gateway trả giá bằng bộ nhớ của MỌI phiên
// đang chạy trên cùng pod. Chỉ khi RSS đứng yên ta mới biết trần đang chặn ở tầng
// ĐỌC chứ không phải ở tầng đếm.
//
// ⚠ VẾ "bão 200 resize/s → KHÔNG đóng" của AC luật 5 CỐ Ý không đo ở đây: nó mâu
// thuẫn với chính G8. Trần control là 100/s (`TestBaoControlThiDong4400` khẳng
// định 300 lượt liên tiếp → `4400`), nên 200/s PHẢI đóng `4400`. Con số 200 chỉ
// có nghĩa ở phía TRƯỚC debounce ~50ms của FE (contract §4), tức ≤20/s tới server.
// Đo nó như AC viết là đo một thứ hiện thực cố tình không làm — cùng họ với `4408`
// và `ready`→prompt. Cần sửa câu chữ AC trước khi có gì để đo.
func caseLuat5(ctx context.Context, webURL, gwURL, metricsURL, origin string) error {
	rssTruoc, err := docRSS(ctx, metricsURL)
	if err != nil {
		return fmt.Errorf("đọc RSS trước: %w", err)
	}
	fmt.Printf("1. RSS gateway trước: %.1f MiB\n", rssTruoc/1024/1024)

	s, err := taoSession(ctx, webURL)
	if err != nil {
		return err
	}
	c, err := dialChoNha(ctx, s, gwURL, origin)
	if err != nil {
		return err
	}
	defer func() { _ = c.CloseNow() }()
	w := wrap(ctx, c)
	if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return err
	}
	if _, err := doiControl(w, "ready", 60*time.Second); err != nil {
		return err
	}
	fmt.Printf("2. session %s, pod %s, WS ready\n", s.sid, s.pod)

	// Bơm ~5 MiB/s bằng frame ĐÚNG BẰNG trần một frame (32 KiB): từng frame hợp
	// lệ với read-limit, nên thứ duy nhất có thể chặn là token-bucket. Trộn lẫn
	// hai tầng ở đây sẽ làm ta không biết tầng nào vừa đóng kết nối.
	frame := make([]byte, 32*1024)
	batDau := time.Now()
	var daGui int
	for {
		wctx, wcancel := context.WithTimeout(ctx, 5*time.Second)
		err := c.Write(wctx, websocket.MessageBinary, frame)
		wcancel()
		if err != nil {
			break // server đã đóng — đúng thứ ta chờ
		}
		daGui += len(frame)
		if time.Since(batDau) > 20*time.Second {
			break
		}
	}
	fmt.Printf("3. đã bơm %.1f MiB trong %s\n", float64(daGui)/1024/1024, time.Since(batDau).Round(time.Millisecond))

	var code websocket.StatusCode = -1
	select {
	case err := <-w.errc:
		code = websocket.CloseStatus(err)
	case <-time.After(10 * time.Second):
	}

	// RSS đọc SAU khi kết nối đã đóng: nếu gateway có đệm, đây là lúc đỉnh còn
	// chưa được GC trả lại, tức thời điểm bất lợi nhất cho nó — đúng cái ta muốn.
	rssSau, err := docRSS(ctx, metricsURL)
	if err != nil {
		return fmt.Errorf("đọc RSS sau: %w", err)
	}

	fmt.Printf("\n=== M5 (hai vế đo được) ===\n")
	fmt.Printf("close code           = %d (cần 4429)\n", code)
	fmt.Printf("RSS trước            = %.1f MiB\n", rssTruoc/1024/1024)
	fmt.Printf("RSS sau              = %.1f MiB (trần: 2× = %.1f MiB)\n",
		rssSau/1024/1024, rssTruoc*2/1024/1024)
	if code != 4429 {
		return fmt.Errorf("close code = %d, muốn 4429 — token-bucket không chặn được luồng 5 MiB/s", code)
	}
	if rssSau > rssTruoc*2 {
		return fmt.Errorf("RSS %.1f MiB > 2× baseline %.1f MiB — gateway đang ĐỆM byte bị chặn, tức trần chặn ở tầng đếm chứ không ở tầng đọc",
			rssSau/1024/1024, rssTruoc*2/1024/1024)
	}
	fmt.Println("KẾT LUẬN: ĐẠT cả hai vế đo được. Vế 'bão 200 resize/s' KHÔNG đo — xem ghi chú mâu thuẫn AC ở doc của hàm này.")
	return nil
}

func docRSS(ctx context.Context, base string) (float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/metrics", nil)
	if err != nil {
		return 0, err
	}
	resp, err := probeHTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, err
	}
	m := reRSS.FindStringSubmatch(string(raw))
	if m == nil {
		return 0, fmt.Errorf("không thấy process_resident_memory_bytes trong %s/metrics", base)
	}
	return strconv.ParseFloat(m[1], 64)
}

// ---------------------------------------------------------------- hạ tầng vặt

type session struct {
	sid, pod string
	jar      *cookieJar

	// Đủ để MINT LẠI cookie `dlp_sandbox` cho CHÍNH session này.
	//
	// ⛔ Cookie sandbox hết hạn ĐÚNG BẰNG `expiresAt` của phiên (`jwt.ts` mint
	// với `exp: expiresAtSeconds`), và `attachSandboxCookie` chỉ được gọi từ
	// MỘT chỗ duy nhất: `session.create`. Nên đường mint lại là gọi `create`
	// LẠI với ĐÚNG `idempotencyKey` cũ — nó trả về đúng session cũ (không claim
	// thêm pod khỏi trần quota) kèm cookie mới tính theo `expiresAt` hiện tại.
	// Không giữ hai field này thì mọi ca đo kéo dài hơn `expiresAt` ban đầu sẽ
	// ăn 401 UNAUTHENTICATED ở tầng authz và không bao giờ chạm tới thứ nó định đo.
	userID, idem string
}

type controlOut struct {
	Type      string `json:"type"`
	ExpiresAt string `json:"expiresAt"`
	PodName   string `json:"podName"`
	Code      string `json:"code"`
}

type frame struct {
	mt   websocket.MessageType
	data []byte
}

// conn bọc một WS bằng MỘT goroutine đọc đẩy frame vào channel.
//
// ⛔ ĐÂY LÀ CÁCH DUY NHẤT ĐỢI CÓ HẠN MÀ KHÔNG GIẾT KẾT NỐI. `coder/websocket`
// ĐÓNG PHĂNG kết nối khi context của một thao tác đọc/ghi bị huỷ — bài học đã ghi
// ở 1.C-3 ("`cancel()` KHÔNG phải một tín hiệu hiền lành"). Nên mẹo tự nhiên nhất
// — `c.Read(ctxNganHan)` để phát hiện "không có byte nào trong 1.5s" — tự tay
// đóng WS, và lượt ghi kế tiếp trả "use of closed network connection". Bản đầu
// của probe này dẫm đúng vào đó.
//
// Đọc bằng ctx DÀI trong goroutine, còn mọi phép "đợi tối đa T" làm bằng
// `select` trên channel + `time.After`. Cũng khớp ràng buộc một-reader của thư viện.
type conn struct {
	c    *websocket.Conn
	ch   chan frame
	errc chan error
}

func wrap(ctx context.Context, c *websocket.Conn) *conn {
	w := &conn{c: c, ch: make(chan frame, 512), errc: make(chan error, 1)}
	go func() {
		for {
			mt, data, err := c.Read(ctx)
			if err != nil {
				w.errc <- err
				return
			}
			// Sao chép: thư viện được phép tái dùng buffer sau khi Read trả về.
			w.ch <- frame{mt: mt, data: append([]byte(nil), data...)}
		}
	}()
	return w
}

// taoSession dựng tài khoản thật + session thật qua đúng đường người dùng đi.
func taoSession(ctx context.Context, webURL string) (*session, error) {
	jar := &cookieJar{}
	email := fmt.Sprintf("probe-%d@example.com", time.Now().UnixNano())
	password, err := randomSecret()
	if err != nil {
		return nil, err
	}
	var signUp struct {
		User struct{ ID string } `json:"user"`
	}
	if err := postJSON(ctx, jar, webURL+"/api/auth/sign-up/email", map[string]string{
		"email": email, "password": password, "name": "session probe",
	}, &signUp); err != nil {
		return nil, fmt.Errorf("sign-up: %w", err)
	}
	if signUp.User.ID == "" {
		return nil, fmt.Errorf("sign-up không trả user.id")
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
	idem := fmt.Sprintf("probe-%d", time.Now().UnixNano())
	if err := postJSON(ctx, jar, webURL+"/api/trpc/session.create", map[string]any{
		"userId":         signUp.User.ID,
		"tier":           1, // SANDBOX_TIER_SYSBOX — zod nhận GIÁ TRỊ, không nhận tên
		"ttlSeconds":     0,
		"idempotencyKey": idem,
	}, &created); err != nil {
		return nil, fmt.Errorf("session.create: %w", err)
	}
	if created.Result.Data.Session.ID == "" {
		return nil, fmt.Errorf("session.create không trả session.id")
	}
	if jar.get("dlp_sandbox") == "" {
		return nil, fmt.Errorf("không nhận được cookie dlp_sandbox")
	}
	return &session{
		sid:    created.Result.Data.Session.ID,
		pod:    created.Result.Data.Session.PodName,
		jar:    jar,
		userID: signUp.User.ID,
		idem:   idem,
	}, nil
}

// lamMoiCookie mint lại cookie `dlp_sandbox` cho ĐÚNG session này.
//
// Gọi `session.create` lần nữa với ĐÚNG `idempotencyKey` cũ: lượt này trả về
// session CŨ (không claim thêm pod) nhưng đính `Set-Cookie` mới, tính theo
// `expiresAt` HIỆN TẠI — tức sau mọi lượt heartbeat đã đẩy hạn. Đây là đường
// mint lại DUY NHẤT: `attachSandboxCookie` chỉ có một call-site là `create`.
func lamMoiCookie(ctx context.Context, webURL string, s *session) error {
	var lai struct {
		Result struct {
			Data struct {
				Session struct {
					ID string `json:"id"`
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
		return fmt.Errorf("mint lại cookie: %w", err)
	}
	if got := lai.Result.Data.Session.ID; got != s.sid {
		return fmt.Errorf("mint lại cookie trả session KHÁC (%s ≠ %s) — idempotencyKey không còn hiệu lực, "+
			"nên lượt này đã claim thêm một pod thay vì tái dùng phiên cũ", got, s.sid)
	}
	return nil
}

// dialChoNha dial, và nếu gặp 429 thì chờ khe WS của lượt trước được nhả.
func dialChoNha(ctx context.Context, s *session, gwURL, origin string) (*websocket.Conn, error) {
	const tranThu = 40 // 40 × 250ms = 10s, thừa sức cho một lượt DECR
	for i := 0; ; i++ {
		c, err := dial(ctx, s, gwURL, origin)
		if err == nil {
			return c, nil
		}
		if !strings.Contains(err.Error(), "429") || i >= tranThu {
			return nil, err
		}
		tongRetry429++
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
}

func dial(ctx context.Context, s *session, gwURL, origin string) (*websocket.Conn, error) {
	hdr := http.Header{}
	hdr.Set("Origin", origin)
	hdr.Set("Cookie", s.jar.header())
	c, resp, err := websocket.Dial(ctx, gwURL+"/ws/session/"+s.sid, &websocket.DialOptions{
		HTTPHeader:   hdr,
		Subprotocols: []string{"dlp.terminal.v1"},
		// nil = client mặc định (verify TLS). `-insecure` đặt client bỏ verify để
		// đi qua Traefik cert tự ký — bắt buộc cho ca hold (AC-H7).
		HTTPClient: wsDialClient,
	})
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("dial WS: %w (HTTP %d)", err, resp.StatusCode)
		}
		return nil, fmt.Errorf("dial WS: %w", err)
	}
	return c, nil
}

// doiControl đọc tới khi thấy control `typ`. `stdout` khác nil thì góp byte
// binary vào đó — cần cho ca survive, nơi kết quả lệnh tới dưới dạng binary.
func doiControl(w *conn, typ string, hen time.Duration) (controlOut, error) {
	dl := time.After(hen)
	for {
		select {
		case err := <-w.errc:
			return controlOut{}, fmt.Errorf("đợi control %q: %w (close=%d)", typ, err, websocket.CloseStatus(err))
		case <-dl:
			return controlOut{}, fmt.Errorf("hết %s mà không thấy control %q", hen, typ)
		case f := <-w.ch:
			if f.mt == websocket.MessageBinary {
				continue
			}
			var co controlOut
			if json.Unmarshal(f.data, &co) != nil {
				continue
			}
			if co.Type == typ {
				return co, nil
			}
			if co.Type == "error" || co.Type == "exit" {
				return co, fmt.Errorf("nhận control %q (code=%s) trong lúc đợi %q", co.Type, co.Code, typ)
			}
		}
	}
}

func gui(ctx context.Context, c *websocket.Conn, s string) error {
	wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return c.Write(wctx, websocket.MessageBinary, []byte(s))
}

// docDenKhiKhop gom stdout tới khi khớp re, hoặc hết hạn.
func docDenKhiKhop(w *conn, re *regexp.Regexp, hen time.Duration) (string, error) {
	dl := time.After(hen)
	var buf bytes.Buffer
	for {
		select {
		case err := <-w.errc:
			return buf.String(), fmt.Errorf("%w (đã gom %d byte, close=%d)", err, buf.Len(), websocket.CloseStatus(err))
		case <-dl:
			return buf.String(), fmt.Errorf("hết %s mà stdout không khớp %s (đã gom %d byte)", hen, re, buf.Len())
		case f := <-w.ch:
			if f.mt != websocket.MessageBinary {
				continue
			}
			buf.Write(f.data)
			if re.MatchString(buf.String()) {
				return buf.String(), nil
			}
		}
	}
}

// doiPromptLang đợi tới khi stdout LẶNG một khoảng, tức shell đã vẽ xong prompt.
//
// Đợi theo TÍN HIỆU (im lặng) thay vì `time.Sleep` một con số: prompt oh-my-posh
// mất bao lâu thì phụ thuộc pod nguội hay ấm, nên một hằng số sẽ vừa quá ngắn ở
// lần này vừa quá dài ở lần khác. Ở đây ta đọc tới khi 1.5 giây không có byte nào
// mới — dấu hiệu duy nhất từ phía client cho biết shell đã thôi vẽ và đang đọc
// stdin. Trần tổng để một pod thật sự câm không treo phép đo vô hạn.
func doiPromptLang(w *conn) error {
	tran := time.After(30 * time.Second)
	for {
		select {
		case err := <-w.errc:
			return fmt.Errorf("kết nối chết trong lúc đợi prompt: %w", err)
		case <-tran:
			return fmt.Errorf("shell không im sau 30s — pod có thể đang câm")
		case <-w.ch:
			continue // vẫn còn byte tới — prompt đang vẽ
		case <-time.After(1500 * time.Millisecond):
			return nil // 1.5s không byte nào ⇒ prompt đã xong, shell đang đọc stdin
		}
	}
}

// lamSach bỏ escape ANSI để một lượt đỏ đọc được bằng mắt.
//
// Không có nó thì thông báo lỗi chỉ nói "đã gom N byte" — và N byte đó là thứ
// DUY NHẤT cho biết shell có nhận được lệnh hay không. Prompt oh-my-posh phát
// rất nhiều escape, nên in thô là in ra rác.
var reANSI = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b[()][A-Z0-9]|\x1b[=><]|\r`)

func lamSach(s string) string {
	s = reANSI.ReplaceAllString(s, "")
	return strings.TrimSpace(s)
}

// duoi trả n ký tự cuối của chuỗi đã làm sạch.
func duoi(s string, n int) string {
	s = lamSach(s)
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}

// ---------------------------------------------------------------- histogram

type histogram struct {
	count   int64
	buckets []bucket // tăng dần theo le
}

type bucket struct {
	le  float64
	cum int64
}

var (
	reBucket = regexp.MustCompile(`^dlp_gateway_attach_duration_seconds_bucket\{le="([^"]+)"\}\s+([0-9.e+]+)`)
	reCount  = regexp.MustCompile(`^dlp_gateway_attach_duration_seconds_count\s+([0-9.e+]+)`)
)

func docHistogram(ctx context.Context, base string) (*histogram, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/metrics", nil)
	if err != nil {
		return nil, err
	}
	resp, err := probeHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	h := &histogram{}
	for _, line := range strings.Split(string(raw), "\n") {
		if m := reBucket.FindStringSubmatch(line); m != nil {
			le, err1 := strconv.ParseFloat(m[1], 64)
			cum, err2 := strconv.ParseFloat(m[2], 64)
			if err1 != nil || err2 != nil {
				continue
			}
			h.buckets = append(h.buckets, bucket{le: le, cum: int64(cum)})
		} else if m := reCount.FindStringSubmatch(line); m != nil {
			c, err := strconv.ParseFloat(m[1], 64)
			if err == nil {
				h.count = int64(c)
			}
		}
	}
	if len(h.buckets) == 0 {
		return nil, fmt.Errorf("không thấy dlp_gateway_attach_duration_seconds_bucket trong %s/metrics", base)
	}
	sort.Slice(h.buckets, func(i, j int) bool { return h.buckets[i].le < h.buckets[j].le })
	return h, nil
}

// p95Delta tính p95 trên PHẦN TĂNG giữa hai lần đọc.
//
// ⛔ Trừ đi bản đọc trước là bắt buộc, không phải sự cẩn thận thừa: histogram là
// cộng dồn từ lúc gateway khởi động, nên mọi lượt attach của các phiên đo TRƯỚC
// (gồm cả những lượt nguội bất thường lúc pod vừa lên) sẽ kéo p95 của ta đi. Đó
// đúng là cách một phép đo báo đỏ vì lịch sử chứ không vì hiện tại. `bench-claim`
// giải cùng bài này bằng cách restart orchestrator; trừ hai bản đọc thì không cần
// làm gián đoạn gì.
//
// Trả về `le` của bucket đầu tiên phủ đủ 95% — tức một CHẶN TRÊN, đúng ngữ nghĩa
// của histogram Prometheus. Không nội suy: nội suy trong một bucket rộng tạo ra
// một con số chính xác giả.
func (h *histogram) p95Delta(truoc *histogram) float64 {
	cu := map[float64]int64{}
	for _, b := range truoc.buckets {
		cu[b.le] = b.cum
	}
	tong := h.count - truoc.count
	if tong <= 0 {
		return 0
	}
	nguong := int64(float64(tong) * 0.95)
	for _, b := range h.buckets {
		if b.cum-cu[b.le] >= nguong {
			return b.le
		}
	}
	return h.buckets[len(h.buckets)-1].le
}

// ---------------------------------------------------------------- HTTP vặt

type cookieJar struct{ pairs map[string]string }

func (j *cookieJar) put(resp *http.Response) {
	if j.pairs == nil {
		j.pairs = map[string]string{}
	}
	for _, c := range resp.Cookies() {
		j.pairs[c.Name] = c.Value
	}
}

func (j *cookieJar) get(name string) string { return j.pairs[name] }

func (j *cookieJar) header() string {
	var b bytes.Buffer
	for k, v := range j.pairs {
		if b.Len() > 0 {
			b.WriteString("; ")
		}
		fmt.Fprintf(&b, "%s=%s", k, v)
	}
	return b.String()
}

func postJSON(ctx context.Context, jar *cookieJar, url string, in, out any) error {
	raw, err := json.Marshal(in)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if h := jar.header(); h != "" {
		req.Header.Set("Cookie", h)
	}
	resp, err := probeHTTP.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	jar.put(resp)

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncate(string(body), 400))
	}
	if out != nil {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("giải mã %s: %w (body: %s)", url, err, truncate(string(body), 400))
		}
	}
	return nil
}

func writeJSON(ctx context.Context, c *websocket.Conn, v any) error {
	raw, err := json.Marshal(v)
	if err != nil {
		return err
	}
	wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return c.Write(wctx, websocket.MessageText, raw)
}

func randomSecret() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf) + "Aa1!", nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
