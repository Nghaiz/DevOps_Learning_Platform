'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { BackLink, ErrorBlock, Skeleton } from '@devops-platform/ds';

/**
 * Khung toàn màn của khu thực hành: thanh trên, dải thông báo, rồi hai khoang chiếm
 * trọn phần còn lại. Trang là immersive (không có vỏ ứng dụng), nên gốc tự lấy `h-dvh`.
 */
export function PracticeFrame({
  bar,
  notices,
  children,
}: {
  readonly bar: ReactNode;
  readonly notices?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-canvas text-ink">
      {bar}
      {notices}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** Khung chờ có đúng hình của trang thật: thanh trên, khoang đọc, khoang máy tối. */
export function PracticeSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div role="status" aria-busy="true" className="flex h-dvh flex-col bg-canvas">
      <span className="sr-only">{label}</span>
      <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-rule bg-paper px-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-64 max-w-[40vw]" />
        <Skeleton className="ml-auto h-7 w-28" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[40%] flex-col gap-4 border-r border-rule p-6 md:flex">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-9/12" />
        </div>
        <div className="dark flex-1 bg-canvas" />
      </div>
    </div>
  );
}

/** Không mở được nội dung: nói vì sao, cho thử lại, và đường về danh sách. */
export function PracticeError({
  title,
  message,
  backHref,
  backLabel,
  onRetry,
  retrying = false,
}: {
  readonly title: string;
  readonly message: string;
  readonly backHref: string;
  readonly backLabel: string;
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
}): ReactElement {
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-lg flex-col gap-4">
        <BackLink asChild>
          <Link href={backHref}>{backLabel}</Link>
        </BackLink>
        <ErrorBlock
          title={title}
          {...(onRetry === undefined ? {} : { onRetry, retryLabel: t('common.action.retry'), retrying })}
        >
          {message}
        </ErrorBlock>
      </div>
    </div>
  );
}
