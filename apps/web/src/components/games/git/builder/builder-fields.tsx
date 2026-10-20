'use client';

/**
 * Ô nhập của Builder, dựng trên primitive `packages/ds` (`Label`, `Input`,
 * `Textarea`, `NativeSelect`, `Checkbox`).
 *
 * Mỗi ô nhận `id` từ nơi gọi chứ không tự sinh: id là thứ nối `<label>` với ô
 * nhập, và e2e `games-builder-network.spec.ts` tìm ô bằng đúng nhãn đó
 * (`getByLabel('Tiêu đề')`). Câu gợi ý nối vào ô bằng `aria-describedby` nên
 * trình đọc màn hình đọc nó ngay sau nhãn.
 *
 * Ô chọn là `NativeSelect` (`<select>` gốc) chứ không phải `Select` của Radix: Radix
 * không nhận giá trị rỗng cho một mục, mà "không kèm bài đọc" chính là giá trị rỗng.
 */

import { useState, type ReactElement } from 'react';
import { Checkbox, cn, Input, Label, NativeSelect, Textarea } from '@devops-platform/ds';


interface FieldBase {
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  /** Nhãn và nội dung đọc như mã: tên tham số, lệnh, JSON. */
  readonly mono?: boolean | undefined;
}

function hintIdOf(id: string, hint: string | undefined): string | undefined {
  return hint === undefined ? undefined : `${id}-hint`;
}

function FieldHint({
  id,
  text,
}: {
  readonly id: string | undefined;
  readonly text: string | undefined;
}) {
  if (id === undefined || text === undefined) return null;
  return (
    <p id={id} className="text-xs leading-relaxed text-ink-2">
      {text}
    </p>
  );
}

/** Nhãn luôn là chữ thường, kể cả ô `mono`: chỉ GIÁ TRỊ (mã, lệnh, JSON) mới viết mono. */
function FieldLabel({ id, label }: Pick<FieldBase, 'id' | 'label'>) {
  return (
    <Label htmlFor={id} className="leading-snug">
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
      <FieldLabel id={id} label={label} />
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
      <NativeSelect
        id={id}
        value={value}
        aria-describedby={hintId}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={cn(mono === true && 'font-mono')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <FieldHint id={hintId} text={hint} />
    </div>
  );
}

export interface CheckFieldProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean | undefined;
  readonly mono?: boolean | undefined;
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
