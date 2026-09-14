'use client';

import { useId, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Label, SearchTabs, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
import { Button } from '@devops-platform/ui';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  PROBLEM_TOPICS,
  PROBLEM_TOPIC_LABELS,
  type ProblemOrderKey,
} from '@devops-platform/games';
import {
  PROBLEM_DIRECTION_LABELS,
  PROBLEM_ORDER_LABELS,
  PROBLEM_VIEWER_STATUSES,
  PROBLEM_VIEWER_STATUS_LABELS,
} from './problem-labels';
import { FilterChecklist, TagFilter } from './problem-filter-groups';
import type { ProblemControls } from './use-problem-controls';

const DIRECTIONS = ['asc', 'desc'] as const;

/**
 * Thanh lọc + sắp xếp của `/problems`.
 *
 * Đây là thứ bản của k8sgames.com KHÔNG có: họ liệt kê phẳng mười bài, không
 * lọc, không phân loại, không mã bài. Một trình chấm bài mà không lọc được thì
 * chỉ dùng được khi số bài còn đếm trên đầu ngón tay.
 *
 * ## Ô tìm ở đây là ô tìm THẬT, và đó là chỗ khác năm trang danh mục
 *
 * `problems.list` nhận `filter.query` và lọc trên TOÀN BỘ kho, còn năm trang
 * danh mục chỉ lọc được trên trang server vừa trả về. Hai màn vì vậy dùng hai
 * nhãn khác nhau (`catalog.problems.search-label` so với
 * nhãn “trong trang” của các màn lọc-tại-chỗ), và màn này KHÔNG mang câu cảnh báo phạm vi.
 * Mượn câu đó sang đây sẽ cảnh báo về một giới hạn không tồn tại, và một cảnh
 * báo sai chỗ dạy người dùng bỏ qua cảnh báo đúng chỗ.
 *
 * ## `SearchTabs` ở đây chạy KHÔNG có tab, và đó là quyết định
 *
 * Bốn chiều lọc của màn này (độ khó, trạng thái, chủ đề, tag) đều là NHIỀU LỰA
 * CHỌN: người dùng bật cùng lúc `easy` và `medium`, và luật gộp còn khác nhau
 * giữa chủ đề (HOẶC) với tag (VÀ). Một hàng tab là điều khiển MỘT lựa chọn; ánh
 * xạ nó vào bất kỳ chiều nào ở đây sẽ hoặc âm thầm bỏ các lựa chọn khác khi
 * người ta bấm tab, hoặc hiện một tab "đang chọn" trong khi thật ra có ba giá
 * trị đang bật. Cả hai đều là điều khiển nói dối. `SearchTabs` xử lý
 * `tabs: []` sẵn nên ô tìm vẫn dùng được mà không phải bịa ra một trục.
 *
 * ## Ô TÌM commit khi bấm Enter, KHÔNG commit theo từng phím
 *
 * Lý do là lịch sử duyệt: mỗi lần ghi bộ lọc là một mục lịch sử, nên gõ "nginx"
 * theo từng phím sẽ chôn trang trước dưới năm mục rác và nút quay lại thành vô
 * dụng, đúng thứ mà yêu cầu "bấm quay lại được" đòi phải giữ.
 *
 * Vì vậy `onSearchChange` chỉ nuôi bản nháp còn `onSearch` (Enter) mới commit.
 * Đây là chỗ khác năm trang danh mục lần thứ hai: ở đó ô tìm là state cục bộ
 * không đụng URL nên commit theo từng phím là đúng.
 */
export function ProblemsToolbar({ controls }: { readonly controls: ProblemControls }): ReactElement {
  const orderId = useId();
  const directionId = useId();
  const committed = controls.query.filter.query ?? '';
  const [draft, setDraft] = useState(committed);

  // Bộ lọc đổi từ NƠI KHÁC (nút xoá lọc, hoặc người dùng bấm quay lại) thì ô
  // tìm phải theo. So khoá đã commit thay vì `useEffect` đồng bộ hai chiều: hai
  // nguồn cho một ô nhập là cách chắc chắn để có một lượt render mà ô hiện một
  // đằng còn URL nói một nẻo.
  const [syncedWith, setSyncedWith] = useState(committed);
  if (syncedWith !== committed) {
    setSyncedWith(committed);
    setDraft(committed);
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-4 shadow-elevation-1">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('catalog.problems.search-label')}
          </span>
          <SearchTabs
            tabs={[]}
            value={draft}
            onSearchChange={setDraft}
            onSearch={controls.setSearch}
            placeholder={t('catalog.problems.search-placeholder')}
            label={t('catalog.problems.search-region')}
          />
        </div>

        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor={orderId} className="text-xs font-medium text-muted-foreground">
            {t('catalog.problems.order-label')}
          </Label>
          <Select
            value={controls.query.orderBy}
            onValueChange={(value) => {
              controls.setOrderBy(value as ProblemOrderKey);
            }}
          >
            <SelectTrigger id={orderId}>
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

        <div className="flex w-36 flex-col gap-2">
          <Label htmlFor={directionId} className="text-xs font-medium text-muted-foreground">
            {t('catalog.problems.direction-label')}
          </Label>
          <Select
            value={controls.query.direction}
            onValueChange={(value) => {
              controls.setDirection(value === 'desc' ? 'desc' : 'asc');
            }}
          >
            <SelectTrigger id={directionId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIRECTIONS.map((key) => (
                <SelectItem key={key} value={key}>
                  {PROBLEM_DIRECTION_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button variant="ghost" size="sm" onClick={controls.clearFilters} disabled={!controls.hasActiveFilter}>
          {t('catalog.action.clear-filter')}
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <FilterChecklist
          legend={t('catalog.problems.difficulty-legend')}
          options={PROBLEM_DIFFICULTIES}
          labels={PROBLEM_DIFFICULTY_LABELS}
          selected={controls.query.filter.difficulty ?? []}
          onToggle={controls.toggleDifficulty}
        />
        <FilterChecklist
          legend={t('catalog.problems.status-legend')}
          options={PROBLEM_VIEWER_STATUSES}
          labels={PROBLEM_VIEWER_STATUS_LABELS}
          selected={controls.query.filter.viewerStatus ?? []}
          onToggle={controls.toggleViewerStatus}
        />
        <FilterChecklist
          legend={t('catalog.problems.topic-legend')}
          hint={t('catalog.problems.topic-hint')}
          options={PROBLEM_TOPICS}
          labels={PROBLEM_TOPIC_LABELS}
          selected={controls.query.filter.topics ?? []}
          onToggle={controls.toggleTopic}
        />
        <TagFilter
          tags={controls.query.filter.tags ?? []}
          onAdd={controls.addTag}
          onRemove={controls.removeTag}
        />
      </div>
    </div>
  );
}
