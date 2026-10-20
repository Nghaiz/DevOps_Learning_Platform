# Hệ thiết kế `ds`

<!-- updated 261020 -->

Hệ thiết kế của bản dựng lại giao diện 2026-10. Mã nằm ở `packages/ds`: token và base ở
`src/styles/theme.css`, component ở `src/*.tsx`, bộ biểu tượng ở `src/icons`, minh hoạ ở `src/art`.
`apps/web/src/app/globals.css` nạp theme này ngay sau Tailwind.

Mọi trang dùng hệ này, trừ những vùng chủ dự án yêu cầu giữ nguyên giao diện cũ: landing, canvas
game K8s, màn chơi Git và CI/CD. Giao diện cũ có tài liệu riêng ở
[design-system-legacy.md](design-system-legacy.md); mục 9 nói hai hệ sống cạnh nhau ra sao.

## 1. Lệnh cấm của chủ dự án

| Không dùng | Thay bằng | Ai gác |
|---|---|---|
| Sidebar bên trái để điều hướng | Thanh trên cùng sáu mục, thanh mục con ngay dưới | người rà |
| Thẻ bo góc xếp lưới | Dòng (`RowList`), bảng, mục có đường kẻ 1px | người rà |
| Hàng ô số liệu ở trang tổng quan | Số nằm trong câu, trong bảng, hoặc trên `ProgressLine` | người rà |
| Viền trái làm dấu "đang chọn" | Nền `acc-wash`, chữ đậm, gạch dưới (`TabsList look="line"`) | `design:check` |
| Loader donut, vòng quay | Vạch quét (`LoadingLine`, `loading` của `Button`), khung chờ đúng hình dòng | `design:check` |
| Bộ icon đại trà (lucide, heroicons…) | Bộ glyph riêng của ds (`<Icon name>`) | `design:check` |
| Dùng lại kit, lớp, biến của giao diện cũ | Component và token của ds | `design:check` |
| Chủ đề tàu, bảng tuyến, nhà ga (ngoài landing) | Màu theo mục và theo chủ đề | người rà |
| Bộ giao diện của ui-ux-pro-max | Không có thay thế: hệ này tự dựng | người rà |

Bốn dòng có hình dạng xác định trong mã nguồn nên máy gác được (`pnpm design:check`, mục 10).
Những dòng còn lại là phán đoán bố cục: rà bằng ảnh chụp ở 390px và 1440px, cả hai theme.

## 2. Khung trang

- **Thanh trên cùng** (`components/shell/site-header.tsx`): logo, sáu mục cha (Học, Thực hành,
  Luyện đề, Trò chơi, Soạn bài, Quản trị; hai mục cuối hiện theo vai trò), ô tìm trang `Ctrl K`,
  nút đổi theme, tài khoản. Mỗi mục mang `data-section` nên tự có màu nhấn của nó.
- **Thanh mục con** (`section-bar.tsx`): các trang con của mục đang mở. Mục cha trỏ tới trang tổng
  quan của mục (`/learn`, `/practice`…), không trỏ thẳng vào trang con đầu tiên.
- **Di động**: thanh trên thu thành nút mở menu toàn màn (`mobile-menu.tsx`); không có ngăn kéo
  bên trái.
- **Khu thực hành** (bài học, lab, playground, bài thi) là trang toàn màn, không có vỏ ứng dụng:
  thanh 52px, dải thông báo, rồi hai khoang kéo được (`PaneGroup`). Khoang đọc theo theme; khoang
  máy (terminal, IDE) tối ở cả hai theme.
- Mỗi trang có đúng một `h1` (do `PageHeader` dựng) và đúng một `<main>` (ở `app-shell.tsx`).

## 3. Màu

Khối biến giữa hai dấu mốc `@palette` trong theme.css do `packages/ds/scripts/palette.mjs --write`
sinh ra từ bảng OKLCH trong script. Đừng sửa tay khối đó: sửa bảng rồi chạy lại.
`src/styles/palette.test.ts` đỏ khi khối lệch khỏi bảng, hoặc khi một cặp màu trượt ngưỡng.

**Trung tính.** `canvas` (nền trang), `paper` (mặt khối), `well` và `well-2` (vùng lõm, khung chờ),
`ink` / `ink-2` / `ink-3` (chữ chính, chữ phụ, chữ chú thích), `rule` / `rule-2` (đường kẻ),
`control` (viền ô nhập), `focus` (vòng focus), `overlay` (nền dưới hộp thoại), `on-solid` (chữ
trên nền đặc). Lớp Tailwind cùng tên: `bg-paper`, `text-ink-2`, `border-rule`.

**Màu mục.** Vỏ ứng dụng gắn `data-section` (`learn`, `practice`, `judge`, `games`, `studio`,
`admin`) lên khung trang; mọi thứ bên trong đọc `--acc-*`. Mỗi màu có sáu bậc: `wash` và `tint`
(nền khối), `soft`, `mid` (đồ hoạ), `solid` (nền đặc dưới chữ `on-solid`), `ink` (chữ màu).
Lớp: `bg-acc-wash`, `text-acc-ink`, `bg-acc-solid`.

**Màu chủ đề.** `data-topic` (`kubernetes`, `docker`, `git`, `cicd`, `linux`, `bash`, `networking`,
`security`, `iac`, `observability`, `general`) cho `--tp-*` với cùng sáu bậc. Đừng tự đoán chủ
đề từ chuỗi: `topicLook({ gameId | id | tags })` ở `apps/web/src/lib/topic-look.ts` trả về chủ đề
và biểu tượng.

**Trạng thái.** `ok`, `warn`, `bad`, `info`, mỗi cái có `wash`, `tint`, `mid`, `solid`, `ink`.
Trạng thái không bao giờ chỉ nói bằng màu: luôn kèm chữ hoặc biểu tượng (`Pill` có `icon`).

**Ngưỡng tương phản** (bảng đo của `palette.mjs`, cả hai theme):

| Cặp | Ngưỡng |
|---|---|
| `ink`, `ink-2`, `ink-3` trên `canvas`, `paper`, `well`, `well-2` | 4.5:1 |
| bậc `ink` của mọi mục, chủ đề, trạng thái trên `canvas`, `wash`, `tint` | 4.5:1 |
| chữ `on-solid` trên bậc `solid` | 4.5:1 |
| `control` trên `paper` và `canvas`; `focus` trên `paper` và `canvas` | 3:1 |
| bậc `mid` trên `canvas` (đồ hoạ) | 1.8:1 |

`rule` và `rule-2` CỐ Ý dưới 3:1: chúng là đường kẻ trang trí, nên không được là thứ duy nhất
phân biệt hai trạng thái. Ô nhập dùng `control`. axe chỉ đo tương phản của CHỮ; viền, biểu tượng
và đồ hoạ không qua axe, và bảng trên là phép đo duy nhất cho chúng (`e2e/a11y.spec.ts` ghi rõ giới
hạn này).

Màu cứng (`#hex`, thang màu Tailwind như `bg-blue-500`) bị chặn trong JSX bởi `pnpm tokens:check`.

## 4. Chữ

Ba họ chữ, tự host qua `next/font` trong `app/layout.tsx`, cả ba có subset `vietnamese`:

| Biến | Họ chữ | Dùng cho |
|---|---|---|
| `font-display` | Bricolage Grotesque (trục `opsz`) | tiêu đề, số nổi bật |
| `font-sans` | Hanken Grotesk | chữ giao diện và chữ đọc |
| `font-mono` | Intel One Mono | lệnh, mã, tên tài nguyên |

Thang chữ (`@theme` trong theme.css): `2xs` 11px, `xs` 12, `sm` 14, `base` 15, `md` 16, `lg` 18,
`xl` 22, `2xl` 28, `3xl` 36, `4xl` 48. Cỡ chữ cố định theo rem, không co theo viewport. Giãn dòng
đi kèm từng cỡ; dấu tiếng Việt chồng tầng nên tiêu đề không xuống dưới 1.08.

`packages/ui/src/theme/type-scale.contract.test.ts` gác subset `vietnamese` của MỌI font nạp ở
layout.tsx và legacy-fonts.ts: thêm một font mà quên subset là đỏ.

## 5. Hình và chuyển động

- **Bo góc**: `xs` 3px, `sm` 5px (ô nhập, nút), `md` 8px, `lg` 12px (khối thông báo, popover),
  `xl` 16px (hộp thoại). Không có thẻ bo góc xếp lưới; khối nội dung phân cách bằng đường kẻ.
- **Bóng** chỉ cho thứ nổi: `shadow-pop` (menu, popover, hộp thoại, toast), `shadow-lift`. Khối
  nằm trong trang không có bóng.
- **Chuyển động** phục vụ thao tác: `animate-enter` (260ms, khối vào trang, xếp lượt bằng `--i`),
  `animate-fade`, `animate-pop-in` / `pop-out` (popover), `animate-sheet-in` / `sheet-out`,
  `animate-sweep` (vạch đang tải), `animate-breathe`, `animate-draw`, `animate-stamp`. Easing:
  `ease-out` = `cubic-bezier(0.23, 1, 0.32, 1)`.
- **Đang tải** là vạch quét hoặc khung chờ đúng hình dòng thật (`RowsSkeleton`, `Skeleton`). Không
  có vòng quay ở bất kỳ đâu.
- `prefers-reduced-motion: reduce` được khai MỘT LẦN trong theme.css: mọi transition và animation
  về 0.01ms (không phải 0s, để `transitionend` vẫn bắn).

## 6. Biểu tượng và minh hoạ

Bộ glyph riêng ở `src/icons/glyphs.ts`: nét 1.75 trên lưới 24, hai lớp (nét + lớp tô 18% màu nét,
lớp `.ds-ic-t`). Dùng `<Icon name="terminal" size={18} />`; thêm `label` khi biểu tượng mang nghĩa
một mình, bỏ trống khi đã có chữ đi kèm (khi đó nó `aria-hidden`). Cần biểu tượng mới thì thêm
path vào `glyphs.ts`, không kéo thư viện ngoài vào.

Minh hoạ vẽ bằng SVG nét, tô theo token nên tự đổi theo theme:

- `SectionArt kind` cho đầu trang tổng quan của từng mục (`learn`, `practice`, `judge`, `games`,
  `studio`, `admin`, `me`).
- `GameArt kind` cho từng game (`k8s`, `git`, `cicd`, `netpol`, `dockerfile`).
- `EmptyArt kind` cho khối rỗng và khối lỗi (`nothing`, `search`, `offline`, `done`, `locked`,
  `lost`, `waiting`).

## 7. Component

| Nhóm | Component |
|---|---|
| Nút | `Button` (`primary`, `ink`, `secondary` mặc định, `ghost`, `danger`, `link`; `icon`, `iconRight`, `loading`, `asChild`), `IconButton` (bắt buộc `label`) |
| Ô nhập | `Field` (nhãn, gợi ý, lỗi nối bằng `aria-describedby`), `Input`, `Textarea` (`mono`), `NativeSelect`, `Select`, `Checkbox`, `Switch`, `RadioGroup` / `Radio` / `RadioItem`, `Label` |
| Chọn chế độ | `Tabs` + `TabsList look="line" \| "segment"`, `Segmented`, `Chip` (`pressed`, `count`) |
| Phản hồi | `Pill` (tone, `dot`, `live`), `Notice`, `toast` (sonner), `ConfirmDialog` (bắt buộc `cancelLabel`; `loss`, `blockedReason`) |
| Trạng thái danh sách | `RowsSkeleton`, `Skeleton`, `Empty`, `ErrorBlock` (`onRetry`, `actions`), `Pager` |
| Tiến độ | `ProgressLine` (0..1, `role="meter"` hoặc `progressbar`), `LoadingLine`, `Segments`, `LevelBars`, `StepStrip` |
| Bố cục | `Page`, `PageHeader`, `BackLink`, `Section`, `SummaryList`, `RowList` / `Row`, `TopicGlyph`, `Table` (đặt `label` để trình đọc màn hình gọi tên bảng) |
| Lớp nổi | `Dialog`, `Sheet` (`SheetContent` bắt buộc `title`), `Popover`, `Menu`, `Tip`, `CommandPalette` |
| Khoang | `PaneGroup`, `Pane`, `PaneHandle` (khu thực hành) |
| Nội dung bài | `Markdown`, `ContentView` (subpath `@devops-platform/ds/content`, cần `labels`) |

Mọi danh sách có đủ bốn trạng thái: đang tải (`RowsSkeleton` đúng hình dòng), rỗng (`Empty`), lỗi
(`ErrorBlock` có nút thử lại), và một trang (`Pager` dùng ngăn xếp con trỏ ở
`apps/web/src/lib/cursor-stack.ts`).

`NativeSelect` thay `Select` khi một lựa chọn là giá trị rỗng (Radix không nhận), hoặc khi danh
sách ngắn và nên cư xử như ô chọn của trình duyệt.

## 8. Chữ trong giao diện

Mọi chuỗi đi qua `packages/copy` (`t('khoá')`); không viết chuỗi tiếng Việt thẳng trong JSX. Giọng
văn: câu ngắn, nói việc cụ thể, xưng "bạn", giữ thuật ngữ tiếng Anh khi người trong nghề vẫn nói
vậy (pod, commit, pipeline). Thông báo lỗi nói chuyện gì xảy ra và làm gì tiếp, không xin lỗi
chung chung.

Bộ test của `packages/copy` gác: không gạch ngang dài (U+2014, U+2013), không chữ bị lột dấu, mọi
nhóm đúng ba khoá anh em phải khai lý do (`intentionalThree`), không chuỗi có dấu lọt ra ngoài bản
đồ, không khoá chết, giá trị chuẩn NFC, và danh sách cụm bị chặn.

## 9. Hai hệ sống cạnh nhau

Giao diện cũ chỉ còn trong các vùng giữ nguyên, bọc bởi `LegacySkin`
(`apps/web/src/components/games/legacy-skin.tsx`) hoặc `.arena-root`. Token cũ khai trong khối có
phạm vi `.legacy-skin, .arena-root` ở `apps/web/src/app/legacy.css`, không ở `:root`, nên trang mới
không đọc được chúng. Font cũ (Archivo, Be Vietnam Pro, JetBrains Mono) chỉ nạp ở các route đó
(`app/legacy-fonts.ts`).

`.legacy-skin` khai đè vài tên mà tiện ích Tailwind của ds cũng đọc: font, thang chữ, giãn dòng,
bo góc, `--spacing`, `--ease-out`, `--ink`. Một khối giao diện MỚI nằm bên trong màn chơi cũ (bảng
bên của sandbox Git, nơi có Level Builder: `components/games/git/sandbox-panel.tsx`) đặt lớp
`ds-island` để lấy lại giá trị của ds. Bảng màu đứng chung bộ chọn với `:root` / `.dark`; các tên
theme đọc lại bằng `--theme(… inline)`. Luật gốc của màn chơi (`.git-odyssey`, legacy.css) dừng ở
biên đảo bằng `:not(.ds-island *)`.

Vùng cuộn đặt `relative`: một nhãn `sr-only` bên trong vùng cuộn mà không có tổ tiên định vị sẽ
thoát ra và kéo trang dài thêm (đã gặp: tài liệu cao 6977px cho nội dung 1051px).

## 10. Cổng

| Lệnh | Gác |
|---|---|
| `pnpm design:check` | Kit cũ (`@devops-platform/ui`), bộ icon đại trà, loader quay vòng, viền trái dày, lớp và biến của legacy.css ngoài vùng giữ nguyên; `.ds-island` phủ đủ tên bị khai đè. Tên lớp cũ đọc từ chính legacy.css. Danh sách vùng giữ nguyên (`LEGACY_ZONES`) đỏ cả khi một dòng không còn che vi phạm nào. |
| `pnpm tokens:check` | Màu cứng trong JSX |
| `pnpm bundle:check` (sau build) | xterm chỉ vào route có terminal; trần byte của nền chung |
| `packages/ds` `palette.test.ts` | Khối @palette khớp bảng sinh; mọi cặp tương phản đạt |
| `packages/copy` test | Các luật chữ ở mục 8 |
| `node scripts/check-no-commerce.mjs` | Không giá, gói cước, thanh toán ở bất kỳ đâu |
| `pnpm --filter @devops-platform/web e2e:ci` | axe trên các màn chốt, không tràn ngang ở 390px, game chạy được không cần backend |
