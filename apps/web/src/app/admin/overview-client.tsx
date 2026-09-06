'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@devops-platform/ui';
import { AdminSection } from '../../components/admin/admin-section';
import { HealthPanel } from '../../components/admin/health-panel';
import { describeCapacity, formatFetchedAt } from '../../components/shell/capacity';
import { useCapacity } from '../../components/shell/use-capacity';

/**
 * `/admin` — tổng quan (13.G mục 23).
 *
 * ## Sức chứa đọc từ vỏ ứng dụng, KHÔNG gọi `capacity.get` lần nữa
 *
 * `CapacityProvider` của vỏ (13.B) đã poll 15s một lần và mọi chỗ hiện "còn N
 * chỗ" — badge trên thanh đầu trang, `SessionControls` của C5 — đều đọc chung
 * state đó. Thêm một `useQuery('capacity.get')` ở đây là hai con số khác nhau
 * trên CÙNG một màn hình (hai lượt gọi lệch nhau vài giây là đủ), cộng thêm một
 * lượt gọi cho đúng một câu trả lời.
 *
 * `admin.health` cũng trả `capacity`, và nó cố ý KHÔNG được dùng cho con số
 * "còn N chỗ" ở đây — cùng một lý do. Nó chỉ cấp thứ vỏ không có: `poolFree` /
 * `poolQuarantine` (nội tình pool), hiện trong `HealthPanel` kèm thời điểm đọc
 * của chính nó.
 */
export function AdminOverviewClient(): ReactElement {
  return (
    <AdminSection
      title="Tổng quan"
      description="Sức chứa nền tảng và sức khoẻ các dịch vụ, đọc lúc mở trang."
    >
      <CapacityCard />
      <HealthPanel />
      <Alert>
        <AlertTitle>Mọi hành động quản trị đều được ghi lại</AlertTitle>
        <AlertDescription>
          Đổi vai trò và kết thúc phiên của người khác đều ghi một dòng vào nhật ký, kèm tên người
          bấm.{' '}
          <Link href="/admin/audit" className="underline underline-offset-4">
            Xem nhật ký
          </Link>
          .
        </AlertDescription>
      </Alert>
    </AdminSection>
  );
}

function CapacityCard(): ReactElement {
  const { data, error, loading, refetch } = useCapacity();

  if (data === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sức chứa</CardTitle>
          <CardDescription>
            {/*
              `loading` và `error` là hai chuyện khác nhau và không được gộp:
              "đang đọc" là tạm thời, "đọc hỏng" đòi người trực làm gì đó.
            */}
            {loading
              ? 'Đang đọc sức chứa từ orchestrator…'
              : (error ??
                'Chưa đọc được sức chứa. Bấm Đọc lại; nếu vẫn không có số, xem trạng thái Orchestrator ở bảng sức khoẻ bên dưới.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {loading ? <Skeleton className="h-8 w-40" /> : null}
          <div>
            <Button variant="outline" size="sm" onClick={refetch} loading={loading}>
              Đọc lại
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const reading = describeCapacity(data);
  const at = formatFetchedAt(data.fetchedAt);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Sức chứa</CardTitle>
          <CardDescription>
            {at === null ? 'Thời điểm đọc không rõ.' : `Đọc lúc ${at}, tự làm mới mỗi 15 giây.`}
          </CardDescription>
        </div>
        <Badge
          variant={
            reading.tone === 'full' ? 'destructive' : reading.tone === 'low' ? 'warning' : 'success'
          }
        >
          {reading.label}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-foreground">{reading.detail}</p>
        {/*
          Lỗi ở lượt đọc GẦN NHẤT khi vẫn còn số cũ: `use-capacity.tsx` cố ý giữ
          `data` qua một lượt hỏng để badge không nhấp nháy. Số cũ mà không nói
          là số cũ thì đúng là thứ `green-that-proves-nothing` cảnh báo.
        */}
        {error === null ? null : (
          <p role="status" className="text-sm text-muted-foreground">
            Lượt đọc gần nhất lỗi ({error}) — số ở trên có thể đã cũ.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
