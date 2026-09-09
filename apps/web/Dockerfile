# Build từ ROOT của repo, không phải từ apps/web:
#   docker build -f apps/web/Dockerfile -t dlp/web .
# Lý do: monorepo pnpm workspace — apps/web phụ thuộc packages/ui và
# packages/shared-types, cả hai nằm ngoài thư mục này (cùng pattern với
# services/orchestrator/Dockerfile — copy manifest trước để cache layer).

FROM node:24-alpine AS base
# corepack đi kèm Node 24; pin đúng pnpm 11 mà root package.json khai báo
# (packageManager) thay vì để corepack tự chọn bản mới nhất.
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/terminal/package.json packages/terminal/package.json
COPY packages/scenario/package.json packages/scenario/package.json
COPY packages/games/package.json packages/games/package.json
# Hạn tải mặc định của pnpm là 60s MỖI request. Đủ khi có build cache, KHÔNG đủ
# khi lớp này phải kéo lại toàn bộ dep từ registry trên đường truyền chậm: đo
# 2026-09-09 ở ~1.5 MB/s, riêng `next` tarball mất 27s và các gói lớn
# (playwright, three, @mediapipe) chạm trần rồi ném
# `TimeoutError: The operation was aborted due to timeout` — build đỏ ở dòng
# ngay dưới, và thông điệp trỏ vào `--frozen-lockfile` nên đọc ra như "lockfile
# lệch" chứ không như lỗi mạng. Nới hạn + thêm lượt thử lại đổi chế độ hỏng đó
# thành "chậm nhưng xong"; nó KHÔNG nới lỏng gì về tính tất định của lockfile.
ENV npm_config_fetch_timeout=600000 \
    npm_config_fetch_retries=5
# --frozen-lockfile: build KHÔNG được tự ý sửa lockfile — lệch lockfile phải lộ ra
# ở CI (pnpm install thường), không phải âm thầm re-resolve trong image build.
RUN pnpm install --frozen-lockfile

# FROM deps (không phải COPY --from=deps node_modules) để giữ nguyên cấu trúc
# node_modules mà pnpm đã dựng (symlink .pnpm store + per-package node_modules) —
# tách COPY thủ công dễ thiếu symlink của từng package con.
FROM deps AS builder
WORKDIR /repo
COPY tsconfig.base.json eslint.config.mjs ./
COPY apps/web apps/web
COPY packages/ui packages/ui
COPY packages/shared-types packages/shared-types
COPY packages/terminal packages/terminal
COPY packages/scenario packages/scenario
COPY packages/games packages/games
ENV NEXT_TELEMETRY_DISABLED=1
# Bật standalone TẠI ĐÂY (không hardcode trong next.config.ts): trên Windows dev,
# bước trace standalone tạo symlink → EPERM; chỉ image Docker cần standalone.
ENV NEXT_OUTPUT=standalone
# Build cả 4 package trong workspace (turbo.json dependsOn: ["^build"] đã đảm bảo
# thứ tự shared-types/ui/terminal trước web).
#
# ⛔ DANH SÁCH COPY Ở TRÊN PHẢI THEO KỊP `pnpm-workspace.yaml`. Thêm một package
# vào workspace mà quên copy nó vào đây thì `turbo run build` trong image chạy
# với "Packages in scope" THIẾU package đó, và lỗi hiện ra là `Module not found:
# Can't resolve '@devops-platform/<tên>'` — trỏ vào file import chứ không trỏ vào
# Dockerfile, nên rất dễ đi sửa nhầm chỗ. Đã xảy ra đúng như vậy khi thêm
# `packages/terminal` ở 1.F, và `packages/scenario` là lượt thứ hai: nó có
# package.json từ 2.A, nhưng tới 2.B mới có ai import nó — nên cảnh báo cũ ("chưa
# có manifest, chưa cần copy") đã hết đúng trước khi có ai đọc lại nó.
#
# LƯỢT THỨ BA — `packages/games` (2026-09-09). Đúng hình dạng cảnh báo trên, và
# lần này nó im lặng lâu hơn cả hai lần trước: PR games gộp lúc 18:25 ngày
# 2026-09-08, còn image `p14a` đang chạy trên cụm được build lúc 02:41 CÙNG NGÀY
# — tức 16 tiếng TRƯỚC khi package tồn tại. Nên không lần build nào đỏ, `helm`
# vẫn xanh, 4/4 deployment vẫn `Running 1/1`, và triệu chứng ở phía người dùng
# là `/games/k8s` trả 404 trên cụm trong khi chạy tốt ở máy dev.
#
# Bài học chung của cả ba lượt: danh sách này KHÔNG tự đỏ khi thiếu — nó chỉ đỏ
# ở lần build ĐẦU TIÊN sau khi có người import package mới. Trước đó nó im.
RUN pnpm turbo run build

# ---------------------------------------------------------------- migrator
#
# Image RIÊNG chỉ để chạy migration Drizzle. Không gộp vào image runtime được:
# runtime là bản Next.js standalone đã prune, KHÔNG có drizzle-kit, KHÔNG có thư
# mục drizzle/*.sql, và npm/corepack đã bị gỡ có chủ ý khỏi nó. Nhét công cụ
# migration vào đó là hoàn tác đúng phần cắt bề mặt tấn công mà runtime vừa làm.
#
# VÌ SAO CẦN NÓ: tới trước bản này, migration phải chạy TAY qua `kubectl
# port-forward` sau mỗi lần dựng lại DB (§"Còn để ngỏ" của phase-1). Hệ quả đã
# được cảnh báo trước: dựng lại cluster ⇒ bảng `jwks` chưa tồn tại ⇒
# `/api/auth/jwks` trả 500 ⇒ toàn bộ G2 sập, và không dấu hiệu nào chỉ về
# nguyên nhân. B8 là lúc đầu tiên orchestrator THẬT SỰ ghi Postgres, nên đây là
# hạn chót hợp lý để tự động hoá.
FROM deps AS migrator
WORKDIR /repo
COPY apps/web/drizzle.config.ts apps/web/drizzle.config.ts
COPY apps/web/drizzle apps/web/drizzle
COPY apps/web/src/server/db apps/web/src/server/db

# Gỡ npm/npx/corepack — CÙNG lý do và cùng cách làm với stage `runner` bên dưới,
# và cùng một sai lầm nếu bỏ qua.
#
# Bản đầu của stage này quên bước đó, nên Trivy đếm 1 CVE CRITICAL + 6 HIGH
# (`tar` 7.5.16, `brace-expansion` 5.0.6) đến từ /usr/local/lib/node_modules/npm
# do base image đóng sẵn — ĐỦ để làm đỏ job `Build & push: migrator` ở d5da78b.
# Cả hai gói đó KHÔNG có trong pnpm-lock.yaml của repo (lock đang giữ
# brace-expansion 5.0.9 đã vá); chúng đến từ npm bundled trong `node:24-alpine`.
# Đó là lý do "nâng dependency" không sửa được, phải gỡ npm ra khỏi image.
#
# An toàn vì CMD gọi `node` trực tiếp: mọi thứ cần cài đã cài xong ở stage `deps`,
# migrator không chạy pnpm/npm lúc runtime. Xoá ở ĐÂY chứ không ở `deps` — stage
# `builder` dùng chung `deps` và vẫn cần pnpm để `turbo run build`.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /repo/apps/web
# drizzle-kit tự giữ bảng `__drizzle_migrations`, nên chạy lại là no-op — Job
# này an toàn khi Helm retry hoặc khi upgrade lại cùng một version.
CMD ["node", "./node_modules/drizzle-kit/bin.cjs", "migrate"]

# `node:24-alpine` TRỰC TIẾP, không phải `FROM base`: stage `base` bật corepack,
# thứ image runtime không cần — nó chỉ chạy `node apps/web/server.js`.
FROM node:24-alpine AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Gỡ npm/npx VÀ corepack khỏi image chạy thật.
#
# Trivy trên image này đếm 10 CVE (HIGH 9, CRITICAL 1); 7 trong số đó nằm ở
# /usr/local/lib/node_modules/npm (brace-expansion, tar, undici, ip-address) —
# npm đóng gói sẵn trong base image, mà runtime KHÔNG BAO GIỜ gọi tới. Đó là bề
# mặt tấn công thuần tuý: một bộ công cụ tải-và-chạy-code nằm sẵn trong container
# phơi ra internet, chỉ chờ ai đó có được shell trong pod.
#
# corepack đi cùng lý do đó, không phải phụ thêm (Copilot code review chỉ ra ở
# PR #10): gỡ npm mà chừa corepack là chừa lại đúng khả năng ta muốn cắt — nó
# TẢI VỀ và kích hoạt package manager tuỳ ý từ registry. Bỏ npm nhưng giữ
# corepack là hàng rào có cửa sau.
#
# 3 CVE còn lại (postcss, sharp) do next@15.5.23 ghim, không tự vá được — hết khi
# Next lên bản mới (Dependabot sẽ đề xuất).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# `shellcheck` — NĂNG LỰC, không phải tiện nghi. Ngoại lệ CÓ CHỦ Ý với chính
# sách cắt-bề-mặt ở khối trên; đọc cả hai cùng nhau.
#
# `server/content/shellcheck.ts` gọi binary này lúc người soạn lưu nháp (P9 9.D
# task 13). Cho tới bản này ảnh KHÔNG có nó, nên mọi lượt kiểm trả
# `available:false, unavailableReason: "spawn shellcheck ENOENT"` — trang soạn
# bài in đúng câu "1/1 script CHƯA kiểm được", tức nó thành thật về một năng lực
# chưa từng tồn tại. Đo trên cụm 2026-09-07 (`reports/2026-09-07-verify-p13.md`
# §3.2b).
#
# VÌ SAO NGOẠI LỆ NÀY KHÁC npm/corepack (chủ dự án chốt 2026-09-07): thứ vừa bị
# gỡ ở trên là một bộ TẢI-VÀ-CHẠY mã tuỳ ý từ registry. `shellcheck` là một bộ
# phân tích tĩnh đọc stdin và in JSON — không mạng, không thực thi thứ nó đọc,
# không ghi đĩa (`shellcheck.ts` truyền script qua stdin bằng `-`, cố ý không
# tạo file tạm). Nó thêm bề mặt, nhưng không thêm ĐÚNG loại bề mặt mà khối trên
# dựng ra để cắt.
#
# Giá: +17 MiB trên một ảnh 307 MB (~6%). Đã cân nhắc phương án chạy trong
# sandbox pod thay vì pod BFF — đúng hơn về kiến trúc, nhưng `sandbox-base` cũng
# chưa có shellcheck (đã kiểm) và người soạn có thể không có phiên sống lúc lưu
# nháp, nên nó là một việc lớn hơn hẳn, để dành cho phase sau nếu cần.
#
# ⚠ Ghim `--no-cache` chứ không `apk update` riêng: không để lại chỉ mục apk
# trong ảnh chạy thật.
RUN apk add --no-cache shellcheck

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# `output: 'standalone'` (next.config.ts) + outputFileTracingRoot=repo root: cây
# .next/standalone mirror đúng đường dẫn tương đối từ root, kèm node_modules đã
# prune chỉ còn dependency thật sự dùng lúc chạy — không cần node_modules đầy đủ.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static

# Nội dung bài học (P2 — trụ cột Lessons).
#
# ⛔ PHẢI COPY TƯỜNG MINH — `outputFileTracingRoot` KHÔNG gom được thư mục này.
# Trace của Next đi theo `import`, còn `packages/scenario` đọc nội dung bằng
# `readdir`/`readFile` lúc CHẠY với đường dẫn tới từ biến môi trường. Không có
# dòng này thì image build xanh, test xanh, và `/lessons` trả ENOENT ở request
# đầu tiên trên cụm — cùng họ bẫy với `content/` không nằm trong bất kỳ stage nào
# trước bản này.
#
# `SCENARIOS_DIR` tuyệt đối vì cwd của runtime là `/repo`, khác cwd của `next dev`
# (`apps/web`) mà default trong `server/env.ts` tính theo. Đặt ở đây chứ không chỉ
# ở Helm: `docker run` trần cũng phải chạy được.
COPY content ./content
ENV SCENARIOS_DIR=/repo/content/scenarios

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
