'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import { Download, Pencil } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@devops-platform/ui';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { PageContainer, Split } from '../../../../components/kit';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import { formatDay, formatMoment } from '../../../../lib/format-moment';
import { AdminDetailPage, AdminNote, LedgerSkeleton } from '../../../../components/admin/admin-page';
import { ConfirmDialog } from '../../../../components/admin/confirm-dialog';
import { ExamFormSheet } from '../../../../components/admin/exam-form-sheet';
import { ExamStateBadge } from '../../../../components/admin/exam-state-badge';
import {
  describeExamWindow,
  examToForm,
  examWindowState,
  type ExamComposeInput,
} from '../../../../components/admin/exam-form-model';

type Exam = inferRouterOutputs<AppRouter>['exams']['get'];

/**
 * `/admin/exams/:examId`: thông tin đầy đủ, bảng điểm, xuất CSV, sửa và xoá.
 *
 * ## Lỗi cũ mà trang này sửa
 *
 * · Trang chỉ hiện TÊN kỳ thi, dù `exams.get` trả đủ cửa sổ thi, thời lượng,
 *   lớp, cách sinh đề và danh sách bài. Người chấm phải mở lại form ở đâu đó
 *   để biết đề có những bài nào.
 * · `exams.update` và `exams.remove` có sẵn ở máy chủ mà giao diện không gọi.
 * · `download()` không bắt lỗi: một lượt `scoreboardCsv` hỏng là một promise
 *   bị từ chối không ai nghe, nút bấm không có phản hồi nào.
 * · Hai query chờ nhau: bảng điểm lỗi thì cả trang thành một khối lỗi. Nay
 *   thông tin và bảng điểm đọc độc lập, mỗi phần tự báo lỗi của mình.
 *
 * ## CSV tải qua Blob, không qua một route riêng
 *
 * Nội dung đã là văn bản và máy chủ trả nó qua `exams.scoreboardCsv`. Một route
 * `/api/...` riêng sẽ phải dựng LẠI cổng `adminProcedure` ở tầng middleware.
 */
export function AdminExamDetailClient({ examId }: { readonly examId: string }): ReactElement {
  const exam = api.exams.get.useQuery({ examId });

  if (exam.isPending) {
    return (
      <PageContainer className="py-10">
        <LedgerSkeleton rows={4} />
      </PageContainer>
    );
  }

  if (exam.isError) {
    const failure = err('admin.error.exam-get', { reason: describeTrpcError(exam.error) });
    return (
      <PageContainer className="py-10">
        <ErrorState
          title={failure.what}
          message={failure.next}
          onRetry={() => void exam.refetch()}
          retrying={exam.isFetching}
        />
      </PageContainer>
    );
  }

  return <ExamDetail exam={exam.data} />;
}

function ExamDetail({ exam }: { readonly exam: Exam }): ReactElement {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  return (
    <AdminDetailPage
      crumbs={[{ href: '/admin/exams', label: t('admin.exams.title') }, { label: exam.title }]}
      title={exam.title}
      status={<ExamStateBadge state={examWindowState(exam, Date.now())} />}
      actions={
        <>
          <CsvButton examId={exam.id} />
          <Button variant="outline" onClick={() => setEditing(true)} iconLeft={<Pencil aria-hidden="true" />}>
            {t('admin.exams.edit')}
          </Button>
          <Button variant="destructive" onClick={() => setRemoving(true)}>
            {t('admin.exams.remove')}
          </Button>
        </>
      }
    >
      <Split index="01" title={t('admin.exams.info-title')}>
        <ExamFacts exam={exam} />
      </Split>
      <Split
        index="02"
        title={t('admin.exams.scoreboard-title')}
        aside={t('admin.exams.scoreboard-description')}
      >
        <ExamScoreboard examId={exam.id} />
      </Split>

      <EditExamSheet exam={exam} open={editing} onOpenChange={setEditing} />
      <RemoveExamDialog exam={exam} open={removing} onOpenChange={setRemoving} />
    </AdminDetailPage>
  );
}

function ExamFacts({ exam }: { readonly exam: Exam }): ReactElement {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      <Fact label={t('admin.exams.field.class')}>
        <Link
          href={`/admin/classes/${exam.classId}`}
          className="font-semibold text-brand underline-offset-4 hover:underline"
        >
          {exam.className}
        </Link>
      </Fact>
      <Fact label={t('admin.exams.field.window')}>
        <span className="font-mono text-sm">{describeExamWindow(exam, formatMoment)}</span>
      </Fact>
      <Fact label={t('admin.exams.field.duration')}>
        <span className="font-mono text-sm">{t('admin.exams.minutes', { minutes: exam.durationMinutes })}</span>
      </Fact>
      <Fact label={t('admin.exams.field.strategy')}>
        {exam.seedStrategy === 'fixed' ? t('admin.exams.strategy-fixed') : t('admin.exams.strategy-per-student')}
      </Fact>
      <Fact label={t('admin.exams.field.problems')}>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            {t('admin.exams.problems-count', { count: exam.problemCodes.length })}
          </span>
          <ol className="flex flex-wrap gap-2">
            {exam.problemCodes.map((code, index) => (
              <li key={code}>
                <Link
                  href={`/problems/${encodeURIComponent(code)}`}
                  className="flex h-8 items-center gap-2 border border-border bg-card px-2.5 font-mono text-xs transition-colors hover:border-ink hover:bg-muted"
                >
                  <span className="text-muted-foreground tabular-nums">{String(index + 1).padStart(2, '0')}</span>
                  {code}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Fact>
      <Fact label={t('admin.exams.field.attempts')}>
        <span className="font-mono text-sm">{t('admin.exams.attempts', { count: exam.attemptCount })}</span>
      </Fact>
      <Fact label={t('admin.exams.field.created')}>
        <span className="font-mono text-sm">{formatDay(exam.createdAt)}</span>
      </Fact>
    </dl>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <>
      <dt className="type-label pt-0.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </>
  );
}

function CsvButton({ examId }: { readonly examId: string }): ReactElement {
  const utils = api.useUtils();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const file = await utils.exams.scoreboardCsv.fetch({ examId });
      const blob = new Blob([file.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.click();
      // Thu hồi NGAY sau khi bấm: object URL không thu hồi giữ cả file trong bộ
      // nhớ tab tới khi tab đóng, và người chấm tải bảng điểm nhiều lần.
      URL.revokeObjectURL(url);
      toast({ variant: 'success', title: t('admin.exams.csv-done', { file: file.fileName }) });
    } catch (error: unknown) {
      const failure = err('admin.error.exam-csv', { reason: describeTrpcError(error) });
      toast({ variant: 'destructive', title: failure.what, description: failure.next });
    } finally {
      setBusy(false);
    }
  }, [examId, toast, utils]);

  return (
    <Button
      variant="outline"
      onClick={() => void download()}
      loading={busy}
      iconLeft={<Download aria-hidden="true" />}
    >
      {t('admin.exams.csv-download')}
    </Button>
  );
}

function EditExamSheet(props: {
  readonly exam: Exam;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const update = api.exams.update.useMutation({
    onSuccess: (updated) => {
      toast({ variant: 'success', title: t('admin.exams.updated-toast', { title: updated.title }) });
      void utils.exams.get.invalidate({ examId: updated.id });
      void utils.exams.list.invalidate();
      void utils.exams.scoreboard.invalidate({ examId: updated.id });
      void utils.admin.audit.list.invalidate();
      setServerError(null);
      props.onOpenChange(false);
    },
    onError: (error) => {
      const entry = err('admin.error.exam-save', { message: describeTrpcError(error) });
      setServerError(`${entry.what} ${entry.next}`);
    },
  });

  const onSubmit = useCallback(
    (input: ExamComposeInput) => {
      setServerError(null);
      update.mutate({ ...input, examId: props.exam.id });
    },
    [props.exam.id, update],
  );

  return (
    <ExamFormSheet
      open={props.open}
      onOpenChange={(next) => {
        props.onOpenChange(next);
        if (!next) {
          setServerError(null);
        }
      }}
      title={t('admin.exams.form.edit-title', { title: props.exam.title })}
      initial={examToForm(props.exam)}
      attemptCount={props.exam.attemptCount}
      submitLabel={t('admin.exams.form.submit-update')}
      pending={update.isPending}
      serverError={serverError}
      onSubmit={onSubmit}
    />
  );
}

function RemoveExamDialog(props: {
  readonly exam: Exam;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();
  const router = useRouter();

  const remove = api.exams.remove.useMutation({
    onSuccess: () => {
      toast({ variant: 'success', title: t('admin.exams.removed-toast', { title: props.exam.title }) });
      void utils.exams.list.invalidate();
      void utils.admin.audit.list.invalidate();
      props.onOpenChange(false);
      router.push('/admin/exams');
    },
    onError: (error) => {
      const entry = err('admin.error.exam-remove', { message: describeTrpcError(error) });
      setServerError(`${entry.what} ${entry.next}`);
    },
  });

  return (
    <ConfirmDialog
      open={props.open}
      onOpenChange={(next) => {
        props.onOpenChange(next);
        if (!next) {
          setServerError(null);
        }
      }}
      title={t('admin.exams.remove-title', { title: props.exam.title })}
      body={t('admin.exams.remove-body')}
      // `exam_attempts.exam_id` là `onDelete: cascade`: lượt làm bài đi theo.
      loss={
        props.exam.attemptCount > 0
          ? t('admin.exams.remove-loss', { count: props.exam.attemptCount })
          : t('admin.exams.remove-loss-none')
      }
      blockedReason={null}
      error={serverError}
      confirmLabel={t('admin.exams.remove-confirm')}
      confirming={remove.isPending}
      onConfirm={() => remove.mutate({ examId: props.exam.id })}
    />
  );
}

function ExamScoreboard({ examId }: { readonly examId: string }): ReactElement {
  const board = api.exams.scoreboard.useQuery({ examId });

  if (board.isPending) {
    return <LedgerSkeleton rows={4} />;
  }
  if (board.isError) {
    const failure = err('admin.error.exam-scoreboard', { reason: describeTrpcError(board.error) });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={() => void board.refetch()}
        retrying={board.isFetching}
      />
    );
  }

  const data = board.data;
  return (
    <div className="flex flex-col gap-4">
      <AdminNote>{t('admin.exams.csv-note')}</AdminNote>
      {data.rows.length === 0 ? (
        <EmptyState title={t('admin.exams.sb-empty-title')} description={t('admin.exams.sb-empty-body')} />
      ) : (
        // Mỗi bài MỘT cột: lọc theo bài là việc người chấm làm nhiều nhất ("ai
        // chưa qua bài 3?"). `Table` tự cuộn ngang trong khối của nó.
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
              <TableHead scope="col" className="text-right">
                {t('admin.exams.sb-col-solved')}
              </TableHead>
              <TableHead scope="col" className="text-right">
                {t('admin.exams.sb-col-cases')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.userId}>
                <TableHead scope="row" className="text-left font-semibold text-foreground">
                  {row.name}
                </TableHead>
                <TableCell className="font-mono text-xs">{formatMoment(row.startedAt)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {row.submittedAt === null ? t('admin.exams.sb-still-working') : formatMoment(row.submittedAt)}
                </TableCell>
                <TableCell>
                  {/*
                    BA trạng thái, không phải hai. `null` = lượt chưa khoá, và ô
                    trống nói đúng điều đó; ghi "Không" sẽ khẳng định người này
                    đã nộp tay, trong khi họ đang làm bài.
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
                <TableCell className="text-right font-mono tabular-nums">{row.solvedCount}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {row.passedTotal}/{row.caseTotal}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/**
 * Một ô verdict. `CE` đọc `failCode` chứ không suy từ `passed === 0`: một
 * lượt `WA (0/5)` thật cũng có `passed === 0`. Hai ca khác nhau về nguyên
 * nhân, giống hệt nhau về hai con số; đó là lý do cột `fail_code` tồn tại.
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
    return <span className="text-muted-foreground">&middot;</span>;
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
