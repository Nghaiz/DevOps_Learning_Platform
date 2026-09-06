'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { Input, Label, Textarea } from '@devops-platform/ui';
import type { FieldIssue } from './draft-form';

/**
 * Ba khối nhập dùng lại khắp trang soạn bài: nhãn, ô, và câu giải thích.
 *
 * `useId()` chứ không phải một chuỗi tự đặt: form này lặp lại cùng một tên ô ở
 * nhiều bước (`markdown` xuất hiện một lần cho mỗi bước), nên một `id` cố định
 * sẽ trùng, và `htmlFor` sẽ trỏ vào ô ĐẦU TIÊN — bấm vào nhãn của bước 3 nhảy
 * focus lên bước 1. Trùng `id` cũng là một lỗi axe (`duplicate-id`) mà 13.H sẽ
 * bắt.
 *
 * `aria-describedby` nối cả hint lẫn lỗi: một ô có cả hai mà chỉ khai một thì
 * trình đọc màn hình đọc thiếu đúng nửa quan trọng.
 */

export function issueFor(issues: readonly FieldIssue[], path: string): string | null {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}

interface FieldShellProps {
  readonly label: string;
  readonly hint?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  readonly children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, children }: FieldShellProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint === undefined ? null : hintId, error == null ? null : errorId].filter((x) => x !== null).join(' ') ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children({ id, describedBy, invalid: error != null })}
      {hint !== undefined && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error != null && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly inputMode?: 'numeric' | undefined;
}): ReactElement {
  return (
    <Field label={props.label} hint={props.hint} error={props.error}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          aria-describedby={describedBy}
          invalid={invalid}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          inputMode={props.inputMode}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}

export function TextAreaField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly rows?: number | undefined;
  readonly mono?: boolean | undefined;
}): ReactElement {
  return (
    <Field label={props.label} hint={props.hint} error={props.error}>
      {({ id, describedBy, invalid }) => (
        <Textarea
          id={id}
          aria-describedby={describedBy}
          invalid={invalid}
          rows={props.rows ?? 4}
          className={props.mono === true ? 'font-mono text-xs' : undefined}
          value={props.value}
          placeholder={props.placeholder}
          disabled={props.disabled}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      )}
    </Field>
  );
}
