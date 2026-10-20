'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Empty,
  EmptyArt,
  ErrorBlock,
  Icon,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Pill,
  Row,
  RowList,
  RowsSkeleton,
  Section,
  type IconName,
} from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import { api } from '../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { formatWhen } from '../../lib/format-moment';
import { useCapacity } from '../shell/use-capacity';
import { describeEndSessionError, describeMySessionStatus, describeSessionExpiry } from './session-summary';

type ContentKind = 'lesson' | 'lab' | 'playground';

const KIND: Record<ContentKind, { icon: IconName; label: () => string; href: (id: string) => string; section: string }> = {
  lesson: { icon: 'book', label: () => t('me.machines.kind.lesson'), href: (id) => `/lessons/${encodeURIComponent(id)}`, section: 'learn' },
  lab: { icon: 'flask', label: () => t('me.machines.kind.lab'), href: (id) => `/labs/${encodeURIComponent(id)}`, section: 'practice' },
  playground: {
    icon: 'sandbox',
    label: () => t('me.machines.kind.playground'),
    href: (id) => `/playgrounds/${encodeURIComponent(id)}`,
    section: 'practice',
  },
};

/**
 * Máy sandbox đang chạy của người dùng. "Mở lại" đưa về đúng trang bài, nơi máy được
 * gắn lại thay vì tạo máy mới; "Tắt máy" trả chỗ cho cụm sau một bước xác nhận.
 */
export function RunningMachines({ headingLevel = 2 }: { readonly headingLevel?: 2 | 3 }) {
  const sessions = api.me.activeSessions.useQuery({});
  const utils = api.useUtils();
  const capacity = useCapacity();
  const [pending, setPending] = useState<{ id: string; openedAt: string } | null>(null);
  const [endError, setEndError] = useState<ErrorEntry | null>(null);
  const endSession = api.me.endSession.useMutation({
    onSuccess: async () => {
      setPending(null);
      setEndError(null);
      capacity.refetch();
      await utils.me.activeSessions.invalidate();
    },
    onError: (error) => setEndError(describeEndSessionError(trpcErrorCode(error), describeTrpcError(error))),
  });
  const now = Date.now();
  const live = sessions.data?.items.filter((session) => describeMySessionStatus(session.status).live) ?? [];

  return (
    <Section title={t('me.machines.title')} description={t('me.machines.description')} level={headingLevel} icon="server">
      {sessions.isPending ? <RowsSkeleton rows={2} label={t('me.machines.loading')} /> : null}
      {sessions.isError ? (
        <ErrorBlock
          title={err('me.error.sessions-load', { reason: describeTrpcError(sessions.error) }).what}
          retryLabel={t('common.action.retry')}
          retrying={sessions.isFetching}
          onRetry={() => void sessions.refetch()}
        >
          {err('me.error.sessions-load', { reason: describeTrpcError(sessions.error) }).next}
        </ErrorBlock>
      ) : null}
      {sessions.isSuccess && live.length === 0 ? (
        <Empty size="sm" art={<EmptyArt kind="nothing" width={72} />} title={t('me.machines.empty-title')}>
          {t('me.machines.empty-body')}
        </Empty>
      ) : null}
      {live.length > 0 ? (
        <RowList label={t('me.machines.title')}>
          {live.map((session) => {
            const status = describeMySessionStatus(session.status);
            const opened = formatWhen(session.createdAt);
            const kind = session.content === null ? null : KIND[session.content.kind];
            const title = session.content?.title ?? t('me.machines.untitled', { time: opened });
            return (
              <Row
                key={session.id}
                leading={
                  <span data-section={kind?.section} className="grid place-items-center text-acc-ink">
                    <Icon name={kind?.icon ?? 'terminal'} size={26} tint="acc" />
                  </span>
                }
                link={
                  session.content === null || kind === null ? (
                    <Link href={`/session/${encodeURIComponent(session.id)}/terminal`}>{title}</Link>
                  ) : (
                    <Link href={kind.href(session.content.id)}>{title}</Link>
                  )
                }
                title={title}
                description={`${kind === null ? '' : `${kind.label()}. `}${t('me.machines.opened', { time: opened })}, ${describeSessionExpiry(session.expiresAt, now)}.`}
                meta={
                  <Pill tone={status.variant} dot live={status.live}>
                    {status.label}
                  </Pill>
                }
                trailing={
                  <div className="flex items-center gap-1">
                    {session.content === null || kind === null ? null : (
                      <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
                        <Link href={kind.href(session.content.id)}>{t('me.machines.resume')}</Link>
                      </Button>
                    )}
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton icon="more" label={t('common.action.actions')} size="icon-sm" />
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon="terminal" asChild>
                          <Link href={`/session/${encodeURIComponent(session.id)}/terminal`}>{t('me.machines.terminal')}</Link>
                        </MenuItem>
                        <MenuItem icon="power" tone="danger" onSelect={() => setPending({ id: session.id, openedAt: opened })}>
                          {t('me.machines.end')}
                        </MenuItem>
                      </MenuContent>
                    </Menu>
                  </div>
                }
              />
            );
          })}
        </RowList>
      ) : null}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
            setEndError(null);
          }
        }}
        title={t('me.machines.confirm-title')}
        body={pending === null ? undefined : t('me.machines.confirm-body', { time: pending.openedAt })}
        error={endError === null ? undefined : `${endError.what} ${endError.next}`}
        confirmLabel={t('me.machines.end')}
        cancelLabel={t('me.machines.confirm-cancel')}
        confirming={endSession.isPending}
        onConfirm={() => {
          if (pending !== null) endSession.mutate({ sessionId: pending.id });
        }}
      />
    </Section>
  );
}
