//go:build unix

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/coder/websocket"
	"golang.org/x/term"
)

// runClient: S3 — "một con người gõ thử mà không cần lane FE".
// Terminal local vào raw mode, stdin → binary frame, binary frame → stdout,
// SIGWINCH → control resize. Unix-only (SIGWINCH không tồn tại trên Windows).
func runClient(wsURL string) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	c, resp, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		Subprotocols: []string{subprotocol},
	})
	if resp != nil && resp.Body != nil {
		_ = resp.Body.Close()
	}
	if err != nil {
		return fmt.Errorf("dial %s: %w", wsURL, err)
	}
	defer func() { _ = c.CloseNow() }()
	c.SetReadLimit(1 << 20)

	stdinFD := int(os.Stdin.Fd())
	if !term.IsTerminal(stdinFD) {
		return fmt.Errorf("stdin không phải terminal — client mode cần tty thật")
	}
	oldState, err := term.MakeRaw(stdinFD)
	if err != nil {
		return fmt.Errorf("raw mode: %w", err)
	}
	// restore là thao tác BẮT BUỘC chạy được: bỏ qua lỗi ở đây nghĩa là terminal
	// của người dùng kẹt ở raw mode sau khi lệnh thoát (không echo, không Ctrl-C)
	// và họ phải `reset` thủ công. Lỗi thì ít nhất phải nói ra.
	restore := func() {
		if err := term.Restore(stdinFD, oldState); err != nil {
			fmt.Fprintf(os.Stderr, "\r\nKHÔNG khôi phục được terminal: %v — chạy `reset`\r\n", err)
		}
	}
	defer restore()

	sendSize := func(typ string) error {
		w, h, err := term.GetSize(stdinFD)
		if err != nil {
			return err
		}
		// Clamp trước khi ép kiểu: contract §4 giới hạn 1..1000, và uint16(w)
		// với w > 65535 quấn vòng thành một số NHỎ — terminal khổng lồ sẽ báo
		// kích thước tí hon, đúng loại lỗi chỉ lộ trên máy người khác.
		if w < 1 {
			w = 1
		}
		if h < 1 {
			h = 1
		}
		if w > 1000 {
			w = 1000
		}
		if h > 1000 {
			h = 1000
		}
		payload, _ := json.Marshal(controlIn{Type: typ, Cols: uint16(w), Rows: uint16(h)})
		return c.Write(ctx, websocket.MessageText, payload)
	}
	// §3 bước 4: init là frame đầu tiên, trước mọi stdin.
	if err := sendSize("init"); err != nil {
		return fmt.Errorf("gửi init: %w", err)
	}

	// SIGWINCH → resize.
	winch := make(chan os.Signal, 1)
	signal.Notify(winch, syscall.SIGWINCH)
	go func() {
		for range winch {
			if err := sendSize("resize"); err != nil {
				return
			}
		}
	}()
	defer signal.Stop(winch)

	// stdin → binary frame.
	go func() {
		buf := make([]byte, 32*1024)
		for {
			n, err := os.Stdin.Read(buf)
			if n > 0 {
				if werr := c.Write(ctx, websocket.MessageBinary, buf[:n]); werr != nil {
					cancel()
					return
				}
			}
			if err != nil {
				cancel()
				return
			}
		}
	}()

	// Vòng đọc chính: binary → stdout, text → control in ra sau khi restore.
	for {
		typ, data, err := c.Read(ctx)
		if err != nil {
			restore()
			fmt.Printf("\r\nWS đóng: err=%v close_code=%d\r\n", err, websocket.CloseStatus(err))
			return nil
		}
		switch typ {
		case websocket.MessageBinary:
			// Lỗi ghi stdout ở đây nghĩa là đầu ra đã đứt (pipe đóng, terminal
			// chết) — im lặng tiếp tục là vẽ vào hư không cho tới khi WS đóng.
			if _, werr := os.Stdout.Write(data); werr != nil {
				restore()
				fmt.Fprintf(os.Stderr, "\r\nghi stdout lỗi: %v\r\n", werr)
				return nil
			}
		case websocket.MessageText:
			var co controlOut
			_ = json.Unmarshal(data, &co)
			if co.Type == "exit" || co.Type == "error" {
				restore()
				fmt.Printf("\r\n[control] %s\r\n", data)
			}
		}
	}
}

func init() {
	// giữ log gọn cho phiên tty
	log.SetFlags(0)
}
