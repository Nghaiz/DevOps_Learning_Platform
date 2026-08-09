# Plan — Nâng cấp toolchain: TypeScript 7 + Next.js 16.3

**Ngày:** 2026-08-09 · **Loại:** Nâng cấp hạ tầng build (không phải feature)
**Nguồn SSOT:** `plans/reports/2026-08-09-ts7-nextjs16-upgrade-assessment.md` — hướng **A+** đã duyệt
**Trạng thái:** sẵn sàng cook

> Plan này KHÔNG brainstorm lại. Mọi quyết định kỹ thuật lấy từ report SSOT. Con số benchmark, kết quả typecheck TS7, và công thức alias trong report đều đã đo/chạy thật trên repo này.

---

## 1. Mục tiêu

Đưa `tsc` của dự án lên **TypeScript 7.0.2** (native Go, ~6× nhanh hơn trên repo này) và Next.js lên **16.3.0**, **không làm sập bất cứ thứ gì**: 6 cổng CI xanh, 10 luật bảo mật xanh, image Docker dựng được.

**Không nằm trong phạm vi:** `cacheComponents`, `reactCompiler`, mọi thay đổi Go service, mọi thay đổi P1–P4 của plan chính.

## 2. Quyết định đã chốt

| # | Quyết định | Chốt |
|---|---|---|
| D1 | Chia PR | **Tách 2 PR nối tiếp.** PR1 = TS7 + patch/minor (rủi ro thấp, code không đổi). PR2 = Next 16 + proxy (rủi ro cao, đổi hành vi). CI đỏ thì biết ngay do cái nào; revert từng phần được. |
| D2 | Rate limit khi proxy chuyển Edge→Node | **Không đổi logic.** Giữ nguyên điều kiện `RATE_LIMIT_TRUST_PROXY`. Nếu phát hiện Node runtime đọc được IP peer thật → chỉ **ghi nhận** vào comment + `phase-3.md`, xử lý cùng Traefik ở P3. Giữ PR nâng cấp thuần túy. |
| D3 | Turbopack làm vỡ `output: standalone` | **Fallback `next build --webpack`** cho production, dev vẫn Turbopack. Ghi lý do vào `next.config.ts` + mở issue theo dõi. Vẫn lên được Next 16 + TS7. |
| D4 | `"plugins": [{"name":"next"}]` trong tsconfig | **Giữ nguyên key**, thêm comment giải thích TS7 bỏ qua nó. Vô hại, và tự hoạt động lại nếu quay về TS6. |
| D5 | Binary TS7 không chạy trên Alpine/musl (R1) | **Đổi stage `builder` sang `node:24-bookworm-slim`** (glibc). Stage `runner` **giữ nguyên `node:24-alpine`** — image chạy thật không to thêm, không thêm CVE, và mọi thứ đã làm ở PR #10 (gỡ npm/corepack) còn nguyên giá trị. Tuyệt đối không để Docker typecheck bằng TS6 còn CI bằng TS7 — đó đúng là rủi ro "hai nguồn chẩn đoán" mà report cảnh báo. |
| D6 | `AGENTS.md` do `next dev` tự sinh | **Commit vào repo** kèm khối managed. Cây làm việc sạch sau mọi lần `next dev`, và nội dung Next nhét vào đó được review qua PR. `.dockerignore` đã loại `**/*.md` nên không ảnh hưởng image. |

## 3. Chỉ mục phase

| Phase | Tên | PR | Rủi ro | Kết quả chính |
|---|---|---|---|---|
| **U1** | TS7 alias + gom version | PR1 | Thấp | `tsc` = 7.0.2, eslint vẫn chạy (API TS6), typecheck ~6s→~1s |
| **U2** | Next.js 16.3 + proxy migration | PR2 | Cao | Next 16.3, `middleware.ts`→`proxy.ts`, `useTypeScriptCli` bật mặc định |

**Critical path:** U1 phải merge vào `main` trước khi mở U2 — U2 dựa trên alias của U1.

## 4. Mối quan tâm xuyên suốt

- **Không đụng Go.** `go.work` và 4 module Go không có direct dep nào cần nâng (đã kiểm: `go list -m -u` cho 0 kết quả non-indirect). `govulncheck` vẫn là cổng CI.
- **Lockfile là artifact bắt buộc.** CI và Dockerfile đều dùng `--frozen-lockfile`. Mọi thay đổi dependency phải commit kèm `pnpm-lock.yaml` mới, nếu không CI đỏ ở bước `pnpm install`.
- **Branch discipline.** Mỗi PR một nhánh; xong thì về `main`, `pull --ff-only`, xoá nhánh local.
- **Không nới cổng.** Không thêm `ignoreBuildErrors`, không hạ ngưỡng Trivy, không `--no-verify`. Cổng đỏ thì sửa nguyên nhân.

---

# Phase U1 — TS7 alias + gom version (PR1)

## Objective

`pnpm typecheck` chạy TypeScript 7.0.2; `pnpm lint` vẫn chạy (qua API TS6); `next build` (vẫn Next 15) không đổi hành vi. Gom luôn các patch/minor đang lệch.

## Task list

### U1.A — Alias TS6/TS7 song song

1. Ở **cả 4** `package.json` (`./`, `apps/web/`, `packages/ui/`, `packages/shared-types/`), thay dòng `"typescript": "^6.0.0"` trong `devDependencies` bằng **hai** dòng:
   ```json
   "@typescript/native": "npm:typescript@^7.0.2",
   "typescript": "npm:@typescript/typescript6@^6.0.2"
   ```
   Kèm comment giải thích vì sao (theo phong cách comment sẵn có của repo): TS7 không ship JS API, `typescript-eslint` cần API nên trỏ vào shim TS6; bin `tsc` đến từ `@typescript/native` nên `tsc --noEmit` tự chạy TS7.
2. `pnpm install` → commit `pnpm-lock.yaml`.
3. **Không** đổi bất kỳ script nào trong `package.json` — `"typecheck": "tsc --noEmit"` tự động lấy TS7.

### U1.B — Gom các version còn lệch

4. `@eslint/js` `^9.0.0` → `^10.0.1` (4 package.json) — đồng bộ với `eslint` vốn đã ở dòng 10.x.
5. `eslint` → `^10.8.1`; `@types/node` → `^26.2.0` (3 package); `tsx` → `^4.23.11` (apps/web); `turbo` → `^2.10.9` (root).
6. `pnpm install` → commit lockfile.

### U1.C — Ghi chú các mặt suy giảm đã biết

7. Thêm comment vào `apps/web/tsconfig.json` cạnh `"plugins"`: TS7 không hỗ trợ language service plugin nên key này bị bỏ qua khi editor dùng tsgo; giữ lại để không mất tác dụng nếu quay về TS6 (D4).
8. Thêm mục "toolchain" vào `README.md`: vì sao có hai entry TypeScript, lệnh nào chạy compiler nào (`tsc`=7, `tsc6`=6), và khi TS 7.1 ra thì gỡ alias.

### U1.D — Verify

9. Chạy full: `pnpm lint && pnpm typecheck && pnpm test`.
10. Chạy `pnpm --filter @devops-platform/web build` (Next 15 + API TS6) — xác nhận `next build` **không đổi hành vi** dưới alias.
11. **Build image Docker thật** — đây là bước không được bỏ (xem Risk R1: Alpine/musl).

## File / dir ownership

```
package.json                        (alias + turbo + @eslint/js + eslint)
apps/web/package.json               (alias + @eslint/js + eslint + @types/node + tsx)
packages/ui/package.json            (alias + @eslint/js + eslint + @types/node)
packages/shared-types/package.json  (alias + @eslint/js + eslint + @types/node)
pnpm-lock.yaml                      (sinh lại)
apps/web/tsconfig.json              (chỉ THÊM comment cạnh "plugins")
README.md                           (mục toolchain)
apps/web/Dockerfile                 (CHỈ KHI R1 nổ — đổi stage builder sang bookworm-slim, D5)
```

**Không đụng:** mọi file `.ts`/`.tsx`, `tsconfig.base.json`, `turbo.json`, `.github/workflows/ci.yml`, mọi thứ trong `services/`.

## Acceptance criteria

- [ ] `node_modules/.bin/tsc --version` → `Version 7.0.2`; `node_modules/.bin/tsc6 --version` → `6.0.x`
- [ ] `node -p "require('typescript').version"` → `6.0.x` (tool cần API vẫn có API)
- [ ] `pnpm lint` exit 0 — **đây là cổng chứng minh shim hoạt động**
- [ ] `pnpm typecheck` exit 0, và log cho thấy đang chạy TS7
- [ ] `pnpm test` exit 0, zero failure
- [ ] `pnpm --filter @devops-platform/web build` exit 0 (Next 15 vẫn dùng API TS6)
- [ ] `docker build -f apps/web/Dockerfile -t dlp/web .` **thành công** — chứng minh binary TS7 chạy được trên `node:24-alpine` (musl)
- [ ] Không file `.ts`/`.tsx` nào bị sửa (`git diff --stat` chỉ có package.json / lockfile / tsconfig comment / README)
- [ ] 6 cổng CI xanh trên PR

## Verify commands

```bash
# Alias đúng chưa
node -p "require('typescript').version"          # kỳ vọng 6.0.x
./node_modules/.bin/tsc  --version               # kỳ vọng 7.0.2
./node_modules/.bin/tsc6 --version               # kỳ vọng 6.0.x

# Cổng chính
pnpm lint && pnpm typecheck && pnpm test

# next build vẫn sống dưới alias (Next 15)
pnpm --filter @devops-platform/web build

# Alpine/musl — rủi ro cao nhất của U1
docker build -f apps/web/Dockerfile -t dlp/web:ts7 .

# Đo lại lợi ích (tùy chọn, để ghi vào PR description)
rm -rf .turbo && time pnpm typecheck
```

## Risk Assessment (U1)

| Risk | L | I | Score | Mitigation |
|---|---|---|---|---|
| **R1 — Binary TS7 không chạy trên Alpine/musl.** `@typescript/typescript-linux-x64` là binary Go native; builder stage của Dockerfile chạy `tsc --noEmit` cho `shared-types` + `ui` trên `node:24-alpine`. musl ≠ glibc. | 2 | 5 | **10** | Task U1.D-11 build image thật TRƯỚC khi mở PR. Nếu vỡ → áp **D5**: `builder` sang `node:24-bookworm-slim`, `runner` giữ `node:24-alpine`. Ghi lý do vào comment Dockerfile theo phong cách các comment sẵn có. |
| **R2 — Next 15 từ chối `typescript` không đúng tên package.** Next đọc `require('typescript')` — alias trả về đúng API 6.0.3, nhưng Next có thể kiểm tên/đường dẫn package. | 2 | 4 | 8 | Task U1.D-10 chạy `next build` thật. Nếu vỡ → nhảy thẳng U2 (Next 16.3 dùng `tsc` CLI, không cần API). |
| **R3 — `@eslint/js` 9→10 là major, có thể đổi tập rule của `js.configs.recommended`.** | 3 | 2 | 6 | Chạy `pnpm lint` ngay sau khi nâng, tách riêng commit để dễ revert. |
| **R4 — pnpm không xử lý `npm:` alias trong workspace như mong đợi.** | 1 | 3 | 3 | Verify bằng 3 lệnh `--version` ở trên trước khi làm gì tiếp. |
| **R5 — IDE mất Next TS plugin + bug symlink pnpm của tsgo.** | 4 | 1 | 4 | Đã chấp nhận (D4). Ghi vào README để cả nhóm biết, không phải bug. |

## Timeline (U1)

| Task | Effort |
|---|---|
| U1.A alias | S (~1h) |
| U1.B gom version | S (~1h) |
| U1.C ghi chú | S (~30m) |
| U1.D verify + Docker | S (~2h, phần lớn là chờ build) |
| **Tổng U1** | **S (~1 ngày)** |

---

# Phase U2 — Next.js 16.3 + proxy migration (PR2)

**Điều kiện vào:** U1 đã merge vào `main`.

## Objective

Next.js 16.3.0 chạy được, `middleware.ts` chuyển thành `proxy.ts` mà **không hổng bất kỳ luật nào trong 10 luật bảo mật**, image Docker dựng được với Turbopack (hoặc fallback webpack theo D3), và `next build` typecheck bằng TS7 qua `useTypeScriptCli`.

## Task list

### U2.A — Nâng gói + codemod

1. `pnpm dlx @next/codemod@canary upgrade latest` trong `apps/web`. Codemod xử lý: `next.config` → cấu hình turbopack, `next lint` → ESLint CLI, `middleware` → `proxy`, gỡ tiền tố `unstable_`.
2. **Đọc từng dòng diff của codemod.** Không commit mù. Codemod không chạy mọi migration.
3. Xác nhận `next` = 16.3.0, `react`/`react-dom` vẫn ^19.2.8, `@types/react`/`@types/react-dom` mới nhất. Commit lockfile.

### U2.B — `middleware.ts` → `proxy.ts`

4. `git mv apps/web/src/middleware.ts apps/web/src/proxy.ts` (dùng `git mv` để giữ lịch sử file — file này mang 4/10 luật bảo mật, blame của nó là tài sản).
5. Đổi `export function middleware(request: NextRequest)` → `export function proxy(request: NextRequest)`. Giữ nguyên `config.matcher`.
6. Sửa 3 import:
   - `apps/web/src/security/rule-02-cors.test.ts:4`
   - `apps/web/src/security/rule-05-rate-limit-body-cap.test.ts:5`
   - `apps/web/src/security/rule-09-headers.test.ts:4`
7. Cập nhật comment trong file: dòng nói *"Middleware Next 15 không cho đọc peer address trực tiếp"* nay đã sai bối cảnh — runtime là Node, không phải Edge.

### U2.C — Đánh giá đổi runtime Edge → Node (D2: ghi nhận, không đổi logic)

8. Chạy 2 test rate-limit, xác nhận xanh. `checkRateLimit` dùng `Map` in-memory per-process — trên Node runtime state bền hơn Edge isolate; đây là **thay đổi hành vi**, phải xác nhận bằng test chứ không suy luận.
9. **Điều tra** (không sửa): trên Node runtime, `proxy` có đọc được IP peer thật không? Ghi kết luận vào:
   - comment trong `proxy.ts` (thay cho comment cũ ở task 7),
   - một mục ở `plans/devops-learning-platform/phase-3.md` để P3 xử lý cùng Traefik.
   **Không đổi `clientKey()`** trong PR này (D2).
10. Xác nhận `crypto.randomUUID()`, `btoa()`, `getSessionCookie()` (better-auth) chạy đúng trên Node runtime — có test luật 8/9 phủ.

### U2.D — Cấu hình + đường dẫn output

11. `next.config.ts`: xác nhận `output: 'standalone'` + `outputFileTracingRoot` vẫn hợp lệ ở Next 16. **Không** khai `experimental.useTypeScriptCli` — ở 16.3 nó bật mặc định; khai `false` sẽ làm `next build` chết vì TS7 không có JS API.
12. `next dev` giờ xuất ra `.next/dev` (tách khỏi `next build`). Kiểm:
    - `.gitignore` — đã có `.next/`, phủ đủ ✅ (xác nhận lại)
    - `.dockerignore` — đã có `.next` + `**/.next` ✅ (xác nhận lại)
    - `apps/web/tsconfig.json` `include` — đang có `".next/types/**/*.ts"`; kiểm xem có cần thêm `.next/dev/types` không.
13. **`AGENTS.md`** (D6): `next dev` của Next 16 tự ghi một khối managed vào `AGENTS.md` ở `apps/web`. **Commit file đó** kèm khối managed. Xác nhận nó trỏ vào docs bundled `node_modules/next/dist/docs/` (đúng cách của Next ≥16.2), không phải `.next-docs/`.

### U2.E — Build & verify

14. `pnpm --filter @devops-platform/web build` với Turbopack (mặc định).
15. **Build image Docker thật.** Nếu `output: standalone` vỡ dưới Turbopack → áp D3: đổi script build thành `next build --webpack`, ghi lý do vào comment `next.config.ts` + `package.json`, mở issue theo dõi. **Không** hạ điều kiện đóng.
16. Chạy **10 luật bảo mật** self-test — đặc biệt luật 2 (CORS), 5 (rate limit + body cap), 8 (session gate), 9 (headers + CSP nonce), vì cả 4 đi qua file vừa đổi runtime.
17. `pnpm lint && pnpm typecheck && pnpm test`.

## File / dir ownership

```
apps/web/package.json               (next 16.3, @types/react*, có thể + script --webpack)
apps/web/next.config.ts             (xác nhận/điều chỉnh theo codemod + D3)
apps/web/src/middleware.ts          → XOÁ (git mv)
apps/web/src/proxy.ts               → MỚI (từ git mv + rename export + sửa comment)
apps/web/src/security/rule-02-cors.test.ts              (chỉ dòng import)
apps/web/src/security/rule-05-rate-limit-body-cap.test.ts (chỉ dòng import)
apps/web/src/security/rule-09-headers.test.ts           (chỉ dòng import)
apps/web/tsconfig.json              (include .next/dev/types nếu cần)
apps/web/AGENTS.md                  (MỚI — khối managed của Next)
pnpm-lock.yaml
plans/devops-learning-platform/phase-3.md  (chỉ THÊM mục ghi nhận IP peer)
```

**Không đụng:** `server/security/rate-limit.ts` (D2 — chỉ đọc, không sửa), mọi file trong `services/`, `packages/`, `infra/`, `proto/`.

## Dependencies

- U1 đã merge (alias có sẵn → `tsc` = TS7 để `useTypeScriptCli` gọi).
- Postgres + Redis chạy được ở local để chạy bộ test bảo mật (`.env` / `docker-compose.yml` sẵn có).

## Acceptance criteria

- [ ] `next` = 16.3.0; `pnpm --filter @devops-platform/web build` exit 0
- [ ] `apps/web/src/middleware.ts` **không còn tồn tại**; `proxy.ts` export hàm tên `proxy`
- [ ] `grep -rn "from '../middleware'" apps/web/src` → **0 kết quả**
- [ ] **10/10 luật bảo mật xanh**, không luật nào bị skip hay nới
- [ ] `pnpm lint && pnpm typecheck && pnpm test` exit 0
- [ ] `next build` typecheck qua `tsc` CLI (TS7) — xác nhận bằng log build
- [ ] `docker build -f apps/web/Dockerfile -t dlp/web .` **thành công**; nếu phải dùng `--webpack` thì lý do đã ghi trong code + issue đã mở
- [ ] `git status --short` sạch sau khi chạy `next dev` một lần (chứng minh `AGENTS.md` + `.next/dev` đã xử lý đúng)
- [ ] 6 cổng CI xanh trên PR

## Verify commands

```bash
# Không còn dấu vết middleware
test ! -f apps/web/src/middleware.ts && echo "OK: middleware.ts đã xoá"
grep -rn "from '\.\./middleware'\|from './middleware'" apps/web/src && echo "FAIL: còn import cũ" || echo "OK: hết import cũ"
grep -n "export function proxy" apps/web/src/proxy.ts

# Cổng chính
pnpm lint && pnpm typecheck && pnpm test

# 10 luật bảo mật (đi qua đúng file vừa đổi runtime)
pnpm --filter @devops-platform/web test -- src/security

# Build + image
pnpm --filter @devops-platform/web build
docker build -f apps/web/Dockerfile -t dlp/web:next16 .

# Cây làm việc có sạch sau next dev không (AGENTS.md + .next/dev)
pnpm --filter @devops-platform/web dev &  # dừng sau ~15s
git status --short
```

## Risk Assessment (U2)

| Risk | L | I | Score | Mitigation |
|---|---|---|---|---|
| **R6 — Chuyển Edge→Node làm hổng một luật bảo mật.** `proxy.ts` thực thi 4/10 luật (2, 5, 8, 9). Runtime đổi = API surface đổi. | 3 | 5 | **15 — CAO** | Acceptance criteria bắt 10/10 luật xanh, không nới. Chạy `test -- src/security` như cổng riêng trước khi mở PR. Nếu một luật vỡ: dừng, root-cause, **không** vá bằng cách nới test. |
| **R7 — Turbopack làm vỡ `output: standalone` → không dựng được image.** Chưa ai verify tổ hợp này. | 3 | 5 | **15 — CAO** | D3 đã chốt fallback `next build --webpack`. Build image là acceptance criteria, không phải bước tùy chọn. |
| **R8 — Codemod sửa quá tay / sửa thiếu.** | 3 | 3 | 9 | Task U2.A-2 bắt đọc từng dòng diff. Commit codemod riêng một commit để revert được độc lập. |
| **R9 — `next dev` tự ghi `AGENTS.md` làm bẩn cây làm việc mỗi lần chạy.** | 4 | 2 | 8 | Task U2.D-13 commit file kèm khối managed. Verify bằng `git status --short` sau khi chạy `next dev`. |
| **R10 — Rate limit đổi ngữ nghĩa âm thầm** (Map in-memory bền hơn trên Node) khiến test cũ vẫn xanh nhưng hành vi production khác. | 3 | 3 | 9 | Task U2.C-8/9 bắt ghi nhận tường minh vào comment + `phase-3.md`, không để lặng lẽ. |
| **R11 — better-auth 1.6.26 chưa hỗ trợ Next 16.** | 2 | 4 | 8 | Lộ ra ở bước `next build` + test luật 8. Nếu vỡ: kiểm bản better-auth mới; nếu chưa có → dừng PR2, giữ U1, mở issue upstream. |

**Hai risk score 15** — cả hai đều được gác bằng acceptance criteria cứng (10/10 luật xanh; image Docker dựng được). Không phase nào đóng khi hai điều đó chưa đạt.

## Timeline (U2)

| Task | Effort |
|---|---|
| U2.A codemod + đọc diff | S (~2h) |
| U2.B proxy migration | S (~1h) |
| U2.C đánh giá Edge→Node | M (~3h — phần điều tra IP peer) |
| U2.D config + đường dẫn output | S (~1h) |
| U2.E build + 10 luật + image | M (~4h, gồm cả nhánh fallback webpack) |
| **Tổng U2** | **M (~2 ngày)** |

---

## Deviation log (ghi lúc thực thi — bản gốc plan giữ nguyên phía trên)

| Ngày | Task gốc | Deviation + lý do (bằng chứng trong commit/PR) |
|---|---|---|
| 2026-08-09 | U1 ownership | Sửa thêm `ci.yml` (+task `typecheck`) và `dependabot.yml` (+ignore shim) theo finding M1/M4 của reviewer — vá đúng nguyên tắc D5/"không nới cổng" của plan (PR #19). |
| 2026-08-09 | U2.D-11 | **Ngược với chỉ dẫn gốc:** phải khai `experimental.useTypeScriptCli: false`. Giả định "khai false sẽ chết vì TS7 không có JS API" sai chiều — `require('typescript')` là shim TS6 CÓ API; chính CLI mode (mặc định) mới chết vì Next hardcode nhận bin `tsc` từ package tên `typescript`, shim chỉ có `tsc6` (đọc source `verify-typescript-setup.js`). Hệ quả: acceptance "next build typecheck qua tsc CLI (TS7)" KHÔNG đạt được — `next build` typecheck bằng API TS6, cổng TS7 thật là `pnpm typecheck` ở CI. Ba đường thay thế đã soi và loại (reviewer xác nhận). Issue theo dõi: #20. |
| 2026-08-09 | U2.D-12 | `next-env.d.ts` bị Next 16 ghi nội dung KHÁC NHAU giữa dev (`.next/dev/types`) và build (`.next/types`) → gitignore + `git rm --cached` thay vì commit. Kèm fix `turbo.json`: `typecheck.dependsOn` thêm `"build"` để cổng TS7 chạy trên program có generated types (finding I2 của reviewer). |
| 2026-08-09 | U2.A-1 | Codemod `@next/codemod upgrade` tự sinh `apps/web/pnpm-workspace.yaml` làm hỏng workspace resolve — xoá file đó, chỉ giữ version bump của codemod, các transform làm tay (repo không dùng `next lint`/`unstable_*`). |

## 5. Tổng timeline

| Phase | Effort | Ghi chú |
|---|---|---|
| U1 — TS7 alias + version | S (~1 ngày) | Rủi ro thấp; R1 (Alpine/musl) là ẩn số duy nhất |
| U2 — Next 16.3 + proxy | M (~2 ngày) | Phụ thuộc U1 merge; 2 risk score 15 |
| **Tổng** | **~3 ngày** | Critical path: U1 → merge → U2 |

## 6. Định nghĩa "done" của cả plan

1. `pnpm typecheck` chạy TypeScript 7.0.2 và xanh.
2. `pnpm lint` + `pnpm test` xanh.
3. **10/10 luật bảo mật xanh** sau khi chuyển proxy.
4. **Image Docker dựng được** cho `apps/web` (Turbopack, hoặc webpack fallback đã ghi lý do).
5. 6 cổng CI xanh trên cả hai PR.
6. Sau merge: về `main`, `pull --ff-only`, xoá nhánh local, `git status --short` trống.

## 7. Nợ đã biết, cố ý mang theo

- **IDE mất Next TS plugin** dưới tsgo (D4) — ghi trong README, gỡ khi TS7 hỗ trợ language service plugin.
- **Alias TS6 shim** — gỡ khi `typescript-eslint` hỗ trợ TS ≥7.1 (upstream: `typescript-eslint#10940`). Đặt mốc rà lại khi TS 7.1 phát hành (~10/2026).
- **IP peer thật trong proxy** — chỉ ghi nhận ở U2.C, xử lý ở P3 cùng Traefik (D2).
- **Nếu dùng `--webpack`** (D3) — issue theo dõi phải mở, không để trôi thành mặc định vĩnh viễn.
