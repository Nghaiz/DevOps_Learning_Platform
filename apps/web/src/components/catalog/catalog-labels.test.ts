import { renderCopy, type CopyRef } from '@devops-platform/copy';
import { describe, expect, it } from 'vitest';
import { SCENARIO_DIFFICULTIES } from '@devops-platform/shared-types/scenario';
import {
  DIFFICULTY_ACCENT,
  DIFFICULTY_BADGE,
  PROGRESS_STATUS_BADGE,
  PROGRESS_STATUS_KEY,
  describeCatalogEmpty,
  describeResultCount,
  describePageScope,
  describeSearchScope,
  describeSortScope,
  progressStatusLabel,
  type CatalogKind,
} from './catalog-labels';

const KINDS: readonly CatalogKind[] = ['lessons', 'labs', 'playgrounds', 'paths', 'quiz'];

/**
 * Bộ chọn nay trả về `CopyRef`, nên mọi khẳng định về CHỮ phải đi qua
 * `renderCopy`.
 *
 * Đó không phải một lớp giấy bọc thừa: nó là thứ duy nhất còn kiểm được tham số
 * sau khi `CopyRef` bỏ phần kiểm tham số ở tầng biên dịch (xem chú thích của
 * kiểu đó). Một khoá `catalog.scope.page-more` nhận nhầm `{ pages }` thay vì
 * `{ page }` vẫn biên dịch được, và chỉ hiện ra ở đây, dưới dạng câu chứa
 * `undefined`.
 */
function say(ref: CopyRef | null): string {
  return ref === null ? '' : renderCopy(ref);
}

describe('describePageScope · nói ra khi danh sách còn tiếp', () => {
  it('trang 1, hết dữ liệu ⇒ không nói gì (danh sách CHÍNH LÀ toàn bộ kết quả)', () => {
    expect(describePageScope({ kind: 'lessons', page: 1, shown: 5, hasNext: false })).toBeNull();
  });

  it('còn trang sau ⇒ nói rõ và chỉ ra cách xem tiếp', () => {
    const note = describePageScope({ kind: 'lessons', page: 1, shown: 20, hasNext: true });

    expect(note).not.toBeNull();
    expect(say(note)).toContain('còn tiếp');
    expect(say(note)).toContain('Tiếp');
  });

  it('trang cuối của nhiều trang ⇒ nói đây là trang cuối', () => {
    expect(say(describePageScope({ kind: 'labs', page: 3, shown: 2, hasNext: false }))).toContain('trang cuối');
  });

  it('KHÔNG khẳng định tổng số mục trong kho, server không trả con số đó', () => {
    // Nhãn khẳng định quá dữ liệu là bẫy P2 ("N/N bước đã đạt"). Ở đây nó sẽ có
    // dạng "5/42 bài", một mẫu số không tồn tại trong response.
    for (const kind of KINDS) {
      for (const hasNext of [true, false]) {
        for (const page of [1, 2]) {
          const note = say(describePageScope({ kind, page, shown: 7, hasNext }));
          expect(note).not.toMatch(/\d+\s*\/\s*\d+/);
          expect(note).not.toMatch(/tổng cộng|toàn bộ kho/i);
        }
      }
    }
  });

  /** Mọi tham số phải tới nơi: một câu chứa `undefined` là một khoá gọi sai tên tham số. */
  it('không nhánh nào để lọt `undefined` ra câu', () => {
    for (const kind of KINDS) {
      for (const hasNext of [true, false]) {
        for (const page of [1, 4]) {
          expect(say(describePageScope({ kind, page, shown: 7, hasNext }))).not.toContain('undefined');
        }
      }
    }
  });
});

describe('describeSortScope · không để người dùng tin vào một thứ tự toàn cục', () => {
  it('thứ tự mặc định ⇒ không cảnh báo', () => {
    expect(describeSortScope({ sortKey: 'default', shown: 20, hasNext: true })).toBeNull();
  });

  it('đã sắp xếp nhưng chỉ có một trang ⇒ không cảnh báo (xếp trang = xếp toàn bộ kết quả)', () => {
    expect(describeSortScope({ sortKey: 'title', shown: 5, hasNext: false })).toBeNull();
  });

  it('đã sắp xếp VÀ còn trang sau ⇒ nói rõ phạm vi chỉ là trang này', () => {
    const note = say(describeSortScope({ sortKey: 'duration', shown: 20, hasNext: true }));

    expect(note).toContain('trang này');
    expect(note).toContain('trang sau');
    expect(note).toContain('20');
  });
});

/**
 * Ô tìm là điều khiển MỚI của 16.C, và nó mang đúng giới hạn của ô sắp xếp:
 * server không nhận từ khoá (`listInputSchema` là `.strict()`), nên nó chỉ soi
 * trang đang tải. Cảnh báo phạm vi vì vậy không phải trang trí.
 */
describe('describeSearchScope · nói ra rằng ô tìm chỉ soi trang đang mở', () => {
  it('không tìm gì ⇒ không cảnh báo', () => {
    expect(describeSearchScope({ query: '', loaded: 20, hasNext: true })).toBeNull();
  });

  it('đang tìm nhưng đã là toàn bộ kết quả ⇒ không cảnh báo', () => {
    expect(describeSearchScope({ query: 'pod', loaded: 6, hasNext: false })).toBeNull();
  });

  it('đang tìm VÀ còn trang sau ⇒ nói rõ phạm vi soi', () => {
    const note = say(describeSearchScope({ query: 'pod', loaded: 20, hasNext: true }));

    expect(note).toContain('trang này');
    expect(note).toContain('trang sau');
    expect(note).toContain('20');
  });

  /**
   * Câu này nói về PHẠM VI SOI, nên con số của nó là số mục đã tải, KHÔNG phải
   * số kết quả. Truyền nhầm sẽ in ra "Ô tìm chỉ soi 0 mục" đúng lúc người đọc
   * cần biết nó đã soi cả 20 mục và không thấy gì, tức câu duy nhất trên màn
   * hình lúc đó lại là câu sai.
   */
  it('con số trong câu là số mục ĐÃ TẢI, không phải số kết quả', () => {
    expect(say(describeSearchScope({ query: 'pod', loaded: 20, hasNext: true }))).toContain('20');
    expect(say(describeSearchScope({ query: 'pod', loaded: 0, hasNext: true }))).toContain('0');
  });
});

describe('describeCatalogEmpty · năm ca, năm việc phải làm khác nhau', () => {
  /** Ca mặc định: không tìm gì, server trả 0 mục. */
  const NO_SEARCH = { query: '', loaded: 0, hasNext: false } as const;

  it('author thấy đường tạo nội dung; người học KHÔNG', () => {
    const author = describeCatalogEmpty({
      kind: 'labs',
      page: 1,
      hasActiveFilter: false,
      canAuthor: true,
      ...NO_SEARCH,
    });
    const learner = describeCatalogEmpty({
      kind: 'labs',
      page: 1,
      hasActiveFilter: false,
      canAuthor: false,
      ...NO_SEARCH,
    });

    expect(author.action).toEqual({ kind: 'author' });
    expect(say(author.description)).toContain('Soạn bài');

    expect(learner.action.kind).toBe('browse');
    expect(say(learner.description)).not.toContain('Soạn bài');
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
      const empty = describeCatalogEmpty({
        kind,
        page: 1,
        hasActiveFilter: false,
        canAuthor: false,
        ...NO_SEARCH,
      });
      expect(empty.action.kind).toBe('browse');
      if (empty.action.kind === 'browse') {
        expect(empty.action.href).not.toBe(selfHref[kind]);
        expect(renderCopy({ key: empty.action.labelKey }).length).toBeGreaterThan(0);
      }
    }
  });

  it('có bộ lọc bật ⇒ mời bỏ lọc, KHÔNG kết luận kho rỗng, kể cả với author', () => {
    for (const canAuthor of [true, false]) {
      const empty = describeCatalogEmpty({
        kind: 'lessons',
        page: 1,
        hasActiveFilter: true,
        canAuthor,
        ...NO_SEARCH,
      });

      expect(empty.action).toEqual({ kind: 'clear-filter' });
      expect(say(empty.title)).toContain('bộ lọc');
      // "Chưa có bài học nào" khi mới chỉ hỏi phần đã lọc là một khẳng định sai.
      expect(say(empty.description)).toContain('vẫn có thể còn mục khác');
    }
  });

  it('trang > 1 thắng mọi ca của KHO, author ở trang 2 không bị mời đi tạo bài mới', () => {
    const empty = describeCatalogEmpty({
      kind: 'labs',
      page: 2,
      hasActiveFilter: false,
      canAuthor: true,
      ...NO_SEARCH,
    });

    expect(empty.action).toEqual({ kind: 'first-page' });
    expect(say(empty.title)).toContain('Trang 2');
  });

  /**
   * Ca ô tìm phải đứng TRƯỚC bốn ca kia, vì bốn ca kia đều giả định server trả
   * về 0 mục. Nếu nó xếp sau, một người ở trang 2 gõ một từ khoá không khớp sẽ
   * nhận câu "Trang 2 không còn lab nào", tức một lời nói về KHO phát ra khi
   * thứ không khớp là từ khoá của chính họ.
   */
  it('ô tìm lọc sạch một trang CÓ mục ⇒ nói về từ khoá, không nói về kho', () => {
    const empty = describeCatalogEmpty({
      kind: 'labs',
      page: 2,
      hasActiveFilter: true,
      canAuthor: true,
      query: 'ingress',
      loaded: 20,
      hasNext: true,
    });

    expect(empty.action).toEqual({ kind: 'clear-search' });
    expect(say(empty.title)).toContain('từ khoá');
    expect(say(empty.title)).not.toContain('Trang 2');
    expect(say(empty.description)).toContain('20');
    // Còn trang sau thì phải mở lối đi tiếp, không chỉ mời xoá từ khoá.
    expect(say(empty.description)).toContain('Tiếp');
  });

  it('ô tìm lọc sạch trang CUỐI ⇒ không hứa một trang sau không tồn tại', () => {
    const empty = describeCatalogEmpty({
      kind: 'quiz',
      page: 1,
      hasActiveFilter: false,
      canAuthor: false,
      query: 'helm',
      loaded: 6,
      hasNext: false,
    });

    expect(empty.action).toEqual({ kind: 'clear-search' });
    expect(say(empty.description)).not.toContain('Tiếp');
    expect(say(empty.description)).toContain('6');
  });

  /**
   * Server trả về 0 mục thì ô tìm KHÔNG phải nguyên nhân, dù nó đang bật. Không
   * có vế `loaded > 0` thì một kho rỗng cộng một từ khoá bỏ quên sẽ đọc thành
   * "không mục nào khớp từ khoá", và người dùng đi xoá từ khoá để rồi vẫn thấy
   * một màn hình trống, lần này không kèm lời giải thích nào.
   */
  it('server trả 0 mục ⇒ ô tìm KHÔNG bị đổ lỗi, dù đang bật', () => {
    const empty = describeCatalogEmpty({
      kind: 'paths',
      page: 1,
      hasActiveFilter: false,
      canAuthor: false,
      query: 'ingress',
      loaded: 0,
      hasNext: false,
    });

    expect(empty.action.kind).toBe('browse');
    expect(say(empty.title)).not.toContain('từ khoá');
  });

  it('mọi ca đều có tiêu đề, mô tả và hành động, không ca nào là ô trắng', () => {
    for (const kind of KINDS) {
      for (const page of [1, 2]) {
        for (const hasActiveFilter of [true, false]) {
          for (const canAuthor of [true, false]) {
            for (const query of ['', 'pod']) {
              for (const loaded of [0, 20]) {
                for (const hasNext of [true, false]) {
                  const empty = describeCatalogEmpty({
                    kind,
                    page,
                    hasActiveFilter,
                    canAuthor,
                    query,
                    loaded,
                    hasNext,
                  });
                  expect(say(empty.title).length).toBeGreaterThan(0);
                  expect(say(empty.description).length).toBeGreaterThan(0);
                  expect(empty.action.kind).toBeTruthy();
                  expect(say(empty.title)).not.toContain('undefined');
                  expect(say(empty.description)).not.toContain('undefined');
                }
              }
            }
          }
        }
      }
    }
  });
});

describe('ánh xạ miền dữ liệu → hệ thiết kế', () => {
  /*
   * Đây là phần lane primitive CỐ Ý không làm (xem `badge.tsx`): nối tên miền
   * (`beginner`) vào tên token (`basic`). Một ánh xạ sai không ném lỗi và không
   * cảnh báo build; `Badge` vẫn render, chỉ là không luật CSS nào khớp, hoặc tệ
   * hơn, khớp NHẦM biến thể. typecheck chỉ thấy `BadgeVariant`, còn suite này
   * chạy ở môi trường node nên không có DOM để đo. Vậy nó phải bị đóng đinh ở
   * đây, ngay tại chỗ ánh xạ được viết ra.
   */
  it.each(SCENARIO_DIFFICULTIES)('%s ánh xạ đúng sang tên token', (level) => {
    const token = level === 'beginner' ? 'basic' : level;
    expect(DIFFICULTY_ACCENT[level]).toBe(token);
    expect(DIFFICULTY_BADGE[level]).toBe(`difficulty-${token}`);
  });

  it('KHÔNG nơi nào sinh ra tên `beginner` phía token', () => {
    const all = [...Object.values(DIFFICULTY_ACCENT), ...Object.values(DIFFICULTY_BADGE)].join(' ');
    expect(all).not.toContain('beginner');
  });

  it('bảng chỉ chứa TÊN BIẾN THỂ, không chứa class Tailwind', () => {
    /*
     * Bản đầu của lane này tự dựng chip bằng `bg-difficulty-basic …` viết tay.
     * Lane primitive nay sở hữu cả màu lẫn hình, nên class rò ngược vào đây là
     * dấu hiệu ai đó đang dựng lại `Badge` một lần nữa: hai nguồn sự thật cho
     * cùng một quyết định, và chúng sẽ trôi khác nhau.
     */
    for (const value of [...Object.values(DIFFICULTY_BADGE), ...Object.values(PROGRESS_STATUS_BADGE)]) {
      for (const prefix of ['bg-', 'text-', 'border-']) {
        expect(value).not.toContain(prefix);
      }
    }
  });

  /*
   * Hai chiều, theo kỷ luật pinned-baseline: thiếu key thì trạng thái mới mất
   * hình thức trong im lặng; thừa key thì bảng thành nghĩa địa không ai rà lại.
   */
  it('mỗi trạng thái tiến độ có ĐỦ nhãn + biến thể, và không dư key nào', () => {
    expect(Object.keys(PROGRESS_STATUS_BADGE).sort()).toEqual(Object.keys(PROGRESS_STATUS_KEY).sort());
  });

  it('mỗi trạng thái có nhãn dựng ra được, và trạng thái lạ trả null chứ không ném', () => {
    for (const status of Object.keys(PROGRESS_STATUS_KEY)) {
      expect(progressStatusLabel(status)?.length ?? 0).toBeGreaterThan(0);
    }
    expect(progressStatusLabel('abandoned')).toBeNull();
  });

  it('"chưa bắt đầu" là status-todo, KHÔNG phải status-locked', () => {
    /*
     * Hợp đồng token chỉ có progress/done/locked trong khi miền có bốn giá trị,
     * nên `locked` là chỗ trống gần nhất và là cái bẫy. Nó sai NGHĨA và sai theo
     * hướng nguy hiểm: nói với người học rằng bài họ chưa mở là bài họ không
     * được vào.
     */
    expect(PROGRESS_STATUS_BADGE['not-started']).toBe('status-todo');
    expect(Object.values(PROGRESS_STATUS_BADGE)).not.toContain('status-locked');
  });

  it('ba trạng thái mang ba biến thể KHÁC NHAU, trùng thì màu lẫn hình đều trùng', () => {
    const variants = Object.values(PROGRESS_STATUS_BADGE);
    expect(new Set(variants).size).toBe(variants.length);
  });
});

describe('describeResultCount · đếm cái ĐANG HIỆN, không đoán tổng kho', () => {
  it('còn trang sau thì nói rõ phạm vi là trang này', () => {
    expect(
      say(describeResultCount({ kind: 'lessons', shown: 12, hasNext: true, hasActiveFilter: false })),
    ).toBe('12 bài học trong trang này');
  });

  it('hết danh sách thì bỏ mệnh đề phạm vi', () => {
    expect(say(describeResultCount({ kind: 'labs', shown: 3, hasNext: false, hasActiveFilter: false }))).toBe(
      '3 lab',
    );
  });

  it('đang lọc thì nói ra, để "ít kết quả" không bị đọc thành "kho ít"', () => {
    expect(say(describeResultCount({ kind: 'quiz', shown: 1, hasNext: false, hasActiveFilter: true }))).toBe(
      '1 bộ câu hỏi khớp bộ lọc',
    );
  });

  it.each(KINDS)('%s · không câu nào chứa dấu gạch chéo kiểu "N/M"', (kind) => {
    const text = say(describeResultCount({ kind, shown: 5, hasNext: true, hasActiveFilter: true }));
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
    expect(text).not.toContain('undefined');
  });
});
