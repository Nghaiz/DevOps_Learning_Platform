import { describe, expect, it, vi } from 'vitest';

/**
 * `packages/motion` KHÔNG có `react-dom` (chỉ `react` là peerDependency), nên ở
 * đây không render được một component để gọi hook thật. Thay vì bỏ hook lại
 * không có cổng nào — một hook không test được là một hook hỏng trong im lặng —
 * ta chặn `useSyncExternalStore` và khẳng định thứ DUY NHẤT hook này làm: nối
 * đúng ba hàm của `reducedMotionStore`, theo THAM CHIẾU.
 *
 * ⚠ Vì sao "theo tham chiếu" mới là phép gác thật: `useSyncExternalStore` gọi
 * lại `getSnapshot` sau mỗi lần render và so kết quả. Truyền vào một hàm mới
 * mỗi lần render (ví dụ `() => prefersReducedMotion()` viết inline) làm React
 * huỷ và đăng ký lại subscription mỗi render. Nó không báo lỗi — chỉ chậm dần,
 * và với `subscribe` inline thì thành vòng render vô hạn. Khẳng định `toBe`
 * (tham chiếu) chứ không `toEqual` (giá trị) là chỗ bắt được điều đó.
 */

const useSyncExternalStore = vi.fn(
  (_subscribe: unknown, getSnapshot: () => boolean, _getServerSnapshot: () => boolean) =>
    getSnapshot(),
);

vi.mock('react', () => ({ useSyncExternalStore }));

const { reducedMotionStore, useReducedMotion } = await import('./reduced-motion.ts');

describe('useReducedMotion', () => {
  it('nối đúng ba hàm của reducedMotionStore, theo THAM CHIẾU', () => {
    useSyncExternalStore.mockClear();

    useReducedMotion();

    expect(useSyncExternalStore).toHaveBeenCalledTimes(1);
    const call = useSyncExternalStore.mock.calls[0];
    expect(call).toBeDefined();
    expect(call?.[0]).toBe(reducedMotionStore.subscribe);
    expect(call?.[1]).toBe(reducedMotionStore.getSnapshot);
    expect(call?.[2]).toBe(reducedMotionStore.getServerSnapshot);
  });

  it('trả thẳng giá trị mà store cho ra', () => {
    useSyncExternalStore.mockClear();
    useSyncExternalStore.mockReturnValueOnce(true);
    expect(useReducedMotion()).toBe(true);

    useSyncExternalStore.mockReturnValueOnce(false);
    expect(useReducedMotion()).toBe(false);
  });
});
