import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge phải biết các khoá theme riêng của hệ `ds`. Thiếu khai báo thì
 * `text-md` (cỡ chữ) bị hiểu là MÀU chữ và bị nuốt khi đứng cạnh `text-ink`:
 * `cn('text-md', 'text-ink')` trả về đúng `text-ink`, cỡ chữ biến mất mà không có
 * lỗi nào báo. Test của file này giữ cặp đó.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['2xs', 'md'],
      shadow: ['pop', 'lift'],
      animate: [
        'enter',
        'fade',
        'sweep',
        'caret',
        'breathe',
        'draw',
        'stamp',
        'pop-in',
        'pop-out',
        'sheet-in',
        'sheet-out',
        'rise-in',
        'rise-out',
        'overlay-in',
        'overlay-out',
      ],
      ease: ['drawer'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
