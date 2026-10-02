'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@devops-platform/ui';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import { SCENARIO_DIFFICULTIES } from '@devops-platform/shared-types/scenario';
import type { DraftFormState, FieldIssue } from './draft-form';
import { Field, TextAreaField, TextField, issueFor } from './field';

/**
 * Mục "Thông tin chung" của form soạn bài: tên, mô tả, độ khó, thời lượng, và
 * phần chấm điểm của lab.
 *
 * Danh sách độ khó đọc thẳng từ `SCENARIO_DIFFICULTIES` của `shared-types`. Gõ
 * tay mảng đó ở đây là dựng một bản sao sẽ lệch ở lần đầu tiên ai đó thêm một
 * mức, và triệu chứng là "ô chọn thiếu một mục", thứ không ai truy về file này.
 *
 * Ô nào hiện tuỳ loại nội dung: ba schema xuất bản đòi những thứ khác nhau, và
 * hiện `passThresholdPercent` cho một bài học là mời người soạn điền một con số
 * không có tác dụng gì.
 */

/** Radix Select không nhận `''` làm giá trị, nên "chưa chọn" cần một giá trị đặt chỗ. */
export const RADIX_UNSET = 'chua-chon';

export interface DraftFieldGroupProps {
  readonly kind: ContentKind;
  readonly value: DraftFormState;
  readonly onChange: (next: DraftFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
}

export function DraftMetaFields(props: DraftFieldGroupProps): ReactElement {
  const { kind, value, onChange, issues, disabled } = props;
  const patch = (part: Partial<DraftFormState>): void => {
    onChange({ ...value, ...part });
  };

  return (
    <>
      <TextField
        label={t('author.draft-meta-fields-tieu-de')}
        path="title"
        value={value.title}
        onChange={(title) => {
          patch({ title });
        }}
        error={issueFor(issues, 'title')}
        disabled={disabled}
        placeholder={t('author.draft-meta-fields-vi-du-chan-doan-tien-trinh-ngon-cpu')}
      />

      <TextAreaField
        label={t('author.draft-meta-fields-mo-ta')}
        path="description"
        rows={2}
        value={value.description}
        onChange={(description) => {
          patch({ description });
        }}
        error={issueFor(issues, 'description')}
        hint={t('author.draft-meta-fields-mot-cau-hien-tren-the-o-trang-danh-muc-bo-trong-cung-duoc')}
        disabled={disabled}
      />

      {kind !== 'playground' && (
        <div className="grid gap-6 @xl:grid-cols-2">
          <Field
            label={t('author.draft-meta-fields-do-kho')}
            path="difficulty"
            error={issueFor(issues, 'difficulty')}
            hint={
              kind === 'lesson'
                ? t('author.draft-meta-fields-bat-buoc-khi-xuat-ban-schema-bai-hoc-khong-nhan-gia-tri-trong')
                : t('author.draft-meta-fields-bat-buoc-khi-xuat-ban-schema-lab-khong-nhan-gia-tri-trong')
            }
          >
            {({ id, describedBy, invalid }) => (
              <Select
                value={value.difficulty === '' ? RADIX_UNSET : value.difficulty}
                {...(disabled === true ? { disabled: true } : {})}
                onValueChange={(next) => {
                  patch({
                    difficulty: next === RADIX_UNSET ? '' : (next as DraftFormState['difficulty']),
                  });
                }}
              >
                <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={RADIX_UNSET}>{t('author.draft-meta-fields-chua-chon')}</SelectItem>
                  {SCENARIO_DIFFICULTIES.map((level) => (
                    <SelectItem key={level} value={level}>
                      {DIFFICULTY_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <TextField
            label={t('author.draft-meta-fields-thoi-luong-uoc-tinh-phut')}
            path="estimatedMinutes"
            value={value.estimatedMinutes}
            inputMode="numeric"
            onChange={(estimatedMinutes) => {
              patch({ estimatedMinutes });
            }}
            error={issueFor(issues, 'estimatedMinutes')}
            hint={t('author.draft-meta-fields-bo-trong-neu-chua-uoc-tinh-duoc')}
            disabled={disabled}
          />
        </div>
      )}

      {kind === 'lab' && (
        <div className="grid gap-6 @xl:grid-cols-2">
          <TextField
            label={t('author.draft-meta-fields-moc-dat')}
            path="passThresholdPercent"
            value={value.passThresholdPercent}
            inputMode="numeric"
            onChange={(passThresholdPercent) => {
              patch({ passThresholdPercent });
            }}
            error={issueFor(issues, 'passThresholdPercent')}
            hint={t(
              'author.draft-meta-fields-tinh-theo-tong-trong-so-cac-task-da-dat-bat-buoc-khi-xuat-ban-lab',
            )}
            disabled={disabled}
          />
          <Field
            label={t('author.draft-meta-fields-bang-xep-hang')}
            path="leaderboard"
            error={issueFor(issues, 'leaderboard')}
          >
            {({ id, describedBy }) => (
              <div className="flex h-10 items-center gap-3">
                <Switch
                  id={id}
                  aria-describedby={describedBy}
                  checked={value.leaderboard}
                  disabled={disabled}
                  onCheckedChange={(leaderboard) => {
                    patch({ leaderboard });
                  }}
                />
                <span
                  className={
                    value.leaderboard
                      ? 'text-sm font-medium text-line-cicd-ink transition-colors'
                      : 'text-sm text-muted-foreground transition-colors'
                  }
                >
                  {value.leaderboard
                    ? t('author.draft-meta-fields-bat-cho-lab-nay')
                    : t('author.draft-meta-fields-tat-mac-dinh-cua-nen-tang')}
                </span>
              </div>
            )}
          </Field>
        </div>
      )}
    </>
  );
}

const DIFFICULTY_LABELS: Readonly<Record<(typeof SCENARIO_DIFFICULTIES)[number], string>> = {
  beginner: t('common.difficulty.beginner'),
  intermediate: t('common.difficulty.intermediate'),
  advanced: t('common.difficulty.advanced'),
};
