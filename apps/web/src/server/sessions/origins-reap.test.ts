import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/client';

const reap = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../labs/session', () => ({ reapUnusableSession: reap }));

const { recordSessionOriginOrReap } = await import('./origins');

/** DB giả chỉ đủ cho `insert(...).values(...).onConflictDoNothing(...)`. */
function fakeDb(outcome: () => Promise<void>): Database {
  return {
    insert: () => ({ values: () => ({ onConflictDoNothing: outcome }) }),
  } as unknown as Database;
}

const user = { id: 'u-1', role: 'student' };
const origin = { sessionId: 's-1', kind: 'lesson', contentId: 'lesson-a' } as const;

describe('recordSessionOriginOrReap', () => {
  beforeEach(() => {
    reap.mockClear();
  });

  it('ghi hỏng: reap ĐÚNG phiên vừa mở, rồi ném lại lỗi gốc', async () => {
    const boom = new Error('pool timeout');
    const db = fakeDb(() => Promise.reject(boom));

    await expect(recordSessionOriginOrReap({ db, user }, origin)).rejects.toBe(boom);
    expect(reap).toHaveBeenCalledTimes(1);
    expect(reap).toHaveBeenCalledWith({ db, user }, 's-1');
  });

  it('ghi xong: không reap gì', async () => {
    const db = fakeDb(() => Promise.resolve());

    await recordSessionOriginOrReap({ db, user }, origin);
    expect(reap).not.toHaveBeenCalled();
  });
});
