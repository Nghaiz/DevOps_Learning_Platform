'use client';

import { t } from '@devops-platform/copy';
import { useId, type ReactElement } from 'react';
import type { FieldIssue, PhaseFormState } from './draft-form';
import { TextAreaField, TextField, issueFor } from './field';
import { Label, Switch } from '@devops-platform/ds';

/**
 * Một "phase" của bài học (mở đầu / kết thúc): markdown + script.
 *
 * `foreground` và `background` là HAI ô riêng, không phải một, vì upstream phân
 * biệt chúng và DTO giữ nguyên sự phân biệt đó: `foreground` gõ vào terminal
 * người học NHÌN THẤY; `background` chạy ẩn. Gộp chúng ở tầng nhập là mở đường
 * cho một script chuẩn bị chạy trước mắt người học.
 *
 * Đường dữ liệu của ô theo đúng hình dạng body xuất bản (`intro.setup.foreground`),
 * vì cảnh báo shellcheck của server trỏ về đó (`server/content/validate.ts`).
 */
export type PhasePath = 'intro' | 'finish';

export function PhaseSection(props: {
  readonly path: PhasePath;
  readonly toggleLabel: string;
  readonly enabled: boolean;
  readonly onToggle: (enabled: boolean) => void;
  readonly value: PhaseFormState;
  readonly onChange: (next: PhaseFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const switchId = useId();
  return (
    <>
      <div className="flex min-h-10 items-center gap-3 border border-rule px-3 py-2 transition-colors duration-150 has-[[data-state=checked]]:border-acc-mid has-[[data-state=checked]]:bg-acc-wash">
        <Switch
          id={switchId}
          checked={props.enabled}
          disabled={props.disabled}
          onCheckedChange={props.onToggle}
        />
        <Label htmlFor={switchId} className="text-sm font-medium">
          {props.toggleLabel}
        </Label>
      </div>
      {props.enabled && (
        <div className="animate-enter">
          <PhaseFields
            path={props.path}
            value={props.value}
            issues={props.issues}
            disabled={props.disabled}
            onChange={props.onChange}
          />
        </div>
      )}
    </>
  );
}

function PhaseFields(props: {
  readonly path: PhasePath;
  readonly value: PhaseFormState;
  readonly onChange: (next: PhaseFormState) => void;
  readonly issues: readonly FieldIssue[];
  readonly disabled?: boolean | undefined;
}): ReactElement {
  const { path, value, onChange, issues, disabled } = props;
  const patch = (part: Partial<PhaseFormState>): void => {
    onChange({ ...value, ...part });
  };
  const at = (field: string): string => `${path}.${field}`;

  return (
    <div className="flex flex-col gap-6">
      <TextField
        label={t('author.phase-fields-tieu-de-phan')}
        path={at('title')}
        error={issueFor(issues, at('title'))}
        value={value.title}
        onChange={(title) => {
          patch({ title });
        }}
        disabled={disabled}
        hint={t('author.phase-fields-bo-trong-cung-duoc-noi-dung-upstream-thuong-khong-co')}
      />
      <TextAreaField
        label={t('author.phase-fields-noi-dung-markdown')}
        path={at('markdown')}
        error={issueFor(issues, at('markdown'))}
        rows={8}
        mono
        value={value.markdown}
        onChange={(markdown) => {
          patch({ markdown });
        }}
        disabled={disabled}
        hint={<MarkdownHint />}
      />
      <div className="grid gap-6 @2xl:grid-cols-2">
        <TextAreaField
          label={t('author.draft-form-view-setup-foreground')}
          path={at('setup.foreground')}
          error={issueFor(issues, at('setup.foreground'))}
          rows={3}
          mono
          value={value.setupForeground}
          onChange={(setupForeground) => {
            patch({ setupForeground });
          }}
          disabled={disabled}
          hint={t('author.phase-fields-chay-bang-bash-hien-trong-terminal-nguoi-hoc')}
        />
        <TextAreaField
          label={t('author.draft-form-view-setup-background')}
          path={at('setup.background')}
          error={issueFor(issues, at('setup.background'))}
          rows={3}
          mono
          value={value.setupBackground}
          onChange={(setupBackground) => {
            patch({ setupBackground });
          }}
          disabled={disabled}
          hint={t('author.phase-fields-chay-bang-bash-an')}
        />
      </div>
      <TextAreaField
        label={t('author.phase-fields-script-cham')}
        path={at('verifyScript')}
        error={issueFor(issues, at('verifyScript'))}
        rows={3}
        mono
        value={value.verifyScript}
        onChange={(verifyScript) => {
          patch({ verifyScript });
        }}
        disabled={disabled}
        hint={t('author.phase-fields-dat-khi-exit-code-0-bo-trong-nghia-la-phan-nay-khong-cham')}
      />
    </div>
  );
}

/** Câu giải thích cho ô markdown, dùng chung với ô nội dung của từng bước. */
export function MarkdownHint(): ReactElement {
  return (
    <>
      {t('author.phase-fields-khoi-code-co-the-mang-nut-chay-dung-cu-phap-khoi-code-cua-noi-dung-nen-tang')}{' '}
      <code className="font-mono text-ink">{t('author.phase-fields-assets-lt-khoa-gt')}</code>
      {t('author.phase-fields-lay-khoa-o-tab-tep-dinh-kem')}
    </>
  );
}
