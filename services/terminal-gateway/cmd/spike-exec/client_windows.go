//go:build !unix

package main

import "errors"

// -client cần raw mode + SIGWINCH — Windows không có SIGWINCH. Chạy client
// trên Host A (linux); mọi mode khác (bridge, probe, oneshot) chạy được ở đây.
func runClient(string) error {
	return errors.New("-connect (client tty) chỉ hỗ trợ unix — chạy trên Host A")
}
