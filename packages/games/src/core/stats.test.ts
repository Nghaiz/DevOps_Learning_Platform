import { describe, expect, it } from 'vitest';
import type { RunResult } from './types.ts';
import { computeStats, durationSeconds, isPassed, percentComplete } from './stats.ts';

function run(overrides: Partial<RunResult> = {}): RunResult {
  return {
    gameId: 'k8s',
    levelId: 'l1',
    seed: 1,
    startedAt: 0,
    finishedAt: 60_000,
    objectivesMet: ['a', 'b'],
    objectivesTotal: 2,
    commandsUsed: 5,
    hintsUsed: 0,
    score: 800,
    ...overrides,
  };
}

describe('isPassed', () => {
  it('đủ objective ⇒ qua', () => {
    expect(isPassed(run())).toBe(true);
  });

  it('thiếu objective ⇒ không qua', () => {
    expect(isPassed(run({ objectivesMet: ['a'] }))).toBe(false);
  });

  /**
   * Bản lưu tới từ `localStorage` và có thể chứa id TRÙNG (bản cũ, hoặc người
   * chơi sửa tay). So bằng `length` sẽ báo qua một level chưa qua — và đó chính
   * là đường gian lận rẻ nhất còn lại sau khi đã có checksum.
   */
  it('id trùng KHÔNG được tính hai lần', () => {
    expect(isPassed(run({ objectivesMet: ['a', 'a'] }))).toBe(false);
  });

  it('objectivesTotal bằng 0 ⇒ không qua', () => {
    expect(isPassed(run({ objectivesMet: [], objectivesTotal: 0 }))).toBe(false);
  });
});

describe('durationSeconds', () => {
  it('tính từ hai mốc epoch ms', () => {
    expect(durationSeconds(run({ startedAt: 1000, finishedAt: 91_000 }))).toBe(90);
  });

  it('đồng hồ nhảy lùi ⇒ 0 chứ không âm', () => {
    expect(durationSeconds(run({ startedAt: 90_000, finishedAt: 1000 }))).toBe(0);
  });
});

describe('percentComplete', () => {
  it('làm tròn', () => {
    expect(percentComplete(run({ objectivesMet: ['a'], objectivesTotal: 3 }))).toBe(33);
  });

  it('không vượt 100 dù có id trùng hay id lạ', () => {
    expect(percentComplete(run({ objectivesMet: ['a', 'b', 'c'], objectivesTotal: 2 }))).toBe(100);
  });
});

describe('computeStats', () => {
  it('mảng rỗng cho thống kê rỗng, không ném', () => {
    const stats = computeStats([]);
    expect(stats.totalRuns).toBe(0);
    expect(stats.clearedLevelIds).toEqual([]);
    expect(stats.longestStreakDays).toBeNull();
  });

  it('gộp nhiều lượt của cùng một level', () => {
    const stats = computeStats([
      run({ levelId: 'l1', score: 500, commandsUsed: 9, objectivesMet: ['a'] }),
      run({ levelId: 'l1', score: 900, commandsUsed: 4 }),
      run({ levelId: 'l1', score: 700, commandsUsed: 2 }),
    ]);
    const l1 = stats.perLevel.get('l1');
    expect(l1?.attempts).toBe(3);
    expect(l1?.cleared).toBe(true);
    expect(l1?.bestScore).toBe(900);
    // Số lệnh của lượt ĐIỂM CAO NHẤT, không phải lượt ít lệnh nhất — hai con số
    // khác nhau, và trộn chúng là cách bảng thống kê nói dối.
    expect(l1?.bestScoreCommands).toBe(4);
    expect(l1?.fewestCommands).toBe(2);
  });

  it('lượt trượt không tính vào fewestCommands', () => {
    const stats = computeStats([
      run({ levelId: 'l1', commandsUsed: 1, objectivesMet: [] }),
      run({ levelId: 'l1', commandsUsed: 8 }),
    ]);
    expect(stats.perLevel.get('l1')?.fewestCommands).toBe(8);
  });

  it('totalBestScore cộng điểm cao nhất MỖI level, chơi lại không cộng dồn', () => {
    const stats = computeStats([
      run({ levelId: 'l1', score: 900 }),
      run({ levelId: 'l1', score: 950 }),
      run({ levelId: 'l2', score: 400 }),
    ]);
    expect(stats.totalBestScore).toBe(1350);
  });

  it('firstClearedAt là mốc SỚM NHẤT, không phụ thuộc thứ tự mảng', () => {
    const later = run({ levelId: 'l1', startedAt: 500_000 });
    const earlier = run({ levelId: 'l1', startedAt: 100_000 });
    expect(computeStats([later, earlier]).perLevel.get('l1')?.firstClearedAt).toBe(100_000);
    expect(computeStats([earlier, later]).perLevel.get('l1')?.firstClearedAt).toBe(100_000);
  });

  it('chuỗi ngày liên tiếp tính theo UTC', () => {
    const day = 86_400_000;
    const stats = computeStats([
      run({ levelId: 'a', startedAt: day * 10 }),
      run({ levelId: 'b', startedAt: day * 11 }),
      run({ levelId: 'c', startedAt: day * 12 }),
      run({ levelId: 'd', startedAt: day * 20 }),
    ]);
    expect(stats.longestStreakDays).toBe(3);
  });

  it('chuỗi chỉ đếm ngày có lượt QUA', () => {
    const day = 86_400_000;
    const stats = computeStats([
      run({ levelId: 'a', startedAt: day * 10 }),
      run({ levelId: 'b', startedAt: day * 11, objectivesMet: [] }),
      run({ levelId: 'c', startedAt: day * 12 }),
    ]);
    expect(stats.longestStreakDays).toBe(1);
  });
});
