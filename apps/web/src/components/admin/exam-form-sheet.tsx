'use client';

import { useCallback, useState, type ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { ExamForm } from './exam-form';
import type { ExamComposeInput, ExamFormValues } from './exam-form-model';
import { ConfirmDialog, Sheet, SheetContent } from '@devops-platform/ds';

/**
 * Tấm trượt phải chứa form ra đề, dùng chung cho "Tạo kỳ thi" (`/admin/exams`)
 * và "Sửa" (`/admin/exams/:id`).
 *
 * Radix gỡ nội dung khi tấm đóng, nên mỗi lần mở là một form mới dựng từ
 * `initial`: bản nháp bỏ dở của lần trước không lẫn vào lần sau. Cũng vì thế mà
 * đóng tấm khi form đã khác lúc mở (X, Esc, bấm ra ngoài, nút Huỷ) phải HỎI
 * trước: không hỏi thì một cú Esc lỡ tay xoá cả đề vừa gõ. Lượt lưu thành công
 * đóng tấm bằng `onOpenChange(false)` của nơi gọi, không đi qua câu hỏi này.
 *
 * Bề rộng `lg` của `Sheet`: hai ô ngày giờ đứng cạnh nhau và ô chọn lớp cần đủ chỗ cho
 * tên lớp dài.
 */
export function ExamFormSheet(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly initial: ExamFormValues;
  readonly attemptCount: number;
  readonly submitLabel: string;
  readonly pending: boolean;
  readonly serverError: string | null;
  readonly onSubmit: (input: ExamComposeInput) => void;
}): ReactElement {
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState(false);

  // Mỗi lần tấm MỞ là một form mới: cờ "đã sửa" của lần trước không được sống
  // sang. Điều chỉnh ngay trong lượt render theo mẫu "prop đổi thì chỉnh state"
  // của React, không qua effect.
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) {
      setDirty(false);
      setAskDiscard(false);
    }
  }

  const { onOpenChange } = props;
  const requestClose = useCallback(() => {
    if (dirty) {
      setAskDiscard(true);
      return;
    }
    onOpenChange(false);
  }, [dirty, onOpenChange]);

  return (
    <>
      <Sheet
        open={props.open}
        onOpenChange={(next) => {
          if (next) {
            onOpenChange(true);
            return;
          }
          requestClose();
        }}
      >
        {/* Không có mô tả: câu dẫn nằm ở từng bước của form. */}
        <SheetContent title={props.title} closeLabel={t('admin.exams.form.close')} width="lg">
          <ExamForm
            initial={props.initial}
            attemptCount={props.attemptCount}
            submitLabel={props.submitLabel}
            pending={props.pending}
            serverError={props.serverError}
            onSubmit={props.onSubmit}
            onCancel={requestClose}
            onDirtyChange={setDirty}
          />
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={askDiscard} onOpenChange={setAskDiscard} title={t('admin.exams.form.discard-title')} body={t('admin.exams.form.discard-body')} loss={null} blockedReason={null} error={null} confirmLabel={t('admin.exams.form.discard-confirm')} cancelLabel={t('common.action.cancel')} confirming={false} onConfirm={() => {
          setAskDiscard(false);
          setDirty(false);
          onOpenChange(false);
        }} />
    </>
  );
}

/**
 * Câu lỗi máy chủ của tấm ra đề, tự xoá mỗi lần tấm MỞ.
 *
 * Xoá lúc đóng thôi là chưa đủ: người dùng đóng tấm khi lượt lưu còn chạy, lượt
 * đó lỗi SAU khi tấm đã đóng, và câu lỗi nằm chờ sẵn ở lần mở kế tiếp, gắn vào
 * một form trống chưa gửi gì.
 */
export function useSheetServerError(open: boolean): readonly [string | null, (message: string | null) => void] {
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
    }
  }
  return [error, setError] as const;
}
