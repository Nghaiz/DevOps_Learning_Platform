package lifecycle

import (
	"context"
	"math"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	orchestratorv1 "github.com/Nghaiz/DevOps_Learning_Platform/proto/gen/go/orchestrator/v1"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// GetCapacity đọc sức chứa nền tảng NGAY LÚC GỌI — không cache, không lưu lại
// phía server (session.proto).
//
// ⛔ ĐỌC LLEN TRỰC TIẾP, KHÔNG ĐỌC GAUGE `dlp_pool_*_size`. Gauge chỉ được
// pool.Manager.observeSizes cập nhật mỗi vòng replenish (mặc định 10s — xem
// config.PoolTarget doc và defaultTick trong pool/manager.go), nên đọc gauge ở
// đây là cho FE một con số có thể cũ tới 10s ngay sau khi ai đó vừa
// claim/reap một session — đúng lúc "còn N chỗ" cần đúng nhất. Ba lệnh LLEN
// dưới đây là ĐÚNG NGUỒN mà observeSizes cũng đọc (rediskeys.PoolFree/
// PoolClaimed/PoolQuarantine), chỉ khác là đọc trực tiếp thay vì qua gauge đã
// cache.
//
// ⛔ VÀ MỘT LỖI ĐỌC SỐ ĐÃ ĐƯỢC GHI THẲNG VÀO PROTO, ĐỪNG ĐỂ NÓ QUAY LẠI:
// `active_sessions` là số POD ĐANG CLAIMED, không phải số session. Session
// PENDING chưa ăn khe nào nên không đếm; session mất pod thì VẪN đếm tới khi
// MarkFailed/reaper gỡ tên khỏi index. Xem comment field trong session.proto.
func (s *Service) GetCapacity(
	ctx context.Context, _ *orchestratorv1.GetCapacityRequest,
) (*orchestratorv1.GetCapacityResponse, error) {
	claimed, err := s.rdb.LLen(ctx, rediskeys.PoolClaimed).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc %s: %v", rediskeys.PoolClaimed, err)
	}
	free, err := s.rdb.LLen(ctx, rediskeys.PoolFree).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc %s: %v", rediskeys.PoolFree, err)
	}
	quarantine, err := s.rdb.LLen(ctx, rediskeys.PoolQuarantine).Result()
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "đọc %s: %v", rediskeys.PoolQuarantine, err)
	}

	// clampInt32 chứ không phải `int32(…)` thẳng — xem lý do dưới hàm đó: cả
	// LLEN lẫn CAPACITY_HARD_LIMIT đều KHÔNG bị chặn trên, và một lần cắt vòng
	// im lặng ở đây phát ra số ÂM cho FE.
	return &orchestratorv1.GetCapacityResponse{
		ActiveSessions: clampInt32(claimed),
		SoftCapacity:   clampInt32(int64(s.softCapacity())),
		PoolFree:       clampInt32(free),
		PoolQuarantine: clampInt32(quarantine),
		HardCapacity:   clampInt32(int64(s.cfg.CapacityHardLimit)),
	}, nil
}

// softCapacity TÍNH trần "pool còn lành" tại chỗ đọc — KHÔNG đọc một env riêng.
//
// Suy luận, không phải quy ước: khi N session giữ N pod, warm-pool còn giữ nổi
// đủ PoolTarget pod ấm chừng nào `N + PoolTarget <= CapacityHardLimit`. Vượt
// mức đó thì quota đầy, replenish bị ResourceQuota chặn, và người tiếp theo đi
// cold path (vẫn vào được — trần CỨNG vẫn là CapacityHardLimit, đo được ở
// ceiling.js) nhưng phải chờ tạo pod. Đó đúng là ranh giới FE muốn nói
// "còn N chỗ".
//
// ⛔ config.Load đã chặn CapacityHardLimit <= PoolTarget lúc khởi động, nên
// hàm này không bao giờ trả <= 0 trên một process đã lên được. Kẹp max(…,0) vẫn
// giữ lại: nó rẻ, và nó chặn ca một Config dựng bằng tay trong test/embed đi
// vòng qua Load rồi phát ra một int32 âm cho FE, nơi `max(0, soft − active)`
// sẽ đọc thành một con số vô nghĩa thay vì một lỗi.
func (s *Service) softCapacity() int {
	soft := s.cfg.CapacityHardLimit - s.cfg.PoolTarget
	if soft < 0 {
		return 0
	}
	return soft
}

// clampInt32 kẹp một số đếm sức chứa về `[0, math.MaxInt32]` TRƯỚC khi hạ
// xuống int32 mà proto khai (session.proto: cả năm field đều `int32`).
//
// ⛔ ĐÂY KHÔNG PHẢI MỘT DÒNG DỖ LINTER. `int32(v)` thẳng CẮT VÒNG trong im
// lặng, và không nguồn nào trong hai nguồn số của GetCapacity bị chặn trên:
//
//   - CAPACITY_HARD_LIMIT đọc bằng `strconv.Atoi` rồi chỉ kiểm `> 0` và
//     `> POOL_TARGET` (config.Load) — KHÔNG có trần. `int` trên linux/amd64 là
//     64-bit, nên `CAPACITY_HARD_LIMIT=3000000000` (thừa một chữ số trong Helm
//     values) qua sạch mọi cổng khởi động rồi tới FE thành −1294967296.
//   - LLEN trả `int64`; một list Redis chứa tới 2^32−1 phần tử, vượt int32.
//
// Vì vậy KHÔNG dùng `#nosec` được ở đây: `#nosec` là lời khẳng định "miền giá
// trị không thể tràn", mà hai gạch đầu dòng trên nói ngược lại.
//
// Kẹp thay vì trả lỗi, và kẹp cả đầu dưới về 0: GetCapacity là đường FE hỏi
// "còn mấy chỗ". Số bị kẹp vẫn là câu trả lời dùng được và vô lý một cách LỘ
// LIỄU nên dễ truy ngược; số âm thì `max(0, soft − active)` phía FE nuốt gọn
// thành một con số trông hoàn toàn bình thường. Cùng đúng một lý lẽ với
// `max(…, 0)` trong softCapacity ở trên.
//
// Nhận int64 (không phải generic) vì đó là kiểu RỘNG NHẤT trong hai nguồn:
// `int64(x)` từ một `int` là phép nới, không bao giờ đổi giá trị trên bất kỳ
// nền nào Go hỗ trợ.
func clampInt32(v int64) int32 {
	if v < 0 {
		return 0
	}
	if v > math.MaxInt32 {
		return math.MaxInt32
	}
	return int32(v)
}
