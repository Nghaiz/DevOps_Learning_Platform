'use client';

import { useId, type ReactElement, type ReactNode } from 'react';
import { Checkbox, cn } from '@devops-platform/ui';
import { fieldPathProps } from '../../../components/author/studio';

/**
 * Nhóm ô đánh dấu có tên: `fieldset` + `legend`, câu lỗi nối vào nhóm qua
 * `aria-describedby`, và `data-field-path` để bảng kiểm nhảy về đúng nhóm.
 *
 * Dùng cho chủ đề và loại tài nguyên cho phép: hai tập đóng, chọn nhiều. Không
 * phải dropdown đa chọn: HTML không có widget gốc cho thứ đó, còn nhóm checkbox
 * đi được bằng Tab từ đầu.
 */
export function CheckTileGroup(props: {
  readonly legend: string;
  readonly path: string;
  readonly error: string | null;
  /** Câu thay cho danh sách khi tập rỗng. */
  readonly empty?: string | undefined;
  readonly dense?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const errorId = useId();
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={props.error === null ? undefined : errorId}
      {...fieldPathProps(props.path)}
    >
      <legend className="mb-1.5 text-[13px] font-semibold text-foreground">{props.legend}</legend>
      {props.empty !== undefined ? (
        <p className="text-sm text-muted-foreground">{props.empty}</p>
      ) : (
        <div className={cn('grid gap-2', props.dense === true ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3')}>
          {props.children}
        </div>
      )}
      {props.error !== null && (
        <p id={errorId} className="animate-rise text-xs font-medium text-destructive">
          {props.error}
        </p>
      )}
    </fieldset>
  );
}

/**
 * Một ô đánh dấu dạng ô gạch: cả khối là vùng bấm, ô đang chọn đảo sang nền
 * nhạt có viền mực. `Checkbox` của Radix vẫn là phần tử nhận focus và mang vai
 * `checkbox`, nên test và trình đọc màn hình tìm nó theo đúng nhãn.
 */
export function CheckTile(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly mono?: boolean;
  readonly onToggle: (next: boolean) => void;
}): ReactElement {
  const id = useId();
  const disabled = props.disabled === true;
  return (
    <div
      className={cn(
        'flex min-h-10 items-center gap-2.5 border px-3 py-2 transition-colors duration-150',
        props.checked ? 'border-foreground bg-muted' : 'border-border',
        disabled ? 'opacity-60' : 'hover:border-foreground',
      )}
    >
      <Checkbox
        id={id}
        checked={props.checked}
        disabled={disabled}
        onCheckedChange={(checked) => {
          props.onToggle(checked === true);
        }}
      />
      <label
        htmlFor={id}
        className={cn(
          'min-w-0 flex-1 text-sm',
          props.mono === true && 'font-mono text-xs',
          disabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer',
        )}
      >
        {props.label}
      </label>
    </div>
  );
}
