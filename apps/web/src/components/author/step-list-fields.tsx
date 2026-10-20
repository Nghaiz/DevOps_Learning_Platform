'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import type { FieldIssue, StepFormState } from './draft-form';
import { StepStation } from './step-station';
import { Button, Notice } from '@devops-platform/ds';

/**
 * Bước của bài học / task của lab, xếp thành một danh sách có thứ tự.
 *
 * Hai thứ khác nhau ở một điểm quyết định và giao diện phải nói ra:
 *
 * - **Bài học**: VỊ TRÍ là định danh (`ordinal` do server đánh lại theo thứ tự
 *   mảng, `scenarioStepSchema.index` phải liên tục 0-based). Không có id để gõ.
 * - **Lab**: `taskId` là định danh BỀN, đi thẳng vào `lab_task_results.task_id`.
 *   Đổi nó sau khi có người làm bài nghĩa là kết quả cũ trỏ nhầm task: không
 *   lỗi, không cảnh báo, chỉ là điểm gắn sai việc.
 *
 * Khoá React là `step.key`, không phải vị trí: Lên/Xuống đổi chỗ phần tử chứ
 * không dựng lại ô nhập, nên con trỏ và nội dung đang gõ không nhảy sang bước khác.
 */
export function StepListFields(props: {
  readonly kind: Exclude<ContentKind, 'playground'>;
  readonly steps: readonly StepFormState[];
  readonly onChange: (next: readonly StepFormState[]) => void;
  readonly onAdd: () => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const { kind, steps, onChange, issues, disabled } = props;

  const patchAt = (index: number, part: Partial<StepFormState>): void => {
    onChange(steps.map((step, i) => (i === index ? { ...step, ...part } : step)));
  };
  const removeAt = (index: number): void => {
    onChange(steps.filter((_, i) => i !== index));
  };
  const moveBy = (index: number, delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= steps.length) {
      return;
    }
    const next = [...steps];
    const [moved] = next.splice(index, 1);
    if (moved !== undefined) {
      next.splice(target, 0, moved);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-8">
      {steps.length === 0 && (
        <Notice tone="warn" className="animate-enter">
          {kind === 'lab' ? t('author.step-list-fields-chua-co-task-nao') : t('author.step-list-fields-chua-co-buoc-nao')}
        </Notice>
      )}

      {steps.length > 0 && (
        <ol className="flex flex-col gap-10">
          {steps.map((step, index) => (
            <li key={step.key}>
              <StepStation
                kind={kind}
                index={index}
                total={steps.length}
                step={step}
                issues={issues}
                disabled={disabled}
                onPatch={(part) => {
                  patchAt(index, part);
                }}
                onMove={(delta) => {
                  moveBy(index, delta);
                }}
                onRemove={() => {
                  removeAt(index);
                }}
              />
            </li>
          ))}
        </ol>
      )}

      <div>
        <Button variant="secondary" icon="plus" onClick={props.onAdd} disabled={disabled}>
          {kind === 'lab' ? t('author.step-list-fields-them-task') : t('author.step-list-fields-them-buoc')}
        </Button>
      </div>
    </div>
  );
}
