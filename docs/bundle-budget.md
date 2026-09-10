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

## Số đo cơ sở (2026-09-11)

Build sạch trên Windows, `NEXT_OUTPUT` không đặt. 62 chunk JS, 37 route có chunk.

| Đại lượng | Đo được | Trần |
|---|---:|---:|
| Nền chung (7 chunk, ≥90% route) | 998 512 B (975 KB) | 1 150 000 B |
| Chunk xterm (1 chunk, đúng 4 route) | 535 793 B (523 KB) | 620 000 B |
| Route nặng nhất — `/labs/[id]` (có terminal) | 1 654 621 B | 1 850 000 B |
| Route nặng nhì — `/games/k8s` (three.js, **không** terminal) | 1 433 087 B | 1 850 000 B |
| Route nhẹ nhất — `/dashboard` | 998 512 B | — |

Bốn route có terminal: `/labs/[id]`, `/lessons/[id]`, `/playgrounds/[id]`,
`/session/[id]/terminal`. 33 route còn lại không với tới xterm.

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
