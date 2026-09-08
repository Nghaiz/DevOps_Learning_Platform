'use client';

import { useEffect, useRef, type ReactElement } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ObjectView } from '@devops-platform/games';
import { Button } from '@devops-platform/ui';
import { objectLabel } from './inspector-types.ts';

/**
 * Hỏi lại trước khi xoá.
 *
 * ## Vì sao cần
 *
 * `delete` là hành động DUY NHẤT trong arena không hoàn tác được — chính phần
 * `hint` của nó viết *"Không hoàn tác được"* — vậy mà nó chạy ngay ở cú bấm đầu
 * tiên. Nút xoá lại đứng cùng hàng với "Xem log" và "Mô tả chi tiết", tức là nằm
 * ngay cạnh những nút người chơi bấm liên tục khi đang chẩn đoán. Một lần trượt
 * tay là mất một tài nguyên mà cả bài đang xoay quanh, và cách khôi phục duy
 * nhất là dựng lại nó bằng tay.
 *
 * ## Vì sao KHÔNG dùng `window.confirm`
 *
 * Nó chặn cả luồng JavaScript, nên vòng lặp mô phỏng đứng hình trong lúc hộp
 * thoại mở — cụm nhảy một bước lớn ngay khi người dùng bấm xong. Nó cũng không
 * nhận được theme, và không nói được tên tài nguyên bằng font mono.
 *
 * ## Vì sao không phải `<dialog>`
 *
 * Bảng thông số nằm trong lớp HUD chồng trên canvas; một `<dialog modal>` sẽ
 * nhảy lên `::backdrop` ở tầng trên cùng và che cả cảnh 3D cho một câu hỏi hai
 * nút. Ở đây chỉ cần chặn tương tác trong CHÍNH bảng thông số.
 */
export interface ConfirmDeleteProps {
  readonly open: boolean;
  readonly object: ObjectView;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ConfirmDelete({
  open,
  object,
  onCancel,
  onConfirm,
}: ConfirmDeleteProps): ReactElement | null {
  const cancelRef = useRef<HTMLButtonElement>(null);

  /*
   * Focus rơi vào HUỶ, không vào Xoá.
   *
   * Người dùng bàn phím vừa bấm một nút và một hộp thoại hiện ra; nếu focus rơi
   * vào nút phá huỷ thì một phím Enter theo quán tính là mất tài nguyên. Mặc
   * định an toàn là lối thoát, không phải lối đi tiếp.
   */
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Xác nhận xoá ${objectLabel(object)}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Chặn lan lên `window`: bộ nghe phím tắt toàn cục cũng nghe Escape,
          // và một lần bấm không được đóng hai lớp.
          event.stopPropagation();
          onCancel();
        }
      }}
      className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5"
    >
      <p className="flex items-start gap-2 text-xs text-foreground">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
        <span>
          Xoá <span className="font-mono font-semibold">{objectLabel(object)}</span>? Cụm sẽ mất nó
          ngay, và không có cách hoàn tác.
        </span>
      </p>
      <div className="flex justify-end gap-2">
        <Button ref={cancelRef} type="button" variant="ghost" size="sm" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={onConfirm}>
          Xoá thật
        </Button>
      </div>
    </div>
  );
}
