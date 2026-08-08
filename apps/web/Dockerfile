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
ENV NEXT_TELEMETRY_DISABLED=1
# Bật standalone TẠI ĐÂY (không hardcode trong next.config.ts): trên Windows dev,
# bước trace standalone tạo symlink → EPERM; chỉ image Docker cần standalone.
ENV NEXT_OUTPUT=standalone
# Build cả 3 package trong workspace (turbo.json dependsOn: ["^build"] đã đảm bảo
# thứ tự shared-types/ui trước web). Monorepo hiện chỉ có 3 package này — xem
# pnpm-workspace.yaml; các thư mục packages/* khác chưa có package.json nên pnpm
# bỏ qua, không cần copy.
RUN pnpm turbo run build

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

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 -G nodejs

# `output: 'standalone'` (next.config.ts) + outputFileTracingRoot=repo root: cây
# .next/standalone mirror đúng đường dẫn tương đối từ root, kèm node_modules đã
# prune chỉ còn dependency thật sự dùng lúc chạy — không cần node_modules đầy đủ.
COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
