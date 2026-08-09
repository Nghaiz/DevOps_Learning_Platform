# `internal/pool` — warm-pool claim (spike 1.A-2)

Sản phẩm của spike 1.A-2 (phase-1, rủi ro R2 score 16): chứng minh claim atomic
dưới đua 200 goroutine trên **Redis thật**. Warm-pool manager (B2) xây quanh
`Claim()`; file này ghi lại các gotcha đo được để B2/B3 không dẫm lại.

## Kết quả đo (2026-08-09, Redis 7-alpine từ docker-compose)

- `N_POOL=50`, `N_G=200`, `-race -count=20`: **20/20 xanh** — đúng 50 thành
  công, 150 `ErrPoolEmpty`, **0 podName trùng**, `LLEN pool:free == 0`,
  `LLEN pool:claimed == 50`.
- 200 goroutine dồn xuất phát cùng lúc (channel gate) claim hết 50 pod trong
  ~270ms trên máy dev — đường claim không phải nút cổ chai của mục tiêu < 1s.

## Gotcha (A5) — trả giá một lần, ghi lại cho mọi lần sau

### 1. `EVALSHA` sau khi Redis restart trả `NOSCRIPT`

Script cache của Redis sống trong RAM: restart (hoặc `SCRIPT FLUSH`) là trống.
Client chỉ gọi `EVALSHA` trần sẽ nhận `NOSCRIPT No matching script` **đúng vào
lúc hệ thống vừa hồi phục** — thời điểm tệ nhất để claim bắt đầu lỗi.

Cách xử lý trong repo: dùng `redis.NewScript(...)` của go-redis và gọi qua
`script.Run(...)`. `Run` thử `EVALSHA` bằng SHA1 tính sẵn, bắt lỗi có prefix
`NOSCRIPT` và tự phát `EVAL` (nạp lại script) **trong cùng lời gọi** — không
mất claim nào. `TestClaimSurvivesScriptFlush` chứng minh trên Redis thật bằng
`SCRIPT FLUSH` giữa hai lượt claim.

Đừng tự viết vòng `EVALSHA`/`EVAL` tay — go-redis đã làm đúng và có test.

### 2. Lua `return nil` tới Go là `redis.Nil`, không phải chuỗi rỗng

`claim.lua` trả `nil` khi pool rỗng. Qua RESP nó thành bulk-nil, go-redis map
thành lỗi `redis.Nil`. Phải `errors.Is(err, redis.Nil)` để rẽ cold-path —
so sánh `pod == ""` không bao giờ đúng vì `.Text()` đã trả lỗi trước.
`Claim()` dịch nó thành sentinel `ErrPoolEmpty` để caller không phải biết
chi tiết RESP.

### 3. Key `pod:{name}` dựng động trong script ⇒ CROSSSLOT trên Cluster (D10)

Tên pod chỉ biết **sau** `LMOVE`, nên `pod:{name}` không khai báo được trong
`KEYS[]` — script dựng nó bằng `'pod:' .. pod`. Trên Redis đơn (P1) điều này
hợp lệ. Trên Redis Cluster, script chạm key ngoài `KEYS[]` sẽ lỗi
`CROSSSLOT`/không định tuyến được. Nếu P3 cân nhắc Cluster: phải hash-tag
`{dlp}` toàn bộ namespace để mọi key về một slot — ghi ở
`docs/redis-key-namespace.md` §CROSSSLOT.

Hệ quả kèm theo: prefix `pod:` bị lặp ở `claim.lua` (ngoài
`services/shared/rediskeys`). Đổi namespace pod thì phải sửa **cả hai chỗ** —
vector test không gác được chuỗi bên trong file Lua.

### 4. FIFO là quyết định, không phải mặc định

Quy ước: replenish `RPUSH pool:free` (pod mới vào bên phải), claim
`LMOVE ... LEFT RIGHT` (pop bên trái) ⇒ pod ngồi lâu nhất ra trước, pod hỏng
lộ sớm (D6). B2 replenish bằng `LPUSH` là lật ngược thành LIFO trong im lặng —
`TestClaimFIFO` gác phía claim, B2 phải tự gác phía push.

### 5. Test chạy trên DB 15, không phải DB 0

Test `FLUSHDB` trước mỗi lượt. Nếu `REDIS_URL` trỏ DB 0 (nơi dev compose có
thể chứa dữ liệu thật), helper tự chuyển sang DB 15. `REDIS_URL` trống →
`t.Skip` **có log rõ** — không giả vờ xanh (A4).

## Chạy test

```bash
docker compose up -d redis
# lấy mật khẩu từ .env
REDIS_URL="redis://:${REDIS_PASSWORD}@127.0.0.1:6379/15" \
  go test ./internal/pool/... -race -count=20
```
