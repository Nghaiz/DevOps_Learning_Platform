import { describe, expect, it, vi, type Mock } from 'vitest';
import { runFitAfterLayout, type FitScheduler } from './workspace-layout';

/**
 * §C3/§Y1 — `fit()` sau khi hình học khoang terminal đổi.
 *
 * ## Mức test và giới hạn của nó, nói thẳng
 *
 * File này ở mức hàm THUẦN. `runFitAfterLayout` không phải một hàm bọc lấy lệ:
 * nó là TOÀN BỘ thân của `useEffect` trong `useFitOnLayoutChange`, nên test
 * dưới đây chạy đúng mã chạy thật.
 *
 * ⚠ Thứ DUY NHẤT còn ngoài tầm test ở đây là mảng deps `[handle, layout,
 * schedule]`. Nửa quan trọng của nó — "chuỗi `layout` có ĐỔI khi tab đổi và khi
 * kéo thanh chia không" — được gác riêng ở `workspace-tabs.test.ts`
 * (`workspaceLayoutToken`).
 *
 * ⚠ Chú thích cũ ở đây ghi "`apps/web` không có jsdom/RTL nên KHÔNG render nổi
 * hook để quan sát", và ghi nợ nửa còn lại (React thật sự chạy lại effect khi
 * deps đổi) vào report. **Nợ đó đã trả từ 2026-09-08**: jsdom + RTL bật được
 * cho từng file bằng docblock `// @vitest-environment jsdom`, và
 * `workspace-panel.dom.test.tsx` đang quan sát lượt reconcile thật (§Y1 — node
 * terminal giữ nguyên qua chuyển tab). Đừng chép lại câu "không có jsdom" ấy
 * sang file mới.
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

describe('runFitAfterLayout', () => {
  it('KHÔNG gọi fit() ngay trong nhịp render — phải qua scheduler', () => {
    /**
     * Đây là ô quan trọng nhất của file.
     *
     * Effect của React chạy sau khi DOM đã đổi nhưng TRƯỚC khi trình duyệt tính
     * xong bố cục. Gọi `fit()` ngay lúc đó là bắt xterm đo một phần tử mà chiều
     * cao MỚI còn chưa được áp: `getBoundingClientRect()` trả kích thước cũ (hoặc
     * 0×0 nếu vừa thôi `display:none`), `FitAddon` chốt số cột/hàng sai, và người
     * dùng thấy terminal hiện ra với dòng gãy rồi mới tự sửa một nhịp sau.
     */
    const handle = fakeHandle();
    const sched = manualScheduler();

    runFitAfterLayout(handle, sched.schedule);

    expect(handle.fit).not.toHaveBeenCalled();
    expect(sched.pending()).not.toBeNull();

    sched.flush();
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG lên lịch gì khi chưa có handle (terminal chưa nối)', () => {
    const sched = manualScheduler();
    expect(runFitAfterLayout(null, sched.schedule)).toBeUndefined();
    expect(sched.pending()).toBeNull();
  });

  it('trả hàm huỷ — unmount giữa chừng không gọi fit() trên handle đã chết', () => {
    // Không huỷ thì `requestAnimationFrame` vẫn bắn sau khi component biến mất,
    // và `fit()` chạm vào một xterm đã `dispose()`.
    const handle = fakeHandle();
    const sched = manualScheduler();

    const cleanup = runFitAfterLayout(handle, sched.schedule);
    expect(cleanup).toBeTypeOf('function');

    cleanup?.();
    expect(sched.cancelled()).toBe(1);

    sched.flush();
    expect(handle.fit).not.toHaveBeenCalled();
  });

  it('handle MỚI (nối lại) ⇒ fit cái mới, không cái cũ', () => {
    // Handle gắn với ĐÚNG một `Connection` (xem `onReady` ở
    // `packages/terminal/src/terminal-surface.tsx`), nên nối lại là một handle
    // mới. Đó là lý do `handle` nằm trong deps của `useFitOnLayoutChange`, không
    // chỉ `layout`.
    const first = fakeHandle();
    const second = fakeHandle();
    const sched = manualScheduler();

    runFitAfterLayout(first, sched.schedule)?.();
    runFitAfterLayout(second, sched.schedule);
    sched.flush();

    expect(first.fit).not.toHaveBeenCalled();
    expect(second.fit).toHaveBeenCalledTimes(1);
  });

  /**
   * ⚠ KHÔNG còn tham số `visible`, và đó là điểm khác lớn nhất so với bản trước.
   *
   * Bản trước không fit khi vùng đang ẩn, vì xterm đo 0×0 trên `display:none` và
   * một `fit()` lúc đó ghi đè số cột đang đúng. Ở mô hình mới terminal KHÔNG BAO
   * GIỜ bị ẩn (§Y1), nên nhánh ấy là mã chết — và vế an toàn vẫn còn nguyên ở
   * tầng dưới: `TerminalHandle.fit()` của §C3 tự no-op khi terminal đã
   * `dispose()` hoặc container còn 0×0 (`terminal-core.ts`).
   */
  it('luôn lên lịch khi có handle — không có cửa "đang ẩn thì thôi" nữa', () => {
    const handle = fakeHandle();
    const sched = manualScheduler();
    expect(runFitAfterLayout(handle, sched.schedule)).toBeTypeOf('function');
    sched.flush();
    expect(handle.fit).toHaveBeenCalledTimes(1);
  });
});
