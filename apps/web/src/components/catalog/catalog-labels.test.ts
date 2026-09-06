import { describe, expect, it } from 'vitest';
import { SCENARIO_DIFFICULTIES } from '@devops-platform/shared-types/scenario';
import {
  DIFFICULTY_CHIP,
  DIFFICULTY_ACCENT,
  PROGRESS_STATUS_ICON,
  PROGRESS_STATUS_LABEL,
  PROGRESS_STATUS_STYLE,
  describeCatalogEmpty,
  describeResultCount,
  describePageScope,
  describeSortScope,
  type CatalogKind,
} from './catalog-labels';

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

describe('token hình thức — tiện ích phải khớp hợp đồng 13.A', () => {
  /*
   * Vì sao khẳng định trên CHUỖI CLASS chứ không phải trên pixel: một tên token
   * sai (`difficulty-beginner` thay vì `difficulty-basic` — hai từ vựng lệch
   * nhau, xem `DIFFICULTY_ACCENT`) không ném lỗi và không cảnh báo build.
   * Tailwind chỉ đơn giản KHÔNG sinh ra class đó, nên thuộc tính biến mất và ba
   * mức độ khó về cùng một màu — đúng thứ lane này sinh ra để sửa. Không phép
   * kiểm nào ở tầng cao hơn thấy được điều đó: typecheck chỉ thấy `string`, và
   * suite này chạy ở môi trường node nên không có DOM để đo. Vậy nó phải bị đóng
   * đinh ở đây, ngay tại chỗ chuỗi được viết ra.
   */
  it.each(SCENARIO_DIFFICULTIES)('%s dùng tiện ích difficulty-* hợp lệ', (level) => {
    const token = level === 'beginner' ? 'basic' : level;
    expect(DIFFICULTY_ACCENT[level]).toBe(`bg-difficulty-${token}`);
    expect(DIFFICULTY_CHIP[level]).toBe(`bg-difficulty-${token} text-difficulty-${token}-foreground`);
  });

  it('KHÔNG nơi nào sinh ra difficulty-beginner (token không tồn tại)', () => {
    const all = [...Object.values(DIFFICULTY_ACCENT), ...Object.values(DIFFICULTY_CHIP)].join(' ');
    expect(all).not.toContain('difficulty-beginner');
  });

  it('KHÔNG dùng dạng arbitrary — màu phải đi qua bảng theme', () => {
    /*
     * `bg-[var(--difficulty-basic)]` và `bg-difficulty-basic` cho ra CÙNG một
     * màu hôm nay, nên khác biệt chỉ lộ về sau: dạng arbitrary đi vòng qua bảng
     * theme của Tailwind, thoát khỏi tầm của mọi phép đổi tên và mọi phép đo tập
     * trung — kể cả `tokens.contract.test.ts`. Bản đầu của lane này viết dạng
     * arbitrary vì token chưa tồn tại; `95efe1f` đã đưa chúng vào `@theme
     * inline`, và phép kiểm này chặn đường lùi.
     *
     * Bóng cũng vậy: `shadow-elevation-2`, không `shadow-[var(--elevation-2)]` —
     * ba bậc nâng nền sinh ra để mỗi chỗ gọi KHÔNG tự chọn bậc riêng.
     */
    const classes = [
      ...Object.values(DIFFICULTY_ACCENT),
      ...Object.values(DIFFICULTY_CHIP),
      ...Object.values(PROGRESS_STATUS_STYLE),
    ];
    expect(classes).not.toHaveLength(0);
    for (const cls of classes) {
      expect(cls).not.toContain('var(');
      expect(cls).not.toContain('[');
    }
  });

  /*
   * Hai chiều, theo kỷ luật pinned-baseline: thiếu key thì trạng thái mới mất
   * hình thức trong im lặng; thừa key thì bảng thành nghĩa địa không ai rà lại.
   */
  it('mỗi trạng thái tiến độ có ĐỦ nhãn + màu + icon, và không dư key nào', () => {
    const labels = Object.keys(PROGRESS_STATUS_LABEL).sort();
    expect(Object.keys(PROGRESS_STATUS_STYLE).sort()).toEqual(labels);
    expect(Object.keys(PROGRESS_STATUS_ICON).sort()).toEqual(labels);
  });

  it('ba trạng thái mang ba icon KHÁC NHAU — màu không phải kênh duy nhất', () => {
    const icons = Object.values(PROGRESS_STATUS_ICON);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('describeResultCount — đếm cái ĐANG HIỆN, không đoán tổng kho', () => {
  it('còn trang sau thì nói rõ phạm vi là trang này', () => {
    expect(describeResultCount({ kind: 'lessons', shown: 12, hasNext: true, hasActiveFilter: false })).toBe(
      '12 bài học trong trang này',
    );
  });

  it('hết danh sách thì bỏ mệnh đề phạm vi', () => {
    expect(describeResultCount({ kind: 'labs', shown: 3, hasNext: false, hasActiveFilter: false })).toBe('3 lab');
  });

  it('đang lọc thì nói ra, để "ít kết quả" không bị đọc thành "kho ít"', () => {
    expect(describeResultCount({ kind: 'quiz', shown: 1, hasNext: false, hasActiveFilter: true })).toBe(
      '1 bộ câu hỏi khớp bộ lọc',
    );
  });

  it.each(KINDS)('%s — không câu nào chứa dấu gạch chéo kiểu "N/M"', (kind) => {
    const text = describeResultCount({ kind, shown: 5, hasNext: true, hasActiveFilter: true });
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
  });
});
