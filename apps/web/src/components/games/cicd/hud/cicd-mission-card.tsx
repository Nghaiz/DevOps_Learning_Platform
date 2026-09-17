'use client';

/**
 * Thẻ nhiệm vụ — đề bài và mục tiêu (19.D.4.6).
 *
 * Mượn vai trò của `k8s-arena/hud/mission-card.tsx`: một thẻ luôn ở cùng chỗ,
 * chở đúng hai thứ người chơi hỏi lại nhiều nhất giữa chừng — *"đề bài bảo làm
 * gì"* và *"tôi còn trượt mục tiêu nào"*.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA TRẠNG THÁI MỤC TIÊU, KHÔNG PHẢI HAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `chưa-chấm` ≠ `trượt`. Trước lượt chạy đầu tiên thì KHÔNG mục tiêu nào đã
 * trượt — chúng chỉ chưa được chấm. Vẽ chúng bằng dấu ✕ đỏ là nói với người chơi
 * rằng họ vừa làm sai bảy thứ trước khi họ kịp gõ dòng nào, và điều đó làm thẻ
 * này thành một bảng đáng lờ đi thay vì một bảng đáng nhìn.
 *
 * Nguồn của trạng thái là `failingRequired` / `failingOptional` của
 * `cicd-run.ts` — hai danh sách đã tính sẵn ở tầng chấm. ⛔ Không chấm lại ở
 * đây: `failingObjectiveIds` đọc cả `record` lẫn `cd`, và một bản chấm thứ hai ở
 * tầng vẽ sẽ trả lời khác bản gốc ở đúng những level khó nhất.
 */

import type { ReactElement } from 'react';
import { MarkdownView, cn } from '@devops-platform/ui';
import type { CicdObjective } from '@devops-platform/games';

import type { CicdRunOutcome } from '../cicd-run';

type ObjectiveState = 'unscored' | 'met' | 'failing';

export interface CicdMissionCardProps {
  readonly mission: string;
  readonly brief: string;
  readonly objectives: readonly CicdObjective[];
  readonly outcome: CicdRunOutcome | null;
}

export function objectiveState(
  objective: CicdObjective,
  outcome: CicdRunOutcome | null,
): ObjectiveState {
  if (outcome === null || outcome.kind !== 'scored') return 'unscored';
  const failing = objective.required ? outcome.failingRequired : outcome.failingOptional;
  return failing.includes(objective.id) ? 'failing' : 'met';
}

const MARK: Readonly<Record<ObjectiveState, string>> = {
  unscored: '○',
  met: '✓',
  failing: '✕',
};

const MARK_CLASS: Readonly<Record<ObjectiveState, string>> = {
  unscored: 'text-muted-foreground',
  met: 'text-success',
  failing: 'text-destructive',
};

/**
 * Nhãn chữ đi kèm dấu.
 *
 * ⚠ Ba trạng thái phân biệt bằng HAI kênh — dấu và màu — chứ không chỉ màu. Một
 * trạng thái chỉ phân biệt bằng màu là trạng thái người mù màu không đọc được,
 * và ô a11y không cho qua. Nhãn chữ nằm trong `title` + `aria-label` để hàng
 * mục tiêu không dài gấp đôi vì một từ lặp lại ở mọi dòng.
 */
const STATE_LABEL: Readonly<Record<ObjectiveState, string>> = {
  unscored: 'chưa chấm',
  met: 'đã đạt',
  failing: 'còn trượt',
};

export function CicdMissionCard({
  mission,
  brief,
  objectives,
  outcome,
}: CicdMissionCardProps): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">{mission}</p>

      <div className="text-sm text-muted-foreground">
        <MarkdownView markdown={brief} resolveAssetUrl={() => null} />
      </div>

      <ul className="flex flex-col gap-1" aria-label="Mục tiêu">
        {objectives.map((objective) => {
          const state = objectiveState(objective, outcome);
          return (
            <li key={objective.id} className="flex items-start gap-2 text-xs">
              {/*
               * `role="img"` + `aria-label` chứ KHÔNG phải một `sr-only` kèm
               * theo: thân bảng cuộn dọc, và `overflow-y: auto` kéo theo
               * `overflow-x: auto` — một nút văn bản `sr-only` trong vùng đó
               * làm trang trôi ngang. Đã cắn dự án này một lần (308px).
               */}
              <span
                role="img"
                aria-label={`${objective.required ? 'Bắt buộc' : 'Thưởng'}, ${STATE_LABEL[state]}`}
                className={cn('font-mono leading-5', MARK_CLASS[state])}
              >
                {MARK[state]}
              </span>
              <span className="text-muted-foreground">
                {objective.label}
                {objective.required ? null : (
                  <span className="ml-1 text-[0.65rem] text-muted-foreground">(thưởng)</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
