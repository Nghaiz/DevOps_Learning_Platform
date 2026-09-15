'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ErrorState,
  Skeleton,
  useToast,
} from '@devops-platform/ui';

import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import { formatMoment } from '../../../../lib/format-moment';
import {
  COUNTDOWN_RESYNC_MS,
  COUNTDOWN_TICK_MS,
  formatCountdown,
  remainingFrom,
  type CountdownAnchor,
} from '../countdown';

/**
 * `/exams/:examId` (§18.G.4, §18.G.5) , màn làm bài.
 *
 * ## ⛔ Đồng hồ: máy chủ cấp một KHOẢNG, client đếm bằng `performance.now()`
 *
 * Đây là toàn bộ AC-7. Máy chủ trả `remainingMs`; client ghi lại nó cùng một
 * lần đọc `performance.now()` rồi trừ dần. Giờ hệ thống KHÔNG tham gia vào phép
 * tính nào, nên chỉnh đồng hồ máy, đổi múi giờ, hay NTP đồng bộ giữa chừng đều
 * không đổi một giây nào. Lý do đầy đủ ở `../countdown.ts`.
 *
 * ## Vì sao vẫn phải hỏi lại máy chủ định kỳ
 *
 * `performance.now()` có thể DỪNG khi tab bị treo hoặc máy ngủ, và lúc tỉnh
 * dậy nó đi tiếp từ chỗ dừng , tức đếm ngược thừa ra đúng khoảng máy ngủ. Một
 * lượt `refetch` mỗi 30 giây kéo nó về đúng sự thật của máy chủ. Nó KHÔNG phải
 * nguồn của đồng hồ, chỉ là lượt hiệu chỉnh.
 *
 * ## Hết giờ thì màn hình tự khoá, không đợi ai bấm gì
 *
 * Khi đếm ngược chạm 0, client hỏi lại máy chủ một lượt. Máy chủ là nơi duy
 * nhất quyết định lượt đã khoá hay chưa (`isAttemptClosed` suy ra lúc đọc), nên
 * client không tự tuyên bố , nó chỉ hỏi sớm hơn.
 */
export function ExamSittingClient({ examId }: { readonly examId: string }): ReactElement {
  const query = api.examSitting.get.useQuery({ examId });
  const utils = api.useUtils();
  const { toast } = useToast();

  const start = api.examSitting.start.useMutation({
    onSuccess: () => void utils.examSitting.get.invalidate({ examId }),
  });
  const submit = api.examSitting.submit.useMutation({
    onSuccess: () => {
      toast({ title: t('exam.submitted-toast') });
      void utils.examSitting.get.invalidate({ examId });
      void utils.examSitting.list.invalidate();
    },
  });

  const attempt = query.data?.attempt ?? null;
  const refetch = useCallback(() => void query.refetch(), [query]);
  const remaining = useCountdown(attempt?.remainingMs ?? null, attempt?.closed ?? true, refetch);

  if (query.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (query.isError) {
    return <ErrorState message={describeTrpcError(query.error)} onRetry={refetch} />;
  }
  const data = query.data;
  if (data === undefined) {
    /*
     * Nhánh này không tới được: `isPending` và `isError` đã phủ hết. Nó tồn tại
     * để thu hẹp kiểu, và nó vẽ đúng trạng thái "chưa có dữ liệu". KHÔNG vẽ
     * một câu nói "kỳ thi chưa mở": đó là một chẩn đoán mà chỗ này không có
     * căn cứ nào để đưa ra.
     */
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/exams"
          className="w-fit rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('exam.back')}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{data.exam.title}</h1>
        <p className="text-sm text-muted-foreground">
          {t('exam.card-class', { name: data.exam.className })}
          {' · '}
          {t('exam.card-duration', { minutes: data.exam.durationMinutes })}
        </p>
      </div>

      {attempt === null ? (
        <Alert>
          <AlertTitle>{t('exam.start-title')}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{t('exam.start-body')}</span>
            <Button
              onClick={() => start.mutate({ examId })}
              loading={start.isPending}
              disabled={start.isPending}
            >
              {t('exam.start')}
            </Button>
            {start.isError && (
              /*
               * `startAttempt` chỉ ném FORBIDDEN cho đúng một lý do , kỳ thi
               * ngoài cửa sổ thời gian. Người ngoài lớp nhận NOT_FOUND và
               * không bao giờ thấy được nút này. Nên tiêu đề ở đây nói đúng
               * tên vấn đề thay vì để một câu lỗi trần đứng một mình.
               */
              <Alert variant="warning" role="alert">
                <AlertTitle>{t('exam.not-open-title')}</AlertTitle>
                <AlertDescription>{t('exam.not-open-body')}</AlertDescription>
              </Alert>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {attempt.closed ? (
            <Alert variant="warning">
              <AlertTitle>{t('exam.closed-title')}</AlertTitle>
              <AlertDescription>
                {attempt.submittedAt === null ? t('exam.auto-closed-body') : t('exam.closed-body')}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-border px-5 py-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">{t('exam.countdown-label')}</span>
                {/*
                  `tabular-nums` để đồng hồ không đổi bề rộng giữa hai lần vẽ:
                  chữ số tỉ lệ làm cả khối nhảy ngang bốn lần mỗi giây, và trên
                  một màn hình người ta liếc liên tục thì chuyển động đó là thứ
                  duy nhất mắt bắt được.

                  `aria-live="off"`: đọc lại đồng hồ bốn lần mỗi giây sẽ làm
                  trình đọc màn hình không nói được gì khác. Người dùng đọc nó
                  khi họ chủ động tìm tới.
                */}
                <output
                  aria-live="off"
                  className="font-mono text-3xl font-semibold tabular-nums text-foreground"
                >
                  {formatCountdown(remaining)}
                </output>
                <span className="text-xs text-muted-foreground">
                  {t('exam.deadline-note', { at: formatMoment(attempt.deadline) })}
                </span>
              </div>
              <Button
                variant="destructive"
                onClick={() => submit.mutate({ examId })}
                loading={submit.isPending}
                disabled={submit.isPending}
              >
                {submit.isPending ? t('exam.submit-busy') : t('exam.submit')}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
              {t('exam.problems-heading')}
            </h2>
            <ol className="flex flex-col gap-2">
              {data.exam.problemCodes.map((code, index) => (
                <li
                  key={code}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3"
                >
                  <span className="text-sm text-foreground">
                    <span className="text-muted-foreground">
                      {t('exam.problem-order', { index: index + 1 })}
                    </span>
                    {' · '}
                    <span className="font-mono">{code}</span>
                  </span>
                  <Button asChild variant="outline" disabled={attempt.closed}>
                    <Link href={`/problems/${code}`}>{t('exam.problem-open')}</Link>
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Đếm ngược tại chỗ, neo vào một lần đọc đồng hồ ĐƠN ĐIỆU.
 *
 * Tách thành hook để `ExamSittingClient` không phải mang ba `useRef` và hai
 * `useEffect` chỉ để vẽ một con số , và để mọi phép toán nằm ở
 * `../countdown.ts`, nơi test chạm tới được mà không cần dựng DOM.
 */
function useCountdown(
  remainingMsFromServer: number | null,
  closed: boolean,
  onExpire: () => void,
): number {
  const anchor = useRef<CountdownAnchor | null>(null);
  const [display, setDisplay] = useState(remainingMsFromServer ?? 0);
  const expired = useRef(false);

  // Mỗi câu trả lời mới của máy chủ ĐẶT LẠI mốc neo. Không cộng dồn: một mốc
  // mới ghi đè hoàn toàn mốc cũ, nên sai lệch tích luỹ trước đó biến mất.
  useEffect(() => {
    if (remainingMsFromServer === null) {
      anchor.current = null;
      return;
    }
    anchor.current = {
      remainingMsAtSync: remainingMsFromServer,
      monotonicAtSync: performance.now(),
    };
    expired.current = false;
    setDisplay(remainingMsFromServer);
  }, [remainingMsFromServer]);

  useEffect(() => {
    if (closed || remainingMsFromServer === null) {
      return;
    }
    const tick = setInterval(() => {
      const current = anchor.current;
      if (current === null) {
        return;
      }
      const left = remainingFrom(current, performance.now());
      setDisplay(left);
      /*
       * Chạm 0 thì HỎI máy chủ, không tự tuyên bố đã khoá. Máy chủ là nơi duy
       * nhất biết hạn thật (nó cộng cả `closes_at` của kỳ thi), và một client
       * tự khoá sẽ khoá sớm ở bất kỳ máy nào có `performance.now()` chạy nhanh.
       * `expired` chặn việc gọi lặp mỗi 250ms sau khi đã chạm 0.
       */
      if (left <= 0 && !expired.current) {
        expired.current = true;
        onExpire();
      }
    }, COUNTDOWN_TICK_MS);

    // Hiệu chỉnh định kỳ: `performance.now()` DỪNG khi máy ngủ, nên không có
    // lượt này thì một lần gập máy tính mua thêm đúng ngần ấy thời gian.
    const resync = setInterval(onExpire, COUNTDOWN_RESYNC_MS);

    return () => {
      clearInterval(tick);
      clearInterval(resync);
    };
  }, [closed, remainingMsFromServer, onExpire]);

  return display;
}
