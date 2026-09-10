# Lane 16.C — trang chọn bài — báo cáo chặng

**Ngày:** 2026-09-10 · **Nhánh:** `feat/p16-c-catalog` · **Worktree:** `D:/NCKH/wt-p16-c`

---

## 1. Cổng, đo thật

```
pnpm -w turbo run build lint typecheck test
Tasks:    32 successful, 32 total
```

Dòng `Tasks: X/Y` đọc TRƯỚC mọi con số test, đúng theo §7 mục 11: turbo dừng sau task đỏ, nên
32/32 là điều kiện để các con số dưới đây nói về một suite có thật.

| Gói | File | Test |
|---|---|---|
| `@devops-platform/web` | 137 | **1630** xanh |
| `@devops-platform/ui` | 34 | **858** xanh |
| `@devops-platform/copy` | 2 | **52** xanh |

```
node scripts/check-design-tokens.mjs
✓ đối chứng: bắt đủ 13 mẫu màu cứng …, không kêu trên 20 mẫu sạch …
✓ không có màu cứng — đã quét 543 file trong 4 vùng, 4 file được miễn trừ có ghi lý do.
```

---

## 2. Commit

| SHA | Tiêu đề |
|---|---|
| `74f3296` | `feat(web): ô tìm danh mục gập dấu tiếng Việt, kèm đối chứng cho đ` |
| `541e830` | `feat(copy): surface catalog. cho bảy màn chọn bài, kèm đối chứng dương ba cổng` |
| `6a8ef90` | `wip(web): điểm lưu do lead đặt` (lead commit hộ khi tôi chạm trần lượt) |
| `0fd0262` | `test(web): describeGameCount trả khoá nên khẳng định phải dựng câu trước` |
| `4f4e7d1` | `feat(web): /problems dùng SearchTabs cho ô tìm THẬT, và không mượn cảnh báo phạm vi` |
| `746c932` | `feat(web): /paths/[id] theo token + copy mới, và bỏ hai gạch ngang dài` |
| `f845168` | `style(web): /quiz/[id] theo thang chữ và bậc nâng nền của hợp đồng token` |

Cộng `74b0c7b` (merge nhánh nền để lấy hai dep `copy` + `motion`, lead cấp quyền tường minh).

---

## 3. Việc §16.C — xong gì, chưa gì

| Mục | Trạng thái |
|---|---|
| Năm trang danh mục dùng chung một bộ component, dựng lại theo token + copy | **Xong** |
| `SearchTabs` vào `CatalogToolbar`, tab ánh xạ sang bộ lọc đang có | **Xong** |
| `/games` toolbar riêng | **Xong** |
| `/problems` | **Một phần** — xem §5 |
| Icon `ResourceKind` lấy từ `packages/ui`, không từ arena | **Không phát sinh** — xem §6 |
| `paths/[id]` | **Xong** |
| `quiz/[id]` | **Một phần** — chỉ phần hình, xem §5 |

---

## 4. Ba quyết định đáng tranh luận, ghi ra để review được

### 4.1 Ô tìm ở năm trang danh mục chỉ soi TRANG, và nó phải nói ra

Không procedure danh mục nào nhận từ khoá. Đo trên chính mã đang chạy, không đọc từ trí nhớ:
`lessons.list` / `labs.list` mở rộng `listInputSchema` bằng đúng `difficulty`, `tier`,
`capability`, `orderBy`; `playgrounds.list` bằng `tier`; `paths.list` và `quiz.list` nhận nguyên
`listInputSchema`. `listInputSchema` là `.strict()` (`server/trpc/init.ts:219`) nên gửi thêm một
khoá `q` là `400 unrecognized_keys`, không phải một danh sách đã lọc.

Nên ô tìm mang đúng giới hạn của ô sắp xếp đã sống chung từ 13.C, và ba chỗ nói ra điều đó:
nhãn (`Tìm trong trang`), câu cảnh báo phạm vi (`describeSearchScope`), và một nhánh trạng thái
rỗng RIÊNG.

Nhánh rỗng riêng là phần đáng chú ý nhất. Trước lượt này, "lưới rỗng" chỉ có một nghĩa: server trả
0 mục. Từ khi có ô tìm nó có hai nghĩa, và `loaded` (số mục server trả về TRƯỚC khi ô tìm lọc) là
thứ duy nhất phân biệt được. Không có nó thì một người ở trang 2 gõ một từ khoá không khớp sẽ nhận
câu "Trang 2 không còn lab nào", tức một lời nói về KHO phát ra khi thứ không khớp là từ khoá của
chính họ. Thứ tự kiểm trong `describeCatalogEmpty` vì vậy là một phần hợp đồng, và có test.

### 4.2 Tab ánh xạ theo `fields[0]`, không theo một bảng viết tay cho từng trang

| Trang | `fields` | Tab | Chip |
|---|---|---|---|
| `/lessons`, `/labs` | `['difficulty','tier']` | độ khó | hạng sandbox |
| `/playgrounds` | `['tier']` | hạng sandbox | không có |
| `/paths`, `/quiz` | `[]` | không có | không có |

`SearchTabs` xử lý `tabs: []` sẵn (`hasTabs = tabs.length > 0` trong `dist/index.js` của gói), nên
hai trang cuối vẫn có ô tìm mà không mọc ra một hàng tab giả.

`/problems` cũng chạy `tabs: []`, và đó là quyết định chứ không phải chỗ chưa làm: bốn chiều lọc ở
đó đều là NHIỀU lựa chọn, luật gộp còn khác nhau (chủ đề HOẶC, tag VÀ). Một hàng tab là điều khiển
MỘT lựa chọn; ánh xạ nó vào bất kỳ chiều nào sẽ hoặc âm thầm bỏ các lựa chọn khác khi bấm tab,
hoặc hiện một tab "đang chọn" trong khi có ba giá trị đang bật.

### 4.3 Bốn bộ chọn biên tập Ở LẠI `apps/web`, trái chữ của hợp đồng §1.6

Hợp đồng nói `describeCatalogEmpty` / `describePageScope` / `describeSortScope` /
`describeResultCount` "đi cùng sang `packages/copy`". Chúng không sang được: `package.json` của
gói đó khai đúng bốn lối vào (`.`, `./types`, `./registry`, `./scan`), không lối nào chở được một
hàm khai trong `surfaces/`, và cả `package.json` lẫn `t.ts` là file §6.1 khoá cho L0.

Thứ §1.6 thật sự mua là "mọi nhánh là một mục tĩnh trong bản đồ", và điều đó đạt đủ khi bản đồ ở
bên kia còn nhánh ở bên này: bộ dò đọc bản đồ, không đọc bộ chọn. Kiểu trả về đã đổi thành
`CopyRef` (`{ key, params }`) đúng như §1.6 đòi. Đã báo lead lúc phát hiện.

**Cái giá, nói thẳng:** `CopyRef` bỏ phần kiểm THAM SỐ ở tầng biên dịch (khoá thì vẫn kiểm, vì
`TextKey` là union khoá có thật). Bù bằng test: mỗi nhánh của mỗi bộ chọn có một ca dựng ra câu và
so với chữ thật, cộng một ca quét toàn bộ tổ hợp khẳng định không câu nào chứa `undefined`.

---

## 5. Chưa làm, và vì sao

| Việc | Lý do |
|---|---|
| Chuỗi của `problems-table.tsx` (9 tiêu đề cột + caption) | Hết ngân sách lượt. Không chặn gì; cổng màu trần và cổng chữ đều không quét vùng này. |
| `problem-labels.ts` (4 bảng nhãn + 3 hàm định dạng) | Như trên. `PROBLEM_TOPIC_LABELS` / `PROBLEM_DIFFICULTY_LABELS` thì CỐ Ý ở lại `packages/games` (§5.1 cấm trích chữ khỏi package đó, và §8 của phase-16 đặt nó ngoài phạm vi). |
| `app/(session)/problems/[code]/**` (4 file) | Hết ngân sách lượt. |
| Chuỗi của `app/quiz/[id]/quiz-client.tsx` | **Cố ý dừng**, không phải sót: 378 dòng, một form nhiều trạng thái. Một lượt chuyển nửa vời để lại hai nguồn chữ trong cùng một file, đắt hơn là để nguyên. Phần HÌNH đã theo token (`f845168`). |
| Ô AC cần trình duyệt thật (tab đổi bộ lọc, ô tìm gõ được, khe hở motif) | Thuộc 16.I theo §3 của phase-16, không thuộc lane này. |

---

## 6. Hai điều tôi KHÔNG tìm thấy, kèm phạm vi đã tìm

**Icon `ResourceKind` từ arena:** yêu cầu là "lấy từ `packages/ui`, không import từ
`components/k8s-arena`". Grep trên toàn bộ đường sở hữu của lane (`components/catalog/**`,
`app/{lessons,labs,paths,playgrounds,quiz,games}/**`, `app/(session)/problems/**`) ra **0** import
icon tài nguyên nào. Lần chạm arena duy nhất là `app/games/k8s/page.tsx` import `ArenaEntry`, tức
chính trò chơi chứ không phải một icon. Vậy đây là một ràng buộc PHÒNG NGỪA đã được tôn trọng, chứ
không phải một lượt sửa đã làm. Nếu ai đó chờ thấy một diff ở đây thì không có, và lý do là không
có gì để sửa.

**Test bị xoá:** **0**. Không file test nào bị xoá trong lane này. Ba file test đổi để theo kiểu
trả về mới, và mọi khẳng định chuyển nguyên vẹn:

| File | Đổi gì | Ô mất đi |
|---|---|---|
| `catalog-labels.test.ts` | mọi khẳng định về chữ đi qua `renderCopy`; thêm 6 ca cho ô tìm | 0 (thêm ròng) |
| `catalog-error-kind.test.ts` | `hint` là `CopyRef` nên thêm một helper `say()` | 0 |
| `games-catalog.test.ts` | 2 ô bọc `renderCopy` | 0 |

Thêm mới: `catalog-search.test.ts`, **19 ô**.

---

## 7. Một bẫy của môi trường, đo được, đáng ghi

Tầng công cụ ghi file trong phiên này **giải mã escape JSON trong nội dung file**. Viết
`\u0300-\u036f` vào một lớp ký tự regex thì thứ hạ cánh trên đĩa là hai KÝ TỰ DẤU KẾT HỢP thật
(bytes `CC 80` và `CD AF`), không phải chuỗi escape. Nó chạy đúng, nên không cổng nào đỏ; nhưng
một dấu kết hợp trong mã nguồn bám vào ký tự đứng trước nó và không nhìn thấy được, tức editor
hiện ra thứ khác với thứ đang chạy.

`\s`, `\d` thì qua được (không phải escape JSON hợp lệ). `\u`, `\n`, `\t`, `\\` thì không.

Cách vòng đã dùng: dựng dấu gạch chéo ngược bằng `String.fromCharCode(92)` trong một script node
rồi ghi đè. Kiểm bằng `cat -A` hoặc đếm ký tự trong khoảng `U+0300..U+036F`, không kiểm bằng mắt.

---

## 8. File đã chạm

**`packages/copy`** — `src/surfaces/catalog.ts` (rỗng → **149 khoá**, đo bằng `Object.keys(SURFACES.catalog).length`; bản đồ toàn hệ lên 188).

**`apps/web/src/components/catalog/`** — `catalog-search.ts` (mới), `catalog-search.test.ts`
(mới), `catalog-labels.ts`, `catalog-labels.test.ts`, `catalog-toolbar.tsx`, `catalog-page.tsx`,
`catalog-empty.tsx`, `catalog-error.tsx`, `catalog-error-kind.ts`, `catalog-error-kind.test.ts`,
`catalog-grid.tsx`, `catalog-pager.tsx`, `use-catalog-controls.ts`.

**`apps/web/src/app/`** — `lessons/lessons-client.tsx`, `labs/labs-client.tsx`,
`paths/paths-client.tsx`, `paths/[id]/path-client.tsx`, `paths/[id]/path-view.ts`,
`playgrounds/playgrounds-client.tsx`, `quiz/quiz-client.tsx`, `quiz/[id]/quiz-client.tsx`,
`games/games-catalog.ts`, `games/games-catalog.test.ts`, `games/games-toolbar.tsx`,
`games/games-client.tsx`, `(session)/problems/problems-toolbar.tsx`,
`(session)/problems/problems-client.tsx`, `(session)/problems/problem-filter-groups.tsx`.

Không chạm: `packages/ui/**`, `packages/motion/**`, `globals.css`, `layout.tsx`, `registry.ts`,
`common.ts`, `error.ts`, `components/shell/**`, `components/session/**`, `components/k8s-arena/**`,
`packages/games/**`, `e2e/**`, và mọi `layout.tsx` của năm cây danh mục.
