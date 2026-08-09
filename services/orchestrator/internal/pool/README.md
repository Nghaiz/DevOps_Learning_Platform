# `internal/pool` — warm-pool claim (spike 1.A-2)

Sản phẩm của spike 1.A-2 (phase-1, rủi ro R2 score 16): chứng minh claim atomic
dưới đua 200 goroutine trên **Redis thật**. Warm-pool manager (B2) xây quanh
`Claim()`; file này ghi lại các gotcha đo được để B2/B3 không dẫm lại.

## Kết quả đo (2026-08-09, Redis 7-alpine từ docker-compose)

- `N_POOL=50`, `N_G=200`, `-race -count=20`: **20/20 xanh** — đúng 50 thành
  công, 150 `ErrPoolEmpty`, `LLEN pool:free == 0`, `LLEN pool:claimed == 50`.
- 200 goroutine dồn xuất phát cùng lúc (channel gate) claim hết 50 pod trong
  ~180ms trên máy dev — đường claim không phải nút cổ chai của mục tiêu < 1s.

**Test đua này gác được cái gì (đọc trước khi tin nó):** mọi lệnh trong một
script Lua đều atomic, nên **không thể** làm mất tính atomic bằng cách sửa nội
dung script — mutation `LMOVE` → `LPOP`+`RPUSH` vẫn cho nó xanh. Thứ nó thật sự
gác là refactor đưa các lệnh ghi **ra ngoài** script thành round-trip Go. Hai
tính chất còn lại có test riêng: không double-claim
(`TestClaimRejectsDuplicateInPool`) và không để lại state dở
(`TestClaimRollsBackOnWriteFailure`). `-race` chỉ bắt data race **trong bộ nhớ
Go**, không nói gì về Redis — giá trị nằm ở `-count=20`, không ở `-race`.

## Gotcha (A5) — trả giá một lần, ghi lại cho mọi lần sau

### 0. Redis Lua có ISOLATION, KHÔNG có ROLLBACK — script phải tự hoàn tác

Câu "một script Lua thì hoặc chạy trọn, hoặc chưa chạy" nghe hợp lý và **sai**.
Redis đảm bảo không lệnh nào của client khác chen vào giữa script, nhưng khi một
`redis.call` lỗi giữa chừng thì **mọi ghi trước đó được giữ nguyên và
replicate**. Không có transaction để cuộn lại.

Đo được (fault injection trên Redis thật):

```
EVAL claim.lua … ARGV[7]=99999999999999999
→ ERR invalid expire time in 'expire' command … on @user_script

pool:free      = (rỗng)      ← pod đã rời pool
pool:claimed   = sandbox-aaa
session:s1     = <đủ 9 field>
TTL session:s1 = -1          ← KHÔNG BAO GIỜ HẾT HẠN
```

Caller nhận **error** nên tin là claim thất bại và sẽ retry — trong khi Redis đã
giữ một session vĩnh viễn không TTL, khoá pod đó mãi mãi. Mỗi lần abort ăn mất
một pod khỏi `pool:free`; một nguyên nhân hệ thống (OOM với `noeviction`, một
`pod:{name}` sai kiểu) rút cạn warm-pool trong vài giây và mọi người rơi xuống
cold-path mà không lỗi nào nói vì sao.

Vì vậy mọi ghi trong `claim.lua` đi qua `w()` (`redis.pcall`) và có `undo()` trả
pod về `pool:free`. `TestClaimRollsBackOnWriteFailure` gọi **thẳng script**, bỏ
qua validate của Go, để cơ chế hoàn tác được kiểm độc lập với caller.

Kèm theo: `HGET` trong vòng chọn pod cũng phải là `pcall`. `pod:{name}` sai kiểu
làm `HGET` trả `WRONGTYPE`, và một `redis.call` sẽ abort script **sau** khi
`LMOVE` đã chạy — tạo ra đúng cái pod mồ côi mà phần hoàn tác tồn tại để ngăn.

### 0b. `pool:free` không chống trùng — không kiểm `state` là double-claim

`LIST` cho phép cùng một tên pod nằm hai lần (replenish retry sau timeout,
reaper trả pod hai lần, hai instance cùng replenish). Script tin `pool:free` mù
quáng sẽ claim pod đó hai lần, và **hai sinh viên exec vào cùng một pod** — cả
hai đều qua authz vì hash của mỗi người ghi đúng `userId` của người đó. Đọc file
của nhau, thấy tiến trình của nhau.

`TestConcurrentClaim` **không** bắt được điều này: seed của nó sinh tên duy nhất
nên "0 podName trùng" đến từ seed, không từ script. Ca chứng minh thật là
`TestClaimRejectsDuplicateInPool`.

Guard: script chỉ nhận pod có `pod:{name}.state == "free"`; bản trùng bị đẩy
sang `pool:quarantine` và **không** quay lại pool (đẩy lại là vòng lặp vô tận
trên cùng pod hỏng).

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
