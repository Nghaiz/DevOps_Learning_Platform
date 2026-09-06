import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { adminAudit, users, type User } from '../server/db/schema';
import { MAX_LIST_LIMIT } from '../server/trpc/init';
import { closeTestDb, ctxFor, testDb, uniqueId } from './test-helpers';

/**
 * `admin.*` — P13 C4, cổng `adminProcedure` (role === 'admin', 403 nếu không).
 * Kiểm MỖI procedure với ba vai trò: `user` → FORBIDDEN, `author` → FORBIDDEN,
 * `admin` → không FORBIDDEN (đối chứng dương — nếu không, "user bị chặn" không
 * chứng minh gì, cùng lý lẽ `green-that-proves-nothing`).
 *
 * `sessions.*`/`health` gọi orchestrator qua gRPC — mock `orchestrator-client`
 * CÙNG khuôn `labs-authz.test.ts` để không cần cụm thật. `health` còn đọc
 * `/metrics` qua `fetch` toàn cục — chặn cứng bằng `vi.stubGlobal`, và hai biến
 * môi trường `ORCHESTRATOR_METRICS_URL`/`GATEWAY_METRICS_URL` (`requireEnv`,
 * không có sẵn trong `.env` test) được đặt Ở ĐÂY trước khi gọi.
 */

/**
 * Các spy PHẢI khai tham số tường minh. `vi.fn(() => …)` cho một hàm bị gọi
 * KÈM tham số vẫn chạy đúng lúc runtime, nhưng `mock.calls[0]` khi đó có type
 * tuple rỗng `[]` ⇒ `calls[0][0]` là lỗi TS2493. Nói cách khác: bỏ tham số ở
 * đây làm khẳng định "gọi với user_id nào" KHÔNG viết được — đúng cái khẳng
 * định duy nhất chứng minh ranh giới tin cậy C3.
 */
type ListSessionsReq = { userId: string; limit: number; cursor: string };
type ReapReq = { sessionId: string; reason: string; actor: { case: 'userId'; value: string } };

const { getCapacitySpy, listSessionsSpy, reapSessionSpy } = vi.hoisted(() => ({
  getCapacitySpy: vi.fn((_req: Record<string, never>, _opts?: unknown) =>
    Promise.resolve({ activeSessions: 3, softCapacity: 20, poolFree: 17, poolQuarantine: 0 }),
  ),
  listSessionsSpy: vi.fn((_req: ListSessionsReq, _opts?: unknown) =>
    Promise.resolve({ sessions: [], nextCursor: '' }),
  ),
  reapSessionSpy: vi.fn((_req: ReapReq, _opts?: unknown) => Promise.resolve({ session: undefined })),
}));

vi.mock('../server/grpc/orchestrator-client', () => ({
  orchestratorClient: () => ({
    getCapacity: getCapacitySpy,
    listSessions: listSessionsSpy,
    reapSession: reapSessionSpy,
  }),
  callOrchestrator: <T>(fn: () => Promise<T>): Promise<T> => fn(),
}));

const fetchSpy = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve('dlp_pool_claimed_size{ns="dlp-sandbox"} 3\n'),
  } as unknown as Response),
);
vi.stubGlobal('fetch', fetchSpy);

beforeAll(() => {
  process.env['ORCHESTRATOR_METRICS_URL'] = 'http://fixture-orchestrator.test/metrics';
  process.env['GATEWAY_METRICS_URL'] = 'http://fixture-gateway.test/metrics';
});

async function caller(user: { id: string; role: User['role'] } | null) {
  const { appRouter } = await import('../server/trpc/routers/app-router');
  return appRouter.createCaller(ctxFor(user));
}

async function makeUser(prefix: string, role: User['role']): Promise<{ id: string; role: User['role'] }> {
  const id = uniqueId(prefix);
  await testDb().insert(users).values({ id, name: prefix, email: `${id}@test.local`, role });
  return { id, role };
}

function isTRPCCode(code: string) {
  return (error: unknown) => error instanceof TRPCError && error.code === code;
}

afterAll(async () => {
  await closeTestDb();
});

describe('admin.users.list', () => {
  it('user → FORBIDDEN', async () => {
    const u = await makeUser('admin-users-list-u', 'user');
    await expect((await caller(u)).admin.users.list({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('author → FORBIDDEN', async () => {
    const a = await makeUser('admin-users-list-a', 'author');
    await expect((await caller(a)).admin.users.list({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin → không FORBIDDEN, trả đúng shape { items, nextCursor }', async () => {
    const admin = await makeUser('admin-users-list-adm', 'admin');
    // ⚠ KHÔNG khẳng định `items` CHỨA admin vừa tạo trên trang MẶC ĐỊNH: bảng
    // `users` tích luỹ qua mọi lần chạy suite (không dọn giữa các lần), thứ tự
    // là `id asc`, nên trang đầu (limit 20) là 20 id NHỎ NHẤT toàn bảng — một
    // id mới sinh gần như chắc chắn không nằm ở đó. Khẳng định cũ xanh trên DB
    // trống và đỏ trên DB đã dùng: nó đo lịch sử, không đo procedure.
    const out = await (await caller(admin)).admin.users.list({});
    expect(Array.isArray(out.items)).toBe(true);
    expect(out).toHaveProperty('nextCursor');
    // Đối chứng dương KHÔNG phụ thuộc lịch sử: lọc đúng vào admin vừa tạo.
    const mine = await (await caller(admin)).admin.users.list({ q: admin.id });
    expect(mine.items.map((row) => row.id)).toEqual([admin.id]);
    expect(mine.items[0]?.role).toBe('admin');
  });

  it('admin: keyset — cursor loại trừ ĐÚNG "id > cursor" (không phụ thuộc lịch sử tích luỹ)', async () => {
    const admin = await makeUser('admin-users-list-page-adm', 'admin');
    const before = await makeUser('admin-users-list-page-before', 'user');
    const out = await (await caller(admin)).admin.users.list({ cursor: before.id, limit: MAX_LIST_LIMIT });
    expect(out.items.map((row) => row.id)).not.toContain(before.id);
    expect(out.items.every((row) => row.id > before.id)).toBe(true);
  });

  it('admin: q lọc ILIKE trên email/name (khớp một phần, không phân biệt hoa/thường)', async () => {
    const admin = await makeUser('admin-users-list-q-adm', 'admin');
    const marker = uniqueId('admin-users-q-marker');
    await testDb()
      .insert(users)
      .values({ id: marker, name: marker, email: `${marker}@test.local`, role: 'user' });

    const filtered = await (await caller(admin)).admin.users.list({ q: marker.toUpperCase() });
    expect(filtered.items.map((row) => row.id)).toEqual([marker]);
  });
});

describe('admin.users.setRole', () => {
  it('user → FORBIDDEN', async () => {
    const u = await makeUser('admin-setrole-u', 'user');
    await expect(
      (await caller(u)).admin.users.setRole({ userId: 'khong-quan-trong', role: 'author' }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('author → FORBIDDEN', async () => {
    const a = await makeUser('admin-setrole-a', 'author');
    await expect(
      (await caller(a)).admin.users.setRole({ userId: 'khong-quan-trong', role: 'author' }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin đổi vai trò người khác → thành công + ghi admin_audit', async () => {
    const admin = await makeUser('admin-setrole-adm', 'admin');
    const target = await makeUser('admin-setrole-target', 'user');

    const out = await (await caller(admin)).admin.users.setRole({ userId: target.id, role: 'author' });
    expect(out).toEqual({ id: target.id, role: 'author' });

    const rows = await testDb().select().from(adminAudit).where(eq(adminAudit.targetId, target.id));
    const row = rows.find((r) => r.action === 'user.setRole');
    expect(row).toBeDefined();
    expect(row?.actorId).toBe(admin.id);
    expect(row?.targetType).toBe('user');
    // `from` VÀ `to`: một dòng audit chỉ có `to` chỉ lặp lại trạng thái hiện
    // tại của bảng `users` — nó không nói được CÁI GÌ đã đổi, tức không trả lời
    // được câu hỏi duy nhất khiến bảng audit tồn tại.
    expect(row?.detail).toEqual({ from: 'user', to: 'author' });
  });

  it('admin tự hạ vai của chính mình → từ chối (không có đường cấp lại)', async () => {
    const admin = await makeUser('admin-setrole-self', 'admin');
    await expect(
      (await caller(admin)).admin.users.setRole({ userId: admin.id, role: 'user' }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin tự đổi CHÍNH MÌNH sang admin (no-op) — KHÔNG bị luật tự-hạ chặn', async () => {
    const admin = await makeUser('admin-setrole-self-noop', 'admin');
    const out = await (await caller(admin)).admin.users.setRole({ userId: admin.id, role: 'admin' });
    expect(out).toEqual({ id: admin.id, role: 'admin' });
  });
});

describe('admin.sessions.list', () => {
  it('user → FORBIDDEN', async () => {
    const u = await makeUser('admin-sessions-list-u', 'user');
    await expect((await caller(u)).admin.sessions.list({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('author → FORBIDDEN', async () => {
    const a = await makeUser('admin-sessions-list-a', 'author');
    await expect((await caller(a)).admin.sessions.list({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin → không FORBIDDEN, gọi ListSessions với user_id RỖNG (mọi user, C3)', async () => {
    const admin = await makeUser('admin-sessions-list-adm', 'admin');
    listSessionsSpy.mockClear();
    const out = await (await caller(admin)).admin.sessions.list({});
    expect(out).toEqual({ items: [], nextCursor: null });
    expect(listSessionsSpy).toHaveBeenCalledTimes(1);
    expect(listSessionsSpy.mock.calls[0]?.[0]).toMatchObject({ userId: '' });
  });
});

describe('admin.sessions.terminate', () => {
  it('user → FORBIDDEN', async () => {
    const u = await makeUser('admin-sessions-term-u', 'user');
    await expect(
      (await caller(u)).admin.sessions.terminate({ sessionId: 'sess-fixture' }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('author → FORBIDDEN', async () => {
    const a = await makeUser('admin-sessions-term-a', 'author');
    await expect(
      (await caller(a)).admin.sessions.terminate({ sessionId: 'sess-fixture' }),
    ).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin → không FORBIDDEN + ghi admin_audit (giới hạn: reap dùng actor = admin, xem chú thích admin.ts)', async () => {
    const admin = await makeUser('admin-sessions-term-adm', 'admin');
    reapSessionSpy.mockClear();
    const sessionId = uniqueId('sess-terminate');
    const out = await (await caller(admin)).admin.sessions.terminate({ sessionId });
    expect(out).toEqual({ status: null });
    expect(reapSessionSpy).toHaveBeenCalledTimes(1);

    const rows = await testDb().select().from(adminAudit).where(eq(adminAudit.targetId, sessionId));
    const row = rows.find((r) => r.action === 'session.terminate');
    expect(row).toBeDefined();
    expect(row?.actorId).toBe(admin.id);
    expect(row?.targetType).toBe('session');
  });
});

describe('admin.audit.list', () => {
  it('user → FORBIDDEN', async () => {
    const u = await makeUser('admin-audit-list-u', 'user');
    await expect((await caller(u)).admin.audit.list({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('author → FORBIDDEN', async () => {
    const a = await makeUser('admin-audit-list-a', 'author');
    await expect((await caller(a)).admin.audit.list({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin → không FORBIDDEN, mới nhất trước (occurredAt desc), cursor phân trang đúng thứ tự', async () => {
    const admin = await makeUser('admin-audit-list-adm', 'admin');
    const olderMarker = uniqueId('admin-audit-older');
    const newerMarker = uniqueId('admin-audit-newer');
    // Đặt occurredAt Ở TƯƠNG LAI XA — chắc chắn là hai dòng MỚI NHẤT toàn bảng
    // bất kể lịch sử tích luỹ từ những lần chạy suite trước (không có dọn bảng
    // giữa các lần chạy, cùng khuôn `labs-authz.test.ts`).
    const base = Date.now() + 30 * 24 * 3600 * 1000;
    await testDb()
      .insert(adminAudit)
      .values([
        { actorId: admin.id, action: 'test.marker', targetType: 'test', targetId: olderMarker, occurredAt: new Date(base) },
        {
          actorId: admin.id,
          action: 'test.marker',
          targetType: 'test',
          targetId: newerMarker,
          occurredAt: new Date(base + 1000),
        },
      ]);

    const page1 = await (await caller(admin)).admin.audit.list({ limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.items[0]?.targetId).toBe(newerMarker);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await (await caller(admin)).admin.audit.list({ limit: 1, cursor: page1.nextCursor ?? undefined });
    expect(page2.items[0]?.targetId).toBe(olderMarker);
  });
});

describe('admin.health', () => {
  it('user → FORBIDDEN', async () => {
    const u = await makeUser('admin-health-u', 'user');
    await expect((await caller(u)).admin.health({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('author → FORBIDDEN', async () => {
    const a = await makeUser('admin-health-a', 'author');
    await expect((await caller(a)).admin.health({})).rejects.toSatisfy(isTRPCCode('FORBIDDEN'));
  });

  it('admin → không FORBIDDEN, capacity + 2 nguồn (orchestrator/gateway)', async () => {
    const admin = await makeUser('admin-health-adm', 'admin');
    const out = await (await caller(admin)).admin.health({});
    expect(out.capacity).not.toBeNull();
    expect(out.sources.map((s) => s.name).sort()).toEqual(['gateway', 'orchestrator']);
    expect(out.sources.every((s) => s.ok)).toBe(true);
  });
});
