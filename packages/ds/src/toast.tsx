'use client';

import { Toaster as Sonner, toast as sonner } from 'sonner';
import type { ReactNode } from 'react';
import { Icon } from './icons/icon.tsx';

/**
 * Thông báo nổi góc dưới phải (sonner). Mặt giấy, biểu tượng mang màu trạng thái.
 * Chỉ dùng xác nhận một việc vừa xong ("Đã lưu bản nháp"); lỗi cần người dùng sửa
 * thì đặt cạnh chỗ sửa, không đẩy vào toast.
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={8}
      visibleToasts={4}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-[min(92vw,380px)] items-start gap-3 rounded-lg border border-rule bg-paper px-4 py-3 text-sm text-ink shadow-pop',
          title: 'font-medium',
          description: 'mt-0.5 text-ink-2',
          actionButton: 'ml-auto rounded-sm bg-ink px-2.5 py-1 text-xs font-medium text-canvas',
          cancelButton: 'rounded-sm px-2 py-1 text-xs text-ink-2',
          success: '[&_[data-icon]]:text-ok-ink',
          error: '[&_[data-icon]]:text-bad-ink',
          warning: '[&_[data-icon]]:text-warn-ink',
          info: '[&_[data-icon]]:text-info-ink',
        },
      }}
      icons={{
        success: <Icon name="success" size={18} />,
        error: <Icon name="danger" size={18} />,
        warning: <Icon name="warning" size={18} />,
        info: <Icon name="info" size={18} />,
        loading: <Icon name="hourglass" size={18} className="animate-breathe" />,
      }}
    />
  );
}

type ToastOptions = { readonly description?: ReactNode; readonly id?: string | number; readonly duration?: number };

/** Gọi thẳng, ví dụ `toast.success(...)`. Kiểu được khai gọn để không lộ kiểu nội bộ của sonner. */
export const toast: {
  (message: ReactNode, options?: ToastOptions): string | number;
  success(message: ReactNode, options?: ToastOptions): string | number;
  error(message: ReactNode, options?: ToastOptions): string | number;
  warning(message: ReactNode, options?: ToastOptions): string | number;
  info(message: ReactNode, options?: ToastOptions): string | number;
  dismiss(id?: string | number): void;
} = Object.assign((message: ReactNode, options?: ToastOptions) => sonner(message, options), {
  success: (message: ReactNode, options?: ToastOptions) => sonner.success(message, options),
  error: (message: ReactNode, options?: ToastOptions) => sonner.error(message, options),
  warning: (message: ReactNode, options?: ToastOptions) => sonner.warning(message, options),
  info: (message: ReactNode, options?: ToastOptions) => sonner.info(message, options),
  dismiss: (id?: string | number) => {
    sonner.dismiss(id);
  },
});
