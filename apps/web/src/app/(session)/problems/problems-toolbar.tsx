'use client';

import { useId, useState, type ReactElement } from 'react';
import { Search } from 'lucide-react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
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
 * Ô TÌM commit khi bấm Enter hoặc rời ô, KHÔNG commit theo từng phím. Lý do là
 * lịch sử duyệt: mỗi lần ghi bộ lọc là một mục lịch sử, nên gõ "nginx" theo
 * từng phím sẽ chôn trang trước dưới năm mục rác và nút quay lại thành vô dụng
 * — đúng thứ mà yêu cầu "bấm quay lại được" đòi phải giữ.
 */
export function ProblemsToolbar({ controls }: { readonly controls: ProblemControls }): ReactElement {
  const searchId = useId();
  const orderId = useId();
  const directionId = useId();
  const committed = controls.query.filter.query ?? '';
  const [draft, setDraft] = useState(committed);

  // Bộ lọc đổi từ NƠI KHÁC (nút xoá lọc, hoặc người dùng bấm quay lại) thì ô
  // tìm phải theo. So khoá đã commit thay vì `useEffect` đồng bộ hai chiều —
  // hai nguồn cho một ô nhập là cách chắc chắn để có một lượt render mà ô hiện
  // một đằng còn URL nói một nẻo.
  const [syncedWith, setSyncedWith] = useState(committed);
  if (syncedWith !== committed) {
    setSyncedWith(committed);
    setDraft(committed);
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-border bg-card p-4 shadow-elevation-1">
      <div className="flex flex-wrap items-end gap-4">
        <form
          className="flex min-w-64 flex-1 flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            controls.setSearch(draft);
          }}
        >
          <Label htmlFor={searchId} className="text-xs font-medium text-muted-foreground">
            Tìm theo mã bài hoặc tên
          </Label>
          <div className="flex gap-2">
            <Input
              id={searchId}
              type="search"
              value={draft}
              placeholder="K8S-0042 hoặc pod treo"
              onChange={(event) => {
                setDraft(event.target.value);
              }}
              onBlur={() => {
                controls.setSearch(draft);
              }}
            />
            <Button type="submit" variant="outline" size="sm" iconLeft={<Search aria-hidden className="size-4" />}>
              Tìm
            </Button>
          </div>
        </form>

        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor={orderId} className="text-xs font-medium text-muted-foreground">
            Sắp xếp theo
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
            Chiều
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
          Xoá bộ lọc
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <FilterChecklist
          legend="Độ khó"
          options={PROBLEM_DIFFICULTIES}
          labels={PROBLEM_DIFFICULTY_LABELS}
          selected={controls.query.filter.difficulty ?? []}
          onToggle={controls.toggleDifficulty}
        />
        <FilterChecklist
          legend="Trạng thái của bạn"
          options={PROBLEM_VIEWER_STATUSES}
          labels={PROBLEM_VIEWER_STATUS_LABELS}
          selected={controls.query.filter.viewerStatus ?? []}
          onToggle={controls.toggleViewerStatus}
        />
        <FilterChecklist
          legend="Chủ đề"
          hint="Chọn nhiều chủ đề = bài khớp BẤT KỲ chủ đề nào."
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
