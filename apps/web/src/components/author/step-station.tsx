'use client';

import { t } from '@devops-platform/copy';
import { useId, type ReactElement } from 'react';
import type { ContentKind } from '@devops-platform/shared-types/authoring';
import type { FieldIssue, StepFormState } from './draft-form';
import { TextAreaField, TextField, issueFor } from './field';
import { MarkdownHint } from './phase-fields';
import { Button } from '@devops-platform/ds';

/**
 * Một bước (bài học) hoặc một task (lab) trong danh sách của trình soạn.
 *
 * Là `<section aria-labelledby>` có `<h3>` đúng bằng `Bước N` / `Task N`, nên
 * vùng này có tên truy cập và e2e tìm được nó bằng
 * `getByRole('region', { name: 'Bước 1', exact: true })`. Số trên ô tròn
 * chỉ để mắt nhìn (`aria-hidden`), tên vùng không lặp số hai lần.
 *
 * Không phải thẻ: chỉ vạch mảnh ngăn các bước, và khi con trỏ đang ở trong một bước
 * thì vạch trên đầu quét màu nhấn từ trái sang (không dùng viền trái làm dấu hiệu
 * đang chọn).
 *
 * Đường dữ liệu ô: `steps[N].<field>` cho bài học, `task[N].<field>` cho lab,
 * N là vị trí 0-based trong mảng, khớp `toDraftInput` của `draft-form.ts`.
 */
export function StepStation(props: {
  readonly kind: Exclude<ContentKind, 'playground'>;
  readonly index: number;
  readonly total: number;
  readonly step: StepFormState;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
  readonly onPatch: (part: Partial<StepFormState>) => void;
  readonly onMove: (delta: number) => void;
  readonly onRemove: () => void;
}): ReactElement {
  const { kind, index, total, step, issues, disabled, onPatch } = props;
  const headingId = useId();
  const isLab = kind === 'lab';
  const at = (field: string): string => `${isLab ? 'task' : 'steps'}[${String(index)}].${field}`;
  const err = (field: string): string | null => issueFor(issues, at(field));
  const ordinal = String(index + 1);
  const heading = `${isLab ? t('author.step-task') : t('author.step-list-fields-buoc')} ${ordinal}`;
  const hasIssue = issues.some((issue) => issue.path.startsWith(at('')));

  return (
    <section
      aria-labelledby={headingId}
      className="group/station relative animate-enter border-t border-rule pt-5"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 -top-px h-0.5 origin-left scale-x-0 bg-acc-solid transition-transform duration-200 ease-out group-focus-within/station:scale-x-100"
      />
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden
          className={
            hasIssue
              ? 'grid size-10 shrink-0 place-items-center rounded-full bg-bad-solid text-sm font-semibold tabular-nums text-on-solid transition-colors'
              : 'grid size-10 shrink-0 place-items-center rounded-full bg-acc-tint text-sm font-semibold tabular-nums text-acc-ink transition-[transform,background-color,color] duration-200 group-focus-within/station:-translate-y-0.5 group-focus-within/station:bg-acc-solid group-focus-within/station:text-on-solid'
          }
        >
          {ordinal}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 id={headingId} className="text-xs font-medium text-acc-ink">
            {heading}
          </h3>
          <p className={step.title === '' ? 'truncate text-sm text-ink-2' : 'truncate font-display text-lg font-semibold text-ink'}>
            {step.title === '' ? t('author.step-list-fields-chua-dat-ten') : step.title}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-up"
            disabled={disabled === true || index === 0}
            onClick={() => {
              props.onMove(-1);
            }}
          >
            {t('author.step-list-fields-len')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon="arrow-down"
            disabled={disabled === true || index === total - 1}
            onClick={() => {
              props.onMove(1);
            }}
          >
            {t('author.step-list-fields-xuong')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="trash"
            disabled={disabled}
            onClick={props.onRemove}
          >
            {t('common.action.delete')}
          </Button>
        </div>
      </header>

      <div className="@container mt-6 flex flex-col gap-6">
        {isLab && (
          <div className="grid gap-6 @xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TextField
              label={t('author.step-list-fields-id-task')}
              path={at('taskId')}
              error={err('taskId')}
              value={step.taskId}
              onChange={(taskId) => {
                onPatch({ taskId });
              }}
              disabled={disabled}
              placeholder={t('author.step-list-fields-tim-tien-trinh-ngon-cpu')}
              hint={t(
                'author.step-list-fields-chi-a-z0-9-dinh-danh-ben-doi-sau-khi-co-nguoi-lam-bai-se-lam-ket-qua-cu-gan',
              )}
            />
            <TextField
              label={t('author.step-list-fields-trong-so')}
              path={at('weight')}
              error={err('weight')}
              value={step.weight}
              inputMode="numeric"
              onChange={(weight) => {
                onPatch({ weight });
              }}
              disabled={disabled}
              hint={t('author.step-list-fields-bo-trong-thi-loader-ap-1-moi-task-nang-nhu-nhau')}
            />
          </div>
        )}

        <TextField
          label={t('author.draft-meta-fields-tieu-de')}
          path={at('title')}
          error={err('title')}
          value={step.title}
          onChange={(title) => {
            onPatch({ title });
          }}
          disabled={disabled}
          hint={isLab ? t('author.step-list-fields-bat-buoc-khi-xuat-ban-lab') : t('author.step-list-fields-bo-trong-cung-duoc')}
        />

        <TextAreaField
          label={t('author.phase-fields-noi-dung-markdown')}
          path={at('markdown')}
          error={err('markdown')}
          rows={6}
          mono
          value={step.markdown}
          onChange={(markdown) => {
            onPatch({ markdown });
          }}
          disabled={disabled}
          hint={<MarkdownHint />}
        />

        {!isLab && (
          <div className="grid gap-6 @2xl:grid-cols-2">
            <TextAreaField
              label={t('author.draft-form-view-setup-foreground')}
              path={at('setupForeground')}
              error={err('setupForeground')}
              rows={3}
              mono
              value={step.setupForeground}
              onChange={(setupForeground) => {
                onPatch({ setupForeground });
              }}
              disabled={disabled}
            />
            <TextAreaField
              label={t('author.draft-form-view-setup-background')}
              path={at('setupBackground')}
              error={err('setupBackground')}
              rows={3}
              mono
              value={step.setupBackground}
              onChange={(setupBackground) => {
                onPatch({ setupBackground });
              }}
              disabled={disabled}
            />
          </div>
        )}

        <TextAreaField
          label={t('author.phase-fields-script-cham')}
          path={at('verifyScript')}
          error={err('verifyScript')}
          rows={4}
          mono
          value={step.verifyScript}
          onChange={(verifyScript) => {
            onPatch({ verifyScript });
          }}
          disabled={disabled}
          hint={
            isLab
              ? t('author.step-list-fields-bat-buoc-mot-task-khong-cham-duoc-thi-luon-o-trang-thai-chua-dat-dat-khi-ex')
              : t('author.step-list-fields-bo-trong-nghia-la-buoc-nay-chi-dan-giai-khong-cham-dat-khi-exit-code-0')
          }
        />

        {isLab && (
          <TextField
            label={t('author.step-list-fields-goi-y')}
            path={at('hint')}
            error={err('hint')}
            value={step.hint}
            onChange={(hint) => {
              onPatch({ hint });
            }}
            disabled={disabled}
          />
        )}
      </div>
    </section>
  );
}
