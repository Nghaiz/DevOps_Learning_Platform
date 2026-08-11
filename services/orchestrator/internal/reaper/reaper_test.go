package reaper

import (
	"context"
	"errors"
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
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/pool"
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
	// getErr ép Get trả lỗi KHÔNG-PHẢI-NotFound, để dựng ca "apiserver đang
	// lỗi" tách khỏi ca "pod đã biến mất". Hai ca đó đòi hai hành vi ngược nhau
	// ở tầng 4 và một double không phân biệt được chúng thì test không kiểm gì.
	getErr error
	// onGet chạy TRONG Get, trước khi trả về. Nó tồn tại để dựng đúng một cửa
	// sổ đua: "có ai đó rút tên khỏi pool:free giữa LRANGE và LREM của tầng 4".
	// Không có hook này thì luật LREM-trước-mới-được-xoá không có cách nào ĐỎ.
	onGet func(name string)
}

func (f *fakePods) Create(_ context.Context, pod *corev1.Pod) (*corev1.Pod, error) { return pod, nil }

func (f *fakePods) Get(_ context.Context, name string) (*corev1.Pod, error) {
	f.mu.Lock()
	hook, getErr := f.onGet, f.getErr
	var found *corev1.Pod
	for i := range f.pods {
		if f.pods[i].Name == name {
			found = &f.pods[i]
			break
		}
	}
	f.mu.Unlock()

	// Ngoài lock: hook mô phỏng một tác nhân KHÁC (claim đồng thời) chạm Redis
	// trong lúc reaper đang đọc apiserver. Giữ lock qua nó là tự tạo thứ tự mà
	// production không có.
	if hook != nil {
		hook(name)
	}
	if getErr != nil {
		return nil, getErr
	}
	if found == nil {
		return nil, k8sNotFound(name)
	}
	return found, nil
}

func (f *fakePods) Delete(_ context.Context, name string, _ int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, name)
	for i := range f.pods {
		if f.pods[i].Name == name {
			// ⛔ Pod ĐÃ có DeletionTimestamp thì Delete là NO-OP và pod VẪN nằm
			// trong List — đúng hành vi API server thật khi finalizer/kubelet
			// chưa dọn xong. Bản trước gỡ pod khỏi slice vô điều kiện, tức test
			// double mặc định "xoá là biến mất tức thì"; chính giả định đó làm
			// M-6 không tái hiện được ở review PR #27 và bị hạ xuống "suy luận".
			// Pod thường (không có DeletionTimestamp) vẫn biến mất như cũ nên
			// mọi test hiện có không đổi hành vi.
			if f.pods[i].DeletionTimestamp != nil {
				return nil
			}
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

// addPodWithPhase thêm pod với một `status.phase` cụ thể — thứ `addPod` để
// trống. Tầng 4 quyết định dựa trên phase, nên không có hàm này thì mọi ca của
// nó chỉ chạm được nhánh "pod đã biến mất".
func (f *fakePods) addPodWithPhase(name string, age time.Duration, phase corev1.PodPhase) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p := corev1.Pod{}
	p.Name = name
	p.Labels = map[string]string{k8s.LabelApp: k8s.LabelAppValue}
	p.CreationTimestamp = metav1.NewTime(time.Now().Add(-age))
	p.Status.Phase = phase
	f.pods = append(f.pods, p)
}

// addTerminatingPod thêm pod ĐANG BỊ XOÁ: có DeletionTimestamp nhưng VẪN nằm
// trong List — trạng thái `Terminating` thật của Kubernetes khi finalizer hoặc
// kubelet chưa dọn xong.
//
// ⛔ ĐÂY LÀ THỨ TEST DOUBLE CŨ KHÔNG DỰNG ĐƯỢC, và đó là lý do M-6 đi qua review
// PR #27 dưới dạng "suy luận, không tái hiện được": `fakePods.Delete` gỡ pod
// khỏi slice NGAY, nên sau một lượt xoá thì List không còn thấy pod nữa và vòng
// sweep thứ hai không có gì để đếm lại. Test double che mất chính chế độ hỏng.
// Hàm này dựng thẳng trạng thái đó thay vì đi qua Delete.
func (f *fakePods) addTerminatingPod(name string, age time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	p := corev1.Pod{}
	p.Name = name
	p.Labels = map[string]string{k8s.LabelApp: k8s.LabelAppValue}
	p.CreationTimestamp = metav1.NewTime(time.Now().Add(-age))
	now := metav1.Now()
	p.DeletionTimestamp = &now
	f.pods = append(f.pods, p)
}

// k8sNotFound trả lỗi apierrors THẬT, không phải một kiểu tự chế.
//
// `k8s.IsNotFound` dùng `apierrors.IsNotFound`, thứ đọc `Status().Reason` chứ
// không đọc chuỗi. Một double trả lỗi tự chế sẽ khiến code sản phẩm rơi vào
// nhánh "không phân biệt được" — và test khi đó kiểm một đường KHÁC với đường
// chạy thật.
func k8sNotFound(name string) error {
	return apierrors.NewNotFound(schema.GroupResource{Resource: "pods"}, name)
}

// fakeSessions ghi lại các lời gọi vào lifecycle.
type fakeSessions struct {
	mu        sync.Mutex
	reaped    []string
	failed    []string
	failedErr error
}

func (f *fakeSessions) ReapExpired(_ context.Context, sessionID, _ string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reaped = append(f.reaped, sessionID)
	return nil
}

func (f *fakeSessions) reapedIDs() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.reaped...)
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

// TestSweepKhongDemLaiPodDangTerminating đóng M-6 của review PR #27.
//
// Pod kẹt `Terminating` vẫn hiện trong List và vẫn không có hash `pod:{name}`,
// nên nó khớp định nghĩa mồ côi ở MỌI vòng sweep. Trước bản vá, mỗi vòng cộng
// thêm 1 vào `dlp_reaper_orphan_pods_total` và gửi lại một lệnh Delete vô nghĩa.
// Hỏng thật nằm ở chỗ counter đó được dùng làm BÁO ĐỘNG ("> 0 kéo dài = có
// nguồn rò pod"): một pod kẹt biến nó thành chuông kêu không ngớt và mất khả
// năng chỉ ra pod mồ côi THỨ HAI — tức bản vá này bảo vệ ý nghĩa của một metric,
// không phải bảo vệ độ chính xác của một con số.
func TestSweepKhongDemLaiPodDangTerminating(t *testing.T) {
	r, pods, _, _, met := newTestReaper(t)
	ctx := context.Background()

	pods.addTerminatingPod("sandbox-terminat01", orphanGrace+time.Minute)

	for i := 1; i <= 3; i++ {
		if err := r.sweep(ctx); err != nil {
			t.Fatalf("sweep vòng %d: %v", i, err)
		}
	}

	if v := testutil.ToFloat64(met.ReaperOrphanPodsTotal); v != 0 {
		t.Fatalf("dlp_reaper_orphan_pods_total = %v sau 3 vòng, cần 0 — "+
			"pod đã có DeletionTimestamp thì lệnh xoá ĐÃ gửi rồi, đếm lại là đếm trùng", v)
	}
	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("đã gửi Delete %v — pod đang Terminating không cần xoá lại, "+
			"lời gọi API đó không đổi được gì", got)
	}
	// Vế còn lại: nó KHÔNG được biến mất khỏi tầm quan sát. Gauge phải chỉ đúng
	// vào nó, nếu không thì bản vá này chỉ đổi "đếm trùng" thành "mù hoàn toàn".
	if v := testutil.ToFloat64(met.ReaperPodsTerminating); v != 1 {
		t.Fatalf("dlp_reaper_pods_terminating = %v, cần 1 — bỏ qua pod không có nghĩa là giấu nó", v)
	}
}

// TestSweepGaugeTerminatingVeZeroKhiPodBienMat — gauge phải HẠ khi pod dọn xong.
// Nếu nó chỉ tăng thì nó là counter đội lốt gauge, và "dương kéo dài = finalizer
// treo" trở thành báo động vĩnh viễn sau lần Terminating đầu tiên.
func TestSweepGaugeTerminatingVeZeroKhiPodBienMat(t *testing.T) {
	r, pods, _, _, met := newTestReaper(t)
	ctx := context.Background()

	pods.addTerminatingPod("sandbox-terminat02", orphanGrace+time.Minute)
	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep 1: %v", err)
	}
	if v := testutil.ToFloat64(met.ReaperPodsTerminating); v != 1 {
		t.Fatalf("gauge = %v sau vòng 1, cần 1", v)
	}

	pods.mu.Lock()
	pods.pods = nil
	pods.mu.Unlock()

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep 2: %v", err)
	}
	if v := testutil.ToFloat64(met.ReaperPodsTerminating); v != 0 {
		t.Fatalf("gauge = %v sau khi pod đã biến mất, cần 0", v)
	}
}

// TestOrphanGraceBaoTronReadyTimeout là CỔNG cho một ràng buộc liên package.
//
// `pool.Manager.Provision` tạo Pod rồi chờ Ready tới `pool.DefaultReadyTimeout`
// trước khi ghi `HSET pod:{name} state=free`. Trong toàn bộ khoảng đó pod khớp
// CHÍNH XÁC định nghĩa mồ côi. Nếu `orphanGrace` không bao trọn khoảng ấy, sweep
// xoá đúng pod mà warm-pool đang chờ → warm-pool tạo lại → sweep lại xoá: vòng
// lặp đốt quota trong khi mọi log đều nói "đã dọn pod mồ côi".
//
// Hai hằng nằm ở HAI package khác nhau và trước bản này không gì buộc chúng đi
// cùng nhau — `missingProof` của review PR #27. Test này là sợi dây đó: ai nâng
// readyTimeout mà quên orphanGrace sẽ thấy ĐỎ ở đây thay vì thấy pod bốc hơi
// trên cluster.
func TestOrphanGraceBaoTronReadyTimeout(t *testing.T) {
	const bien = 2 * time.Minute

	if orphanGrace < pool.DefaultReadyTimeout+bien {
		t.Fatalf("orphanGrace=%v KHÔNG bao trọn pool.DefaultReadyTimeout=%v + biên %v. "+
			"Sweep sẽ xoá pod mà warm-pool đang chờ Ready. Nâng orphanGrace, "+
			"đừng hạ biên.", orphanGrace, pool.DefaultReadyTimeout, bien)
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
	r, pods, sessions, rdb, _ := newTestReaper(t)
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

	// Tầng 1 UỶ QUYỀN cho lifecycle.ReapExpired (nó ghi dòng audit `expired`
	// rồi mới xoá pod) chứ không tự dọn — mọi bất biến ở MỘT hiện thực.
	if got := sessions.reapedIDs(); len(got) != 1 || got[0] != "sessionhethan000001" {
		t.Fatalf("ReapExpired nhận %v, cần [sessionhethan000001] — tầng 1 không đọc được podName từ con trỏ", got)
	}
	if n, _ := rdb.Exists(ctx, podPtr).Result(); n != 0 {
		t.Fatal("con trỏ pod còn lại sau khi dọn")
	}
	_ = pods
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

// seedClaimedPod dựng đúng trạng thái mà `claim.lua` để lại sau một lần claim.
func seedClaimedPod(t *testing.T, rdb *redis.Client, podName, sessionID string) {
	t.Helper()
	ctx := context.Background()
	key, err := rediskeys.Pod(podName)
	if err != nil {
		t.Fatalf("rediskeys.Pod: %v", err)
	}
	if err := rdb.HSet(ctx, key,
		"state", "claimed", "sessionId", sessionID,
		"userId", "u1", "tier", "SANDBOX_TIER_SYSBOX",
	).Err(); err != nil {
		t.Fatalf("HSET pod: %v", err)
	}
	if err := rdb.RPush(ctx, rediskeys.PoolClaimed, podName).Err(); err != nil {
		t.Fatalf("RPUSH claimed: %v", err)
	}
}

// TestTang2cDonPodClaimedMaSessionKhongCon — ⛔ ĐIỂM MÙ THỨ TƯ.
//
// Khi tầng 1 LỠ event (reaper offline lúc `helm upgrade`, crash, rớt pub/sub),
// session hết hạn để lại: hash `pod:{name}` state=claimed **TTL = -1**, tên nằm
// trong `pool:claimed`, Pod vẫn chạy và vẫn ăn quota. Ba tầng kia đều bỏ qua —
// hash TỒN TẠI nên không phải "mồ côi", không còn `session:*` để SCAN thấy,
// không nằm trong quarantine. Và `pool:claimed` trước bản này KHÔNG CÓ NHÁNH
// NÀO ĐỌC. Mỗi lần rollout là −1 VĨNH VIỄN trên trần 4 pod (D16).
func TestTang2cDonPodClaimedMaSessionKhongCon(t *testing.T) {
	r, pods, sessions, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-leak0001"
	// Pod TRẺ (tầng 2a bỏ qua vì chưa tới orphanGrace) và CÓ hash (tầng 2a cũng
	// bỏ qua vì không phải mồ côi). Session thì không tồn tại.
	pods.addPod(name, time.Minute)
	seedClaimedPod(t, rdb, name, "sessiondahethan00001")

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	// Tầng 2c UỶ QUYỀN cho lifecycle.ReapExpired — nó ghi dòng audit `expired`
	// (đọc userId/tier từ hash pod, thứ duy nhất còn sót) rồi mới xoá pod và
	// index. Reaper tự `DEL` ở đây là dựng đường ghi thứ hai.
	if got := sessions.reapedIDs(); len(got) != 1 || got[0] != "sessiondahethan00001" {
		t.Fatalf("ReapExpired nhận %v, cần [sessiondahethan00001] — pod này rò VĨNH VIỄN nếu tầng 2c không thấy nó", got)
	}
	_ = pods
	if v := testutil.ToFloat64(met.ReaperClaimedOrphanTotal); v != 1 {
		t.Fatalf("dlp_reaper_claimed_orphan_total = %v, cần 1", v)
	}
}

// TestTang2cKhongDungPodCoSessionConSong — vế đối xứng.
func TestTang2cKhongDungPodCoSessionConSong(t *testing.T) {
	r, pods, sessions, rdb, _ := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-dangdung2"
	pods.addPod(name, time.Minute)
	seedClaimedPod(t, rdb, name, "sessioncondangsong01")
	seedSession(t, rdb, "sessioncondangsong01", name, "RUNNING")

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v — session vẫn còn, pod đang phục vụ nó", got)
	}
	if got := sessions.reapedIDs(); len(got) != 0 {
		t.Fatalf("ReapExpired nhận %v — không được gọi cho session còn sống", got)
	}
}

// TestSweepKhongDanhDauFAILEDOanChoSessionVuaClaim (H-1).
//
// ⛔ ĐUA THẬT. `livePods` được chụp TRƯỚC vòng SCAN, nên một session được claim
// SAU mốc đó — trỏ tới pod cũng xuất hiện sau mốc đó (đúng đường cold path:
// Provision tạo pod rồi mới claim) — sẽ thấy `livePods[podName] == false`.
// Không xác minh lại thì nó bị đánh dấu FAILED OAN: pod vẫn chạy, session bị
// giết trong Redis, FE nhận FAILED, và không dấu vết nào giải thích.
func TestSweepKhongDanhDauFAILEDOanChoSessionVuaClaim(t *testing.T) {
	r, pods, sessions, rdb, _ := newTestReaper(t)
	ctx := context.Background()

	// Mô phỏng ảnh chụp CŨ: session + pod đều xuất hiện SAU khi List() đã chạy.
	// Ở đây ta dựng chúng trước, nhưng cố tình KHÔNG đưa pod vào ảnh chụp bằng
	// cách gọi thẳng sweepGhostSessions với một livePods rỗng.
	const name = "sandbox-vuaclaim1"
	pods.addPod(name, 10*time.Second)
	seedSession(t, rdb, "sessionvuaclaim00001", name, "RUNNING")

	if err := r.sweepGhostSessions(ctx, map[string]bool{}); err != nil {
		t.Fatalf("sweepGhostSessions: %v", err)
	}

	if got := sessions.failedIDs(); len(got) != 0 {
		t.Fatalf("session %v bị đánh dấu FAILED OAN — pod của nó VẪN CÓ trên cluster, "+
			"ảnh chụp livePods chỉ đơn giản là cũ", got)
	}
}

// ---------------------------------------------------------------- tầng 4

// seedFreePod dựng đúng trạng thái mà `pool.Manager.Provision` để lại cho một
// pod ấm: hash `pod:{name}` state=free TRƯỚC, rồi mới `RPUSH pool:free` (thứ tự
// là luật cứng của B2 — đảo lại là cách ly nhầm một pod hoàn toàn tốt).
func seedFreePod(t *testing.T, rdb *redis.Client, podName string) {
	t.Helper()
	ctx := context.Background()
	key, err := rediskeys.Pod(podName)
	if err != nil {
		t.Fatalf("rediskeys.Pod: %v", err)
	}
	if err := rdb.HSet(ctx, key, "state", "free").Err(); err != nil {
		t.Fatalf("HSET pod: %v", err)
	}
	if err := rdb.RPush(ctx, rediskeys.PoolFree, podName).Err(); err != nil {
		t.Fatalf("RPUSH free: %v", err)
	}
}

// TestTang4RutPodChetKhoiPoolFree — ⛔ ĐIỂM MÙ THỨ NĂM, ĐO ĐƯỢC TRÊN CỤM.
//
// Trạng thái quan sát 2026-08-11 sau một lần node reboot:
//
//	Redis:      pool:free = [sandbox-674a2a67af4a]   pod:{name}.state = free
//	Kubernetes: phase = Failed, exitCode 255
//
// `RestartPolicy: Never` + reboot ⇒ Failed vĩnh viễn; `claim.lua` chỉ hỏi Redis.
// Bốn tầng kia đều trượt (xem doc của sweepDeadFreePods). Với `POOL_TARGET=1`,
// sinh viên ĐẦU TIÊN bấm Start sau mỗi lần reboot nhận đúng pod này.
func TestTang4RutPodChetKhoiPoolFree(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-chetsaureboot"
	// Pod TRẺ và CÓ hash ⇒ tầng 2a bỏ qua ở cả hai điều kiện. Không session nào
	// trỏ tới ⇒ tầng 2b không thấy. Ở pool:free ⇒ tầng 2c và 3 không thấy.
	pods.addPodWithPhase(name, time.Minute, corev1.PodFailed)
	seedFreePod(t, rdb, name)

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if got := pods.deletedNames(); len(got) != 1 || got[0] != name {
		t.Fatalf("xoá %v, cần [%s] — pod chết còn nằm trong pool là pod SẼ ĐƯỢC PHÁT cho người tiếp theo", got, name)
	}
	if n, err := rdb.LLen(ctx, rediskeys.PoolFree).Result(); err != nil || n != 0 {
		t.Fatalf("LLEN pool:free = %v (err %v), cần 0", n, err)
	}
	podKey, _ := rediskeys.Pod(name)
	if n, err := rdb.Exists(ctx, podKey).Result(); err != nil || n != 0 {
		t.Fatalf("hash %s vẫn còn (exists=%v, err %v) — để lại là claim.lua vẫn thấy state=free", podKey, n, err)
	}
	if v := testutil.ToFloat64(met.ReaperDeadFreePodsTotal); v != 1 {
		t.Fatalf("dlp_reaper_dead_free_pods_total = %v, cần 1", v)
	}
}

// TestTang4KhongDungPodAmConSong — ĐỐI CHỨNG ÂM, và nó là ca quan trọng nhất.
//
// Tầng 4 chạy MỖI vòng sweep trên MỌI pod đang ấm. Một hiện thực xoá quá tay ở
// đây không làm test nào khác đỏ — nó chỉ làm warm-pool rỗng mãi mãi trong khi
// mọi log đều nói "đã rút pod chết". Không có ca này thì "tầng 4 xanh" chỉ chứng
// minh nó biết xoá, không chứng minh nó biết KHÔNG xoá.
func TestTang4KhongDungPodAmConSong(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-amkhoemanh"
	pods.addPodWithPhase(name, time.Minute, corev1.PodRunning)
	seedFreePod(t, rdb, name)

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v — pod đang Running trong pool:free là pod ấm BÌNH THƯỜNG", got)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("LLEN pool:free = %d, cần 1 — tầng 4 vừa rút mất một pod tốt", n)
	}
	if v := testutil.ToFloat64(met.ReaperDeadFreePodsTotal); v != 0 {
		t.Fatalf("dlp_reaper_dead_free_pods_total = %v, cần 0", v)
	}
}

// TestTang4DonTenPodDaBienMatKhoiApiserver — pod bị xoá khỏi cluster (GC của
// node, `kubectl delete` bằng tay) mà tên vẫn nằm trong pool.
//
// Không phải ca lý thuyết: đúng đường "rút tay" mà người vận hành đã phải làm
// ba lần khi đổi image (§Còn để ngỏ, warm-pool không rollout theo image) — nếu
// ai đó xoá Pod trước rồi quên LREM, pool quảng cáo một cái tên không tồn tại và
// claim thành công vào hư không.
func TestTang4DonTenPodDaBienMatKhoiApiserver(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-tenma000001"
	seedFreePod(t, rdb, name) // KHÔNG addPod ⇒ apiserver trả NotFound

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 0 {
		t.Fatalf("LLEN pool:free = %d, cần 0", n)
	}
	if v := testutil.ToFloat64(met.ReaperDeadFreePodsTotal); v != 1 {
		t.Fatalf("dlp_reaper_dead_free_pods_total = %v, cần 1", v)
	}
	_ = pods
}

// TestTang4KhongRutPodKhiApiserverLoi — "không phân biệt được" ≠ "đã chết".
//
// ⛔ Nếu tầng 4 gộp mọi lỗi Get thành "pod chết", thì một lượt apiserver chớp
// (timeout, 503 lúc rollout control-plane) sẽ rút SẠCH pool:free — đúng lúc hạ
// tầng đang yếu nhất. Với trần 4 pod (D16) đó là nền tảng tự đánh sập mình, và
// mọi log đều nói "đã rút pod chết".
func TestTang4KhongRutPodKhiApiserverLoi(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-apiserverloi"
	seedFreePod(t, rdb, name)
	pods.getErr = errors.New("etcdserver: request timed out")

	err := r.sweep(ctx)
	if err == nil {
		t.Fatal("sweep nuốt lỗi apiserver — lỗi im lặng ở tầng này là pool rỗng không ai giải thích được")
	}

	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v khi apiserver đang lỗi — không phân biệt được thì KHÔNG ĐOÁN", got)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("LLEN pool:free = %d, cần 1 — pod vẫn phải ở lại", n)
	}
	if v := testutil.ToFloat64(met.ReaperDeadFreePodsTotal); v != 0 {
		t.Fatalf("dlp_reaper_dead_free_pods_total = %v, cần 0", v)
	}
}

// TestTang4LREMLaPhepGianhQuyen — luật thứ tự, và ca DUY NHẤT làm nó đỏ được.
//
// ⛔ Cửa sổ đua thật: giữa `LRANGE pool:free` và lúc tầng 4 quyết định xoá, một
// `claim.lua` đồng thời có thể `LMOVE` pod sang `pool:claimed` và gắn session
// vào nó. Xoá pod lúc đó là giật pod khỏi chân một session VỪA SINH RA.
//
// `LREM` trả 0 chính là tín hiệu "tên này không còn là của ta". Bỏ guard
// `removed == 0` thì ca này ĐỎ — đó là toàn bộ lý do nó tồn tại. Hook onGet
// dựng đúng cửa sổ đó: nó rút tên khỏi pool:free trong lúc reaper đang hỏi
// apiserver.
func TestTang4LREMLaPhepGianhQuyen(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-duagiuachung"
	pods.addPodWithPhase(name, time.Minute, corev1.PodFailed)
	seedFreePod(t, rdb, name)

	// Một claim đồng thời thắng cuộc đua: LMOVE free → claimed.
	pods.onGet = func(got string) {
		if got != name {
			return
		}
		if err := rdb.LMove(ctx, rediskeys.PoolFree, rediskeys.PoolClaimed, "left", "right").Err(); err != nil {
			t.Errorf("LMOVE mô phỏng claim: %v", err)
		}
	}

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v — tên đã rời pool:free trước khi tầng 4 giành được quyền; "+
			"pod này giờ thuộc về một session vừa claim, và tầng 2b/2c mới là nơi xử lý nó", got)
	}
	if v := testutil.ToFloat64(met.ReaperDeadFreePodsTotal); v != 0 {
		t.Fatalf("dlp_reaper_dead_free_pods_total = %v, cần 0 — tầng 4 không sở hữu tên này", v)
	}
}

// TestTang4Idempotent — mọi nhánh reaper đều gọi lại được, tầng 4 không ngoại lệ.
func TestTang4Idempotent(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t)
	ctx := context.Background()

	const name = "sandbox-lapdilapla"
	pods.addPodWithPhase(name, time.Minute, corev1.PodSucceeded)
	seedFreePod(t, rdb, name)

	for i := 0; i < 3; i++ {
		if err := r.sweep(ctx); err != nil {
			t.Fatalf("sweep vòng %d: %v", i+1, err)
		}
	}
	if got := pods.deletedNames(); len(got) != 1 {
		t.Fatalf("xoá %v — ba vòng sweep phải chỉ xoá đúng một lần", got)
	}
	if v := testutil.ToFloat64(met.ReaperDeadFreePodsTotal); v != 1 {
		t.Fatalf("dlp_reaper_dead_free_pods_total = %v, cần 1 — counter cộng dồn mỗi vòng "+
			"biến báo động 'có nguồn giết pod ấm' thành tiếng ồn", v)
	}
}
