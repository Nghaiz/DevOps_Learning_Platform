'use client';

/**
 * E.2, mục tiêu. Một mục tiêu là một testcase: mã, câu mô tả, vị từ chấm, tham
 * số của vị từ, và cờ bắt buộc.
 *
 * Mỗi dòng mang một khoá ổn định từ `useRowKeys`, không mang chỉ số và không
 * mang `objective.id` (người soạn sửa được trường đó). Xem khối đầu `row-keys.ts`.
 */

import type { ReactElement } from 'react';

import { t } from '@devops-platform/copy';
import {
  GIT_PREDICATE_NAMES,
  type GitObjective,
  type GitPredicateName,
} from '@devops-platform/games';

import { ArgEditor } from './arg-editor';
import { CheckField, SelectField, TextField } from './builder-fields';
import { BuilderStep } from './builder-step';
import { useRowKeys } from './row-keys';
import { Button } from '@devops-platform/ds';

const PREDICATE_OPTIONS = GIT_PREDICATE_NAMES.map((name) => ({ value: name, label: name }));

/**
 * Mã mặc định cho mục tiêu mới: `muc-tieu-N`, với N là số đầu tiên chưa ai dùng
 * kể từ `độ dài + 1`. Lấy thẳng `độ dài + 1` thì xoá mục 1 rồi thêm một mục sẽ
 * sinh ra hai mục trùng mã, và người soạn nhận lỗi `muc-tieu-trung-id` cho một
 * thứ họ chưa gõ.
 */
function nextObjectiveId(objectives: readonly GitObjective[]): string {
  const taken = new Set(objectives.map((objective) => objective.id));
  let n = objectives.length + 1;
  while (taken.has(`muc-tieu-${String(n)}`)) n += 1;
  return `muc-tieu-${String(n)}`;
}

export interface ObjectiveEditorProps {
  readonly index: number;
  readonly objectives: readonly GitObjective[];
  readonly onChange: (next: readonly GitObjective[]) => void;
}

export function ObjectiveEditor({
  index: stepIndex,
  objectives,
  onChange,
}: ObjectiveEditorProps): ReactElement {
  const rows = useRowKeys(objectives.length);

  const replace = (index: number, next: GitObjective): void => {
    onChange(objectives.map((o, i) => (i === index ? next : o)));
  };

  return (
    <BuilderStep
      index={stepIndex}
      id="builder-muc-tieu"
      title={t('author.builder.step.objectives')}
      lead={t('author.builder.lead.objectives')}
    >
      {objectives.length > 0 && (
        <ol className="flex flex-col gap-3">
          {objectives.map((objective, index) => {
            const rowKey = rows.keys[index] ?? String(index);
            const prefix = `builder-objective-${rowKey}`;
            const n = index + 1;
            return (
              <li key={rowKey} className="animate-enter">
                <fieldset className="min-w-0 border border-rule bg-paper p-4">
                  <legend className="text-xs font-medium text-ink-3 float-left mb-3 flex w-full items-center gap-2 text-tp-ink">
                    <span aria-hidden className="size-2 shrink-0 bg-tp-solid" />
                    {t('author.builder.objective.legend', { n })}
                  </legend>
                  <div className="clear-left flex flex-col gap-4">
                    <div className="grid gap-4 @lg:grid-cols-2">
                      <TextField
                        id={`${prefix}-id`}
                        label={t('author.builder.objective.id')}
                        mono
                        value={objective.id}
                        onChange={(id) => {
                          replace(index, { ...objective, id });
                        }}
                      />
                      <SelectField
                        id={`${prefix}-check`}
                        label={t('author.builder.objective.check')}
                        mono
                        value={objective.check}
                        options={PREDICATE_OPTIONS}
                        onChange={(value) => {
                          // Đổi vị từ thì BỎ tham số cũ. Giữ lại là chở rác vào
                          // JSON xuất ra: `{ ref: 'main' }` còn nguyên sau khi đổi
                          // sang `stashCount`, engine bỏ qua nó, không cổng nào báo.
                          const { args: _discarded, ...rest } = objective;
                          replace(index, { ...rest, check: value as GitPredicateName });
                        }}
                      />
                    </div>
                    <TextField
                      id={`${prefix}-label`}
                      label={t('author.builder.objective.label')}
                      value={objective.label}
                      onChange={(label) => {
                        replace(index, { ...objective, label });
                      }}
                    />
                    <ArgEditor
                      idPrefix={prefix}
                      index={index}
                      objective={objective}
                      onChange={(next) => {
                        replace(index, next);
                      }}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CheckField
                        id={`${prefix}-required`}
                        label={t('author.builder.objective.required')}
                        checked={objective.required}
                        onChange={(required) => {
                          replace(index, { ...objective, required });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        icon="trash"
                        onClick={() => {
                          rows.remove(index);
                          onChange(objectives.filter((_, i) => i !== index));
                        }}
                      >
                        {t('author.builder.objective.remove', { n })}
                      </Button>
                    </div>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      )}

      <div>
        <Button
          size="sm"
          variant="secondary"
          icon="plus"
          data-testid="git-builder-add-objective"
          onClick={() => {
            rows.append();
            onChange([
              ...objectives,
              { id: nextObjectiveId(objectives), label: '', check: 'refExists', required: true },
            ]);
          }}
        >
          {t('author.builder.objective.add')}
        </Button>
      </div>
    </BuilderStep>
  );
}
