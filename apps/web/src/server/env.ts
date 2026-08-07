/**
 * Đọc env ở một chỗ. Thiếu biến bắt buộc thì ném lỗi ngay lúc khởi động, không
 * để service chạy nửa vời rồi chết ở request đầu tiên
 * (rules/development-principles.md — Errors Over Silent Fallbacks).
 *
 * Zod sẽ thay chỗ này ở 0.D khi apps/web thành app Next.js thật.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${key} — xem apps/web/.env.example`);
  }
  return value;
}

export function databaseUrl(): string {
  return requireEnv('DATABASE_URL');
}

export function redisUrl(): string {
  return requireEnv('REDIS_URL');
}
