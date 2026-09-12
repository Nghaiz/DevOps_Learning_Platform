'use client';

import { t } from '@devops-platform/copy';
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
  const noun = kind === 'lab' ? t('author.step-task-noun') : t('author.preview-panel-buoc');

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
            {t('author.step-list-fields-chua-co')} {noun}{' '}
            {t('author.step-list-fields-nao-xuat-ban-se-bi-tu-choi-schema-doi-it-nhat-mot')} {noun}.
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
                  {kind === 'lab' ? t('author.step-task') : t('author.step-list-fields-buoc')}{' '}
                  {index + 1}
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
                    {t('author.step-list-fields-len')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled === true || index === steps.length - 1}
                    onClick={() => {
                      moveBy(index, 1);
                    }}
                  >
                    {t('author.step-list-fields-xuong')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                      removeAt(index);
                    }}
                  >
                    {t('common.action.delete')}
                  </Button>
                </div>
              </div>

              {kind === 'lab' && (
                <TextField
                  label={t('author.step-list-fields-id-task')}
                  value={step.taskId}
                  onChange={(taskId) => {
                    patchAt(index, { taskId });
                  }}
                  error={issueFor(issues, `${at}.taskId`)}
                  disabled={disabled}
                  placeholder={t('author.step-list-fields-tim-tien-trinh-ngon-cpu')}
                  hint={t(
                    'author.step-list-fields-chi-a-z0-9-dinh-danh-ben-doi-sau-khi-co-nguoi-lam-bai-se-lam-ket-qua-cu-gan',
                  )}
                />
              )}

              <TextField
                label={t('author.draft-meta-fields-tieu-de')}
                value={step.title}
                onChange={(title) => {
                  patchAt(index, { title });
                }}
                disabled={disabled}
                hint={
                  kind === 'lab'
                    ? t('author.step-list-fields-bat-buoc-khi-xuat-ban-lab')
                    : t('author.step-list-fields-bo-trong-cung-duoc')
                }
              />

              <TextAreaField
                label={t('author.phase-fields-noi-dung-markdown')}
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
                    label={t('author.draft-form-view-setup-foreground')}
                    rows={3}
                    mono
                    value={step.setupForeground}
                    onChange={(setupForeground) => {
                      patchAt(index, { setupForeground });
                    }}
                    disabled={disabled}
                  />
                  <TextAreaField
                    label={t('author.draft-form-view-setup-background')}
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
                label={t('author.phase-fields-script-cham')}
                rows={4}
                mono
                value={step.verifyScript}
                onChange={(verifyScript) => {
                  patchAt(index, { verifyScript });
                }}
                disabled={disabled}
                hint={
                  kind === 'lab'
                    ? t(
                        'author.step-list-fields-bat-buoc-mot-task-khong-cham-duoc-thi-luon-o-trang-thai-chua-dat-dat-khi-ex',
                      )
                    : t(
                        'author.step-list-fields-bo-trong-nghia-la-buoc-nay-chi-dan-giai-khong-cham-dat-khi-exit-code-0',
                      )
                }
              />

              {kind === 'lab' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label={t('author.step-list-fields-trong-so')}
                    value={step.weight}
                    inputMode="numeric"
                    onChange={(weight) => {
                      patchAt(index, { weight });
                    }}
                    error={issueFor(issues, `${at}.weight`)}
                    disabled={disabled}
                    hint={t(
                      'author.step-list-fields-bo-trong-thi-loader-ap-1-moi-task-nang-nhu-nhau',
                    )}
                  />
                  <TextField
                    label={t('author.problem.field.hints')}
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
          {t('author.step-list-fields-them')} {noun}
        </Button>
      </div>
    </div>
  );
}
