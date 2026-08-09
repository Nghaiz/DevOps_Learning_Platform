/** Body cap cho JSON request (luật 5). ~1MB — đủ cho payload tRPC/form ở P0. */
export const MAX_JSON_BODY_BYTES = 1_048_576;

/**
 * Kiểm bằng header `Content-Length` — KHÔNG đọc body. Rẻ, chạy được ở Edge
 * proxy, nhưng không bắt được request chunked-encoding thiếu header này;
 * giới hạn cứng (đọc stream, đếm byte) chuyển sang Traefik ở P3 cùng rate limit
 * (xem rate-limit.ts).
 */
export function exceedsBodyLimit(
  contentLengthHeader: string | null,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): boolean {
  if (contentLengthHeader === null) {
    return false;
  }
  const length = Number(contentLengthHeader);
  return Number.isFinite(length) && length > maxBytes;
}
