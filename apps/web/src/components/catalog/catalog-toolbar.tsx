'use client';

import type { ReactElement } from 'react';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_DIFFICULTIES,
  type SandboxTierName,
  type ScenarioDifficulty,
} from '@devops-platform/shared-types/scenario';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, cn } from '@devops-platform/ui';
import { DIFFICULTY_LABEL, TIER_LABEL } from './catalog-labels';
import type { SortOption } from './catalog-sort';
import { DEFAULT_SORT_KEY } from './catalog-sort';
import type { CatalogFilterState } from './catalog-input';

/**
 * Nút lọc dạng chip.
 *
 * Trước 13.C mỗi trang danh mục tự chép một `FilterButton` giống hệt (lessons,
 * labs), mỗi bản mang một cặp class màu trần của Tailwind. Gom về đây là điều
 * kiện để câu "không màu hardcode" đúng ở MỘT chỗ thay vì phải đúng ở ba chỗ —
 * và để grep AC (`phase-13-exec.md` §5) không phải bỏ qua ngoại lệ nào.
 *
 * `aria-pressed` chứ không phải một class `active` thuần thị giác: trạng thái
 * lọc phải đọc được bằng trình đọc màn hình, và đây là thứ `keyboard.spec.ts`
 * của 13.H đi qua.
 */
export function FilterChip(props: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        props.active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {props.children}
    </button>
  );
}

export type ToolbarField = 'difficulty' | 'tier';

/**
 * Thanh điều khiển dùng chung: lọc (độ khó, tier) + sắp xếp.
 *
 * `fields` quyết định điều khiển nào hiện ra, và nó KHÔNG phải tuỳ chọn thẩm
 * mỹ: `playgrounds.list` nhận `difficulty` nhưng **bỏ qua** nó
 * (`PlaygroundSummary` không có field độ khó — xem chú thích ở
 * `routers/playgrounds.ts`). Hiện ô lọc đó trên `/playgrounds` sẽ cho người
 * dùng một nút bấm không bao giờ đổi kết quả — một điều khiển nói dối.
 */
export function CatalogToolbar<T>(props: {
  readonly fields: readonly ToolbarField[];
  readonly filters: CatalogFilterState;
  readonly onDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly onTier: (value: SandboxTierName | 'all') => void;
  readonly sortKey: string;
  readonly sortOptions: readonly SortOption<T>[];
  readonly onSort: (value: string) => void;
  readonly disabled?: boolean;
}): ReactElement {
  const showDifficulty = props.fields.includes('difficulty');
  const showTier = props.fields.includes('tier');

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-3">
        {showDifficulty && (
          <div className="flex flex-wrap items-center gap-2">
            <span id="catalog-difficulty-label" className="text-sm text-muted-foreground">
              Độ khó:
            </span>
            <div role="group" aria-labelledby="catalog-difficulty-label" className="flex flex-wrap gap-2">
              <FilterChip active={props.filters.difficulty === 'all'} onClick={() => props.onDifficulty('all')}>
                Tất cả
              </FilterChip>
              {SCENARIO_DIFFICULTIES.map((level) => (
                <FilterChip
                  key={level}
                  active={props.filters.difficulty === level}
                  onClick={() => props.onDifficulty(level)}
                >
                  {DIFFICULTY_LABEL[level]}
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        {showTier && (
          <div className="flex flex-wrap items-center gap-2">
            <span id="catalog-tier-label" className="text-sm text-muted-foreground">
              Sandbox:
            </span>
            <div role="group" aria-labelledby="catalog-tier-label" className="flex flex-wrap gap-2">
              <FilterChip active={props.filters.tier === 'all'} onClick={() => props.onTier('all')}>
                Tất cả
              </FilterChip>
              {SANDBOX_TIER_NAMES.map((tier) => (
                <FilterChip key={tier} active={props.filters.tier === tier} onClick={() => props.onTier(tier)}>
                  {TIER_LABEL[tier]}
                </FilterChip>
              ))}
            </div>
          </div>
        )}
      </div>

      {props.sortOptions.length > 0 && (
        <div className="flex w-full flex-col gap-1.5 lg:w-56">
          {/*
            Nhãn nói "trong trang" ngay trên điều khiển, không chờ tới câu cảnh
            báo bên dưới: server không nhận tham số sắp xếp nào (xem
            `catalog-sort.ts`), nên một nhãn "Sắp xếp" trần đã là lời khẳng định
            về một thứ tự toàn kho mà sản phẩm không có.
          */}
          <Label htmlFor="catalog-sort">Sắp xếp (trong trang)</Label>
          <Select value={props.sortKey} onValueChange={props.onSort} disabled={props.disabled ?? false}>
            <SelectTrigger id="catalog-sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_SORT_KEY}>Thứ tự kho</SelectItem>
              {props.sortOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
