'use client';

import { useState, type ReactElement } from 'react';
import { CalendarClock } from 'lucide-react';
import { renderCopy, t } from '@devops-platform/copy';
import { Chip, EmptyState, ErrorState, StatusDot, cn } from '@devops-platform/ui';

import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { formatMoment } from '../../../lib/format-moment';
import { Board, BoardRow, BoardSkeleton, PageContainer } from '../../../components/kit';
import {
  ATTEMPT_PHASE_KEYS,
  EXAM_FILTERS,
  EXAM_FILTER_KEYS,
  EXAM_WINDOW_KEYS,
  attemptPhase,
  examWhen,
  examWindow,
  isExamFinished,
  matchesExamFilter,
  type AttemptPhase,
  type ExamFilter,
  type ExamWindow,
} from './exam-status';

/**
 * `/exams` (§18.G.4): kỳ thi của người học, dạng bảng giờ tàu.
 *
 * ## Không phân trang, và đó là một giả định phải nói ra
 *
 * `examSitting.list` trả hết một lượt: một sinh viên ở vài lớp có vài kỳ thi.
 * Nếu một ngày một tài khoản có hàng trăm kỳ thi thì ĐÂY là chỗ thêm keyset, và
 * khoá sắp hiện tại (`created_at`) không duy nhất nên sẽ phải kèm `id` phá hoà.
 *
 * ## Hai trục trạng thái trên mỗi dòng
 *
 * Cửa sổ của kỳ thi (sắp mở / đang mở / đã đóng, so với `serverNow` của máy chủ)
 * và lượt làm của bạn (`closed` của máy chủ). Lý do không suy ở client nằm ở
 * `exam-status.ts`.
 */
export function ExamsClient(): ReactElement {
  const query = api.examSitting.list.useQuery();
  const [filter, setFilter] = useState<ExamFilter>('all');

  const rows = (query.data?.items ?? []).map((item) => {
    const slot = examWindow(item, query.data?.serverNow ?? '');
    return { item, slot, phase: attemptPhase(item), finished: isExamFinished(item, slot) };
  });
  const shown = rows.filter((row) => matchesExamFilter(filter, row.finished));

  return (
    <PageContainer className="py-10 md:py-14">
      <div
        role="group"
        aria-label={t('exam.filter-label')}
        className="mb-6 flex flex-wrap items-center gap-2 border-t-2 border-ink pt-5"
      >
        {EXAM_FILTERS.map((value) => (
          <Chip
            key={value}
            selected={filter === value}
            onClick={() => {
              setFilter(value);
            }}
            {...(query.isSuccess
              ? { count: rows.filter((row) => matchesExamFilter(value, row.finished)).length }
              : {})}
          >
            {t(EXAM_FILTER_KEYS[value])}
          </Chip>
        ))}
      </div>

      {query.isPending && <BoardSkeleton rows={3} label={t('exam.loading')} />}

      {query.isError && (
        <ErrorState
          title={t('exam.error-title')}
          message={describeTrpcError(query.error)}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.isSuccess && rows.length === 0 && (
        <EmptyState title={t('exam.empty-title')} description={t('exam.empty-body')} />
      )}

      {query.isSuccess && rows.length > 0 && shown.length === 0 && (
        <EmptyState
          title={t('exam.filter-empty-title')}
          description={t('exam.filter-empty-body')}
          action={
            <Chip
              selected={false}
              onClick={() => {
                setFilter('all');
              }}
            >
              {t('exam.filter-all')}
            </Chip>
          }
        />
      )}

      {shown.length > 0 && (
        <Board label={t('exam.board-label')}>
          {shown.map(({ item, slot, phase }, order) => (
            <BoardRow
              key={item.id}
              href={`/exams/${item.id}`}
              index={order + 1}
              order={order}
              lineState={phase === 'submitted' ? 'done' : phase === 'in-progress' ? 'current' : 'todo'}
              title={item.title}
              sub={t('exam.summary', {
                name: item.className,
                count: item.problemCodes.length,
                minutes: item.durationMinutes,
              })}
              meta={
                <>
                  <WindowMark slot={slot} />
                  <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums">
                    <CalendarClock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                    {renderCopy(examWhen(item, formatMoment))}
                  </span>
                </>
              }
              state={<PhaseMark phase={phase} />}
            />
          ))}
        </Board>
      )}
    </PageContainer>
  );
}

const WINDOW_DOT = {
  upcoming: 'warn',
  open: 'live',
  closed: 'idle',
} as const satisfies Record<ExamWindow, 'warn' | 'live' | 'idle'>;

/** Cửa sổ của kỳ thi: chấm trạng thái + chữ. "Đang mở" là chấm sống duy nhất. */
function WindowMark({ slot }: { readonly slot: ExamWindow }): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-24 items-center gap-2 px-2 font-mono text-xs font-medium',
        slot === 'open' && 'bg-success/10 text-success',
        slot === 'upcoming' && 'bg-signal text-signal-foreground',
        slot === 'closed' && 'bg-muted text-muted-foreground',
      )}
    >
      <StatusDot tone={WINDOW_DOT[slot]} />
      {t(EXAM_WINDOW_KEYS[slot])}
    </span>
  );
}

const PHASE_TONE: Readonly<Record<AttemptPhase, string>> = {
  'not-started': 'text-muted-foreground',
  'in-progress': 'bg-primary text-primary-foreground',
  submitted: 'text-success',
  expired: 'text-warning',
};

/** Lượt làm của bạn. "Đang làm" là khối đỏ PTIT: đó là chỗ bạn đang đứng. */
function PhaseMark({ phase }: { readonly phase: AttemptPhase }): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-6 w-28 items-center justify-center px-2 font-mono text-xs font-semibold',
        PHASE_TONE[phase],
      )}
    >
      {t(ATTEMPT_PHASE_KEYS[phase])}
    </span>
  );
}
