'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { SquareTerminal } from 'lucide-react';
import { err, t } from '@devops-platform/copy';
import type { ErrorEntry } from '@devops-platform/copy/types';
import {
  Button,
  CursorPager,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  StatusDot,
} from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { formatMoment } from '../../lib/format-moment';
import { Board, BoardSkeleton, staggerStyle } from '../kit';
import { useCapacity } from '../shell';
import { describeEndSessionError, describeMySessionStatus, describeSessionExpiry } from './session-summary';
import { useCursorPages } from './use-cursor-pages';
import { describeEmptyPage, shouldShowPager, type HistoryPageState } from './history-page-notice';

interface PendingEnd {
  readonly id: string;
  readonly openedAt: string;
}

/**
 * "Phiên đang mở": `me.activeSessions` trên bảng tuyến, kết thúc sớm bằng
 * `me.endSession` sau một hộp xác nhận.
 *
 * ## Đường "mở lại" chỉ có terminal, và đó là giới hạn của dữ liệu
 *
 * `JsonSession` không mang bài học, lab hay sân chơi nào đã mở phiên (chỉ id,
 * trạng thái, pod, mốc giờ). Liên kết duy nhất nói thật là `/session/<id>/terminal`,
 * cửa sổ terminal gắn vào ĐÚNG máy đó. Trỏ sang `/labs/<id>` sẽ mở một lần thử
 * MỚI chứ không nối lại phiên này.
 *
 * ## Id phiên không hiện ra màn hình
 *
 * Mỗi dòng gọi tên bằng mốc giờ mở máy; id chỉ nằm trong `href` và trong đối số
 * của `endSession`.
 *
 * ## Kết thúc phiên trả một chỗ, nên số chỗ ở thanh đầu trang phải đổi theo
 *
 * `useCapacity().refetch()` đọc lại CÙNG nguồn mà vỏ ứng dụng giữ, không poll
 * `capacity.get` lần thứ hai.
 */
export function ActiveSessions(): ReactElement {
  const pages = useCursorPages();
  const sessions = api.me.activeSessions.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });
  const utils = api.useUtils();
  const capacity = useCapacity();

  const [pending, setPending] = useState<PendingEnd | null>(null);
  const [endError, setEndError] = useState<ErrorEntry | null>(null);

  const endSession = api.me.endSession.useMutation({
    onSuccess: async () => {
      setPending(null);
      setEndError(null);
      // Về trang 1 TRƯỚC khi nạp lại: cursor có thể chính là phiên vừa bị thu hồi.
      pages.goFirst();
      capacity.refetch();
      await utils.me.activeSessions.invalidate();
    },
    onError: (error) => {
      setPending(null);
      setEndError(describeEndSessionError(trpcErrorCode(error), describeTrpcError(error)));
    },
  });

  const now = Date.now();
  const shape: HistoryPageState = {
    page: pages.page,
    itemCount: sessions.data?.items.length ?? 0,
    hasNext: sessions.data?.nextCursor != null,
  };
  const emptyNotice = describeEmptyPage(shape, {
    title: t('me.sessions.empty-title'),
    description: t('me.sessions.empty-description'),
  });

  return (
    <div className="flex flex-col gap-4">
      {endError !== null && (
        <ErrorState
          title={endError.what}
          message={endError.next}
          onRetry={() => {
            setEndError(null);
            void sessions.refetch();
          }}
        />
      )}

      {sessions.isPending && <BoardSkeleton rows={2} label={t('me.sessions.loading')} />}

      {sessions.isError && (
        <SessionsLoadError
          error={sessions.error}
          retrying={sessions.isFetching}
          onRetry={() => void sessions.refetch()}
        />
      )}

      {sessions.isSuccess &&
        (emptyNotice !== null ? (
          <EmptyState title={emptyNotice.title} description={emptyNotice.description} />
        ) : (
          <Board label={t('me.sessions.board')}>
            {sessions.data.items.map((session, order) => {
              const status = describeMySessionStatus(session.status);
              const openedAt = formatMoment(session.createdAt);
              return (
                <li
                  key={session.id}
                  className="stagger animate-rise border-b border-border last:border-b-0"
                  style={staggerStyle(order)}
                >
                  <div className="flex flex-col gap-4 px-2 py-5 md:flex-row md:items-center md:px-4">
                    <span className="w-10 shrink-0 font-mono text-sm text-muted-foreground tabular-nums">
                      {String(order + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block type-title">{t('me.sessions.row-title', { time: openedAt })}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-2 text-foreground">
                          <StatusDot tone={status.live ? 'live' : 'idle'} />
                          {status.label}
                        </span>
                        <span className="font-mono tabular-nums">
                          {describeSessionExpiry(session.expiresAt, now)}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-wrap gap-2">
                      {status.live && (
                        <Button asChild variant="ink">
                          <Link href={`/session/${encodeURIComponent(session.id)}/terminal`}>
                            <SquareTerminal aria-hidden="true" />
                            {t('me.sessions.resume')}
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEndError(null);
                          setPending({ id: session.id, openedAt });
                        }}
                      >
                        {t('me.sessions.end')}
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </Board>
        ))}

      {sessions.isSuccess && shouldShowPager(shape) && (
        <CursorPager
          hasNext={sessions.data.nextCursor !== null}
          onNext={() => {
            pages.goNext(sessions.data.nextCursor);
          }}
          onReset={pages.goFirst}
          page={pages.page}
          loading={sessions.isFetching}
        />
      )}

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('me.sessions.confirm-title', { time: pending?.openedAt ?? '' })}</DialogTitle>
            <DialogDescription>{t('me.sessions.confirm-description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t('me.sessions.confirm-keep')}</Button>
            </DialogClose>
            {/* `destructive` tự gắn icon cảnh báo: màu đỏ một mình không đủ phân biệt. */}
            <Button
              variant="destructive"
              loading={endSession.isPending}
              onClick={() => {
                if (pending !== null) {
                  endSession.mutate({ sessionId: pending.id });
                }
              }}
            >
              {t('me.sessions.confirm-end')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionsLoadError(props: {
  readonly error: unknown;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}): ReactElement {
  const entry = err('me.error.sessions-load', { reason: describeTrpcError(props.error) });
  return <ErrorState title={entry.what} message={entry.next} onRetry={props.onRetry} retrying={props.retrying} />;
}
