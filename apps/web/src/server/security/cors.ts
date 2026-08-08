import { corsAllowedOrigins } from '../env';

/**
 * Luật 2: allowlist origin từ env, KHÔNG reflect `Origin` bừa bãi, KHÔNG
 * `Access-Control-Allow-Credentials` đi cùng wildcard.
 *
 * Trả về đúng chuỗi origin được phép để echo lại (không phải `*`) — credentials
 * request bắt buộc ACAO phải là origin cụ thể theo spec Fetch, "*" sẽ bị trình
 * duyệt tự chặn khi có `credentials: 'include'`.
 */
export function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  if (requestOrigin === null || requestOrigin === '') {
    return null;
  }
  const allowlist = corsAllowedOrigins();
  return allowlist.includes(requestOrigin) ? requestOrigin : null;
}

/**
 * Set CORS header khi origin nằm trong allowlist; nếu KHÔNG match thì KHÔNG set gì
 * cả — thiếu `Access-Control-Allow-Origin` là cách trình duyệt tự chặn JS đọc
 * response cross-origin, không cần server tự trả lỗi.
 */
export function applyCorsHeaders(headers: Headers, requestOrigin: string | null): void {
  // Vary: Origin đặt VÔ ĐIỀU KIỆN — kể cả khi origin bị từ chối. Cache trung gian
  // mà key thiếu Origin sẽ phục vụ response không-CORS cho origin được phép (hoặc
  // ngược lại) — lỗi chỉ tái hiện sau CDN, không thấy được ở local.
  headers.set('Vary', 'Origin');
  const allowed = resolveAllowedOrigin(requestOrigin);
  if (allowed === null) {
    return;
  }
  headers.set('Access-Control-Allow-Origin', allowed);
  headers.set('Access-Control-Allow-Credentials', 'true');
}

/**
 * Header BỔ SUNG cho preflight OPTIONS — thiếu Allow-Methods/Allow-Headers thì
 * trình duyệt fail preflight cho mọi POST JSON cross-origin dù origin ĐƯỢC phép
 * (allowlist thành trang trí). Chỉ set khi origin qua được allowlist.
 */
export function applyCorsPreflightHeaders(
  headers: Headers,
  requestOrigin: string | null,
  requestedHeaders: string | null,
): void {
  applyCorsHeaders(headers, requestOrigin);
  // Allow-Headers echo theo Access-Control-Request-Headers ⇒ cache key phải gồm
  // cả header đó, không thì cache trung gian trả preflight của request khác.
  headers.set('Vary', 'Origin, Access-Control-Request-Headers');
  if (resolveAllowedOrigin(requestOrigin) === null) {
    return;
  }
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  // Echo đúng danh sách header client XIN (spec cho phép); không xin gì thì tối
  // thiểu content-type — đủ cho tRPC/fetch JSON.
  headers.set('Access-Control-Allow-Headers', requestedHeaders ?? 'content-type');
  headers.set('Access-Control-Max-Age', '600');
}
