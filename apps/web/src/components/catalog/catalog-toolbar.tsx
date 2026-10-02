'use client';

import type { ReactElement, ReactNode } from 'react';
import { Check, Search, X } from 'lucide-react';
import {
  CONTENT_TOPICS,
  SANDBOX_TIER_NAMES,
  SCENARIO_DIFFICULTIES,
  type ContentTopic,
  type SandboxTierName,
  type ScenarioDifficulty,
} from '@devops-platform/shared-types/scenario';
import { renderCopy, t, type CopyRef } from '@devops-platform/copy';
import {
  Button,
  Chip,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@devops-platform/ui';
import { StationMarker, lineFillClass, lineForTopic } from '../kit';
import { catalogNoun, difficultyLabel, tierLabel, topicLabel, type CatalogKind } from './catalog-labels';
import type { SortOption } from './catalog-sort';
import { DEFAULT_SORT_KEY } from './catalog-sort';
import { hasActiveFilter, type CatalogFilterState } from './catalog-input';

/**
 * Chip lọc kiểu cũ, giữ chữ ký cho `app/games/games-toolbar.tsx` (lane game).
 * Hình là `Chip` vuông của `packages/ui`; dấu tích là kênh thứ hai ngoài màu nền.
 * Xoá được khi lane game thôi import nó.
 */
export function FilterChip(props: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: string;
}): ReactElement {
  return (
    <Chip selected={props.active} onClick={props.onClick}>
      {props.active && <Check aria-hidden="true" className="size-3.5" />}
      {props.children}
    </Chip>
  );
}

export type ToolbarField = 'topic' | 'difficulty' | 'tier';

const ALL = 'all';

/** Một hàng chip có nhãn mono, để mắt tách "lọc theo gì" khỏi "các lựa chọn". */
function FilterRow(props: { readonly id: string; readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
      <span id={props.id} className="w-20 shrink-0 type-label text-muted-foreground">
        {props.label}
      </span>
      <div role="group" aria-labelledby={props.id} className="flex flex-wrap gap-2">
        {props.children}
      </div>
    </div>
  );
}

/**
 * Chip chủ đề mang màu tuyến của chủ đề đó: chưa chọn thì một dấu ga màu tuyến,
 * chọn rồi thì cả chip đổ màu tuyến. Dấu tích vẫn mọc ra khi chọn, vì màu một
 * mình không đủ cho người mù màu.
 */
function TopicChip(props: {
  readonly topic: ContentTopic;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  const line = lineForTopic({ topic: props.topic });
  return (
    <Chip
      selected={props.selected}
      onClick={props.onSelect}
      className={cn(props.selected && ['border-transparent', lineFillClass(line)])}
    >
      {props.selected ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : (
        <StationMarker line={line} className="size-2.5" />
      )}
      {topicLabel(props.topic)}
    </Chip>
  );
}

/**
 * Thanh điều khiển của năm trang danh mục: ô tìm, sắp xếp, các hàng chip lọc.
 *
 * `fields` là DỮ LIỆU, không phải tuỳ chọn thẩm mỹ: chỉ hiện chiều lọc mà máy chủ
 * thật sự nhận. `playgrounds.list` không có độ khó, `paths.list` và `quiz.list`
 * không nhận bộ lọc nào; hiện một chip ở đó là cho người dùng một nút bấm không
 * bao giờ đổi kết quả.
 *
 * Câu nhắc phạm vi (`scopeNote`) đứng NGAY dưới ô tìm và chỉ có khi nó mang tin
 * (`describeLoadedScope`).
 */
export function CatalogToolbar<T>(props: {
  readonly kind: CatalogKind;
  readonly fields: readonly ToolbarField[];
  readonly filters: CatalogFilterState;
  readonly onTopic: (value: ContentTopic | 'all') => void;
  readonly onDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly onTier: (value: SandboxTierName | 'all') => void;
  readonly onClearFilters: () => void;
  readonly sortKey: string;
  readonly sortOptions: readonly SortOption<T>[];
  readonly onSort: (value: string) => void;
  /** Đúng chữ trong ô tìm (chưa gập dấu), để ô nhập hiện lại được. */
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly scopeNote: CopyRef | null;
  readonly disabled?: boolean;
}): ReactElement {
  const searchId = `catalog-search-${props.kind}`;
  const sortId = `catalog-sort-${props.kind}`;
  const filtering = hasActiveFilter(props.filters);
  const searching = props.search.trim() !== '';
  const topic = props.filters.topic ?? ALL;

  return (
    <div className="flex flex-col gap-5 border-b border-border pb-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start">
        <div role="search" aria-label={t('catalog.toolbar.search-region', { noun: catalogNoun(props.kind) })}>
          <label htmlFor={searchId} className="type-label text-muted-foreground">
            {t('catalog.toolbar.search-label')}
          </label>
          <div className="relative mt-2 max-w-xl">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              value={props.search}
              onChange={(event) => {
                props.onSearch(event.target.value);
              }}
              placeholder={t('catalog.toolbar.search-placeholder')}
              autoComplete="off"
              className="pl-9"
            />
          </div>
          {props.scopeNote !== null && (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {renderCopy(props.scopeNote)}
            </p>
          )}
        </div>

        {props.sortOptions.length > 0 && (
          <div>
            <label htmlFor={sortId} className="type-label text-muted-foreground">
              {t('catalog.toolbar.sort-label')}
            </label>
            <div className="mt-2">
              <Select value={props.sortKey} onValueChange={props.onSort} disabled={props.disabled ?? false}>
                <SelectTrigger id={sortId}>
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
          </div>
        )}
      </div>

      {props.fields.length > 0 && (
        <div className="flex flex-col gap-3">
          {props.fields.includes('topic') && (
            <FilterRow id={`${props.kind}-topic-label`} label={t('catalog.toolbar.topic-legend')}>
              <Chip selected={topic === ALL} onClick={() => props.onTopic(ALL)}>
                {t('catalog.toolbar.all')}
              </Chip>
              {CONTENT_TOPICS.map((value) => (
                <TopicChip
                  key={value}
                  topic={value}
                  selected={topic === value}
                  onSelect={() => props.onTopic(value)}
                />
              ))}
            </FilterRow>
          )}

          {props.fields.includes('difficulty') && (
            <FilterRow id={`${props.kind}-difficulty-label`} label={t('catalog.toolbar.difficulty-legend')}>
              <FilterChip active={props.filters.difficulty === ALL} onClick={() => props.onDifficulty(ALL)}>
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
            </FilterRow>
          )}

          {props.fields.includes('tier') && (
            <FilterRow id={`${props.kind}-tier-label`} label={t('catalog.toolbar.tier-legend')}>
              <FilterChip active={props.filters.tier === ALL} onClick={() => props.onTier(ALL)}>
                {t('catalog.toolbar.all')}
              </FilterChip>
              {SANDBOX_TIER_NAMES.map((tier) => (
                <FilterChip key={tier} active={props.filters.tier === tier} onClick={() => props.onTier(tier)}>
                  {tierLabel(tier)}
                </FilterChip>
              ))}
            </FilterRow>
          )}
        </div>
      )}

      {(filtering || searching) && (
        <div>
          <Button variant="ghost" size="sm" onClick={props.onClearFilters} iconLeft={<X aria-hidden="true" className="size-4" />}>
            {t('catalog.action.clear-filter')}
          </Button>
        </div>
      )}
    </div>
  );
}
