import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import {
  COMMAND_WINDOWS,
  CURL_AT,
  STEP_STARTS,
  TERMINAL_STEPS,
  runningPods,
  terminalStateAt,
} from './terminal-script';
import type { TerminalState } from './terminal-script';

/**
 * Kịch bản terminal là hàm thuần của `t`: cuộn xuôi hay cuộn ngược thì cùng một `t` phải ra
 * cùng một khung. Dữ liệu đầu vào lấy từ CHÍNH copy mà `terminal.tsx` dùng, không chép lại.
 */

const COMMANDS: readonly string[] = [
  t('home.term.cmd.build'),
  t('home.term.cmd.apply'),
  t('home.term.cmd.watch'),
  t('home.term.cmd.curl'),
];
const APPLY_LINES = t('home.term.out.apply').split('\n').length;
const POD_COUNT = t('home.term.pods').split('\n').length;

const stateAt = (progress: number): TerminalState =>
  terminalStateAt(progress, COMMANDS, APPLY_LINES, POD_COUNT);

const SWEEP_STEPS = 2000;
const sweep = (): number[] => Array.from({ length: SWEEP_STEPS + 1 }, (_, k) => k / SWEEP_STEPS);

describe('terminal-script · đầu vào thật', () => {
  it('đủ bốn lệnh, ba pod, hai dòng apply', () => {
    expect(COMMANDS).toHaveLength(COMMAND_WINDOWS.length);
    expect(COMMANDS.every((command) => command.length > 0)).toBe(true);
    expect(POD_COUNT).toBe(3);
    expect(APPLY_LINES).toBe(2);
    expect(STEP_STARTS).toHaveLength(TERMINAL_STEPS.length);
  });
});

describe('terminal-script · gõ lệnh', () => {
  it('t=0 chưa gõ ký tự nào', () => {
    expect(stateAt(0).typed).toEqual([0, 0, 0, 0]);
  });

  it('t=1 đã gõ đủ độ dài từng lệnh', () => {
    expect(stateAt(1).typed).toEqual(COMMANDS.map((command) => command.length));
  });

  it('số ký tự đã gõ không giảm theo t và không vượt độ dài lệnh', () => {
    let previous = stateAt(0).typed;
    for (const progress of sweep()) {
      const typed = stateAt(progress).typed;
      typed.forEach((count, index) => {
        expect(count).toBeGreaterThanOrEqual(previous[index] ?? 0);
        expect(count).toBeLessThanOrEqual(COMMANDS[index]?.length ?? 0);
      });
      previous = typed;
    }
  });
});

describe('terminal-script · trạng thái pod', () => {
  it('nấc pod không bao giờ lùi khi t tăng', () => {
    let previous = stateAt(0).phases;
    const regressions: string[] = [];
    for (const progress of sweep()) {
      const phases = stateAt(progress).phases;
      phases.forEach((phase, index) => {
        const before = previous[index] ?? 0;
        if (phase < before) regressions.push(`t=${String(progress)} pod ${String(index)}: ${String(before)} -> ${String(phase)}`);
      });
      previous = phases;
    }
    expect(regressions).toEqual([]);
  });

  it('t=0 mọi pod Pending và chưa hiện dòng nào; t=1 mọi pod Running', () => {
    expect(stateAt(0).phases).toEqual([0, 0, 0]);
    expect(stateAt(0).pods).toBe(0);
    expect(stateAt(1).phases).toEqual([2, 2, 2]);
    expect(stateAt(1).pods).toBe(POD_COUNT);
  });

  it('một pod không đổi nấc trước khi dòng của nó hiện ra', () => {
    for (const progress of sweep()) {
      const state = stateAt(progress);
      state.phases.forEach((phase, index) => {
        if (phase > 0) expect(index, `t=${String(progress)}`).toBeLessThan(state.pods);
      });
    }
  });
});

describe('terminal-script · bước bên cột chú thích', () => {
  it('đổi bước đúng tại từng mốc STEP_STARTS', () => {
    STEP_STARTS.forEach((start, index) => {
      expect(stateAt(start).step, `mốc bước ${String(index)}`).toBe(index);
      if (index > 0) expect(stateAt(start - 1e-6).step, `ngay trước bước ${String(index)}`).toBe(index - 1);
    });
  });

  it('bước không giảm theo t và kết thúc ở bước cuối', () => {
    let previous = 0;
    for (const progress of sweep()) {
      const step = stateAt(progress).step;
      expect(step).toBeGreaterThanOrEqual(previous);
      previous = step;
    }
    expect(stateAt(1).step).toBe(TERMINAL_STEPS.length - 1);
  });
});

describe('terminal-script · runningPods', () => {
  it('0 ở t=0, đủ số pod ở t=1', () => {
    expect(runningPods(stateAt(0))).toBe(0);
    expect(runningPods(stateAt(1))).toBe(POD_COUNT);
  });

  it('mọi pod đã Running khi lệnh curl chạy (output curl khai "pods":3)', () => {
    expect(runningPods(stateAt(CURL_AT))).toBe(POD_COUNT);
    expect(t('home.term.out.curl')).toContain(`"pods":${String(POD_COUNT)}`);
  });

  it('không giảm theo t và không vượt số dòng pod đã hiện', () => {
    let previous = 0;
    for (const progress of sweep()) {
      const state = stateAt(progress);
      const running = runningPods(state);
      expect(running).toBeGreaterThanOrEqual(previous);
      expect(running).toBeLessThanOrEqual(state.pods);
      previous = running;
    }
  });

  it('không đếm pod Running mà dòng của nó chưa hiện', () => {
    const state: TerminalState = { ...stateAt(1), pods: 1 };
    expect(runningPods(state)).toBe(1);
  });
});

describe('terminal-script · tất định', () => {
  it('cùng t cho cùng trạng thái, bất kể thứ tự đã đi qua các t', () => {
    const points = sweep().filter((_, k) => k % 7 === 0);
    const forward = new Map(points.map((progress) => [progress, stateAt(progress)]));
    const backward = new Map([...points].reverse().map((progress) => [progress, stateAt(progress)]));
    /* Thứ tự xáo trộn tất định: bước nhảy nguyên tố cùng nhau với độ dài mảng. */
    const shuffled = new Map<number, TerminalState>();
    for (let k = 0, index = 0; k < points.length; k += 1, index = (index + 97) % points.length) {
      const progress = points[index] ?? 0;
      shuffled.set(progress, stateAt(progress));
    }
    expect(shuffled.size).toBe(points.length);
    for (const progress of points) {
      expect(backward.get(progress), `t=${String(progress)} ngược`).toEqual(forward.get(progress));
      expect(shuffled.get(progress), `t=${String(progress)} xáo`).toEqual(forward.get(progress));
    }
  });
});
