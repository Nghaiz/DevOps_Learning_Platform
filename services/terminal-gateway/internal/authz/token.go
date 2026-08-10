package authz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/Nghaiz/DevOps_Learning_Platform/services/shared/rediskeys"
	"github.com/go-jose/go-jose/v4"
)

// SandboxAudience là `aud` của sandbox token.
//
// ⛔ `aud` LÀ THỨ DUY NHẤT tách sandbox token khỏi access token `aud=orchestrator`
// mà BFF đang mint cho gRPC. Cả hai ký bằng CÙNG một khoá (D15), nên chữ ký
// không phân biệt được chúng. Bỏ check này = một token gọi orchestrator mở được
// shell của chính chủ nó (luật 6).
const SandboxAudience = "gateway"

// ErrInvalidToken gói mọi lỗi verify. Cố ý KHÔNG phơi lý do cụ thể ra caller:
// tầng HTTP trả 401 như nhau cho hết thảy, và một thông báo tách "chữ ký sai"
// khỏi "hết hạn" là một oracle nhỏ cho người đang dò.
//
// Lý do chi tiết vẫn nằm trong chuỗi lỗi (wrap) cho log phía server đọc.
var ErrInvalidToken = errors.New("authz: sandbox token không hợp lệ")

// Claims là phần payload gateway thật sự dùng.
type Claims struct {
	// Subject là userId — vế `token.sub` của bước g.
	Subject string
	// SessionID là `sid` — vế `token.sid` của bước e.
	SessionID string
	// ExpiresAt để tầng trên đặt deadline cho phiên (dùng ở 1.C-3/G7).
	ExpiresAt time.Time
}

// rawClaims phản chiếu payload JWT. camelCase/snake không áp dụng — đây là tên
// claim chuẩn của RFC 7519 cộng `sid` do contract §2 pin.
type rawClaims struct {
	Subject   string   `json:"sub"`
	SessionID string   `json:"sid"`
	Issuer    string   `json:"iss"`
	Audience  audience `json:"aud"`
	ExpiresAt int64    `json:"exp"`
}

// audience nhận CẢ hai dạng hợp lệ của claim `aud` theo RFC 7519 §4.1.3: một
// chuỗi, hoặc một mảng chuỗi.
//
// Không phải chi tiết vụn: bên mint là JS (`jose` của Better Auth) và nó phát
// dạng chuỗi hôm nay. Nếu ai đó thêm audience thứ hai thì payload lặng lẽ đổi
// sang mảng, và một decoder chỉ nhận chuỗi sẽ trả 401 cho MỌI token — một sự cố
// toàn phần sinh ra từ một thay đổi trông vô hại phía web.
type audience []string

func (a *audience) UnmarshalJSON(b []byte) error {
	var one string
	if err := json.Unmarshal(b, &one); err == nil {
		*a = audience{one}
		return nil
	}
	var many []string
	if err := json.Unmarshal(b, &many); err != nil {
		return fmt.Errorf("claim aud không phải chuỗi hay mảng chuỗi: %w", err)
	}
	*a = many
	return nil
}

func (a audience) has(want string) bool {
	for _, v := range a {
		if v == want {
			return true
		}
	}
	return false
}

// KeySource là nguồn khoá công khai theo `kid`. JWKSCache hiện thực nó; test
// thay bằng một bộ khoá cố định.
type KeySource interface {
	KeyByID(ctx context.Context, kid string) (jose.JSONWebKey, error)
}

// Verifier kiểm sandbox token theo contract §2.
type Verifier struct {
	keys   KeySource
	issuer string
	now    func() time.Time
}

// NewVerifier dựng verifier. `issuer` là giá trị `iss` bắt buộc khớp
// (GATEWAY_TOKEN_ISSUER — chính BETTER_AUTH_URL của apps/web).
func NewVerifier(keys KeySource, issuer string) *Verifier {
	return &Verifier{keys: keys, issuer: issuer, now: time.Now}
}

// SetClock thay đồng hồ. Chỉ dùng trong test — ca "token đã hết hạn" mà phải
// `time.Sleep` thật là một test chậm và bấp bênh.
func (v *Verifier) SetClock(now func() time.Time) { v.now = now }

// Verify phân giải và kiểm token, trả claims khi hợp lệ.
//
// Thứ tự có chủ ý: ÉP THUẬT TOÁN TRƯỚC, chạm khoá sau.
func (v *Verifier) Verify(ctx context.Context, raw string) (*Claims, error) {
	// ⛔ Danh sách alg truyền vào ParseSignedCompact là CỔNG CHỐNG alg-confusion,
	// và nó phải nằm ở ĐÂY — trước khi có bất kỳ khoá nào trong tay.
	//
	// Đọc `alg` từ header token rồi chọn cách verify theo nó là lỗ hổng kinh
	// điển: `alg:"none"` bỏ qua chữ ký, và `alg:"HS256"` biến chính khoá CÔNG
	// KHAI Ed25519 (ai cũng tải được từ /api/auth/jwks) thành secret HMAC — kẻ
	// tấn công tự ký được token hợp lệ. go-jose v4 bắt buộc truyền allowlist
	// này chính vì lý do đó; đừng nới nó ra.
	sig, err := jose.ParseSignedCompact(raw, []jose.SignatureAlgorithm{jose.EdDSA})
	if err != nil {
		return nil, fmt.Errorf("%w: parse (alg phải là EdDSA): %w", ErrInvalidToken, err)
	}
	if len(sig.Signatures) != 1 {
		// JWS compact luôn có đúng một chữ ký. Khác đi nghĩa là token được dựng
		// bằng tay để thử một đường parse khác.
		return nil, fmt.Errorf("%w: %d chữ ký, cần đúng 1", ErrInvalidToken, len(sig.Signatures))
	}

	kid := sig.Signatures[0].Header.KeyID
	if kid == "" {
		return nil, fmt.Errorf("%w: header thiếu kid", ErrInvalidToken)
	}

	key, err := v.keys.KeyByID(ctx, kid)
	if err != nil {
		return nil, fmt.Errorf("%w: lấy khoá cho kid %q: %w", ErrInvalidToken, kid, err)
	}

	payload, err := sig.Verify(key)
	if err != nil {
		return nil, fmt.Errorf("%w: chữ ký sai: %w", ErrInvalidToken, err)
	}

	var c rawClaims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, fmt.Errorf("%w: payload không phải JSON hợp lệ: %w", ErrInvalidToken, err)
	}

	if !c.Audience.has(SandboxAudience) {
		return nil, fmt.Errorf("%w: aud=%v, cần %q (token aud=orchestrator KHÔNG mở được shell)",
			ErrInvalidToken, []string(c.Audience), SandboxAudience)
	}
	if c.Issuer != v.issuer {
		return nil, fmt.Errorf("%w: iss=%q, cần %q", ErrInvalidToken, c.Issuer, v.issuer)
	}
	if c.ExpiresAt == 0 {
		// Không có `exp` = token vĩnh viễn. Fail-closed: contract §2 nói token
		// dùng lại được TRONG TTL, và TTL đó chính là `exp`.
		return nil, fmt.Errorf("%w: thiếu exp", ErrInvalidToken)
	}
	exp := time.Unix(c.ExpiresAt, 0)
	if !v.now().Before(exp) {
		return nil, fmt.Errorf("%w: hết hạn lúc %s", ErrInvalidToken, exp.UTC().Format(time.RFC3339))
	}
	if c.Subject == "" {
		return nil, fmt.Errorf("%w: thiếu sub", ErrInvalidToken)
	}
	// `sid` đi thẳng vào rediskeys.Session() ở bước f. Chặn ở đây thay vì để
	// nó vỡ dưới đó: "abc:ws" sẽ dựng ra key `session:abc:ws` — chính bộ đếm WS
	// của một session khác. Cùng cổng pattern mà orchestrator dùng lúc ghi, nên
	// một sid hợp lệ không bao giờ bị chặn nhầm ở đây.
	if err := rediskeys.ValidateID(c.SessionID); err != nil {
		return nil, fmt.Errorf("%w: sid: %w", ErrInvalidToken, err)
	}
	// Cùng cổng cho `sub`: giá trị này được so NGUYÊN VĂN với hash.userId ở bước
	// g, và orchestrator đã đẩy userId qua đúng validator này lúc ghi.
	if err := rediskeys.ValidateID(c.Subject); err != nil {
		return nil, fmt.Errorf("%w: sub: %w", ErrInvalidToken, err)
	}

	return &Claims{Subject: c.Subject, SessionID: c.SessionID, ExpiresAt: exp}, nil
}
