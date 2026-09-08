'use client';

import { useState, type ReactElement } from 'react';
import { BookOpen, Check, ChevronDown, ChevronUp, Lightbulb, Target } from 'lucide-react';
import { Button, MarkdownView, cn } from '@devops-platform/ui';
import type { Objective } from '@devops-platform/games';
import type { ArenaDispatch } from '../arena-contract.ts';

export interface MissionCardProps {
  readonly open: boolean;
  /** Mã bài hiện trên thẻ, ví dụ `K8S-01`. */
  readonly code: string;
  /**
   * MỘT dòng — `Level.mission`, không phải `Level.brief`.
   *
   * ⚠ Tính tới lúc viết, `mission` đã có trong dữ liệu level (`levels/l01.ts:15`
   * trở đi) nhưng CHƯA có trong `interface Level` của hợp đồng, nên mọi file
   * level đang đỏ với `TS2353: 'mission' does not exist in type 'Level'`. Đã báo
   * lead. Thẻ nhận câu này qua prop chứ KHÔNG tự cắt dòng đầu của `brief`: cắt
   * dòng đầu là suy ra một trường từ một trường khác, và nó ra một câu cụt ngay
   * khi lane nội dung mở `brief` bằng một câu dẫn chuyện — đúng như `l01.ts`
   * đang viết.
   */
  readonly goal: string;
  readonly objectives: readonly Objective[];
  /** `SessionStatus.objectivesMet` — id các mục tiêu ĐANG đạt. Tính lại mỗi tick, có thể mất đi. */
  readonly metIds: readonly string[];
  readonly hints: readonly string[];
  readonly hintsRevealed: number;
  /** `ArenaModeContext.codexAvailable`. `false` ⇒ KHÔNG render nút mở tra cứu. */
  readonly codexAvailable: boolean;
  /** `ArenaModeContext.hintsCostPoints`. `true` ở chế độ làm bài — nói giá TRƯỚC khi người chơi bấm. */
  readonly hintsCostPoints: boolean;
  readonly dispatch: ArenaDispatch;
  readonly getTick: () => number;
  readonly onOpenCodex: () => void;
}

/**
 * Thẻ nhiệm vụ — GỌN, và sự gọn là yêu cầu chứ không phải thẩm mỹ.
 *
 * Chủ dự án chê thẳng bản cũ: *"mô tả quá dài dòng nhiều chữ, để trong thẻ bé
 * còn cuộn lên xuống"*. Đo được: mỗi level bắt đọc ~382 từ (brief 189 + primer
 * 193) trước khi được gõ lệnh đầu tiên. Nên thẻ này chỉ giữ thứ người chơi cần
 * NHÌN LIÊN TỤC — một dòng mục tiêu và danh sách tick — còn kiến thức nền dời
 * hết sang ngăn tra cứu, mở theo yêu cầu.
 *
 * ⛔ KHÔNG có `overflow-y-auto` ở bất kỳ đâu trong file này. Một thanh cuộn ở
 * đây có nghĩa là nội dung dài quá, và câu trả lời đúng là cắt nội dung chứ
 * không phải nới thẻ. Thêm `overflow-y-auto` để "cho vừa" là làm sai yêu cầu.
 */
export function MissionCard({
  open,
  code,
  goal,
  objectives,
  metIds,
  hints,
  hintsRevealed,
  codexAvailable,
  hintsCostPoints,
  dispatch,
  getTick,
  onOpenCodex,
}: MissionCardProps): ReactElement | null {
  const [collapsed, setCollapsed] = useState(false);

  if (!open) {
    return null;
  }

  const met = new Set(metIds);
  // Tiến độ đếm trên mục tiêu BẮT BUỘC: mục tiêu thưởng không chặn qua màn, nên
  // gộp chúng vào mẫu số làm "2/4" trông như chưa xong trong khi bài đã qua.
  const required = objectives.filter((objective) => objective.required);
  const doneCount = required.filter((objective) => met.has(objective.id)).length;
  const lastHint = hintsRevealed > 0 ? (hints[hintsRevealed - 1] ?? null) : null;
  const hasMoreHints = hintsRevealed < hints.length;

  return (
    <section
      aria-label="Nhiệm vụ"
      className={cn(
        'pointer-events-auto absolute top-3 left-20 z-20 w-90 max-w-[calc(100vw-6rem)] overflow-hidden',
        'rounded-lg border border-border bg-card/90 shadow-elevation-2 backdrop-blur-sm',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <Target className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {code}
        </span>
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold',
            doneCount === required.length
              ? 'bg-status-done text-status-done-foreground'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {doneCount}/{required.length}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Mở thẻ nhiệm vụ' : 'Thu gọn thẻ nhiệm vụ'}
          className="rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </header>

      {collapsed ? null : (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
          {/*
            Qua `MarkdownView` chứ không in thẳng chuỗi: câu nhiệm vụ của lane
            nội dung có backtick (`Tạo pod \`web\` …`), và in thô sẽ hiện đúng
            dấu backtick ra màn hình — chính lỗi mà chú thích mở export
            `MarkdownView` ở `packages/ui/src/index.ts` mô tả.

            Bọc bằng `<div>` chứ không `<p>`: với một câu không có dòng trắng,
            `MarkdownView` render dạng Fragment nên `truncate` ăn thẳng vào chữ;
            nhưng nếu câu nào đó rơi vào nhánh khối thì nó phát ra `<p>`, và
            `<p>` lồng trong `<p>` là HTML không hợp lệ.
          */}
          <div className="truncate text-sm font-medium text-foreground" title={goal}>
            <MarkdownView markdown={goal} resolveAssetUrl={() => null} />
          </div>

          <ul className="flex flex-col gap-1">
            {objectives.map((objective) => (
              <ObjectiveRow key={objective.id} objective={objective} done={met.has(objective.id)} />
            ))}
          </ul>

          {lastHint === null ? null : (
            <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Gợi ý {hintsRevealed}: </span>
              {lastHint}
            </p>
          )}

          <div className="flex gap-2">
            {/* Ở chế độ làm bài không có ngăn tra cứu — không render nút, vì một nút bấm không phản ứng tệ hơn là không có nút. */}
            {codexAvailable ? (
              <Button size="sm" variant="outline" className="flex-1" onClick={onOpenCodex}>
                <BookOpen className="size-3.5" aria-hidden />
                Tra cứu
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              disabled={!hasMoreHints}
              onClick={() => dispatch({ tick: getTick(), kind: 'hint', index: hintsRevealed })}
            >
              <Lightbulb className="size-3.5" aria-hidden />
              {hasMoreHints
                ? `Gợi ý ${hintsRevealed + 1}/${hints.length}${hintsCostPoints ? ' · trừ điểm' : ''}`
                : 'Hết gợi ý'}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ObjectiveRow({
  objective,
  done,
}: {
  readonly objective: Objective;
  readonly done: boolean;
}): ReactElement {
  return (
    <li className="flex items-start gap-2 text-xs">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-sm border',
          done ? 'border-status-done bg-status-done text-status-done-foreground' : 'border-input',
        )}
      >
        {done ? <Check className="size-3" /> : null}
      </span>
      <span className={cn('leading-snug', done ? 'text-muted-foreground line-through' : 'text-foreground')}>
        {objective.label}
        {objective.required ? null : (
          <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">thưởng</span>
        )}
      </span>
      <span className="sr-only">{done ? 'đã đạt' : 'chưa đạt'}</span>
    </li>
  );
}
