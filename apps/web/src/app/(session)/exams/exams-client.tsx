'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@devops-platform/ui';

import { api } from '../../../lib/trpc-react';
import { describeTrpcError } from '../../../lib/trpc';

/**
 * `/exams` (§18.G.4) , danh sách kỳ thi của người học.
 *
 * ## Không phân trang, và đó là một giả định phải nói ra
 *
 * `examSitting.list` trả hết một lượt. Một sinh viên ở vài lớp có vài kỳ thi;
 * phân trang ở đây sẽ là hạ tầng cho một vấn đề chưa tồn tại. Nếu một ngày một
 * tài khoản có hàng trăm kỳ thi thì ĐÂY là chỗ thêm keyset, và khoá sắp xếp
 * hiện tại (`created_at`) không duy nhất nên nó sẽ phải kèm `id` phá hoà.
 *
 * ## Trạng thái đọc `closed` của MÁY CHỦ, không suy ở client
 *
 * Lý do đầy đủ ở chú thích của `statusKey` dưới cùng file. Ngắn gọn: một lượt
 * hết giờ mà bỏ dở có `submittedAt = null`, nên mọi phép suy ở client sẽ hiện
 * "Đang làm" cho một bài đã đóng.
 */
export function ExamsClient(): ReactElement {
  const query = api.examSitting.list.useQuery();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('exam.title')}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t('exam.description')}</p>
      </div>

      {query.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {query.isError && (
        <ErrorState
          message={describeTrpcError(query.error)}
          onRetry={() => void query.refetch()}
        />
      )}

      {query.data?.items.length === 0 && (
        <EmptyState title={t('exam.empty-title')} description={t('exam.empty-body')} />
      )}

      <ul className="flex flex-col gap-3">
        {(query.data?.items ?? []).map((item) => (
          <li key={item.id}>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{item.title}</CardTitle>
                  <Badge variant={statusVariant(item)} icon={null}>
                    {t(statusKey(item))}
                  </Badge>
                </div>
                <CardDescription>{t('exam.card-class', { name: item.className })}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {t('exam.card-problems', { count: item.problemCodes.length })}
                  {' · '}
                  {t('exam.card-duration', { minutes: item.durationMinutes })}
                </p>
                <Button asChild variant="outline">
                  <Link href={`/exams/${item.id}`}>{t('exam.open')}</Link>
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ExamListItem {
  readonly startedAt: string | null;
  readonly closed: boolean;
}

/*
 * ⛔ "Đã xong" đọc `closed` của MÁY CHỦ, không suy từ `submittedAt`.
 *
 * Một lượt hết giờ mà bỏ dở có `submittedAt = null`, nên một phép suy ở client
 * sẽ hiện "Đang làm" mãi cho tới khi người ta mở chính kỳ thi đó. Suy cho đúng
 * thì cần hạn, mà hạn cần thời lượng ẢNH CHỤP của từng lượt cộng `closes_at` ,
 * tức chép một phép tính của máy chủ sang đây. Máy chủ tính sẵn và gửi kèm.
 */
function statusKey(item: ExamListItem) {
  if (item.closed) {
    return 'exam.status-done' as const;
  }
  return item.startedAt === null
    ? ('exam.status-not-started' as const)
    : ('exam.status-in-progress' as const);
}

function statusVariant(item: ExamListItem) {
  if (item.closed) {
    return 'secondary' as const;
  }
  return item.startedAt === null ? ('outline' as const) : ('default' as const);
}
