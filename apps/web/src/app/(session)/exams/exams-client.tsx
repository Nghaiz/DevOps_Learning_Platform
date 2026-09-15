'use client';

import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { Clock3, Trophy, ArrowRight } from 'lucide-react';
import { t, type StaticTextKey } from '@devops-platform/copy';
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
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  const items = query.data?.items ?? [];
  const shown = items.filter(
    (item) => filter === 'all' || (filter === 'done' ? item.closed : !item.closed),
  );

  return (
    <section className="practice-exams flex flex-col gap-6">
      <header className="practice-exams-heading">
        <span className="practice-exams-symbol">
          <Trophy size={27} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('exam.title')}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('exam.description')}</p>
        </div>
      </header>
      <div className="practice-game-switch" aria-label={t('exam.filter-label')}>
        {(['all', 'active', 'done'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(FILTER_KEYS[value])}
            {query.isSuccess
              ? ` (${items.filter((item) => value === 'all' || (value === 'done' ? item.closed : !item.closed)).length})`
              : ''}
          </button>
        ))}
      </div>

      {query.isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {query.isError && (
        <ErrorState message={describeTrpcError(query.error)} onRetry={() => void query.refetch()} />
      )}

      {query.data?.items.length === 0 && (
        <EmptyState title={t('exam.empty-title')} description={t('exam.empty-body')} />
      )}

      {query.isSuccess && items.length > 0 && shown.length === 0 && (
        <EmptyState
          title={t('exam.filter-empty-title')}
          description={t('exam.filter-empty-body')}
        />
      )}
      <ul className="practice-exam-grid">
        {shown.map((item) => (
          <li key={item.id}>
            <Card className="practice-exam-card">
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
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock3 size={16} aria-hidden="true" />
                  {t('exam.card-problems', { count: item.problemCodes.length })}
                  {' · '}
                  {t('exam.card-duration', { minutes: item.durationMinutes })}
                </p>
                <Button asChild variant="outline">
                  <Link href={`/exams/${item.id}`}>
                    {t(openKey(item))}
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
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

/**
 * Nhãn ba mục lọc, bảng tra thay vì ba tầng điều kiện trong JSX.
 *
 * `Record<...>` trên đúng miền của `filter`: thêm mục thứ tư vào union mà quên
 * nhãn sẽ đỏ ở đây, chứ không hiện một nút trống.
 */
const FILTER_KEYS = {
  all: 'exam.filter-all',
  active: 'exam.filter-active',
  done: 'exam.filter-done',
} as const satisfies Record<'all' | 'active' | 'done', StaticTextKey>;

/**
 * Nhãn nút mở, ba ca giống hệt `statusKey`.
 *
 * Đọc `closed` của MÁY CHỦ trước, cùng lý do đã ghi ở `statusKey`: một lượt
 * hết giờ mà bỏ dở có `submittedAt = null`, nên suy ở client sẽ mời người ta
 * "tiếp tục làm bài" trên một kỳ thi đã đóng.
 */
function openKey(item: ExamListItem): StaticTextKey {
  if (item.closed) {
    return 'exam.open-result';
  }
  return item.startedAt === null ? 'exam.open' : 'exam.open-continue';
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
