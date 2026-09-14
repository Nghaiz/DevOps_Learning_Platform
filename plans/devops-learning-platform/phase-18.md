# Phase 18 — Hệ OJ đa-game, Level Builder, chế độ thi

**Mức chi tiết:** DETAILED · **Effort:** L · **Blocked by:** P17 (17.A, 17.J, 17.Q) · **Blocks:** không
**SSOT thiết kế:** [`plans/reports/2026-09-11-brainstorm-git-cicd-games.md`](../reports/2026-09-11-brainstorm-git-cicd-games.md) §5, §6
**Chạy:** tuần tự một luồng (`/t1k:cook`).
**Plane:** bỏ qua theo `rules/no-outbound-from-this-project.md`.

> Chặng này khác P17 và P19 ở một điểm bản chất: nó **đụng vào code đang chạy và dữ liệu thật**,
> không phải xây thứ mới bên cạnh. Rủi ro chính là hồi quy, không phải tiến độ.

---

## 0. Hiện trạng đo được (scout 2026-09-11)

| Giả định | Thực tế đo được |
|---|---|
| Hệ OJ dùng chung được cho nhiều game | **Không.** Toàn bộ gắn cứng vào K8s: `packages/games/src/k8s/problem.ts` khai `ClusterSpec`, `PROBLEM_TOPICS` là 9 chủ đề K8s, bảng vị từ là `PREDICATES` của K8s. |
| Trang soạn bài có sẵn | **Có, và khá đầy đủ.** `apps/web/src/app/author/problems/` — `cluster-fields`, `node-fields`, `objective-fields`, `predicate-spec`, `arena-preview`, `json-transfer`, `problem-editor`. Đây là tài sản, không phải nợ. |
| Có khái niệm "kỳ thi" | **Không.** Không bảng `exam`, không `exam_attempt`, không khái niệm lớp/nhóm học. |
| Có khái niệm "lớp" | **Không.** `/admin/users` quản lý người dùng phẳng. **Chốt 2026-09-11: dùng lại role `admin` cho giảng viên**, không thêm role mới. |
| Bảng `problems` có dữ liệu | ~~**Rỗng trên cài đặt sạch**, và **không có nguồn seed nào**~~ → **ĐÃ LẠC HẬU, xem dòng dưới.** |
| `Objective` hiện có trọng số | **Có `required: boolean`**, không có trọng số số học. Khớp với mô hình testcase đã chốt. |

### 0.1 Đính chính sau khi P17 gộp (đo lại 2026-09-14)

Bảng §0 ở trên scout ngày **2026-09-11**. P17 gộp vào `main` ngày **2026-09-14**
(`6f19cbe`), P17b gộp cùng ngày (`24499ab`), và ba dòng của bảng đã hết đúng. Ghi
lại thay vì sửa đè, vì một plan không nói mình đã sai ở đâu là một plan người sau
vẫn tin.

| Plan viết | Mã nói gì (đo 2026-09-14) | Hệ quả |
|---|---|---|
| "không có nguồn seed nào" cho bảng `problems` | **Có.** `packages/games/src/k8s/problems-seed/` có 10 bài (`k8s-0001`…`k8s-0010`), export qua barrel là `PROBLEMS_SEED`, và `scripts/seed-content.mjs` nạp chúng (dòng 126, 283, 652) kèm cổng đếm lại số dòng đã ghi | **18.D.7 gần như đã xong.** Việc còn lại là xác minh AC-4 trên một cài đặt sạch thật, không phải viết nguồn seed mới |
| `git/problem-plugin.ts` dùng `GitRepoSpec` (18.A.5) | **Không có kiểu nào tên đó.** Kiểu thật là `WorldSpec` (`git/contract.ts:796`) | Đổi tên trong plan, không đổi mã |
| `core/` sạch, chỉ cần chuyển `Problem` lên | `core/verify.ts` **còn 5 import kiểu** từ `../k8s/contract.ts` | Món nợ thêm cho 18.A — xem khối cảnh báo ở AC-A |

Một dòng nữa không sai nhưng thiếu: plan §18.B.1 đặt tên kiểu là `Verdict`. Tên đó
**đã có chủ** — `git/predicates.ts:383` khai `Verdict` cho LEVEL (một object có
`bonusMet`). Bản của bài OJ mang tên `ProblemVerdict`; lý do đầy đủ ghi tại chỗ
khai trong `core/problem.ts`.

### 0.2 NỢ CHẶN 18.C — ô gác 17.J.5 đang sống nhờ phụ thuộc của người khác

Phát hiện ngày 2026-09-14 khi lane gỡ `core/verify.ts`. **Chưa vá** (vá đòi
`pnpm install`, mà lúc phát hiện có hai lane đang chạy test trên cùng cây).

`packages/games/src/git/determinism.jsdom.test.ts` là ô gác của §17.J.5 — điều
kiện mà plan này gọi thẳng là *"điều kiện sống còn của P18"*: engine phải cho
cùng kết quả **từng byte** ở Node và ở trình duyệt. Nếu nó sai thì server chấm
lại ra một số, người chơi thấy một số khác, và mọi lượt nộp hợp lệ đều bị từ chối.

**`packages/games/package.json` KHÔNG khai `jsdom`.** Bốn package khác có test
jsdom đều khai đúng (`apps/web`, `packages/{motion,terminal,ui}`) — `games` là
ngoại lệ duy nhất.

Ba phép đo, ngày 2026-09-14:

| Đo | Kết quả |
|---|---|
| `grep jsdom packages/games/package.json` | rỗng |
| `ls packages/games/node_modules/jsdom` | không tồn tại |
| `require.resolve('jsdom', { paths: ['packages/games'] })` | **`MODULE_NOT_FOUND`** |
| `npx vitest run src/git/determinism.jsdom.test.ts` | **5 passed**, `environment 17.26s` |

Node không giải nổi, vitest giải được — qua kho ảo `.pnpm`, nơi `jsdom` chỉ có
mặt vì bốn package kia kéo nó vào. Ô gác này **không có phụ thuộc của riêng nó**.

**⛔ ĐÍNH CHÍNH LỜI CỦA CHÍNH MỤC NÀY (đo 2026-09-14 19:18).**

Bản đầu của mục này viết: *"khi đường giải hỏng, vitest không báo lỗi — nó in
`Test Files no tests` và **thoát 0**"*, rồi gọi đó là một ca của
`rules/green-that-proves-nothing.md`. **Đã chạy đối chứng, và câu đó SAI.**

Đổi docblock sang `@vitest-environment khong-ton-tai-gi-ca` rồi chạy:

```
 Test Files  no tests
      Tests  no tests
     Errors  1 error
rc=1
```

Nó in `no tests` **kèm một dòng `Errors` và thoát 1**. Nó ĐỎ. Không im lặng, và
không phải một ca green-that-proves-nothing. Lời khai cũ suy ra từ chữ "no tests"
mà không chạy thử — đúng loại lỗi mục này sinh ra để bắt, chỉ là bắt người viết
nó. Lane báo ô này **đỏ** lúc 18:19, và "đỏ" lẽ ra đã đủ để bác bỏ "thoát 0".

**Bản vá vẫn giữ, nhưng vì lý do khác và nhỏ hơn.** Một phụ thuộc không khai mà
giải được nhờ kho ảo `.pnpm` là thứ hoạt động cho tới khi bốn package kia bỏ
`jsdom`, hoặc cho tới một lượt cài có thứ tự khác. Nó là **mong manh**, không
phải **âm thầm** — khi vỡ thì CI đỏ chứ không xanh giả.

**Đã vá 2026-09-14:** thêm `"jsdom": "^30.0.1"` vào `devDependencies` của
`packages/games/package.json` (đúng phiên bản bốn package kia dùng) + `pnpm
install`. Đo lại: `require.resolve('jsdom', { paths: ['packages/games'] })` nay
**giải được** (trước đó `MODULE_NOT_FOUND`), và `determinism.jsdom.test.ts` chạy
5/5.

**Bài học giữ lại, vì nó đáng hơn bản vá:** "`no tests`" KHÔNG đồng nghĩa "thoát
0". Trước khi gọi một thứ là green-that-proves-nothing thì phải **phá nó và xem
mã thoát**, chứ không suy từ hình dạng dòng chữ.

---

### 0.3 Hai món nợ phát hiện trong lúc làm — (a) ĐÃ VÁ, (b) vá một nửa

**a) Một lượt `CE` THẬT đọc lại thành `WA (0/5)`. — ĐÃ VÁ 2026-09-15.**

`submit.ts` ghi một lượt không chấm được với `passed = []` và `total > 0`, nên
đọc lại `problemVerdictOf(0, 5)` trả `WA`, và dòng lịch sử hiện `WA (0/5)`.

⚠ **Đừng vá bằng cách đoán từ `passed.length === 0`** — một lượt `WA (0/5)` thật
(người làm chạy được nhưng không qua case nào) cũng có `passed` rỗng. Hai ca khác
nhau về nguyên nhân, giống hệt nhau về dữ liệu đang lưu.

Vá đúng cần **một cột thứ ba mang lý do hỏng**. `failedReason` không lưu được vì
nó là câu tiếng Việt chứ không phải dữ liệu; cần một mã ngắn (enum) bên cạnh.

Đã vá một nửa ở tầng hiển thị: `total === 0` nay hiện *"chưa chấm theo testcase"*
thay vì `CE`, vì in `CE` lên một lượt cũ là nói với người chơi rằng bài của họ
sai cú pháp trong khi không hề. Nửa còn lại (`CE` thật, `total > 0`) chưa vá được
mà không thêm cột.

> **Đã đóng ở migration 0015** (`problem_submissions.fail_code`) + `PROBLEM_FAILURE_CODES`
> ở `core/problem.ts`. Ô gác: nhóm `AC-3` trong
> `apps/web/src/server/problems/submission-grade.integration.test.ts`, trong đó ô
> quan trọng nhất là **đối chứng**: hai dòng có `passed`/`total` GIỐNG HỆT nhau
> đọc ra hai verdict khác nhau. Nếu ô đó xanh khi `failedCode` bị bỏ qua thì cột
> thứ ba đang không làm gì.
>
> ⚠ **Một ngõ cụt đã đi vào, ghi lại để lượt sau khỏi đi lại.** Đo lần đầu
> `grep "verdict: 'CE'"` trên `packages/games` ra **ba** chỗ dựng `CE`, và **cả
> ba đều có `total: 0`** — từ đó gần như kết luận rằng §0.3a tự nó sai, rằng
> không đường nào đẻ ra `CE` với `total > 0`. Kết luận đó SAI, và nó sai vì phép
> đo chỉ nhìn `packages/games`. Đường thật nằm ở `apps/web`:
>
> ```ts
> // submit.ts — gradeSubmission
> if (status === 'engine-khong-tat-dinh') return gradeOf(status, [], testcases.length);
> ```
>
> `gradeOf` nhận `total` là **số testcase của bài**, không phải `0` của plugin.
> Bài học: một phép đo trên MỘT package không kết luận được về hành vi của cả
> hệ; đúng hình dạng `rules/negative-result-scope.md` — "không có đường nào"
> luôn là một câu về phạm vi đã tìm.

**b) Cổng chống rule-of-three của `packages/copy` mù với tên phẳng.**

`groupBySiblingPrefix` cắt khoá bằng `split('.')`, nên mọi khoá `catalog.problem.*`
rơi chung một nhóm đã lớn hơn ba. Hệ quả đo được:

- dòng `'catalog.problem.verdict'` trong `catalogIntentionalThree` **không miễn
  trừ nhóm nào** — nó đang không làm gì cả;
- vế chống-ôi ở `scan.ts:233` dùng `startsWith(prefix + '.')`, trong khi khoá
  thật viết `verdict-ac` bằng **gạch nối**, nên nó cũng không báo dòng đó đã ôi.

Tức là một dòng miễn trừ vô tác dụng đang nằm đó và **không cổng nào nói ra**.
Đây đúng hình dạng `rules/prefix-grouping-gate-blind-to-flat-names.md`. Cách kiểm
bản vá: gỡ MỘT dòng miễn trừ đang có tác dụng thật và xác nhận cổng đỏ **đúng tên
nhóm đó**; nếu nó đỏ chung chung thì bản vá chưa đúng.

> **2026-09-15 — vá NỬA SAU, nửa trước còn mở và cần chủ dự án chốt.**
>
> Đã vá (`2286706`): vế chống-ôi đổi từ `startsWith(prefix + '.')` sang
> `isDescendantKey`, nhận cả `.` lẫn `-`. Nó lập tức báo `catalog.problem.verdict`
> là ôi, và dòng đó **đã xoá** — vế "làm cho nó thật sự miễn trừ một nhóm" là bất
> khả: tiền tố ấy có **5** khoá con phẳng (8 nếu tính ba khoá `-note`), mà không
> độ mịn nào biến 5 hay 8 thành 3. Đối chứng dương đã chạy trên một dòng khác
> (`common.difficulty`) và cổng đỏ đúng tên nhóm đó kèm đúng ba thành viên.
>
> **Còn mở:** `groupBySiblingPrefix` vẫn cắt bằng `split('.')`, nên một nhóm ba
> THẬT đặt tên phẳng vẫn đi qua T3 vô hình. Lane đã đo giá của cả ba cách sửa
> trên 11 surface, và không cách nào miễn phí:
>
> | Phương án | Nhóm ba MỚI phải khai lý do | Nhóm ba MẤT (hồi quy) |
> |---|---|---|
> | Cắt ở dấu phân cách **cuối cùng** | ~40 | **6** |
> | Gom ở **mọi** ranh giới | 47 | 1 |
> | Dấu chấm + bóc **một** tầng gạch nối | 27 | 0 |
>
> Hôm nay thứ duy nhất chặn là **quy ước** "nhóm ba thật thì đặt lồng"
> (`surfaces/shell.ts:161`, `surfaces/me.ts:349`) — và quy ước thì chỉ review mới
> bắt được. Số đo nằm trong chú thích `scan.ts` để lượt sau khỏi đo lại.
>
> **ĐÃ CHỐT (chủ dự án, 2026-09-15): giữ quy ước, chịu rủi ro tên phẳng.** Không
> đổi `groupBySiblingPrefix`. Rủi ro được chấp nhận tường minh: một lane đặt tên
> phẳng cho một nhóm ba THẬT vẫn đi qua T3 vô hình, và chỉ review bắt được. Đừng
> mở lại quyết định này mà không có số đo mới — ba phương án và giá của chúng đã
> đo một lần rồi.

---

### 0.4 Tầng KHO LƯU đã theo kịp 18.A (2026-09-15)

Đợt trước đóng 18.A ở tầng miền (`core/problem.ts`) và tầng giao diện
(`/author/problems` đổi biểu mẫu theo plugin), và ô AC-A xanh. Nhưng ô AC-A chỉ
đo `packages/games/src/core/` — nó **không nhìn xuống kho lưu**, và kho lưu thì
không đi theo:

| Đo 2026-09-15, TRƯỚC đợt này | Kết quả |
|---|---|
| `grep -n "game_id\|gameId" apps/web/src/server/db/schema.ts` | **rỗng** |
| `problems.initial_state` | `jsonb.$type<ClusterSpec>()` — hình dạng K8s |
| `problems.topics` | `text('topics', { enum: PROBLEM_TOPICS })` — tập chủ đề K8s |
| `problems.seedable` | không có cột (hợp đồng đã khai trường) |

Hệ quả: một bài Git soạn xong qua giao diện mới **không có chỗ nào để lưu**.
"OJ đa-game" đúng ở hai tầng trên và sai ở tầng dưới cùng.

**Migration 0015 — thuần THÊM cột, không viết lại dòng nào.** `game_id`
(mặc định `'k8s'`, đúng nghĩa cho dòng cũ), `seedable` (mặc định `false`, chiều
an toàn), `target_state`, và `problem_submissions.fail_code`. `topics` gỡ enum ở
tầng **kiểu** thôi — cột trong Postgres vốn đã là `text[]` theo một quyết định
cũ, nên không có thay đổi dữ liệu.

`StoredProblem` (`apps/web/src/server/problems/dto.ts`) là DTO game-neutral thay
`Problem` của K8s trên toàn đường đọc. Nó đặt ở `apps/web` chứ không ở `core/`
vì phải chở `allowedResources` kiểu `ResourceKind` — đặt vào `core/` là tự làm
AC-A đỏ. Nợ `allowedResources` ghi tên tại chỗ khai.

**Ba chỗ ĐỔI NGHĨA trong đợt này** (không phải dọn dẹp — ghi ra vì chúng đổi kết
quả cho dữ liệu đang có):

1. `isSolved` đọc MỌI testcase, trước chỉ đọc `required`. Theo #20, và không
   khôi phục được: `problemTestcases` không chở `required` qua biên đọc.
2. `publishIssues` đổi "có ít nhất một objective `required`" → "có ít nhất một
   testcase". Vị từ cũ đọc `required` trên dữ liệu mới luôn ra `undefined`, tức
   nó sẽ từ chối xuất bản MỌI bài soạn theo mô hình mới.
3. `problemAsLevel` nay NÉM khi `gameId !== 'k8s'`, và `submitProblem` có cổng
   game riêng trả câu nói được. Nhánh đó trước 0015 là **mã chết**; 0015 làm nó
   thành mã có đường tới.
4. **Mọi lượt không xác minh được nay hiện `CE`** (chốt bởi chủ dự án
   2026-09-15). Trước đó chỉ `engine-khong-tat-dinh` về `CE`; ba trạng thái còn
   lại rơi vào `gradeProblemRun`, nên một lượt `khong-khop` đọc ra `AC` cạnh
   `solved: false, score: 0` — ba câu mâu thuẫn trên cùng một dòng, và
   `verdictFromVerify` thì vẫn nói `CE`. Hai phần của mã trả lời khác nhau cho
   cùng một lượt; nay chỉ còn một câu trả lời.

   ⚠ **Cái giá, phải biết trước khi mở chế độ thi:** `verifyLabel` đã ghi rằng
   `khong-khop` KHÔNG phân biệt được "người chơi sửa dữ liệu" với "bản lưu tới
   từ engine phiên bản cũ". Nên một người học mở tab từ hôm qua, sau một lượt
   deploy đổi engine, nay nhận `CE` *"không chấm được"* thay vì `WA (n/m)` —
   không có phản hồi theo từng testcase. Đó là hệ quả trực tiếp của quyết định,
   không phải một lỗi. Nếu tần suất đó cao thì chỗ sửa là **giảm lệch phiên bản**
   (buộc tải lại khi engine đổi), không phải nới cổng.

   Hệ quả kỹ thuật kèm theo, có lợi: nhánh không-xác-minh không gọi
   `gradeProblemRun` nữa, nên máy chủ bỏ được một lượt phát lại toàn bộ nhật ký
   cho đúng những lượt không dùng tới kết quả ấy.

⚠ **Đường GHI vẫn chỉ nhận bài K8s** — `problemBodyShape` (`validate.ts`) còn
`initialState: clusterSpecSchema`, `topics: z.enum(PROBLEM_TOPICS)`,
`required: z.boolean()`. Đó là §18.D.1-nửa-sau, chưa làm. Hệ quả phải biết:
`crud.ts:191` có một `as unknown as Testcase[]` ở biên ghi, và
`formFromProblem` còn chốt cứng `gameId: DEFAULT_AUTHOR_GAME` — đọc `gameId`
thật lúc này sẽ mở một bài Git rồi ghi đè nó bằng một `ClusterSpec`.

⚠ **Hai cổng đang lệch nghĩa nhau:** `problem-validate.ts:121` (client) vẫn hỏi
`some(o => o.required)` trong khi `publish-gate.ts` (server) đã nới về
`length === 0`. Client chặt hơn server nên an toàn, nhưng hai bên nay nói hai
điều khác nhau về cùng một bài — gộp lại khi §18.D.1 mở đường ghi.

---

## 1. Quyết định chi phối

Từ design §1, và một làm rõ bổ sung ngày 2026-09-11:

- **#4** OJ tổng quát hoá thành đa-game, `Problem` lên `core/`, phần engine-riêng thành plugin theo `GameId`.
- **#9** Chế độ thi: có giờ · chấm theo testcase · đề sinh theo seed · bảng điểm + xuất CSV.
- **#17** Level Builder trực quan, làm ngay đợt đầu.
- **#20** **Objective = testcase.** Verdict `AC` chỉ khi qua hết; nếu không thì `WA (4/5)`.
  Không có trọng số riêng cho từng objective — chủ dự án đã bỏ khái niệm đó tường minh.

---

## 2. Chuỗi công việc

### 18.A — Tổng quát hoá `Problem` (L, ~1 tuần) · **KHÔNG ĐƯỢC CẮT**

Chặn 18.B, 18.C, 18.D và toàn bộ phần OJ của P19. Đây cũng là chuỗi rủi ro nhất của cả ba phase
vì nó động vào code có người đang dùng.

| # | Việc | Ước |
|---|---|---|
| A.1 | **Chụp ảnh hồi quy trước khi động vào gì.** Viết test khoá hành vi hiện tại của toàn bộ bài K8s: nạp, chấm, hiển thị. Test này phải xanh **trước** và **sau** refactor, không sửa một dòng. | 4h |
| A.2 | `core/problem.ts` — `ProblemBase { code, gameId, title, statement, difficulty, topics[], tags[], testcases[], hints[], seedable }` | 3h |
| A.3 | `core/problem-plugin.ts` — `interface GameProblemPlugin { initialSpec, predicates, topics, authorFields }`. `authorFields` là **mô tả form dạng dữ liệu**, không phải JSX (JSX ở `core/` sẽ kéo React vào package cấm React). | 4h |
| A.4 | `k8s/problem-plugin.ts` — chuyển từ `k8s/problem.ts` hiện tại. Giữ nguyên hành vi. | 4h |
| A.5 | `git/problem-plugin.ts` — `initialSpec` là `GitRepoSpec`, bảng vị từ riêng, tập chủ đề riêng | 4h |
| A.6 | Tầng UI đọc plugin theo `gameId` đang chọn; form đổi theo `authorFields` | 4h |
| A.7 | Chạy lại A.1. Nếu đỏ một dòng thì dừng, không đi tiếp. | 2h |

**AC-A:** test A.1 xanh trước và sau, **không sửa test** · chọn `gameId` trên `/author/problems`
đổi form đúng plugin · `core/` không phụ thuộc game nào, đo bằng lệnh dưới.

> ⚠ **Ô đo đã được sửa ngày 2026-09-14 — bản cũ đo nhầm thứ.** Plan viết
> `grep -n "ClusterSpec" packages/games/src/core/` phải trả rỗng. Lệnh đó đếm cả
> **văn xuôi**: khối chú thích giải thích *vì sao* `core/` không được biết
> `ClusterSpec` sẽ tự làm chính ô này đỏ. Một ô nghiệm thu chỉ có thể qua bằng
> cách cấm nhắc tên vấn đề trong chú thích là một ô đỏ vì lý do sai.
>
> Thứ cần đo là **phụ thuộc**, không phải chính tả:
>
> ```bash
> grep -rn "from '\.\./k8s\|from '\.\./git" packages/games/src/core/ --include=*.ts
> ```
>
> Đo ngày 2026-09-14, lệnh này **không rỗng**: `core/verify.ts` và
> `core/verify.test.ts` còn import `CreateSession`, `K8sGameAction`, `K8sSession`,
> `Level`, `SessionStatus` từ `../k8s/contract.ts`. 17.A.2 đã chuyển phần *chạy*
> lên dạng rộng (chú thích trong file nói rõ điều đó) nhưng **năm import kiểu thì
> còn lại**. Plan không nhắc món này — nó thuộc 18.A, và nó chặn 18.C: `verify.ts`
> chính là bộ phát lại chống gian lận mà chấm-lại-phía-server dựa vào, nên nó
> không thể còn dính vào một game.

⚠ `PROBLEM_DIFFICULTIES` (4 bậc, `easy|medium|hard|expert`) **cố ý khác**
`SCENARIO_DIFFICULTIES` (3 bậc). Đừng ánh xạ ngầm giữa hai thang — comment trong
`k8s/problem.ts` đã dặn rõ, và nó vẫn đúng sau khi chuyển lên `core/`.

### 18.B — Testcase và verdict (M, ~2 ngày)

| # | Việc | Ước |
|---|---|---|
| B.1 | `Testcase { id, label, check, args?, visible }` · `Verdict 'AC' \| 'WA' \| 'CE'` | 2h |
| B.2 | `Submission { problemCode, gameId, seed, actions[], passed[], total }`. **Không lưu điểm** — điểm là `passed.length / total`, tính ở chỗ dùng (quy ước No Derived Fields của repo). | 3h |
| B.3 | Hiển thị verdict: `AC` hoặc `WA (4/5)`, kèm testcase nào đỏ | 3h |
| B.4 | Testcase ẩn: `visible: false` chỉ hiện tên **sau khi nộp** (chống dò đáp án bằng cách nộp nhiều lần) | 2h |
| B.5 | `CE` cho lỗi cú pháp: lệnh không tồn tại, YAML hỏng | 2h |

**AC-B:** một bài 5 testcase, làm đúng 4, hiển thị đúng `WA (4/5)` và chỉ đúng testcase đỏ ·
`grep -rn "score" packages/games/src/core/problem.ts` không có cột lưu điểm.

### 18.C — Chấm lại phía server (M, ~3 ngày) · **cốt lõi của tính trung thực**

Design §5.3 nói thẳng: game chạy hoàn toàn phía client, nên điều duy nhất khiến việc chấm tin
được là **phát lại tất định**.

| # | Việc | Ước |
|---|---|---|
| C.1 | Điểm cuối nộp bài: nhận `(problemCode, seed, actions[])`, **không** nhận verdict của client | 3h |
| C.2 | Chạy lại engine phía server, tự tính `passed[]`. Phụ thuộc trực tiếp vào 17.J.5. | 4h |
| C.3 | So verdict server với verdict client; lệch thì ghi log cảnh báo (không chặn — lệch là dấu hiệu bug tất định, không nhất thiết là gian lận) | 3h |
| C.4 | Giới hạn nhịp nộp bài + giới hạn độ dài `actions[]` (một chuỗi 10 triệu lệnh là một cách làm nghẽn server) | 3h |

**AC-C:** một bài nộp với verdict client bị sửa tay thành `AC` vẫn ra `WA` từ server · có test
tự động chứng minh điều đó, không phải thử tay một lần.

⚠ **Ô nghiệm thu này dễ nói dối.** "Server chấm lại" mà server dùng chung một tiến trình với
client thì không chứng minh gì. Test phải chạy engine ở **env node** với đầu vào là JSON thô,
không phải gọi hàm trong cùng bundle.

### 18.D — Trang soạn bài mở rộng (M, ~3 ngày)

| # | Việc | Ước |
|---|---|---|
| D.1 | Chọn `gameId` trước, form đổi theo plugin | 3h |
| D.2 | Quản lý testcase: thêm/xoá/đổi thứ tự, đánh dấu ẩn/hiện | 4h |
| D.3 | Trạng thái bài: nháp / công khai / ẩn | 3h |
| D.4 | Nhập/xuất JSON — dùng lại `json-transfer.tsx` | 2h |
| D.5 | Xem trước bằng chính engine của game — tiền lệ `arena-preview.tsx` | 4h |
| D.6 | Cờ `seedable` trên từng bài + giải thích khi nào bật được | 2h |
| D.7 | **Nguồn seed cho bảng `problems`**: `content/problems/` + nạp trong `seed-content.mjs`. Đây là thứ đóng 4 ô e2e đỏ còn lại từ P16. | 4h |

**AC-D:** trên cài đặt sạch sau `seed-content`, `/problems/:code` và `/author/problems/:code`
render được ⇒ 4 ô e2e đỏ của P16 chuyển xanh · soạn một bài Git đầy đủ qua UI, xuất JSON, nhập
lại, xem trước chạy được.

### 18.E — Level Builder (L, ~1 tuần)

Design §6. Dùng **cùng màn hình** với sandbox của 17.Q.

| # | Việc | Ước |
|---|---|---|
| E.1 | Nút "Đặt làm trạng thái đầu" / "Đặt làm đích" trong sandbox | 3h |
| E.2 | Chọn chế độ so (hash-agnostic? có xét nhánh thừa? so nội dung file?) | 3h |
| E.3 | Soạn đề bài + chọn bài lý thuyết từ `content/` | 4h |
| E.4 | Xuất JSON level, tải về | 3h |
| E.5 | Lưu thẳng vào DB nếu có quyền | 4h |
| E.6 | Xem trước: chơi thử level vừa dựng, có nút "chạy lời giải mẫu" | 4h |
| E.7 | Kiểm tính giải được: cảnh báo nếu trạng thái đích **không** với tới được từ trạng thái đầu bằng tập lệnh cho phép | 4h |

⚠ **Giới hạn phải ghi rõ trên chính giao diện, không giấu trong tài liệu:** Builder chỉ dựng
được level dạng "từ A tới B". Level có **bot đồng đội** (chương 2 game Git) và level có **nhiều
lượt chạy có seed** (chương CI ở P19) cần tham số mà giao diện trực quan khó diễn đạt — hai loại
đó phải viết bằng file TS.

**AC-E:** dựng một level chương 1 hoàn chỉnh **chỉ bằng giao diện**, xuất ra, nạp lại, chơi được,
và `solutionCommand` cho AC · E.7 báo đúng khi đích không với tới được (có test đối chứng dương).

### 18.F — Lớp học (M, ~2 ngày)

Chưa có trong nền tảng. Chế độ thi phụ thuộc vào nó.

**Đã chốt (chủ dự án, 2026-09-11): giảng viên dùng lại role `admin` có sẵn.** Không thêm role
`teacher`, không làm quyền theo tầm lớp. Ai là `admin` thì tạo lớp được, ra đề được, xem điểm
mọi lớp được.

> ⚠ Cái giá phải ghi rõ, vì nó ngược với nguyên tắc đặc quyền tối thiểu mà `rules/security.md`
> đang theo: một giảng viên được cấp `admin` sẽ đồng thời có **toàn quyền hệ thống** — sửa được
> người dùng, xem được audit log, đụng được cấu hình. Chấp nhận được ở quy mô một lớp NCKH; nếu
> sau này mở cho nhiều giảng viên ngoài nhóm thì đây là chỗ phải tách role, và tách sau sẽ đắt
> hơn tách bây giờ.

| # | Việc | Ước |
|---|---|---|
| F.1 | Bảng `class` + `class_member`. `class_member` chỉ có sinh viên; chủ lớp là một cột `ownerId` trỏ tới một `admin`. | 3h |
| F.2 | Trang tạo lớp, thêm thành viên, danh sách — đặt trong `/admin` vì quyền đã là `admin` | 4h |
| F.3 | Phân quyền: sinh viên **chỉ** thấy điểm của chính mình, ở mọi điểm cuối liên quan | 4h |

**AC-F:** một sinh viên gọi thẳng điểm cuối bảng điểm lớp bằng tài khoản của mình ⇒ bị từ chối.
Test tự động, không thử tay.

### 18.G — Chế độ thi (L, ~1 tuần)

| # | Việc | Ước |
|---|---|---|
| G.1 | Bảng `exam { id, title, ownerId, problemCodes[], durationMinutes, seedStrategy, opensAt, closesAt }` + `exam_attempt { examId, userId, seed, startedAt, submittedAt, autoSubmitted }` | 3h |
| G.2 | Trang tạo đề: chọn bài, đặt giờ, chọn `seedStrategy` | 4h |
| G.3 | **Cổng gác:** không cho đưa bài `seedable: false` vào kỳ thi dùng `per-student`. Nếu thiếu cổng này thì mỗi sinh viên nhận một đề khác độ khó mà không ai biết. | 3h |
| G.4 | Màn làm bài: đếm ngược, danh sách bài, nộp từng bài | 4h |
| G.5 | **Mốc thời gian do server cấp**, không tin đồng hồ máy khách. Tự nộp khi hết giờ, kể cả khi tab đóng. | 4h |
| G.6 | Bảng điểm lớp: ai làm bài nào, `AC` hay `WA (n/m)`, sai testcase nào | 4h |
| G.7 | Xuất CSV | 3h |

⚠ **CỔNG SEED — nợ đã ghi 2026-09-14, chưa có, và G.3 một mình KHÔNG đủ.**

Lane dựng nửa máy chủ của đường nộp bài phát hiện: `submit.ts` nhận `log.seed`
**không điều kiện**. Điều đó ĐÚNG cho việc chấm ngoài kỳ thi, và nó là hệ quả cố
ý của quyết định "lượt nộp mang theo seed đã dùng" (xem `core/problem.ts`
§ `Submission.seed`, và commit `ae7ed23`).

Nhưng khi chế độ thi mở, cùng một tính chất đó đọc thành: **người nộp tự chọn
thế giới đầu**. Ai cũng gửi lên được một seed sinh ra cấu hình dễ nhất, và không
có gì từ chối.

Hai vế phải làm, không phải một:

1. **Cổng phía `submit`** (chưa có): với bài `seedable: false`, seed gửi lên phải
   bằng đúng seed bài quy định. Với bài `seedable: true` trong một kỳ thi, seed
   phải bằng đúng seed đã cấp cho `exam_attempt` của chính người đó.
2. **G.3** như plan đã ghi: chặn bài `seedable: false` lọt vào kỳ thi
   `per-student`.

G.3 gác lúc **soạn đề**, cổng trên gác lúc **nộp**. Thiếu cái thứ hai thì một đề
soạn đúng luật vẫn bị lách ở bước nộp, và G.3 sẽ trông như đang bảo vệ một thứ
nó không chạm tới.

⚠ Kèm theo: bảng `problems` **chưa có cột `seedable`** (hợp đồng có trường, kho
lưu chưa có cột). Cổng số 1 không dựng được trước khi cột đó tồn tại.

> **2026-09-15 — cột đã có; cổng số 1 thì KHÔNG dựng được, và lý do quan trọng
> hơn cái cột.**
>
> Cột `problems.seedable` vào ở migration 0015 (mặc định `false`). Nhưng khi bắt
> tay dựng cổng số 1 thì đo ra một thứ làm cả vế đó **sai như đang viết**:
>
> ```ts
> // apps/web/src/components/k8s-arena/arena-session.ts:133
> const seedRef = useRef(Math.floor(Math.random() * 2 ** 31));
> ```
>
> Đấu trường K8s sinh seed **NGẪU NHIÊN mỗi phiên**. Nên một cổng đòi
> `seed === K8S_UNSEEDED_REPLAY_SEED` (`0`) sẽ **từ chối MỌI lượt nộp K8s** — xác
> suất qua là 1 trên 2³¹. Đó đúng là thảm hoạ mà `core/problem.ts` § `Submission.seed`
> mô tả: *"nhìn từ phía người dùng, nó giống hệt một hệ thống từ chối người chơi
> ngẫu nhiên."* Dựng cổng theo chữ của plan hôm nay là tự gây ra nó.
>
> Và seed đó **không phải rác**: nó là chuỗi ngẫu nhiên người chơi đang thấy, và
> `classifyObjectives(level, seedRef.current)` phân loại mục tiêu theo chính nó.
> Ép nó về một hằng là đổi lối chơi, không phải siết bảo mật.
>
> ⚠ Đo thêm, và nó đổi cả khung: `GameProblemPlugin.seedSpec?` là **tuỳ chọn và
> KHÔNG plugin nào khai nó** (`core/problem-plugin.ts:215` nói thẳng *"cả hai
> plugin đều cố ý không khai"*). Nghĩa là hôm nay seed **không hề đổi
> `initialState`** của bài — nó chỉ đổi chuỗi ngẫu nhiên của mô phỏng. Nên câu
> *"người nộp tự chọn thế giới đầu"* chưa đúng theo nghĩa đen; thứ họ chọn được
> là **dòng sự cố**, vẫn làm bài dễ đi nhưng là một mối nguy khác và nhỏ hơn.
>
> **Việc còn lại, cho người làm §18.G — một quyết định trước, rồi mới tới mã:**
> bài không seedable nên (a) dùng seed cố định lúc CHƠI, đổi lại mất tính đa dạng
> mỗi lượt, hay (b) giữ seed ngẫu nhiên và chỉ gác seed **bên trong một
> `exam_attempt`**, nơi máy chủ tự cấp seed và có cái để so? Vế (b) không chặn gì
> ngoài kỳ thi, và nó phải đợi bảng `exam_attempt` (§18.G.1) tồn tại.
>
> ⛔ **Đừng dựng cổng số 1 trước khi chốt câu đó.** Không phải vì thận trọng — vì
> đã đo được rằng bản hiển nhiên của nó làm hỏng mọi lượt nộp.
>
> **ĐÃ CHỐT (chủ dự án, 2026-09-15): HOÃN, ghi nợ.** Không dựng cổng nào đợt này.
> Cột `seedable` đã có nên nền sẵn sàng; quyết định (a) hay (b) để lại cho người
> mở §18.G, và phép đo ở trên là thứ họ cần đọc trước. Rủi ro chỉ hiện thực hoá
> khi chế độ thi mở — ngoài kỳ thi, seed do người nộp mang lên là hành vi CỐ Ý
> của hợp đồng, không phải lỗ hổng.

⚠ **Đồng hồ.** Memory dự án có một bẫy đã cắn: VM ngủ làm vỡ ô nghiệm thu treo theo đồng hồ, và
đồng hồ VM lệch ~59s so với máy chủ. Trong chế độ thi, lệch nhỏ còn nguy hơn lệch lớn vì số vẫn
trông hợp lý. Mọi mốc phải lấy từ **một nguồn duy nhất là server**.

**AC-G:** đổi giờ hệ thống máy khách lên 2 tiếng ⇒ đếm ngược **không** đổi · đóng tab lúc còn 1
phút, mở lại sau 5 phút ⇒ bài đã tự nộp · CSV mở được bằng Excel với tiếng Việt không vỡ dấu
(BOM UTF-8).

### 18.H — Tài liệu (S, ~1 ngày)

`docs/oj-format.md` (định dạng bài + plugin theo game) · `docs/exam-format.md` · cập nhật
`docs/games/README.md`.

---

## 3. Ô nghiệm thu của cả chặng

| # | Ô | Đo bằng |
|---|---|---|
| AC-1 | Không hồi quy bài K8s | Test 18.A.1 xanh trước và sau, **không sửa test** — và phải chạy **CẢ HAI** lệnh, xem dưới |
| AC-2 | Toàn cây xanh | `turbo run build lint typecheck test --force`, đọc `Tasks: X/Y` trước khi trích số |
| AC-3 | Server chấm lại thật | Verdict client bị sửa tay vẫn ra đúng từ server, có test env node |
| AC-4 | 4 ô e2e đỏ của P16 đóng | `/problems/:code` + `/author/problems/:code` render trên cài đặt sạch |
| AC-5 | Level Builder dùng được | Dựng → xuất → nạp → chơi → AC, chỉ bằng giao diện |
| AC-6 | Phân quyền lớp | Sinh viên không đọc được điểm lớp, test tự động |
| AC-7 | Đồng hồ thi | Đổi giờ máy khách không ảnh hưởng; tự nộp khi đóng tab |
| AC-8 | a11y | axe 0 vi phạm trên màn soạn bài, màn làm bài, bảng điểm |
| AC-9 | CSV tiếng Việt | Mở bằng Excel không vỡ dấu |

> ⚠ **AC-1 chạy `test` thôi là CHƯA đo (phát hiện của lane 18.A.1, 2026-09-14).**
>
> Ba ô gác cho bất biến nguy hiểm nhất — *"gợi ý chưa mở không mang `text`"* —
> là cổng ở tầng **KIỂU**. Chúng đỏ ở `tsc`, **không đỏ ở `vitest`**: phá
> `ProblemHintTeaser.text` bằng cách bỏ `| null` cho ra `TS2322` trong khi
> vitest vẫn báo 23/23 xanh.
>
> Nên 18.A.7 phải chạy **hai lệnh, và đọc cả hai**:
>
> ```bash
> pnpm --filter @devops-platform/games typecheck
> pnpm --filter @devops-platform/games test
> ```
>
> Chạy mỗi `test` rồi tuyên bố xanh là bỏ qua đúng nhóm gác cho lỗ hổng đã
> từng phải vá một lần (một API trả thẳng `Problem` xuống trình duyệt làm việc
> trừ điểm gợi ý chỉ còn là hoạt cảnh).
>
> Hai bẫy đọc kết quả đi kèm: `pnpm ... | tail` **nuốt mã thoát** (đọc
> `${PIPESTATUS[0]}`), và vitest **thoát 0 khi mọi test bị skip** — nên phải đọc
> con số `Tests N passed` cụ thể, không chỉ đọc mã thoát.

---

## 4. Rủi ro

| Rủi ro | L | I | Điểm | Giảm thiểu |
|---|---|---|---|---|
| Refactor 18.A làm hỏng bài K8s đang có | 4 | 5 | **20** | Test hồi quy A.1 viết **trước**, chạy lại ở A.7, không sửa test để cho xanh |
| Verdict server ≠ verdict client vì bug tất định | 3 | 5 | **15** | Phụ thuộc 17.J.5. Nếu 17.J.5 chưa xanh thì **không bắt đầu 18.C** |
| Đồng hồ thi bị lệch/bị gian lận | 3 | 4 | 12 | Mốc thời gian chỉ từ server, AC-7 |
| Bài không seedable lọt vào kỳ thi per-student | 3 | 4 | 12 | Cổng G.3 |
| Level Builder không dựng nổi level thật | 3 | 3 | 9 | Giới hạn ghi rõ trên giao diện; hai loại level phức tạp viết bằng TS |
| Giảng viên có role `admin` đụng nhầm cấu hình hệ thống | 3 | 3 | 9 | Chấp nhận theo quyết định 2026-09-11. Giảm bằng audit log (đã có `/admin/audit`) — không giảm bằng phân quyền |
| Bảng `problems` vẫn rỗng sau seed | 2 | 3 | 6 | D.7 + AC-4 |

---

## 5. Thời lượng

| Chuỗi | Effort | Ghi chú |
|---|---|---|
| 18.A tổng quát hoá Problem | L (1wk) | **Không cắt.** Chặn mọi thứ còn lại |
| 18.B testcase + verdict | M (2d) | |
| 18.C chấm lại phía server | M (3d) | Phụ thuộc 17.J.5 |
| 18.D trang soạn bài | M (3d) | Đóng 4 ô e2e đỏ của P16 |
| 18.E Level Builder | L (1wk) | Phụ thuộc 17.Q |
| 18.F lớp học | M (2d) | Chặn 18.G. Rẻ hơn dự tính ban đầu vì dùng lại role `admin` |
| 18.G chế độ thi | L (1wk) | |
| 18.H tài liệu | S (1d) | |
| **Tổng** | **~4–5 tuần** | Đường găng: A → B → C, và A → D; F → G |

---

## 6. Kỷ luật git

Nhánh `feat/p18-oj-exam`, tách từ `main` **sau khi P17 đã gộp**.

`git status` trước mọi lệnh git; commit dạng pathspec.

Chuỗi 18.A đụng vào code đang chạy — commit nhỏ, mỗi commit một bước dịch chuyển có thể lùi lại
được. **Không** gộp cả refactor vào một commit.

---

## 7. Thứ tự cắt nếu hết thời gian

Trong phạm vi P18: cắt **18.E** (Level Builder) trước, rồi **18.H**. Nếu vẫn thiếu thì cắt
**18.G.7** (xuất CSV) và **18.F.2** (giao diện tạo lớp — tạo bằng tay qua DB).

**18.A và 18.C không cắt.** Cái đầu chặn P19; cái sau là thứ duy nhất khiến kỳ thi không phải là
danh dự.
