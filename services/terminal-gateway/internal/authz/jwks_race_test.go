package authz_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
)

// TestColdCacheDongThoiKhongTraKidNotFound — hồi quy cho lỗi ĐO ĐƯỢC TRÊN CỤM
// ngày 2026-08-16 khi chạy ô AC-H6 (bão nối-lại sau rollout gateway, n=14).
//
// ⛔ TRIỆU CHỨNG NGOÀI ĐỜI: 8 lượt handshake nhận **401 UNAUTHENTICATED** với
// lý do `JWKS không có kid này`, dồn trong ~18ms trên CẢ HAI pod gateway vừa
// khởi động — trong khi token hoàn toàn hợp lệ và JWKS hoàn toàn bình thường.
// Log đọc ra như một sự cố xoay khoá, nên nó dẫn người debug đi sai hướng.
//
// ⛔ CƠ CHẾ: sàn chống-DoS `minGap` từng được kiểm ở NGOÀI singleflight.
//  1. Pod mới ⇒ cache rỗng, `lastAttempt` = zero.
//  2. N client nối lại cùng lúc, tất cả miss cache, tất cả gọi refresh.
//  3. Goroutine đầu vào singleflight, đặt `lastAttempt = now`, bắt đầu fetch.
//  4. N−1 goroutine còn lại đọc `lastAttempt` VỪA BỊ ĐẶT ⇒ "tooSoon" ⇒ bỏ về
//     NGAY, không chờ lượt fetch đang bay.
//  5. Chúng tra lại cache — vẫn rỗng — và trả ErrKeyNotFound ⇒ 401.
//
// ⛔ VÌ SAO TEST NÀY CẦN `SetDelay`: không có độ trễ, httptest trả trong
// micro-giây nên goroutine thứ hai gần như luôn thấy cache đã đầy, và bug là
// BẤT KHẢ QUAN SÁT. Độ trễ chính là cửa sổ đua; bỏ nó đi thì test này xanh
// trên cả bản hỏng lẫn bản đúng, tức không đo gì.
//
// ⛔ VÀ VÌ SAO `minGap` PHẢI LÀ GIÁ TRỊ PRODUCTION, KHÔNG PHẢI 0: với minGap=0
// nhánh "tooSoon" không bao giờ chạy, nên bản hỏng cũng xanh. Chính giá trị
// production mới dựng lại được điều kiện của lỗi.
func TestColdCacheDongThoiKhongTraKidNotFound(t *testing.T) {
	const soClient = 14 // đúng n của lượt đo AC-H6 trên cụm

	signer := testjwt.NewSigner(t, "kid-1")
	srv := testjwt.NewJWKSServer(t, signer)
	srv.SetDelay(150 * time.Millisecond)

	cache := authz.NewJWKSCache(srv.URL,
		authz.WithMinRefetchInterval(authz.DefaultMinRefetchInterval)) // giá trị THẬT
	v := authz.NewVerifier(cache, testjwt.Issuer)

	// Hàng rào để mọi goroutine xuất phát cùng lúc — bão thật đồng pha vì FE
	// không jitter, nên test phải tái lập đúng tính đồng pha đó.
	var batDau sync.WaitGroup
	batDau.Add(1)
	var xong sync.WaitGroup
	loi := make([]error, soClient)

	for i := 0; i < soClient; i++ {
		xong.Add(1)
		go func(i int) {
			defer xong.Done()
			batDau.Wait()
			_, err := v.Verify(context.Background(), signer.Mint(testjwt.SandboxClaims("u", "s")))
			loi[i] = err
		}(i)
	}
	batDau.Done()
	xong.Wait()

	var hong int
	for i, err := range loi {
		if err != nil {
			hong++
			if hong == 1 {
				t.Errorf("client %d nhận lỗi cho token HỢP LỆ: %v", i, err)
			}
		}
	}
	if hong > 0 {
		t.Fatalf("%d/%d client bị từ chối trên cache lạnh — đây là lỗi 401 lúc rollout, "+
			"không phải xoay khoá", hong, soClient)
	}

	// Vế thứ hai, và nó bắt buộc: sửa cuộc đua KHÔNG được trả giá bằng việc bỏ
	// singleflight. Nếu N client cùng lúc sinh N lượt fetch thì ta chỉ đổi một
	// lỗi 401 lấy một cơn bơm request vào apps/web đúng lúc nó vừa khởi động.
	if hits := srv.Hits(); hits != 1 {
		t.Fatalf("%d client đồng thời gây %d lượt fetch JWKS, muốn ĐÚNG 1 — singleflight hỏng", soClient, hits)
	}
}

// Đối chứng: cổng chống-DoS vẫn phải chặn khi các lượt đi LẦN LƯỢT (không đồng
// thời). Đây là vế mà `TestKidLaKhongThanhMayBomRequest` gác; ca này khẳng định
// việc chuyển cổng vào trong singleflight KHÔNG làm mất nó, vì hai lượt tuần tự
// không chia sẻ chung một lượt `Do` nào.
func TestSanRefetchVanChanKhiTuanTu(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	srv := testjwt.NewJWKSServer(t, signer)
	cache := authz.NewJWKSCache(srv.URL, authz.WithMinRefetchInterval(time.Minute))
	v := authz.NewVerifier(cache, testjwt.Issuer)

	// Nạp cache một lần bằng token hợp lệ.
	if _, err := v.Verify(context.Background(), signer.Mint(testjwt.SandboxClaims("u", "s"))); err != nil {
		t.Fatalf("nạp cache lần đầu: %v", err)
	}

	// 30 kid lạ đi TUẦN TỰ: mỗi lượt là một cache-miss mới, singleflight không
	// gộp được vì không lượt nào đang bay. Chỉ sàn thời gian chặn được.
	for i := 0; i < 30; i++ {
		rogue := testjwt.NewSigner(t, "kid-bia-"+string(rune('a'+i%26))+string(rune('a'+i/26)))
		_, _ = v.Verify(context.Background(), rogue.Mint(testjwt.SandboxClaims("u", "s")))
	}

	if hits := srv.Hits(); hits > 1 {
		t.Fatalf("30 kid lạ tuần tự gây %d lượt fetch, muốn ≤ 1 — sàn refetch đã mất khi chuyển vào singleflight", hits)
	}
}
