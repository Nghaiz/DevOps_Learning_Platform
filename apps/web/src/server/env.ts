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

/**
 * Origin công khai của app, dùng làm `metadataBase` (canonical + Open Graph).
 *
 * `undefined` khi chưa đặt — KHÔNG fallback về 'http://localhost:3000'. Đoán bừa
 * origin nghĩa là mọi thẻ og:image ở prod trỏ về localhost, hỏng im lặng và chỉ
 * lộ ra khi có người share link. Chưa đặt thì layout bỏ hẳn metadataBase và Next
 * tự cảnh báo — ồn ào, đúng ý.
 *
 * Vì sao KHÔNG phải `NEXT_PUBLIC_APP_URL`: biến NEXT_PUBLIC_* bị nướng vào bundle
 * lúc BUILD, nên đặt trong Deployment/Secret của k8s là vô tác dụng. `APP_URL`
 * đọc lúc chạy ⇒ đổi được bằng `helm upgrade` mà không build lại image.
 */
export function appUrl(): string | undefined {
  const value = process.env['APP_URL'];
  return value === undefined || value === '' ? undefined : value;
}

/** Địa chỉ gRPC của services/orchestrator (host:port, không có scheme). */
export function orchestratorGrpcAddr(): string {
  return process.env['ORCHESTRATOR_GRPC_ADDR'] ?? 'localhost:9090';
}

/** Cert mTLS cho kênh gRPC tới orchestrator (1.C-4). */
export interface GrpcMtls {
  certFile: string;
  keyFile: string;
  caFile: string;
  serverName: string;
}

/**
 * Đọc cấu hình mTLS cho kênh gRPC. Trả `null` khi `GRPC_MTLS_MODE=off`.
 *
 * `GRPC_MTLS_MODE` là CÙNG một biến với hai service Go — một knob cho cả ba
 * thành phần. Phía client, `permissive` và `require` giống hệt nhau (đều trình
 * cert); khác biệt chỉ ở phía server, và đó chính là thứ làm trình tự bật an
 * toàn: đặt `permissive` cho cả cụm ⇒ mọi client đã có cert ⇒ đổi sang
 * `require` không thay đổi hành vi client nào.
 *
 * Giá trị lạ là LỖI chứ không rơi về `off`: một typo làm tắt mã hoá trong im
 * lặng đúng lúc người vận hành tin rằng vừa bật nó.
 */
export function grpcMtls(): GrpcMtls | null {
  const mode = process.env['GRPC_MTLS_MODE'] ?? 'off';
  if (mode === 'off') return null;
  if (mode !== 'permissive' && mode !== 'require') {
    throw new Error(
      `GRPC_MTLS_MODE không hợp lệ: ${mode} — chỉ nhận 'off', 'permissive', 'require'`,
    );
  }
  return {
    certFile: requireEnv('GRPC_TLS_CERT_FILE'),
    keyFile: requireEnv('GRPC_TLS_KEY_FILE'),
    caFile: requireEnv('GRPC_TLS_CA_FILE'),
    serverName: requireEnv('GRPC_TLS_SERVER_NAME'),
  };
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
