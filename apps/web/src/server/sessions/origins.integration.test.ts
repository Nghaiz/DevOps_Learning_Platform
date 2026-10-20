import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';

import { closeTestDb, ctxFor, purgeLeakedFixtures, testDb, uniqueId } from '../../security/test-helpers';
import { contentSourceFor } from '../content/source';
import { labAttempts, sessionOrigins, users } from '../db/schema';
import { appRouter } from '../trpc/routers/app-router';
import type * as SessionList from './list';
import { recordSessionOrigin, resolveSessionContents } from './origins';

/**
 * Phiên ↔ nội dung đã mở nó (`me.activeSessions` → `content`).
 *
 * `listSessionsPage` gọi orchestrator qua gRPC, thứ không có trong môi trường
 * test — nên ô đi qua router GIẢ đúng hàm đó và để mọi thứ phía sau nó (tra
 * `session_origins`, `lab_attempts`, tên nội dung từ đĩa) chạy thật.
 *
 * ⚠ ĐÒI Postgres đã chạy migration 0018 (`session_origins`).
 */

const listedSessionIds: string[] = [];

vi.mock('./list', async (importOriginal) => {
  const real = await importOriginal<typeof SessionList>();
  return {
    ...real,
    listSessionsPage: vi.fn(async (_ctx: unknown, options: { userId: string }) => ({
      items: listedSessionIds.map((id) => ({
        id,
        userId: options.userId,
        status: 2,
        podName: `pod-${id}`,
        namespace: 'dlp-sandbox',
        tier: 1,
        createdAt: '2026-10-03T00:00:00.000Z',
        expiresAt: '2026-10-03T01:00:00.000Z',
        revision: 1,
      })),
      nextCursor: null,
    })),
  };
});

const ME = uniqueId('u-origin-me');
const OTHER = uniqueId('u-origin-other');

const LESSON = 'dlp-docker-basics';
const LAB = 'dlp-linux-triage';
const PLAYGROUND = 'dlp-linux-playground';

const S_LESSON = uniqueId('s-lesson');
const S_LAB = uniqueId('s-lab');
const S_PLAYGROUND = uniqueId('s-pg');
const S_GONE = uniqueId('s-gone');
const S_UNKNOWN = uniqueId('s-unknown');
const S_OTHERS = uniqueId('s-others');

const titles = { lesson: '', lab: '', playground: '' };

beforeAll(async () => {
  const db = testDb();
  await purgeLeakedFixtures(db);
  await db.insert(users).values(
    [ME, OTHER].map((id) => ({ id, name: id, email: `${id}@test.local`, role: 'user' as const })),
  );
  await recordSessionOrigin(db, { sessionId: S_LESSON, userId: ME, kind: 'lesson', contentId: LESSON });
  await recordSessionOrigin(db, {
    sessionId: S_PLAYGROUND,
    userId: ME,
    kind: 'playground',
    contentId: PLAYGROUND,
  });
  await recordSessionOrigin(db, {
    sessionId: S_GONE,
    userId: ME,
    kind: 'lesson',
    contentId: 'bai-hoc-da-bien-mat',
  });
  // Phiên của NGƯỜI KHÁC — phải ra `null` dù id lọt vào danh sách của ME.
  await recordSessionOrigin(db, { sessionId: S_OTHERS, userId: OTHER, kind: 'lesson', contentId: LESSON });
  await db.insert(labAttempts).values({
    id: uniqueId('attempt'),
    userId: ME,
    labId: LAB,
    sessionId: S_LAB,
    startedAt: new Date(),
  });

  const source = contentSourceFor({ kind: 'admin' });
  titles.lesson = (await source.get(LESSON))?.title ?? '';
  titles.lab = (await source.getLab(LAB))?.title ?? '';
  titles.playground = (await source.getPlayground(PLAYGROUND))?.title ?? '';
});

afterAll(async () => {
  const db = testDb();
  // `session_origins` và `lab_attempts` cascade từ `users`.
  await db.delete(users).where(inArray(users.id, [ME, OTHER]));
  await closeTestDb();
});

describe('resolveSessionContents', () => {
  it('ĐỐI CHỨNG: ba nội dung có thật trên đĩa', () => {
    // Không có ô này thì một tên rỗng so với một tên rỗng cũng "khớp".
    expect(titles.lesson).not.toBe('');
    expect(titles.lab).not.toBe('');
    expect(titles.playground).not.toBe('');
  });

  it('bài học, lab và sân chơi đều tra ra kind + id + title', async () => {
    const map = await resolveSessionContents(testDb(), ME, [S_LESSON, S_LAB, S_PLAYGROUND]);
    expect(map.get(S_LESSON)).toEqual({ kind: 'lesson', id: LESSON, title: titles.lesson });
    expect(map.get(S_LAB)).toEqual({ kind: 'lab', id: LAB, title: titles.lab });
    expect(map.get(S_PLAYGROUND)).toEqual({ kind: 'playground', id: PLAYGROUND, title: titles.playground });
  });

  it('nội dung đã biến mất, phiên không có dòng, phiên của người khác ⇒ vắng', async () => {
    const map = await resolveSessionContents(testDb(), ME, [S_GONE, S_UNKNOWN, S_OTHERS]);
    expect(map.size).toBe(0);
  });

  it('ghi lại cùng một phiên là no-op, không phải lỗi khoá chính', async () => {
    await recordSessionOrigin(testDb(), {
      sessionId: S_LESSON,
      userId: ME,
      kind: 'lesson',
      contentId: LESSON,
    });
    const rows = await testDb()
      .select()
      .from(sessionOrigins)
      .where(eq(sessionOrigins.sessionId, S_LESSON));
    expect(rows).toHaveLength(1);
  });
});

describe('me.activeSessions · content', () => {
  it('mỗi phiên mang content hoặc null, các trường cũ giữ nguyên', async () => {
    listedSessionIds.splice(0, listedSessionIds.length, S_LESSON, S_LAB, S_PLAYGROUND, S_UNKNOWN, S_OTHERS);
    const out = await appRouter.createCaller(ctxFor({ id: ME, role: 'user' })).me.activeSessions({ limit: 20 });
    expect(out.nextCursor).toBeNull();
    expect(out.items.map((item) => [item.id, item.content?.kind ?? null])).toEqual([
      [S_LESSON, 'lesson'],
      [S_LAB, 'lab'],
      [S_PLAYGROUND, 'playground'],
      [S_UNKNOWN, null],
      [S_OTHERS, null],
    ]);
    expect(out.items[0]?.podName).toBe(`pod-${S_LESSON}`);
    expect(out.items[1]?.content?.title).toBe(titles.lab);
    // Đi qua dây được: không `Date`, không `undefined`.
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });
});
