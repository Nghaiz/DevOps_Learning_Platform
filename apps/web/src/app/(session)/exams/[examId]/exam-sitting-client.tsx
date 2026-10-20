'use client';

import { useCallback, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { renderCopy, t } from '@devops-platform/copy';
import {
  BackLink,
  Button,
  ConfirmDialog,
  ErrorBlock,
  Icon,
  Notice,
  Page,
  PageHeader,
  Pill,
  Row,
  RowList,
  Skeleton,
  cn,
  toast,
} from '@devops-platform/ds';

import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import { formatMoment } from '../../../../lib/format-moment';
import { problemPreviewHref } from '../../../../lib/problem-preview-href';
import { topicLook } from '../../../../lib/topic-look';
import { gameName } from '../../problems/problem-game';
import { formatCountdown } from '../countdown';
import { useCountdown } from '../use-countdown';
import { attemptPhase, examWhen } from '../exam-status';
import { PhasePill } from '../exams-client';
import { CountdownBoard } from './countdown-board';

const MS_PER_MINUTE = 60_000;

/**
 * `/exams/:examId`: màn làm bài.
 *
 * ## ⛔ Đồng hồ: máy chủ cấp một KHOẢNG, client đếm bằng `performance.now()`
 *
 * Máy chủ trả `remainingMs`; client ghi lại nó cùng một lần đọc `performance.now()`
 * rồi trừ dần. Giờ hệ thống KHÔNG tham gia vào phép tính nào. Lý do đầy đủ ở
 * `../countdown.ts`.
 *
 * ## Vì sao vẫn phải hỏi lại máy chủ định kỳ
 *
 * `performance.now()` có thể DỪNG khi tab bị treo hoặc máy ngủ. Một lượt `refetch`
 * mỗi 30 giây kéo nó về đúng sự thật của máy chủ; nó là lượt hiệu chỉnh, không phải
 * nguồn của đồng hồ.
 *
 * ## Hết giờ thì màn hình tự khoá, không đợi ai bấm gì
 *
 * Chạm 0 thì client hỏi lại máy chủ một lượt. Máy chủ là nơi duy nhất quyết định
 * lượt đã khoá hay chưa, nên client không tự tuyên bố, nó chỉ hỏi sớm hơn.
 *
 * ## Tên bài, đường vào game và dấu "đã giải"
 *
 * `examSitting.get` trả sẵn `problems: { code, title, gameId, solved }[]`, nên trang
 * không tra từng bài. `solved` tính ở máy chủ trong cửa sổ chấm của lượt này, cùng
 * định nghĩa với bảng điểm của giảng viên. Một mã còn trong đề nhưng không còn bài
 * nào khớp thì vắng khỏi `problems`: dòng đó hiện mã bài và dẫn sang trang đề.
 */
export function ExamSittingClient({ examId }: { readonly examId: string }): ReactElement {
  const query = api.examSitting.get.useQuery({ examId });
  const utils = api.useUtils();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const start = api.examSitting.start.useMutation({
    onSuccess: () => void utils.examSitting.get.invalidate({ examId }),
  });
  const submit = api.examSitting.submit.useMutation({
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success(t('exam.submitted-toast'));
      void utils.examSitting.get.invalidate({ examId });
      void utils.examSitting.list.invalidate();
    },
  });

  const attempt = query.data?.attempt ?? null;
  // Phụ thuộc `query.refetch` (ổn định suốt vòng đời observer), KHÔNG phụ thuộc
  // `query`: đối tượng kết quả là bản mới ở mỗi lượt render.
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(() => void refetchQuery(), [refetchQuery]);
  const remaining = useCountdown(attempt?.remainingMs ?? null, attempt?.closed ?? true, refetch);

  const back = (
    <BackLink asChild>
      <Link href="/exams">{t('exam.title')}</Link>
    </BackLink>
  );

  if (query.isPending || query.data === undefined) {
    /*
     * `query.data === undefined` ngoài `isPending` chỉ để thu hẹp kiểu; nó vẽ đúng
     * trạng thái "chưa có dữ liệu". KHÔNG vẽ một câu nói "kỳ thi chưa mở": đó là một
     * chẩn đoán chỗ này không có căn cứ nào để đưa ra.
     */
    return (
      <Page className="pb-16">
        <PageHeader back={back} title={t('exam.title')} />
        {query.isError ? (
          <ErrorBlock
            title={t('exam.error-title')}
            retryLabel={t('common.action.retry')}
            retrying={query.isFetching}
            onRetry={refetch}
          >
            {describeTrpcError(query.error)}
          </ErrorBlock>
        ) : (
          <div role="status" aria-label={t('exam.loading')} className="flex flex-col gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
      </Page>
    );
  }

  const { exam, problems } = query.data;
  const phase = attempt === null ? 'not-started' : attemptPhase(attempt);
  const solved = problems.filter((problem) => problem.solved).length;

  return (
    <Page className="pb-16">
      <PageHeader
        back={back}
        title={exam.title}
        lead={t('exam.summary', { name: exam.className, count: exam.problemCodes.length, minutes: exam.durationMinutes })}
        actions={
          attempt !== null && !attempt.closed ? (
            <Button
              variant="primary"
              size="lg"
              icon="flag"
              onClick={() => {
                setConfirmOpen(true);
              }}
            >
              {t('exam.submit')}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <PhasePill phase={phase} />
          <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-ink-2">
            <Icon name="calendar" size={16} className="text-ink-3" />
            {renderCopy(examWhen(exam, formatMoment))}
          </span>
        </div>
      </PageHeader>

      {attempt === null ? (
        <section
          aria-labelledby="exam-start"
          className="grid gap-6 border-y border-rule py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
        >
          <div className="flex flex-col gap-2">
            <h2 id="exam-start" className="font-display text-xl font-semibold text-ink">
              {t('exam.start-title')}
            </h2>
            <p className="text-md text-ink">
              {t('exam.start-facts', { count: exam.problemCodes.length, minutes: exam.durationMinutes })}
            </p>
            <p className="flex items-start gap-2 text-sm text-ink-2">
              <Icon name="timer" size={16} className="mt-0.5 shrink-0 text-acc-ink" />
              {t('exam.start-body')}
            </p>
          </div>
          <Button
            size="lg"
            variant="primary"
            icon="play"
            onClick={() => start.mutate({ examId })}
            loading={start.isPending}
            disabled={start.isPending}
          >
            {t('exam.start')}
          </Button>
          {start.isError ? (
            trpcErrorCode(start.error) === 'FORBIDDEN' ? (
              /*
               * `startAttempt` chỉ ném FORBIDDEN cho đúng một lý do: kỳ thi ngoài cửa
               * sổ thời gian. Nên tiêu đề nói đúng tên vấn đề.
               */
              <Notice tone="warn" role="alert" title={t('exam.not-open-title')} className="md:col-span-2">
                {t('exam.not-open-body')}
              </Notice>
            ) : (
              /*
               * Mọi mã khác (mạng chập, máy chủ lỗi, NOT_FOUND khi kỳ thi vừa bị xoá)
               * KHÔNG được đọc ra "chưa mở hoặc đã đóng": đó là một chẩn đoán sai, và
               * người học sẽ ngồi chờ một kỳ thi đang mở.
               */
              <Notice tone="bad" role="alert" title={t('exam.start-error-title')} className="md:col-span-2">
                {describeTrpcError(start.error)}
              </Notice>
            )
          ) : null}
        </section>
      ) : (
        <div className="flex flex-col gap-10">
          <CountdownBoard
            remainingMs={remaining}
            totalMs={exam.durationMinutes * MS_PER_MINUTE}
            closed={attempt.closed}
            submitted={attempt.submittedAt !== null}
            deadline={attempt.deadline}
          />

          {attempt.closed ? (
            <Notice tone="warn" title={t('exam.closed-title')}>
              {attempt.submittedAt === null ? t('exam.closed-expired') : t('exam.closed-submitted')}
            </Notice>
          ) : null}

          <section aria-labelledby="exam-problems" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="exam-problems" className="font-display text-xl font-semibold text-ink">
                {t('exam.problems-heading')}
              </h2>
              <p className="text-sm tabular-nums text-ink-2">
                {t('exam.solved-count', { solved, total: exam.problemCodes.length })}
              </p>
            </div>
            <RowList label={t('exam.problems-heading')} className="border-t border-rule">
              {exam.problemCodes.map((code, index) => {
                const found = problems.find((problem) => problem.code === code) ?? null;
                const playHref = found === null ? null : problemPreviewHref(found.gameId, code);
                const look = found === null ? null : topicLook({ gameId: found.gameId });
                const isSolved = found?.solved === true;
                const title = found?.title ?? code;
                return (
                  <Row
                    key={code}
                    {...(look === null ? {} : { topic: look.topic })}
                    leading={<ProblemNumber index={index + 1} solved={isSolved} />}
                    title={title}
                    {...(attempt.closed ? {} : { link: <Link href={playHref ?? `/problems/${code}`}>{title}</Link> })}
                    description={
                      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-xs text-ink-3">{code}</span>
                        {found === null || look === null ? null : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
                            <Icon name={look.icon} size={14} tint="topic" className="text-tp-ink" />
                            {gameName(found.gameId)}
                          </span>
                        )}
                      </span>
                    }
                    trailing={
                      <span className="flex items-center gap-3">
                        {isSolved ? (
                          <Pill tone="ok" icon="success">
                            {t('exam.problem-solved')}
                          </Pill>
                        ) : attempt.closed ? (
                          <Pill icon="lock">{t('exam.problem-closed')}</Pill>
                        ) : (
                          <span className="hidden text-sm font-medium text-acc-ink sm:inline">{t('exam.problem-play')}</span>
                        )}
                        <Button asChild variant="ghost" size="sm" icon="file-text">
                          <Link href={`/problems/${code}`}>{t('exam.problem-statement')}</Link>
                        </Button>
                      </span>
                    }
                  />
                );
              })}
            </RowList>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="primary"
        title={t('exam.confirm-title')}
        body={t('exam.confirm-body', { left: formatCountdown(remaining) })}
        {...(submit.isError ? { error: `${t('exam.submit-error')} ${describeTrpcError(submit.error)}` } : {})}
        confirmLabel={submit.isPending ? t('exam.submit-busy') : t('exam.submit')}
        cancelLabel={t('exam.confirm-cancel')}
        confirming={submit.isPending}
        onConfirm={() => submit.mutate({ examId })}
      />
    </Page>
  );
}

/** Số thứ tự của bài trong đề; bài đã giải thay số bằng dấu tích trên nền xanh. */
function ProblemNumber({ index, solved }: { readonly index: number; readonly solved: boolean }): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 place-items-center rounded-full text-sm font-semibold tabular-nums',
        solved ? 'bg-ok-solid text-on-solid' : 'bg-tp-tint text-tp-ink',
      )}
    >
      {solved ? <Icon name="check" size={16} strokeWidth={3} /> : index}
    </span>
  );
}
