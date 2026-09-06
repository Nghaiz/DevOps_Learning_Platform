import { describe, expect, it } from 'vitest';
import { FIRST_PAGE, currentCursor, pageNumber, pushCursor } from './cursor-stack';

describe('ngăn xếp cursor', () => {
  it('trang đầu: không cursor, số trang 1', () => {
    expect(currentCursor(FIRST_PAGE)).toBeUndefined();
    expect(pageNumber(FIRST_PAGE)).toBe(1);
  });

  it('đẩy cursor ⇒ sang trang sau, không sửa ngăn xếp cũ', () => {
    const next = pushCursor(FIRST_PAGE, 'muc-20');

    expect(currentCursor(next)).toBe('muc-20');
    expect(pageNumber(next)).toBe(2);
    expect(FIRST_PAGE).toEqual([undefined]);
  });

  it('nextCursor null (server nói đã hết) ⇒ KHÔNG đẩy', () => {
    const stack = pushCursor(FIRST_PAGE, 'muc-20');

    expect(pushCursor(stack, null)).toBe(stack);
    expect(pageNumber(pushCursor(stack, null))).toBe(2);
  });
});
