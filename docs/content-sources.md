# Hai nguồn nội dung — đĩa và DB

**SSOT của luật gộp.** Mã nguồn trỏ về file này; file này không lặp lại mã nguồn.

Từ P9, nội dung **lesson / lab / playground** có **hai** nguồn cùng sống:

| Nguồn | Ở đâu | Ai ghi | Đổi khi nào |
|---|---|---|---|
| **Đĩa** | `content/{scenarios,labs,playgrounds}/**` | `vendor-scenarios.mjs`, ghim byte theo commit upstream | Chỉ khi build lại image |
| **DB** | `content_items` / `content_steps` / `content_assets` | Người có vai trò `author` qua trang soạn | Bất cứ lúc nào |

## Ngoài bảng trên: lộ trình và quiz chỉ có DB

Bảng hai nguồn ở trên **không phủ hết** nội dung của nền tảng. Nó nói về
`content_items` — tức lesson, lab, playground. Hai loại còn lại nằm ngoài nó:

| Loại | Bảng | Đọc bởi |
|---|---|---|
| **Lộ trình** | `learning_paths` / `learning_path_items` | `paths.list`, `paths.get` |
| **Quiz** | `quizzes` / `quiz_questions` / `quiz_choices` | `quiz.list`, `quiz.get` |

Cả hai **chỉ có Postgres, không có nguồn đĩa**. Không có
`filesystemLearningPathSource` nào, và `compositeContentSource` không đụng tới
chúng. Hệ quả là một cụm vừa dựng có `/lessons` + `/labs` đầy đủ (nội dung đã
nướng vào image) trong khi `/paths` + `/quiz` rỗng trơn — đo trên cụm thật ngày
2026-09-06: `learning_paths = 0`, `quizzes = 0`.

### Đường nạp: `scripts/seed-content.mjs`

`content/paths/*.json` và `content/quizzes/*.json` là **đầu vào của lượt nạp**,
không phải một nguồn đọc thứ ba: sau khi seed, SSOT lúc đọc vẫn là Postgres —
đúng những bảng mà trang soạn ghi vào. Chúng được phiên bản hoá trong git để một
cụm dựng lại từ đầu có cùng thư viện.

```
node scripts/seed-content.mjs --check   # kiểm nội dung, không cần DB
node scripts/seed-content.mjs --print   # in SQL (cụm không lộ Postgres ra ngoài)
DATABASE_URL=... node scripts/seed-content.mjs
```

Idempotent theo cấu trúc, và từ chối ghi đè bài thuộc một `author_id` khác. Chi
tiết ở đầu chính script.

**Phải gọi nó ở mọi nơi dựng một Postgres mới** — cụm mới, **và mọi job CI chạy
E2E**. `db:migrate` tạo bảng; nó không nạp gì cả.

### Thiếu bước seed thì triệu chứng KHÔNG nêu tên nguyên nhân

Đây là lý do mục này tồn tại, chứ không phải một ghi chú vận hành. Danh mục rỗng
**không ném lỗi ở đâu cả**: `paths.list` trả `items: []` hoàn toàn hợp lệ, trang
`/paths` vẽ một danh sách trống, và thứ đỏ lên là một test cách đó vài tầng với
câu *"paths.list trả 0 mục nên không mở được /paths/:id"* — một câu mô tả hậu
quả, không phải nguyên nhân. Cùng lớp với `rules/green-that-proves-nothing.md`,
chỉ ngược chiều: ở đây cái đỏ nói đúng là có chuyện, nhưng nói sai chỗ.

Đo được ở CI run 34130030953 — lượt chạy **đầu tiên** của job `web-a11y`: bốn ô
(`axe` + `csp`, mỗi cái cho `/paths/:id` và `/quiz/:id`) đỏ vì job chỉ chạy
`db:migrate`. Tái hiện tại chỗ rồi chạy lại với **biến duy nhất** là lệnh seed:
4 đỏ / 31 xanh → **0 đỏ / 35 xanh**, không đổi một dòng mã sản phẩm nào.

---

Seam `ContentSource` (`packages/scenario/src/source.ts`) được dựng ở 2.B để đón
nguồn thứ hai này. Điều seam **chưa** nói là chuyện gì xảy ra khi hai nguồn cùng
tồn tại. Bốn câu hỏi dưới đây là câu trả lời đó.

---

## 1. Trùng `id` thì ai thắng? — **Đĩa thắng**

`compositeContentSource([filesystem, db])`: nguồn đứng trước thắng, và caller
(`apps/web/src/server/content/source.ts`) luôn đặt đĩa trước.

Hai lý do, cả hai đều là *không đánh mất một khẳng định đã có*:

1. **Ghim byte còn nghĩa.** Nội dung vendored được `vendor-scenarios.mjs --check`
   đối chiếu byte-với-byte theo commit upstream, và nó mang license upstream. Nếu
   một bài DB che được nó, `--check` vẫn xanh trong khi thứ người học thật sự
   nhận đã khác — đúng chế độ hỏng mà việc ghim tồn tại để chặn.
2. **Không có cửa ghi đè ngầm.** Chiều ngược lại biến bảng nội dung thành cách
   sửa một bài vendored mà không để lại dấu vết nào trong repo.

**Va chạm không bao giờ im lặng.** Mỗi lần phát hiện, composite ghi:

```
[content:composite] trùng id giữa hai nguồn — nguồn sau bị CHE
  { method, id, winnerSourceKind, shadowedSourceKind }
```

Người soạn bị che sẽ báo *"bài của tôi không hiện"*, và dòng log này là thứ duy
nhất trả lời được vì sao.

**Vì sao KHÔNG chặn ở lúc tạo.** `authoring.create` chỉ từ chối id trùng với một
bài **DB** khác, không từ chối id trùng với bài trên đĩa. Chặn ở đó sẽ là một
luật thứ hai, và nó sẽ lệch khỏi luật này ngay khi nội dung vendored thêm hoặc
bớt bài — một bài DB hợp lệ hôm nay trở thành bất hợp pháp sau một lần
`vendor-scenarios`, mà không ai chạm vào nó.

---

## 2. Thứ tự của `list()` — **sắp lại toàn bộ theo `id`, một lần**

Không phải "đĩa trước rồi DB sau". Composite gộp hai danh sách rồi
`sort((a, b) => a.id.localeCompare(b.id))` trên kết quả cuối.

Lý do là phân trang: `listInputSchema.cursor` dựa vào một thứ tự **toàn phần và
ổn định**. Nối hai danh sách đã-sắp-riêng cho ra một dãy không đơn điệu, và một
cursor trên dãy đó bỏ sót hoặc lặp mục ở đúng chỗ nối — một lỗi chỉ hiện ra khi
có đủ mục để sang trang thứ hai.

---

## 3. Asset của bài DB nằm đâu, ai phục vụ?

**Nằm trong Postgres** (`content_assets.bytes`, kiểu `bytea`), phục vụ bởi
`/api/scenarios/[id]/assets/[...path]` — **cùng route** đang phục vụ asset của
bài vendored, cùng cổng kiểm session.

### Vì sao không phải PVC, dù phase-9 task 15 nói vậy

Câu "lưu ở PVC (`local-path` đang có)" viết khi chưa đối chiếu với
`infra/helm/platform/values.yaml`: **`web.replicaCount: 2`**, và storageclass duy
nhất trên cụm là `local-path`, vốn **RWO**. Chart đã ghi đúng hệ quả đó cho
registry-mirror:

> *"Recreate vì PVC là RWO: hai pod cùng mount một PV local-path không lên"*

Một asset ghi qua pod A sẽ 404 ở pod B trong khoảng nửa số lượt. Đó là một lỗi
ngắt quãng, khó tin, và người soạn sẽ báo nó là *"ảnh lúc có lúc không"*.
Postgres là kho **dùng chung** duy nhất đang có.

### Cái giá, và chỗ nó được giữ trong tầm

Mỗi lượt phục vụ ảnh là một truy vấn DB, và `pg_dump` phình theo nội dung. Trần
`MAX_CONTENT_ASSET_BYTES` = **2 MiB/file** cộng allowlist chỉ ảnh raster
(`.png .jpg .jpeg .gif .webp`) giữ cái giá đó trong tầm.

**`.svg` cố ý KHÔNG có trong allowlist tải lên**, dù route phục vụ chấp nhận nó
cho nội dung vendored: nội dung vendored là XML đã ghim theo commit và có người
review; SVG tải lên là XML người lạ nhập, mang script được, và lớp phòng thủ duy
nhất khi đó là header CSP của route. Hai lớp rẻ hơn một.

**Khi nào chuyển sang object store:** khi nội dung cần file lớn hơn 2 MiB, hoặc
khi `pg_dump` trở thành vấn đề vận hành. Đường đi là MinIO trong chart + đổi
`content/assets.ts` sang đọc/ghi qua nó; `storageKey` đã là khoá độc lập với
cách lưu, nên markdown của bài không phải sửa.

### Đường dẫn: hai hình dạng, không giao nhau

| Hình dạng path | Nguồn |
|---|---|
| Một segment khớp `^[0-9a-f]{32}$` | DB — `storageKey` |
| Mọi thứ khác | Đĩa — đường dẫn tương đối trong `<scenario>/assets/` |

Không có giao nhau: tên file trên đĩa upstream đều có đuôi, nên không tên nào
khớp 32-hex-không-đuôi.

### Chống path traversal: không có đường dẫn để traverse

Tên file người soạn nhập **chỉ** đi vào cột `filename` (hiển thị). Thứ đi vào URL
là `storageKey` do server sinh — 32 hex, không đuôi, không dấu phân cách. Một tên
file `../../etc/passwd` lưu được và vô hại, vì nó không bao giờ được nối vào bất
cứ đường dẫn nào.

So sánh: đường đĩa **phải** xử lý đường dẫn (nội dung vendored tham chiếu ảnh
bằng đường tương đối), nên ở đó phòng thủ là `resolve` + so tiền tố. Đường DB
không có cái cửa đó.

`readContentAsset` tra theo **cả** `(contentId, storageKey)` dù `storage_key`
unique toàn cục: URL mang `contentId` và cổng quyền kiểm trên bài đó; bỏ
`contentId` khỏi câu tra sẽ phục vụ được asset của bài khác qua URL của một bài
mình có quyền.

---

## 4. Cache — **đĩa CÓ, DB KHÔNG**

| Nguồn | Cache |
|---|---|
| Đĩa | Promise, cả vòng đời tiến trình, ba cache tách rời theo loại nội dung |
| DB | **Không cache gì.** Mỗi lời gọi là một truy vấn |
| Composite | Không thêm cache riêng |

Nội dung trên đĩa được nướng vào image lúc build nên nó không đổi trong vòng đời
tiến trình. Nội dung DB đổi bất cứ lúc nào, và phase-9 task 11 nói thẳng cái giá:

> *"Một bài vừa sửa mà 5 phút sau mới thấy là một lỗi người soạn sẽ báo là 'mất
> bài'."*

`list()` của nguồn DB chỉ đọc cột metadata — `stepCount` là một subquery `count`,
không chạm `markdown` — nên cái giá của việc không cache là một `SELECT` hẹp trên
vài chục dòng.

---

## Ai thấy gì

Luật nằm ở **một** chỗ: `visibleStates()` trong
`packages/shared-types/src/authoring.ts`, hàm thuần, kiểm được không cần
Postgres. Repository dịch nó sang `WHERE`; **không procedure nào tự viết
`where(state = 'published')`**.

| Người xem | Thấy |
|---|---|
| Chưa đăng nhập, `user` | `published` |
| `author` | `published` của mọi người + **mọi state của chính mình** |
| `admin` | Mọi state của mọi người |

`archived` **không** nằm trong tầm nhìn của người học: thu hồi giữ *dữ liệu*
(tiến độ đã có), không giữ *chỗ trong catalog*.

**Bài nháp không hiện ở `/lessons`, kể cả với tác giả của nó.** Nguồn của
`/lessons` là `scenarioSource()` — zero-arg, `published-only`. Chữ ký zero-arg là
một ràng buộc, không phải sự tiện tay: ô AC của phase-9 đòi
router/`checkStep`/FE không sửa một dòng nào khi thêm nguồn DB, và một
`scenarioSource(ctx)` sẽ phá đúng ô đó. Bài nháp sống ở `authoring.list`, nơi
nguồn được dựng kèm tầm nhìn.

Đó cũng là hành vi đúng về sản phẩm: một bản nháp hiện trong catalog người học —
kể cả chỉ với tác giả — làm câu hỏi *"bài này đã lên chưa"* không trả lời được từ
màn hình.

---

## Một nguồn chết thì sao?

`list*()` bỏ qua nguồn ném lỗi và trả những gì còn lại, kèm WARN nêu đích danh
`kind` của nguồn hỏng. `/lessons` không trắng trang vì Postgres sập.

> ⚠ **Đánh đổi, ghi thẳng ra:** một danh sách THIẾU trông y hệt một danh sách ĐỦ.
> Người học không phân biệt được *"hôm nay ít bài"* với *"một nguồn đang chết"*.
> Dòng WARN là tín hiệu duy nhất của chế độ hỏng này — nó phải đi vào log và phải
> có ai đó nhìn.

`get*()` thì khác: nếu **mọi** nguồn đều ném, nó **ném**, không trả `null`.
`null` sẽ thành 404, và 404 nói rằng bài không tồn tại — một khẳng định ta vừa
mất hết cơ sở để đưa ra.

---

## Vòng đời một bài soạn trên UI

```
draft ──publish──► publishing ──chạy thử ĐẠT──► published
  ▲                    │
  └───chạy thử TRƯỢT───┘  (publishError mang lý do)

published ──archive──► archived        (KHÔNG xoá)
published ──update───► <id>__draft     (bản nháp kế nhiệm)
<id>__draft ──publish ĐẠT──► nội dung thay thế <id>, bản nháp biến mất
```

**`publishing` không có trong bản phác của phase-9**, và nó được thêm vì lượt
chạy thử của task 18 không vừa trong một request: dựng sandbox mất tới ~49 s cho
bài `kubernetes` (đo ở P7), rồi còn setup + verify của từng bước với trần BFF
135 s mỗi lượt. Một mutation đồng bộ sẽ trả *"lỗi mạng"* cho một lượt xuất bản có
thể đã thành công.

**Sửa bài đã xuất bản không đổi nội dung dưới chân người đang học** (task 20):
lần sửa đầu tiên tạo `<id>__draft`; bản đang chạy giữ nguyên từng byte cho tới
khi bản nháp `publish` đạt, lúc đó nội dung của nó thay thế bản gốc trong **một**
transaction. Hậu tố `__draft` an toàn vì `scenarioIdSchema` không cho phép ký tự
`_`, nên nó không bao giờ va vào một id người soạn tự đặt được.

> ⚠ **Giới hạn đã biết:** `progress.step_index` của người đang học **không** được
> điều chỉnh khi bản nháp đổi số bước. Một bản nháp rút bài từ 6 bước xuống 3 để
> lại những dòng progress trỏ ra ngoài mảng. FE phải kẹp chỉ số theo
> `steps.length` — cùng phép kẹp nó đã cần cho bài vendored bị đổi ở upstream.

> ⚠ **Giới hạn đã biết:** lượt chạy thử là một promise trong tiến trình của pod
> đã nhận request. `web` chạy 2 replica; pod đó chết giữa chừng thì bài kẹt ở
> `publishing`. Lưới an toàn là `publish_started_at` + `PUBLISH_TRIAL_STALE_MS`
> (15 phút): quá hạn thì được **đọc** là đã treo và `publish` cho khởi động lại.
> Đó là một lưới, không phải một hàng đợi. Đường đúng khi cần chắc chắn là một
> job queue có leader election.

---

## Script do người soạn nhập — mô hình mối đe doạ

Bảng rủi ro của phase-9 gọi đúng tên: **đó là thiết kế, không phải lỗ hổng.** Nó
dựa trên ba vế, không phải một:

1. Chỉ `author`/`admin` ghi được vào `content_steps` — `authorProcedure` (vai trò)
   **và** `assertContentOwner` (chủ sở hữu). Hai cổng, không phải một.
2. Script chạy trong sandbox, vốn là ranh giới cô lập của nền tảng (luật 10) —
   **cùng** ranh giới đang chứa script vendored do người lạ trên GitHub viết.
3. Một request **không bao giờ** mang script tới `runScriptInSession`, dù người
   gửi là author: mọi caller tra script theo `(contentId, stepIndex)` trong
   nguồn nội dung.

Vế 3 là bất biến mà `apps/web/src/server/lessons/validate.ts` giữ, và nó vẫn
nguyên vẹn sau P9 — chỉ có lời giải thích ở đó phải đính chính, vì câu cũ nói
"script đến từ đĩa" và điều đó không còn đúng.

**`shellcheck` chạy lúc lưu, cảnh báo, không chặn** (task 13) — nội dung vendored
vốn không sạch. Nó chạy với `--shell=bash`, **bắt buộc**: `execShell` của sandbox
là bash, không phải `sh`, và `shellcheck` mặc định `sh` sẽ báo lỗi cho
`pipefail`/`[[ ]]`/mảng — người soạn sẽ sửa cho hết cảnh báo và làm script tệ đi
(task 14).

> ⚠ Image `apps/web` **không cài `shellcheck`**. Nên trên cụm hiện tại, đường mặc
> định là *không kiểm được*, và câu trả lời nói đúng điều đó: `available: false`
> là một giá trị **riêng**, không phải "0 cảnh báo". Gộp hai thứ đó lại là đúng
> chế độ hỏng mà `rules/green-that-proves-nothing.md` mô tả. FE phải hiện chúng
> khác nhau.

---

## Cột nào KHÔNG tồn tại, và vì sao

| Không có | Vì |
|---|---|
| `stepCount` / `taskCount` | `count(content_steps)` — subquery ở chỗ đọc |
| `size_bytes` trên asset | `octet_length(bytes)`, cùng dòng |
| `source` (repo/commit/license) | Bài soạn trên UI không có upstream; hằng `null` |
| `ignoredUpstreamFields` | Cùng lý do; hằng `[]` |
| `stale` cho lượt xuất bản treo | Tính từ `publish_started_at`; một cột như vậy cần ai đó chạy để cập nhật, và "ai đó" chính là thứ vừa chết |
| boolean "đã xuất bản chưa" | `state` **là** nó |

**Ngoại lệ có lý do — `sha256` thì CÓ.** Tính lại nó từ chính `bytes` đang lưu
rồi so với chính nó thì không chứng minh được gì. Giá trị này là *nhân chứng của
thứ đã nhận ở biên*, tính một lần lúc upload — nên nó phát hiện được hỏng ngầm,
và nó làm được `ETag` mà không phải đọc cả blob lên.

**Ngoại lệ có lý do — `estimated_minutes` thì CÓ.** Người soạn nhập tay. Không có
cách nào tính thời lượng từ markdown mà không bịa ra một hằng số "phút mỗi từ".
