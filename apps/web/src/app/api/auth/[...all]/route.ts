import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '../../../../server/auth/config';
import { withPasswordResetDelivery } from '../../../../server/auth/password-reset-mail';

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
  // Better Auth's optional reset-link callback redirects a bearer code through
  // the URL. This application exclusively accepts a code in the POST body.
  if (new URL(request.url).pathname.startsWith('/api/auth/reset-password/')) {
    return Response.json({ code: 'RESET_LINK_DISABLED' }, { status: 404 });
  }
  return lazyHandlers().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/auth/reset-password' && url.search !== '') {
    return Response.json({ code: 'RESET_BODY_REQUIRED' }, { status: 400 });
  }
  if (url.pathname === '/api/auth/request-password-reset') {
    return withPasswordResetDelivery(() => lazyHandlers().POST(request));
  }
  return lazyHandlers().POST(request);
}
