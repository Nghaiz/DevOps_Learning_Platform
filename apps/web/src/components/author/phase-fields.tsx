'use client';

import { t } from '@devops-platform/copy';
import type { ReactElement } from 'react';
import { Switch, Label } from '@devops-platform/ui';
import type { PhaseFormState } from './draft-form';
import { TextAreaField, TextField } from './field';

/**
 * Một "phase" của bài học (mở đầu / kết thúc) — markdown + script.
 *
 * `foreground` và `background` là HAI ô riêng, không phải một, vì upstream phân
 * biệt chúng và DTO giữ nguyên sự phân biệt đó: `foreground` gõ vào terminal
 * người học NHÌN THẤY; `background` chạy ẩn. Gộp chúng lại ở tầng nhập là mở
 * đường cho một script chuẩn bị chạy trước mắt người học.
 */
export function PhaseFields(props: {
  readonly value: PhaseFormState;
  readonly onChange: (next: PhaseFormState) => void;
  readonly disabled?: boolean | undefined;
  readonly markdownLabel?: string | undefined;
}): ReactElement {
  const { value, onChange, disabled } = props;
  const patch = (part: Partial<PhaseFormState>): void => {
    onChange({ ...value, ...part });
  };

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={t('author.phase-fields-tieu-de-phan')}
        value={value.title}
        onChange={(title) => {
          patch({ title });
        }}
        disabled={disabled}
        hint={t('author.phase-fields-bo-trong-cung-duoc-noi-dung-upstream-thuong-khong-co')}
      />
      <TextAreaField
        label={props.markdownLabel ?? t('author.phase-fields-noi-dung-markdown')}
        rows={8}
        mono
        value={value.markdown}
        onChange={(markdown) => {
          patch({ markdown });
        }}
        disabled={disabled}
        hint={
          <>
            {t(
              'author.phase-fields-khoi-code-co-the-mang-nut-chay-dung-cu-phap-khoi-code-cua-noi-dung-nen-tang',
            )}{' '}
            <code className="font-mono">{t('author.phase-fields-assets-lt-khoa-gt')}</code>
            {t('author.phase-fields-lay-khoa-o-tab-tep-dinh-kem')}
          </>
        }
      />
      <TextAreaField
        label={t('author.draft-form-view-setup-foreground')}
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
        rows={3}
        mono
        value={value.setupBackground}
        onChange={(setupBackground) => {
          patch({ setupBackground });
        }}
        disabled={disabled}
        hint={t('author.phase-fields-chay-bang-bash-an')}
      />
      <TextAreaField
        label={t('author.phase-fields-script-cham')}
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

/** Bật/tắt một phần tuỳ chọn (mở đầu, kết thúc). */
export function PhaseToggle(props: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean | undefined;
}): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
      <Label htmlFor={props.id} className="font-normal">
        {props.label}
      </Label>
    </div>
  );
}
