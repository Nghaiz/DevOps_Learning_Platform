# Review U2 — Next.js 16.3 + `middleware.ts`→`proxy.ts`

**Nhánh:** `chore/toolchain-u2-next16-proxy` (5 commit so với `main`)
**Ngày:** 2026-08-09 · **Phạm vi:** chỉ diff `main...HEAD` · **Kết luận:** không có Critical; 3 Important, 5 Minor.

---

## 1. Diff logic trong `proxy.ts` — 0 dòng (đạt)

Đã kiểm hai lớp:

1. `git diff main...HEAD -- apps/web/src/{middleware,proxy}.ts` → git nhận rename (`similarity index 84%`), lịch sử file giữ được (`git mv` đúng như U2.B-4).
2. Diff **sau khi lột hết comment + whitespace** (`sed 's://.*::'` + strip space) giữa `main:apps/web/src/middleware.ts` và `HEAD:apps/web/src/proxy.ts` — chỉ còn **đúng một dòng**:

```
- exportfunctionmiddleware(request:NextRequest):NextResponse{
+ exportfunctionproxy(request:NextRequest):NextResponse{
```

Kèm theo:

- `config.matcher` **giữ nguyên** (`['/((?!_next/static|_next/image|favicon.ico).*)']`, proxy.ts:117-119).
- Thứ tự 4 luật giữ nguyên: nonce sinh trước mọi early-return (L44-53) → body cap 413 (L57) → rate limit 429 (L67-82) → CORS preflight 204 (L86-95) → session gate redirect (L100-106) → `NextResponse.next` + `x-nonce` (L110-114).
- `clientKey()` **byte-identical** (chỉ khối JSDoc phía trên đổi) → **D2 tôn trọng**.
- `apps/web/src/server/security/rate-limit.ts` **không nằm trong diff** → D2 tôn trọng.

**Acceptance #1, #3: ĐẠT.**

## 2. Import test + dấu vết cũ (đạt)

- 3 file test đổi đúng `../middleware` → `../proxy` (rule-02:4, rule-05:5, rule-09:4).
- `grep -rn "from '\.\./middleware'"` trong `apps/web/src` → **0**.
- `find apps/web/src -name "middleware*"` → **0 file**.

**Acceptance #2: ĐẠT** (còn dư comment — xem I1/M4).

## 3. Deviation `useTypeScriptCli: false` — lập luận ĐÚNG, đọc lại source xác nhận

Đọc `apps/web/node_modules/next/dist/lib/verify-typescript-setup.js` + `.../typescript/runTypeScriptCli.js`:

| Sự kiện trong source | Xác nhận |
|---|---|
| `typescriptCliPackage = { file: 'typescript/bin/tsc', pkg: 'typescript' }` (verify-typescript-setup.js:88-92) | Kiểm tồn tại dependency đi qua đúng đường dẫn literal này |
| `getTypeScriptPackageInfo()` lấy `tscPath` từ `packageJson.bin.tsc` của package `typescript` đã resolve (runTypeScriptCli.js) | Không có knob config trỏ binary khác |
| `typescript` trong repo = `@typescript/typescript6@6.0.2`, `bin = { tsc6 }`, **không có** `bin/tsc`; **có** `lib/typescript.js` | CLI mode chết; API mode chạy |
| `if (!useTypeScriptCli && !hasNativePreview && installedTypeScript && !installedTypeScript.apiPath) throw` (L127) | `false` hợp lệ vì shim có apiPath |

**Có đường nào giữ CLI TS7 mà không hack? Không.** Ba đường đã soi:

1. **Trỏ `typescript` về TS7 thật** — `@typescript/native` = `typescript@7.0.2`, `bin.tsc` ✅ nhưng **không có `lib/typescript.js`** (đã `ls`, không tồn tại). CLI mode sẽ chạy, nhưng `typescript-eslint` lấy JS API qua chính specifier `typescript` → lint vỡ. Một specifier không phục vụ được cả hai vai.
2. **`pnpm patch` shim để thêm `bin.tsc`** — vừa là hack, vừa vô nghĩa: bin đó sẽ là **tsc TS6**, tức chạy CLI để gọi đúng compiler mà API mode đang gọi, cộng thêm một process. Tệ hơn hiện trạng.
3. **Cài `@typescript/native-preview`** — Next có nhánh riêng (`hasNativeTypeScriptPreview`), nhưng nhánh đó **chỉ được xét khi `useTypeScriptCli === false`**, và khi nó kích hoạt (chỉ khi package `typescript` vắng hoàn toàn) Next log *"…require the standard `typescript` package"* rồi **return sớm — bỏ hẳn typecheck lúc build**. Nghiêm ngặt hơn thì đây là bước lùi, không phải giải pháp.

→ Deviation là lựa chọn đúng. Cổng TS7 thật nằm ở `pnpm typecheck` trong CI (`turbo run lint typecheck build test`), đã có mặt tường minh.

**Cảnh báo đi kèm:** đừng bao giờ "đơn giản hoá" bằng `typescript.ignoreBuildErrors: true` — đó mới là nới cổng thật sự.

## 4. Deviation gitignore `next-env.d.ts` — đã spot-check fresh clone

Tiền đề được xác nhận tại source: `writeAppTypeDeclarations({ baseDir, distDir, ... })` chạy trên **cả hai nhánh** của `verifyAndRunTypeScript` và nhận `distDir` → `next dev` ghi `import "./.next/dev/types/..."`, `next build` ghi `./.next/types/...`. Commit bản nào thì lệnh kia cũng làm bẩn cây. Ngoài ra bản trên `main` dùng `/// <reference path="./.next/types/routes.d.ts" />` trỏ vào file **không được commit** — tức fresh clone trên `main` vốn đã trỏ vào hư không; deviation làm tình trạng này **tốt lên**, không xấu đi.

**Spot-check đã chạy (và đã khôi phục nguyên trạng, `git status` sạch):**

| Tình huống mô phỏng | `tsc --noEmit` | `eslint .` |
|---|---|---|
| Không có `next-env.d.ts`, còn `.next/` | exit **0** | exit **0** |
| Không có `next-env.d.ts`, **và** `.next/` bị di dời khỏi repo (giống hệt fresh clone) | exit **0** | exit **0** |

*Lưu ý phương pháp:* lần thử đầu đổi tên `.next` → `.next-review-bak` **tại chỗ** cho ra 15.832 lỗi eslint — đó là **artifact của phép thử** (thư mục build output thoát khỏi ignore pattern nên bị lint), không phải phát hiện. Đã làm lại bằng cách chuyển hẳn ra ngoài repo; kết quả là hai số 0 ở trên.

Lý do fresh clone an toàn: app có `src/types/css.d.ts` **của riêng nó** (không phụ thuộc ambient của `next-env`), và **không** dùng `PageProps` / `LayoutProps` / typed-route helper nào (`grep` → 0). Xem I2 — đây chính là điều kiện có thể mất.

**Acceptance #5: ĐẠT, kèm cảnh báo I2.**

## 5. `AGENTS.md` / `CLAUDE.md` (đạt)

`node_modules/next/dist/server/lib/generate-agent-files.js` xác nhận: Next sinh **cả hai** file (`AGENTS.md` + `CLAUDE.md`, `CLAUDE_MD_CONTENT = "@AGENTS.md\n"`), marker `<!-- BEGIN:nextjs-agent-rules -->`. Nội dung đã commit trỏ đúng `node_modules/next/dist/docs/` (không phải `.next-docs/`). `CLAUDE.md` không có trong danh sách ownership của plan nhưng **bắt buộc phải commit** để đạt acceptance "git status sạch sau `next dev`" — hợp lệ, không phải scope creep.

**Acceptance #6: ĐẠT.**

## 6. File ownership (đạt, các deviation chính đáng)

Không đụng `services/`, `packages/`, `infra/`, `proto/`, `server/security/rate-limit.ts` — xác nhận qua `git diff --stat`.

| File ngoài ownership | Đánh giá |
|---|---|
| `.gitignore` (+4 dòng) | Chính đáng — deviation đã khai, có comment lý do tại chỗ |
| `apps/web/next-env.d.ts` (xoá) | Chính đáng — hệ quả trực tiếp của trên |
| `README.md` (1 dòng) | Chính đáng — ghi mặt suy giảm thứ 3, đúng nơi đã có mục "Mặt suy giảm đã chấp nhận" |
| `apps/web/CLAUDE.md` | Chính đáng — Next sinh cùng AGENTS.md (đã xác minh ở §5) |
| 4 file src comment-only (logout route, headers.ts, body-limit.ts, init.ts) | Chính đáng về nguyên tắc — **nhưng làm chưa hết**, xem I1 |

---

# Findings

## Critical (phải sửa trước merge)

Không có.

## Important (nên sửa trước merge)

**I1 — Quét rename chưa hết, 3 chỗ còn trỏ vào file không tồn tại.** PR đã sửa comment ở 4 file vì lý do "rename làm stale", nhưng bỏ sót 3 chỗ cùng loại — trong đó có 2 chỗ nêu **đường dẫn file** giờ đã chết:

- `apps/web/src/app/layout.tsx:19` — *"`nonce` đọc từ header `x-nonce` mà `src/middleware.ts` gắn vào mỗi request"*. Đây là file **tiêu thụ hợp đồng x-nonce** — trỏ sai đường dẫn ở đúng chỗ này là gây lạc lối nhất.
- `apps/web/src/app/dashboard/page.tsx:9-10` — *"`middleware.ts` chỉ kiểm sự TỒN TẠI của cookie (**Edge**, không đụng DB)"*. Sai **hai lần**: sai tên file và sai runtime (Node, không phải Edge) — đúng loại sai mà U2.B-7 yêu cầu sửa trong `proxy.ts`.
- `apps/web/src/server/trpc/init.ts:76` — vẫn `` `middleware.ts` ``, trong khi **2 chỗ khác cùng file (L63, L67) đã được sửa** ở commit này. Sửa 2/3 trong một file là dấu hiệu quét bằng mắt chứ không bằng grep.

Chọn một: hoàn tất sweep (khuyến nghị) hoặc revert 4 file kia. Comment gọi tên một file không tồn tại tệ hơn là churn.

**I2 — Cổng typecheck TS7 ở CI đang kiểm một program KHÁC và phụ thuộc thứ tự chạy.** `turbo.json` khai `typecheck: { dependsOn: ["^build"] }` — chỉ upstream package, **không** phụ thuộc `build` của chính `apps/web`. CI chạy `pnpm turbo run lint typecheck build test` trên bản clone sạch, nên tại thời điểm `tsc --noEmit` chạy:

- `next-env.d.ts` (giờ gitignored) có thể chưa tồn tại → mất `/// <reference types="next" />` + `next/image-types/global`;
- `.next/types/**` có thể chưa tồn tại → mất route types / `PageProps` sinh tự động;
- và vì `build` chạy **song song**, hai điều trên có thể đổi giữa các lần chạy → program của tsc không tất định.

Hôm nay vẫn xanh (mình đã đo, §4) **chỉ vì** app tự khai `src/types/css.d.ts` và chưa dùng `PageProps<'/...'>` — vốn là cách viết idiomatic của Next 16. Ngày ai đó viết `PageProps`, cổng này thành xu sấp ngửa: xanh nếu build kịp, đỏ nếu không.

Đề xuất (một dòng): `"typecheck": { "dependsOn": ["^build", "build"] }` — hoặc, nếu cố ý muốn typecheck độc lập build, ghi rõ trong `turbo.json` rằng cổng TS7 **không** phủ generated types và ai thêm `PageProps` phải đổi dependsOn. Deviation này sinh ra lỗ hổng nên nó thuộc PR này.

**I3 — Plan of record mâu thuẫn với code và chưa được sửa.** `plans/toolchain-upgrade-ts7-next16/plan.md`:

- U2.D-11 viết **"Không khai `experimental.useTypeScriptCli` — … khai `false` sẽ làm `next build` chết vì TS7 không có JS API"** → nhánh làm ngược lại. Tiền đề của plan **sai**: `typescript` resolve về shim TS6 (có `lib/typescript.js`), không phải TS7. Code đúng, plan sai.
- Acceptance vẫn còn dòng *"`next build` typecheck qua `tsc` CLI (TS7) — xác nhận bằng log build"* → tiêu chí này **không đạt** và sẽ không bao giờ đạt.
- Thư mục `plans/toolchain-upgrade-ts7-next16/` hiện **untracked** (`git status` → `??`). Plan of record nằm ngoài git, nên dấu vết deviation chỉ còn ở commit message + README.

Sửa U2.D-11 + dòng acceptance thành deviation đã chốt, rồi commit plan vào repo.

## Minor

**M1 — Comment về CVE giờ đã lỗi thời ở 2 nơi, do chính bump này.** Lockfile đưa `postcss 8.4.31 → 8.5.23` và `sharp 0.34.5 → 0.35.3` — đúng hai package mà hai chỗ sau đổ lỗi cho next 15:

- `apps/web/Dockerfile` — *"3 CVE còn lại (postcss, sharp) do next@15.5.23 ghim, không tự vá được"*. Giờ đã vá được (và có thể đã vá xong). Con số "10 CVE (HIGH 9, CRITICAL 1)" cũng cần đo lại.
- `.github/workflows/ci.yml` (khối Trivy) — dùng đúng lập luận đó để **không chặn ở HIGH**. Nếu 3 CVE kia đã biến mất thì lý do giữ ngưỡng nới không còn; ít nhất phải đo lại rồi ghi ngày.

Không bắt buộc trong PR này, nhưng phải vào việc — một lời biện minh hết hạn là cổng nới vĩnh viễn.

**M2 — Không có bằng chứng nào phủ đường x-nonce request-header trên runtime mới.** Cả 3 test proxy đều gọi thẳng `proxy(request)` và chỉ assert **response** header; `curl -I` trên container cũng chỉ thấy response header. Đường `NextResponse.next({ request: { headers } })` → `await headers()` trong `layout.tsx:25` **không có test nào**, trước hay sau. Nếu Next 16 đổi hành vi propagate, triệu chứng duy nhất là `data-nonce` biến mất khỏi HTML — vô hình với mọi cổng hiện tại (Next tự gắn nonce vào script từ **CSP response header**, nên trang vẫn chạy). Kiểm một dòng khi container còn sống:

```bash
curl -s localhost:3000 | grep -o 'data-nonce="[^"]*"'   # phải khớp nonce-... trong header CSP
```

**M3 — `apps/web/tsconfig.json` `include` giờ trỏ vào file generated/untracked mà không nói ra.** Vẫn liệt kê `"next-env.d.ts"` (nay gitignored) và `".next/types/**/*.ts"`, không có `.next/dev/types` (U2.D-12 yêu cầu kiểm — kết luận "không cần" là **đúng**, vì dev types vào qua `import` trong chính `next-env.d.ts`). Thêm một dòng comment tại chỗ để người sau không "dọn dẹp" mấy entry trông như rác rồi mất ambient types sau build.

**M4 — Tên/comment test vẫn gọi "middleware".** `rule-05-...test.ts:10,14,15,42,75,81,93,103,114`, `rule-09-headers.test.ts:10,35`, `rule-02-cors.test.ts:10,39,47`. Thuần cosmetic, nhưng đây là bộ test luật bảo mật — tên test là thứ người ta đọc lúc CI đỏ lúc 2 giờ sáng.

**M5 — Câu chữ trong `next.config.ts` hơi quá tay ở một chi tiết.** Comment nói Next *"HARDCODE đường dẫn `typescript/bin/tsc`"*. Chính xác hơn: `tscPath` lấy từ **`bin.tsc` trong `package.json` của package `typescript` đã resolve** (`getTypeScriptPackageInfo`), còn `'typescript/bin/tsc'` là literal dùng ở bước kiểm dependency tồn tại. Kết luận không đổi (shim chỉ khai `bin.tsc6` → **cả hai** kênh cùng fail, và không có knob config nào), nhưng chữ "hardcode đường dẫn" có thể khiến người sau đi sửa bằng symlink `bin/tsc` — vô ích, vì `bin.tsc` trong manifest mới là thứ được đọc.

## Nit

- **N1** — `.gitignore` dùng pattern trần `next-env.d.ts` (không neo), nên sẽ nuốt luôn file này của mọi Next app tương lai trong monorepo. Có chủ ý thì ổn; chỉ ghi nhận.
- **N2** — README mục "Mặt suy giảm" (3) nên nối thẳng tới ghi chú D5 trong `ci.yml` — rủi ro thật của API-mode không phải "mất typecheck" mà là **hai nguồn chẩn đoán** (TS6 lúc build, TS7 ở CI) có thể bất đồng.

---

## Đối chiếu R6 / R7 (2 risk score 15)

**R6 (Edge→Node làm hổng luật):** không tìm thấy lỗ hổng. Logic diff = 0; matcher nguyên vẹn; 64/64 test luật bảo mật xanh (bằng chứng đã có). Hai điểm phụ đáng lưu ý, cả hai đều **không** phải regression:
- `checkRateLimit` dùng `Map` module-level; trên Node runtime state bền theo process. Không có nguy cơ đụng key với limit per-user của tRPC — key ở đó là `` `trpc:${type}:${userId}` `` (init.ts:102), khác hẳn hình dạng key IP. Đúng như R10 dự liệu, đã ghi nhận tường minh vào comment + phase-3.md.
- Nhận định XFF trong comment mới khớp với phép đo (Next tự đặt XFF = IP socket khi client không gửi; client gửi thì giữ nguyên → vẫn giả mạo được) → giữ `RATE_LIMIT_TRUST_PROXY` là kết luận đúng, không phải né việc.

**R7 (Turbopack vỡ standalone):** không nổ — `docker build` exit 0, container boot 200. Không phải dùng fallback `--webpack`, `next.config.ts` không có knob turbopack nào bị codemod thêm vào. Ghi nhận: `.dockerignore` chặn `**/.next` nên bản `next-env.d.ts` cũ trên máy dev (trỏ `.next/dev/types`) có bị `COPY apps/web` mang vào image, nhưng `writeAppTypeDeclarations` chạy **trước** typecheck trong `verifyAndRunTypeScript` nên nó bị ghi đè trước khi ai đọc — an toàn, và build thật đã chứng minh.

## Score: 8/10

Migration sạch đúng chỗ khó nhất (0 dòng logic trong file mang 4/10 luật, kèm bằng chứng kiểm được lại). Hai deviation đều được điều tra tới tận source của Next chứ không phải đoán, và cả hai đều là lựa chọn đúng. Trừ điểm cho: sweep rename dở dang ở 3 chỗ (I1), lỗ hổng thứ tự build/typecheck mà deviation gitignore vừa mở ra (I2), và plan of record mâu thuẫn với code lại còn chưa vào git (I3).
