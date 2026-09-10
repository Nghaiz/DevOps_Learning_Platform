'use client';

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
        label="Tiêu đề phần"
        value={value.title}
        onChange={(title) => {
          patch({ title });
        }}
        disabled={disabled}
        hint="Bỏ trống cũng được, nội dung upstream thường không có."
      />
      <TextAreaField
        label={props.markdownLabel ?? 'Nội dung (Markdown)'}
        rows={8}
        mono
        value={value.markdown}
        onChange={(markdown) => {
          patch({ markdown });
        }}
        disabled={disabled}
        hint={
          <>
            Khối code có thể mang nút chạy: dùng cú pháp khối code của nội dung nền tảng. Ảnh trỏ tới{' '}
            <code className="font-mono">./assets/&lt;khoá&gt;</code>, lấy khoá ở tab Tệp đính kèm.
          </>
        }
      />
      <TextAreaField
        label="Setup foreground"
        rows={3}
        mono
        value={value.setupForeground}
        onChange={(setupForeground) => {
          patch({ setupForeground });
        }}
        disabled={disabled}
        hint="Chạy bằng bash, hiện trong terminal người học."
      />
      <TextAreaField
        label="Setup background"
        rows={3}
        mono
        value={value.setupBackground}
        onChange={(setupBackground) => {
          patch({ setupBackground });
        }}
        disabled={disabled}
        hint="Chạy bằng bash, ẩn."
      />
      <TextAreaField
        label="Script chấm"
        rows={3}
        mono
        value={value.verifyScript}
        onChange={(verifyScript) => {
          patch({ verifyScript });
        }}
        disabled={disabled}
        hint="Đạt khi exit code = 0. Bỏ trống nghĩa là phần này không chấm."
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
      <Switch id={props.id} checked={props.checked} disabled={props.disabled} onCheckedChange={props.onChange} />
      <Label htmlFor={props.id} className="font-normal">
        {props.label}
      </Label>
    </div>
  );
}
