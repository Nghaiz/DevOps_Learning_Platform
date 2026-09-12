# Phase 16 — Dựng lại toàn bộ frontend theo nhận diện PTIT

**Mức chi tiết:** DETAILED · **Effort:** XL · **Blocked by:** không · **Blocks:** không
**SSOT thiết kế:** [thiết kế nền](../reports/2026-09-10-p16-frontend-rebuild-design.md), cập nhật bởi
[quyết định làm lại landing ngày 2026-09-12](../reports/2026-09-12-p16-landing-rebuild.md) và
[hướng dẫn giao diện hiện tại](../../docs/design-guidelines.md).
**Hợp đồng:** [`contracts/p16-tokens.md`](contracts/p16-tokens.md) · [`contracts/p16-copy.md`](contracts/p16-copy.md) · [`contracts/p16-workspace.md`](contracts/p16-workspace.md)

> Chỉ đạo mới nhất của chủ dự án thay thế phần landing trong thiết kế ngày 2026-09-10:
> dựng lại toàn bộ, bỏ vòng trắng, ellipse, 3D và bố cục lưới thẻ. Các hợp đồng còn lại tiếp tục áp dụng.

## Trạng thái hiện tại — 2026-09-13

**`16.0`..`16.I`: COMPLETE trong phạm vi P16 đã chốt.** Chặng hoàn thiện
ngày 2026-09-12–13 xử lý cả nợ đã liệt kê và thay toàn bộ landing theo chỉ đạo mới. Không dùng
kết quả của trang vòng 3D cũ để nghiệm thu trang thay thế.

| Mốc | Trạng thái và bằng chứng hiện tại |
|---|---|
| Landing thay thế | Đã triển khai và review 9/10: bố cục liên tục, terminal minh hoạ Linux/Docker/Kubernetes, bốn lộ trình có thật; không vòng/3D/lưới thẻ. Bốn ca trình duyệt sáng/tối, desktop/mobile đã qua lại trong lượt nghiệm thu cuối trên build `HZG3aU7v-lBMcBxxAFsSE`. |
| Copy và hợp đồng dùng chung | 466 chuỗi từ 31 file đã chuyển; 44 lỗi có hướng xử lý; `CopyRef` kiểm đúng cặp khoá/tham số; `PROBLEM_*_LABELS` giữ API và đọc surface `problem`. |
| Reset mật khẩu và vòng đời phiên | SMTP thật, mã 15 phút dùng một lần, thu hồi phiên/cookie/refresh. Ba P2 và khe hở cạnh tranh refresh đã sửa, reviewer không còn lỗi chặn. |
| Nguồn bài tập và P15 | 10 bài published đã có nguồn seed trong git; P15 đã sửa ở `5d90ad1` + `6d8d2fc`, 50 regression trong phiên này xanh. |
| Build và kiểm tra mã | Bảy package: **28/28 task ép chạy, 0 cache**; web đầy đủ **153 suite / 1747 test xanh** ở mốc trước các sửa UI cuối. Sau sửa traversal chạy lại **12 test**; sau sửa UI/heading chạy lại **371 test UI + 30 test web**, đều qua. Build cuối `HZG3aU7v-lBMcBxxAFsSE`, lint và typecheck xanh. Các tập test có phần giao nhau, không cộng tổng. |
| Bundle, token và env | Bundle: xterm có ở đúng **4/4** route terminal, **33** route khác sạch; nền chung **1,047,523 B / 1,150,000 B** trên build cuối. Cổng token quét **560 file / 4 vùng**, giữ bốn miễn trừ có lý do. Env: **95 biến / 4 scope** khớp. Antipattern quét **602 file**, bốn phê duyệt khớp đúng statement của menu Arena đã được reviewer kiểm, không sửa mã sản phẩm Arena. |
| Nghiệm thu cuối 16.I | **COMPLETE: 171/171 qua, 0 lỗi, 0 skip, 0 retry, 6.2 phút** trên build cuối. Gồm **36 axe + 37 CSP** phủ đủ **32 màn**, **44 keyboard** với D10/PTY thật và SearchTabs native, **41 responsive**, **4 motif**, **4 perf**, **1 SMTP**, **4 visual**. Đã sửa cả focus ẩn, bốn màn author tràn 390px và 15 vấn đề heading moderate. |

Bằng chứng: [tổng hợp chốt pha](../../reports/p16-2026-09-13-finalization.md),
[review độc lập](../../reports/p16-2026-09-12-review.md),
[runtime và cách chạy lại](../../reports/p16-2026-09-12-runtime.md).

**Mọi lượt E2E phải khai** `E2E_START_SERVER=1`, `E2E_BASE_URL=http://localhost:3000`,
`E2E_ORIGIN=http://localhost:3000`. Nghiệm thu quyền và terminal còn bật
`E2E_REQUIRE_ROLES=1` và `E2E_REQUIRE_SESSION=1`. Không dùng máy chủ cũ để thay cho build vừa đo.

<details>
<summary>Lịch sử triển khai 2026-09-10–11 — số đo và khoản dở tại thời điểm đó</summary>

Các trạng thái, số lượng test, thiếu nguồn seed, reset chưa có backend và thiết kế vòng 3D
dưới đây là lịch sử. Trạng thái hiện tại ở bảng trên và bảng đóng nợ §8.

**Trạng thái 2026-09-10:** `16.0` XONG (ba hợp đồng trên `main`). `16.A` XONG trên nhánh
`feat/p16-frontend-rebuild` — 20 commit, `turbo run build lint typecheck test` = `Tasks: 32
successful, 32 total`, test đã chạy: web 1602, ui 858, games 402, scenario 285, terminal 133,
motion 110, copy 52, shared-types 48. Ba ô AC chuyển sang `16.I` (mục 16.I.5) vì cần trình duyệt
thật; ba khoản nợ ghi ở mục 8. **`16.B`..`16.H` chưa bắt đầu.**

**Trạng thái 2026-09-10 (đợt hai):** `16.C` và `16.D` XONG và đã gộp vào
`feat/p16-frontend-rebuild`. Cây gộp `turbo run build lint typecheck test` = `Tasks: 32
successful, 32 total`, gồm cả `next build`. 16.C: 9 commit, 30 file. 16.D: 14 commit, 36 file,
AC-1..AC-6 + AC-8 xanh (AC-7 sang 16.I vì nằm trong `e2e/**`). **`16.B`, `16.E`, `16.F`, `16.G`,
`16.H` chưa bắt đầu.** Bốn khoản dở của 16.C ghi ở mục 8.

**Trạng thái 2026-09-10 (đợt ba):** `16.G1`, `16.F`, `16.E` XONG và đã gộp (`cd6d51a`).
16.G1: 4 commit / 19 file. 16.F: 5 commit / 20 file. 16.E: 7 commit / 17 file. `16.B`, `16.G2`,
`16.H` đang chạy. Còn lại sau đó: `16.I`.

Cây gộp năm lane, đo bằng lượt **ép chạy** (`--force`), không phải lượt trúng cache:

```
Tasks: 32 successful, 32 total · Cached: 0 cached, 32 total · 2m9.583s
web 1729 (145 file) · ui 858 · games 402 · scenario 285
terminal 133 · motion 110 · copy 52 · shared-types 48        tổng 3617
check-design-tokens: 552 file / 4 vùng, đối chứng hai chiều xanh
```

**Trạng thái 2026-09-11 (chốt đợt):** `16.I` XONG và đã gộp, cộng một lượt xác minh của lead.
Số đo đầy đủ và cách lặp lại: [`reports/2026-09-11-verify-p16-lead.md`](reports/2026-09-11-verify-p16-lead.md).

Ô nghiệm thu §7, đo trên build CỤC BỘ với tài khoản admin và `E2E_REQUIRE_ROLES=1`:

```
a11y + csp:  68 xanh · 4 đỏ · 0 skip     ⇒ 30/32 màn sạch cả axe lẫn CSP
turbo:       Tasks: 32 successful, 32 total
```

Bốn ô đỏ là **hai màn**, mỗi màn hai spec: `/problems/:code` và `/author/problems/:code`. Bảng
`problems` có 0 dòng và **không có nguồn seed nào** — `content/` không có thư mục `problems`,
`seed-content.mjs` không nạp bảng đó. Hai màn ấy chỉ tồn tại sau khi có người soạn bài tập qua
UI. Ô AC nói "32 màn" trong khi hai màn cấu trúc-không-thể chạm tới trên một cài đặt sạch; đóng
nó là một quyết định (thêm nguồn seed, hay cho harness tự soạn rồi dọn), không phải việc vặt.

⚠ **Mọi lượt e2e phải khai base.** `E2E_BASE_URL` mặc định trỏ vào cụm lab, đang chạy một build
cũ. Lượt xác minh đầu của lead cho 13 ô đỏ chỉ vì điều đó; cùng suite vào build cục bộ cho 1.
Ba biến bắt buộc: `E2E_START_SERVER=1`, `E2E_BASE_URL=http://localhost:3000`,
`E2E_ORIGIN=http://localhost:3000`. Báo cáo 16.I **không khai base nào** — đọc bảng 11 ô của nó
với điều kiện đó.

**Trạng thái 2026-09-11:** cả tám lane dựng lại (`16.B`..`16.H`, `16.G` tách G1+G2) XONG và đã
gộp, cộng một lượt L0 đóng motif và một lượt L0 nối metadata vào bản đồ copy. `16.I` đang chạy.

Cây sau khi gộp hết, đo bằng lượt ép (`--force`, `Cached: 0 cached, 32 total`):

```
Tasks: 32 successful, 32 total
web 1750 (148 file) · ui 872 (34 file) · games 402 · scenario 285
terminal 133 · motion 110 · copy 52 · shared-types 48        tổng 3652
bản đồ copy: 1067 khoá, tổng-từng-surface = Object.keys(MESSAGES) → không khoá nào bị nuốt
```

**Hai lượt L0 không có trong plan, và vì sao chúng cần thiết:**

1. **Motif ellipse chưa từng vào hệ thiết kế.** `packages/ui` khai phụ thuộc
   `@devops-platform/motion` nhưng **không file nào import nó** — `motif.ts` có đủ máy móc và
   110 test xanh, không ai gọi. Tức ý tưởng thiết kế mà design §3 gọi là "xương sống của toàn bộ
   thiết kế" chỉ sống ở trang chủ 3D. Đóng bốn bề mặt §3 liệt kê; 0 file → 8 file import.
   `ProgressBar` giữ NGUYÊN hợp đồng aria, bốn ô test cũ được **chuyển** khẳng định chứ không xoá.

2. **Metadata của route chưa từng đi qua bản đồ copy.** Tám tiêu đề còn chuỗi viết thẳng kèm gạch
   ngang dài sống qua trọn bảy lane mà không ô nào đỏ. Lý do là cấu trúc, không phải sơ suất: sáu
   cổng `copy-gate.test.ts` gác theo glob của từng lane và không cái nào phủ `app/**`, còn cổng T1
   quét `packages/copy/src/**` nên nó **không thể** thấy một chuỗi nằm ngoài bản đồ. Cổng mới
   (`app/metadata-copy-gate.test.ts`) cắt đúng thân `metadata`/`generateMetadata` và ship kèm đối
   chứng dương lẫn âm hai phía. Mở rộng nó sang `description` tìm ra thêm ba mô tả trang và cả
   khối `openGraph` của `layout.tsx` — thứ mà lượt grep tìm gạch ngang dài không thấy, vì chúng
   không có dấu nào để tìm.

**Một chỗ cố ý không làm cho tiện:** ba mô tả trang đặt dưới tiền tố TỪNG trang chứ không gom
thành `catalog.meta-description.*`. Gom lại là một nhóm đúng ba thành viên và T3 sẽ đòi lời khai
rằng ba là con số đóng — ba ở đây không đóng, nó chỉ là ba trang tình cờ có mô tả. Khai bừa một
nhóm ba cố ý là nói dối chính cái cổng đang hỏi.

**Con số 72 khoá `author.` của 16.G1 là 69.** Ba dòng `authorIntentionalThree` lọt vào phép đếm
regex của chính lane đó — đúng bẫy nó chưa được cảnh báo, vì lời cảnh báo ra đời sau nó. Bản đồ
chạy thật phân xử: `author` = 178 = 69 + 109 của 16.G2.

**Vì sao phải ép chạy, và điều đó nói gì về mọi con số turbo trong dự án này.** Lượt verify đầu
sau khi gộp trả `FULL TURBO — 32/32 cached` trên một cây vừa đổi 19 file. Đó là hình dạng của
một ô xanh không chứng minh gì, nên nó không được nhận. Ba phép đo sau đó:

1. `turbo.json` **không khai `inputs`** cho `build/lint/typecheck/test`, tức dùng mặc định là mọi
   file git theo dõi trong package. Cấu hình đúng — đổi mã thì đổi hash. Giả thuyết nguy hiểm
   nhất, và nó đã bị loại.
2. **Không worktree nào có thư mục cache** (`.turbo` lẫn `node_modules/.cache`). Cache duy nhất
   trong cả hệ là `.turbo/cache` ở cây chính. Suy ra turbo phân giải gốc repo về cây chính kể cả
   khi chạy từ worktree con.
3. `--force` trả `0 cached` và vẫn `32 successful`.

Hệ quả cần nhớ: **số của lane luôn là chạy thật** (worktree không có cache để trúng), còn **số ở
cây chính thì phải ép mới tin được**.

**Ba lỗ hổng cổng, đo trong đợt này, mỗi cái hỏng im lặng:**

| Bẫy | Vì sao không cổng nào đỏ |
|---|---|
| Probe của `renderMessages` gọi `fn(NUMBER_PROBE)` TRƯỚC | Một `ErrorEntry` viết `what: p.message` nhận số `7`; nó trượt khỏi **mọi** cổng giá trị. Ba mục của 16.F đã dính |
| Cổng T4 báo động giả 100% trên file `.ts` thuần | Mẫu `>([^<>]*)<` khớp đoạn giữa mũi tên hàm và dấu mở generic. 16.E thấy một "vi phạm" dài 18 dòng không chứa ký tự JSX nào |
| Bảng `intentionalThree` cùng hình dạng dòng với bản đồ khoá | Regex trích khoá đọc tiền tố nhóm thành "khoá chết" — ô đỏ về chính bộ đo, không về mã |

Cộng một lỗ hổng **quy trình**: `git worktree add` không mang `.env` và `apps/web/.env` sang
(khớp `*.env` ở `.gitignore:50`). Lượt turbo đầu của 16.G1 ra `Tasks: 29/31` với 121 ô đỏ — và
con số nguy hiểm hơn là **71 ô lặng lẽ SKIP**, kéo tổng 1695 → 1659. Đọc cột passed/failed mà
không đọc TỔNG thì lượt đó trông như "gần xanh". **Lead chép `.env` khi cấp worktree** là bước
bắt buộc từ đây.

**16.G tách đôi — quyết định của lead, không có trong plan gốc.** Cây `author/**` là 72 file /
10.100 dòng, gấp đôi phạm vi 16.C, mà 16.C đã phải chia hai vì chạm trần lượt. Nên chia sẵn thay
vì chia phản ứng:

| Lane | Sở hữu | Ghi chú |
|---|---|---|
| **16.G1** | `components/author/**` (30 file) + `app/author/{page.tsx,author-list-client.tsx,[id]/**,new/**}` | soạn bài học |
| **16.G2** | `app/author/problems/**` (35 file) | soạn bài tập, chạy **nối tiếp** sau khi G1 gộp |

Nối tiếp chứ không song song, vì hai lý do đo được, không phải phòng xa:

1. **Cả hai cùng ghi `packages/copy/src/surfaces/author.ts`.** Đó đúng là lớp lỗi mà chú thích
   đầu `registry.ts` mô tả: hai worktree chia chung một cây, lượt ghi sau ĐÈ lượt trước, không
   dấu xung đột, không lỗi biên dịch. Cách duy nhất chạy song song là tách surface đó làm hai
   file, mà việc đó phải sửa `registry.ts` — file L0 — giữa lúc ba lane khác đang bay trên nó.
2. **`components/author/field.tsx` là điểm chạm một chiều.** Mười file trong `app/author/problems/**`
   import `TextField`, `TextAreaField`, `issueFor` từ nó; không file nào của `problems/` ghi
   ngược vào `components/author/`. Nên G1 sở hữu `field.tsx` với ràng buộc giữ nguyên ba chữ ký
   đó, còn G2 chỉ ĐỌC. Kiểm bằng grep hai chiều trước khi chốt, không suy từ cây thư mục.

Ba thứ đợt này đo được mà plan chưa lường:

1. **Lane effort-L không lọt một lượt agent.** Cả hai lane đều chạm trần 90 lượt (~500–620K
   token mỗi lane) và phải nối tiếp. Lần đầu chạm trần, 16.C bỏ lại 19 file chưa commit và 16.D
   bỏ lại một việc dời file đi nửa đường. Lane sau phải có nhịp commit mỗi ~15 lượt tool và một
   điều kiện thoát ghi sẵn trong brief.
2. **`apps/web` chưa từng khai `@devops-platform/copy` lẫn `motion`.** Chặn cả bảy lane, và nền
   vẫn xanh 32/32 vì chưa file nào import chúng. Vá ở `279a7f3`.
3. **Cổng T4 chỉ gác một chiều.** Nó bắt "chuỗi nằm ngoài bản đồ", không bắt "khoá không có nơi
   gọi". Nên ba khoá `session.tier.*` trùng với `catalog.tier.*` đi qua mọi cổng của cả hai lane
   mà không ô nào đỏ; chỉ lộ khi đọc tay sau lúc gộp.

16.A được chia bốn khối thay vì "1 người tuần tự" như bảng mục 4 — `packages/ui` một mình đã 65
file, cộng 46 token và hai package mới. Ranh giới sở hữu file giữ nguyên như plan pin: A1
`globals.css` + `layout.tsx` + `public/`, A2 `packages/copy`, A3 `packages/motion`, A4
`packages/ui`. Điểm nghẽn duy nhất không chia được là `pnpm install`, nên lead cài sẵn một lần
trước khi fan-out.

---

</details>

## 1. Objective

Đập và dựng lại toàn bộ frontend: bố cục, thiết kế, màu, nội dung, văn phong. Bao gồm cả phía
admin và author. Trừ `apps/web/src/components/k8s-arena/**`.

Ba đích đo được:

1. **32 màn hình** đi qua cổng a11y và CSP, 0 lỗi axe mức serious và critical. Mốc nền khi lập
   plan là 22; bổ sung games/problems và các trang xác thực vào kiểm tra thực tế.
2. Mọi chuỗi người dùng đọc đi qua `packages/copy`, có test gác luật gạch ngang dài và luật đủ
   dấu tiếng Việt.
3. Terminal giữ nguyên node cha qua mọi lượt đổi tab, có test khẳng định.

---

## 2. Prior-art — khảo sát nền ngày 2026-09-10

Các mô tả “đã có” và “không có” trong mục này là trạng thái trước triển khai, không phải danh
sách thiếu hiện tại. Kết quả hoàn thiện được đối chiếu ở đầu plan và §8.

Phạm vi tìm: `apps/web/src/**`, `packages/{ui,terminal,games,scenario,shared-types}/src/**`,
`content/**`, `apps/web/e2e/**`, `docs/**`, `plans/devops-learning-platform/**`. Bốn agent đọc
song song ngày 2026-09-10.

**Đã có, và tốt, phải giữ dưới dạng yêu cầu của mã mới:**

| Thứ | Ở đâu | Vì sao giữ |
|---|---|---|
| Bất biến terminal không đổi cha | `components/session/workspace-panel.tsx:38` | Vi phạm là mất phiên người học, im lặng |
| Hợp đồng bốn trạng thái + đối chứng dương | `packages/ui/src/design-system.contract.test.tsx` | Cách duy nhất biết hệ thiết kế còn đúng |
| Một landmark `<main>` do vỏ sở hữu | `components/session/landmark-contract.test.ts` | Đang được quét tĩnh |
| Test vắng mặt đa terminal | `components/session/single-terminal-contract.test.ts` | Gác thứ đã bị xoá có chủ ý |
| Be Vietnam Pro, subset `vietnamese`, tự host | `app/layout.tsx:24` | Đã đúng, `font-src 'self'` không chặn |
| Token `--motion-*` + khối `prefers-reduced-motion` | `app/globals.css:235,508` | Đúng cho CSS |
| Thăm dò trước khi gắn iframe IDE | `app/lessons/[id]/ide-pane.tsx` | Sửa 2026-09-07, đúng |
| Tách quyết định hình học khỏi React | `components/session/workspace-tabs.ts` | Hàm thuần thì khẳng định bằng bảng vào/ra |

**Không có, đã tìm và xác nhận rỗng:**

- Tầng i18n hoặc message map: 0 hit cho `i18n`, `useTranslation`, `next-intl`, `react-i18next`
  trên toàn `apps/web/src` và `packages/*/src`.
- Thư mục `apps/web/public/`: **không tồn tại**. Không có favicon, không có OG image, không có
  tài sản thương hiệu nào.
- Chuỗi `PTIT` hoặc `Bưu chính`: 0 hit trên `apps/web/src`, `content/`, `docs/`.
- `framer-motion`, `sonner`: không có trong `apps/web/package.json` lẫn `packages/ui/package.json`.
- Cổng kích thước bundle: không có `@next/bundle-analyzer`, không có `size-limit`. Ghi ở
  `phase-14-exec.md:21`.
- `/games`, `/games/k8s`, `/problems`, `/problems/:code`, `/author/problems*` trong
  `apps/web/e2e/routes.ts`: **vắng mặt**. Nên `a11y.spec.ts` và `csp.spec.ts` không phủ chúng.

---

## 3. Task list

Giữ cấu trúc yêu cầu gốc để truy được việc đã làm. Mô tả nền trong các lane B/C/D là lúc lập
plan; trạng thái hiện tại ở đầu file. 16.E và phần reset của 16.B đã được cập nhật theo chỉ đạo mới.

### 16.0 — Ba hợp đồng (TUẦN TỰ, chặn mọi lane)

Không lane nào được spawn trước khi ba file này commit xong. Đây là **declaration hoisting** theo
`rules/contract-first-integration.md`: mọi hình dạng mà hai lane trở lên phải đồng ý được khai ở
đây, không khai trong lane.

| File | Pin cái gì |
|---|---|
| `contracts/p16-tokens.md` | Tên và giá trị token màu/chữ/spacing/motion, bảng contrast, luật hai kênh primary vs destructive, motif cung |
| `contracts/p16-copy.md` | API `packages/copy`, luật giọng văn, các test gác chúng |
| `contracts/p16-workspace.md` | Bất biến terminal, bẫy `hidden`, mô hình hai tab, hợp đồng fit/resize, hợp đồng khoang IDE |

**Vì sao phải tuần tự:** bản đồ sở hữu file **không phát hiện được** lớp lỗi này. L2 và L3 có thể
sở hữu hai tập file rời nhau hoàn toàn mà vẫn cùng chờ một khai báo do L0 viết. Mỗi lane tự
review thì đều xanh, và lệch chỉ lộ ra lúc tích hợp.

**Ô nghiệm thu 16.0:** ba file tồn tại, commit trên nhánh nền, và mỗi file có mục "Ô nghiệm thu"
liệt kê test cụ thể kèm đối chứng dương.

---

### 16.A — L0 nền (TUẦN TỰ, chặn 16.B..16.H)

**Sở hữu:** `packages/ui/**`, `packages/copy/**` (mới), `packages/motion/**` (mới),
`apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, `apps/web/public/**` (mới)

1. `globals.css` viết lại theo `p16-tokens.md`. Sáng và tối đủ cặp.

   **46 token, không phải 24.** Bản brief hợp đồng ban đầu chỉ liệt 24 token ngữ nghĩa và bỏ sót
   22 token mà trang danh mục đang tiêu thụ thật (kiểm 2026-09-10: 44 khai báo trong
   `globals.css`, tức 22 token × hai theme):

   ```
   --difficulty-{basic,intermediate,advanced,expert}(-foreground)   8
   --kind-{pod,config,network,storage,controller,batch,security,cluster}   8
   --status-{done,progress,locked}(-foreground)                     6
   ```

   **L0 sở hữu cả 46.** Không đẩy 22 token này sang L2: chúng nằm trong `globals.css`, mà file đó
   do L0 sở hữu độc quyền. Một lane không thể sở hữu token nằm trong file nó không sở hữu, và
   nếu để L2 tự thêm thì L2 phải ghi vào `globals.css` cùng lúc với L0. Đó đúng là lớp lỗi đè
   file mà worktree sinh ra để chặn.

   `--kind-*` chính là màu nhấn theo loại tài nguyên k8s, nên nó đi cùng bảng icon ở **mục 9**.
   Hai thứ đó phải khớp nhau về tập khoá, và test đối chiếu ở mục 9 phải kiểm cả hai.

2. **`--radius` đổi 0.625rem → 0.75rem.** Đây là quyết định của `p16-tokens.md`, và nó dịch hình
   học của **mọi** component. Ghi ra đây để nó là một lựa chọn có tên, không phải một con số
   trôi vào. Mọi thang bo góc khác suy ra từ nó bằng `calc()`, không khai số cứng ở component.
3. `packages/ui` dựng lại từ file trắng. Danh sách export giữ nguyên tên để 7 lane kia không phải
   đoán: `Button Input Textarea Label Badge Card* Dialog* Tabs* Select* DropdownMenu* Tooltip*
   Switch Checkbox RadioGroup* Alert* Skeleton Spinner Table* CursorPager EmptyState ErrorState
   ProgressBar Separator Kbd cn ThemeProvider useTheme`. Đổi hình, không đổi tên.
4. **Toast:** `npx shadcn add https://goey-toast.vercel.app/r/goey-toaster.json` đưa mã vào repo,
   rồi chỉnh token màu về hệ PTIT. Không cài `goey-toast` qua npm: nó đang ở 0.5.0, và toast nằm
   ở 18 chỗ.
5. **Search:** `gooey-search-tabs@0.2.0`, ghim chính xác, không `^`. Bọc lại thành một component
   của `packages/ui` để 5 trang danh mục không import thẳng gói ngoài.
6. Thêm `framer-motion@13.2.0` và `sonner@2.0.8`.
7. `packages/copy` theo `p16-copy.md`, kèm test gác.
8. `packages/motion`: motif ellipse, cung tiến độ, biến thể framer-motion dùng chung, và **cổng
   reduced-motion mức JS** (`matchMedia`, có `addEventListener('change')`).
9. `packages/ui` thêm bảng icon `ResourceKind` dùng đúng bộ lucide của arena, **cộng một test
   đối chiếu chỉ ĐỌC** `components/k8s-arena/hud/resource-icon.tsx` và khẳng định hai bảng khớp
   trên mọi `ResourceKind`. Không sửa file arena.
10. `apps/web/public/`: logo PTIT (SVG), favicon, OG image. Nguồn:
   `https://ptit.edu.vn/wp-content/uploads/2024/05/logo-ptit-1.svg` (vector thật, đã kiểm 200).
   Commit vào repo vì `img-src 'self' data:` không cho hotlink.

   Giữ quyết định không dùng ảnh raster sinh bằng model cho đợt này. Landing mới dùng chữ,
   CSS và ví dụ terminal có nghĩa; OG image dùng SVG đã bỏ ellipse. Không còn yêu cầu cảnh
   3D hoặc bảy chặng trang chủ sau chỉ đạo 2026-09-12–13.

**Ô nghiệm thu 16.A:**

- Grep màu trần rỗng trên `packages/ui/src`: không `#hex`, không `slate|gray|zinc|neutral-\d+`.
- Test contrast tính lại mọi cặp token, **trộn alpha trong sRGB đã mã hoá gamma**. `docs/design-
  system.md` §1a ghi lại lần trộn nhầm trong linear-light đã chứng nhận cho đúng thứ cần chặn;
  không lặp lại.
- Hợp đồng bốn trạng thái xanh, kèm đối chứng dương.
- Test `packages/copy`: 0 ký tự `—`, 0 chuỗi tiếng Việt mất dấu, kèm đối chứng dương cho cả hai.
- Test đối chiếu icon xanh, và đỏ được khi bảng arena đổi (đối chứng dương).
- `pnpm --filter @devops-platform/ui test` xanh, và **số test chạy phải in ra** — một suite mà mọi
  ca đều `skip` vẫn thoát 0.

---

### 16.B..16.H — Bảy lane song song

Mỗi lane một `git worktree` riêng do lead cấp trước khi spawn. Teammate **không** chạy
`git checkout`, `git switch`, `git branch -f`, `git add .`, `git add -A`, hay `git commit -a`.
Commit bằng dạng pathspec: `git commit -m "..." -- <đường dẫn cụ thể>`.

| Lane | Sở hữu | Effort |
|---|---|---|
| **16.B** vỏ + xác thực | `components/shell/**`, `app/login`, `app/register`, `app/forgot-password`, `app/reset-password` | M |
| **16.C** trang chọn bài | `components/catalog/**`, `app/{lessons,labs,paths,playgrounds,quiz}/page+client`, `app/games/**`, `app/(session)/problems/**` | L |
| **16.D** khoang lab | `components/session/**`, `app/labs/[id]/**`, `app/lessons/[id]/**`, `app/session/[id]/terminal/**` | L |
| **16.E** landing thực hành DevOps | `components/marketing/**`, `app/page.tsx`, `app/home-cta.tsx` | L |
| **16.F** admin | `app/admin/**`, `components/admin/**` | M |
| **16.G** author | `app/author/**`, `components/author/**` | L |
| **16.H** me + settings | `app/me/**`, `app/settings/**`, `components/me/**` | M |

Bảy lane, chạy đồng thời dưới trần fan-out 8 của depth 0.

##### Ba route KHÔNG lane nào nhận — chốt 2026-09-10

Bảng trên giao `page+client` của năm cây danh mục cho 16.C, và `[id]/**` của **hai** cây cho
16.D. Đọc sát thì `paths/[id]`, `playgrounds/[id]`, `quiz/[id]` rơi qua khe: không lane nào
trong bảy lane nhắc tới chúng. Bản đồ sở hữu theo thư mục không phát hiện được lớp lỗi này —
mỗi lane đọc phần của mình thì đều thấy đủ, và ba trang kia chỉ lộ ra khi ai đó mở chúng sau
khi P16 xong và thấy giao diện cũ.

Chia theo **thứ mã thực sự chạm tới**, không theo cây thư mục:

| Route | Về lane | Vì sao |
|---|---|---|
| `app/playgrounds/[id]/**` | **16.D** | Dùng `use-playground-session.ts` → terminal → đụng đúng bất biến khoang làm việc ở `contracts/p16-workspace.md` §1. Để nó ở 16.C là để một lane không đọc hợp đồng đó viết mã chạm vào nó. |
| `app/paths/[id]/**` | **16.C** | Trang đọc thuần, không có phiên sandbox nào. |
| `app/quiz/[id]/**` | **16.C** | Form thuần, không có phiên sandbox nào. |

Kèm theo, hai khoản cấp quyền theo TÊN cho đợt 16.C + 16.D (2026-09-10):

- `components/shell/immersive-routes.ts` → **16.D độc quyền**. Mục 16.D.1 giao đúng việc sửa
  file này, nhưng file nằm trong `components/shell/**` của 16.B. 16.B chưa chạy; khi nó chạy
  thì đọc dòng này trước.
- `app/{lessons,labs,paths,playgrounds,quiz}/layout.tsx` → **không lane nào sửa**. Chúng là
  gác auth + provider tRPC phía server, không phải phần nhìn, và mỗi file đã ghi rõ vì sao nó
  gác (hoặc CỐ Ý không gác) ở đúng tầng đó. Cần sửa thì báo lead, không tự đổi.

#### 16.B — vỏ + xác thực

Vỏ hôm nay là thanh trên `h-14` dính, có drawer trái cho mobile. Giữ hình thái đó, dựng lại.

Bốn trang xác thực tách riêng. `/login` hôm nay gộp cả đăng nhập lẫn đăng ký trong một thẻ 218
dòng; tách ra.

`/forgot-password` và `/reset-password` đã có backend SMTP trong đợt đóng nợ 2026-09-12–13.
Form xác nhận đã tiếp nhận yêu cầu, không khẳng định thư đã tới hộp thư. Cùng phản hồi cho tài
khoản có/không có thật; mã nhập qua POST, hết hạn sau 15 phút, dùng một lần. Reset thành công
thu hồi cookie, phiên và refresh token, kể cả khi refresh đang xoay đồng thời. Cấu hình SMTP
và giới hạn vận hành: [hướng dẫn reset](../../docs/env/06-password-reset-smtp.md).

Đăng xuất giữ nguyên đường `/api/auth/logout`, **không** đổi sang `authClient.signOut()`: chỉ
route đó thu hồi refresh token (`components/shell/user-menu.tsx`).

#### 16.C — trang chọn bài (ưu tiên cao nhất cùng 16.D)

Đây là nhóm chủ dự án gọi là xấu nhất và lỗi nhất, và cũng đúng là nhóm không có cổng nào.

Năm danh mục dùng chung một bộ component, nên sửa một chỗ là sửa cả năm. Cộng `/games` (toolbar
riêng vì không có backend) và `/problems` (chỗ duy nhất trong toàn ứng dụng hôm nay có ô tìm
kiếm thật).

Thêm `gooey-search-tabs` vào `CatalogToolbar`. Đây **không phải thay thế**: hôm nay
`CatalogToolbar` không có ô tìm kiếm nào, chỉ có chip lọc và một select sắp xếp. Tab của thư viện
ánh xạ sang bộ lọc độ khó và hạng sandbox đang có.

Icon `ResourceKind` lấy từ `packages/ui` (16.A mục 8), không import từ arena.

#### 16.D — khoang lab (an toàn cao nhất)

Đọc `contracts/p16-workspace.md` **trước khi viết dòng đầu tiên**. Bất biến terminal ở đó là
điều kiện sống của lane này.

1. `/labs/[id]` và `/lessons/[id]` vào immersive. Thêm hai tiền tố vào `immersive-routes.ts`.
   Thanh nav toàn cục ăn 56px trên đúng màn hình mà mỗi pixel dọc là một dòng terminal.
2. Chia đôi viết lại, vẫn tự viết, vẫn tách quyết định hình học ra hàm thuần.
3. `IdePane` chuyển từ `app/lessons/[id]/` sang `components/session/`. Lab dùng được editor.
   Việc bài nào bật IDE là quyết định nội dung.
4. Bảng nhiệm vụ thành danh sách kiểm, phân biệt **rõ trên màn hình** giữa "chưa đạt" và "hạ
   tầng lỗi". Tầng dữ liệu đã phân biệt đúng rồi (`lab-client.tsx`, nhánh `kind:'error'` tách
   khỏi `passed:false`); phần nhìn chưa nói ra.
5. Màn hình chờ IDE 45 giây làm lại. Logic thăm dò giữ nguyên.

**Cấm:** hồi sinh đa terminal. Test vắng mặt phải đi theo sang mã mới.

#### 16.E — landing thực hành DevOps, thay thế toàn bộ cảnh 3D

Quyết định ngày 2026-09-12–13 của chủ dự án thay thế yêu cầu bảy chặng 3D trong design §7.

1. Hero chữ lớn, lời giới thiệu ngắn, CTA đúng trạng thái đăng nhập.
2. Một vùng minh hoạ terminal có thao tác Linux/Docker/Kubernetes, chạy và đặt lại. Công bố rõ
   đây là ví dụ tương tác với kết quả mẫu, không kết nối sandbox thật.
3. Số nội dung đọc từ server, phân biệt lỗi đọc với số 0; không dựng số người học hay hoạt động giả.
4. Danh sách liên tục gồm bốn lộ trình có ID thật, giải thích cách thực hành và CTA cuối.
5. Không vòng, ellipse, canvas, WebGL, cảnh cuộn hay lưới thẻ. Đã xoá nguồn cảnh và copy cũ sau
   kiểm tra nơi gọi. Arena giữ ranh giới riêng.
6. Chữ đi qua `home.*`; native button có trạng thái truy cập được, vùng kết quả live polite,
   đổi chủ đề xoá kết quả cũ. Token PTIT và font hiện có được giữ.
7. Nghiệm thu bằng thao tác thật và ảnh desktop/mobile sáng/tối, chuyển theme khi đang mở,
   reduced-motion, không tràn ngang, axe/CSP/LCP trên build hiện tại.

Báo cáo triển khai: [landing thay thế](../../reports/p16-2026-09-12-landing.md). Ảnh vòng 3D cũ
chỉ là lịch sử; việc bỏ yêu cầu nhìn cảnh 3D là thay đổi phạm vi theo người dùng, không phải ca test bỏ qua.

#### 16.F — admin · 16.G — author · 16.H — me + settings

Dựng lại theo token và copy mới. `16.G` là lane nặng nhất trong ba: trình soạn 423 dòng cộng 13
file nhóm trường.

Bảng và phân trang giữ cơ chế con trỏ đang có (`lib/cursor-stack.ts`, `CursorPager`) — đó là
logic, không phải phần nhìn.

---

### 16.I — Cổng nghiệm thu (TUẦN TỰ, sau 16.B..16.H)

**Sở hữu:** `apps/web/e2e/**`

1. `SCREENS` lên **32 màn**, `MIN_SCREENS` lên 32. Thêm bảy màn games/problems và ba màn xác thực
   mới.
2. `KEYBOARD_SCREENS` từ 4 lên **≥10**, bắt buộc gồm `/labs/:id` và `/lessons/:id`, và phải
   khẳng định thoát được focus khỏi terminal bằng bàn phím.
3. Ngân sách LCP mới cho `/`, đo trên build production cục bộ với bộ ba biến E2E bắt buộc,
   ghi số đo và môi trường thật vào báo cáo. Giữ phép đo `/lessons`. Không gọi số đo cục bộ là
   số đo production/cụm lab.
4. `responsive.spec.ts`: **giữ nguyên hình dạng hiện tại**, thêm phủ.

   Suite này không phải một lượt quét mù qua mọi màn. Nó đo **hành vi tại đúng ngưỡng**, kèm đối
   chứng âm ở cả hai phía: nav thu vào ngăn kéo ở 768px và trở lại ngang ở 769px (chính ô này
   phân biệt `min-[769px]:` với `md:`), cảnh báo terminal hiện dưới `TERMINAL_MIN_WIDTH_PX` và
   biến mất đúng tại ngưỡng. Đó là cách đo đúng, mạnh hơn một lượt quét.

   Việc của 16.I là **thêm** một ô quét 32 màn ở 390px khẳng định không tràn ngang, chứ **không**
   thay các ô ngưỡng trên bằng lượt quét đó. Đổi hai ô ngưỡng thành quét là hạ cấp một phép đo
   có đối chứng âm xuống một phép đo không có.

5. **Ba ô chuyển từ 16.A sang đây vì chúng chỉ đo được trong trình duyệt thật** (lane motion báo
   2026-09-10, sau khi thi công xong `packages/motion`).

   | Ô | Vì sao 16.A không đo được | Đo thế nào ở 16.I |
   |---|---|---|
   | AC-7 "ép reduced-motion ⇒ `transition-duration` ra 0.01ms" | Giá trị đến từ khối `@media` trong `globals.css`. `packages/motion` không sở hữu stylesheet nào, chạy vitest ở `environment: 'node'`, không có `react-dom`, và jsdom không phân giải `matchMedia` lẫn `@media` trong cascade. | `emulateMedia({ reducedMotion: 'reduce' })` rồi đọc `getComputedStyle(path).transitionDuration` |
   | §8.3 cung chạy được bằng `calc(1 - var(--p))` | Transition đặt trên `stroke-dashoffset` mà giá trị đến từ một custom property **chưa đăng ký**. Spec nói nó bắn; chưa ai đo trên trình duyệt thật. | Đổi `--p` rồi khẳng định cung **chạy** chứ không **nhảy** |
   | §8.1 khe hở nằm đúng phía | Hình học đúng theo test, nhưng "đúng phía" là phán quyết bằng mắt. | Tâm khe hở phải ở `(61.24, 22.18)` trong `viewBox` 100×100 |

   Hai ô đầu hỏng **im lặng** nếu sai: không lỗi, không log. AC-7 sai thì trang TRÔNG NHƯ đã tuân
   thủ reduced-motion; §8.3 sai thì cung nhảy một nhịp thay vì chạy. Đường lùi cho §8.3 đã sẵn —
   `dashOffsetAt(p)` trả số thô, đặt thẳng vào `strokeDashoffset` thì transition chắc chắn chạy —
   nhưng **không đổi trước khi đo**, vì §8.3 ghi dạng `calc()` là bắt buộc.

---

## 4. Team Layout

Bảng sau là bố trí dự kiến ngày 2026-09-10. Đợt hoàn thiện 2026-09-12–13 dùng agent đang có,
chia quyền sở hữu file và tái dùng slot; không tuyên bố đã chạy đồng thời theo con số dự kiến.

| Chặng | Teammate | Agent | model | Worktree | Song song |
|---|---|---|---|---|---|
| 16.0 | 3 người viết hợp đồng | `t1k-docs-manager` | opus | không (chỉ ghi `plans/`) | 3 |
| 16.A | 1 người dựng nền | `t1k-web-ui-developer` | opus | `wt-p16-l0` | 1 |
| 16.B..16.H | 7 người dựng lane | `t1k-web-core-developer` (16.E: `t1k-web-ui-developer`) | opus | `wt-p16-{b..h}` | 7 |
| 16.I | 1 người dựng cổng | `t1k-web-testing-tester` | opus | `wt-p16-i` | 1 |

Mọi teammate pin `model: opus` theo `.claude/rules/subagent-model-opus.md`, và truyền
`model: "opus"` ở tham số spawn vì frontmatter không áp cho phiên đang chạy nếu registry đã chốt
trước lúc sửa.

**Brief bắt buộc có, cho mọi lane:** đường dẫn ba hợp đồng (không chép nội dung), danh mục sở hữu
file theo tên, luật commit pathspec, và câu "báo cáo bằng `SendMessage` tới lead" — văn bản cuối
của một background sub-agent **không** tới được người spawn.

---

## 5. Risk Assessment

| Rủi ro | L | I | Score | Mitigation |
|---|---|---|---|---|
| Mất bất biến terminal khi viết lại khoang lab | 4 | 5 | **20** | Test bất biến viết TRƯỚC khi dựng lại. `contracts/p16-workspace.md` là điều kiện vào lane 16.D. Hỏng kiểu này im lặng và người học là người phát hiện. |
| 149 test bị xoá cùng mã cũ, không ai thay | 4 | 4 | **16** | Chuyển **khẳng định**, không chuyển mã. Mỗi lane phải chỉ ra test tương đương trước khi xoá bản cũ. 16.I đối chiếu tổng số test trước và sau. |
| Hai lane cùng ghi một file ngoài danh mục sở hữu | 3 | 5 | **15** | Một worktree mỗi lane. Cấm `git add .`/`-A`/`commit -a`. File không thuộc lane nào (`globals.css`, `packages/ui/src/index.ts`, `e2e/routes.ts`) do 16.A và 16.I sở hữu độc quyền, ghi tên trong brief. |
| Nghiệm thu nhầm ảnh hoặc build landing cũ | 3 | 4 | 12 | Cảnh 3D đã xoá theo người dùng. Ghi BUILD_ID và base của mọi lượt; kiểm ảnh trang thay thế và native controls. |
| Gọi cùng lúc E2E và build làm mất build đang đo | 3 | 3 | 9 | Build hoàn tất riêng trước E2E; không cho turbo ghi `.next` khi server nghiệm thu đang chạy. |
| Sửa quiz/lộ trình mà quên seed lại | 3 | 3 | 9 | `scripts/seed-content.mjs` phải chạy sau khi sửa `content/*.json`. Sửa mà không seed thì không có gì đổi và **không có lỗi nào**. |
| SMTP nhận yêu cầu nhưng chưa giao thư | 2 | 4 | 8 | UI chỉ xác nhận tiếp nhận. Thử SMTP thật/Mailpit, lỗi provider và riêng tư tài khoản; chưa có hàng đợi bền vững, cần Secret của provider khi triển khai thật. |
| Gói 0.x đổi API | 2 | 3 | 6 | Vendor `goey-toast` vào repo; ghim chính xác `gooey-search-tabs`. |
| Phiên song song của chủ dự án đè file | 1 | 5 | 5 | Phiên kia ở `components/k8s-arena/**`. Không lane nào ghi vào đó. Điểm tiếp xúc duy nhất là test đối chiếu icon, và nó chỉ đọc. |

Ba dòng ≥15 phải có mitigation xong trước khi lane tương ứng bắt đầu.

---

## 6. Timeline

| Chặng | Effort | Ghi chú |
|---|---|---|
| 16.0 hợp đồng | S (1d) | Tuần tự. Chặn tất cả. |
| 16.A nền | L (1wk) | Tuần tự. Chặn 7 lane. |
| 16.B vỏ + xác thực | M (3d) | song song |
| 16.C trang chọn bài | L (1wk) | song song · ưu tiên cao |
| 16.D khoang lab | L (1wk) | song song · ưu tiên cao · rủi ro cao nhất |
| 16.E landing thực hành DevOps | L (1wk) | Thay thiết kế 3D theo chỉ đạo 2026-09-12–13. |
| 16.F admin | M (3d) | song song |
| 16.G author | L (1wk) | song song · lane nặng nhất trong ba lane quản trị |
| 16.H me + settings | M (3d) | song song |
| 16.I cổng | M (3d) | Tuần tự, sau tất cả. |
| **Tổng** | **~3,5 tuần** | Đường găng: 16.0 → 16.A → max(16.C, 16.D, 16.E, 16.G) → 16.I |

Nếu chạy tuần tự thì cùng khối lượng đó là khoảng 8 tuần. Phần tiết kiệm nằm ở bảy lane chạy
cùng lúc, và nó chỉ có thật nếu ba hợp đồng ở 16.0 đủ chặt để bảy lane không phải hỏi nhau.

---

## 7. Ô nghiệm thu toàn chặng

1. `SCREENS` phủ 32 màn, `MIN_SCREENS` = 32, 0 lỗi axe serious/critical trên mọi màn.
2. `csp.spec.ts` xanh trên 32 màn, **không nới một chỉ thị CSP nào**.
3. `KEYBOARD_SCREENS` ≥ 10, gồm `/labs/:id` và `/lessons/:id`, có ca thoát focus khỏi terminal.
4. Cổng màu trần xanh trên `apps/web/src` và `packages/ui/src`, có đối chứng âm/dương.
   Miễn trừ theo tên trong `KNOWN_HARDCODED` phải có lý do và kiểm hết hạn; gồm ranh giới
   xterm và phạm vi Arena ghi ở §8. Không gọi kết quả này là toàn repo tuyệt đối không có màu thô.
5. Test contrast tính lại mọi token PTIT, trộn alpha trong sRGB mã hoá gamma.
6. `packages/copy`: 0 ký tự `—`, 0 chuỗi mất dấu. Cùng phép kiểm mất dấu chạy trên `content/**`.
7. Hợp đồng bốn trạng thái xanh, kèm đối chứng dương.
8. Test bất biến terminal: cùng node cha qua đổi tab; hàng editor vắng mặt vẫn render kèm
   `hidden` và **không** mang tiện ích `display`.
9. Test đối chiếu icon `ResourceKind` giữa `packages/ui` và arena, xanh.
10. Ngân sách LCP mới cho `/`, có số đo thật trong chú thích.
11. `pnpm -w turbo run build lint typecheck test` xanh. **Đọc dòng `Tasks: X/Y` trước khi trích
    bất kỳ con số test nào** — turbo dừng sau task đỏ, nên các suite phía sau **chưa chạy**, và
    một báo cáo trích số từ lượt đó là báo cáo về một suite không tồn tại.

    Đợt 2026-09-12–13 chạy đủ bốn loại kiểm tra bằng lịch tách có chủ ý: bảy package qua
    `turbo --force` (**28/28, 0 cache**); web chạy build, lint, typecheck và toàn bộ test riêng.
    Lý do: `typecheck` trong turbo phụ thuộc `build`, có thể ghi lại `.next` lúc E2E dùng nó;
    lượng worker đồng thời cũng gây timeout trên máy Windows. Đây không phải lời khai một
    lượt turbo **32/32** mới. Log từng bước được giữ; lượt chạy rộng đã đỏ trước đó được ghi
    là thất bại, không dùng phần xanh của chúng thay cho kết quả cuối.

---

## 8. Đóng nợ và ranh giới còn áp dụng

Chỉ đạo ngày 2026-09-12 mở rộng đợt hoàn thiện sang các khoản dưới đây. Không còn coi SMTP,
nguồn problems, copy hay bundle là việc tự động để dành sau P16.

| Khoản được yêu cầu xử lý | Kết quả và chứng cứ |
|---|---|
| Hai màn problems không có dữ liệu để tới | **Đã đóng**: `ad197a3` thêm 10 bài, `cc28626` gộp lane SEED; DB cục bộ đọc lại đủ 10 bài published `K8S-0001`..`K8S-0010`. **36 axe + 37 CSP trên đủ 32 màn qua**, gồm hai route thiếu dữ liệu trước đây và kiểm heading bổ sung. |
| Keyboard chưa chạy với terminal thật | **Đã đóng**: gateway/orchestrator nối sandbox Sysbox thật, đợi READY và dọn phiên của test. Toàn bộ **44 ca keyboard** qua ở lượt cuối, gồm D10 xác minh PTY thật, byte Escape, thoát focus và cặp thao tác chậm; SearchTabs native không còn focus vào nội dung ẩn. |
| Chưa nhìn cảnh 3D | **Yêu cầu được thay thế bởi chủ dự án**: xoá toàn bộ cảnh và vòng landing. Đã nhìn ảnh trang mới và qua bốn ca trình duyệt; không coi ảnh 3D cũ là nghiệm thu mới. |
| 13 file author và nhóm 10 + 8 của author/problems | **Đã chuyển toàn bộ file sản phẩm còn dở**: 466 chuỗi / 31 file và 44 lỗi có `what`/`next`. AST gate giữ đúng fixture được miễn và không còn file sản phẩm bị hoãn. Số “8” cũ gồm fixture; bảy helper sản phẩm đã chuyển. [Báo cáo copy](../../reports/p16-2026-09-12-copy.md). |
| Copy catalog, problem detail, quiz | **Đã đóng các phần sản phẩm còn dở**. Gate quét đủ năm cây và có đối chứng hai chiều; copy 63 test và kiểm kiểu đều qua. |
| `CopyRef` sai tầng; nhãn problem ngoài bản đồ | **Đã đóng**: `86a32e4` chuyển `CopyRef`/`renderCopy` về `packages/copy`; đợt này thêm kiểm cặp khoá/tham số ở compile time. Nhãn game giữ tên export, lấy câu qua surface `problem`; `games → copy`, không có phụ thuộc ngược. |
| Bốn bộ chọn biên tập ở `apps/web` | **Chốt ranh giới theo kiểu miền**: selector ở ứng dụng và trả `CopyRef`; câu ở copy. Không kéo kiểu miền ứng dụng vào gói copy không có runtime dependency. Hợp đồng được cập nhật, thiếu kiểm tham số cũ đã được đóng bằng correlated union và ca compile âm/dương. |
| Ba lỗi lab P15 | **Đã sửa trước phiên này** ở `5d90ad1` + `6d8d2fc`, chọn hướng B chạy setup nền. [Báo cáo P15](reports/2026-09-10-verify-p15.md) có quota/pod, lỗi browser và thử tải thật. Chạy lại 50 regression xanh; không tuyên bố đo lại đường cong tải trong phiên P16. |
| Backend reset mật khẩu | **Đã triển khai và kiểm SMTP thật**: 21 ca integration/form/privacy; trình duyệt lấy thư từ Mailpit, nhập mã và đăng nhập bằng mật khẩu mới thành công. Secret SMTP production phải cung cấp khi triển khai; chưa có provider production và không gửi thư tới người dùng thật. [Báo cáo backend](../../reports/p16-2026-09-12-backend.md). |
| Cổng bundle | **Đã có và đã đo lại**: `c27e4e4` + `607193d`, gộp `1e5e8c2`; chạy `pnpm bundle:check` riêng sau build. 4/4 route có terminal nhận xterm, 33 route còn lại không nhận; mọi trần byte đạt. |
| Chữ primary tối thiếu tương phản | **Đã sửa** thành `oklch(0.68 0.19 26.7)`. Tỷ lệ background **6.3056**, card **5.7071**, muted **4.8157**; ba cặp đi vào `TEXT_PAIRS` ngưỡng 4.5 và giữ màu cũ làm đối chứng âm. |

Ranh giới sản phẩm vẫn cần nói rõ:

- **Tab Editor của lab chưa được thêm.** `Lab` chưa có `interfaceLayout`; việc dời `IdePane`
  chỉ gỡ rào cản component. Hiện trang lab chủ ý không truyền `editor`. Không dùng kết quả
  keyboard terminal để khẳng định lab đã có IDE; đây là mở rộng schema/nội dung ngoài phần
  dựng lại giao diện đang nghiệm thu.
- **Arena giữ phạm vi riêng.** Không dựng lại `components/k8s-arena/**`; miễn màu của
  `arena.css` và `node-geometry.ts` vẫn là miễn theo phạm vi có tên, phải rà lại khi Arena được
  đưa vào yêu cầu thiết kế. `packages/games` chỉ mở phạm vi phần nhãn problem nêu trên.
- **Gửi thư đã nhận không phải giao thư bền vững.** `Next after()` có thể bị ngắt khi tiến
  trình chết; chưa có hàng đợi bền vững. UI và tài liệu ghi đúng giới hạn này.

Lượt core đầu **157 qua / 8 lỗi / 0 skip** được giữ làm lịch sử điều tra. Hai ca terminal,
hai lỗi focus SearchTabs ẩn và bốn lỗi author tràn 390px đã được sửa; 15 vấn đề heading moderate
cũng được xử lý bổ sung. Lượt cuối **171/171 qua, 0 lỗi/skip/retry** trên build
`HZG3aU7v-lBMcBxxAFsSE` đóng 16.I. Bằng chứng cuối:
[log E2E](../../reports/p16-2026-09-12-e2e-all-final.log),
[artefact trình duyệt](../../reports/harness/2026-09-12-p16-runtime/acceptance-all-green/).
