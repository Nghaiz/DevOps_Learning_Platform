import { describe, expect, it } from 'vitest';
import { POOL_FREE, sessionKey, sessionPodKey } from './redis-keys.js';

// Bộ test vector này được nhân bản y hệt ở services/orchestrator/internal/rediskeys/keys_test.go.
// Đổi một bên mà không đổi bên kia = key namespace lệch giữa TS và Go.
describe('redis key namespace v0', () => {
  it('giữ nguyên tên pool', () => {
    expect(POOL_FREE).toBe('pool:free');
  });

  it('sinh đúng key session', () => {
    expect(sessionKey('abc123')).toBe('session:abc123');
    expect(sessionPodKey('abc123')).toBe('session:abc123:pod');
  });

  it.each(['', 'a:b', 'a b', 'a/b', 'x'.repeat(65)])(
    'từ chối session id không hợp lệ: %j',
    (bad) => {
      expect(() => sessionKey(bad)).toThrow();
      expect(() => sessionPodKey(bad)).toThrow();
    },
  );
});
