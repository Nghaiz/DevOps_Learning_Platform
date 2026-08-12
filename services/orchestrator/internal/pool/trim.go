package pool

import (
	"context"
	_ "embed"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/redis/go-redis/v9"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/orchestrator/internal/k8s"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

//go:embed trim.lua
var trimLua string

// trimScript — cùng nghi thức EVALSHA-trước-EVAL-sau với claimScript (bài học
// A5: Redis restart làm trống script cache và trả NOSCRIPT).
var trimScript = redis.NewScript(trimLua)

// maxTrimPerCycle chặn số pod rút trong MỘT vòng.
//
// Ở trạng thái bình thường phần thừa là 1 (hai manager cùng thấy pool hụt và
// mỗi bên dựng một pod). Trần này là lưới cho ca `pool:free` phình bất thường —
// và chính ca đó là triệu chứng ta muốn NHÌN THẤY qua `dlp_pool_free_size` chứ
// không phải thứ nên biến một vòng replenish thành một tràng lời gọi apiserver.
// Cùng lý lẽ với freeBatch/quarantineBatch/claimedBatch của reaper.
const maxTrimPerCycle = 10

// trimSurplus rút phần pod ấm VƯỢT trần POOL_TARGET rồi xoá chúng.
//
// ⛔ VÌ SAO NHÁNH NÀY TỒN TẠI — `POOL_TARGET` TỪNG CHỈ LÀ SÀN, KHÔNG PHẢI TRẦN.
// `replenishOnce` chỉ bơm thêm khi thiếu; không nhánh nào rút bớt khi thừa. Đo
// được 2026-08-11 sau `helm upgrade`: `dlp_pool_free_size = 2` với
// `POOL_TARGET=1`, và con số 2 Ở LẠI VĨNH VIỄN ⇒ trần session đồng thời tụt
// 3 → 2 (D16: `trần = quota_hiệu_lực − |pool:free|`) mà không lỗi nào nói vì
// sao. Nguồn của phần thừa là `maxSurge` của rollout (hai manager cùng sống
// ~13s), NHƯNG `values.yaml` đặt orchestrator `replicaCount: 2` nên trên mọi
// deploy không dùng `values-selfhost.yaml` thì HAI manager sống THƯỜNG TRỰC —
// tức đây không phải hiện tượng thoáng qua lúc rollout.
//
// Chốt đường (a) tự-sửa thay vì (b) leader-election: hai manager vẫn có thể
// cùng tạo, nhưng phần thừa bị rút ở vòng sau nên trần luôn quay về đúng. Giá
// là CHURN (một pod bị tạo rồi xoá mỗi lần hai manager đua) — không phải rò.
func (m *Manager) trimSurplus(ctx context.Context) error {
	var errs []error

	for i := 0; i < maxTrimPerCycle; i++ {
		if ctx.Err() != nil {
			return errors.Join(append(errs, ctx.Err())...)
		}

		name, err := trimScript.Run(ctx, m.rdb,
			[]string{rediskeys.PoolFree},
			strconv.Itoa(m.target),
		).Text()
		switch {
		case errors.Is(err, redis.Nil):
			// Không còn pod thừa. Đây là ca BÌNH THƯỜNG và là đường ra duy nhất
			// của vòng lặp ở trạng thái khoẻ.
			return errors.Join(errs...)
		case err != nil:
			return errors.Join(append(errs, fmt.Errorf("pool: chạy trim.lua: %w", err))...)
		}

		// Tới đây ta SỞ HỮU `name`: RPOP đã rút nó khỏi pool:free nên không claim
		// nào còn grab được nó.
		m.met.PoolTrimmedTotal.Inc()
		m.log.Warn("rút pod ấm THỪA khỏi pool — nhiều warm-pool manager đang cùng bơm",
			slog.String("pod", name),
			slog.Int("pool_target", m.target))

		if err := m.deleteSurplus(ctx, name); err != nil {
			errs = append(errs, err)
		}
	}

	return errors.Join(errs...)
}

// deleteSurplus xoá một pod thừa mà ta đã giành được quyền sở hữu.
//
// ⛔ `DEL pod:{name}` TRƯỚC, `pods.Delete` SAU — THỨ TỰ NÀY LÀ LUẬT.
//
// Đảo lại thì một lượt `Delete` hỏng (apiserver chớp, 503 lúc rollout
// control-plane) để lại một pod CÓ hash `pod:{name}`, KHÔNG nằm trong list nào,
// và KHÔNG session nào trỏ tới — mà không tầng reaper nào phủ được ca đó: tầng
// 2a đòi hash VẮNG, 2b đòi có `session:{id}`, 2c quét `pool:claimed`, tầng 3
// quét `pool:quarantine`, tầng 4 quét `pool:free`. Đó là điểm mù thứ SÁU, và nó
// tránh được bằng thứ tự chứ không cần thêm một tầng nữa.
//
// Xoá hash trước thì lượt hỏng để lại một pod HASH-LESS trong `dlp-sandbox` với
// label `app=sandbox` — tức đúng định nghĩa mồ côi của tầng 2a, sẽ được dọn sau
// `orphanGrace`. Chọn chế độ hỏng nằm TRONG vùng phủ của một tầng đã có.
func (m *Manager) deleteSurplus(ctx context.Context, name string) error {
	podKey, err := rediskeys.Pod(name)
	if err != nil {
		return err
	}

	if err := m.rdb.Del(ctx, podKey).Err(); err != nil && !errors.Is(err, redis.Nil) {
		// Không xoá pod khi hash còn: xem thứ tự ở trên. Vòng sau thử lại —
		// nhưng tên đã ra khỏi pool:free nên không ai claim phải nó, và tầng 4
		// không thấy nó nữa. Pod trở thành việc của tầng 2a sau orphanGrace.
		return fmt.Errorf("pool: DEL %s (pod thừa %q): %w", podKey, name, err)
	}

	if err := m.pods.Delete(ctx, name, 0); err != nil && !k8s.IsNotFound(err) {
		return fmt.Errorf("pool: xoá pod thừa %q: %w", name, err)
	}
	return nil
}
