import { describe, expect, it } from 'vitest';
import {
  describeCatalogEmpty,
  describePageScope,
  describeSortScope,
  progressBadgeVariant,
  type CatalogKind,
} from './catalog-labels.ts';

const KINDS: readonly CatalogKind[] = ['lessons', 'labs', 'playgrounds', 'paths', 'quiz'];

describe('describePageScope — nói ra khi danh sách còn tiếp', () => {
  it('trang 1, hết dữ liệu ⇒ không nói gì (danh sách CHÍNH LÀ toàn bộ kết quả)', () => {
    expect(describePageScope({ kind: 'lessons', page: 1, shown: 5, hasNext: false })).toBeNull();
  });

  it('còn trang sau ⇒ nói rõ và chỉ ra cách xem tiếp', () => {
    const note = describePageScope({ kind: 'lessons', page: 1, shown: 20, hasNext: true });

    expect(note).not.toBeNull();
    expect(note).toContain('còn tiếp');
    expect(note).toContain('Tiếp');
  });

  it('trang cuối của nhiều trang ⇒ nói đây là trang cuối', () => {
    expect(describePageScope({ kind: 'labs', page: 3, shown: 2, hasNext: false })).toContain('trang cuối');
  });

  it('KHÔNG khẳng định tổng số mục trong kho — server không trả con số đó', () => {
    // Nhãn khẳng định quá dữ liệu là bẫy P2 ("N/N bước đã đạt"). Ở đây nó sẽ có
    // dạng "5/42 bài" — một mẫu số không tồn tại trong response.
    for (const kind of KINDS) {
      for (const hasNext of [true, false]) {
        for (const page of [1, 2]) {
          const note = describePageScope({ kind, page, shown: 7, hasNext });
          expect(note ?? '').not.toMatch(/\d+\s*\/\s*\d+/);
          expect(note ?? '').not.toMatch(/tổng cộng|toàn bộ kho/i);
        }
      }
    }
  });
});

describe('describeSortScope — không để người dùng tin vào một thứ tự toàn cục', () => {
  it('thứ tự mặc định ⇒ không cảnh báo', () => {
    expect(describeSortScope({ sortKey: 'default', shown: 20, hasNext: true })).toBeNull();
  });

  it('đã sắp xếp nhưng chỉ có một trang ⇒ không cảnh báo (xếp trang = xếp toàn bộ kết quả)', () => {
    expect(describeSortScope({ sortKey: 'title', shown: 5, hasNext: false })).toBeNull();
  });

  it('đã sắp xếp VÀ còn trang sau ⇒ nói rõ phạm vi chỉ là trang này', () => {
    const note = describeSortScope({ sortKey: 'duration', shown: 20, hasNext: true });

    expect(note).toContain('trang này');
    expect(note).toContain('trang sau');
  });
});

describe('describeCatalogEmpty — bốn ca, bốn việc phải làm khác nhau', () => {
  it('author thấy đường tạo nội dung; người học KHÔNG', () => {
    const author = describeCatalogEmpty({ kind: 'labs', page: 1, hasActiveFilter: false, canAuthor: true });
    const learner = describeCatalogEmpty({ kind: 'labs', page: 1, hasActiveFilter: false, canAuthor: false });

    expect(author.action).toEqual({ kind: 'author' });
    expect(author.description).toContain('Soạn bài');

    expect(learner.action.kind).toBe('browse');
    expect(learner.description).not.toContain('Soạn bài');
  });

  it('gợi ý cho người học trỏ sang trụ cột KHÁC, không vòng về chính trang đang rỗng', () => {
    const selfHref: Record<CatalogKind, string> = {
      lessons: '/lessons',
      labs: '/labs',
      playgrounds: '/playgrounds',
      paths: '/paths',
      quiz: '/quiz',
    };

    for (const kind of KINDS) {
      const empty = describeCatalogEmpty({ kind, page: 1, hasActiveFilter: false, canAuthor: false });
      expect(empty.action.kind).toBe('browse');
      if (empty.action.kind === 'browse') {
        expect(empty.action.href).not.toBe(selfHref[kind]);
        expect(empty.action.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('có bộ lọc bật ⇒ mời bỏ lọc, KHÔNG kết luận kho rỗng — kể cả với author', () => {
    for (const canAuthor of [true, false]) {
      const empty = describeCatalogEmpty({ kind: 'lessons', page: 1, hasActiveFilter: true, canAuthor });

      expect(empty.action).toEqual({ kind: 'clear-filter' });
      expect(empty.title).toContain('bộ lọc');
      // "Chưa có bài học nào" khi mới chỉ hỏi phần đã lọc là một khẳng định sai.
      expect(empty.description).toContain('vẫn có thể còn mục khác');
    }
  });

  it('trang > 1 thắng MỌI ca khác — author ở trang 2 không bị mời đi tạo bài mới', () => {
    const empty = describeCatalogEmpty({ kind: 'labs', page: 2, hasActiveFilter: false, canAuthor: true });

    expect(empty.action).toEqual({ kind: 'first-page' });
    expect(empty.title).toContain('Trang 2');
  });

  it('mọi ca đều có tiêu đề, mô tả và hành động — không ca nào là ô trắng', () => {
    for (const kind of KINDS) {
      for (const page of [1, 2]) {
        for (const hasActiveFilter of [true, false]) {
          for (const canAuthor of [true, false]) {
            const empty = describeCatalogEmpty({ kind, page, hasActiveFilter, canAuthor });
            expect(empty.title.length).toBeGreaterThan(0);
            expect(empty.description.length).toBeGreaterThan(0);
            expect(empty.action.kind).toBeTruthy();
          }
        }
      }
    }
  });
});

describe('progressBadgeVariant', () => {
  it.each([
    ['completed', 'success'],
    ['in-progress', 'warning'],
    ['not-started', 'secondary'],
    ['trang-thai-la', 'secondary'],
  ])('%s ⇒ %s', (status, variant) => {
    expect(progressBadgeVariant(status)).toBe(variant);
  });
});
