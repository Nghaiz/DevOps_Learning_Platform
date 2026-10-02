'use client';

import { useId, useState, type ReactElement } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Search, X } from 'lucide-react';
import { t } from '@devops-platform/copy';
import {
  Button,
  Chip,
  Difficulty,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@devops-platform/ui';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  type ProblemFilter,
} from '@devops-platform/games';
import {
  PROBLEM_DIFFICULTY_LEVEL,
  PROBLEM_DIRECTION_LABELS,
  PROBLEM_ORDER_LABELS,
  PROBLEM_VIEWER_STATUSES,
  PROBLEM_VIEWER_STATUS_LABELS,
} from './problem-labels';
import { PROBLEM_FILTER_GAMES, topicIdsFor, topicLabelsFor } from './problem-game';
import { ChipGroup, GameSwitch, TagFilter } from './problem-filter-groups';
import type { ProblemControls } from './use-problem-controls';

const DIRECTIONS = ['asc', 'desc'] as const;

/**
 * Số điều kiện lọc đang bật, để câu "Đang bật 3 điều kiện" nói đúng thứ nút xoá
 * sắp xoá. Thứ tự sắp KHÔNG tính: nó không phải điều kiện lọc, và `clearFilters`
 * cố ý giữ nguyên nó.
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
 * ## Ô tìm là ô tìm THẬT, trên cả kho
 *
 * `problems.list` nhận `filter.query` và lọc trên TOÀN BỘ kho, khác các trang
 * danh mục chỉ lọc trong trang vừa tải. Vì vậy màn này không mang câu cảnh báo
 * phạm vi của các trang đó: mượn câu đó sang đây là cảnh báo về một giới hạn
 * không tồn tại.
 *
 * ## Ô tìm commit khi gửi form (Enter hoặc nút Tìm), KHÔNG theo từng phím
 *
 * Mỗi lần ghi bộ lọc là một mục lịch sử duyệt, nên gõ "nginx" theo từng phím sẽ
 * chôn trang trước dưới năm mục rác và nút quay lại thành vô dụng.
 *
 * ## Bốn chiều lọc đều là NHIỀU lựa chọn
 *
 * Độ khó, kết quả, chủ đề, tag: người dùng bật cùng lúc `easy` và `medium`, và
 * luật gộp còn khác nhau giữa chủ đề (HOẶC) với tag (VÀ). Vì thế chúng là nhóm
 * chip bật tắt, không phải một hàng tab một-lựa-chọn: tab ở đây sẽ hoặc âm thầm
 * bỏ các lựa chọn khác, hoặc hiện một ô "đang chọn" trong khi thật ra ba giá trị
 * đang bật.
 */
export function ProblemsToolbar({
  controls,
}: {
  readonly controls: ProblemControls;
}): ReactElement {
  const searchId = useId();
  const orderId = useId();
  const directionLabelId = useId();
  const committed = controls.query.filter.query ?? '';
  const [draft, setDraft] = useState(committed);

  // Bộ lọc đổi từ NƠI KHÁC (nút xoá lọc, hoặc người dùng bấm quay lại) thì ô tìm
  // phải theo. So khoá đã commit ngay trong lượt render thay vì một `useEffect`
  // đồng bộ hai chiều: hai nguồn cho một ô nhập là cách chắc chắn để có một lượt
  // render mà ô hiện một đằng còn URL nói một nẻo.
  const [syncedWith, setSyncedWith] = useState(committed);
  if (syncedWith !== committed) {
    setSyncedWith(committed);
    setDraft(committed);
  }

  const active = activeConditionCount(controls.query.filter);
  const gameId = controls.query.game;

  return (
    <section aria-label={t('problem.oj.filter.region')} className="mb-8 border-t-2 border-ink">
      <div className="flex flex-col gap-4 py-5 lg:flex-row lg:items-end">
        <form
          role="search"
          className="flex min-w-0 flex-1 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            controls.setSearch(draft);
          }}
        >
          <Label htmlFor={searchId} className="type-label text-muted-foreground">
            {t('problem.oj.filter.search')}
          </Label>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={searchId}
                type="search"
                value={draft}
                className="h-12 pl-10 text-base"
                placeholder={t('problem.oj.filter.search-placeholder')}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
              />
            </div>
            <Button type="submit" variant="ink" size="lg">
              {t('problem.oj.filter.search-submit')}
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex w-48 flex-col gap-2">
            <Label htmlFor={orderId} className="type-label text-muted-foreground">
              {t('problem.oj.filter.order')}
            </Label>
            <Select
              value={controls.query.orderBy}
              onValueChange={(value) => {
                /*
                  `onValueChange` của Radix trả `string`, nên thu hẹp bằng một lượt
                  TRA trong danh sách thật, không bằng `as`. Ép kiểu sẽ nhận mọi chuỗi
                  Radix có thể phát ra và đẩy thẳng nó vào URL.
                */
                const picked = PROBLEM_ORDER_KEYS.find((key) => key === value);
                if (picked !== undefined) {
                  controls.setOrderBy(picked);
                }
              }}
            >
              <SelectTrigger id={orderId} className="h-12">
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
          </div>

          <div className="flex flex-col gap-2">
            <span id={directionLabelId} className="type-label text-muted-foreground">
              {t('problem.oj.filter.direction')}
            </span>
            <div role="group" aria-labelledby={directionLabelId} className="flex h-12 items-center gap-1">
              {DIRECTIONS.map((direction) => {
                const Icon = direction === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow;
                return (
                  <Chip
                    key={direction}
                    selected={controls.query.direction === direction}
                    onClick={() => {
                      controls.setDirection(direction);
                    }}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {PROBLEM_DIRECTION_LABELS[direction]}
                  </Chip>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <GameSwitch games={PROBLEM_FILTER_GAMES} value={gameId} onChange={controls.setGame} />

      <ChipGroup
        label={t('problem.oj.filter.difficulty')}
        options={PROBLEM_DIFFICULTIES}
        labels={PROBLEM_DIFFICULTY_LABELS}
        selected={controls.query.filter.difficulty ?? []}
        onToggle={controls.toggleDifficulty}
        decorate={(value) => <Difficulty level={PROBLEM_DIFFICULTY_LEVEL[value]} />}
      />
      <ChipGroup
        label={t('problem.oj.filter.status')}
        options={PROBLEM_VIEWER_STATUSES}
        labels={PROBLEM_VIEWER_STATUS_LABELS}
        selected={controls.query.filter.viewerStatus ?? []}
        onToggle={controls.toggleViewerStatus}
      />
      <ChipGroup
        label={t('problem.oj.filter.topic')}
        hint={t('problem.oj.filter.topic-hint')}
        options={topicIdsFor(gameId)}
        labels={topicLabelsFor(gameId)}
        selected={controls.query.filter.topics ?? []}
        onToggle={controls.toggleTopic}
      />
      <TagFilter
        tags={controls.query.filter.tags ?? []}
        onAdd={controls.addTag}
        onRemove={controls.removeTag}
      />

      <div className="flex flex-wrap items-center justify-end gap-4 border-t border-border pt-4">
        <p aria-live="polite" className="font-mono text-xs text-foreground">
          {active > 0 ? t('problem.oj.filter.active', { n: active }) : null}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={controls.clearFilters}
          disabled={!controls.hasActiveFilter}
          iconLeft={<X aria-hidden className="size-4" />}
        >
          {t('problem.oj.filter.clear')}
        </Button>
      </div>
    </section>
  );
}
