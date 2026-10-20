'use client';

import { useId, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Button, Input, Segmented, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ds';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  type ProblemFilter,
} from '@devops-platform/games';
import {
  PROBLEM_DIRECTION_LABELS,
  PROBLEM_ORDER_LABELS,
  PROBLEM_VIEWER_STATUSES,
  PROBLEM_VIEWER_STATUS_LABELS,
} from './problem-labels';
import { ALL_GAMES, PROBLEM_FILTER_GAMES, topicIdsFor, topicLabelsFor } from './problem-game';
import { ChipGroup, GameSwitch, TagFilter } from './problem-filter-groups';
import { DifficultyBars, ViewerStatusGlyph } from './problem-badges';
import type { ProblemControls } from './use-problem-controls';

/**
 * Số điều kiện lọc đang bật, để câu "Đang bật 3 điều kiện" nói đúng thứ nút xoá sắp
 * xoá. Thứ tự sắp KHÔNG tính: nó không phải điều kiện lọc, và `clearFilters` cố ý giữ
 * nguyên nó.
 */
function activeConditionCount(filter: ProblemFilter): number {
  return (
    (filter.difficulty?.length ?? 0) +
    (filter.topics?.length ?? 0) +
    (filter.tags?.length ?? 0) +
    (filter.viewerStatus?.length ?? 0) +
    (filter.query !== undefined && filter.query !== '' ? 1 : 0)
  );
}

/**
 * Thanh lọc + sắp xếp của `/problems`.
 *
 * ## Ô tìm là ô tìm THẬT, trên cả kho, và commit khi gửi form
 *
 * `problems.list` nhận `filter.query` và lọc trên TOÀN BỘ kho. Mỗi lần ghi bộ lọc là
 * một mục lịch sử duyệt, nên gõ "nginx" theo từng phím sẽ chôn trang trước dưới năm
 * mục rác: ô tìm chỉ áp khi bấm Enter hoặc nút Tìm.
 */
export function ProblemsToolbar({ controls }: { readonly controls: ProblemControls }): ReactElement {
  const searchId = useId();
  const orderId = useId();
  const committed = controls.query.filter.query ?? '';
  const [draft, setDraft] = useState(committed);

  // Bộ lọc đổi từ NƠI KHÁC (nút xoá lọc, nút quay lại) thì ô tìm phải theo. So ngay
  // trong lượt render thay vì một effect đồng bộ hai chiều.
  const [syncedWith, setSyncedWith] = useState(committed);
  if (syncedWith !== committed) {
    setSyncedWith(committed);
    setDraft(committed);
  }

  const active = activeConditionCount(controls.query.filter);
  const game = controls.query.game;

  return (
    <section aria-label={t('problem.oj.filter.region')} className="flex flex-col gap-5 border-b border-rule pb-6">
      <GameSwitch games={PROBLEM_FILTER_GAMES} value={game} onChange={controls.setGame} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            controls.setSearch(draft);
          }}
        >
          <label htmlFor={searchId} className="sr-only">
            {t('problem.oj.filter.search')}
          </label>
          <Input
            id={searchId}
            type="search"
            icon="search"
            inputSize="lg"
            value={draft}
            className="max-w-xl"
            placeholder={t('problem.oj.filter.search-placeholder')}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="secondary" size="lg">
            {t('problem.oj.filter.search-submit')}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={orderId} className="text-sm text-ink-3">
            {t('problem.oj.filter.order')}
          </label>
          <Select
            value={controls.query.orderBy}
            onValueChange={(value) => {
              // Thu hẹp bằng một lượt TRA trong danh sách thật, không bằng `as`.
              const picked = PROBLEM_ORDER_KEYS.find((key) => key === value);
              if (picked !== undefined) controls.setOrderBy(picked);
            }}
          >
            <SelectTrigger id={orderId} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROBLEM_ORDER_KEYS.map((key) => (
                <SelectItem key={key} value={key}>
                  {PROBLEM_ORDER_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Segmented
            size="sm"
            label={t('problem.oj.filter.direction')}
            value={controls.query.direction}
            onValueChange={controls.setDirection}
            options={[
              { value: 'asc', label: PROBLEM_DIRECTION_LABELS.asc, icon: 'arrow-up' },
              { value: 'desc', label: PROBLEM_DIRECTION_LABELS.desc, icon: 'arrow-down' },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <ChipGroup
          label={t('problem.oj.filter.difficulty')}
          options={PROBLEM_DIFFICULTIES}
          labels={PROBLEM_DIFFICULTY_LABELS}
          selected={controls.query.filter.difficulty ?? []}
          onToggle={controls.toggleDifficulty}
          decorate={(value) => <DifficultyBars value={value} />}
        />
        <ChipGroup
          label={t('problem.oj.filter.status')}
          options={PROBLEM_VIEWER_STATUSES}
          labels={PROBLEM_VIEWER_STATUS_LABELS}
          selected={controls.query.filter.viewerStatus ?? []}
          onToggle={controls.toggleViewerStatus}
          decorate={(value) => <ViewerStatusGlyph value={value} />}
        />
        {game === ALL_GAMES ? null : (
          <ChipGroup
            label={t('problem.oj.filter.topic')}
            hint={t('problem.oj.filter.topic-hint')}
            options={topicIdsFor(game)}
            labels={topicLabelsFor(game)}
            selected={controls.query.filter.topics ?? []}
            onToggle={controls.toggleTopic}
          />
        )}
        <TagFilter tags={controls.query.filter.tags ?? []} onAdd={controls.addTag} onRemove={controls.removeTag} />
      </div>

      {active > 0 || controls.hasActiveFilter ? (
        <div className="flex flex-wrap items-center gap-3">
          <p aria-live="polite" className="text-sm text-ink-2">
            {active > 0 ? t('problem.oj.filter.active', { n: active }) : null}
          </p>
          <Button variant="ghost" size="sm" icon="close" onClick={controls.clearFilters} disabled={!controls.hasActiveFilter}>
            {t('problem.oj.filter.clear')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
