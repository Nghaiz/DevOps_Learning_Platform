/**
 * Redis key namespace v0 — SSOT là `docs/redis-key-namespace.md`.
 *
 * Bản Go song sinh: `services/shared/rediskeys/keys.go` (ở `shared/`, KHÔNG phải
 * `orchestrator/internal/`: terminal-gateway là module Go riêng và bắt buộc phải
 * đọc `session:{id}` cho authz — package dưới `internal/` thì nó không import được).
 * Test của cả hai bản đọc chung đúng một file: `docs/redis-key-vectors.json`,
 * nên sửa một bên mà quên bên kia là suite bên đó đỏ ngay.
 */

/**
 * LIST tên pod đang WARM, chờ được claim.
 *
 * LIST chứ không phải set: `LMOVE` là O(1) và FIFO, nên pod cũ nhất được claim
 * trước và một pod đã hỏng lặng lẽ sẽ lộ ở lần claim kế tiếp. `SPOP` của set trả
 * ngẫu nhiên — pod hỏng có thể nằm hàng giờ trước khi ai đó rút trúng nó.
 */
export const POOL_FREE = 'pool:free';

/**
 * LIST pod vừa rời `pool:free` nhưng chưa gắn xong session. Pod nằm đây mà không
 * có `session:{id}` tương ứng là dấu hiệu pod mồ côi cho reaper sweep.
 */
export const POOL_CLAIMED = 'pool:claimed';

/**
 * LIST pod bị `claim.lua` từ chối vì `pod:{name}.state` không phải `free` —
 * thường là một tên pod lọt vào `pool:free` hai lần (replenish retry, reaper
 * trả pod hai lần, hai instance cùng replenish).
 *
 * Nếu không chặn, cùng một pod được claim hai lần và HAI sinh viên exec vào
 * CÙNG một pod — cả hai đều qua authz vì hash của mỗi người ghi đúng `userId`
 * của người đó. Redis LIST không chống trùng, nên chỗ chống nằm trong script.
 *
 * Pod ở đây KHÔNG tự quay lại pool: đẩy lại là vòng lặp vô tận trên cùng một
 * pod hỏng. List dài ra là tín hiệu có nguồn ghi sai vào `pool:free`.
 */
export const POOL_QUARANTINE = 'pool:quarantine';

/**
 * Tiền tố key hash pod. Là hằng riêng vì `claim.lua` phải dựng `pod:{name}`
 * ĐỘNG bên trong script (tên pod chỉ biết sau `LMOVE`, nên không khai báo được
 * trong `KEYS`) — truyền prefix này qua `ARGV` giữ SSOT thay vì để chuỗi
 * `'pod:'` nằm lặp trong file Lua, nơi không vector test nào gác được.
 */
export const POD_PREFIX = 'pod:';

/**
 * Field của hash `session:{id}` — ĐÚNG THỨ TỰ trong `docs/redis-key-vectors.json`.
 *
 * Pin ở đây vì đây là contract liên-service VÔ HÌNH: orchestrator (Go) ghi,
 * gateway (Go) đọc, BFF (TS) cũng đọc, mà proto không mô tả hash này ở đâu cả.
 * Ghi `user_id` rồi đọc `userId` thì mọi bên vẫn typecheck xanh và authz vế `g`
 * im lặng so sánh với chuỗi rỗng. Field mới thêm vào CUỐI, cả ba nơi, cùng commit.
 */
export const SESSION_FIELDS = [
  'userId',
  'podName',
  'namespace',
  'status',
  'tier',
  'createdAt',
  'expiresAt',
  'revision',
  'lastActiveAt',
] as const;

export type SessionField = (typeof SESSION_FIELDS)[number];

/** Hash trạng thái session — SSOT của session sống (không nhân bản sang Postgres). */
export function sessionKey(sessionId: string): string {
  return `session:${assertId(sessionId)}`;
}

/** Ánh xạ session → tên pod đang phục vụ nó. */
export function sessionPodKey(sessionId: string): string {
  return `session:${assertId(sessionId)}:pod`;
}

/**
 * Bộ đếm WS đang mở của session (trần `GATEWAY_MAX_WS_PER_SESSION`, phase-1 D17).
 *
 * Key này PHẢI có TTL bằng TTL của session: gateway `INCR` trước upgrade và
 * `DECR` trong `defer`, nên một lần SIGKILL giữa phiên sẽ không bao giờ `DECR` —
 * không TTL thì session khoá vĩnh viễn ở trạng thái "đang mở ở tab khác".
 */
export function sessionWsKey(sessionId: string): string {
  return `session:${assertId(sessionId)}:ws`;
}

/** Hash state machine của một pod sandbox (free → claimed → active → reaping → gone). */
export function podKey(podName: string): string {
  return `pod:${assertId(podName)}`;
}

/**
 * Dedupe cho `idempotency_key` của `CreateSession`, **scope theo user**.
 *
 * VÌ SAO CÓ `userId` TRONG KEY — không phải để cho gọn namespace:
 * `session.proto` quy định trúng key cũ thì "trả lại đúng session cũ". Với một
 * namespace `idem:{key}` toàn cục, user B gửi trùng `idempotency_key` của user A
 * sẽ nhận lại **session của A** — tức là B biết `sessionId` của A (chính thứ mà
 * toàn bộ mô hình chống IDOR bảo vệ), và BFF sẽ mint cho B một token
 * `sub=B, sid=sessionA` đi qua được bước e và f của handshake, chỉ chết ở bước g.
 *
 * Cả hai đoạn đều được validate riêng nên `:` không dùng để nhảy scope được.
 */
export function idemKey(userId: string, idempotencyKey: string): string {
  return `idem:${assertId(userId)}:${assertId(idempotencyKey)}`;
}

/**
 * Định danh đi thẳng vào key, nên ký tự lạ sẽ bẻ được namespace
 * (id `a:pod` biến `session:a:pod` thành key của session khác; `a:ws` đâm thẳng
 * vào bộ đếm WS). Chặn ở biên thay vì tin caller.
 *
 * Cùng một pattern gác cả ba loại định danh — session id, tên pod, idempotency
 * key. Tên pod orchestrator sinh là RFC1123 label (`sandbox-<hex>`), tập con
 * thực sự của pattern này.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function assertId(id: string): string {
  if (!ID_PATTERN.test(id)) {
    throw new Error(
      `định danh không hợp lệ cho Redis key: ${JSON.stringify(id)} (cần khớp ${ID_PATTERN})`,
    );
  }
  return id;
}
