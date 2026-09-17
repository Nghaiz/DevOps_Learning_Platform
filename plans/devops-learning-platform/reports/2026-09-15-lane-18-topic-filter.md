# Lane 18.D — lọc chủ đề theo game (khối 6)

**Ngày:** 2026-09-15 · **Nhánh:** `feat/p18-oj-exam` · **Commit:** `33d195d` (một commit, 7 file)

---

## 1. Việc đã làm

`/problems` liệt kê chín chủ đề của riêng K8s cho mọi bài. Từ migration 0015 kho
lưu chở được bài của mọi game, nên một bài Git mang chủ đề `branching` hiện nhãn
đúng trong bảng (§18.D đã đóng vế đó) mà không lọc theo chủ đề được.

Đã thêm một bộ chọn GAME; danh sách chủ đề đổi theo game đó. Bảy file:

| File | Việc |
|---|---|
| `problems/problem-game.ts` (mới) | Từ vựng chủ đề theo game, tên game, mặc định, `parseGame` |
| `problems/problem-game.test.ts` (mới) | Ô gác + ô ghim `@ts-expect-error` |
| `problems/problem-query.ts` | `game` vào `ProblemQuery` và vào URL; chủ đề lọc theo từ vựng game đang chọn |
| `problems/use-problem-controls.ts` | `setGame`, xoá chủ đề cũ khi đổi từ vựng |
| `problems/problem-filter-groups.tsx` | `FilterChecklist` nhận `lockedReason` |
| `problems/problems-toolbar.tsx` | `TopicFilter` + `GameSelect` |
| `copy/surfaces/catalog.ts` | 5 khoá `catalog.problems.game*` |

---

## 2. Hai quyết định giao diện tôi tự chốt

### 2.1 Game mặc định lúc mở trang: `k8s`

Lý do hiển nhiên ("K8s có trước, có mười bài seed, Git chưa có bài nào") là
**đúng nhưng không phải lý do nặng nhất**, và nếu chỉ có nó thì quyết định này
sẽ lật ngay ngày lane B seed bài Git đầu tiên.

Lý do thật nằm ở **những liên kết đã gửi đi**. Một `/problems?topic=workload` mà
ai đó đã dán cho bạn cùng lớp không mang tham số `game`, nên game mặc định là
thứ quyết định chủ đề trong link đó còn sống hay bị lọc bỏ lúc đọc lại. Mặc định
`k8s` giữ nguyên **mọi** link cũ. Mặc định `git` hay "mọi game" sẽ làm chúng mở
ra với ô đánh dấu trống: bộ lọc biến mất, không lỗi, không cảnh báo, và người
nhận link kết luận rằng người gửi gửi nhầm.

Cái giá: ngày Git có nhiều bài hơn K8s, mặc định này thành sai về mặt nội dung.
Lúc đó thứ phải đổi là mặc định, và lúc đó vế "link cũ" đã hết hạn vì URL do ứng
dụng sinh ra đã luôn mang `game` (xem §3.2).

### 2.2 Trạng thái "mọi game": KHÔNG có

Chủ dự án đã bác bản gộp phẳng mười bảy chủ đề. Nghĩa còn lại của "mọi game" là
*tắt luôn phép lọc chủ đề* — tức một mục trong danh sách mà việc duy nhất của nó
là vô hiệu hoá chính khối bên dưới. Một điều khiển như thế không giúp ai chọn
được gì.

Có một lý do thứ hai, cứng hơn: id chủ đề để **trần** (`branching`, không phải
`git-branching`) theo quy ước đã chốt ở `git/problem-topics.ts`. Hai game hôm
nay không trùng id nào — ô gác `hai game cho hai tập chủ đề RỜI NHAU` đo điều đó
— nhưng **không có gì bắt buộc điều đó mãi mãi**. Trong một rổ "mọi game", ngày
đầu tiên hai game trùng một id thì một ô đã đánh dấu không còn nói được nó thuộc
game nào, và phép lọc sẽ lặng lẽ trộn bài của hai game. Bộ chọn một-game-một-lúc
làm chỗ nhập nhằng đó **không dựng được**, chứ không phải chỉ tránh được.

Cái giá, ghi thẳng: ai muốn xem cả kho mà vẫn lọc chủ đề thì không có đường.
Đánh đổi lấy việc không có ô đánh dấu nào mơ hồ.

### 2.3 Bộ chọn đổi TỪ VỰNG, cố ý không lọc danh sách bài

Đây không phải quyết định thứ ba mà là hệ quả của §3, nhưng nó là thứ dễ đọc
nhầm nhất nên nói thẳng: chọn "Git Game" **không** thu hẹp bảng bài. Câu
`catalog.problems.game-hint` vì thế chỉ hứa đúng một vế ("Chọn game để đổi danh
sách chủ đề bên dưới"), và bộ chọn nằm **trong** khối chủ đề chứ không nằm cạnh
"Sắp xếp theo" — chỗ đứng là lời giải thích rẻ nhất; đặt nó trên hàng điều khiển
đầu sẽ đọc như một chiều lọc thứ năm ngang hàng độ khó.

Thực tế nó vẫn thu hẹp, chỉ là gián tiếp: `branching` chỉ có trên bài Git, nên
chọn chủ đề đó ra đúng tập bài Git. Khác nhau ở chỗ phép thu hẹp đến từ chủ đề
người dùng chọn, không đến từ một mệnh đề game mà máy chủ không có.

---

## 3. Ba chỗ chặn, ĐO chứ không suy — đều ngoài vùng sở hữu lane này

Ô gác của khối 6 trong plan là *"Bài Git lọc được theo chủ đề Git"*. **Nó chưa
đóng**, và không đóng được từ trong lane D.

| # | Chỗ | Đo được |
|---|---|---|
| 1 | `packages/games/src/k8s/problem.ts:244` | `ProblemFilter.topics?: readonly ProblemTopic[]`, `ProblemTopic` là union ĐÓNG 9 chủ đề K8s. `'branching'` không gán được ⇒ chặn ở `tsc`, trước cả lúc chạy |
| 2 | `apps/web/src/server/problems/list-input.ts:28` | `problemFilterSchema.safeParse({topics:['branching']})` → `invalid_value`, `"expected one of \"workload\"\|…\|\"troubleshooting\""`. Đối chứng: `{topics:['workload']}` → OK |
| 3 | cùng file, `.strict()` | `safeParse({gameId:'git'})` → `unrecognized_keys` |

(2) và (3) đo bằng một ô test tạm gọi thẳng `problemFilterSchema`, đã xoá sau khi
đọc số. (1) đọc từ khai báo kiểu.

(1) là file hợp đồng không giao lane nào; (2)+(3) thuộc `server/problems/**` của
lane B. Lead đã xác nhận cả ba, bổ sung rằng `core/problem.ts:81` đã khai
`ProblemTopicId = string` và `:304` đã dùng nó — tức (1) là **mẩu sót lại** của
lượt chuyển 18.A, không phải một quyết định cần bàn. Lead chốt làm (1)+(2) thành
MỘT thay đổi sau khi lane B hạ cánh, để không làm `tsc` của lane B đỏ vì một
thay đổi họ không gây ra.

### 3.1 Vì sao nhánh Git KHOÁ lại thay vì gửi đi một 400

Ba đường có thể, chọn đường thứ ba:

- **Ép kiểu `as ProblemTopic`** rồi gửi: `tsc` xanh, người dùng nhận 400. Đây là
  nói dối hệ kiểu để đổi lấy một lỗi lúc chạy.
- **Bỏ Git khỏi bộ chọn** cho tới khi hợp đồng nới: bộ chọn còn một lựa chọn,
  tức một điều khiển chết, và khoảng trống biến mất khỏi màn hình lẫn khỏi trí
  nhớ mọi người.
- **Hiện đủ tám chủ đề Git nhưng KHOÁ, kèm lý do trên màn hình** ← đã chọn.

Danh sách rỗng trả lời sai câu người dùng đang hỏi. Họ muốn biết game này có
những chủ đề nào; "tám chủ đề, chưa lọc được" đúng hơn "không có chủ đề nào".
Khoá bằng `disabled` của chính `Checkbox` chứ không bằng `pointer-events: none`
— cái sau vẫn cho focus bàn phím và vẫn bật được bằng phím cách, tức chỉ khoá
đúng người dùng chuột.

### 3.2 Ô ghim, và vì sao nó nguy hiểm nếu đọc nhầm

`problem-game.test.ts:45` giữ một `@ts-expect-error` ghim rằng
`ProblemFilter['topics']` chưa chở được `'branching'`.

**Nó đỏ theo chiều ngược với trực giác.** `tsc` chỉ kêu khi phép gán đó THÔI còn
lỗi, tức lúc ai đó đã nới hợp đồng — và thông báo là `TS2578: Unused
'@ts-expect-error' directive`, đọc như "có gì vừa hỏng" trong khi sự thật là
khoảng trống vừa ĐÓNG. Phản xạ đầu tiên của người sau là dập nó cho xanh, và
điều đó biến một bản vá tạm thành nền vĩnh viễn
(`rules/pinned-baseline-test-companion.md`).

Nên khối chú thích ngay trên nó nói trước cả hai chiều: đỏ nghĩa là (1) đã về,
việc cần làm là **gỡ ghim và bật nhánh Git** theo bốn bước ghi sẵn tại chỗ, và
có một câu cấm tường minh ba cách làm nó im (đổi sang chủ đề K8s, thêm
`@ts-ignore`, xoá riêng dòng ghim). Bước 4 trong số đó nhắc nửa máy chủ: nới
kiểu mà quên `problemFilterSchema` thì `tsc` xanh còn người dùng nhận 400.

**Đối chứng dương đã chạy:** đổi `'branching'` thành `'workload'` (một chủ đề
hợp lệ) làm `pnpm --filter @devops-platform/web typecheck` ĐỎ với
`src/app/(session)/problems/problem-game.test.ts(45,1): error TS2578`, rc=1.
Khôi phục xong xanh lại, rc=0. Ô ghim này thật sự được `tsc` đọc — nó không nằm
trong một thư mục mà typecheck bỏ qua.

---

## 4. Ô gác khác và đối chứng của chúng

- **Vị từ `topicsFilterable` đo hai chiều**, không chỉ chiều xanh: `k8s` → `true`,
  `git` → `false`. Một vị từ chỉ từng trả `true` có thể đang trả `true` cho mọi
  đầu vào (`rules/green-that-proves-nothing.md`).
- **`pipeline` (không chủ đề nào) phải đọc ra `false`.** `[].every(...)` trả
  `true`, nên vế `ids.length > 0` trong vị từ là vế THẬT; bỏ nó thì bốn game rỗng
  đều "lọc được".
- **Mọi game có từ vựng đều phải có mặt trong bộ chọn.** `PROBLEM_FILTER_GAMES`
  đòi CẢ tên lẫn từ vựng, nên một game được cấp chủ đề mà quên khai tên sẽ đọc ra
  y hệt "game này chưa có chủ đề" — biến mất im lặng, đúng hình dạng §18.D vừa
  đóng một lần.
- **Ô gác chống-rò-engine `engine-leak.test.ts` KHÔNG bị nới, và vẫn xanh.**
  `problem-game.ts` tra qua `problemTopicLabels` (dữ liệu lá) đúng như ràng buộc
  brief; không chạm `PROBLEM_PLUGINS`.

---

## 5. Phép đo cuối

| Lệnh | Kết quả |
|---|---|
| `pnpm --filter @devops-platform/web typecheck` | **rc=0** (10:17, trước khi lane A ghi `git-game.tsx`) |
| `pnpm --filter @devops-platform/web exec vitest run "src/app/(session)/problems/"` | **4 file, 34/34 xanh, 0 skip** |
| `pnpm --filter @devops-platform/copy test` | **72/72 xanh** |
| `pnpm --filter @devops-platform/games typecheck` | **rc=0** |
| `pnpm bundle:check` | **rc=0** — `4/4 route có terminal với tới chunk xterm, 40 route còn lại KHÔNG`; nền chung 6 chunk, 808.580 B / trần 1.150.000 B |
| đối chứng dương ô ghim | `TS2578` đúng dòng 45, rc=1; khôi phục rc=0 |

### 5.1 `bundle:check` này có đo mã của tôi không

Câu hỏi bắt buộc, vì `bundle:check` đọc output `next build` trên đĩa và một
output cũ sẽ cho một màu xanh chẳng chứng minh gì. Đã kiểm bằng dấu thời gian:

```
apps/web/.next/server/app/(session)/problems/page_client-reference-manifest.js  10:21:47
apps/web/.next/static/chunks/2o2slbqwed3pj.js                                  10:21:47
apps/web/src/app/(session)/problems/problems-toolbar.tsx                        10:03:57
apps/web/src/app/(session)/problems/problem-game.ts                             10:01:15
```

Output mới hơn nguồn 18 phút. `next build` **biên dịch xong** (`✓ Compiled
successfully in 34.6s`) rồi mới chạy pha TypeScript và chết ở đó, nên chunk là
của lượt build này và có mã của tôi trong đó.

---

## 6. Hai thứ ĐỎ không phải của lane này, chưa chạm

Cả hai nằm trong `apps/web/src/components/games/git/**` — lane A, đang ghi lúc
tôi đo. Tôi không sửa.

1. **`pnpm --filter @devops-platform/web lint` rc=1** — một lỗi duy nhất:
   `components/games/git/git-game.tsx:286:9 'world' is assigned a value but never
   used`. Không có lỗi nào trong file của lane D.
2. **`pnpm --filter @devops-platform/web build` rc=1** —
   `git-game.tsx:103` truyền prop `draft` cho `GitSandbox`, mà `GitSandboxProps`
   chưa có trường đó. Lane A đang viết dở cả hai đầu.

⚠ (2) là lý do `tsc --noEmit` của tôi lúc 10:17 xanh còn `next build` lúc 10:21
đỏ: lane A ghi `git-game.tsx` vào giữa hai lượt đo. Cây làm việc dùng chung làm
phép đo hết hạn trong vài phút, nên mọi con số ở §5 đều kèm mốc giờ.

---

## 7. Còn hở

- **Ô gác khối 6 chưa đóng.** "Bài Git lọc được theo chủ đề Git" cần (1)+(2) ở
  §3. Lead đã nhận, đã ghi vào `phase-18-exec.md`, làm sau khi lane B hạ cánh.
- **Chưa có bài Git nào trong kho** (`PROBLEMS_SEED` mười bài `K8S-*`). Nên kể cả
  khi (1)+(2) về, lượt kiểm đầu tiên vẫn cần một bài Git đã đăng mới đo được
  đầu-cuối. Đây là việc của khối 5 (E.5 lưu thành Problem), lead giữ.
- **Chưa đo trên trình duyệt thật.** Không có ô Playwright nào chạm khối lọc mới;
  `e2e/routes.ts` là file lead giữ nên tôi không thêm route hay ô a11y được. Thứ
  đã đo là tầng đơn vị cộng `bundle:check`. Một ô e2e đáng có: chọn "Git Game" ⇒
  tám chủ đề hiện và đều `disabled`.
- **Bộ chọn game chưa lọc danh sách bài**, theo §2.3. Nếu sau này chủ dự án muốn
  nó lọc thật thì cần thêm `ProblemFilter.gameId` + mệnh đề trong
  `list-where.ts` — một thay đổi hợp đồng, không phải một dòng ở tầng giao diện.
