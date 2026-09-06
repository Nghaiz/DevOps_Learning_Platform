/**
 * Nhận dạng lỗi Postgres theo MÃ, không theo văn bản.
 *
 * Driver `postgres` gắn `code` (SQLSTATE) lên lỗi nó ném; Drizzle bọc lỗi đó
 * trong `DrizzleQueryError` và đặt nguyên bản vào `cause`. Nên mã thật có thể
 * nằm sâu vài tầng, và phải đi men theo chuỗi `cause` thay vì đọc `message` —
 * `message` là thứ đã bị S2 chặn không cho ra ngoài, và nó cũng đổi theo phiên
 * bản driver, còn SQLSTATE thì do chuẩn quy định.
 */

/** `unique_violation` — đụng UNIQUE/PRIMARY KEY. */
export const PG_UNIQUE_VIOLATION = '23505';

/** Sâu nhất có thể gặp: DrizzleQueryError → PostgresError → (AggregateError). */
const MAX_CAUSE_DEPTH = 5;

function sqlStateOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== null && current !== undefined; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      const code: unknown = (current as { code: unknown }).code;
      if (typeof code === 'string') {
        return code;
      }
    }
    current = typeof current === 'object' && 'cause' in current ? (current as { cause: unknown }).cause : null;
  }
  return null;
}

export function isUniqueViolation(error: unknown): boolean {
  return sqlStateOf(error) === PG_UNIQUE_VIOLATION;
}
