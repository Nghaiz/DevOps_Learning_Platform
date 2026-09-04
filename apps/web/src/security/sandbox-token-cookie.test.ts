import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATEWAY_AUD, ORCHESTRATOR_AUD } from '../server/auth/config';
import { mintAccessTokenFor, mintSandboxTokenFor } from '../server/auth/jwt';
import { betterAuthUrl } from '../server/env';
import { closeTestDb, ctxFor, uniqueId } from './test-helpers';

/**
 * G12 — sandbox token (`aud=gateway`) + cookie `dlp_sandbox`.
 *
 * SSOT của mọi con số ở đây: `docs/ws-terminal-protocol.md` §2. Test này là mặt
 * đối diện của bộ `TestG13_*` bên `services/terminal-gateway`: gateway đã chứng
 * minh nó TỪ CHỐI đúng thứ cần từ chối, phần còn thiếu là chứng minh BFF PHÁT ra
 * đúng thứ gateway chấp nhận. Trước chặng này không ai mint được cookie thật, nên
 * bằng chứng 1.C-2 phải để prover tự đóng vai bên phát token.
 *
 * Mức test:
 * - Phần A: INTEGRATION — `auth.api.signJWT` THẬT (ký EdDSA, đọc/ghi bảng `jwks`
 *   trên Postgres thật qua docker compose). Decode payload bằng tay, không verify
 *   chữ ký: mục tiêu là kiểm CLAIM, việc verify chữ ký là của gateway.
 * - Phần B: ROUTER — mock `orchestrator-client` để không cần gRPC đang chạy, rồi
 *   đọc `ctx.resHeaders` — đúng object mà `fetchRequestHandler` dựng `Response` từ.
 *
 * **Kiểm đột biến đã CHẠY THẬT (2026-08-11), không phải khẳng định suông.** Bốn
 * đột biến, mỗi cái làm ĐÚNG MỘT ca đỏ — nếu một đột biến làm 0 ca đỏ thì ca đó
 * là tautology, làm nhiều ca đỏ thì chúng chồng lấn và mất khả năng định vị:
 *
 * | Đột biến | Ca duy nhất đỏ |
 * |---|---|
 * | bỏ `exp` khỏi payload `signJWT` | `exp = expiresAt … CHÍNH XÁC` |
 * | vô hiệu guard `ctx.user.id !== ownerUserId` | `ADMIN tạo session HỘ user khác` |
 * | `GATEWAY_AUD = 'orchestrator'` | `aud = "gateway", và KHÁC aud của access token` |
 * | bỏ `Secure` khỏi cookie | `cookie mang đủ 5 thuộc tính` |
 */

const SESSION_TTL_SECONDS = 3600; // = SESSION_TTL của orchestrator (1h).

function decodeSegment(token: string, index: 0 | 1): Record<string, unknown> {
  const parts = token.split('.');
  const segment = parts[index];
  if (parts.length !== 3 || segment === undefined) {
    throw new Error(`Không phải JWT hợp lệ (3 phần): ${token}`);
  }
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

const decodePayload = (token: string): Record<string, unknown> => decodeSegment(token, 1);
const decodeHeader = (token: string): Record<string, unknown> => decodeSegment(token, 0);

function futureExp(offsetSeconds = SESSION_TTL_SECONDS): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

describe('G12 phần A — mintSandboxTokenFor: claim đúng contract §2', () => {
  afterAll(async () => {
    await closeTestDb();
  });

  it('aud = "gateway", và KHÁC aud của access token — vế duy nhất tách token gọi gRPC với token mở shell', async () => {
    const sandbox = await mintSandboxTokenFor(uniqueId('u'), uniqueId('sess'), futureExp());
    const access = await mintAccessTokenFor(uniqueId('u'), 'user');

    expect(decodePayload(sandbox)['aud']).toBe(GATEWAY_AUD);
    expect(GATEWAY_AUD).toBe('gateway');

    // Vế đối chứng — nếu hai hằng số này trôi về bằng nhau thì token mà BFF mint
    // cho MỌI lời gọi session.* sẽ mở được terminal, và không test nào khác thấy.
    expect(decodePayload(access)['aud']).toBe(ORCHESTRATOR_AUD);
    expect(GATEWAY_AUD).not.toBe(ORCHESTRATOR_AUD);
  });

  it('sub = userId và sid = sessionId (hai vế gateway so ở bước e và g)', async () => {
    const userId = uniqueId('owner');
    const sessionId = uniqueId('sess');
    const payload = decodePayload(await mintSandboxTokenFor(userId, sessionId, futureExp()));

    expect(payload['sub']).toBe(userId);
    expect(payload['sid']).toBe(sessionId);
  });

  it('exp = expiresAt của session CHÍNH XÁC, không phải TTL 15m của plugin', async () => {
    const exp = futureExp();
    const payload = decodePayload(await mintSandboxTokenFor(uniqueId('u'), uniqueId('s'), exp));

    expect(payload['exp']).toBe(exp);

    // Đây là ca chứng minh `overrideOptions` KHÔNG cần thiết: plugin cấu hình
    // `expirationTime: '15m'`, nên nếu payload.exp không thắng thì exp-iat = 900
    // — và đó CHÍNH XÁC là thứ quan sát được khi bỏ `exp` khỏi payload (xem bảng
    // đột biến ở đầu file).
    const iat = payload['iat'] as number;
    expect((payload['exp'] as number) - iat).toBe(SESSION_TTL_SECONDS);
    expect((payload['exp'] as number) - iat).not.toBe(900);
  });

  it('iss = betterAuthUrl() — không rơi về baseURL mặc định', async () => {
    const payload = decodePayload(await mintSandboxTokenFor(uniqueId('u'), uniqueId('s'), futureExp()));
    expect(payload['iss']).toBe(betterAuthUrl());
  });

  it('ký bằng ĐÚNG khoá của access token (D15 — không sinh khoá thứ hai)', async () => {
    const sandboxKid = decodeHeader(await mintSandboxTokenFor(uniqueId('u'), uniqueId('s'), futureExp()))['kid'];
    const accessKid = decodeHeader(await mintAccessTokenFor(uniqueId('u'), 'user'))['kid'];

    expect(sandboxKid).toBeTruthy();
    expect(sandboxKid).toBe(accessKid);
  });

  it('alg = EdDSA — thứ gateway ép cứng phía server', async () => {
    expect(decodeHeader(await mintSandboxTokenFor(uniqueId('u'), uniqueId('s'), futureExp()))['alg']).toBe('EdDSA');
  });

  it.each([
    ['quá khứ', -1],
    ['đúng hiện tại', 0],
  ])('expiresAt %s → NÉM, không mint token chết sẵn', async (_label, offset) => {
    await expect(mintSandboxTokenFor(uniqueId('u'), uniqueId('s'), futureExp(offset))).rejects.toThrow(
      /expiresAt của session không dùng được/,
    );
  });

  it('expiresAt không phải số nguyên → NÉM (Timestamp.seconds là bigint, ép sai kiểu là bug thật)', async () => {
    await expect(mintSandboxTokenFor(uniqueId('u'), uniqueId('s'), Number.NaN)).rejects.toThrow(
      /expiresAt của session không dùng được/,
    );
  });
});

/* ------------------------------------------------------------------ phần B */

interface FakeSession {
  id: string;
  userId: string;
  status: number;
  podName: string;
  namespace: string;
  tier: number;
  revision: bigint;
  // `| undefined` tường minh: tsconfig bật `exactOptionalPropertyTypes`, nên
  // `?:` một mình KHÔNG cho phép gán `undefined` — mà ca "orchestrator trả thiếu
  // expires_at" cần gán đúng giá trị đó.
  createdAt: { seconds: bigint; nanos: number } | undefined;
  expiresAt: { seconds: bigint; nanos: number } | undefined;
}

let fakeSession: FakeSession | undefined;

/** Giống message proto THẬT ở chỗ quan trọng nhất: ba field là `bigint`. */
function makeFakeSession(overrides: Partial<FakeSession> = {}): FakeSession {
  return {
    id: uniqueId('sess'),
    userId: 'user-a',
    status: 2,
    podName: 'sandbox-deadbeef',
    namespace: 'dlp-sandbox',
    tier: 1,
    // `BigInt(3)` chứ không phải literal `3n`: tsconfig target dưới ES2020.
    revision: BigInt(3),
    createdAt: { seconds: BigInt(Math.floor(Date.now() / 1000)), nanos: 0 },
    expiresAt: { seconds: BigInt(futureExp()), nanos: 0 },
    ...overrides,
  };
}

vi.mock('../server/grpc/orchestrator-client', () => ({
  orchestratorClient: () => ({
    createSession: () => Promise.resolve({ session: fakeSession }),
  }),
  callOrchestrator: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

describe('G12 phần B — Set-Cookie dlp_sandbox trên session.create', () => {
  beforeEach(() => {
    fakeSession = makeFakeSession();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function createAs(user: { id: string; role: 'user' | 'admin' }, ownerId: string) {
    const { appRouter } = await import('../server/trpc/routers/app-router');
    const ctx = ctxFor(user);
    await appRouter
      .createCaller(ctx)
      .session.create({ userId: ownerId, tier: 1, ttlSeconds: 0, idempotencyKey: 'k-g12' });
    return ctx.resHeaders.getSetCookie();
  }

  /**
   * D8 (phase-13) — GIỜ có ĐÚNG HAI cookie `dlp_sandbox`, cùng token, khác
   * `Path` (`/ws` giữ nguyên từ P2, `/ide` mới cho iframe Theia). Trình duyệt
   * phân biệt Set-Cookie theo cặp `(name, path)`, nên hai dòng này KHÔNG đè
   * lên nhau.
   */
  it('tạo session cho chính mình → đúng HAI cookie dlp_sandbox (Path=/ws và Path=/ide)', async () => {
    const cookies = await createAs({ id: 'user-a', role: 'user' }, 'user-a');
    const sandboxCookies = cookies.filter((c) => c.startsWith('dlp_sandbox='));
    expect(sandboxCookies).toHaveLength(2);
    expect(sandboxCookies.some((c) => c.includes('Path=/ws'))).toBe(true);
    expect(sandboxCookies.some((c) => c.includes('Path=/ide'))).toBe(true);
  });

  it('cookie mang đủ 5 thuộc tính của contract §2 và KHÔNG có Domain', async () => {
    const [cookie] = await createAs({ id: 'user-a', role: 'user' }, 'user-a');
    expect(cookie).toBeDefined();

    expect(cookie).toContain('Path=/ws');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toMatch(/Max-Age=\d+/);

    // host-only là vế BẮT BUỘC: có `Domain` thì cookie rò sang mọi subdomain, và
    // ràng buộc "gateway phải cùng origin" (D1) mất luôn lý do tồn tại.
    expect(cookie?.toLowerCase()).not.toContain('domain=');
  });

  it('không cookie nào mang Path=/ — D8 chỉ mở rộng đúng /ws và /ide', async () => {
    const cookies = await createAs({ id: 'user-a', role: 'user' }, 'user-a');
    for (const cookie of cookies.filter((c) => c.startsWith('dlp_sandbox='))) {
      expect(cookie).not.toMatch(/Path=\/;/);
      expect(cookie.endsWith('Path=/')).toBe(false);
    }
  });

  it('cookie thứ hai (Path=/ide) mang CÙNG token và CÙNG thuộc tính với cookie /ws', async () => {
    const cookies = (await createAs({ id: 'user-a', role: 'user' }, 'user-a')).filter((c) =>
      c.startsWith('dlp_sandbox='),
    );
    const wsCookie = cookies.find((c) => c.includes('Path=/ws'));
    const ideCookie = cookies.find((c) => c.includes('Path=/ide'));
    expect(wsCookie).toBeDefined();
    expect(ideCookie).toBeDefined();

    const tokenOf = (c: string | undefined) => /dlp_sandbox=([^;]+)/.exec(c ?? '')?.[1];
    expect(tokenOf(ideCookie)).toBe(tokenOf(wsCookie));
    for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict']) {
      expect(ideCookie).toContain(attr);
    }
    expect(/Max-Age=(\d+)/.exec(ideCookie ?? '')?.[1]).toBe(/Max-Age=(\d+)/.exec(wsCookie ?? '')?.[1]);
  });

  it('Max-Age khớp thời gian còn lại của session (±2s), không phải TTL cố định', async () => {
    const [cookie] = await createAs({ id: 'user-a', role: 'user' }, 'user-a');
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie ?? '')?.[1]);

    expect(maxAge).toBeGreaterThan(SESSION_TTL_SECONDS - 3);
    expect(maxAge).toBeLessThanOrEqual(SESSION_TTL_SECONDS);
  });

  it('token trong cookie mang đúng sid của session vừa tạo', async () => {
    const [cookie] = await createAs({ id: 'user-a', role: 'user' }, 'user-a');
    const token = /dlp_sandbox=([^;]+)/.exec(cookie ?? '')?.[1] ?? '';

    const payload = decodePayload(token);
    expect(payload['sid']).toBe(fakeSession?.id);
    expect(payload['sub']).toBe('user-a');
    expect(payload['aud']).toBe(GATEWAY_AUD);
  });

  it('ADMIN tạo session HỘ user khác → session tạo được nhưng KHÔNG có cookie', async () => {
    const cookies = await createAs({ id: 'admin-1', role: 'admin' }, 'user-b');

    // Vế then chốt: mint ở nhánh này là phát cho trình duyệt admin một chìa mở
    // thẳng shell của user-b — quyền KHÁC HẲN "tạo session hộ".
    expect(cookies).toEqual([]);
  });

  it('orchestrator trả session thiếu expires_at → NÉM, không im lặng bỏ cookie', async () => {
    fakeSession = makeFakeSession({ expiresAt: undefined });
    await expect(createAs({ id: 'user-a', role: 'user' }, 'user-a')).rejects.toThrow(
      /thiếu id\/expires_at/,
    );
  });

  async function createAndReturn() {
    const { appRouter } = await import('../server/trpc/routers/app-router');
    return appRouter
      .createCaller(ctxFor({ id: 'user-a', role: 'user' }))
      .session.create({ userId: 'user-a', tier: 1, ttlSeconds: 0, idempotencyKey: 'k-g12' });
  }

  /**
   * ⛔ Ca này tồn tại vì một lỗi CÓ THẬT mà cả bộ test cũ mù hoàn toàn: `session.*`
   * trả thẳng message proto, và `Timestamp.seconds`/`revision` là `bigint` mà
   * `JSON.stringify` NÉM trên đó. `createCaller` không serialize gì cả, nên mọi
   * test router đều xanh trong khi đường HTTP thật trả **500**. Đo được trên
   * cluster 2026-08-11 trước khi vá: `POST /api/trpc/session.create` → 500
   * `"Do not know how to serialize a BigInt"`, SAU khi pod đã bị claim.
   *
   * Bài học chung, đã ghi vào phase-1: một đường mà chưa ai đi thì chưa ai gác —
   * và `createCaller` cố ý bỏ qua đúng cái tầng vừa hỏng.
   */
  it('response serialize được ra JSON — tầng mà createCaller KHÔNG chạm tới', async () => {
    const response = await createAndReturn();
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it('Timestamp thành chuỗi ISO và revision thành number — không bigint nào lọt ra', async () => {
    const response = await createAndReturn();
    const session = response.session;

    expect(typeof session?.expiresAt).toBe('string');
    expect(session?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    expect(typeof session?.createdAt).toBe('string');
    expect(typeof session?.revision).toBe('number');
    expect(session?.revision).toBe(3);

    // Quét toàn bộ cây trả về — chặn cả field bigint được thêm về sau mà quên map.
    const walk = (v: unknown): boolean =>
      typeof v === 'bigint' ||
      (typeof v === 'object' && v !== null && Object.values(v).some(walk));
    expect(walk(response)).toBe(false);
  });

  it('token KHÔNG xuất hiện ở body trả về — luật 8, cookie là đường duy nhất', async () => {
    const body = JSON.stringify(await createAndReturn());

    // 'eyJ' = base64url của '{"' — tiền tố của MỌI header JWT. Đối chứng ở dòng
    // dưới giữ ca này khỏi thành tautology nếu `body` có ngày nào đó thành rỗng.
    expect(body).toContain(fakeSession?.id ?? '<không có>');
    expect(body).not.toContain('eyJ');
  });
});
