'use client';

import Link from 'next/link';
import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Button,
  CursorPager,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from '@devops-platform/ui';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../lib/trpc';
import { AdminNote, AdminSection } from '../../../components/admin/admin-section';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { formatDay } from '../../../lib/format-moment';

type ClassSummary = inferRouterOutputs<AppRouter>['classes']['list']['items'][number];

/**
 * `/admin/classes` (18.F.2) — danh sách lớp và ô tạo lớp.
 *
 * ## ⛔ `useQuery` + cursor thủ công, KHÔNG `useInfiniteQuery`
 *
 * Cùng bẫy đã ghi ở `app/admin/users/users-client.tsx`:
 * `useInfiniteQuery` của `@trpc/react-query` nhét `direction` vào INPUT gửi
 * lên, mà `listInputSchema` là `.strict()`, nên request thật của trình duyệt
 * trả 400 `unrecognized_keys` trong khi mọi test mức API vẫn xanh. Ngăn xếp
 * cursor dùng lại `lib/cursor-stack.ts` (hàm thuần, đã có test), không viết
 * bản thứ hai.
 *
 * ## Tạo lớp nằm TRÊN bảng, không nằm trong một hộp thoại
 *
 * Đây là màn hình mà việc đầu tiên người ta làm là tạo lớp, và trạng thái rỗng
 * của bảng cũng trỏ lên chính ô này. Một hộp thoại sẽ bắt người dùng tìm nút mở
 * nó trước, và làm trạng thái rỗng không có gì để trỏ tới.
 */
export function AdminClassesClient(): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);

  // `exactOptionalPropertyTypes: true` + Zod `.strict()`: "trang đầu" phải là
  // VẮNG MẶT key, không phải `cursor: undefined`.
  const query = api.classes.list.useQuery(cursor === undefined ? {} : { cursor });

  return (
    <AdminSection title={t('admin.classes.title')} description={t('admin.classes.description')}>
      <CreateClassForm onCreated={() => setStack(FIRST_PAGE)} />
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
      />
    </AdminSection>
  );
}

function CreateClassForm({ onCreated }: { readonly onCreated: () => void }): ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const create = api.classes.create.useMutation({
    onSuccess: (created) => {
      setName('');
      setDescription('');
      setServerError(null);
      toast({
        variant: 'success',
        title: t('admin.classes.created-toast-title', { name: created.name }),
        description: t('admin.classes.created-toast-body'),
      });
      // Đọc lại từ máy chủ thay vì chèn vào cache: danh sách sắp theo thời gian
      // tạo giảm dần, và tự chèn là tự khẳng định một vị trí mà chỉ máy chủ
      // biết chắc.
      void utils.classes.list.invalidate();
      void utils.admin.audit.list.invalidate();
      onCreated();
    },
    onError: (error) => {
      const code = trpcErrorCode(error);
      const message = describeTrpcError(error);
      // `CONFLICT` là phán quyết có chủ đích của máy chủ (trùng tên trong cùng
      // một chủ lớp), nên câu của nó đã đúng. Mọi mã khác có thể là mạng chập
      // hoặc lỗi thật, nên KHÔNG được nói chắc rằng chưa có gì được tạo.
      const entry =
        code === 'CONFLICT'
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-class-name">{t('admin.classes.create-name-label')}</Label>
          <Input
            id="admin-class-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('admin.classes.create-name-placeholder')}
            maxLength={120}
            required
          />
        </div>
        <Button type="submit" loading={create.isPending} disabled={name.trim() === ''}>
          {t('admin.classes.create-submit')}
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="admin-class-desc">{t('admin.classes.create-desc-label')}</Label>
        <Textarea
          id="admin-class-desc"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('admin.classes.create-desc-placeholder')}
          maxLength={500}
          rows={2}
        />
      </div>
      {serverError === null ? null : (
        // `role="alert"` chứ không `status`: đây là một thao tác vừa THẤT BẠI,
        // và người dùng cần biết ngay thay vì đợi tới lượt đọc kế tiếp.
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
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
}): ReactElement {
  if (props.pending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (props.error !== null) {
    const failure = err('admin.error.classes-list', { reason: props.error });
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
        title={t('admin.classes.empty-title')}
        description={t('admin.classes.empty-body')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.classes.col-name')}</TableHead>
              <TableHead>{t('admin.classes.col-owner')}</TableHead>
              <TableHead>{t('admin.classes.col-members')}</TableHead>
              <TableHead>{t('admin.classes.col-created')}</TableHead>
              <TableHead className="text-right">{t('admin.classes.col-actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {row.description ?? t('admin.classes.no-description')}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-sm">{row.ownerName}</span>
                    <span className="text-xs text-muted-foreground">{row.ownerEmail}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm tabular-nums">{row.memberCount}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDay(row.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/classes/${row.id}`}>{t('admin.classes.open')}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/*
        Câu tự đính chính phạm vi, cùng khuôn `/admin/users`: bảng này chỉ nói
        về TRANG đang xem. Một con số đọc ra như tổng của cả hệ là một khẳng
        định sai về dữ liệu mà trang chưa hề tải.
      */}
      <AdminNote>
        {t('admin.classes.note', { count: items.length, page: props.page })}
        {props.hasNext ? t('admin.classes.note-more') : '.'}
      </AdminNote>

      <CursorPager
        hasNext={props.hasNext}
        onNext={props.onNext}
        onReset={props.onFirst}
        page={props.page}
        loading={props.fetching}
      />
    </div>
  );
}
