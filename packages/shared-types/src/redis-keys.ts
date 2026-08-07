/**
 * Redis key namespace v0 — SSOT là `docs/redis-key-namespace.md`.
 *
 * Bản Go song sinh: `services/orchestrator/internal/rediskeys/keys.go`.
 * Hai bản dùng CÙNG bộ test vector (xem `redis-keys.test.ts` và `keys_test.go`);
 * sửa một bên mà quên bên kia sẽ làm test vector lệch và đỏ.
 */

/** Sorted set/list chứa id của pod đang WARM, chờ được claim. */
export const POOL_FREE = 'pool:free';

/** Hash trạng thái session — SSOT của session sống (không nhân bản sang Postgres). */
export function sessionKey(sessionId: string): string {
  return `session:${assertId(sessionId)}`;
}

/** Ánh xạ session → tên pod đang phục vụ nó. */
export function sessionPodKey(sessionId: string): string {
  return `session:${assertId(sessionId)}:pod`;
}

/**
 * Session id đi thẳng vào key, nên ký tự lạ sẽ bẻ được namespace
 * (ví dụ id `a:pod` biến `session:a:pod` thành key của session khác).
 * Chặn ở biên thay vì tin caller.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function assertId(sessionId: string): string {
  if (!ID_PATTERN.test(sessionId)) {
    throw new Error(
      `session id không hợp lệ cho Redis key: ${JSON.stringify(sessionId)} (cần khớp ${ID_PATTERN})`,
    );
  }
  return sessionId;
}
