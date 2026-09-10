'use client';

import type { ReactElement } from 'react';
import { Alert, AlertDescription, Button, Card, CardContent } from '@devops-platform/ui';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import type { FieldIssue, StepFormState } from './draft-form';
import { TextAreaField, TextField, issueFor } from './field';

/**
 * Bước của bài học / task của lab.
 *
 * Hai thứ khác nhau ở một điểm quyết định và giao diện phải nói ra:
 *
 * - **Bài học**: VỊ TRÍ là định danh (`ordinal` do server đánh lại theo thứ tự
 *   mảng, `scenarioStepSchema.index` phải liên tục 0-based). Không có id để gõ.
 * - **Lab**: `taskId` là định danh BỀN, đi thẳng vào `lab_task_results.task_id`.
 *   Đổi nó sau khi có người làm bài nghĩa là kết quả cũ trỏ nhầm task — không
 *   lỗi, không cảnh báo, chỉ là điểm gắn sai việc.
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
  const noun = kind === 'lab' ? 'task' : 'bước';

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
    <div className="flex flex-col gap-4">
      {steps.length === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Chưa có {noun} nào. Xuất bản sẽ bị từ chối: schema đòi ít nhất một {noun}.
          </AlertDescription>
        </Alert>
      )}

      {steps.map((step, index) => {
        const at = kind === 'lab' ? `task[${String(index)}]` : `steps[${String(index)}]`;
        return (
          <Card key={step.key}>
            <CardContent className="flex flex-col gap-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {kind === 'lab' ? 'Task' : 'Bước'} {index + 1}
                </h3>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled === true || index === 0}
                    onClick={() => {
                      moveBy(index, -1);
                    }}
                  >
                    Lên
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled === true || index === steps.length - 1}
                    onClick={() => {
                      moveBy(index, 1);
                    }}
                  >
                    Xuống
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      removeAt(index);
                    }}
                  >
                    Xoá
                  </Button>
                </div>
              </div>

              {kind === 'lab' && (
                <TextField
                  label="Id task"
                  value={step.taskId}
                  onChange={(taskId) => {
                    patchAt(index, { taskId });
                  }}
                  error={issueFor(issues, `${at}.taskId`)}
                  disabled={disabled}
                  placeholder="tim-tien-trinh-ngon-cpu"
                  hint="Chỉ [a-z0-9-]. Định danh BỀN: đổi sau khi có người làm bài sẽ làm kết quả cũ gắn sai task."
                />
              )}

              <TextField
                label="Tiêu đề"
                value={step.title}
                onChange={(title) => {
                  patchAt(index, { title });
                }}
                disabled={disabled}
                hint={kind === 'lab' ? 'Bắt buộc khi xuất bản lab.' : 'Bỏ trống cũng được.'}
              />

              <TextAreaField
                label="Nội dung (Markdown)"
                rows={6}
                mono
                value={step.markdown}
                onChange={(markdown) => {
                  patchAt(index, { markdown });
                }}
                disabled={disabled}
              />

              {kind === 'lesson' && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <TextAreaField
                    label="Setup foreground"
                    rows={3}
                    mono
                    value={step.setupForeground}
                    onChange={(setupForeground) => {
                      patchAt(index, { setupForeground });
                    }}
                    disabled={disabled}
                  />
                  <TextAreaField
                    label="Setup background"
                    rows={3}
                    mono
                    value={step.setupBackground}
                    onChange={(setupBackground) => {
                      patchAt(index, { setupBackground });
                    }}
                    disabled={disabled}
                  />
                </div>
              )}

              <TextAreaField
                label="Script chấm"
                rows={4}
                mono
                value={step.verifyScript}
                onChange={(verifyScript) => {
                  patchAt(index, { verifyScript });
                }}
                disabled={disabled}
                hint={
                  kind === 'lab'
                    ? 'Bắt buộc: một task không chấm được thì luôn ở trạng thái chưa đạt. Đạt khi exit code = 0.'
                    : 'Bỏ trống nghĩa là bước này chỉ dẫn giải, không chấm. Đạt khi exit code = 0.'
                }
              />

              {kind === 'lab' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Trọng số"
                    value={step.weight}
                    inputMode="numeric"
                    onChange={(weight) => {
                      patchAt(index, { weight });
                    }}
                    error={issueFor(issues, `${at}.weight`)}
                    disabled={disabled}
                    hint="Bỏ trống thì loader áp 1, mọi task nặng như nhau."
                  />
                  <TextField
                    label="Gợi ý"
                    value={step.hint}
                    onChange={(hint) => {
                      patchAt(index, { hint });
                    }}
                    disabled={disabled}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <div>
        <Button variant="outline" onClick={props.onAdd} disabled={disabled}>
          Thêm {noun}
        </Button>
      </div>
    </div>
  );
}
