'use client';

import type { ReactElement } from 'react';
import { Button, ErrorState } from '@devops-platform/ui';

/**
 * Lỗi tải danh sách.
 *
 * Hai lối thoát chứ không một, vì có HAI nguyên nhân khác nhau và chúng cần
 * hai hành động khác nhau:
 *
 * - **Lỗi tạm thời** (mạng chập, 500) — thử lại đúng trang đang xem là đủ, và
 *   ép người dùng về trang 1 sẽ làm họ mất chỗ đang đọc.
 * - **Cursor hỏng** — `lessons.list`/`labs.list`/`playgrounds.list` ném
 *   BAD_REQUEST "Cursor không còn hợp lệ" khi mục làm mốc đã bị gỡ khỏi kho
 *   (`InvalidCursorError`, xem routers). Thử lại bao nhiêu lần cũng ra đúng lỗi
 *   đó; lối ra duy nhất là quay về đầu.
 *
 * Client không đoán nguyên nhân — nó hiện cả hai đường và nói rõ đường nào cho
 * ca nào. Đoán sai ở đây sẽ hoặc cướp mất chỗ đang đọc, hoặc đưa một nút "Thử
 * lại" không bao giờ hết đỏ.
 */
export function CatalogError(props: {
  readonly title: string;
  readonly message: string;
  readonly retrying: boolean;
  readonly page: number;
  readonly onRetry: () => void;
  readonly onFirstPage: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col items-center gap-3">
      <ErrorState
        title={props.title}
        message={props.message}
        onRetry={props.onRetry}
        retrying={props.retrying}
        className="w-full"
      />
      {props.page > 1 && (
        <p className="text-sm text-muted-foreground">
          Thử lại vẫn lỗi? Mục làm mốc của trang này có thể đã bị gỡ khỏi kho —{' '}
          <Button variant="link" size="sm" onClick={props.onFirstPage} className="px-0">
            về đầu danh sách
          </Button>
          .
        </p>
      )}
    </div>
  );
}
