'use client';

import { useMemo, type ReactElement, type ReactNode } from 'react';
import { SCENARIO_DIFFICULTIES, type ScenarioDifficulty } from '@devops-platform/shared-types/scenario';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, SearchTabs, type SearchTabItem } from '@devops-platform/ui';
import { CatalogIcon } from '../../components/catalog/catalog-icons';
import { FilterChip } from '../../components/catalog/catalog-toolbar';
import { difficultyLabel } from '../../components/catalog/catalog-labels';
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
 * Không phải vì nó xấu, mà vì nó nói dối ở đây. `CatalogToolbar` nhận
 * `fields: ('difficulty' | 'tier')[]`, và hai chiều lọc của trang này là **chủ
 * đề + độ khó**; chủ đề không có trong `ToolbarField`, còn `tier` thì là ô lọc
 * **sandbox**, và hiện một ô lọc sandbox trên trang mà cả bốn thẻ đều ghi "không
 * tốn sandbox" là đúng thứ chú thích của chính `CatalogToolbar` cảnh báo: một
 * điều khiển không bao giờ đổi kết quả.
 *
 * Thêm `topic` vào `ToolbarField` là sửa một file dùng chung của năm trang danh
 * mục giữa lượt fan-out song song. Nên phần TÁI DÙNG ĐƯỢC vẫn được tái dùng
 * nguyên vẹn: `FilterChip`, `CatalogIcon`, `SearchTabs` và bảng nhãn độ khó đều
 * là cùng một thứ với năm trang kia. Thứ viết lại ở đây chỉ là khung bọc và
 * nhóm chip thứ hai.
 *
 * ## Ô tìm ở đây KHÔNG cần cảnh báo phạm vi
 *
 * Ở năm trang danh mục, ô tìm chỉ soi trang server vừa trả về, nên chúng phải
 * nói ra điều đó. Ở đây bốn mục nằm sẵn trong bundle: "không khớp" nghĩa là
 * không khớp trong toàn bộ kho, và một câu cảnh báo mượn từ bên kia sẽ cảnh báo
 * về một giới hạn không tồn tại.
 *
 * ## Không có ô sắp xếp
 *
 * Bốn mục, thứ tự do lập trình viên đặt và mang nghĩa (mục chơi được đứng đầu).
 * Một ô "Sắp xếp" trên bốn dòng là điều khiển thừa; ở các trang danh mục khác nó
 * tồn tại vì server phân trang, thứ trang này không có.
 */

/** Nhóm chip có tiêu đề, cùng hình dạng với `FilterGroup` của thanh công cụ dùng chung. */
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

export function GamesToolbar(props: {
  readonly filters: GameFilterState;
  readonly shown: number;
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly onTopic: (value: GameTopic | 'all') => void;
  readonly onDifficulty: (value: ScenarioDifficulty | 'all') => void;
  readonly onClearFilters: () => void;
}): ReactElement {
  const filtering = hasActiveGameFilter(props.filters);
  const searching = props.search.trim() !== '';

  /**
   * Hàng tab ánh xạ sang CHỦ ĐỀ, không sang độ khó.
   *
   * Cùng luật với `CatalogToolbar` (`fields[0]`): chiều lọc thứ nhất lên tab,
   * phần còn lại ở lại dạng chip. Ở trang này chiều thứ nhất là chủ đề, vì đó là
   * thứ người ta chọn trước khi chọn độ khó khi tìm một game.
   */
  const tabs = useMemo<readonly SearchTabItem[]>(
    () => [
      { value: ALL, label: t('catalog.toolbar.all') },
      ...GAME_TOPICS.map((topic) => ({ value: topic, label: GAME_TOPIC_LABEL[topic] })),
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-elevation-1">
      <div className="flex flex-col gap-3">
        <SearchTabs
          tabs={tabs}
          activeTab={props.filters.topic}
          onTabChange={(value) => {
            props.onTopic(value as GameTopic | 'all');
          }}
          value={props.search}
          onSearchChange={props.onSearch}
          placeholder={t('catalog.toolbar.search-placeholder')}
          label={t('catalog.toolbar.search-region-games')}
        />

        <FilterGroup id="games-difficulty-label" label={t('catalog.games.difficulty-legend')}>
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {renderCopy(describeGameCount(props.shown, filtering || searching))}
        </p>
        {(filtering || searching) && (
          <Button variant="ghost" size="sm" onClick={props.onClearFilters}>
            <CatalogIcon name="clear" />
            {t('catalog.action.clear-filter')}
          </Button>
        )}
      </div>
    </div>
  );
}
