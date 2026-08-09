package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"runtime"
	"strings"
	"time"

	"github.com/coder/websocket"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// Shape control message theo docs/ws-terminal-protocol.md §4/§5 — camelCase,
// struct tag tường minh.
type controlIn struct {
	Type string `json:"type"`
	Cols uint16 `json:"cols"`
	Rows uint16 `json:"rows"`
}

type controlOut struct {
	Type     string `json:"type"`
	ExitCode *int   `json:"exitCode,omitempty"`
	Code     string `json:"code,omitempty"`
	Message  string `json:"message,omitempty"`
}

const subprotocol = "dlp.terminal.v1"

// logSession log kèm tiền tố tên pod.
//
// Tồn tại để chỗ khẳng định "pod đã sạch" chỉ có ĐÚNG MỘT, thay vì rải
// `#nosec` lên từng dòng log. `pod` tới từ URL path do client kiểm soát,
// nhưng runBridge đã ép nó qua `rediskeys.ValidateID`
// (`^[A-Za-z0-9_-]{1,64}$`) nên không thể mang `\n`/`\r` để chèn dòng log
// giả. gosec không theo được taint qua lời gọi sang package khác.
//
// Gateway thật (G3) đọc podName từ REDIS chứ không từ client, nên ở đó
// nguồn đã sạch sẵn — nhưng nguyên tắc thì giữ: không nội suy dữ liệu
// client vào log mà chưa qua cổng validate.
func logSession(pod, format string, args ...any) {
	// #nosec G706 -- pod đã qua rediskeys.ValidateID ở runBridge (xem trên)
	log.Printf("[%s] "+format, append([]any{pod}, args...)...)
}

// sizeQueue nối control resize vào remotecommand.TerminalSizeQueue.
//
// GOTCHA S4 #1 (đọc từ contract của interface + xác minh hành vi khi chạy):
// Next() trả nil nghĩa là "queue ĐÓNG VĨNH VIỄN, đừng hỏi nữa" — client-go gọi
// Next() trong một vòng lặp riêng và THOÁT HẲN vòng đó khi nhận nil. Trả nil
// "tạm" khi channel rỗng là cách resize chết âm thầm giữa phiên: kết nối vẫn
// sống nhưng mọi resize sau đó rơi vào hư không. Vì vậy Next() BLOCK trên
// channel và chỉ trả nil khi ctx đóng (kết nối đã chết thật).
type sizeQueue struct {
	ch  chan remotecommand.TerminalSize
	ctx context.Context
}

func (q *sizeQueue) Next() *remotecommand.TerminalSize {
	select {
	case s, ok := <-q.ch:
		if !ok {
			return nil
		}
		return &s
	case <-q.ctx.Done():
		return nil
	}
}

// push giữ GIÁ TRỊ CUỐI khi dồn dập (coalesce) — không block reader WS.
func (q *sizeQueue) push(s remotecommand.TerminalSize) {
	for {
		select {
		case q.ch <- s:
			return
		case <-q.ctx.Done():
			// Lối thoát: hôm nay chỉ có MỘT producer nên vòng lặp dưới luôn
			// kết thúc, nhưng không có gì trong code ràng buộc điều đó — thêm
			// producer thứ hai mà quên nhánh này là treo vô hạn.
			return
		default:
			// Channel đầy: rút cái cũ ra rồi thử lại — resize là "trạng thái
			// mong muốn mới nhất", không phải hàng đợi sự kiện.
			select {
			case <-q.ch:
			default:
			}
		}
	}
}

// wsWriter đưa stdout PTY ra binary frame. coder/websocket cho phép Write từ
// nhiều goroutine (serialize nội bộ) — chính là lý do chọn nó thay gorilla
// (gorilla panic khi hai goroutine cùng WriteMessage).
type wsWriter struct {
	c   *websocket.Conn
	ctx context.Context
}

func (w *wsWriter) Write(p []byte) (int, error) {
	if err := w.c.Write(w.ctx, websocket.MessageBinary, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

func runBridge(cfg *rest.Config, cs *kubernetes.Clientset, addr string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/spike/", func(w http.ResponseWriter, r *http.Request) {
		pod := strings.TrimPrefix(r.URL.Path, "/spike/")
		// Tên pod tới THẲNG từ URL path do client kiểm soát, và nó đi vào cả
		// log lẫn lời gọi apiserver. Không validate thì `/spike/x%0AFAKE-LOG`
		// chèn được dòng log giả (gosec G706). Dùng đúng validator mà
		// rediskeys dùng cho key `pod:{name}` — một pattern, một nơi.
		if err := rediskeys.ValidateID(pod); err != nil {
			http.Error(w, "tên pod không hợp lệ", http.StatusBadRequest)
			return
		}
		handleSession(cfg, cs, w, r, pod)
	})
	log.Printf("bridge nghe %s — WS /spike/{pod}, transport=%s, cmd=%s", addr, *flagTransport, *flagCmd)
	// ReadHeaderTimeout: không có nó thì một kết nối mở rồi im lặng giữ
	// goroutine vô hạn (Slowloris, gosec G112/G114).
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}

func handleSession(cfg *rest.Config, cs *kubernetes.Clientset, w http.ResponseWriter, r *http.Request, pod string) {
	g0 := runtime.NumGoroutine()
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols: []string{subprotocol},
		// Spike chạy localhost — bỏ kiểm Origin. Gateway thật (G1) có allowlist.
		InsecureSkipVerify: true,
	})
	if err != nil {
		log.Printf("accept: %v", err)
		return
	}
	defer func() { _ = c.CloseNow() }()
	if c.Subprotocol() != subprotocol {
		_ = c.Close(websocket.StatusPolicyViolation, "cần subprotocol "+subprotocol)
		return
	}
	// Data path: cho frame lớn hơn mặc định 32KiB — fastfetch/eza đẩy hàng trăm KB.
	c.SetReadLimit(1 << 20)

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// §3 bước 4-5: đợi init mang cols/rows TRƯỚC khi dial exec; 3s → 80×24.
	//
	// pendingStdin giữ frame binary lỡ tới trước `init`. Vứt nó đi là **mất
	// phím đầu tiên của người dùng** — FE nào gửi stdin trước khi
	// `document.fonts.ready` kịp cho FitAddon đo xong sẽ rơi vào đúng ca này,
	// và triệu chứng ("thỉnh thoảng mất ký tự đầu") gần như không chẩn đoán được.
	initSize := remotecommand.TerminalSize{Width: 80, Height: 24}
	var pendingStdin []byte
	initCtx, initCancel := context.WithTimeout(ctx, 3*time.Second)
	typ, data, err := c.Read(initCtx)
	initCancel()
	switch {
	case err != nil:
		logSession(pod, "không nhận được init trong 3s (%v) — dùng 80x24", err)
	case typ == websocket.MessageText:
		var ci controlIn
		if json.Unmarshal(data, &ci) == nil && ci.Type == "init" && ci.Cols > 0 && ci.Rows > 0 {
			initSize = remotecommand.TerminalSize{Width: ci.Cols, Height: ci.Rows}
		} else {
			// Chỉ log ĐỘ DÀI, không log nội dung: frame do client soạn, đưa
			// thẳng vào log là chèn được dòng giả. Nội dung frame hỏng gần như
			// không giúp chẩn đoán, còn log bị đầu độc thì có.
			logSession(pod, "frame đầu không phải init hợp lệ (%d byte)", len(data))
		}
	default:
		logSession(pod, "frame đầu là binary — contract bắt init trước, dùng 80x24 và GIỮ %d byte stdin", len(data))
		pendingStdin = append([]byte(nil), data...)
	}

	q := &sizeQueue{ch: make(chan remotecommand.TerminalSize, 1), ctx: ctx}
	q.push(initSize)

	// stdin: WS binary → pipe → exec.
	//
	// `defer stdinR.Close()` KHÔNG phải dọn dẹp cho gọn — không có nó là rò
	// goroutine thật: goroutine `copyStdin` của client-go không nằm trong
	// WaitGroup của nó, nên khi shell thoát, goroutine đó ghi vào stream đã
	// đóng, lỗi, rồi CHẾT — từ lúc ấy `stdinR` không còn reader nào. Frame
	// binary tiếp theo làm `stdinW.Write` bên dưới chặn VĨNH VIỄN, và nó
	// không nằm trong `c.Read` nên `cancel()` lẫn `CloseNow()` đều không cứu.
	// Kịch bản đời thường: sinh viên gõ thêm phím trong lúc shell đang thoát.
	// Đóng đầu đọc làm mọi Write sau đó trả `io.ErrClosedPipe` ngay.
	stdinR, stdinW := io.Pipe()
	defer func() { _ = stdinR.Close() }()

	// MỘT goroutine đọc duy nhất (ràng buộc coder/websocket: một reader tại
	// một thời điểm). Binary → stdin pipe; Text → control resize.
	go func() {
		defer func() { _ = stdinW.Close() }()
		// Byte lỡ tới trước init đi vào stdin TRƯỚC mọi frame sau đó — giữ
		// đúng thứ tự người dùng gõ.
		if len(pendingStdin) > 0 {
			if _, err := stdinW.Write(pendingStdin); err != nil {
				return
			}
		}
		for {
			typ, data, err := c.Read(ctx)
			if err != nil {
				_ = stdinW.CloseWithError(err)
				cancel()
				return
			}
			switch typ {
			case websocket.MessageBinary:
				if _, err := stdinW.Write(data); err != nil {
					return
				}
			case websocket.MessageText:
				var ci controlIn
				if err := json.Unmarshal(data, &ci); err != nil {
					logSession(pod, "control JSON hỏng (%d byte)", len(data))
					_ = c.Close(4400, "control JSON hỏng")
					cancel()
					return
				}
				switch ci.Type {
				case "resize", "init": // init thứ hai xử lý như resize (§4)
					if ci.Cols > 0 && ci.Rows > 0 {
						q.push(remotecommand.TerminalSize{Width: ci.Cols, Height: ci.Rows})
					}
				default:
					// KHÔNG nội suy ci.Type vào reason: nó là chuỗi client soạn
					// và reason đi vào close frame + log.
					_ = c.Close(4400, "type control không hợp lệ")
					cancel()
					return
				}
			}
		}
	}()

	// PTY: một luồng ra duy nhất — Stderr PHẢI vắng khi TTY=true (gotcha S4 #2).
	u := execURL(cs, *flagNS, pod, strings.Fields(*flagCmd), true, true, true, false)
	exec, err := newExecutor(cfg, u, *flagTransport)
	if err != nil {
		logSession(pod, "executor: %v", err)
		_ = c.Close(4500, "executor: "+err.Error())
		return
	}

	logSession(pod, "dial exec transport=%s size=%dx%d", *flagTransport, initSize.Width, initSize.Height)
	t0 := time.Now()
	streamErr := exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:             stdinR,
		Stdout:            &wsWriter{c: c, ctx: ctx},
		Tty:               true,
		TerminalSizeQueue: q,
	})
	dur := time.Since(t0)

	// Đóng theo §5/§6: exit → control exit + close 1000; lỗi khác → 4500.
	code, ok := exitCode(streamErr)
	switch {
	case streamErr == nil || ok:
		payload, _ := json.Marshal(controlOut{Type: "exit", ExitCode: &code})
		_ = c.Write(ctx, websocket.MessageText, payload)
		_ = c.Close(websocket.StatusNormalClosure, fmt.Sprintf("exit %d", code))
		logSession(pod, "stream xong sau %s, exit=%d", dur, code)
	default:
		msg := streamErr.Error()
		payload, _ := json.Marshal(controlOut{Type: "error", Code: "EXEC_FAILED", Message: msg})
		_ = c.Write(ctx, websocket.MessageText, payload)
		// reason close frame ≤ 123 byte (§6 gotcha) — cắt ở tầng gửi.
		if len(msg) > 100 {
			msg = msg[:100]
		}
		_ = c.Close(4500, msg)
		logSession(pod, "stream LỖI sau %s: %v", dur, streamErr)
	}
	// Đo leak goroutine: chờ dọn rồi so với baseline trước phiên.
	time.Sleep(500 * time.Millisecond)
	logSession(pod, "goroutines: trước=%d sau=%d", g0, runtime.NumGoroutine())
}

// probeReadLimit đo close code THẬT khi vượt SetReadLimit của coder/websocket
// (gotcha S4 #3 — spec §6 đang để ngỏ 4413 vs 1009, spike phải chốt).
func probeReadLimit() {
	const limit = 1024
	done := make(chan struct{})
	srvErr := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/rl", func(w http.ResponseWriter, r *http.Request) {
		defer close(done)
		c, err := websocket.Accept(w, r, nil)
		if err != nil {
			srvErr <- err
			return
		}
		defer func() { _ = c.CloseNow() }()
		c.SetReadLimit(limit)
		_, _, err = c.Read(r.Context()) // frame client gửi sẽ vượt limit
		srvErr <- err
	})
	srv := &http.Server{Addr: "127.0.0.1:8099", Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() { _ = srv.ListenAndServe() }()
	defer func() { _ = srv.Close() }()
	time.Sleep(200 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	c, resp, err := websocket.Dial(ctx, "ws://127.0.0.1:8099/rl", nil)
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer func() { _ = c.CloseNow() }()

	big := make([]byte, limit*4)
	if err := c.Write(ctx, websocket.MessageBinary, big); err != nil {
		log.Printf("write: %v", err)
	}
	// Đọc để nhận close frame server gửi lại — CloseStatus trích code thật.
	_, _, readErr := c.Read(ctx)
	fmt.Printf("PROBE readlimit (limit=%d, gửi %d byte)\n", limit, len(big))
	fmt.Printf("  server-side Read err: %v\n", <-srvErr)
	fmt.Printf("  client-side Read err: %v\n", readErr)
	fmt.Printf("  client thấy close code: %d\n", websocket.CloseStatus(readErr))
	var ce websocket.CloseError
	if errors.As(readErr, &ce) {
		fmt.Printf("  close reason: %q\n", ce.Reason)
	}
	<-done
}
