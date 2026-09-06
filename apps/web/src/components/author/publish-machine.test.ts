import { describe, expect, it } from 'vitest';
import type { AuthoredItem } from './content-state';
import { publishPhase, shouldKeepPolling, type PublishInput } from './publish-machine';

function row(over: Partial<AuthoredItem> = {}): AuthoredItem {
  return {
    id: 'dlp-bai',
    kind: 'lesson',
    state: 'draft',
    title: 'Bài',
    stepCount: 2,
    publishError: null,
    updatedAt: '2026-09-06T10:00:00.000Z',
    publishedAt: null,
    ...over,
  };
}

function input(over: Partial<PublishInput> = {}): PublishInput {
  return { started: false, submitting: false, row: row(), baseRow: null, ...over };
}

describe('publishPhase — đường bình thường', () => {
  it('chưa bấm gì, nháp sạch: idle', () => {
    expect(publishPhase(input())).toEqual({ kind: 'idle' });
  });

  it('mutation đang bay: submitting', () => {
    expect(publishPhase(input({ submitting: true, started: true })).kind).toBe('submitting');
  });

  it('hàng ở publishing: running', () => {
    expect(publishPhase(input({ started: true, row: row({ state: 'publishing' }) })).kind).toBe('running');
  });

  it('hàng ở published: đạt, không có bài nào được đổi ngôi', () => {
    expect(publishPhase(input({ started: true, row: row({ state: 'published' }) }))).toEqual({
      kind: 'passed',
      promotedTo: null,
    });
  });

  it('hàng về draft kèm publishError: trượt, mang nguyên văn lỗi', () => {
    const phase = publishPhase(
      input({ started: true, row: row({ publishError: 'steps[1].verifyScript trượt (exit 1):\nboom' }) }),
    );
    expect(phase).toEqual({ kind: 'failed', error: 'steps[1].verifyScript trượt (exit 1):\nboom' });
  });
});

describe('publishPhase — bài đang publishing dù ta chưa bấm', () => {
  it('trạng thái tới từ DỮ LIỆU, không từ việc ta có bấm nút hay không', () => {
    expect(publishPhase(input({ started: false, row: row({ state: 'publishing' }) })).kind).toBe('running');
  });
});

describe('publishPhase — bản nháp kế nhiệm BIẾN MẤT khi xuất bản đạt', () => {
  it('hàng nháp mất + bài gốc đã published = ĐẠT, và nêu tên bài được thay', () => {
    const phase = publishPhase(
      input({
        started: true,
        row: null,
        baseRow: row({ id: 'dlp-bai', state: 'published', publishedAt: '2026-09-06T10:05:00.000Z' }),
      }),
    );
    expect(phase).toEqual({ kind: 'passed', promotedTo: 'dlp-bai' });
  });

  it('hàng mất mà bài gốc CHƯA published thì KHÔNG được kết luận đạt', () => {
    const phase = publishPhase({
      started: true,
      submitting: false,
      row: null,
      baseRow: row({ id: 'dlp-bai', state: 'draft' }),
    });
    expect(phase.kind).toBe('lost');
    expect(phase.kind).not.toBe('passed');
  });

  it('hàng mất và không có bài gốc nào để đối chiếu: lost', () => {
    expect(publishPhase(input({ started: true, row: null })).kind).toBe('lost');
  });
});

describe('publishPhase — lượt chạy thử treo được list chuẩn hoá về draft', () => {
  it('đã bấm Xuất bản mà quay lại draft sạch = mất dấu, KHÔNG phải sẵn sàng', () => {
    const phase = publishPhase(input({ started: true, row: row({ state: 'draft', publishError: null }) }));
    expect(phase.kind).toBe('lost');
    expect(phase.kind).not.toBe('idle');
  });

  it('chưa bấm gì thì cùng dữ liệu đó là idle', () => {
    expect(publishPhase(input({ started: false })).kind).toBe('idle');
  });
});

describe('publishPhase — lưu trữ', () => {
  it('bài archived có pha riêng, không đội lốt draft', () => {
    expect(publishPhase(input({ row: row({ state: 'archived' }) })).kind).toBe('archived');
  });
});

describe('shouldKeepPolling', () => {
  it('chỉ hỏi lại khi còn đang chạy hoặc đang gửi', () => {
    expect(shouldKeepPolling({ kind: 'running' })).toBe(true);
    expect(shouldKeepPolling({ kind: 'submitting' })).toBe(true);
  });

  it('DỪNG hỏi ở mọi pha kết thúc — kể cả lost, nếu không thì trang hỏi mãi', () => {
    expect(shouldKeepPolling({ kind: 'passed', promotedTo: null })).toBe(false);
    expect(shouldKeepPolling({ kind: 'failed', error: 'x' })).toBe(false);
    expect(shouldKeepPolling({ kind: 'lost' })).toBe(false);
    expect(shouldKeepPolling({ kind: 'idle' })).toBe(false);
    expect(shouldKeepPolling({ kind: 'archived' })).toBe(false);
  });
});
