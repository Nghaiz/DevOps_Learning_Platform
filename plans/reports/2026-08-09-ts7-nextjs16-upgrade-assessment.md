# Đánh giá nâng cấp TypeScript 7 + Next.js 16.3 — DevOps Learning Platform

**Ngày:** 2026-08-09 · **Loại:** Brainstorm → quyết định kiến trúc
**Trạng thái:** Đã chốt hướng **A+** (alias TS7 song song + nâng Next 15.5.23 → 16.3.0)
**Phương pháp:** đo và chạy thật trên repo, không suy đoán. Mọi con số dưới đây tái lập được.

---

## 1. Câu hỏi cần trả lời

1. Nâng TS7 có làm sập dự án không? File nào sẽ báo lỗi?
2. Các "warning block" của TS6 có sửa được để lên TS7 không?
3. BE dùng Golang thì TS7 (native Go) có lợi thế gì không?
4. TS7 có ảnh hưởng sysbox / điều phối tài nguyên / cache / rate limit / các phase P0–P4 không?
5. Còn tech nào đang ở version thấp nên nâng cùng không?

---

## 2. Kết quả đo — TS7 trên chính repo này

Dùng `typescript@7.0.2` cài riêng ra scratchpad, trỏ vào tsconfig thật của repo.

### 2.1 Kết quả typecheck

| Project | Kết quả TS7 | Số file trong program |
|---|---|---|
| `packages/shared-types` | **0 errors** | — |
| `packages/ui` | **0 errors** | — |
| `apps/web` | **0 errors** | 1944 (**y hệt** program của TS6) |

Đã kiểm chứng checker thật sự chạy chứ không no-op: chèn `export const x: number = "boom"` vào `apps/web/src/` → TS7 báo đúng `error TS2322: Type 'string' is not assignable to type 'number'`. Sau đó xoá file, `git status` sạch.

### 2.2 Tốc độ (cold, cùng máy, cùng tsconfig)

| Project | TS6 (6.0.3) | TS7 (7.0.2) | Tỉ lệ |
|---|---|---|---|
| `apps/web` | 4208 ms | **626 ms** | 6.7× |
| `packages/ui` | 1010 ms | **202 ms** | 5.0× |
| `packages/shared-types` | 796 ms | **186 ms** | 4.3× |
| **Tổng** | **~6.0 s** | **~1.0 s** | **~6×** |

TS7 `--extendedDiagnostics` trên `apps/web`: `Files: 1944 · Memory: 232 MB · Total time: 0.283s`.

Không đạt 8–12× như Microsoft công bố vì repo mới 95 file TS. Tỉ lệ sẽ tiến gần con số đó khi P1–P4 thêm `packages/terminal`, `packages/scenario`, UI lessons.

**Bối cảnh giá trị thật:** `pnpm typecheck` hiện **40 ms khi turbo cache hit**. Lợi ích ~5 s chỉ rơi vào lần chạy cold / CI / khi đổi file. Nhỏ ở quy mô hôm nay, lớn dần theo roadmap.

---

## 3. Rà soát "thứ TS7 xoá hẳn" — repo không dính mục nào

| TS7 xoá / đổi mặc định | Trạng thái repo | Bằng chứng |
|---|---|---|
| `target: "es5"`, `downlevelIteration` | Sạch | base ES2023, web ES2017 |
| `module: amd/umd/system/none` | Sạch | NodeNext (base) + esnext (web) |
| `moduleResolution: node/node10/classic` | Sạch | NodeNext + bundler |
| `baseUrl` | Không dùng | grep `baseUrl` trong mọi tsconfig = 0 |
| `module Foo {}` (namespace cú pháp cũ) | Không dùng | chỉ có `declare module '*.css'` — **ambient module, vẫn hợp lệ** |
| `import ... assert {}` → `with` | Không dùng | grep = 0 |
| `esModuleInterop:false` / `allowSyntheticDefaultImports:false` | Đã `true` | `tsconfig.base.json` |
| `alwaysStrict:false` | Đã `strict: true` | `tsconfig.base.json` |
| Mặc định mới `types: []` (bỏ auto-discovery) | **Miễn nhiễm** | cả 3 tsconfig đã khai `types` tường minh |
| Mặc định mới `noUncheckedSideEffectImports: true` | **Thoả sẵn** | `apps/web/src/types/css.d.ts` |
| `rootDir` mặc định `./` | Không vỡ | typecheck 3 project đều 0 lỗi |
| `plugins` (language service plugin) | **Bị bỏ qua im lặng** | xem §5 rủi ro |

**Kết luận mục 1 + 2:** không có file nào phải sửa, không có warning block nào phải xử lý. `tsconfig.base.json` vốn đã viết theo chuẩn TS7 từ trước.

---

## 4. Vật cản thật: tooling, không phải code

TS7 **không ship JavaScript API**. Kiểm chứng trực tiếp:

```js
require('typescript')
// TS7 → { version: '7.0.2', versionMajorMinor: '7.0' }   ← đúng 2 key
// TS6 → 2248 key, có createProgram
```
`node_modules/typescript/lib/` của TS7 chỉ chứa `tsc.js`, `getExePath.js`, `version.cjs`. Có subpath `./unstable/*` nhưng chưa phải API ổn định; API chính thức dời sang **TS 7.1**.

### 4.1 typescript-eslint — chết cứng

```
npm i typescript-eslint@8.66.0 typescript@7.0.2
→ ERESOLVE: peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.66.0

(ép --legacy-peer-deps rồi chạy)
→ Error: typescript-eslint does not support TS 7.0.
```
Sập **toàn bộ `pnpm lint`**, kể cả rule non-type-aware mà repo đang dùng (`tseslint.configs.recommended`). Upstream tự nói support TS ≥7.1 còn "many months away".

### 4.2 Next.js 15.5.23 — `next build` gọi TS qua JS API

Cờ `experimental.useTypeScriptCli` (chạy `tsc` CLI thay vì API) chỉ có **từ Next 16.3**, và ở 16.3 nó **bật mặc định**. Docs Next 16.3 nói rõ: opt-out khi đang dùng TS7 thì `next build` thoát vì không có JS API.

### 4.3 Phần còn lại — an toàn

- **Không dòng code nào của repo `import 'typescript'`** (grep toàn bộ `apps/ packages/ scripts/ services/` = 0).
- `vitest` / `tsx` / `drizzle-kit` dùng esbuild — không đụng TS API.
- `@trpc/server` khai peer `typescript >=5.7.2` — TS7 thoả, và chỉ là types.

### 4.4 Công thức chạy song song chính thức — đã verify end-to-end

```json
"devDependencies": {
  "@typescript/native": "npm:typescript@^7.0.2",
  "typescript": "npm:@typescript/typescript6@^6.0.2"
}
```
Kết quả dựng thử trong sandbox riêng:

```
node_modules/.bin/tsc  --version → 7.0.2
node_modules/.bin/tsc6 --version → 6.0.3
require('typescript').version    → 6.0.3   (tool nào cần API vẫn có API)
eslint .                          → exit 0
tsc -p tsconfig.json              → exit 0
```
Tức là `"typecheck": "tsc --noEmit"` trong package.json **tự động chạy TS7**, không phải sửa script.

---

## 5. Rủi ro và giá phải trả (không giấu)

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| **Mất Next TS plugin trong editor** | Trung bình (DX) | TS7 không hỗ trợ language service plugin → `"plugins": [{ "name": "next" }]` trong `apps/web/tsconfig.json` bị bỏ qua im lặng. Không lỗi build; mất gợi ý ranh giới server/client trong VS Code. |
| **tsgo bug resolve symlink pnpm** | Trung bình (DX) | Đã báo cáo upstream với monorepo pnpm; CI không ảnh hưởng, IDE khó chịu. |
| **Hai compiler trong cây** | Trung bình | 2 nguồn chẩn đoán → có thể "`tsc` xanh, `next build` đỏ". Giảm thiểu: giữ cả cổng `typecheck` (TS7) lẫn `build` trong CI để lệch lộ ra ngay. |
| **Turbopack + `output: standalone`** | **Cao — phải verify** | Next 16 dùng Turbopack mặc định cho cả `build`. Image Docker phụ thuộc `.next/standalone`. Phải build Docker thật rồi mới đóng. |
| **`proxy` chạy Node runtime, không phải Edge** | **Cao — đổi hành vi** | Xem §6.2. |
| TS 7.1 (~10/2026) đổi API | Thấp | Khi typescript-eslint hỗ trợ, gỡ alias là xong. |

---

## 6. Next 15.5.23 → 16.3.0 — phạm vi thật trên repo này

### 6.1 Đã tương thích sẵn (không phải làm gì)

| Breaking change của Next 16 | Trạng thái repo |
|---|---|
| Async Request APIs (bỏ hẳn sync) | ✅ Đã `await headers()` ở `dashboard/page.tsx:14`, `layout.tsx:24` |
| "Không cache gì trừ khi `'use cache'`" | ✅ grep `revalidate`/`force-cache`/`no-store`/`unstable_cache` = **0**. Trang đều dynamic session-gated → **không đổi hành vi** |
| `next lint` bị gỡ | ✅ Đã dùng `eslint .` trực tiếp |
| ESLint Flat Config mặc định | ✅ Đã flat config |
| Node ≥ 20.9 | ✅ `engines.node: ">=24.0.0"` |
| React 19.2 | ✅ `react ^19.2.8` |
| Turbopack là bundler duy nhất | ✅ Không có custom `webpack` config |
| `next/image` đổi mặc định (qualities, minimumCacheTTL, imageSizes, local IP) | ✅ Không dùng `next/image` (khớp `sharp: false` trong pnpm-workspace.yaml) |
| Parallel routes bắt buộc `default.js` | ✅ Không có parallel route |
| Gỡ AMP / `serverRuntimeConfig` / `devIndicators.*` / `unstable_rootParams` | ✅ Không dùng |
| `revalidateTag` đòi tham số thứ 2 | ✅ Không dùng |

### 6.2 Phải làm — `middleware.ts` → `proxy.ts`

Đây là hạng mục rủi ro nhất, vì `apps/web/src/middleware.ts` **là nơi thực thi 4 trong 10 luật bảo mật** (luật 2 CORS, luật 5 rate-limit + body cap, luật 8 session gate, luật 9 security headers + CSP nonce).

Việc phải làm:
1. `git mv apps/web/src/middleware.ts apps/web/src/proxy.ts`
2. `export function middleware(...)` → `export function proxy(...)`
3. Sửa 3 file test đang import: `security/rule-02-cors.test.ts:4`, `rule-05-rate-limit-body-cap.test.ts:5`, `rule-09-headers.test.ts:4`
4. `config.matcher` giữ nguyên

**Đổi hành vi phải đánh giá — runtime chuyển Edge → Node:**
> Docs Next 16: *"The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."*

Hệ quả cụ thể cho repo này:

- **Rate limit đổi ngữ nghĩa.** `server/security/rate-limit.ts` dùng `const buckets = new Map()` in-memory per-process. Trên Edge, state nằm trong isolate ngắn hạn; trên Node runtime, nó là process dài hạn → bucket **bền hơn và chính xác hơn**. Đây là cải thiện, nhưng là **đổi hành vi** nên 2 test rate-limit phải chạy lại và xác nhận.
- **Nguồn IP.** Comment trong `middleware.ts` ghi *"Middleware Next 15 không cho đọc peer address trực tiếp (`request.ip` đã bị gỡ)"*. Node runtime có thể mở ra đường lấy IP thật — **cần kiểm tra lại**, vì nếu có thì `RATE_LIMIT_TRUST_PROXY` không còn là điều kiện duy nhất, và comment/quyết định trong file phải cập nhật theo.
- `crypto.randomUUID()`, `btoa`, `getSessionCookie` (better-auth) đều chạy được trên Node 24 — không rủi ro.

### 6.3 Phải kiểm tra

- `.next/dev` là output mới của `next dev` (tách khỏi `next build`). Kiểm `.gitignore`, `.dockerignore`, và `include` của `apps/web/tsconfig.json` (đang có `".next/types/**/*.ts"` — có thể cần thêm `.next/dev/types`).
- `output: 'standalone'` + `outputFileTracingRoot` dưới Turbopack: **phải build image Docker thật** rồi mới kết luận.
- Codemod `pnpm dlx @next/codemod@canary upgrade latest` làm được phần cơ học (middleware→proxy, next lint→eslint CLI, config turbopack) — dùng nó, rồi **đọc diff bằng tay**.

---

## 7. Trả lời 2 câu hỏi còn lại

### 7.1 BE dùng Golang thì TS7 có lợi thế gì? — **Không. Lợi ích kỹ thuật bằng 0.**

`typescript@7` ship **binary dựng sẵn theo nền tảng** (`@typescript/typescript-win32-x64`, `-linux-x64`, …). Không cần Go toolchain để cài hay chạy. Không chia sẻ một dòng code nào với `services/orchestrator` hay `services/terminal-gateway`. `go.work` không liên quan. Image Docker không nhỏ đi.

Quyết định nâng TS7 phải đứng trên **tốc độ typecheck**, không phải trên sự trùng hợp ngôn ngữ. Lý do "cùng Go" không tồn tại về mặt kỹ thuật.

### 7.2 TS7 ảnh hưởng sysbox / điều phối / cache / rate limit / các phase? — **Không.**

- **Sysbox / gVisor / Kata, warm-pool, reaper, client-go, WS ⇄ pod exec** → nằm hết trong `services/orchestrator` + `services/terminal-gateway`, **là Go**. TS7 không chạm.
- **Rate limit / cache / Redis phía TS** (`server/security/rate-limit.ts`, `server/redis/client.ts`, `packages/shared-types/src/redis-keys.ts`) là **runtime**; type bị xoá lúc build. TS7 đổi *checker*, không đổi JS sinh ra. Cả 9 file `security/rule-0*.test.ts` + `trpc-rate-limit-per-user.test.ts` **đã typecheck sạch dưới TS7**.

  > Lưu ý: rate limit **có** đổi hành vi — nhưng do **Next 16 proxy Edge→Node** (§6.2), **không phải do TS7**.
- **`SandboxTier` / `SessionStatus`** sinh từ `buf` (remote plugin, không dùng TS API). Pipeline contract-first P0.B không đổi. TS7 check `packages/shared-types/gen/**` sạch.
- **Roadmap:** P1 `packages/terminal` (xterm.js), P2 `packages/scenario` (parser Katacoda) đều là TS thuần. Điểm duy nhất phải canh: nếu P2 định dùng `ts-morph` / `ts-jest` để phân tích thì các tool đó **cũng cần alias TS6**.

---

## 8. Khảo sát version toàn dự án

### 8.1 Node/TS (`pnpm outdated -r`)

| Package | Hiện tại | Mới nhất | Đánh giá |
|---|---|---|---|
| `next` | 15.5.23 | **16.3.0** | Major — trong phạm vi A+ (§6) |
| `typescript` | 6.0.3 | **7.0.2** | Major — trong phạm vi A+ (§4.4) |
| `@eslint/js` | 9.39.5 | **10.0.1** | Major — nên nâng cùng, `eslint` đã ở 10.x nên đây là đồng bộ hoá |
| `eslint` | 10.8.0 | 10.8.1 | Patch — nâng |
| `@types/node` | 26.1.2 | 26.2.0 | Minor — nâng |
| `tsx` | 4.23.9 | 4.23.11 | Patch — nâng |
| `turbo` | 2.10.8 | 2.10.9 | Patch — nâng |

Không có package nào khác lệch. `react`/`react-dom` 19.2.8, `zod` 4.4.3, `drizzle-orm` 0.45.2, `better-auth` 1.6.26, `tailwindcss` 4.3.3, `vitest` 4.1.10 — đều đang ở dòng mới nhất.

### 8.2 Go

- Toolchain `go 1.26.5` — hiện hành.
- **0 direct dependency nào cần nâng** trên cả 4 module trong `go.work`.
- 22 mục `go list -m -u all` báo outdated đều là **transitive** qua otel / cloud.google.com / genproto. Không cần đụng: `govulncheck` (có phân tích reachability) đã là cổng CI bắt buộc, và Dependabot đang theo dõi.

**Kết luận:** ngoài `next` + `typescript`, chỉ còn `@eslint/js` là major đáng nâng; phần còn lại là patch/minor gom một lượt.

---

## 9. Quyết định

**Chọn A+ — alias TS7 song song + nâng Next 16.3 + gom các nâng cấp version còn lại.**

Cơ sở: code đã sẵn sàng TS7 (0 lỗi, 0 file phải sửa), công thức song song đã verify chạy được, Next 16 tương thích sẵn 12/13 breaking change và hạng mục còn lại (`middleware`→`proxy`) có ranh giới rõ với codemod hỗ trợ.

**Điều kiện đóng (không thương lượng):**
1. `pnpm lint` + `pnpm typecheck` + `pnpm test` xanh — trong đó `typecheck` chạy TS7.
2. **10 luật bảo mật** self-test lại xanh sau khi chuyển `proxy` (đặc biệt luật 2, 5, 8, 9).
3. **Build image Docker thật** thành công với Turbopack + `output: standalone`, không chỉ `next build` trên máy dev.
4. Toàn bộ 6 cổng CI xanh trên PR.

**Không làm trong phạm vi này:** bật `cacheComponents`, bật `reactCompiler`, đụng Go service, thay đổi bất kỳ điều gì của P1–P4.

---

## 10. Nguồn

- [Announcing TypeScript 7.0 — Microsoft DevBlogs](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Next.js — Upgrading: Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js — `useTypeScriptCli`](https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli)
- [typescript-eslint#10940 — Use TS 7 (tsgo) for type information](https://github.com/typescript-eslint/typescript-eslint/issues/10940)
- [Microsoft Releases TypeScript 7.0 with a Native Go Compiler — InfoQ](https://www.infoq.com/news/2026/08/typescript-7-released/)
