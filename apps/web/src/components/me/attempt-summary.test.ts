import { describe, expect, it } from 'vitest';
import type { LabScore } from '@devops-platform/shared-types/lab';
import { formatDuration, summarizeLabAttempt, summarizeQuizAttempt } from './attempt-summary';

const score = (percent: number, passedTaskIds: string[]): LabScore => ({
  earnedWeight: percent,
  totalWeight: 100,
  percent,
  passedTaskIds,
});

describe('summarizeLabAttempt', () => {
  it('đang làm dở: điểm phải nói rõ là ảnh chụp giữa chừng, chưa phải điểm cuối', () => {
    const summary = summarizeLabAttempt({
      status: 'in_progress',
      score: score(40, ['t1']),
      durationSeconds: null,
    });

    expect(summary.statusLabel).toBe('Đang làm dở');
    expect(summary.scoreLabel).toBe('40% tính tới lúc này (chưa nộp)');
    // `computeLabScore` VẪN tính percent cho lần thử chưa nộp; hiện "40%" trần
    // trụi đọc như một điểm đã chốt.
    expect(summary.scoreLabel).not.toBe('40%');
    expect(summary.durationLabel).toBe('chưa nộp');
  });

  it('đã nộp: điểm là điểm cuối, kèm số task đạt', () => {
    const summary = summarizeLabAttempt({
      status: 'passed',
      score: score(90, ['t1', 't2', 't3']),
      durationSeconds: 125,
    });

    expect(summary.statusLabel).toBe('Đạt');
    expect(summary.statusVariant).toBe('success');
    expect(summary.scoreLabel).toBe('90% · đạt 3 nhiệm vụ');
    expect(summary.scoreLabel).not.toContain('tới lúc này');
    expect(summary.durationLabel).toBe('2 phút');
  });

  it('trượt: nhãn nói "Chưa đạt", không nói "Thất bại"', () => {
    const summary = summarizeLabAttempt({
      status: 'failed',
      score: score(30, []),
      durationSeconds: 30,
    });

    expect(summary.statusLabel).toBe('Chưa đạt');
    expect(summary.statusVariant).toBe('destructive');
  });
});

describe('summarizeQuizAttempt', () => {
  it('hiện đúng số câu đúng trên tổng, không chỉ phần trăm', () => {
    const summary = summarizeQuizAttempt({
      score: { correctCount: 7, questionCount: 10, percent: 70, passed: true },
    });

    expect(summary.statusLabel).toBe('Đạt');
    expect(summary.scoreLabel).toBe('7/10 câu đúng · 70%');
  });

  it('trượt', () => {
    const summary = summarizeQuizAttempt({
      score: { correctCount: 2, questionCount: 10, percent: 20, passed: false },
    });

    expect(summary.statusLabel).toBe('Chưa đạt');
    expect(summary.statusVariant).toBe('destructive');
  });
});

describe('formatDuration', () => {
  it('null (chưa nộp) KHÔNG được đọc ra 0 giây', () => {
    expect(formatDuration(null)).toBe('chưa nộp');
    expect(formatDuration(null)).not.toContain('0');
  });

  it('0 giây thật thì vẫn là 0 giây — khác hẳn null', () => {
    expect(formatDuration(0)).toBe('0 giây');
  });

  it('phút và giờ', () => {
    expect(formatDuration(59)).toBe('59 giây');
    expect(formatDuration(60)).toBe('1 phút');
    expect(formatDuration(3600)).toBe('1 giờ 0 phút');
    expect(formatDuration(3660)).toBe('1 giờ 1 phút');
  });
});
