import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  POD_PREFIX,
  POOL_CLAIMED,
  POOL_FREE,
  POOL_QUARANTINE,
  SESSION_FIELDS,
  idemKey,
  podKey,
  sessionKey,
  sessionPodKey,
  sessionWsKey,
} from './redis-keys.ts';

/**
 * Vector nạp từ `docs/redis-key-vectors.json` — CÙNG file mà
 * `services/shared/rediskeys/keys_test.go` đọc.
 *
 * Trước đây hai suite chép tay hai bản vector giống nhau, nghĩa là sửa một bản
 * hiện thực mà quên bản kia thì cả hai vẫn xanh — một "guard" không gác gì.
 * Đọc chung một byte thì lệch là đỏ.
 */
interface Vectors {
  poolFree: string;
  poolClaimed: string;
  poolQuarantine: string;
  podPrefix: string;
  sessionFields: string[];
  idemUserId: string;
  valid: {
    id: string;
    session: string;
    sessionPod: string;
    sessionWs: string;
    podState: string;
    idem: string;
  }[];
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

  it('giữ nguyên tên hai index của pool', () => {
    expect(POOL_FREE).toBe(vectors.poolFree);
    expect(POOL_CLAIMED).toBe(vectors.poolClaimed);
    expect(POOL_QUARANTINE).toBe(vectors.poolQuarantine);
  });

  // podPrefix là thứ claim.lua nhận qua ARGV. Vector gác nó vì prefix nằm
  // trong file Lua thì không suite nào thấy được khi nó trôi.
  it('giữ nguyên tiền tố key hash pod', () => {
    expect(POD_PREFIX).toBe(vectors.podPrefix);
    expect(podKey('sandbox-1')).toBe(`${POD_PREFIX}sandbox-1`);
  });

  // Thứ tự cũng được so sánh: hai bản song sinh phải khai field theo đúng một
  // thứ tự thì "thêm field mới" mới là thao tác nhìn thấy được ở cả hai bên.
  it('khai đúng field của hash session, đúng thứ tự', () => {
    expect([...SESSION_FIELDS]).toEqual(vectors.sessionFields);
  });

  it.each(vectors.valid)(
    'sinh đúng 5 key cho định danh hợp lệ $id',
    ({ id, session, sessionPod, sessionWs, podState, idem }) => {
      expect(sessionKey(id)).toBe(session);
      expect(sessionPodKey(id)).toBe(sessionPod);
      expect(sessionWsKey(id)).toBe(sessionWs);
      expect(podKey(id)).toBe(podState);
      expect(idemKey(vectors.idemUserId, id)).toBe(idem);
    },
  );

  it.each(vectors.invalid)('từ chối định danh không hợp lệ $id', ({ id }) => {
    expect(() => sessionKey(id)).toThrow();
    expect(() => sessionPodKey(id)).toThrow();
    expect(() => sessionWsKey(id)).toThrow();
    expect(() => podKey(id)).toThrow();
    // Cả HAI đoạn của idemKey phải bị gác: userId bẩn cũng bẻ được namespace
    // y như idempotency_key bẩn.
    expect(() => idemKey(vectors.idemUserId, id)).toThrow();
    expect(() => idemKey(id, 'k')).toThrow();
  });

  // Ca DUY NHẤT chứng minh scope-theo-user tồn tại: mọi ca ở trên vẫn xanh với
  // một hiện thực dùng namespace toàn cục.
  it('hai user trùng idempotency_key ra hai key khác nhau', () => {
    expect(idemKey('userA', 'cung-mot-key')).not.toBe(idemKey('userB', 'cung-mot-key'));
  });
});
