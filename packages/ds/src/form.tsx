'use client';

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Checkbox as RadixCheckbox, Label as RadixLabel, RadioGroup as RadixRadio, Switch as RadixSwitch } from 'radix-ui';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';

const CONTROL = [
  'w-full rounded-sm border border-control bg-paper text-ink placeholder:text-ink-3',
  'transition-[border-color,box-shadow] duration-150 ease-out',
  'hover:border-ink-3 focus-visible:border-acc-solid focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-acc-tint',
  'aria-invalid:border-bad-solid aria-invalid:focus-visible:ring-bad-tint',
  'disabled:cursor-not-allowed disabled:bg-well disabled:opacity-70',
];

/** Ngữ cảnh Field: id của control, của dòng gợi ý và của dòng lỗi. */
interface FieldIds {
  readonly controlId: string;
  readonly hintId: string | undefined;
  readonly errorId: string | undefined;
  readonly invalid: boolean;
}
const FieldContext = createContext<FieldIds | null>(null);

function useFieldProps(id: string | undefined, describedBy: string | undefined, invalid: boolean | undefined) {
  const field = useContext(FieldContext);
  const ids = [describedBy, field?.hintId, field?.errorId].filter(Boolean).join(' ');
  return {
    id: id ?? field?.controlId,
    'aria-describedby': ids.length > 0 ? ids : undefined,
    'aria-invalid': invalid === true || field?.invalid === true ? true : undefined,
  };
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly icon?: IconName;
  readonly invalid?: boolean;
  readonly inputSize?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, invalid, inputSize = 'md', id, 'aria-describedby': describedBy, ...rest },
  ref,
) {
  const fieldProps = useFieldProps(id, describedBy, invalid);
  const height = inputSize === 'sm' ? 'h-8 text-sm' : inputSize === 'lg' ? 'h-11 text-base' : 'h-9 text-sm';
  const input = (
    <input
      ref={ref}
      className={cn(CONTROL, height, icon === undefined ? 'px-3' : 'pl-9 pr-3', className)}
      {...fieldProps}
      {...rest}
    />
  );
  if (icon === undefined) return input;
  return (
    <span className="relative block">
      <Icon name={icon} size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      {input}
    </span>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean;
  readonly mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, mono = false, id, 'aria-describedby': describedBy, rows = 4, ...rest },
  ref,
) {
  const fieldProps = useFieldProps(id, describedBy, invalid);
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, 'min-h-20 px-3 py-2 text-sm leading-relaxed', mono && 'font-mono text-[13px]', className)}
      {...fieldProps}
      {...rest}
    />
  );
});

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(function Label(
  { className, ...rest },
  ref,
) {
  return <RadixLabel.Root ref={ref} className={cn('text-sm font-medium text-ink', className)} {...rest} />;
});

export interface FieldProps {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  /** Ghi "không bắt buộc" cạnh nhãn. Mặc định mọi trường đều bắt buộc. */
  readonly optional?: ReactNode;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * Nhãn ở trên control, gợi ý ở dưới, lỗi thay gợi ý khi có. Control con tự đọc
 * id và `aria-describedby` từ ngữ cảnh, nên không phải nối tay.
 */
export function Field({ label, hint, error, optional, id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f-${auto}`;
  const hintId = hint === undefined ? undefined : `${controlId}-hint`;
  const errorId = error === undefined || error === null || error === false ? undefined : `${controlId}-error`;
  return (
    <FieldContext.Provider value={{ controlId, hintId, errorId, invalid: errorId !== undefined }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor={controlId}>{label}</Label>
          {optional === undefined ? null : <span className="text-xs text-ink-3">{optional}</span>}
        </div>
        {children}
        {errorId === undefined ? null : (
          <p id={errorId} className="flex items-start gap-1.5 text-sm text-bad-ink">
            <Icon name="warning" size={16} className="mt-0.5" />
            <span>{error}</span>
          </p>
        )}
        {hint === undefined ? null : (
          <p id={hintId} className="text-xs text-ink-3">
            {hint}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export interface CheckboxProps extends Omit<RadixCheckbox.CheckboxProps, 'children'> {
  readonly label?: ReactNode;
  readonly description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { className, label, description, id, ...rest },
  ref,
) {
  const auto = useId();
  const boxId = id ?? `cb-${auto}`;
  const box = (
    <RadixCheckbox.Root
      ref={ref}
      id={boxId}
      className={cn(
        'peer grid size-[18px] shrink-0 place-items-center rounded-xs border border-control bg-paper',
        'transition-colors duration-150 hover:border-ink-3',
        'data-[state=checked]:border-acc-solid data-[state=checked]:bg-acc-solid data-[state=checked]:text-on-solid',
        'data-[state=indeterminate]:border-acc-solid data-[state=indeterminate]:bg-acc-solid data-[state=indeterminate]:text-on-solid',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <RadixCheckbox.Indicator>
        <Icon name={rest.checked === 'indeterminate' ? 'minus' : 'check'} size={14} strokeWidth={2.5} />
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  );
  if (label === undefined) return box;
  return (
    <div className="flex items-start gap-2.5">
      <div className="pt-0.5">{box}</div>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={boxId} className="text-sm text-ink">
          {label}
        </label>
        {description === undefined ? null : <span className="text-xs text-ink-3">{description}</span>}
      </div>
    </div>
  );
});

export interface SwitchProps extends RadixSwitch.SwitchProps {
  readonly label?: ReactNode;
  readonly description?: ReactNode;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { className, label, description, id, ...rest },
  ref,
) {
  const auto = useId();
  const switchId = id ?? `sw-${auto}`;
  const control = (
    <RadixSwitch.Root
      ref={ref}
      id={switchId}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-rule-2 transition-colors duration-200',
        'data-[state=checked]:bg-acc-solid disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      <RadixSwitch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-paper shadow-lift transition-transform duration-200 ease-out data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
  if (label === undefined) return control;
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <label htmlFor={switchId} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description === undefined ? null : <span className="text-xs text-ink-3">{description}</span>}
      </div>
      {control}
    </div>
  );
});

export const RadioGroup = forwardRef<HTMLDivElement, RadixRadio.RadioGroupProps>(function RadioGroup(
  { className, ...rest },
  ref,
) {
  return <RadixRadio.Root ref={ref} className={cn('flex flex-col gap-2', className)} {...rest} />;
});

export interface RadioProps extends RadixRadio.RadioGroupItemProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
}

export const Radio = forwardRef<HTMLButtonElement, RadioProps>(function Radio(
  { className, label, description, id, ...rest },
  ref,
) {
  const auto = useId();
  const radioId = id ?? `rd-${auto}`;
  return (
    <div className="flex items-start gap-2.5">
      <RadixRadio.Item
        ref={ref}
        id={radioId}
        className={cn(
          'mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border border-control bg-paper',
          'transition-colors duration-150 hover:border-ink-3 data-[state=checked]:border-acc-solid',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      >
        <RadixRadio.Indicator className="block size-2 rounded-full bg-acc-solid" />
      </RadixRadio.Item>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={radioId} className="text-sm text-ink">
          {label}
        </label>
        {description === undefined ? null : <span className="text-xs text-ink-3">{description}</span>}
      </div>
    </div>
  );
});

/**
 * Radio trần (không vẽ gì), cho những lựa chọn tự vẽ toàn bộ hình như ô xem trước
 * màu terminal. Nằm trong `RadioGroup` như `Radio`, nên phím mũi tên vẫn đi được.
 */
export const RadioItem = RadixRadio.Item;

