import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { closeTestDb, testDb, uniqueId } from '../../security/test-helpers';
import { contentItems, users } from '../db/schema';
import { readContentAsset, storeContentAsset } from './assets';

/**
 * `readContentAsset` chạy trên SQL THẬT — bộ này gác đúng phần mà unit test
 * (`asset-authz.test.ts`, dùng hàm thuần) không chạm tới: mệnh đề JOIN
 * `content_assets → content_items` phải trả `state` + `authorId` của item CHỨA
 * asset, để route quyết định phát hay không.
 *
 * Một JOIN viết sai (nhầm `on`, dùng `leftJoin`) vẫn để unit test predicate
 * xanh trong khi route gác trên dữ liệu rác. Ô này khép chỗ đó.
 *
 * ⚠ ĐÒI Postgres (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const AUTHOR_A = uniqueId('u-asset-a');
const AUTHOR_B = uniqueId('u-asset-b');
const itemIds: string[] = [];

// PNG 1×1 hợp lệ tối thiểu — đủ để `storeContentAsset` qua cổng allowlist đuôi.
const PNG_1PX = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
    '05fe02fea7d4c2e40000000049454e44ae426082',
  'hex',
);

async function seedItem(state: 'draft' | 'published' | 'archived', authorId: string): Promise<string> {
  const id = uniqueId(`item-${state}`);
  await testDb()
    .insert(contentItems)
    .values({
      id,
      kind: 'lesson',
      authorId,
      state,
      title: `Bài ${id}`,
      description: null,
      difficulty: 'beginner',
      estimatedMinutes: null,
      tier: 'sysbox',
      capabilities: [],
      backendImageId: 'ubuntu',
      interfaceLayout: null,
      assets: [],
      intro: null,
      finish: null,
      setup: null,
      passThresholdPercent: null,
      leaderboard: null,
      ttlSeconds: null,
    });
  itemIds.push(id);
  return id;
}

beforeAll(async () => {
  const db = testDb();
  for (const id of [AUTHOR_A, AUTHOR_B]) {
    await db.insert(users).values({ id, name: id, email: `${id}@example.test` });
  }
});

afterAll(async () => {
  const db = testDb();
  if (itemIds.length > 0) {
    // content_assets có FK cascade từ content_items ⇒ xoá item là đủ.
    await db.delete(contentItems).where(inArray(contentItems.id, itemIds));
  }
  await db.delete(users).where(inArray(users.id, [AUTHOR_A, AUTHOR_B]));
  await closeTestDb();
});

describe('readContentAsset — JOIN trả state + chủ của item chứa asset', () => {
  it('bài draft: trả itemState="draft" và itemAuthorId đúng chủ', async () => {
    const db = testDb();
    const itemId = await seedItem('draft', AUTHOR_A);
    const stored = await storeContentAsset(db, itemId, { filename: 'so-do.png', bytes: PNG_1PX });

    const got = await readContentAsset(db, itemId, stored.storageKey);
    expect(got).not.toBeNull();
    expect(got?.itemState).toBe('draft');
    expect(got?.itemAuthorId).toBe(AUTHOR_A);
    expect(got?.contentType).toBe('image/png');
    expect(got?.bytes.byteLength).toBe(PNG_1PX.byteLength);
  });

  it('bài published: trả itemState="published"', async () => {
    const db = testDb();
    const itemId = await seedItem('published', AUTHOR_B);
    const stored = await storeContentAsset(db, itemId, { filename: 'anh.png', bytes: PNG_1PX });

    const got = await readContentAsset(db, itemId, stored.storageKey);
    expect(got?.itemState).toBe('published');
    expect(got?.itemAuthorId).toBe(AUTHOR_B);
  });

  it('IDOR: đúng storageKey nhưng SAI contentId ⇒ null (không phát chéo bài)', async () => {
    const db = testDb();
    const itemId = await seedItem('draft', AUTHOR_A);
    const otherId = await seedItem('published', AUTHOR_A);
    const stored = await storeContentAsset(db, itemId, { filename: 'x.png', bytes: PNG_1PX });

    // storageKey unique toàn cục, nhưng tra qua contentId của bài KHÁC phải trượt.
    expect(await readContentAsset(db, otherId, stored.storageKey)).toBeNull();
  });
});
