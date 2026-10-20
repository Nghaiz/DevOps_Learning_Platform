'use client';

import Link from 'next/link';
import {
  useCallback,
  useState,
  type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err,
  t } from '@devops-platform/copy';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import {
  AdminNote,
  AdminPage,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
  AdminPager,
} from '../../../components/admin/admin-page';
import { ExamFormSheet, useSheetServerError } from '../../../components/admin/exam-form-sheet';
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
  popCursor,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { formatDay, formatMoment } from '../../../lib/format-moment';
import { Button, Empty, Table, TBody, TD, TH, THead, TR, toast } from '@devops-platform/ds';

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
    <AdminPage title={t('admin.exams.title')} lead={t('admin.exams.lead')} aside={
        <Button variant="primary" size="lg" onClick={() => setCreating(true)} icon="plus">
          {t('admin.exams.open-create')}
        </Button>
      }>
      <div>
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
          onPrevious={() => setStack(popCursor)}
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
  const [serverError, setServerError] = useSheetServerError(props.open);
  const utils = api.useUtils();

  const create = api.exams.create.useMutation({
    onSuccess: (created) => {
      toast.success(t('admin.exams.created-toast', { title: created.title }));
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
      onOpenChange={props.onOpenChange}
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
  readonly onPrevious: () => void;
  readonly onCreate: () => void;
}): ReactElement {
  if (props.pending) {
    return <LedgerSkeleton />;
  }
  if (props.error !== null) {
    return (
      <LedgerError
        failure={err('admin.error.exams-list', { reason: props.error })}
        onRetry={props.onRetry}
        retrying={props.fetching}
        page={props.page}
        onFirst={props.onFirst}
      />
    );
  }
  const items = props.items ?? [];
  if (items.length === 0) {
    return (
      <Empty title={t('admin.exams.empty-title')} action={
          props.page > 1 ? (
            <FirstPageButton page={props.page} onFirst={props.onFirst} />
          ) : (
            <Button variant="primary" onClick={props.onCreate} icon="plus">
              {t('admin.exams.open-create')}
            </Button>
          )
        }>{t('admin.exams.empty-body')}</Empty>
    );
  }

  // Đọc đồng hồ MỘT lần cho cả bảng: mỗi dòng tự gọi `Date.now()` thì hai kỳ
  // thi cùng giờ đóng có thể lệch nhãn nhau đúng ở mốc giây.
  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <Table label={t('admin.exams.title')}>
        <THead>
          <tr>
            <TH scope="col">{t('admin.exams.col-title')}</TH>
            <TH scope="col">{t('admin.exams.col-window')}</TH>
            <TH scope="col" numeric>
              {t('admin.exams.col-problems')}
            </TH>
            <TH scope="col" numeric>
              {t('admin.exams.col-duration')}
            </TH>
            <TH scope="col" numeric>
              {t('admin.exams.col-attempts')}
            </TH>
            <TH scope="col">{t('admin.exams.col-created')}</TH>
            <TH scope="col" numeric>
              {t('admin.exams.col-actions')}
            </TH>
          </tr>
        </THead>
        <TBody>
          {items.map((item) => (
            <TR key={item.id}>
              <TD>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-ink">{item.title}</span>
                  <span className="text-xs text-ink-2">{item.className}</span>
                </div>
              </TD>
              <TD>
                <div className="flex flex-col items-start gap-1">
                  <ExamStateBadge state={examWindowState(item, now)} />
                  <span className="text-xs tabular-nums text-ink-2">{describeExamWindow(item, formatMoment)}</span>
                </div>
              </TD>
              <TD numeric>{item.problemCodes.length}</TD>
              <TD numeric>
                {t('admin.exams.minutes', { minutes: item.durationMinutes })}
              </TD>
              <TD numeric>{item.attemptCount}</TD>
              <TD className="whitespace-nowrap text-xs tabular-nums text-ink-2">{formatDay(item.createdAt)}</TD>
              <TD numeric>
                <Button asChild variant="secondary" size="sm" iconRight="arrow-right">
                  <Link href={`/admin/exams/${item.id}`}>{t('admin.exams.open')}</Link>
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminNote>
          {t('admin.exams.note', { count: items.length, page: props.page })}
          {props.hasNext ? t('admin.exams.note-more') : '.'}
        </AdminNote>
        <AdminPager page={props.page} hasNext={props.hasNext} loading={props.fetching} onNext={props.onNext} onFirst={props.onFirst} onPrevious={props.onPrevious} />
      </div>
    </div>
  );
}

