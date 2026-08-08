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
};

export default nextConfig;
