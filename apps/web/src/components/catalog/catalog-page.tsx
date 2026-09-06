import type { ReactElement, ReactNode } from 'react';
import { describePageScope, describeSortScope, type CatalogKind } from './catalog-labels';

/**
 * Khung chung của năm trang danh mục.
 *
 * ⛔ KHÔNG dựng `<main>` ở đây. Vỏ ứng dụng (`components/shell/app-shell.tsx`)
 * sở hữu landmark đó và bọc mọi trang — xem hợp đồng C6bis trong
 * `plans/devops-learning-platform/phase-13-exec.md`. Bản đầu của file này có
 * `<main>` vì lúc viết, vỏ chưa dựng; khi vỏ đổi thì mỗi trang danh mục có HAI
 * landmark lồng nhau, thứ làm axe của 13.H đỏ `landmark-unique`. Chốt về phía
 * vỏ vì chỉ ở đó mới bảo đảm được đúng MỘT.
 *
 * KHÔNG `min-h-screen`: `<body>` (root layout) đã mang nó, và khi vỏ 13.B thêm
 * thanh điều hướng phía trên thì `min-h-screen` ở đây làm trang cao hơn màn
 * hình đúng bằng chiều cao thanh đó — một thanh cuộn không có nội dung.
 */
export function CatalogPage(props: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{props.title}</h1>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </header>
      {props.children}
    </div>
  );
}

/**
 * Một câu tự đính chính phạm vi.
 *
 * `role="status"` chứ không `role="alert"`: đây là thông tin, không phải lỗi —
 * `alert` ngắt lời trình đọc màn hình giữa chừng, và dùng nó cho một dòng "còn
 * trang sau" là đúng loại lạm dụng làm người dùng tắt hẳn thông báo.
 */
export function CatalogNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Hai câu tự đính chính của mọi trang danh mục — danh sách còn tiếp không, và
 * thứ tự đang xem có phạm vi tới đâu.
 *
 * Cả hai câu là hàm THUẦN có test (`catalog-labels.test.ts`), và cả hai có thể
 * trả `null`: một dòng ghi chú luôn hiện sẽ thành nhiễu, và người ta ngừng đọc
 * đúng lúc nó bắt đầu mang tin.
 */
export function CatalogScopeNotes(props: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly shown: number;
  readonly hasNext: boolean;
  readonly sortKey: string;
}): ReactElement | null {
  const pageNote = describePageScope({
    kind: props.kind,
    page: props.page,
    shown: props.shown,
    hasNext: props.hasNext,
  });
  const sortNote = describeSortScope({
    sortKey: props.sortKey,
    shown: props.shown,
    hasNext: props.hasNext,
  });

  if (pageNote === null && sortNote === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {pageNote !== null && <CatalogNote>{pageNote}</CatalogNote>}
      {sortNote !== null && <CatalogNote>{sortNote}</CatalogNote>}
    </div>
  );
}
