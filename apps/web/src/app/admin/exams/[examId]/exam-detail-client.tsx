'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, type ReactElement, type ReactNode } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError } from '../../../../lib/trpc';
import { formatDay, formatMoment } from '../../../../lib/format-moment';
import {
  AdminDetailPage,
  AdminNote,
  DetailError,
  LedgerSkeleton,
} from '../../../../components/admin/admin-page';
import { ExamFormSheet, useSheetServerError } from '../../../../components/admin/exam-form-sheet';
import { ExamStateBadge } from '../../../../components/admin/exam-state-badge';
import {
  describeExamWindow,
  examToForm,
  examWindowState,
  type ExamComposeInput,
} from '../../../../components/admin/exam-form-model';
import { Button, ConfirmDialog, Empty, ErrorBlock, Pill, Section, Table, TBody, TD, TH, THead, TR, toast } from '@devops-platform/ds';

type Exam = inferRouterOutputs<AppRouter>['exams']['get'];

/** Đủ lâu để trình duyệt bắt đầu đọc blob, đủ ngắn để không giữ file trong bộ nhớ tab. */
const CSV_REVOKE_DELAY_MS = 30_000;

/**
 * `/admin/exams/:examId`: thông tin đầy đủ, bảng điểm, xuất CSV, sửa và xoá.
 *
 * ## Lỗi cũ mà trang này sửa
 *
 * - Trang chỉ hiện TÊN kỳ thi, dù `exams.get` trả đủ cửa sổ thi, thời lượng,
 *   lớp, cách sinh đề và danh sách bài. Người chấm phải mở lại form ở đâu đó
 *   để biết đề có những bài nào.
 * - `exams.update` và `exams.remove` có sẵn ở máy chủ mà giao diện không gọi.
 * - `download()` không bắt lỗi: một lượt `scoreboardCsv` hỏng là một promise
 *   bị từ chối không ai nghe, nút bấm không có phản hồi nào.
 * - Hai query chờ nhau: bảng điểm lỗi thì cả trang thành một khối lỗi. Nay
 *   thông tin và bảng điểm đọc độc lập, mỗi phần tự báo lỗi của mình.
 *
 * ## CSV tải qua Blob, không qua một route riêng
 *
 * Nội dung đã là văn bản và máy chủ trả nó qua `exams.scoreboardCsv`. Một route
 * `/api/...` riêng sẽ phải dựng LẠI cổng `adminProcedure` ở tầng middleware.
 */
export function AdminExamDetailClient({ examId }: { readonly examId: string }): ReactElement {
  const exam = api.exams.get.useQuery({ examId });

  // Lúc đang tải và lúc lỗi vẫn dựng đủ khung trang (đường dẫn, `h1`): trang
  // không có tiêu đề nào thì trình đọc màn hình không biết mình đang ở đâu, và
  // đường dẫn là lối về danh sách khi kỳ thi không mở được.
  if (exam.isPending || exam.isError) {
    return (
      <AdminDetailPage
        crumbs={[{ href: '/admin/exams', label: t('admin.exams.title') }]}
        title={t('admin.exams.detail-title')}
      >
        <div>
          {exam.isPending ? (
            <LedgerSkeleton rows={4} />
          ) : (
            <DetailError
              failure={err('admin.error.exam-get', { reason: describeTrpcError(exam.error) })}
              onRetry={() => void exam.refetch()}
              retrying={exam.isFetching}
              backHref="/admin/exams"
              backLabel={t('admin.exams.back-list')}
            />
          )}
        </div>
      </AdminDetailPage>
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
          <Button variant="secondary" onClick={() => setEditing(true)} icon="edit">
            {t('admin.exams.edit')}
          </Button>
          <Button variant="danger" icon="trash" onClick={() => setRemoving(true)}>
            {t('admin.exams.remove')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-14">
        <Section title={t('admin.exams.info-title')} icon="info">
          <ExamFacts exam={exam} />
        </Section>
        <Section title={t('admin.exams.scoreboard-title')} description={t('admin.exams.scoreboard-description')} icon="award">
          <ExamScoreboard examId={exam.id} />
        </Section>
      </div>

      <EditExamSheet exam={exam} open={editing} onOpenChange={setEditing} />
      <RemoveExamDialog exam={exam} open={removing} onOpenChange={setRemoving} />
    </AdminDetailPage>
  );
}

function ExamFacts({ exam }: { readonly exam: Exam }): ReactElement {
  return (
    <dl className="flex flex-col gap-5">
      <Fact label={t('admin.exams.field.class')}>
        <Link
          href={`/admin/classes/${exam.classId}`}
          className="font-medium text-acc-ink underline-offset-4 hover:underline"
        >
          {exam.className}
        </Link>
      </Fact>
      <Fact label={t('admin.exams.field.window')}>
        <span className="text-sm tabular-nums">{describeExamWindow(exam, formatMoment)}</span>
      </Fact>
      <Fact label={t('admin.exams.field.duration')}>
        <span className="text-sm tabular-nums">{t('admin.exams.minutes', { minutes: exam.durationMinutes })}</span>
      </Fact>
      <Fact label={t('admin.exams.field.strategy')}>
        {exam.seedStrategy === 'fixed' ? t('admin.exams.strategy-fixed') : t('admin.exams.strategy-per-student')}
      </Fact>
      <Fact label={t('admin.exams.field.problems')}>
        <div className="flex flex-col gap-2">
          <span className="text-sm text-ink-2">
            {t('admin.exams.problems-count', { count: exam.problemCodes.length })}
          </span>
          <ol className="flex flex-wrap gap-2">
            {exam.problemCodes.map((code, index) => (
              <li key={code}>
                <Link
                  href={`/problems/${encodeURIComponent(code)}`}
                  className="flex h-8 items-center gap-2 rounded-full border border-rule-2 bg-paper px-3 font-mono text-xs transition-colors hover:border-acc-mid hover:bg-acc-wash"
                >
                  <span className="font-sans text-ink-3 tabular-nums">{index + 1}</span>
                  {code}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </Fact>
      <Fact label={t('admin.exams.field.attempts')}>
        <span className="text-sm tabular-nums">{t('admin.exams.attempts', { count: exam.attemptCount })}</span>
      </Fact>
      <Fact label={t('admin.exams.field.created')}>
        <span className="text-sm tabular-nums">{formatDay(exam.createdAt)}</span>
      </Fact>
    </dl>
  );
}

/**
 * Một cặp nhãn và giá trị, bọc riêng: ở màn hẹp nhãn nằm sát ngay trên giá trị (gap-1) còn các
 * cặp cách nhau gap-5. Lưới chung cho mọi ô từng cho nhãn-giá trị và cặp-cặp cùng một khoảng, nên
 * không đọc ra giá trị nào thuộc nhãn nào (rà ảnh 2026-10-20).
 */
function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid gap-1 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-x-8">
      <dt className="pt-0.5 text-sm text-ink-3">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function CsvButton({ examId }: { readonly examId: string }): ReactElement {
  const utils = api.useUtils();
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
      anchor.hidden = true;
      // Gắn vào DOM trước khi bấm: Firefox bỏ qua `click()` trên một thẻ `<a>`
      // chưa nằm trong tài liệu.
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Thu hồi ở lượt sau, không ngay sau `click()`: lượt tải bắt đầu bất đồng
      // bộ, và thu hồi đồng bộ có thể cắt nó trước khi trình duyệt kịp đọc
      // blob. Không thu hồi thì object URL giữ cả file trong bộ nhớ tab tới khi
      // tab đóng, mà người chấm tải bảng điểm nhiều lần.
      window.setTimeout(() => URL.revokeObjectURL(url), CSV_REVOKE_DELAY_MS);
      toast.success(t('admin.exams.csv-done', { file: file.fileName }));
    } catch (error: unknown) {
      const failure = err('admin.error.exam-csv', { reason: describeTrpcError(error) });
      toast.error(failure.what, { description: failure.next });
    } finally {
      setBusy(false);
    }
  }, [examId, utils]);

  return (
    <Button
      variant="secondary"
      onClick={() => void download()}
      loading={busy}
      icon="download"
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
  const [serverError, setServerError] = useSheetServerError(props.open);
  const utils = api.useUtils();

  const update = api.exams.update.useMutation({
    onSuccess: (updated) => {
      toast.success(t('admin.exams.updated-toast', { title: updated.title }));
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
      onOpenChange={props.onOpenChange}
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
  const utils = api.useUtils();
  const router = useRouter();

  const remove = api.exams.remove.useMutation({
    onSuccess: () => {
      toast.success(t('admin.exams.removed-toast', { title: props.exam.title }));
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
      cancelLabel={t('common.action.cancel')}
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
      <ErrorBlock title={failure.what} onRetry={() => void board.refetch()} retrying={board.isFetching} retryLabel={t('admin.reload')}>{failure.next}</ErrorBlock>
    );
  }

  const data = board.data;
  return (
    <div className="flex flex-col gap-4">
      <AdminNote>{t('admin.exams.csv-note')}</AdminNote>
      {data.rows.length === 0 ? (
        <Empty title={t('admin.exams.sb-empty-title')}>{t('admin.exams.sb-empty-body')}</Empty>
      ) : (
        // Mỗi bài MỘT cột: lọc theo bài là việc người chấm làm nhiều nhất ("ai
        // chưa qua bài 3?"). `Table` tự cuộn ngang trong khối của nó.
        <Table label={t('admin.exams.scoreboard-title')}>
          <THead>
            <tr>
              <TH scope="col">{t('admin.exams.sb-col-name')}</TH>
              <TH scope="col">{t('admin.exams.sb-col-started')}</TH>
              <TH scope="col">{t('admin.exams.sb-col-submitted')}</TH>
              <TH scope="col">{t('admin.exams.sb-col-auto')}</TH>
              {data.problemCodes.map((code) => (
                <TH key={code} scope="col" className="font-mono">
                  {code}
                </TH>
              ))}
              <TH scope="col" numeric>
                {t('admin.exams.sb-col-solved')}
              </TH>
              <TH scope="col" numeric>
                {t('admin.exams.sb-col-cases')}
              </TH>
            </tr>
          </THead>
          <TBody>
            {data.rows.map((row) => (
              <TR key={row.userId}>
                <TD className="font-medium text-ink">{row.name}</TD>
                <TD className="whitespace-nowrap text-xs tabular-nums">{formatMoment(row.startedAt)}</TD>
                <TD className="whitespace-nowrap text-xs tabular-nums">
                  {row.submittedAt === null ? t('admin.exams.sb-still-working') : formatMoment(row.submittedAt)}
                </TD>
                <TD>
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
                </TD>
                {row.cells.map((cell) => (
                  <TD key={cell.problemCode}>
                    <VerdictBadge cell={cell} />
                  </TD>
                ))}
                <TD numeric>{row.solvedCount}</TD>
                <TD numeric>
                  {row.passedTotal}/{row.caseTotal}
                </TD>
              </TR>
            ))}
          </TBody>
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
    return <span className="text-ink-3">-</span>;
  }
  if (cell.failCode !== null) {
    return (
      <Pill tone="bad">
        CE
      </Pill>
    );
  }
  if (cell.solved) {
    return (
      <Pill tone="ok" icon="check">
        AC
      </Pill>
    );
  }
  return (
    <Pill tone="warn">
      WA ({cell.passed}/{cell.total})
    </Pill>
  );
}
