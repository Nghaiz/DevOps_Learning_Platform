import { describe, expect, it } from 'vitest';

import { COUNTDOWN_URGENT_MS, isCountdownUrgent } from './countdown';
import {
  attemptPhase,
  examWhen,
  examWindow,
  isExamFinished,
  matchesExamFilter,
} from './exam-status';

const NOW = '2026-10-03T09:00:00.000Z';

describe('examWindow so với giờ MÁY CHỦ', () => {
  it('trước giờ mở là sắp mở', () => {
    expect(examWindow({ opensAt: '2026-10-03T09:00:01.000Z', closesAt: null }, NOW)).toBe('upcoming');
  });

  it('đúng giờ mở là đang mở, không phải sắp mở', () => {
    expect(examWindow({ opensAt: NOW, closesAt: null }, NOW)).toBe('open');
  });

  it('đúng giờ đóng là đã đóng', () => {
    expect(examWindow({ opensAt: null, closesAt: NOW }, NOW)).toBe('closed');
  });

  it('không mốc nào nghĩa là luôn mở', () => {
    expect(examWindow({ opensAt: null, closesAt: null }, NOW)).toBe('open');
  });

  it('giờ máy chủ hỏng thì nghiêng về đang mở, máy chủ vẫn là cổng thật', () => {
    expect(examWindow({ opensAt: null, closesAt: '2020-01-01T00:00:00.000Z' }, 'không phải giờ')).toBe('open');
  });

  it('không đọc đồng hồ máy khách: kết quả chỉ phụ thuộc chuỗi serverNow', () => {
    const item = { opensAt: '2030-01-01T00:00:00.000Z', closesAt: null };
    expect(examWindow(item, '2031-01-01T00:00:00.000Z')).toBe('open');
    expect(examWindow(item, '2029-01-01T00:00:00.000Z')).toBe('upcoming');
  });
});

describe('attemptPhase tách hai ca bên trong closed', () => {
  it('chưa có lượt', () => {
    expect(attemptPhase({ startedAt: null, submittedAt: null, closed: false })).toBe('not-started');
  });

  it('đang làm', () => {
    expect(attemptPhase({ startedAt: NOW, submittedAt: null, closed: false })).toBe('in-progress');
  });

  it('khoá vì đã nộp', () => {
    expect(attemptPhase({ startedAt: NOW, submittedAt: NOW, closed: true })).toBe('submitted');
  });

  it('khoá mà chưa nộp là hết giờ, không phải đang làm', () => {
    expect(attemptPhase({ startedAt: NOW, submittedAt: null, closed: true })).toBe('expired');
  });
});

describe('bộ lọc Đã kết thúc', () => {
  it('kỳ thi đã đóng mà chưa từng vào làm vẫn là đã kết thúc', () => {
    const neverStarted = { startedAt: null, submittedAt: null, closed: false };
    expect(isExamFinished(neverStarted, 'closed')).toBe(true);
    expect(matchesExamFilter('active', isExamFinished(neverStarted, 'closed'))).toBe(false);
  });

  it('lượt đã khoá là đã kết thúc dù cửa sổ còn mở', () => {
    expect(isExamFinished({ startedAt: NOW, submittedAt: null, closed: true }, 'open')).toBe(true);
  });

  it('sắp mở và chưa vào là chưa kết thúc', () => {
    expect(isExamFinished({ startedAt: null, submittedAt: null, closed: false }, 'upcoming')).toBe(false);
  });

  it('Tất cả nhận mọi kỳ thi', () => {
    expect(matchesExamFilter('all', true)).toBe(true);
    expect(matchesExamFilter('all', false)).toBe(true);
  });
});

describe('examWhen chọn đúng câu theo mốc có mặt', () => {
  const fmt = (iso: string): string => `<${iso.slice(11, 16)}>`;

  it('đủ hai mốc', () => {
    expect(examWhen({ opensAt: '2026-10-03T08:00:00Z', closesAt: '2026-10-03T10:00:00Z' }, fmt)).toEqual({
      key: 'exam.when.range',
      params: { from: '<08:00>', to: '<10:00>' },
    });
  });

  it('chỉ mốc mở', () => {
    expect(examWhen({ opensAt: '2026-10-03T08:00:00Z', closesAt: null }, fmt).key).toBe('exam.when.from');
  });

  it('chỉ mốc đóng', () => {
    expect(examWhen({ opensAt: null, closesAt: '2026-10-03T10:00:00Z' }, fmt).key).toBe('exam.when.until');
  });

  it('không mốc nào', () => {
    expect(examWhen({ opensAt: null, closesAt: null }, fmt)).toEqual({ key: 'exam.when.any' });
  });
});

describe('ngưỡng gấp của bảng giờ', () => {
  it('dưới năm phút là gấp', () => {
    expect(isCountdownUrgent(COUNTDOWN_URGENT_MS - 1)).toBe(true);
  });

  it('đúng năm phút chưa gấp', () => {
    expect(isCountdownUrgent(COUNTDOWN_URGENT_MS)).toBe(false);
  });

  it('hết giờ là hết, không phải gấp', () => {
    expect(isCountdownUrgent(0)).toBe(false);
  });
});
