import { describe, expect, it } from 'vitest';
import { CONTENT_KINDS, CONTENT_STATES } from '@devops-platform/shared-types/authoring';
import {
  CONTENT_STATE_FILTERS,
  contentStateVariant,
  describeContentKind,
  describeContentState,
  filterContentByState,
  orderContent,
  planArchive,
} from './content-row';

describe('nhãn nội dung', () => {
  it('phủ đủ mọi loại và mọi trạng thái của schema — không lẫn chuỗi gốc', () => {
    for (const kind of CONTENT_KINDS) {
      expect(describeContentKind(kind)).not.toBe(kind);
    }
    for (const state of CONTENT_STATES) {
      expect(describeContentState(state)).not.toBe(state);
    }
  });

  it('giá trị lạ giữ nguyên chuỗi gốc thay vì thành ô trống', () => {
    expect(describeContentKind('kata')).toBe('kata');
    expect(describeContentState('quarantined')).toBe('quarantined');
  });

  it('bộ lọc gồm "all" cộng đúng bốn trạng thái của schema', () => {
    expect(CONTENT_STATE_FILTERS).toEqual(['all', ...CONTENT_STATES]);
  });

  it('trạng thái lạ không đội lốt "đã xuất bản"', () => {
    expect(contentStateVariant('quarantined')).not.toBe(contentStateVariant('published'));
  });
});

describe('planArchive', () => {
  it('bài nháp: cho lưu trữ, và nói rõ KHÔNG phải xoá', () => {
    const plan = planArchive({ title: 'Docker cơ bản', kind: 'lesson', state: 'draft' });
    expect(plan.allowed).toBe(true);
    expect(plan.body).toContain('KHÔNG bị xoá');
    expect(plan.body).toContain('tiến độ');
  });

  it('nêu tên và loại bài trong tiêu đề', () => {
    const plan = planArchive({ title: 'Docker cơ bản', kind: 'lesson', state: 'published' });
    expect(plan.title).toContain('Docker cơ bản');
    expect(plan.title).toContain('Bài học');
  });

  it('bài đã lưu trữ: chặn, kèm lý do', () => {
    const plan = planArchive({ title: 'X', kind: 'lab', state: 'archived' });
    expect(plan.allowed).toBe(false);
    expect(plan.blockedReason).toContain('đã ở trạng thái lưu trữ');
  });

  /**
   * `publishing` là một lượt chạy thử ĐANG chạy trên máy chủ; ghi đè state giữa
   * chừng là để kết quả chạy thử ghi lại lên trạng thái ta vừa đặt.
   */
  it('bài đang xuất bản: chặn, nói rõ vì sao phải đợi', () => {
    const plan = planArchive({ title: 'X', kind: 'lab', state: 'publishing' });
    expect(plan.allowed).toBe(false);
    expect(plan.blockedReason).toContain('chạy thử');
  });
});

interface Row {
  readonly id: string;
  readonly state: string;
  readonly publishError: string | null;
  readonly updatedAt: string;
}

const ROWS: readonly Row[] = [
  { id: 'cu', state: 'published', publishError: null, updatedAt: '2026-09-01T00:00:00.000Z' },
  { id: 'moi', state: 'published', publishError: null, updatedAt: '2026-09-05T00:00:00.000Z' },
  { id: 'loi', state: 'draft', publishError: 'verify bước 2 hỏng', updatedAt: '2026-08-01T00:00:00.000Z' },
  { id: 'dang-chay', state: 'publishing', publishError: null, updatedAt: '2026-07-01T00:00:00.000Z' },
  { id: 'luu-tru', state: 'archived', publishError: null, updatedAt: '2026-09-06T00:00:00.000Z' },
];

describe('orderContent', () => {
  /**
   * Bài LỖI xuất bản là một việc cần làm. Để nó chìm theo thứ tự thời gian thì
   * không ai thấy cho tới khi người soạn hỏi vì sao bài chưa lên.
   */
  it('đang xuất bản lên đầu, bài lỗi ngay sau, lưu trữ xuống cuối', () => {
    expect(orderContent(ROWS).map((row) => row.id)).toEqual([
      'dang-chay',
      'loi',
      'moi',
      'cu',
      'luu-tru',
    ]);
  });

  it('không làm mất dòng nào và không sửa mảng gốc', () => {
    const before = ROWS.map((row) => row.id);
    expect(orderContent(ROWS)).toHaveLength(ROWS.length);
    expect(ROWS.map((row) => row.id)).toEqual(before);
  });
});

describe('filterContentByState', () => {
  it('"all" trả nguyên danh sách', () => {
    expect(filterContentByState(ROWS, 'all')).toHaveLength(ROWS.length);
  });

  it('lọc đúng một trạng thái', () => {
    expect(filterContentByState(ROWS, 'published').map((row) => row.id)).toEqual(['cu', 'moi']);
  });

  it('trạng thái không có dòng nào: trả rỗng, không trả cả danh sách', () => {
    expect(filterContentByState(ROWS, 'khong-ton-tai')).toEqual([]);
  });
});
