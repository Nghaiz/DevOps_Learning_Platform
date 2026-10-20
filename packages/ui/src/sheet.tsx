'use client';

import { createContext, useContext, type ComponentProps } from 'react';
import { Dialog as RadixDialog } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn.ts';

export type SheetSide = 'right' | 'bottom' | 'full';

/**
 * `side` nhận được ở CẢ `Sheet` lẫn `SheetContent`: hợp đồng ui-kit viết
 * "`Sheet` … `{ side }`", và hai cách đọc câu đó đều hợp lý. Hỗ trợ cả hai để
 * lane nào viết theo cách nào cũng chạy đúng; `SheetContent` thắng khi cả hai
 * cùng có mặt vì nó gần phần tử được vẽ hơn.
 */
const SheetSideContext = createContext<SheetSide | undefined>(undefined);

export interface SheetProps extends ComponentProps<typeof RadixDialog.Root> {
  readonly side?: SheetSide;
}

export function Sheet({ side, ...props }: SheetProps) {
  return (
    <SheetSideContext.Provider value={side}>
      <RadixDialog.Root {...props} />
    </SheetSideContext.Provider>
  );
}

export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;

const SIDE: Record<SheetSide, string> = {
  // Tấm phải TRƯỢT VÀO từ mép phải, không nhô lên như hộp thoại. Dùng
  // `@starting-style` (biến thể `starting:`) thay cho một keyframe riêng.
  right:
    'inset-y-0 right-0 h-full w-full max-w-md border-l border-ink shadow-float transition-transform duration-[var(--motion-slow)] ease-out motion-safe:starting:translate-x-full',
  bottom: 'inset-x-0 bottom-0 max-h-[85dvh] w-full border-t border-ink shadow-float animate-rise',
  full: 'inset-0 h-full w-full animate-reveal-down',
};

export interface SheetContentProps extends ComponentProps<typeof RadixDialog.Content> {
  readonly side?: SheetSide;
  /**
   * Nhãn trợ năng của nút X góc trên. Có ⇒ vẽ nút; không có ⇒ không vẽ, nơi
   * gọi tự đặt `SheetClose` ở chỗ của mình. Primitive không mang sẵn chữ tiếng
   * Việt nào — nhãn đến từ `packages/copy` ở phía nơi gọi.
   */
  readonly closeLabel?: string;
}

/**
 * Tấm trượt (Radix Dialog): mép phải, mép dưới, hoặc phủ kín màn hình (menu
 * di động). Mặc định nền `bg-card`; menu di động mực đảo màu thì nơi gọi truyền
 * `className="bg-ink text-ink-foreground"`, nút đóng và mô tả tự theo
 * `currentColor` nên không phải sửa gì thêm.
 */
export function SheetContent({
  side,
  closeLabel,
  className,
  children,
  ...props
}: SheetContentProps) {
  const rootSide = useContext(SheetSideContext);
  const resolved = side ?? rootSide ?? 'right';
  return (
    <RadixDialog.Portal>
      {/*
        Portal gắn vào <body>, ngoài `.legacy-skin` của màn chơi, nên token của legacy.css không tới.
        Bọc trong một khung `contents` mang lại phạm vi đó; KHÔNG gắn lớp lên chính nội dung: quy tắc
        `.legacy-skin { color; font-family }` nằm ngoài @layer và sẽ đè lớp chữ của nó.
      */}
      <div className="legacy-skin contents">
        <RadixDialog.Overlay
          data-slot="sheet-overlay"
          className="fixed inset-0 z-50 bg-background/80"
        />
        <RadixDialog.Content
          data-slot="sheet-content"
          data-side={resolved}
          className={cn(
            'fixed z-50 flex flex-col gap-4 overflow-y-auto bg-card p-6 text-card-foreground outline-none',
            '[animation-duration:var(--motion-base)]',
            SIDE[resolved],
            className,
          )}
          {...props}
        >
          {children}
          {closeLabel !== undefined && (
            <RadixDialog.Close
              data-slot="sheet-close"
              className={cn(
                'absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-control outline-none',
                'transition-colors duration-[var(--motion-fast)] ease-out hover:bg-current/10',
                'focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <X aria-hidden="true" className="size-4" />
              <span className="sr-only">{closeLabel}</span>
            </RadixDialog.Close>
          )}
        </RadixDialog.Content>
      </div>
    </RadixDialog.Portal>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof RadixDialog.Title>) {
  return (
    <RadixDialog.Title data-slot="sheet-title" className={cn('type-title', className)} {...props} />
  );
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof RadixDialog.Description>) {
  return (
    <RadixDialog.Description
      data-slot="sheet-description"
      className={cn('text-sm opacity-80', className)}
      {...props}
    />
  );
}
