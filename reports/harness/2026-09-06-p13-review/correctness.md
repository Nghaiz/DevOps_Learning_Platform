# Rà soát đối kháng P13 — đúng đắn dữ liệu & trạng thái

Nhánh `feat/p13-frontend`, diff `feat/p12-scale-proof..HEAD` (113 commit, 384 file).
Chỉ đọc; không sửa một file mã nguồn nào. Báo cáo này là file CỤC BỘ (`reports/`
bị `.gitignore:72` chặn — cố ý), không commit.

Ba phát hiện đầu **tái hiện được bằng lệnh**, không phải suy luận. Script tái
hiện nằm trong scratchpad phiên (chạy bằng `node --experimental-strip-types`,
không thêm file nào vào repo).

---

## F1 (Nghiêm trọng) — Mọi nguồn nội dung sập ⇒ catalog RỖNG kèm HTTP 200

`packages/scenario/src/composite-source.ts:90` (`collect`), `:209` (`collectPages`),
`:237` (`mergePages`).

`firstHit` (`:155`) có chốt "mọi nguồn hỏng ⇒ NÉM", với lý do ghi ngay tại
`:177–182`: *"trả `null` ở đây sẽ thành 404, và 404 nói rằng bài không tồn tại —
một khẳng định ta vừa mất hết cơ sở để đưa ra"*. Hai hàm gom danh sách **không
có chốt tương đương**: nguồn `rejected` chỉ ghi WARN rồi `continue` (`:224`,
`:104`); cả hai cùng hỏng ⇒ `pages` rỗng ⇒ `mergePages` trả
`{ items: [], nextCursor: null }`.

**Tái hiện (đã chạy 2026-09-06)** — hai nguồn giả, mọi phương thức đều ném:

```
listPage  = {"items":[],"nextCursor":null}
list      = []
get       => NÉM: Mọi nguồn nội dung đều lỗi ở get — không kết luận được
warns     = 6
```

Cùng một sự cố: `/lessons/[id]` trả 5xx (đúng), `/lessons` trả "kho rỗng" (sai).
Người trực nhìn dashboard thấy 200 và một catalog trống — đọc ra là "chưa ai
soạn bài", không phải "Postgres đang chết".

**Bằng chứng phụ — chính file test cũng lệch cùng một chỗ.** `composite-source.test.ts:175`
có `get: MỌI nguồn hỏng ⇒ NÉM, không trả null`; **không có** ca tương ứng cho
`list`/`listPage`. Ca duy nhất cho danh sách là `:155`
(`list bỏ qua nguồn ném lỗi, vẫn trả nguồn còn lại`) — nó ghim hành vi MỘT nguồn
hỏng, và im lặng về ca cả hai cùng hỏng.

---

## F2 (Nghiêm trọng) — MỘT nguồn sập một nhịp ⇒ MẤT HẲN dòng trong lượt duyệt

Cùng chỗ: `composite-source.ts:216–232` (bỏ nguồn hỏng) + `:265–281` (phát cursor
từ trang ĐÃ THIẾU). `collectPages` trả `out` không mang thông tin "thiếu nguồn
nào", và `mergePages(pages, limit, …)` không nhận `sources.length` để so — nên nó
không có cách nào biết trang mình vừa ghép là trang vơi.

**Tái hiện (đã chạy)** — đĩa `d1,d3,d5,d7,d9`, DB `d2,d4,d6,d8`, `limit=2`, DB
timeout đúng MỘT trang:

```
trang 1: d1,d2 | next = d2
trang 2 (DB lỗi): d3,d5 | next = d5      ← cursor phát từ trang chỉ có đĩa
trang 3: d6,d7 | next = d7
trang 4: d8,d9 | next = null

đã thấy   : d1,d2,d3,d5,d6,d7,d8,d9
MẤT HẲN   : d4
```

`d4` không bao giờ xuất hiện lại: lượt sau hỏi cả hai nguồn `> d5`. Người dùng
nhận 200, danh sách liền mạch, không một dấu hiệu nào. Đây đúng chế độ hỏng mà
D9 dựng ra để chặn, chỉ dịch từ "biên trang" sang "biên sự cố".

Ghi chú: F1/F2 là **một** lỗ hổng ở hai mức. Bịt bằng cách cho `mergePages` biết
số nguồn được hỏi và số nguồn trả lời: 0/N ⇒ ném (như `firstHit`); k<N ⇒ không
được phát `nextCursor` vượt qua vùng của nguồn vắng mặt (an toàn nhất: ném, hoặc
trả `nextCursor` = cursor của trang HIỆN TẠI để lượt sau đọc lại).

---

## F3 (Nghiêm trọng) — Phán quyết `error`/`expired` của SERVER bị close frame lật ngược

`packages/terminal/src/session-machine.ts:227` (`applyClosed`).

`applyClosed` có đúng HAI chốt: `phase === 'idle'` (`:228`, đuôi sau `ENDED`) và
`NORMAL && phase === 'exited'` (`:236`, đuôi sau `exit`). **Không có chốt cho
`expired` / `error`** — hai pha do `applyControl` (`:174`) đặt từ control message
của server. Với `expiresAt` còn ở tương lai, `decideRetry` (`backoff.ts:91–92`)
trả `{retry:true}` ⇒ `:253–259` ghi đè phase thành `reconnecting` và **xoá
`message`**.

**Tái hiện (đã chạy)**:

```
after ready      : ready | everReady = true
after ctrl error : error | "Pod của phiên đã biến mất."
after close 1006 : reconnecting | retryDelayMs = 1000 | needsReasonLookup = false | message = null

expired branch   : expired | "Phiên đã hết hạn (server)."
after close 1006 : reconnecting | retryDelayMs = 1000 | message = null
```

Phanh thứ hai cũng không bật: `needsReasonLookup = code === CLOSE_ABNORMAL && !state.everReady`
(`:257`) ⇒ `false` khi người dùng đã từng nối được. Kết quả là vòng nối lại chạy
tới trần 15s cho tới khi hạn phiên trôi qua, dưới nhãn "Đang nối lại…", trong khi
server đã nói rõ phiên hỏng.

Kịch bản thật: gateway ghi control `error` rồi mất kết nối không kịp close frame
(pod gateway bị giết, proxy cắt TCP, drain lúc rollout) ⇒ trình duyệt báo `1006`.

**Test cũng thiếu đúng hai pha đó.** `session-machine.test.ts` có `:112`
(*"đuôi CLOSED 4404 tới SAU ENDED không ghi đè idle"*) và `:227`
(*"exit + close 1000 giữ nguyên câu của `exit`"*) — hai ca đúng bằng hai chốt đã
có. Không ca nào cho `CONTROL error` → `CLOSED`. Mẫu hình được nhận ra hai lần và
bỏ sót hai lần ở cùng một chỗ.

---

## F4 (Quan trọng) — Trang RỖNG-nhưng-còn-dữ-liệu làm mất luôn nút sang trang

`apps/web/src/components/me/history-tabs.tsx:317` (`HistoryFrame`) —
`if (isEmpty) return <div>{empty}</div>` trả về SỚM, **không render `pager`**.
`isEmpty` được truyền là `data?.items.length === 0` (`:99`, `:169`, `:241`).

Nhưng `items` KHÔNG cùng độ dài với trang: `me.listLabAttempts` bỏ dòng có lab
không nạp được (`me.ts:227` `if (lab === null) continue`) và `listQuizAttempts`
tương tự (`me.ts:301`) — trong khi `hasMore`/`nextCursor` tính TRƯỚC lúc bỏ
(`me.ts:214`, `:249`). Nên `{ items: [], nextCursor: 'abc' }` là một câu trả lời
hợp lệ của API.

Kịch bản hỏng: một lab vendored bị gỡ/đổi id ở lượt cập nhật nội dung (nội dung
đĩa ghim theo commit upstream, việc gỡ có thật). `lab_attempts` không có FK tới
nội dung nên các dòng cũ còn nguyên; `source.getLab(labId)` trả `null`. Người
từng thử lại lab đó ≥20 lần (limit mặc định 20, `init.ts:182–192`) có trang 1
rỗng sạch + `nextCursor` khác null ⇒ màn hình hiện "Chưa có lần thử nào" **và
không có nút "Trang sau"**. Toàn bộ phần lịch sử còn lại không còn đường nào tới
được từ giao diện.

Cùng hình dạng, khả năng chạm thấp hơn: `components/me/active-sessions.tsx:129`
(pager nằm trong nhánh else) — `ListSessions` cũng bỏ session biến mất giữa SCAN
và Load (`list_sessions.go:117–124`) trong khi `next_cursor` đã tính từ `page`.

Sửa: `isEmpty` phải là `items.length === 0 && nextCursor === null`; hoặc luôn
render pager.

---

## F5 (Quan trọng) — Bất biến "Postgres sắp `id` GIỐNG JS" không có cổng nào gác

`packages/scenario/src/source.ts:131–143` (`compareId`, đơn vị mã) khẳng định khớp
Postgres, kèm số đo. Hợp nhất k-way ở `composite-source.ts:264` sắp bằng
`compareContent` (JS); nguồn DB sắp bằng `ORDER BY id` của Postgres
(`apps/web/src/server/content/repository.ts:248`) và cắt bằng vị từ hàng
`(key, id) > (…)` (`:216`). Hai thứ tự PHẢI trùng — lệch là k-way merge phát
cursor sai vị trí ⇒ nhảy/lặp dòng ở biên trang.

Đo tại chỗ (2026-09-06, `docker exec dlp-postgres psql -U dlp -d dlp`):

```
A < B < a < b                        ← thứ tự BYTE (C), KHÔNG phải en_US
a- < a-b < a0 < a1 < aa < ab         ← trùng với `<` của JS
datcollate = en_US.utf8   server_version = 16.14
```

`datcollate` khai `en_US.utf8` nhưng image là **`postgres:16-alpine` (musl —
không có locale)**, nên mọi collation rơi về C. Bất biến đang đúng vì cái image,
**không phải** vì `en_US` đồng ý với JS. Cùng image ở cả ba nơi:
`docker-compose.yml:14`, `.github/workflows/ci.yml:123` và `:1321`,
`infra/helm/platform/values.yaml:609`.

Kịch bản hỏng: đổi `postgres:16-alpine` → `postgres:16` (glibc, có en_US.UTF-8).
Không test nào đỏ (test chạy trên alpine), không cổng nào chặn, và catalog bắt
đầu nhảy dòng ở biên trang. Bất biến này sống trong một chú thích, không trong
một phép kiểm. Đề xuất: một ô kiểm khẳng định thứ tự `id` mà Postgres trả về
khớp `compareId` trên một tập id có `-` xen digit — thứ sẽ đỏ ngay khi image đổi.

*(Chưa đủ bằng chứng cho vế "glibc en_US thật sự đảo thứ tự": tôi không kéo image
glibc về để đo. Điều đã chứng minh là bất biến hiện đúng vì lý do KHÁC với lý do
được ghi, và không có gì gác nó.)*

---

## F6 (Nhỏ) — `labs.leaderboard`: thứ tự KHÔNG toàn phần trên một đầu vào KHÔNG sắp

`apps/web/src/server/trpc/routers/labs.ts:412` — truy vấn `attemptRows` **không có
`orderBy`**. `:459–463` sắp theo `(percent desc, durationSeconds asc, submittedAt asc)`,
không có vế phá hoà cuối (`attemptId`). `Array.prototype.sort` ổn định, nhưng ổn
định trên một đầu vào không ổn định thì kết quả vẫn không ổn định.

Kịch bản: hai lần thử trùng cả ba khoá (dễ nhất khi `durationSeconds` cùng rơi về
`?? 0` — `:453`). Cursor là `attemptId` tra bằng `findIndex` (`:467`), nên hai
dòng đó đảo chỗ giữa hai lượt phân trang ⇒ một dòng lặp ở trang sau, một dòng
biến mất; `rank` (`:476`) cũng lệch. Thêm `attemptId` làm vế cuối là đủ.

---

## F7 (Nhỏ, hợp đồng) — Mã đã đi trước plan; §1 D5 và §2 C3 nay mô tả hệ thống không tồn tại

`plans/devops-learning-platform/phase-13-exec.md` §2 C3 (dòng 137–143) chốt
`GetCapacityResponse` gồm ĐÚNG 4 field; §1 D5 chốt *"đọc `pool:claimed` + env
`CAPACITY_SOFT_LIMIT`"*. Mã:

- `services/orchestrator/internal/lifecycle/capacity.go:47` thêm `HardCapacity`
  (field thứ 5) — `apps/web/src/server/capacity/get-capacity.ts` cũng phơi nó ra
  cùng `poolQuarantine`, tức `capacity.get` trả 6 field chứ không phải 4 như C4.
- `CAPACITY_SOFT_LIMIT` **đã bị bỏ**; trần mềm nay TÍNH (`capacity.go:66`
  `softCapacity() = CapacityHardLimit − PoolTarget`).

Hướng thay đổi là ĐÚNG (bỏ đúng một derived field lưu trong env) và được gác tử
tế: `infra/helm/platform/templates/orchestrator-deployment.yaml:175` `fail` khi
còn key `capacitySoftLimit`; `config/config.go:341` và `lifecycle/service.go`
(`NewService`) cùng chặn `hard <= poolTarget`. Phát hiện là **plan chưa cập
nhật** — ai đọc §1 D5 rồi khai lại env đã bỏ sẽ dựng một cụm CrashLoopBackOff
(`config.Load` fail-fast) hoặc bị Helm `fail`.

---

## Ghi chú nhỏ (không dựng được kịch bản hỏng đáng kể)

- `list_sessions.go:167` — `len(ids) >= listSessionsHardCeiling` kiểm SAU khi
  append, nên đúng 5000 phiên sống đã ném dù 5000 vẫn biểu diễn được. Lệch một
  đơn vị, vô hại ở trần 23 pod.
- `list_sessions.go` — trần đếm trên `ids` TRƯỚC `sortAndDedupe`, nên key trùng
  do SCAN rehash tính vào trần. Vô hại ở quy mô hiện tại.
- `apps/web/src/app/paths/[id]/path-view.ts:74` — chú thích nói
  *"`secondary` chứ không `destructive`"* nhưng giá trị là `'outline'`. Chú thích
  mục, không phải lỗi hành vi.

---

## Đã kiểm lại và XÁC NHẬN ĐÚNG (những chỗ lượt trước báo)

- **Trang hợp nhất rỗng mà nguồn còn dữ liệu** — đã bịt:
  `composite-source.ts:283–306` lấy cursor NHỎ NHẤT, và so bằng **khoá đã giải
  mã** (`compareCursors`, `source.ts:241`) chứ không so chuỗi — nếu so chuỗi thì
  `'d:10:x' < 'd:2:x'` và mốc "min" lại là mốc lớn hơn. Có test `:283` và `:302`.
  Không còn chỗ nào cùng hình dạng trong các `list*Page` khác.
- **Cursor cho khoá KHÔNG duy nhất** — đúng: `d:<rank>:<id>` / `m:<phút>:<id>`
  (`source.ts:191`), vị từ cắt là so sánh THEO HÀNG `(key,id) > (v,i)` ở SQL
  (`repository.ts:216`) và `isAfterCursor` ở bộ nhớ (`source.ts:257`); hằng
  `NO_DURATION_SORT_VALUE = 2147483647` và bảng hạng độ khó **cùng một nguồn**
  ở JS và SQL (`repository.ts:151–162` dựng `case` từ `SCENARIO_DIFFICULTIES`).
  Đổi `orderBy` giữa chừng ném 400 thay vì đọc bừa (`decodeContentCursor`).
  ⚠ Nhưng: **không call-site production nào gửi `orderBy`** — `useCatalogControls`
  chỉ sắp TRONG TRANG ở client (`catalog-sort.ts`, nhãn "Sắp xếp trong trang" nói
  đúng phạm vi). Toàn bộ đường `d:`/`m:` chỉ được test gọi. Nó vẫn là API công
  khai (tRPC nhận `orderBy`), nên vẫn phải đúng — chỉ cần biết là nó chưa từng
  chạy thật.
- **SCAN trả trùng key** — đã bịt đúng chỗ: `sortAndDedupe` (`list_sessions.go`),
  tách hàm riêng để kiểm bất biến "tăng dần NGHIÊM NGẶT" trực tiếp thay vì cố ép
  Redis trả trùng.
- **Chạm trần 5000** — nay là LỖI (`ResourceExhausted`) chứ không phải trang
  ngắn. Đúng: cắt một tập SCAN vô-thứ-tự rồi sắp sau là mất dòng im lặng.
- **`GetCapacity` trần mềm** — `hard − poolTarget` tính tại chỗ đọc, một nguồn;
  `PoolTarget` truyền cho `lifecycle` là CÙNG biến truyền cho `pool.NewManager`
  (`main.go:284` vs `:310`), và `NewService` từ chối `PoolTarget < 1` vì manager
  ép `<1` về 1 — hai vế không lệch được trong im lặng.
- **`IsTerminal` bỏ lọt pod `Terminating`** — đã áp bài học: `podprobe.go` đọc
  `DeletionTimestamp`, không chỉ `Phase`, và **được nối dây thật**
  (`terminal-gateway/cmd/terminal-gateway/main.go:124` `SetPodProbe`). Chiều
  fail-open (`bridge.go` `podBienMat`) có lý do viết ra và đúng hướng.
  (Hai chỗ còn đọc `IsTerminal` — `pool/manager.go:436`, `reaper/reaper.go:365` —
  **nằm ngoài diff P13**, không rà.)
- **Không có derived field mới**: `user_preferences` và `admin_audit`
  (`schema.ts`) không có cột nào tính được từ cột khác. Nhãn tiến độ/điểm/hạng là
  hàm THUẦN có test riêng (`score-summary.ts`, `path-view.ts`, `answer-view.ts`,
  `task-status.ts`), dùng lại `computeLabScore`/`computeLabStatus` của
  `packages/scenario` thay vì viết bản thứ hai. `cursor-stack.ts` cố ý giữ NGĂN
  XẾP để `pageNumber` suy ra từ một nguồn thay vì hai state đi lệch nhau.
- **Đếm theo trang không bị nói thành tổng**: `preference-notices.ts:63–71` nói
  "ít nhất N" khi `nextCursor !== null`; `admin/*-client.tsx` viết "Đang xem N …
  ở trang M". Trung thực.
- **`me.listProgress` / `admin.audit.list`** — cursor uuid đi qua
  `assertUuidCursor` (`me.ts:334`, `admin/audit.ts:73`), chặn 22P02 → 500 rò SQL.
  `labAttempts.id`/`quizAttempts.id` là `text` nên không cần (đã kiểm `schema.ts`).
- **`admin.users.list`** — keyset `id asc`, vị từ và `ORDER BY` cùng collation DB,
  tự nhất quán.

---

## Chưa đủ bằng chứng

- Chưa đo `postgres:16` (glibc) để khẳng định thứ tự `id` thật sự đảo — xem F5.
- Chưa chạy suite (`vitest`/`go test`) trong lượt này; mọi khẳng định ở trên đến
  từ đọc mã + ba script tái hiện + truy vấn Postgres trực tiếp.
- Đường authz của `ReapSession` cho admin (D15) đọc lướt, không rà — thuộc lane
  bảo mật.
