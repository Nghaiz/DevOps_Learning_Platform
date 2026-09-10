'use client';

import { useMemo, type ReactElement, type ReactNode } from 'react';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_DIFFICULTIES,
  type SandboxTierName,
  type ScenarioDifficulty,
} from '@devops-platform/shared-types/scenario';
import { t } from '@devops-platform/copy';
import {
  Button,
  Label,
  SearchTabs,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  type SearchTabItem,
} from '@devops-platform/ui';
import { CatalogIcon } from './catalog-icons';
import {
  catalogNoun,
  describeResultCount,
  difficultyLabel,
  renderCopy,
  tierLabel,
  type CatalogKind,
} from './catalog-labels';
import type { SortOption } from './catalog-sort';
import { DEFAULT_SORT_KEY } from './catalog-sort';
import { hasActiveFilter, type CatalogFilterState } from './catalog-input';

/**
 * Nút lọc dạng chip.
 *
 * `aria-pressed` chứ không phải một class `active` thuần thị giác: trạng thái
 * lọc phải đọc được bằng trình đọc màn hình, và đây là thứ `keyboard.spec.ts`
 * đi qua.
 *
 * ## Trạng thái chọn mang HAI kênh, không chỉ màu
 *
 * Chip đang bật vừa đổi nền (`bg-primary`) vừa mọc thêm một dấu tích. Chỉ đổi
 * nền là đủ cho mắt bình thường nhưng mỏng với người mù màu, và mỏng cả với
 * người đang liếc nhanh một hàng sáu chip để tìm xem mình đã bật cái nào. Dấu
 * tích là thứ đọc được ở khoảng cách xa hơn một sắc độ.
 *
 * `ring-offset-background` đi CÙNG `ring-offset-2`, không tách rời: thiếu nó
 * thì Tailwind rơi về mặc định của chính nó (`--tw-ring-offset-color: #fff`),
 * tức một khe TRẮNG quanh vòng focus trên nền tối (`p16-tokens.md` §1.7).
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
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        'transition-colors duration-(--motion-fast) ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        props.active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      {props.active && <CatalogIcon name="selected" />}
      {props.children}
    </button>
  );
}

export type ToolbarField = 'difficulty' | 'tier';

/** Một nhóm điều khiển có tiêu đề + icon, để mắt tách được "lọc theo gì" khỏi "các lựa chọn". */
function FilterGroup(props: {
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={props.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CatalogIcon name="filter" />
        {props.label}
      </span>
      <div role="group" aria-labelledby={props.id} className="flex flex-wrap gap-2">
        {props.children}
      </div>
    </div>
  );
}

const ALL = 'all';

/**
 * Thanh điều khiển dùng chung: ô tìm + tab lọc + chip lọc + sắp xếp + số kết quả.
 *
 * ## Ô tìm là THÊM, không phải thay thế (16.C)
 *
 * Trước lượt này thanh công cụ không có ô tìm nào, chỉ có chip lọc và một select
 * sắp xếp. `SearchTabs` (vỏ bọc `gooey-search-tabs` do `packages/ui` sở hữu)
 * mang theo cả một hàng tab, nên câu hỏi thật không phải "đặt ô tìm ở đâu" mà
 * là "hàng tab đó ánh xạ sang cái gì".
 *
 * Câu trả lời: sang **chiều lọc thứ nhất mà trang này thật sự có**, tức
 * `fields[0]`. Các chiều còn lại ở lại dạng chip. Ánh xạ này là DỮ LIỆU chứ
 * không phải một bảng viết tay cho từng trang, nên năm trang không trôi khỏi
 * nhau:
 *
 * | Trang | `fields` | Tab | Chip |
 * |---|---|---|---|
 * | `/lessons`, `/labs` | `['difficulty','tier']` | độ khó | hạng sandbox |
 * | `/playgrounds` | `['tier']` | hạng sandbox | không có |
 * | `/paths`, `/quiz` | `[]` | không có | không có |
 *
 * `SearchTabs` xử lý `tabs: []` sẵn (`hasTabs = tabs.length > 0` trong gói),
 * nên hai trang cuối vẫn có ô tìm mà không mọc ra một hàng tab giả.
 *
 * ⚠ `fields` KHÔNG phải tuỳ chọn thẩm mỹ: `playgrounds.list` nhận `difficulty`
 * nhưng **bỏ qua** nó (`PlaygroundSummary` không có field độ khó). Hiện ô lọc đó
 * trên `/playgrounds` sẽ cho người dùng một nút bấm không bao giờ đổi kết quả,
 * tức một điều khiển nói dối. Cùng lý do, `paths.list` và `quiz.list` nhận đúng
 * `listInputSchema` và `.strict()` từ chối mọi field lọc.
 *
 * ## `shown` là `null` khi CHƯA BIẾT, không phải `0`
 *
 * Lúc đang tải và lúc lỗi, số kết quả là thứ chưa đo được. Điền `0` vào đó sẽ
 * hiện "0 bài học", một khẳng định về kho phát ra đúng lúc ta không biết gì về
 * kho. `null` ⇒ không in dòng nào.
 */
export function CatalogToolbar<T>(props: {
  readonly kind: CatalogKind;
  readonly fields: readonly ToolbarField[];
  readonly filters: CatalogFilterState;
  readonly onDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly onTier: (value: SandboxTierName | 'all') => void;
  readonly onClearFilters: () => void;
  readonly sortKey: string;
  readonly sortOptions: readonly SortOption<T>[];
  readonly onSort: (value: string) => void;
  /** Đúng chữ trong ô tìm (chưa gập dấu), để ô nhập hiện lại được. */
  readonly search: string;
  readonly onSearch: (value: string) => void;
  /** Số mục đang hiện. `null` = chưa biết (đang tải / lỗi), KHÔNG in dòng đếm. */
  readonly shown: number | null;
  readonly hasNext: boolean;
  readonly disabled?: boolean;
}): ReactElement {
  const tabField = props.fields[0];
  const chipFields = props.fields.slice(1);
  const filtering = hasActiveFilter(props.filters);
  const searching = props.search.trim() !== '';

  const tabs = useMemo<readonly SearchTabItem[]>(() => {
    if (tabField === 'difficulty') {
      return [
        { value: ALL, label: t('catalog.toolbar.all') },
        ...SCENARIO_DIFFICULTIES.map((level) => ({ value: level, label: difficultyLabel(level) })),
      ];
    }
    if (tabField === 'tier') {
      return [
        { value: ALL, label: t('catalog.toolbar.all') },
        ...SANDBOX_TIER_NAMES.map((tier) => ({ value: tier, label: tierLabel(tier) })),
      ];
    }
    return [];
  }, [tabField]);

  const activeTab = tabField === 'difficulty' ? props.filters.difficulty : props.filters.tier;

  /**
   * Một `onTabChange` cho cả hai chiều, phân nhánh theo `tabField`.
   *
   * Ép kiểu là an toàn vì `tabs` ở trên chỉ sinh ra giá trị từ chính hai hằng
   * số miền (`SCENARIO_DIFFICULTIES`, `SANDBOX_TIER_NAMES`) cộng sentinel
   * `'all'`; gói ngoài trả lại nguyên văn `value` mà ta đưa vào, không tự đặt
   * ra giá trị mới.
   */
  const onTabChange = (value: string): void => {
    if (tabField === 'difficulty') {
      props.onDifficulty(value as ScenarioDifficulty | 'all');
    } else if (tabField === 'tier') {
      props.onTier(value as SandboxTierName | 'all');
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-elevation-1">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-3">
          <SearchTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
            value={props.search}
            onSearchChange={props.onSearch}
            placeholder={t('catalog.toolbar.search-placeholder')}
            label={t('catalog.toolbar.search-region', { noun: catalogNoun(props.kind) })}
          />

          {chipFields.includes('tier') && (
            <FilterGroup id="catalog-tier-label" label={t('catalog.toolbar.tier-legend')}>
              <FilterChip active={props.filters.tier === ALL} onClick={() => props.onTier(ALL)}>
                {t('catalog.toolbar.all')}
              </FilterChip>
              {SANDBOX_TIER_NAMES.map((tier) => (
                <FilterChip key={tier} active={props.filters.tier === tier} onClick={() => props.onTier(tier)}>
                  {tierLabel(tier)}
                </FilterChip>
              ))}
            </FilterGroup>
          )}

          {chipFields.includes('difficulty') && (
            <FilterGroup id="catalog-difficulty-label" label={t('catalog.toolbar.difficulty-legend')}>
              <FilterChip
                active={props.filters.difficulty === ALL}
                onClick={() => props.onDifficulty(ALL)}
              >
                {t('catalog.toolbar.all')}
              </FilterChip>
              {SCENARIO_DIFFICULTIES.map((level) => (
                <FilterChip
                  key={level}
                  active={props.filters.difficulty === level}
                  onClick={() => props.onDifficulty(level)}
                >
                  {difficultyLabel(level)}
                </FilterChip>
              ))}
            </FilterGroup>
          )}
        </div>

        {props.sortOptions.length > 0 && (
          <div className="flex w-full flex-col gap-1.5 lg:w-56">
            <Label htmlFor="catalog-sort" className="inline-flex items-center gap-1.5">
              <CatalogIcon name="sort" />
              {t('catalog.toolbar.sort-label')}
            </Label>
            <Select value={props.sortKey} onValueChange={props.onSort} disabled={props.disabled ?? false}>
              <SelectTrigger id="catalog-sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_SORT_KEY}>{t('catalog.sort.stock')}</SelectItem>
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

      {(props.shown !== null || filtering || searching) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {props.shown === null
              ? ''
              : renderCopy(
                  describeResultCount({
                    kind: props.kind,
                    shown: props.shown,
                    hasNext: props.hasNext,
                    hasActiveFilter: filtering,
                  }),
                )}
          </p>
          {(filtering || searching) && (
            <Button variant="ghost" size="sm" onClick={props.onClearFilters}>
              <CatalogIcon name="clear" />
              {t('catalog.action.clear-filter')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
