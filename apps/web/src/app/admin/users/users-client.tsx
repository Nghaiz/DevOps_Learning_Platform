'use client';

import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import { Search, X } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Badge,
  Button,
  Chip,
  CursorPager,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@devops-platform/ui';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import type { ViewerRole } from '../../../components/shell/nav';
import { api } from '../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../lib/trpc';
import {
  AdminNote,
  AdminPage,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
} from '../../../components/admin/admin-page';
import { ConfirmDialog } from '../../../components/kit/confirm-dialog';
import {
  ASSIGNABLE_ROLES,
  describeRole,
  describeRoleChangeError,
  planRoleChange,
  roleBadgeVariant,
} from '../../../components/admin/role-change';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../lib/cursor-stack';
import { formatDay } from '../../../lib/format-moment';

type AdminUser = inferRouterOutputs<AppRouter>['admin']['users']['list']['items'][number];

/** Trần độ dài ô tìm: khớp `q: z.string().max(80)` của `listUsersInput`. */
const SEARCH_MAX_LENGTH = 80;

/**
 * `/admin/users`: ledger người dùng, tìm kiếm, đổi vai trò có xác nhận.
 *
 * ## ⛔ `useQuery` + cursor thủ công, KHÔNG `useInfiniteQuery`
 *
 * `useInfiniteQuery` của `@trpc/react-query` nhét `direction` vào INPUT gửi
 * lên, và `listUsersInput` là `.strict()`, nên request thật trả 400
 * `unrecognized_keys` trong khi mọi test mức API vẫn xanh (xem chú thích dài ở
 * `lib/trpc-react.tsx`). Ngăn xếp cursor dùng lại `lib/cursor-stack.ts`.
 *
 * ## Tìm kiếm bằng SUBMIT, không theo từng phím
 *
 * `q` là `ILIKE` trên email/name ở tầng DB. Mỗi phím một lượt quét bảng
 * `users`, và `protectedProcedure` có trần 120 query/phút mỗi user: gõ một địa
 * chỉ email là đủ chạm trần. Enter = tìm cũng rõ ràng hơn với bàn phím.
 */
export function AdminUsersClient({ actorId }: { readonly actorId: string }): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const [draftQuery, setDraftQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');

  const cursor = currentCursor(stack);
  const query = api.admin.users.list.useQuery({
    // `exactOptionalPropertyTypes` + Zod `.strict()`: "không lọc" là VẮNG MẶT
    // key, không phải `undefined`.
    ...(cursor === undefined ? {} : { cursor }),
    ...(appliedQuery === '' ? {} : { q: appliedQuery }),
  });

  const onSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Đổi điều kiện lọc PHẢI đưa cursor về đầu: giữ cursor cũ qua một lần đổi
      // `q` cho một trang hợp lệ, nhưng là trang giữa của tập mới, dưới nhãn
      // "trang 1".
      setAppliedQuery(draftQuery.trim());
      setStack(FIRST_PAGE);
    },
    [draftQuery],
  );

  const clearFilter = useCallback(() => {
    setDraftQuery('');
    setAppliedQuery('');
    setStack(FIRST_PAGE);
  }, []);

  return (
    <AdminPage
      kicker={t('admin.users.kicker')}
      title={t('admin.users.title')}
      lead={t('admin.users.lead')}
    >
      <div className="flex flex-col gap-6 pt-10">
        <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2" role="search">
          <div className="flex min-w-64 flex-1 flex-col gap-1.5 md:max-w-xl">
            <Label htmlFor="admin-users-q">{t('admin.users.search-label')}</Label>
            <Input
              id="admin-users-q"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={t('admin.users.search-placeholder')}
              maxLength={SEARCH_MAX_LENGTH}
            />
          </div>
          <Button
            type="submit"
            variant="ink"
            loading={query.isFetching && appliedQuery !== ''}
            iconLeft={<Search aria-hidden="true" />}
          >
            {t('admin.users.search-submit')}
          </Button>
          {/*
            Bộ lọc đang áp là một chip ĐANG BẬT; bấm để tắt. Đúng ngữ nghĩa nút
            bật tắt (`aria-pressed`) của `Chip`: tắt chip là bỏ lọc.
          */}
          {appliedQuery === '' ? null : (
            <Chip selected onClick={clearFilter} title={t('admin.users.clear-filter')}>
              {t('admin.users.filter-chip', { query: appliedQuery })}
              <X aria-hidden="true" className="size-3.5" />
            </Chip>
          )}
        </form>

        <UsersBody
          actorId={actorId}
          appliedQuery={appliedQuery}
          page={pageNumber(stack)}
          items={query.data?.items ?? null}
          pending={query.isPending}
          error={query.isError ? describeTrpcError(query.error) : null}
          fetching={query.isFetching}
          hasNext={query.data?.nextCursor != null}
          onRetry={() => void query.refetch()}
          onNext={() => setStack((prev) => pushCursor(prev, query.data?.nextCursor ?? null))}
          onFirst={() => setStack(FIRST_PAGE)}
          onClearFilter={clearFilter}
        />
      </div>
    </AdminPage>
  );
}

function UsersBody(props: {
  readonly actorId: string;
  readonly appliedQuery: string;
  readonly page: number;
  readonly items: readonly AdminUser[] | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly fetching: boolean;
  readonly hasNext: boolean;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
  readonly onClearFilter: () => void;
}): ReactElement {
  if (props.pending) {
    return <LedgerSkeleton />;
  }

  if (props.error !== null) {
    return (
      <LedgerError
        failure={err('admin.error.users-list', { reason: props.error })}
        onRetry={props.onRetry}
        retrying={props.fetching}
        page={props.page}
        onFirst={props.onFirst}
      />
    );
  }

  const items = props.items ?? [];
  const filtering = props.appliedQuery !== '';

  if (items.length === 0) {
    return (
      <EmptyState
        title={
          filtering
            ? t('admin.users.empty-title-query', { query: props.appliedQuery })
            : t('admin.users.empty-title')
        }
        description={filtering ? t('admin.users.empty-body-query') : t('admin.users.empty-body')}
        {...(filtering
          ? {
              action: (
                <Button variant="outline" onClick={props.onClearFilter}>
                  {t('admin.users.back-first')}
                </Button>
              ),
            }
          : props.page > 1
            ? { action: <FirstPageButton page={props.page} onFirst={props.onFirst} /> }
            : {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.users.col-user')}</TableHead>
            <TableHead>{t('admin.users.col-role')}</TableHead>
            <TableHead>{t('admin.users.col-created')}</TableHead>
            <TableHead className="text-right">{t('admin.users.col-actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((user) => (
            <UserRow key={user.id} user={user} actorId={props.actorId} />
          ))}
        </TableBody>
      </Table>

      {/*
        Câu tự đính chính phạm vi: bảng này chỉ nói về TRANG đang xem. "3 quản
        trị viên" đếm trên một trang đã cắt là một khẳng định sai về cả hệ.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminNote>
          {t('admin.users.note', { count: items.length, page: props.page })}
          {props.hasNext ? t('admin.users.note-more') : '.'}
        </AdminNote>
        <CursorPager
          hasNext={props.hasNext}
          onNext={props.onNext}
          onReset={props.onFirst}
          page={props.page}
          loading={props.fetching}
        />
      </div>
    </div>
  );
}

function UserRow({
  user,
  actorId,
}: {
  readonly user: AdminUser;
  readonly actorId: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [nextRole, setNextRole] = useState<ViewerRole>(() => firstOtherRole(user.role));
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();
  const isSelf = user.id === actorId;

  const setRole = api.admin.users.setRole.useMutation({
    onSuccess: (result) => {
      setOpen(false);
      setServerError(null);
      toast({
        variant: 'success',
        title: t('admin.users.toast-title', { email: user.email }),
        description: t('admin.users.toast-body', { role: describeRole(result.role) }),
      });
      // Đọc lại từ máy chủ: sửa tại chỗ trong cache là tự khẳng định một trạng
      // thái ta chỉ suy ra, trong khi máy chủ vừa trả sự thật.
      void utils.admin.users.list.invalidate();
      void utils.admin.audit.list.invalidate();
    },
    onError: (error) => {
      setServerError(describeRoleChangeError(trpcErrorCode(error), describeTrpcError(error)));
    },
  });

  const plan = planRoleChange({
    actorId,
    targetId: user.id,
    targetEmail: user.email,
    currentRole: user.role,
    nextRole,
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{user.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{user.email}</span>
          {isSelf ? (
            <span className="type-label text-brand">{t('admin.users.self-note')}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={roleBadgeVariant(user.role)}>{describeRole(user.role)}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{formatDay(user.createdAt)}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setNextRole(firstOtherRole(user.role));
            setServerError(null);
            setOpen(true);
          }}
        >
          {t('admin.users.change-role')}
        </Button>

        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setServerError(null);
            }
          }}
          title={plan.title}
          body={plan.body}
          // Đổi vai trò không làm mất dữ liệu nào; hậu quả (mất quyền vào một
          // nhánh) đã nằm trong `body`, và trường hợp tự khoá mình là `blockedReason`.
          loss={null}
          blockedReason={plan.blockedReason}
          error={serverError}
          confirmLabel={plan.confirmLabel}
          confirming={setRole.isPending}
          onConfirm={() => setRole.mutate({ userId: user.id, role: nextRole })}
        >
          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor={`role-${user.id}`}>{t('admin.users.role-field')}</Label>
            <Select
              value={nextRole}
              onValueChange={(value) => {
                setNextRole(value as ViewerRole);
                setServerError(null);
              }}
            >
              <SelectTrigger id={`role-${user.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {describeRole(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </ConfirmDialog>
      </TableCell>
    </TableRow>
  );
}

/** Gợi ý mặc định: một vai trò KHÁC vai trò hiện tại, để hộp thoại không mở ra ở trạng thái vô nghĩa. */
function firstOtherRole(current: string): ViewerRole {
  return ASSIGNABLE_ROLES.find((role) => role !== current) ?? 'user';
}
