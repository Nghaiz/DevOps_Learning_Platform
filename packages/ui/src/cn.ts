import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Gộp className kiểu shadcn/ui: clsx cho điều kiện, tailwind-merge cho khử trùng lặp. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
