import { describe, expect, it, vi } from 'vitest';
import { attachSandboxCookie } from './sandbox-cookie';

/**
 * D7.1 — cookie `dlp_sandbox` theo TỪNG PHIÊN.
 *
 * `mintSandboxTokenFor` bị mock: nó ký bằng khoá trong bảng `jwks` (Postgres), mà
 * thứ đang kiểm ở đây là THUỘC TÍNH cookie, không phải chữ ký. Phần ký thật nằm ở
 * `security/sandbox-token-cookie.test.ts`.
 */
vi.mock('./jwt', () => ({
  mintSandboxTokenFor: (_userId: string, sessionId: string) => Promise.resolve(`token-of-${sessionId}`),
}));

const HOUR = 3600;

function sessionWith(id: string) {
  return { id, expiresAt: { seconds: BigInt(Math.floor(Date.now() / 1000) + HOUR) } };
}

async function cookiesFor(sessionId: string): Promise<string[]> {
  const ctx = { user: { id: 'user-a' }, resHeaders: new Headers() };
  await attachSandboxCookie(ctx, 'user-a', sessionWith(sessionId));
  return ctx.resHeaders.getSetCookie();
}

function pathOf(cookie: string): string | undefined {
  return /;\s*Path=([^;]*)/.exec(cookie)?.[1];
}

/** Thuật toán path-match của RFC 6265 §5.1.4 — thứ trình duyệt dùng để chọn cookie. */
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/';
}

describe('attachSandboxCookie — path theo phiên (D7.1)', () => {
  it('phát đúng hai cookie: /ws/session/<id> và /ide/session/<id>', async () => {
    const paths = (await cookiesFor('sess-1')).map(pathOf).sort();
    expect(paths).toEqual(['/ide/session/sess-1', '/ws/session/sess-1']);
  });

  /**
   * Lỗi gốc: hai phiên ở hai tab dùng chung cặp (name, path) nên cookie phiên sau
   * GHI ĐÈ cookie phiên trước, và tab cũ nối lại WS bằng token sai sid ⇒ 403.
   */
  it('hai phiên KHÔNG chung cặp (name, path) nào — phiên sau không đè phiên trước', async () => {
    const first = (await cookiesFor('sess-1')).map(pathOf);
    const second = (await cookiesFor('sess-2')).map(pathOf);
    expect(first.filter((p) => second.includes(p))).toEqual([]);
  });

  it('cookie phủ đúng các đường mà FE gọi, và chỉ của phiên đó', async () => {
    const paths = (await cookiesFor('sess-1')).map((c) => pathOf(c) ?? '');
    const sentTo = (requestPath: string) => paths.some((p) => pathMatches(p, requestPath));

    // WS terminal (packages/terminal) và iframe IDE (ideSessionUrl + asset + socket.io).
    expect(sentTo('/ws/session/sess-1')).toBe(true);
    expect(sentTo('/ide/session/sess-1/')).toBe(true);
    expect(sentTo('/ide/session/sess-1')).toBe(true);
    expect(sentTo('/ide/session/sess-1/socket.io/')).toBe(true);

    // Phiên có id là TIỀN TỐ của id khác không được nhận cookie của nhau.
    expect(sentTo('/ws/session/sess-10')).toBe(false);
    expect(sentTo('/ide/session/sess-10/')).toBe(false);
    // Và không lan ra ngoài hai đường đó.
    expect(sentTo('/')).toBe(false);
    expect(sentTo('/api/trpc/session.get')).toBe(false);
    expect(sentTo('/ws')).toBe(false);
  });

  it('id mã hoá giống hệt FE (encodeURIComponent) — không ký tự nào lọt vào header', async () => {
    const id = 'a b;c';
    const cookies = await cookiesFor(id);
    expect(cookies.map(pathOf).sort()).toEqual([
      `/ide/session/${encodeURIComponent(id)}`,
      `/ws/session/${encodeURIComponent(id)}`,
    ]);
    // Đủ 6 phần `; ` như mọi cookie khác: `;` trong id KHÔNG tách thêm thuộc tính.
    for (const c of cookies) {
      expect(c.split('; ')).toHaveLength(6);
    }
  });

  it('giữ nguyên các thuộc tính bảo vệ (HttpOnly, Secure, SameSite=Strict, không Domain)', async () => {
    for (const c of await cookiesFor('sess-1')) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('Secure');
      expect(c).toContain('SameSite=Strict');
      expect(c.toLowerCase()).not.toContain('domain=');
    }
  });
});
