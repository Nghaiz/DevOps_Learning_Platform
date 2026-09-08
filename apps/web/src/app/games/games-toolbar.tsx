'use client';

import type { ReactElement, ReactNode } from 'react';
import { SCENARIO_DIFFICULTIES, type ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { Button } from '@devops-platform/ui';
import { CatalogIcon } from '../../components/catalog/catalog-icons';
import { FilterChip } from '../../components/catalog/catalog-toolbar';
import { DIFFICULTY_LABEL } from '../../components/catalog/catalog-labels';
import {
  GAME_TOPICS,
  GAME_TOPIC_LABEL,
  describeGameCount,
  hasActiveGameFilter,
  type GameFilterState,
  type GameTopic,
} from './games-catalog';

/**
 * Thanh lọc của `/games`.
 *
 * ## Vì sao KHÔNG dùng `CatalogToolbar` dùng chung
 *
 * Không phải vì nó xấu — vì nó nói dối ở đây. `CatalogToolbar` nhận
 * `fields: ('difficulty' | 'tier')[]`, và hai chiều lọc của trang này là **chủ
 * đề + độ khó**; chủ đề không có trong `ToolbarField`, còn `tier` thì là ô lọc
 * **sandbox** — hiện một ô lọc sandbox trên trang mà cả bốn thẻ đều ghi "không
 * tốn sandbox" là đúng thứ chú thích của chính `CatalogToolbar` cảnh báo: một
 * điều khiển không bao giờ đổi kết quả.
 *
 * Thêm `topic` vào `ToolbarField` là sửa một file dùng chung của năm trang danh
 * mục giữa lượt fan-out song song — ngoài ranh giới sở hữu của lane này
 * (`phase-14-exec.md` §7). Nên phần TÁI DÙNG ĐƯỢC vẫn được tái dùng nguyên vẹn:
 * `FilterChip` (nền + dấu tích + `aria-pressed`) và `CatalogIcon` đều import từ
 * chính thanh công cụ dùng chung, và `DIFFICULTY_LABEL` là cùng một bảng nhãn.
 * Thứ viết lại ở đây chỉ là khung bọc và nhóm chip thứ hai.
 *
 * ## Không có ô sắp xếp
 *
 * Bốn mục, thứ tự do lập trình viên đặt và mang nghĩa (mục chơi được đứng đầu).
 * Một ô "Sắp xếp" trên bốn dòng là điều khiển thừa; và ở các trang danh mục
 * khác nó tồn tại vì server phân trang, thứ trang này không có.
 */

/** Nhóm chip có tiêu đề — cùng hình dạng với `FilterGroup` của thanh công cụ dùng chung. */
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

export function GamesToolbar(props: {
  readonly filters: GameFilterState;
  readonly shown: number;
  readonly onTopic: (value: GameTopic | 'all') => void;
  readonly onDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly onClearFilters: () => void;
}): ReactElement {
  const filtering = hasActiveGameFilter(props.filters);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3">
        <FilterGroup id="games-topic-label" label="Chủ đề">
          <FilterChip active={props.filters.topic === 'all'} onClick={() => props.onTopic('all')}>
            Tất cả
          </FilterChip>
          {GAME_TOPICS.map((topic) => (
            <FilterChip
              key={topic}
              active={props.filters.topic === topic}
              onClick={() => props.onTopic(topic)}
            >
              {GAME_TOPIC_LABEL[topic]}
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup id="games-difficulty-label" label="Độ khó khi bắt đầu">
          <FilterChip
            active={props.filters.difficulty === 'all'}
            onClick={() => props.onDifficulty('all')}
          >
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
        </FilterGroup>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {describeGameCount(props.shown, filtering)}
        </p>
        {filtering && (
          <Button variant="ghost" size="sm" onClick={props.onClearFilters}>
            <CatalogIcon name="clear" />
            Xoá bộ lọc
          </Button>
        )}
      </div>
    </div>
  );
}
