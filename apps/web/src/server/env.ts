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

/**
 * Rate limit chỉ tin `x-forwarded-for` khi đứng SAU proxy tin cậy (Traefik ở P3
 * sẽ set header này đúng). Mặc định KHÔNG tin — XFF là header client tự đặt được,
 * tin bừa thì attacker xoay giá trị mỗi request là né được limit.
 */
export function rateLimitTrustProxy(): boolean {
  return process.env['RATE_LIMIT_TRUST_PROXY'] === '1';
}

export function redisUrl(): string {
  return requireEnv('REDIS_URL');
}

/** Địa chỉ gRPC của services/orchestrator (host:port, không có scheme). */
export function orchestratorGrpcAddr(): string {
  return process.env['ORCHESTRATOR_GRPC_ADDR'] ?? 'localhost:9090';
}

export function betterAuthSecret(): string {
  return requireEnv('BETTER_AUTH_SECRET');
}

export function betterAuthUrl(): string {
  return requireEnv('BETTER_AUTH_URL');
}

/** Rỗng = provider tắt (placeholder OK ở P0 — xem apps/web/.env.example). */
export function googleClientId(): string {
  return process.env['GOOGLE_CLIENT_ID'] ?? '';
}

export function googleClientSecret(): string {
  return process.env['GOOGLE_CLIENT_SECRET'] ?? '';
}

export function microsoftClientId(): string {
  return process.env['MICROSOFT_CLIENT_ID'] ?? '';
}

export function microsoftClientSecret(): string {
  return process.env['MICROSOFT_CLIENT_SECRET'] ?? '';
}

/**
 * Allowlist CORS (luật 2). Danh sách rỗng = không origin nào được phép — fail-closed,
 * không fallback về "cho phép hết" khi thiếu cấu hình.
 */
export function corsAllowedOrigins(): string[] {
  const raw = process.env['CORS_ALLOWED_ORIGINS'] ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
