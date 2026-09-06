import type { SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

/**
 * Trạng thái bộ lọc của một trang danh mục (13.C task 9).
 *
 * `'all'` là giá trị SENTINEL của giao diện, không phải giá trị gửi lên server:
 * `listLessonsInput`/`listLabsInput`/`listPlaygroundsInput` khai
 * `difficulty: z.enum(SCENARIO_DIFFICULTIES).optional()`, nên "không lọc" phải
 * là **vắng mặt key**, không phải một chuỗi `'all'` — gửi `'all'` sẽ trượt
 * `z.enum` và trả 400.
 *
 * Radix `Select` cũng không nhận `value=""` (chuỗi rỗng là giá trị dành riêng
 * để reset), nên `'all'` là sentinel duy nhất dùng được ở cả hai đầu.
 */
export interface CatalogFilterState {
  readonly difficulty: ScenarioDifficulty | 'all';
  readonly tier: SandboxTierName | 'all';
}

export const NO_FILTER: CatalogFilterState = { difficulty: 'all', tier: 'all' };

/**
 * Input gửi lên `lessons.list` / `labs.list` / `playgrounds.list`.
 *
 * ⛔ KHÔNG có `direction`, và không được thêm — xem chú thích dài ở
 * `lessons-client.tsx`. Bộ test `catalog-input.test.ts` khẳng định điều này
 * bằng chính schema Zod của server, không bằng một bản chép tay.
 *
 * ⛔ KHÔNG có `limit`. Server đã có mặc định + trần (luật 4) và TRẢ VỀ `limit`
 * nó thực sự dùng; nhập lại hằng số đó ở client bắt phải import từ
 * `server/trpc/init`, tức kéo mã server vào bundle trình duyệt.
 */
export interface CatalogListInput {
  readonly cursor?: string;
  readonly difficulty?: ScenarioDifficulty;
  readonly tier?: SandboxTierName;
}

/**
 * Ghép trạng thái lọc + cursor thành input tRPC.
 *
 * Key vắng mặt hẳn khi không lọc — `exactOptionalPropertyTypes: true` của repo
 * làm `{ difficulty: undefined }` KHÔNG gán được vào `difficulty?: X`, và Zod
 * `.strict()` cũng phân biệt "vắng" với "có mà undefined". Spread có điều kiện
 * là cách duy nhất đúng ở cả hai tầng.
 */
export function buildCatalogListInput(
  filters: CatalogFilterState,
  cursor: string | undefined,
): CatalogListInput {
  return {
    ...(cursor === undefined ? {} : { cursor }),
    ...(filters.difficulty === 'all' ? {} : { difficulty: filters.difficulty }),
    ...(filters.tier === 'all' ? {} : { tier: filters.tier }),
  };
}

/** Có điều kiện lọc nào đang bật không — quyết định trạng thái rỗng nào được hiện. */
export function hasActiveFilter(filters: CatalogFilterState): boolean {
  return filters.difficulty !== 'all' || filters.tier !== 'all';
}
