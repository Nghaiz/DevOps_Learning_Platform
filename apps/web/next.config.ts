import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * `output: 'standalone'` — Dockerfile (apps/web/Dockerfile) copy đúng
 * `.next/standalone` + `.next/static`, không cần `node_modules` đầy đủ trong image.
 */
const nextConfig: NextConfig = {
  // 'standalone' CHỈ khi build trong Docker/CI (Linux — Dockerfile set NEXT_OUTPUT).
  // Trên Windows dev, bước trace của standalone tạo symlink vào node_modules pnpm
  // → EPERM (Windows đòi Developer Mode/admin cho symlink). Local không cần
  // standalone; image Docker mới cần.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Monorepo: root trace phải trỏ lên gốc repo để Next gom đúng file workspace
  // (packages/ui, packages/shared-types) vào output standalone. fileURLToPath (không
  // phải .pathname thô) để đúng trên Windows — .pathname giữ dấu "/" trước ổ đĩa
  // (vd "/D:/...") mà path.join/fs không hiểu.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // Next 16.3 mặc định typecheck bằng tsc CLI (useTypeScriptCli: true) và chỉ
  // chấp nhận bin `tsc` khai trong manifest của package TÊN `typescript`
  // (lib/verify-typescript-setup.js — không có knob trỏ binary/package khác).
  // Repo này alias `typescript` = shim TS6
  // (chỉ có bin `tsc6`, xem README § Toolchain) nên CLI mode chết cả dev lẫn
  // build ("trying to use TypeScript but do not have the required package(s)").
  // `false` = typecheck qua JS API — shim TS6 có đầy đủ API, y hệt đường Next 15
  // đã chạy ổn. TS7 vẫn là cổng typecheck thật ở CI (`pnpm typecheck`, ci.yml).
  // Gỡ dòng này cùng lúc gỡ alias TS6/TS7 (khi typescript-eslint hỗ trợ TS >=7.1).
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
