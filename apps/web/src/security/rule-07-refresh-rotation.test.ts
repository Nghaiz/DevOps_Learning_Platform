import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { mintAccessTokenFor } from '../server/auth/jwt';
import { issueRefreshToken, rotateRefreshToken } from '../server/auth/tokens';
import { users } from '../server/db/schema';
import { POST as refreshHandler } from '../app/api/auth/refresh/route';
import { POST as logoutHandler } from '../app/api/auth/logout/route';
import { closeTestDb, testDb, uniqueId } from './test-helpers';

/**
 * Luật 7 — dùng access token ở endpoint refresh → từ chối; refresh cũ sau rotation
 * → từ chối (revocation).
 *
 * Mức test: INTEGRATION — `auth/tokens.ts` (rotate/revoke) chạy trên Postgres thật
 * (seed 1 user thật vì `auth_refresh_tokens.user_id` có FK); route handler
 * `/api/auth/refresh` gọi trực tiếp (không qua HTTP server) với `NextRequest` giả
 * lập cookie — tương đương lời gọi `fetch` thật vì Next Route Handler chỉ là một
 * hàm (request) => response.
 */
describe('luật 7 — refresh token rotation + revocation', () => {
  let userId: string;

  beforeAll(async () => {
    userId = uniqueId('rule7-user');
    await testDb()
      .insert(users)
      .values({ id: userId, name: 'Rule7 Test User', email: `${userId}@example.test` });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('token vừa issue → rotate thành công, sinh token MỚI khác token cũ', async () => {
    const issued = await issueRefreshToken(testDb(), userId);
    const outcome = await rotateRefreshToken(testDb(), issued.raw);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.userId).toBe(userId);
      expect(outcome.token.raw).not.toBe(issued.raw);
    }
  });

  it('replay token cũ SAU KHI đã rotate → từ chối (reason: revoked)', async () => {
    const issued = await issueRefreshToken(testDb(), userId);
    await rotateRefreshToken(testDb(), issued.raw); // rotate lần 1 — issued.raw giờ đã revoked.

    const replay = await rotateRefreshToken(testDb(), issued.raw); // dùng lại token cũ.
    expect(replay).toEqual({ ok: false, reason: 'revoked' });
  });

  it('token không tồn tại (chưa từng issue) → từ chối (reason: not_found)', async () => {
    const outcome = await rotateRefreshToken(testDb(), 'token-chua-bao-gio-duoc-issue');
    expect(outcome).toEqual({ ok: false, reason: 'not_found' });
  });

  it('phát hiện replay → thu hồi CẢ CHUỖI hậu duệ (kẻ trộm không giữ được token mới)', async () => {
    // Kịch bản RFC 6819 §5.2.2.3: A bị lộ; A→B (kẻ trộm xoay trước); nạn nhân
    // replay A → hệ thống phải giết luôn B (và mọi hậu duệ của B), không chỉ
    // từ chối A.
    const issuedA = await issueRefreshToken(testDb(), userId);
    const rotatedToB = await rotateRefreshToken(testDb(), issuedA.raw);
    expect(rotatedToB.ok).toBe(true);
    if (!rotatedToB.ok) return;

    const replayA = await rotateRefreshToken(testDb(), issuedA.raw);
    expect(replayA).toEqual({ ok: false, reason: 'revoked' });

    // B — token "mới" mà kẻ trộm đang cầm — phải chết theo.
    const useB = await rotateRefreshToken(testDb(), rotatedToB.token.raw);
    expect(useB).toEqual({ ok: false, reason: 'revoked' });
  });

  it('replay ở GỐC chuỗi 3 tầng → mắt SỐNG cuối chuỗi cũng chết (duyệt không dừng ở mắt đã revoked)', async () => {
    // Regression cho bug duyệt frontier: A→B→C→D thì B, C đã revoked sẵn (mỗi
    // lần rotate revoke mắt trước) — bản duyệt "chỉ mắt còn sống" dừng ngay tầng
    // đầu và D (token kẻ trộm đang cầm) thoát nạn.
    const a = await issueRefreshToken(testDb(), userId);
    const b = await rotateRefreshToken(testDb(), a.raw);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const c = await rotateRefreshToken(testDb(), b.token.raw);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const d = await rotateRefreshToken(testDb(), c.token.raw);
    expect(d.ok).toBe(true);
    if (!d.ok) return;

    const replayRoot = await rotateRefreshToken(testDb(), a.raw);
    expect(replayRoot).toEqual({ ok: false, reason: 'revoked' });

    const useD = await rotateRefreshToken(testDb(), d.token.raw);
    expect(useD).toEqual({ ok: false, reason: 'revoked' });
  });

  it('logout: cookie refresh (path /api/auth) tới được endpoint → token bị revoke + Set-Cookie xoá đúng path', async () => {
    // Regression cho bug path-scoping: cookie từng set path=/api/auth/refresh —
    // trình duyệt KHÔNG BAO GIỜ gửi nó tới /api/auth/logout (RFC 6265 path-match)
    // nên revocation là code chết; delete mặc định path=/ cũng không trúng.
    const issued = await issueRefreshToken(testDb(), userId);
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `refresh_token=${issued.raw}` },
    });
    const response = await logoutHandler(request);
    expect(response.status).toBe(200);

    // Token đã bị revoke thật trong DB.
    const afterLogout = await rotateRefreshToken(testDb(), issued.raw);
    expect(afterLogout).toEqual({ ok: false, reason: 'revoked' });

    // Set-Cookie xoá refresh_token phải mang Path=/api/auth (khớp path lúc set).
    const refreshClear = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('refresh_token='));
    expect(refreshClear).toBeDefined();
    expect(refreshClear).toContain('/api/auth');
  });

  it('replay thu hồi token còn sống sau hơn 100 thế hệ rotation', async () => {
    const root = await issueRefreshToken(testDb(), userId);
    let latest = root.raw;
    for (let generation = 0; generation < 101; generation += 1) {
      const outcome = await rotateRefreshToken(testDb(), latest);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) throw new Error('Could not build the refresh chain');
      latest = outcome.token.raw;
    }
    expect(await rotateRefreshToken(testDb(), root.raw)).toEqual({ ok: false, reason: 'revoked' });
    expect(await rotateRefreshToken(testDb(), latest)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('route /api/auth/refresh: KHÔNG có session cookie lẫn refresh_token cookie → 401', async () => {
    // Mô phỏng "chỉ có access token, không có gì khác" — access token (JWT) không
    // phải cookie session của Better Auth cũng không phải refresh_token, nên dù
    // caller có đính nó vào Authorization header thì route này vẫn không thấy gì
    // để xác thực và từ chối.
    const request = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { authorization: 'Bearer gia-lap-mot-access-jwt-khong-lien-quan' },
    });
    const response = await refreshHandler(request);
    expect(response.status).toBe(401);
  });

  it('route /api/auth/refresh: refresh_token cookie KHÔNG hợp lệ (không có session Better Auth backup) → 401', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'refresh_token=day-la-token-bia-dat' },
    });
    const response = await refreshHandler(request);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('refresh_not_found');
  });

  it('luật 7 vế 1: access token THẬT (mint qua Better Auth) nhét vào cookie refresh_token → 401, không mint token mới', async () => {
    // Không phải Bearer header bịa: đây là access JWT hợp lệ 100% (đúng chữ ký,
    // đúng aud, còn hạn) do chính Better Auth phát — thứ duy nhất làm nó bị từ
    // chối là NÓ KHÔNG PHẢI refresh token. SHA-256 của một JWT không khớp hash
    // nào trong auth_refresh_tokens ⇒ not_found. Đây là bằng chứng trực tiếp cho
    // "dùng access token ở endpoint refresh → từ chối" (phase-0.md luật 7).
    const accessJwt = await mintAccessTokenFor(userId, 'user');
    expect(accessJwt.split('.')).toHaveLength(3); // đúng là JWT thật, không phải chuỗi bừa.

    const request = new NextRequest('http://localhost:3000/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: `refresh_token=${accessJwt}` },
    });
    const response = await refreshHandler(request);
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe('refresh_not_found');
  });
});
