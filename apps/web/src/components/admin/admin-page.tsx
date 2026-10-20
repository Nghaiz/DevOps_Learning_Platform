import type { ReactElement, ReactNode } from 'react';
import { t, type ErrorEntry } from '@devops-platform/copy';
import Link from 'next/link';
import { BackLink, Button, ErrorBlock, Page, PageHeader, Pager, RowsSkeleton } from '@devops-platform/ds';

/**
 * Thanh phân trang theo con trỏ của các bảng quản trị: trang đầu, trang trước, trang sau.
 * Nút nào không làm được thì khoá chứ không biến mất, để hàng nút không nhảy chỗ.
 */
export function AdminPager(props: {
  readonly page: number;
  readonly hasNext: boolean;
  readonly loading: boolean;
  readonly onNext: () => void;
  readonly onFirst: () => void;
  /** Lùi một trang. Thiếu thì chỉ còn "Về đầu" (bảng không giữ ngăn xếp con trỏ). */
  readonly onPrevious?: () => void;
}): ReactElement {
  const back = props.page > 1;
  return (
    <Pager
      status={t('common.pager.page', { page: props.page })}
      previousLabel={t('common.pager.prev')}
      nextLabel={t('common.pager.next')}
      firstLabel={t('common.pager.first')}
      loading={props.loading}
      onFirst={back ? props.onFirst : undefined}
      onPrevious={back ? (props.onPrevious ?? props.onFirst) : undefined}
      onNext={props.hasNext ? props.onNext : undefined}
    />
  );
}

/**
 * Khung của một màn quản trị.
 *
 * ⛔ KHÔNG dựng `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang
 * (`components/session/landmark-contract.test.ts` gác điều này). Mỗi màn đúng một `<h1>`,
 * do `PageHeader` render.
 *
 * Các trang con của Quản trị nằm trên thanh mục con của vỏ (dưới thanh điều hướng trên
 * cùng), nên khung này chỉ còn đầu trang và nội dung.
 */
export function AdminPage(props: {
  readonly title: string;
  readonly lead: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Page className="pb-16">
      <PageHeader title={props.title} lead={props.lead} {...(props.aside === undefined ? {} : { actions: props.aside })} />
      {props.children}
    </Page>
  );
}

/**
 * Khung của một trang chi tiết (một lớp, một kỳ thi): liên kết quay về mục cha, tiêu
 * đề, trạng thái và thao tác. Độ sâu tối đa là hai tầng, nên một liên kết quay lại là đủ.
 */
export function AdminDetailPage(props: {
  readonly crumbs: readonly { readonly href?: string; readonly label: string }[];
  readonly title: string;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const parent = [{ href: '/admin', label: t('admin.crumb.root') }, ...props.crumbs]
    .reverse()
    .find((crumb) => crumb.href !== undefined);
  return (
    <Page className="pb-16">
      <PageHeader
        title={props.title}
        {...(parent?.href === undefined
          ? {}
          : {
              back: (
                <BackLink asChild>
                  <Link href={parent.href}>{parent.label}</Link>
                </BackLink>
              ),
            })}
        {...(props.actions === undefined ? {} : { actions: props.actions })}
      >
        {props.status === undefined ? null : <div className="flex flex-wrap items-center gap-2">{props.status}</div>}
      </PageHeader>
      {props.children}
    </Page>
  );
}

/** Khung chờ của một bảng đang tải: các vạch cao đúng một dòng, để bảng thật hiện ra không đẩy trang nhảy. */
export function LedgerSkeleton({ rows = 6 }: { readonly rows?: number }): ReactElement {
  return <RowsSkeleton rows={rows} label={t('admin.loading')} />;
}

/**
 * Ghi chú phạm vi / tự đính chính dưới một bảng ("20 người ở trang 1, còn trang sau"),
 * đứng sát bảng nó nói về.
 *
 * `role="status"` chứ không `alert`: đây là thông tin, không phải lỗi, và `alert` ngắt
 * lời trình đọc màn hình.
 */
export function AdminNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p role="status" className="text-xs text-ink-3">
      {children}
    </p>
  );
}

/**
 * Nút "Về đầu" cho trạng thái lỗi và trạng thái trống của một bảng phân trang.
 *
 * Ở trang 2 trở đi, lỗi hay trang trống THAY CHỖ cả bảng lẫn thanh phân trang, nên nút
 * "Về đầu" của thanh phân trang biến mất cùng bảng và người dùng kẹt lại ở một trang
 * không đọc được. Ở trang 1 thì không có gì để về: trả `null`.
 */
export function FirstPageButton(props: { readonly page: number; readonly onFirst: () => void }): ReactElement | null {
  if (props.page <= 1) {
    return null;
  }
  return (
    <Button variant="secondary" size="sm" icon="arrow-left" onClick={props.onFirst}>
      {t('admin.pager.first')}
    </Button>
  );
}

/**
 * Lỗi tải một bảng của trang quản trị: hai nửa của `ErrorEntry` vào hai khe của
 * `ErrorBlock`, nút "Tải lại", và "Về đầu" khi lỗi xảy ra ở trang sau.
 */
export function LedgerError(props: {
  readonly failure: ErrorEntry;
  readonly onRetry: () => void;
  readonly retrying: boolean;
  /** Trang đang xem và lối về trang đầu. Bỏ trống cho danh sách không phân trang. */
  readonly page?: number;
  readonly onFirst?: () => void;
}): ReactElement {
  const first =
    props.page === undefined || props.onFirst === undefined ? null : <FirstPageButton page={props.page} onFirst={props.onFirst} />;
  return (
    <ErrorBlock
      title={props.failure.what}
      onRetry={props.onRetry}
      retrying={props.retrying}
      retryLabel={t('admin.reload')}
      {...(first === null ? {} : { actions: first })}
    >
      {props.failure.next}
    </ErrorBlock>
  );
}

/**
 * Lỗi mở một trang chi tiết (một lớp, một kỳ thi): "Tải lại" và lối về danh sách. Câu
 * `next` của các lỗi này hứa cả hai việc, nên cả hai nút phải có mặt.
 */
export function DetailError(props: {
  readonly failure: ErrorEntry;
  readonly onRetry: () => void;
  readonly retrying: boolean;
  readonly backHref: string;
  readonly backLabel: string;
}): ReactElement {
  return (
    <ErrorBlock
      title={props.failure.what}
      onRetry={props.onRetry}
      retrying={props.retrying}
      retryLabel={t('admin.reload')}
      actions={
        <Button asChild variant="secondary" size="sm" icon="arrow-left">
          <Link href={props.backHref}>{props.backLabel}</Link>
        </Button>
      }
    >
      {props.failure.next}
    </ErrorBlock>
  );
}
