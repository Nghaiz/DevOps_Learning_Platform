'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { Input, Label, Textarea } from '@devops-platform/ui';
import type { FieldIssue } from './draft-form';
import { fieldPathProps } from './studio/field-anchor';

/**
 * Khối nhập dùng lại khắp Xưởng soạn: nhãn trên, ô, câu giải thích, lỗi.
 *
 * `useId()` chứ không phải một chuỗi tự đặt: cùng một tên ô lặp lại ở nhiều
 * bước (`markdown` có một ô cho mỗi bước), nên một `id` cố định sẽ trùng và
 * `htmlFor` trỏ vào ô ĐẦU TIÊN, bấm nhãn của bước 3 nhảy focus lên bước 1. Trùng
 * `id` cũng là lỗi axe `duplicate-id`.
 *
 * `aria-describedby` nối cả câu giải thích lẫn lỗi, LỖI ĐỨNG CUỐI: một ô có cả
 * hai mà chỉ khai một thì trình đọc màn hình đọc thiếu đúng nửa quan trọng.
 *
 * `path` rải `data-field-path` lên khối bọc, để bảng kiểm bên phải đưa focus về
 * đúng ô này khi người soạn bấm vào một lỗi (`studio/field-anchor.ts`).
 */

export function issueFor(issues: readonly FieldIssue[], path: string): string | null {
  return issues.find((issue) => issue.path === path)?.message ?? null;
}

interface FieldShellProps {
  readonly label: string;
  readonly hint?: ReactNode | undefined;
  readonly error?: string | null | undefined;
  /** Đường dữ liệu của ô, khớp `FieldIssue.path`. */
  readonly path?: string | undefined;
  readonly children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, path, children }: FieldShellProps): ReactElement {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint === undefined ? null : hintId, error == null ? null : errorId].filter((x) => x !== null).join(' ') ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5" {...fieldPathProps(path)}>
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </Label>
      {children({ id, describedBy, invalid: error != null })}
      {hint !== undefined && (
        <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
      {error != null && (
        <p id={errorId} className="flex animate-rise items-start gap-1.5 text-xs font-medium text-destructive">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
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
  readonly path?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly inputMode?: 'numeric' | undefined;
}): ReactElement {
  return (
    <Field label={props.label} hint={props.hint} error={props.error} path={props.path}>
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
  readonly path?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly rows?: number | undefined;
  readonly mono?: boolean | undefined;
}): ReactElement {
  return (
    <Field label={props.label} hint={props.hint} error={props.error} path={props.path}>
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
