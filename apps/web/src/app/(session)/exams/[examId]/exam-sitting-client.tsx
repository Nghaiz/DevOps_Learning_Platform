'use client';

import { useCallback, useState, type ReactElement } from 'react';
import { Flag, Play } from 'lucide-react';
import { renderCopy, t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  Skeleton,
  useToast,
} from '@devops-platform/ui';

import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import { formatMoment } from '../../../../lib/format-moment';
import { problemPreviewHref } from '../../../../lib/problem-preview-href';
import { Board, BoardRow, PageContainer, ToolHeader, lineForTopic } from '../../../../components/kit';
import { formatCountdown } from '../countdown';
import { useCountdown } from '../use-countdown';
import { ATTEMPT_PHASE_KEYS, attemptPhase, examWhen } from '../exam-status';
import { CountdownBoard } from './countdown-board';

/**
 * `/exams/:examId` (§18.G.4, §18.G.5): màn làm bài.
 *
 * ## ⛔ Đồng hồ: máy chủ cấp một KHOẢNG, client đếm bằng `performance.now()`
 *
 * Đây là toàn bộ AC-7. Máy chủ trả `remainingMs`; client ghi lại nó cùng một lần
 * đọc `performance.now()` rồi trừ dần. Giờ hệ thống KHÔNG tham gia vào phép tính
 * nào. Lý do đầy đủ ở `../countdown.ts`.
 *
 * ## Vì sao vẫn phải hỏi lại máy chủ định kỳ
 *
 * `performance.now()` có thể DỪNG khi tab bị treo hoặc máy ngủ. Một lượt
 * `refetch` mỗi 30 giây kéo nó về đúng sự thật của máy chủ; nó là lượt hiệu
 * chỉnh, không phải nguồn của đồng hồ.
 *
 * ## Hết giờ thì màn hình tự khoá, không đợi ai bấm gì
 *
 * Chạm 0 thì client hỏi lại máy chủ một lượt. Máy chủ là nơi duy nhất quyết định
 * lượt đã khoá hay chưa, nên client không tự tuyên bố, nó chỉ hỏi sớm hơn.
 *
 * ## Tên bài và đường vào game
 *
 * `examSitting.get` chỉ trả MÃ bài. Tên và `gameId` (để mở thẳng vào game bằng
 * `?problem=`) đọc từ `problems.byCode`, thủ tục mà trang đề của chính bài đó
 * vẫn gọi, nên không mở thêm quyền đọc nào. Khi một lượt tra chưa về hoặc hỏng,
 * dòng hiện mã bài và dẫn sang trang đề như trước. Đã xin máy chủ trả sẵn
 * `{ code, title, gameId }` trong `examSitting.get` để bỏ N lượt tra này.
 */
export function ExamSittingClient({ examId }: { readonly examId: string }): ReactElement {
  const query = api.examSitting.get.useQuery({ examId });
  const utils = api.useUtils();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const start = api.examSitting.start.useMutation({
    onSuccess: () => void utils.examSitting.get.invalidate({ examId }),
  });
  const submit = api.examSitting.submit.useMutation({
    onSuccess: () => {
      setConfirmOpen(false);
      toast({ title: t('exam.submitted-toast') });
      void utils.examSitting.get.invalidate({ examId });
      void utils.examSitting.list.invalidate();
    },
  });

  const attempt = query.data?.attempt ?? null;
  const codes = query.data?.exam.problemCodes ?? [];
  const lookups = api.useQueries((q) =>
    codes.map((code) => q.problems.byCode({ code }, { enabled: attempt !== null })),
  );
  // Phụ thuộc `query.refetch` (ổn định suốt vòng đời observer), KHÔNG phụ thuộc
  // `query`: đối tượng kết quả là bản mới ở mỗi lượt render.
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(() => void refetchQuery(), [refetchQuery]);
  const remaining = useCountdown(attempt?.remainingMs ?? null, attempt?.closed ?? true, refetch);

  const crumbs = [{ href: '/exams', label: t('exam.title') }];

  if (query.isPending || query.data === undefined) {
    /*
     * `query.data === undefined` ngoài `isPending` chỉ để thu hẹp kiểu; nó vẽ
     * đúng trạng thái "chưa có dữ liệu". KHÔNG vẽ một câu nói "kỳ thi chưa mở":
     * đó là một chẩn đoán chỗ này không có căn cứ nào để đưa ra.
     */
    if (query.isError) {
      return (
        <>
          <ToolHeader crumbs={crumbs} title={t('exam.title')} />
          <PageContainer className="py-10">
            <ErrorState
              title={t('exam.error-title')}
              message={describeTrpcError(query.error)}
              retrying={query.isFetching}
              onRetry={refetch}
            />
          </PageContainer>
        </>
      );
    }
    return (
      <>
        <ToolHeader crumbs={crumbs} title={t('exam.title')} />
        <PageContainer className="py-10">
          <div role="status" aria-label={t('exam.loading')} className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </PageContainer>
      </>
    );
  }

  const { exam } = query.data;
  const phase = attempt === null ? 'not-started' : attemptPhase(attempt);

  return (
    <>
      <ToolHeader
        crumbs={crumbs}
        kicker={t('exam.summary', {
          name: exam.className,
          count: exam.problemCodes.length,
          minutes: exam.durationMinutes,
        })}
        title={exam.title}
        status={
          <span className="inline-flex h-6 items-center bg-muted px-2 font-mono text-xs font-semibold">
            {t(ATTEMPT_PHASE_KEYS[phase])}
          </span>
        }
        actions={
          attempt !== null && !attempt.closed ? (
            <Button
              variant="primary"
              size="lg"
              iconLeft={<Flag aria-hidden className="size-4" />}
              onClick={() => {
                setConfirmOpen(true);
              }}
            >
              {t('exam.submit')}
            </Button>
          ) : undefined
        }
      />

      <PageContainer className="flex flex-col gap-10 py-10 md:py-12">
        {attempt === null ? (
          <section
            aria-labelledby="exam-start"
            className="grid gap-6 border-2 border-ink bg-card p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-8"
          >
            <div className="flex flex-col gap-3">
              <h2 id="exam-start" className="type-headline">
                {t('exam.start-title')}
              </h2>
              <p className="type-lead">
                {t('exam.start-facts', { count: exam.problemCodes.length, minutes: exam.durationMinutes })}
              </p>
              <p className="text-sm text-muted-foreground">{t('exam.start-body')}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {renderCopy(examWhen(exam, formatMoment))}
              </p>
            </div>
            <Button
              size="lg"
              variant="primary"
              iconLeft={<Play aria-hidden className="size-4" />}
              onClick={() => start.mutate({ examId })}
              loading={start.isPending}
              disabled={start.isPending}
            >
              {t('exam.start')}
            </Button>
            {start.isError &&
              (trpcErrorCode(start.error) === 'FORBIDDEN' ? (
                /*
                 * `startAttempt` chỉ ném FORBIDDEN cho đúng một lý do: kỳ thi
                 * ngoài cửa sổ thời gian. Nên tiêu đề nói đúng tên vấn đề.
                 */
                <Alert variant="warning" role="alert" className="md:col-span-2">
                  <AlertTitle>{t('exam.not-open-title')}</AlertTitle>
                  <AlertDescription>{t('exam.not-open-body')}</AlertDescription>
                </Alert>
              ) : (
                /*
                 * Mọi mã khác (mạng chập, máy chủ lỗi, NOT_FOUND khi kỳ thi vừa
                 * bị xoá) KHÔNG được đọc ra "chưa mở hoặc đã đóng": đó là một
                 * chẩn đoán sai, và người học sẽ ngồi chờ một kỳ thi đang mở.
                 */
                <Alert variant="destructive" role="alert" className="md:col-span-2">
                  <AlertTitle>{t('exam.start-error-title')}</AlertTitle>
                  <AlertDescription>{describeTrpcError(start.error)}</AlertDescription>
                </Alert>
              ))}
          </section>
        ) : (
          <>
            <CountdownBoard
              remainingMs={remaining}
              closed={attempt.closed}
              submitted={attempt.submittedAt !== null}
              deadline={attempt.deadline}
            />

            {attempt.closed && (
              <Alert variant="warning">
                <AlertTitle>{t('exam.closed-title')}</AlertTitle>
                <AlertDescription>
                  {attempt.submittedAt === null ? t('exam.closed-expired') : t('exam.closed-submitted')}
                </AlertDescription>
              </Alert>
            )}

            <section aria-labelledby="exam-problems" className="flex flex-col gap-4">
              <h2 id="exam-problems" className="type-headline">
                {t('exam.problems-heading')}
              </h2>
              <Board label={t('exam.problems-heading')}>
                {exam.problemCodes.map((code, index) => {
                  const found = lookups[index]?.data?.problem ?? null;
                  const playHref = found === null ? null : problemPreviewHref(found.gameId, code);
                  return (
                    <BoardRow
                      key={code}
                      index={index + 1}
                      order={index}
                      href={playHref ?? `/problems/${code}`}
                      disabled={attempt.closed}
                      line={found === null ? 'ink' : lineForTopic({ gameId: found.gameId })}
                      title={found?.title ?? code}
                      sub={<span className="font-mono">{code}</span>}
                      state={
                        <span className="font-mono text-xs font-semibold">
                          {attempt.closed ? t('exam.problem-closed') : t('exam.problem-play')}
                        </span>
                      }
                    />
                  );
                })}
              </Board>
            </section>
          </>
        )}
      </PageContainer>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('exam.confirm-title')}</DialogTitle>
            <DialogDescription>
              {t('exam.confirm-body', { left: formatCountdown(remaining) })}
            </DialogDescription>
          </DialogHeader>
          {submit.isError && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {t('exam.submit-error')} {describeTrpcError(submit.error)}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('exam.confirm-cancel')}</Button>
            </DialogClose>
            <Button
              variant="primary"
              onClick={() => submit.mutate({ examId })}
              loading={submit.isPending}
              disabled={submit.isPending}
            >
              {submit.isPending ? t('exam.submit-busy') : t('exam.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
