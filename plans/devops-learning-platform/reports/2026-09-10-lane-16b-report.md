# Lane 16.B — vỏ ứng dụng + bốn màn xác thực

**Ngày:** 2026-09-10 · **Nhánh:** `feat/p16-b-shell-auth` · **Nền:** `cd6d51a`
**Worktree:** `D:/NCKH/wt-p16-b` · **Hai commit, 21 file, +1512 / -315**

---

## 1. Cổng, đo thật

Lệnh: `pnpm -w turbo run build lint typecheck test` rồi `node scripts/check-design-tokens.mjs`,
chạy trên cây sau khi đã commit cả hai lượt.

```
 Tasks:    32 successful, 32 total
Cached:    24 cached, 32 total
```

`Tasks: 32/32` đọc TRƯỚC mọi con số test: không task nào đỏ nên không suite nào bị bỏ qua.
`next build` nằm trong 32 đó và đã phát ra cả bốn route xác thực (`/login`, `/register`,
`/forgot-password`, `/reset-password`).

TỔNG số test từng gói, không chỉ số đỏ:

| Gói | Nền `cd6d51a` | Sau lane | Δ |
|---|---|---|---|
| web | 1729 (145 file) | **1735 (146 file)** | +6 (+1 file) |
| ui | 858 | 858 | 0 |
| games | 402 | 402 | 0 |
| scenario | 285 | 285 | 0 |
| terminal | 133 | 133 | 0 |
| motion | 110 | 110 | 0 |
| copy | 52 | 52 | 0 |
| shared-types | 48 | 48 | 0 |
| **Tổng** | **3617** | **3623** | **+6** |

+6 là đúng sáu ô của `components/shell/copy-gate.test.ts` (file thứ 146). Không ô nào bị xoá,
không ô nào chuyển sang `skip`.

`check-design-tokens.mjs`: `✓ không có màu cứng — đã quét 561 file trong 4 vùng`, kèm dòng đối
chứng hai chiều của chính bộ đo.

---

## 2. Bảng commit

| SHA | Nội dung |
|---|---|
| `de62e0f` | `feat(shell)` — vỏ đi qua `packages/copy`, dấu thương hiệu thành cung ellipse, ba chuỗi U+2014 viết lại, mục nav đang mở mang hai dấu hiệu |
| `51272e0` | `feat(auth)` — tách bốn màn xác thực, hai màn chưa có backend nói đúng điều đó, cổng copy hai chiều |

---

## 3. Xong / chưa xong theo từng mục §16.B

| Mục 16.B | Trạng thái | Ghi chú |
|---|---|---|
| Giữ hình thái thanh trên `h-14` dính + drawer trái ≤768px | XONG | Hình thái giữ nguyên từng lớp; `min-[769px]:` không đổi một chỗ nào |
| Dựng lại theo token và motif | XONG | Dấu thương hiệu thành cung ellipse hở; cột trái bốn màn xác thực có cung nền + logo PTIT thật |
| Vỏ sở hữu `<main>` duy nhất | XONG (giữ nguyên) | `AuthFrame` KHÔNG render `<main>`; `landmark-contract.test.ts` xanh |
| Tách `/login` thành `/login` + `/register` | XONG | Thẻ 218 dòng thành hai file; cả hai có URL riêng nên 16.I đưa được vào `SCREENS` |
| `/forgot-password` mới | XONG | Frontend-only, không gọi mạng, trạng thái thành công nói đúng rằng chưa bật |
| `/reset-password` mới | XONG | Như trên, cộng một sửa hướng do luật 8 (mục 5.2) |
| Đăng xuất giữ `/api/auth/logout` | XONG (không đụng) | `authClient.signOut()` KHÔNG xuất hiện ở đâu trong lane |
| `immersive-routes.ts` giữ `/labs` + `/lessons` | XONG (không đụng) | File không nằm trong diff; `components/session/immersive-routes.test.ts` xanh |
| `breakpoints.ts` + `use-min-width.ts` giữ nguyên logic | XONG (không đụng) | Không đổi một khẳng định nào, nên không phải chuyển ô nào |
| Component lấy từ `@devops-platform/ui`, toast qua `packages/ui/src/toast.tsx` | XONG | `sonner` không được import thẳng ở đâu trong lane |
| Tên sản phẩm chính tắc khai trong `shell.ts` | XONG | `shell.brand.name`; `home.og.title` của 16.E KHÔNG đụng |

---

## 4. Copy: số khoá và số khoá mồ côi

| Surface | Khoá | Mồ côi |
|---|---|---|
| `shell.` | 54 | **0** |
| `auth.` | 45 | **0** |
| **Tổng** | **99** | **0** |

Số mồ côi là 0 vì có một cổng đo nó, không phải vì tôi đọc tay: `copy-gate.test.ts` ô
"không khoá nào chết". Nó bắt thật một lần trong phiên này (mục 5.1).

`shellIntentionalThree` có hai dòng, `authIntentionalThree` rỗng. Cả hai nhóm ba của `shell.`
được **lồng xuống một tầng có chủ ý** (`shell.theme.choice.*`, `shell.account.menu.*`) để cổng
T3 nhìn thấy chúng: `groupBySiblingPrefix` gom theo tiền tố có dấu chấm, nên ba khoá đặt phẳng
cạnh sáu khoá anh em đi qua T3 vô hình. Đây là điểm mù mà lane 16.C2 đã phải xử ở `92804b7`, và
tôi làm theo thay vì hưởng nó.

`auth.` KHÔNG khai miễn trừ nào, và bảng rỗng là câu trả lời đúng chứ không phải chỗ chờ điền:
vế thứ hai của T3 bắt một miễn trừ không còn khớp gì, nên thêm một dòng phòng xa là tự tạo một ô
đỏ. Hai chỗ suýt thành nhóm ba được **đặt lại tên** thay vì khai miễn trừ — `auth.oauth.divider`
thành `auth.form.divider` (nó là phần của form, không phải của nhóm nhà cung cấp), và
`auth.frame.arc-alt` bị xoá hẳn vì cung nền là trang trí thuần và không nên có nhãn.

---

## 5. Quyết định đáng tranh luận

### 5.1 Cổng copy của lane gác HAI chiều, và cả hai chiều đều bắt được thật

Khuôn lấy từ `components/admin/copy-gate.test.ts` của 16.F, không dựng lại. Nó bắt hai thứ trong
lượt chạy đầu:

- **Chiều xuôi:** `console.error('[auth] đăng xuất thất bại', …)` trong `user-menu.tsx`. Đây đúng
  là bẫy số 4 của brief: chữ người vận hành đọc thì ở lại tiếng Anh và KHÔNG vào `packages/copy`.
  Đã đổi sang `'[auth] sign-out request failed'`.
- **Chiều ngược:** `shell.brand.name` là khoá chết. Tôi khai nó theo yêu cầu của lead (bản chính
  tắc của tên sản phẩm) nhưng thanh đầu trang chỉ dùng ba biến thể ngắn hơn. Đã nối nó vào cột
  trái của `AuthFrame`, chỗ tên sản phẩm đầy đủ có nghĩa thật. Nếu không có ô này thì nó đã đi
  qua mọi cổng khác.

**Một báo động giả cần lead biết, vì nó sẽ quay lại.** Cùng lượt đó, cổng xuôi báo thêm một vi
phạm `[jsx-text]` trải dài cả thân hàm `onSignOut`. Nguyên nhân: `scanLatinLiteral` dò JSX text
bằng mẫu "giữa `>` và `<`", và chữ ký `async function onSignOut(): Promise<void> {` cấp cho nó
một dấu `>` mở, còn dấu `<` đóng nằm tận `<DropdownMenu>` trong khối `return`. Toàn bộ thân hàm
lọt vào giữa. Nó biến mất khi tôi sửa câu `console.error` — **nghĩa là nó chỉ tắt vì đoạn giữa
tình cờ hết dấu tiếng Việt, không phải vì bộ dò hết nhầm.** Bất kỳ hàm nào có kiểu trả về generic
đứng trên một khối JSX và có một chuỗi tiếng Việt ở giữa sẽ dựng lại đúng báo động này. Tôi
KHÔNG nới cổng để né nó; ghi ra để lane sau đọc thông báo lỗi mà không đi tìm nhầm chỗ.

### 5.2 `/reset-password` KHÔNG đọc mã ra khỏi URL — đo thắng thiết kế của tôi

Bản đầu của màn này đọc mã dùng một lần từ query string rồi phân hai nhánh (có mã thì hiện form,
không có mã thì hiện bảng "liên kết thiếu mã"). Đó là hình dạng mặc định của mọi luồng đặt lại
mật khẩu, và tôi viết nó mà không kiểm.

`src/security/rule-08-no-token-in-url.test.ts` bắt được, và cổng đó ĐÚNG: luật 8 của dự án cấm
mọi token đi qua query string, vì URL nằm trong lịch sử trình duyệt, trong log proxy, và trong
header `Referer`. Đã bỏ hẳn nhánh đó cùng hai khoá copy của nó — không có mã trên URL thì cũng
không có ca thiếu mã. Ngày backend lên, mã phải tới qua thân POST hoặc một cookie do chính đường
xử lý liên kết đặt.

**Một bẫy phụ đã dẫm và đã gỡ:** cổng luật 8 grep văn bản THÔ, kể cả chú thích. Đoạn chú thích
tôi viết để giải thích việc gỡ nhánh có chứa nguyên văn lời gọi đó, nên nó làm cổng đỏ lại lần
thứ hai. Đã diễn đạt lại không dùng cú pháp lời gọi.

### 5.3 Lỗi Better Auth không còn đi thẳng ra người dùng

Bản cũ hiện `authError.message` khi thư viện có gửi, chỉ rơi về câu tiếng Việt khi nó vắng mặt.
Message đó là chuỗi tiếng Anh (`Invalid email or password`), nằm ngoài `packages/copy`, nên không
cổng nào của P16 nhìn thấy nó và nó vi phạm luật 6 của design §5.

Nay message của thư viện vào `console.error`, người dùng luôn đọc `ErrorEntry`. **Cái mất được
nói ra:** một ca lỗi hiếm mà thư viện mô tả cụ thể hơn ta. **Cái được:** mọi câu người dùng đọc
đều đi qua một cổng. Nếu lead thấy đánh đổi này sai thì chỗ sửa là ánh xạ `authError.code` sang
khoá copy, không phải cho message đi thẳng ra.

### 5.4 Ba chuỗi mang U+2014 nằm sẵn trong `capacity.ts` và `capacity-indicator.tsx`

`capacity.ts` hai nhánh `low` và `capacity-indicator.tsx` nhánh số liệu cũ đều viết
`Sắp hết chỗ` rồi U+2014 rồi mệnh đề sau. Chúng vi phạm luật 3 của design §5 và đi lọt vì trước
P16 chưa cổng nào quét vùng này. Viết lại bằng dấu phẩy, không thay bằng một ký tự trông giống.
`capacity.test.ts` không đỏ vì các ô ở đó khẳng định bằng `toContain('sẽ bị từ chối')` chứ không
ghim cả câu — không phải may, mà là hình dạng khẳng định đúng.

### 5.5 Khung xác thực nằm ở `components/shell/**`

Bốn màn xác thực là bốn thư mục route rời nhau (App Router lấy thư mục làm URL). Nếu khung sống
trong một trong bốn thì ba màn kia phải import ngược vào thư mục của màn thứ tư, và cây phụ thuộc
đọc ra là "đăng ký phụ thuộc đăng nhập". `components/shell/**` là thư mục dùng chung DUY NHẤT
lane này sở hữu, và đã có tiền lệ cùng lý lẽ: `NarrowScreenNotice` sống ở đó để lane D1/D2 import
thay vì viết ba câu cảnh báo khác nhau.

### 5.6 Dấu thương hiệu vẽ `ARC_PATH_D` thẳng, không gọi `arcTrackProps()`

Bản đầu gọi `arcTrackProps({ role: 'control' })` rồi phủ `text-primary`. Không có tác dụng:
`arcTrackProps` ghim `stroke` sang `var(--input)` hoặc `var(--border)` theo §8.5, vì nó mô tả cái
RÃNH của một thanh tiến độ. Ở đây cung là dấu thương hiệu, không phải rãnh của gì, nên nó lấy
`currentColor`. Lớp lỗi này hỏng im lặng và trông như đã làm gì đó.

### 5.7 Logo PTIT dùng `<img>` chứ không `next/image`

`next/image` với SVG cần bật `dangerouslyAllowSVG` ở `next.config`, một quyết định ảnh hưởng mọi
lane để đổi lấy đúng một tài sản tĩnh 9KB. `alt=""` cộng `aria-hidden` vì tên sản phẩm đã do
`shell.brand.name` ngay bên dưới cấp.

---

## 6. Thứ KHÔNG tìm thấy, kèm phạm vi đã tìm

- **Primitive `Sheet` / `Drawer` trong `packages/ui`.** 0 hit khi đọc toàn bộ `packages/ui/src/index.ts`
  (106 dòng export). Ngăn kéo mobile vẫn dựng trên `Dialog` của Radix với lớp ghi đè, như bản 13.B.
  Đây là khoản nợ 13.B đã ghi, lane này KHÔNG mở rộng phạm vi để đóng nó.
- **Nơi tiêu thụ `apps/web/public/logo-ptit-mark.svg`.** Trước lane này: 0 hit trên toàn
  `apps/web/src/**` (chỉ một dòng nhắc tên file trong chú thích của `globals.css:56`). Lane 16.B
  là nơi đầu tiên dùng nó thật.
- **Backend đặt lại mật khẩu.** 0 route dưới `apps/web/src/app/api/auth/**` nhận yêu cầu đặt lại,
  và `authClient` không có lời gọi `forgetPassword`/`resetPassword` nào trong `apps/web/src`.
  Xác nhận đúng như plan mục 8 nói, không phải suy từ plan.

---

## 7. File đã chạm

**Sửa (9):** `packages/copy/src/surfaces/{shell,auth}.ts` ·
`apps/web/src/components/shell/{app-shell,user-menu,theme-toggle,narrow-screen-notice,capacity-indicator}.tsx` ·
`apps/web/src/components/shell/{nav,capacity}.ts` · `apps/web/src/app/login/{page,login-form}.tsx`

**Tạo (10):** `apps/web/src/components/shell/{auth-frame,auth-oauth,auth-failure}.tsx` ·
`apps/web/src/components/shell/copy-gate.test.ts` ·
`apps/web/src/app/register/{page,register-form}.tsx` ·
`apps/web/src/app/forgot-password/{page,forgot-password-form}.tsx` ·
`apps/web/src/app/reset-password/{page,reset-password-form}.tsx`

## 8. File CỐ Ý không chạm

| File | Vì sao |
|---|---|
| `components/shell/immersive-routes.ts` | 16.D độc quyền. Hai tiền tố `/labs` + `/lessons` là điều kiện sống của khoang lab |
| `components/session/immersive-routes.test.ts` | Không thuộc lane. Nó xanh, nên bất biến còn nguyên |
| `components/shell/{breakpoints,use-min-width}.ts` + hai file test của chúng | Logic có `e2e/responsive.spec.ts` đo tại đúng 768/769px. Không đổi logic nên không phải chuyển khẳng định nào |
| `components/shell/nav.test.ts` | Giữ nguyên bảy chuỗi VIẾT THẲNG sau khi `nav.ts` chuyển sang `t()`. Viết `toBe(t('shell.nav.lessons'))` là so bản đồ với chính nó, ô đó xanh với cả chuỗi rỗng |
| `components/shell/{capacity,initials,nav-icons}.test.ts` | Khẳng định cũ vẫn đúng từng chữ sau khi chuyển sang copy |
| `packages/copy/src/{registry,types,t,scan}.ts`, `surfaces/*` khác | File khoá của L0 |
| `app/layout.tsx`, `app/globals.css`, `packages/{ui,motion}/**` | L0 sở hữu |
| `e2e/**` | 16.I sở hữu. Ba màn xác thực mới cần vào `SCREENS` và `MIN_SCREENS` lên 32 |
| `/api/auth/logout` và mọi thứ dưới `server/**` | Ngoài lane; đường thu hồi refresh token giữ nguyên |

**Chú thích mang U+2014 trong `components/shell/**` KHÔNG bị quét sạch.** 14 file còn ký tự đó
trong chú thích (`breakpoints.ts`, `initials.ts`, `nav-icons.ts`, `use-capacity.tsx`, …). Luật 3
của design §5 nói về **câu văn người dùng đọc**, và cổng T1 của `packages/copy` đo đúng vùng đó.
Sửa 21 dấu gạch trong chú thích của những file tôi không có việc gì khác ở đó là sửa ngoài phạm
vi yêu cầu. Chỗ tôi có sửa (các khối đã chạm) thì đã sạch. Nếu lead muốn quét cả chú thích thì đó
là một lượt riêng và cần một cổng riêng, vì không có cổng nào đang đo nó.

---

## 9. Bàn giao cho 16.I

1. **Ba route mới vào `SCREENS`:** `/register`, `/forgot-password`, `/reset-password`. Cả ba là
   trang công khai, không cần cookie phiên.
2. **`/reset-password` không nhận query param nào.** Đừng viết ca test mở nó kèm `?token=…`: cổng
   luật 8 sẽ đỏ ở chính file e2e đó.
3. **Trạng thái "chưa bật" của hai màn mật khẩu là `role="status"`, không phải `role="alert"`.**
   Nếu ô a11y tìm `alert` thì nó sẽ không thấy.
4. **Cột trái của `AuthFrame` ẩn dưới 769px.** Ô quét 32 màn ở 390px sẽ thấy đúng thẻ form, không
   thấy `auth.frame.headline`.
