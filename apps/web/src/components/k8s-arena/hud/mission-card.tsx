'use client';

import { useState, type ReactElement } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  ShieldAlert,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { Button, MarkdownView, cn } from '@devops-platform/ui';
import type { Objective } from '@devops-platform/games';
import type { ArenaDispatch } from '../arena-contract.ts';
import type { HintReveal } from '../../../lib/use-hint-reveal';

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
  /**
   * `ObjectiveKinds.guards` — mục tiêu ĐÚNG SẴN mà người chơi phải giữ cho đúng.
   *
   * Chúng hiện thành một khối riêng ở dưới, KHÔNG phải ô tích. Lý do: một ràng
   * buộc "đừng làm hỏng thứ đang chạy" trông y hệt một việc đã làm xong, nên
   * người vừa vào bài đọc được rằng game tự hoàn thành hộ họ một phần — đúng
   * thứ chủ dự án báo 2026-09-08.
   */
  readonly guardIds: readonly string[];
  readonly hints: readonly string[];
  readonly hintsRevealed: number;
  /**
   * `ArenaModeContext.hintReveals` — chữ xin được từ máy chủ, theo chỉ số.
   *
   * Ở chế độ `problem`, `hints` toàn CHUỖI RỖNG: `problems.byCode` che chữ của
   * gợi ý chưa mở (§18.B.4). Nên chữ thật đọc từ đây, và `hints` chỉ còn dùng để
   * biết bài có BAO NHIÊU gợi ý.
   */
  readonly hintReveals: ReadonlyMap<number, HintReveal>;
  /**
   * `ArenaModeContext.onRevealHint`. `null` ở chế độ `level` — chữ đã có sẵn.
   *
   * ⛔ Trả `null` ⇒ ĐỪNG bắn action `hint`. Xem `lib/use-hint-reveal.ts`.
   */
  readonly onRevealHint: ((index: number) => Promise<string | null>) | null;
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
  guardIds,
  hints,
  hintsRevealed,
  hintReveals,
  onRevealHint,
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
  const guard = new Set(guardIds);
  const goals = objectives.filter((objective) => !guard.has(objective.id));
  const guards = objectives.filter((objective) => guard.has(objective.id));
  /*
   * Tiến độ đếm trên VIỆC PHẢI LÀM và bắt buộc.
   *
   * Hai phép loại, hai lý do khác nhau. Mục tiêu thưởng bị loại vì nó không chặn
   * qua màn, nên gộp vào mẫu số làm "2/4" trông như chưa xong trong khi bài đã
   * qua. Mục tiêu PHẢI GIỮ bị loại vì nó đúng từ trước khi người chơi chạm vào
   * gì — đếm nó là mở bài ở 1/3 và khoe một tiến độ chưa ai kiếm được.
   */
  const required = goals.filter((objective) => objective.required);
  const doneCount = required.filter((objective) => met.has(objective.id)).length;
  /*
   * Chữ của gợi ý vừa mở: ưu tiên bản xin từ máy chủ, rơi về `hints` cho chế độ
   * `level`.
   *
   * Thứ tự này KHÔNG đảo được. Ở chế độ `problem`, `hints[i]` là chuỗi rỗng chứ
   * không phải `undefined`, nên `hints[i] ?? reveal` sẽ luôn chọn chuỗi rỗng và
   * dựng lại đúng con bọ đang đi sửa — người chơi trả điểm, nhận ô trống.
   */
  const revealedText = hintReveals.get(hintsRevealed - 1);
  const lastHint =
    hintsRevealed > 0
      ? revealedText?.phase === 'ready'
        ? revealedText.text
        : (hints[hintsRevealed - 1] ?? null)
      : null;
  const hasMoreHints = hintsRevealed < hints.length;
  /* Trạng thái của gợi ý ĐANG xin — chỉ số `hintsRevealed`, chưa vào nhật ký. */
  const pendingReveal = hintReveals.get(hintsRevealed);
  const dangXin = pendingReveal?.phase === 'pending';

  return (
    <section
      aria-label="Nhiệm vụ"
      className={cn(
        'arena-mission pointer-events-auto absolute top-3 left-20 z-20 w-90 max-w-[calc(100vw-6rem)] overflow-hidden',
        'rounded-lg border border-border bg-card/90 shadow-elevation-2 backdrop-blur-sm',
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        <Target className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {`Nhiệm vụ ${code.split('-')[1]?.padStart(2, '0') ?? code}`}
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
          <div className="arena-mission-goal text-sm font-medium text-foreground" title={goal}>
            <MarkdownView markdown={goal} resolveAssetUrl={() => null} />
          </div>

          <ul className="flex flex-col gap-1">
            {goals.map((objective) => (
              <ObjectiveRow key={objective.id} objective={objective} done={met.has(objective.id)} />
            ))}
          </ul>

          {guards.length === 0 ? null : (
            <div className="arena-mission-guards">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
                Phải giữ nguyên
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {guards.map((objective) => (
                  <GuardRow key={objective.id} objective={objective} held={met.has(objective.id)} />
                ))}
              </ul>
            </div>
          )}

          {lastHint === null || lastHint === '' ? null : (
            <p className="rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Gợi ý {hintsRevealed}: </span>
              {lastHint}
            </p>
          )}

          {/*
            Xin hỏng thì NÓI RA. Bản trước im lặng, và hệ quả là người chơi bấm
            một nút "trừ điểm" rồi không thấy gì — không phân biệt được "mạng
            hỏng" với "gợi ý này rỗng". `role="alert"` vì nó là phản hồi trực
            tiếp cho cú bấm vừa rồi.
          */}
          {pendingReveal?.phase === 'error' ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              Không mở được gợi ý: {pendingReveal.message}
            </p>
          ) : null}

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
              disabled={!hasMoreHints || dangXin}
              onClick={() => {
                const index = hintsRevealed;
                /*
                 * Chế độ `level`: chữ nằm sẵn trong `LEVELS`, bắn action là xong.
                 */
                if (onRevealHint === null) {
                  dispatch({ gameId: 'k8s', tick: getTick(), kind: 'hint', index });
                  return;
                }
                /*
                 * Chế độ `problem`: XIN TRƯỚC, được chữ mới trừ điểm. Bắn action
                 * trước rồi mới gọi sẽ để lại một lượt trừ điểm mà máy chủ không
                 * ghi nhận khi lời gọi hỏng — xem `use-hint-reveal.ts`.
                 *
                 * `getTick()` gọi SAU khi chữ về: dấu tick phải là lúc hành động
                 * thật sự vào nhật ký, không phải lúc người chơi bấm chuột.
                 */
                void onRevealHint(index).then((text) => {
                  if (text === null) return;
                  dispatch({ gameId: 'k8s', tick: getTick(), kind: 'hint', index });
                });
              }}
            >
              <Lightbulb className="size-3.5" aria-hidden />
              {dangXin
                ? 'Đang mở gợi ý…'
                : hasMoreHints
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
      <span
        className={cn(
          'leading-snug',
          done ? 'text-muted-foreground line-through' : 'text-foreground',
        )}
      >
        {objective.label}
        {objective.required ? null : (
          <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
            thưởng
          </span>
        )}
      </span>
      <span className="sr-only">{done ? 'đã đạt' : 'chưa đạt'}</span>
    </li>
  );
}

/**
 * Một ràng buộc "đừng làm hỏng".
 *
 * Trạng thái BÌNH THƯỜNG của nó là "đang giữ được", nên nó KHÔNG được vẽ như một
 * ô tích xanh — xanh ở đây phải mang nghĩa "bạn vừa làm được một việc". Đang giữ
 * thì im lặng và mờ; VỠ ra thì đỏ, vì đó mới là tin tức.
 */
function GuardRow({
  objective,
  held,
}: {
  readonly objective: Objective;
  readonly held: boolean;
}): ReactElement {
  return (
    <li
      className={cn(
        'flex items-start gap-2 text-xs',
        held ? 'text-muted-foreground' : 'text-destructive',
      )}
    >
      {held ? (
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 opacity-70" />
      ) : (
        <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      )}
      <span className="leading-snug">{objective.label}</span>
      <span className="sr-only">{held ? 'đang giữ được' : 'ĐÃ VỠ'}</span>
    </li>
  );
}
