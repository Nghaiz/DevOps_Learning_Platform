package pool

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// Field của hash pod:{name}. `state` là thứ claim.lua đọc để quyết định nhận
// hay cách ly — tên field này là contract giữa Go và Lua, đổi một bên là cách
// ly 100% pod trong im lặng.
const (
	fieldPodState     = "state"
	fieldPodUpdatedAt = "updatedAt"

	// StateFree là giá trị DUY NHẤT mà claim.lua chấp nhận.
	StateFree = "free"
)

// Hằng nội bộ của vòng replenish. Cố ý KHÔNG phải env: chúng là nhịp làm việc
// của một goroutine, không phải chính sách vận hành. Mỗi env mới phải sửa đồng
// thời 3 nơi (code, .env.example, Helm) hoặc `make env-check` đỏ — cái giá đó
// chỉ đáng cho thứ ops thật sự cần xoay.
const (
	defaultTick         = 10 * time.Second
	defaultReadyTimeout = 2 * time.Minute
	defaultReadyPoll    = 250 * time.Millisecond

	// Tên đặt là min/maxBackoff chứ không phải backoffMin/backoffMax: revive
	// đọc hậu tố "Min" trên một time.Duration là đơn vị PHÚT, không phải
	// "minimum" — và nó đúng khi cảnh báo, vì người đọc cũng đọc nhầm y hệt.
	minBackoff = 1 * time.Second
	maxBackoff = 60 * time.Second

	// quotaLogEvery giới hạn log WARN khi chạm quota. Ở nhịp 10s, log mỗi vòng
	// nghĩa là 360 dòng/giờ nói đúng một chuyện trong lúc nền tảng đang chạy
	// bình thường ở công suất tối đa — đủ để chôn vùi lỗi thật.
	quotaLogEvery = 5 * time.Minute
)

// ErrPoolQuotaBlocked là sentinel cho "ResourceQuota chặn tạo pod".
//
// Nó KHÔNG phải lỗi hệ thống: với trần hiệu lực 4 pod (D16), chạm quota là
// trạng thái vận hành bình thường lúc đông người. Caller (cold path của B3)
// phải phân biệt nó với lỗi API để trả cho user một thông báo đúng
// ("hết chỗ, thử lại sau") thay vì "lỗi hệ thống".
var ErrPoolQuotaBlocked = errors.New("pool: ResourceQuota chặn tạo pod sandbox")

// Manager giữ `pool:free` ở mức POOL_TARGET.
//
// MỘT goroutine, tạo pod TUẦN TỰ. Với POOL_TARGET cỡ 1–3 (D16) thì song song
// không giúp gì, còn tuần tự cho một tính chất đáng giá: hai lời gọi Create
// không bao giờ cùng đâm vào quota, nên khi chạm trần ta biết chắc nó là trần
// thật chứ không phải hiệu ứng của chính mình.
type Manager struct {
	rdb    redis.UniversalClient
	pods   k8s.PodClient
	podCfg k8s.PodConfig
	target int
	log    *slog.Logger
	met    *metrics.Metrics

	tick         time.Duration
	readyTimeout time.Duration
	readyPoll    time.Duration

	// now cho phép test khoá thời gian ghi vào hash.
	now func() time.Time

	// publishHook chạy GIỮA `HSET state=free` và `RPUSH pool:free`.
	//
	// CHỈ test đặt. Nó tồn tại để mở cửa sổ đua một cách xác định và chứng minh
	// thứ tự ghi ở publish() là bắt buộc chứ không phải sở thích.
	publishHook func(podName string)

	trigger chan struct{}
}

// NewManager dựng warm-pool manager. target < 1 bị ép về 1: pool rỗng vĩnh viễn
// nghĩa là MỌI session đi cold path, tức là bỏ hẳn mục tiêu claim < 1s mà cả
// phase này tồn tại vì nó.
func NewManager(
	rdb redis.UniversalClient,
	pods k8s.PodClient,
	podCfg k8s.PodConfig,
	target int,
	log *slog.Logger,
	met *metrics.Metrics,
) *Manager {
	if target < 1 {
		target = 1
	}
	return &Manager{
		rdb:          rdb,
		pods:         pods,
		podCfg:       podCfg,
		target:       target,
		log:          log,
		met:          met,
		tick:         defaultTick,
		readyTimeout: defaultReadyTimeout,
		readyPoll:    defaultReadyPoll,
		now:          time.Now,
		trigger:      make(chan struct{}, 1),
	}
}

// Trigger thúc một vòng replenish ngay, không chờ tick.
//
// Non-blocking có chủ ý: channel buffer 1 nên N lời gọi liên tiếp gộp thành một
// vòng. Gọi từ đường claim (B3) — nếu nó chặn, một Redis chậm sẽ biến việc
// "báo cho pool" thành độ trễ trên chính đường nóng của người dùng.
func (m *Manager) Trigger() {
	select {
	case m.trigger <- struct{}{}:
	default:
	}
}

// Run chạy vòng replenish tới khi ctx đóng. Chỉ trả lỗi của chính ctx.
func (m *Manager) Run(ctx context.Context) error {
	ticker := time.NewTicker(m.tick)
	defer ticker.Stop()

	backoff := time.Duration(0)
	lastQuotaLog := time.Time{}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		err := m.replenishOnce(ctx)
		m.observeSizes(ctx)

		switch {
		case err == nil:
			backoff = 0

		case errors.Is(err, ErrPoolQuotaBlocked):
			// KHÔNG backoff. Quota là trần công suất, không phải sự cố: khi một
			// session kết thúc, chỗ trống xuất hiện ngay và ta muốn lấp nó ở
			// tick kế tiếp. Backoff cấp số nhân ở đây nghĩa là sau vài lần đông
			// người, pool nằm im hàng phút dù đã có chỗ.
			backoff = 0
			if now := m.now(); now.Sub(lastQuotaLog) >= quotaLogEvery {
				lastQuotaLog = now
				m.log.Warn("replenish bị ResourceQuota chặn — nền tảng đang chạy hết công suất, KHÔNG phải lỗi",
					slog.Int("pool_target", m.target),
					slog.String("namespace", m.podCfg.Namespace))
			}

		case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
			return ctx.Err()

		default:
			if backoff == 0 {
				backoff = minBackoff
			} else if backoff < maxBackoff {
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}
			}
			m.met.ReplenishFailuresTotal.Inc()
			// Nguyên văn err: message của VAP reject nêu đúng validation CEL
			// nào trượt, và đó là thông tin duy nhất chỉ về nguyên nhân.
			m.log.Error("replenish thất bại",
				slog.String("err", err.Error()),
				slog.Duration("backoff", backoff))
		}

		wait := m.tick
		if backoff > 0 {
			wait = backoff
		}
		timer := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		case <-m.trigger:
			timer.Stop()
		case <-ticker.C:
			timer.Stop()
		}
	}
}

// replenishOnce đưa pool:free về target, tạo tuần tự từng pod một.
func (m *Manager) replenishOnce(ctx context.Context) error {
	free, err := m.rdb.LLen(ctx, rediskeys.PoolFree).Result()
	if err != nil {
		return fmt.Errorf("pool: đọc LLEN %s: %w", rediskeys.PoolFree, err)
	}

	for created := int64(0); free+created < int64(m.target); created++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if _, err := m.Provision(ctx); err != nil {
			return err
		}
	}
	return nil
}

// Provision tạo MỘT pod, chờ nó Ready, rồi công bố vào pool:free. Trả tên pod.
//
// Cũng là đường COLD PATH của B3: pool rỗng thì gọi hàm này rồi Claim lại. Dùng
// chung một đường có chủ ý — hai đường "làm cho một pod dùng được" sẽ trôi khỏi
// nhau, và cái trôi đi trước tiên luôn là thứ tự ghi ở publish().
func (m *Manager) Provision(ctx context.Context) (string, error) {
	name, err := k8s.NewPodName()
	if err != nil {
		return "", err
	}
	pod, err := k8s.BuildSandboxPod(name, m.podCfg)
	if err != nil {
		return "", err
	}

	if _, err := m.pods.Create(ctx, pod); err != nil {
		if k8s.IsQuotaExceeded(err) {
			m.met.ReplenishQuotaBlockedTotal.Inc()
			// Hai %w: caller phân biệt được "chạm quota" (errors.Is với sentinel)
			// mà VẪN đọc được nguyên văn message từ API server bên trong.
			return "", fmt.Errorf("%w: %w", ErrPoolQuotaBlocked, err)
		}
		return "", err
	}

	if err := m.waitReady(ctx, name); err != nil {
		// Pod đã tồn tại trên cluster và đang ăn quota. Bỏ nó lại là rò đúng
		// một khe trong trần 4 (D16), và nó sẽ không có hash pod:{name} nên
		// reaper thấy là "mồ côi" — đúng, nhưng phải chờ tới chu kỳ sweep.
		// Dọn ngay ở đây rẻ hơn nhiều.
		if delErr := m.pods.Delete(ctx, name, 0); delErr != nil {
			m.log.Error("không xoá được pod chờ-ready thất bại — khe quota sẽ rò tới lượt sweep",
				slog.String("pod", name), slog.String("err", delErr.Error()))
		}
		return "", err
	}

	if err := m.publish(ctx, name); err != nil {
		if delErr := m.pods.Delete(ctx, name, 0); delErr != nil {
			m.log.Error("không xoá được pod công bố thất bại",
				slog.String("pod", name), slog.String("err", delErr.Error()))
		}
		return "", err
	}

	m.log.Info("pod ấm đã vào pool", slog.String("pod", name))
	return name, nil
}

// publish đưa một pod đã Ready vào pool.
//
// ⛔ THỨ TỰ HAI LỆNH DƯỚI ĐÂY LÀ LUẬT CỨNG, KHÔNG PHẢI CHI TIẾT.
//
//  1. HSET pod:{name} state=free
//  2. RPUSH pool:free {name}
//
// claim.lua chỉ nhận pod có `pod:{name}.state == "free"`; pod nào không thoả bị
// đẩy sang `pool:quarantine` và KHÔNG BAO GIỜ quay lại. Đảo hai lệnh này mở một
// cửa sổ trong đó tên pod đã nằm trong pool:free nhưng hash chưa có state — một
// claim rơi trúng cửa sổ đó sẽ CÁCH LY VĨNH VIỄN MỘT POD HOÀN TOÀN TỐT, và mỗi
// pod mất đi là −1 trên trần 4 (D16). Ba lần như vậy là nền tảng chết mà không
// lỗi nào nói vì sao. TestThuTuDaoNguocCachLyPodTot chứng minh cửa sổ đó có thật.
//
// RPUSH (không LPUSH) giữ FIFO: claim.lua LMOVE từ đầu TRÁI, nên pod cũ nhất ra
// trước và pod hỏng lộ sớm (D6).
//
// KHÔNG đặt TTL cho pod:{name}: hash hết hạn trong lúc pod còn nằm trong
// pool:free sẽ làm claim.lua đọc `state` ra nil rồi cách ly một pod tốt — đúng
// chế độ hỏng mà thứ tự ở trên tồn tại để chặn. Vòng đời của hash này thuộc về
// reaper (B7), không thuộc về đồng hồ.
func (m *Manager) publish(ctx context.Context, podName string) error {
	now := strconv.FormatInt(m.now().Unix(), 10)

	podKey, err := rediskeys.Pod(podName)
	if err != nil {
		return err
	}

	if err := m.rdb.HSet(ctx, podKey,
		fieldPodState, StateFree,
		fieldPodUpdatedAt, now,
	).Err(); err != nil {
		return fmt.Errorf("pool: HSET %s state=free: %w", podKey, err)
	}

	if m.publishHook != nil {
		m.publishHook(podName)
	}

	if err := m.rdb.RPush(ctx, rediskeys.PoolFree, podName).Err(); err != nil {
		// Hash đã ghi mà list thì chưa: pod tồn tại, state=free, nhưng không ai
		// tìm thấy nó. Đó là pod mồ côi theo nghĩa của reaper (có hash, không
		// nằm trong pool, không session nào trỏ tới) — an toàn, dọn được. Chiều
		// ngược lại thì không, và đó chính là lý do thứ tự này.
		return fmt.Errorf("pool: RPUSH %s: %w", rediskeys.PoolFree, err)
	}
	return nil
}

// waitReady poll pod tới khi Ready, terminal, hoặc hết hạn.
//
// Poll chứ không Watch: đây là MỘT pod đã biết tên, trong một vòng đã tuần tự.
// Watch đổi lấy độ phức tạp (informer, resync, reconnect) để tiết kiệm vài lời
// gọi Get mỗi 250ms — không đáng ở quy mô POOL_TARGET cỡ 1–3.
func (m *Manager) waitReady(ctx context.Context, name string) error {
	deadline := time.NewTimer(m.readyTimeout)
	defer deadline.Stop()
	poll := time.NewTicker(m.readyPoll)
	defer poll.Stop()

	for {
		pod, err := m.pods.Get(ctx, name)
		switch {
		case err != nil && !k8s.IsNotFound(err):
			return err
		case err == nil && k8s.IsReady(pod):
			return nil
		case err == nil && k8s.IsTerminal(pod):
			return fmt.Errorf("pool: pod %q vào trạng thái %s trước khi Ready (%s)",
				name, pod.Status.Phase, pod.Status.Reason)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			return fmt.Errorf("pool: pod %q không Ready sau %s", name, m.readyTimeout)
		case <-poll.C:
		}
	}
}

// observeSizes cập nhật hai gauge. Lỗi đọc chỉ log Debug: một gauge lệch không
// đáng làm vòng replenish rẽ nhánh, còn nuốt hoàn toàn thì không ai biết vì sao
// dashboard đứng hình.
func (m *Manager) observeSizes(ctx context.Context) {
	if n, err := m.rdb.LLen(ctx, rediskeys.PoolFree).Result(); err == nil {
		m.met.PoolFreeSize.Set(float64(n))
	} else {
		m.log.Debug("không đọc được LLEN pool:free", slog.String("err", err.Error()))
	}
	if n, err := m.rdb.LLen(ctx, rediskeys.PoolQuarantine).Result(); err == nil {
		m.met.PoolQuarantineSize.Set(float64(n))
	} else {
		m.log.Debug("không đọc được LLEN pool:quarantine", slog.String("err", err.Error()))
	}
}
