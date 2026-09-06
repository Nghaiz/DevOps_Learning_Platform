import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardDescription, CardTitle, Skeleton } from '@devops-platform/ui';

/** Lưới thẻ. `<ul role="list">` tường minh vì `list-style: none` của Tailwind gỡ vai trò list ở Safari/VoiceOver. */
export function CatalogGrid({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {children}
    </ul>
  );
}

/**
 * Một thẻ danh mục — cả thẻ là một link.
 *
 * `badge` nằm cạnh tiêu đề, `meta` là hàng nhãn dưới đáy (bị đẩy xuống bằng
 * `mt-auto` để mọi thẻ trong một hàng có đáy thẳng nhau dù mô tả dài ngắn khác
 * nhau).
 */
export function CatalogCard(props: {
  readonly href: string;
  readonly title: string;
  readonly description: string | null;
  readonly badge?: ReactNode;
  readonly meta?: ReactNode;
}): ReactElement {
  return (
    <li>
      <Link
        href={props.href}
        className="block h-full rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Card className="flex h-full flex-col gap-3 hover:border-input">
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{props.title}</CardTitle>
            {props.badge}
          </div>
          {props.description !== null && <CardDescription>{props.description}</CardDescription>}
          {props.meta !== undefined && <div className="mt-auto flex flex-wrap gap-2">{props.meta}</div>}
        </Card>
      </Link>
    </li>
  );
}

/**
 * Khung chờ tải.
 *
 * MỘT `role="status"` ở container, không phải một nhãn trên mỗi khối —
 * `Skeleton` cố ý `aria-hidden` (xem chú thích của nó) chính là để chỗ này
 * phát đúng một thông báo thay vì sáu.
 */
export function CatalogGridSkeleton({ count = 6 }: { readonly count?: number }): ReactElement {
  return (
    <div role="status" aria-live="polite" aria-label="Đang tải danh sách" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_unused, index) => (
        <Card key={index} className="flex h-full flex-col gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <div className="mt-auto flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}
