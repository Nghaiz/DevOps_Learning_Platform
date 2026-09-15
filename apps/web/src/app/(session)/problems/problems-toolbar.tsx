'use client';

import { useId, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Label, SearchTabs, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@devops-platform/ui';
import { Button } from '@devops-platform/ui';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  type GameId,
  type ProblemOrderKey,
} from '@devops-platform/games';
import {
  PROBLEM_DIRECTION_LABELS,
  PROBLEM_ORDER_LABELS,
  PROBLEM_VIEWER_STATUSES,
  PROBLEM_VIEWER_STATUS_LABELS,
} from './problem-labels';
import {
  PROBLEM_FILTER_GAMES,
  gameName,
  topicIdsFor,
  topicLabelsFor,
} from './problem-game';
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
        <TopicFilter controls={controls} />
        <TagFilter
          tags={controls.query.filter.tags ?? []}
          onAdd={controls.addTag}
          onRemove={controls.removeTag}
        />
      </div>
    </div>
  );
}

/**
 * Khối lọc chủ đề, kèm bộ chọn GAME quyết định từ vựng của nó — §18 khối 6.
 *
 * ## Vì sao bộ chọn game nằm TRONG khối này, không nằm cạnh "Sắp xếp theo"
 *
 * Chỗ đứng là lời giải thích rẻ nhất. Đặt nó trên hàng điều khiển đầu — cạnh
 * thứ tự và chiều sắp — sẽ đọc như một chiều lọc thứ năm ngang hàng với độ khó,
 * và người dùng sẽ chờ bảng bài thu lại khi chọn "Git Game". Nó không làm thế:
 * `ProblemFilter` không có trường `gameId` và schema đầu vào của `problems.list`
 * khai `.strict()` (đo 2026-09-15 — xem `problem-game.ts`). Đặt nó ngay trên
 * danh sách chủ đề thì quan hệ "đổi cái này thì cái kia đổi theo" tự hiện ra,
 * và câu `game-hint` chỉ phải xác nhận điều mắt đã thấy.
 *
 * ## MỘT nhánh, từ 2026-09-15
 *
 * Bản đầu có hai nhánh vì hợp đồng `ProblemFilter.topics` còn đóng ở chín chủ đề
 * K8s: game chở được thì ô bấm được, game chưa chở được thì chủ đề vẫn hiện
 * nhưng KHOÁ kèm lý do. Hợp đồng nới xong thì nhánh thứ hai hết đối tượng.
 *
 * Lý lẽ của nhánh khoá vẫn đúng và đáng giữ lại đây phòng khi cần: khoá-kèm-lý-do
 * đúng hơn một danh sách rỗng, vì danh sách rỗng trả lời sai câu người dùng đang
 * hỏi — họ muốn biết game này có những chủ đề nào, và "tám chủ đề, chưa lọc
 * được" đúng hơn "không có chủ đề nào".
 */
function TopicFilter({ controls }: { readonly controls: ProblemControls }): ReactElement {
  const gameId = controls.query.game;

  /*
   * Nhánh KHOÁ đã bị GỠ 2026-09-15, cùng lượt nới `ProblemFilter.topics` sang
   * `ProblemTopicId`. Nó tồn tại vì hợp đồng lọc còn đóng ở chín chủ đề K8s, nên
   * chủ đề Git hiện ra được mà không gửi đi được; nay mọi game đi qua cùng một
   * đường và không còn trạng thái thứ hai để hiện.
   */
  return (
    <div className="flex flex-col gap-3">
      <GameSelect value={gameId} onChange={controls.setGame} />
      <FilterChecklist
        legend={t('catalog.problems.topic-legend')}
        hint={t('catalog.problems.topic-hint')}
        options={topicIdsFor(gameId)}
        labels={topicLabelsFor(gameId)}
        selected={controls.query.filter.topics ?? []}
        onToggle={controls.toggleTopic}
      />
    </div>
  );
}

/**
 * `Select` một lựa chọn, KHÁC hẳn bốn khối lọc còn lại vốn đều là nhiều lựa
 * chọn. Đó là điều đúng ở đây và là lý do §"SearchTabs chạy không có tab" ở đầu
 * file không áp dụng: từ vựng chủ đề của hai game là hai tập rời, nên "đang
 * chọn" luôn là đúng một game — một điều khiển một-lựa-chọn nói đúng trạng thái
 * chứ không che mất lựa chọn nào.
 */
function GameSelect(props: {
  readonly value: GameId;
  readonly onChange: (value: GameId) => void;
}): ReactElement {
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {t('catalog.problems.game-legend')}
      </Label>
      <p className="text-xs text-muted-foreground">{t('catalog.problems.game-hint')}</p>
      <Select
        value={props.value}
        onValueChange={(next) => {
          /*
            `onValueChange` của Radix trả `string`, nên phép thu hẹp phải là một
            lượt TRA trong danh sách thật, không phải `as GameId`. Ép kiểu ở đây
            sẽ nhận mọi chuỗi mà Radix có thể phát ra (kể cả chuỗi rỗng lúc bị
            xoá trạng thái) và đẩy thẳng nó vào URL.
          */
          const picked = PROBLEM_FILTER_GAMES.find((gameId) => gameId === next);
          if (picked !== undefined) {
            props.onChange(picked);
          }
        }}
      >
        <SelectTrigger id={id} className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROBLEM_FILTER_GAMES.map((gameId) => (
            <SelectItem key={gameId} value={gameId}>
              {gameName(gameId)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

