'use client';

import { useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import type { inferRouterOutputs } from '@trpc/server';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  ErrorState,
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
import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';
import { AdminNote, AdminSection } from '../../../components/admin/admin-section';
import { ConfirmDialog } from '../../../components/admin/confirm-dialog';
import {
  CONTENT_STATE_FILTERS,
  contentStateVariant,
  describeContentKind,
  describeContentState,
  filterContentByState,
  orderContent,
  planArchive,
} from '../../../components/admin/content-row';
import { formatMoment } from '../../../components/admin/session-row';

type ContentItem = inferRouterOutputs<AppRouter>['authoring']['list'][number];

/**
 * `/admin/content` (13.G) — nội dung của MỌI người soạn, xem và lưu trữ được.
 *
 * ## Dùng lại `authoring.*`, không có procedure quản trị riêng
 *
 * `authorProcedure` đã cho `admin` qua; `listAuthoredBy(db, null)` với vai trò
 * admin trả bài của MỌI người ở MỌI trạng thái; `assertContentOwner` bỏ qua
 * phép kiểm chủ sở hữu khi vai trò là `admin`. Một cặp `admin.content.*` song
 * song chỉ để đổi tên là thêm một đường ghi thứ hai lên cùng một bảng — tức
 * thêm một chỗ để hai đường trôi khỏi nhau. Hợp đồng C4 nói thẳng: "Không proc
 * mới."
 *
 * ## Lọc + sắp ở client, có chủ ý
 *
 * `authoring.list` là query KHÔNG tham số và trả về CẢ danh sách (không cursor).
 * Nên lọc ở client không phải là "trang vơi bất định" như bẫy của 13.C — ở đây
 * không có trang nào để vơi. Nếu về sau `authoring.list` có phân trang thật thì
 * bộ lọc PHẢI đi xuống server cùng lúc; ghi lại ở đây để lần đó không ai quên.
 */
export function AdminContentClient(): ReactElement {
  const [state, setState] = useState<string>('all');
  const query = api.authoring.list.useQuery();

  const rows = useMemo(
    () => orderContent(filterContentByState(query.data ?? [], state)),
    [query.data, state],
  );

  return (
    <AdminSection
      title="Nội dung"
      description="Bài học, lab và playground của mọi người soạn — mọi trạng thái, kể cả nháp."
    >
      {/*
        Lưu trữ KHÔNG ghi `admin_audit`, và điều đó phải nói ra chứ không giấu.
        `authoring.archive` là procedure của người soạn (`authorProcedure`); nó
        không gọi `writeAdminAudit`, nên hành động này không xuất hiện ở
        `/admin/audit`. Một trang quản trị ngụ ý "mọi thứ ở đây đều được ghi"
        trong khi một nút thì không là đúng loại khẳng định quá tay mà AC 13.G
        mục 24 muốn tránh.
      */}
      <Alert variant="warning">
        <AlertTitle>Lưu trữ không ghi vào nhật ký quản trị</AlertTitle>
        <AlertDescription>
          Nút Lưu trữ đi qua đường của người soạn bài, không phải đường quản trị, nên nó không tạo
          dòng nào ở trang Nhật ký. Hai hành động có ghi nhật ký là đổi vai trò và kết thúc phiên.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-52 flex-col gap-1.5">
          <Label htmlFor="admin-content-state">Trạng thái</Label>
          <Select value={state} onValueChange={setState}>
            <SelectTrigger id="admin-content-state">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_STATE_FILTERS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === 'all' ? 'Tất cả' : describeContentState(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} loading={query.isFetching}>
          Đọc lại
        </Button>
      </div>

      {query.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : query.isError ? (
        <ErrorState
          title="Không tải được danh sách nội dung"
          message={`${describeTrpcError(query.error)} Bấm Thử lại; nếu vẫn lỗi, kiểm kết nối tới cơ sở dữ liệu.`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={state === 'all' ? 'Chưa có nội dung nào' : 'Không có bài nào ở trạng thái này'}
          description={
            state === 'all'
              ? 'Chưa ai soạn bài trên nền tảng. Nội dung nướng sẵn trong image không nằm ở bảng này.'
              : 'Đổi bộ lọc trạng thái để xem các bài khác.'
          }
          action={
            state === 'all' ? (
              <Button asChild variant="outline">
                <Link href="/author">Mở trang soạn bài</Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setState('all')}>
                Xem tất cả
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bài</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Người soạn</TableHead>
                <TableHead>Sửa gần nhất</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <ContentRow key={item.id} item={item} />
              ))}
            </TableBody>
          </Table>

          {/*
            `authoring.list` trả CẢ danh sách nên con số này là tổng thật — khác
            hẳn bảng người dùng và bảng phiên (có cursor), nơi đếm trên một trang
            đã cắt sẽ là một khẳng định sai về cả hệ thống.
          */}
          <AdminNote>
            {state === 'all'
              ? `${rows.length} bài, đây là toàn bộ danh sách (không phân trang).`
              : `${rows.length} bài khớp bộ lọc, trong tổng ${query.data.length} bài.`}
          </AdminNote>
        </div>
      )}
    </AdminSection>
  );
}

function ContentRow({ item }: { readonly item: ContentItem }): ReactElement {
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { toast } = useToast();
  const utils = api.useUtils();

  const plan = planArchive({ title: item.title, kind: item.kind, state: item.state });

  const archive = api.authoring.archive.useMutation({
    onSuccess: () => {
      setOpen(false);
      setServerError(null);
      toast({
        variant: 'success',
        title: 'Đã lưu trữ',
        description: `"${item.title}" không còn hiện trong danh mục người học. Tiến độ đã ghi vẫn giữ nguyên.`,
      });
      void utils.authoring.list.invalidate();
    },
    onError: (error) => {
      setServerError(
        `${describeTrpcError(error)} Đọc lại danh sách để xem trạng thái hiện tại trước khi thử lại.`,
      );
    },
  });

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{item.title}</span>
          <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
          {/*
            `publishError` là kết quả CHẠY THỬ THẬT của P9 (setup + verify từng
            bước), không phải một cờ. Giấu nó đi là biến một trang quản trị
            thành một dấu tích.
          */}
          {item.publishError === null ? null : (
            <span className="text-xs text-destructive">
              Xuất bản lỗi: {item.publishError}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm">{describeContentKind(item.kind)}</TableCell>
      <TableCell>
        <Badge variant={contentStateVariant(item.state)}>{describeContentState(item.state)}</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">{item.authorId}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatMoment(item.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setServerError(null);
            setOpen(true);
          }}
        >
          Lưu trữ
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
          confirming={archive.isPending}
          onConfirm={() => archive.mutate({ id: item.id })}
        />
      </TableCell>
    </TableRow>
  );
}
