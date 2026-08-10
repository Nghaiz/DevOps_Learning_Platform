package authz_test

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/authz"
	"github.com/Nghaiz/DevOps_Learning_Platform/services/terminal-gateway/internal/testjwt"
)

// newVerifier dựng verifier trỏ vào một endpoint JWKS giả.
func newVerifier(t *testing.T, signers ...*testjwt.Signer) (*authz.Verifier, *testjwt.JWKSServer) {
	t.Helper()
	srv := testjwt.NewJWKSServer(t, signers...)
	return authz.NewVerifier(authz.NewJWKSCache(srv.URL), testjwt.Issuer), srv
}

func TestVerifyChapNhanTokenHopLe(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	token := signer.Mint(testjwt.SandboxClaims("user-a", "sess-a"))
	claims, err := v.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("Verify() lỗi bất ngờ: %v", err)
	}
	if claims.Subject != "user-a" || claims.SessionID != "sess-a" {
		t.Fatalf("claims = %+v, muốn sub=user-a sid=sess-a", claims)
	}
}

// ⛔ CA QUAN TRỌNG NHẤT CỦA G2 (luật 6): `aud` là thứ DUY NHẤT tách sandbox token
// khỏi access token `aud=orchestrator`. Cả hai ký bằng CÙNG một khoá (D15), nên
// chữ ký không phân biệt được. Thiếu check này thì một token cấp để gọi gRPC mở
// được shell.
func TestVerifyTuChoiAudOrchestrator(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	c := testjwt.SandboxClaims("user-a", "sess-a")
	c.Audience = "orchestrator"

	_, err := v.Verify(context.Background(), signer.Mint(c))
	if !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với aud=orchestrator muốn ErrInvalidToken, nhận %v", err)
	}
}

// alg-confusion, vế 1: `alg:"none"` bỏ qua chữ ký hoàn toàn.
func TestVerifyTuChoiAlgNone(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	token := testjwt.MintAlgNone(t, "kid-1", testjwt.SandboxClaims("user-a", "sess-a"))
	if _, err := v.Verify(context.Background(), token); !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với alg=none muốn ErrInvalidToken, nhận %v", err)
	}
}

// alg-confusion, vế 2 — vế NGUY HIỂM: ký HS256 bằng chính public key Ed25519.
// Public key ai cũng tải được từ /api/auth/jwks, nên nếu server đọc `alg` từ
// header token thì kẻ tấn công tự ký được token hợp lệ cho BẤT KỲ sub/sid nào.
func TestVerifyTuChoiHS256KyBangPublicKey(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	token := signer.MintHS256WithPublicKeyAsSecret(testjwt.SandboxClaims("user-a", "sess-a"))
	if _, err := v.Verify(context.Background(), token); !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với alg=HS256(publickey) muốn ErrInvalidToken, nhận %v", err)
	}
}

// ⛔ CA GÁC CHÍNH ALLOWLIST `alg`, và nó tồn tại vì KIỂM ĐỘT BIẾN chỉ ra hai
// test alg-confusion ở trên KHÔNG gác được nó.
//
// Đột biến đã thử: nới danh sách thành `{EdDSA, HS256}`. Cả hai test kia VẪN
// XANH — vì token HS256 khi đó đi tiếp tới `sig.Verify(key)` và chết ở chỗ
// go-jose từ chối dùng một ed25519.PublicKey làm secret HMAC. Tức chúng đo một
// tầng phòng thủ khác (kiểu khoá), không phải tầng mình nghĩ là đang đo. Một
// ngày ai đó truyền raw bytes vào Verify thay vì JSONWebKey là tầng đó biến mất
// mà không test nào đỏ.
//
// Tính chất bám đúng allowlist là THỨ TỰ: token sai alg phải chết TRƯỚC khi
// gateway đi hỏi JWKS. Đếm hit là cách duy nhất nhìn thấy nó — nới allowlist ra
// thì lượt fetch xuất hiện và ca này đỏ.
func TestAlgKhongPhaiEdDSAChetTruocKhiChamKhoa(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	srv := testjwt.NewJWKSServer(t, signer)
	v := authz.NewVerifier(authz.NewJWKSCache(srv.URL), testjwt.Issuer)

	for name, token := range map[string]string{
		"hs256": signer.MintHS256WithPublicKeyAsSecret(testjwt.SandboxClaims("u", "s")),
		"none":  testjwt.MintAlgNone(t, "kid-1", testjwt.SandboxClaims("u", "s")),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := v.Verify(context.Background(), token); !errors.Is(err, authz.ErrInvalidToken) {
				t.Fatalf("Verify() muốn ErrInvalidToken, nhận %v", err)
			}
		})
	}

	if hits := srv.Hits(); hits != 0 {
		t.Fatalf("gateway gọi JWKS %d lần cho token sai alg — allowlist alg không chặn "+
			"trước khi chạm khoá, tức nó đang dựa vào một tầng phòng thủ khác", hits)
	}
}

// Ký bằng khoá KHÁC (kid không có trong JWKS) → 401. Đây là ca chứng minh JWKS
// thật sự được tra, không phải verify suông.
func TestVerifyTuChoiKhoaLa(t *testing.T) {
	genuine := testjwt.NewSigner(t, "kid-1")
	rogue := testjwt.NewSigner(t, "kid-rogue")
	v, _ := newVerifier(t, genuine)

	token := rogue.Mint(testjwt.SandboxClaims("user-a", "sess-a"))
	if _, err := v.Verify(context.Background(), token); !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với kid lạ muốn ErrInvalidToken, nhận %v", err)
	}
}

// Cùng kid nhưng khoá khác — chữ ký sai. Tách khỏi ca trên: ca kia dừng ở
// "không tìm thấy khoá", ca này đi tới tận phép verify chữ ký.
func TestVerifyTuChoiChuKySai(t *testing.T) {
	genuine := testjwt.NewSigner(t, "kid-1")
	impostor := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, genuine)

	token := impostor.Mint(testjwt.SandboxClaims("user-a", "sess-a"))
	if _, err := v.Verify(context.Background(), token); !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với chữ ký sai muốn ErrInvalidToken, nhận %v", err)
	}
}

func TestVerifyTuChoiTokenHetHan(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	c := testjwt.SandboxClaims("user-a", "sess-a")
	c.ExpiresAt = time.Now().Add(-time.Second)

	if _, err := v.Verify(context.Background(), signer.Mint(c)); !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với token hết hạn muốn ErrInvalidToken, nhận %v", err)
	}
}

func TestVerifyTuChoiIssLech(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	c := testjwt.SandboxClaims("user-a", "sess-a")
	c.Issuer = "https://ke-tan-cong.example"

	if _, err := v.Verify(context.Background(), signer.Mint(c)); !errors.Is(err, authz.ErrInvalidToken) {
		t.Fatalf("Verify() với iss lệch muốn ErrInvalidToken, nhận %v", err)
	}
}

// Thiếu claim bắt buộc → 401. `exp` vắng là ca nguy hiểm nhất trong nhóm này:
// nó nghĩa là token VĨNH VIỄN, và một fail-open ở đó không lộ ra bằng bất kỳ
// triệu chứng nào cho tới khi cần thu hồi.
func TestVerifyTuChoiThieuClaimBatBuoc(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	base := func() map[string]any {
		return map[string]any{
			"sub": "user-a", "sid": "sess-a",
			"aud": "gateway", "iss": testjwt.Issuer,
			"exp": time.Now().Add(time.Hour).Unix(),
		}
	}
	for _, missing := range []string{"sub", "sid", "aud", "exp"} {
		t.Run("thieu_"+missing, func(t *testing.T) {
			p := base()
			delete(p, missing)
			if _, err := v.Verify(context.Background(), signer.MintRaw(p)); !errors.Is(err, authz.ErrInvalidToken) {
				t.Fatalf("Verify() thiếu %q muốn ErrInvalidToken, nhận %v", missing, err)
			}
		})
	}
}

// `sid` đi thẳng vào rediskeys.Session() ở bước f. Một sid như "a:ws" dựng ra
// key `session:a:ws` — chính bộ đếm WS của session khác.
func TestVerifyTuChoiSidBeDuocNamespace(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	for _, sid := range []string{"a:ws", "a:pod", "sess/../other", strings.Repeat("x", 65)} {
		t.Run(sid, func(t *testing.T) {
			c := testjwt.SandboxClaims("user-a", sid)
			if _, err := v.Verify(context.Background(), signer.Mint(c)); !errors.Is(err, authz.ErrInvalidToken) {
				t.Fatalf("Verify() với sid=%q muốn ErrInvalidToken, nhận %v", sid, err)
			}
		})
	}
}

// `aud` dạng MẢNG vẫn hợp lệ theo RFC 7519 §4.1.3. Nếu decoder chỉ nhận chuỗi
// thì ngày apps/web thêm một audience thứ hai là ngày MỌI token trả 401 — một
// sự cố toàn phần sinh ra từ một thay đổi trông vô hại phía web.
func TestVerifyChapNhanAudDangMang(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	v, _ := newVerifier(t, signer)

	token := signer.MintRaw(map[string]any{
		"sub": "user-a", "sid": "sess-a",
		"aud": []string{"khac", "gateway"},
		"iss": testjwt.Issuer,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	if _, err := v.Verify(context.Background(), token); err != nil {
		t.Fatalf("Verify() với aud dạng mảng muốn qua, nhận %v", err)
	}
}

// ⛔ ROTATION (D15): xoay khoá Better Auth → gateway phải TỰ refetch và verify
// được token mới, KHÔNG cần restart. Không có tính chất này thì mỗi lần rotation
// là một lần toàn bộ nền tảng 401 cho tới khi ai đó nhớ ra phải redeploy.
func TestVerifyTuRefetchKhiGapKidLa(t *testing.T) {
	old := testjwt.NewSigner(t, "kid-cu")
	srv := testjwt.NewJWKSServer(t, old)
	// minGap = 0: test này đo NHÁNH refetch, nhánh chống-DoS có test riêng ở dưới.
	cache := authz.NewJWKSCache(srv.URL, authz.WithMinRefetchInterval(0))
	v := authz.NewVerifier(cache, testjwt.Issuer)

	if _, err := v.Verify(context.Background(), old.Mint(testjwt.SandboxClaims("u", "s"))); err != nil {
		t.Fatalf("token khoá cũ muốn qua: %v", err)
	}

	// Rotation: JWKS nay công bố CẢ HAI kid (đúng trạng thái Better Auth đi qua).
	fresh := testjwt.NewSigner(t, "kid-moi")
	srv.SetSigners(t, old, fresh)

	if _, err := v.Verify(context.Background(), fresh.Mint(testjwt.SandboxClaims("u", "s"))); err != nil {
		t.Fatalf("token khoá MỚI phải verify được không cần restart, nhận: %v", err)
	}
	// Token cũ vẫn còn hạn và JWKS vẫn công bố kid cũ → vẫn phải qua.
	if _, err := v.Verify(context.Background(), old.Mint(testjwt.SandboxClaims("u", "s"))); err != nil {
		t.Fatalf("token khoá cũ (kid còn công bố) phải vẫn qua, nhận: %v", err)
	}
}

// ⛔ CỔNG CHỐNG DoS. "Gặp kid lạ thì refetch" mà không có sàn thời gian biến
// gateway thành máy bơm request vào apps/web: 200 token với 200 kid bịa ra =
// 200 lượt fetch. singleflight KHÔNG cứu được — các lượt này đi LẦN LƯỢT.
//
// Ca này là lý do JWKSServer phải đếm hit; một test chỉ kiểm "trả 401" sẽ xanh
// trọn vẹn với cả bản không có cổng nào.
func TestKidLaKhongThanhMayBomRequest(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	srv := testjwt.NewJWKSServer(t, signer)
	cache := authz.NewJWKSCache(srv.URL, authz.WithMinRefetchInterval(time.Minute))
	v := authz.NewVerifier(cache, testjwt.Issuer)

	for i := 0; i < 50; i++ {
		rogue := testjwt.NewSigner(t, "kid-bia-"+string(rune('a'+i%26))+string(rune('a'+i/26)))
		_, _ = v.Verify(context.Background(), rogue.Mint(testjwt.SandboxClaims("u", "s")))
	}

	if hits := srv.Hits(); hits > 1 {
		t.Fatalf("50 token kid lạ gây %d lượt fetch JWKS, muốn ≤ 1 — sàn refetch không hoạt động", hits)
	}
}

// apps/web chết KHÔNG được kéo theo mọi phiên hợp lệ đang mở lại. Khoá công
// khai không hết hạn theo đồng hồ; thứ hết hạn là `exp` trong token, và nó vẫn
// được kiểm đầy đủ. Fallback này có chủ ý và được ghi lại — không phải nuốt lỗi.
func TestDungCacheCuKhiJWKSChet(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	srv := testjwt.NewJWKSServer(t, signer)
	cache := authz.NewJWKSCache(srv.URL,
		authz.WithCacheTTL(time.Nanosecond), // ép mọi lượt sau đều phải refetch
		authz.WithMinRefetchInterval(0))
	v := authz.NewVerifier(cache, testjwt.Issuer)

	if _, err := v.Verify(context.Background(), signer.Mint(testjwt.SandboxClaims("u", "s"))); err != nil {
		t.Fatalf("nạp cache lần đầu: %v", err)
	}

	srv.SetStatus(http.StatusInternalServerError)
	if _, err := v.Verify(context.Background(), signer.Mint(testjwt.SandboxClaims("u", "s"))); err != nil {
		t.Fatalf("JWKS chết nhưng kid còn trong cache → phải vẫn verify được, nhận: %v", err)
	}
}

// JWKS 404 = plugin jwt() chưa mount. Không có cache nào để rơi về → 401, và
// thông báo phải nói thẳng mã HTTP để người debug không đi tìm ở tầng WS.
func TestJWKS404NoiThangLyDo(t *testing.T) {
	signer := testjwt.NewSigner(t, "kid-1")
	srv := testjwt.NewJWKSServer(t, signer)
	srv.SetStatus(http.StatusNotFound)

	v := authz.NewVerifier(authz.NewJWKSCache(srv.URL), testjwt.Issuer)
	_, err := v.Verify(context.Background(), signer.Mint(testjwt.SandboxClaims("u", "s")))
	if err == nil {
		t.Fatal("JWKS 404 mà Verify() vẫn qua")
	}
	if !strings.Contains(err.Error(), "404") {
		t.Fatalf("lỗi %q không nhắc mã 404 — người debug sẽ đi tìm nhầm tầng", err)
	}
}
