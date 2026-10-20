'use client';

import { useState, type ReactElement } from 'react';
import Link from 'next/link';
import { renderCopy, t } from '@devops-platform/copy';
import {
  Button,
  Empty,
  EmptyArt,
  ErrorBlock,
  Icon,
  Pill,
  Row,
  RowList,
  RowsSkeleton,
  Segmented,
  cn,
  type IconName,
  type Tone,
} from '@devops-platform/ds';

import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { formatMoment } from '../../../lib/format-moment';
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
 * `/exams`: kỳ thi của người học, một dòng một kỳ thi.
 *
 * ## Không phân trang, và đó là một giả định phải nói ra
 *
 * `examSitting.list` trả hết một lượt: một sinh viên ở vài lớp có vài kỳ thi. Nếu
 * một ngày một tài khoản có hàng trăm kỳ thi thì ĐÂY là chỗ thêm keyset, và khoá
 * sắp hiện tại (`created_at`) không duy nhất nên sẽ phải kèm `id` phá hoà.
 *
 * ## Hai trục trạng thái trên mỗi dòng
 *
 * Cửa sổ của kỳ thi (chưa mở / đang mở / đã đóng, so với `serverNow` của máy chủ)
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
    <div className="flex flex-col gap-6 pb-16">
      <Segmented
        label={t('exam.filter-label')}
        value={filter}
        onValueChange={setFilter}
        className="self-start"
        options={EXAM_FILTERS.map((value) => ({
          value,
          label: t(EXAM_FILTER_KEYS[value]),
          ...(query.isSuccess ? { count: rows.filter((row) => matchesExamFilter(value, row.finished)).length } : {}),
        }))}
      />

      {query.isPending ? <RowsSkeleton rows={3} label={t('exam.loading')} /> : null}

      {query.isError ? (
        <ErrorBlock
          title={t('exam.error-title')}
          retryLabel={t('common.action.retry')}
          retrying={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          {describeTrpcError(query.error)}
        </ErrorBlock>
      ) : null}

      {query.isSuccess && rows.length === 0 ? (
        <Empty title={t('exam.empty-title')} art={<EmptyArt kind="waiting" />}>
          {t('exam.empty-body')}
        </Empty>
      ) : null}

      {query.isSuccess && rows.length > 0 && shown.length === 0 ? (
        <Empty
          size="sm"
          title={t('exam.filter-empty-title')}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFilter('all');
              }}
            >
              {t('exam.filter-all')}
            </Button>
          }
        >
          {t('exam.filter-empty-body')}
        </Empty>
      ) : null}

      {shown.length > 0 ? (
        <RowList label={t('exam.board-label')} className="border-t border-rule">
          {shown.map(({ item, slot, phase }) => (
            <Row
              key={item.id}
              current={phase === 'in-progress'}
              leading={<WindowGlyph slot={slot} />}
              title={item.title}
              link={<Link href={`/exams/${item.id}`}>{item.title}</Link>}
              description={t('exam.summary', {
                name: item.className,
                count: item.problemCodes.length,
                minutes: item.durationMinutes,
              })}
              below={
                <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <WindowPill slot={slot} />
                  <PhasePill phase={phase} />
                  <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-ink-3">
                    <Icon name="calendar" size={14} />
                    {renderCopy(examWhen(item, formatMoment))}
                  </span>
                </span>
              }
            />
          ))}
        </RowList>
      ) : null}
    </div>
  );
}

const WINDOW_GLYPH: Readonly<Record<ExamWindow, { readonly icon: IconName; readonly tone: string }>> = {
  upcoming: { icon: 'hourglass', tone: 'bg-warn-tint text-warn-ink' },
  open: { icon: 'exam', tone: 'bg-ok-tint text-ok-ink' },
  closed: { icon: 'lock', tone: 'bg-well-2 text-ink-3' },
};

/** Hình đầu dòng theo cửa sổ của kỳ thi. Chữ đi kèm ở `WindowPill`, hình chỉ để quét mắt. */
function WindowGlyph({ slot }: { readonly slot: ExamWindow }): ReactElement {
  const spec = WINDOW_GLYPH[slot];
  return (
    <span aria-hidden="true" className={cn('grid size-10 place-items-center rounded-full', spec.tone)}>
      <Icon name={spec.icon} size={20} />
    </span>
  );
}

const WINDOW_TONE: Readonly<Record<ExamWindow, Tone>> = {
  upcoming: 'warn',
  open: 'ok',
  closed: 'neutral',
};

/** Cửa sổ của kỳ thi. "Đang mở" là chấm sống duy nhất trên trang. */
function WindowPill({ slot }: { readonly slot: ExamWindow }): ReactElement {
  return (
    <Pill tone={WINDOW_TONE[slot]} dot live={slot === 'open'}>
      {t(EXAM_WINDOW_KEYS[slot])}
    </Pill>
  );
}

const PHASE_TONE: Readonly<Record<AttemptPhase, Tone>> = {
  'not-started': 'neutral',
  'in-progress': 'acc',
  submitted: 'ok',
  expired: 'warn',
};

const PHASE_ICON: Readonly<Record<AttemptPhase, IconName>> = {
  'not-started': 'circle',
  'in-progress': 'play',
  submitted: 'success',
  expired: 'timer',
};

/** Lượt làm của bạn, tách khỏi cửa sổ: kỳ thi đang mở vẫn có thể chứa một lượt đã hết giờ. */
export function PhasePill({ phase }: { readonly phase: AttemptPhase }): ReactElement {
  return (
    <Pill tone={PHASE_TONE[phase]} icon={PHASE_ICON[phase]}>
      {t(ATTEMPT_PHASE_KEYS[phase])}
    </Pill>
  );
}
