import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Pill, type Tone } from '@devops-platform/ds';
import type { ExamWindowState } from './exam-form-model';

const TONE: Readonly<Record<ExamWindowState, Tone>> = {
  upcoming: 'warn',
  open: 'ok',
  closed: 'neutral',
};

/**
 * Nhãn "Chưa mở / Đang mở / Đã đóng" của một kỳ thi, dùng ở bảng và ở trang chi tiết.
 * Phán quyết vùng nằm ở `examWindowState` (dùng lại `isExamOpen` của máy chủ); ở đây chỉ
 * chọn chữ và sắc.
 *
 * Chữ là bộ `exam.window.*` dùng chung với màn của sinh viên, và sắc cũng vậy: "Đang mở"
 * là chấm sống duy nhất, giống danh sách kỳ thi phía người học.
 */
export function ExamStateBadge({ state }: { readonly state: ExamWindowState }): ReactElement {
  return (
    <Pill tone={TONE[state]} dot live={state === 'open'}>
      {t(`exam.window.${state}`)}
    </Pill>
  );
}
