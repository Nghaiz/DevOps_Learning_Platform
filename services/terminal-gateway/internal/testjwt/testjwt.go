// Package testjwt dựng sandbox token và endpoint JWKS giả cho test.
//
// ⚠ CHỈ DÙNG TRONG TEST. Không package non-test nào được import nó; nó nằm dưới
// `internal/` nên không rò ra ngoài module, và vì chỉ `_test.go` import nên nó
// không bao giờ được link vào binary.
//
// VÌ SAO CẦN NÓ THAY VÌ GỌI apps/web THẬT: hai trong số các ca acceptance quan
// trọng nhất là token mà BFF thật KHÔNG BAO GIỜ mint được —
//   - vế g của luật 10: `sid` của session A nhưng `sub` là user B;
//   - alg-confusion: `alg:"none"` và `alg:"HS256"` ký bằng chính public key.
//
// Không forge được thì hai bước kiểm đó có thể vắng mặt hoàn toàn mà acceptance
// vẫn xanh — đúng loại tautology mà phase-1 §D-17′ phê phán.
package testjwt

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
)

// Issuer là `iss` mặc định của token do package này phát.
const Issuer = "http://localhost:3000"

// Signer giữ một cặp khoá Ed25519 và phục vụ JWKS cho nó.
type Signer struct {
	t      *testing.T
	KeyID  string
	Public ed25519.PublicKey
	priv   ed25519.PrivateKey
}

// NewSigner sinh một cặp khoá mới.
func NewSigner(t *testing.T, keyID string) *Signer {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("sinh khoá Ed25519: %v", err)
	}
	return &Signer{t: t, KeyID: keyID, Public: pub, priv: priv}
}

// JWKS trả body JSON của endpoint /api/auth/jwks cho các signer truyền vào.
//
// Nhận NHIỀU signer để test rotation dựng được trạng thái "JWKS công bố hai kid"
// — chính trạng thái Better Auth đi qua khi xoay khoá.
func JWKS(t *testing.T, signers ...*Signer) []byte {
	t.Helper()
	set := jose.JSONWebKeySet{}
	for _, s := range signers {
		set.Keys = append(set.Keys, jose.JSONWebKey{
			Key:       s.Public,
			KeyID:     s.KeyID,
			Algorithm: string(jose.EdDSA),
			Use:       "sig",
		})
	}
	body, err := json.Marshal(set)
	if err != nil {
		t.Fatalf("marshal JWKS: %v", err)
	}
	return body
}

// JWKSServer dựng một endpoint JWKS thay đổi được giữa chừng.
//
// `hits` đếm số lần endpoint bị gọi — đó là cách DUY NHẤT đo được cổng chống DoS
// refetch: "gặp kid lạ thì refetch" mà không có sàn thời gian sẽ biến gateway
// thành máy bơm request, và một test chỉ kiểm "verify được" không thấy gì cả.
type JWKSServer struct {
	*httptest.Server
	body   func() []byte
	status func() int
	hits   chan struct{}
}

// NewJWKSServer dựng server phục vụ `signers`.
func NewJWKSServer(t *testing.T, signers ...*Signer) *JWKSServer {
	t.Helper()
	body := JWKS(t, signers...)
	js := &JWKSServer{
		body:   func() []byte { return body },
		status: func() int { return http.StatusOK },
		hits:   make(chan struct{}, 1024),
	}
	js.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		select {
		case js.hits <- struct{}{}:
		default:
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(js.status())
		_, _ = w.Write(js.body())
	}))
	t.Cleanup(js.Close)
	return js
}

// SetSigners đổi bộ khoá endpoint công bố (mô phỏng rotation).
func (s *JWKSServer) SetSigners(t *testing.T, signers ...*Signer) {
	t.Helper()
	body := JWKS(t, signers...)
	s.body = func() []byte { return body }
}

// SetStatus ép endpoint trả một mã khác 200 (mô phỏng apps/web chết / 404 vì
// plugin jwt() chưa mount).
func (s *JWKSServer) SetStatus(code int) { s.status = func() int { return code } }

// Hits trả số lần endpoint đã bị gọi từ lúc dựng.
func (s *JWKSServer) Hits() int { return len(s.hits) }

// Claims là payload của một sandbox token.
type Claims struct {
	Subject   string
	SessionID string
	Audience  string
	Issuer    string
	ExpiresAt time.Time
}

// SandboxClaims trả bộ claim hợp lệ mặc định (aud=gateway, hạn 1 giờ nữa).
func SandboxClaims(userID, sessionID string) Claims {
	return Claims{
		Subject:   userID,
		SessionID: sessionID,
		Audience:  "gateway",
		Issuer:    Issuer,
		ExpiresAt: time.Now().Add(time.Hour),
	}
}

func (c Claims) payload() map[string]any {
	p := map[string]any{
		"sub": c.Subject,
		"sid": c.SessionID,
		"iss": c.Issuer,
		"iat": time.Now().Unix(),
	}
	if c.Audience != "" {
		p["aud"] = c.Audience
	}
	if !c.ExpiresAt.IsZero() {
		p["exp"] = c.ExpiresAt.Unix()
	}
	return p
}

// Mint ký token bằng khoá thật của signer (đường hợp lệ).
func (s *Signer) Mint(c Claims) string {
	s.t.Helper()
	return s.MintRaw(c.payload())
}

// MintRaw ký một payload tuỳ ý — cho ca cần bỏ hẳn một claim.
func (s *Signer) MintRaw(payload map[string]any) string {
	s.t.Helper()
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.EdDSA, Key: s.priv},
		(&jose.SignerOptions{}).WithHeader("kid", s.KeyID).WithType("JWT"),
	)
	if err != nil {
		s.t.Fatalf("dựng signer EdDSA: %v", err)
	}
	return s.sign(signer, payload)
}

// MintHS256WithPublicKeyAsSecret forge token `alg:"HS256"` dùng CHÍNH public key
// Ed25519 làm secret HMAC.
//
// Đây là alg-confusion kinh điển và nó khai thác được khi server đọc `alg` từ
// header token rồi chọn cách verify theo đó: public key ai cũng tải được từ
// /api/auth/jwks, nên kẻ tấn công tự ký được token "hợp lệ". Phải trả 401.
func (s *Signer) MintHS256WithPublicKeyAsSecret(c Claims) string {
	s.t.Helper()
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.HS256, Key: []byte(s.Public)},
		(&jose.SignerOptions{}).WithHeader("kid", s.KeyID).WithType("JWT"),
	)
	if err != nil {
		s.t.Fatalf("dựng signer HS256: %v", err)
	}
	return s.sign(signer, c.payload())
}

func (s *Signer) sign(signer jose.Signer, payload map[string]any) string {
	s.t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		s.t.Fatalf("marshal payload: %v", err)
	}
	obj, err := signer.Sign(raw)
	if err != nil {
		s.t.Fatalf("ký payload: %v", err)
	}
	out, err := obj.CompactSerialize()
	if err != nil {
		s.t.Fatalf("serialize compact: %v", err)
	}
	return out
}

// MintAlgNone dựng token `alg:"none"` bằng tay (không thư viện nào chịu ký nó).
func MintAlgNone(t *testing.T, keyID string, c Claims) string {
	t.Helper()
	enc := base64.RawURLEncoding.EncodeToString
	head, err := json.Marshal(map[string]any{"alg": "none", "typ": "JWT", "kid": keyID})
	if err != nil {
		t.Fatalf("marshal header: %v", err)
	}
	body, err := json.Marshal(c.payload())
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	// Chữ ký RỖNG — đó chính là toàn bộ nội dung của `alg:none`.
	return enc(head) + "." + enc(body) + "."
}
