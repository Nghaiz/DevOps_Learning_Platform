# P1 — đóng 10 ô AC §Chức năng bằng số đo (2026-08-12)

**Chặng:** không phải lane mới. Cả 7 lane của P1 đã đóng code từ 2026-08-12 (PR #41/#42);
thứ còn lại là **danh sách AC chưa tick**. Chặng này đóng **10 ô** — 7 ô bằng gRPC thật trên
cụm, 3 ô bằng test có kiểm đột biến.

**Công cụ mới trong repo:** [`cmd/lifecycle-probe`](../../../services/orchestrator/cmd/lifecycle-probe/)
— chạy **trong cụm** vì cổng gRPC đang ở nấc `require` (1.C-4) và cert nằm trong Secret.

---

## 0. Vì sao lại cần một binary nữa, sau khi đã có `mtls-probe`

`mtls-probe` đo **cổng**: một lời gọi, ba mã trả về. Các AC ở đây đo **quan hệ giữa hai lời
gọi** — "hai `CreateSession` cùng `idempotency_key` trả CÙNG id", "gia hạn với revision CŨ bị
từ chối SAU KHI revision đã tăng", "hạn ĐỨNG YÊN ở lượt thứ hai". Một chuỗi `grpcurl` rời rạc
không giữ trạng thái giữa hai lời gọi, nên phép so sánh rơi về mắt người đọc — đúng chỗ lỗi lọt.

**Mỗi ca đều có đối chứng dương**, theo đúng bài học của 1.C-1/1.C-4: một bộ acceptance chỉ
toàn ca ĐỎ không phân biệt được "chặn đúng chỗ" với "chặn tất cả".

---

## 1. Suite Go — 359 PASS / 0 FAIL / **0 SKIP**, và `-race` sạch

| Phép chạy | Kết quả |
|---|---|
| `go test ./... -count=1` (4 module, Redis + Postgres THẬT) | **359 PASS / 0 FAIL / 0 SKIP** |
| `go test ./... -race -count=1` | 17 package `ok`, **0 DATA RACE** |
| `GOOS=linux go build ./... && go vet ./...` | sạch |
| `gofmt -l services/` | rỗng |

⛔ **`SKIP=0` là vế phải đọc, không phải exit code.** `go test` trả 0 khi mọi ca tự skip, và
suite này skip sạch nếu thiếu `REDIS_URL`/`DATABASE_URL` (root `.env` **không** có hai biến đó
— phải tự dựng từ `POSTGRES_*`/`REDIS_*`). Đếm bằng `grep '^--- SKIP'` chứ không tin mã trả về.

---

## 2. Bảy ô đóng bằng gRPC thật trên cụm

Chạy `lifecycle-probe -case all` trong pod, mount `platform-mtls`, cert đóng vai `web`.
**20 check / 0 fail.** Log đầy đủ trong artifact.

| AC | Đo được |
|---|---|
| **5 RPC trả kết quả thật** | Cả `CreateSession`/`ClaimSession`/`GetSession`/`ExtendSession`/`ReapSession` đều chạy thật trên cụm. `Unimplemented` duy nhất còn lại là embed `UnimplementedSessionServiceServer` và cổng chặn stream RPC của B0′ — cả hai có chủ đích. |
| **Idempotency** | Hai `CreateSession` cùng key → id `f86566fa…` **và pod `sandbox-399968645a0c`** giống hệt. Đối chứng: key khác → id khác **và pod khác** (`sandbox-318736c1ac0d`). |
| **`GetSession` user sai → NotFound** | `code=NotFound`. Đối chứng dương: chủ thật đọc được `code=OK`. |
| **`ExtendSession` revision** | revision `1 → 2` với revision đúng; revision cũ → `FailedPrecondition`; và lượt bị từ chối **không ghi gì** (đọc lại vẫn `2`). |
| **Hard cap** | `created_at=08:45:28Z`, trần `10:45:28Z`. Xin gia hạn 20h → `expires_at` cắt **ĐÚNG** mốc trần, `hard_cap_reached=true`; lượt 2 → `expires_at` **đứng yên**. |
| **`ReapSession`** | reap của user lạ → `NotFound`; chủ thật lượt 1 → `REAPED`; lượt 2 → OK, **revision không đổi** (2 vs 2). |
| **Tắt Postgres** | Scale `platform-postgres` về 0 → `CreateSession` **vẫn thành công**, `dlp_audit_write_failures_total` **0 → 2**, log `ERROR` kèm nguyên văn `connection refused`. |

### Hai bẫy đo lường lộ ra ở chính chặng này

1. **`kubectl run -i` đánh rơi những dòng đầu.** Attach bám vào SAU khi container đã in, nên
   toàn bộ phần đầu ca `idem` biến mất khỏi bản ghi lượt đầu. Cơ chế thu thập bằng chứng tự
   huỷ bằng chứng — cùng họ với bẫy `successfulJobsHistoryLimit` của R0. Đổi sang tạo pod →
   chờ `Succeeded` → `kubectl logs`.
2. **Scrape `/metrics` rỗng hai lần liên tiếp, vì hai lý do KHÁC nhau.** Lần đầu:
   `kubectl exec -- wget` trên image **distroless** (không có `wget`) — lệnh hỏng, output rỗng.
   Lần hai: port-forward đúng cách nhưng **sai cổng** (`/metrics` ở `8081`, không phải `8080`).
   Cả hai lần đều cho một tập rỗng trông y hệt "mọi counter = 0". Nay in kèm **số dòng đọc
   được** (225) trước mỗi bảng số: `0 dòng` nghĩa là scrape hỏng, không phải hệ thống sạch.

### Vế apiserver của AC reap — cần một cửa sổ quan sát mới đo được

AC đòi "reap của người khác bị từ chối, **pod VẪN SỐNG**". Vế "vẫn sống" nằm ở apiserver, còn
probe reap thật ngay sau lời từ chối ⇒ cửa sổ quan sát rộng vài mili-giây và `kubectl` luôn tới
muộn. Không có cờ `-hold` thì ta chỉ khẳng định được vế Redis rồi ghi ra như thể đã đo cả hai.

Đo thật, cửa sổ 45s (`HOLD-BAT-DAU 08:48:25Z` → `HOLD-KET-THUC 08:49:10Z`), quan sát lúc `08:48:26Z`:

```
sandbox-a891d59fa6b2   Running   ready=true   deletionTimestamp=<none>
```

và **sau khi chủ thật reap**, chính pod đó: `Error from server (NotFound)`.
Vế thứ hai là đối chứng dương — không có nó, "pod vẫn sống" cũng đúng với một hiện thực
**không bao giờ xoá pod**.

---

## 3. Ba ô đóng bằng test, có kiểm đột biến

**Thứ tự ghi khi replenish (AC "đảo thứ tự → test phải ĐỎ").** Đảo `publish()` thành
`RPUSH` trước `HSET state=free` và chạy lại:

```
--- FAIL: TestPublishThuTuDungKhongBaoGioCachLyPodTot
        pool:quarantine có 1 mục — thứ tự ĐÚNG không được cách ly pod nào
--- PASS: TestThuTuDaoNguocCachLyPodHoanToanTot
--- PASS: TestPublishRPushGiuFIFO
--- PASS: TestReplenishDuaPoolVeDungTarget
```

Đỏ **đúng một** ca, đúng thông điệp. Ba ca cùng package vẫn xanh ⇒ lỗi khu trú đúng tính chất
chứ không đỏ tràn. *Quan sát kèm theo, không tự khen: luật thứ tự này được gác bởi **đúng một**
test — ba ca kia không cảm nhận được đột biến.*

**Retry mất phản hồi** — `TestRetryMatPhanHoiKhongTaoPodThuHai` chạy trên Redis thật: lần hai
trả **cùng podName**, `pool:free` không tụt, `provisions=0`, `dlp_cold_path_total=0`.

**`sessions_audit` không có cột trạng thái sống** — `schema.test.ts` assert **allowlist ĐÓNG**
(thêm bất kỳ cột nào là đỏ), và `status`/`claimed_at`/`reaped_at` của bản đầu đã bị bỏ.

> ⚠ **Đọc AC này đúng độ mạnh của nó.** Bảng **có** `pod_name`, nên
> `… ORDER BY occurred_at DESC LIMIT 1` *trông như* trả lời được "session X đang ở pod nào".
> Nó không: nó trả lời "pod của sự kiện gần nhất ĐÃ GHI", và hai câu lệch nhau ngay khi audit
> hỏng mà RPC vẫn thành công — chính là ca "tắt Postgres" đo ở §2. Ranh giới đó trước đây chỉ
> nằm trong đầu người viết schema (`expires_at` có dòng lý lẽ, `pod_name` thì không); nay đã
> ghi tại chỗ.

---

## 4. Một comment nói ngược mã, đã vá

`extend.go` mô tả công thức là `min(now + extend, created_at + HARD_CAP)` và dặn người đọc
*"muốn hạn chỉ tiến không lùi thì đổi thành `max(...)` — một dòng"*. Nhưng `extend.lua` **đã
có** vế `max` từ B5, kèm cả ba hệ quả của việc thiếu nó.

Một comment sai không chỉ vô ích — nó **hướng người đọc đi sửa thứ đã đúng**. SSOT của công
thức là file `.lua`; doc-comment nay trỏ sang đó thay vì chép lại.

---

## 5. Bốn ô warm-pool/reaper — đóng nốt trong cùng phiên

Bốn ô này phải chạy **riêng** vì chúng cố tình đẩy cụm tới trần quota; chạy chung với §2 thì ca
sau đỏ vì hết pod — một phép đo hỏng vì phép đo trước, không phải vì hệ thống. Thêm hai ca cho
probe: `create -keep` (để lại session sống, dựng cảnh cho reaper) và `pool -n N` (N `CreateSession`
**đồng thời**).

### 5.1 Quarantine không rò quota (B7 tầng 3)

Dựng cảnh bằng một Pod **THẬT** (clone spec pod ấm — tự chế spec thì đỏ ở admission vì một field
không liên quan gì tới thứ đang đo: VAP bắt `hostUsers: false`), đặt `pod:{name}.state=active`,
`LPUSH` tên vào **đầu** `pool:free`, rồi kích một claim thật.

| Mốc | Quan sát |
|---|---|
| ngay sau claim | `pool:quarantine=[sandbox-ac604quaran01]`, hash **còn**, Pod **`Running`** ở apiserver — đúng chế độ hỏng tầng 3 tồn tại để dọn |
| t+24s (< 1 chu kỳ 60s) | list rỗng, hash mất, Pod **`KHÔNG-CÒN`** |

`dlp_reaper_quarantine_reaped_total` **0 → 1**, và **năm counter reaper khác đều đứng yên ở 0**
(`orphan_pods`, `ghost_sessions`, `dead_free_pods`, `claimed_orphan`, `sweep_failures`). Vế sau
mới là vế quy được trách nhiệm cho tầng 3 — thiếu nó ta chỉ ghi nhận "pod biến mất".
Log: `WARN` *"dọn pod bị cách ly — mỗi mục là −1 trên trần đồng thời"*.

*Kèm theo, claim **đi tiếp** lấy pod tốt sau khi cách ly pod hỏng — không rơi vào "pool rỗng".*

### 5.2 Xoá `session:{id}` của một phiên ĐANG CHẠY — và tầng bắt nó KHÔNG phải tầng AC nói

| Quan sát | Số đo |
|---|---|
| dọn xong | **13s** (< 1 chu kỳ) — `pool:claimed` rỗng, hash mất, Pod mất |
| counter tăng | `dlp_reaper_claimed_orphan_total` 0 → 1 (**tầng 2c**) |
| `dlp_reaper_orphan_pods_total` | **vẫn 0** |
| `dlp_reaper_keyspace_events_total` | **đứng yên ở 22** |

⛔ **Hai đính chính cho câu chữ của AC.** (a) AC gọi đây là *"sweep dọn pod mồ côi"*, nhưng
nhánh thật sự bắt nó là **tầng 2c** (`pool:claimed` có tên mà `session:{id}` không còn) — nhánh
"pod mồ côi" đòi hash **VẮNG**, mà ở đây hash **CÓ**. Bản vá trước của AC này đo nhầm chính vì
thế: nó tạo một pod **không hash**, tức dựng cảnh cho nhánh khác với nhánh AC mô tả.
(b) `keyspace_events` đứng yên **chứng minh tầng 1 mù với ca này**: `DEL` sinh event `del`, không
sinh `expired`. Nếu tầng 2 vắng mặt thì pod này ở lại vĩnh viễn — đúng lý do plan bắt sweep định
kỳ là **bắt buộc có**, không phải dự phòng.

### 5.3 Xoá Pod dưới chân một session còn sống → `FAILED`

`status` `CLAIMED` → **`FAILED` sau 23s**; `dlp_reaper_ghost_sessions_total` 0 → 1; log `WARN`
*"session ma: pod đã biến mất nhưng session còn sống — chuyển FAILED"*.

**Hai tầng phối hợp, và điều đó chỉ thấy được khi theo dõi tiếp:** đánh dấu `FAILED` **không**
rút tên pod khỏi `pool:claimed` — tên nằm lại cho tới khi **tầng 2c** thu hồi ở vòng sau
(`claimed_orphan_total` 1 → 2). Hai tầng chạm cùng một sự cố ở hai thời điểm khác nhau; đọc mỗi
tầng một mình sẽ tưởng có rò.

### 5.4 Replenish + trần quota

**Độ trễ replenish** đo bằng cách theo dõi `pool:free` **liên tục từ trước khi claim** — đo từ
lúc pod probe thoát chỉ cho một chặn trên, vì claim xảy ra bên trong pod:

```
12:56:28.21Z  pool:free=[]                      ← claim
12:56:34.93Z  pool:free=[sandbox-0b383c1aaee9]  ← replenish xong
```

**≈6.7s**, xa dưới ngưỡng 30s *(độ phân giải bằng một lượt `kubectl exec`, cỡ vài trăm ms)*.

**Bão hoà, 5 `CreateSession` đồng thời** (đồng thời chứ không tuần tự: chạy tuần tự thì warm-pool
kịp ấm lại giữa hai lượt, mọi claim đi nhánh warm, và AC "session kế rơi cold path" thành một câu
không phép đo nào chạm tới):

| | |
|---|---|
| thành công | **4/5** — đúng trần hiệu lực 4 pod mà D16 tính ra, lần đầu được xác nhận bằng phép đo |
| lượt hỏng | `ResourceExhausted` + *"đã đạt trần số sandbox đồng thời của cluster; thử lại sau ít phút"* |
| trong lúc bão hoà | `pods=4 free=0 claimed=4` |
| `dlp_cold_path_total` | 4 → **8** (1 lượt ăn pod ấm, 4 lượt rẽ cold path — kể cả lượt sau đó chết vì quota) |
| `dlp_pool_replenish_quota_blocked_total` | 0 → **9** |
| `dlp_pool_replenish_failures_total` | **vẫn 0** |
| log | **1 WARN, 0 ERROR** |

Vế `replenish_failures_total = 0` là vế đắt nhất ở đây: chạm trần **không** bị đếm là lỗi hệ
thống, nên một nền tảng đang chạy hết công suất không trông giống một nền tảng có bug.

⛔ **Probe cố ý KHÔNG assert số lượt thành công.** Con số đó phụ thuộc nhịp replenish tại đúng
mili-giây đó; assert nó là dựng một test lệ thuộc thời gian, nó sẽ đỏ ngẫu nhiên và người sau sẽ
nới cho tới khi nó không kiểm gì. Tính chất **bền** được assert là *hình dạng của lỗi*: mọi lượt
hỏng phải là `ResourceExhausted`, không `Internal`/`Unknown`.

**"Không backoff vô hạn" — mã còn mạnh hơn AC đòi.** `manager.go` đặt `backoff = 0` cho nhánh
quota (*"quota là trần công suất, không phải sự cố"*), tức **không backoff chút nào**. Đo được
sau khi áp lực rút: counter đứng yên ở 9 và `pool_free_size` về 1 trong khi Pod mới lên sau 2 phút.
*Và 9 lần chặn chỉ ra 1 dòng WARN vì log bị throttle có chủ ý (`quotaLogEvery`) — **counter mới là
tín hiệu để cảnh báo, log không phải một-dòng-một-lần-chặn**. Ai đếm dòng log để đo tần suất chạm
trần sẽ đếm hụt 9 lần.*

### 5.5 Trạng thái cụm sau toàn bộ phép đo

`pool:free` 1 pod · `pool:claimed`/`pool:quarantine` rỗng · quota **1/10** · mọi pod nền tảng
`Running` · Postgres đã bật lại. Mọi key `session:*` còn lại đều **có TTL** (99–3843s), không key
nào `-1` ⇒ không rò. `pod:{name}` để `-1` là **có chủ ý** — hash hết hạn khi pod còn nằm trong
`pool:free` sẽ khiến `claim.lua` đọc `state` ra nil rồi **cách ly một pod tốt**; vòng đời của hash
đó thuộc reaper, không thuộc đồng hồ.
