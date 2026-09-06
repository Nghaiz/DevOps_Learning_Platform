/**
 * F4 — một trang RỖNG có ba nguyên nhân, và giao diện cũ chỉ biết một.
 *
 * Luật cũ nằm rải trong `history-tabs.tsx` + `active-sessions.tsx`:
 * `items.length === 0 ⇒ hiện "Chưa có ... nào" và KHÔNG render pager`. Nó đúng
 * cho đúng một nguyên nhân — chưa từng có gì — và nói sai sự thật cho hai
 * nguyên nhân còn lại:
 *
 *  · `me.listLabAttempts` lọc bỏ dòng có lab đã bị gỡ (xem `skipped` ở
 *    `routers/me.ts`), nên trang 1 có thể sạch trơn trong khi `nextCursor` vẫn
 *    khác `null`. Người dùng đọc "Chưa có lần thử nào" cho một lịch sử vẫn còn
 *    nguyên ở trang kế — và nút Trang sau bị giấu nên không tới được.
 *  · Một trang ≥ 2 rỗng thì cũng mất luôn đường VỀ trang 1, vì nút "Về trang
 *    đầu" nằm trong chính cái pager vừa bị giấu.
 *
 * Hai hàm dưới là nơi DUY NHẤT quyết định hai câu hỏi đó cho cả bốn danh sách
 * của `/me` (phiên đang mở · tiến độ bài học · lịch sử lab · lịch sử quiz) —
 * chép tay sang từng danh sách là bốn bản sẽ trôi khỏi nhau.
 */

export interface HistoryPageState {
  /** 1-based, như `useCursorPages().page`. */
  readonly page: number;
  readonly itemCount: number;
  readonly hasNext: boolean;
  /**
   * Dòng bị TẦNG ĐỌC bỏ vì nội dung không còn đọc được. Vắng = 0 (danh sách
   * không lọc gì: tiến độ bài học, phiên đang mở, lịch sử quiz).
   */
  readonly skipped?: number;
}

export interface HistoryNotice {
  readonly title: string;
  readonly description: string;
}

/**
 * Thông báo cho một trang rỗng. `null` = trang có dòng để hiện.
 *
 * `blank` là câu của riêng từng danh sách, và nó CHỈ được dùng cho đúng ca nó
 * nói thật: trang đầu, không còn trang sau, không bỏ dòng nào.
 */
export function describeEmptyPage(
  state: HistoryPageState,
  blank: HistoryNotice,
): HistoryNotice | null {
  if (state.itemCount > 0) {
    return null;
  }

  const skipped = state.skipped ?? 0;
  if (state.page === 1 && !state.hasNext && skipped === 0) {
    return blank;
  }

  // Hai vế, luôn theo thứ tự này: CHUYỆN GÌ XẢY RA, rồi LÀM GÌ TIẾP. Thiếu vế
  // đầu thì người dùng tưởng mình mất dữ liệu; thiếu vế sau thì họ biết chuyện
  // gì xảy ra nhưng vẫn kẹt.
  const nguyenNhan =
    skipped > 0
      ? `${String(skipped)} mục ở trang này thuộc nội dung đã bị gỡ khỏi hệ thống. `
      : '';
  const diTiep = state.hasNext
    ? 'Bấm "Trang sau" để xem phần còn lại của lịch sử.'
    : state.page > 1
      ? 'Bấm "Về trang đầu" để xem lại từ đầu.'
      : 'Không còn mục nào khác để xem.';

  return {
    title: skipped > 0 ? 'Trang này không hiển thị được mục nào' : 'Trang này không có mục nào',
    description: `${nguyenNhan}${diTiep}`,
  };
}

/**
 * Pager là đường ĐI, không phải trang trí của bảng — nên nó hiện bất cứ khi nào
 * còn chỗ để đi: còn trang sau, hoặc đang đứng ở trang ≥ 2 (cần đường về).
 */
export function shouldShowPager(state: HistoryPageState): boolean {
  return state.itemCount > 0 || state.hasNext || state.page > 1;
}
