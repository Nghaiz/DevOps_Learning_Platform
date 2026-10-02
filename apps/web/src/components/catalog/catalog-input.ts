import type { ContentTopic, SandboxTierName, ScenarioDifficulty } from '@devops-platform/shared-types/scenario';

/**
 * Bộ lọc phía SERVER của trang danh mục. `'all'` là sentinel của UI, KHÔNG bao
 * giờ được gửi lên: mọi input list là `.strict()` và từ chối `difficulty: 'all'`.
 *
 * `topic` là tuỳ chọn trong kiểu vì chỉ ba trang có nó (`lessons.list`,
 * `labs.list`, `playgrounds.list`); vắng mặt đọc như `'all'`.
 */
export interface CatalogFilterState {
  readonly difficulty: ScenarioDifficulty | 'all';
  readonly tier: SandboxTierName | 'all';
  readonly topic?: ContentTopic | 'all';
}

export const NO_FILTER: CatalogFilterState = { difficulty: 'all', tier: 'all', topic: 'all' };

export interface CatalogListInput {
  readonly cursor?: string;
  readonly difficulty?: ScenarioDifficulty;
  readonly tier?: SandboxTierName;
  readonly topic?: ContentTopic;
}

/**
 * Input gửi lên cho MỘT lượt tải.
 *
 * ⛔ Không lọc ⇒ key VẮNG MẶT, không phải `undefined` hay `'all'`. Và tuyệt đối
 * không có `direction`: đó là field mà `useInfiniteQuery` của `@trpc/react-query`
 * tự chèn, và `.strict()` trả 400 cho nó (trang `/lessons` từng trắng vì vậy).
 * Phép kiểm giữ điều này là `catalog-input.test.ts`.
 */
export function buildCatalogListInput(
  filters: CatalogFilterState,
  cursor: string | undefined,
): CatalogListInput {
  const topic = filters.topic ?? 'all';
  return {
    ...(cursor === undefined ? {} : { cursor }),
    ...(filters.difficulty === 'all' ? {} : { difficulty: filters.difficulty }),
    ...(filters.tier === 'all' ? {} : { tier: filters.tier }),
    ...(topic === 'all' ? {} : { topic }),
  };
}

export function hasActiveFilter(filters: CatalogFilterState): boolean {
  return filters.difficulty !== 'all' || filters.tier !== 'all' || (filters.topic ?? 'all') !== 'all';
}
