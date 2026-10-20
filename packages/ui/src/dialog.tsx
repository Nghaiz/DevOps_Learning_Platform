'use client';

import type { ComponentProps } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn.ts';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof RadixDialog.Content>) {
  return (
    <RadixDialog.Portal>
      {/*
        Portal gắn vào <body>, ngoài `.legacy-skin` của màn chơi, nên token của legacy.css không tới.
        Bọc trong một khung `contents` mang lại phạm vi đó; KHÔNG gắn lớp lên chính nội dung: quy tắc
        `.legacy-skin { color; font-family }` nằm ngoài @layer và sẽ đè lớp chữ của nó.
      */}
      <div className="legacy-skin contents">
        {/* Màn che bằng chính màu nền trang (giấy / đêm), không phải đen pha alpha:
          `bg-black` là một màu ngoài hệ token, và ở nhánh tối nó gần như không
          tách được hộp thoại khỏi trang phía sau. */}
        <RadixDialog.Overlay
          data-slot="dialog-overlay"
          className="fixed inset-0 z-50 bg-background/80"
        />
        <RadixDialog.Content
          data-slot="dialog-content"
          className={cn(
            /*
             * Căn giữa bằng `inset-0 m-auto h-fit`, KHÔNG bằng
             * `-translate-x-1/2 -translate-y-1/2`: keyframe `animate-rise` animate
             * chính thuộc tính `transform`, nên căn giữa bằng translate thì suốt
             * lúc hộp thoại hiện ra nó bị kéo lệch về góc phải-dưới rồi mới nhảy
             * về giữa.
             */
            'fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg gap-4 overflow-y-auto',
            'rounded-surface border border-ink bg-card p-6 text-card-foreground shadow-float',
            'animate-rise [animation-duration:var(--motion-base)] outline-none',
            className,
          )}
          {...props}
        >
          {children}
          <RadixDialog.Close
            className={cn(
              'absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-control outline-none',
              'text-muted-foreground hover:bg-muted hover:text-foreground',
              'transition-colors duration-[var(--motion-fast)] ease-out',
              'focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none',
            )}
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Đóng</span>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </div>
    </RadixDialog.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="dialog-header" className={cn('flex flex-col gap-1.5', className)} {...props} />
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof RadixDialog.Title>) {
  return (
    <RadixDialog.Title
      data-slot="dialog-title"
      className={cn('type-title pr-8 text-foreground', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}
