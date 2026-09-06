'use client';

import type { ReactElement } from 'react';
import { Button } from '@devops-platform/ui';
import { CatalogIcon } from './catalog-icons';

/**
 * Phân trang cursor của trang danh mục — bản CÓ HÌNH của `CursorPager`.
 *
 * ## Vì sao có file này thay vì sửa `CursorPager`
 *
 * `CursorPager` sống ở `packages/ui/src/cursor-pager.tsx`, và `packages/ui` đang
 * có hai lane khác làm việc — sửa ở đó là đúng cái đua ghi-đè mà một cây làm
 * việc chung sinh ra: người viết sau đè người viết trước, không dấu vết xung
 * đột, không lỗi biên dịch, chỉ là một trong hai bản biến mất. Nên phần hình
 * thức của trang danh mục ở lại trong đường sở hữu của lane này.
 *
 * ⚠ NỢ CÓ CHỦ Ý, và cách trả: props ở đây khớp `CursorPagerProps` TỪNG FIELD
 * MỘT (`hasNext`, `onNext`, `onReset`, `page`, `loading`). Đó không phải trùng
 * hợp — nó để việc gộp ngược về `packages/ui` sau này là một thao tác cơ học
 * (đổi thân hàm, giữ nguyên chữ ký, xoá file này) chứ không phải một cuộc di
 * trú. `components/me/**` vẫn dùng `CursorPager` gốc và KHÔNG được lane này
 * đụng tới.
 *
 * ## Vì sao "Về đầu" chứ không phải "Trước"
 *
 * Cursor server không có phép toán lùi — nó là `id` của mục cuối trang trước,
 * dùng cho `WHERE id > cursor`. Không có phép nghịch. Một nút "Trước" ở đây sẽ
 * phải nói dối bằng cách đi lại từ đầu, hoặc phải giữ cả ngăn xếp cursor và vẫn
 * sai khi kho đổi giữa hai lượt tải. Ràng buộc này giữ nguyên từ D9; lane này
 * chỉ đổi diện mạo, không đổi phép toán.
 *
 * ## Icon ở đây có chữ đi kèm
 *
 * Cả hai nút đều mang nhãn chữ, nên icon là trang trí và `CatalogIcon` đóng sẵn
 * `aria-hidden` cho chúng. Không nút nào chỉ có icon — một nút phân trang câm sẽ
 * phải tự mang `aria-label`, và đó là thứ hỏng bằng cách quên.
 */
export function CatalogPager(props: {
  /** `false` = đã ở trang cuối. Nút Tiếp DISABLE chứ không ẩn — người dùng cần thấy là đã hết. */
  readonly hasNext: boolean;
  readonly onNext: () => void;
  readonly onReset: () => void;
  readonly page: number;
  readonly loading?: boolean;
}): ReactElement {
  const loading = props.loading ?? false;
  const atFirst = props.page <= 1;

  return (
    <nav
      aria-label="Phân trang danh mục"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <Button variant="outline" size="sm" onClick={props.onReset} disabled={loading || atFirst}>
        <CatalogIcon name="first" />
        Về đầu
      </Button>

      {/*
        `aria-live="polite"` ở ĐÚNG một chỗ trong cả cụm: đổi trang là một thay
        đổi người dùng chủ động gây ra, nên nó cần được đọc lên MỘT lần. Thêm
        live region thứ hai (ví dụ ở nút Tiếp) sẽ cho hai thông báo chồng nhau
        cho cùng một thao tác.
      */}
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        <span className="font-medium text-foreground">Trang {props.page}</span>
        {!props.hasNext && <span className="ml-2">· Hết danh sách</span>}
      </p>

      <Button variant="outline" size="sm" onClick={props.onNext} disabled={!props.hasNext} loading={loading}>
        Tiếp
        <CatalogIcon name="next" />
      </Button>
    </nav>
  );
}
