import { describe, expect, it, vi, type Mock } from 'vitest';
import { runFitOnReveal, type FitScheduler } from './workspace-visibility';

/**
 * C3/C5 — `fit()` khi tab chuyển từ ẩn sang hiện.
 *
 * ## Mức test và giới hạn của nó, nói thẳng
 *
 * `apps/web` chạy vitest ở `environment: 'node'` (không jsdom, không RTL — xem
 * chú thích đầu `landmark-contract.test.ts`), nên KHÔNG render nổi hook để quan
 * sát. `runFitOnReveal` không phải một hàm bọc lấy lệ để né chuyện đó: nó là
 * TOÀN BỘ thân của `useEffect` trong `useFitOnReveal`, nên test dưới đây chạy
 * đúng mã chạy thật.
 *
 * ⚠ Thứ DUY NHẤT còn ngoài tầm test ở đây là mảng deps `[visible, handle,
 * schedule]`. Đã ghi vào report — đóng được nó cần jsdom + RTL trong
 * `apps/web/package.json`, thứ lane này không tự thêm (lockfile là file dùng
 * chung của sáu lane).
 */

/**
 * ⚠ Tham số kiểu của `vi.fn` là bắt buộc, không phải trang trí. `vi.fn()` trần
 * trả `Mock<Constructable | Procedure>` — một kiểu KHÔNG khớp `() => void`, nên
 * `FitCapableHandle` từ chối nó và `typecheck` đỏ trong khi `test` vẫn xanh.
 */
function fakeHandle(): { fit: Mock<() => void> } {
  return { fit: vi.fn<() => void>() };
}

/** Scheduler giả: giữ lại callback thay vì chạy ngay, để quan sát được lúc gọi. */
function manualScheduler(): {
  readonly schedule: FitScheduler;
  readonly pending: () => (() => void) | null;
  readonly flush: () => void;
  readonly cancelled: () => number;
} {
  let queued: (() => void) | null = null;
  let cancels = 0;
  return {
    schedule: (run) => {
      queued = run;
      return () => {
        cancels += 1;
        queued = null;
      };
    },
    pending: () => queued,
    flush: () => {
      const run = queued;
      queued = null;
      run?.();
    },
    cancelled: () => cancels,
  };
}

describe('runFitOnReveal', () => {
  it('KHÔNG gọi fit() ngay trong nhịp render — phải qua scheduler', () => {
    /**
     * Đây là ô quan trọng nhất của file.
     *
     * Effect của React chạy sau khi DOM đã đổi nhưng TRƯỚC khi trình duyệt tính
     * xong bố cục. Gọi `fit()` ngay lúc đó là bắt xterm đo một phần tử vừa mới
     * thôi `display:none`: `getBoundingClientRect()` còn 0×0, `FitAddon` chốt
     * số cột tối thiểu, và người dùng thấy terminal hiện ra với dòng gãy rồi
     * mới tự sửa một nhịp sau. Đây là lỗi dễ thấy nhất của cả tính năng.
     */
    const handle = fakeHandle();
    const sched = manualScheduler();

    runFitOnReveal(true, handle, sched.schedule);

    expect(handle.fit).not.toHaveBeenCalled();
    expect(sched.pending()).not.toBeNull();

    sched.flush();
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });

  it('gọi fit() khi vùng đang HIỆN và đã có handle', () => {
    const handle = fakeHandle();
    const sched = manualScheduler();
    runFitOnReveal(true, handle, sched.schedule);
    sched.flush();
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG gọi fit() khi vùng đang ẩn', () => {
    // xterm đo được 0×0 trên `display:none`; một `fit()` ở trạng thái đó ghi đè
    // số cột đang ĐÚNG bằng số cột tối thiểu.
    const handle = fakeHandle();
    const sched = manualScheduler();

    const cleanup = runFitOnReveal(false, handle, sched.schedule);

    expect(cleanup).toBeUndefined();
    expect(sched.pending()).toBeNull();
    sched.flush();
    expect(handle.fit).not.toHaveBeenCalled();
  });

  it('KHÔNG lên lịch gì khi chưa có handle (terminal chưa nối)', () => {
    const sched = manualScheduler();
    expect(runFitOnReveal(true, null, sched.schedule)).toBeUndefined();
    expect(sched.pending()).toBeNull();
  });

  it('trả hàm huỷ — unmount giữa chừng không gọi fit() trên handle đã chết', () => {
    // Không huỷ thì `requestAnimationFrame` vẫn bắn sau khi component biến mất,
    // và `fit()` chạm vào một xterm đã `dispose()`.
    const handle = fakeHandle();
    const sched = manualScheduler();

    const cleanup = runFitOnReveal(true, handle, sched.schedule);
    expect(cleanup).toBeTypeOf('function');

    cleanup?.();
    expect(sched.cancelled()).toBe(1);

    sched.flush();
    expect(handle.fit).not.toHaveBeenCalled();
  });

  it('handle MỚI (nối lại) trong lúc đang hiện ⇒ fit lại cái mới, không cái cũ', () => {
    // Handle gắn với ĐÚNG một `Connection` (xem `onReady` ở
    // `packages/terminal/src/terminal-surface.tsx`), nên nối lại là một handle
    // mới. Đó là lý do `handle` nằm trong deps của `useFitOnReveal`, không chỉ
    // `visible`.
    const first = fakeHandle();
    const second = fakeHandle();
    const sched = manualScheduler();

    runFitOnReveal(true, first, sched.schedule)?.();
    runFitOnReveal(true, second, sched.schedule);
    sched.flush();

    expect(first.fit).not.toHaveBeenCalled();
    expect(second.fit).toHaveBeenCalledTimes(1);
  });
});
