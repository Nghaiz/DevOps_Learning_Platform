'use client';

import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from 'react';
import {
  AlertDialog as RadixAlert,
  Dialog as RadixDialog,
  DropdownMenu as RadixMenu,
  Popover as RadixPopover,
  Select as RadixSelect,
  Tooltip as RadixTooltip,
} from 'radix-ui';
import { cn } from './cn.ts';
import { Icon } from './icons/icon.tsx';
import type { IconName } from './icons/glyphs.ts';
import { Button } from './button.tsx';

/** Mặt nổi dùng chung cho menu, popover, select. Mở từ phía trigger, đóng nhanh hơn mở. */
const FLOAT =
  'z-50 rounded-lg border border-rule bg-paper text-ink shadow-pop data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out';

// ── Select ──────────────────────────────────────────────────────────────────
export const Select = RadixSelect.Root;
export const SelectValue = RadixSelect.Value;
export const SelectGroup = RadixSelect.Group;

export const SelectTrigger = forwardRef<
  ElementRef<typeof RadixSelect.Trigger>,
  ComponentPropsWithoutRef<typeof RadixSelect.Trigger> & { readonly size?: 'sm' | 'md' }
>(function SelectTrigger({ className, children, size = 'md', ...rest }, ref) {
  return (
    <RadixSelect.Trigger
      ref={ref}
      className={cn(
        'inline-flex w-full items-center justify-between gap-2 rounded-sm border border-control bg-paper px-3 text-left text-sm text-ink',
        'transition-[border-color,box-shadow] duration-150 hover:border-ink-3',
        'focus-visible:border-acc-solid focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-acc-tint',
        'data-[placeholder]:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-bad-solid',
        size === 'sm' ? 'h-8' : 'h-9',
        className,
      )}
      {...rest}
    >
      <span className="min-w-0 truncate">{children}</span>
      <RadixSelect.Icon asChild>
        <Icon name="chevrons-up-down" size={16} className="text-ink-3" />
      </RadixSelect.Icon>
    </RadixSelect.Trigger>
  );
});

export const SelectContent = forwardRef<
  ElementRef<typeof RadixSelect.Content>,
  ComponentPropsWithoutRef<typeof RadixSelect.Content>
>(function SelectContent({ className, children, position = 'popper', ...rest }, ref) {
  return (
    <RadixSelect.Portal>
      <RadixSelect.Content
        ref={ref}
        position={position}
        sideOffset={6}
        className={cn(
          FLOAT,
          'max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] origin-(--radix-select-content-transform-origin) overflow-hidden',
          className,
        )}
        {...rest}
      >
        <RadixSelect.Viewport className="p-1">{children}</RadixSelect.Viewport>
      </RadixSelect.Content>
    </RadixSelect.Portal>
  );
});

export const SelectItem = forwardRef<
  ElementRef<typeof RadixSelect.Item>,
  ComponentPropsWithoutRef<typeof RadixSelect.Item>
>(function SelectItem({ className, children, ...rest }, ref) {
  return (
    <RadixSelect.Item
      ref={ref}
      className={cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-3 text-sm text-ink outline-none',
        'data-[highlighted]:bg-well data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:font-medium',
        className,
      )}
      {...rest}
    >
      <span className="absolute left-2 grid size-4 place-items-center">
        <RadixSelect.ItemIndicator>
          <Icon name="check" size={16} className="text-acc-ink" />
        </RadixSelect.ItemIndicator>
      </span>
      <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    </RadixSelect.Item>
  );
});

// ── Dropdown menu ───────────────────────────────────────────────────────────
export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;
export const MenuGroup = RadixMenu.Group;
export const MenuRadioGroup = RadixMenu.RadioGroup;

export const MenuContent = forwardRef<
  ElementRef<typeof RadixMenu.Content>,
  ComponentPropsWithoutRef<typeof RadixMenu.Content>
>(function MenuContent({ className, sideOffset = 6, align = 'end', ...rest }, ref) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          FLOAT,
          'min-w-48 origin-(--radix-dropdown-menu-content-transform-origin) p-1',
          className,
        )}
        {...rest}
      />
    </RadixMenu.Portal>
  );
});

const ITEM =
  'relative flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-sm text-ink outline-none data-[highlighted]:bg-well data-[disabled]:pointer-events-none data-[disabled]:opacity-50';

export const MenuItem = forwardRef<
  ElementRef<typeof RadixMenu.Item>,
  ComponentPropsWithoutRef<typeof RadixMenu.Item> & {
    readonly icon?: IconName;
    readonly tone?: 'default' | 'danger';
  }
>(function MenuItem({ className, icon, tone = 'default', children, ...rest }, ref) {
  return (
    <RadixMenu.Item
      ref={ref}
      className={cn(ITEM, tone === 'danger' && 'text-bad-ink', className)}
      {...rest}
    >
      {icon === undefined ? null : (
        <Icon name={icon} size={16} className={tone === 'danger' ? '' : 'text-ink-2'} />
      )}
      {children}
    </RadixMenu.Item>
  );
});

export const MenuRadioItem = forwardRef<
  ElementRef<typeof RadixMenu.RadioItem>,
  ComponentPropsWithoutRef<typeof RadixMenu.RadioItem> & { readonly icon?: IconName }
>(function MenuRadioItem({ className, icon, children, ...rest }, ref) {
  return (
    <RadixMenu.RadioItem ref={ref} className={cn(ITEM, 'pr-8', className)} {...rest}>
      {icon === undefined ? null : <Icon name={icon} size={16} className="text-ink-2" />}
      {children}
      <RadixMenu.ItemIndicator className="absolute right-2.5">
        <Icon name="check" size={16} className="text-acc-ink" />
      </RadixMenu.ItemIndicator>
    </RadixMenu.RadioItem>
  );
});

export function MenuLabel({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixMenu.Label>) {
  return (
    <RadixMenu.Label className={cn('px-2.5 pb-1 pt-2 text-xs text-ink-3', className)} {...rest} />
  );
}

export function MenuSeparator({
  className,
  ...rest
}: ComponentPropsWithoutRef<typeof RadixMenu.Separator>) {
  return <RadixMenu.Separator className={cn('-mx-1 my-1 h-px bg-rule', className)} {...rest} />;
}

// ── Popover ─────────────────────────────────────────────────────────────────
export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

export const PopoverContent = forwardRef<
  ElementRef<typeof RadixPopover.Content>,
  ComponentPropsWithoutRef<typeof RadixPopover.Content>
>(function PopoverContent({ className, sideOffset = 8, align = 'start', ...rest }, ref) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(
          FLOAT,
          'w-80 origin-(--radix-popover-content-transform-origin) p-4 outline-none',
          className,
        )}
        {...rest}
      />
    </RadixPopover.Portal>
  );
});

// ── Tooltip ─────────────────────────────────────────────────────────────────
export const TooltipProvider = RadixTooltip.Provider;

export interface TipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
}

/** Gợi ý ngắn khi rê hoặc focus. Nội dung quan trọng không được chỉ nằm ở đây. */
/**
 * Tooltip tự mang provider của nó: dùng được ở bất kỳ đâu (kể cả test render riêng một
 * component) mà không bắt cây phía trên phải có `TooltipProvider`.
 */
export function Tip({ content, children, side = 'top' }: TipProps) {
  return (
    <RadixTooltip.Provider delayDuration={350} skipDelayDuration={250}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={6}
            className="z-[60] max-w-72 origin-(--radix-tooltip-content-transform-origin) rounded-sm bg-ink px-2 py-1 text-xs text-canvas data-[state=delayed-open]:animate-pop-in data-[state=closed]:animate-pop-out"
          >
            {content}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}

// ── Dialog ──────────────────────────────────────────────────────────────────
export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

const OVERLAY =
  'fixed inset-0 z-50 bg-overlay/45 data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out';

export interface DialogContentProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixDialog.Content>,
  'title'
> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Nút đóng góc phải. Tắt khi dialog có nút huỷ rõ ràng ở chân. */
  readonly closeLabel?: string;
}

export const DialogContent = forwardRef<ElementRef<typeof RadixDialog.Content>, DialogContentProps>(
  function DialogContent(
    { className, title, description, size = 'md', closeLabel, children, ...rest },
    ref,
  ) {
    const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
    return (
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content
          ref={ref}
          className={cn(
            'fixed left-1/2 top-[max(12vh,1.5rem)] z-50 flex max-h-[min(80dvh,46rem)] w-[calc(100vw-2rem)] -translate-x-1/2 flex-col',
            'rounded-xl border border-rule bg-paper shadow-pop outline-none',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
            width,
            className,
          )}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          {...rest}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="font-display text-xl font-semibold text-ink">
                {title}
              </RadixDialog.Title>
              {description === undefined ? null : (
                <RadixDialog.Description className="text-sm text-ink-2">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            {closeLabel === undefined ? null : (
              <RadixDialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={closeLabel}
                  className="-mr-2 -mt-1"
                >
                  <Icon name="close" size={16} />
                </Button>
              </RadixDialog.Close>
            )}
          </div>
          <div className="relative min-h-0 overflow-y-auto px-6 pb-6 pt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    );
  },
);

/** Hàng nút ở chân dialog: hành động chính bên phải. */
export function DialogActions({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('mt-6 flex flex-wrap items-center justify-end gap-2', className)}>
      {children}
    </div>
  );
}

// ── Confirm (AlertDialog) ───────────────────────────────────────────────────
export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly body?: ReactNode;
  /** Điều sẽ mất, ghi thành câu ("Mất 3 lượt nộp của lớp này"). */
  readonly loss?: ReactNode;
  /** Lý do không làm được: có thì nút xác nhận bị khoá và câu này hiện ra. */
  readonly blockedReason?: ReactNode;
  readonly error?: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly tone?: 'danger' | 'primary';
  readonly confirming?: boolean;
  readonly onConfirm: () => void;
  readonly children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  loss,
  blockedReason,
  error,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  confirming = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const blocked = blockedReason !== undefined && blockedReason !== null;
  return (
    <RadixAlert.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlert.Portal>
        <RadixAlert.Overlay className={OVERLAY} />
        <RadixAlert.Content
          className={cn(
            'fixed left-1/2 top-[max(16vh,1.5rem)] z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-rule bg-paper p-6 shadow-pop outline-none',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
          )}
        >
          <RadixAlert.Title className="font-display text-xl font-semibold text-ink">
            {title}
          </RadixAlert.Title>
          <RadixAlert.Description asChild>
            <div className="mt-2 flex flex-col gap-3 text-sm text-ink-2">
              {body === undefined ? null : <p>{body}</p>}
              {loss === undefined || loss === null ? null : (
                <p className="flex items-start gap-2 rounded-md bg-bad-wash px-3 py-2 text-bad-ink">
                  <Icon name="warning" size={16} className="mt-0.5" />
                  <span>{loss}</span>
                </p>
              )}
              {blocked ? (
                <p className="flex items-start gap-2 rounded-md bg-warn-wash px-3 py-2 text-warn-ink">
                  <Icon name="info" size={16} className="mt-0.5" />
                  <span>{blockedReason}</span>
                </p>
              ) : null}
            </div>
          </RadixAlert.Description>
          {children === undefined ? null : <div className="mt-4">{children}</div>}
          {error === undefined || error === null ? null : (
            <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-bad-ink">
              <Icon name="danger" size={16} className="mt-0.5" />
              <span>{error}</span>
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <RadixAlert.Cancel asChild>
              <Button variant="ghost">{cancelLabel}</Button>
            </RadixAlert.Cancel>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={confirming}
              disabled={blocked}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixAlert.Content>
      </RadixAlert.Portal>
    </RadixAlert.Root>
  );
}

// ── Sheet (ngăn kéo) ────────────────────────────────────────────────────────
export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

export interface SheetContentProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixDialog.Content>,
  'title'
> {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly closeLabel: string;
  readonly width?: 'md' | 'lg';
  readonly footer?: ReactNode;
}

/**
 * Ngăn kéo từ phải trên màn rộng, tấm trượt từ dưới trên điện thoại. Dùng cho form
 * chỉnh một đối tượng mà không rời danh sách (tạo kỳ thi, đổi vai trò).
 */
export const SheetContent = forwardRef<ElementRef<typeof RadixDialog.Content>, SheetContentProps>(
  function SheetContent(
    { className, title, description, closeLabel, width = 'md', footer, children, ...rest },
    ref,
  ) {
    return (
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content
          ref={ref}
          className={cn(
            'fixed z-50 flex flex-col border-rule bg-paper shadow-pop outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl border-t data-[state=open]:animate-rise-in data-[state=closed]:animate-rise-out',
            'sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:rounded-none sm:border-l sm:border-t-0',
            'sm:data-[state=open]:animate-sheet-in sm:data-[state=closed]:animate-sheet-out',
            width === 'lg' ? 'sm:w-[min(100vw,44rem)]' : 'sm:w-[min(100vw,32rem)]',
            className,
          )}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          {...rest}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-4">
            <div className="flex flex-col gap-1">
              <RadixDialog.Title className="font-display text-lg font-semibold text-ink">
                {title}
              </RadixDialog.Title>
              {description === undefined ? null : (
                <RadixDialog.Description className="text-sm text-ink-2">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={closeLabel} className="-mr-2">
                <Icon name="close" size={16} />
              </Button>
            </RadixDialog.Close>
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer === undefined ? null : (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule px-6 py-3">
              {footer}
            </div>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    );
  },
);

/** Khối dựng Dialog thô cho bố cục đặc biệt (menu toàn màn trên điện thoại). */
export const DialogPrimitive = RadixDialog;
