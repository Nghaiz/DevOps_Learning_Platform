'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Sheet, SheetContent, SheetTitle } from '@devops-platform/ui';
import { ExamForm } from './exam-form';
import type { ExamComposeInput, ExamFormValues } from './exam-form-model';

/**
 * Tấm trượt phải chứa form ra đề, dùng chung cho "Tạo kỳ thi" (`/admin/exams`)
 * và "Sửa" (`/admin/exams/:id`).
 *
 * Radix gỡ nội dung khi tấm đóng, nên mỗi lần mở là một form mới dựng từ
 * `initial`: bản nháp bỏ dở của lần trước không lẫn vào lần sau.
 *
 * Rộng hơn mặc định `max-w-md` của `Sheet`: hai ô ngày giờ đứng cạnh nhau và
 * ô chọn lớp cần đủ chỗ cho tên lớp dài.
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
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange} side="right">
      {/* Không có `SheetDescription`: câu dẫn nằm ở từng bước. `undefined` tường minh tắt cảnh báo của Radix. */}
      <SheetContent
        closeLabel={t('admin.exams.form.close')}
        className="max-w-2xl gap-6 md:p-8"
        aria-describedby={undefined}
      >
        <SheetTitle className="pr-10">{props.title}</SheetTitle>
        <ExamForm
          initial={props.initial}
          attemptCount={props.attemptCount}
          submitLabel={props.submitLabel}
          pending={props.pending}
          serverError={props.serverError}
          onSubmit={props.onSubmit}
          onCancel={() => props.onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
