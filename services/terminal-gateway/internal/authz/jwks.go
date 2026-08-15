// Package authz verify sandbox token của handshake WS (bước d–e của
// docs/ws-terminal-protocol.md §3).
//
// KHÔNG CÓ KHOÁ RIÊNG NÀO Ở ĐÂY, và đó là quyết định (phase-1 D13/D15): sandbox
// token ký bằng chính khoá JWKS của Better Auth đang dùng cho `aud=orchestrator`,
// chỉ khác `aud`. Một khoá riêng cho gateway đẻ ra biến env × 4 nơi, một Helm
// secret, và một quy trình xoay vòng thủ công — đổi lấy đúng zero lợi ích, vì
// JWKS đã cho rotation miễn phí.
package authz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
	"golang.org/x/sync/singleflight"
)

// ErrKeyNotFound là "JWKS không công bố `kid` này (kể cả sau khi refetch)".
var ErrKeyNotFound = errors.New("authz: JWKS không có kid này")

const (
	// DefaultCacheTTL là tuổi thọ của một bản JWKS đã fetch. Hết TTL thì lượt
	// verify kế tiếp fetch lại, kể cả khi `kid` đang nằm trong cache.
	//
	// Không để dài hơn: Better Auth xoay khoá bằng cách THÊM kid mới và (sau một
	// thời gian) bỏ kid cũ khỏi JWKS. Cache dài giữ lại một kid đã bị thu hồi.
	DefaultCacheTTL = 5 * time.Minute

	// DefaultMinRefetchInterval là sàn giữa hai lần fetch do "gặp kid lạ".
	//
	// ⛔ ĐÂY MỚI LÀ THỨ ĐÓNG DoS, KHÔNG PHẢI singleflight. singleflight chỉ gộp
	// các lượt fetch ĐỒNG THỜI thành một; nó không cản được một kẻ gửi 1000
	// token với 1000 `kid` khác nhau LẦN LƯỢT — mỗi lượt là một cache-miss mới,
	// singleflight thấy không có lượt nào đang bay, và gateway biến thành máy
	// bơm request vào apps/web. Sàn thời gian này là vế còn lại.
	DefaultMinRefetchInterval = 10 * time.Second

	// DefaultFetchTimeout chặn một apps/web treo kéo theo cả handshake treo.
	DefaultFetchTimeout = 5 * time.Second

	// maxJWKSBytes chặn một endpoint bị chiếm quyền trả 2 GiB JSON làm gateway
	// OOM. JWKS thật của Better Auth cỡ vài trăm byte mỗi khoá.
	maxJWKSBytes = 1 << 20
)

// JWKSCache giữ khoá công khai lấy từ `GATEWAY_JWKS_URL`, đánh index theo `kid`.
//
// Ba tính chất phải giữ cùng lúc, mất một là hỏng:
//  1. Gặp `kid` lạ thì REFETCH — đó là cách duy nhất chịu được rotation của
//     Better Auth mà không phải deploy lại gateway.
//  2. Refetch phải có SÀN thời gian — nếu không, (1) chính là một cần gạt DoS
//     công khai vào apps/web (xem DefaultMinRefetchInterval).
//  3. Fetch đồng thời gộp làm một (singleflight) — 200 handshake cùng lúc sau
//     một lần rotation không được thành 200 request.
type JWKSCache struct {
	url     string
	client  *http.Client
	ttl     time.Duration
	minGap  time.Duration
	group   singleflight.Group
	nowFunc func() time.Time

	mu sync.RWMutex
	// keys là bản JWKS gần nhất, index theo kid.
	keys map[string]jose.JSONWebKey
	// fetchedAt là lúc bản trong `keys` được nạp (cho TTL).
	fetchedAt time.Time
	// lastAttempt là lúc THỬ fetch gần nhất, thành công hay không (cho minGap).
	// Tách khỏi fetchedAt có chủ ý: nếu chỉ đếm lần THÀNH CÔNG thì một apps/web
	// đang chết biến mỗi kid lạ thành một lượt retry mới — đúng lúc web đang yếu
	// nhất thì gateway đạp mạnh nhất.
	lastAttempt time.Time
}

// JWKSOption tinh chỉnh cache. Chỉ dùng trong test — production lấy hằng số ở
// trên, cố ý không phơi ra env (mỗi biến env là 4 nơi phải sửa, G11).
type JWKSOption func(*JWKSCache)

// WithHTTPClient thay client (test dùng httptest.Server).
func WithHTTPClient(c *http.Client) JWKSOption { return func(j *JWKSCache) { j.client = c } }

// WithCacheTTL thay TTL cache.
func WithCacheTTL(d time.Duration) JWKSOption { return func(j *JWKSCache) { j.ttl = d } }

// WithMinRefetchInterval thay sàn refetch.
func WithMinRefetchInterval(d time.Duration) JWKSOption {
	return func(j *JWKSCache) { j.minGap = d }
}

// WithClock thay đồng hồ (test đo hành vi TTL mà không phải ngủ thật).
func WithClock(now func() time.Time) JWKSOption { return func(j *JWKSCache) { j.nowFunc = now } }

// NewJWKSCache dựng cache trỏ tới endpoint JWKS.
func NewJWKSCache(url string, opts ...JWKSOption) *JWKSCache {
	j := &JWKSCache{
		url:     url,
		client:  &http.Client{Timeout: DefaultFetchTimeout},
		ttl:     DefaultCacheTTL,
		minGap:  DefaultMinRefetchInterval,
		nowFunc: time.Now,
		keys:    map[string]jose.JSONWebKey{},
	}
	for _, o := range opts {
		o(j)
	}
	return j
}

// KeyByID trả khoá công khai cho `kid`, refetch khi cần.
func (j *JWKSCache) KeyByID(ctx context.Context, kid string) (jose.JSONWebKey, error) {
	if key, fresh, ok := j.lookup(kid); ok && fresh {
		return key, nil
	}

	if err := j.refresh(ctx); err != nil {
		// Refetch hỏng nhưng cache còn giữ đúng kid → dùng bản cũ.
		//
		// Đây là fallback CÓ CHỦ Ý và được ghi lại, không phải nuốt lỗi
		// (development-principles.md): apps/web sập không được kéo theo mọi
		// terminal ĐANG mở lại của người dùng hợp lệ. Khoá công khai không hết
		// hạn theo đồng hồ; thứ hết hạn là `exp` trong token, và nó vẫn được
		// kiểm đầy đủ ở tầng trên.
		if key, _, ok := j.lookup(kid); ok {
			return key, nil
		}
		return jose.JSONWebKey{}, err
	}

	if key, _, ok := j.lookup(kid); ok {
		return key, nil
	}
	return jose.JSONWebKey{}, fmt.Errorf("%w: %q", ErrKeyNotFound, kid)
}

// lookup trả khoá trong cache. `fresh` = bản cache chưa quá TTL.
func (j *JWKSCache) lookup(kid string) (key jose.JSONWebKey, fresh, ok bool) {
	j.mu.RLock()
	defer j.mu.RUnlock()
	k, ok := j.keys[kid]
	if !ok {
		return jose.JSONWebKey{}, false, false
	}
	return k, j.nowFunc().Sub(j.fetchedAt) < j.ttl, true
}

// refresh fetch lại JWKS, tôn trọng sàn minGap và gộp các lượt đồng thời.
//
// ⛔ SÀN minGap PHẢI NẰM *TRONG* singleflight, KHÔNG PHẢI TRƯỚC NÓ.
//
// Bản trước kiểm `tooSoon` ở NGOÀI `group.Do` rồi `return nil` sớm. Điều đó tạo
// một cuộc đua làm hỏng đúng ca đông người nhất — đo được trên cụm 2026-08-16
// (AC-H6, rollout gateway với 14 phiên):
//
//  1. Pod gateway MỚI khởi động ⇒ `keys` rỗng, `lastAttempt` = zero.
//  2. 14 client nối lại trong cùng ~18ms. Cả 14 cùng miss cache, cùng gọi refresh.
//  3. Goroutine ĐẦU vào `group.Do`, đặt `lastAttempt = now`, bắt đầu fetch HTTP.
//  4. 13 goroutine còn lại đọc `lastAttempt` VỪA BỊ ĐẶT ⇒ `tooSoon` = true ⇒
//     `return nil` NGAY, **không chờ lượt fetch đang bay**.
//  5. Chúng tra lại cache — vẫn rỗng vì fetch chưa xong — và trả `ErrKeyNotFound`.
//  6. Người dùng nhận **401 UNAUTHENTICATED** cho một token HOÀN TOÀN HỢP LỆ.
//
// Triệu chứng ngoài đời: mỗi lần rollout gateway, đợt nối lại đầu tiên ăn 401,
// đốt 2 lượt retry của FE, rồi mới thành công — và những lượt phí ấy lại nuôi
// chính cơn bão rate-limit ở biên mà §H1 mô tả. Log nói "JWKS không có kid này",
// đọc ra như lỗi xoay khoá, trong khi JWKS hoàn toàn bình thường.
//
// Đặt cổng vào TRONG `Do` giữ được cả hai tính chất cùng lúc:
//   - lượt gọi ĐỒNG THỜI cùng chờ đúng một lượt fetch rồi cùng thấy cache đầy;
//   - lượt gọi VỀ SAU (khi lượt trước đã xong) vẫn bị sàn minGap chặn, nên "kid
//     lạ" vẫn không thành cần gạt DoS vào apps/web.
func (j *JWKSCache) refresh(ctx context.Context) error {
	_, err, _ := j.group.Do("fetch", func() (any, error) {
		// Cổng chống DoS: chỉ chặn lượt fetch MỚI, và vì nó nằm trong singleflight
		// nên nó không bao giờ chặn nhầm một caller đang chờ lượt fetch hiện hành.
		j.mu.RLock()
		tooSoon := j.nowFunc().Sub(j.lastAttempt) < j.minGap
		j.mu.RUnlock()
		if tooSoon {
			// Không phải lỗi hạ tầng — cổng đang làm đúng việc. Caller sẽ tra lại
			// cache và trả ErrKeyNotFound nếu thật sự không có kid.
			return nil, nil
		}

		// Ghi lastAttempt TRƯỚC khi gọi mạng: một apps/web treo tới timeout
		// không được biến thành một lượt thử mới ngay khi lượt này bỏ cuộc.
		j.mu.Lock()
		j.lastAttempt = j.nowFunc()
		j.mu.Unlock()

		keys, err := j.fetch(ctx)
		if err != nil {
			return nil, err
		}

		j.mu.Lock()
		j.keys = keys
		j.fetchedAt = j.nowFunc()
		j.mu.Unlock()
		return nil, nil
	})
	return err
}

func (j *JWKSCache) fetch(ctx context.Context) (map[string]jose.JSONWebKey, error) {
	ctx, cancel := context.WithTimeout(ctx, DefaultFetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, j.url, nil)
	if err != nil {
		return nil, fmt.Errorf("authz: dựng request JWKS: %w", err)
	}
	resp, err := j.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("authz: gọi JWKS %s: %w", j.url, err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		// 404 ở đây nghĩa là plugin jwt() của Better Auth chưa mount, và MỌI
		// thứ xây trên nó đều vô nghĩa. Nói thẳng mã, đừng để nó chìm vào một
		// lỗi parse JSON khó hiểu ở dòng dưới.
		return nil, fmt.Errorf("authz: JWKS %s trả %d (404 = plugin jwt() chưa mount)",
			j.url, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxJWKSBytes))
	if err != nil {
		return nil, fmt.Errorf("authz: đọc JWKS: %w", err)
	}

	var set jose.JSONWebKeySet
	if err := json.Unmarshal(body, &set); err != nil {
		return nil, fmt.Errorf("authz: JWKS không phải JSON hợp lệ: %w", err)
	}
	if len(set.Keys) == 0 {
		return nil, errors.New("authz: JWKS không có khoá nào")
	}

	out := make(map[string]jose.JSONWebKey, len(set.Keys))
	for _, k := range set.Keys {
		// Chỉ nhận khoá CÔNG KHAI. Một JWKS lỡ công bố khoá riêng (bug phía
		// web) không được âm thầm trở thành thứ gateway ký được — gateway không
		// ký gì cả, và giữ nguyên tính chất đó là một phần của D15.
		if !k.IsPublic() {
			continue
		}
		// KeyID rỗng thì không index được: token phải mang `kid` để chọn khoá,
		// và "khoá duy nhất nên khỏi cần kid" là giả định vỡ ngay lần rotation
		// đầu tiên (lúc JWKS có ĐÚNG hai khoá).
		if k.KeyID == "" {
			continue
		}
		out[k.KeyID] = k
	}
	if len(out) == 0 {
		return nil, errors.New("authz: JWKS không có khoá công khai nào kèm kid")
	}
	return out, nil
}
