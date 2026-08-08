import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POOL_FREE, sessionKey, sessionPodKey } from './redis-keys.ts';

/**
 * Vector nạp từ `docs/redis-key-vectors.json` — CÙNG file mà
 * `services/orchestrator/internal/rediskeys/keys_test.go` đọc.
 *
 * Trước đây hai suite chép tay hai bản vector giống nhau, nghĩa là sửa một bản
 * hiện thực mà quên bản kia thì cả hai vẫn xanh — một "guard" không gác gì.
 * Đọc chung một byte thì lệch là đỏ.
 */
interface Vectors {
  poolFree: string;
  valid: { id: string; session: string; pod: string }[];
  invalid: { id: string; _why?: string }[];
}

const vectors = JSON.parse(
  readFileSync(new URL('../../../docs/redis-key-vectors.json', import.meta.url), 'utf8'),
) as Vectors;

describe('redis key namespace v0', () => {
  it('nạp được vector dùng chung', () => {
    expect(vectors.valid.length).toBeGreaterThan(0);
    expect(vectors.invalid.length).toBeGreaterThan(0);
  });

  it('giữ nguyên tên pool', () => {
    expect(POOL_FREE).toBe(vectors.poolFree);
  });

  it.each(vectors.valid)('sinh đúng key cho id hợp lệ $id', ({ id, session, pod }) => {
    expect(sessionKey(id)).toBe(session);
    expect(sessionPodKey(id)).toBe(pod);
  });

  it.each(vectors.invalid)('từ chối id không hợp lệ $id', ({ id }) => {
    expect(() => sessionKey(id)).toThrow();
    expect(() => sessionPodKey(id)).toThrow();
  });
});
