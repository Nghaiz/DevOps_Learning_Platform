import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Level } from './contract.ts';
import { createSession } from './session.ts';
import { TICK_MS } from './tick.ts';

const LEVEL: Level = {
  id: 'test-clock',
  chapter: 1,
  title: 'Test',
  mission: 'Không cần làm gì, đây là level đo đồng hồ.',
  brief: '',
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['hoc-tap'],
    resources: [],
  },
  allowedResources: ['Pod'],
  objectives: [{ id: 'o1', label: 'x', check: 'pod-running', required: true }],
  hints: [],
  parMoves: 1,
  teaches: [],
  teaching: { primer: '', cheatsheet: [], takeaways: [] },
};

afterEach(() => {
  vi.useRealTimers();
});

/**
 * `pause()` / `resume()` — vì sao chúng tồn tại thay vì `setSpeed(0)`.
 *
 * `setSpeed` kẹp sàn ở 0.25 và cái kẹp đó phải giữ: chu kỳ `setInterval` bằng 0
 * được trình duyệt hiểu là "nhanh nhất có thể", tức treo tab chứ không báo lỗi.
 * Hệ quả là `setSpeed(0)` cho ra 0.25× — một nút tạm dừng bấm vào thì cụm vẫn
 * chạy, chỉ chậm lại. Nhóm test này đo đúng ranh giới đó.
 */
describe('K8sSession — tạm dừng là trạng thái, không phải một mức tốc độ', () => {
  it('setSpeed(0) KHÔNG dừng cụm — đó là lý do phải có pause()', () => {
    vi.useFakeTimers();
    const session = createSession({ level: LEVEL, seed: 1 });
    try {
      session.setSpeed(0);
      vi.advanceTimersByTime(TICK_MS * 20);
      // 0 bị kẹp lên 0.25×, nên cụm vẫn tiến. Đây là đối chứng dương: nếu ngày
      // nào đó `setSpeed(0)` tự dừng được, phép đo này đỏ và cả nhóm cần đọc lại.
      expect(session.getView().tick).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });

  it('pause() dừng hẳn; resume() chạy tiếp', () => {
    vi.useFakeTimers();
    const session = createSession({ level: LEVEL, seed: 1 });
    try {
      vi.advanceTimersByTime(TICK_MS * 4);
      const before = session.getView().tick;
      expect(before).toBeGreaterThan(0);

      session.pause();
      vi.advanceTimersByTime(TICK_MS * 50);
      expect(session.getView().tick, 'đang dừng thì tick KHÔNG được nhích').toBe(before);

      session.resume();
      vi.advanceTimersByTime(TICK_MS * 4);
      expect(session.getView().tick).toBeGreaterThan(before);
    } finally {
      session.dispose();
    }
  });

  it('pause() hai lần, resume() khi chưa dừng — đều vô hại', () => {
    vi.useFakeTimers();
    const base = createSession({ level: LEVEL, seed: 1 });
    const doubled = createSession({ level: LEVEL, seed: 1 });
    try {
      doubled.pause();
      doubled.pause();
      doubled.resume();
      // `resume()` thừa là chỗ nguy hiểm: không tự bỏ qua thì nó dựng thêm một
      // `setInterval` thứ hai chồng lên cái đang chạy, và cụm đập nhịp GẤP ĐÔI —
      // không có gì đỏ, chỉ có mô phỏng chạy sai tốc độ ghi trên nút.
      doubled.resume();

      vi.advanceTimersByTime(TICK_MS * 10);
      expect(doubled.getView().tick).toBe(base.getView().tick);
    } finally {
      base.dispose();
      doubled.dispose();
    }
  });

  it('setSpeed() trong lúc dừng: nhớ tốc độ mới, KHÔNG khởi động lại đồng hồ', () => {
    vi.useFakeTimers();
    const session = createSession({ level: LEVEL, seed: 1 });
    try {
      session.pause();
      session.setSpeed(4);
      vi.advanceTimersByTime(TICK_MS * 20);
      expect(session.getView().tick, 'kéo thanh tốc độ không được làm cụm chạy lại').toBe(0);

      session.resume();
      vi.advanceTimersByTime(TICK_MS);
      // 4× nghĩa là ~4 tick trong một khoảng TICK_MS. Khẳng định "> 1" chứ không
      // "= 4": phép đo cần chứng minh `resume()` trả về tốc độ NGƯỜI DÙNG chọn
      // chứ không nhảy về 1×, và ghim đúng con số sẽ vỡ mỗi lần ai đó chỉnh cách
      // làm tròn chu kỳ mà hành vi vẫn đúng.
      expect(session.getView().tick).toBeGreaterThan(1);
    } finally {
      session.dispose();
    }
  });
});
