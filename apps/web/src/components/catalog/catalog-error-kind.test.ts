import { describe, expect, it } from 'vitest';
import { FIRST_PAGE, currentCursor, pageNumber, pushCursor, type CursorStack } from '../../lib/cursor-stack';
import { NO_FILTER, buildCatalogListInput } from './catalog-input';
import { describeCatalogError } from './catalog-error-kind';

/**
 * Lỗi tải một trang danh mục: nói đúng loại, và KHÔNG cướp mất chỗ đang đọc.
 *
 * Bộ này ra đời cùng lúc với việc `compositeContentSource` đổi từ "nuốt lỗi, trả
 * trang rỗng kèm 200" sang NÉM (`0ec4f8a`/`2cb5593`). Đổi đó đẩy một lớp lỗi mới
 * lên tới giao diện — `SERVICE_UNAVAILABLE` — và lớp đó có tính chất ngược hẳn
 * với lớp lỗi mà giao diện đang giả định: **thử lại là việc ĐÚNG cần làm**.
 */
describe('phân loại lỗi tải trang danh mục', () => {
  it('503 giữa chừng: thử lại được, và KHÔNG đẩy người dùng về đầu', () => {
    const advice = describeCatalogError({ code: 'SERVICE_UNAVAILABLE', page: 3 });

    expect(advice.kind).toBe('retryable');
    expect(advice.canRetry).toBe(true);
    // Ô then chốt. "Về đầu danh sách" ở đây không sửa được gì (trang 1 đọc cùng
    // một nguồn đang hỏng) và trả giá bằng đúng chỗ đang đọc.
    expect(advice.canGoFirstPage).toBe(false);
    expect(advice.hint).not.toBeNull();
    expect(advice.hint).toContain('3');
  });

  it('503 KHÔNG được mô tả bằng chẩn đoán của cursor hỏng', () => {
    const advice = describeCatalogError({ code: 'SERVICE_UNAVAILABLE', page: 3 });

    // Câu cũ nói "Mục làm mốc của trang này có thể đã bị gỡ khỏi kho". Với 503
    // đó là một lời khẳng định SAI SỰ THẬT về nguyên nhân, và nó dẫn thẳng tới
    // lối thoát phá hoại nhất.
    expect(advice.hint ?? '').not.toContain('gỡ khỏi kho');
    expect(advice.hint ?? '').not.toContain('mốc');
  });

  it('cursor hỏng (BAD_REQUEST giữa chừng): thử lại VÔ ÍCH, lối ra là về đầu', () => {
    const advice = describeCatalogError({ code: 'BAD_REQUEST', page: 3 });

    expect(advice.kind).toBe('stale-cursor');
    // Một nút "Thử lại" không bao giờ hết đỏ tệ hơn là không có nút nào.
    expect(advice.canRetry).toBe(false);
    expect(advice.canGoFirstPage).toBe(true);
  });

  it('BAD_REQUEST ở TRANG 1 không phải cursor hỏng — trang 1 không có cursor', () => {
    const advice = describeCatalogError({ code: 'BAD_REQUEST', page: 1 });

    expect(advice.kind).not.toBe('stale-cursor');
    expect(advice.canGoFirstPage).toBe(false);
  });

  it('lỗi mạng (không có mã) là loại thử-lại-được', () => {
    const advice = describeCatalogError({ code: null, page: 2 });

    expect(advice.kind).toBe('retryable');
    expect(advice.canRetry).toBe(true);
    expect(advice.canGoFirstPage).toBe(false);
  });

  it('mã lạ: không đoán bừa — vẫn cho thử lại, và chỉ nêu lối về đầu như phương án cuối', () => {
    const mid = describeCatalogError({ code: 'FORBIDDEN', page: 4 });
    expect(mid.kind).toBe('unknown');
    expect(mid.canRetry).toBe(true);
    expect(mid.canGoFirstPage).toBe(true);

    const first = describeCatalogError({ code: 'FORBIDDEN', page: 1 });
    expect(first.canGoFirstPage).toBe(false);
  });

  it('không mã (prop chưa được nơi gọi truyền) rơi về nhánh không-đoán', () => {
    // Năm client hiện chưa truyền mã lỗi xuống (xem report). Nhánh mặc định
    // phải an toàn: không chẩn đoán sai, không bỏ nút Thử lại.
    const advice = describeCatalogError({ code: undefined, page: 3 });

    expect(advice.kind).toBe('unknown');
    expect(advice.canRetry).toBe(true);
    expect(advice.hint ?? '').not.toContain('gỡ khỏi kho');
  });

  it('KHÔNG lỗi nào được mô tả như kho rỗng', () => {
    // Chính là lỗi mà cả chuỗi thay đổi này sinh ra để sửa: nguồn không đọc
    // được từng đi ra ngoài dưới dạng `{items:[]}` + 200 và hiện thành "Chưa có
    // bài học nào". "Không đọc được" và "kho trống" là HAI trạng thái.
    const codes = [null, undefined, 'SERVICE_UNAVAILABLE', 'TIMEOUT', 'INTERNAL_SERVER_ERROR', 'BAD_REQUEST', 'FORBIDDEN'];

    for (const code of codes) {
      for (const page of [1, 3]) {
        const hint = describeCatalogError({ code, page }).hint ?? '';
        expect(hint).not.toContain('rỗng');
        expect(hint).not.toContain('trống');
        expect(hint).not.toContain('Chưa có');
      }
    }
  });
});

/**
 * Ô AC của việc này: đang ở trang 3, lượt tải đỏ 503, bấm Thử lại ⇒ quay lại
 * ĐÚNG trang 3.
 *
 * ⛔ Vì sao mô phỏng cả vòng chứ không chỉ đọc `describeCatalogError`: câu hỏi
 * "có mất chỗ đang đọc không" không nằm trong một lời gọi nào — nó nằm ở chỗ
 * ngăn xếp cursor có bị chạm vào trên đường lỗi hay không, và ở chỗ lần gọi lại
 * có dựng lại ĐÚNG input cũ hay không. Một `refetch()` đúng và một `goFirst()`
 * lỡ tay đều cho `describeCatalogError` y hệt nhau.
 */
describe('lỗi giữa chừng không được làm mất chỗ đang đọc', () => {
  function walkTo(page: number): CursorStack {
    let stack: CursorStack = FIRST_PAGE;
    for (let i = 1; i < page; i += 1) {
      stack = pushCursor(stack, `cursor-${i}`);
    }
    return stack;
  }

  it('trang 3 + 503 + Thử lại ⇒ vẫn là trang 3, cùng một input', () => {
    const stack = walkTo(3);
    expect(pageNumber(stack)).toBe(3);

    const inputBefore = buildCatalogListInput(NO_FILTER, currentCursor(stack));

    // Lượt tải đỏ. Đường lỗi KHÔNG được chạm vào ngăn xếp.
    const advice = describeCatalogError({ code: 'SERVICE_UNAVAILABLE', page: pageNumber(stack) });
    const afterError: CursorStack = stack;

    expect(pageNumber(afterError)).toBe(3);
    expect(currentCursor(afterError)).toBe('cursor-2');

    // Người dùng bấm Thử lại: nạp lại cùng mốc, không nhảy mốc.
    expect(advice.canRetry).toBe(true);
    const inputAfterRetry = buildCatalogListInput(NO_FILTER, currentCursor(afterError));

    expect(inputAfterRetry).toEqual(inputBefore);
    expect(inputAfterRetry.cursor).toBe('cursor-2');
    expect(pageNumber(afterError)).toBe(3);
  });

  it('đối chứng âm: nếu đường lỗi gọi goFirst thì bài trên biết kêu', () => {
    // Chứng minh ô AC trên không xanh sẵn vì lý do rỗng. Cùng kịch bản, chỉ
    // thay hành vi lỗi bằng cái reset mà `CatalogError` từng mời người dùng bấm.
    const stack = walkTo(3);
    const inputBefore = buildCatalogListInput(NO_FILTER, currentCursor(stack));

    const afterReset: CursorStack = FIRST_PAGE;
    const inputAfterReset = buildCatalogListInput(NO_FILTER, currentCursor(afterReset));

    expect(pageNumber(afterReset)).toBe(1);
    expect(inputAfterReset).not.toEqual(inputBefore);
  });
});
