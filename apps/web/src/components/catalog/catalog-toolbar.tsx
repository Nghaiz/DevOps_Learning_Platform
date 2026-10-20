'use client';

import type { ReactElement } from 'react';
import {
  CONTENT_TOPICS,
  SANDBOX_TIER_NAMES,
  SCENARIO_DIFFICULTIES,
  type ContentTopic,
  type SandboxTierName,
  type ScenarioDifficulty,
} from '@devops-platform/shared-types/scenario';
import { renderCopy, t, type CopyRef } from '@devops-platform/copy';
import { Button, Chip, Input, Segmented, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ds';
import { TOPIC_ICON } from '../../lib/topic-look';
import { catalogNoun, difficultyLabel, tierLabel, topicLabel, type CatalogKind } from './catalog-labels';
import type { SortOption } from './catalog-sort';
import { DEFAULT_SORT_KEY } from './catalog-sort';
import { hasActiveFilter, type CatalogFilterState } from './catalog-input';

export type ToolbarField = 'topic' | 'difficulty' | 'tier';

const ALL = 'all';

/**
 * Thanh điều khiển của năm trang danh mục: ô tìm, sắp xếp, chip chủ đề có màu và
 * biểu tượng của chủ đề, hai bộ chọn một (độ khó, sandbox).
 *
 * `fields` là DỮ LIỆU, không phải tuỳ chọn thẩm mỹ: chỉ hiện chiều lọc mà máy chủ
 * thật sự nhận. `playgrounds.list` không có độ khó, `paths.list` và `quiz.list`
 * không nhận bộ lọc nào; hiện một chip ở đó là cho người dùng một nút bấm không
 * bao giờ đổi kết quả.
 *
 * Câu nhắc phạm vi (`scopeNote`) đứng NGAY dưới ô tìm và chỉ có khi nó mang tin.
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
    <div className="flex flex-col gap-4 border-b border-rule pb-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="search"
          aria-label={t('catalog.toolbar.search-region', { noun: catalogNoun(props.kind) })}
          className="w-full max-w-md"
        >
          <label htmlFor={searchId} className="sr-only">
            {t('catalog.toolbar.search-label')}
          </label>
          <Input
            id={searchId}
            type="search"
            icon="search"
            inputSize="lg"
            value={props.search}
            onChange={(event) => props.onSearch(event.target.value)}
            placeholder={t('catalog.toolbar.search-placeholder')}
            autoComplete="off"
          />
        </div>

        {props.sortOptions.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor={sortId} className="whitespace-nowrap text-sm text-ink-3">
              {t('catalog.toolbar.sort-label')}
            </label>
            <Select value={props.sortKey} onValueChange={props.onSort} disabled={props.disabled ?? false}>
              <SelectTrigger id={sortId} className="w-48">
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
        ) : null}
      </div>

      {props.scopeNote === null ? null : (
        <p role="status" className="-mt-1 text-sm text-ink-3">
          {renderCopy(props.scopeNote)}
        </p>
      )}

      {props.fields.includes('topic') ? (
        <div role="group" aria-label={t('catalog.toolbar.topic-legend')} className="-mx-1 flex flex-wrap gap-2 px-1">
          <Chip pressed={topic === ALL} onPressedChange={() => props.onTopic(ALL)} icon="layers">
            {t('catalog.toolbar.all')}
          </Chip>
          {CONTENT_TOPICS.map((value) => (
            <Chip
              key={value}
              topic={value}
              icon={TOPIC_ICON[value]}
              pressed={topic === value}
              onPressedChange={(pressed) => props.onTopic(pressed ? value : ALL)}
            >
              {topicLabel(value)}
            </Chip>
          ))}
        </div>
      ) : null}

      {props.fields.includes('difficulty') || props.fields.includes('tier') ? (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {props.fields.includes('difficulty') ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-3">{t('catalog.toolbar.difficulty-legend')}</span>
              <Segmented
                size="sm"
                label={t('catalog.toolbar.difficulty-legend')}
                value={props.filters.difficulty ?? ALL}
                onValueChange={(value) => props.onDifficulty(value as ScenarioDifficulty | 'all')}
                options={[
                  { value: ALL, label: t('catalog.toolbar.all') },
                  ...SCENARIO_DIFFICULTIES.map((level) => ({ value: level, label: difficultyLabel(level) })),
                ]}
              />
            </div>
          ) : null}
          {props.fields.includes('tier') ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-ink-3">{t('catalog.toolbar.tier-legend')}</span>
              <Segmented
                size="sm"
                label={t('catalog.toolbar.tier-legend')}
                value={props.filters.tier ?? ALL}
                onValueChange={(value) => props.onTier(value as SandboxTierName | 'all')}
                options={[
                  { value: ALL, label: t('catalog.toolbar.all') },
                  ...SANDBOX_TIER_NAMES.map((tier) => ({ value: tier, label: tierLabel(tier) })),
                ]}
              />
            </div>
          ) : null}
          {filtering || searching ? (
            <Button variant="ghost" size="sm" icon="close" onClick={props.onClearFilters}>
              {t('catalog.action.clear-filter')}
            </Button>
          ) : null}
        </div>
      ) : filtering || searching ? (
        <div>
          <Button variant="ghost" size="sm" icon="close" onClick={props.onClearFilters}>
            {t('catalog.action.clear-filter')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
