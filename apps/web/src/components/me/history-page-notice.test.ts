import { describe, expect, it } from 'vitest';
import {
  describeEmptyPage,
  shouldShowPager,
  type HistoryNotice,
  type HistoryPageState,
} from './history-page-notice';

/**
 * F4 — một trang rỗng có BA nguyên nhân khác nhau và giao diện chỉ biết một.
 *
 * Luật cũ là `items.length === 0 ⇒ hiện "Chưa có ... nào", giấu pager`. Nó đúng
 * cho đúng một nguyên nhân (chưa từng có gì) và nói SAI SỰ THẬT cho hai nguyên
 * nhân còn lại:
 *
 *  · trang bị `me.listLabAttempts` lọc sạch (lab đã bị gỡ) nhưng CÒN trang sau
 *    — người dùng đọc "Chưa có lần thử nào" trong khi lịch sử của họ vẫn còn
 *    nguyên ở trang kế, và nút Trang sau bị giấu nên không tới được;
 *  · trang ≥ 2 rỗng — không có pager thì cũng không có cả đường VỀ trang 1.
 *
 * Bộ này gác câu chữ theo hai vế: nói ra CHUYỆN GÌ XẢY RA, và nói LÀM GÌ TIẾP.
 */

const BLANK: HistoryNotice = {
  title: 'Chưa có lần thử lab nào',
  description: 'Bắt đầu một lab và mọi lần thử của bạn sẽ được ghi lại ở đây.',
};

function state(over: Partial<HistoryPageState>): HistoryPageState {
  return { page: 1, itemCount: 0, hasNext: false, skipped: 0, ...over };
}

describe('describeEmptyPage — không nói "chưa có gì" khi thật ra là "trang này lọc hết"', () => {
  it('trang 1, không trang sau, không lọc gì ⇒ đúng là chưa có gì', () => {
    expect(describeEmptyPage(state({}), BLANK)).toEqual(BLANK);
  });

  it('trang có dòng ⇒ không thông báo gì', () => {
    expect(describeEmptyPage(state({ itemCount: 3 }), BLANK)).toBeNull();
  });

  it('lọc sạch nhưng CÒN trang sau ⇒ nêu nguyên nhân + chỉ đường đi tiếp', () => {
    const notice = describeEmptyPage(state({ skipped: 2, hasNext: true }), BLANK);

    expect(notice).not.toBeNull();
    // Không được mượn câu của trạng thái "chưa có gì" — đó là câu sai sự thật.
    expect(notice?.title).not.toBe(BLANK.title);
    // Chuyện gì xảy ra: có mục, nhưng nội dung của chúng đã bị gỡ.
    expect(notice?.description).toContain('2');
    expect(notice?.description).toContain('gỡ');
    // Làm gì tiếp.
    expect(notice?.description).toContain('Trang sau');
  });

  it('trang rỗng mà còn trang sau (không lọc) vẫn chỉ đường đi tiếp', () => {
    const notice = describeEmptyPage(state({ page: 2, hasNext: true }), BLANK);
    expect(notice?.title).not.toBe(BLANK.title);
    expect(notice?.description).toContain('Trang sau');
  });

  it('trang ≥ 2 rỗng và hết trang ⇒ chỉ đường VỀ trang đầu', () => {
    const notice = describeEmptyPage(state({ page: 3 }), BLANK);
    expect(notice?.title).not.toBe(BLANK.title);
    expect(notice?.description).toContain('trang đầu');
  });

  it('trang 1 lọc sạch và hết trang ⇒ nêu nguyên nhân, KHÔNG hứa một trang sau không tồn tại', () => {
    const notice = describeEmptyPage(state({ skipped: 1 }), BLANK);
    expect(notice?.description).toContain('gỡ');
    expect(notice?.description).not.toContain('Trang sau');
    expect(notice?.description).not.toContain('trang đầu');
  });

  it('không nhắc tới giá, gói cước hay nâng cấp ở bất kỳ câu nào', () => {
    const cam = ['giá', 'gói', 'nâng cấp', 'thanh toán', 'trả phí'];
    for (const s of [
      state({ skipped: 2, hasNext: true }),
      state({ page: 3 }),
      state({ skipped: 1 }),
      state({ page: 2, hasNext: true }),
    ]) {
      const notice = describeEmptyPage(s, BLANK);
      const text = `${notice?.title ?? ''} ${notice?.description ?? ''}`.toLowerCase();
      for (const tu of cam) {
        expect(text).not.toContain(tu);
      }
    }
  });
});

describe('shouldShowPager — pager là đường ĐI, không phải trang trí của bảng', () => {
  it.each([
    ['trang 1, rỗng, hết trang', state({}), false],
    ['trang 1, có dòng', state({ itemCount: 5 }), true],
    ['trang 1, rỗng, CÒN trang sau', state({ hasNext: true, skipped: 2 }), true],
    ['trang 3, rỗng, hết trang (cần đường về)', state({ page: 3 }), true],
    ['trang 2, rỗng, còn trang sau', state({ page: 2, hasNext: true }), true],
  ])('%s', (_label, s, muon) => {
    expect(shouldShowPager(s)).toBe(muon);
  });
});
