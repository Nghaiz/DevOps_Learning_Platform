/**
 * Quy ước id của **bản nháp kế nhiệm**, ở phía client.
 *
 * Server đã có `draftIdFor` / `basePublishedIdFor` trong
 * `server/trpc/routers/authoring.ts`, nhưng module đó kéo theo `node:crypto`,
 * drizzle và `@trpc/server` — import nó vào một Client Component là kéo cả
 * driver Postgres vào bundle trình duyệt (hạng lỗi đã làm đổ một lượt build ở
 * chặng trước). Nên hằng số được lặp lại ở đây, một dòng, có test.
 *
 * ⛔ `__draft` — HAI gạch dưới, và `scenarioIdSchema` KHÔNG cho phép ký tự `_`.
 * Đó là điều làm phép suy này an toàn: không id nào người soạn tự đặt được có
 * thể trông giống một bản nháp kế nhiệm.
 */
export const DRAFT_SUFFIX = '__draft';

/** Id đang mở có phải bản nháp kế nhiệm không, và nếu có thì nó kế nhiệm bài nào. */
export function basePublishedIdOf(id: string): string | null {
  return id.endsWith(DRAFT_SUFFIX) ? id.slice(0, -DRAFT_SUFFIX.length) : null;
}

export function isSuccessorDraftId(id: string): boolean {
  return basePublishedIdOf(id) !== null;
}
