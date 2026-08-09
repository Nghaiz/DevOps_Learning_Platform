package pool

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// ---------------------------------------------------------------- test doubles

// fakePods thay k8s.PodClient. Không dùng client-go/fake: nó kéo theo cả một
// scheme và làm test kể câu chuyện về client-go thay vì về logic của ta.
type fakePods struct {
	mu sync.Mutex

	created []string
	deleted []string

	// createErr trả cho MỌI lời gọi Create khi khác nil.
	createErr error
	// getsBeforeReady là số lần Get trả "chưa ready" trước khi pod Ready.
	getsBeforeReady int
	// terminalPhase khác rỗng ⇒ pod vào thẳng trạng thái đó, không bao giờ Ready.
	terminalPhase corev1.PodPhase

	gets map[string]int
}

func newFakePods() *fakePods { return &fakePods{gets: map[string]int{}} }

func (f *fakePods) Create(_ context.Context, pod *corev1.Pod) (*corev1.Pod, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.createErr != nil {
		return nil, fmt.Errorf("k8s: tạo pod %q: %w", pod.Name, f.createErr)
	}
	f.created = append(f.created, pod.Name)
	return pod, nil
}

func (f *fakePods) Get(_ context.Context, name string) (*corev1.Pod, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets[name]++

	pod := &corev1.Pod{}
	pod.Name = name
	if f.terminalPhase != "" {
		pod.Status.Phase = f.terminalPhase
		return pod, nil
	}
	pod.Status.Phase = corev1.PodRunning
	cond := corev1.ConditionFalse
	if f.gets[name] > f.getsBeforeReady {
		cond = corev1.ConditionTrue
	}
	pod.Status.Conditions = []corev1.PodCondition{{Type: corev1.PodReady, Status: cond}}
	return pod, nil
}

func (f *fakePods) Delete(_ context.Context, name string, _ int64) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.deleted = append(f.deleted, name)
	return nil
}

func (f *fakePods) List(_ context.Context, _ string) ([]corev1.Pod, error) { return nil, nil }

func (f *fakePods) createdNames() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.created...)
}

func (f *fakePods) deletedNames() []string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), f.deleted...)
}

func newTestManager(t *testing.T, pods k8s.PodClient, target int) (*Manager, *metrics.Metrics) {
	t.Helper()
	met := metrics.New(prometheus.NewRegistry())
	rdb := newTestRedis(t)
	m := NewManager(rdb, pods, k8s.PodConfig{
		Namespace:        "dlp-sandbox",
		Image:            "registry.k8s.io/pause:3.10",
		RuntimeClassName: "sysbox-runc",
	}, target, slog.New(slog.NewJSONHandler(io.Discard, nil)), met)
	m.readyPoll = time.Millisecond
	m.readyTimeout = 2 * time.Second
	return m, met
}

func claimParams(sessionID string) ClaimParams {
	now := time.Now().Unix()
	return ClaimParams{
		SessionID:     sessionID,
		UserID:        "u1",
		Namespace:     "dlp-sandbox",
		Tier:          "SANDBOX_TIER_SYSBOX",
		NowUnix:       now,
		ExpiresAtUnix: now + 3600,
		TTLSeconds:    3600,
	}
}

// ---------------------------------------------------------------- thứ tự ghi

// TestPublishThuTuDungKhongBaoGioCachLyPodTot — vế KHẲNG ĐỊNH của luật thứ tự.
//
// publishHook chạy một Claim đúng vào khe GIỮA `HSET state=free` và
// `RPUSH pool:free`. Với thứ tự ĐÚNG, khe đó là vô hại: tên pod chưa vào list
// nên claim chỉ thấy pool rỗng và rẽ cold-path — không pod nào bị cách ly.
func TestPublishThuTuDungKhongBaoGioCachLyPodTot(t *testing.T) {
	pods := newFakePods()
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	var claimErr error
	m.publishHook = func(string) {
		_, claimErr = Claim(ctx, m.rdb, claimParams("sess-trong-khe"))
	}

	name, err := m.Provision(ctx)
	if err != nil {
		t.Fatalf("Provision: %v", err)
	}

	if !errors.Is(claimErr, ErrPoolEmpty) {
		t.Fatalf("claim trong khe trả %v, cần ErrPoolEmpty (pod chưa được công bố)", claimErr)
	}
	if n, _ := m.rdb.LLen(ctx, rediskeys.PoolQuarantine).Result(); n != 0 {
		t.Fatalf("pool:quarantine có %d mục — thứ tự ĐÚNG không được cách ly pod nào", n)
	}
	if n, _ := m.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("pool:free có %d mục, cần 1", n)
	}

	// Và pod đó claim được bình thường sau khi publish xong.
	got, err := Claim(ctx, m.rdb, claimParams("sess-sau-khi-cong-bo"))
	if err != nil {
		t.Fatalf("claim sau publish: %v", err)
	}
	if got != name {
		t.Fatalf("claim trả %q, cần %q", got, name)
	}
}

// TestThuTuDaoNguocCachLyPodHoanToanTot — vế PHỦ ĐỊNH: chứng minh cửa sổ có thật.
//
// ⛔ ĐÂY LÀ CA CHỨNG MINH, KHÔNG PHẢI CA KIỂM SỰ VẮNG MẶT. Nó tái dựng đúng thứ
// tự SAI (`RPUSH` trước `HSET state=free`) và cho thấy hậu quả: một pod hoàn
// toàn tốt bị đẩy sang `pool:quarantine`, nơi nó KHÔNG BAO GIỜ quay lại. Mỗi
// lần như vậy là −1 trên trần 4 pod (D16); ba lần là nền tảng chết mà không lỗi
// nào nói vì sao.
//
// Nếu một ngày ai đó "dọn dẹp" publish() và đảo hai lệnh, test kia
// (TestPublishThuTuDungKhongBaoGioCachLyPodTot) sẽ đỏ. Test này giữ cho lý do
// vì sao nó đỏ không bị quên.
func TestThuTuDaoNguocCachLyPodHoanToanTot(t *testing.T) {
	pods := newFakePods()
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	const podName = "sandbox-deadbeef01"
	podKey, err := rediskeys.Pod(podName)
	if err != nil {
		t.Fatalf("rediskeys.Pod: %v", err)
	}

	// Thứ tự SAI, bước 1: tên pod vào list trước.
	if err := m.rdb.RPush(ctx, rediskeys.PoolFree, podName).Err(); err != nil {
		t.Fatalf("RPUSH: %v", err)
	}

	// Một claim rơi trúng khe: hash chưa có state.
	_, claimErr := Claim(ctx, m.rdb, claimParams("sess-nan-nhan"))
	if !errors.Is(claimErr, ErrPoolEmpty) {
		t.Fatalf("claim trong khe trả %v, cần ErrPoolEmpty (pod duy nhất đã bị cách ly nên pool coi như rỗng)", claimErr)
	}

	// Thứ tự SAI, bước 2: giờ mới ghi state — QUÁ MUỘN.
	if err := m.rdb.HSet(ctx, podKey, fieldPodState, StateFree).Err(); err != nil {
		t.Fatalf("HSET: %v", err)
	}

	quarantined, err := m.rdb.LRange(ctx, rediskeys.PoolQuarantine, 0, -1).Result()
	if err != nil {
		t.Fatalf("LRANGE quarantine: %v", err)
	}
	if len(quarantined) != 1 || quarantined[0] != podName {
		t.Fatalf("pool:quarantine = %v, cần đúng [%s] — nếu ca này KHÔNG cách ly thì luật thứ tự ở publish() đã mất lý do tồn tại",
			quarantined, podName)
	}

	// Và nó không bao giờ quay lại: pod tốt, state=free, nhưng vô hình với claim.
	if n, _ := m.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 0 {
		t.Fatalf("pool:free còn %d mục — pod bị cách ly không được tự quay lại", n)
	}
	if _, err := Claim(ctx, m.rdb, claimParams("sess-sau-do")); !errors.Is(err, ErrPoolEmpty) {
		t.Fatalf("claim sau đó trả %v, cần ErrPoolEmpty — pod đã mất vĩnh viễn khỏi pool", err)
	}
}

// TestPublishRPushGiuFIFO — claim.lua LMOVE từ đầu TRÁI, nên publish phải RPUSH
// (đầu phải) để pod cũ nhất ra trước và pod hỏng lộ sớm (D6).
func TestPublishRPushGiuFIFO(t *testing.T) {
	pods := newFakePods()
	m, _ := newTestManager(t, pods, 3)
	ctx := context.Background()

	var order []string
	for i := 0; i < 3; i++ {
		name, err := m.Provision(ctx)
		if err != nil {
			t.Fatalf("Provision %d: %v", i, err)
		}
		order = append(order, name)
	}

	for i, want := range order {
		got, err := Claim(ctx, m.rdb, claimParams(fmt.Sprintf("sess-%d", i)))
		if err != nil {
			t.Fatalf("claim %d: %v", i, err)
		}
		if got != want {
			t.Fatalf("claim thứ %d trả %q, cần %q — FIFO vỡ, pod hỏng sẽ nằm im hàng giờ", i, got, want)
		}
	}
}

// ---------------------------------------------------------------- quota

// TestQuotaChanKhongPhaiLoiHeThong.
//
// Với trần hiệu lực 4 pod (D16), chạm quota là trạng thái vận hành BÌNH THƯỜNG
// lúc đông người. Đếm nó vào replenish_failures nghĩa là cảnh báo kêu đúng lúc
// nền tảng chạy đúng công suất — và tín hiệu đó khi ấy không phân biệt được với
// một sự cố thật.
func TestQuotaChanKhongPhaiLoiHeThong(t *testing.T) {
	pods := newFakePods()
	pods.createErr = apierrors.NewForbidden(
		schema.GroupResource{Resource: "pods"}, "sandbox-x",
		errors.New("exceeded quota: dlp-sandbox-quota, requested: requests.cpu=500m, limited: requests.cpu=2100m"),
	)
	m, met := newTestManager(t, pods, 1)

	_, err := m.Provision(context.Background())
	if !errors.Is(err, ErrPoolQuotaBlocked) {
		t.Fatalf("Provision trả %v, cần ErrPoolQuotaBlocked", err)
	}
	if got := testutil.ToFloat64(met.ReplenishQuotaBlockedTotal); got != 1 {
		t.Errorf("dlp_pool_replenish_quota_blocked_total = %v, cần 1", got)
	}
	if got := testutil.ToFloat64(met.ReplenishFailuresTotal); got != 0 {
		t.Errorf("dlp_pool_replenish_failures_total = %v, cần 0 — chạm quota KHÔNG phải lỗi", got)
	}
}

// TestVAPRejectGiuNguyenVanMessage — message của ValidatingAdmissionPolicy nêu
// đúng validation CEL nào trượt. Đó là thông tin DUY NHẤT chỉ về nguyên nhân;
// nuốt nó thành "tạo pod thất bại" là biến một lỗi tự-giải-thích thành một cuộc
// điều tra.
func TestVAPRejectGiuNguyenVanMessage(t *testing.T) {
	const celMsg = `Pod trong namespace sandbox BẮT BUỘC set spec.runtimeClassName = "sysbox-runc"`
	pods := newFakePods()
	pods.createErr = apierrors.NewForbidden(
		schema.GroupResource{Resource: "pods"}, "sandbox-x", errors.New(celMsg),
	)
	m, met := newTestManager(t, pods, 1)

	_, err := m.Provision(context.Background())
	if err == nil {
		t.Fatal("cần lỗi")
	}
	if errors.Is(err, ErrPoolQuotaBlocked) {
		t.Fatal("VAP reject bị nhận nhầm thành quota — nó sẽ không backoff và không ai điều tra")
	}
	if got := err.Error(); !strings.Contains(got, celMsg) {
		t.Fatalf("message CEL bị nuốt: %q", got)
	}
	if got := testutil.ToFloat64(met.ReplenishQuotaBlockedTotal); got != 0 {
		t.Errorf("quota_blocked = %v, cần 0", got)
	}
}

// ---------------------------------------------------------------- chờ ready

// TestPodKhongReadyThiBiXoaChuKhongRoQuota — mỗi pod bỏ lại là −1 trên trần 4.
func TestPodKhongReadyThiBiXoaChuKhongRoQuota(t *testing.T) {
	pods := newFakePods()
	pods.terminalPhase = corev1.PodFailed
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	if _, err := m.Provision(ctx); err == nil {
		t.Fatal("pod Failed phải làm Provision lỗi")
	}
	created, deleted := pods.createdNames(), pods.deletedNames()
	if len(created) != 1 || len(deleted) != 1 || created[0] != deleted[0] {
		t.Fatalf("tạo %v nhưng xoá %v — pod hỏng phải được dọn NGAY, không đợi sweep", created, deleted)
	}
	if n, _ := m.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 0 {
		t.Fatalf("pool:free có %d mục — pod chưa Ready không được vào pool", n)
	}
}

// TestPodChuaReadyKhongDuocVaoPool — Running mà chưa Ready là pod exec chưa được.
func TestPodChuaReadyKhongDuocVaoPool(t *testing.T) {
	pods := newFakePods()
	pods.getsBeforeReady = 3
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	name, err := m.Provision(ctx)
	if err != nil {
		t.Fatalf("Provision: %v", err)
	}
	if pods.gets[name] <= 3 {
		t.Fatalf("chỉ Get %d lần — manager đã công bố pod trước khi nó Ready", pods.gets[name])
	}
	if n, _ := m.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 1 {
		t.Fatalf("pool:free = %d, cần 1", n)
	}
}

// ---------------------------------------------------------------- replenish

// TestReplenishDuaPoolVeDungTarget.
func TestReplenishDuaPoolVeDungTarget(t *testing.T) {
	pods := newFakePods()
	m, met := newTestManager(t, pods, 3)
	ctx := context.Background()

	if err := m.replenishOnce(ctx); err != nil {
		t.Fatalf("replenishOnce: %v", err)
	}
	m.observeSizes(ctx)

	if n, _ := m.rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 3 {
		t.Fatalf("pool:free = %d, cần 3", n)
	}
	if got := testutil.ToFloat64(met.PoolFreeSize); got != 3 {
		t.Errorf("dlp_pool_free_size = %v, cần 3", got)
	}

	// Chạy lại KHÔNG được tạo thêm: pool đã đủ.
	before := len(pods.createdNames())
	if err := m.replenishOnce(ctx); err != nil {
		t.Fatalf("replenishOnce lần 2: %v", err)
	}
	if after := len(pods.createdNames()); after != before {
		t.Fatalf("tạo thêm %d pod dù pool đã đủ target", after-before)
	}
}

// TestNewManagerEpTargetVeItNhat1 — target 0 không phải "tắt warm-pool", nó là
// mọi session đi cold path, tức bỏ hẳn mục tiêu claim < 1s.
func TestNewManagerEpTargetVeItNhat1(t *testing.T) {
	met := metrics.New(prometheus.NewRegistry())
	log := slog.New(slog.NewJSONHandler(io.Discard, nil))
	for _, in := range []int{0, -5} {
		m := NewManager(nil, nil, k8s.PodConfig{}, in, log, met)
		if m.target != 1 {
			t.Errorf("NewManager(target=%d) → %d, cần 1", in, m.target)
		}
	}
}

// TestQuarantineGaugeDuocQuanSat — quarantine dài ra là tín hiệu DUY NHẤT cho
// biết có nguồn ghi sai vào pool:free. Gauge không được cập nhật thì tín hiệu đó
// không tồn tại.
func TestQuarantineGaugeDuocQuanSat(t *testing.T) {
	pods := newFakePods()
	m, met := newTestManager(t, pods, 1)
	ctx := context.Background()

	if err := m.rdb.RPush(ctx, rediskeys.PoolQuarantine, "sandbox-hong01", "sandbox-hong02").Err(); err != nil {
		t.Fatalf("RPUSH quarantine: %v", err)
	}
	m.observeSizes(ctx)

	if got := testutil.ToFloat64(met.PoolQuarantineSize); got != 2 {
		t.Fatalf("dlp_pool_quarantine_size = %v, cần 2", got)
	}
}
