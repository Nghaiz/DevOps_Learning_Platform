import type { ReactElement, ReactNode } from 'react';

/**
 * Khung chung của năm trang danh mục.
 *
 * ⚠ `<main>` nằm Ở ĐÂY, không ở vỏ ứng dụng (13.B) — đó là quy ước có sẵn của
 * mọi route trong `apps/web` từ trước phase này. Nếu vỏ 13.B cũng dựng
 * `<main>`, hai landmark lồng nhau sẽ làm axe đỏ (`landmark-unique`) và cần
 * gỡ đúng MỘT trong hai; ghi ở đây để lượt tích hợp đợt 3 biết chỗ nhìn.
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{props.title}</h1>
        <p className="text-sm text-muted-foreground">{props.description}</p>
      </header>
      {props.children}
    </main>
  );
}

/**
 * Câu tự đính chính phạm vi (`describePageScope` / `describeSortScope`).
 *
 * `role="status"` chứ không `role="alert"`: đây là thông tin, không phải lỗi —
 * `alert` ngắt lời trình đọc màn hình giữa chừng và dùng nó cho một dòng "còn
 * trang sau" là đúng loại lạm dụng làm người dùng tắt hẳn thông báo.
 */
export function CatalogNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}
