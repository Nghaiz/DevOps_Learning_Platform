import { describe, expect, it } from 'vitest';
import { summarizeLessonProgress } from './lesson-progress';

describe('summarizeLessonProgress', () => {
  it('chưa xong: nói VỊ TRÍ đang đứng, không nói số bước đã xong', () => {
    const summary = summarizeLessonProgress({ stepIndex: 2, completedAt: null });

    expect(summary.label).toBe('Đang học');
    expect(summary.detail).toBe('Đang ở bước 3');
    // `stepIndex` là vị trí hiện tại (`routers/lessons.ts`: "không phải step xa
    // nhất từng tới"), nên "đã xong 3 bước" là câu bảng `progress` không đỡ nổi.
    expect(summary.detail).not.toContain('đã xong');
    expect(summary.detail).not.toContain('đã đạt');
  });

  it('chưa xong: KHÔNG hiện phân số vì dòng tiến độ không mang tổng số bước', () => {
    const summary = summarizeLessonProgress({ stepIndex: 0, completedAt: null });

    expect(summary.detail).toBe('Đang ở bước 1');
    expect(summary.detail).not.toContain('/');
  });

  it('đã xong: đọc từ mốc completedAt có thật, không kèm vị trí', () => {
    const summary = summarizeLessonProgress({
      stepIndex: 1,
      completedAt: '2026-09-06T10:00:00.000Z',
    });

    expect(summary.label).toBe('Đã xong');
    expect(summary.variant).toBe('success');
    expect(summary.detail).toBeNull();
  });
});
