import { renderCopy, type CopyRef } from '@devops-platform/copy';
import { describe, expect, it } from 'vitest';
import { SCENARIO_DIFFICULTIES } from '@devops-platform/shared-types/scenario';
import {
  DIFFICULTY_LEVEL,
  PROGRESS_STATUS_KEY,
  describeCatalogEmpty,
  describeLoadedScope,
  describeResultCount,
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
 * kiểu đó). Một khoá `catalog.toolbar.scope` nhận nhầm `{ total }` thay vì
 * `{ loaded }` vẫn biên dịch được, và chỉ hiện ra ở đây, dưới dạng câu chứa
 * `undefined`.
 */
function say(ref: CopyRef | null): string {
  return ref === null ? '' : renderCopy(ref);
}

describe('describeLoadedScope · một câu nhắc phạm vi, chỉ khi nó mang tin', () => {
  const base = { kind: 'lessons' as const, loaded: 40, hasNext: true, searching: false, sorting: false };

  it('không tìm, không sắp xếp ⇒ không nói gì, kể cả khi còn phần chưa tải', () => {
    expect(describeLoadedScope(base)).toBeNull();
  });

  it('đã tải hết ⇒ không nói gì: phần đã tải CHÍNH LÀ toàn bộ kết quả', () => {
    expect(describeLoadedScope({ ...base, hasNext: false, searching: true, sorting: true })).toBeNull();
  });

  it.each([
    ['đang tìm', { searching: true }],
    ['đang sắp xếp', { sorting: true }],
  ])('%s VÀ còn phần chưa tải ⇒ nói rõ phạm vi và cách tải tiếp', (_label, flags) => {
    const note = say(describeLoadedScope({ ...base, ...flags }));
    expect(note).toContain('40');
    expect(note).toContain('đã tải');
    expect(note).toContain('Xem thêm');
  });

  it('con số trong câu là số mục ĐÃ TẢI, không phải số kết quả', () => {
    expect(say(describeLoadedScope({ ...base, loaded: 0, searching: true }))).toContain('0');
    expect(say(describeLoadedScope({ ...base, loaded: 20, searching: true }))).toContain('20');
  });

  it.each(KINDS)('%s · không để lọt `undefined`, không khẳng định một tổng kiểu "N/M"', (kind) => {
    const note = say(describeLoadedScope({ ...base, kind, searching: true }));
    expect(note).not.toContain('undefined');
    expect(note).not.toMatch(/\d+\s*\/\s*\d+/);
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
    expect(say(author.description)).toContain('mục Soạn bài');

    expect(learner.action.kind).toBe('browse');
    expect(say(learner.description)).not.toContain('mục Soạn bài');
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
      expect(say(empty.description)).toContain('Bỏ bớt');
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
    expect(say(empty.title)).toContain('vừa thay đổi');
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
    expect(say(empty.description)).toContain('Xem thêm');
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
    expect(say(empty.description)).not.toContain('Xem thêm');
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
   * Một ánh xạ sai không ném lỗi: `LevelBars` vẫn vẽ, chỉ là sai số vạch. Nên nó
   * bị đóng đinh ở đây, theo đúng thứ tự dễ tới khó.
   */
  it('ba mức độ khó ứng với 1, 2, 3 vạch theo đúng thứ tự', () => {
    expect(SCENARIO_DIFFICULTIES.map((level) => DIFFICULTY_LEVEL[level])).toEqual([1, 2, 3]);
  });

  it('mỗi trạng thái có nhãn dựng ra được, và trạng thái lạ trả null chứ không ném', () => {
    for (const status of Object.keys(PROGRESS_STATUS_KEY)) {
      expect(progressStatusLabel(status)?.length ?? 0).toBeGreaterThan(0);
    }
    expect(progressStatusLabel('abandoned')).toBeNull();
  });
});

describe('describeResultCount · đếm cái ĐANG HIỆN, không đoán tổng kho', () => {
  const base = { kind: 'lessons' as const, shown: 12, loaded: 12, hasNext: false, hasActiveFilter: false, searching: false };

  it('còn phần chưa tải thì nói "còn nữa"', () => {
    expect(say(describeResultCount({ ...base, hasNext: true }))).toBe('Đang hiện 12 bài học, còn nữa');
  });

  it('hết danh sách thì chỉ là con số', () => {
    expect(say(describeResultCount({ ...base, kind: 'labs', shown: 3, loaded: 3 }))).toBe('3 lab');
  });

  it('đang lọc thì nói ra, để "ít kết quả" không bị đọc thành "kho ít"', () => {
    expect(say(describeResultCount({ ...base, kind: 'quiz', shown: 1, loaded: 1, hasActiveFilter: true }))).toBe(
      '1 bộ câu hỏi khớp bộ lọc',
    );
  });

  it('đang tìm thì nói rõ ô tìm chỉ soi phần đã tải', () => {
    const text = say(describeResultCount({ ...base, shown: 2, loaded: 40, hasNext: true, searching: true }));
    expect(text).toContain('2');
    expect(text).toContain('40');
    expect(text).toContain('đã tải');
  });

  it.each(KINDS)('%s · không câu nào chứa dấu gạch chéo kiểu "N/M"', (kind) => {
    for (const searching of [false, true]) {
      const text = say(describeResultCount({ ...base, kind, shown: 5, loaded: 9, hasNext: true, hasActiveFilter: true, searching }));
      expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
      expect(text).not.toContain('undefined');
    }
  });
});
