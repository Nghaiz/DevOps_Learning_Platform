# Code Review: Phase U1 — TS7 alias toolchain (`chore/toolchain-u1-ts7-alias`, 3 commit vs `main`)

Ngày: 2026-08-09 · Phạm vi: 7 file thay đổi (4 package.json, pnpm-lock.yaml, apps/web/tsconfig.json, README.md). Không sửa file nào trong lúc review.

## Kết luận

Không có lỗi Critical. Alias, version bump, file ownership, lockfile đều đúng plan. Bốn vấn đề thật: một khoảng hở cổng CI do chính nhánh này tạo ra, một suy giảm DX không được ghi nhận, một câu sai sự thật trong README, và một bất biến mới chưa được Dependabot bảo vệ.

## Critical

Không có.

## Major

**M1 — CI không chạy `typecheck`; `apps/web` sau U1 bị hai nguồn chẩn đoán.**
`.github/workflows/ci.yml:175` chỉ chạy `pnpm turbo run lint build test`. `packages/ui` + `packages/shared-types` có `build` == `tsc --noEmit` nên vẫn qua TS7. Nhưng `apps/web/package.json:8` có `build: next build`, và `next build` type-check bằng **JS API = shim TS6** (`apps/web/next.config.ts` không có `ignoreBuildErrors`). Trước U1 cả hai đường đều là TS6 nên trùng nhau; sau U1: dev chạy `pnpm typecheck` = TS7, CI + Docker = TS6 cho package lớn nhất. Đúng cái "hai nguồn chẩn đoán" D5 cấm, chỉ khác chỗ nó rơi vào CI thay vì Docker. Một diff chẩn đoán chỉ có ở TS7 trong `apps/web` sẽ merge xanh. Sửa: thêm `typecheck` vào lệnh turbo của CI, hoặc chấp nhận tường minh và ghi vào README.

**M2 — Mất `tsserver` của workspace, README không ghi.**
`node_modules/typescript/lib/` (shim `@typescript/typescript6@6.0.2`) chỉ có `tsc.js`, `tsserverlibrary.js/.d.ts`, `typescript.js/.d.ts` — **không có `tsserver.js`**; `@typescript/native` khai `bin: {"tsc": "./bin/tsc"}`, cũng không có. VS Code dò TS của workspace tại `node_modules/typescript/lib/tsserver.js`; thiếu file đó thì mọi editor âm thầm rơi về bản TypeScript đóng gói sẵn của nó. Đó là nguồn chẩn đoán thứ ba, và không phải mặt suy giảm mà README đang mô tả (README chỉ nói mất Next TS plugin).

**M3 — README.md:50 sai sự thật.**
Bảng ghi `@typescript/native` "Cấp bin `tsc` (và `tsserver`)". Package chỉ khai bin `tsc`. Câu này mâu thuẫn trực tiếp với M2 và làm người đọc tin editor vẫn dùng TS của repo.

**M4 — Dependabot chưa được dạy về bất biến alias.**
`.github/dependabot.yml:46-49` gom mọi devDependency với `update-types: ['minor','patch']`. `typescript` giờ là `npm:@typescript/typescript6@^6.0.2`; một bump **minor** của shim lên `6.1.x` nằm trong phạm vi group và phá peer của `typescript-eslint@8` (`typescript: '>=4.8.4 <6.1.0'`, pnpm-lock.yaml:2317). Comment ngay trên đó (dòng 41-45) đã ghi lại bài học TS7 của PR #7 nhưng không được cập nhật cho bất biến hai-entry mới. Đề xuất: `ignore` cho `typescript` (hoặc pin `~6.0.2`) + một dòng comment.

## Nit

- **N1** — Hai trục version độc lập chưa được nói ra: manifest ghi `^6.0.2` (version của gói bọc) trong khi `require('typescript').version` = `6.0.3` (đến từ `@typescript/old: typescript@6.0.3`). pnpm kiểm peer bằng 6.0.2, typescript-eslint kiểm runtime bằng 6.0.3. Nên thêm một mệnh đề vào comment `//typescript`.
- **N2** — README:52 buộc điều kiện gỡ alias vào `typescript-eslint#10940`. Issue đó ("Use TS 7 (tsgo) for type information") vẫn open và chính upstream viết tsgo "won't be the primary TypeScript version for 1-2 years" — mốc rà lại ~10/2026 thì hợp lý, nhưng liên hệ nhân quả lỏng hơn câu chữ.
- **N3** — `apps/web/README.md:7,11` vẫn viết "Chưa phải app Next.js… `build` = `tsc --noEmit`", nay mâu thuẫn với bảng toolchain mới và với `apps/web/package.json`. Drift có sẵn trên main, ngoài phạm vi U1.
- **N4** — `packages/ui` + `packages/shared-types` định nghĩa `build` và `typecheck` bằng đúng một lệnh `tsc --noEmit` (trùng lặp SSOT). Chính chỗ này làm câu hỏi ở M1 khó trả lời. Có sẵn trên main.

## Những gì đã kiểm và ĐẠT

- Công thức alias đúng nguyên văn plan ở cả 4 manifest: `package.json:26,31` · `apps/web/package.json:43,49` · `packages/ui/package.json:27,30` · `packages/shared-types/package.json:23,26`.
- Version bump đủ và đúng: `@eslint/js ^10.0.1` ×4 (10.0.1 đúng là bản mới nhất trên registry — đã `npm view`), `eslint ^10.8.1` ×4, `@types/node ^26.2.0` ×3 (root không có, đúng), `tsx ^4.23.11` chỉ apps/web, `turbo ^2.10.9` chỉ root.
- File ownership sạch: diff đúng 7 file; không `.ts`/`.tsx`; không đụng `tsconfig.base.json`, `turbo.json`, `ci.yml`, `services/`; `apps/web/Dockerfile` giữ nguyên.
- Comment `//typescript`: key top-level hợp lệ, npm/pnpm bỏ qua key lạ, đúng phong cách `"//db"` và `"//"` của turbo.json.
- Prettier: **blob đã commit là LF và sạch prettier** cả 6 file. (Working tree hiện CRLF do `core.autocrlf=true` trên Windows — artifact cục bộ, không phải hồi quy. `.gitattributes` `* text=auto` xử lý đúng.)
- Lockfile khớp manifest: cả 4 importer mang `specifier: npm:typescript@^7.0.2` / `npm:@typescript/typescript6@^6.0.2`; không còn dấu vết `typescript: ^6.0.0`.
- Không đụng bin: `typescript@7.0.2` → `tsc`, `@typescript/typescript6@6.0.2` → `tsc6`. `node_modules/.bin` có cả hai, không tranh chấp.
- Snapshot `typescript@7.0.2` giữ đủ 20 optionalDependencies theo nền tảng, gồm `@typescript/typescript-linux-x64` → `pnpm install --frozen-lockfile` trên CI Linux và trong image Docker vẫn lấy được binary native.
- Đo lại tại chỗ: `require('typescript').version` = 6.0.3 · `tsc --version` = 7.0.2 · `tsc6 --version` = 6.0.3.
- R1 thực sự được kiểm: builder stage chạy `pnpm turbo run build`, mà `ui` + `shared-types` `build` = `tsc --noEmit`, tức TS7 chạy thật trên `node:24-alpine` (musl). `docker build` xanh là bằng chứng có giá trị; giữ nguyên Dockerfile là đúng, D5 không cần kích hoạt.

## Ghi chú quy trình

Không có công cụ spawn sub-agent trong phiên này (không có Agent/Task tool), nên edge-case scouting được làm trực tiếp trên toàn bộ mặt tiêu thụ của diff: CI workflow, Dockerfile, dependabot.yml, turbo.json, pnpm-workspace.yaml, prettier + .gitattributes/EOL, peer range trong lockfile, optional deps theo nền tảng, va chạm bin, và layout của editor tsserver.
