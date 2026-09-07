import { describe, expect, it } from 'vitest';
import type { Lab } from '@devops-platform/shared-types/lab';
import {
  computeAttemptDurationSeconds,
  computeLabScore,
  computeLabStatus,
  latestResultPerTask,
} from './lab-score.ts';

function makeLab(overrides: Partial<Lab> = {}): Lab {
  return {
    id: 'demo-lab',
    title: 'Demo',
    description: null,
    toolset: [],
    difficulty: 'beginner',
    estimatedMinutes: 10,
    tier: 'sysbox',
    capabilities: [],
    requiresCapabilities: null,
    backendImageId: 'ubuntu',
    interfaceLayout: null,
    assets: [],
    source: null,
    tasks: [
      { id: 'a', title: 'A', markdown: 'x', verifyScript: 'exit 0', weight: 1, hint: null },
      { id: 'b', title: 'B', markdown: 'x', verifyScript: 'exit 0', weight: 3, hint: null },
    ],
    setup: { foreground: null, background: null },
    passThresholdPercent: 100,
    leaderboard: false,
    ...overrides,
  };
}

/**
 * Trả về dạng DÒNG DB (`checkedAt: Date`) — đó là nguồn mà server thật sự gọi
 * các hàm này với. Dạng đi qua dây (chuỗi ISO) được phủ riêng bởi test
 * "nhận CẢ chuỗi ISO" bên dưới; hai dạng đều phải chạy đúng, và một test chỉ
 * phủ một dạng sẽ xanh trong khi phía kia hỏng.
 */
function result(
  taskId: string,
  exitCode: number,
  checkedAt: Date,
): { taskId: string; exitCode: number; output: string; checkedAt: Date } {
  return { taskId, exitCode, output: '', checkedAt };
}

describe('latestResultPerTask', () => {
  it('không có kết quả nào ⇒ map rỗng', () => {
    expect(latestResultPerTask([])).toEqual(new Map());
  });

  it('một task được chấm HAI LẦN ⇒ giữ dòng có checkedAt lớn hơn (dòng sau thắng)', () => {
    const older = result('a', 1, new Date('2026-01-01T00:00:00Z'));
    const newer = result('a', 0, new Date('2026-01-01T00:05:00Z'));
    const latest = latestResultPerTask([older, newer]);
    expect(latest.get('a')).toBe(newer);

    // Đảo thứ tự mảng — kết quả phải GIỐNG HỆT, vì hàm so `checkedAt`, không so
    // vị trí (trừ ca bằng nhau ở test dưới).
    const latestReversed = latestResultPerTask([newer, older]);
    expect(latestReversed.get('a')).toBe(newer);
  });

  it('checkedAt BẰNG NHAU ⇒ giữ dòng ĐỨNG SAU trong mảng', () => {
    const same = new Date('2026-01-01T00:00:00Z');
    const first = result('a', 1, same);
    const second = result('a', 0, same);
    expect(latestResultPerTask([first, second]).get('a')).toBe(second);
    // Đảo thứ tự: dòng "đứng sau" bây giờ là `first` — nó phải thắng.
    expect(latestResultPerTask([second, first]).get('a')).toBe(first);
  });
});

describe('computeLabScore', () => {
  it('không có kết quả nào ⇒ earnedWeight=0, percent=0, không task nào đạt', () => {
    const score = computeLabScore(makeLab(), []);
    expect(score).toEqual({ earnedWeight: 0, totalWeight: 4, percent: 0, passedTaskIds: [] });
  });

  it('đạt MỘT PHẦN — task nhẹ đạt, task nặng chưa ⇒ percent tính trên totalWeight của MỌI task', () => {
    const score = computeLabScore(makeLab(), [
      result('a', 0, new Date('2026-01-01T00:00:00Z')),
    ]);
    // earnedWeight=1, totalWeight=1+3=4 ⇒ floor(100/4)=25
    expect(score).toEqual({ earnedWeight: 1, totalWeight: 4, percent: 25, passedTaskIds: ['a'] });
  });

  it('mọi task đều đạt ⇒ percent=100', () => {
    const score = computeLabScore(makeLab(), [
      result('a', 0, new Date('2026-01-01T00:00:00Z')),
      result('b', 0, new Date('2026-01-01T00:00:00Z')),
    ]);
    expect(score).toEqual({
      earnedWeight: 4,
      totalWeight: 4,
      percent: 100,
      passedTaskIds: ['a', 'b'],
    });
  });

  it('một task được chấm HAI LẦN (fail rồi pass) ⇒ dùng kết quả MỚI NHẤT', () => {
    const score = computeLabScore(makeLab(), [
      result('a', 1, new Date('2026-01-01T00:00:00Z')),
      result('a', 0, new Date('2026-01-01T00:05:00Z')),
    ]);
    expect(score.passedTaskIds).toEqual(['a']);
    expect(score.earnedWeight).toBe(1);
  });

  it('percent LÀM TRÒN XUỐNG, không làm tròn gần nhất', () => {
    // 3 task cùng weight=1 (totalWeight=3), đạt 2 ⇒ 200/3 = 66.67 ⇒ phải là 66.
    const lab = makeLab({
      tasks: [
        { id: 'a', title: 'A', markdown: 'x', verifyScript: 'exit 0', weight: 1, hint: null },
        { id: 'b', title: 'B', markdown: 'x', verifyScript: 'exit 0', weight: 1, hint: null },
        { id: 'c', title: 'C', markdown: 'x', verifyScript: 'exit 0', weight: 1, hint: null },
      ],
    });
    const score = computeLabScore(lab, [
      result('a', 0, new Date()),
      result('b', 0, new Date()),
    ]);
    expect(score.percent).toBe(66);
  });
});

describe('computeLabStatus', () => {
  it('submittedAt === null ⇒ "in_progress" bất kể điểm', () => {
    const lab = makeLab({ passThresholdPercent: 1 });
    const score = computeLabScore(lab, []);
    expect(computeLabStatus(lab, score, null)).toBe('in_progress');
  });

  it('đã submit, percent >= mốc ⇒ "passed"', () => {
    const lab = makeLab({ passThresholdPercent: 25 });
    const score = computeLabScore(lab, [result('a', 0, new Date())]);
    expect(score.percent).toBe(25);
    expect(computeLabStatus(lab, score, new Date())).toBe('passed');
  });

  it('đã submit, percent < mốc ⇒ "failed"', () => {
    const lab = makeLab({ passThresholdPercent: 50 });
    const score = computeLabScore(lab, [result('a', 0, new Date())]);
    expect(score.percent).toBe(25);
    expect(computeLabStatus(lab, score, new Date())).toBe('failed');
  });
});

describe('computeAttemptDurationSeconds', () => {
  it('submittedAt === null ⇒ null (chưa kết thúc)', () => {
    expect(computeAttemptDurationSeconds(new Date(), null)).toBeNull();
  });

  it('kết thúc sau 90 giây ⇒ 90', () => {
    const startedAt = new Date('2026-01-01T00:00:00Z');
    const submittedAt = new Date('2026-01-01T00:01:30Z');
    expect(computeAttemptDurationSeconds(startedAt, submittedAt)).toBe(90);
  });

  it('lệch đồng hồ ÂM (submittedAt đứng TRƯỚC startedAt) ⇒ kẹp ở 0, không trả số âm', () => {
    const startedAt = new Date('2026-01-01T00:01:00Z');
    const submittedAt = new Date('2026-01-01T00:00:55Z');
    expect(computeAttemptDurationSeconds(startedAt, submittedAt)).toBe(0);
  });
});


describe('mốc thời gian: nhận CẢ Date lẫn chuỗi ISO', () => {
  it('latestResultPerTask xếp đúng thứ tự khi checkedAt là chuỗi ISO', () => {
    const older = { taskId: 'a', exitCode: 1, output: '', checkedAt: '2026-01-01T00:00:00.000Z' };
    const newer = { taskId: 'a', exitCode: 0, output: '', checkedAt: '2026-01-01T00:05:00.000Z' };
    expect(latestResultPerTask([newer, older]).get('a')).toBe(newer);
    expect(latestResultPerTask([older, newer]).get('a')).toBe(newer);
  });

  it('computeAttemptDurationSeconds cho cùng kết quả với Date và với chuỗi ISO', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-01-01T00:02:30Z');
    expect(computeAttemptDurationSeconds(start, end)).toBe(150);
    expect(computeAttemptDurationSeconds(start.toISOString(), end.toISOString())).toBe(150);
  });

  it('computeLabScore chấm đúng khi kết quả mang chuỗi ISO', () => {
    const lab = makeLab();
    const score = computeLabScore(lab, [
      { taskId: 'a', exitCode: 0, checkedAt: '2026-01-01T00:00:00.000Z' },
      { taskId: 'b', exitCode: 1, checkedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(score.passedTaskIds).toEqual(['a']);
  });
});
