// Package reaper dọn pod và session hết vòng đời (phase-1 B7).
//
// BỐN TẦNG, VÀ THỨ TỰ QUAN TRỌNG VỀ MẶT VAI TRÒ:
//
//	Tầng 1 — keyspace notification (`__keyevent@N__:expired`). ĐƯỜNG NHANH.
//	Tầng 2 — sweep định kỳ. ĐƯỜNG CHÍNH.
//	Tầng 3 — drain `pool:quarantine`.
//	Tầng 4 — đối chiếu `pool:free` với apiserver.
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
//
// Tầng 4 khác BA TẦNG KIA VỀ BẢN CHẤT: ba tầng trên đều so Redis với Redis (hoặc
// so pod-của-cluster với hash). Tầng 4 là tầng DUY NHẤT hỏi apiserver *pod đang
// nằm trong pool có còn sống không*. Xem sweepDeadFreePods.
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
	// Phải LỚN HƠN `pool.DefaultReadyTimeout` (2 phút) cộng biên cho lượt HSET.
	// Ràng buộc đó nay CÓ CỔNG: `TestOrphanGraceBaoTronReadyTimeout`. Trước bản
	// này hai hằng nằm ở hai package và không gì buộc chúng đi cùng nhau — ai
	// nâng readyTimeout mà quên chỗ này sẽ làm sweep giết pod đang sinh ra, đúng
	// chế độ hỏng mà orphanGrace tồn tại để chặn.
	orphanGrace = 5 * time.Minute

	// quarantineBatch giới hạn số pod cách ly xử lý mỗi vòng, để một danh sách
	// dài bất thường không biến sweep thành một lượt gọi API kéo dài.
	quarantineBatch = 50

	// claimedBatch giới hạn số pod đã-claim soi mỗi vòng (tầng 2c). Cùng lý do
	// với quarantineBatch; danh sách dài hơn sẽ được vét ở các vòng sau.
	claimedBatch = 100

	// freeBatch giới hạn số pod ấm soi mỗi vòng (tầng 4). `pool:free` giữ đúng
	// POOL_TARGET phần tử ở trạng thái bình thường (1 trên lab, D16), nên trần
	// này chỉ là lưới chặn cho ca list phình bất thường — mà chính ca đó là
	// triệu chứng ta muốn thấy chứ không phải thứ nên biến sweep thành một lượt
	// gọi apiserver kéo dài.
	freeBatch = 100

	// fieldPodSessionID là field mà claim.lua ghi vào hash `pod:{name}`.
	// Contract giữa Lua và Go — đổi một bên là tầng 2c mù trong im lặng.
	fieldPodSessionID = "sessionId"

	// sessionScanCount là gợi ý COUNT cho SCAN. SCAN chứ không KEYS: KEYS chặn
	// Redis đơn luồng cho tới khi duyệt hết không gian khoá, và Redis này đang
	// phục vụ đường claim của người dùng.
	sessionScanCount = 200
)

// SessionReaper là phần lifecycle mà reaper cần.
//
// Mọi thay đổi TRẠNG THÁI session và mọi dòng audit đi qua đây, không phải qua
// các lệnh Redis rời rạc trong package này — để idempotency, thứ tự
// đánh-dấu-trước-xoá-sau và audit chỉ có MỘT hiện thực. (Tầng 2a và tầng 3 dọn
// pod KHÔNG có session nào trỏ tới, nên chúng gọi thẳng deletePodAndIndex —
// không có trạng thái session nào để đổi.)
type SessionReaper interface {
	// ReapExpired dọn session đã hết hạn: ghi dòng audit kết thúc rồi xoá pod
	// cùng mọi index. Hash `session:{id}` đã biến mất lúc gọi.
	ReapExpired(ctx context.Context, sessionID, podName string) error
	// MarkFailed chuyển session ma sang FAILED (pod biến mất khỏi cluster).
	MarkFailed(ctx context.Context, sessionID, reason string) error
}

// Reaper chạy ba tầng dọn dẹp.
type Reaper struct {
	rdb      redis.UniversalClient
	pods     k8s.PodClient
	sessions SessionReaper

	// wantImage là `SANDBOX_IMAGE` hiện hành — thứ mà một pod ấm PHẢI đang chạy.
	//
	// Đây KHÔNG phải hằng số thứ hai cho cùng một giá trị: cả pool.Manager và
	// reaper đều nhận nó từ cùng một `cfg.SandboxImage` của một lượt
	// `config.Load`, truyền vào như một giá trị. Một nguồn, hai người đọc.
	//
	// Rỗng ⇒ TẮT HẲN phép so image (xem staleImage). Không có gì để so thì
	// không kết luận gì.
	wantImage string

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
	wantImage string,
	redisDB int,
	interval time.Duration,
	log *slog.Logger,
	met *metrics.Metrics,
) *Reaper {
	return &Reaper{
		rdb:       rdb,
		pods:      pods,
		sessions:  sessions,
		wantImage: wantImage,
		redisDB:   redisDB,
		interval:  interval,
		log:       log,
		met:       met,
		now:       time.Now,
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
				// Kênh đóng ⇒ tầng 1 CHẾT VĨNH VIỄN cho phần đời còn lại của
				// process. Thoát im lặng ở đây nghĩa là đường nhanh biến mất mà
				// không dấu hiệu nào — và với tầng 2c mới thêm thì hệ quả là mỗi
				// session hết hạn phải chờ tới một chu kỳ sweep.
				r.met.ReaperSweepFailuresTotal.Inc()
				r.log.Error("reaper tầng 1 DỪNG: kênh keyspace đóng. Đường nhanh mất, chỉ còn sweep định kỳ.",
					slog.String("channel", channel))
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
	// Qua lifecycle chứ không tự dọn: nó ghi dòng audit `expired` (đọc
	// userId/tier từ hash pod, thứ duy nhất còn sót lại lúc này) rồi mới xoá.
	if err := r.sessions.ReapExpired(ctx, id, podName); err != nil {
		r.log.Error("tầng 1: dọn session hết hạn thất bại",
			slog.String("session_id", id), slog.String("err", err.Error()))
	}
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

	// ⛔ GOM LỖI, KHÔNG `return` SỚM. Bản đầu để một lỗi Redis ở tầng 2a nuốt
	// luôn tầng 2b, 2c và 3 của CẢ vòng sweep — đo được: ép `EXISTS` lỗi một lần
	// thì session ma không được xử lý và `pool:quarantine` không được dọn. Lỗi
	// tạm thời chỉ tốn 60s, nhưng một lỗi DAI DẲNG ở đúng một tên pod sẽ khiến
	// ba tầng còn lại KHÔNG BAO GIỜ chạy nữa, im lặng.
	return errors.Join(
		r.sweepOrphanPods(ctx, pods),
		r.sweepGhostSessions(ctx, live),
		r.sweepClaimedWithoutSession(ctx),
		r.sweepDeadFreePods(ctx),
		r.drainQuarantine(ctx),
	)
}

// sweepDeadFreePods — TẦNG 4: pod KHÔNG DÙNG ĐƯỢC vẫn nằm trong `pool:free`.
//
// "Không dùng được" = CHẾT (Failed/Succeeded/đã biến mất) **hoặc** đang chạy
// image CŨ. Vế thứ hai thêm 2026-08-12 (1.G-1, W2) và nó về nhà ở đây chứ không
// thành một nhánh riêng trong `pool.Manager` vì một lý do đo được: hàm này ĐÃ
// `LRANGE pool:free` rồi `pods.Get` từng pod mỗi vòng sweep, nên phép so image
// tốn **0 lời gọi apiserver thêm**. Đặt ở manager là dựng một loop thứ hai đọc
// apiserver VÀ một thành phần thứ hai mutate `pool:free`.
//
// Warm-pool KHÔNG có logic rollout theo image: đổi `SANDBOX_IMAGE` rồi
// `helm upgrade` không thay pod đang ấm — pod cũ nằm lại `pool:free` vô thời hạn,
// `Running`/`Ready` nên không tín hiệu nào nói có gì sai, và người claim tiếp
// theo nhận đúng nó. Với `pause` thì hậu quả là `tmux new-session` của G4 không
// có shell để attach ⇒ terminal chết trong khi orchestrator vẫn báo claim thành
// công. Tái hiện BA lần, ba lượt đổi image, không lần nào tự rollout; trước bản
// này phải rút tay mỗi lần.
//
// ⛔ ĐIỂM MÙ THỨ NĂM, VÀ NÓ CẮN THẲNG VÀO SINH VIÊN ĐẦU TIÊN SAU MỖI LẦN REBOOT.
//
// Quan sát được trên cụm 2026-08-11 (không phải suy luận):
//
//	Redis:      pool:free = [sandbox-674a2a67af4a]   pod:{name}.state = free
//	Kubernetes: phase = Failed, container terminated, exitCode 255
//
// `podspec.go` đặt `RestartPolicy: Never`, nên MỌI lần node reboot là pod sandbox
// chuyển `Failed` vĩnh viễn. `claim.lua` chỉ hỏi `pod:{name}.state == 'free'` —
// nó KHÔNG hỏi apiserver. Bốn tầng kia đều trượt: tầng 1 cần một `session:{id}`
// hết hạn (pod rảnh không có); tầng 2a đòi hash VẮNG (hash này CÓ); tầng 2b đòi
// có `session:{id}` (không có); tầng 2c quét `pool:claimed` (pod này ở
// `pool:free`); tầng 3 quét `pool:quarantine` (không ở đó).
//
// `k8s.IsTerminal` ĐÃ tồn tại từ trước, nhưng chỉ được gọi trong `pool.waitReady`
// — tức lúc TẠO, không bao giờ gọi lại. Với `POOL_TARGET=1`, hệ quả cụ thể là
// sinh viên ĐẦU TIÊN bấm Start sau mỗi lần reboot nhận đúng pod chết, và
// orchestrator vẫn báo claim thành công.
//
// ⛔ THỨ TỰ `LREM` TRƯỚC LÀ LUẬT, KHÔNG PHẢI SỞ THÍCH — nó vừa là phép giành
// quyền sở hữu vừa là thứ chặn claim. `LREM` trả 1 nghĩa là *ta* vừa rút tên đó
// khỏi pool ⇒ không claim nào còn grab được nó ⇒ ta được phép xoá. Trả 0 nghĩa
// là ai đó đã lấy trước (một claim đồng thời, hoặc một vòng sweep khác) ⇒ TA
// KHÔNG ĐỘNG VÀO POD. Xoá mà không giành quyền trước là mở đúng cửa sổ đua mà
// bản dọn tay đã tránh: claim.lua `LMOVE` pod ra `pool:claimed` và gắn session,
// rồi ta xoá pod dưới chân một session vừa sinh ra.
//
// Ca "đã bị claim trước" không bị bỏ rơi: pod chết + session sống là đúng định
// nghĩa **session ma** của tầng 2b, và nó sẽ chuyển session sang `FAILED` ở vòng
// sau — FE nhận lỗi rõ ràng thay vì một terminal câm.
func (r *Reaper) sweepDeadFreePods(ctx context.Context) error {
	names, err := r.rdb.LRange(ctx, rediskeys.PoolFree, 0, freeBatch-1).Result()
	if err != nil {
		return fmt.Errorf("reaper: LRANGE %s: %w", rediskeys.PoolFree, err)
	}

	var errs []error
	for _, name := range names {
		pod, getErr := r.pods.Get(ctx, name)

		// Ba đường ra khác nhau, và việc TÁCH chúng là nội dung của tầng này:
		// "chết", "lệch image", và "không kết luận được".
		var (
			reason string
			stale  bool
		)
		switch {
		case getErr != nil && !k8s.IsNotFound(getErr):
			// Không phân biệt được "chết" với "apiserver đang lỗi" ⇒ KHÔNG ĐOÁN.
			// Rút pod dựa trên một lượt đọc lỗi là tự tay phá warm-pool mỗi khi
			// apiserver chớp — và với trần 4 pod (D16) thì mỗi lần như thế là
			// một khe quota mất trong lúc hạ tầng đang yếu sẵn.
			errs = append(errs, fmt.Errorf("reaper: đọc pod ấm %q: %w", name, getErr))
			continue
		case getErr != nil:
			// CHỈ `IsNotFound` mới là "đã biến mất".
			reason = "đã biến mất khỏi apiserver"
		case k8s.IsTerminal(pod):
			reason = string(pod.Status.Phase)
		case pod.DeletionTimestamp != nil:
			// Pod đang bị xoá vẫn mang `phase: Running` suốt grace period. Không
			// có nhánh này thì nó ở lại `pool:free` và được giao cho người kế
			// tiếp — người đó nhận `Unavailable` từ cổng `podAlive` của
			// lifecycle. Cổng ấy chặn đúng, nhưng chặn ở chỗ người dùng đã phải
			// chờ; rút ở đây là chặn trước khi ai kịp chạm vào.
			reason = "đang bị xoá (Terminating)"
		case r.staleImage(pod):
			stale = true
		default:
			continue // ấm, còn sống, đúng image — đúng thứ pool nên quảng cáo
		}

		// Tới đây: pod đã Failed/Succeeded, đã biến mất khỏi apiserver, hoặc
		// đang chạy image CŨ. Cả ba đều là "pool đang quảng cáo một pod không
		// dùng được", và cả ba đi qua cùng một luật giành-quyền-sở-hữu.
		removed, remErr := r.rdb.LRem(ctx, rediskeys.PoolFree, 0, name).Result()
		if remErr != nil {
			errs = append(errs, fmt.Errorf("reaper: LREM %s %q: %w", rediskeys.PoolFree, name, remErr))
			continue
		}
		if removed == 0 {
			// Ai đó đã lấy tên này khỏi pool giữa LRANGE và LREM. Không phải
			// của ta nữa — tầng 2b/2c sẽ lo phần còn lại.
			continue
		}

		if stale {
			got, _ := sandboxImageOf(pod)
			r.met.ReaperStaleImagePodsTotal.Inc()
			// Cả hai image trong cùng một dòng log: "lệch" mà không nói lệch
			// khỏi cái gì thì người trực phải đi tra hai nơi mới đọc được.
			r.log.Warn("pod ấm chạy image CŨ — đã rút để warm-pool dựng lại bằng image hiện hành",
				slog.String("pod", name),
				slog.String("image_dang_chay", got),
				slog.String("image_muon", r.wantImage))
		} else {
			r.met.ReaperDeadFreePodsTotal.Inc()
			r.log.Warn("pod CHẾT nằm trong pool:free — đã rút trước khi ai đó claim phải nó",
				slog.String("pod", name), slog.String("phase", reason))
		}

		r.deletePodAndIndex(ctx, name)
	}
	return errors.Join(errs...)
}

// sandboxImageOf đọc image của container sandbox trong spec của pod.
//
// Tìm theo TÊN (`k8s.ContainerName`), KHÔNG phải `Containers[0]`: index đúng hôm
// nay và im lặng sai ngày spec có thêm sidecar. Không tìm thấy ⇒ `ok=false`, và
// caller phải coi đó là "không kết luận được" chứ không phải "lệch".
func sandboxImageOf(pod *corev1.Pod) (string, bool) {
	if pod == nil {
		return "", false
	}
	for i := range pod.Spec.Containers {
		if pod.Spec.Containers[i].Name == k8s.ContainerName {
			return pod.Spec.Containers[i].Image, true
		}
	}
	return "", false
}

// staleImage: pod ấm đang chạy image KHÁC `SANDBOX_IMAGE` hiện hành.
//
// ⛔ `wantImage == ""` ⇒ TẮT HẲN phép kiểm, KHÔNG phải "coi mọi pod là lệch".
// `config.Load` đã fail-fast khi `SANDBOX_IMAGE` rỗng (1.E-1), nhưng nếu một
// ngày đường đó bị nới thì so với chuỗi rỗng nghĩa là RÚT SẠCH `pool:free` mỗi
// vòng sweep, mãi mãi — một cấu hình sai biến thành xoá liên tục, trong khi mọi
// dòng log đều nói "đã rút pod lệch image". Không có gì để so thì không kết luận
// gì: cùng ranh giới với "chỉ `IsNotFound` mới là đã-biến-mất" ở trên.
func (r *Reaper) staleImage(pod *corev1.Pod) bool {
	if r.wantImage == "" {
		return false
	}
	got, ok := sandboxImageOf(pod)
	if !ok {
		return false
	}
	return got != r.wantImage
}

// sweepClaimedWithoutSession — TẦNG 2c: pod đã claim mà session không còn.
//
// ⛔ ĐIỂM MÙ THỨ TƯ, VÀ NÓ PHÁ ĐÚNG LỜI HỨA NỀN TẢNG CỦA B7.
//
// Khi tầng 1 LỠ event (reaper offline lúc `helm upgrade`, crash, rớt pub/sub),
// một session hết hạn để lại trạng thái này:
//
//	session:{id}   → mất
//	pod:{name}     → state=claimed, TTL = -1 (KHÔNG BAO GIỜ hết hạn)
//	pool:claimed   → còn tên pod
//	Pod trên cluster → vẫn chạy, vẫn ăn quota
//
// Ba tầng kia đều bỏ qua nó: hash TỒN TẠI nên không phải "mồ côi" (2a); không
// còn `session:*` nào để SCAN thấy (2b); không nằm trong quarantine (3). Và
// `pool:claimed` trước bản này KHÔNG CÓ NHÁNH NÀO ĐỌC — chỉ có `LREM` và ghi.
//
// Nghĩa là tầng 2 KHÔNG THỂ bắt được chính chế độ hỏng mà nó tồn tại để đỡ cho
// tầng 1. Mỗi lần rollout orchestrator, mọi session hết hạn trong cửa sổ restart
// là −1 VĨNH VIỄN trên trần 4 pod (D16). Bốn lần là nền tảng chết.
//
// Thông tin cần thiết đã có sẵn: `claim.lua` ghi `pod:{name}.sessionId` từ đầu —
// chỉ là chưa ai đọc nó.
func (r *Reaper) sweepClaimedWithoutSession(ctx context.Context) error {
	names, err := r.rdb.LRange(ctx, rediskeys.PoolClaimed, 0, claimedBatch-1).Result()
	if err != nil {
		return fmt.Errorf("reaper: LRANGE %s: %w", rediskeys.PoolClaimed, err)
	}

	var errs []error
	for _, name := range names {
		podKey, keyErr := rediskeys.Pod(name)
		if keyErr != nil {
			continue
		}
		sessionID, getErr := r.rdb.HGet(ctx, podKey, fieldPodSessionID).Result()
		if errors.Is(getErr, redis.Nil) {
			// Hash mất mà tên còn trong list: tầng 2a sẽ lo phần Pod (sau
			// orphanGrace); ở đây chỉ dọn index treo.
			errs = append(errs, r.rdb.LRem(ctx, rediskeys.PoolClaimed, 0, name).Err())
			continue
		}
		if getErr != nil {
			errs = append(errs, fmt.Errorf("reaper: HGET %s sessionId: %w", podKey, getErr))
			continue
		}

		sessionKey, keyErr := rediskeys.Session(sessionID)
		if keyErr != nil {
			continue
		}
		exists, existsErr := r.rdb.Exists(ctx, sessionKey).Result()
		if existsErr != nil {
			errs = append(errs, fmt.Errorf("reaper: EXISTS %s: %w", sessionKey, existsErr))
			continue
		}
		if exists == 1 {
			continue // session còn sống — pod đang phục vụ nó
		}

		r.met.ReaperClaimedOrphanTotal.Inc()
		r.log.Warn("pod đã claim mà session không còn — tầng 1 đã lỡ event này",
			slog.String("pod", name), slog.String("session_id", sessionID))

		// Cùng đường với tầng 1: ghi dòng audit kết thúc rồi xoá pod + index.
		if reapErr := r.sessions.ReapExpired(ctx, sessionID, name); reapErr != nil {
			errs = append(errs, reapErr)
		}
	}
	return errors.Join(errs...)
}

// sweepOrphanPods xoá pod mang label sandbox mà không có hash `pod:{name}`.
func (r *Reaper) sweepOrphanPods(ctx context.Context, pods []corev1.Pod) error {
	cutoff := r.now().Add(-orphanGrace)
	terminating := 0

	for i := range pods {
		pod := &pods[i]

		// ⛔ M-6 — POD ĐANG BỊ XOÁ THÌ ĐỪNG ĐẾM LẠI.
		// `DeletionTimestamp != nil` nghĩa là lệnh xoá ĐÃ được gửi và API server
		// đã nhận; pod chỉ còn nằm đó chờ kubelet/finalizer. Nhưng nó vẫn hiện
		// trong List và vẫn không có hash `pod:{name}`, nên vòng sweep sau lại
		// khớp đúng định nghĩa mồ côi: `ReaperOrphanPodsTotal` tăng thêm một lần
		// nữa cho CÙNG một pod, mỗi 60 giây, mãi mãi nếu pod kẹt Terminating.
		// Hậu quả không phải con số xấu — mà là counter này được dùng như báo
		// động ("> 0 kéo dài = có nguồn nào đó rò pod"), nên một pod kẹt biến nó
		// thành chuông kêu liên tục và mất hẳn khả năng chỉ ra pod THỨ HAI.
		// Gửi lại Delete cũng vô nghĩa: nó chỉ là một lời gọi API không đổi gì.
		//
		// Đây là suy luận mà review PR #27 (M-6) không tái hiện được vì fake
		// Delete gỡ pod khỏi List ngay — tức test double khi đó KHÔNG THỂ dựng
		// ra trạng thái Terminating. Nay có `TestSweepKhongDemLaiPodDangTerminating`.
		if pod.DeletionTimestamp != nil {
			terminating++
			continue
		}

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

	// Gauge, KHÔNG phải counter: một pod kẹt Terminating phải hiện ra là "vẫn
	// đang kẹt" chứ không phải cộng dồn mỗi vòng — đúng cái bẫy M-6 ở trên. 0 là
	// trạng thái bình thường; số dương kéo dài qua nhiều vòng là finalizer treo
	// hoặc kubelet không dọn được, và đó là thứ duy nhất còn nói cho ta biết.
	r.met.ReaperPodsTerminating.Set(float64(terminating))
	return nil
}

// sweepGhostSessions tìm session còn trong Redis mà pod đã biến mất.
func (r *Reaper) sweepGhostSessions(ctx context.Context, livePods map[string]bool) error {
	var errs []error
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

			// ⛔ XÁC MINH LẠI BẰNG MỘT LƯỢT ĐỌC MỚI, KHÔNG TIN ẢNH CHỤP.
			//
			// `livePods` được chụp TRƯỚC vòng SCAN. Bất kỳ session nào được
			// claim.lua ghi sau mốc đó, trỏ tới một pod xuất hiện sau mốc đó
			// (đúng đường cold path: Provision tạo pod rồi mới claim), sẽ thấy
			// livePods[podName] == false và bị đánh dấu FAILED OAN. Ca hỏng
			// hoàn toàn âm thầm: pod vẫn chạy, session bị giết trong Redis, FE
			// nhận FAILED. Cửa sổ = khoảng giữa List() và HMGET, bị kéo dài bởi
			// chính tầng 2a chạy trước đó.
			if _, err := r.pods.Get(ctx, podName); err == nil {
				continue // pod CÓ thật — ảnh chụp đã cũ
			} else if !k8s.IsNotFound(err) {
				// Không phân biệt được ⇒ không đoán. Vòng sau sẽ thử lại.
				errs = append(errs, fmt.Errorf("reaper: xác minh lại pod %q: %w", podName, err))
				continue
			}

			r.met.ReaperGhostSessionsTotal.Inc()
			r.log.Warn("session ma: pod đã biến mất nhưng session còn sống — chuyển FAILED",
				slog.String("session_id", id), slog.String("pod", podName))
			if err := r.sessions.MarkFailed(ctx, id, "pod biến mất khỏi cluster"); err != nil {
				errs = append(errs, fmt.Errorf("reaper: MarkFailed %q: %w", id, err))
			}
		}

		if cursor == 0 {
			return errors.Join(errs...)
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
