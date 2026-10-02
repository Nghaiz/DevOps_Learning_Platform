import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Badge, type BadgeVariant } from '@devops-platform/ui';
import type { ExamWindowState } from './exam-form-model';

const VARIANT: Readonly<Record<ExamWindowState, BadgeVariant>> = {
  upcoming: 'outline',
  open: 'success',
  closed: 'secondary',
};

/**
 * Nhãn "Chưa mở / Đang mở / Đã đóng" của một kỳ thi, dùng ở ledger và ở trang
 * chi tiết. Phán quyết vùng nằm ở `examWindowState` (dùng lại `isExamOpen` của
 * máy chủ); ở đây chỉ chọn chữ và sắc.
 */
export function ExamStateBadge({ state }: { readonly state: ExamWindowState }): ReactElement {
  return <Badge variant={VARIANT[state]}>{t(`admin.exams.state.${state}`)}</Badge>;
}
