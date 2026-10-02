'use client';

import Link from 'next/link';
import { useCallback, useState, type ReactElement } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Button,
  CursorPager,
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
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { AdminNote, AdminPage, LedgerSkeleton } from '../../../components/admin/admin-page';
import { ExamFormSheet } from '../../../components/admin/exam-form-sheet';
import {
  describeExamWindow,
  emptyExamForm,
  examWindowState,
  type ExamComposeInput,
} from '../../../components/admin/exam-form-model';
import { ExamStateBadge } from '../../../components/admin/exam-state-badge';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { formatDay, formatMoment } from '../../../lib/format-moment';

type ExamSummary = inferRouterOutputs<AppRouter>['exams']['list']['items'][number];

/**
 * `/admin/exams`: ledger kỳ thi và nút ra đề.
 *
 * ## ⛔ `useQuery` + cursor thủ công, KHÔNG `useInfiniteQuery`
 *
 * Cùng bẫy đã ghi ở `lib/trpc-react.tsx`.
 *
 * ## Mã bài nhập bằng TEXTAREA, mỗi dòng một mã
 *
 * Một ô chọn nhiều từ danh mục cần một truy vấn tìm bài, một hộp gợi ý, và một
 * trạng thái "đã chọn" giữ đúng THỨ TỰ: ba thứ nữa để hỏng. Cổng soạn đề ở máy
 * chủ đã từ chối mã không tồn tại, chưa xuất bản và trùng, kèm câu gọi đúng tên
 * mã sai. Ô văn bản cộng một cổng nói được là đủ cho vài chục bài, và nó giữ
 * thứ tự bằng chính thứ tự dòng.
 */
export function AdminExamsClient(): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const [creating, setCreating] = useState(false);
  const cursor = currentCursor(stack);
  // `exactOptionalPropertyTypes` + `.strict()`: "trang đầu" là VẮNG MẶT key.
  const query = api.exams.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminPage
      kicker={t('admin.exams.kicker')}
      title={t('admin.exams.title')}
      lead={t('admin.exams.lead')}
      aside={
        <div className="flex lg:justify-end">
          <Button size="lg" onClick={() => setCreating(true)} iconLeft={<Plus aria-hidden="true" />}>
            {t('admin.exams.open-create')}
          </Button>
        </div>
      }
    >
      <div className="pt-10">
        <ExamsBody
          page={pageNumber(stack)}
          items={query.data?.items ?? null}
          pending={query.isPending}
          error={query.isError ? describeTrpcError(query.error) : null}
          fetching={query.isFetching}
          hasNext={query.data?.nextCursor != null}
          onRetry={() => void query.refetch()}
          onNext={() => setStack((prev) => pushCursor(prev, query.data?.nextCursor ?? null))}
          onFirst={() => setStack(FIRST_PAGE)}
          onCreate={() => setCreating(true)}
        />
      </div>
      <CreateExamSheet open={creating} onOpenChange={setCreating} onCreated={() => setStack(FIRST_PAGE)} />
    </AdminPage>
  );
}

function CreateExamSheet(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: () => void;
}): ReactElement {
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const create = api.exams.create.useMutation({
    onSuccess: (created) => {
      toast({ variant: 'success', title: t('admin.exams.created-toast', { title: created.title }) });
      // Đọc lại từ máy chủ thay vì chèn vào cache: vị trí trong danh sách chỉ
      // máy chủ biết chắc.
      void utils.exams.list.invalidate();
      void utils.admin.audit.list.invalidate();
      setServerError(null);
      props.onOpenChange(false);
      props.onCreated();
    },
    onError: (error) => {
      const entry = err('admin.error.exam-save', { message: describeTrpcError(error) });
      setServerError(`${entry.what} ${entry.next}`);
    },
  });

  const onSubmit = useCallback(
    (input: ExamComposeInput) => {
      setServerError(null);
      create.mutate(input);
    },
    [create],
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
      title={t('admin.exams.form.create-title')}
      initial={emptyExamForm()}
      attemptCount={0}
      submitLabel={t('admin.exams.form.submit-create')}
      pending={create.isPending}
      serverError={serverError}
      onSubmit={onSubmit}
    />
  );
}

function ExamsBody(props: {
  readonly page: number;
  readonly items: readonly ExamSummary[] | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly fetching: boolean;
  readonly hasNext: boolean;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
  readonly onCreate: () => void;
}): ReactElement {
  if (props.pending) {
    return <LedgerSkeleton />;
  }
  if (props.error !== null) {
    const failure = err('admin.error.exams-list', { reason: props.error });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={props.onRetry}
        retrying={props.fetching}
      />
    );
  }
  const items = props.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title={t('admin.exams.empty-title')}
        description={t('admin.exams.empty-body')}
        action={
          <Button onClick={props.onCreate} iconLeft={<Plus aria-hidden="true" />}>
            {t('admin.exams.open-create')}
          </Button>
        }
      />
    );
  }

  // Đọc đồng hồ MỘT lần cho cả bảng: mỗi dòng tự gọi `Date.now()` thì hai kỳ
  // thi cùng giờ đóng có thể lệch nhãn nhau đúng ở mốc giây.
  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t('admin.exams.col-title')}</TableHead>
            <TableHead scope="col">{t('admin.exams.col-window')}</TableHead>
            <TableHead scope="col" className="text-right">
              {t('admin.exams.col-problems')}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {t('admin.exams.col-duration')}
            </TableHead>
            <TableHead scope="col" className="text-right">
              {t('admin.exams.col-attempts')}
            </TableHead>
            <TableHead scope="col">{t('admin.exams.col-created')}</TableHead>
            <TableHead scope="col" className="text-right">
              {t('admin.exams.col-actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableHead scope="row" className="text-left">
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">{item.title}</span>
                  <span className="text-xs font-normal text-muted-foreground">{item.className}</span>
                </div>
              </TableHead>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <ExamStateBadge state={examWindowState(item, now)} />
                  <span className="font-mono text-xs text-muted-foreground">
                    {describeExamWindow(item, formatMoment)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{item.problemCodes.length}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {t('admin.exams.minutes', { minutes: item.durationMinutes })}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{item.attemptCount}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{formatDay(item.createdAt)}</TableCell>
              <TableCell className="text-right">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/exams/${item.id}`}>
                    {t('admin.exams.open')}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminNote>
          {t('admin.exams.note', { count: items.length, page: props.page })}
          {props.hasNext ? t('admin.exams.note-more') : '.'}
        </AdminNote>
        <CursorPager
          page={props.page}
          hasNext={props.hasNext}
          loading={props.fetching}
          onNext={props.onNext}
          onReset={props.onFirst}
        />
      </div>
    </div>
  );
}

