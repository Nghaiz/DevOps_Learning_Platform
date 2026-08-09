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

	c, _, err := websocket.Dial(ctx, wsURL, &websocket.DialOptions{
		Subprotocols: []string{subprotocol},
	})
	if err != nil {
		return fmt.Errorf("dial %s: %w", wsURL, err)
	}
	defer c.CloseNow()
	c.SetReadLimit(1 << 20)

	stdinFD := int(os.Stdin.Fd())
	if !term.IsTerminal(stdinFD) {
		return fmt.Errorf("stdin không phải terminal — client mode cần tty thật")
	}
	oldState, err := term.MakeRaw(stdinFD)
	if err != nil {
		return fmt.Errorf("raw mode: %w", err)
	}
	defer term.Restore(stdinFD, oldState)

	sendSize := func(typ string) error {
		w, h, err := term.GetSize(stdinFD)
		if err != nil {
			return err
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
			term.Restore(stdinFD, oldState)
			fmt.Printf("\r\nWS đóng: err=%v close_code=%d\r\n", err, websocket.CloseStatus(err))
			return nil
		}
		switch typ {
		case websocket.MessageBinary:
			os.Stdout.Write(data)
		case websocket.MessageText:
			var co controlOut
			_ = json.Unmarshal(data, &co)
			if co.Type == "exit" || co.Type == "error" {
				term.Restore(stdinFD, oldState)
				fmt.Printf("\r\n[control] %s\r\n", data)
			}
		}
	}
}

func init() {
	// giữ log gọn cho phiên tty
	log.SetFlags(0)
}
