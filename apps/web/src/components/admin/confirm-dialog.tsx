'use client';

import type { ReactElement, ReactNode } from 'react';
import { t } from '@devops-platform/copy';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@devops-platform/ui';

/**
 * Hộp xác nhận dùng chung của ba hành động quản trị có hậu quả: đổi vai trò,
 * kết thúc phiên người khác, lưu trữ nội dung.
 *
 * Ba lời gọi thật ⇒ vượt ngưỡng tách seam của `code-conventions.md`; và quan
 * trọng hơn, nó giữ cho MỘT luật đúng ở cả ba chỗ: **nút thực hiện bị khoá khi
 * `blockedReason !== null`, và lý do luôn hiện ra**. Ba bản sao của cùng cái
 * hộp là ba chỗ để quên nửa sau của luật đó, tức hiện lý do nhưng vẫn cho bấm.
 *
 * `error` tách khỏi `blockedReason` có chủ ý: `blockedReason` là phán quyết của
 * CLIENT trước khi gửi (biết trước là sẽ bị từ chối), `error` là câu trả lời
 * THẬT của máy chủ sau khi gửi. Gộp chúng sẽ làm mất phân biệt "chưa gửi" với
 * "đã gửi và bị từ chối", hai trạng thái đòi hai hành động khác nhau của người
 * quản trị.
 *
 * ## Luật hai kênh nằm ở `packages/ui`, không lặp lại ở đây
 *
 * `p16-tokens.md` §2 đo `--primary` và `--destructive` lệch nhau **1.06:1** ở
 * nhánh sáng, tức "cùng một màu" với mắt. Nút xác nhận vì vậy phải là khung
 * RỖNG có viền cộng một icon cảnh báo, không phải một khối đỏ đặc. Cả hai nửa
 * đã nằm trong `Button variant="destructive"` (viền, nền trong suốt, và
 * `TriangleAlert` tự gắn khi nơi gọi không truyền `iconLeft`), nên nơi gọi
 * KHÔNG được tự thêm icon: hai icon chồng nhau là cách luật đó tự hỏng.
 */
export function ConfirmDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly body: string;
  /** Khác `null` ⇒ nút thực hiện bị khoá và lý do hiện ra. */
  readonly blockedReason: string | null;
  /** Lỗi máy chủ trả về ở lượt thực hiện gần nhất. */
  readonly error: string | null;
  readonly confirmLabel: string;
  readonly confirming: boolean;
  readonly onConfirm: () => void;
  /** Nội dung phụ (ô chọn vai trò, chi tiết phiên) đặt giữa mô tả và nút. */
  readonly children?: ReactNode;
}): ReactElement {
  const { blockedReason, error } = props;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription className="text-balance">{props.body}</DialogDescription>
        </DialogHeader>

        {props.children}

        {blockedReason !== null && (
          <Alert variant="warning">
            <AlertDescription>{blockedReason}</AlertDescription>
          </Alert>
        )}
        {error !== null && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={props.confirming}>
              {t('admin.confirm.cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={props.onConfirm}
            disabled={blockedReason !== null}
            loading={props.confirming}
          >
            {props.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
