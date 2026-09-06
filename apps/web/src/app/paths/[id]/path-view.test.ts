import { describe, expect, it } from 'vitest';
import type { LearningPathItemView } from '@devops-platform/shared-types/path';
import {
  buildPathItemViews,
  itemOpenability,
  pathItemHref,
  summarizePathProgress,
} from './path-view';

function item(over: Partial<LearningPathItemView> = {}): LearningPathItemView {
  return {
    ordinal: 0,
    kind: 'lesson',
    itemId: 'intro-linux',
    title: 'Nhập môn Linux',
    state: 'available',
    ...over,
  };
}

describe('ổ khoá — item còn khoá KHÔNG có đường mở nào ở FE', () => {
  it('`state: locked` ⇒ openability locked, và `href` là null (không dựng link để bấm nhầm)', () => {
    const [view] = buildPathItemViews([item({ state: 'locked' })]);
    expect(view?.openability).toBe('locked');
    expect(view?.href).toBeNull();
    expect(view?.stateLabel).toBe('Còn khoá');
    expect(view?.note).toContain('hoàn thành phần trước');
  });

  it('`available` và `passed` mở được, và href trỏ đúng loại nội dung', () => {
    const views = buildPathItemViews([
      item({ ordinal: 0, kind: 'lesson', itemId: 'l1', state: 'available' }),
      item({ ordinal: 1, kind: 'lab', itemId: 'lab1', state: 'passed' }),
      item({ ordinal: 2, kind: 'quiz', itemId: 'q1', state: 'available' }),
    ]);
    expect(views.map((v) => v.href)).toEqual(['/lessons/l1', '/labs/lab1', '/quiz/q1']);
    expect(views.every((v) => v.openability === 'open')).toBe(true);
  });

  it('item ĐÃ ĐẠT vẫn mở dù item trước chưa đạt — không viết lại lịch sử của người học', () => {
    // Xảy ra thật khi tác giả BẬT `sequential` trên lộ trình người ta đã học dở
    // (`docs/learning-path.md` § "Luật mở khoá"). Server trả `passed`, FE không
    // được tự hạ nó xuống "khoá".
    const views = buildPathItemViews([
      item({ ordinal: 0, itemId: 'a', state: 'locked' }),
      item({ ordinal: 1, itemId: 'b', state: 'passed' }),
    ]);
    expect(views[1]?.openability).toBe('open');
    expect(views[1]?.href).toBe('/lessons/b');
  });

  it('id có ký tự cần escape vẫn ra URL hợp lệ', () => {
    expect(pathItemHref({ kind: 'lab', itemId: 'a b/c' })).toBe('/labs/a%20b%2Fc');
  });
});

describe('mắt xích thủng — `title: null` hiện ra, không bị giấu', () => {
  it('`title: null` ⇒ không mở được, tiêu đề rơi về mã để người soạn biết mắt xích nào', () => {
    const [view] = buildPathItemViews([item({ title: null, itemId: 'da-luu-tru' })]);
    expect(view?.openability).toBe('missing');
    expect(view?.missingContent).toBe(true);
    expect(view?.title).toBe('da-luu-tru');
    expect(view?.href).toBeNull();
    expect(view?.note).toContain('Không nạp được nội dung này');
  });

  it('vừa KHOÁ vừa THỦNG: cổng là "locked", nhưng cảnh báo cho người soạn KHÔNG biến mất', () => {
    const [view] = buildPathItemViews([item({ state: 'locked', title: null })]);
    expect(view?.openability).toBe('locked');
    expect(view?.missingContent).toBe(true);
  });

  it('itemOpenability xét `locked` TRƯỚC `missing`', () => {
    expect(itemOpenability(item({ state: 'locked', title: null }))).toBe('locked');
    expect(itemOpenability(item({ state: 'available', title: null }))).toBe('missing');
    expect(itemOpenability(item({ state: 'passed', title: 'X' }))).toBe('open');
  });
});

describe('summarizePathProgress — nhãn chỉ nói thứ nó biết', () => {
  it('đang học dở ⇒ đếm đúng, và chỉ tên phần kế tiếp bằng TIÊU ĐỀ chứ không bằng mã', () => {
    const summary = summarizePathProgress({
      passedCount: 1,
      itemCount: 3,
      nextItemId: 'lab-net',
      items: [
        item({ ordinal: 0, itemId: 'l1', state: 'passed' }),
        item({ ordinal: 1, kind: 'lab', itemId: 'lab-net', title: 'Mạng trong Docker' }),
        item({ ordinal: 2, kind: 'quiz', itemId: 'q1', state: 'locked' }),
      ],
    });
    expect(summary.label).toBe('Đã đạt 1/3 phần');
    expect(summary.nextLabel).toBe('Nên làm tiếp: Mạng trong Docker');
    expect(summary.finished).toBe(false);
  });

  it('phần kế tiếp không nạp được tiêu đề ⇒ rơi về mã, không hiện "undefined"', () => {
    const summary = summarizePathProgress({
      passedCount: 0,
      itemCount: 1,
      nextItemId: 'mat-tich',
      items: [item({ itemId: 'mat-tich', title: null })],
    });
    expect(summary.nextLabel).toBe('Nên làm tiếp: mat-tich');
  });

  it('đạt hết ⇒ nói đã xong', () => {
    const summary = summarizePathProgress({
      passedCount: 2,
      itemCount: 2,
      nextItemId: null,
      items: [
        item({ ordinal: 0, itemId: 'a', state: 'passed' }),
        item({ ordinal: 1, itemId: 'b', state: 'passed' }),
      ],
    });
    expect(summary.finished).toBe(true);
    expect(summary.nextLabel).toBe('Bạn đã đạt tất cả các phần của lộ trình này.');
  });

  it('⛔ BẪY P2: `nextItemId === null` mà CHƯA đạt hết thì KHÔNG được chúc mừng', () => {
    // DTO ghi rõ `nextItemId` cũng `null` "khi mọi thứ còn lại đều locked".
    // Đọc null thành "hoàn thành" là kết luận nhiều hơn dữ liệu — đúng hình
    // dạng lỗi "4/4 bước" của P2.
    const summary = summarizePathProgress({
      passedCount: 1,
      itemCount: 3,
      nextItemId: null,
      items: [
        item({ ordinal: 0, itemId: 'a', state: 'passed' }),
        item({ ordinal: 1, itemId: 'b', state: 'locked' }),
        item({ ordinal: 2, itemId: 'c', state: 'locked' }),
      ],
    });
    expect(summary.finished).toBe(false);
    expect(summary.nextLabel).toBeNull();
    expect(summary.label).toBe('Đã đạt 1/3 phần');
  });

  it('lộ trình RỖNG không phải lộ trình đã hoàn thành', () => {
    const summary = summarizePathProgress({
      passedCount: 0,
      itemCount: 0,
      nextItemId: null,
      items: [],
    });
    expect(summary.finished).toBe(false);
    expect(summary.nextLabel).toBeNull();
  });
});
