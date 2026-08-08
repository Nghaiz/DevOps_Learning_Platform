/**
 * Rate limit cơ bản (luật 5 — phase-0.md 0.D task 20). In-memory, per-process —
 * ĐỦ cho dev một instance; giới hạn thật (đa instance) chuyển sang Traefik ở P3
 * (đã ghi rõ trong plan, không phải thiếu sót ở đây).
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 120;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** true = còn hạn mức; false = vượt (caller trả 429). */
export function checkRateLimit(
  key: string,
  now: number = Date.now(),
  windowMs: number = RATE_LIMIT_WINDOW_MS,
  maxRequests: number = RATE_LIMIT_MAX_REQUESTS,
): boolean {
  const existing = buckets.get(key);

  if (existing === undefined || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (existing.count >= maxRequests) {
    return false;
  }

  existing.count += 1;
  return true;
}

/** Chỉ dùng trong test — tránh state của test này rò sang test khác. */
export function resetRateLimitState(): void {
  buckets.clear();
}
