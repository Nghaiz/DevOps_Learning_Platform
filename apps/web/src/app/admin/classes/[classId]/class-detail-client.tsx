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
  useToast,
} from '@devops-platform/ui';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import { AdminNote, AdminSection } from '../../../../components/admin/admin-section';
import { ConfirmDialog } from '../../../../components/admin/confirm-dialog';
import {
  FIRST_PAGE,
  currentCursor,
  pageNumber,
  pushCursor,
  type CursorStack,
} from '../../../../lib/cursor-stack';
import { formatDay, formatMoment } from '../../../../lib/format-moment';

type Outputs = inferRouterOutputs<AppRouter>;
type ClassMember = Outputs['classes']['members']['items'][number];
type ScoreRow = Outputs['classes']['scoreboard']['rows'][number];

/**
 * `/admin/classes/[classId]` (18.F.2 + 18.F.3).
 *
 * ## Ba lượt gọi ĐỘC LẬP, không gộp thành một
 *
 * `classes.get`, `classes.members`, `classes.scoreboard` chạy riêng, và mỗi
 * khối tự hiện lỗi của mình. Gộp chúng vào một procedure sẽ làm một trục trặc ở
 * phép gộp bảng điểm (truy vấn nặng nhất) nuốt luôn cả danh sách sinh viên,
 * trong khi hai thứ đó không phụ thuộc nhau: người vận hành vẫn thêm được sinh
 * viên khi bảng điểm đang lỗi. Câu "đọc độc lập" trong hai thông báo lỗi là
 * khẳng định về đúng chuyện này, không phải một lời an ủi.
 *
 * ## Bảng điểm KHÔNG phân trang
 *
 * Máy chủ trả cả lớp một lượt (`server/classes/scoreboard.ts` ghi rõ giả định:
 * sĩ số ở quy mô NCKH là hàng chục). Người chấm cũng cần nhìn cả bảng cùng
 * lúc để so thứ hạng, nên cắt trang ở đây sẽ làm chính việc người ta mở trang
 * lên để làm trở nên khó hơn.
 */
export function AdminClassDetailClient({ classId }: { readonly classId: string }): ReactElement {
  const detail = api.classes.get.useQuery({ classId });

  if (detail.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (detail.isError) {
    const failure = err('admin.error.class-get', { reason: describeTrpcError(detail.error) });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={() => void detail.refetch()}
        retrying={detail.isFetching}
      />
    );
  }

  return (
    <AdminSection
      title={detail.data.name}
      description={t('admin.classes.detail-owner', { owner: detail.data.ownerEmail })}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/classes">{t('admin.classes.back')}</Link>
        </Button>
      }
    >
      <MembersPanel classId={classId} />
      <ScoreboardPanel classId={classId} />
    </AdminSection>
  );
}

function MembersPanel({ classId }: { readonly classId: string }): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  const query = api.classes.members.useQuery(
    cursor === undefined ? { classId } : { classId, cursor },
  );

  return (
    <section className="flex flex-col gap-3">
      {/*
        `<h2>` chứ không `<h1>`: `AdminSection` đã đặt `<h1>` là tên lớp, và
        một `<h1>` thứ hai làm cấu trúc heading mô tả sai nội dung trang (AC
        13.H mục 25, cùng ràng buộc mà `admin-section.tsx` đã ghi).
      */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {t('admin.classes.members-title')}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('admin.classes.members-description')}
        </p>
      </div>

      <AddMemberForm classId={classId} onAdded={() => setStack(FIRST_PAGE)} />

      <MembersBody
        classId={classId}
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
    </section>
  );
}

function AddMemberForm(props: {
  readonly classId: string;
  readonly onAdded: () => void;
}): ReactElement {
  const [email, setEmail] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const add = api.classes.addMember.useMutation({
    onSuccess: (added) => {
      setEmail('');
      setServerError(null);
      toast({
        variant: 'success',
        title: t('admin.classes.added-toast-title', { email: added.email }),
        description: t('admin.classes.added-toast-body'),
      });
      void utils.classes.members.invalidate();
      void utils.classes.scoreboard.invalidate();
      void utils.classes.list.invalidate();
      void utils.admin.audit.list.invalidate();
      props.onAdded();
    },
    onError: (error) => {
      const code = trpcErrorCode(error);
      const message = describeTrpcError(error);
      // NOT_FOUND / CONFLICT / BAD_REQUEST đều là phán quyết có chủ đích của
      // máy chủ (không có tài khoản đó, đã ở trong lớp, đó là chủ lớp), nên câu
      // của nó đã nói đúng chuyện gì xảy ra. Mã khác thì không chắc, và câu
      // dưới cố ý không khẳng định rằng chưa có gì được ghi.
      const known = code === 'NOT_FOUND' || code === 'CONFLICT' || code === 'BAD_REQUEST';
      const entry = known
        ? err('admin.error.class-add-known', { message })
        : err('admin.error.class-add-other', { message });
      setServerError(`${entry.what} ${entry.next}`);
    },
  });

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = email.trim();
      if (trimmed === '') {
        return;
      }
      setServerError(null);
      add.mutate({ classId: props.classId, email: trimmed });
    },
    [add, email, props.classId],
  );

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-60 flex-1 flex-col gap-1.5">
          <Label htmlFor="admin-class-add-email">{t('admin.classes.add-email-label')}</Label>
          <Input
            id="admin-class-add-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('admin.classes.add-email-placeholder')}
            maxLength={254}
            required
          />
        </div>
        <Button type="submit" loading={add.isPending} disabled={email.trim() === ''}>
          {t('admin.classes.add-submit')}
        </Button>
      </div>
      {serverError === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
    </form>
  );
}

function MembersBody(props: {
  readonly classId: string;
  readonly page: number;
  readonly items: readonly ClassMember[] | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly fetching: boolean;
  readonly hasNext: boolean;
  readonly onRetry: () => void;
  readonly onNext: () => void;
  readonly onFirst: () => void;
}): ReactElement {
  if (props.pending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (props.error !== null) {
    const failure = err('admin.error.class-members', { reason: props.error });
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
        title={t('admin.classes.members-empty-title')}
        description={t('admin.classes.members-empty-body')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.classes.member-col-student')}</TableHead>
              <TableHead>{t('admin.classes.member-col-joined')}</TableHead>
              <TableHead className="text-right">{t('admin.classes.col-actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((member) => (
              <MemberRow key={member.userId} classId={props.classId} member={member} />
            ))}
          </TableBody>
        </Table>
      </div>

      <AdminNote>
        {t('admin.classes.members-note', { count: items.length, page: props.page })}
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

function MemberRow({
  classId,
  member,
}: {
  readonly classId: string;
  readonly member: ClassMember;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const remove = api.classes.removeMember.useMutation({
    onSuccess: () => {
      setOpen(false);
      setServerError(null);
      toast({
        variant: 'success',
        title: t('admin.classes.removed-toast-title', { name: member.name }),
        description: t('admin.classes.removed-toast-body'),
      });
      void utils.classes.members.invalidate();
      void utils.classes.scoreboard.invalidate();
      void utils.classes.list.invalidate();
      void utils.admin.audit.list.invalidate();
    },
    onError: (error) => {
      const entry = err('admin.error.class-remove', { message: describeTrpcError(error) });
      setServerError(`${entry.what} ${entry.next}`);
    },
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{member.name}</span>
          <span className="text-xs text-muted-foreground">{member.email}</span>
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDay(member.joinedAt)}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setServerError(null);
            setOpen(true);
          }}
        >
          {t('admin.classes.remove')}
        </Button>

        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setServerError(null);
            }
          }}
          title={t('admin.classes.remove-title', { name: member.name })}
          body={t('admin.classes.remove-body')}
          error={serverError}
          confirmLabel={t('admin.classes.remove-confirm')}
          confirming={remove.isPending}
          onConfirm={() => remove.mutate({ classId, userId: member.userId })}
        />
      </TableCell>
    </TableRow>
  );
}

function ScoreboardPanel({ classId }: { readonly classId: string }): ReactElement {
  const query = api.classes.scoreboard.useQuery({ classId });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {t('admin.classes.scoreboard-title')}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          {t('admin.classes.scoreboard-description')}
        </p>
      </div>
      <ScoreboardBody
        rows={query.data?.rows ?? null}
        pending={query.isPending}
        error={query.isError ? describeTrpcError(query.error) : null}
        fetching={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    </section>
  );
}

function ScoreboardBody(props: {
  readonly rows: readonly ScoreRow[] | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly fetching: boolean;
  readonly onRetry: () => void;
}): ReactElement {
  if (props.pending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (props.error !== null) {
    const failure = err('admin.error.class-scoreboard', { reason: props.error });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={props.onRetry}
        retrying={props.fetching}
      />
    );
  }

  const rows = props.rows ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('admin.classes.score-empty-title')}
        description={t('admin.classes.score-empty-body')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.classes.score-col-student')}</TableHead>
              <TableHead className="text-right">
                {t('admin.classes.score-col-attempted')}
              </TableHead>
              <TableHead className="text-right">{t('admin.classes.score-col-solved')}</TableHead>
              <TableHead className="text-right">{t('admin.classes.score-col-total')}</TableHead>
              <TableHead>{t('admin.classes.score-col-last')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs text-muted-foreground">{row.email}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {row.attemptedCount}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{row.solvedCount}</TableCell>
                <TableCell className="text-right text-sm font-medium tabular-nums">
                  {row.bestScoreTotal}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.lastSubmittedAt === null
                    ? t('admin.classes.never-submitted')
                    : formatMoment(row.lastSubmittedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <AdminNote>{t('admin.classes.score-note')}</AdminNote>
    </div>
  );
}
