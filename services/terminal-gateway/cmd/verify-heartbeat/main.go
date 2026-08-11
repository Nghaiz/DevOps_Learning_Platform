// Command verify-heartbeat chứng minh G7 trên CLUSTER THẬT, không phải trong test.
//
// # Vì sao cần nó khi đã có 19 test đơn vị
//
// Test đơn vị của G7 chạy với một `Extender` giả: chúng chứng minh cầu terminal
// PHẢN ỨNG đúng với từng câu trả lời, nhưng KHÔNG chứng minh orchestrator thật
// trả về những câu trả lời đó. Ba thứ chỉ cluster mới trả lời được:
//
//  1. `ExtendSession` thật có thật sự ĐẨY `expiresAt` trong Redis không.
//  2. control `expiring` có tới được một client WS thật, mang đúng mốc mới không.
//  3. Nhánh trần cứng — thứ mà `extend.classify` phải suy ra từ hash vì
//     orchestrator gộp ba nguyên nhân vào cùng một mã gRPC — có thật sự cho ra
//     `4409` chứ không phải `4404` không.
//
// Điểm (3) là lý do chính công cụ này tồn tại trong repo thay vì là một lệnh gõ
// tay: nó là nhánh dễ sai nhất và hậu quả của việc sai (báo "phiên bị thu hồi"
// cho người vừa dùng hết thời lượng) chỉ lộ ra sau vài giờ chạy thật.
//
// # Cách chạy
//
// Nén hai đồng hồ của orchestrator lại cho vừa một lượt đo, rồi trả về như cũ:
//
//	helm upgrade platform ./infra/helm/platform --reset-then-reuse-values \
//	  --set orchestrator.env.sessionTtl=90s \
//	  --set orchestrator.env.extendDefault=120s \
//	  --set orchestrator.env.hardCap=300s --wait
//	kubectl port-forward svc/platform-web 3000:3000 &
//	kubectl port-forward svc/platform-gateway 8082:8082 &
//	go run ./cmd/verify-heartbeat
//
// Với bộ số đó, mốc mong đợi (t tính từ lúc claim): t≈60s `expiring`
// hardCapReached=false (hạn 90→180); t≈180s `expiring` hardCapReached=true;
// t>300s đóng `4409`.
//
// ⚠ CHỈ DÙNG TRÊN LAB. Nó tạo tài khoản thật và tiêu một khe quota sandbox.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/coder/websocket"
)

func main() {
	webURL := flag.String("web", "http://localhost:3000", "gốc của apps/web (BFF tRPC + Better Auth)")
	gwURL := flag.String("gateway", "ws://localhost:8082", "gốc WS của terminal-gateway")
	origin := flag.String("origin", "http://localhost:3000", "header Origin gửi kèm handshake")
	budget := flag.Duration("budget", 8*time.Minute, "trần thời gian quan sát")
	flag.Parse()

	if err := run(*webURL, *gwURL, *origin, *budget); err != nil {
		fmt.Fprintf(os.Stderr, "\nFAIL: %v\n", err)
		os.Exit(1)
	}
}

func run(webURL, gwURL, origin string, budget time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), budget)
	defer cancel()

	jar := &cookieJar{}

	// ---- 1. tài khoản thật qua Better Auth --------------------------------
	email := fmt.Sprintf("g7-%d@example.com", time.Now().UnixNano())
	var signUp struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	// SINH mật khẩu, không viết hằng. Hai lý do, cả hai đã cắn ở chặng trước:
	// gosec `G101` chặn hằng hình dạng credential, và `gitleaks-action` quét cả
	// DẢI COMMIT của PR nên xoá ở tip là chưa đủ (bài học 1.C-1). Tài khoản này
	// dùng một lần rồi bỏ, nên không có gì để nhớ.
	password, err := randomSecret()
	if err != nil {
		return fmt.Errorf("sinh mật khẩu: %w", err)
	}
	if err := postJSON(ctx, jar, webURL+"/api/auth/sign-up/email", map[string]string{
		"email": email, "password": password, "name": "verify g7",
	}, &signUp); err != nil {
		return fmt.Errorf("sign-up: %w", err)
	}
	if signUp.User.ID == "" {
		return fmt.Errorf("sign-up không trả user.id")
	}
	fmt.Printf("1. sign-up OK: %s (user %s)\n", email, signUp.User.ID)

	// ---- 2. tRPC session.create → cookie dlp_sandbox ----------------------
	var created struct {
		Result struct {
			Data struct {
				Session struct {
					ID        string `json:"id"`
					PodName   string `json:"podName"`
					ExpiresAt string `json:"expiresAt"`
				} `json:"session"`
			} `json:"data"`
		} `json:"result"`
	}
	body := map[string]any{
		"userId": signUp.User.ID,
		// 1 = SANDBOX_TIER_SYSBOX. Enum của protobuf-es là số; `z.nativeEnum`
		// nhận GIÁ TRỊ chứ không nhận tên, nên gửi chuỗi sẽ trả 400.
		"tier":       1,
		"ttlSeconds": 0,
		// Khớp regex của `rediskeys.Idem`: [A-Za-z0-9_-]{1,64}.
		"idempotencyKey": fmt.Sprintf("verify-g7-%d", time.Now().UnixNano()),
	}
	if err := postJSON(ctx, jar, webURL+"/api/trpc/session.create", body, &created); err != nil {
		return fmt.Errorf("session.create: %w", err)
	}
	sid := created.Result.Data.Session.ID
	if sid == "" {
		return fmt.Errorf("session.create không trả session.id (đọc lại shape trả về của tRPC)")
	}
	if jar.get("dlp_sandbox") == "" {
		return fmt.Errorf("không nhận được cookie dlp_sandbox — G12 hỏng, không phải G7")
	}
	fmt.Printf("2. session %s, pod %s, expiresAt=%s\n",
		sid, created.Result.Data.Session.PodName, created.Result.Data.Session.ExpiresAt)

	// ---- 3. mở WS ----------------------------------------------------------
	hdr := http.Header{}
	hdr.Set("Origin", origin)
	hdr.Set("Cookie", jar.header())
	c, resp, err := websocket.Dial(ctx, gwURL+"/ws/session/"+sid, &websocket.DialOptions{
		HTTPHeader:   hdr,
		Subprotocols: []string{"dlp.terminal.v1"},
	})
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		return fmt.Errorf("dial WS: %w", err)
	}
	defer func() { _ = c.CloseNow() }()
	fmt.Println("3. WS 101 + subprotocol dlp.terminal.v1")

	if err := writeJSON(ctx, c, map[string]any{"type": "init", "cols": 120, "rows": 34}); err != nil {
		return fmt.Errorf("gửi init: %w", err)
	}

	// ---- 4. quan sát ------------------------------------------------------
	//
	// Gõ đều đặn: heartbeat chỉ gọi ExtendSession khi có traffic THẬT, nên một
	// prover im lặng sẽ chứng minh đúng điều ngược lại với thứ nó định đo.
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		tk := time.NewTicker(5 * time.Second)
		defer tk.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ctx.Done():
				return
			case <-tk.C:
				wctx, wcancel := context.WithTimeout(context.Background(), 5*time.Second)
				_ = c.Write(wctx, websocket.MessageBinary, []byte("\n"))
				wcancel()
			}
		}
	}()

	start := time.Now()
	var (
		readyExpiry    string
		expirings      []string
		sawSoftMove    bool
		sawHardCapWarn bool
	)

	for {
		typ, data, err := c.Read(ctx)
		if err != nil {
			code := websocket.CloseStatus(err)
			fmt.Printf("\n4. kết nối đóng sau %s: close code = %d\n", time.Since(start).Round(time.Second), code)

			if !sawSoftMove {
				return fmt.Errorf("KHÔNG nhận được `expiring` nào với hardCapReached=false — " +
					"ExtendSession không đẩy được hạn, hoặc gateway không chuyển tiếp")
			}
			if !sawHardCapWarn {
				return fmt.Errorf("KHÔNG nhận được `expiring` với hardCapReached=true trước khi đóng")
			}
			if code != 4409 {
				return fmt.Errorf("close code = %d, muốn 4409 — nhánh trần cứng đang bị phân loại nhầm "+
					"(4404 nghĩa là classify() coi hard-cap thành session-gone)", code)
			}
			fmt.Printf("\nPASS — ready.expiresAt=%s; %d control `expiring`: %v\n",
				readyExpiry, len(expirings), expirings)
			return nil
		}
		if typ != websocket.MessageText {
			continue
		}

		var co struct {
			Type           string `json:"type"`
			ExpiresAt      string `json:"expiresAt"`
			HardCapReached bool   `json:"hardCapReached"`
			Code           string `json:"code"`
		}
		if err := json.Unmarshal(data, &co); err != nil {
			continue
		}

		switch co.Type {
		case "ready":
			readyExpiry = co.ExpiresAt
			fmt.Printf("   [%6s] ready, expiresAt=%s\n", time.Since(start).Round(time.Second), co.ExpiresAt)
		case "expiring":
			expirings = append(expirings, fmt.Sprintf("%s(hardCap=%v)", co.ExpiresAt, co.HardCapReached))
			if co.HardCapReached {
				sawHardCapWarn = true
			} else {
				sawSoftMove = true
			}
			fmt.Printf("   [%6s] expiring, expiresAt=%s hardCapReached=%v\n",
				time.Since(start).Round(time.Second), co.ExpiresAt, co.HardCapReached)
		case "error":
			fmt.Printf("   [%6s] error, code=%s\n", time.Since(start).Round(time.Second), co.Code)
		}
	}
}

// ---------------------------------------------------------------- HTTP vặt

// cookieJar là bộ nhớ cookie tối giản — `net/http/cookiejar` đòi một URL gốc và
// bộ lọc domain/path, trong khi ở đây mọi thứ đi qua port-forward localhost với
// hai port KHÁC nhau (web 3000, gateway 8082). Path=/ws của `dlp_sandbox` cũng
// sẽ làm jar chuẩn KHÔNG gửi nó cho `/ws/session/...` qua một origin khác.
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
	resp, err := http.DefaultClient.Do(req)
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

// randomSecret sinh mật khẩu dùng-một-lần cho tài khoản kiểm thử.
//
// Thêm hậu tố `Aa1!` để chắc chắn qua mọi luật độ phức tạp của Better Auth mà
// không phải đọc cấu hình của nó — base64 đơn thuần có thể vô tình thiếu ký tự
// đặc biệt và làm prover đỏ vì một lý do chẳng liên quan gì tới G7.
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
