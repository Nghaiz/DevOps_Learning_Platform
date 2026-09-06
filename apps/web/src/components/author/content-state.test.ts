import { describe, expect, it } from 'vitest';
import {
  countByFilter,
  describeItem,
  filterByState,
  lastPublishFailure,
  formatUpdatedAt,
  sortByRecent,
  STATE_BADGE,
  STATE_LABELS,
  type AuthoredItem,
} from './content-state';

function item(over: Partial<AuthoredItem> = {}): AuthoredItem {
  return {
    id: 'dlp-mot-bai',
    kind: 'lesson',
    state: 'draft',
    title: 'Một bài',
    stepCount: 3,
    publishError: null,
    updatedAt: '2026-09-06T10:00:00.000Z',
    publishedAt: null,
    ...over,
  };
}

describe('filterByState', () => {
  it('"all" trả nguyên danh sách', () => {
    const items = [item(), item({ id: 'b', state: 'published' })];
    expect(filterByState(items, 'all')).toHaveLength(2);
  });

  it('lọc đúng một trạng thái', () => {
    const items = [item(), item({ id: 'b', state: 'published' }), item({ id: 'c', state: 'archived' })];
    expect(filterByState(items, 'published').map((i) => i.id)).toEqual(['b']);
  });
});

describe('countByFilter', () => {
  it('đếm từng trạng thái và tổng', () => {
    const counts = countByFilter([
      item(),
      item({ id: 'b' }),
      item({ id: 'c', state: 'published' }),
      item({ id: 'd', state: 'publishing' }),
    ]);
    expect(counts).toEqual({ all: 4, draft: 2, publishing: 1, published: 1, archived: 0 });
  });

  it('danh sách rỗng ra 0 ở mọi ô, không phải undefined', () => {
    expect(countByFilter([])).toEqual({ all: 0, draft: 0, publishing: 0, published: 0, archived: 0 });
  });
});

describe('sortByRecent', () => {
  it('mới sửa lên trước', () => {
    const sorted = sortByRecent([
      item({ id: 'cu', updatedAt: '2026-09-01T00:00:00.000Z' }),
      item({ id: 'moi', updatedAt: '2026-09-06T00:00:00.000Z' }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['moi', 'cu']);
  });

  it('cùng mốc thì phá hoà bằng id — thứ tự ổn định giữa hai lượt render', () => {
    const same = '2026-09-06T00:00:00.000Z';
    const sorted = sortByRecent([item({ id: 'b', updatedAt: same }), item({ id: 'a', updatedAt: same })]);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('KHÔNG sửa mảng gốc', () => {
    const items = [item({ id: 'a', updatedAt: '2026-09-01T00:00:00.000Z' }), item({ id: 'b' })];
    sortByRecent(items);
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('describeItem — nhãn nói đúng thứ ta biết', () => {
  it('playground KHÔNG được đọc thành "0 bước"', () => {
    const text = describeItem(item({ kind: 'playground', stepCount: 0 }));
    expect(text).toBe('Playground · không có bước');
    expect(text).not.toContain('0 bước');
  });

  it('lab đếm task, lesson đếm bước', () => {
    expect(describeItem(item({ kind: 'lab', stepCount: 4 }))).toBe('Lab · 4 task');
    expect(describeItem(item({ kind: 'lesson', stepCount: 4 }))).toBe('Bài học · 4 bước');
  });
});

describe('lastPublishFailure', () => {
  it('draft + có publishError = lượt xuất bản gần nhất đã trượt', () => {
    expect(lastPublishFailure(item({ publishError: 'steps[0].verifyScript trượt (exit 1):\nboom' }))).toContain(
      'exit 1',
    );
  });

  it('bài đã xuất bản KHÔNG mang theo lỗi cũ ra màn hình', () => {
    expect(lastPublishFailure(item({ state: 'published', publishError: 'lỗi cũ' }))).toBeNull();
  });

  it('draft sạch thì không có gì để nói', () => {
    expect(lastPublishFailure(item())).toBeNull();
  });
});

describe('bảng nhãn phủ hết trạng thái', () => {
  it('mỗi state có nhãn tiếng Việt và một variant badge', () => {
    for (const state of ['draft', 'publishing', 'published', 'archived'] as const) {
      expect(STATE_LABELS[state]).not.toBe('');
      expect(STATE_BADGE[state]).not.toBe('');
    }
  });
});

describe('formatUpdatedAt', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('thang phút / giờ / ngày', () => {
    expect(formatUpdatedAt('2026-09-06T11:59:30.000Z', now)).toBe('vừa xong');
    expect(formatUpdatedAt('2026-09-06T11:30:00.000Z', now)).toBe('30 phút trước');
    expect(formatUpdatedAt('2026-09-06T09:00:00.000Z', now)).toBe('3 giờ trước');
    expect(formatUpdatedAt('2026-09-04T12:00:00.000Z', now)).toBe('2 ngày trước');
  });

  it('quá 7 ngày thì hiện ngày UTC, KHÔNG đổi sang giờ địa phương (test phải chạy được ở mọi TZ)', () => {
    expect(formatUpdatedAt('2026-08-01T23:59:00.000Z', now)).toBe('2026-08-01');
  });

  it('mốc trong tương lai (đồng hồ máy khách chậm) đọc là "vừa xong", không phải một số âm', () => {
    expect(formatUpdatedAt('2026-09-06T12:05:00.000Z', now)).toBe('vừa xong');
  });

  it('chuỗi hỏng trả nguyên văn thay vì bịa ra một mốc', () => {
    expect(formatUpdatedAt('không-phải-ngày', now)).toBe('không-phải-ngày');
  });
});
