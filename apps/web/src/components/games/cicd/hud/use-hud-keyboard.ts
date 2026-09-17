'use client';

/**
 * Nối bảng phím tắt vào cửa sổ (19.D.4.8).
 *
 * Toàn bộ phần QUYẾT ĐỊNH (phím nào khớp, có nuốt phím khi đang gõ không) nằm ở
 * `cicd-keymap.ts` — hàm thuần, test được mà không dựng DOM. Ở đây chỉ còn việc
 * gắn/gỡ một `keydown`.
 *
 * ⚠ `preventDefault` CHỈ khi đã khớp. Nuốt mọi phím là chặn `Tab`, chặn phím mũi
 * tên, chặn cả cách người dùng bàn phím đi hết màn — tức phá đúng thứ D.4.8 tồn
 * tại để bảo vệ.
 */

import { useEffect } from 'react';

import { isTypingTarget, matchHotkey, type CicdHotkey } from './cicd-keymap';

export function useHudKeyboard(onHotkey: (hotkey: CicdHotkey) => void): void {
  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      const hotkey = matchHotkey(event, isTypingTarget(event.target));
      if (hotkey === null) return;
      event.preventDefault();
      onHotkey(hotkey);
    };

    window.addEventListener('keydown', handle);
    return () => {
      window.removeEventListener('keydown', handle);
    };
  }, [onHotkey]);
}
