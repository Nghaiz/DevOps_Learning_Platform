import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FrameCallback, MatchMediaLike, MediaQueryChangeListener } from './reduced-motion.ts';
import {
  REDUCED_MOTION_QUERY,
  STATIC_FRAME_TIME_MS,
  prefersReducedMotion,
  reducedMotionStore,
  startGatedFrameLoop,
  subscribeReducedMotion,
} from './reduced-motion.ts';

/**
 * Test đi qua BARREL (`./reduced-motion.ts`) chứ không qua từng file con: nếu
 * một xuất rơi ra khỏi barrel thì subpath `@devops-platform/motion/reduced-motion`
 * mất nó, và đó là hỏng thật với mọi lane tiêu thụ — kể cả khi file con vẫn xanh.
 */

// ── Giả lập MediaQueryList ───────────────────────────────────────────────────

type MqlMode = 'modern' | 'legacy' | 'inert';

interface FakeMediaQuery {
  readonly matchMedia: MatchMediaLike;
  /** Đổi cài đặt hệ điều hành GIỮA phiên và bắn sự kiện `change`. */
  setMatches(next: boolean): void;
  readonly queries: string[];
  listenerCount(): number;
}

/**
 * `legacy` = Safari < 14: chỉ có `addListener`/`removeListener`.
 * `inert` = không có kênh nào — chứng minh cổng không ném khi hết đường đăng ký.
 */
function createFakeMediaQuery(initial: boolean, mode: MqlMode = 'modern'): FakeMediaQuery {
  let matches = initial;
  const listeners = new Set<MediaQueryChangeListener>();
  const queries: string[] = [];

  const base = {
    get matches(): boolean {
      return matches;
    },
  };

  const modern = {
    ...base,
    addEventListener(_type: 'change', listener: MediaQueryChangeListener): void {
      listeners.add(listener);
    },
    removeEventListener(_type: 'change', listener: MediaQueryChangeListener): void {
      listeners.delete(listener);
    },
  };

  const legacy = {
    ...base,
    addListener(listener: MediaQueryChangeListener): void {
      listeners.add(listener);
    },
    removeListener(listener: MediaQueryChangeListener): void {
      listeners.delete(listener);
    },
  };

  const mql = mode === 'modern' ? modern : mode === 'legacy' ? legacy : base;

  return {
    matchMedia: (query: string) => {
      queries.push(query);
      return mql;
    },
    setMatches(next: boolean): void {
      matches = next;
      for (const listener of [...listeners]) {
        listener({ matches: next });
      }
    },
    queries,
    listenerCount: () => listeners.size,
  };
}

// ── Giả lập requestAnimationFrame ────────────────────────────────────────────

function createFrameDriver() {
  let nextHandle = 1;
  const pending = new Map<number, FrameCallback>();
  const cancelled: number[] = [];

  const requestFrame = vi.fn((callback: FrameCallback): number => {
    const handle = nextHandle;
    nextHandle += 1;
    pending.set(handle, callback);
    return handle;
  });

  const cancelFrame = vi.fn((handle: number): void => {
    pending.delete(handle);
    cancelled.push(handle);
  });

  /** Chạy mọi khung đang chờ. Trả số khung đã chạy. */
  function drive(timeMs: number): number {
    const batch = [...pending.values()];
    pending.clear();
    for (const callback of batch) {
      callback(timeMs);
    }
    return batch.length;
  }

  return { requestFrame, cancelFrame, drive, cancelled, pendingCount: (): number => pending.size };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── prefersReducedMotion ─────────────────────────────────────────────────────

describe('prefersReducedMotion', () => {
  it('đọc `matches` của đúng query §7', () => {
    const fake = createFakeMediaQuery(true);
    expect(prefersReducedMotion(fake.matchMedia)).toBe(true);
    expect(fake.queries).toEqual([REDUCED_MOTION_QUERY]);
  });

  it('trả false khi người dùng KHÔNG bật — đối chứng dương của ca trên', () => {
    const fake = createFakeMediaQuery(false);
    expect(prefersReducedMotion(fake.matchMedia)).toBe(false);
  });

  it('trả false ở SSR (`null` ép coi như không có matchMedia)', () => {
    expect(prefersReducedMotion(null)).toBe(false);
  });

  it('trả false khi global không có matchMedia — môi trường node của chính suite này', () => {
    expect(globalThis.matchMedia).toBeUndefined();
    expect(prefersReducedMotion()).toBe(false);
  });

  it('ĐỌC global khi không tiêm gì — chứng minh nhánh mặc định có nối dây', () => {
    const fake = createFakeMediaQuery(true);
    vi.stubGlobal('matchMedia', fake.matchMedia);
    expect(prefersReducedMotion()).toBe(true);
    expect(fake.queries).toEqual([REDUCED_MOTION_QUERY]);
  });

  it('trả false thay vì ném khi matchMedia ném', () => {
    const throwing: MatchMediaLike = () => {
      throw new Error('Illegal invocation');
    };
    expect(prefersReducedMotion(throwing)).toBe(false);
  });
});

// ── subscribeReducedMotion ───────────────────────────────────────────────────

describe('subscribeReducedMotion', () => {
  it('nhận thay đổi giữa phiên qua addEventListener("change")', () => {
    const fake = createFakeMediaQuery(false);
    const seen: boolean[] = [];
    const unsubscribe = subscribeReducedMotion((reduced) => seen.push(reduced), fake.matchMedia);

    fake.setMatches(true);
    fake.setMatches(false);

    expect(seen).toEqual([true, false]);
    unsubscribe();
    expect(fake.listenerCount()).toBe(0);

    fake.setMatches(true);
    expect(seen).toEqual([true, false]);
  });

  it('rơi về addListener khi không có addEventListener (Safari < 14)', () => {
    const fake = createFakeMediaQuery(false, 'legacy');
    const seen: boolean[] = [];
    const unsubscribe = subscribeReducedMotion((reduced) => seen.push(reduced), fake.matchMedia);

    fake.setMatches(true);
    expect(seen).toEqual([true]);

    unsubscribe();
    expect(fake.listenerCount()).toBe(0);
  });

  it('trả một hàm huỷ GỌI ĐƯỢC khi không đăng ký được gì', () => {
    expect(() => subscribeReducedMotion(() => {}, null)()).not.toThrow();
    const inert = createFakeMediaQuery(false, 'inert');
    expect(() => subscribeReducedMotion(() => {}, inert.matchMedia)()).not.toThrow();
  });
});

// ── startGatedFrameLoop — cổng thật, kèm đối chứng dương ─────────────────────

describe('startGatedFrameLoop', () => {
  it('reduce=true ⇒ KHÔNG có vòng lặp nào, đúng một khung tĩnh', () => {
    const fake = createFakeMediaQuery(true);
    const driver = createFrameDriver();
    const frames: number[] = [];

    const stop = startGatedFrameLoop({
      onFrame: (t) => frames.push(t),
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      matchMedia: fake.matchMedia,
    });

    expect(driver.requestFrame).toHaveBeenCalledTimes(0);
    expect(frames).toEqual([STATIC_FRAME_TIME_MS]);
    expect(driver.drive(16)).toBe(0);
    expect(frames).toEqual([STATIC_FRAME_TIME_MS]);

    stop();
  });

  it('ĐỐI CHỨNG DƯƠNG — reduce=false ⇒ vòng lặp CÓ chạy', () => {
    const fake = createFakeMediaQuery(false);
    const driver = createFrameDriver();
    const frames: number[] = [];

    const stop = startGatedFrameLoop({
      onFrame: (t) => frames.push(t),
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      matchMedia: fake.matchMedia,
    });

    expect(driver.requestFrame).toHaveBeenCalledTimes(1);
    driver.drive(16);
    driver.drive(32);
    driver.drive(48);

    expect(frames).toEqual([16, 32, 48]);
    expect(driver.requestFrame).toHaveBeenCalledTimes(4);

    stop();
  });

  it('bật cờ GIỮA CHỪNG ⇒ huỷ khung đang chờ, vẽ khung tĩnh, ngừng lập lịch', () => {
    const fake = createFakeMediaQuery(false);
    const driver = createFrameDriver();
    const frames: number[] = [];

    const stop = startGatedFrameLoop({
      onFrame: (t) => frames.push(t),
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      matchMedia: fake.matchMedia,
    });

    driver.drive(16);
    expect(frames).toEqual([16]);
    const requestsBefore = driver.requestFrame.mock.calls.length;

    fake.setMatches(true);

    expect(driver.cancelFrame).toHaveBeenCalledTimes(1);
    expect(driver.pendingCount()).toBe(0);
    expect(frames).toEqual([16, STATIC_FRAME_TIME_MS]);
    expect(driver.requestFrame.mock.calls.length).toBe(requestsBefore);

    expect(driver.drive(32)).toBe(0);
    expect(frames).toEqual([16, STATIC_FRAME_TIME_MS]);

    stop();
  });

  it('tắt cờ giữa chừng ⇒ vòng lặp khởi động lại, không cần tải lại trang', () => {
    const fake = createFakeMediaQuery(true);
    const driver = createFrameDriver();
    const frames: number[] = [];

    const stop = startGatedFrameLoop({
      onFrame: (t) => frames.push(t),
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      matchMedia: fake.matchMedia,
    });

    expect(driver.requestFrame).toHaveBeenCalledTimes(0);

    fake.setMatches(false);
    expect(driver.requestFrame).toHaveBeenCalledTimes(1);
    driver.drive(16);
    expect(frames).toEqual([STATIC_FRAME_TIME_MS, 16]);

    stop();
  });

  it('stop() gỡ listener, huỷ khung đang chờ, và gọi lại vô hại', () => {
    const fake = createFakeMediaQuery(false);
    const driver = createFrameDriver();
    const frames: number[] = [];

    const stop = startGatedFrameLoop({
      onFrame: (t) => frames.push(t),
      requestFrame: driver.requestFrame,
      cancelFrame: driver.cancelFrame,
      matchMedia: fake.matchMedia,
    });

    expect(fake.listenerCount()).toBe(1);
    stop();

    expect(fake.listenerCount()).toBe(0);
    expect(driver.cancelFrame).toHaveBeenCalledTimes(1);
    expect(driver.drive(16)).toBe(0);
    expect(frames).toEqual([]);

    expect(() => stop()).not.toThrow();
    expect(driver.cancelFrame).toHaveBeenCalledTimes(1);
  });

  it('không có rAF (SSR) ⇒ một khung tĩnh, không ném', () => {
    const frames: number[] = [];
    const stop = startGatedFrameLoop({
      onFrame: (t) => frames.push(t),
      requestFrame: null,
      cancelFrame: null,
      matchMedia: null,
    });

    expect(frames).toEqual([STATIC_FRAME_TIME_MS]);
    expect(() => stop()).not.toThrow();
  });

  it('dùng rAF của global khi không tiêm gì', () => {
    const fake = createFakeMediaQuery(false);
    const driver = createFrameDriver();
    vi.stubGlobal('matchMedia', fake.matchMedia);
    vi.stubGlobal('requestAnimationFrame', driver.requestFrame);
    vi.stubGlobal('cancelAnimationFrame', driver.cancelFrame);

    const frames: number[] = [];
    const stop = startGatedFrameLoop({ onFrame: (t) => frames.push(t) });

    expect(driver.requestFrame).toHaveBeenCalledTimes(1);
    driver.drive(16);
    expect(frames).toEqual([16]);

    stop();
  });
});

// ── reducedMotionStore ───────────────────────────────────────────────────────

describe('reducedMotionStore', () => {
  it('getServerSnapshot() là false — khớp CSS mặc định, không đẻ hydration mismatch', () => {
    expect(reducedMotionStore.getServerSnapshot()).toBe(false);
  });

  it('getSnapshot() đọc global và trả nguyên thuỷ (so sánh theo GIÁ TRỊ)', () => {
    const fake = createFakeMediaQuery(true);
    vi.stubGlobal('matchMedia', fake.matchMedia);

    const a = reducedMotionStore.getSnapshot();
    const b = reducedMotionStore.getSnapshot();
    expect(a).toBe(true);
    expect(b).toBe(a);
  });

  it('subscribe() báo cho React mỗi lần cờ đổi, và huỷ được', () => {
    const fake = createFakeMediaQuery(false);
    vi.stubGlobal('matchMedia', fake.matchMedia);

    let notified = 0;
    const unsubscribe = reducedMotionStore.subscribe(() => {
      notified += 1;
    });

    fake.setMatches(true);
    fake.setMatches(false);
    expect(notified).toBe(2);

    unsubscribe();
    fake.setMatches(true);
    expect(notified).toBe(2);
  });
});
