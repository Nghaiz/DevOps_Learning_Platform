import type { ReactElement } from 'react';
import { Badge, ErrorState, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@devops-platform/ui';
import type { ProblemSubmission } from '@devops-platform/games';
import { formatDuration, formatMoment } from '../problem-labels';

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
      <h2 className="text-lg font-semibold text-foreground">Lượt nộp của bạn</h2>

      {props.isPending && <Skeleton className="h-32 w-full" />}

      {props.isError && (
        <ErrorState title="Không tải được lịch sử nộp" message={props.errorMessage} onRetry={props.onRetry} />
      )}

      {!props.isPending && !props.isError && props.items.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Bạn chưa nộp lượt nào cho bài này. Mở đấu trường và thao tác cho tới khi mọi mục tiêu xanh.
        </p>
      )}

      {!props.isPending && !props.isError && props.items.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Thời điểm</TableHead>
                <TableHead scope="col">Kết quả</TableHead>
                <TableHead scope="col">Điểm</TableHead>
                <TableHead scope="col">Thời gian làm</TableHead>
                <TableHead scope="col">Số nước</TableHead>
                <TableHead scope="col">Gợi ý đã mở</TableHead>
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
                      {submission.solved ? 'Đã giải' : 'Chưa đạt'}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{submission.score}</TableCell>
                  <TableCell className="tabular-nums">{formatDuration(submission.durationSeconds)}</TableCell>
                  <TableCell className="tabular-nums">{submission.movesUsed}</TableCell>
                  <TableCell className="tabular-nums">{submission.hintsRevealed.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {props.hasMore && (
            <p className="text-sm text-muted-foreground">Còn lượt nộp cũ hơn không hiện ở trang này.</p>
          )}
        </>
      )}
    </section>
  );
}
