'use client';

import { useSyncExternalStore } from 'react';
import { Toast as RadixToast } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from './cn.ts';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface ToastOptions {
  readonly title: string;
  readonly description?: string;
  readonly variant?: ToastVariant;
}

interface ToastItem extends ToastOptions {
  readonly id: string;
}

const TOAST_DURATION_MS = 5000;

/**
 * Store toàn cục ngoài React (kiểu shadcn/ui `use-toast`) — `useToast()` có
 * thể gọi từ BẤT KỲ component nào (không cần đứng trong cây con của
 * `<Toaster>`), vì `Toaster` chỉ mount MỘT LẦN ở app shell còn nơi gọi
 * `toast()` nằm rải rác khắp trang (form lỗi, hành động quản trị, …).
 * `useSyncExternalStore` là cách React 19 khuyến nghị để một component subscribe
 * vào state ngoài React mà không tạo race giữa nhiều lần render đồng thời.
 */
let toastItems: readonly ToastItem[] = [];
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): readonly ToastItem[] {
  return toastItems;
}

function getServerSnapshot(): readonly ToastItem[] {
  return [];
}

function dismissToast(id: string): void {
  toastItems = toastItems.filter((item) => item.id !== id);
  emitChange();
}

function pushToast(options: ToastOptions): void {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  toastItems = [...toastItems, { id, ...options }];
  emitChange();
  setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
}

export function useToast(): { toast(options: ToastOptions): void } {
  return { toast: pushToast };
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-border bg-card text-card-foreground',
  success: 'border-transparent bg-success text-success-foreground',
  destructive: 'border-transparent bg-destructive text-destructive-foreground',
};

/** Đặt DUY NHẤT một lần ở app shell (`apps/web/src/app/layout.tsx`). */
export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <RadixToast.Provider swipeDirection="right" duration={TOAST_DURATION_MS}>
      {items.map((item) => (
        <RadixToast.Root
          key={item.id}
          onOpenChange={(open) => {
            if (!open) dismissToast(item.id);
          }}
          className={cn(
            'grid grid-cols-[1fr_auto] items-start gap-x-3 rounded-md border p-4 shadow-lg',
            VARIANT_CLASSES[item.variant ?? 'default'],
          )}
        >
          <div className="grid gap-1">
            <RadixToast.Title className="text-sm font-medium">{item.title}</RadixToast.Title>
            {item.description !== undefined && (
              <RadixToast.Description className="text-sm opacity-90">{item.description}</RadixToast.Description>
            )}
          </div>
          <RadixToast.Close aria-label="Đóng thông báo" className="rounded-xs opacity-70 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-4" />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}
      <RadixToast.Viewport className="fixed right-0 bottom-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </RadixToast.Provider>
  );
}
