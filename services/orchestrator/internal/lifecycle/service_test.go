package lifecycle

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// ---------------------------------------------------------------- test harness

// localHosts giới hạn nơi test được phép FLUSHDB — cùng lý do như
// internal/pool/claim_test.go: REDIS_URL là biến rất phổ biến trong repo này và
// một lần `go test ./...` với URL của cụm sẽ xoá sạch session thật.
var localHosts = map[string]bool{"127.0.0.1": true, "localhost": true, "::1": true, "[::1]": true}

// lifecycleTestDB là DB Redis riêng của package này.
//
// ⚠ `go test ./...` chạy các PACKAGE SONG SONG. Package này và internal/pool
// đều FLUSHDB, nên dùng chung một DB nghĩa là mỗi bên xoá dữ liệu của bên kia
// giữa chừng — và triệu chứng KHÔNG trỏ về nguyên nhân: "pool rỗng" ngay sau
// khi seed, khoá idempotency "vừa hết hạn" sau 20ms, pod tên `sandbox-cold1`
// của package này lọt vào assertion FIFO của package kia. Chạy riêng từng
// package thì xanh, nên rất dễ đổ cho "test flaky".
//
// Phân bổ: pool=15, lifecycle=14. Package nào thêm sau phải lấy số MỚI.
const lifecycleTestDB = 14

func newTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	url := os.Getenv("REDIS_URL")
	if url == "" {
		t.Skip("REDIS_URL trống — lifecycle chạy trên Redis THẬT (claim.lua cần Lua đầy đủ). " +
			"docker compose up -d redis rồi đặt REDIS_URL=redis://:mật-khẩu@127.0.0.1:6379/15. Skip, KHÔNG giả vờ xanh.")
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
		t.Fatalf("REDIS_URL trỏ host %q — test này FLUSHDB. Trỏ về 127.0.0.1 hoặc đặt DLP_ALLOW_REMOTE_FLUSHDB=1.", host)
	}
	if opts.DB != lifecycleTestDB {
		t.Logf("ép DB %d cho test của package lifecycle (tránh đụng FLUSHDB với package khác)", lifecycleTestDB)
		opts.DB = lifecycleTestDB
	}
	client := redis.NewClient(opts)
	t.Cleanup(func() { _ = client.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatalf("ping redis: %v", err)
	}
	if err := client.FlushDB(ctx).Err(); err != nil {
		t.Fatalf("FLUSHDB: %v", err)
	}
	return client
}

// fakePool đóng vai warm-pool. Provision đẩy một pod "ấm" vào pool ĐÚNG THỨ TỰ
// mà pool.Manager.publish() dùng (HSET state=free rồi mới RPUSH) — nếu double
// này làm sai thứ tự thì mọi test cold-path ở đây sẽ đỏ vì pod bị cách ly, và
// đó là điều đúng: double phải mô phỏng luật, không được lách nó.
type fakePool struct {
	mu sync.Mutex

	rdb        redis.UniversalClient
	provisions int
	triggers   int
	err        error
	// steal chạy SAU khi pod vào pool — mô phỏng một request đồng thời cướp pod.
	steal func()
	seq   int
}

func (f *fakePool) Provision(ctx context.Context) (string, error) {
	f.mu.Lock()
	f.provisions++
	if f.err != nil {
		err := f.err
		f.mu.Unlock()
		return "", err
	}
	f.seq++
	name := "sandbox-cold" + strconv.Itoa(f.seq)
	steal := f.steal
	f.mu.Unlock()

	podKey, err := rediskeys.Pod(name)
	if err != nil {
		return "", err
	}
	if err := f.rdb.HSet(ctx, podKey, "state", "free").Err(); err != nil {
		return "", err
	}
	if err := f.rdb.RPush(ctx, rediskeys.PoolFree, name).Err(); err != nil {
		return "", err
	}
	if steal != nil {
		steal()
	}
	return name, nil
}

func (f *fakePool) Trigger() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.triggers++
}

func (f *fakePool) counts() (provisions, triggers int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.provisions, f.triggers
}

type harness struct {
	svc  *Service
	rdb  *redis.Client
	pool *fakePool
	pods *fakePodDeleter
	met  *metrics.Metrics
}

// fakePodDeleter ghi lại lượt xoá pod. Reap và reaper đều đi qua nó.
type fakePodDeleter struct {
	mu      sync.Mutex
	deleted []string
	err     error
}

func (f *fakePodDeleter) Delete(_ context.Context, name string, _ int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.err != nil {
		return f.err
	}
	f.deleted = append(f.deleted, name)
	return nil
}

func (f *fakePodDeleter) deletedNames() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.deleted...)
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	rdb := newTestRedis(t)
	fp := &fakePool{rdb: rdb}
	met := metrics.New(prometheus.NewRegistry())
	pods := &fakePodDeleter{}
	svc, err := NewService(rdb, fp, pods, nil, Config{
		Namespace:     "dlp-sandbox",
		SessionTTL:    time.Hour,
		HardCap:       2 * time.Hour,
		ExtendDefault: 5 * time.Minute,
	}, slog.New(slog.NewJSONHandler(io.Discard, nil)), met)
	if err != nil {
		t.Fatalf("NewService: %v", err)
	}
	return &harness{svc: svc, rdb: rdb, pool: fp, pods: pods, met: met}
}

// TestNewServiceTuChoiCauHinhMauThuan (M-3).
//
// Không có cổng này thì HARD_CAP=48h qua được config, orchestrator lên xanh,
// mọi probe xanh — và 100% CreateSession chết bằng một lỗi nói về "TTLSeconds",
// không nói gì về HARD_CAP.
func TestNewServiceTuChoiCauHinhMauThuan(t *testing.T) {
	met := metrics.New(prometheus.NewRegistry())
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))

	tests := []struct {
		name    string
		cfg     Config
		wantErr string
	}{
		{
			name:    "HARD_CAP vượt trần kỹ thuật 24h của claim",
			cfg:     Config{Namespace: "ns", SessionTTL: 30 * time.Hour, HardCap: 48 * time.Hour, ExtendDefault: 5 * time.Minute},
			wantErr: "vượt trần kỹ thuật",
		},
		{
			name:    "SESSION_TTL > HARD_CAP",
			cfg:     Config{Namespace: "ns", SessionTTL: 3 * time.Hour, HardCap: time.Hour, ExtendDefault: 5 * time.Minute},
			wantErr: "> HARD_CAP",
		},
		{
			name:    "SESSION_TTL = 0",
			cfg:     Config{Namespace: "ns", SessionTTL: 0, HardCap: time.Hour, ExtendDefault: 5 * time.Minute},
			wantErr: "SESSION_TTL phải > 0",
		},
		{
			name:    "Namespace rỗng",
			cfg:     Config{Namespace: "", SessionTTL: time.Hour, HardCap: 2 * time.Hour, ExtendDefault: 5 * time.Minute},
			wantErr: "Namespace rỗng",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := NewService(nil, nil, nil, nil, tt.cfg, log, met)
			if err == nil {
				t.Fatalf("cần lỗi chứa %q, nhận nil — cấu hình này sẽ làm mọi CreateSession thất bại", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("lỗi = %q, cần chứa %q", err, tt.wantErr)
			}
		})
	}

	// Cấu hình đúng vẫn phải qua.
	if _, err := NewService(nil, nil, nil, nil, Config{
		Namespace: "ns", SessionTTL: time.Hour, HardCap: 2 * time.Hour,
		ExtendDefault: 5 * time.Minute,
	}, log, met); err != nil {
		t.Fatalf("cấu hình hợp lệ bị từ chối: %v", err)
	}
}

// seedWarmPod đẩy n pod ấm vào pool đúng thứ tự luật định.
func (h *harness) seedWarmPod(t *testing.T, names ...string) {
	t.Helper()
	ctx := context.Background()
	for _, n := range names {
		key, err := rediskeys.Pod(n)
		if err != nil {
			t.Fatalf("rediskeys.Pod(%q): %v", n, err)
		}
		if err := h.rdb.HSet(ctx, key, "state", "free").Err(); err != nil {
			t.Fatalf("HSET: %v", err)
		}
		if err := h.rdb.RPush(ctx, rediskeys.PoolFree, n).Err(); err != nil {
			t.Fatalf("RPUSH: %v", err)
		}
	}
}

func createReq(user, idem string) *orchestratorv1.CreateSessionRequest {
	return &orchestratorv1.CreateSessionRequest{
		UserId:         user,
		Tier:           orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX,
		IdempotencyKey: idem,
	}
}

func wantCode(t *testing.T, err error, want codes.Code) {
	t.Helper()
	if got := status.Code(err); got != want {
		t.Fatalf("code = %v (%v), cần %v", got, err, want)
	}
}

// ---------------------------------------------------------------- validate

func TestCreateTuChoiDauVaoHong(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	tests := []struct {
		name string
		req  *orchestratorv1.CreateSessionRequest
		want codes.Code
	}{
		{
			// Comment trong session.proto yêu cầu fail-closed: server đoán hộ
			// tier nghĩa là âm thầm chạy lab ở mức cô lập yếu hơn ý định.
			name: "tier UNSPECIFIED",
			req: &orchestratorv1.CreateSessionRequest{
				UserId: "u1", IdempotencyKey: "k1",
				Tier: orchestratorv1.SandboxTier_SANDBOX_TIER_UNSPECIFIED,
			},
			want: codes.InvalidArgument,
		},
		{
			// GVISOR hợp lệ với contract nhưng chưa triển khai — Unimplemented,
			// không phải InvalidArgument: nói "tham số sai" sẽ đẩy người tích
			// hợp đi sửa nhầm chỗ.
			name: "tier hợp lệ nhưng chưa triển khai",
			req: &orchestratorv1.CreateSessionRequest{
				UserId: "u1", IdempotencyKey: "k1",
				Tier: orchestratorv1.SandboxTier_SANDBOX_TIER_GVISOR,
			},
			want: codes.Unimplemented,
		},
		{name: "thiếu idempotency_key", req: createReq("u1", ""), want: codes.InvalidArgument},
		{name: "user_id rỗng", req: createReq("", "k1"), want: codes.InvalidArgument},
		{
			// `:` trong idempotency_key sẽ nhảy scope sang khoá của user khác
			// nếu không có cổng validate — proto không ràng buộc nội dung field
			// này, nên nó là dữ liệu không tin được.
			name: "idempotency_key chứa dấu hai chấm",
			req:  createReq("u1", "abc:def"),
			want: codes.InvalidArgument,
		},
		{
			name: "user_id chứa dấu hai chấm",
			req:  createReq("u1:admin", "k1"),
			want: codes.InvalidArgument,
		},
		{
			name: "ttl_seconds âm",
			req: &orchestratorv1.CreateSessionRequest{
				UserId: "u1", IdempotencyKey: "k1",
				Tier: orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX, TtlSeconds: -1,
			},
			want: codes.InvalidArgument,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := h.svc.Create(ctx, tt.req)
			wantCode(t, err, tt.want)
		})
	}
}

// ---------------------------------------------------------------- warm claim

func TestCreateClaimTuWarmPool(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if sess.GetPodName() != "sandbox-warm01" {
		t.Errorf("pod_name = %q, cần sandbox-warm01", sess.GetPodName())
	}
	if sess.GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_CLAIMED {
		t.Errorf("status = %v, cần CLAIMED", sess.GetStatus())
	}
	if sess.GetTier() != orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX {
		t.Errorf("tier = %v", sess.GetTier())
	}
	if sess.GetRevision() != 1 {
		t.Errorf("revision = %d, cần 1", sess.GetRevision())
	}
	if sess.GetExpiresAt() == nil {
		t.Fatal("expires_at rỗng — BFF mint sandbox token với exp=expires_at ngay sau lời gọi này")
	}

	if provisions, triggers := h.pool.counts(); provisions != 0 || triggers != 1 {
		t.Errorf("provisions=%d triggers=%d, cần 0 và 1 (claim ấm không tạo pod, nhưng phải thúc replenish)",
			provisions, triggers)
	}
	if got := testutil.ToFloat64(h.met.ColdPathTotal); got != 0 {
		t.Errorf("dlp_cold_path_total = %v, cần 0", got)
	}
	if got := testutil.CollectAndCount(h.met.ClaimDuration); got == 0 {
		t.Error("dlp_claim_duration_seconds không có mẫu nào — AC p95 < 1s cần metric này")
	}
}

// TestTTLDemTuLucClaimChuKhongPhaiLucCreate (B4).
//
// Đường cold có thể mất hàng chục giây chờ pod Ready. Nếu mốc thời gian được
// tính MỘT LẦN ở đầu Create rồi dùng lại, session sinh ra đã mất sẵn ngần ấy
// giây — và với TTL ngắn thì ExpiresAtUnix còn có thể lùi về trước NowUnix, làm
// chính validate() của pool từ chối.
func TestTTLDemTuLucClaimChuKhongPhaiLucCreate(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	// Đồng hồ giả: nhảy 60s mỗi lần được đọc, mô phỏng cold path chậm.
	var ticks int64
	base := time.Now()
	h.svc.now = func() time.Time {
		t := base.Add(time.Duration(ticks) * 60 * time.Second)
		ticks++
		return t
	}

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	createdAt := sess.GetCreatedAt().AsTime()
	expiresAt := sess.GetExpiresAt().AsTime()
	ttl := expiresAt.Sub(createdAt)
	if ttl != time.Hour {
		t.Fatalf("expires_at − created_at = %s, cần đúng SESSION_TTL (1h) — TTL phải đếm từ lúc claim", ttl)
	}
	if createdAt.Before(base.Add(30 * time.Second)) {
		t.Fatalf("created_at = %s bám vào mốc đầu lời gọi (%s) thay vì mốc claim", createdAt, base)
	}
}

func TestTTLBiCatXuongHardCap(t *testing.T) {
	h := newHarness(t)
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(context.Background(), &orchestratorv1.CreateSessionRequest{
		UserId: "u1", IdempotencyKey: "k1",
		Tier:       orchestratorv1.SandboxTier_SANDBOX_TIER_SYSBOX,
		TtlSeconds: int32((10 * time.Hour).Seconds()),
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	ttl := sess.GetExpiresAt().AsTime().Sub(sess.GetCreatedAt().AsTime())
	if ttl != 2*time.Hour {
		t.Fatalf("ttl = %s, cần bị cắt xuống HARD_CAP 2h — và client PHẢI thấy sự thật đó qua expires_at", ttl)
	}
}

// ---------------------------------------------------------------- idempotency

// TestIdempotencyKeyTraLaiDungSessionCu — AC: gọi 2 lần cùng idempotency_key →
// cùng session.id, số pod tăng đúng 1.
func TestIdempotencyKeyTraLaiDungSessionCu(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	first, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create lần 1: %v", err)
	}
	second, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create lần 2: %v", err)
	}

	if first.GetId() != second.GetId() {
		t.Fatalf("session id khác nhau: %q vs %q", first.GetId(), second.GetId())
	}
	if first.GetPodName() != second.GetPodName() {
		t.Fatalf("pod khác nhau: %q vs %q — pod thứ hai đã bị tiêu vô ích", first.GetPodName(), second.GetPodName())
	}
	if n, _ := h.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("pool:free còn %d, cần 1 — lần gọi thứ hai đã claim thêm một pod", n)
	}
}

// TestIdemKeyScopeTheoUser (R23).
//
// Với namespace `idem:{key}` toàn cục, user B gửi trùng idempotency_key của A
// sẽ nhận lại SESSION CỦA A — tức B biết sessionId của A, và BFF sẽ mint cho B
// một token `sub=B, sid=sessionA` đi qua được bước e và f của handshake, chỉ
// chết ở bước g. Vế g khi đó không còn là phòng thủ chiều sâu mà là lớp DUY
// NHẤT chặn B vào shell của A.
func TestIdemKeyScopeTheoUser(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	a, err := h.svc.Create(ctx, createReq("userA", "cung-mot-key"))
	if err != nil {
		t.Fatalf("Create A: %v", err)
	}
	b, err := h.svc.Create(ctx, createReq("userB", "cung-mot-key"))
	if err != nil {
		t.Fatalf("Create B: %v", err)
	}

	if a.GetId() == b.GetId() {
		t.Fatal("hai user trùng idempotency_key nhận CÙNG session — rò sessionId và biến vế authz g thành lớp duy nhất")
	}
	if a.GetPodName() == b.GetPodName() {
		t.Fatal("hai user vào chung một pod")
	}
	if b.GetUserId() != "userB" {
		t.Fatalf("session của B mang user_id=%q", b.GetUserId())
	}
}

// TestIdemNhaKhoaKhiClaimThatBai — giữ khoá lại nghĩa là user kẹt 10 phút với
// một session không bao giờ được tạo.
func TestIdemNhaKhoaKhiClaimThatBai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.pool.err = errors.New("cluster đang bảo trì")

	if _, err := h.svc.Create(ctx, createReq("u1", "k1")); err == nil {
		t.Fatal("cần lỗi khi pool không provision được")
	}

	idemKey, err := rediskeys.Idem("u1", "k1")
	if err != nil {
		t.Fatalf("rediskeys.Idem: %v", err)
	}
	if n, _ := h.rdb.Exists(ctx, idemKey).Result(); n != 0 {
		t.Fatal("khoá idempotency vẫn còn sau khi claim thất bại — retry của user sẽ đâm vào một session không tồn tại")
	}

	// Và retry sau đó thành công bình thường.
	h.pool.err = nil
	h.seedWarmPod(t, "sandbox-warm01")
	if _, err := h.svc.Create(ctx, createReq("u1", "k1")); err != nil {
		t.Fatalf("retry sau khi nhả khoá: %v", err)
	}
}

// TestIdemTroToiSessionDaKetThuc — khoá còn nhưng session đã bị reap.
//
// KHÔNG được lặng lẽ tạo session mới ở đây: hai lời gọi đồng thời rơi vào nhánh
// này sẽ cùng tạo, tức hai pod cho một ý định — đúng thứ khoá này tồn tại để chặn.
func TestIdemTroToiSessionDaKetThuc(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	sessionKey, err := rediskeys.Session(sess.GetId())
	if err != nil {
		t.Fatalf("rediskeys.Session: %v", err)
	}
	if err := h.rdb.Del(ctx, sessionKey).Err(); err != nil {
		t.Fatalf("DEL: %v", err)
	}

	_, err = h.svc.Create(ctx, createReq("u1", "k1"))
	wantCode(t, err, codes.FailedPrecondition)
}

// ------------------------------------------------- mất reply sau khi đã ghi

// lostReplyHook để script chạy TRỌN VẸN trên server rồi mới nuốt reply.
//
// Đây là mô phỏng trung thực của ca hỏng mà B3 mô tả: timeout TCP xảy ra SAU
// khi Redis đã thực thi xong. Mọi cách giả lập khác (trả lỗi trước khi gửi, đóng
// client) đều mô phỏng ca DỄ, tức ca mà code vốn đã xử lý đúng.
type lostReplyHook struct {
	mu sync.Mutex
	// armFor liệt kê tên lệnh sẽ bị nuốt reply, mỗi tên đúng MỘT lần.
	armFor map[string]bool
	fired  int
}

func newLostReplyHook(cmds ...string) *lostReplyHook {
	h := &lostReplyHook{armFor: map[string]bool{}}
	for _, c := range cmds {
		h.armFor[c] = true
	}
	return h
}

func (h *lostReplyHook) firedCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.fired
}

func (h *lostReplyHook) DialHook(next redis.DialHook) redis.DialHook { return next }

func (h *lostReplyHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		err := next(ctx, cmd)

		h.mu.Lock()
		defer h.mu.Unlock()
		name := cmd.Name()
		// evalsha và eval là cùng một ý định (go-redis tự fallback), gộp lại.
		if name == "eval" {
			name = "evalsha"
		}
		if !h.armFor[name] {
			return err
		}
		h.armFor[name] = false
		h.fired++
		lost := errors.New("mô phỏng: mất reply sau khi lệnh đã chạy trọn")
		cmd.SetErr(lost)
		return lost
	}
}

func (h *lostReplyHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return next
}

// TestMatReplySauKhiClaimDaGhiKhongTaoPodThuHai (C-1 + C-2).
//
// ⛔ ĐÂY LÀ CA HỎNG TỐN KÉM NHẤT CỦA B3, VÀ NÓ HOÀN TOÀN IM LẶNG.
// `claim.lua` chạy trọn vẹn trên server, reply mất ở tầng mạng. Nếu tầng trên
// coi đó là thất bại và NHẢ khoá idempotency, thì retry hợp lệ của user (cùng
// idempotency_key, đúng contract) sẽ sinh sessionID MỚI và claim POD THỨ HAI —
// còn pod thứ nhất rò tới hết TTL, và vì hash `session:{id}` của nó TỒN TẠI nên
// heuristic "pod mồ côi" của reaper (B7) không bao giờ thấy. Mỗi lần là −1 trên
// trần 4 pod (D16).
func TestMatReplySauKhiClaimDaGhiKhongTaoPodThuHai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	hook := newLostReplyHook("evalsha")
	h.rdb.AddHook(hook)

	// Lời gọi này PHỤC HỒI được: reply mất, nhưng nhánh đọc-lại của
	// ClaimIdempotent thấy hash `session:{id}` đã có podName nên coi là thành
	// công. Đây chính là đường sống của cơ chế mà B3 mô tả.
	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create phải phục hồi được từ mất-reply, nhận: %v", err)
	}
	if hook.firedCount() != 1 {
		t.Fatalf("hook bắn %d lần, cần 1 — mô phỏng không trúng lệnh EVALSHA", hook.firedCount())
	}
	if sess.GetPodName() == "" {
		t.Fatal("session trả về không có pod")
	}

	assertMotSessionMotPod(ctx, t, h, 1)

	// Retry đúng contract vẫn phải trả CHÍNH session đó, không tạo thêm gì.
	replayed, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("retry cùng idempotency_key: %v", err)
	}
	if replayed.GetId() != sess.GetId() || replayed.GetPodName() != sess.GetPodName() {
		t.Fatalf("retry trả session khác: %q/%q vs %q/%q",
			replayed.GetId(), replayed.GetPodName(), sess.GetId(), sess.GetPodName())
	}
	assertMotSessionMotPod(ctx, t, h, 1)
}

// TestMatCaReplyLanDocLaiThiGIU KhoaIdempotency (C-1).
//
// ⛔ ĐÂY LÀ CA HỎNG TỐN KÉM NHẤT CỦA B3, VÀ NÓ HOÀN TOÀN IM LẶNG.
// Reply của `claim.lua` mất, VÀ lượt đọc-lại cũng hỏng ⇒ ta KHÔNG loại trừ được
// việc Redis đã ghi. Nếu tầng trên coi đó là thất bại sạch và NHẢ khoá
// idempotency, thì retry hợp lệ của user (cùng key, đúng contract) sinh
// sessionID MỚI và claim POD THỨ HAI — còn pod thứ nhất rò tới hết TTL, và vì
// hash `session:{id}` của nó TỒN TẠI nên heuristic "pod mồ côi" của reaper (B7)
// không bao giờ thấy. Mỗi lần là −1 trên trần 4 pod (D16).
func TestMatCaReplyLanDocLaiThiGiuKhoaIdempotency(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	// Nuốt reply của CẢ script LẪN lượt HMGET đọc-lại ngay sau nó.
	hook := newLostReplyHook("evalsha", "hmget")
	h.rdb.AddHook(hook)

	_, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err == nil {
		t.Fatal("cần lỗi: cả reply lẫn lượt đọc-lại đều bị nuốt")
	}
	if hook.firedCount() != 2 {
		t.Fatalf("hook bắn %d lần, cần 2 (evalsha + hmget)", hook.firedCount())
	}

	// Vế 1 — vế quan trọng nhất: khoá idempotency phải CÒN.
	idemKey, err := rediskeys.Idem("u1", "k1")
	if err != nil {
		t.Fatalf("rediskeys.Idem: %v", err)
	}
	if n, _ := h.rdb.Exists(ctx, idemKey).Result(); n != 1 {
		t.Fatal("khoá idempotency ĐÃ BỊ NHẢ dù không loại trừ được claim đã ghi — retry của user sẽ tạo POD THỨ HAI")
	}

	// Vế 2: đúng một pod bị tiêu, đúng một session tồn tại.
	assertMotSessionMotPod(ctx, t, h, 1)

	// Vế 3: retry đúng contract phải nhặt lại CHÍNH session đó, không tạo mới.
	replayed, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("retry cùng idempotency_key: %v — user bị khoá ra ngoài session của chính mình", err)
	}
	if replayed.GetPodName() == "" {
		t.Fatal("retry trả session không có pod")
	}
	assertMotSessionMotPod(ctx, t, h, 1)
	if provisions, _ := h.pool.counts(); provisions != 0 {
		t.Fatalf("provisions = %d, cần 0 — retry đã rẽ cold path", provisions)
	}
}

// assertMotSessionMotPod khẳng định đúng `wantConsumed` pod rời pool và đúng
// một hash session tồn tại.
func assertMotSessionMotPod(ctx context.Context, t *testing.T, h *harness, wantConsumed int64) {
	t.Helper()

	const seeded = 2
	if n, _ := h.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != seeded-wantConsumed {
		t.Fatalf("pool:free = %d, cần %d — số pod bị tiêu không khớp", n, seeded-wantConsumed)
	}

	keys, err := h.rdb.Keys(ctx, "session:*").Result()
	if err != nil {
		t.Fatalf("KEYS: %v", err)
	}
	var hashes []string
	for _, k := range keys {
		if !strings.HasSuffix(k, ":pod") && !strings.HasSuffix(k, ":ws") {
			hashes = append(hashes, k)
		}
	}
	if int64(len(hashes)) != wantConsumed {
		t.Fatalf("có %d hash session:*, cần %d — %v", len(hashes), wantConsumed, hashes)
	}
}

// TestHaiCreateDongThoiCungKeyKhongNhanThongBaoSai (H-1).
//
// Lời gọi thua KHÔNG được nhận "session đã kết thúc; dùng idempotency_key mới":
// đó là khẳng định SAI SỰ THẬT, và làm theo nó chính là tạo pod thứ hai. Đây là
// ca double-click nút Start — không phải ca hiếm.
func TestHaiCreateDongThoiCungKeyKhongNhanThongBaoSai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	// Dựng đúng trạng thái giữa chừng: khoá ở pha pending, session CHƯA có.
	idemKey, err := rediskeys.Idem("u1", "k1")
	if err != nil {
		t.Fatalf("rediskeys.Idem: %v", err)
	}
	if err := h.rdb.Set(ctx, idemKey,
		idemPendingPrefix+"phiendangtaodangchay", idemTTL).Err(); err != nil {
		t.Fatalf("SET pending: %v", err)
	}

	_, err = h.svc.Create(ctx, createReq("u1", "k1"))
	if got := status.Code(err); got != codes.Unavailable {
		t.Fatalf("code = %v (%v), cần Unavailable — FailedPrecondition sẽ bảo client đổi key và tạo pod thứ hai", got, err)
	}
	msg := status.Convert(err).Message()
	if strings.Contains(msg, "đã kết thúc") || strings.Contains(msg, "key mới") {
		t.Fatalf("thông báo %q chỉ đạo client PHÁ dedupe — nó phải nói thử lại với CÙNG key", msg)
	}
	if !strings.Contains(msg, "CÙNG key") {
		t.Fatalf("thông báo %q không nói rõ phải giữ nguyên key", msg)
	}

	// Không pod nào bị tiêu ở nhánh này.
	if n, _ := h.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 2 {
		t.Fatalf("pool:free = %d, cần 2", n)
	}
}

// TestThamSoClaimHongTraInvalidArgument (M-4).
//
// Gộp lỗi đầu vào vào Unavailable làm retry policy của gRPC thử lại vĩnh viễn
// một request không bao giờ thành công, và dashboard đọc nó như sự cố hạ tầng.
func TestThamSoClaimHongTraInvalidArgument(t *testing.T) {
	h := newHarness(t)
	h.seedWarmPod(t, "sandbox-warm01")

	// Namespace chứa `:` — không qua nổi cổng của rediskeys, và đây là lỗi CẤU
	// HÌNH của server, không phải hạ tầng tạm hỏng.
	h.svc.cfg.Namespace = "dlp:sandbox"

	_, err := h.svc.Create(context.Background(), createReq("u1", "k1"))
	wantCode(t, err, codes.InvalidArgument)
}

// ---------------------------------------------------------------- cold path

func TestPoolRongThiReColdPath(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if sess.GetPodName() == "" {
		t.Fatal("cold path không gắn được pod")
	}
	if provisions, _ := h.pool.counts(); provisions != 1 {
		t.Fatalf("provisions = %d, cần đúng 1", provisions)
	}
	if got := testutil.ToFloat64(h.met.ColdPathTotal); got != 1 {
		t.Fatalf("dlp_cold_path_total = %v, cần 1 — không có metric này thì pool hụt là chuyện vô hình", got)
	}
}

// TestColdPathBiCuopPodThiThuLai — pod vừa tạo đi qua pool:free nên một request
// đồng thời có thể cướp trước.
func TestColdPathBiCuopPodThiThuLai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()

	stolen := false
	h.pool.steal = func() {
		if stolen {
			return
		}
		stolen = true
		// Người khác claim mất pod vừa được công bố.
		h.rdb.LPop(ctx, rediskeys.PoolFree)
	}

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if sess.GetPodName() == "" {
		t.Fatal("không gắn được pod sau khi thử lại")
	}
	if provisions, _ := h.pool.counts(); provisions != 2 {
		t.Fatalf("provisions = %d, cần 2 (một pod bị cướp, một pod giữ được)", provisions)
	}
}

// TestChamQuotaTraResourceExhausted — người dùng phải nhận "hết chỗ, thử lại
// sau", không phải "lỗi hệ thống".
func TestChamQuotaTraResourceExhausted(t *testing.T) {
	h := newHarness(t)
	h.pool.err = pool.ErrPoolQuotaBlocked

	_, err := h.svc.Create(context.Background(), createReq("u1", "k1"))
	wantCode(t, err, codes.ResourceExhausted)
}

// TestExpiresAtChuaClaimThiRongChuKhongPhai1970.
//
// proto ghi rõ expires_at "rỗng cho đến khi session được claim". Trả
// timestamp(0) thay vì nil nghĩa là FE nhận 1970 và hiển thị "phiên đã hết hạn
// 56 năm trước" — hoặc tệ hơn, một vòng reconnect không bao giờ dừng.
func TestExpiresAtChuaClaimThiRongChuKhongPhai1970(t *testing.T) {
	s := &Session{ID: "s1", UserID: "u1", Status: "PENDING", Tier: "SANDBOX_TIER_SYSBOX"}
	p := s.ToProto()
	if p.GetExpiresAt() != nil {
		t.Errorf("expires_at = %v, cần nil khi chưa claim", p.GetExpiresAt())
	}
	if p.GetCreatedAt() != nil {
		t.Errorf("created_at = %v, cần nil khi chưa có mốc", p.GetCreatedAt())
	}
	if p.GetStatus() != orchestratorv1.SessionStatus_SESSION_STATUS_PENDING {
		t.Errorf("status = %v — ánh xạ chuỗi NGẮN của Redis sang enum proto hỏng", p.GetStatus())
	}
}

// TestStatusGiuDangNganTrongRedis — bất đối xứng status(ngắn)/tier(đầy đủ) là
// CONTRACT: docs/ws-terminal-protocol.md bắt gateway kiểm
// `status ∈ {CLAIMED, RUNNING}` bằng đúng chuỗi ngắn đó. Đổi sang dạng đầy đủ
// làm authz của gateway so sánh trượt trong im lặng.
func TestStatusGiuDangNganTrongRedis(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	key, err := rediskeys.Session(sess.GetId())
	if err != nil {
		t.Fatalf("rediskeys.Session: %v", err)
	}
	raw, err := h.rdb.HGet(ctx, key, rediskeys.FieldStatus).Result()
	if err != nil {
		t.Fatalf("HGET status: %v", err)
	}
	if raw != "CLAIMED" {
		t.Fatalf("status trong Redis = %q, cần %q — gateway (G3) so sánh nguyên văn chuỗi này", raw, "CLAIMED")
	}
}

// TestRetryMatPhanHoiKhongTaoPodThuHai (B3 ⛔, AC "Retry mất phản hồi").
//
// Mô phỏng: lời gọi Redis timeout ở tầng mạng SAU KHI claim.lua đã chạy trọn.
// Caller tin là thất bại và retry với cùng sessionID; claim.lua chặn bằng
// `EXISTS session:{id}` và trả "session da ton tai". Coi đó là lỗi ⇒ rẽ
// cold-path ⇒ tạo POD THỨ HAI, trong khi pod thứ nhất đã claim cho chính session
// đó và rò VĨNH VIỄN (hash session tồn tại nên heuristic mồ côi của B7 không thấy).
func TestRetryMatPhanHoiKhongTaoPodThuHai(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	// Ép Create dùng một sessionID cố định để mô phỏng retry đúng cùng id.
	const fixedID = "sessioncodinhchotest"
	h.svc.newSessionID = func() (string, error) { return fixedID, nil }

	first, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create lần 1: %v", err)
	}

	// Xoá khoá idem để lần hai KHÔNG đi đường replay — buộc nó chạm đúng guard
	// `EXISTS session:{id}` bên trong claim.lua. Đây là điểm mấu chốt: đường
	// idempotency_key KHÔNG cứu ca này, vì nó dedupe ở NGOÀI Claim.
	idemKey, err := rediskeys.Idem("u1", "k1")
	if err != nil {
		t.Fatalf("rediskeys.Idem: %v", err)
	}
	if err := h.rdb.Del(ctx, idemKey).Err(); err != nil {
		t.Fatalf("DEL idem: %v", err)
	}

	second, err := h.svc.Create(ctx, createReq("u1", "k1"))
	if err != nil {
		t.Fatalf("Create lần 2 (retry mất phản hồi): %v", err)
	}

	if second.GetPodName() != first.GetPodName() {
		t.Fatalf("retry trả pod %q, cần %q — pod thứ nhất vừa rò vĩnh viễn",
			second.GetPodName(), first.GetPodName())
	}
	if n, _ := h.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("pool:free = %d, cần 1 — retry đã tiêu thêm một pod", n)
	}
	if provisions, _ := h.pool.counts(); provisions != 0 {
		t.Fatalf("provisions = %d, cần 0 — retry KHÔNG được rẽ cold path", provisions)
	}
	if got := testutil.ToFloat64(h.met.ColdPathTotal); got != 0 {
		t.Fatalf("dlp_cold_path_total = %v, cần 0", got)
	}
}

// ---------------------------------------------------------------- Get / Claim

// TestGetVoiUserSaiTraNotFoundChuKhongPhaiPermissionDenied (B4).
//
// PermissionDenied XÁC NHẬN session tồn tại, biến chính RPC này thành oracle dò
// id: quét id rồi tách "có thật" khỏi "không có" chỉ bằng mã lỗi.
func TestGetVoiUserSaiTraNotFoundChuKhongPhaiPermissionDenied(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01")

	sess, err := h.svc.Create(ctx, createReq("userA", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, errOther := h.svc.Get(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: sess.GetId(), UserId: "userB",
	})
	wantCode(t, errOther, codes.NotFound)

	_, errMissing := h.svc.Get(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: "khongtontai0000000000000000000000", UserId: "userB",
	})
	wantCode(t, errMissing, codes.NotFound)

	// Hai ca phải KHÔNG PHÂN BIỆT ĐƯỢC, kể cả ở câu chữ. Message khác nhau là
	// đúng cái oracle mà mã lỗi giống nhau vừa đóng lại.
	if status.Convert(errOther).Message() != status.Convert(errMissing).Message() {
		t.Fatalf("message khác nhau (%q vs %q) — kênh phụ để liệt kê session sống lại",
			status.Convert(errOther).Message(), status.Convert(errMissing).Message())
	}
}

func TestGetTraDungSessionCuaChinhMinh(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01")

	created, err := h.svc.Create(ctx, createReq("userA", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	got, err := h.svc.Get(ctx, &orchestratorv1.GetSessionRequest{
		SessionId: created.GetId(), UserId: "userA",
	})
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.GetPodName() != created.GetPodName() || got.GetRevision() != created.GetRevision() {
		t.Fatalf("Get trả %+v, khác với Create %+v", got, created)
	}
}

func TestGetThieuUserIDBiTuChoi(t *testing.T) {
	h := newHarness(t)
	_, err := h.svc.Get(context.Background(), &orchestratorv1.GetSessionRequest{SessionId: "x"})
	wantCode(t, err, codes.InvalidArgument)
}

// TestClaimLaDuongDocLaiIdempotent — CreateSession đã claim pod (xem sơ đồ
// luồng phase-1), nên ClaimSession không được mở đường tạo thứ hai.
func TestClaimLaDuongDocLaiIdempotent(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	h.seedWarmPod(t, "sandbox-warm01", "sandbox-warm02")

	created, err := h.svc.Create(ctx, createReq("userA", "k1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	for i := 0; i < 3; i++ {
		got, err := h.svc.Claim(ctx, &orchestratorv1.ClaimSessionRequest{
			SessionId: created.GetId(), UserId: "userA",
		})
		if err != nil {
			t.Fatalf("Claim lần %d: %v", i, err)
		}
		if got.GetPodName() != created.GetPodName() {
			t.Fatalf("Claim lần %d trả pod %q, cần %q", i, got.GetPodName(), created.GetPodName())
		}
	}
	if n, _ := h.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("pool:free = %d, cần 1 — ClaimSession đã tiêu thêm pod", n)
	}

	_, err = h.svc.Claim(ctx, &orchestratorv1.ClaimSessionRequest{
		SessionId: created.GetId(), UserId: "userB",
	})
	wantCode(t, err, codes.NotFound)
}
