import { describe, expect, it } from 'vitest';
import { renderCopy } from '@devops-platform/copy';
import {
  countByFilter,
  describeItem,
  filterByState,
  lastPublishFailure,
  describeUpdatedAt,
  sortByRecent,
  STATE_BADGE,
  STATE_KEYS,
  type AuthoredItem,
} from './content-state';

/**
 * Bộ chọn nay trả `CopyRef` chứ không trả câu (P16 / 16.G), nên mọi khẳng định
 * về CHỮ phải dựng câu trước rồi mới so. Đây là cùng khuôn `catalog-labels.test`
 * của lane 16.C: kiểu trả về đổi, khẳng định KHÔNG đổi.
 */
const say = (ref: Parameters<typeof renderCopy>[0]): string => renderCopy(ref);

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
    const items = [
      item(),
      item({ id: 'b', state: 'published' }),
      item({ id: 'c', state: 'archived' }),
    ];
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
    expect(countByFilter([])).toEqual({
      all: 0,
      draft: 0,
      publishing: 0,
      published: 0,
      archived: 0,
    });
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
    const sorted = sortByRecent([
      item({ id: 'b', updatedAt: same }),
      item({ id: 'a', updatedAt: same }),
    ]);
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
    const ref = describeItem(item({ kind: 'playground', stepCount: 0 }));
    const text = say(ref);
    expect(text).toBe('Playground · không có bước');
    expect(text).not.toContain('0 bước');
    // Nhánh playground không được mang `n` sang bản đồ: một tham số thừa ở đây
    // là một con số chờ ai đó quyết định hiện nó ra.
    expect(ref.params).toEqual({ kind: 'Playground' });
  });

  it('lab đếm task, lesson đếm bước', () => {
    expect(say(describeItem(item({ kind: 'lab', stepCount: 4 })))).toBe('Lab · 4 task');
    expect(say(describeItem(item({ kind: 'lesson', stepCount: 4 })))).toBe('Bài học · 4 bước');
  });

  it('mỗi loại đi vào một khoá RIÊNG, nên bộ dò thấy cả ba nhánh', () => {
    expect(describeItem(item({ kind: 'lesson' })).key).toBe('author.item.desc.lesson');
    expect(describeItem(item({ kind: 'lab' })).key).toBe('author.item.desc.lab');
    expect(describeItem(item({ kind: 'playground' })).key).toBe('author.item.desc.playground');
  });
});

describe('lastPublishFailure', () => {
  it('draft + có publishError = lượt xuất bản gần nhất đã trượt', () => {
    expect(
      lastPublishFailure(item({ publishError: 'steps[0].verifyScript trượt (exit 1):\nboom' })),
    ).toContain('exit 1');
  });

  it('bài đã xuất bản KHÔNG mang theo lỗi cũ ra màn hình', () => {
    expect(lastPublishFailure(item({ state: 'published', publishError: 'lỗi cũ' }))).toBeNull();
  });

  it('draft sạch thì không có gì để nói', () => {
    expect(lastPublishFailure(item())).toBeNull();
  });
});

describe('bảng nhãn phủ hết trạng thái', () => {
  it('mỗi state có nhãn tiếng Việt dựng được từ bản đồ và một variant badge', () => {
    for (const state of ['draft', 'publishing', 'published', 'archived'] as const) {
      expect(say({ key: STATE_KEYS[state] })).not.toBe('');
      expect(STATE_BADGE[state]).not.toBe('');
    }
  });
});

describe('describeUpdatedAt', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('thang phút / giờ / ngày', () => {
    expect(say(describeUpdatedAt('2026-09-06T11:59:30.000Z', now))).toBe('Sửa vừa xong');
    expect(say(describeUpdatedAt('2026-09-06T11:30:00.000Z', now))).toBe('Sửa 30 phút trước');
    expect(say(describeUpdatedAt('2026-09-06T09:00:00.000Z', now))).toBe('Sửa 3 giờ trước');
    expect(say(describeUpdatedAt('2026-09-04T12:00:00.000Z', now))).toBe('Sửa 2 ngày trước');
  });

  it('quá 7 ngày thì hiện ngày UTC, KHÔNG đổi sang giờ địa phương (test phải chạy được ở mọi TZ)', () => {
    const ref = describeUpdatedAt('2026-08-01T23:59:00.000Z', now);
    expect(ref.params).toEqual({ date: '2026-08-01' });
    expect(say(ref)).toBe('Sửa ngày 2026-08-01');
  });

  it('mốc trong tương lai (đồng hồ máy khách chậm) đọc là "vừa xong", không phải một số âm', () => {
    expect(say(describeUpdatedAt('2026-09-06T12:05:00.000Z', now))).toBe('Sửa vừa xong');
  });

  /*
   * Khẳng định chuyển nguyên vẹn từ bản `formatUpdatedAt` cũ, cộng một vế mới.
   *
   * Cũ: hàm trả NGUYÊN VĂN chuỗi hỏng. Vế đó nay đọc trên `params.value`, vì
   * hàm không còn trả chuỗi. Điều nó bảo vệ (không bịa ra một mốc) được nói
   * thẳng thành một khẳng định riêng thay vì nằm ngầm trong phép so chuỗi.
   */
  it('chuỗi hỏng giữ nguyên văn VÀ nói ra rằng nó không đọc được', () => {
    const ref = describeUpdatedAt('không-phải-ngày', now);
    expect(ref.key).toBe('author.item.updated.unknown');
    expect(ref.params).toEqual({ value: 'không-phải-ngày' });
    const text = say(ref);
    expect(text).toContain('không-phải-ngày');
    expect(text).not.toContain('vừa xong');
  });
});
