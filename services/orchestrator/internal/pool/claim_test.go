package pool

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// newTestRedis nối Redis THẬT từ REDIS_URL — không miniredis (1.A-2 A4):
// miniredis hỗ trợ Lua không đầy đủ (đặc biệt LMOVE + redis.call lồng nhau),
// xanh trên miniredis mà đỏ trên Redis thật là guard không gác gì.
//
// An toàn: test FLUSHDB, nên nếu URL trỏ DB 0 (nơi dev có thể có dữ liệu thật)
// thì tự chuyển sang DB 15. Muốn test DB khác → ghi thẳng /N vào REDIS_URL.
func newTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	url := os.Getenv("REDIS_URL")
	if url == "" {
		t.Skip("REDIS_URL trống — spike claim BẮT BUỘC chạy trên Redis thật (docker compose up -d redis rồi đặt REDIS_URL=redis://:mật-khẩu@127.0.0.1:6379/15). Skip, KHÔNG giả vờ xanh.")
	}
	opts, err := redis.ParseURL(url)
	if err != nil {
		t.Fatalf("REDIS_URL không phân giải được: %v", err)
	}
	if opts.DB == 0 {
		t.Logf("REDIS_URL trỏ DB 0 — chuyển sang DB 15 để FLUSHDB không chạm dữ liệu dev")
		opts.DB = 15
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

func seedPool(t *testing.T, rdb *redis.Client, n int) []string {
	t.Helper()
	ctx := context.Background()
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		name := fmt.Sprintf("sandbox-%03d", i)
		names = append(names, name)
		podKey, err := rediskeys.Pod(name)
		if err != nil {
			t.Fatalf("rediskeys.Pod(%q): %v", name, err)
		}
		if err := rdb.HSet(ctx, podKey, "state", "free", "updatedAt", time.Now().Unix()).Err(); err != nil {
			t.Fatalf("seed pod hash %s: %v", name, err)
		}
		// RPUSH: pod mới vào bên phải; claim.lua pop LEFT ⇒ FIFO.
		if err := rdb.RPush(ctx, rediskeys.PoolFree, name).Err(); err != nil {
			t.Fatalf("seed pool:free %s: %v", name, err)
		}
	}
	return names
}

func testParams(sessionID string) ClaimParams {
	now := time.Now().Unix()
	return ClaimParams{
		SessionID:     sessionID,
		UserID:        "user-test",
		Namespace:     "dlp-sandbox",
		Tier:          "SANDBOX_TIER_SYSBOX",
		NowUnix:       now,
		ExpiresAtUnix: now + 600,
		TTLSeconds:    600,
	}
}

// TestConcurrentClaim là tiêu chí xanh A3: N_POOL=50, N_G=200 goroutine claim
// đồng thời. Chạy `-race -count=20` (race chỉ hiện theo xác suất).
//
// Xanh = đúng 50 thành công, 150 ErrPoolEmpty, 0 podName trùng,
// LLEN pool:free == 0, LLEN pool:claimed == 50, không panic.
func TestConcurrentClaim(t *testing.T) {
	const (
		nPool = 50
		nG    = 200
	)
	rdb := newTestRedis(t)
	seedPool(t, rdb, nPool)
	ctx := context.Background()

	type result struct {
		pod string
		err error
	}
	results := make([]result, nG)
	start := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < nG; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start // dồn tất cả goroutine xuất phát cùng lúc để ép đua thật
			pod, err := Claim(ctx, rdb, testParams(fmt.Sprintf("sess-%03d", i)))
			results[i] = result{pod: pod, err: err}
		}(i)
	}
	close(start)
	wg.Wait()

	var ok, empty int
	seen := map[string]int{}
	for i, r := range results {
		switch {
		case r.err == nil:
			ok++
			seen[r.pod]++
		case errors.Is(r.err, ErrPoolEmpty):
			empty++
		default:
			t.Errorf("goroutine %d: lỗi ngoài dự kiến: %v", i, r.err)
		}
	}
	if ok != nPool {
		t.Errorf("thành công = %d, muốn %d", ok, nPool)
	}
	if empty != nG-nPool {
		t.Errorf("pool-rỗng = %d, muốn %d", empty, nG-nPool)
	}
	for pod, n := range seen {
		if n > 1 {
			t.Errorf("pod %q bị claim %d lần — double-claim, chính rủi ro R2", pod, n)
		}
	}
	if n := rdb.LLen(ctx, rediskeys.PoolFree).Val(); n != 0 {
		t.Errorf("LLEN pool:free = %d, muốn 0", n)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != int64(nPool) {
		t.Errorf("LLEN pool:claimed = %d, muốn %d", n, nPool)
	}
}

// TestClaimWritesFullState kiểm claim đơn lẻ ghi TRỌN bộ state — đúng lý do
// script tồn tại thay vì LMOVE trần.
func TestClaimWritesFullState(t *testing.T) {
	rdb := newTestRedis(t)
	seedPool(t, rdb, 1)
	ctx := context.Background()

	p := testParams("sess-one")
	pod, err := Claim(ctx, rdb, p)
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if pod != "sandbox-000" {
		t.Fatalf("pod = %q, muốn sandbox-000", pod)
	}

	sessionKey, _ := rediskeys.Session(p.SessionID)
	h := rdb.HGetAll(ctx, sessionKey).Val()
	want := map[string]string{
		rediskeys.FieldUserID:       p.UserID,
		rediskeys.FieldPodName:      pod,
		rediskeys.FieldNamespace:    p.Namespace,
		rediskeys.FieldStatus:       "CLAIMED",
		rediskeys.FieldTier:         p.Tier,
		rediskeys.FieldCreatedAt:    fmt.Sprint(p.NowUnix),
		rediskeys.FieldExpiresAt:    fmt.Sprint(p.ExpiresAtUnix),
		rediskeys.FieldRevision:     "1",
		rediskeys.FieldLastActiveAt: fmt.Sprint(p.NowUnix),
	}
	for k, v := range want {
		if h[k] != v {
			t.Errorf("session hash field %q = %q, muốn %q", k, h[k], v)
		}
	}
	if len(h) != len(want) {
		t.Errorf("session hash có %d field, muốn %d — field lạ hoặc thiếu: %v", len(h), len(want), h)
	}

	podHashKey, _ := rediskeys.Pod(pod)
	ph := rdb.HGetAll(ctx, podHashKey).Val()
	if ph["state"] != "claimed" || ph["sessionId"] != p.SessionID {
		t.Errorf("pod hash = %v, muốn state=claimed sessionId=%s", ph, p.SessionID)
	}

	sessionPodKey, _ := rediskeys.SessionPod(p.SessionID)
	if got := rdb.Get(ctx, sessionPodKey).Val(); got != pod {
		t.Errorf("session:{id}:pod = %q, muốn %q", got, pod)
	}
	for _, key := range []string{sessionKey, sessionPodKey} {
		ttl := rdb.TTL(ctx, key).Val()
		if ttl <= 0 || ttl > time.Duration(p.TTLSeconds)*time.Second {
			t.Errorf("TTL %s = %v, muốn trong (0, %ds]", key, ttl, p.TTLSeconds)
		}
	}
}

// TestClaimFIFO: pod vào pool trước phải ra trước (D6 — pod hỏng lộ sớm).
func TestClaimFIFO(t *testing.T) {
	rdb := newTestRedis(t)
	seedPool(t, rdb, 3)
	ctx := context.Background()
	for i, want := range []string{"sandbox-000", "sandbox-001", "sandbox-002"} {
		pod, err := Claim(ctx, rdb, testParams(fmt.Sprintf("sess-fifo-%d", i)))
		if err != nil {
			t.Fatalf("Claim %d: %v", i, err)
		}
		if pod != want {
			t.Errorf("claim thứ %d trả %q, muốn %q (FIFO vỡ)", i, pod, want)
		}
	}
}

// TestClaimSurvivesScriptFlush mô phỏng Redis restart (script cache trống):
// EVALSHA sẽ gặp NOSCRIPT và redis.Script PHẢI tự fallback EVAL — không mất
// claim nào. Đây là gotcha A5.
func TestClaimSurvivesScriptFlush(t *testing.T) {
	rdb := newTestRedis(t)
	seedPool(t, rdb, 2)
	ctx := context.Background()

	if _, err := Claim(ctx, rdb, testParams("sess-before-flush")); err != nil {
		t.Fatalf("claim trước flush: %v", err)
	}
	// SCRIPT FLUSH xoá script cache — chính xác trạng thái sau Redis restart.
	if err := rdb.ScriptFlush(ctx).Err(); err != nil {
		t.Fatalf("SCRIPT FLUSH: %v", err)
	}
	pod, err := Claim(ctx, rdb, testParams("sess-after-flush"))
	if err != nil {
		t.Fatalf("claim sau SCRIPT FLUSH phải tự fallback EVAL, nhận lỗi: %v", err)
	}
	if pod != "sandbox-001" {
		t.Errorf("pod sau flush = %q, muốn sandbox-001", pod)
	}
}

// TestClaimEmptyPool: pool rỗng là sentinel ErrPoolEmpty, không phải lỗi.
func TestClaimEmptyPool(t *testing.T) {
	rdb := newTestRedis(t)
	_, err := Claim(context.Background(), rdb, testParams("sess-empty"))
	if !errors.Is(err, ErrPoolEmpty) {
		t.Fatalf("err = %v, muốn ErrPoolEmpty", err)
	}
}

// TestClaimRejectsBadIDs: định danh từ client phải chết ở cổng validate,
// trước khi chạm Redis.
func TestClaimRejectsBadIDs(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	p := testParams("sess:pha-namespace") // `:` bẻ được namespace key
	if _, err := Claim(ctx, rdb, p); err == nil {
		t.Error("session id chứa ':' phải bị từ chối")
	}
	p = testParams("sess-ok")
	p.UserID = "user/../evil"
	if _, err := Claim(ctx, rdb, p); err == nil {
		t.Error("user id chứa ký tự ngoài pattern phải bị từ chối")
	}
}
