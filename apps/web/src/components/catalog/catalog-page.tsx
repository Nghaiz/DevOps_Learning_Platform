import { renderCopy } from '@devops-platform/copy';
import type { ReactElement, ReactNode } from 'react';
import {
  describePageScope,
  describeSearchScope,
  describeSortScope,
  type CatalogKind,
} from './catalog-labels';

/**
 * Khung chung của năm trang danh mục.
 *
 * ⛔ KHÔNG dựng `<main>` ở đây. Vỏ ứng dụng (`components/shell/app-shell.tsx`)
 * sở hữu landmark đó và bọc mọi trang (hợp đồng C6bis trong
 * `phase-13-exec.md`). Bản đầu của file này có `<main>` vì lúc viết, vỏ chưa
 * dựng; khi vỏ đổi thì mỗi trang danh mục có HAI landmark lồng nhau, thứ làm
 * axe của 13.H đỏ `landmark-unique`. Chốt về phía vỏ vì chỉ ở đó mới bảo đảm
 * được đúng MỘT.
 *
 * KHÔNG `min-h-screen`: `<body>` (root layout) đã mang nó, và khi vỏ thêm thanh
 * điều hướng phía trên thì `min-h-screen` ở đây làm trang cao hơn màn hình đúng
 * bằng chiều cao thanh đó, tức một thanh cuộn không có nội dung.
 *
 * ## Thang chữ theo hợp đồng token P16
 *
 * `h1` dùng `text-4xl` vì §3.2 giao bậc đó cho "h1 trang trong", và đoạn dẫn
 * dùng `text-lg` ("đoạn dẫn, mô tả thẻ"). Cả hai là `clamp()` có số hạng `rem`,
 * nên chỉnh cỡ chữ trình duyệt vẫn dịch chuyển được giá trị (SC 1.4.4).
 *
 * `text-balance` trên `h1` và `max-w-(--measure)` trên đoạn dẫn: ở bậc 52px tại
 * 1440px, một tiêu đề hai chữ vẫn vừa một dòng nhưng đoạn dẫn thì dài ra tới
 * mép container, và một dòng văn xuôi rộng hơn `--measure` là chỗ mắt bắt đầu
 * nhảy dòng sai.
 */
export function CatalogPage(props: {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground">{props.title}</h1>
        <p className="max-w-(--measure) text-lg text-muted-foreground">{props.description}</p>
      </header>
      {props.children}
    </div>
  );
}

/**
 * Một câu tự đính chính phạm vi.
 *
 * `role="status"` chứ không `role="alert"`: đây là thông tin, không phải lỗi.
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
 * Ba câu tự đính chính của mọi trang danh mục: danh sách còn tiếp không, thứ tự
 * đang xem có phạm vi tới đâu, và ô tìm soi được tới đâu.
 *
 * Cả ba là hàm THUẦN có test (`catalog-labels.test.ts`), và cả ba có thể trả
 * `null`: một dòng ghi chú luôn hiện sẽ thành nhiễu, và người ta ngừng đọc đúng
 * lúc nó bắt đầu mang tin.
 *
 * ⚠ `loaded` khác `shown`. `shown` là số mục còn lại SAU khi ô tìm lọc; `loaded`
 * là số mục server trả về trang này. Câu cảnh báo của ô tìm nói về PHẠM VI SOI
 * nên nó phải dùng `loaded`: truyền `shown` vào đó sẽ in ra "Ô tìm chỉ soi 0
 * mục" đúng lúc người đọc cần biết nó đã soi cả 20 mục và không thấy gì.
 */
export function CatalogScopeNotes(props: {
  readonly kind: CatalogKind;
  readonly page: number;
  readonly shown: number;
  readonly loaded: number;
  readonly hasNext: boolean;
  readonly sortKey: string;
  readonly query: string;
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
  const searchNote = describeSearchScope({
    query: props.query,
    loaded: props.loaded,
    hasNext: props.hasNext,
  });

  if (pageNote === null && sortNote === null && searchNote === null) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {pageNote !== null && <CatalogNote>{renderCopy(pageNote)}</CatalogNote>}
      {searchNote !== null && <CatalogNote>{renderCopy(searchNote)}</CatalogNote>}
      {sortNote !== null && <CatalogNote>{renderCopy(sortNote)}</CatalogNote>}
    </div>
  );
}
