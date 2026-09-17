import type { ReactElement } from 'react';
import { Badge, ErrorState, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@devops-platform/ui';
import { renderCopy, t } from '@devops-platform/copy';
import type { ProblemSubmission } from '@devops-platform/games';
import { formatDuration, formatMoment } from '../problem-labels';
import { submissionVerdictLabel } from './submission-verdict';

/**
 * Lịch sử nộp bài CỦA CHÍNH NGƯỜI ĐANG XEM.
 *
 * Nguồn là `problems.mySubmissions`, thủ tục không nhận `userId` — nên không có
 * đường nào để đọc lượt nộp của người khác kể cả khi sửa tham số ở trình duyệt.
 *
 * Mới nhất lên trên. Trang chi tiết chỉ hiện TRANG ĐẦU: người ta vào đây để xem
 * "lần vừa rồi mình được bao nhiêu", không phải để lục lại lượt thứ ba mươi.
 */
export function ProblemSubmissions(props: {
  readonly items: readonly ProblemSubmission[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly errorMessage: string;
  readonly onRetry: () => void;
  /** Máy chủ còn con trỏ ⇒ còn lượt cũ hơn không hiện ở đây. Nói ra thay vì để danh sách trông như đã đủ. */
  readonly hasMore: boolean;
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{t('catalog.problem.subs-title')}</h2>

      {props.isPending && <Skeleton className="h-32 w-full" />}

      {props.isError && (
        <ErrorState
          title={t('catalog.problem.subs-error-title')}
          message={props.errorMessage}
          onRetry={props.onRetry}
        />
      )}

      {!props.isPending && !props.isError && props.items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('catalog.problem.subs-empty')}</p>
      )}

      {!props.isPending && !props.isError && props.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('catalog.problem.subs-col-at')}</TableHead>
                <TableHead scope="col">{t('catalog.problem.subs-col-result')}</TableHead>
                {/*
                  Verdict là cột RIÊNG, không phải một cách tô màu khác cho cột
                  "Kết quả" bên cạnh. Hai cột đếm hai thứ: `solved` đếm theo các
                  mục tiêu BẮT BUỘC, còn verdict đếm theo MỌI testcase. Ở bài có
                  mục tiêu thưởng, hai số lệch nhau một cách hợp lệ, nên gộp
                  chúng lại là vứt đi một trong hai sự thật.
                */}
                <TableHead scope="col">{t('catalog.problem.subs-col-verdict')}</TableHead>
                <TableHead scope="col">{t('catalog.problem.subs-col-score')}</TableHead>
                <TableHead scope="col">{t('catalog.problem.subs-col-duration')}</TableHead>
                <TableHead scope="col">{t('catalog.problem.subs-col-moves')}</TableHead>
                <TableHead scope="col">{t('catalog.problem.subs-col-hints')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.items.map((submission) => (
                <TableRow key={submission.id}>
                  <TableHead scope="row" className="text-sm font-normal text-foreground">
                    {formatMoment(submission.submittedAt)}
                  </TableHead>
                  <TableCell>
                    <Badge variant={submission.solved ? 'status-done' : 'status-todo'}>
                      {submission.solved ? t('catalog.problem.subs-solved') : t('catalog.problem.subs-failed')}
                    </Badge>
                  </TableCell>
                  {/*
                    Nhãn dựng ở `submissionVerdictLabel`, không suy ở JSX. Chỗ
                    đó cũng là nơi `total === 0` được dịch thành một câu KHÁC
                    `CE`, và lý do nằm nguyên trong chú thích của nó.
                  */}
                  <TableCell className="text-sm tabular-nums text-foreground">
                    {submissionVerdictLabel(submission)}
                  </TableCell>
                  <TableCell className="tabular-nums">{submission.score}</TableCell>
                  <TableCell className="tabular-nums">
                    {renderCopy(formatDuration(submission.durationSeconds))}
                  </TableCell>
                  <TableCell className="tabular-nums">{submission.movesUsed}</TableCell>
                  <TableCell className="tabular-nums">{submission.hintsRevealed.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {props.hasMore && (
            <p className="text-sm text-muted-foreground">{t('catalog.problem.subs-more')}</p>
          )}
        </>
      )}
    </section>
  );
}
