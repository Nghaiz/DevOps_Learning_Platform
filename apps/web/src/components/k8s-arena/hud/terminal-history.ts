'use client';

import { useCallback, useRef } from 'react';

/** Bao nhiêu lệnh gần nhất giữ lại cho mũi tên lên. */
const HISTORY_LIMIT = 50;

export interface CommandHistory {
  readonly push: (command: string) => void;
  /**
   * `1` = lùi về quá khứ (mũi tên lên), `-1` = tiến về hiện tại.
   *
   * Trả chuỗi cần đặt vào ô nhập, hoặc `null` khi không có gì đổi. `null` khác
   * chuỗi rỗng: chuỗi rỗng nghĩa là "đã về lại dòng đang soạn dở", và đó là một
   * thay đổi thật.
   */
  readonly walk: (step: 1 | -1) => string | null;
  /** Người dùng vừa tự gõ ⇒ rời khỏi lịch sử, quay về dòng soạn dở. */
  readonly resetCursor: () => void;
}

/**
 * Lịch sử lệnh theo mũi tên lên/xuống.
 *
 * Giữ trong `useRef` chứ không `useState`, và đó không phải tối ưu sớm: lịch sử
 * KHÔNG được vẽ ra màn hình ở đâu cả — thứ hiển thị là ô nhập, mà ô nhập đã có
 * state riêng. Đưa lịch sử vào state là bắt cả terminal render lại sau mỗi lệnh
 * chỉ để không ai nhìn thấy khác biệt nào.
 *
 * Gõ lại một lệnh dài để sửa một ký tự là thứ làm người ta bỏ bàn phím quay sang
 * chuột — nên đây không phải tiện nghi phụ.
 */
export function useCommandHistory(): CommandHistory {
  const entriesRef = useRef<string[]>([]);
  /** `null` = đang ở dòng soạn dở, không ở trong lịch sử. */
  const cursorRef = useRef<number | null>(null);

  const push = useCallback((command: string): void => {
    entriesRef.current = [command, ...entriesRef.current].slice(0, HISTORY_LIMIT);
    cursorRef.current = null;
  }, []);

  const resetCursor = useCallback((): void => {
    cursorRef.current = null;
  }, []);

  const walk = useCallback((step: 1 | -1): string | null => {
    const entries = entriesRef.current;
    if (entries.length === 0) {
      return null;
    }
    const current = cursorRef.current;
    if (step === 1) {
      const next = current === null ? 0 : Math.min(current + 1, entries.length - 1);
      cursorRef.current = next;
      return entries[next] ?? null;
    }
    if (current === null) {
      return null;
    }
    if (current === 0) {
      cursorRef.current = null;
      return '';
    }
    cursorRef.current = current - 1;
    return entries[current - 1] ?? null;
  }, []);

  return { push, walk, resetCursor };
}
