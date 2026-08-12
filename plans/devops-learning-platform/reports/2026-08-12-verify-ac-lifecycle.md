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

## 5. Còn nợ (KHÔNG tick)

Bốn ô warm-pool/reaper của nhóm này chưa dựng được bằng chứng runtime — chúng cần đẩy cụm tới
**trần quota 4 pod** (D16) nên phải chạy riêng, không chung với các ca trên:

- `pool:free` về `POOL_TARGET` ≤ 30s, 3 session đồng thời, session kế → cold path
- chạm quota có tín hiệu riêng (`dlp_pool_replenish_quota_blocked_total`, `WARN` không `ERROR`)
- pod mồ côi / session ma → `FAILED`
- quarantine không rò quota (B7 tầng 3)

Baseline đã chụp để lần đo sau có mốc so: `cold_path_total=4`, `pool_free_size=1`,
`quarantine_size=0`, `quota_blocked=0`, mọi counter reaper = 0 (trừ `keyspace_events=7`).
