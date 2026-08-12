package pool

import (
	"context"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// seedWarm công bố N pod ấm QUA ĐÚNG ĐƯỜNG SẢN PHẨM (`publish`), không seed
// bằng tay.
//
// Có chủ ý: seed tay là dựng lại thứ tự ghi hash↔list trong test, và bản seed đó
// sẽ trôi khỏi `publish` đúng lúc `publish` thay đổi — lúc đó test vẫn xanh trên
// một trạng thái mà production không bao giờ tạo ra.
func seedWarm(t *testing.T, m *Manager, names ...string) {
	t.Helper()
	for _, n := range names {
		if err := m.publish(context.Background(), n); err != nil {
			t.Fatalf("publish %q: %v", n, err)
		}
	}
}

func llenFree(t *testing.T, m *Manager) int64 {
	t.Helper()
	n, err := m.rdb.LLen(context.Background(), rediskeys.PoolFree).Result()
	if err != nil {
		t.Fatalf("LLEN pool:free: %v", err)
	}
	return n
}

// TestTrimRutPodThuaVeDungTran — vế khẳng định của W1.
//
// ⛔ TRƯỚC BẢN NÀY `POOL_TARGET` CHỈ LÀ SÀN. `replenishOnce` bơm khi thiếu và
// không nhánh nào rút khi thừa, nên trạng thái dưới đây — quan sát được trên cụm
// 2026-08-11 sau `helm upgrade` — ở lại VĨNH VIỄN: `dlp_pool_free_size = 2` với
// `POOL_TARGET = 1`. Mỗi pod thừa là −1 trên trần session đồng thời (D16), và
// nhìn từ ngoài thì nền tảng chỉ đơn giản phục vụ được ít người hơn.
func TestTrimRutPodThuaVeDungTran(t *testing.T) {
	pods := newFakePods()
	m, met := newTestManager(t, pods, 1)
	ctx := context.Background()

	seedWarm(t, m, "sandbox-thua000001", "sandbox-thua000002", "sandbox-thua000003")

	if err := m.trimSurplus(ctx); err != nil {
		t.Fatalf("trimSurplus: %v", err)
	}

	if n := llenFree(t, m); n != 1 {
		t.Fatalf("LLEN pool:free = %d, cần 1 (= POOL_TARGET)", n)
	}
	if got := len(pods.deletedNames()); got != 2 {
		t.Fatalf("xoá %d pod (%v), cần 2 — pod đã rút khỏi list mà không xoá là RÒ khe quota",
			got, pods.deletedNames())
	}
	if v := testutil.ToFloat64(met.PoolTrimmedTotal); v != 2 {
		t.Fatalf("dlp_pool_trimmed_total = %v, cần 2", v)
	}

	// Hash của pod đã rút phải mất: để lại là claim.lua vẫn đọc được
	// `state=free` cho một pod không còn tồn tại.
	for _, n := range pods.deletedNames() {
		key, err := rediskeys.Pod(n)
		if err != nil {
			t.Fatalf("rediskeys.Pod: %v", err)
		}
		if exists, _ := m.rdb.Exists(ctx, key).Result(); exists != 0 {
			t.Fatalf("hash %s vẫn còn sau khi rút pod %q", key, n)
		}
	}
}

// TestTrimKhongDungGiKhiPoolDungTran — ĐỐI CHỨNG ÂM, và nó là ca quan trọng
// nhất của nhóm này.
//
// `trimSurplus` chạy MỖI vòng replenish trên pool đang khoẻ. Một hiện thực rút
// quá tay (so `<` thay vì `<=`, hoặc pop trước khi so) không làm test nào khác
// đỏ — nó chỉ làm warm-pool rỗng mãi mãi, mọi claim rơi cold-path, và mục tiêu
// claim < 1s mà cả phase này tồn tại vì nó thì biến mất trong im lặng.
func TestTrimKhongDungGiKhiPoolDungTran(t *testing.T) {
	pods := newFakePods()
	m, met := newTestManager(t, pods, 2)
	ctx := context.Background()

	seedWarm(t, m, "sandbox-dutran0001", "sandbox-dutran0002")

	if err := m.trimSurplus(ctx); err != nil {
		t.Fatalf("trimSurplus: %v", err)
	}

	if n := llenFree(t, m); n != 2 {
		t.Fatalf("LLEN pool:free = %d, cần 2 — pool ĐÚNG trần không được rút gì", n)
	}
	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v — pool đang đúng trần, không có pod nào là thừa", got)
	}
	if v := testutil.ToFloat64(met.PoolTrimmedTotal); v != 0 {
		t.Fatalf("dlp_pool_trimmed_total = %v, cần 0", v)
	}
}

// TestTrimRutDungPhanThuaKhongRutXuongDuoiTran — trần 2, có 3 pod ⇒ rút ĐÚNG 1.
//
// Ca này tách khỏi ca "về đúng trần" ở trên vì nó gác một tính chất khác: một
// hiện thực vét sạch list (`for LLEN > 0`) vẫn qua được ca kia khi target = 1
// và chỉ đỏ khi target > 1.
func TestTrimRutDungPhanThuaKhongRutXuongDuoiTran(t *testing.T) {
	pods := newFakePods()
	m, met := newTestManager(t, pods, 2)
	ctx := context.Background()

	seedWarm(t, m, "sandbox-batran0001", "sandbox-batran0002", "sandbox-batran0003")

	if err := m.trimSurplus(ctx); err != nil {
		t.Fatalf("trimSurplus: %v", err)
	}

	if n := llenFree(t, m); n != 2 {
		t.Fatalf("LLEN pool:free = %d, cần 2", n)
	}
	if v := testutil.ToFloat64(met.PoolTrimmedTotal); v != 1 {
		t.Fatalf("dlp_pool_trimmed_total = %v, cần 1", v)
	}
}

// TestTrimRutTuDauPHAIGiuNguyenFIFO.
//
// `claim.lua` LMOVE từ đầu TRÁI, nên rút ở đầu PHẢI giữ nguyên FIFO của D6 —
// pod cũ nhất vẫn ra trước, và pod hỏng vẫn lộ sớm. Rút ở đầu trái thì (a) tranh
// trực tiếp với đường claim của người dùng và (b) bỏ đi đúng pod đã ấm lâu nhất,
// tức đảo ngược chính tính chất mà D6 chọn LIST để có.
//
// Không có ca này thì `LPOP` và `RPOP` đều làm mọi ca khác xanh.
func TestTrimRutTuDauPHAIGiuNguyenFIFO(t *testing.T) {
	pods := newFakePods()
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	const oldest = "sandbox-cunhat0001"
	seedWarm(t, m, oldest, "sandbox-giua000001", "sandbox-moinhat001")

	if err := m.trimSurplus(ctx); err != nil {
		t.Fatalf("trimSurplus: %v", err)
	}

	left, err := m.rdb.LRange(ctx, rediskeys.PoolFree, 0, -1).Result()
	if err != nil {
		t.Fatalf("LRANGE: %v", err)
	}
	if len(left) != 1 || left[0] != oldest {
		t.Fatalf("pool:free = %v, cần [%s] — rút ở đầu TRÁI là bỏ đúng pod ấm lâu nhất và đảo FIFO của D6",
			left, oldest)
	}
}

// TestTrimXoaHashTRUOCKhiXoaPod — ⛔ LUẬT THỨ TỰ, VÀ ĐIỂM MÙ THỨ SÁU.
//
// Đảo thứ tự thì một lượt `Delete` hỏng (apiserver chớp, 503 lúc rollout
// control-plane) để lại một pod CÓ hash `pod:{name}`, KHÔNG nằm trong list nào,
// và KHÔNG session nào trỏ tới — mà không tầng reaper nào phủ được ca đó: tầng
// 2a đòi hash VẮNG, 2b đòi có `session:{id}`, 2c quét `pool:claimed`, tầng 3
// quét `pool:quarantine`, tầng 4 quét `pool:free`. Xoá hash trước thì lượt hỏng
// để lại một pod HASH-LESS, tức đúng định nghĩa mồ côi của tầng 2a.
//
// Nhìn từ trạng thái CUỐI thì hai thứ tự cho kết quả GIỐNG HỆT NHAU, nên ca này
// bắt buộc phải quan sát ở giữa — đó là lý do `fakePods.onDelete` tồn tại.
func TestTrimXoaHashTRUOCKhiXoaPod(t *testing.T) {
	pods := newFakePods()
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	seedWarm(t, m, "sandbox-thutu00001", "sandbox-thutu00002")

	hashConLuc := make(map[string]int64)
	pods.onDelete = func(name string) {
		key, err := rediskeys.Pod(name)
		if err != nil {
			return
		}
		n, _ := m.rdb.Exists(context.Background(), key).Result()
		hashConLuc[name] = n
	}

	if err := m.trimSurplus(ctx); err != nil {
		t.Fatalf("trimSurplus: %v", err)
	}

	if len(hashConLuc) == 0 {
		t.Fatal("onDelete chưa bao giờ chạy — test không quan sát được gì")
	}
	for name, exists := range hashConLuc {
		if exists != 0 {
			t.Fatalf("lúc gọi apiserver xoá pod %q thì hash pod:%s VẪN CÒN — thứ tự đảo, và một lượt Delete hỏng sẽ để lại pod không tầng nào dọn được",
				name, name)
		}
	}
}

// TestTrimTranVoNghiaThiKhongRutGi — guard fail-closed của trim.lua.
//
// Nhánh này XOÁ POD, nên một `ARGV[1]` hỏng mà rơi vào "trần = 0" sẽ vét sạch
// warm-pool mỗi vòng trong khi mọi dòng log đều nói "đã rút pod thừa".
// `NewManager` ép target ≥ 1 nên đường qua Manager không tới được đây — ca này
// gọi thẳng script để gác chính cái guard đó.
func TestTrimTranVoNghiaThiKhongRutGi(t *testing.T) {
	pods := newFakePods()
	m, _ := newTestManager(t, pods, 1)
	ctx := context.Background()

	seedWarm(t, m, "sandbox-vonghia001", "sandbox-vonghia002")

	if err := trimScript.Run(ctx, m.rdb, []string{rediskeys.PoolFree}, "-1").Err(); err == nil {
		t.Fatal("trần -1 phải là LỖI — im lặng nhận nó nghĩa là trần âm được đọc như 'rút mọi thứ'")
	}
	if n := llenFree(t, m); n != 2 {
		t.Fatalf("LLEN pool:free = %d, cần 2 — script lỗi không được rút gì", n)
	}
}
