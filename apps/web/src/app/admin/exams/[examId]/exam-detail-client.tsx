'use client';

import Link from 'next/link';
import { useCallback, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@devops-platform/ui';

import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import { formatMoment } from '../../../../lib/format-moment';
import { AdminNote, AdminSection } from '../../../../components/admin/admin-section';

/**
 * `/admin/exams/:examId` (§18.G.6, §18.G.7) , bảng điểm và xuất CSV.
 *
 * ## Mỗi bài MỘT cột
 *
 * Một cột gộp kiểu `"AC, WA (3/5), ..."` ngắn hơn, và nó không lọc được , mà
 * lọc theo bài chính là việc người chấm làm nhiều nhất ("ai chưa qua bài 3?").
 * Bảng rộng nằm trong một khối cuộn ngang riêng, không làm cả trang trôi.
 *
 * ## CSV tải qua Blob, không qua một route riêng
 *
 * Nội dung đã là văn bản và máy chủ trả nó qua `exams.scoreboardCsv`. Một route
 * `/api/...` riêng sẽ phải dựng LẠI đúng cổng `adminProcedure` ở tầng middleware
 * Next , tức một nguồn sự thật thứ hai cho câu hỏi "ai được xem điểm lớp này".
 */
export function AdminExamDetailClient({ examId }: { readonly examId: string }): ReactElement {
  const exam = api.exams.get.useQuery({ examId });
  const board = api.exams.scoreboard.useQuery({ examId });
  const utils = api.useUtils();
  const { toast } = useToast();

  const download = useCallback(async () => {
    const file = await utils.exams.scoreboardCsv.fetch({ examId });
    const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.fileName;
    anchor.click();
    // Thu hồi NGAY sau khi bấm: một object URL không thu hồi giữ cả file trong
    // bộ nhớ tab cho tới khi tab đóng, và người chấm tải bảng điểm nhiều lần.
    URL.revokeObjectURL(url);
    toast({ variant: 'success', title: file.fileName });
  }, [examId, toast, utils]);

  if (exam.isPending || board.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (exam.isError) {
    return <ErrorState message={describeTrpcError(exam.error)} onRetry={() => void exam.refetch()} />;
  }
  if (board.isError) {
    return (
      <ErrorState message={describeTrpcError(board.error)} onRetry={() => void board.refetch()} />
    );
  }

  const data = board.data;
  const info = exam.data;
  if (data === undefined || info === undefined) {
    return <ErrorState message={t('admin.exams.sb-empty-body')} />;
  }

  return (
    <AdminSection
      title={info.title}
      description={t('admin.exams.scoreboard-description')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/exams"
          className="rounded-sm text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t('admin.exams.back')}
        </Link>
        <Button variant="outline" onClick={() => void download()}>
          {t('admin.exams.csv-download')}
        </Button>
      </div>

      <AdminNote>{t('admin.exams.csv-note')}</AdminNote>

      <h2 className="border-b border-border pb-2 text-lg font-semibold text-foreground">
        {t('admin.exams.scoreboard-title')}
      </h2>

      {data.rows.length === 0 ? (
        <EmptyState
          title={t('admin.exams.sb-empty-title')}
          description={t('admin.exams.sb-empty-body')}
        />
      ) : (
        // Khối cuộn RIÊNG cho bảng rộng: không có nó thì cả trang trôi ngang,
        // và mọi màn hình khác của `/admin` mất canh lề khi bảng này rộng ra.
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t('admin.exams.sb-col-name')}</TableHead>
                <TableHead scope="col">{t('admin.exams.sb-col-started')}</TableHead>
                <TableHead scope="col">{t('admin.exams.sb-col-submitted')}</TableHead>
                <TableHead scope="col">{t('admin.exams.sb-col-auto')}</TableHead>
                {data.problemCodes.map((code) => (
                  <TableHead key={code} scope="col" className="font-mono">
                    {code}
                  </TableHead>
                ))}
                <TableHead scope="col">{t('admin.exams.sb-col-solved')}</TableHead>
                <TableHead scope="col">{t('admin.exams.sb-col-cases')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableHead scope="row" className="font-medium text-foreground">
                    {row.name}
                  </TableHead>
                  <TableCell>{formatMoment(row.startedAt)}</TableCell>
                  <TableCell>
                    {row.submittedAt === null
                      ? t('admin.exams.sb-still-working')
                      : formatMoment(row.submittedAt)}
                  </TableCell>
                  <TableCell>
                    {/*
                      BA trạng thái, không phải hai. `null` = lượt chưa khoá, và
                      một ô trống nói đúng điều đó; ghi "Không" ở đó sẽ khẳng
                      định rằng người này đã nộp tay, trong khi họ đang làm bài.
                    */}
                    {row.autoSubmitted === null
                      ? ''
                      : row.autoSubmitted
                        ? t('admin.exams.auto-yes')
                        : t('admin.exams.auto-no')}
                  </TableCell>
                  {row.cells.map((cell) => (
                    <TableCell key={cell.problemCode}>
                      <VerdictBadge cell={cell} />
                    </TableCell>
                  ))}
                  <TableCell className="tabular-nums">{row.solvedCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.passedTotal}/{row.caseTotal}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AdminSection>
  );
}

/**
 * Một ô verdict.
 *
 * `CE` đọc `failCode` chứ không suy từ `passed === 0`: một lượt `WA (0/5)` thật
 * (người làm chạy được nhưng không qua case nào) cũng có `passed === 0`. Hai ca
 * khác nhau về nguyên nhân, giống hệt nhau về hai con số , đó đúng là lý do cột
 * `fail_code` tồn tại (migration 0015, plan §0.3a).
 */
function VerdictBadge({
  cell,
}: {
  readonly cell: {
    readonly passed: number | null;
    readonly total: number | null;
    readonly solved: boolean;
    readonly failCode: string | null;
  };
}): ReactElement {
  if (cell.passed === null || cell.total === null) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  if (cell.failCode !== null) {
    return (
      <Badge variant="destructive" icon={null}>
        CE
      </Badge>
    );
  }
  if (cell.solved) {
    return (
      <Badge variant="success" icon={null}>
        AC
      </Badge>
    );
  }
  return (
    <Badge variant="warning" icon={null}>
      WA ({cell.passed}/{cell.total})
    </Badge>
  );
}
