import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import { Skeleton } from '@devops-platform/ui';
import { PageContainer, PosterHeader, ToolHeader } from '../kit';

/**
 * Khung của một màn quản trị (bản dựng lại PTIT).
 *
 * ⛔ KHÔNG dựng `<main>`: vỏ ứng dụng sở hữu landmark đó và bọc mọi trang
 * (`components/session/landmark-contract.test.ts` gác điều này). `<h1>` do
 * `PosterHeader` / `ToolHeader` của kit render, mỗi màn đúng một cái.
 *
 * Quản trị là section DUY NHẤT có dải poster màu mực, chữ giấy: `section="admin"`
 * tự chọn tông `ink` từ bảng section của vỏ, nên ở đây không có class màu nào.
 * Thanh chuyển bảy trang con (`SectionSwitcher`) nằm sẵn ở mép dưới poster; nó
 * thay cho thanh nav riêng của nhánh quản trị trước đây.
 */
export function AdminPage(props: {
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      <PosterHeader
        section="admin"
        kicker={props.kicker}
        title={props.title}
        lead={props.lead}
        {...(props.aside === undefined ? {} : { aside: props.aside })}
      />
      <PageContainer className="pb-16">{props.children}</PageContainer>
    </>
  );
}

/**
 * Khung của một trang chi tiết (một lớp, một kỳ thi): `ToolHeader` với đường
 * dẫn mono, không có thanh chuyển trang con vì độ sâu tối đa là hai tầng.
 *
 * Mắt xích đầu "Quản trị" luôn có mặt và trỏ về `/admin`, nên nơi gọi chỉ khai
 * phần riêng của nó.
 */
export function AdminDetailPage(props: {
  readonly crumbs: readonly { readonly href?: string; readonly label: string }[];
  readonly title: string;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      <ToolHeader
        crumbs={[{ href: '/admin', label: t('admin.crumb.root') }, ...props.crumbs]}
        title={props.title}
        {...(props.status === undefined ? {} : { status: props.status })}
        {...(props.actions === undefined ? {} : { actions: props.actions })}
      />
      <PageContainer className="pb-16">{props.children}</PageContainer>
    </>
  );
}

/**
 * Khung xương của một ledger đang tải: các vạch cao đúng một dòng bảng, để
 * bảng thật hiện ra không đẩy trang nhảy.
 */
export function LedgerSkeleton({ rows = 6 }: { readonly rows?: number }): ReactElement {
  return (
    <div className="flex flex-col gap-px border-t border-border" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

/**
 * Ghi chú phạm vi / tự đính chính dưới một ledger ("20 người ở trang 1, còn
 * trang sau"). Chữ mono nhỏ như nhãn ga, đứng sát bảng nó nói về.
 *
 * `role="status"` chứ không `alert`: đây là thông tin, không phải lỗi, và
 * `alert` ngắt lời trình đọc màn hình.
 */
export function AdminNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p role="status" className="font-mono text-xs text-muted-foreground">
      {children}
    </p>
  );
}
