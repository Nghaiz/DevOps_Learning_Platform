'use client';

import Link from 'next/link';
import {
  useCallback,
  useState,
  type FormEvent,
  type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err,
  t } from '@devops-platform/copy';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError,
  trpcErrorCode } from '../../../lib/trpc';
import {
  AdminNote,
  AdminPage,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
  AdminPager,
} from '../../../components/admin/admin-page';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  popCursor,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { formatDay } from '../../../lib/format-moment';
import { Button, Empty, Input, Label, Section, Table, TBody, TD, Textarea, TH, THead, TR, toast } from '@devops-platform/ds';

type ClassSummary = inferRouterOutputs<AppRouter>['classes']['list']['items'][number];

/** Khớp `createInput` của `server/trpc/routers/classes.ts`. */
const CLASS_NAME_MAX_LENGTH = 120;
const CLASS_DESCRIPTION_MAX_LENGTH = 500;

/**
 * `/admin/classes`: ô tạo lớp và ledger các lớp.
 *
 * ## ⛔ `useQuery` + cursor thủ công, KHÔNG `useInfiniteQuery`
 *
 * Cùng bẫy đã ghi ở `lib/trpc-react.tsx`: `useInfiniteQuery` nhét `direction`
 * vào INPUT, `listInputSchema` là `.strict()`, request thật trả 400.
 *
 * ## Tạo lớp nằm TRÊN ledger, không trong một hộp thoại
 *
 * Việc đầu tiên người ta làm ở màn này là tạo lớp, và trạng thái rỗng của
 * ledger trỏ lên chính ô đó. Một hộp thoại bắt người dùng tìm nút mở nó trước.
 */
export function AdminClassesClient(): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  // `exactOptionalPropertyTypes` + `.strict()`: "trang đầu" là VẮNG MẶT key.
  const query = api.classes.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminPage title={t('admin.classes.title')} lead={t('admin.classes.lead')}>
      <div className="flex flex-col gap-14">
      <Section title={t('admin.classes.create-title')} icon="plus">
        <CreateClassForm onCreated={() => setStack(FIRST_PAGE)} />
      </Section>
      <Section title={t('admin.classes.list-title')} icon="classroom">
        <ClassesBody
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
        />
      </Section>
      </div>
    </AdminPage>
  );
}

function CreateClassForm({ onCreated }: { readonly onCreated: () => void }): ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const utils = api.useUtils();

  const create = api.classes.create.useMutation({
    onSuccess: (created) => {
      setName('');
      setDescription('');
      setServerError(null);
      toast.success(t('admin.classes.created-toast-title', { name: created.name }), { description: t('admin.classes.created-toast-body') });
      // Đọc lại từ máy chủ thay vì chèn vào cache: danh sách sắp theo thời gian
      // tạo giảm dần, và vị trí đó chỉ máy chủ biết chắc.
      void utils.classes.list.invalidate();
      void utils.admin.audit.list.invalidate();
      onCreated();
    },
    onError: (error) => {
      const message = describeTrpcError(error);
      // `CONFLICT` là phán quyết có chủ đích (trùng tên trong cùng một chủ lớp).
      // Mọi mã khác có thể là mạng chập, nên KHÔNG nói chắc rằng chưa có gì
      // được tạo.
      const entry =
        trpcErrorCode(error) === 'CONFLICT'
          ? err('admin.error.class-create-conflict', { message })
          : err('admin.error.class-create-other', { message });
      setServerError(`${entry.what} ${entry.next}`);
    },
  });

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = name.trim();
      if (trimmed === '') {
        return;
      }
      setServerError(null);
      const note = description.trim();
      create.mutate(note === '' ? { name: trimmed } : { name: trimmed, description: note });
    },
    [create, description, name],
  );

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-class-name">{t('admin.classes.create-name-label')}</Label>
        <Input
          id="admin-class-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('admin.classes.create-name-placeholder')}
          maxLength={CLASS_NAME_MAX_LENGTH}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-class-desc">{t('admin.classes.create-desc-label')}</Label>
        <Textarea
          id="admin-class-desc"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('admin.classes.create-desc-placeholder')}
          maxLength={CLASS_DESCRIPTION_MAX_LENGTH}
          rows={2}
        />
      </div>
      {serverError === null ? null : (
        // `role="alert"`: thao tác vừa THẤT BẠI, người dùng cần biết ngay.
        <p role="alert" className="text-sm text-bad-ink">
          {serverError}
        </p>
      )}
      <div>
        <Button variant="primary"
          type="submit"
          loading={create.isPending}
          disabled={name.trim() === ''}
          icon="plus"
        >
          {t('admin.classes.create-submit')}
        </Button>
      </div>
    </form>
  );
}

function ClassesBody(props: {
  readonly page: number;
  readonly items: readonly ClassSummary[] | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly fetching: boolean;
  readonly hasNext: boolean;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
  readonly onPrevious: () => void;
}): ReactElement {
  if (props.pending) {
    return <LedgerSkeleton />;
  }

  if (props.error !== null) {
    return (
      <LedgerError
        failure={err('admin.error.classes-list', { reason: props.error })}
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
      <Empty title={t('admin.classes.empty-title')} {...(props.page > 1 ? { action: <FirstPageButton page={props.page} onFirst={props.onFirst} /> } : {})}>{t('admin.classes.empty-body')}</Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table label={t('admin.classes.list-title')}>
        <THead>
          <tr>
            <TH>{t('admin.classes.col-name')}</TH>
            <TH>{t('admin.classes.col-owner')}</TH>
            <TH numeric>{t('admin.classes.col-members')}</TH>
            <TH>{t('admin.classes.col-created')}</TH>
            <TH numeric>{t('admin.classes.col-actions')}</TH>
          </tr>
        </THead>
        <TBody>
          {items.map((row) => (
            <TR key={row.id}>
              <TD>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium text-ink">{row.name}</span>
                  <span className="text-xs text-ink-2">
                    {row.description ?? t('admin.classes.no-description')}
                  </span>
                </div>
              </TD>
              <TD>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">{row.ownerName}</span>
                  <span className="font-mono text-xs text-ink-2">{row.ownerEmail}</span>
                </div>
              </TD>
              <TD numeric className="font-medium">
                {row.memberCount}
              </TD>
              <TD className="whitespace-nowrap text-xs tabular-nums text-ink-2">{formatDay(row.createdAt)}</TD>
              <TD numeric>
                <Button asChild variant="secondary" size="sm" iconRight="arrow-right">
                  <Link href={`/admin/classes/${row.id}`}>{t('admin.classes.open')}</Link>
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      {/* Câu tự đính chính phạm vi: chỉ nói về TRANG đang xem. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminNote>
          {t('admin.classes.note', { count: items.length, page: props.page })}
          {props.hasNext ? t('admin.classes.note-more') : '.'}
        </AdminNote>
        <AdminPager page={props.page} hasNext={props.hasNext} loading={props.fetching} onNext={props.onNext} onFirst={props.onFirst} onPrevious={props.onPrevious} />
      </div>
    </div>
  );
}
