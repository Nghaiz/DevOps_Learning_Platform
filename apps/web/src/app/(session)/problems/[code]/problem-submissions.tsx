import type { ReactElement } from 'react';
import { renderCopy, t } from '@devops-platform/copy';
import { ErrorBlock, Pill, RowsSkeleton, TBody, TD, TH, THead, TR, Table } from '@devops-platform/ds';
import type { ProblemSubmission } from '@devops-platform/games';
import { formatDuration, formatMoment } from '../problem-labels';
import { VerdictChip } from './verdict-chip';

/**
 * Lịch sử nộp bài CỦA CHÍNH NGƯỜI ĐANG XEM.
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
  /** Lượt tải lại đang chạy: nút thử lại ở trạng thái chờ, không bấm chồng được. */
  readonly retrying: boolean;
  /** Máy chủ còn con trỏ ⇒ còn lượt cũ hơn. Nói ra thay vì để danh sách trông như đã đủ. */
  readonly hasMore: boolean;
}): ReactElement {
  if (props.isPending) {
    return <RowsSkeleton rows={3} label={t('problem.oj.subs.loading')} />;
  }

  if (props.isError) {
    return (
      <ErrorBlock
        title={t('problem.oj.subs.error-title')}
        retryLabel={t('common.action.retry')}
        retrying={props.retrying}
        onRetry={props.onRetry}
      >
        {props.errorMessage}
      </ErrorBlock>
    );
  }

  if (props.items.length === 0) {
    return <p className="max-w-[68ch] text-sm text-ink-3">{t('problem.oj.subs.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table label={t('problem.oj.subs.caption')}>
        <THead>
          <tr>
            <TH>{t('problem.oj.subs.col-at')}</TH>
            {/*
              Verdict và Mục tiêu là HAI cột: verdict đếm theo MỌI testcase, còn
              `solved` đếm theo mục tiêu BẮT BUỘC. Ở bài có mục tiêu thưởng hai số
              lệch nhau một cách hợp lệ, nên gộp lại là vứt một trong hai sự thật.
            */}
            <TH>{t('problem.oj.subs.col-verdict')}</TH>
            <TH>{t('problem.oj.subs.col-goals')}</TH>
            <TH numeric>{t('problem.oj.subs.col-score')}</TH>
            <TH numeric className="hidden sm:table-cell">
              {t('problem.oj.subs.col-duration')}
            </TH>
            <TH numeric className="hidden md:table-cell">
              {t('problem.oj.subs.col-moves')}
            </TH>
            <TH numeric className="hidden md:table-cell">
              {t('problem.oj.subs.col-hints')}
            </TH>
          </tr>
        </THead>
        <TBody>
          {props.items.map((submission) => (
            <TR key={submission.id}>
              <TD className="whitespace-nowrap tabular-nums text-ink-2">{formatMoment(submission.submittedAt)}</TD>
              <TD>
                {/*
                  Nhãn + màu dựng ở `submission-verdict.ts`, không suy ở JSX. Chỗ đó
                  cũng là nơi `total === 0` được dịch thành một câu KHÁC `CE`.
                */}
                <VerdictChip submission={submission} />
              </TD>
              <TD>
                <Pill tone={submission.solved ? 'ok' : 'neutral'} {...(submission.solved ? { icon: 'flag' as const } : {})}>
                  {submission.solved ? t('problem.oj.subs.goals-met') : t('problem.oj.subs.goals-missed')}
                </Pill>
              </TD>
              <TD numeric className="font-medium text-ink">
                {submission.score}
              </TD>
              <TD numeric className="hidden whitespace-nowrap text-ink-2 sm:table-cell">
                {renderCopy(formatDuration(submission.durationSeconds))}
              </TD>
              <TD numeric className="hidden text-ink-2 md:table-cell">
                {submission.movesUsed}
              </TD>
              <TD numeric className="hidden text-ink-2 md:table-cell">
                {submission.hintsRevealed.length}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {props.hasMore ? <p className="text-xs text-ink-3">{t('problem.oj.subs.more')}</p> : null}
    </div>
  );
}
