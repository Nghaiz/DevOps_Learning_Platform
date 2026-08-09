// Package reaper dọn pod và session hết vòng đời (phase-1 B7).
//
// BA TẦNG, VÀ THỨ TỰ QUAN TRỌNG VỀ MẶT VAI TRÒ:
//
//	Tầng 1 — keyspace notification (`__keyevent@N__:expired`). ĐƯỜNG NHANH.
//	Tầng 2 — sweep định kỳ. ĐƯỜNG CHÍNH.
//	Tầng 3 — drain `pool:quarantine`.
//
// Tầng 1 KHÔNG được coi là đường chính: keyspace notification là best-effort —
// Redis không lưu event, nên mọi session hết hạn trong lúc reaper offline (deploy,
// crash, mất mạng) là mất pod VĨNH VIỄN nếu không có tầng 2. Ngược lại tầng 2
// một mình thì trễ tới một chu kỳ. Cần cả hai.
//
// Tầng 3 tồn tại vì pod bị `claim.lua` cách ly rơi vào đúng điểm mù của hai tầng
// kia: nó VẪN CÓ hash `pod:{name}` nên không phải "pod mồ côi", và không session
// nào trỏ tới nên không phải "session ma". Không nhánh nào ở trên chạm được nó,
// mà mỗi mục là −1 trên trần 4 pod (D16).
package reaper

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	corev1 "k8s.io/api/core/v1"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/metrics"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

const (
	// orphanGrace là tuổi tối thiểu của một pod trước khi nó ĐƯỢC PHÉP bị coi
	// là mồ côi.
	//
	// ⛔ KHÔNG PHẢI SỰ THẬN TRỌNG THỪA — KHÔNG CÓ NÓ THÌ SWEEP GIẾT POD ĐANG SINH.
	// `pool.Manager.Provision` tạo Pod trước, chờ Ready (tới 2 phút), rồi mới
	// `HSET pod:{name} state=free`. Trong suốt khoảng đó pod khớp CHÍNH XÁC định
	// nghĩa mồ côi ("có label app=sandbox, không có hash pod:{name}"). Một vòng
	// sweep rơi vào giữa sẽ xoá pod mà warm-pool đang chờ, warm-pool tạo lại,
	// sweep lại xoá — vòng lặp đốt quota mà mọi log đều nói "đã dọn pod mồ côi".
	//
	// Phải LỚN HƠN pool.defaultReadyTimeout (2 phút) cộng biên cho lượt HSET.
	orphanGrace = 5 * time.Minute

	// quarantineBatch giới hạn số pod cách ly xử lý mỗi vòng, để một danh sách
	// dài bất thường không biến sweep thành một lượt gọi API kéo dài.
	quarantineBatch = 50

	// sessionScanCount là gợi ý COUNT cho SCAN. SCAN chứ không KEYS: KEYS chặn
	// Redis đơn luồng cho tới khi duyệt hết không gian khoá, và Redis này đang
	// phục vụ đường claim của người dùng.
	sessionScanCount = 200
)

// SessionReaper là phần lifecycle mà reaper cần. Reaper KHÔNG tự ghi trạng thái
// session — nó gọi cùng một đường mà RPC dùng, nên mọi bất biến (idempotency,
// thứ tự đánh dấu-trước-xoá-sau, audit) chỉ có một hiện thực.
type SessionReaper interface {
	ReapSystem(ctx context.Context, sessionID, component string) error
	MarkFailed(ctx context.Context, sessionID, reason string) error
}

// Reaper chạy ba tầng dọn dẹp.
type Reaper struct {
	rdb      redis.UniversalClient
	pods     k8s.PodClient
	sessions SessionReaper

	redisDB  int
	interval time.Duration
	log      *slog.Logger
	met      *metrics.Metrics

	now func() time.Time
	// onSweepDone chỉ test đặt, để chờ một vòng sweep hoàn tất mà không sleep.
	onSweepDone func()
}

// New dựng reaper. redisDB phải là ĐÚNG DB mà client đang dùng — kênh keyspace
// mang số DB trong tên (`__keyevent@0__:expired`), nên sai số là subscribe vào
// một kênh không bao giờ có event, và SUBSCRIBE vẫn THÀNH CÔNG trong ca đó.
func New(
	rdb redis.UniversalClient,
	pods k8s.PodClient,
	sessions SessionReaper,
	redisDB int,
	interval time.Duration,
	log *slog.Logger,
	met *metrics.Metrics,
) *Reaper {
	return &Reaper{
		rdb:      rdb,
		pods:     pods,
		sessions: sessions,
		redisDB:  redisDB,
		interval: interval,
		log:      log,
		met:      met,
		now:      time.Now,
	}
}

// Run chạy tầng 1 (pub/sub) song song với vòng lặp tầng 2+3 tới khi ctx đóng.
func (r *Reaper) Run(ctx context.Context) error {
	go r.watchExpired(ctx)

	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()

	// Quét ngay một lần lúc khởi động: sau một lần deploy, mọi event hết hạn
	// trong khoảng downtime đã mất (tầng 1 không lưu event), và đợi hết một chu
	// kỳ nữa là để pod chết nằm ăn quota lâu gấp đôi mà không lý do gì.
	r.sweepOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			r.sweepOnce(ctx)
		}
	}
}

// ---------------------------------------------------------------- tầng 1

// watchExpired nghe `__keyevent@N__:expired` và dọn ngay session vừa hết hạn.
func (r *Reaper) watchExpired(ctx context.Context) {
	channel := fmt.Sprintf("__keyevent@%d__:expired", r.redisDB)
	sub := r.rdb.Subscribe(ctx, channel)
	defer func() { _ = sub.Close() }()

	r.log.Info("reaper tầng 1: nghe keyspace expiry", slog.String("channel", channel))

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			r.met.ReaperKeyspaceEventsTotal.Inc()
			r.handleExpiredKey(ctx, msg.Payload)
		}
	}
}

// handleExpiredKey xử lý một key vừa hết hạn.
//
// Chỉ quan tâm `session:{id}` — KHÔNG phải `session:{id}:pod` (con trỏ đó sống
// lâu hơn có chủ ý và hết hạn sau, lúc pod đã được dọn) và không phải key khác.
func (r *Reaper) handleExpiredKey(ctx context.Context, key string) {
	const prefix = "session:"
	if !strings.HasPrefix(key, prefix) {
		return
	}
	id := strings.TrimPrefix(key, prefix)
	if strings.Contains(id, ":") {
		// `session:{id}:pod` / `session:{id}:ws` — không phải hash session.
		return
	}

	// Hash ĐÃ biến mất (đó là ý nghĩa của event này), nên podName chỉ còn đọc
	// được từ con trỏ sống-lâu-hơn. Đây chính là lý do hai TTL không được bằng
	// nhau — xem pool.PodPointerGrace.
	podKey, err := rediskeys.SessionPod(id)
	if err != nil {
		return
	}
	podName, err := r.rdb.Get(ctx, podKey).Result()
	if errors.Is(err, redis.Nil) {
		// Con trỏ cũng mất rồi (reap tường minh đã DEL nó, hoặc grace đã qua).
		// Không còn gì để làm ở tầng này; sweep sẽ nhặt pod nếu nó còn sống.
		return
	}
	if err != nil {
		r.log.Warn("tầng 1: không đọc được con trỏ pod của session vừa hết hạn",
			slog.String("session_id", id), slog.String("err", err.Error()))
		return
	}

	r.log.Info("tầng 1: session hết hạn, dọn pod",
		slog.String("session_id", id), slog.String("pod", podName))
	r.deletePodAndIndex(ctx, podName)
	_ = r.rdb.Del(ctx, podKey).Err()
}

// ---------------------------------------------------------------- tầng 2 + 3

func (r *Reaper) sweepOnce(ctx context.Context) {
	if err := r.sweep(ctx); err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
			return
		}
		r.met.ReaperSweepFailuresTotal.Inc()
		r.log.Error("vòng sweep thất bại — đây là ĐƯỜNG CHÍNH của reaper, không phải dự phòng",
			slog.String("err", err.Error()))
	}
	if r.onSweepDone != nil {
		r.onSweepDone()
	}
}

func (r *Reaper) sweep(ctx context.Context) error {
	pods, err := r.pods.List(ctx, k8s.SelectorSandbox)
	if err != nil {
		return fmt.Errorf("reaper: liệt kê pod sandbox: %w", err)
	}

	live := make(map[string]bool, len(pods))
	for i := range pods {
		live[pods[i].Name] = true
	}

	if err := r.sweepOrphanPods(ctx, pods); err != nil {
		return err
	}
	if err := r.sweepGhostSessions(ctx, live); err != nil {
		return err
	}
	return r.drainQuarantine(ctx)
}

// sweepOrphanPods xoá pod mang label sandbox mà không có hash `pod:{name}`.
func (r *Reaper) sweepOrphanPods(ctx context.Context, pods []corev1.Pod) error {
	cutoff := r.now().Add(-orphanGrace)

	for i := range pods {
		pod := &pods[i]

		// ⛔ CỬA SỔ SINH RA. Pod vừa được Provision tạo CHƯA có hash
		// `pod:{name}` (nó chỉ được ghi sau khi pod Ready), nên nó khớp chính
		// xác định nghĩa "mồ côi". Không có mốc tuổi này thì sweep xoá đúng pod
		// mà warm-pool đang chờ, warm-pool tạo lại, sweep lại xoá — vòng lặp
		// đốt quota trong khi mọi log đều nói "đã dọn pod mồ côi".
		if pod.CreationTimestamp.After(cutoff) {
			continue
		}

		podKey, err := rediskeys.Pod(pod.Name)
		if err != nil {
			// Tên pod không qua nổi cổng rediskeys ⇒ KHÔNG phải do orchestrator
			// tạo (bộ sinh của ta luôn ra tên hợp lệ). Không đụng tới nó: xoá
			// một pod của người khác chỉ vì nó mang trùng label là vượt quyền.
			r.log.Warn("bỏ qua pod mang label sandbox nhưng tên không do orchestrator sinh",
				slog.String("pod", pod.Name))
			continue
		}
		exists, err := r.rdb.Exists(ctx, podKey).Result()
		if err != nil {
			return fmt.Errorf("reaper: EXISTS %s: %w", podKey, err)
		}
		if exists == 1 {
			continue
		}

		r.met.ReaperOrphanPodsTotal.Inc()
		r.log.Warn("pod mồ côi (không có hash pod:{name}) — xoá",
			slog.String("pod", pod.Name),
			slog.Time("created", pod.CreationTimestamp.Time))
		r.deletePodAndIndex(ctx, pod.Name)
	}
	return nil
}

// sweepGhostSessions tìm session còn trong Redis mà pod đã biến mất.
func (r *Reaper) sweepGhostSessions(ctx context.Context, livePods map[string]bool) error {
	var cursor uint64
	for {
		keys, next, err := r.rdb.Scan(ctx, cursor, "session:*", sessionScanCount).Result()
		if err != nil {
			return fmt.Errorf("reaper: SCAN session:*: %w", err)
		}
		cursor = next

		for _, key := range keys {
			id := strings.TrimPrefix(key, "session:")
			if strings.Contains(id, ":") {
				continue // `:pod` / `:ws`, không phải hash session
			}

			vals, err := r.rdb.HMGet(ctx, key,
				rediskeys.FieldPodName, rediskeys.FieldStatus).Result()
			if err != nil {
				return fmt.Errorf("reaper: HMGET %s: %w", key, err)
			}
			podName, _ := vals[0].(string)
			status, _ := vals[1].(string)

			// Chỉ session ĐANG SỐNG mới có thể thành ma. REAPED/FAILED/EXPIRED
			// đã ở trạng thái cuối — đánh dấu lại là ghi thừa và tăng revision
			// vô cớ, làm một gateway đang cầm revision đúng bỗng thấy lệch.
			if podName == "" || (status != "CLAIMED" && status != "RUNNING") {
				continue
			}
			if livePods[podName] {
				continue
			}

			r.met.ReaperGhostSessionsTotal.Inc()
			r.log.Warn("session ma: pod đã biến mất nhưng session còn sống — chuyển FAILED",
				slog.String("session_id", id), slog.String("pod", podName))
			if err := r.sessions.MarkFailed(ctx, id, "pod biến mất khỏi cluster"); err != nil {
				r.log.Error("không đánh dấu FAILED được",
					slog.String("session_id", id), slog.String("err", err.Error()))
			}
		}

		if cursor == 0 {
			return nil
		}
	}
}

// drainQuarantine dọn pod bị claim.lua cách ly — TẦNG 3.
//
// ⛔ KHÔNG TẦNG NÀO Ở TRÊN CHẠM ĐƯỢC CHÚNG. Pod cách ly VẪN CÓ hash
// `pod:{name}` nên không phải "mồ côi", và không session nào trỏ tới nên không
// phải "session ma". Nó vẫn là Pod đang chạy và vẫn ăn quota. Với trần 4 pod
// (D16), ba lần cách ly là nền tảng chết mà không lỗi nào nói vì sao.
func (r *Reaper) drainQuarantine(ctx context.Context) error {
	names, err := r.rdb.LRange(ctx, rediskeys.PoolQuarantine, 0, quarantineBatch-1).Result()
	if err != nil {
		return fmt.Errorf("reaper: LRANGE %s: %w", rediskeys.PoolQuarantine, err)
	}
	if len(names) == 0 {
		return nil
	}

	r.log.Warn("dọn pod bị cách ly — mỗi mục là −1 trên trần đồng thời, và list dài ra nghĩa là có nguồn ghi sai vào pool:free",
		slog.Int("count", len(names)))

	for _, name := range names {
		r.deletePodAndIndex(ctx, name)
		if err := r.rdb.LRem(ctx, rediskeys.PoolQuarantine, 0, name).Err(); err != nil {
			return fmt.Errorf("reaper: LREM %s %q: %w", rediskeys.PoolQuarantine, name, err)
		}
		r.met.ReaperQuarantineReapedTotal.Inc()
	}
	return nil
}

// ---------------------------------------------------------------- dùng chung

// deletePodAndIndex xoá pod khỏi cluster và mọi index của nó trong Redis.
// Idempotent ở mọi bước — cả ba tầng đều có thể gọi nó cho cùng một pod.
func (r *Reaper) deletePodAndIndex(ctx context.Context, podName string) {
	if err := r.pods.Delete(ctx, podName, 0); err != nil {
		r.log.Error("không xoá được pod", slog.String("pod", podName), slog.String("err", err.Error()))
		// Không return: vẫn dọn index. Một tên pod nằm lại trong pool:claimed
		// mà không session nào trỏ tới cũng là rác, và vòng sweep sau sẽ thử
		// xoá Pod lại.
	}
	podKey, err := rediskeys.Pod(podName)
	if err != nil {
		return
	}
	if err := r.rdb.Del(ctx, podKey).Err(); err != nil && !errors.Is(err, redis.Nil) {
		r.log.Warn("không xoá được hash pod", slog.String("pod", podName), slog.String("err", err.Error()))
	}
	for _, list := range []string{rediskeys.PoolClaimed, rediskeys.PoolFree} {
		if err := r.rdb.LRem(ctx, list, 0, podName).Err(); err != nil {
			r.log.Warn("không gỡ được pod khỏi index",
				slog.String("list", list), slog.String("pod", podName), slog.String("err", err.Error()))
		}
	}
}
