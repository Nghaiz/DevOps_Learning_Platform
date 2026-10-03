'use client';

import { useCallback, useState, type FormEvent, type ReactElement } from 'react';
import { UserPlus } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { err, t } from '@devops-platform/copy';
import {
  Button,
  CursorPager,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Num,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useToast,
} from '@devops-platform/ui';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { Split, numSlot, WithNums } from '../../../../components/kit';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import {
  AdminDetailPage,
  AdminNote,
  DetailError,
  FirstPageButton,
  LedgerError,
  LedgerSkeleton,
} from '../../../../components/admin/admin-page';
import { ConfirmDialog } from '../../../../components/kit/confirm-dialog';
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

/** Khớp `addMemberInput.email: z.string().trim().email().max(254)`. */
const EMAIL_MAX_LENGTH = 254;

/**
 * `/admin/classes/[classId]`: sinh viên và bảng điểm của một lớp.
 *
 * ## Ba lượt gọi ĐỘC LẬP, không gộp thành một
 *
 * `classes.get`, `classes.members`, `classes.scoreboard` chạy riêng, mỗi khối
 * tự hiện lỗi của mình. Gộp chúng lại thì một trục trặc ở bảng điểm (truy vấn
 * nặng nhất) nuốt luôn danh sách sinh viên, trong khi người vận hành vẫn thêm
 * được sinh viên lúc bảng điểm đang lỗi.
 *
 * ## Bảng điểm KHÔNG phân trang
 *
 * Máy chủ trả cả lớp một lượt (sĩ số ở quy mô NCKH là hàng chục), và người
 * chấm cần nhìn cả bảng cùng lúc để so thứ hạng.
 */
export function AdminClassDetailClient({ classId }: { readonly classId: string }): ReactElement {
  const detail = api.classes.get.useQuery({ classId });
  const crumbs = [{ href: '/admin/classes', label: t('admin.classes.title') }];

  // Lúc đang tải và lúc lỗi vẫn dựng đủ khung trang (đường dẫn, `h1`): trang
  // không có tiêu đề nào thì trình đọc màn hình không biết mình đang ở đâu, và
  // đường dẫn là lối về danh sách khi lớp không mở được.
  if (detail.isPending || detail.isError) {
    return (
      <AdminDetailPage crumbs={crumbs} title={t('admin.classes.detail-title')}>
        <div className="pt-10">
          {detail.isPending ? (
            <LedgerSkeleton rows={4} />
          ) : (
            <DetailError
              failure={err('admin.error.class-get', { reason: describeTrpcError(detail.error) })}
              onRetry={() => void detail.refetch()}
              retrying={detail.isFetching}
              backHref="/admin/classes"
              backLabel={t('admin.classes.back-list')}
            />
          )}
        </div>
      </AdminDetailPage>
    );
  }

  return (
    <AdminDetailPage
      crumbs={[...crumbs, { label: detail.data.name }]}
      title={detail.data.name}
    >
      <p className="max-w-prose pt-6 text-base text-foreground">
        <WithNums
          text={t('admin.classes.detail-lead', { owner: detail.data.ownerEmail, count: numSlot(0) })}
          nums={[<Num key="count">{detail.data.memberCount}</Num>]}
        />
      </p>
      {detail.data.description === null ? null : (
        <p className="max-w-prose pt-2 text-sm text-muted-foreground">{detail.data.description}</p>
      )}
      <div className="pt-6">
        <Split index="01" title={t('admin.classes.members-title')} aside={t('admin.classes.members-description')}>
          <MembersPanel classId={classId} />
        </Split>
        <Split
          index="02"
          title={t('admin.classes.scoreboard-title')}
          aside={t('admin.classes.scoreboard-description')}
        >
          <ScoreboardPanel classId={classId} />
        </Split>
      </div>
    </AdminDetailPage>
  );
}

function MembersPanel({ classId }: { readonly classId: string }): ReactElement {
  const [stack, setStack] = useState<CursorStack>(FIRST_PAGE);
  const cursor = currentCursor(stack);
  const query = api.classes.members.useQuery(cursor === undefined ? { classId } : { classId, cursor });

  return (
    <div className="flex flex-col gap-6">
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
    </div>
  );
}

function AddMemberForm(props: { readonly classId: string; readonly onAdded: () => void }): ReactElement {
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
      void utils.classes.get.invalidate();
      void utils.classes.list.invalidate();
      void utils.admin.audit.list.invalidate();
      props.onAdded();
    },
    onError: (error) => {
      const code = trpcErrorCode(error);
      const message = describeTrpcError(error);
      // NOT_FOUND / CONFLICT / BAD_REQUEST là phán quyết có chủ đích (không có
      // tài khoản đó, đã ở trong lớp, đó là chủ lớp). Mã khác thì không chắc,
      // và câu dưới cố ý không khẳng định rằng chưa có gì được ghi.
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
        <div className="flex min-w-64 flex-1 flex-col gap-1.5 md:max-w-xl">
          <Label htmlFor="admin-class-add-email">{t('admin.classes.add-email-label')}</Label>
          <Input
            id="admin-class-add-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('admin.classes.add-email-placeholder')}
            maxLength={EMAIL_MAX_LENGTH}
            required
          />
        </div>
        <Button
          type="submit"
          loading={add.isPending}
          disabled={email.trim() === ''}
          iconLeft={<UserPlus aria-hidden="true" />}
        >
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
    return <LedgerSkeleton rows={4} />;
  }

  if (props.error !== null) {
    return (
      <LedgerError
        failure={err('admin.error.class-members', { reason: props.error })}
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
      <EmptyState
        title={t('admin.classes.members-empty-title')}
        description={t('admin.classes.members-empty-body')}
        {...(props.page > 1 ? { action: <FirstPageButton page={props.page} onFirst={props.onFirst} /> } : {})}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
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
      void utils.classes.get.invalidate();
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
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">{member.name}</span>
          <span className="font-mono text-xs text-muted-foreground">{member.email}</span>
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{formatDay(member.joinedAt)}</TableCell>
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
          loss={t('admin.classes.remove-loss')}
          // Bỏ một sinh viên khỏi lớp luôn hợp lệ, nên `null` là câu trả lời
          // đúng chứ không phải một chỗ chưa điền.
          blockedReason={null}
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
    <ScoreboardBody
      rows={query.data?.rows ?? null}
      pending={query.isPending}
      error={query.isError ? describeTrpcError(query.error) : null}
      fetching={query.isFetching}
      onRetry={() => void query.refetch()}
    />
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
    return <LedgerSkeleton rows={4} />;
  }

  if (props.error !== null) {
    const failure = err('admin.error.class-scoreboard', { reason: props.error });
    return (
      <ErrorState
        title={failure.what}
        message={failure.next}
        onRetry={props.onRetry}
        retrying={props.fetching}
        retryLabel={t('admin.reload')}
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
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('admin.classes.score-col-student')}</TableHead>
            <TableHead className="text-right">{t('admin.classes.score-col-attempted')}</TableHead>
            <TableHead className="text-right">{t('admin.classes.score-col-solved')}</TableHead>
            <TableHead className="text-right">{t('admin.classes.score-col-total')}</TableHead>
            <TableHead>{t('admin.classes.score-col-last')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.userId}>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">{row.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{row.email}</span>
                </div>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.attemptedCount}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{row.solvedCount}</TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {row.bestScoreTotal}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {row.lastSubmittedAt === null
                  ? t('admin.classes.never-submitted')
                  : formatMoment(row.lastSubmittedAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <AdminNote>{t('admin.classes.score-note')}</AdminNote>
    </div>
  );
}
