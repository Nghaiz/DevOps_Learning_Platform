# Redis key namespace v0 — SSOT

Quy ước này có **hai** bản hiện thực. Đây là bản gốc; code phải theo tài liệu, không ngược lại.

| Ngôn ngữ | File | Test |
|---|---|---|
| TypeScript | `packages/shared-types/src/redis-keys.ts` | `redis-keys.test.ts` |
| Go | `services/shared/rediskeys/keys.go` | `keys_test.go` |

**Cả hai suite test đọc chung đúng một file dữ liệu: [`redis-key-vectors.json`](redis-key-vectors.json).**

Đây là điểm quan trọng. Bản đầu tiên của tài liệu này bảo "hai bộ vector được viết giống hệt
nhau một cách cố ý" — nhưng hai bản chép tay thì sửa một bên mà quên bên kia sẽ khiến **cả hai
vẫn xanh**. Đó là guard không gác gì, mà còn tệ hơn không có guard vì nó mua sự tự tin bằng
không có gì. Giờ vector nằm ở một file JSON duy nhất:

- Sửa một bản hiện thực → suite bên đó đỏ ngay.
- Thêm key mới → sửa JSON → **cả hai** suite đỏ tới khi cả hai bắt kịp.
- File nằm cạnh tài liệu này, nên "sửa doc" và "sửa vector" là một thao tác.

> **Bản Go sống ở `services/shared/`, không phải `services/orchestrator/internal/`** (phase-1 D7).
> Package dưới `internal/` của orchestrator thì **module Go khác không import được** — đó là lỗi
> ở compile, không phải rủi ro kiến trúc. Mà terminal-gateway BẮT BUỘC phải đọc `session:{id}`
> cho authz (D2), nên nó phải dùng chung đúng bộ helper này thay vì nối chuỗi tay.

> Vì sao không codegen từ proto: đây là quy ước đặt tên chuỗi, không phải shape dữ liệu đi
> qua dây. Nhét vào proto sẽ bẻ cong mục đích của contract. Đánh đổi được chấp nhận: vài hàm,
> gác bằng test vector song sinh.

## Key

| Key | Kiểu | Nội dung | TTL |
|---|---|---|---|
| `pool:free` | **list** | tên pod đang **WARM**, chờ claim | không |
| `pool:claimed` | **list** | tên pod vừa rời pool, chưa gắn xong session | không |
| `pool:quarantine` | **list** | pod bị `claim.lua` từ chối vì `pod:{name}.state ≠ free` — **không tự quay lại pool** | không |
| `pod:{name}` | hash | state machine của pod (`state`, `sessionId`, `userId`, `tier`, `updatedAt`) | không |
| `session:{id}` | hash | Trạng thái session đang sống — **SSOT** | `SESSION_TTL`, đặt lúc claim |
| `session:{id}:pod` | string | con trỏ session → pod, **sống lâu hơn hash** (xem dưới) | `SESSION_TTL` + grace |
| `session:{id}:ws` | string (counter) | số WS đang mở của session, trần `GATEWAY_MAX_WS_PER_SESSION` | theo `session:{id}` |
| `idem:{userId}:{key}` | string | `idempotency_key` → `session.id` đã tạo (dedupe `CreateSession`), **scope theo user** | 600s |

### `pool:free` là LIST, không phải set (D6)

`LMOVE pool:free pool:claimed LEFT RIGHT` là O(1) **và** FIFO. FIFO quan trọng vì nó khiến pod
**cũ nhất** được dùng trước, nên một pod đã hỏng lặng lẽ trong pool sẽ lộ ở lần claim kế tiếp
thay vì nằm mãi ở đáy một set. Set thì `SPOP` trả phần tử ngẫu nhiên — pod hỏng có thể sống
hàng giờ trước khi ai đó rút trúng nó.

Ba nguồn từng mô tả khác nhau (`redis-key-namespace.md` nói "set/list", `redis-keys.ts` nói
"Sorted set/list", `keys.go` không nói gì). Giờ chốt ở đây: **list**.

### `pool:claimed` không phải để trang trí

`LMOVE` chuyển pod sang `pool:claimed` **trong cùng script Lua** với việc ghi `pod:{name}` và
`session:{id}`. Nếu chỉ `LPOP` khỏi `pool:free`, một lần crash giữa chừng làm pod biến mất khỏi
mọi index và không ai dọn được nó. Nằm trong `pool:claimed` mà không có `session:{id}` tương ứng
là **dấu hiệu để reaper sweep nhận ra pod mồ côi** (phase-1 B7).

> **Nợ đã trả ở B6/B7 (2026-08-09):** `ReapSession` và cả ba tầng của reaper giờ đều `LREM`
> pod khỏi `pool:claimed`, nên list không còn phình vô hạn. **Và nó có thêm một vai trò mới:**
> reaper **tầng 2c** đọc `pool:claimed` để tìm pod mà session đã biến mất — đó là chế độ hỏng
> khi tầng 1 lỡ event keyspace (reaper offline lúc `helm upgrade`/crash), và trước tầng 2c thì
> **không nhánh nào chạm được nó**: hash `pod:{name}` vẫn tồn tại (nên không phải "pod mồ côi"),
> không còn `session:*` để sweep thấy, không nằm trong quarantine. Mỗi mục như vậy là −1
> **vĩnh viễn** trên trần đồng thời (D16).
>
> Đề xuất đổi `pool:claimed` sang SET **vẫn treo** — LIST được chọn cho `pool:free` vì FIFO (D6),
> lý do đó không áp ở đây. Đổi kiểu là đổi contract ⇒ sửa vector + cả hai bản song sinh cùng lúc.

### Vì sao `pod:{name}` mang cả `userId` và `tier`

Hai field này **trùng** với hash `session:{id}` — có chủ ý, và không vi phạm no-derived-fields
vì chúng trả lời một câu hỏi ở một **thời điểm khác**: khi `session:{id}` hết hạn, hash đó
**biến mất**, nhưng reaper vẫn phải ghi được dòng audit `expired` ("phiên của ai, tier nào, kết
thúc lúc nào"). `pod:{name}` là bản ghi duy nhất còn sót lại tại thời điểm đó.

Không có hai field này thì đường đời **phổ biến nhất** của session (hết hạn tự nhiên) không để
lại sự kiện kết thúc nào trong `sessions_audit` — nhật ký dừng ở `created` cho đa số phiên.
Cùng lý do với việc `session:{id}:pod` sống lâu hơn hash session.

### `pool:quarantine` — pod hỏng không được tự quay lại pool

`claim.lua` chỉ nhận pod có `pod:{name}.state == "free"`. Pod trượt guard đó (tên lọt vào
`pool:free` hai lần, hash biến mất, hash sai kiểu) bị đẩy sang `pool:quarantine` và **không**
quay lại `pool:free` — đẩy lại là vòng lặp vô tận trên cùng một pod hỏng.

Vì sao guard này tồn tại: Redis LIST **không** chống trùng. Một tên pod nằm hai lần trong
`pool:free` (replenish retry sau timeout, reaper trả pod hai lần, hai instance cùng replenish)
sẽ được claim hai lần, và **hai sinh viên exec vào cùng một pod** — cả hai đều qua authz vì hash
của mỗi người ghi đúng `userId` của người đó. Đây là sập hoàn toàn lời hứa "một pod cô lập cho
một sinh viên", nên chỗ chống phải nằm trong script chứ không phải trong niềm tin vào producer.

List này dài ra là tín hiệu **có nguồn ghi sai vào `pool:free`** — B9 nên đếm nó.

### `session:{id}:pod` KHÔNG phải bản sao của `podName` (đừng "dọn" nó đi)

Nhìn qua thì đây là derived field: `session:{id}.podName` đã có cùng giá trị. Khác biệt nằm ở
**TTL**, và đó mới là lý do nó tồn tại.

Reaper tầng 1 nghe `__keyevent@0__:expired` của `session:{id}`. Lúc event tới, hash **đã biến
mất** — không còn chỗ nào đọc được `podName` để biết phải xoá pod nào. `session:{id}:pod` sống
thêm một khoảng grace chính là để trả lời câu đó. **Đặt hai TTL bằng nhau là làm reaper mù**, và
lỗi ấy im lặng: pod cứ rò dần cho tới khi quota hết.

Quan hệ đọc: hash là **SSOT của trạng thái session**; `session:{id}:pod` là **con trỏ hồi tố**
chỉ dùng khi hash không còn. Session còn sống thì mọi bên đọc `podName` từ hash.

## Field của hash `session:{id}`

camelCase — khớp `redis-keys.ts` và khớp JSON đi ra FE, không phải snake_case của proto.

| Field | Ý nghĩa |
|---|---|
| `userId` | chủ session. **Vế `g` của authz gateway** so field này với `token.sub` |
| `podName` | pod đang phục vụ |
| `namespace` | namespace của pod (không hardcode `dlp-sandbox` ở gateway) |
| `status` | `PENDING` / `CLAIMED` / `RUNNING` / `EXPIRED` / `REAPED` / `FAILED` |
| `tier` | `SandboxTier` của proto |
| `createdAt` | mốc tính `HARD_CAP` (Unix giây) |
| `expiresAt` | mốc hết hạn hiện tại (Unix giây) |
| `revision` | optimistic lock cho `ExtendSession` (`expected_revision`) |
| `lastActiveAt` | traffic **thật** gần nhất — ping/pong KHÔNG cập nhật field này |

**Vì sao phải pin field, không chỉ pin tên key:** gateway đọc hash này trực tiếp (D2) trong khi
proto không mô tả nó ở đâu cả. Đây là contract liên-service **vô hình** — orchestrator ghi
`user_id`, gateway đọc `userId`, cả hai typecheck xanh, và authz vế `g` im lặng trả rỗng ⇒ so
sánh với `token.sub` luôn sai (hoặc tệ hơn: luôn đúng nếu ai đó viết `!= ""` sai chiều). Chỉ
runtime mới lộ. Thứ tự trong `sessionFields` cũng cố định và được test so sánh — thêm field mới
là thêm vào **cuối**, ở cả ba nơi, trong cùng một commit.

## Ràng buộc

**`{id}` phải khớp `^[A-Za-z0-9_-]{1,64}$`.** Session id đi thẳng vào key, nên `:` trong id
sẽ bẻ được namespace: id `a:pod` biến `session:a:pod` thành key `:pod` của session `a`, và
id `a:ws` đâm thẳng vào bộ đếm WS. Cả hai bản hiện thực chặn ở biên và **trả lỗi** thay vì tự
làm sạch chuỗi — làm sạch âm thầm thì hai session khác nhau có thể ánh xạ về cùng một key.

**Cùng một validator gác cả ba loại định danh** (session id, tên pod, `idempotency_key`). Tên pod
mà orchestrator sinh là RFC1123 label (`sandbox-<hex>`) — tập con thực sự của pattern trên, nên
không cần validator thứ hai. `idempotency_key` thì **tới từ client** (proto bắt buộc field này),
nên nó là dữ liệu không tin được và phải qua đúng cổng đó.

**`idem` phải scope theo user — đây là ràng buộc bảo mật, không phải quy ước đặt tên.** Proto quy
định trúng key cũ thì "trả lại đúng session cũ". Với namespace `idem:{key}` toàn cục, user B gửi
trùng `idempotency_key` của user A sẽ nhận lại **session của A**: B biết `sessionId` của A — chính
thứ mà toàn bộ mô hình chống IDOR bảo vệ — và BFF mint cho B một token `sub=B, sid=sessionA` đi qua
được bước **e** và **f** của handshake, chỉ chết ở bước **g**. Vế `g` khi đó không còn là phòng thủ
chiều sâu mà là lớp **duy nhất** chặn B vào shell của A. Kèm theo là DoS chéo: A trùng key của B thì
terminal của A 403 vĩnh viễn. Hai đoạn của key được validate **riêng**, nên `:` không nhảy scope được.

**TTL đặt lúc CLAIM, không phải lúc create.** Pod nằm trong warm-pool không được tự hết hạn;
nó chỉ bắt đầu đếm khi có user thật.

**`session:{id}:ws` phải có TTL bằng TTL của session.** Bộ đếm này `INCR` trước upgrade và
`DECR` trong `defer`. Gateway bị SIGKILL giữa phiên thì `DECR` không bao giờ chạy — không có TTL
thì session của sinh viên khoá vĩnh viễn ở trạng thái "đang mở ở tab khác" (phase-1 D17/G8).

**Không nhân bản sang Postgres.** `sessions_audit` ghi chuyện đã xảy ra, không trả lời được
"session X đang chạy ở đâu" (`plan.md` §4 — SSOT & no-derived-fields).

## Redis Cluster — giới hạn CROSSSLOT (D10)

**v0 không dùng hash tag `{dlp}`, và P1 chạy Redis đơn.** Ghi lại đây để P3 không bất ngờ:

Script `claim.lua` đụng **cùng lúc** `pool:free`, `pool:claimed`, `pod:{name}`, `session:{id}`,
`session:{id}:pod`. Trên Redis Cluster, năm key này băm ra các slot khác nhau ⇒ `EVAL` trả
`CROSSSLOT Keys in request don't hash to the same slot` và tính atomic của cả thiết kế biến mất.

Cách sửa khi thật sự cần Cluster là bọc hash tag vào **mọi** key (`{dlp}pool:free`,
`{dlp}session:{id}`, …) để tất cả về một slot — nhưng lúc đó cả cluster chỉ dùng một slot, tức là
mất luôn lý do dùng Cluster. Đường đi đúng khi tới đó: shard theo session id
(`pool:free:{shard}`), không phải nhét hash tag cho có.

Thêm hash tag ở v0 sẽ làm mọi key xấu đi ngay hôm nay để đổi lấy một thứ chưa chắc dùng — YAGNI.

## Khi thêm key mới

1. Thêm dòng vào bảng trên.
2. Thêm vector vào [`redis-key-vectors.json`](redis-key-vectors.json) — làm bước này TRƯỚC,
   cả hai suite sẽ đỏ và chỉ đúng chỗ còn thiếu.
3. Hiện thực ở **cả hai** file (`redis-keys.ts` và `keys.go`) cho tới khi hết đỏ.
