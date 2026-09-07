'use client';

import { useState, type ReactElement } from 'react';
import {
  Badge,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../lib/trpc';
import { describeProfileCapacity, useCapacity } from '../shell';
import {
  describeEndSessionError,
  describeMySessionStatus,
  describeSessionExpiry,
  shortSessionId,
} from './session-summary';
import { formatMoment } from '../../lib/format-moment';
import { useCursorPages } from './use-cursor-pages';
import { describeEmptyPage, shouldShowPager, type HistoryPageState } from './history-page-notice';

/**
 * "Phiên đang mở" — `me.activeSessions` + kết thúc sớm bằng `me.endSession`.
 *
 * ## Kết thúc một phiên GIẢI PHÓNG một chỗ, nên con số chỗ phải đổi theo
 *
 * `me.endSession` gọi `ReapSession`, orchestrator gỡ pod khỏi `pool:claimed`,
 * và đó chính là mẫu số của `capacity.get`. Để lại "còn 4 chỗ" sau khi vừa trả
 * một chỗ là hiện một con số đã sai ngay lúc người dùng nhìn nó.
 *
 * ⛔ Nhưng KHÔNG poll `capacity.get` lần thứ hai ở đây: `CapacityProvider` của
 * vỏ đã giữ đúng một nguồn cho cả cây (thanh đầu trang, `SessionControls`, và
 * chỗ này), và bốn nơi tự poll riêng là bốn con số lệch nhau trên cùng một màn
 * hình. Đường đúng là `useCapacity().refetch()` — đọc lại CÙNG state đó.
 *
 * ## Không có máy trạng thái WebSocket nào ở đây
 *
 * Đây là danh sách phiên phía SERVER (`ListSessions`), không phải một kết nối
 * đang mở. `SessionControls`/`TerminalPane` của C5 là UI phiên duy nhất có WS,
 * và trang này cố ý không chạm tới chúng.
 */
export function ActiveSessions(): ReactElement {
  const pages = useCursorPages();
  const sessions = api.me.activeSessions.useQuery(
    pages.cursor === undefined ? {} : { cursor: pages.cursor },
  );
  const utils = api.useUtils();
  const capacity = useCapacity();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const endSession = api.me.endSession.useMutation({
    onSuccess: async () => {
      setPendingId(null);
      setEndError(null);
      // Về trang 1 TRƯỚC khi nạp lại: cursor là id của phiên cuối trang trước,
      // và phiên đó có thể chính là phiên vừa bị thu hồi. Giữ nó là hỏi server
      // một câu về một hàng không còn tồn tại.
      pages.goFirst();
      // Một chỗ vừa được trả lại — số "còn N chỗ" ở thanh đầu trang và ở đây
      // phải đổi ngay, không chờ hết nhịp 15s của provider.
      capacity.refetch();
      await utils.me.activeSessions.invalidate();
    },
    onError: (error) => {
      setEndError(describeEndSessionError(trpcErrorCode(error), describeTrpcError(error)));
    },
  });

  /*
    Trần đọc từ ResourceQuota theo profile (`5135cf9`), không còn
    `softCapacity` viết tay. Không truyền profile ⇒ profile MẶC ĐỊNH: trang này
    liệt kê phiên của mọi loại bài nên không có một profile nào để nói riêng, và
    câu chữ của vỏ đã tự thu hẹp về "cho bài thường".

    Hai ca `null` gộp làm một ở đây, có chủ ý: chưa có payload (`capacity.data
    === null`) và có payload nhưng quota đọc lỗi đều nghĩa là ta KHÔNG biết —
    khác nhau ở nguyên nhân, giống nhau ở việc không được bịa một con số.
  */
  const reading = capacity.data === null ? null : describeProfileCapacity(capacity.data);
  const capacityUnknown = capacity.data !== null && reading === null;
  const now = Date.now();

  /**
   * Cùng luật với ba tab lịch sử (`history-page-notice.ts`): một trang rỗng
   * KHÔNG được nuốt pager. `ListSessions` không lọc dòng nào nên `skipped` luôn
   * 0 ở đây — nhưng ca "đang ở trang 2, vừa kết thúc nốt phiên cuối" thì trang
   * rỗng mà vẫn cần đường VỀ trang đầu, và luật cũ đã cắt mất đường đó.
   */
  const shape: HistoryPageState = {
    page: pages.page,
    itemCount: sessions.data?.items.length ?? 0,
    hasNext: sessions.data?.nextCursor != null,
  };
  const emptyNotice = describeEmptyPage(shape, {
    title: 'Bạn không có phiên nào đang mở',
    description:
      'Phiên được tạo khi bạn bắt đầu một bài học, lab hoặc playground, và tự hết hạn khi tới giờ.',
  });

  return (
    <section aria-labelledby="phien-dang-mo" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="phien-dang-mo" className="text-lg font-medium text-foreground">
          Phiên đang mở
        </h2>
        {/*
          `null` = CHƯA BIẾT, khác hẳn "biết là đã đầy" (xem `readProfileCapacity`).
          Chưa có payload thì không vẽ gì; có payload mà quota đọc lỗi thì NÓI RA
          là chưa rõ — ⛔ không lấp bằng `softCapacity`, chính con số đó đã in
          "Còn 14 chỗ" trong lúc server trả 429.
        */}
        {reading !== null && (
          <Badge variant={capacityBadgeVariant(reading.tone)} title={reading.detail}>
            {reading.label}
          </Badge>
        )}
        {capacityUnknown && (
          <Badge
            variant="outline"
            title="Máy chủ chưa đọc được hạn mức của cụm, nên không nói được còn mấy chỗ."
          >
            Chưa rõ sức chứa
          </Badge>
        )}
      </div>

      {endError !== null && (
        <ErrorState
          title="Không kết thúc được phiên"
          message={endError}
          onRetry={() => {
            setEndError(null);
            void sessions.refetch();
          }}
        />
      )}

      {sessions.isPending && <Skeleton className="h-32 w-full" />}

      {sessions.isError && (
        <ErrorState
          title="Không tải được danh sách phiên"
          message={describeTrpcError(sessions.error)}
          onRetry={() => void sessions.refetch()}
          retrying={sessions.isFetching}
        />
      )}

      {sessions.isSuccess && (
        <>
          {emptyNotice !== null ? (
            <EmptyState title={emptyNotice.title} description={emptyNotice.description} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phiên</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Mở lúc</TableHead>
                  <TableHead>Hạn</TableHead>
                  <TableHead>
                    <span className="sr-only">Hành động</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.data.items.map((session) => {
                  const status = describeMySessionStatus(session.status);
                  return (
                    <TableRow key={session.id}>
                      <TableCell className="font-mono text-xs">{session.id}</TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatMoment(session.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {describeSessionExpiry(session.expiresAt, now)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEndError(null);
                            setPendingId(session.id);
                          }}
                        >
                          Kết thúc
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {shouldShowPager(shape) && (
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
        </>
      )}

      <Dialog
        open={pendingId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Kết thúc phiên {pendingId === null ? '' : shortSessionId(pendingId)}?
            </DialogTitle>
            <DialogDescription>
              Máy sandbox bị thu hồi ngay và mọi thứ chưa lưu trong đó sẽ mất. Chỗ này được trả lại
              cho lớp, và bạn mở phiên mới bất cứ lúc nào.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Để nguyên</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={endSession.isPending}
              onClick={() => {
                if (pendingId !== null) {
                  endSession.mutate({ sessionId: pendingId });
                }
              }}
            >
              Kết thúc phiên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Màu badge sức chứa — cùng ba mức `CapacityTone` của vỏ, không tự đặt ngưỡng mới. */
function capacityBadgeVariant(tone: 'ok' | 'low' | 'full'): 'secondary' | 'warning' | 'destructive' {
  if (tone === 'full') {
    return 'destructive';
  }
  return tone === 'low' ? 'warning' : 'secondary';
}
