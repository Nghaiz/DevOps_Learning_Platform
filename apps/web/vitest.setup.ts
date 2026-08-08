import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * `vitest run` (khác `tsx --env-file=.env` mà db-smoke.ts dùng) không tự nạp
 * `.env` — nạp thủ công ở đây để mọi test có DATABASE_URL/BETTER_AUTH_SECRET/...
 * mà KHÔNG cần export biến môi trường thủ công trước khi chạy `pnpm test`.
 * `process.loadEnvFile` không GHI ĐÈ biến đã có sẵn trong môi trường (CI có thể
 * set thật qua secrets) — chỉ điền chỗ trống.
 */
const envPath = path.resolve(import.meta.dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
