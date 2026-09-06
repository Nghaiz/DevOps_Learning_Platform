# Hệ thiết kế — SSOT (13.A)

**Nguồn:** `apps/web/src/app/globals.css` (token + dark mode) · `packages/ui/src/theme/theme-provider.tsx`
(cơ chế theme) · `packages/ui/src/**` (component). Hợp đồng C1/C2 gốc:
[`plans/devops-learning-platform/phase-13-exec.md`](../plans/devops-learning-platform/phase-13-exec.md) §2.

## 0. Nguyên tắc

**Một nguồn màu duy nhất.** JSX KHÔNG BAO GIỜ dùng `#hex` hay `slate-*`/`gray-*`/
`zinc-*`/`neutral-*` trần — chỉ class ngữ nghĩa (`bg-background`, `text-muted-foreground`,
…) map tới token bên dưới. Kiểm bằng:

```bash
grep -rnE '#[0-9a-fA-F]{3,8}|\b(slate|gray|zinc|neutral)-[0-9]{2,3}' apps/web/src packages/ui/src --include=*.tsx | grep -v node_modules
```

Phải **rỗng** trên toàn `apps/web/src` + `packages/ui/src` ở cuối Đợt 3 (mọi lane
đã xong). Tại **13.A** (Đợt 1), phạm vi kiểm chỉ là `packages/ui/src` +
`apps/web/src/app/layout.tsx` + `globals.css` — các route `apps/web/src/app/{lessons,
labs,paths,quiz,playgrounds,me,login,(session)}/**` do lane B/C/D1/D2/E ở Đợt 2
migrate, chưa migrate lúc 13.A merge là đúng kế hoạch, không phải lỗi.

`packages/terminal/src/**/themes.ts` là **ngoại lệ tường minh** (grep AC gốc ở
`phase-13-exec.md` §5 đã ghi rõ) — bảng màu ANSI của terminal là dữ liệu cấu hình
xterm.js, không phải class Tailwind, không đi qua hệ token này.

## 1. Token màu

Định nghĩa ở `apps/web/src/app/globals.css`, khối `:root` (sáng) và `.dark` (tối).
Tên biến CSS = tên trong hợp đồng C1, không đổi được mà không phá mọi lane tiêu thụ.

| Biến CSS | Class Tailwind | Vai trò | Sáng (oklch) | Tối (oklch) |
|---|---|---|---|---|
| `--background` | `bg-background` | Nền trang | `1 0 0` (trắng) | `0.145 0 0` (gần đen) |
| `--foreground` | `text-foreground` | Chữ chính | `0.145 0 0` | `0.985 0 0` |
| `--card` | `bg-card` | Nền thẻ/card | `1 0 0` | `0.205 0 0` |
| `--card-foreground` | `text-card-foreground` | Chữ trong card | `0.145 0 0` | `0.985 0 0` |
| `--popover` | `bg-popover` | Nền popover/dropdown/select | `1 0 0` | `0.205 0 0` |
| `--popover-foreground` | `text-popover-foreground` | Chữ trong popover | `0.145 0 0` | `0.985 0 0` |
| `--primary` | `bg-primary` / `text-primary` | Hành động chính, link, focus ring mặc định | `0.546 0.215 262.881` (xanh dương) | `0.685 0.169 262.881` (xanh dương sáng hơn) |
| `--primary-foreground` | `text-primary-foreground` | Chữ trên nền primary | `0.985 0 0` | `0.145 0 0` |
| `--secondary` | `bg-secondary` | Hành động phụ, nút Copy/Chạy trong code block | `0.97 0 0` | `0.269 0 0` |
| `--secondary-foreground` | `text-secondary-foreground` | Chữ trên nền secondary | `0.205 0 0` | `0.985 0 0` |
| `--muted` | `bg-muted` | Nền mờ (Skeleton, code block, hàng bảng hover) | `0.97 0 0` | `0.269 0 0` |
| `--muted-foreground` | `text-muted-foreground` | Chữ phụ/ghi chú | `0.446 0 0` | `0.708 0 0` |
| `--accent` | `bg-accent` | Hover/focus của item tương tác (menu, tab) | `0.951 0.023 262.881` | `0.269 0 0` |
| `--accent-foreground` | `text-accent-foreground` | Chữ trên nền accent | `0.205 0 0` | `0.985 0 0` |
| `--destructive` | `bg-destructive` | Hành động/trạng thái phá huỷ, lỗi | `0.577 0.245 27.325` (đỏ) | `0.704 0.191 22.216` |
| `--destructive-foreground` | `text-destructive-foreground` | Chữ trên nền destructive | `0.985 0 0` | `0.145 0 0` |
| `--success` | `bg-success` | Trạng thái thành công, badge "Đạt" | `0.518 0.146 150.741` (xanh lá) | `0.696 0.17 150.741` |
| `--success-foreground` | `text-success-foreground` | Chữ trên nền success | `0.985 0 0` | `0.145 0 0` |
| `--warning` | `bg-warning` | Cảnh báo (chạm hardCap, sức chứa thấp) | `0.541 0.15 55.98` (hổ phách) | `0.769 0.188 70.08` |
| `--warning-foreground` | `text-warning-foreground` | Chữ trên nền warning | `0.985 0 0` | `0.145 0 0` |
| `--border` | `border-border` | Viền mặc định | `0.922 0 0` | `1 0 0 / 12%` |
| `--input` | `border-input`, `bg-input` (Switch off) | Viền ô nhập, nền Switch tắt | `0.63 0 0` (**không** bằng `--border` — xem §1a) | `1 0 0 / 16%` |
| `--ring` | `ring-ring`, `focus-visible:ring-ring` | Vòng focus | `0.546 0.215 262.881` (= primary) | `0.685 0.169 262.881` (= primary tối) |
| `--radius` | `rounded-lg` (= `--radius-lg`) | Bo góc gốc | `0.625rem` | (không đổi theo theme) |

`--radius-sm`/`--radius-md`/`--radius-lg`/`--radius-xl` suy ra từ `--radius` trong
`@theme inline` (`calc(var(--radius) ± Npx)`) — KHÔNG khai lại số cứng ở component.

`--radius` **cố ý chỉ khai ở `:root`**, không lặp ở `.dark`: nó là số đo hình học,
không phải màu, và `.dark` nằm trên `<html>` nên `:root` vẫn khớp cùng phần tử —
giá trị luôn phân giải được ở cả hai theme. Lặp lại nó chỉ tạo thêm một chỗ để
quên đồng bộ. Đây là điểm lệch DUY NHẤT so với câu "`:root` và `.dark` đều định
nghĩa đủ" của hợp đồng C1, và nó được gác bằng một test tường minh
(`tokens.contract.test.ts` → "`--radius` khai ở :root (CỐ Ý không lặp ở .dark)").

### 1a. Contrast — số đo, không phải cảm nhận

Mọi con số dưới đây tính từ chính `globals.css` bằng `tokens.contract.test.ts`
(oklch → sRGB tuyến tính → độ chói tương đối WCAG 2.1), và được **gác lại** ở
đó: hạ một token xuống dưới ngưỡng làm suite `packages/ui` đỏ.

**Vì sao phải đo tay.** `axe-core` — cổng a11y của 13.H — chỉ có rule contrast
cho **chữ**. Nó không có rule nào cho viền hay ranh giới control, nên
SC 1.4.11 hoặc được đo ở đây, hoặc không ở đâu cả. Một cổng axe xanh **không**
chứng minh viền đủ tương phản.

| Cặp | Ngưỡng | Sáng | Tối |
|---|---|---|---|
| `--foreground` / `--background` | 4.5 (SC 1.4.3) | 19.79 | 18.96 |
| `--muted-foreground` / `--background` | 4.5 | 7.57 | 7.63 |
| `--muted-foreground` / `--muted` | 4.5 | 6.94 | 5.83 |
| `--primary-foreground` / `--primary` | 4.5 | 4.95 | 6.85 |
| `--destructive-foreground` / `--destructive` | 4.5 | 4.56 | 6.84 |
| `--success-foreground` / `--success` | 4.5 | 4.95 | 7.82 |
| `--warning-foreground` / `--warning` | 4.5 | 5.06 | 9.23 |
| `--input` / `--background` | 3.0 (SC 1.4.11) | **3.50** | 4.01 |
| `--ring` / `--background` | 3.0 | 5.17 | 6.85 |
| `--border` / `--background` | — (trang trí) | **1.26** | 3.26 |

**`--input` ≠ `--border`, khác với shadcn/ui gốc.** shadcn để hai token bằng
nhau ở `0.922`; giá trị đó cho **1.26:1** trên nền trắng. `--input` là ranh
giới **nhận dạng** của control — `border-input` là viền duy nhất của `Input`,
`Textarea`, `SelectTrigger`, `Checkbox`, `RadioGroupItem` và `Button
variant="outline"` (cả sáu đều `bg-background`, tức cùng màu nền trang), còn
`bg-input` là rãnh `Switch` lúc tắt. Ở 1.26:1 một ô nhập trên trang sáng gần
như **vô hình** cho tới khi được focus. Nâng lên `0.63` (#898989) cho 3.50:1,
dư ~0.5 so với ngưỡng để sai số chuyển oklch→sRGB giữa các trình duyệt không
kéo tụt xuống dưới. Nhánh tối giữ nguyên `1 0 0 / 16%` — đã 4.01:1, không cần
đụng.

**`--border` ở 1.26:1 là quyết định, không phải chỗ bỏ sót.** Nó chỉ vẽ ranh
giới **trang trí**: viền card, kẻ dòng bảng, viền đứt `EmptyState`, `Separator`
(mặc định `decorative`, tức `role="none"`). SC 1.4.11 loại trừ tường minh phần
trang trí thuần và phần không mang thông tin — nội dung trong card, không phải
đường kẻ quanh nó, mới là thứ người dùng cần đọc. Ranh giới nào **nhận dạng
một control** thì dùng `--input`, không dùng `--border`. Thêm một component
tương tác mà lấy `border-border` làm viền duy nhất ⇒ đổi sang `border-input`.

**`--success`/`--warning` KHÔNG có trong bảng chuẩn shadcn/ui** (bản gốc chỉ có
`destructive`) — thêm hai token này vì sản phẩm cần phân biệt "đạt/thành công"
(chấm lab, quiz), "cảnh báo" (sắp hết TTL, gần chạm hardCap), và "lỗi" (destructive)
là ba trạng thái ngữ nghĩa khác nhau mà chỉ một cặp primary/destructive không đủ
diễn đạt.

## 2. Cơ chế dark mode (D2)

1. **Nguồn class:** `.dark` trên `<html>` (không phải `<body>` — `packages/ui`
   không giả định `<body>` là gốc). Tailwind v4 khai `@custom-variant dark
   (&:where(.dark, .dark *))` trong `globals.css` (không có
   `tailwind.config.*` ở repo này — xem `phase-13-exec.md` §0).
2. **Trước paint:** `THEME_INIT_SCRIPT` (chuỗi JS thuần, `packages/ui/src/theme/
   theme-provider.tsx`) nhúng bằng `<script nonce={nonce}
   dangerouslySetInnerHTML>` trong `<head>` ở `apps/web/src/app/layout.tsx` —
   cùng nonce CSP đã gắn cho request (`x-nonce`, xem
   `apps/web/src/server/security/headers.ts`). Script đọc
   `localStorage['dlp.theme']` (`'light'|'dark'|'system'`), tính theme thực áp
   dụng, và `document.documentElement.classList.add/remove('dark')` — TRƯỚC KHI
   React hydrate, để không nháy màu (FOUC).
3. **Sau hydrate:** `<ThemeProvider>` (bọc `{children}` trong layout) tiếp quản —
   `useTheme()` trả `{ choice, resolved, setChoice }`. `resolved` theo dõi
   `prefers-color-scheme` real-time khi `choice === 'system'`.
4. **`<html suppressHydrationWarning>`** — bắt buộc, vì script ở bước 2 mutate
   `classList` của `<html>` trước khi React so khớp cây DOM server-rendered;
   không có cờ này React sẽ log cảnh báo hydration mismatch sai (đây là hành vi
   ĐÚNG, không phải lỗi cần sửa).
5. **Terminal:** theo `resolved === 'dark' ? 'dlp-dark' : 'dlp-light'` qua
   `useResolvedTerminalTheme()` (hợp đồng C5, lane D1 tiêu thụ) — trừ khi người
   dùng đã chọn theme terminal riêng ở hồ sơ (13.E).

## 3. Font (D3)

**Be Vietnam Pro** — `next/font/google`, subsets `['latin', 'vietnamese']`, weight
`400/500/600/700`, biến `--font-be-vietnam-pro`, áp trên `<html>` ở `layout.tsx`.
`--font-sans` trong `@theme inline` dùng biến này + fallback stack thật
(`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`) —
không chỉ mỗi biến, để trang vẫn đọc được nếu `next/font` fail lúc build (lỗi mạng).

**⛔ Không Poppins** — Poppins KHÔNG có subset `vietnamese`, thiếu glyph có dấu
nặng/ngã/ơ/ư (ví dụ "ợ", "ẫ", "ỡ" render bằng font fallback hệ thống, vỡ giữa từ).
Be Vietnam Pro phủ đủ toàn bộ bảng chữ tiếng Việt trong CÙNG MỘT font-family, không
cần font thứ hai chỉ cho dấu.

**Kiểm bằng mắt:** chuỗi `"Bài học Kỹ thuật hạ tầng — đã kiểm chứng đầy đủ dấu:
ợ, ẫ, ỡ, ư, ộ"` (đủ dấu nặng/ngã/ơ/ư như AC yêu cầu) phải hiện liền mạch, không đổi
font đột ngột ở bất kỳ ký tự nào.

`next/font/google` tự host (không gọi Google Fonts lúc runtime từ trình duyệt
người dùng) ⇒ CSP `font-src 'self'` không cần đổi.

## 4. Kho component (`packages/ui/src`)

**Nền tảng:** shadcn/ui trên [`radix-ui`](https://www.npmjs.com/package/radix-ui)
(gói hợp nhất, `import { X } from 'radix-ui'` → `X.Root`/`X.Trigger`/…) +
`class-variance-authority` (biến thể) + `lucide-react` (icon) + `cn()`
(`clsx` + `tailwind-merge`, có sẵn từ trước). KHÔNG dùng `tailwindcss-animate`/
`tw-animate-css` — mọi hiệu ứng dùng transition CSS thường
(`transition-colors`, `transition-transform`), tránh thêm dependency cho hiệu
ứng vào/ra chưa ai yêu cầu (YAGNI).

Mọi component export từ `packages/ui/src/index.ts`. Radix wrapper đều
`'use client'`. Primitive thuần trình bày (`Badge`, `Card`, `Skeleton`,
`EmptyState`, `ErrorState`, `Table`, …) KHÔNG tự `'use client'` — nơi gọi tự quyết
định (giữ nguyên quy ước sẵn có ở `button.tsx`/`input.tsx`).

### 4a. Checklist 4 trạng thái

`n/a` = trạng thái không áp dụng cho bản chất component đó, kèm lý do ngắn — không
phải "bỏ quên".

| Component | Loading | Empty | Error | Disabled |
|---|---|---|---|---|
| `Button` | `loading` prop → Spinner đè giữa + `aria-busy`, giữ nguyên bề rộng | n/a (không có "rỗng" cho một nút) | n/a (lỗi hành động là việc của caller, hiện qua Toast/ErrorState) | `disabled` (native) |
| `Input` / `Textarea` | n/a (ô nhập không có trạng thái tải) | n/a | `invalid` → `aria-invalid` + viền destructive | `disabled` (native) |
| `Label` | n/a | n/a | n/a | theo `peer-disabled` của control liên kết |
| `Badge` | n/a | n/a | `variant="destructive"` | n/a (không tương tác) |
| `Card` (+Header/Title/Description/Content/Footer) | nơi gọi đặt `<Skeleton>` bên trong `CardContent` | nơi gọi đặt `<EmptyState>` bên trong | nơi gọi đặt `<ErrorState>` bên trong | n/a |
| `Dialog` (+Trigger/Content/Header/Footer/Title/Description/Close) | nội dung bên trong tự quản (Skeleton nếu cần) | n/a | n/a | `DialogTrigger asChild` nhận `disabled` từ control con |
| `Tabs` (+List/Trigger/Content) | mỗi `TabsContent` tự quản loading riêng | n/a | n/a | `TabsTrigger disabled` |
| `Select` (+Trigger/Content/Item/Value/Group) | n/a (đóng/mở tức thời, không tải danh sách bất đồng bộ ở tầng primitive) | danh sách item rỗng thì nơi gọi tự không render `SelectContent` | n/a | `Select disabled` (toàn bộ) hoặc `SelectItem disabled` (từng mục) |
| `DropdownMenu` (+Trigger/Content/Item/Separator/Label) | n/a | n/a | n/a | `DropdownMenuItem disabled` |
| `Tooltip` (+Provider/Trigger/Content) | n/a | n/a | n/a | ẩn khi trigger `disabled` (trình duyệt không bắn pointer event) |
| `Switch` | n/a | n/a | n/a | `disabled` (Radix) |
| `Checkbox` | n/a | n/a | n/a | `disabled` (Radix) |
| `RadioGroup` (+Item) | n/a | n/a | n/a | `disabled` ở `RadioGroup` (cả nhóm) hoặc `RadioGroupItem` (từng mục) |
| `Toaster` / `useToast` | n/a (toast tự xuất hiện tức thời) | không có toast nào = không render gì (đúng ý, không phải "rỗng" cần thông báo) | `variant: 'destructive'` cho toast báo lỗi | n/a |
| `Alert` (+Title/Description) | n/a | n/a | `variant="destructive"` → `role="alert"` | n/a |
| `Skeleton` | CHÍNH LÀ trạng thái loading (khối chờ tải) | n/a | n/a | n/a |
| `Spinner` | CHÍNH LÀ chỉ báo loading (`role="status"`) | n/a | n/a | n/a |
| `Table` (+Header/Body/Row/Head/Cell/Caption) | nơi gọi render hàng `<Skeleton>` trong `TableBody` | nơi gọi render `<EmptyState>` thay `TableBody` (ngoài `<table>`, hoặc một hàng span đủ cột) | nơi gọi render `<ErrorState>` thay bảng | n/a |
| `CursorPager` | `loading` → nút Tiếp ở trạng thái `Button loading` | n/a (không phân trang được thì `hasNext=false`) | n/a (lỗi tải trang tiếp là việc của nơi gọi qua `ErrorState`) | `hasNext=false` → nút Tiếp disable; `page<=1` → nút Về đầu disable |
| `EmptyState` | CHÍNH LÀ trạng thái empty | — | n/a | n/a |
| `ErrorState` | n/a | n/a | CHÍNH LÀ trạng thái error (`role="alert"`) | `retrying` → nút Thử lại `Button loading` |
| `Separator` | n/a (ranh giới thuần thị giác) | n/a | n/a | n/a |
| `Kbd` | n/a | n/a | n/a | n/a |
| `ContentView`/`SplitPane`/`StepNav`/`ProgressBar` | giữ API cũ (P2/2.D) — nơi gọi (trang bài học) quản loading/error qua `ErrorState`/`Skeleton` bọc ngoài | — | — | `StepNav` tự tính disable nút Trước/Tiếp theo vị trí `activeKey` |

### 4b. `Button` — biến thể + `asChild`/`loading`

```ts
variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'; // mặc định 'primary'
size: 'sm' | 'md' | 'lg' | 'icon'; // mặc định 'md'
asChild?: boolean; // Radix Slot — render root là phần tử con (vd. <a>) thay vì <button>
loading?: boolean; // disabled + Spinner đè giữa, giữ nguyên bề rộng nút
```

`variant`/`size` cũ (`'primary'|'secondary'|'ghost'`, không `size`) **vẫn hoạt
động không đổi** — API mở rộng, không phá lời gọi hiện có.

#### `asChild` đổi CÁCH biểu đạt disabled/loading, không đổi ý nghĩa

Thuộc tính HTML `disabled` chỉ có tác dụng trên phần tử form. `asChild` hầu như
luôn bọc một `<a>` (nút-trông-như-link), và ở đó `disabled` được in ra nhưng
trình duyệt bỏ qua hoàn toàn: liên kết vẫn bấm được, vẫn nhận focus, và cả
`disabled:pointer-events-none` lẫn `disabled:opacity-50` đều không khớp vì
pseudo-class `:disabled` không bao giờ đúng với anchor.

Nên khi `asChild`, `Button` chuyển sang `aria-disabled="true"` +
`pointer-events-none opacity-50` **không điều kiện**. Đồng thời `loading` ở
nhánh này **không** áp `text-transparent`: Spinner đè chỉ render được ở nhánh
`<button>` (Radix `Slot` chỉ nhận một phần tử con), nên giấu nhãn sẽ để lại một
liên kết chữ tàng hình không có gì thay thế — `tailwind-merge` còn nuốt luôn
`text-primary-foreground` khi hai class cùng nhóm màu chữ gặp nhau.

| | `<button>` (mặc định) | `asChild` (vd. `<a>`) |
|---|---|---|
| `disabled` | thuộc tính `disabled` native | `aria-disabled` + `pointer-events-none opacity-50` |
| `loading` | Spinner đè + `text-transparent` + `aria-busy` | nhãn giữ nguyên hiển thị + `aria-busy` + khoá như trên |

Cả bốn đường đều có test hồi quy trong `button.test.tsx` § "Button — asChild".

## 5. Quy tắc dùng màu

1. **Không bao giờ** `#hex` hay `slate-*`/`gray-*`/`zinc-*`/`neutral-*` trong JSX
   — dùng class ngữ nghĩa ở bảng §1.
2. **Không** thêm token màu mới ở `globals.css` mà không cập nhật bảng §1 —
   token là hợp đồng C1, đổi/thêm phải phản ánh ở tài liệu này TRONG CÙNG COMMIT.
3. Modifier độ mờ dùng cú pháp Tailwind v4 chuẩn: `bg-primary/90`,
   `border-warning/30` — hoạt động trực tiếp trên biến CSS đã khai trong
   `@theme inline`, không cần khai riêng biến `-rgb`.
4. Component **presentational thuần** (không Radix) không tự `'use client'` —
   giữ khả năng render server-side của trang cha.
5. Icon dùng `lucide-react`, kích thước qua class Tailwind (`size-4`, `size-5`)
   — không import SVG rời hay hardcode `width`/`height` bằng số.

## 6. Thêm component mới

1. Component **presentational** (không hành vi trình duyệt phức tạp) → viết
   trực tiếp bằng `cn()` + class Tailwind (theo mẫu `badge.tsx`/`alert.tsx`).
2. Component **tương tác phức tạp** (focus trap, portal, bàn phím) → tìm
   primitive tương ứng trong `radix-ui` trước — KHÔNG tự viết lại (accessibility
   của Radix đã được kiểm nhiều năm; `packages/terminal/src/session-machine.ts`
   là ví dụ nhắc "đừng viết máy trạng thái/hành vi phức tạp thứ hai" cùng tinh
   thần). Bọc bằng `cn()` + token, giữ nguyên props gốc của Radix qua
   `ComponentProps<typeof Radix.X>`.
3. Nếu có nhiều biến thể (màu/kích thước) → `class-variance-authority`, đặt
   `satisfies Record<TênVariant, string>` để TypeScript báo lỗi ngay khi thêm
   một giá trị enum mà quên viết class tương ứng.
4. **Export** ở `packages/ui/src/index.ts` — cả runtime export lẫn `export type`
   nếu có props/type công khai.
5. **Test** — một file `*.test.tsx` cạnh component, vitest + RTL (jsdom — xem
   header `packages/ui/vitest.config.ts` về ranh giới hành vi/layout), phủ MỌI
   trạng thái áp dụng được ở bảng §4a. Nếu cần polyfill trình duyệt
   (`ResizeObserver`, `scrollIntoView`, Pointer Capture) — polyfill đã có sẵn ở
   `packages/ui/vitest.setup.ts`, không định nghĩa lại trong file test.
6. **Cập nhật bảng §4a** trong tài liệu này ở CÙNG COMMIT — checklist trạng
   thái là một phần của định nghĩa "xong", không phải việc làm sau.
7. Chạy `pnpm --filter @devops-platform/ui typecheck lint test` trước khi commit.
