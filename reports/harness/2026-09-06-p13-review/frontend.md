# Rà soát đối kháng P13 — giao diện, trợ năng, ngôn ngữ, lệnh cấm thương mại

**Ngày:** 2026-09-06 · **Nhánh:** `feat/p13-frontend` · **Phạm vi:** `git diff feat/p12-scale-proof..HEAD` (384 file)
**Kỷ luật:** chỉ đọc, không sửa file mã nguồn nào. File này là deliverable cục bộ (`reports/` bị `.gitignore` chặn — cố ý, không commit).

---

## 0. Kết luận một dòng

Lệnh cấm thương mại: **sạch, không dương tính thật nào** — nhưng cổng gác nó mù với chuỗi tiếng Việt và không chạy trong CI.
Trợ năng: **ba lỗi hạng nặng còn sống**, cả ba đều thuộc đúng lớp "axe không bắt nổi", và cổng được dựng để bắt chúng đang **xanh trên chính lỗi nó gác**.

| Mức | Số | Mã |
|---|---|---|
| Nặng (phải sửa trước merge) | 3 | C1 C2 C3 |
| Quan trọng (sửa trước khi tích AC) | 4 | I1 I2 I3 I4 |
| Nhẹ / gợi ý | 4 | M1 M2 M3 M4 |

---

## 1. LỆNH CẤM THƯƠNG MẠI

### 1.1 Kết quả: KHÔNG có dương tính thật

Lệnh §5 bản 2026-09-06, chạy nguyên văn:

```
grep -rniE 'price|pricing|paywall|checkout|billing|invoice|stripe|paddle|sepay|entitlement|sku|subscription|is_paid|ispaid|gói cước|thanh toán|nâng cấp gói' \
  apps/web/src packages/ui/src packages/scenario/src packages/shared-types/src \
  | grep -viE 'checkoutcome|checkresultpanel' | grep -vE '\.test\.tsx?:' | grep -vE ':[0-9]+: *(\*|//|#)'
→ rỗng, exit 1 ✅
```

Bốn vùng lệnh §5 **không** quét, tôi soát tay, cũng sạch:

| Vùng | Kết quả |
|---|---|
| `apps/web/drizzle/**` (schema + 8 migration) | Chỉ 1 khớp: `0006_tricky_tyger_tiger.sql:4` — dòng chú thích **ghi lại chính lệnh cấm** ("KHÔNG price/sku/entitlement/is_paid, KHÔNG bảng enrollments…"). Dương tính GIẢ. |
| `apps/web/src/server/db/schema.ts` | Chỉ 2 khớp: `:694-695`, cùng dạng chú thích cấm. Dương tính GIẢ. Không cột `price`/`sku`/`entitlement`/`is_paid`/`currency`/`amount` nào. |
| `content/**` (bài học, lab, playground) | Rỗng. (1 "khớp" là file `.png` nhị phân — `content/scenarios/loxilb-tcp-load-balancing/assets/topology.png`, dương tính GIẢ của `grep` trên binary.) |
| `apps/web/e2e/**`, `packages/terminal/src` | Rỗng. |

Soát thêm tiếng Việt trên toàn `apps/web/src` + `packages/ui/src` với bộ từ rộng hơn
(`giá|phí|mua|gói|nâng cấp|premium|pro|trả tiền|đăng ký|VNĐ|đ/tháng|momo|vnpay|zalopay|hoá đơn|thẻ tín dụng`):
mọi khớp đều là **dương tính giả của tiếng Việt** — `giá trị`, `trả giá`, `đánh giá`, `phía`, `bàn phím`,
`đóng gói`, `gói tin`, `đăng ký tài khoản`. Không một chuỗi giao diện nào nói về tiền.

**22 màn hình D12 khớp đúng danh sách chốt, không thừa màn hình nào.** Kiểm từng `page.tsx`:
`/` `/login` `/lessons` `/lessons/[id]` `/labs` `/labs/[id]` `/playgrounds` `/playgrounds/[id]`
`/paths` `/paths/[id]` `/quiz` `/quiz/[id]` `/me` `/settings` `/author` `/author/[id]` `/author/new`
`/admin` `/admin/users` `/admin/sessions` `/admin/content` `/admin/audit` — 22/22 tồn tại, 0 route ngoài danh sách.

### 1.2 Nhưng cổng gác lệnh cấm CÓ LỖ — xem I2

Tóm tắt ở đây, chi tiết ở §3: (a) không job CI nào chạy lệnh này; (b) mẫu regex mù với
nhãn giá viết bằng tiếng Việt tự nhiên. Đối chứng dương tôi chạy (bơm dòng giả qua đúng
chuỗi lệnh, **không** đụng repo) cho thấy 4 trong 9 dòng paywall giả **lọt**:

| Dòng giả | Cổng bắt? |
|---|---|
| `const MONTHLY_PRICE_VND = 199000;` | ✅ bắt (`price`) |
| `createCheckoutSession()` | ✅ bắt (`checkout`) |
| `isPaid: boolean('is_paid')` | ✅ bắt |
| `<p>Nâng cấp gói để mở khoá bài học này</p>` | ✅ bắt (`nâng cấp gói`) |
| `<h1>Thanh toán</h1>` | ✅ bắt |
| `<p>Nâng cấp để mở khoá — 199.000đ/tháng</p>` | ❌ **LỌT** |
| `<p>Học phí trọn gói 1.500.000đ</p>` | ❌ **LỌT** |
| `<Button>Mua khoá học</Button>` | ❌ **LỌT** |
| `<p>Bản Pro — 99k/tháng</p>` | ❌ **LỌT** |

Ba bộ lọc trừ (`checkoutcome`, `.test.`, dòng chú thích) **không** nuốt dương tính thật nào —
phần đó của lệnh đúng. Lỗ nằm ở **mẫu bắt**, không ở bộ lọc.

Đề xuất bổ sung vào mẫu (không sửa, chỉ đề xuất cho lead):
`học phí|trả phí|mua khoá|mua goi|bản pro|đ/tháng|đ/năm|[0-9]{2,3}k/tháng|VNĐ|VND|nâng cấp(| gói| tài khoản)|mở khoá bằng`.

---

## 2. HẠNG NẶNG

### C1 — `--input` ở chế độ TỐI là **1.53:1**, không phải 4.01:1; và cổng gác nó đo sai không gian màu

**Vị trí**
- `apps/web/src/app/globals.css:106` — `--input: oklch(1 0 0 / 16%);`
- `apps/web/src/app/globals.css:67-70` — chú thích khẳng định "Nhánh `.dark` giữ nguyên 16%: nó đã cho 4.01:1 trên `--background` và 3.71:1 trên `--card` — đạt sẵn, không cần đụng."
- `packages/ui/src/theme/tokens.contract.test.ts:185-189` — hàm `resolve()`
- `docs/design-system.md` §1a — bảng in `4.01` và đoạn "Nhánh tối giữ nguyên `1 0 0 / 16%` — đã 4.01:1, không cần đụng"

**Cơ chế sai.** `resolve()` trộn alpha trên kết quả của `toLinearRgb()` — tức trong không gian
**linear-light**. CSS composite alpha trong **sRGB đã gamma-encode**. Hai chỗ này lệch nhau
rất lớn ở vùng tối. Số học 8-bit kiểm chứng được bằng mắt: `rgba(255,255,255,.16)` trên
`#0a0a0a` = `255×0.16 + 10×0.84 = 49.2` → `#313131`. Không trình duyệt nào cho ra màu tương
đương 4.01:1.

Tôi tính lại cả hai cách để chứng minh con số 4.01 đến từ đâu — nó khớp **chính xác**,
nên đây là lỗi công thức, không phải sai số:

| Cặp | test tính (linear) | Trình duyệt thật (sRGB) | Màu thật |
|---|---|---|---|
| `--input` trên `--background` | 4.01:1 | **1.53:1** ❌ | `#313131` trên `#0a0a0a` |
| `--input` trên `--card` | 3.71:1 | **1.63:1** ❌ | `#3c3c3c` trên `#171717` |
| `--input` trên `--muted` | — | **1.67:1** ❌ | `#494949` trên `#262626` |
| `--border` trên `--background` | 3.26:1 | **1.33:1** | `#272727` trên `#0a0a0a` |
| `--border` trên `--card` | 3.03:1 | **1.42:1** | `#333333` trên `#171717` |

(Nhánh SÁNG **đúng**: `--input: oklch(0.63 0 0)` = `#898989` cho **3.50:1** trên `--background`,
3.21:1 trên `--muted`, 3.03:1 trên `--accent`. Bản sửa lượt trước đạt, chỉ nửa tối bị bỏ lại.)

`--border` dưới ngưỡng ở cả hai theme là **quyết định đã ghi** (trang trí, SC 1.4.11 miễn trừ) —
không tính là lỗi. Nhưng con số `3.26`/`3.03` trong doc vẫn sai và cần sửa cùng lượt.

**Kịch bản hỏng.** Người học bật chế độ tối (hoặc máy đang `prefers-color-scheme: dark` với
tuỳ chọn mặc định `system`), mở `/login`. Ô Email và ô Mật khẩu là `<Input>` với
`border-input bg-background` — viền `#313131` trên nền `#0a0a0a`. Người dùng thấy **hai vùng
trống không có ranh giới**, phải rê chuột dò hoặc bấm bừa mới biết ô nhập ở đâu; chỉ khi focus
(ring xanh) mới hiện ra. Cùng hình dạng ở: `Textarea` (soạn bài `/author/[id]`), `SelectTrigger`
(ô lọc độ khó ở `/lessons`, `/labs`), `Checkbox` + `RadioGroupItem` (`/quiz/[id]`),
`Button variant="outline"` (nút "Thử lại", "Về đầu", "Làm mới" khắp `/admin`).
Sáu họ control này đều `bg-background` — cùng màu nền trang — nên viền là thứ **duy nhất**
tách chúng khỏi nền.

**Cổng: nếu thứ nó gác hỏng ngay bây giờ, nó có đỏ không? → KHÔNG.**
- axe không có luật contrast cho viền (chính doc cũng nói vậy, và đó là điều đúng).
- `tokens.contract.test.ts` là cổng DUY NHẤT cho SC 1.4.11, và nó **xanh** trên chính lỗi này.
- Đối chứng âm của chính nó (`:312-320`, "alpha ĐƯỢC đè lên nền") cũng **không cứu**: nó chỉ
  khẳng định `translucent < opaqueWhite / 2`, tức `4.01 < 9.48` — đúng, và đúng vô ích.
  Đối chứng đó chứng minh alpha *không bị bỏ qua*; nó không chứng minh alpha được trộn *đúng*.

**Chữa.** Sửa `resolve()` sang trộn trong sRGB gamma (encode → mix → decode), rồi để suite
tự đỏ và nâng token. Để đạt 3:1 trên `--background` với alpha trắng cần **≥ ~35%**
(đo: 30% → 2.59:1; 35% → 3.14:1; 40% → 3.77:1) — hoặc bỏ alpha, khai một giá trị đục như
nhánh sáng đã làm.

---

### C2 — Spinner trong nút `loading` là VÔ HÌNH; nút loading là một hình chữ nhật trống

**Vị trí**
- `packages/ui/src/button.tsx:74` — `!asChild && loading && 'relative text-transparent'`
- `packages/ui/src/button.tsx:121` — `<span aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-current">`
- `packages/ui/src/spinner.tsx:23` — `cn('animate-spin text-current', …)`
- `node_modules/.pnpm/lucide-react@1.40.0_*/dist/esm/defaultAttributes.mjs` — `fill: "none"`, `stroke: "currentColor"`

**Cơ chế.** `text-transparent` đặt `color: transparent` trên root nút. `text-current` =
`color: currentColor` = **giá trị đang kế thừa** = `transparent`. `Loader2` của lucide tô bằng
`stroke="currentColor"` và `fill="none"` ⇒ nét trong suốt, không có mảng đặc nào thay thế.
Kết quả: nhãn bị giấu (đúng ý đồ) **và** spinner cũng bị giấu (ngoài ý đồ).

Đây đúng là hình dạng lỗi lượt trước tuyên bố đã sửa — bản sửa mới chỉ đóng **nhánh `asChild`**
(nhánh không render Spinner). Nhánh nút thường, nơi có toàn bộ 37 call site, vẫn nguyên.

**Kịch bản hỏng.** `apps/web/src/app/login/login-form.tsx:145` —
`<Button type="submit" loading={pending}>`. Người dùng bấm "Đăng nhập" trên đường mạng chậm:
chữ "Đăng nhập" biến mất, không có spinner, nút thành một ô xanh trơn. Người dùng không biết
mình bấm trúng hay hệ thống đang chạy, và phản xạ tự nhiên là bấm lại. Cùng hình dạng ở
`quiz/[id]/quiz-client.tsx:200` (nộp bài), `labs/[id]/lab-client.tsx:287` (chấm task),
`components/session/session-controls.tsx:109` (bắt đầu phiên — nút quan trọng nhất của sản phẩm),
`me/password-form.tsx:159`, `author/publish-panel.tsx:66`, `admin/health-panel.tsx:119`, …
(37 chỗ `loading=` trong `apps/web/src`).

**Cổng: có đỏ không? → KHÔNG.** `packages/ui/src/button.test.tsx` chỉ khẳng định Spinner **có
mặt trong DOM** (`screen.getByRole('status', { name: 'Đang tải', hidden: true })`). jsdom không
nạp CSS Tailwind nào, nên không phép kiểm nào ở đó có thể thấy màu. Cùng lớp mù với C1: cổng
kiểm cấu trúc, lỗi nằm ở màu.

**Chữa (gợi ý).** Cho wrapper spinner một màu tường minh không phụ thuộc `currentColor` — ánh xạ
theo `variant` (`text-primary-foreground` / `text-secondary-foreground` / `text-foreground` …) —
hoặc bỏ `text-transparent` và bọc riêng `children` trong `<span className="invisible">`
(giữ nguyên bề rộng, không đụng `color` của cây con).

---

### C3 — Vòng focus cùng màu với nền nút: `--ring` ≡ `--primary`, cộng `ring-offset-0`

**Vị trí**
- `apps/web/src/app/globals.css:39` + `:73` — sáng, `--primary` và `--ring` **cùng** `oklch(0.546 0.215 262.881)`
- `apps/web/src/app/globals.css:91` + `:107` — tối, cùng `oklch(0.685 0.169 262.881)`
- `packages/ui/src/button.tsx:14` — `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0`

**Số đo**

| Cặp kề nhau | Sáng | Tối |
|---|---|---|
| ring vs **nền nút primary** | **1.00:1** ❌ | **1.00:1** ❌ |
| ring vs **nền nút destructive** | **1.09:1** ❌ | **1.00:1** ❌ |
| ring vs nền nút secondary | 4.74:1 ✅ | 5.23:1 ✅ |
| ring vs `--background` (phía ngoài) | 5.17:1 ✅ | 6.85:1 ✅ |

**Kịch bản hỏng.** Người dùng chỉ dùng bàn phím Tab qua `/login`. Khi focus tới nút "Đăng nhập"
(`variant="primary"` mặc định), vòng focus 2px được vẽ **sát mép nút** (`ring-offset-0`) và mang
đúng màu nút. Thị giác nhận được: nút **to thêm 2px**, không đổi màu, không đổi hình. Với nút
destructive ("Kết thúc phiên", "Xoá") ở chế độ tối thì ring xanh trên nền đỏ cho 1.00:1 — cùng
độ chói, mắt không tách được. Vòng vẫn tương phản với nền **trang** (5.17/6.85) nên không mù
tuyệt đối, nhưng dấu hiệu focus mà chỉ đổi kích thước là dấu hiệu dễ trượt nhất — và ô AC
13.H mục 25 đòi "đi hết luồng chính bằng Tab/Enter".

**Cổng: có đỏ không? → KHÔNG.**
axe không có luật nào đo contrast của chỉ báo focus. Và `NON_TEXT_PAIRS`
(`tokens.contract.test.ts:274-281`) đo `--ring` với `--background` và `--card` — **đúng hai cặp
luôn đạt** — mà bỏ qua `--ring`/`--primary` và `--ring`/`--destructive`, chính hai cặp thật sự
kề nhau khi nút được focus. Đây là "đo sai population" của `green-that-proves-nothing`.

**Chữa (gợi ý).** `focus-visible:ring-offset-2 focus-visible:ring-offset-background` — chèn một
vành nền 2px giữa nút và ring, để ring luôn tựa vào `--background` (cặp 5.17/6.85 đã đạt).
Hoặc tách `--ring` ra một sắc khác `--primary`. Và thêm hai cặp trên vào `NON_TEXT_PAIRS`.

---

## 3. QUAN TRỌNG

### I1 — `Switch` ở trạng thái TẮT gần như vô hình ở chế độ tối

`packages/ui/src/switch.tsx:13` (rãnh `bg-input`) · `:23` (núm `bg-background`).

| Cặp (chế độ TỐI) | Tỉ lệ | Ngưỡng |
|---|---|---|
| rãnh `bg-input` vs `--background` | **1.53:1** ❌ | 3.0 |
| rãnh `bg-input` vs `--card` | **1.63:1** ❌ | 3.0 |
| núm `bg-background` vs rãnh (trên nền `--background`) | **1.53:1** ❌ | 3.0 |
| núm `bg-background` vs rãnh (trên nền `--card`) | **1.80:1** ❌ | 3.0 |

(Chế độ sáng đạt cả bốn: 3.50:1. Trạng thái BẬT đạt cả hai theme: 5.17–6.85:1.)

**Kịch bản.** Vào `/settings` ở chế độ tối, khối tuỳ chọn, hàng "hiện tên trên bảng xếp hạng"
(`apps/web/src/components/me/preferences-form.tsx:160`). Công tắc TẮT là một vệt xám mờ trên
nền tối, và núm trắng-đáng-lẽ lại là `bg-background` = gần đen, tức **cùng màu với nền trang**.
Người dùng không đọc được trạng thái hiện tại; cách duy nhất để biết là bấm thử rồi xem có gì
đổi — trên một tuỳ chọn về **quyền riêng tư** (hiện tên thật ra bảng xếp hạng công khai).
Cùng lỗi ở `components/author/draft-meta-fields.tsx:223` và `components/author/phase-fields.tsx:101`.

Trạng thái của một control biểu đạt bằng đồ hoạ ⇒ SC 1.4.11 áp dụng. axe không đo.
⚠ Sửa C1 sẽ tự sửa **rãnh**, nhưng **không** sửa cặp núm-vs-rãnh — phải đo lại sau khi sửa.

### I2 — Không cổng CI nào chạy hai lệnh grep của §5

`.github/workflows/ci.yml` có 8 job: `proto`, `ts`, `go`, `infra`, `secret-scan`, `sandbox-image`,
`terminal-browser`, `web-a11y`. Grep `price|paywall|thương mại|slate-|#[0-9a-f]` trên file này → **0 kết quả**.

Cả lệnh cấm thương mại lẫn lệnh token màu **chỉ chạy khi có người nhớ chạy tay** ở đợt 3.
Hôm nay cả hai rỗng; ngày mai một commit thêm màn hình giá hoặc một `#f5f5f5` trần sẽ không
làm gì đỏ. Cộng thêm lỗ mẫu regex ở §1.2, một trang bán khoá học viết bằng tiếng Việt tự nhiên
đi lọt cả hai lớp.

Ba test **có** gác tiếng Việt, nhưng phạm vi rất hẹp và cả ba đều tự ghi chú điều đó:
- `apps/web/src/components/shell/nav.test.ts:31-34` — chỉ nhãn + href của `PRIMARY_NAV`
- `apps/web/src/components/shell/capacity.test.ts:81-86` — chỉ output của `describeCapacity`
- `apps/web/src/server/trpc/routers/quiz-paths-input.test.ts:74-78` — chỉ 5 tên field, chỉ router quiz/paths

Không có gì gác chuỗi giao diện của 22 màn hình, và không có gì gác schema DB ngoài chú thích.

### I3 — Lỗi `UNAUTHORIZED` lộ nguyên chuỗi tiếng Anh ra giao diện

- `apps/web/src/server/trpc/init.ts:117` — `throw new TRPCError({ code: 'UNAUTHORIZED' });`
  Đây là chỗ **duy nhất** trong 94 lần `new TRPCError` của `apps/web/src/server` thiếu `message`.
- `@trpc/server@11.18.0`, `dist/tracked-DWInO6EQ.mjs:43` —
  `message = opts.message ?? cause?.message ?? opts.code` ⇒ `message === 'UNAUTHORIZED'`.
- `apps/web/src/lib/trpc.ts:38-49` — `describeTrpcError` trả `error.message` nguyên văn.
- `apps/web/src/lib/trpc-react.tsx` — không có handler UNAUTHORIZED toàn cục; chỉ
  `lib/session-reason.ts:57` xử riêng cho luồng phiên sandbox.

**Kịch bản.** Người học để tab `/me` mở qua đêm, cookie phiên hết hạn. Sáng dậy bấm làm mới danh
sách. `me.get` trả UNAUTHORIZED. Màn hình hiện `ErrorState`:

> **Không tải được dữ liệu**
> UNAUTHORIZED Bấm Thử lại; nếu vẫn lỗi, kiểm kết nối tới cơ sở dữ liệu.

Ba lỗi trong một câu: chuỗi tiếng Anh giữa giao diện tiếng Việt; không nói *chuyện gì xảy ra*
(phiên đăng nhập hết hạn); và chỉ **sai việc phải làm** (việc đúng là đăng nhập lại, không phải
kiểm cơ sở dữ liệu). Cùng đường đi ở mọi màn `/admin/*`, `/author/*` và ba danh mục.

Chữa: đặt `message: 'Phiên đăng nhập đã hết hạn — đăng nhập lại để tiếp tục.'` tại `init.ts:117`,
và/hoặc cho `describeTrpcError` ánh xạ `trpcErrorCode()` → câu tiếng Việt trước khi rơi về `message`.

### I4 — `docs/design-system.md` §1a in lại con số sai, biến lỗi thành "quyết định đã cân nhắc"

Bảng §1a: `--input / --background` cột **Tối = 4.01**; `--border / --background` cột **Tối = 3.26**.
Số thật: **1.53** và **1.33**. Đoạn văn ngay dưới bảng: *"Nhánh tối giữ nguyên `1 0 0 / 16%` —
đã 4.01:1, không cần đụng."*

Đây là chỗ nguy hiểm hơn cả bản thân C1: người rà tiếp theo đọc doc, thấy nhánh tối **đã được đo
và kết luận đạt**, và sẽ không đo lại. Cùng câu sai nằm ở `globals.css:69-70`. Sửa C1 phải sửa
cả ba nơi (test, doc, chú thích) trong cùng một thay đổi.

---

## 4. NHẸ / GỢI Ý

### M1 — `asChild` + `disabled` vẫn kích hoạt được bằng bàn phím (tiềm ẩn)

`packages/ui/src/button.tsx:86` khoá bằng `pointer-events-none` + `aria-disabled`. Cả hai đều
**không** chặn `Enter` trên một `<a href>` đang focus, và link vẫn nằm trong thứ tự Tab (không
`tabIndex={-1}`, không gỡ `href`). Người dùng chuột bị chặn, người dùng bàn phím thì không —
bất đối xứng cố hữu của `aria-disabled` dùng một mình.

Hiện **chưa có call site nào** dùng `asChild` kèm `disabled`/`loading` (28 chỗ `asChild` trong
`apps/web/src`, không chỗ nào kèm) ⇒ tiềm ẩn, chưa hỏng. Nhưng `button.test.tsx:163-180` khẳng
định "đã khoá", nên người dùng API tiếp theo sẽ tin là xong.

### M2 — axe chỉ chạy ở chế độ SÁNG

`apps/web/e2e/*.ts` không đặt `localStorage['dlp.theme']`, không thêm class `dark`
(grep `dlp.theme|'dark'|classList` trên toàn `apps/web/e2e` → 0 kết quả). Cả 22 màn hình
của `a11y.spec.ts` đo ở theme mặc định.

Nghĩa là contrast **chữ** ở chế độ tối không có cổng runtime nào; chỉ còn `tokens.contract.test.ts`
tĩnh — mà mọi cặp có alpha của nó đang sai (C1). Hôm nay tôi đo lại: mọi cặp chữ ở chế độ tối
đều đạt (thấp nhất `--muted-foreground`/`--muted` = 5.83:1), nên đây là **lỗ hổng cổng, chưa
phải lỗi**. Gợi ý: chạy `a11y.spec.ts` hai lượt (`light` + `dark`) qua `test.describe` tham số hoá.

### M3 — Chú thích đã lỗi thời, và chú thích viện dẫn cơ chế đã bị bác

- `apps/web/src/components/shell/app-shell.tsx:41-48` liệt kê "Sáu file còn render `<main>` của
  riêng chúng (2026-09-06)". **Đã sửa hết**: `grep -rn "<main" apps/web/src` chỉ còn
  `app-shell.tsx:79` (ngoài các dòng chú thích). Để nguyên sẽ khiến lượt rà sau đi tìm một lỗi
  không còn tồn tại.
- `components/catalog/catalog-page.tsx:11`, `labs/[id]/lab-client.tsx:338`,
  `quiz/[id]/quiz-client.tsx:366`, `author/layout.tsx:24`, `components/admin/admin-section.tsx:8`
  vẫn viết "hai `<main>` lồng nhau **làm axe của 13.H đỏ** `landmark-unique`". Cơ chế đó đã bị
  chính exec plan §C6bis bác (axe xếp `moderate`; cổng mục 25 chặn `serious/critical`). Thứ thực
  sự enforce là `apps/web/e2e/a11y.spec.ts:41` (`MUST_NOT_FIRE`). Đây đúng bài học mà C6bis tự
  ghi: "một lý lẽ đúng kết luận nhưng sai cơ chế sẽ đẻ ra niềm tin rằng đã có ai đó gác".

### M4 — `landmark-contract.test.ts` không quét `packages/**`

`apps/web/src/components/session/landmark-contract.test.ts:63` neo `srcRoot` vào `apps/web/src`
và chỉ đọc `.tsx`. Một component chung trong `packages/ui` dựng `<main>` sẽ lọt. Đã kiểm hôm nay:
`packages/ui/src` và `packages/terminal/src` không có `<main>` nào ⇒ gợi ý mở rộng phạm vi,
không phải lỗi đang sống.

---

## 5. ĐÃ KIỂM VÀ ĐẠT (để lượt sau không kiểm lại)

| Hạng mục | Bằng chứng |
|---|---|
| **Token màu là nguồn duy nhất** | Lệnh §5 rỗng trên `apps/web/src` + `packages/ui/src` (`--include=*.tsx`). Không hex, không `slate/gray/zinc/neutral` trần. |
| **C6bis — đúng một `<main>`** | `app-shell.tsx:79`, `<main id="noi-dung" tabIndex={-1}>`; skip-link `#noi-dung` ở `:71-81`. Cổng tĩnh `landmark-contract.test.ts` có **đối chứng dương** (vỏ phải có đúng 1) + **đối chứng tập-rỗng** (>10 file) + kiểm vi phạm ⇒ **sẽ đỏ thật** nếu một route dựng `<main>`. |
| **Font D3** | `layout.tsx:34-39` — `Be_Vietnam_Pro`, `subsets: ['latin','vietnamese']`, weight 400/500/600/700, `display:'swap'`, `variable`. `<html lang="vi">` (`:79`). Fallback stack thật ở `globals.css:162-164` (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`), có test cấm Poppins (`tokens.contract.test.ts:241`). Subset `vietnamese` phủ dấu nặng/ngã/ơ/ư; `next/font` tự host ⇒ `font-src 'self'` không đổi. |
| **Responsive ≤768px** | `breakpoints.ts` tách ba hằng có nghĩa khác nhau (1280 / 768 / 1024) và dùng biến thể tuỳ ý `min-[769px]:` thay `md:` (vì `md:` = `min-width:768px`, lệch một pixel so với "≤768px thu vào ngăn kéo"). `NarrowScreenNotice` dùng chung cho cả ba trình học. `useMinWidth` trả `null` khi chưa đo ⇒ không hydration mismatch. |
| **Giọng tiếng Việt** | 93/94 `TRPCError` có message tiếng Việt (ngoại lệ duy nhất = I3). Mọi `ErrorState`/`Alert` đều nối câu "làm gì tiếp" (`audit-client.tsx:80`, `content-client.tsx:122`, `sessions-client.tsx:84`, `health-panel.tsx:83`, `profile-form.tsx:99`). `CatalogError` còn tách **hai** lối thoát theo **hai** nguyên nhân (thử lại vs. về đầu khi cursor hỏng). |
| **Trạng thái đủ bộ** | `EmptyState`/`ErrorState`/`Skeleton`/`Spinner`/`Alert` đều export từ `packages/ui`; 25 file dùng. `Input`/`Textarea`/`Select`/`Checkbox`/`Radio`/`Switch`/`Tabs` đều có `disabled:` tường minh; `Label` có `peer-disabled:`. (Lỗ duy nhất = C2, ở nhánh `loading` của `Button`.) |
| **D10 — thoát terminal bằng bàn phím** | `packages/terminal/src/terminal-surface.tsx:253` `role="application"` + `tabIndex={0}` + `aria-label`; nhãn tự nêu đường thoát (`terminal-pane.tsx:25`). Gợi ý "Esc Esc" **luôn hiện**, chỉ đậm lên khi focus (`terminal-pane.tsx:69-71`) — cố ý, để không đổi chiều cao khoang và bắn `ResizeObserver` của xterm. Có test browser-mode thật (`terminal-escape.browser.test.tsx`): Esc đơn KHÔNG gọi callback, Esc-Esc gọi đúng một lần, cả hai byte vẫn đi tới shell. |
| **22 màn hình D12** | 22/22 `page.tsx` tồn tại; 0 route ngoài danh sách; `/dashboard` + `/session` đã gộp về `/me`. |
| **`a11y.spec.ts` thiết kế tốt** | `:41` `MUST_NOT_FIRE = ['landmark-unique','landmark-no-duplicate-main','landmark-one-main']` — bổ khuyết đúng chỗ ngưỡng serious/critical bỏ lọt; `:115-124` có ô chống-xanh-vì-không-chạy. |

---

## 6. Thứ tự đề nghị cho lead

1. **C1** trước tất cả — vì nó kéo theo I1 (rãnh Switch) và I4 (doc), và vì cổng của nó đang
   nói dối nên mọi kết luận contrast ở chế độ tối hiện đều không đáng tin. Sửa `resolve()`
   **trước**, để suite tự chỉ ra còn cặp nào hỏng thay vì tin bảng trong doc.
2. **C2** — một dòng class, 37 call site hưởng lợi, và là nút "Bắt đầu phiên".
3. **C3** — một dòng class (`ring-offset-2 ring-offset-background`) + hai dòng thêm vào `NON_TEXT_PAIRS`.
4. **I3** — một dòng `message:`.
5. **I2** — thêm một step vào job `ts` của CI chạy hai lệnh §5 (mẫu đã mở rộng theo §1.2).
6. **I1** sau khi C1 xong: đo lại riêng cặp núm-vs-rãnh, C1 không tự sửa nó.
7. **M3** dọn chú thích cùng lượt với bất kỳ file nào đã mở ở trên.

**Không có** thay đổi mã nguồn nào được thực hiện trong lượt rà này.
