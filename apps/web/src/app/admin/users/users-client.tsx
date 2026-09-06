'use client';

import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import {
  Badge,
  Button,
  CursorPager,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
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
import { AdminNote, AdminSection } from '../../../components/admin/admin-section';
import { ConfirmDialog } from '../../../components/admin/confirm-dialog';
import {
  ASSIGNABLE_ROLES,
  ROLE_LABEL,
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
} from '../../../components/catalog/catalog-cursor';

type AdminUser = inferRouterOutputs<AppRouter>['admin']['users']['list']['items'][number];

/**
 * `/admin/users` (13.G) — bảng người dùng, tìm kiếm, đổi vai trò có xác nhận.
 *
 * ## ⛔ `useQuery` + cursor thủ công, KHÔNG `useInfiniteQuery`
 *
 * `useInfiniteQuery` của `@trpc/react-query` nhét `direction` vào INPUT gửi
 * lên, và `listUsersInput` là `.strict()` — request thật của trình duyệt trả
 * 400 `unrecognized_keys` trong khi mọi test mức API vẫn xanh (đã xảy ra ở
 * 13.C, xem chú thích dài trong `app/lessons/lessons-client.tsx`). Ngăn xếp
 * cursor dùng lại `components/catalog/catalog-cursor.ts` — hàm thuần đã có test,
 * không viết bản thứ hai.
 *
 * ## Tìm kiếm bằng SUBMIT, không phải theo từng phím
 *
 * `q` là `ILIKE` trên email/name ở tầng DB. Gửi mỗi lần gõ một phím là mỗi phím
 * một lượt quét bảng `users`, và `protectedProcedure` có trần 120 query/phút
 * mỗi user — gõ một địa chỉ email là đủ chạm trần. Submit cũng làm hành vi rõ
 * ràng hơn với bàn phím (Enter = tìm), thứ AC 13.H mục 25 đòi.
 */
export function AdminUsersClient({ actorId }: { readonly actorId: string }): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const [draftQuery, setDraftQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');

  const cursor = currentCursor(stack);
  const query = api.admin.users.list.useQuery({
    // `exactOptionalPropertyTypes: true` + Zod `.strict()`: "không lọc" phải là
    // VẮNG MẶT key, không phải `undefined` (cùng bẫy `buildCatalogListInput` đã
    // ghi lại ở 13.C).
    ...(cursor === undefined ? {} : { cursor }),
    ...(appliedQuery === '' ? {} : { q: appliedQuery }),
  });

  const onSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Đổi điều kiện lọc PHẢI đưa cursor về đầu: cursor là `id` của dòng cuối
      // trang trước, và giữ nó qua một lần đổi `q` vẫn cho một trang HỢP LỆ —
      // nhưng là trang giữa của tập mới, dưới nhãn "Trang 1".
      setAppliedQuery(draftQuery.trim());
      setStack(FIRST_PAGE);
    },
    [draftQuery],
  );

  return (
    <AdminSection
      title="Người dùng"
      description="Tìm theo email hoặc tên, và đổi vai trò. Mỗi lần đổi ghi một dòng vào nhật ký quản trị."
    >
      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-users-q">Tìm theo email hoặc tên</Label>
          <Input
            id="admin-users-q"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder="vd. hoc@example.com"
            maxLength={80}
          />
        </div>
        <Button type="submit" variant="secondary" loading={query.isFetching}>
          Tìm
        </Button>
        {appliedQuery === '' ? null : (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraftQuery('');
              setAppliedQuery('');
              setStack(FIRST_PAGE);
            }}
          >
            Xoá bộ lọc
          </Button>
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
      />
    </AdminSection>
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
}): ReactElement {
  if (props.pending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (props.error !== null) {
    return (
      <ErrorState
        title="Không tải được danh sách người dùng"
        message={`${props.error} Bấm Thử lại; nếu vẫn lỗi, kiểm kết nối tới cơ sở dữ liệu.`}
        onRetry={props.onRetry}
        retrying={props.fetching}
      />
    );
  }

  const items = props.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        title={
          props.appliedQuery === ''
            ? 'Chưa có người dùng nào'
            : `Không có ai khớp "${props.appliedQuery}"`
        }
        description={
          props.appliedQuery === ''
            ? 'Bảng users đang trống — chưa ai đăng ký tài khoản.'
            : 'Tìm khớp một phần trên email và tên, không phân biệt hoa thường. Thử một đoạn ngắn hơn.'
        }
        {...(props.appliedQuery === ''
          ? {}
          : {
              action: (
                <Button variant="outline" onClick={props.onFirst}>
                  Về trang đầu
                </Button>
              ),
            })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Người dùng</TableHead>
            <TableHead>Vai trò</TableHead>
            <TableHead>Ngày tạo</TableHead>
            <TableHead className="text-right">Hành động</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((user) => (
            <UserRow key={user.id} user={user} actorId={props.actorId} />
          ))}
        </TableBody>
      </Table>

      {/*
        Câu tự đính chính phạm vi: bảng này chỉ nói về TRANG đang xem. Một dòng
        "3 quản trị viên" đếm trên một trang đã cắt sẽ là một khẳng định sai về
        cả hệ thống — đúng bẫy nhãn-nói-quá-dữ-liệu mà 13.D mục 13 gọi tên.
      */}
      <AdminNote>
        Đang xem {items.length} người ở trang {props.page}
        {props.hasNext ? ' — còn trang sau, nên đừng đếm tổng từ bảng này.' : '.'}
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

  const setRole = api.admin.users.setRole.useMutation({
    onSuccess: (result) => {
      setOpen(false);
      setServerError(null);
      toast({
        variant: 'success',
        title: `Đã đổi vai trò của ${user.email}`,
        description: `Vai trò mới: ${describeRole(result.role)}. Đã ghi vào nhật ký quản trị kèm tên bạn.`,
      });
      // Danh sách phải đọc lại từ máy chủ: sửa tại chỗ trong cache là tự khẳng
      // định một trạng thái ta chỉ suy ra, trong khi máy chủ vừa trả sự thật.
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
        <div className="flex flex-col">
          <span className="font-medium">{user.name}</span>
          <span className="text-xs text-muted-foreground">{user.email}</span>
          {user.id === actorId ? (
            <span className="text-xs text-muted-foreground">Đây là tài khoản của bạn</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={roleBadgeVariant(user.role)}>{describeRole(user.role)}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDay(user.createdAt)}</TableCell>
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
          Đổi vai trò
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
          blockedReason={plan.blockedReason}
          error={serverError}
          confirmLabel={plan.confirmLabel}
          confirming={setRole.isPending}
          onConfirm={() => setRole.mutate({ userId: user.id, role: nextRole })}
        >
          <div className="flex flex-col gap-1.5 text-left">
            <Label htmlFor={`role-${user.id}`}>Vai trò mới</Label>
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
                    {ROLE_LABEL[role]}
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

/** Gợi ý mặc định trong ô chọn: một vai trò KHÁC vai trò hiện tại, để hộp thoại không mở ra ở trạng thái vô nghĩa. */
function firstOtherRole(current: string): ViewerRole {
  return ASSIGNABLE_ROLES.find((role) => role !== current) ?? 'user';
}

/** Ngày tạo tài khoản; chuỗi không đọc được thì nói "không rõ" thay vì "Invalid Date". */
function formatDay(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? 'không rõ' : at.toLocaleDateString('vi-VN');
}
