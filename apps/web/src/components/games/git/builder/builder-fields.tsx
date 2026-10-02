'use client';

/**
 * Ô nhập của Builder, dựng trên primitive `packages/ui` (`Label`, `Input`,
 * `Textarea`, `Checkbox`).
 *
 * Mỗi ô nhận `id` từ nơi gọi chứ không tự sinh: id là thứ nối `<label>` với ô
 * nhập, và e2e `games-builder-network.spec.ts` tìm ô bằng đúng nhãn đó
 * (`getByLabel('Tiêu đề')`). Câu gợi ý nối vào ô bằng `aria-describedby` nên
 * trình đọc màn hình đọc nó ngay sau nhãn.
 *
 * Ô chọn là `<select>` gốc chứ không phải `Select` của Radix: Radix không nhận
 * giá trị rỗng cho một mục, mà "không kèm bài đọc" chính là giá trị rỗng.
 */

import { useState, type ReactElement } from 'react';
import { ChevronDown } from 'lucide-react';

import { Checkbox, Input, Label, Textarea, cn } from '@devops-platform/ui';

interface FieldBase {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  /** Nhãn và nội dung đọc như mã: tên tham số, lệnh, JSON. */
  readonly mono?: boolean;
}

function hintIdOf(id: string, hint: string | undefined): string | undefined {
  return hint === undefined ? undefined : `${id}-hint`;
}

function FieldHint({ id, text }: { readonly id: string | undefined; readonly text?: string }) {
  if (id === undefined || text === undefined) return null;
  return (
    <p id={id} className="text-xs leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}

function FieldLabel({ id, label, mono }: Pick<FieldBase, 'id' | 'label' | 'mono'>) {
  return (
    <Label htmlFor={id} className={cn('leading-snug', mono === true && 'font-mono font-medium')}>
      {label}
    </Label>
  );
}

export interface TextFieldProps extends FieldBase {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly type?: 'text' | 'number';
  readonly min?: number;
}

export function TextField({
  id,
  label,
  hint,
  mono,
  value,
  onChange,
  type = 'text',
  min,
}: TextFieldProps): ReactElement {
  const hintId = hintIdOf(id, hint);
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={id} label={label} mono={mono} />
      <Input
        id={id}
        type={type}
        min={min}
        value={value}
        autoComplete="off"
        aria-describedby={hintId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={cn(mono === true && 'font-mono')}
      />
      <FieldHint id={hintId} text={hint} />
    </div>
  );
}

export interface AreaFieldProps extends FieldBase {
  readonly rows: number;
  readonly value: string;
  readonly onChange: (next: string) => void;
}

export function AreaField({
  id,
  label,
  hint,
  mono,
  rows,
  value,
  onChange,
}: AreaFieldProps): ReactElement {
  const hintId = hintIdOf(id, hint);
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={id} label={label} />
      <Textarea
        id={id}
        rows={rows}
        value={value}
        spellCheck={mono !== true}
        aria-describedby={hintId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={cn('min-h-0 resize-y', mono === true && 'font-mono')}
      />
      <FieldHint id={hintId} text={hint} />
    </div>
  );
}

export interface LinesFieldProps<T> extends Omit<AreaFieldProps, 'value' | 'onChange'> {
  readonly value: T;
  /** Chữ trong ô thành giá trị của bản nháp, ví dụ `linesToList`. */
  readonly parse: (text: string) => T;
  /** Giá trị của bản nháp thành chữ trong ô, ví dụ `listToLines`. */
  readonly format: (value: T) => string;
  readonly onChange: (next: T) => void;
}

/**
 * Ô nhiều dòng cho một trường MẢNG của bản nháp.
 *
 * ## Vì sao giữ chữ thô ở đây
 *
 * Vẽ thẳng `format(value)` thì ô không gõ xuống dòng được: phím Enter ở cuối
 * dòng sinh ra một dòng trống, `linesToList` bỏ dòng trống, và ô vẽ lại đúng
 * chuỗi cũ ngay trong lượt đó. e2e dùng `fill()` nên không thấy; người gõ phím
 * thì thấy ngay. Ô này giữ chữ người soạn đang gõ, và chỉ thay nó khi bản nháp
 * đổi từ BÊN NGOÀI (nhập level, mở bản nháp khác), tức khi chữ đang giữ không
 * còn mô tả giá trị của bản nháp nữa.
 */
export function LinesField<T>({
  value,
  parse,
  format,
  onChange,
  ...rest
}: LinesFieldProps<T>): ReactElement {
  const external = format(value);
  const [text, setText] = useState(external);
  // `text !== external` đứng trước để không bao giờ đặt lại cùng một giá trị
  // trong lúc render (React sẽ vẽ lại mãi tới "Too many re-renders").
  const stale = text !== external && format(parse(text)) !== external;
  if (stale) setText(external);

  return (
    <AreaField
      {...rest}
      value={stale ? external : text}
      onChange={(next) => {
        setText(next);
        onChange(parse(next));
      }}
    />
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps extends FieldBase {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (next: string) => void;
}

export function SelectField({
  id,
  label,
  hint,
  mono,
  value,
  options,
  onChange,
}: SelectFieldProps): ReactElement {
  const hintId = hintIdOf(id, hint);
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel id={id} label={label} />
      <div className="relative">
        <select
          id={id}
          value={value}
          aria-describedby={hintId}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className={cn(
            'h-10 w-full appearance-none rounded-none border border-input bg-card pr-9 pl-3 text-base text-foreground sm:text-sm',
            'outline-none transition-colors duration-[var(--motion-fast)] ease-out hover:border-ink',
            'focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ring',
            mono === true && 'font-mono',
          )}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <FieldHint id={hintId} text={hint} />
    </div>
  );
}

export interface CheckFieldProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly mono?: boolean;
}

export function CheckField({
  id,
  label,
  checked,
  onChange,
  disabled,
  mono,
}: CheckFieldProps): ReactElement {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(state) => {
          onChange(state === true);
        }}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className={cn('text-sm leading-snug font-normal', mono === true && 'font-mono')}
      >
        {label}
      </Label>
    </div>
  );
}
