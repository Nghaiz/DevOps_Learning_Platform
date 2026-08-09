package reaper

import (
	"context"
	"io"
	"log/slog"
	"net"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/redis/go-redis/v9"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// reaperTestDB — DB Redis riêng của package này.
//
// ⚠ `go test ./...` chạy các PACKAGE SONG SONG, và mọi package chạm Redis ở đây
// đều FLUSHDB. Dùng chung DB nghĩa là mỗi bên xoá dữ liệu bên kia giữa chừng, và
// triệu chứng KHÔNG trỏ về nguyên nhân — rất dễ bị đổ cho "test flaky".
//
// Phân bổ: pool=15, lifecycle=14, reaper=13. Package nào thêm sau lấy số MỚI.
const reaperTestDB = 13

var localHosts = map[string]bool{"127.0.0.1": true, "localhost": true, "::1": true, "[::1]": true}

func newTestRedis(t *testing.T) *redis.Client {
	t.Helper()
	url := os.Getenv("REDIS_URL")
	if url == "" {
		t.Skip("REDIS_URL trống — reaper chạy trên Redis THẬT. " +
			"docker compose up -d redis rồi đặt REDIS_URL. Skip, KHÔNG giả vờ xanh.")
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
		t.Fatalf("REDIS_URL trỏ host %q — test này FLUSHDB.", host)
	}
	opts.DB = reaperTestDB

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

// ---------------------------------------------------------------- doubles

type fakePods struct {
	mu      sync.Mutex
	pods    []corev1.Pod
	deleted []string
	listErr error
}

func (f *fakePods) Create(_ context.Context, pod *corev1.Pod) (*corev1.Pod, error) { return pod, nil }

func (f *fakePods) Get(_ context.Context, name string) (*corev1.Pod, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	for i := range f.pods {
		if f.pods[i].Name == name {
			return &f.pods[i], nil
		}
	}
	return nil, k8sNotFound(name)
}

func (f *fakePods) Delete(_ context.Context, name string, _ int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, name)
	for i := range f.pods {
		if f.pods[i].Name == name {
			f.pods = append(f.pods[:i], f.pods[i+1:]...)
			break
		}
	}
	return nil
}

func (f *fakePods) List(_ context.Context, _ string) ([]corev1.Pod, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.listErr != nil {
		return nil, f.listErr
	}
	return append([]corev1.Pod(nil), f.pods...), nil
}

func (f *fakePods) deletedNames() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.deleted...)
}

func (f *fakePods) addPod(name string, age time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p := corev1.Pod{}
	p.Name = name
	p.Labels = map[string]string{k8s.LabelApp: k8s.LabelAppValue}
	p.CreationTimestamp = metav1.NewTime(time.Now().Add(-age))
	f.pods = append(f.pods, p)
}

func k8sNotFound(name string) error { return &notFoundErr{name} }

type notFoundErr struct{ name string }

func (e *notFoundErr) Error() string { return "pods \"" + e.name + "\" not found" }

// fakeSessions ghi lại các lời gọi vào lifecycle.
type fakeSessions struct {
	mu        sync.Mutex
	reaped    []string
	failed    []string
	failedErr error
}

func (f *fakeSessions) ReapSystem(_ context.Context, sessionID, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reaped = append(f.reaped, sessionID)
	return nil
}

func (f *fakeSessions) MarkFailed(_ context.Context, sessionID, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failedErr != nil {
		return f.failedErr
	}
	f.failed = append(f.failed, sessionID)
	return nil
}

func (f *fakeSessions) failedIDs() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.failed...)
}

func newTestReaper(t *testing.T) (*Reaper, *fakePods, *fakeSessions, *redis.Client, *metrics.Metrics) {
	t.Helper()
	rdb := newTestRedis(t)
	pods := &fakePods{}
	sessions := &fakeSessions{}
	met := metrics.New(prometheus.NewRegistry())
	r := New(rdb, pods, sessions, reaperTestDB, time.Hour,
		slog.New(slog.NewJSONHandler(io.Discard, nil)), met)
	return r, pods, sessions, rdb, met
}

// seedSession dựng một session đang sống trỏ tới podName.
func seedSession(t *testing.T, rdb *redis.Client, id, podName, status string) {
	t.Helper()
	ctx := context.Background()
	key, err := rediskeys.Session(id)
	if err != nil {
		t.Fatalf("rediskeys.Session: %v", err)
	}
	if err := rdb.HSet(ctx, key,
		rediskeys.FieldUserID, "u1",
		rediskeys.FieldPodName, podName,
		rediskeys.FieldStatus, status,
	).Err(); err != nil {
		t.Fatalf("HSET: %v", err)
	}
}

func seedPodHash(t *testing.T, rdb *redis.Client, podName string) {
	t.Helper()
	key, err := rediskeys.Pod(podName)
	if err != nil {
		t.Fatalf("rediskeys.Pod: %v", err)
	}
	if err := rdb.HSet(context.Background(), key, "state", "claimed").Err(); err != nil {
		t.Fatalf("HSET pod: %v", err)
	}
}

// ---------------------------------------------------------------- tầng 2

// TestSweepKhongGietPodDangSinhRa — ⛔ CA HỎNG TỐN KÉM NHẤT CỦA TẦNG 2.
//
// `pool.Manager.Provision` tạo Pod TRƯỚC, chờ Ready (tới 2 phút), rồi mới
// `HSET pod:{name} state=free`. Suốt khoảng đó pod khớp CHÍNH XÁC định nghĩa
// "mồ côi" (có label app=sandbox, không có hash pod:{name}). Không có mốc tuổi
// thì sweep xoá đúng pod mà warm-pool đang chờ, warm-pool tạo lại, sweep lại
// xoá — vòng lặp đốt quota trong khi MỌI LOG đều nói "đã dọn pod mồ côi".
func TestSweepKhongGietPodDangSinhRa(t *testing.T) {
	r, pods, _, _, met := newTestReaper(t)
	ctx := context.Background()

	// Pod vừa tạo 10 giây trước, chưa kịp có hash — đúng trạng thái giữa
	// Create và publish của warm-pool.
	pods.addPod("sandbox-dangsinh01", 10*time.Second)

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("sweep đã XOÁ %v — đó là pod warm-pool đang chờ Ready, không phải pod mồ côi", got)
	}
	if got := testutil.ToFloat64(met.ReaperOrphanPodsTotal); got != 0 {
		t.Fatalf("dlp_reaper_orphan_pods_total = %v, cần 0", got)
	}
}

// TestSweepXoaPodMoCoiDuTuoi — vế đối xứng: quá orphanGrace thì phải dọn thật.
func TestSweepXoaPodMoCoiDuTuoi(t *testing.T) {
	r, pods, _, _, met := newTestReaper(t)
	ctx := context.Background()

	pods.addPod("sandbox-mocoi0001", orphanGrace+time.Minute)

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	got := pods.deletedNames()
	if len(got) != 1 || got[0] != "sandbox-mocoi0001" {
		t.Fatalf("xoá %v, cần [sandbox-mocoi0001] — pod không hash, không session, đang ăn quota", got)
	}
	if v := testutil.ToFloat64(met.ReaperOrphanPodsTotal); v != 1 {
		t.Fatalf("dlp_reaper_orphan_pods_total = %v, cần 1", v)
	}
}

// TestSweepKhongDungPodCoHash — pod đang phục vụ một session thì không phải mồ côi.
func TestSweepKhongDungPodCoHash(t *testing.T) {
	r, pods, _, rdb, _ := newTestReaper(t)
	ctx := context.Background()

	pods.addPod("sandbox-dangdung1", 2*orphanGrace)
	seedPodHash(t, rdb, "sandbox-dangdung1")

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("sweep xoá %v — pod có hash pod:{name} KHÔNG phải mồ côi", got)
	}
}

// TestSweepKhongDungPodTenLa — pod mang trùng label nhưng tên không do
// orchestrator sinh thì không được đụng: xoá pod của người khác là vượt quyền.
func TestSweepKhongDungPodTenLa(t *testing.T) {
	r, pods, _, _, _ := newTestReaper(t)

	pods.addPod("Pod_La.Khong-Hop-Le", 2*orphanGrace)

	if err := r.sweep(context.Background()); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("sweep xoá %v — tên không qua cổng rediskeys nghĩa là KHÔNG do orchestrator tạo", got)
	}
}

// TestSweepChuyenSessionMaSangFAILED (AC §Chức năng).
//
// "Xoá pod (key còn) → session chuyển FAILED."
func TestSweepChuyenSessionMaSangFAILED(t *testing.T) {
	r, _, sessions, rdb, met := newTestReaper(t)
	ctx := context.Background()

	// Session RUNNING trỏ tới một pod KHÔNG có trong cluster.
	seedSession(t, rdb, "sessionmatestcase01", "sandbox-daxoa001", "RUNNING")

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	got := sessions.failedIDs()
	if len(got) != 1 || got[0] != "sessionmatestcase01" {
		t.Fatalf("MarkFailed nhận %v, cần [sessionmatestcase01]", got)
	}
	if v := testutil.ToFloat64(met.ReaperGhostSessionsTotal); v != 1 {
		t.Fatalf("dlp_reaper_ghost_sessions_total = %v, cần 1", v)
	}
}

// TestSweepKhongDungSessionDaOTrangThaiCuoi.
//
// Đánh dấu lại một session REAPED/FAILED là ghi thừa VÀ tăng revision vô cớ —
// một gateway đang cầm revision đúng sẽ bỗng thấy lệch rồi tự đóng kết nối.
func TestSweepKhongDungSessionDaOTrangThaiCuoi(t *testing.T) {
	r, _, sessions, rdb, _ := newTestReaper(t)

	for i, st := range []string{"REAPED", "FAILED", "EXPIRED"} {
		seedSession(t, rdb, "sessioncuoi000000"+string(rune('a'+i)), "sandbox-khongco01", st)
	}

	if err := r.sweep(context.Background()); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if got := sessions.failedIDs(); len(got) != 0 {
		t.Fatalf("MarkFailed được gọi cho %v — chúng đã ở trạng thái cuối", got)
	}
}

// TestSweepBoQuaKeyPhuCuaSession — `session:{id}:pod` và `:ws` không phải hash
// session. Không lọc thì reaper sẽ coi chuỗi "{id}:pod" là một session id.
func TestSweepBoQuaKeyPhuCuaSession(t *testing.T) {
	r, _, sessions, rdb, _ := newTestReaper(t)
	ctx := context.Background()

	podPtr, err := rediskeys.SessionPod("sessioncokeyphu0001")
	if err != nil {
		t.Fatalf("rediskeys.SessionPod: %v", err)
	}
	if err := rdb.Set(ctx, podPtr, "sandbox-khongco01", time.Hour).Err(); err != nil {
		t.Fatalf("SET: %v", err)
	}

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if got := sessions.failedIDs(); len(got) != 0 {
		t.Fatalf("MarkFailed nhận %v — `:pod` không phải hash session", got)
	}
}

// ---------------------------------------------------------------- tầng 3

// TestDrainQuarantineDonCaPodLanHash (AC §Chức năng, B7 tầng 3).
//
// ⛔ KHÔNG TẦNG NÀO KHÁC CHẠM ĐƯỢC POD CÁCH LY: nó VẪN CÓ hash `pod:{name}` nên
// không phải "mồ côi", và không session nào trỏ tới nên không phải "session ma".
// Nó vẫn là Pod đang chạy và vẫn ăn quota — với trần 4 pod (D16), ba lần cách ly
// là nền tảng chết mà không lỗi nào nói vì sao.
func TestDrainQuarantineDonCaPodLanHash(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-cachly001"
	pods.addPod(name, time.Minute) // TRẺ — tầng 2 sẽ không đụng tới
	seedPodHash(t, rdb, name)      // CÓ hash — tầng 2 cũng không coi là mồ côi
	if err := rdb.RPush(ctx, rediskeys.PoolQuarantine, name).Err(); err != nil {
		t.Fatalf("RPUSH quarantine: %v", err)
	}

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if got := pods.deletedNames(); len(got) != 1 || got[0] != name {
		t.Fatalf("xoá %v, cần [%s]", got, name)
	}
	podKey, _ := rediskeys.Pod(name)
	if n, _ := rdb.Exists(ctx, podKey).Result(); n != 0 {
		t.Fatal("hash pod:{name} còn — không dọn thì lần sau nó lại trông như pod đang dùng")
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolQuarantine).Result(); n != 0 {
		t.Fatalf("pool:quarantine còn %d mục", n)
	}
	if v := testutil.ToFloat64(met.ReaperQuarantineReapedTotal); v != 1 {
		t.Fatalf("dlp_reaper_quarantine_reaped_total = %v, cần 1", v)
	}
}

// ---------------------------------------------------------------- tầng 1

// TestTang1DungConTroPodSongLauHon.
//
// Lúc event `expired` của `session:{id}` tới thì hash ĐÃ biến mất — không còn
// chỗ nào đọc được podName. Con trỏ `session:{id}:pod` sống lâu hơn chính là
// thứ trả lời "session vừa hết hạn đang ở pod nào". Đặt hai TTL bằng nhau là
// reaper mù, và triệu chứng là pod sống mãi mà không lỗi nào báo.
func TestTang1DungConTroPodSongLauHon(t *testing.T) {
	r, pods, _, rdb, _ := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-hethan001"
	pods.addPod(name, time.Minute)
	seedPodHash(t, rdb, name)

	podPtr, err := rediskeys.SessionPod("sessionhethan000001")
	if err != nil {
		t.Fatalf("rediskeys.SessionPod: %v", err)
	}
	if err := rdb.Set(ctx, podPtr, name, time.Hour).Err(); err != nil {
		t.Fatalf("SET con trỏ: %v", err)
	}

	// Hash session KHÔNG tồn tại — đúng trạng thái lúc event expired tới.
	r.handleExpiredKey(ctx, "session:sessionhethan000001")

	if got := pods.deletedNames(); len(got) != 1 || got[0] != name {
		t.Fatalf("xoá %v, cần [%s] — tầng 1 không đọc được podName từ con trỏ", got, name)
	}
	if n, _ := rdb.Exists(ctx, podPtr).Result(); n != 0 {
		t.Fatal("con trỏ pod còn lại sau khi dọn")
	}
}

// TestTang1BoQuaKeyKhongPhaiHashSession — `session:{id}:pod` hết hạn KHÔNG được
// kích hoạt một vòng dọn nữa (pod đã dọn rồi), và key khác thì không liên quan.
func TestTang1BoQuaKeyKhongPhaiHashSession(t *testing.T) {
	r, pods, _, _, _ := newTestReaper(t)
	ctx := context.Background()

	for _, key := range []string{
		"session:abc:pod",
		"session:abc:ws",
		"pod:sandbox-abc00001",
		"idem:u1:k1",
		"pool:free",
	} {
		r.handleExpiredKey(ctx, key)
	}

	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v — chỉ hash `session:{id}` mới kích hoạt tầng 1", got)
	}
}

// ---------------------------------------------------------------- vòng lặp

// TestSweepLoiThiDemVaKhongLamSapVongLap — sweep là ĐƯỜNG CHÍNH của reaper; nó
// hỏng âm thầm nghĩa là pod sống mãi và ăn hết quota.
func TestSweepLoiThiDemVaKhongLamSapVongLap(t *testing.T) {
	r, pods, _, _, met := newTestReaper(t)
	pods.listErr = k8sNotFound("liệt kê hỏng")

	r.sweepOnce(context.Background())

	if v := testutil.ToFloat64(met.ReaperSweepFailuresTotal); v != 1 {
		t.Fatalf("dlp_reaper_sweep_failures_total = %v, cần 1", v)
	}
}

// TestRunQuetNgayLucKhoiDong.
//
// Sau một lần deploy, mọi event hết hạn trong khoảng downtime đã MẤT (tầng 1
// không lưu event). Đợi hết một chu kỳ nữa là để pod chết nằm ăn quota lâu gấp
// đôi mà không lý do gì.
func TestRunQuetNgayLucKhoiDong(t *testing.T) {
	r, pods, _, _, _ := newTestReaper(t)
	pods.addPod("sandbox-tudeploy1", 2*orphanGrace)

	swept := make(chan struct{}, 1)
	r.onSweepDone = func() {
		select {
		case swept <- struct{}{}:
		default:
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	go func() { _ = r.Run(ctx) }()

	select {
	case <-swept:
	case <-ctx.Done():
		t.Fatal("Run không quét lần nào trong 5s — nó đang đợi hết chu kỳ đầu tiên")
	}

	if got := pods.deletedNames(); len(got) != 1 {
		t.Fatalf("xoá %v, cần đúng 1 pod ở vòng quét khởi động", got)
	}
}
