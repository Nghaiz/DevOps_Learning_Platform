# Lane 16.I — cổng nghiệm thu Phase 16

**Nhánh:** `feat/p16-i-gates` · **nền:** `8e5b2af` (đã gộp tám lane) · **worktree:** `D:/NCKH/wt-p16-i`
**Ngày:** 2026-09-11 · **Sở hữu:** `apps/web/e2e/**` (không sửa một dòng mã sản phẩm nào)

---

## 1. Bảng 11 ô nghiệm thu §7 của `phase-16.md`

Quy ước: **ĐẠT** = có số đo hoặc lượt chạy đứng sau. **KHÔNG ĐO ĐƯỢC** = harness đã sẵn nhưng
lượt chạy chưa xảy ra, hoặc phép đo không kết luận được — và lý do ghi ngay tại ô.

Một ô ghi ĐẠT mà không có bằng chứng thì không có giá trị, nên cột bằng chứng là bắt buộc.

| # | Ô nghiệm thu | Kết quả | Bằng chứng / lý do |
|---|---|---|---|
| 1 | `SCREENS` phủ 32 màn, `MIN_SCREENS` = 32, 0 lỗi axe serious/critical trên mọi màn | **KHÔNG ĐẠT** | `SCREENS.length === 32`, `MIN_SCREENS = 32` ✓ (`70e8005`). Nhưng axe tìm thấy **1 lỗi mức serious** trên `/paths/:id` — `color-contrast`, chi tiết ở §7.1. Ngoài ra 11 màn vai-trò SKIP và `/problems/:code` KHÔNG MỞ ĐƯỢC (danh mục rỗng, §7.3). Đo được: 21 pass / 2 fail / 12 skip. |
| 2 | `csp.spec.ts` xanh trên 32 màn, không nới một chỉ thị CSP nào | **ĐẠT (có điều kiện)** | **0 vi phạm CSP** trên mọi màn mở được: 25 pass / 1 fail / 11 skip — và ô đỏ duy nhất là `/problems/:code` KHÔNG MỞ ĐƯỢC (§7.3), không phải một vi phạm CSP. Không một chỉ thị nào bị nới: `git diff 8e5b2af..HEAD -- apps/web/e2e/csp.spec.ts` **rỗng**, và lane không chạm mã sản phẩm. Điều kiện còn thiếu: 11 màn vai-trò chưa đo. |
| 3 | `KEYBOARD_SCREENS` ≥ 10, gồm `/labs/:id` và `/lessons/:id`, có ca thoát focus khỏi terminal | **ĐẠT (mã) · CHƯA CHẠY** | `KEYBOARD_SCREENS.length === 10`, `MIN_KEYBOARD_SCREENS = 10`, kèm phép kiểm theo DANH TÍNH (`REQUIRED_KEYBOARD_PATHS`) chứ không chỉ theo số lượng. Ca thoát focus đã có sẵn từ 13.H: `test.describe('D10 — thoát terminal bằng Esc Esc')`, ô `Esc ĐƠN vẫn tới PTY, và Esc Esc rời khỏi terminal`. ⚠ Ô D10 đó cần **phiên sandbox thật** nên nó `skip` ở môi trường cục bộ — xem §6.2. |
| 4 | Grep màu trần rỗng trên `apps/web/src` và `packages/ui/src`, trừ `packages/terminal/src/**/themes.ts` | **ĐẠT** | `node scripts/check-design-tokens.mjs` → `exit=0`, quét **562 file / 4 vùng**, 4 file miễn trừ có ghi lý do. Kèm đối chứng **hai chiều** của chính script: bắt đủ 13 mẫu bẩn, không kêu trên 20 mẫu sạch. |
| 5 | Test contrast tính lại mọi token PTIT, trộn alpha trong sRGB mã hoá gamma | **ĐẠT** | `packages/ui/src/theme/tokens.contract.test.ts`, chạy trong lượt `turbo run test --force` (ui: 872/872 xanh, 0 skip). |
| 6 | `packages/copy`: 0 ký tự `—`, 0 chuỗi mất dấu; cùng phép kiểm mất dấu chạy trên `content/**` | **ĐẠT** | `packages/copy/src/copy.contract.test.ts` + `scan.control.test.ts` (đối chứng của chính bộ dò), copy: 52/52 xanh. |
| 7 | Hợp đồng bốn trạng thái xanh, kèm đối chứng dương | **ĐẠT** | `packages/ui/src/badge.test.tsx` + `apps/web/src/components/admin/content-row.test.ts`, xanh trong lượt ép. |
| 8 | Test bất biến terminal: cùng node cha qua đổi tab; hàng editor vắng mặt vẫn render kèm `hidden` và không mang tiện ích `display` | **ĐẠT** | `packages/terminal/src/terminal-core.browser.test.tsx`, terminal: 133/133 xanh. |
| 9 | Test đối chiếu icon `ResourceKind` giữa `packages/ui` và arena | **ĐẠT** | `packages/ui/src/resource-icon.contract.test.ts` + `exports.contract.test.ts`, xanh. |
| 10 | Ngân sách LCP mới cho `/`, có số đo thật trong chú thích | **ĐẠT** | Đo được **152ms** trên `/` và **360ms** trên `/lessons` trong CÙNG một lượt chạy, cùng máy, cùng build. Bảng đầy đủ ở §3. Ngân sách ghi vào `perf.spec.ts` kèm số đo. |
| 11 | `pnpm -w turbo run build lint typecheck test` xanh | **ĐẠT** | `Tasks: 32 successful, 32 total` · `Cached: 0 cached, 32 total` · `1m33.041s`. Bảng tổng từng gói ở §2. |

**9 ĐẠT · 1 KHÔNG ĐẠT (ô 1) · 1 ĐẠT-nhưng-chưa-chạy (ô 3).**

Ô 1 là ô **KHÔNG ĐẠT** thật, không phải "chưa đo": lượt quét đã chạy và tìm thấy một lỗi axe mức
serious. Ô 2 ĐẠT về đúng thứ nó khẳng định (0 vi phạm CSP, 0 chỉ thị bị nới) nhưng chưa phủ hết
11 màn vai-trò. Ô 3 có mã và có phép kiểm danh tính, nhưng `keyboard.spec.ts` chưa chạy trong
phiên này — nên nó là ĐẠT về mã, chưa phải ĐẠT về hành vi.

**Hai lỗi sản phẩm THẬT bắt được, cả hai ghi ở §7.**

---

## 2. Ô 11 — cổng turbo, lượt ÉP chạy

```
Tasks:    32 successful, 32 total
Cached:    0 cached, 32 total
Time:     1m33.041s
```

Đọc `Tasks: 32/32` TRƯỚC mọi con số dưới đây: turbo dừng sau task đỏ, nên một lượt `29/32` sẽ để
lại các suite phía sau CHƯA CHẠY và mọi con số trích ra từ nó là con số về một suite không tồn tại.
Lượt này 32/32 nên bảng dưới nói về toàn bộ cây.

| Gói | File | Test | Nền (brief) | Δ |
|---|---|---|---|---|
| web | 149 | 1750 | 1750 | 0 |
| ui | 34 | 872 | 872 | 0 |
| games | 25 | 402 | 402 | 0 |
| scenario | 17 | 285 | 285 | 0 |
| terminal | 6 | 133 | 133 | 0 |
| motion | 4 | 110 | 110 | 0 |
| copy | 2 | 52 | 52 | 0 |
| shared-types | 3 | 48 | 48 | 0 |
| **tổng** | **240** | **3652** | **3652** | **0** |

**Zero đỏ, zero skip.** Tổng khớp đúng con số nền trong brief (3652), nên không có ô nào lặng lẽ
biến mất — đúng lớp lỗi mà lượt 16.G1 đã dính (71 ô skip kéo tổng 1695 → 1659, trong khi cột
passed/failed vẫn trông ổn).

⚠ **Một lệch nhỏ, ghi ra chứ không lờ đi:** brief ghi nền là `web 1750 (148 file)`; lượt này đếm
**149 file** với đúng 1750 test. Số test khớp tuyệt đối nên không có ô nào mất hay thêm; chênh
lệch nằm ở phép đếm FILE. `apps/web/e2e/**` không nằm trong `include` của vitest nên năm file
e2e mà lane này sửa không thể là nguyên nhân. Chưa truy ra, và nó không ảnh hưởng kết luận nào ở
trên — nhưng đừng chép lại con số 148 như thể nó đã được xác nhận.

---

## 3. Ô 10 — ngân sách LCP cho `/`

Đo bằng chính `perf.spec.ts`, ba lớp của nó đều xanh trước khi con số được nhận:

| lớp | kết quả |
|---|---|
| tiền đề — trình duyệt hỗ trợ `largest-contentful-paint` | ✓ |
| đối chứng dương — tiêm 2000ms trễ thì LCP phải tăng theo | ✓ nền **380ms** → chậm **2544ms**, chênh **2164ms** trên 2000ms tiêm |
| phép đo thật | ✓ |

Số đo, cùng lượt chạy · cùng máy · cùng build:

| màn | LCP | TTFB | sau TTFB | phần tử LCP |
|---|---:|---:|---:|---|
| `/` | **152ms** | 43ms | 109ms | `<h1>` «Học DevOps bằng cách gõ lệnh thật» |
| `/lessons` | **360ms** | 22ms | 338ms | `<h3>` «CKAD: ConfigMap as Files…» |

**Tỉ số `/` ÷ `/lessons` = 0.42.** Đó là con số mang nghĩa qua các môi trường; con số tuyệt đối
thì không, và §3 này tồn tại để nói ra điều đó.

### ⚠ Hai ngân sách này KHÔNG đo trên cùng một máy — và vì sao vẫn so được

`LCP_BUDGET_MS` (2500) của `/lessons` đo trên **cụm lab** ngày 2026-09-07 với ảnh `dlp-web:p13a`.
Số ở bảng trên đo bằng `next start` **cục bộ**, vì bản frontend P16 (tám lane, gộp 2026-09-11)
**chưa được deploy lên cụm**: chạy suite lên cụm là đo một binary khác hẳn cái vừa build, và
`/register`, `/problems`, `/games` ở đó còn trả 404.

Brief yêu cầu "đo trong CÙNG môi trường mà `perf.spec.ts` đang đo". Cách duy nhất thoả được yêu
cầu đó khi cụm chạy mã cũ là **đo lại CẢ HAI trong cùng một lượt** — và đó là điều đã làm. Hai
dòng trong bảng trên đến từ một lượt `npx playwright test perf.spec.ts` duy nhất.

### Vì sao ngân sách của `/` để ở 2500ms chứ không siết xuống theo số đo

152ms là **6.1%** ngân sách. Một ngưỡng mà phép đo không bao giờ tới gần là trang trí, và ô
`ngân-sách-quá-thưa` trong `perf.spec.ts` sẽ tự khai điều đó ra report mỗi lượt chạy.

Vẫn giữ 2500 vì siết theo số đo cục bộ là dựng một cổng đỏ ngay lần deploy đầu: cụm lab là một VM
một node, TTFB ở đó đo được 739ms lúc nguội so với 43ms ở đây — chênh **17 lần** chỉ riêng phần
mạng+server, phần mà mã frontend không có tiếng nói. Một ngân sách 400ms sẽ đỏ vì hạ tầng và
không bao giờ đỏ vì thứ nó định gác.

**Điều kiện kết thúc, ghi ra để nó không nằm chờ ai nhớ:** khi P16 lên cụm, đo lại `/` ở đó và
siết ngân sách theo lượt NGUỘI của cụm, không theo lượt ấm và không theo máy dựng.

### Bàn giao 16.E được gác, không chỉ được tin

"Canvas không được là phần tử LCP" — `perf.spec.ts` khẳng định `lcpElement.tag !== 'canvas'`, và
lượt đo trả về `<h1>`. Ô này không phải phép đo hiệu năng thứ hai; nó là điều kiện để con số 152ms
có nghĩa. LCP của canvas đo thời điểm WebGL vẽ khung đầu; LCP của khối chữ hero đo thời điểm người
dùng đọc được trang. Hai đại lượng khác nhau đội cùng một tên, và chỉ cái sau là thứ ngân sách gác.

---

## 4. §16.I mục 5 — ba ô chỉ đo được trong trình duyệt thật

Cả ba **ĐẠT**, mỗi ô kèm đối chứng. File: `apps/web/e2e/motif.spec.ts` (mới, commit `ac7ea70` +
`c8a2fbe`). Lượt chạy: 8/8 xanh.

### 4.1 §8.1 — khe hở nằm đúng phía ✅

Đo bằng chính bộ máy hình học của trình duyệt (`getPointAtLength` trên `SVGGeometryElement`), KHÔNG
bằng cách phân tích chuỗi `d`. Đó là điểm mấu chốt: cái sai mà §8.1 sợ nhất — dấu của
`x-axis-rotation` trong lệnh `A` — nằm ở chỗ SVG đo góc theo kim đồng hồ còn `--arc-tilt` khai
theo quy ước toán học. Một bộ phân tích tự viết sẽ tái tạo đúng cách hiểu của người viết nó, tức
đồng ý với cái sai. Chỉ trình duyệt mới là trọng tài.

| đại lượng | đo được | kỳ vọng |
|---|---:|---:|
| khoảng cách gần nhất từ nét vẽ tới tâm khe hở `(61.24, 22.18)` | **21.382** | ≥ 15 (số học dự đoán 21.4) |
| khoảng cách gần nhất từ nét vẽ tới điểm đối xứng `(38.76, 77.81)` — **đối chứng âm** | **0.0048** | ≤ 0.5 |
| đầu cung | `(40.262, 18.044)` | `(40.26, 18.04)` |
| cuối cung | `(79.203, 33.778)` | `(79.20, 33.78)` |
| `viewBox` | `0 0 100 100` | — |
| `transform` trên `<path>` và trên `<svg>` | `none` / `none` | `none` |

Vế đối chứng chạy TRƯỚC vế chính, có chủ ý: nếu không có nét vẽ nào, câu "không có nét gần tâm khe
hở" xanh một cách vô nghĩa — nó cũng xanh trên một `<path>` rỗng.

Cả bốn bề mặt motif vẽ cùng hằng `ARC_PATH_D`, nên hình học đo một lần là đúng cho cả bốn — với
điều kiện không ai phủ `transform` lên phần tử cung, và hai dòng cuối bảng gác đúng điều đó.

### 4.2 AC-7 — reduced-motion ép transition về 0.01ms ✅

| lượt | `transition-duration` của cung |
|---|---:|
| `reducedMotion: 'no-preference'` — **đối chứng** | **320ms** (= `--motion-slow`) |
| `reducedMotion: 'reduce'` | **0.01ms** |

Vế đối chứng là thứ làm ô này có nghĩa: một khẳng định "0.01ms" đứng một mình KHÔNG phân biệt được
"cổng reduced-motion đang chạy" với "phần tử này chưa bao giờ có transition nào". Cả hai đọc ra
`0.0001s`, và cách đọc sai lại là cách đọc dễ chịu hơn.

### 4.3 §8.3 — cung CHẠY, không nhảy ✅ (và hợp đồng `calc()` đứng vững)

**Câu trả lời cho câu hỏi mà 16.A để ngỏ: cung CHẠY. Không cần đường lùi `dashOffsetAt()`.**

| bằng chứng | giá trị |
|---|---|
| `getAnimations()` | `CSSTransition` trên `stroke-dashoffset`, `duration: 320`, `playState: "running"` |
| `transitionrun` | bắn, `elapsedTime: 0` |
| `transitionstart` | bắn, `elapsedTime: 0` |
| `transitionend` | bắn, `elapsedTime: 0.32` |

Ba sự kiện đủ bộ cộng một `CSSTransition` đang chạy là câu trả lời của chính bộ máy chuyển động.
`calc(1 - var(--p))` với `--p` chưa đăng ký qua `@property` **vẫn** làm `stroke-dashoffset` nội
suy. Hợp đồng §8.3 giữ nguyên; không có gì phải đưa lên chủ hợp đồng.

---

## 5. Phát hiện — `getComputedStyle` trả `calc(0.95px)`, một `calc()` CHƯA phân giải

Đây là kết quả có giá trị độc lập với kết luận ở §4.3, và nó suýt tạo ra một kết luận sai về sản
phẩm.

**Đo được:** `getComputedStyle(path).strokeDashoffset` trên cung tiến độ trả về chuỗi
**`calc(0.95px)`** — không phải `"0.95"`, không phải `"0.95px"`, mà một `calc()` giữ nguyên dạng
đã khai. Đổi `--p` sang `0.95` thì nó thành `calc(0.05px)`.

**Hai hệ quả, và hệ quả thứ nhất quan trọng hơn con số:**

1. **Một spec lấy mẫu `getComputedStyle` không thể thấy nội suy.** Chrome trả lại dạng đã khai chứ
   không trả giá trị đang chạy, nên phép lấy mẫu mỗi 16ms thấy đúng MỘT giá trị suốt cả transition
   và kết luận **"NHẢY"** — kể cả khi cung đang chạy mượt, như nó thật sự đang chạy. Bản đầu của ô
   4.3 đã kết luận đúng như vậy: `parseFloat("calc(0.95px)")` ra `NaN`, `NaN` lan qua phép so, và ô
   đỏ với thông báo *"`calc()` không phản ứng với `--p`"* — **một kết luận về SẢN PHẨM, sinh ra bởi
   một lỗi của HARNESS.** Mất một lượt chạy để lần ra. Bộ đo nay giữ chuỗi thô và đưa vào artifact,
   và một giá trị không parse được nay đỏ với câu *"không đo được"* thay vì một phán quyết về cung.

2. **`1 - 0.05` là một số KHÔNG ĐƠN VỊ, và Chrome ép nó thành `px`.** Với `pathLength={1}` thì 1
   đơn vị người dùng = toàn bộ chiều dài cung, nên giá trị vẫn đúng — nhưng nó đúng **vì một sự
   trùng hợp của hệ toạ độ**, không phải vì ai đó đã tính đến. Nếu có lane nào bỏ `pathLength={1}`
   (chú thích của `arcProgressProps` đã cấm, vì chu vi ellipse không có công thức sơ cấp), thì
   `stroke-dashoffset` sẽ nhận `0.95px` theo nghĩa đen của px và cung sai lệch — im lặng.

Không có việc gì phải sửa từ hai điều này. Chúng thuộc về **cách đo** motif, và chỗ đúng cho chúng
là chú thích của `motif.spec.ts` (đã ghi) cộng mục này.

---

## 6. Lượt quét 32 màn — kết quả

`a11y.spec.ts` + `csp.spec.ts` + `responsive.spec.ts`, `next start` cục bộ, tài khoản dùng-một-lần,
**151.8 giây**.

### 6.1 Số ô ĐÃ CHẠY — đọc dòng này trước mọi con số khác

| suite | pass | fail | skip | tổng |
|---|---:|---:|---:|---:|
| `a11y.spec.ts` | 21 | 2 | 12 | 35 |
| `csp.spec.ts` | 25 | 1 | 11 | 37 |
| `responsive.spec.ts` | 27 | 2 | 11 | 40 |
| **tổng** | **73** | **5** | **34** | **112** |

Năm ô đỏ: **2 lỗi sản phẩm thật** (§7.1, §7.2) và **3 ô cùng một nguyên nhân dữ liệu** (§7.3).

### 6.2 Ba mươi tư ô SKIP — một lượt skip sạch không phải một lượt xanh

| nhóm | số ô | vì sao |
|---|---:|---|
| màn vai-trò `author` / `admin` (11 màn × 3 suite, trừ phần đã chạy) | 33 | tài khoản e2e có `role: 'user'`; vai trò chỉ đặt được bằng SQL (`e2e/scripts/promote-role.sh`), không có API |
| ô đối chứng `E2E_REQUIRE_ROLES=1` | 1 | chính nó tự skip khi cờ chưa bật |

Cờ `E2E_REQUIRE_ROLES=1` biến **mọi** lượt skip trên thành đỏ có tên — đó là thứ lượt nghiệm thu
thật phải bật, sau khi chạy `promote-role.sh`. Chưa bật trong phiên này, nên **11 màn vai-trò
chưa từng được audit**: 5 màn `/author/**`, 5 màn `/admin/**`, và `/author/problems/:code`.

Các ô D10 (Esc trong terminal) của `keyboard.spec.ts` sẽ skip vì lý do khác — chúng cần phiên
sandbox THẬT, tức cần cụm. `gateway` không chạy cục bộ; log `next start` in
`[grpc:orchestrator] RPC thất bại connectCode: 'Unavailable'` đúng như dự đoán. Cờ tương ứng là
`E2E_REQUIRE_SESSION=1`.

`/reset-password` được mở ở đường TRẦN, không mang query — bàn giao 16.B: `rule-08-no-token-in-url`
grep văn bản THÔ kể cả chú thích, nên viết một URL có `?token=` vào file e2e sẽ làm cổng đó đỏ
trong khi sản phẩm không sai gì.

### ⚠ Lượt quét ĐẦU TIÊN chạy 0 ô và đọc ra y hệt một lượt sạch

Ghi lại vì nó là một cái bẫy có thật, không phải một sơ suất đáng bỏ qua.

Lượt đầu đặt `E2E_EMAIL` + `E2E_PASSWORD` trỏ vào một tài khoản cố định. Theo hợp đồng của
`e2e/env.ts`, đặt CẢ HAI biến làm `global-setup` **ĐĂNG NHẬP thay vì đăng ký** — và tài khoản đó
chưa tồn tại, nên nó nhận `HTTP 401 INVALID_EMAIL_OR_PASSWORD` và ném ở `global-setup.ts:104`.

Hệ quả là thứ đáng ghi: `stats` của lượt đó là
`{"expected": 0, "skipped": 0, "unexpected": 0, "flaky": 0}` với `suites: []`. Phép đọc đầu tiên
trên file JSON ấy in ra `TOTALS {passed: 0, failed: 0, skipped: 0}` và `total fails 0` — **không
phân biệt được với một lượt chạy sạch** nếu người đọc chỉ nhìn cột đỏ. Cùng lớp lỗi với lượt
`--shard` từng có 2/3 phần chạy 0 ô và thoát 0.

Phép kiểm đúng là khẳng định **số ô ĐÃ CHẠY**, không đọc mã thoát và không đọc cột failed. Bảng ở
§6.1 dưới đây vì vậy ghi tổng số ô trước mọi con số khác.

**Ba điều đã biết trước về lượt đó, ghi ra để người đọc sau không hiểu nhầm một kết quả nửa vời:**

1. **8 màn vai-trò sẽ SKIP.** Tài khoản e2e có `role: 'user'`; `/author/**` (5 màn) và `/admin/**`
   (5 màn, trong đó `/admin` cần admin) đòi vai trò cao hơn, và vai trò chỉ đặt được bằng SQL
   (`e2e/scripts/promote-role.sh`), không có API. **Một lượt skip sạch không phải một lượt xanh** —
   `E2E_REQUIRE_ROLES=1` biến mọi lượt skip đó thành đỏ có tên, và lượt nghiệm thu thật phải bật cờ
   đó sau khi chạy `promote-role.sh`.
2. **Các ô D10 (Esc trong terminal) sẽ SKIP** vì chúng cần một phiên sandbox THẬT, tức cần cụm.
   `gateway` không chạy cục bộ — log `next start` in `[grpc:orchestrator] RPC thất bại
   connectCode: 'Unavailable'` đúng như dự đoán. Cờ tương ứng là `E2E_REQUIRE_SESSION=1`.
3. **`/reset-password` được mở ở đường TRẦN**, không mang query. Bàn giao 16.B: `rule-08-no-token-in-url`
   grep văn bản THÔ kể cả chú thích, nên viết một URL có `?token=` vào file e2e sẽ làm cổng đó đỏ
   trong khi sản phẩm không sai gì.

---

## 7. Lỗi sản phẩm thật bắt được

⛔ Không sửa cái nào — chúng thuộc lane khác và tám lane đã gộp xong. Ghi kèm file và dòng.

### 7.1 `/paths/:id` — 1 lỗi axe mức **serious**, `color-contrast`

| | |
|---|---|
| **Màn** | `/paths/:id` (đo trên `/paths/lo-trinh-tu-do-1788902504259-xkhve2`) |
| **Luật** | `color-contrast` — impact **serious**, 1 node (36 luật khác pass, 0 lỗi mức thấp) |
| **Bộ chọn axe** | `.opacity-80 > .justify-between.flex-wrap.gap-3 > .gap-1.flex-col > .text-muted-foreground.text-xs` |
| **Nguồn** | `apps/web/src/app/paths/[id]/path-client.tsx:183` |
| **Lane** | 16.C |

Dòng 183 là:

```
<Card className={`flex flex-col gap-3 p-4 shadow-elevation-1 ${openable ? '' : 'opacity-80'}`}>
```

Cơ chế: `opacity-80` áp lên CẢ thẻ khi bước chưa mở được, và bên trong thẻ có chữ
`text-muted-foreground text-xs`. `--muted-foreground` vốn đã là token tương phản THẤP nhất còn hợp
lệ; nhân thêm 0.8 opacity là đẩy nó xuống dưới ngưỡng 4.5:1 của SC 1.4.3.

Đáng chú ý ở chỗ đây là lớp lỗi mà **test contrast của `packages/ui` không thể bắt** (ô 5 vẫn
ĐẠT): nó tính tương phản của TOKEN, còn `opacity` là một phép nhân áp ở tầng cha, lúc render, trên
một tổ hợp mà không token nào biết tới. Chỉ axe trên trình duyệt thật mới thấy.

### 7.2 `/lessons/:id` ở 1280px — KHÔNG có thanh nav chính

| | |
|---|---|
| **Ô đỏ** | `responsive.spec.ts:210` — `1280px — bố cục đầy đủ: nav ngang + khoang terminal` |
| **Locator không tìm thấy** | `getByRole('navigation', { name: 'Điều hướng chính', exact: true })` |
| **Nhãn đến từ** | `packages/copy/src/surfaces/shell.ts:59` — `'shell.nav.aria': 'Điều hướng chính'` |
| **Lane** | 16.B (vỏ) hoặc 16.D (khoang lab) — ranh giới cần chủ hợp đồng chốt |

**Đây là một ô có TRƯỚC lane này, không phải ô mới.** `git diff 8e5b2af..HEAD -- apps/web/e2e/responsive.spec.ts`
chỉ THÊM ở cuối file; bốn ô ngưỡng giữ nguyên từng chữ. Nên ô đỏ này là **hồi quy do tám lane dựng
lại vỏ**, và nó chỉ lộ ra vì lượt quét e2e chưa từng chạy sau khi gộp.

Phạm vi đã khoanh được, và nó hẹp hơn "vỏ hỏng": ô `769px — ĐỐI CHỨNG ÂM: nav ngang trở lại`
**PASS** trên `/lessons`, tức thanh nav CÓ tồn tại và CÓ đúng nhãn trên trang danh mục. Nó chỉ
vắng trên `/lessons/:id`. Thư mục `apps/web/src/app/lessons/[id]/` không có `layout.tsx`, nên nghi
phấn đầu tiên là trang chi tiết đang render ngoài vỏ mang nav, hoặc mang một nhãn khác.

Hệ quả cho người dùng, nói thẳng: ở khung desktop, người học vào một bài học rồi **không còn
đường điều hướng nào** để đi tiếp — và không có lỗi nào trong console nói ra điều đó.

### 7.3 KHÔNG phải lỗi sản phẩm — `/problems/:code` không mở được (3 ô đỏ)

Ba ô đỏ còn lại (a11y, csp, responsive) cùng một nguyên nhân và cùng một thông báo:

```
problems.list trả 0 mục nên không mở được /problems/:code.
```

Đây là **dữ liệu cục bộ thiếu**, không phải sản phẩm sai: bảng `problems` của DB dev rỗng. Harness
cố ý ném thay vì bịa một id — một id giả sẽ render trang 404 của app, axe quét trang 404 đó và ô
AC xanh trong khi trang thật chưa từng mở. Chạy bộ seed nội dung rồi đo lại là đủ.

Ba ô này chứng minh `firstItemId` + `resolvePath` mới hoạt động đúng: chúng ĐỌC được hình dạng
lồng của `problems.list` và báo đúng "0 mục", thay vì ném `TypeError` như bản cũ sẽ làm.

---

## 8. Việc để lại, theo thứ tự ưu tiên

| # | Việc | Vì sao chưa xong |
|---|---|---|
| 1 | **Sửa 2 lỗi sản phẩm ở §7.1 và §7.2** | thuộc lane khác; lane này chỉ đo, không sửa |
| 2 | `promote-role.sh` + chạy lại với `E2E_REQUIRE_ROLES=1` | **11 màn vai-trò chưa từng được audit** (33 ô skip); skip không phải xanh |
| 3 | Seed bảng `problems` rồi đo lại 3 ô ở §7.3 | DB dev rỗng; harness ném đúng thay vì bịa id |
| 3b | Chạy `keyboard.spec.ts` (10 màn × 3 ô) | tốn nhất trong suite: ô dấu-focus chụp tới 2×18 ảnh mỗi màn; chưa chạy trong phiên này |
| 4 | Chạy lượt nghiệm thu trên CỤM sau khi P16 deploy, kèm `E2E_REQUIRE_SESSION=1` | cụm đang chạy mã trước P16; `/register`, `/problems`, `/games` ở đó trả 404 |
| 5 | Siết `HOME_LCP_BUDGET_MS` theo lượt NGUỘI của cụm | §3, điều kiện kết thúc đã ghi trong chú thích `perf.spec.ts` |
| 6 | 10 ô cần mắt người của lane motif | 3 ô đo được bằng máy đã chuyển thành test (§4); 7 ô còn lại vẫn là phán quyết bằng mắt |
| 7 | Truy chênh lệch 148 vs 149 file vitest của gói web | §2; không ảnh hưởng kết luận nào, nhưng đừng chép lại 148 như đã xác nhận |

---

## 9. Commit của lane

| SHA | Nội dung |
|---|---|
| `70e8005` | `SCREENS` lên 32, `KEYBOARD_SCREENS` lên 10, quét 390px; `resolvePath` khớp `:<tên>`; `firstItemId` đọc khoá lồng |
| `ac7ea70` | `motif.spec.ts` (mới) + ngân sách LCP cho `/` kèm khẳng định canvas-không-phải-LCP |
| `c8a2fbe` | đổi phép đo cung sang `getAnimations()` + sự kiện transition, sau phát hiện `calc(0.95px)` |

Không commit nào chạm mã sản phẩm. `git diff 8e5b2af..HEAD --stat -- . ':!apps/web/e2e'` rỗng.
