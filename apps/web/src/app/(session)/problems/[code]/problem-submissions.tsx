import type { ReactElement } from 'react';
import {
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@devops-platform/ui';
import { renderCopy, t } from '@devops-platform/copy';
import type { ProblemSubmission } from '@devops-platform/games';
import { formatDuration, formatMoment } from '../problem-labels';
import { VerdictChip } from './verdict-chip';

/**
 * Lịch sử nộp bài CỦA CHÍNH NGƯỜI ĐANG XEM, dạng sổ cái.
 *
 * Nguồn là `problems.mySubmissions`, thủ tục không nhận `userId`: không có đường
 * nào đọc lượt nộp của người khác kể cả khi sửa tham số ở trình duyệt.
 *
 * Mới nhất lên trên, và chỉ TRANG ĐẦU: người ta vào đây để xem "lần vừa rồi mình
 * được bao nhiêu", không phải để lục lại lượt thứ ba mươi.
 */
export function ProblemSubmissions(props: {
  readonly items: readonly ProblemSubmission[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
  readonly onRetry: () => void;
  /** Máy chủ còn con trỏ ⇒ còn lượt cũ hơn. Nói ra thay vì để danh sách trông như đã đủ. */
  readonly hasMore: boolean;
}): ReactElement {
  if (props.isPending) {
    return (
      <div role="status" aria-label={t('problem.oj.subs.loading')} className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (props.isError) {
    return (
      <ErrorState
        title={t('problem.oj.subs.error-title')}
        message={props.errorMessage}
        onRetry={props.onRetry}
      />
    );
  }

  if (props.items.length === 0) {
    return <p className="max-w-[68ch] text-sm text-muted-foreground">{t('problem.oj.subs.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableCaption className="sr-only">{t('problem.oj.subs.caption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('problem.oj.subs.col-at')}</TableHead>
            {/*
              Verdict và Mục tiêu là HAI cột: verdict đếm theo MỌI testcase, còn
              `solved` đếm theo mục tiêu BẮT BUỘC. Ở bài có mục tiêu thưởng hai số
              lệch nhau một cách hợp lệ, nên gộp lại là vứt một trong hai sự thật.
            */}
            <TableHead scope="col">{t('problem.oj.subs.col-verdict')}</TableHead>
            <TableHead scope="col">{t('problem.oj.subs.col-goals')}</TableHead>
            <TableHead scope="col" className="text-right">
              {t('problem.oj.subs.col-score')}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {t('problem.oj.subs.col-duration')}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {t('problem.oj.subs.col-moves')}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {t('problem.oj.subs.col-hints')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.items.map((submission) => (
            <TableRow key={submission.id}>
              <TableHead scope="row" className="font-mono text-sm font-normal tabular-nums text-foreground">
                {formatMoment(submission.submittedAt)}
              </TableHead>
              <TableCell>
                {/*
                  Nhãn + màu dựng ở `submission-verdict.ts`, không suy ở JSX. Chỗ đó
                  cũng là nơi `total === 0` được dịch thành một câu KHÁC `CE`.
                */}
                <VerdictChip submission={submission} />
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    'font-mono text-xs font-medium',
                    submission.solved ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {submission.solved ? t('problem.oj.subs.goals-met') : t('problem.oj.subs.goals-missed')}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{submission.score}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {renderCopy(formatDuration(submission.durationSeconds))}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{submission.movesUsed}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {submission.hintsRevealed.length}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {props.hasMore && <p className="text-xs text-muted-foreground">{t('problem.oj.subs.more')}</p>}
    </div>
  );
}
