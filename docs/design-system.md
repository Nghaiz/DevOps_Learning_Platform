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
| `--input` | `border-input`, `bg-input` (Switch off) | Viền ô nhập, nền Switch tắt | `0.63 0 0` (**không** bằng `--border` — xem §1a) | `1 0 0 / 38%` (**cũng** không bằng `--border` — xem §1a) |
| `--ring` | `focus-visible:ring-ring` **+ `ring-offset-2 ring-offset-background`** | Vòng focus — bằng primary, nên KHÔNG được vẽ sát mặt nút (§1a) | `0.546 0.215 262.881` (= primary) | `0.685 0.169 262.881` (= primary tối) |
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
(oklch → sRGB **mã hoá gamma** → độ chói tương đối WCAG 2.1), và được **gác
lại** ở đó: hạ một token xuống dưới ngưỡng làm suite `packages/ui` đỏ.

> **⚠ Đính chính 2026-09-06 — bảng cũ có hai con số SAI, và chúng sai theo
> hướng nguy hiểm nhất: chúng chứng nhận cho đúng thứ cần chặn.**
>
> `tokens.contract.test.ts` trộn alpha trong **linear-light**, còn trình duyệt
> composite `border-color`/`background-color` trong **sRGB đã mã hoá gamma**
> (CSS Color 4 §12 — compositing chạy SAU khi màu chuyển sang không gian đích).
> Sai lệch không nhỏ; nó lật ngược kết luận. Với `--input` tối cũ
> (`oklch(1 0 0 / 16%)`) trên nền `oklch(0.145 0 0)`:
>
> | | phép trộn | kết quả | trên `--background` | trên `--card` |
> |---|---|---|---|---|
> | ĐÚNG | `255×0.16 + 10×0.84 = 49.2` | `#313131` | **1.53** ✗ | **1.63** ✗ |
> | SAI (cũ) | `1×0.16 + 0.00305×0.84` | `#707070` | 4.01 "đạt" | 3.71 "đạt" |
>
> Hai con số 4.01 / 3.71 đã được chép sang **ba nơi**: bảng này, chú thích
> `--input` trong `globals.css`, và chính test. Cả ba sai cùng một kiểu, sửa
> cùng ngày. Chỉ các cặp có token TRONG SUỐT bị ảnh hưởng (`--input` tối,
> `--border` tối) — cặp đục không đi qua phép trộn nên số của chúng không đổi.
>
> Đối chứng cũ của test không cứu được: nó chỉ khẳng định `4.01 < 9.48`, tức
> xác nhận một con số sai nhỏ hơn một con số khác. Nay thay bằng đối chứng
> **dương**, tính tay được và độc lập với token hiện tại: trắng/đen = 21.00:1
> kèm hex hai đầu thang, `oklch(0.145 0 0)` = `#0a0a0a`, và phép trộn 16% ra
> `#313131` / 1.53:1 chạy SONG SONG với vế linear-light `#707070` / 4.01:1 —
> đổi lại công thức là đỏ, không phải "đẹp lên".

**Vì sao phải đo tay.** `axe-core` — cổng a11y của 13.H — chỉ có rule contrast
cho **chữ**. Nó không có rule nào cho viền hay ranh giới control, nên
SC 1.4.11 hoặc được đo ở đây, hoặc không ở đâu cả. Một cổng axe xanh **không**
chứng minh viền đủ tương phản.

| Cặp | Ngưỡng | Sáng | Tối |
|---|---|---|---|
| `--foreground` / `--background` | 4.5 (SC 1.4.3) | 19.79 | 18.96 |
| `--muted-foreground` / `--background` | 4.5 | 7.57 | 7.63 |
| `--muted-foreground` / `--muted` | 4.5 | 6.94 | 5.83 |
| `--muted-foreground` / `--card` | 4.5 | 7.57 | 6.91 |
| `--primary-foreground` / `--primary` | 4.5 | 4.95 | 6.85 |
| `--secondary-foreground` / `--secondary` | 4.5 | 16.42 | 14.48 |
| `--destructive-foreground` / `--destructive` | 4.5 | 4.56 | 6.84 |
| `--success-foreground` / `--success` | 4.5 | 4.95 | 7.82 |
| `--warning-foreground` / `--warning` | 4.5 | 5.06 | 9.23 |
| `--input` / `--background` | 3.0 (SC 1.4.11) | **3.50** | **3.51** |
| `--input` / `--card` | 3.0 | 3.50 | **3.58** |
| `--input` / `--muted` | 3.0 | 3.21 | **3.45** |
| núm Switch / rãnh Switch (trên `--background`) | 3.0 | 3.50 | **3.51** |
| núm Switch / rãnh Switch (trên `--card`) | 3.0 | 3.50 | **3.95** |
| `--ring` / `--background` | 3.0 | 5.17 | 6.85 |
| `--ring` / `--card` | 3.0 | 5.17 | 6.20 |
| `--primary` / `--background` | 3.0 | 5.17 | 6.85 |
| `--destructive` / `--background` | 3.0 | 4.76 | 6.84 |
| `--ring` / `--primary` | miễn trừ có chứng minh | **1.00** | **1.00** |
| `--ring` / `--destructive` | miễn trừ có chứng minh | **1.09** | **1.00** |
| `--border` / `--background` | — (trang trí) | **1.26** | **1.33** |
| `--border` / `--card` | — (trang trí) | **1.26** | **1.42** |

Ô **đậm** = giá trị từng nằm dưới ngưỡng, hoặc cố ý nằm dưới ngưỡng kèm lý do.

**`--input` ≠ `--border`, khác với shadcn/ui gốc.** shadcn để hai token bằng
nhau; giá trị đó cho **1.26:1** trên nền trắng. `--input` là ranh giới **nhận
dạng** của control — `border-input` là viền duy nhất của `Input`, `Textarea`,
`SelectTrigger`, `Checkbox`, `RadioGroupItem` và `Button variant="outline"`,
còn `bg-input` là rãnh `Switch` lúc tắt. Ở 1.26:1 một ô nhập trên trang sáng
gần như **vô hình** cho tới khi được focus.

- **Sáng:** `0.63` (#898989) cho 3.50:1, dư ~0.5 so với ngưỡng để sai số
  chuyển oklch→sRGB giữa các trình duyệt không kéo tụt xuống dưới.
- **Tối:** `1 0 0 / 38%`, KHÔNG phải 16% (2026-09-06). Ở 16% lớp trắng này ra
  `#313131` trên nền trang ⇒ 1.53:1 — cùng một hỏng như nhánh sáng, chỉ khác
  là bảng cũ báo 4.01 nên nó không lộ ra. 38% cho 3.51 / 3.58 / 3.45.
  Giữ dạng **trong suốt** thay vì đổi sang oklch đục là có chủ đích: alpha là
  thứ kéo ba con số sát nhau (chênh 0.13), còn một giá trị đục vừa đủ 3.0 trên
  `--muted` (`oklch(0.545 0 0)`) sẽ vọt lên 3.99 trên `--background` — chênh
  0.94, tức viền đậm nhạt khác hẳn nhau tuỳ nó nằm trong khối nào.

**`--border` ở 1.26–1.42:1 là quyết định, không phải chỗ bỏ sót.** Nó chỉ vẽ
ranh giới **trang trí**: viền card, kẻ dòng bảng, viền đứt `EmptyState`,
`Separator` (mặc định `decorative`, tức `role="none"`). SC 1.4.11 loại trừ
tường minh phần trang trí thuần và phần không mang thông tin — nội dung trong
card, không phải đường kẻ quanh nó, mới là thứ người dùng cần đọc. Ranh giới
nào **nhận dạng một control** thì dùng `--input`, không dùng `--border`. Thêm
một component tương tác mà lấy `border-border` làm viền duy nhất ⇒ đổi sang
`border-input`.

**Vòng focus: `--ring` = `--primary`, nên nó KHÔNG được vẽ sát mặt nút.**
Đây là hệ quả trực tiếp của việc `--ring` cố ý bằng `--primary`: mọi vòng focus
nằm sát một mặt tô `bg-primary` đều bằng **1.00:1** — vô hình, ở cả hai theme
(nút `destructive`: 1.09 sáng / 1.00 tối). Nó phá luôn phép kiểm bàn phím của
13.H, vì thứ phép kiểm đó cần thấy thì không hiển thị.

**Không có nghiệm token.** Ở chế độ tối `--primary` chỉ cách `--card` 6.20:1,
mà nhét vừa hai bậc 3:1 thì cần khe ≥9:1. Quét vét cạn thang độ chói cho đúng
**0 nghiệm**; hai đầu mút nói rõ vì sao: trắng tinh chỉ được 2.89:1 với
`--primary`, còn đen tuyền chỉ được 1.17:1 với `--card`. Nới `--primary` ra xa
hơn thì phá `--primary-foreground` và cả bảng màu mọi lane đang tiêu thụ. Cách
sửa vì vậy nằm ở **hình học**, không nằm ở màu:

| Cơ chế | Dùng ở | Màu KỀ vòng focus khi đó |
|---|---|---|
| `ring-offset-2` + `ring-offset-background` | `Button`, `Switch`, `Checkbox` | `--background` / `--card` — 5.17 sáng / 6.85 tối |
| `ring-current` | `StepNav`, nút đóng `Toast` | `text-*-foreground` của chính bề mặt — đã gác ở ≥4.5:1 |

Hai class của cơ chế thứ nhất **bắt buộc đi cùng nhau**: thiếu
`ring-offset-background` thì Tailwind rơi về mặc định của chính nó
(`--tw-ring-offset-color: #fff`), tức một khe **trắng** trên nền tối. Cơ chế
thứ hai dành cho hai chỗ mà offset là SAI chứ không phải thiếu — hàng bước nằm
trong `overflow-x-auto` nên vòng đẩy ra ngoài bị **cắt** ở mép cuộn, còn nút
đóng toast thì màu nền trang không hề kề nó.

Miễn trừ hai cặp `--ring`/`--primary` và `--ring`/`--destructive` khỏi bảng đo
chỉ đứng vững chừng nào offset **thật sự có mặt**, nên nó được gác bằng class
render ra DOM ở `button.test.tsx`, `switch.test.tsx`, `checkbox.test.tsx`,
`toast.test.tsx`, `lesson/step-nav.test.tsx` — cộng một đối chứng ghim khe
6.20:1: nếu ai nới `--primary` quá 9:1 thì test đỏ và miễn trừ phải bị **gỡ**,
không phải chỉnh lại con số.

**Spinner trong nút `loading` lấy màu từ token, không từ `currentColor`.**
`Button loading` đặt `text-transparent` lên chính `<button>` để giấu nhãn phía
sau Spinner đè lên — nhưng `currentColor` khi đó là trong suốt, mà
`lucide-react` vẽ icon bằng `stroke="currentColor"` + `fill="none"`, nên
spinner **cũng** biến mất. Lớp bọc Spinner vì vậy đặt màu theo biến thể
(`SPINNER_TONE` trong `button.tsx`): mỗi giá trị là màu **chữ** của chính biến
thể đó, nên tương phản với mặt nút đã nằm trong bảng ≥4.5:1 ở trên, dư so với
mức 3:1 mà SC 1.4.11 đòi. `outline`/`ghost` phải nói rõ `text-foreground` vì
hai biến thể đó không đặt `text-*` nào, `currentColor` của chúng là màu thừa
kế bất kỳ. jsdom không tính computed style nên phép gác ở đây là **class**
quyết định màu, không phải sự tồn tại phần tử — kiểm sự tồn tại là một test
không bao giờ đỏ được.

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
| `Badge` | n/a | n/a | `variant="destructive"`; trạng thái bị chặn dùng `status-locked` (§4c) | n/a (không tương tác — không nhận focus, không có handler) |
| `Card` (+Header/Title/Description/Content/Footer) | nơi gọi đặt `<Skeleton>` bên trong `CardContent`; khung chờ KHÔNG đặt `interactive` (§4d) | nơi gọi đặt `<EmptyState>` bên trong | nơi gọi đặt `<ErrorState>` bên trong | n/a (thẻ không phải control; `interactive` chỉ đổi phản hồi hover, không phải trạng thái bật/tắt) |
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
| `EmptyState` | n/a (không tự tải gì — nơi gọi quyết định lúc nào đổi `Skeleton` sang `EmptyState`) | CHÍNH LÀ trạng thái empty | n/a | n/a |
| `ErrorState` | n/a | n/a | CHÍNH LÀ trạng thái error (`role="alert"`) | `retrying` → nút Thử lại `Button loading` |
| `Separator` | n/a (ranh giới thuần thị giác) | n/a | n/a | n/a |
| `Kbd` | n/a | n/a | n/a | n/a |
| `ContentView`/`SplitPane`/`StepNav`/`ProgressBar` | giữ API cũ (P2/2.D) — nơi gọi (trang bài học) bọc `Skeleton` NGOÀI cụm | n/a (bài học luôn có ít nhất một bước; danh sách rỗng là lỗi dữ liệu, chặn từ trước khi render) | nơi gọi bọc `ErrorState` NGOÀI cụm — tầng primitive không có trạng thái lỗi riêng | `StepNav` tự tính disable nút Trước/Tiếp theo vị trí `activeKey` |

### 4b. `Button` — biến thể, `asChild`/`loading`, icon

```ts
variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link'; // mặc định 'primary'
size: 'sm' | 'md' | 'lg' | 'icon'; // mặc định 'md'
asChild?: boolean; // Radix Slot — render root là phần tử con (vd. <a>) thay vì <button>
loading?: boolean; // disabled + Spinner đè giữa, giữ nguyên bề rộng nút
iconLeft?: ReactNode;  // icon TRƯỚC nhãn — BỊ BỎ QUA khi asChild (xem dưới)
iconRight?: ReactNode; // icon SAU nhãn — cùng ràng buộc
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

#### `iconLeft`/`iconRight` — icon TRANG TRÍ, và `asChild` không nhận được chúng

Hai prop này nhận `ReactNode`, đặt icon ở hai đầu nhãn. Icon ở đây là **trang
trí**: nó đứng cạnh chữ đã nói đủ nghĩa, nên node truyền vào **tự mang
`aria-hidden`** — `Button` cố ý không `cloneElement` để nhét thuộc tính vào node
của nơi gọi. Nút chỉ-có-icon là ca khác hẳn: dùng `size="icon"` + `aria-label`
trên chính nút, vì lúc đó icon là thứ DUY NHẤT mang nghĩa.

**`asChild` bỏ qua cả hai prop, và đó là hành vi đã khai — không phải bug.**
Radix `Slot` gọi `Children.only`, tức `props.children` phải là **đúng một** React
element. Thêm một node anh em (icon) vào nhánh đó làm Slot ném thẳng *"expected a
single React element child"*. Nên nhánh `asChild` truyền `children` nguyên vẹn,
và icon là việc của element con:

```tsx
<Button asChild>
  <Link href="/lessons"><Play aria-hidden />Bắt đầu</Link>
</Button>
```

Bỏ qua trong im lặng là điều đáng ngại, nên nó **được ghim bằng test** ở
`button.test.tsx` — một lần "dọn dẹp" sau này biến nó thành sự bỏ qua tình cờ sẽ
làm suite đỏ, chứ không trôi qua.

Khi `loading`, icon nằm CÙNG nhánh với nhãn nên `text-transparent` của nút nuốt
luôn màu nét của chúng. Đúng ý: cả cụm icon + nhãn mờ đi sau Spinner đè lên, thay
vì icon còn nổi lên cạnh một cái nhãn đã tàng hình.

### 4c. `Badge` — bảy biến thể NGỮ NGHĨA, mỗi cái một hình riêng

Sáu biến thể trình bày (`default`, `secondary`, `success`, `warning`,
`destructive`, `outline`) nói về **sắc thái**. Bảy biến thể dưới đây nói về
**trạng thái có thật trong miền dữ liệu** — độ khó của bài, tiến độ của người
học — nên mỗi cái mang một icon `lucide-react` riêng, **mặc định**:

| Biến thể | Nhãn tiếng Việt | Icon | Hình |
|---|---|---|---|
| `difficulty-basic` | Cơ bản | `SignalLow` | sóng tín hiệu **1 vạch** |
| `difficulty-intermediate` | Trung cấp | `SignalMedium` | sóng tín hiệu **2 vạch** |
| `difficulty-advanced` | Nâng cao | `SignalHigh` | sóng tín hiệu **3 vạch** |
| `status-todo` | Chưa bắt đầu | `Circle` | vòng tròn **rỗng** |
| `status-progress` | Đang học | `CirclePlay` | vòng tròn có **nút play** |
| `status-done` | Đã xong | `CircleCheck` | vòng tròn có **dấu tích** |
| `status-locked` | Bị khoá | `Lock` | **ổ khoá** |

**Vì sao mỗi trạng thái phải có hình riêng, không chỉ màu riêng.** WCAG 1.4.1
(Use of Color) cấm màu là phương tiện DUY NHẤT truyền đạt thông tin, và ở đây có
hai người đọc cụ thể bị bỏ lại nếu chỉ dựa vào màu:

- **In đen trắng.** Bảy nền tô đặc đổ về bảy sắc xám; "Đã xong" và "Đang học"
  thành hai ô xám gần bằng nhau. Số vạch và dấu tích thì sống sót qua máy in.
- **Người mù màu.** Ca phổ biến nhất (deuteranopia, khoảng 6% nam giới) làm xanh
  lá và đỏ chập lại — đúng cặp `status-done` / `destructive`, tức cặp mà đọc nhầm
  gây hại nhất: "đã xong" và "hỏng" trông như nhau.

Hai thang hình được chọn để **bản thân thứ tự cũng đọc được**, không chỉ khác
nhau: độ khó là **số vạch tăng dần** (1 → 2 → 3, nhìn là biết cái nào nặng hơn),
tiến độ là một **hành trình** rỗng → play → tích → khoá. Ba icon khác nhau nhưng
không xếp được thứ tự thì vẫn thoả 1.4.1 mà mất thông tin thứ bậc.

**Icon là MẶC ĐỊNH, không phải opt-in.** Nếu nơi gọi phải tự truyền icon thì bảo
đảm 1.4.1 phụ thuộc vào việc MỌI nơi gọi đều nhớ — tức là không có bảo đảm nào.
Nơi gọi vẫn đè được bằng `icon={<... />}`, và tắt hẳn bằng `icon={null}`. Sáu
biến thể trình bày cố ý KHÔNG có icon mặc định: chúng không mang một trạng thái
cố định nào để mà vẽ.

**Hai chỗ lệch tên, cả hai đều cố ý** (chi tiết ở `badge.tsx`):

1. `basic` ≠ `beginner`. Token là `--difficulty-basic`; enum miền
   (`ScenarioDifficulty`) là `beginner`. Việc nối hai từ vựng thuộc về **nơi
   gọi** — đúng một chỗ: `DIFFICULTY_BADGE` trong
   `apps/web/src/components/catalog/catalog-labels.ts`.
2. `status-todo` **không có token riêng**. Hợp đồng token chỉ có
   `progress`/`done`/`locked`, còn miền tiến độ có bốn giá trị. `status-todo` vì
   vậy mượn `--muted`/`--muted-foreground` (đã được gác ≥4.5:1) thay vì mint token
   mới — trung tính là màu ĐÚNG cho "chưa bắt đầu", và thứ phân biệt nó khỏi ba
   trạng thái kia là HÌNH.

`status-locked` hiện **chưa có nơi gọi**: trang danh mục không khoá mục nào. Nó
dành cho lộ trình tuần tự (`app/paths/[id]`). Ghi ra để lần đọc sau không kết
luận nhầm rằng nó thừa.

### 4d. `Card` — `interactive` và `accent`

```ts
interactive?: boolean;                            // mặc định FALSE
accent?: 'basic' | 'intermediate' | 'advanced';   // dải màu độ khó ở viền trái
```

`interactive` bật hover: đổi viền sang `border-input`, nâng bóng lên
`shadow-elevation-2`, và nhấc thẻ `-translate-y-0.5` (dưới `motion-safe:`).

**Mặc định `false` là một quyết định, không phải sự dè dặt.** Hiệu ứng nhấc là
tín hiệu "bấm được". Đặt nó lên một tấm bảng tĩnh — thẻ "Sức chứa" ở trang quản
trị, khung đăng nhập — là **hứa một hành động không tồn tại**: người dùng rê
chuột, thấy thẻ phản hồi, bấm, và không có gì xảy ra. Mặc định phải là cái KHÔNG
hứa gì; thẻ nào thật sự bấm được thì tự nói ra.

Nên quy tắc là: **bật `interactive` khi và chỉ khi thẻ nằm trong một `<Link>` hoặc
có handler bấm.** Hiện có đúng một nơi — `CatalogCard`
(`apps/web/src/components/catalog/catalog-grid.tsx`), và nó **đã truyền** (kiểm
2026-09-06). Khung chờ (skeleton) trong cùng file cố ý KHÔNG truyền: một ô đang
tải thì chưa bấm được.

`accent` vẽ dải `border-l-4` màu độ khó ở viền trái. Hậu tố khớp token
`--difficulty-*`, nên nó mang **cùng chỗ lệch `basic`/`beginner`** ở §4c —
`DIFFICULTY_ACCENT` trong `catalog-labels.ts` là chỗ nối. Dải màu một mình KHÔNG
đủ cho 1.4.1; nó đi kèm `Badge` độ khó có icon trong cùng thẻ, và đó mới là thứ
mang nghĩa.

### 4e. Ba bậc bóng — `shadow-elevation-1|2|3`

Ba **bậc ngữ nghĩa**, không phải ba kích cỡ tuỳ ý. Dùng sai bậc thì phân cấp thị
giác nói dối về thứ đang thật sự nổi lên trên:

| Class | Bậc | Dùng cho |
|---|---|---|
| `shadow-elevation-1` | nền | thẻ lúc **nghỉ**, thanh đầu trang, ô thống kê |
| `shadow-elevation-2` | nhấc | thẻ lúc **hover** (chỉ khi `interactive`) |
| `shadow-elevation-3` | nổi | **popover / dialog** — lớp nằm trên toàn trang |

Tiện ích sinh từ namespace `--shadow-*` trong `@theme inline`. **KHÔNG** viết
`shadow-[var(--elevation-1)]`: dạng arbitrary vẫn đổi theo theme nhưng bỏ qua
bảng theme, nên mỗi chỗ gọi lại tự chọn bậc — đúng thứ mà ba bậc sinh ra để chặn.

> **Trạng thái thật của bậc 3 (đo 2026-09-06): chưa có nơi gọi nào.** Token
> `--elevation-3` đã khai ở cả hai theme và `shadow-elevation-3` đã sinh ra, nhưng
> bốn lớp nổi hiện vẫn dùng thang dựng sẵn của Tailwind — `Dialog` và `Toaster` ở
> `shadow-lg`, `SelectContent`/`DropdownMenuContent`/`TooltipContent` ở
> `shadow-md`. Đây là **nợ chưa trả**, không phải quyết định; ghi ra để lần đọc
> sau không tưởng bậc 3 đã được dùng ở đâu đó rồi.

#### ⚠ `tailwind-merge` KHÔNG khử `shadow-elevation-*` với thang dựng sẵn

Đo trực tiếp bằng `twMerge` của bản đang cài:

```
twMerge('shadow-sm shadow-elevation-1')          → 'shadow-sm shadow-elevation-1'     ← CẢ HAI sống
twMerge('shadow-elevation-1 shadow-none')        → 'shadow-elevation-1 shadow-none'   ← CẢ HAI sống
twMerge('shadow-elevation-1 shadow-elevation-2') → 'shadow-elevation-2'               ← khử ĐƯỢC
```

Dòng thứ ba là chỗ dễ đọc nhầm thành "vậy là nó vẫn hoạt động". Cấu hình mặc định
của `tailwind-merge` chỉ biết thang bóng dựng sẵn (`sm`/`md`/`lg`/…);
`elevation-1` không phải cỡ áo phông nên nó bị xếp vào nhóm *shadow-**color***.
Hai class **cùng** rơi vào nhóm đó thì khử nhau bình thường — nên bậc 1 với bậc 2
sạch sẽ. Nhưng một "màu" thì **không xung đột** với một "bóng", nên `shadow-none`
và `shadow-sm` đi xuyên qua.

Hệ quả thực dụng: **đừng trông vào `className="shadow-none"` để tắt bóng của
`Card`** — cả hai luật cùng tồn tại và THỨ TỰ NGUỒN CSS quyết định, không phải ý
định của nơi gọi. Muốn một bậc khác thì truyền `shadow-elevation-*` khác (khử
được, dòng ba ở trên), đừng truyền `shadow-none`.

Sửa tận gốc là dạy `cn.ts` biết nhóm này:

```ts
extendTailwindMerge({ extend: { classGroups: { shadow: [{ shadow: ['elevation-1', 'elevation-2', 'elevation-3'] }] } } })
```

Chưa làm — `cn.ts` là SSOT của mọi component, đổi nó là việc riêng có test riêng,
không phải phần đuôi của một lane giao diện.

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
   thái là một phần của định nghĩa "xong", không phải việc làm sau. Bước này
   **được gác bằng máy** từ 2026-09-06 (`src/design-system.contract.test.ts`,
   §7): export một component mà không thêm dòng vào §4a làm suite đỏ, nên nó
   không còn là một lời nhắc trông chờ vào trí nhớ.
7. Chạy ba lệnh **RIÊNG** trước khi commit:

   ```bash
   pnpm --filter @devops-platform/ui typecheck
   pnpm --filter @devops-platform/ui lint
   pnpm --filter @devops-platform/ui test
   ```

   ⚠ **KHÔNG gộp** thành `pnpm --filter … typecheck lint test`. `pnpm run` chỉ
   nhận MỘT tên script; hai chữ còn lại bị truyền tiếp làm **đối số** cho
   script đầu, nên lệnh thật chạy ra là `tsc --noEmit "lint" "test"` và chết ở
   `error TS5112: tsconfig.json is present but will not be loaded if files are
   specified on commandline` (đo 2026-09-06). Hỏng này đọc như một lỗi kiểu
   của repo, trong khi `lint` và `test` **chưa từng chạy** — nguy hiểm đúng ở
   chỗ đó.

## 7. Ba cổng hợp đồng (chạy trong suite `packages/ui`)

Bảng C1/C2 ở `phase-13-exec.md` §2 là hợp đồng giữa 13.A và **tám lane Đợt 2**
viết song song trong context riêng. Một hợp đồng chỉ được kiểm bằng mắt thì mục
ruỗng theo thời gian, và hỏng của nó xuất hiện muộn — ở lane khác, trông như
lỗi của họ. Ba file dưới đây biến nó thành cổng:

| File | Gác gì | Đỏ ở đâu |
|---|---|---|
| `src/theme/tokens.contract.test.ts` | Token C1 có ở **cả** `:root` lẫn `.dark`; mọi token có `--color-*` trong `@theme inline`; contrast WCAG của 12 cặp chữ + 6 cặp phi-chữ ở cả hai theme | `pnpm test` |
| `src/exports.contract.test.ts` | 68 tên C1/C2 được export; prop bắt buộc vẫn bắt buộc; mọi giá trị union variant/size còn nguyên; không có export lạ ngoài hợp đồng | `pnpm typecheck` **và** `pnpm test` |
| `src/design-system.contract.test.tsx` | **Chính tài liệu này**: mọi component export có dòng ở bảng §4a và khai đủ 4 trạng thái; không dòng nào trỏ tới component đã xoá; bảng icon §4c khớp DOM thật | `pnpm test` |

Ba hỏng chúng bắt được mà không cổng nào khác thấy:

1. **Token thiếu ở một theme.** Không lỗi CSS, không cảnh báo build — chế độ
   tối chỉ kế thừa màu sáng và hiện sai.
2. **Thiếu map `@theme inline`.** Class `bg-x` không được Tailwind sinh ra;
   JSX vẫn biên dịch, thuộc tính `class` vẫn có trong HTML, chỉ là không luật
   CSS nào khớp. Cùng hình dạng với lỗi `@source` đo ngày 2026-08-13 (xem đầu
   `globals.css`).
3. **Contrast tụt dưới WCAG.** `axe-core` (cổng 13.H) chỉ đo contrast của
   **chữ** — không có rule nào cho viền. Một cổng axe xanh không nói gì về
   SC 1.4.11.

Cả ba file mang **đối chứng dương**: phép đo contrast tự kiểm bằng 1:1 với
chính nó, 21:1 đen-trắng và một khẳng định alpha thật sự được đè lên nền; kiểm
export có test chặn tên lạ; cổng tài liệu chạy phép kiểm của nó trên các bản
markdown **đã bị bẻ gãy có chủ đích** (thêm một component ma, xoá một dòng thật,
làm rỗng một ô trạng thái) và đòi cả ba lượt đó phải đỏ. Một cổng không bao giờ
đỏ được thì không gác gì cả.

**Khi một cổng đỏ, sửa TOKEN/EXPORT — không hạ ngưỡng, không thêm tên vào danh
sách miễn trừ** trừ khi đó thật sự là một quyết định mới, và khi đó phải sửa
C1/C2 ở `phase-13-exec.md` trong cùng commit.

### 7a. Hai dương tính giả đã biết của lệnh grep AC

Lệnh grep ở §0 và ở `phase-13-exec.md` §5 giới hạn `--include=*.tsx`, và ở dạng
đó nó **rỗng** trên `packages/ui/src`. Nới phạm vi ra thì gặp hai thứ vô hại —
ghi ở đây để lần kiểm sau không mất thời gian truy lại:

1. **`globals.css` chứa `slate-*` và `#hex` trong CHÚ THÍCH.** Đó là bằng chứng
   đo được: tên class của lỗi `@source` 2026-08-13, và hai giá trị sRGB của lần
   sửa contrast `--input` (§1a). Không dòng nào là màu đang dùng. Một file CSS
   token đương nhiên chứa giá trị màu — nó nằm ngoài phạm vi grep có chủ ý.
2. **`toast.tsx` khớp grep thương mại vì chữ `subscribe`.** Đó là
   `useSyncExternalStore(subscribe, …)` của React, không phải gói cước. Grep AC
   `price|pricing|checkout|subscribe|billing` chạy trên `apps/web/src`, không
   phủ `packages/ui`, nên nó không đỏ ở Đợt 3 — nhưng ai chạy bản nới rộng sẽ
   gặp.
