# Ngân sách bundle — cổng `bundle:check`

`scripts/check-bundle-budget.mjs`, chạy ở CI tại bước **"Cổng ngân sách bundle
(bundle:check)"** trong job `ts` của `.github/workflows/ci.yml`, ngay sau bước
`turbo run lint typecheck build test`.

```bash
pnpm --filter @devops-platform/web build   # PHẢI có trước
pnpm bundle:check                          # đo cây build
node scripts/check-bundle-budget.mjs --self-test   # chỉ kiểm luật, chạy được mọi lúc
```

Mã thoát: `0` đạt · `1` vượt ngân sách / lệch sổ cái · `2` tự kiểm hỏng, chưa
build, hoặc hình dạng output của Next đã đổi.

## Nó gác gì

Ô AC gốc — `plans/devops-learning-platform/phase-14-exec.md:21`:

> AC "không kéo xterm.js vào trang không có terminal" của phase gốc hiện **chưa
> có phép đo**.

Cổng này là phép đo đó, và nó khẳng định **bốn** thứ.

| # | Chiều | Nội dung | Vi phạm in ra |
|---|---|---|---|
| 1 | CẤM | Không route nào ngoài `TERMINAL_ROUTES` được với tới chunk chứa xterm.js | `xterm-lọt` |
| 2 | ĐỐI CHỨNG DƯƠNG | Mọi route trong `TERMINAL_ROUTES` **phải** với tới chunk xterm | `thiếu-đối-chứng-dương` |
| 3 | SỔ CÁI | Route khai trong `TERMINAL_ROUTES` phải tồn tại trong build | `route-khai-đã-biến-mất` |
| 4 | TRẦN BYTE | Nền chung, từng route, và chunk xterm đều dưới trần | `trần-nền-chung` · `trần-route` · `trần-chunk-xterm` |

Chiều 2 tồn tại vì chiều 1 một mình là một cổng không bao giờ đỏ được: xoá sạch
terminal khỏi cả bốn route thì chiều 1 vẫn xanh, và ta mất phép đo mà không ai
biết (`.claude/rules/green-that-proves-nothing.md`). Ca `"route có terminal mất
sạch xterm"` trong `CASES` của script là ca chứng minh chiều 2 không phải trang
trí — gỡ chiều 2 khỏi `analyze()` thì đúng ca đó chuyển sang xanh và **tự kiểm
đỏ ngay**, trước khi script kịp đọc đĩa.

## Nó đo bằng gì (và không đo bằng gì)

**Không phải `size-limit`.** Câu hỏi thật không phải "bundle có to không" mà là
"chunk của route X có với tới xterm không". `size-limit` đo tổng byte của một
entry point và không phân biệt theo route.

**Không phải `.next/app-build-manifest.json`.** File đó **không tồn tại** ở repo
này: Next 16.3 build bằng Turbopack (`.next/turbopack` có mặt) và Turbopack
không sinh manifest đó. `.next/build-manifest.json` chỉ nói về router `pages/`.

Nguồn thật là per-route: `.next/server/app/**/page_client-reference-manifest.js`
→ `globalThis.__RSC_MANIFEST["<route>"].entryJSFiles` → hợp nhất thành tập
`static/chunks/*.js` của route. Byte lấy từ `statSync` của chính file chunk.

Chunk xterm được nhận bằng **dấu vân tay nội dung** (`xterm-scrollable-element`,
`is not supported in xterm.js`, …), không bằng tên file — tên chunk là hash và
đổi mỗi lần build.

### ⚠ "với tới được" ≠ "tải ngay"

xterm đến bốn route qua `next/dynamic({ ssr: false })`
(`terminal-pane.tsx:59` → `terminal-surface-lazy.tsx`), tức nạp sau hydrate.
Turbopack vẫn liệt chunk đó trong `entryJSFiles` của route. Nên cột byte đọc là
**"route này với tới được bao nhiêu byte JS"**, không phải "trang nặng ngần này
lúc mở". Điều đó vẫn đủ cho ô AC: một route không có chunk trong tập của mình
thì chứng minh được là không bao giờ tải nó, bằng đường nào cũng vậy.

## Số đo cơ sở (2026-09-13)

Build sạch trên Windows, `NEXT_OUTPUT` không đặt. **63 chunk JS, 37 route có chunk.**
Nguồn: `reports/2026-09-13-landing-3d-bundle-final.log`.

| Đại lượng | Đo được | Trần |
|---|---:|---:|
| Nền chung (7 chunk, ≥90% route) | 1 050 883 B (1026 KB) | 1 150 000 B |
| Chunk xterm (1 chunk, đúng 4 route) | 535 793 B (523 KB) | 620 000 B |
| Route nặng nhất — `/labs/[id]` (có terminal) | 1 707 005 B | 1 850 000 B |
| Route nặng nhất KHÔNG có terminal — `/games/k8s` | 1 486 667 B | 1 850 000 B |
| Trang chủ `/` (three.js nạp lười, không terminal) | 1 080 511 B | 1 850 000 B |
| Route nhẹ nhất — `/dashboard` | 1 050 883 B | — |

Bốn route có terminal: `/labs/[id]`, `/lessons/[id]`, `/playgrounds/[id]`,
`/session/[id]/terminal`. 33 route còn lại không với tới xterm.

### Đo lại 2026-09-14 — mọi route NHỎ ĐI ~260KB dù thêm cả P17

Nguồn: CI run `34809642334` trên `main@6f19cbe` (job TypeScript → `bundle:check`).

| Đại lượng | 2026-09-13 | 2026-09-14 | Δ | Trần |
|---|---:|---:|---:|---:|
| Nền chung (7 chunk) | 1 051 155 B | **786 785 B** | −264 370 | 1 150 000 B |
| Chunk xterm (4 route) | 535 793 B | 535 829 B | +36 | 620 000 B |
| Route nặng nhất — `/labs/[id]` | 1 707 005 B | **1 441 705 B** | −265 300 | 1 850 000 B |
| Nặng nhất KHÔNG terminal — `/games/k8s` | 1 486 940 B | **1 226 905 B** | −260 035 | 1 850 000 B |
| Trang chủ `/` | 1 080 511 B | **816 773 B** | −263 738 | 1 850 000 B |
| Nhẹ nhất — `/dashboard` | 1 050 883 B | **786 785 B** | −264 098 | — |

Điều đáng chú ý là **hướng** của nó. Cùng lượt này `main` nhận thêm trọn chặng P17
(32 level game Git, engine, renderer SVG) **và** ba bản nâng dependency — trong đó
`zod 4.4.3 → 4.5.4` một mình cộng 91 364 B vào nền chung. Vậy mà mọi route vẫn nhỏ
đi. Hai bản vá giải thích toàn bộ khoảng chênh:

1. **Side effect tầng module** trong `packages/games/src/git/levels/index.ts` — một
   lời gọi khẳng định làm cả module không tree-shake được, kéo theo 32 file level và
   engine Git. Chunk 369 938 B chứa engine nằm ở **7/38 route**, gồm `/games/k8s` và
   5 route `problems` — những trang không có một dòng nào của game Git. Gỡ lời gọi
   (phép kiểm đó đã trùng với `levels.test.ts`) + khai `"sideEffects": false`:
   `/games/k8s` −271 162 B, chunk engine còn **1/38 route**.
2. **Barrel Zod bị NEO vào nền chung** — `apps/web/src/lib/zod-jitless.ts` nhập
   `{ z } from 'zod'` chỉ để bật cờ `jitless`, và `app-shell.tsx` **cố ý** giữ tham
   chiếu để bundler khỏi cắt module. App-shell nằm trong cây mọi trang ⇒ cả barrel
   classic của Zod vào nền chung, để đặt một boolean. Đổi sang
   `import { config } from 'zod/v4/core'` (cùng một hàm — `config === z.config`, đã
   chạy để kiểm chứ không suy từ tài liệu): nền chung −359 911 B, 7 chunk → 6.

**Không trần nào bị sửa ở lượt này**, và đó là điều đúng: cổng đỏ vì một hồi quy
thật, và cách đóng nó là gỡ hồi quy chứ không nới trần (`pinned-baseline-test-companion`).

### Hạ trần 2026-09-18 — 1 150 000 → 870 000 (đóng khoản nợ ⚠ ở dưới)

Khoản nợ "trần dư 32%" ghi ⚠ ở cuối mục dưới nay đã đóng. Trần nền chung hạ từ
`1 150 000` xuống **`870 000`** ([`scripts/check-bundle-budget.mjs`](../scripts/check-bundle-budget.mjs)
hằng `BUDGETS.sharedBaselineBytes`). Với số đo hiện tại 786 785 B:

- headroom còn **~10,6%** — đúng khoảng "~10–15%" mà chú thích của chính hằng đó đặt ra,
  thay cho 32% đã trôi khỏi ý định gốc;
- một cú bump cỡ **91 KB** (đúng cỡ `zod` từng cộng) đẩy nền chung lên ~878 KB **> 870 000**
  ⇒ cổng ĐỎ, tức khôi phục đúng khả năng bắt-hồi-quy mà mục ⚠ lo mất.

Hai trần còn lại giữ nguyên (`routeBytes 1 850 000`, `xtermChunkBytes 620 000`) — route
nặng nhất còn dư 22% và chunk xterm còn dư 13,6%, đều trong khoảng lành. Đây là **khôi phục
ý định đã ghi**, không phải chính sách mới; muốn khác thì sửa số ngay tại hằng kèm ngày + lý do.

⚠ **Trần nay rất lỏng và đó là một khoản nợ mới.** Nền chung ở 786 785 / 1 150 000
còn dư **363 215 B (32%)**, so với 8,6% của mốc cũ. Một cổng dư 32% sẽ **không** bắt
được lần bump 91KB tiếp theo — chính là cỡ mà `zod` vừa cộng vào. Hạ trần là quyết
định của chủ dự án, không phải việc cổng tự làm; ghi ra đây để nó không trôi.

### ⚠ `/games/k8s` không còn là route duy nhất dùng three.js

Bảng cũ gọi nó là "route nặng nhì (three.js, **không** terminal)". Hai vế đó nay đều sai:

- **Không còn nặng nhì.** Ba route terminal nữa đã vượt nó (`/lessons/[id]` 1 700 190 B,
  `/playgrounds/[id]` 1 692 774 B, `/session/[id]/terminal` 1 595 178 B), nên nó đứng **thứ năm**
  toàn cục. Nó vẫn là route nặng nhất trong nhóm không có terminal, và đó mới là điều đáng ghi.
- **Không còn là nơi duy nhất có three.js.** Từ 2026-09-13 trang chủ `/` cũng chạm three.js qua
  hành trình 3D cuộn, nạp lười bằng `next/dynamic({ ssr: false })`.

Vì cách nạp khác nhau, hai route đọc ra rất khác nhau trong bảng trên: `/games/k8s` kéo three
vào tập chunk của chính route (1 486 667 B, 10 chunk), còn `/` chỉ 1 080 511 B với 9 chunk —
**hơn nền chung 29 628 B**. Khoảng cách đó không có nghĩa là trang chủ nhẹ hơn khi dùng thật:
manifest route **không liệt kê mọi chunk Three/R3F nạp lười**. Lượt đo runtime thật của trang
chủ ngày 2026-09-13 ghi **16 chunk JS, 679 373 B encoded body, 2 438 813 B decoded body và
684 173 B transfer** (`reports/2026-09-13-landing-3d-completion.md`). Đây đúng là bẫy đã ghi ở
mục "với tới được ≠ tải ngay" ở trên, chỉ khác chiều: ở đây manifest **thiếu** chunk chứ không
thừa.

### Nền chung đi từ 998 512 B lên 1 050 883 B ở đâu

Chênh **+52 371 B** so với mốc 2026-09-11 cũ, và **phần lớn không phải do lane 3D**. Ba lượt đo
cùng một script, đọc từ ba log trong `reports/`:

| Mốc | Nền chung | Chunk | `/labs/[id]` | `/games/k8s` | `/` | Log |
|---|---:|---:|---:|---:|---:|---|
| 2026-09-11 | 998 512 B | 62 | 1 654 621 B | 1 433 087 B | — | (bảng cũ của tài liệu này) |
| 2026-09-12 (landing KHÔNG 3D) | 1 047 523 B | 60 | 1 703 645 B | 1 483 274 B | 1 055 658 B | `p16-2026-09-12-bundle-final.log` |
| 2026-09-13 (landing 3D) | 1 050 883 B | 63 | 1 707 005 B | 1 486 667 B | 1 080 511 B | `2026-09-13-landing-3d-bundle-final.log` |

- **+49 011 B** rơi vào khoảng 09-11 → 09-12, tức đợt dựng lại landing P16 **trước khi** 3D quay
  lại. Nền chung tăng thì mọi route tăng theo cùng một lượng, nên `/labs/[id]` (+49 024 B) và
  `/games/k8s` (+50 187 B) dịch gần đúng bằng nền.
- **+3 360 B** rơi vào 09-12 → 09-13, là phần lane 3D thật sự thêm vào nền chung. Đúng bằng mức
  `/labs/[id]` tăng trong cùng khoảng (+3 360 B), tức lane 3D **không** đẩy thêm gì riêng cho các
  route terminal.
- Phần nặng của lane 3D nằm ở route chủ, không ở nền: `/` đi từ 1 055 658 B (8 chunk) lên
  1 080 511 B (9 chunk), tức phần riêng của route tăng từ 8 135 B lên 29 628 B so với nền.
- Chunk xterm **không đổi** qua cả ba lượt: 535 793 B, đúng 4 route.

Không trần nào bị sửa trong hai lượt này. Nền chung ở 1 050 883 / 1 150 000 B còn **99 117 B**
dư (8,6%), và đó là con số cần nhìn trước khi thêm bất cứ thứ gì vào nền.

## Nới trần / miễn trừ

Không có cơ chế miễn trừ theo file như `check-design-tokens.mjs` — ở đây "miễn
trừ" chỉ có hai dạng, và cả hai đều là **sửa hằng trong script kèm ngày và lý
do**, không sửa lặng lẽ:

1. **Thêm một route có terminal** → thêm khoá route (`/…/page`, route group
   nằm trong khoá) vào `TERMINAL_ROUTES`. Chunk xterm ở route đó lập tức hợp lệ,
   và chiều 2 bắt đầu gác nó luôn.
2. **Gỡ terminal khỏi một route** → **xoá** khoá khỏi `TERMINAL_ROUTES`. Cổng sẽ
   tự báo `thiếu-đối-chứng-dương` nhắc việc này; đừng thêm terminal lại cho khớp
   sổ cái.
3. **Nâng trần** → sửa `BUDGETS` trong script, ghi lại số đo mới + ngày + lý do
   ngay tại khối chú thích số đo cơ sở, và cập nhật bảng ở trên. Nâng trần là
   **ghi nhận một khoản nợ**, không phải dập báo động.

## Hai chỗ cổng cố ý ĐỎ thay vì xanh

- **Chưa build** (`.next/server/app` hoặc `.next/static/chunks` không có) → thoát
  2. Một cổng đo output build mà đọc thư mục rỗng rồi báo xanh là kiểu xanh vô
  nghĩa nguy hiểm nhất ở đây.
- **0 chunk khớp vân tay** → thoát 2, kèm hướng dẫn. Đó không phải "sạch": nó
  làm chiều CẤM xanh trên mọi route mà chẳng đo gì. Hoặc xterm đã bị gỡ khỏi dự
  án (thì xoá cổng), hoặc `@xterm/xterm` nâng version và đổi chuỗi (thì sửa
  `XTERM_FINGERPRINTS`).

## Liên quan

- `apps/web/src/components/session/terminal-theme.test.ts` — cổng **tĩnh** giữ
  kỷ luật import subpath `./themes` (server-an-toàn). Nó gác nguồn; cổng này gác
  byte. Cần cả hai.
- `packages/terminal/package.json` — vì sao subpath `"."` và `"./themes"` tách
  đôi, và vì sao `@xterm/*` ghim version chính xác.
- `scripts/check-design-tokens.mjs` — cùng khuôn: lõi thuần + tự kiểm chạy trước
  khi quét, và bước CI riêng chứ không nhét vào `turbo run`.
