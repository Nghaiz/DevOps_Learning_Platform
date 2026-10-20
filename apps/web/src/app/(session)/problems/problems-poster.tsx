import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { PageHeader, RowsSkeleton, Skeleton } from '@devops-platform/ds';

/**
 * Đầu trang `/problems`. Tĩnh, không đọc URL, nên nó render ngay ở máy chủ và KHÔNG
 * nằm trong ranh giới `<Suspense>`: người dùng thấy tiêu đề ngay từ byte đầu, chỉ phần
 * danh sách chờ.
 */
export function ProblemsPoster(): ReactElement {
  return <PageHeader title={t('problem.oj.title')} lead={t('problem.oj.lead')} />;
}

/** Khung chờ của phần client, cùng HÌNH với thứ sẽ hiện: thanh chọn game, ô tìm, các dòng bảng. */
export function ProblemsSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-6 pb-14">
      <div aria-hidden className="flex flex-col gap-4 border-b border-rule pb-6">
        <div className="flex gap-2">
          <Skeleton className="h-11 w-32" />
          <Skeleton className="h-11 w-36" />
          <Skeleton className="h-11 w-24" />
          <Skeleton className="h-11 w-24" />
        </div>
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-8 w-full max-w-2xl" />
      </div>
      <RowsSkeleton rows={8} label={t('problem.oj.loading')} />
    </div>
  );
}
