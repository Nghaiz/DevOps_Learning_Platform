package reaper

import (
	"context"
	"testing"
	"time"

	"github.com/prometheus/client_golang/prometheus/testutil"
	corev1 "k8s.io/api/core/v1"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
)

// File này giữ nhóm ca của A8 — "warm-pool phải rollout theo image".
//
// Tách khỏi reaper_test.go vì nó gác một HỢP ĐỒNG chứ không phải một nhánh: rút
// khỏi phục vụ là vô điều kiện, xoá khỏi cluster là có nhịp, và pod ĐANG PHỤC VỤ
// thì không được đụng vào. Ba mệnh đề đó phải đọc được cạnh nhau.
//
// Helper dùng chung (`newTestReaper`, `seedFreePod`, `seedSession`, `imageMoi`,
// `imageCu`, `fakePods.addPodWithImage`) nằm ở reaper_test.go — cùng package.

// TestTang4KhongDungPodLechImageDangClaimed — CA QUAN TRỌNG NHẤT CỦA A8.
//
// Một lượt deploy KHÔNG ĐƯỢC cướp phiên của người đang học. Pod dưới đây lệch
// image y hệt ca `TestTang4RutPodAmLechImage`, khác đúng một điều: nó ĐANG PHỤC
// VỤ một session. Người đó đang gõ trong terminal; image cũ hay mới không còn là
// việc của họ nữa — pod đã chạy rồi, và đổi nó dưới chân họ không sửa được gì.
//
// Vì sao ca này phải tồn tại dù code hiện tại chỉ quét `pool:free`: thứ bảo vệ
// pod claimed là một tính chất KHÔNG được phát biểu ở đâu cả — "tầng 4 chỉ đọc
// `pool:free`". Ai mở rộng phép so image sang `pods.List` (rất tự nhiên: `sweep`
// ĐÃ cầm sẵn danh sách pod đầy đủ, dùng nó thì tiết kiệm đúng một lượt LRANGE)
// sẽ quét trúng cả pod đang claimed — và hỏng theo kiểu tệ nhất: mọi test khác
// vẫn xanh, log vẫn nói "đã rút pod lệch image", còn sinh viên thì mất phiên
// giữa chừng. Ca này là thứ duy nhất đỏ.
//
// Pod cố ý GIÀ hơn `orphanGrace` để cửa-sổ-sinh-ra không phải thứ đang che nó:
// cái che nó phải là hash `pod:{name}` tồn tại, không phải tuổi.
func TestTang4KhongDungPodLechImageDangClaimed(t *testing.T) {
	r, pods, sessions, rdb, met := newTestReaper(t, imageMoi)
	ctx := context.Background()

	const (
		name = "sandbox-dangclaim01"
		sid  = "sess-dangclaim01"
	)
	pods.addPodWithImage(name, 10*time.Minute, corev1.PodRunning, imageCu)
	// `seedClaimedPod` (reaper_test.go) dựng hash pod + `pool:claimed`, nhưng
	// KHÔNG dựng `session:{id}` — nó được viết cho tầng 2c, nơi vắng session
	// chính là điều kiện của ca. Ở đây phải có session SỐNG, nếu không tầng 2c
	// sẽ dọn pod và ca này xanh vì lý do hoàn toàn khác.
	seedClaimedPod(t, rdb, name, sid)
	seedSession(t, rdb, sid, name, "RUNNING")

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if got := pods.deletedNames(); len(got) != 0 {
		t.Fatalf("xoá %v — POD ĐANG CLAIMED. Một lượt deploy vừa giết phiên của người đang học.", got)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolClaimed).Result(); n != 1 {
		t.Fatalf("LLEN pool:claimed = %d, cần 1 — index của phiên đang chạy bị rút mất", n)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolQuarantine).Result(); n != 0 {
		t.Fatalf("LLEN pool:quarantine = %d, cần 0 — pod đang phục vụ bị đẩy sang hàng chờ xoá", n)
	}
	podKey, _ := rediskeys.Pod(name)
	if n, _ := rdb.Exists(ctx, podKey).Result(); n != 1 {
		t.Fatalf("hash %s biến mất — gateway sẽ không authz được phiên đang chạy", podKey)
	}
	sessKey, _ := rediskeys.Session(sid)
	if n, _ := rdb.Exists(ctx, sessKey).Result(); n != 1 {
		t.Fatalf("hash %s biến mất — phiên bị dọn", sessKey)
	}
	if got := sessions.failedIDs(); len(got) != 0 {
		t.Fatalf("MarkFailed %v — phiên đang khoẻ bị đánh FAILED vì pod chạy image cũ", got)
	}
	if v := testutil.ToFloat64(met.ReaperStaleImagePodsTotal); v != 0 {
		t.Fatalf("dlp_reaper_stale_image_pods_total = %v, cần 0 — pod claimed KHÔNG nằm trong tầm của A8", v)
	}
}

// TestTang4LechImageRutHetNhungXoaTheoNhip — vế NHỊP của A8.
//
// TÁCH HAI VIỆC: rút khỏi phục vụ (vô điều kiện) và xoá khỏi cluster (có nhịp).
// Đây là ca duy nhất phát biểu ranh giới đó thành số.
//
// Hình dạng đang tái hiện là hình dạng ĐÃ ĐO trên cụm lab: 2026-09-07T07:37:35Z,
// ba dòng "pod ấm chạy image CŨ" nằm trong 30 mili-giây (…35.038 / …35.053 /
// …35.067) sau khi đổi `SANDBOX_IMAGE` p10a → p13ide — ba lượt teardown đồng
// thời trên MỘT node Sysbox. Với `POOL_TARGET=3` là ba; một cụm đặt lớn hơn sẽ
// là hàng chục, và đó đúng là hình dạng đã dẫn tới `FailedKillPod` ở P12 §5b.
func TestTang4LechImageRutHetNhungXoaTheoNhip(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t, imageMoi)
	ctx := context.Background()

	names := []string{"sandbox-lech0000a1", "sandbox-lech0000b2", "sandbox-lech0000c3"}
	for _, n := range names {
		pods.addPodWithImage(n, time.Minute, corev1.PodRunning, imageCu)
		seedFreePod(t, rdb, n)
	}

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	// VẾ 1 — RÚT: không pod lệch nào còn được quảng cáo. Đây là vế mà A8 tồn tại
	// vì nó; nếu vế này nhượng bộ cho cái trần nhịp thì người claim tiếp theo vẫn
	// nhận pod cũ, tức là chưa vá được gì.
	if n, _ := rdb.LLen(ctx, rediskeys.PoolFree).Result(); n != 0 {
		t.Fatalf("LLEN pool:free = %d, cần 0 — pod lệch image còn trong pool là pod SẼ ĐƯỢC PHÁT cho người tiếp theo", n)
	}
	if v := testutil.ToFloat64(met.ReaperStaleImagePodsTotal); v != 3 {
		t.Fatalf("dlp_reaper_stale_image_pods_total = %v, cần 3 — counter đếm pod bị LOẠI KHỎI PHỤC VỤ, không phải pod bị xoá", v)
	}

	// VẾ 2 — NHỊP: đúng `maxStaleEvictPerSweep` lượt Delete trong vòng này.
	if got := pods.deletedNames(); len(got) != maxStaleEvictPerSweep {
		t.Fatalf("xoá %d pod (%v) trong MỘT vòng, trần là %d — đây là cơn bão teardown đã đo được 2026-09-07",
			len(got), got, maxStaleEvictPerSweep)
	}

	// VẾ 3 — phần hoãn phải nằm trong một list CÓ TẦNG PHỦ, không được thành rác.
	q, _ := rdb.LRange(ctx, rediskeys.PoolQuarantine, 0, -1).Result()
	if len(q) != len(names)-maxStaleEvictPerSweep {
		t.Fatalf("pool:quarantine = %v, cần %d phần tử — pod hoãn xoá mà không vào list nào là rò khe quota vĩnh viễn",
			q, len(names)-maxStaleEvictPerSweep)
	}
	// Hash của nó phải CÒN: xoá hash trước khi xoá Pod đẩy nó xuống tầng 2a, thứ
	// chỉ chạm tới sau orphanGrace (5 phút) — giữ khe quota lâu hơn hẳn so với
	// việc để tầng 3 dọn ở vòng sweep kế tiếp.
	qKey, _ := rediskeys.Pod(q[0])
	if n, _ := rdb.Exists(ctx, qKey).Result(); n != 1 {
		t.Fatalf("hash %s đã bị xoá — pod hoãn rơi xuống tầng 2a, phải chờ orphanGrace mới được dọn", qKey)
	}
}

// TestTang4PodLechImageHoanDuocDonOVongSau — vế còn lại của cùng một hợp đồng.
//
// Trần nhịp chỉ đúng nếu phần hoãn THẬT SỰ được dọn. Không có ca này thì một
// hiện thực "rút rồi bỏ đó" cũng xanh ở ca trên, và mỗi lần đổi image để lại
// vĩnh viễn `POOL_TARGET − maxStaleEvictPerSweep` khe quota — đúng chế độ hỏng
// mà tầng 3 tồn tại để chặn, chỉ là đi qua một cửa mới.
//
// Ca này cũng là thứ gác THỨ TỰ trong `sweep()`: nếu `drainQuarantine` chạy SAU
// `sweepDeadFreePods` thì cả ba pod bị xoá ngay trong vòng ĐẦU, ca trên đỏ, và
// cái trần thành trang trí.
func TestTang4PodLechImageHoanDuocDonOVongSau(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t, imageMoi)
	ctx := context.Background()

	names := []string{"sandbox-hoan0000a1", "sandbox-hoan0000b2", "sandbox-hoan0000c3"}
	for _, n := range names {
		pods.addPodWithImage(n, time.Minute, corev1.PodRunning, imageCu)
		seedFreePod(t, rdb, n)
	}

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep vòng 1: %v", err)
	}
	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep vòng 2: %v", err)
	}

	if got := pods.deletedNames(); len(got) != len(names) {
		t.Fatalf("sau hai vòng mới xoá %d/%d pod (%v) — phần hoãn không bao giờ được dọn là rò khe quota",
			len(got), len(names), got)
	}
	if n, _ := rdb.LLen(ctx, rediskeys.PoolQuarantine).Result(); n != 0 {
		t.Fatalf("LLEN pool:quarantine = %d, cần 0", n)
	}
	// Counter KHÔNG được tăng thêm ở vòng 2: pod hoãn đã được đếm lúc bị RÚT.
	// Đếm lại lúc xoá là biến MỘT hiện tượng (đổi image một lần) thành hai con
	// số, và tỉ lệ giữa chúng phụ thuộc trần nhịp chứ không phụ thuộc sự thật.
	if v := testutil.ToFloat64(met.ReaperStaleImagePodsTotal); v != 3 {
		t.Fatalf("dlp_reaper_stale_image_pods_total = %v, cần 3 — pod hoãn bị đếm hai lần", v)
	}
	if v := testutil.ToFloat64(met.ReaperQuarantineReapedTotal); v != float64(len(names)-maxStaleEvictPerSweep) {
		t.Fatalf("dlp_reaper_quarantine_reaped_total = %v, cần %d", v, len(names)-maxStaleEvictPerSweep)
	}
}

// TestTang4PodCuKhongCoNhanImageVanDocDuocTuSpec — ca "pod dựng TRƯỚC bản vá".
//
// Quyết định thiết kế mà ca này gác: A8 đọc `pod.spec.containers[sandbox].image`
// — trường Kubernetes BẮT BUỘC — chứ KHÔNG đọc một label/annotation do
// orchestrator tự đóng dấu lúc tạo pod. Hệ quả trực tiếp: **không tồn tại "pod
// không có nhãn ảnh"**. Mọi pod đang chạy, kể cả pod dựng bởi một bản
// orchestrator cũ hơn bản vá này, đều trả lời được câu hỏi "mày đang chạy image
// nào".
//
// Vì sao KHÔNG đóng dấu thêm nhãn (dù nó là gợi ý tự nhiên): image đã nằm trong
// spec rồi, nên một nhãn mang cùng giá trị là trường SUY RA ĐƯỢC — hai nguồn cho
// một sự thật, và nguồn thứ hai sẽ trôi. Ca trôi cụ thể: ai đó `kubectl set
// image` hay một mutating webhook đổi spec, nhãn giữ nguyên, và A8 đọc nhãn sẽ
// kết luận NGƯỢC với hiện thực. `no-derived-fields`, đúng nghĩa đen.
//
// `addPodWithImage` cố ý KHÔNG đặt annotation nào — đó chính là "pod cũ".
func TestTang4PodCuKhongCoNhanImageVanDocDuocTuSpec(t *testing.T) {
	r, pods, _, rdb, met := newTestReaper(t, imageMoi)
	ctx := context.Background()

	const name = "sandbox-podcu00001"
	pods.addPodWithImage(name, time.Minute, corev1.PodRunning, imageCu)
	seedFreePod(t, rdb, name)

	// Tiền đề của ca: pod KHÔNG mang annotation nào. Khẳng định tường minh để
	// một bản sau lỡ thêm dấu vào `addPodWithImage` sẽ làm ca này đỏ thay vì âm
	// thầm biến nó thành bản sao của TestTang4RutPodAmLechImage.
	got, err := pods.Get(ctx, name)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got.Annotations) != 0 {
		t.Fatalf("pod có annotation %v — ca này phải dựng POD CŨ, không mang dấu nào", got.Annotations)
	}

	if err := r.sweep(ctx); err != nil {
		t.Fatalf("sweep: %v", err)
	}

	if d := pods.deletedNames(); len(d) != 1 || d[0] != name {
		t.Fatalf("xoá %v, cần [%s] — pod cũ không đọc được image thì A8 mù đúng với lứa pod cần rollout nhất", d, name)
	}
	if v := testutil.ToFloat64(met.ReaperStaleImagePodsTotal); v != 1 {
		t.Fatalf("dlp_reaper_stale_image_pods_total = %v, cần 1", v)
	}
}
