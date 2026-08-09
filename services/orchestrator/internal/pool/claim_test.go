package pool

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// localHosts giới hạn nơi test được phép FLUSHDB.
//
// Guard theo DB index KHÔNG đủ: REDIS_URL là biến rất phổ biến trong repo này
// (.env của orchestrator, .github/ci.env, Secret Helm trỏ Redis IN-CLUSTER).
// Ai export REDIS_URL của cụm rồi chạy `go test ./...` sẽ xoá sạch một DB của
// Redis đang phục vụ session thật. "DB 15 chắc rỗng" là giả định, không phải
// bảo đảm — và với URL ghi rõ /2 thì guard theo index còn im lặng cho qua.
var localHosts = map[string]bool{"127.0.0.1": true, "localhost": true, "::1": true, "[::1]": true}

// newTestRedis nối Redis THẬT từ REDIS_URL — không miniredis (1.A-2 A4):
// miniredis hỗ trợ Lua không đầy đủ (đặc biệt LMOVE + redis.call lồng nhau)
// ⇒ xanh trên miniredis mà đỏ trên Redis thật là guard không gác gì.
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

	host, _, err := net.SplitHostPort(opts.Addr)
	if err != nil {
		host = opts.Addr
	}
	if !localHosts[host] && os.Getenv("DLP_ALLOW_REMOTE_FLUSHDB") != "1" {
		t.Fatalf("REDIS_URL trỏ host %q — test này FLUSHDB, và một Redis không phải localhost rất có thể đang giữ session thật. "+
			"Trỏ về 127.0.0.1, hoặc đặt DLP_ALLOW_REMOTE_FLUSHDB=1 nếu bạn CHẮC CHẮN đây là instance dùng-rồi-bỏ.", host)
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

// seedPool đẩy n pod hợp lệ (hash state=free) vào pool:free.
func seedPool(t *testing.T, rdb *redis.Client, n int) []string {
	t.Helper()
	names := make([]string, 0, n)
	for i := 0; i < n; i++ {
		names = append(names, seedPod(t, rdb, fmt.Sprintf("sandbox-%03d", i)))
	}
	return names
}

// seedPod tạo một pod free và đẩy vào cuối pool:free (đúng chiều replenish).
func seedPod(t *testing.T, rdb *redis.Client, name string) string {
	t.Helper()
	ctx := context.Background()
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
	return name
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
// LƯU Ý VỀ THỨ TEST NÀY GÁC ĐƯỢC: mọi lệnh trong một script Lua đều atomic, nên
// không thể làm mất tính atomic bằng cách sửa NỘI DUNG script — mutation
// LMOVE→LPOP+RPUSH vẫn cho test này xanh. Cái nó thật sự gác là refactor đưa
// các lệnh ghi RA NGOÀI script thành round-trip Go. Hai tính chất còn lại
// (không double-claim, không để lại state dở) có test riêng bên dưới, vì test
// này dùng seed toàn tên duy nhất nên "0 podName trùng" ở đây đến từ seed chứ
// không từ script.
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
			t.Errorf("pod %q bị claim %d lần", pod, n)
		}
	}
	if n := rdb.LLen(ctx, rediskeys.PoolFree).Val(); n != 0 {
		t.Errorf("LLEN pool:free = %d, muốn 0", n)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != int64(nPool) {
		t.Errorf("LLEN pool:claimed = %d, muốn %d", n, nPool)
	}
}

// TestClaimRejectsDuplicateInPool là ca CHỨNG MINH script chống double-claim —
// thứ TestConcurrentClaim mù vì seed của nó toàn tên duy nhất.
//
// Rủi ro thật: replenish retry sau timeout, reaper trả pod hai lần, hai
// instance orchestrator cùng replenish. Redis LIST không chống trùng. Nếu
// script tin pool:free mù quáng thì HAI sinh viên exec vào CÙNG một pod, và cả
// hai đều qua authz vì hash của mỗi người ghi đúng userId của người đó.
func TestClaimRejectsDuplicateInPool(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	seedPod(t, rdb, "sandbox-dup")
	// Cùng một tên lọt vào pool lần thứ hai — KHÔNG seed lại hash.
	if err := rdb.RPush(ctx, rediskeys.PoolFree, "sandbox-dup").Err(); err != nil {
		t.Fatalf("push trùng: %v", err)
	}
	seedPod(t, rdb, "sandbox-good")

	first, err := Claim(ctx, rdb, testParams("sess-dup-1"))
	if err != nil {
		t.Fatalf("claim 1: %v", err)
	}
	if first != "sandbox-dup" {
		t.Fatalf("claim 1 = %q, muốn sandbox-dup", first)
	}

	second, err := Claim(ctx, rdb, testParams("sess-dup-2"))
	if err != nil {
		t.Fatalf("claim 2: %v", err)
	}
	if second == first {
		t.Fatalf("DOUBLE-CLAIM: hai session cùng nhận %q — hai sinh viên vào chung một pod", first)
	}
	if second != "sandbox-good" {
		t.Errorf("claim 2 = %q, muốn sandbox-good (bản trùng phải bị cách ly)", second)
	}

	q := rdb.LRange(ctx, rediskeys.PoolQuarantine, 0, -1).Val()
	if len(q) != 1 || q[0] != "sandbox-dup" {
		t.Errorf("pool:quarantine = %v, muốn [sandbox-dup] — bản trùng phải được cách ly, không im lặng bỏ qua", q)
	}
	// Session của người đầu vẫn nguyên vẹn: cách ly không được đụng tới nó.
	sk, _ := rediskeys.Session("sess-dup-1")
	if got := rdb.HGet(ctx, sk, rediskeys.FieldPodName).Val(); got != "sandbox-dup" {
		t.Errorf("session đầu podName = %q, muốn sandbox-dup", got)
	}
}

// TestClaimSkipsEmptyStringEntry: trong Lua chuỗi rỗng là TRUTHY, nên
// `if not pod` KHÔNG bắt được nó. Bỏ qua thì sinh ra key rác tên đúng `pod:`
// và một session có podName rỗng — Claim trả ("", nil) và caller không có cách
// nào biết.
func TestClaimSkipsEmptyStringEntry(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	if err := rdb.RPush(ctx, rediskeys.PoolFree, "").Err(); err != nil {
		t.Fatalf("push chuỗi rỗng: %v", err)
	}
	seedPod(t, rdb, "sandbox-real")

	pod, err := Claim(ctx, rdb, testParams("sess-empty-entry"))
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if pod != "sandbox-real" {
		t.Fatalf("pod = %q, muốn sandbox-real", pod)
	}
	if n := rdb.Exists(ctx, rediskeys.PodPrefix).Val(); n != 0 {
		t.Errorf("tồn tại key rác %q — chuỗi rỗng đã lọt qua guard", rediskeys.PodPrefix)
	}
}

// TestClaimRollsBackOnWriteFailure là ca chứng minh C1: Redis Lua KHÔNG có
// rollback, nên script phải TỰ hoàn tác.
//
// Ép lỗi ở lệnh ghi thứ hai bằng cách cho `pod:{name}` SAI KIỂU (string thay vì
// hash) — `HSET` lên nó trả WRONGTYPE. Không có hoàn tác thì pod nằm lại
// pool:claimed vĩnh viễn mà không session nào trỏ tới, và mỗi lần retry lại ăn
// mất một pod nữa.
func TestClaimRollsBackOnWriteFailure(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()
	seedPod(t, rdb, "sandbox-abort")

	// Gọi THẲNG script, bỏ qua validate của Go: ta đang kiểm script tự bảo vệ
	// khi CALLER truyền sai — validate của Go hôm nay chặn ttl vượt trần, nhưng
	// B2/B3 mai này có thể gọi script qua đường khác, và cơ chế hoàn tác phải
	// đứng vững một mình. ttl khổng lồ làm `EXPIRE` lỗi ở lệnh CUỐI, tức là sau
	// khi pod đã rời pool và session đã ghi xong — đúng ca tệ nhất.
	sessionKey, _ := rediskeys.Session("sess-abort")
	sessionPodKey, _ := rediskeys.SessionPod("sess-abort")
	keys := []string{rediskeys.PoolFree, rediskeys.PoolClaimed, sessionKey, sessionPodKey, rediskeys.PoolQuarantine}
	now := time.Now().Unix()
	err := claimScript.Run(ctx, rdb, keys,
		"sess-abort", "user-test", "dlp-sandbox", "SANDBOX_TIER_SYSBOX",
		fmt.Sprint(now), fmt.Sprint(now+600),
		"99999999999999999", // ttl vô lý → EXPIRE lỗi
		rediskeys.PodPrefix, "99999999999999999",
	).Err()
	if err == nil {
		t.Fatal("muốn lỗi khi EXPIRE nhận ttl vô lý, nhận nil")
	}
	if !strings.Contains(err.Error(), "hoan tac") {
		t.Errorf("lỗi = %v, muốn thông báo có nhắc tới hoàn tác", err)
	}

	// Đây mới là phần quan trọng: Redis KHÔNG rollback, nên state chỉ sạch nếu
	// script tự hoàn tác. Không có nó, ca này để lại một session KHÔNG CÓ TTL
	// (giữ pod vĩnh viễn) trong khi caller tin là claim thất bại và sẽ retry.
	if n := rdb.LLen(ctx, rediskeys.PoolFree).Val(); n != 1 {
		t.Errorf("LLEN pool:free = %d, muốn 1 — pod phải quay lại pool sau abort", n)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != 0 {
		t.Errorf("LLEN pool:claimed = %d, muốn 0 — pod mồ côi còn sót lại sau abort", n)
	}
	if n := rdb.Exists(ctx, sessionKey).Val(); n != 0 {
		t.Errorf("session:{id} còn tồn tại sau abort — caller nhận lỗi mà Redis vẫn giữ session (và không TTL)")
	}
	if n := rdb.Exists(ctx, sessionPodKey).Val(); n != 0 {
		t.Errorf("session:{id}:pod còn tồn tại sau abort")
	}
	if state := rdb.HGet(ctx, rediskeys.PodPrefix+"sandbox-abort", "state").Val(); state != "free" {
		t.Errorf("pod state = %q sau abort, muốn free", state)
	}

	// Và claim lại phải thành công — pod không bị đốt.
	pod, err := Claim(ctx, rdb, testParams("sess-rollback-2"))
	if err != nil {
		t.Fatalf("claim lại sau abort: %v", err)
	}
	if pod != "sandbox-abort" {
		t.Errorf("claim lại = %q, muốn sandbox-abort", pod)
	}
}

// TestClaimQuarantinesWrongTypePodHash: `pod:{name}` sai kiểu làm `HGET` trả
// WRONGTYPE. Với `redis.call` thì script ABORT ngay — sau khi LMOVE đã chạy,
// để lại đúng cái pod mồ côi mà cơ chế hoàn tác tồn tại để ngăn. Guard phải
// dùng `pcall` và cách ly pod hỏng.
func TestClaimQuarantinesWrongTypePodHash(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	if err := rdb.Set(ctx, rediskeys.PodPrefix+"sandbox-bad", "toi-la-string", 0).Err(); err != nil {
		t.Fatalf("dựng pod hash sai kiểu: %v", err)
	}
	if err := rdb.RPush(ctx, rediskeys.PoolFree, "sandbox-bad").Err(); err != nil {
		t.Fatalf("push pod hỏng: %v", err)
	}
	seedPod(t, rdb, "sandbox-ok")

	pod, err := Claim(ctx, rdb, testParams("sess-wrongtype"))
	if err != nil {
		t.Fatalf("Claim phải bỏ qua pod hỏng và dùng pod kế, nhận lỗi: %v", err)
	}
	if pod != "sandbox-ok" {
		t.Errorf("pod = %q, muốn sandbox-ok", pod)
	}
	q := rdb.LRange(ctx, rediskeys.PoolQuarantine, 0, -1).Val()
	if len(q) != 1 || q[0] != "sandbox-bad" {
		t.Errorf("pool:quarantine = %v, muốn [sandbox-bad]", q)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != 1 {
		t.Errorf("LLEN pool:claimed = %d, muốn 1 (chỉ pod tốt) — pod hỏng còn sót trong claimed", n)
	}
}

// TestClaimRejectsExistingSession: gọi hai lần cùng sessionID là lỗi lập trình
// (dedupe theo idempotency_key sống ở tầng trên). Không chặn thì lần hai ghi đè
// hash và pod của lần một rò VĨNH VIỄN — nó vẫn nằm trong pool:claimed nhưng
// `session:{id}` TỒN TẠI nên heuristic mồ côi của reaper không bao giờ thấy.
func TestClaimRejectsExistingSession(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()
	seedPool(t, rdb, 2)

	p := testParams("sess-same")
	first, err := Claim(ctx, rdb, p)
	if err != nil {
		t.Fatalf("claim 1: %v", err)
	}
	if _, err := Claim(ctx, rdb, p); err == nil {
		t.Fatal("claim lần hai cùng sessionID phải lỗi, nhận nil")
	}
	sk, _ := rediskeys.Session(p.SessionID)
	if got := rdb.HGet(ctx, sk, rediskeys.FieldPodName).Val(); got != first {
		t.Errorf("podName = %q, muốn %q — lần hai không được ghi đè", got, first)
	}
	if n := rdb.LLen(ctx, rediskeys.PoolClaimed).Val(); n != 1 {
		t.Errorf("LLEN pool:claimed = %d, muốn 1 — lần hai không được rút thêm pod", n)
	}
}

// TestClaimWritesFullState kiểm claim đơn lẻ ghi TRỌN bộ state.
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

	// TTL của hash: đúng TTLSeconds.
	if ttl := rdb.TTL(ctx, sessionKey).Val(); ttl <= 0 || ttl > time.Duration(p.TTLSeconds)*time.Second {
		t.Errorf("TTL session = %v, muốn trong (0, %ds]", ttl, p.TTLSeconds)
	}
	// TTL của con trỏ pod: phải DÀI HƠN hash. Reaper tầng 1 nghe expired-event
	// của hash, và lúc đó hash đã mất — con trỏ này là chỗ duy nhất còn trả lời
	// được "session vừa hết hạn ở pod nào". Bằng nhau là reaper mù.
	ttlPtr := rdb.TTL(ctx, sessionPodKey).Val()
	if ttlPtr <= time.Duration(p.TTLSeconds)*time.Second {
		t.Errorf("TTL session:{id}:pod = %v, phải LỚN HƠN TTL hash (%ds)", ttlPtr, p.TTLSeconds)
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
// EVALSHA sẽ gặp NOSCRIPT và redis.Script PHẢI tự fallback EVAL.
func TestClaimSurvivesScriptFlush(t *testing.T) {
	rdb := newTestRedis(t)
	seedPool(t, rdb, 2)
	ctx := context.Background()

	if _, err := Claim(ctx, rdb, testParams("sess-before-flush")); err != nil {
		t.Fatalf("claim trước flush: %v", err)
	}
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

// TestClaimValidatesInput: mọi đầu vào vượt biên tin cậy phải chết ở cổng
// validate, TRƯỚC khi chạm Redis.
func TestClaimValidatesInput(t *testing.T) {
	rdb := newTestRedis(t)
	ctx := context.Background()

	cases := []struct {
		name  string
		mutit func(*ClaimParams)
	}{
		{"session id có ':' bẻ được namespace", func(p *ClaimParams) { p.SessionID = "sess:pha" }},
		{"user id ngoài pattern", func(p *ClaimParams) { p.UserID = "user/../evil" }},
		{"namespace ngoài pattern (đi vào URL pods/exec ở G4)", func(p *ClaimParams) { p.Namespace = "ns/../../x" }},
		{"tier không thuộc enum proto", func(p *ClaimParams) { p.Tier = "SANDBOX_TIER_TYPO" }},
		{"tier UNSPECIFIED phải fail-closed", func(p *ClaimParams) { p.Tier = "SANDBOX_TIER_UNSPECIFIED" }},
		{"TTL vượt trần → EXPIRE lỗi ở lệnh CUỐI của script", func(p *ClaimParams) { p.TTLSeconds = 1 << 60 }},
		{"TTL âm", func(p *ClaimParams) { p.TTLSeconds = -1 }},
		{"expiresAt không sau now → session sinh ra đã hết hạn", func(p *ClaimParams) { p.ExpiresAtUnix = p.NowUnix }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := testParams("sess-valid")
			tc.mutit(&p)
			if _, err := Claim(ctx, rdb, p); err == nil {
				t.Error("muốn lỗi validate, nhận nil")
			}
		})
	}
}
