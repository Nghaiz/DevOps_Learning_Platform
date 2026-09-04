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
	defaultTick = 10 * time.Second

	// DefaultReadyTimeout là ngân sách chờ pod mới Ready trước khi ghi
	// `HSET pod:{name} state=free`.
	//
	// ⛔ EXPORT CÓ CHỦ Ý — ĐÂY LÀ NỬA KIA CỦA MỘT RÀNG BUỘC LIÊN PACKAGE.
	// Trong toàn bộ khoảng này, pod đã tồn tại trên cluster nhưng CHƯA có hash
	// `pod:{name}`, tức nó khớp chính xác định nghĩa "mồ côi" của reaper. Vì thế
	// `reaper.orphanGrace` BẮT BUỘC phải lớn hơn hằng này cộng biên; ai nâng
	// riêng con số ở đây sẽ khiến sweep giết đúng pod mà warm-pool đang chờ.
	// Trước bản này hai hằng nằm ở hai package và KHÔNG có gì ràng buộc chúng —
	// nợ `missingProof` của review PR #27. Cổng nằm ở
	// `reaper.TestOrphanGraceBaoTronReadyTimeout`.
	DefaultReadyTimeout = 2 * time.Minute

	defaultReadyPoll = 250 * time.Millisecond

	// Tên đặt là min/maxBackoff chứ không phải backoffMin/backoffMax: revive
	// đọc hậu tố "Min" trên một time.Duration là đơn vị PHÚT, không phải
	// "minimum" — và nó đúng khi cảnh báo, vì người đọc cũng đọc nhầm y hệt.
	minBackoff = 1 * time.Second
	maxBackoff = 60 * time.Second

	// quotaLogEvery giới hạn log WARN khi chạm quota. Ở nhịp 10s, log mỗi vòng
	// nghĩa là 360 dòng/giờ nói đúng một chuyện trong lúc nền tảng đang chạy
	// bình thường ở công suất tối đa — đủ để chôn vùi lỗi thật.
	quotaLogEvery = 5 * time.Minute

	// cleanupTimeout là ngân sách cho đường DỌN DẸP (xoá pod sau khi một bước
	// thất bại). Xem cleanupContext để biết vì sao nó không dùng ctx của caller.
	cleanupTimeout = 10 * time.Second
)

// cleanupContext tách đường dọn dẹp khỏi ctx của caller.
//
// ⛔ KHÔNG ĐƯỢC DỌN BẰNG CHÍNH ctx VỪA GÂY RA LỖI. Lý do rất cụ thể: `waitReady`
// chờ tới 2 phút, còn deadline gRPC/tRPC của BFF ngắn hơn nhiều, và người dùng
// đóng tab cũng huỷ ctx. Khi ctx đã huỷ, `Delete(ctx, …)` KHÔNG BAO GIỜ gửi
// được request (net/http trả lỗi ngay) — pod ở lại cluster, không có hash
// `pod:{name}`, không session nào trỏ tới, và ăn một khe trong trần 4 pod (D16).
//
// Cay hơn nữa: đường này chỉ chạy khi pool đã RỖNG, tức đúng lúc quota căng
// nhất. Tầng đỡ (sweep pod mồ côi của B7) nay đã tồn tại, nhưng nó chỉ chạm tới
// pod SAU orphanGrace (5 phút) — dọn ngay ở đây vẫn rẻ hơn nhiều.
func cleanupContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.WithoutCancel(ctx), cleanupTimeout)
}

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
		readyTimeout: DefaultReadyTimeout,
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
//
// ⛔ CỐ Ý KHÔNG CÓ time.Ticker. Bản đầu có cả ticker (nhịp m.tick) LẪN timer
// (mang giá trị backoff) trong cùng một select — nên ticker luôn bắn trước mọi
// backoff > tick và toàn bộ nhánh cấp số nhân thành MÃ CHẾT. Đo được: với
// tick=200ms, createErr cố định, chạy 3s → 15 lần gọi Create (= đúng 3s/200ms)
// thay vì ~4 lần mà backoff 1s→2s→4s phải cho. Quy về sản phẩm (tick=10s,
// maxBackoff=60s): API server sập ⇒ thử lại mỗi 10s vĩnh viễn kèm 360 dòng
// ERROR mỗi giờ — đúng thứ ồn mà quotaLogEvery được thêm vào để tránh ở nhánh
// bên cạnh. Ticker và timer mã hoá CÙNG một khái niệm hai lần; giữ lại timer.
func (m *Manager) Run(ctx context.Context) error {
	backoff := time.Duration(0)
	lastQuotaLog := time.Time{}

	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		err := m.replenishOnce(ctx)

		// Rút phần THỪA ngay sau khi bơm phần THIẾU, trong cùng một vòng: hai
		// nhánh là hai chiều của cùng một bất biến `|pool:free| == target`. Trước
		// bản này chỉ có chiều bơm, nên `POOL_TARGET` là SÀN mà không phải TRẦN —
		// xem trimSurplus để biết cái giá đo được của việc thiếu chiều còn lại.
		//
		// ⛔ Lỗi ở đây KHÔNG đẩy vào backoff và KHÔNG tăng ReplenishFailuresTotal.
		// Hai thứ đó nói về đường BƠM THÊM; trộn vào chính là lỗi mà
		// ReplenishQuotaBlockedTotal đã phải tách ra để tránh. Và tín hiệu cho
		// "rút thừa đang hỏng" đã có sẵn, trực tiếp hơn một counter mới:
		// `dlp_pool_free_size` đứng TRÊN POOL_TARGET qua nhiều vòng. Thêm một
		// counter thứ hai cho cùng một sự thật là chỗ để hai con số trôi khỏi nhau.
		if trimErr := m.trimSurplus(ctx); trimErr != nil && ctx.Err() == nil {
			m.log.Error("rút pod thừa thất bại — trần session đồng thời đang bị giữ thấp",
				slog.String("err", trimErr.Error()),
				slog.Int("pool_target", m.target))
		}

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
			// Thúc từ đường claim (B3): pool vừa hụt một pod và người kế tiếp
			// sẽ tới trước khi hết `wait`. Cắt ngắn cả nhịp thường LẪN backoff
			// là đúng ở đây — có tín hiệu thật thì không việc gì phải chờ.
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

// Provision tạo MỘT pod default-profile, chờ nó Ready, rồi công bố vào
// pool:free. Trả tên pod.
//
// Cũng là đường COLD PATH của B3: pool rỗng thì gọi hàm này rồi Claim lại. Dùng
// chung một đường có chủ ý — hai đường "làm cho một pod dùng được" sẽ trôi khỏi
// nhau, và cái trôi đi trước tiên luôn là thứ tự ghi ở publish().
func (m *Manager) Provision(ctx context.Context) (string, error) {
	name, err := m.createAndWaitReady(ctx, m.podCfg)
	if err != nil {
		return "", err
	}

	if err := m.publish(ctx, name); err != nil {
		m.deleteAfterFailure(ctx, name, "công bố vào pool thất bại")
		return "", err
	}

	m.log.Info("pod ấm đã vào pool", slog.String("pod", name))
	return name, nil
}

// ProvisionWithProfile tạo MỘT pod mang profile resources khác mặc định (P7
// 7.C), chờ Ready, rồi trả tên — KHÔNG công bố vào pool:free.
//
// ⛔ VÌ SAO KHÔNG publish(): pool:free chỉ được claim.lua tin là toàn
// default-profile (xem podspec.go — LimitRange là nơi DUY NHẤT quyết định
// resources cho pod ở đó). Đẩy một pod profiled vào cùng list là mời một
// request default claim trúng nó và nhận resources SAI với thứ nó xin — hoặc
// ngược lại, một request profiled claim trúng một pod default rồi OOM ngay bài
// học đầu tiên. Caller (lifecycle.claimWithColdPath) tự ghi trạng thái CLAIMED
// qua pool.ClaimDirect NGAY SAU khi hàm này trả về — pod không bao giờ có một
// pha "free, chờ ai đó claim" nào cả.
func (m *Manager) ProvisionWithProfile(ctx context.Context, profile *k8s.SandboxProfile) (string, error) {
	cfg := m.podCfg
	cfg.Profile = profile
	return m.createAndWaitReady(ctx, cfg)
}

// createAndWaitReady tạo pod theo cfg, chờ Ready, trả tên — KHÔNG chạm Redis.
// Dùng chung bởi Provision (cfg = m.podCfg mặc định) và ProvisionWithProfile
// (cfg mang Profile khác mặc định), để hai đường "tạo pod, chờ ready" không
// trôi khỏi nhau — chính bài học mà Provision từng ghi lại cho publish().
func (m *Manager) createAndWaitReady(ctx context.Context, cfg k8s.PodConfig) (string, error) {
	name, err := k8s.NewPodName()
	if err != nil {
		return "", err
	}
	pod, err := k8s.BuildSandboxPod(name, cfg)
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
		// một khe trong trần 4 (D16); reaper (B7) sẽ nhặt nó lên như pod mồ côi
		// nhưng chỉ sau orphanGrace. Dọn ngay ở đây rẻ hơn nhiều.
		m.deleteAfterFailure(ctx, name, "chờ-ready thất bại")
		return "", err
	}

	return name, nil
}

// deleteAfterFailure xoá một pod vừa tạo hỏng, bằng ctx TÁCH RỜI.
//
// Xem cleanupContext: dùng ctx của caller ở đây nghĩa là mỗi lần user đóng tab
// giữa cold path là một pod ở lại cluster vĩnh viễn.
func (m *Manager) deleteAfterFailure(ctx context.Context, name, why string) {
	cleanupCtx, cancel := cleanupContext(ctx)
	defer cancel()

	if err := m.pods.Delete(cleanupCtx, name, 0); err != nil {
		// Tới đây là hết đường tự chữa: pod tồn tại, không hash, không session.
		// B7 chưa có nên KHÔNG hứa hẹn "sweep sẽ dọn" — nói thẳng là rò.
		m.log.Error("RÒ KHE QUOTA: không xoá được pod hỏng, và chưa có reaper để dọn",
			slog.String("pod", name),
			slog.String("vi_sao_tao_hong", why),
			slog.String("err", err.Error()))
		return
	}
	m.log.Warn("đã xoá pod hỏng", slog.String("pod", name), slog.String("vi_sao", why))
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

// observeSizes cập nhật ba gauge. Lỗi đọc chỉ log Debug: một gauge lệch không
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
	if n, err := m.rdb.LLen(ctx, rediskeys.PoolClaimed).Result(); err == nil {
		m.met.PoolClaimedSize.Set(float64(n))
	} else {
		m.log.Debug("không đọc được LLEN pool:claimed", slog.String("err", err.Error()))
	}
}
