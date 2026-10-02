import type { ReactElement, ReactNode } from 'react';

/**
 * Khung cũ của trang danh mục, CHỈ còn giữ cho `app/(session)/problems/` (lane
 * luyện đề) cho tới khi lane đó chuyển sang `PosterHeader` của kit. Năm trang
 * danh mục của lane catalog không dùng nó nữa. Xoá file này khi không còn ai
 * import.
 *
 * ⛔ KHÔNG dựng `<main>` ở đây: vỏ ứng dụng sở hữu landmark đó.
 */
export function CatalogPage(props: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 py-10 md:px-8">
      <header className="flex flex-col gap-2">
        <h1 className="type-display text-balance">{props.title}</h1>
        <p className="max-w-2xl type-lead text-muted-foreground">{props.description}</p>
      </header>
      {props.children}
    </div>
  );
}

/**
 * Một câu tự đính chính phạm vi. `role="status"` chứ không `role="alert"`: đây là
 * thông tin, không phải lỗi.
 */
export function CatalogNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}
