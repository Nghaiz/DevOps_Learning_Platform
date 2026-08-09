package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

var flagScript = flag.String("script", "", "client script hoá (không cần tty): scenario | hold — dùng với -connect-url")
var flagScriptURL = flag.String("connect-url", "", "URL WS cho -script (tách khỏi -connect để không đụng client tty)")

// lastN trả n byte cuối — để dump bằng chứng khi một bước FAIL mà không nhấn
// chìm output bằng cả nghìn byte ANSI.
func lastN(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return "…" + s[len(s)-n:]
}

// runScriptClient là client KHÔNG tty cho CI/automation: chạy một kịch bản cố
// định qua bridge và tự chấm PASS/FAIL. Đây là cách chạy E2E dưới -race trên
// mọi OS (client tty cần SIGWINCH nên unix-only, còn cái này thì không).
func runScriptClient(mode, wsURL string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	c, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{Subprotocols: []string{subprotocol}})
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer c.CloseNow()
	c.SetReadLimit(1 << 20)

	var mu sync.Mutex
	var got strings.Builder
	var controls []string
	readDone := make(chan error, 1)
	go func() {
		for {
			typ, data, err := c.Read(ctx)
			if err != nil {
				readDone <- err
				return
			}
			mu.Lock()
			if typ == websocket.MessageBinary {
				got.Write(data)
			} else {
				controls = append(controls, string(data))
			}
			mu.Unlock()
		}
	}()

	sendCtl := func(typ string, cols, rows uint16) {
		payload, _ := json.Marshal(controlIn{Type: typ, Cols: cols, Rows: rows})
		if err := c.Write(ctx, websocket.MessageText, payload); err != nil {
			log.Printf("gửi %s: %v", typ, err)
		}
	}
	sendLine := func(s string) {
		if err := c.Write(ctx, websocket.MessageBinary, []byte(s)); err != nil {
			log.Printf("gửi stdin: %v", err)
		}
	}
	snapshot := func() string {
		mu.Lock()
		defer mu.Unlock()
		return got.String()
	}

	switch mode {
	case "hold":
		// Giữ phiên cho tới khi server đóng (để bên ngoài xoá pod / kill).
		sendCtl("init", 120, 30)
		err := <-readDone
		mu.Lock()
		fmt.Printf("HOLD kết thúc: err=%v close_code=%d\ncontrols=%v\n", err, websocket.CloseStatus(err), controls)
		mu.Unlock()
		return nil

	case "scenario":
		pass := true
		check := func(name string, ok bool, detail string) {
			status := "PASS"
			if !ok {
				status = "FAIL"
				pass = false
			}
			fmt.Printf("  [%s] %s — %s\n", status, name, detail)
		}

		sendCtl("init", 120, 30)
		time.Sleep(1500 * time.Millisecond) // đợi shell + prompt lên

		sendLine("stty size\r")
		time.Sleep(700 * time.Millisecond)
		out1 := snapshot()
		check("init 120x30 → stty size", regexp.MustCompile(`30 120`).MatchString(out1),
			fmt.Sprintf("tìm \"30 120\" trong %d byte output", len(out1)))

		t0 := time.Now()
		sendCtl("resize", 132, 40)
		sendLine("stty size\r")
		// Poll tới khi thấy kích thước mới — đo độ trễ resize thật.
		var resizeLatency time.Duration
		for {
			if regexp.MustCompile(`40 132`).MatchString(snapshot()) {
				resizeLatency = time.Since(t0)
				break
			}
			if time.Since(t0) > 3*time.Second {
				resizeLatency = -1
				break
			}
			time.Sleep(20 * time.Millisecond)
		}
		check("resize 132x40 < 1s", resizeLatency > 0 && resizeLatency < time.Second,
			fmt.Sprintf("độ trễ đo được: %v", resizeLatency))

		// Coalesce: bão resize không được đóng kết nối, và giá trị CUỐI phải thắng.
		mu.Lock()
		markBaoStart := got.Len()
		mu.Unlock()
		for i := 0; i < 200; i++ {
			sendCtl("resize", uint16(80+i%40), uint16(24+i%20))
		}
		sendCtl("resize", 100, 25)
		// Poll thay vì sleep cứng: 201 resize phải đi qua apiserver, độ trễ
		// không đoán được. Hỏi lại stty mỗi 300ms cho tới khi thấy giá trị cuối.
		tBao := time.Now()
		baoOK := false
		for time.Since(tBao) < 5*time.Second {
			sendLine("stty size\r")
			time.Sleep(300 * time.Millisecond)
			mu.Lock()
			tail := got.String()[markBaoStart:]
			mu.Unlock()
			if regexp.MustCompile(`25 100`).MatchString(tail) {
				baoOK = true
				break
			}
		}
		mu.Lock()
		baoTail := got.String()[markBaoStart:]
		mu.Unlock()
		check("bão 200 resize không chết, giữ giá trị cuối", baoOK,
			fmt.Sprintf("sau %v; output PTY: %q", time.Since(tBao), lastN(baoTail, 220)))

		// UTF-8 đa byte đi xuyên nguyên vẹn (echo lại từ PTY).
		sendLine("echo 'tiếng Việt ✓ 🚀'\r")
		time.Sleep(700 * time.Millisecond)
		check("UTF-8 đa byte round-trip", strings.Contains(snapshot(), "tiếng Việt ✓ 🚀"),
			"chuỗi đa byte về nguyên vẹn")

		sendLine("exit\r")
		var closeErr error
		select {
		case closeErr = <-readDone:
		case <-time.After(5 * time.Second):
			closeErr = fmt.Errorf("timeout đợi close sau exit")
		}
		mu.Lock()
		ctls := strings.Join(controls, " | ")
		mu.Unlock()
		check("exit → control exit + close 1000",
			websocket.CloseStatus(closeErr) == websocket.StatusNormalClosure && strings.Contains(ctls, `"type":"exit"`),
			fmt.Sprintf("close_code=%d controls=%s", websocket.CloseStatus(closeErr), ctls))

		if !pass {
			return fmt.Errorf("scenario có bước FAIL")
		}
		fmt.Println("SCENARIO: TẤT CẢ PASS")
		return nil

	case "tui":
		// Tiêu chí xanh #2: vim + htop vẽ ĐẦY ĐỦ, không rác ANSI.
		pass := true
		check := func(name string, ok bool, detail string) {
			status := "PASS"
			if !ok {
				status = "FAIL"
				pass = false
			}
			fmt.Printf("  [%s] %s — %s\n", status, name, detail)
		}
		const (
			altEnter = "\x1b[?1049h" // vào alternate screen (đặc trưng app full-screen)
			altExit  = "\x1b[?1049l"
		)

		sendCtl("init", 120, 30)
		time.Sleep(1500 * time.Millisecond)

		// --- vim ---
		mu.Lock()
		markVim := got.Len()
		mu.Unlock()
		// vim tự báo kích thước NÓ thấy từ PTY: chứng minh cols/rows đi tới đúng
		// tận ứng dụng full-screen, không chỉ tới bash.
		//
		// `:set columns?` chứ KHÔNG `:echo &columns` — image spike chỉ có
		// vim-tiny, build không có +eval nên mọi lệnh :echo trả E319 (gotcha
		// riêng của image, ghi trong report; image thật 1.E cài vim đầy đủ).
		sendLine(`vim -c 'set columns?' -c 'sleep 1' -c q` + "\r")
		time.Sleep(3500 * time.Millisecond)
		mu.Lock()
		vimOut := got.String()[markVim:]
		mu.Unlock()
		check("vim vào/ra alternate screen", strings.Contains(vimOut, altEnter) && strings.Contains(vimOut, altExit),
			fmt.Sprintf("có 1049h=%v, 1049l=%v", strings.Contains(vimOut, altEnter), strings.Contains(vimOut, altExit)))
		check("vim thấy đúng 120 cột từ PTY", strings.Contains(vimOut, "columns=120"),
			fmt.Sprintf("output: %q", lastN(vimOut, 200)))

		// --- htop ---
		mu.Lock()
		markHtop := got.Len()
		mu.Unlock()
		sendLine("htop -d 5\r")
		time.Sleep(3 * time.Second)
		sendLine("q")
		time.Sleep(1200 * time.Millisecond)
		mu.Lock()
		htopOut := got.String()[markHtop:]
		mu.Unlock()
		// htop vẽ thanh CPU/Mem + hàng tiêu đề. Không tìm chuỗi tiếng Anh cụ thể
		// (đổi theo version) mà tìm dấu hiệu vẽ full-screen: alt-screen + màu
		// truecolor/256 + đủ khối lượng byte cho một màn hình 120x30.
		hasColor := strings.Contains(htopOut, "\x1b[3") || strings.Contains(htopOut, "\x1b[4")
		check("htop vào alternate screen + vẽ có màu", strings.Contains(htopOut, altEnter) && hasColor,
			fmt.Sprintf("altEnter=%v màu=%v bytes=%d", strings.Contains(htopOut, altEnter), hasColor, len(htopOut)))
		check("htop vẽ đủ một màn hình (>2KB ANSI)", len(htopOut) > 2048,
			fmt.Sprintf("%d byte", len(htopOut)))
		check("thoát htop sạch, về lại shell", strings.Contains(htopOut, altExit),
			fmt.Sprintf("có 1049l=%v", strings.Contains(htopOut, altExit)))

		// Terminal còn lành sau hai app full-screen: stty vẫn đúng kích thước.
		mu.Lock()
		markAfter := got.Len()
		mu.Unlock()
		sendLine("stty size\r")
		time.Sleep(800 * time.Millisecond)
		mu.Lock()
		afterOut := got.String()[markAfter:]
		mu.Unlock()
		check("PTY còn nguyên 120x30 sau vim+htop", strings.Contains(afterOut, "30 120"),
			fmt.Sprintf("output: %q", lastN(afterOut, 120)))

		sendLine("exit\r")
		select {
		case <-readDone:
		case <-time.After(5 * time.Second):
		}
		if !pass {
			return fmt.Errorf("tui có bước FAIL")
		}
		fmt.Println("TUI: TẤT CẢ PASS")
		return nil

	default:
		return fmt.Errorf("script %q không hợp lệ (scenario|tui|hold)", mode)
	}
}
