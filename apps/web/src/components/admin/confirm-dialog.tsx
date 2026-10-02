'use client';

import type { ReactElement, ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
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
 * Hộp xác nhận dùng chung của mọi hành động quản trị có hậu quả: đổi vai trò,
 * kết thúc phiên, lưu trữ nội dung, bỏ sinh viên khỏi lớp, xoá kỳ thi.
 *
 * Một hộp cho cả năm nơi để giữ MỘT luật đúng ở mọi chỗ: **nút thực hiện bị
 * khoá khi `blockedReason !== null`, và lý do luôn hiện ra**. Năm bản sao là
 * năm chỗ để quên nửa sau của luật đó.
 *
 * Ba khe chữ, ba vai khác nhau:
 *
 * · `body`: chuyện gì sẽ xảy ra.
 * · `loss`: thứ MẤT ĐI, in trong một khối đỏ nhạt có icon cảnh báo, tách khỏi
 *   phần thân để người đọc lướt vẫn thấy. Hành động không làm mất gì thì
 *   truyền `null`.
 * · `blockedReason` là phán quyết của CLIENT trước khi gửi; `error` là câu trả
 *   lời THẬT của máy chủ sau khi gửi. Gộp hai cái làm mất phân biệt "chưa gửi"
 *   với "đã gửi và bị từ chối".
 *
 * Nút xác nhận là `Button variant="destructive"`: nền đỏ nhạt + icon cảnh báo
 * tự gắn trong `packages/ui`. Nơi gọi KHÔNG thêm icon, hai icon chồng nhau là
 * cách luật hai kênh tự hỏng.
 */
export function ConfirmDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly body: string;
  /** Thứ mất đi nếu bấm; `null` khi hành động không làm mất gì. */
  readonly loss: string | null;
  /** Khác `null` ⇒ nút thực hiện bị khoá và lý do hiện ra. */
  readonly blockedReason: string | null;
  /** Lỗi máy chủ trả về ở lượt thực hiện gần nhất. */
  readonly error: string | null;
  readonly confirmLabel: string;
  readonly confirming: boolean;
  readonly onConfirm: () => void;
  /** Nội dung phụ (ô chọn vai trò) đặt giữa mô tả và khối mất mát. */
  readonly children?: ReactNode;
}): ReactElement {
  const { blockedReason, error, loss } = props;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription className="text-pretty">{props.body}</DialogDescription>
        </DialogHeader>

        {props.children}

        {loss === null ? null : (
          <div className="flex gap-3 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="flex flex-col gap-1">
              <p className="type-label">{t('admin.confirm.loss-label')}</p>
              <p className="text-pretty">{loss}</p>
            </div>
          </div>
        )}
        {blockedReason === null ? null : (
          <Alert variant="warning">
            <AlertDescription>{blockedReason}</AlertDescription>
          </Alert>
        )}
        {error === null ? null : (
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
