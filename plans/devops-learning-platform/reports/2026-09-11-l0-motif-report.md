# Lane 16.L0 — motif ellipse chạm bốn bề mặt của `packages/ui`

**Nhánh:** `feat/p16-l0-motif` · **nền:** `0cc6546` (đã gộp bảy lane) · **worktree:** `D:/NCKH/wt-p16-motif`
**Ngày:** 2026-09-11

## 1. Lỗ hổng, và nó đã đóng chưa

Design §3 gọi vòng ellipse hở là "xương sống của toàn bộ thiết kế". Trên `0cc6546`,
`packages/motion/src/motif.ts` đã dựng đủ máy móc với 110 ô test xanh, `packages/ui/package.json`
đã khai phụ thuộc `@devops-platform/motion` — và **không file nào trong `packages/ui/src/` import
nó**. Máy móc có, không ai gọi.

Đo lại sau lane (`grep -rn "@devops-platform/motion" packages/ui/src`): **8 file**, 4 file nguồn +
4 file test.

| Bề mặt | Design §3 nói | File | Xong? |
|---|---|---|---|
| Trạng thái rỗng | "vòng ellipse hở, bên trong không có gì" | `packages/ui/src/empty-state.tsx` | ✅ |
| Trạng thái đang tải | "chính vòng ellipse đang tự vẽ ra" | `packages/ui/src/spinner.tsx` | ✅ |
| Thanh tiến độ | "cung tròn theo nét quét, không phải thanh thẳng" | `packages/ui/src/lesson/progress-bar.tsx` | ✅ |
| Thẻ danh mục | "một cung màu ở góc thay cho viền trái phẳng" | `packages/ui/src/card.tsx` + `apps/web/.../catalog-grid.tsx` | ✅ |

Cả bốn đóng ở tầng mã. **Không bề mặt nào được xác nhận bằng mắt trên trình duyệt thật** — xem §5.

## 2. Cổng, đo thật

Lượt ép (`pnpm -w turbo run build lint typecheck test --force`):

```
Tasks:    32 successful, 32 total
Cached:    0 cached, 32 total
Time:     2m31.128s
```

`node scripts/check-design-tokens.mjs` → `exit=0` (đối chứng dương của chính script chạy trước
khi quét: bắt đủ 13 mẫu bẩn, không kêu trên 20 mẫu sạch; quét 562 file / 4 vùng).

TỔNG từng gói, lượt `turbo run test --force` riêng (`Tasks: 15 successful, 15 total` ·
`Cached: 0 cached`):

| Gói | File | Test | Nền (`0cc6546`) | Δ |
|---|---|---|---|---|
| web | 148 | **1747** | 1747 | 0 |
| ui | 34 | **872** | 858 | **+14** |
| games | 25 | **402** | 402 | 0 |
| scenario | 17 | **285** | 285 | 0 |
| terminal | 6 | **133** | 133 | 0 |
| motion | 4 | **110** | 110 | 0 |
| copy | 2 | **52** | 52 | 0 |
| shared-types | 3 | **48** | 48 | 0 |
| **tổng** | **239** | **3649** | 3635 | **+14** |

Zero đỏ, zero skip. `design-system.contract.test.tsx` (21 ô) và `exports.contract.test.ts` cùng
xanh sau khi §4d của tài liệu được sửa — xem §6.

### Đối chứng dương — các cổng mới ĐỎ ĐƯỢC

Bảy phép bẻ gãy có chủ đích, chạy rồi hoàn tác (`git diff --stat` sau khi hoàn tác: rỗng):

| Bẻ gãy | Ô đỏ |
|---|---|
| `<path d="M 10 10 L 90 90">` thay cung | `vẽ ĐÚNG ARC_PATH_D` · `chạy bằng @keyframes mà globals.css khai` · `nét co theo cỡ` |
| thêm `<circle>` vào giữa vòng rỗng | `vòng RỖNG RUỘT — không tô nền` |
| trả lại đĩa `rounded-full bg-muted` | `lớp bọc không còn đĩa nền` |
| gỡ `relative` khỏi `Card` | `thẻ mang relative để cung neo đúng vào nó` |
| gỡ `pointer-events-none` | `lớp bọc cung KHÔNG chặn con trỏ` |

**Đối chứng bắt được một cổng mù của chính nó.** Ô "KHÔNG còn `animate-spin`" bản đầu chỉ đọc
class của `<svg>` gốc, nên `animate-spin` dán lên `<path>` bên trong đi lọt — cổng xanh trong khi
hình đã quay trở lại. Đã chuyển sang đọc `outerHTML` của cả cụm (commit `b16c3de`).

**Hai ô CHƯA có đối chứng dương, ghi ra thay vì im:** `mang data-slot="spinner"` (phép bẻ gãy
trúng dòng chú thích trước, nên nó không đỏ trong lượt đo) và `cung KHÔNG mang khe hở đã khép`.
Cả hai là khẳng định thuộc tính đơn; ô `data-slot` được backstop gián tiếp bởi `button.test.tsx`
vốn dùng chính selector đó để tìm Spinner trong lớp bọc `aria-hidden`.

## 3. Commit

| SHA | Nội dung |
|---|---|
| `4fa9092` | `feat(ui):` bốn bề mặt đi qua motif; mọi ô test cũ được CHUYỂN khẳng định, không ô nào bị xoá |
| `b16c3de` | `test(ui):` cổng cho cung ở spinner + trạng thái rỗng, kèm đối chứng dương |
| `20c2476` | `docs(design-system):` §4d tả cung góc thay cho dải viền trái đã bị gỡ |

## 4. Ba ràng buộc cứng — trạng thái

### 4.1 `ProgressBar` giữ nguyên hợp đồng aria ✅

16.H từ chối thay `ProgressBar` bằng cung tự dựng, và lý do đó vẫn đúng. Lane này **không thay
control** — nó giữ y nguyên phần tử mang `role="progressbar"`, `aria-label`, `aria-valuenow`,
`aria-valuemin`, `aria-valuemax`, và chỉ đổi thứ vẽ BÊN TRONG từ một `<div>` co giãn `width` sang
hai `<path>` của motif.

Bốn ô cũ đọc trên hình cũ đã được **chuyển**, không xoá:

| Ô cũ (bản `width: %`) | Ô mới (bản cung) |
|---|---|
| `fill.style.width === '30%'` | `--p ≈ 0.3` trên `<path>` tiến độ |
| `fill.style.width === '0%'`, không `NaN` | `--p === '0'`, `style` không chứa `NaN` |
| `full.className` chứa `bg-status-done` | `getAttribute('class')` chứa `text-status-done` |
| đúng MỘT `[style]`, là `width: 50%` | đúng MỘT `[style]`, là `--p: 0.5` |

Hai bẫy phải ghi lại vì chúng làm ô đỏ vì lý do chẳng liên quan: (a) `SVGElement.className` là
`SVGAnimatedString` chứ không phải chuỗi, nên phải đọc `getAttribute('class')`; (b)
`stroke-dashoffset` là `calc(1 - var(--p))` — jsdom không có CSSOM nên nó KHÔNG tính ra số, `--p`
là nơi duy nhất con số thật sống ở tầng này.

Ngân sách CSP giữ nguyên: vẫn **đúng một** `[style]` inline trong cả cụm.

### 4.2 Cung chạy hay nhảy — DÙNG `calc()`, CHƯA ĐO ⚠

`arcProgressProps` phát ra đúng dạng hợp đồng §8.3: `stroke-dashoffset: calc(1 - var(--p))` kèm
`transition: stroke-dashoffset var(--motion-slow) var(--ease-out)`. **Không đổi sang đường lùi.**

Câu hỏi thật chưa ai trả lời: `--p` là custom property **chưa đăng ký** (`@property`), nên bản
thân nó nội suy kiểu `discrete`; nhưng `stroke-dashoffset` là thuộc tính CÓ transition được, và
điều cần đo là khi `--p` nhảy rời rạc thì `stroke-dashoffset` có nội suy giữa hai giá trị `calc()`
đã tính hay không. jsdom không trả lời được. Ghi vào §5 cho 16.I.

Đường lùi đã sẵn và không đụng hình học: `dashOffsetAt(p)` trả số thô, đặt thẳng vào
`strokeDashoffset`. ⛔ Không dùng trước khi đo.

Lượt vẽ ĐẦU không cần lo và không dùng `transition: false`: `--p` đã có sẵn trong HTML server
render, không có giá trị trước đó để nội suy từ. Dùng cờ đó sẽ đòi biết "đây có phải lượt render
đầu không" ⇒ `useState` ⇒ `'use client'` cho một component thuần trình bày.

### 4.3 Cổng reduced-motion — đã có sẵn ở CSS, KHÔNG thêm cổng JS ✅

Kiểm `apps/web/src/app/globals.css`:

- dòng 736: `@keyframes dlp-arc-sweep { from { stroke-dashoffset: 1 } to { stroke-dashoffset: 0 } }` — **có**, khớp `ARC_SPIN_ANIMATION_NAME`;
- dòng 745–754: `@media (prefers-reduced-motion: reduce)` trên bộ chọn phổ quát `*, *::before, *::after` với `animation-duration: 0.01ms !important` **và** `animation-iteration-count: 1 !important`.

`ARC_SPIN_ANIMATION` chạy `infinite`, nhưng `animation-iteration-count: 1 !important` hạ nó xuống
một lượt và `animation-duration: 0.01ms !important` làm lượt đó tức thì ⇒ một vòng tĩnh vẽ đầy.
Khai báo inline của `arcSpinnerProps` **không** mang `!important`, mà `!important` của tác giả
thắng mọi khai báo thường kể cả inline — nên cổng phủ được nó. Cùng lý lẽ áp cho `ARC_TRANSITION`
của thanh tiến độ (`transition-duration: 0.01ms !important` thắng shorthand inline).

Kết luận: **không cần** `useReducedMotion` / `reduced-motion.ts` ở tầng này, và thêm vào sẽ kéo cả
hai file sang `'use client'`. Đây là một phép đọc CSS theo luật xếp tầng, chưa phải một phép đo —
xem §5.

## 5. Danh sách chính xác 16.I phải đo bằng trình duyệt thật

| # | Đo cái gì | Cách đo | Đạt là gì |
|---|---|---|---|
| 1 | **Cung tiến độ CHẠY hay NHẢY** | Mở `/lessons/:id`, bấm sang bước kế. Ghi hình 60fps hoặc `getComputedStyle(path).strokeDashoffset` lấy mẫu mỗi 16ms trong 400ms. | Giá trị đi qua các bước trung gian trong ~`--motion-slow` (320ms). Chỉ có hai mẫu (đầu/cuối) ⇒ NHẢY ⇒ chuyển sang `dashOffsetAt(p)` (§4.2). |
| 2 | **Khe hở đúng phía** ở CẢ BỐN bề mặt | Chụp `EmptyState`, `Spinner size="lg"`, `ProgressBar`, thẻ danh mục. Đối chiếu tâm khe hở với `(61.24, 22.18)` trong `viewBox` 100×100 — trên PHẢI. | Khe hở ở trên-phải ở cả bốn. Lệch ⇒ có ai đó phủ `rotate-*` hoặc `transform` lên phần tử cung. |
| 3 | **reduced-motion ép animation về 0.01ms** | DevTools → Rendering → *Emulate prefers-reduced-motion: reduce*. Đọc `getComputedStyle(spinnerPath).animationDuration` và `.animationIterationCount`. | `0.01ms` và `1`. Cung đứng yên ở dạng ĐẦY, không nhấp nháy. |
| 4 | **reduced-motion phủ cả cung tiến độ** | Cùng cờ, đổi bước, đọc `transitionDuration` của `<path>` tiến độ. | `0.01ms`. Cung nhảy tức thì tới vị trí mới, không chạy. |
| 5 | **Spinner ở cỡ `sm` còn đọc ra là vòng hở** | `/author/:id`, bấm "Xuất bản" (`<Spinner size="sm">` trong nút, hộp 16px, nét 2px). | Nhìn ra vòng ellipse có khe hở, không phải một cục đặc. Nét 2px trên 16px là chỗ mỏng nhất của thiết kế. |
| 6 | **Cung góc thẻ không cắt ngang chữ** | `/lessons` ở 1440px và 390px, thẻ có `accent`. | Cung nằm trong lề `p-5`, không chồng lên `<h3>`. Tính toán cho ~23px phần lộ ra; đây là chỗ dễ sai nhất của lane vì nó là số học chưa được mắt xác nhận. |
| 7 | **Bấm được vào thẻ danh mục** | `/lessons`, bấm vào giữa thẻ và bấm sát góc trên-trái (nơi lớp bọc `inset-0` phủ). | Cả hai điều hướng. Không được ⇒ `pointer-events-none` mất tác dụng ở đâu đó. |
| 8 | **Cung góc hiện ở CẢ hai theme** | Bật/tắt dark mode trên `/lessons`. | Cung `--difficulty-*` phân biệt được với `--card` ở cả hai. Nét 2px mỏng hơn dải 4px cũ nên đây là hồi quy tương phản có thật cần mắt xác nhận. |
| 9 | **Khung chờ và thẻ thật cùng hình** | `/lessons` với mạng bị bóp, chụp lúc chờ và lúc xong. | Cung ở cùng chỗ, cùng cỡ; chỉ đổi màu `--muted` → `--difficulty-*`. Bố cục không nhảy. |
| 10 | **Trạng thái rỗng đọc ra là "trống", không phải "lỗi"** | `/lessons` với bộ lọc không khớp gì. | Vòng hở ruột rỗng ở `--muted-foreground`. Đây là chỗ đổi ngữ nghĩa lớn nhất (bỏ icon khay `Inbox`) và không có phép đo tự động nào nói được nó còn dễ hiểu hay không. |

## 6. Quyết định đáng tranh luận

1. **Đĩa `bg-muted` của `EmptyState` bị GỠ, và điều đó áp cho cả icon do nơi gọi truyền.**
   "Bên trong không có gì" không sống chung được với một mảng đặc bên trong vòng. Đo trên
   `0cc6546`: 18 chỗ dùng `EmptyState`, **không chỗ nào truyền `icon`** — nên không có hồi quy
   thị giác hôm nay. Nhưng nó là thay đổi THẬT với nơi gọi tương lai.

2. **`Spinner` KHÔNG có rãnh sau lưng cung.** `ide-pane.tsx` đặt rãnh + cung; `Spinner` chỉ có
   cung. Rãnh dùng `var(--border)`/`var(--input)`, hai token định nghĩa trên nền BỀ MẶT, còn
   `Spinner` hay nằm giữa một nút `bg-primary`/`bg-destructive` nơi cả hai đọc ra sai. Cái giá:
   trước khi cung vẽ tới, chỗ đó trống — ở `--motion-slow` (320ms) mỗi chiều thì hiếm khi thấy,
   nhưng nó là một khác biệt so với `ide-pane`.

3. **Nét `Spinner` đổi theo cỡ (`sm`/`md` = 2px, `lg` = 4px).** `non-scaling-stroke` đo bằng
   pixel màn hình, nên một hằng số duy nhất 4px trên hộp 16px bịt kín khe hở 60°. Bỏ
   `non-scaling-stroke` không cứu được: tỉ lệ trục 1.4 khi đó làm nét dày mỏng khác nhau dọc cung.
   Đây là điểm §8.2 không nói tới (nó gán bậc nét theo VAI TRÒ, không theo CỠ HỘP).

4. **Cung góc thẻ dùng `ARC_STROKE_HAIRLINE` (2px), mỏng hơn dải `border-l-4` cũ.** §8.2 gán
   thẳng bậc này cho "cung nhỏ ở góc thẻ danh mục", nên lane theo hợp đồng. Nhưng đây là mất mát
   trọng lượng thị giác có thật cho chỉ dấu độ khó — ô đo 8 ở §5 tồn tại vì lý do đó. `Badge` độ
   khó có icon trong cùng thẻ vẫn là thứ mang nghĩa cho SC 1.4.1.

5. **Thêm `'pending'` vào `CardAccent` thay vì để `catalog-grid.tsx` tự dựng một cung xám.**
   Hình học của cung (cỡ hộp, độ lệch, bậc nét, lớp bọc cắt) do `card.tsx` sở hữu; một bản chép ở
   nơi gọi sẽ lệch vào lần sửa thứ hai, và lúc đó khung chờ với thẻ thật không còn cùng hình — mà
   bố cục nhảy khi dữ liệu về chính là thứ khung chờ sinh ra để chặn. Cái giá: union công khai
   rộng thêm một giá trị không phải độ khó.

6. **`ProgressBar` giờ cao ~48px thay vì ~28px.** Cung là hình hai chiều, không nén xuống một dải
   8px được. Nơi gọi hẹp nhất là `<div className="w-40">` ở đầu trang bài học
   (`lesson-client.tsx`) — bố cục `flex items-center` nên nó nới chiều cao thanh đầu trang lên
   ~20px. Ô đo 6 ở §5 chạm vào việc này.

7. **Đã sửa `docs/design-system.md` §4d dù `docs/` ngoài glob sở hữu.** §4d còn ghi `border-l-4`
   và ba giá trị `accent` sau khi lane đổi hình — một chỗ lệch do CHÍNH lane này tạo ra, và
   `design-system.contract.test.tsx` chỉ gác §4a + §4c nên nó không đỏ ở đâu cả. Phạm vi sửa giới
   hạn đúng đoạn nói về `accent`.

## 7. File đã chạm

```
packages/ui/src/empty-state.tsx            ← vòng hở, ruột rỗng
packages/ui/src/empty-state.test.tsx       ← +4 ô (hình, rỗng ruột, không đĩa, không khép)
packages/ui/src/spinner.tsx                ← cung tự vẽ, nét theo cỡ, data-slot
packages/ui/src/spinner.test.tsx           ← +5 ô (hình, keyframes, nét, không animate-spin, data-slot)
packages/ui/src/lesson/progress-bar.tsx    ← cung quét; aria giữ NGUYÊN
packages/ui/src/lesson/step-nav.test.tsx   ← chuyển 4 ô ProgressBar + 2 ô mới (ARC_PATH_D, pathLength)
packages/ui/src/card.tsx                   ← cung góc + 'pending' + relative + children tường minh
packages/ui/src/card.test.tsx              ← chuyển 4 ô accent + 3 ô mới (pointer-events, relative, children)
packages/ui/src/button.tsx                 ← chú thích: selector animate-spin → data-slot="spinner"
packages/ui/src/button.test.tsx            ← cùng selector, 1 dòng
apps/web/src/components/catalog/catalog-grid.tsx  ← skeleton: border-l-4 → accent="pending"
docs/design-system.md                      ← §4d (xem §6.7)
```

## 8. File CỐ Ý không chạm

| File | Vì sao |
|---|---|
| `packages/motion/**` | Đã xong, 110 ô test xanh. Lane này TIÊU THỤ nó. Ba lần thấy chỗ có thể tiện tay sửa (nét theo cỡ ở `arcSpinnerProps`, một `arcMarkProps` cho cung `currentColor`, `@property --p`) đều để lại — xem §9. |
| `apps/web/src/app/globals.css` | Đã có sẵn `@keyframes` và cổng reduced-motion; không cần thêm gì (§4.3). |
| `apps/web/src/components/session/ide-pane.tsx` | Đã tiêu thụ `arcSpinnerProps` từ trước, ngoài glob. |
| `apps/web/src/components/{shell,session,admin,author,me,marketing,k8s-arena}/**` | Ngoài glob. `app-shell.tsx`/`me-section.tsx`/`admin-section.tsx` đã có cung riêng. |
| `apps/web/src/app/**` | Ngoài glob. |
| `packages/copy/**`, `e2e/**`, `packages/games/**` | Ngoài glob. |
| `packages/ui/src/skeleton.tsx`, `error-state.tsx` | Design §3 không liệt kê chúng trong sáu chỗ; thêm cung vào là mở rộng phạm vi lane. |

## 9. Nợ ghi ra, KHÔNG tự trả

1. **`packages/motion` chưa có khái niệm "cung `currentColor` không phải rãnh".** Ba nơi hiện tự
   viết tay sáu thuộc tính giống hệt nhau: `app-shell.tsx` (`BrandMark`), `empty-state.tsx`
   (`EmptyArc`), `card.tsx` (`CardAccentArc`). `arcTrackProps` không dùng được vì nó ghim
   `stroke: var(--border)|var(--input)`. Một `arcMarkProps({ width })` trả `stroke: 'currentColor'`
   sẽ gộp cả ba. Thuộc `packages/motion` ⇒ ngoài glob lane.
2. **`SIZE_STROKE` của `Spinner` là kiến thức về `non-scaling-stroke` sống ở tầng tiêu thụ.**
   §8.2 gán bậc nét theo vai trò, không theo cỡ hộp. Nếu bề mặt thứ hai cần cung nhỏ, nó sẽ tự
   phát hiện lại cùng điều đó.
3. **`@property --p` chưa đăng ký.** Nếu ô đo 1 (§5) ra "NHẢY", đăng ký `--p` là
   `<number>` (`@property` trong `globals.css`) là lựa chọn thứ ba, bên cạnh `dashOffsetAt`. Cả
   hai file đều ngoài glob lane.
4. **`ProgressBar` vẫn hardcode chuỗi `'Tiến độ bài học'`** thay vì đi qua `packages/copy` — nợ có
   từ trước lane, không phát sinh ở đây.
