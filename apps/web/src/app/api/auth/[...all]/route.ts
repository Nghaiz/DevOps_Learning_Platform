import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '../../../../server/auth/config';

/**
 * Mount TOÀN BỘ endpoint HTTP của Better Auth (/api/auth/sign-up/email,
 * /api/auth/sign-in/email, OAuth callback, /api/auth/token, /api/auth/jwks, ...).
 *
 * Thiếu file này thì authClient (src/lib/auth-client.ts) gọi /api/auth/sign-in
 * nhận 404 — đăng nhập chết dù mọi config đúng. Route TĨNH cùng cấp (logout/,
 * refresh/) được Next ưu tiên hơn catch-all nên hai route tự viết không bị đè.
 *
 * Handler khởi tạo LAZY (memoize) cùng lý do với getAuth/getDb: module này bị
 * import lúc `next build` — không được đọc env/DB ở module scope.
 */
export const runtime = 'nodejs';

let handlers: ReturnType<typeof toNextJsHandler> | null = null;

function lazyHandlers(): ReturnType<typeof toNextJsHandler> {
  handlers ??= toNextJsHandler(getAuth());
  return handlers;
}

export async function GET(request: Request): Promise<Response> {
  return lazyHandlers().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return lazyHandlers().POST(request);
}
