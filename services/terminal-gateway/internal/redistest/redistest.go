// Package redistest nối Redis THẬT cho test của terminal-gateway.
//
// ⚠ CHỈ DÙNG TRONG TEST (xem chú thích đầu internal/testjwt).
//
// KHÔNG miniredis — cùng lý do đã chốt ở spike 1.A-2 (A4): miniredis hỗ trợ Lua
// không đầy đủ, nên một script xanh trên nó mà đỏ trên Redis thật là một guard
// không gác gì. Bộ đếm WS ở đây chạy Lua có `pcall` + hoàn tác, đúng loại thứ
// miniredis dễ nói dối nhất.
package redistest

import (
	"context"
	"net"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// Phân bổ DB Redis cho test — MỖI PACKAGE MỘT DB.
//
// `go test ./...` chạy các package SONG SONG và mọi harness ở đây đều FLUSHDB,
// nên dùng chung một DB nghĩa là mỗi bên xoá dữ liệu của bên kia giữa chừng:
// triệu chứng là những lỗi vô lý KHÔNG TÁI LẬP ĐƯỢC, và chạy từng package một
// thì lại xanh — rất dễ đổ nhầm cho "test flaky".
//
// ⛔ BẢNG NÀY VẮT QUA HAI MODULE. services/orchestrator giữ 15/14/13 trong
// chính test của nó (pool/lifecycle/reaper); hai module là hai go.mod nên không
// có compiler nào ép chúng khớp nhau, mà chúng lại dùng CHUNG một Redis khi
// chạy `go test` toàn repo. Thêm số mới thì kiểm cả hai bên.
//
//	15 = orchestrator/internal/pool
//	14 = orchestrator/internal/lifecycle
//	13 = orchestrator/internal/reaper
//	12 = terminal-gateway/internal/sessionstore
//	11 = terminal-gateway/internal/wsroute
//
// ⛔ VÀ ĐÂY LÀ THỨ DB RIÊNG **KHÔNG** CÔ LẬP ĐƯỢC: cache script Lua. `SCRIPT
// FLUSH` / `SCRIPT LOAD` có phạm vi TOÀN SERVER. Một test gọi `SCRIPT FLUSH`
// (sessionstore có một cái, cố ý) xoá cache của mọi package ở mọi module — và
// điều đó đã làm đỏ một test bên orchestrator ở PR mở chặng 1.C-1. Thêm bất kỳ
// lệnh toàn-server nào vào một suite chạy song song thì phải soát các suite kia.
const (
	DBSessionStore = 12
	DBWSRoute      = 11
)

// localHosts là các host được coi là "dùng-rồi-bỏ". Harness FLUSHDB, nên trỏ
// nhầm vào Redis lab là xoá session thật của người đang dùng.
var localHosts = map[string]bool{"127.0.0.1": true, "localhost": true, "::1": true, "[::1]": true}

// New nối Redis từ REDIS_URL và FLUSHDB đúng một DB dành riêng cho package.
//
// REDIS_URL trống → t.Skip CÓ LÝ DO RÕ, không giả vờ xanh. Một suite xanh vì
// mọi test đều skip là chế độ hỏng đã có thật trong repo này.
func New(t *testing.T, db int) *redis.Client {
	t.Helper()

	url := os.Getenv("REDIS_URL")
	if url == "" {
		t.Skip("REDIS_URL trống — authz per-session của gateway BẮT BUỘC chạy trên Redis thật " +
			"(docker compose up -d redis, rồi REDIS_URL=redis://:mật-khẩu@127.0.0.1:6379). " +
			"Skip, KHÔNG giả vờ xanh.")
	}

	opts, err := redis.ParseURL(url)
	if err != nil {
		t.Fatalf("REDIS_URL không phân giải được: %v", err)
	}

	host, _, err := net.SplitHostPort(opts.Addr)
	if err != nil {
		host = opts.Addr
	}
	if !localHosts[host] && os.Getenv("DLP_ALLOW_REMOTE_FLUSHDB") != "1" {
		t.Fatalf("REDIS_URL trỏ host %q — harness này FLUSHDB, và một Redis không phải localhost "+
			"rất có thể đang giữ session thật. Trỏ về 127.0.0.1, hoặc đặt DLP_ALLOW_REMOTE_FLUSHDB=1 "+
			"nếu bạn CHẮC CHẮN đây là instance dùng-rồi-bỏ.", host)
	}

	// Ép DB bất kể URL nói gì: một REDIS_URL trỏ thẳng /14 sẽ đâm vào DB của
	// package lifecycle bên orchestrator.
	if opts.DB != db {
		t.Logf("ép DB %d cho package này (tránh đụng FLUSHDB với package khác)", db)
		opts.DB = db
	}

	client := redis.NewClient(opts)
	t.Cleanup(func() { _ = client.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatalf("ping redis (%s): %v", url, err)
	}
	if err := client.FlushDB(ctx).Err(); err != nil {
		t.Fatalf("FLUSHDB: %v", err)
	}
	return client
}
