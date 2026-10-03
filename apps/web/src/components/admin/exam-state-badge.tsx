import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Badge, type BadgeVariant } from '@devops-platform/ui';
import type { ExamWindowState } from './exam-form-model';

const VARIANT: Readonly<Record<ExamWindowState, BadgeVariant>> = {
  upcoming: 'outline',
  open: 'success',
  closed: 'outline',
};

/**
 * Nhãn "Chưa mở / Đang mở / Đã đóng" của một kỳ thi, dùng ở ledger và ở trang
 * chi tiết. Phán quyết vùng nằm ở `examWindowState` (dùng lại `isExamOpen` của
 * máy chủ); ở đây chỉ chọn chữ và sắc.
 *
 * Chữ là bộ `exam.window.*` dùng chung với màn của sinh viên. "Đã đóng" là
 * `outline` với chữ muted (không còn `secondary`, token cũ chỉ giữ cho game):
 * nó tách khỏi "Chưa mở" bằng độ đậm của chữ, và cặp `muted-foreground` trên
 * nền trang đã qua cổng tương phản.
 */
export function ExamStateBadge({ state }: { readonly state: ExamWindowState }): ReactElement {
  return (
    <Badge variant={VARIANT[state]} className={state === 'closed' ? 'text-muted-foreground' : undefined}>
      {t(`exam.window.${state}`)}
    </Badge>
  );
}
