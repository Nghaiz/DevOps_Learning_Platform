import { describe, expect, it } from 'vitest';
import { TERMINAL_STATUS_FLOOR, reasonFromLookupError, reasonFromStatus } from './session-reason';

/**
 * Contract §7 — quyết định "bỏ cuộc hay thử tiếp" sau khi hỏi lý do thật.
 *
 * Ô này gác một lỗi ĐÃ XẢY RA, không phải một giả thuyết: trang bài học của 2.D
 * dùng lại `session-machine` (cờ `needsReasonLookup` vẫn được đặt) nhưng không có
 * ai đọc cờ đó, nên phiên chết hẳn vẫn quay vòng vô hạn dưới nhãn "Đang kết nối…".
 */
describe('reasonFromStatus', () => {
  it('trạng thái cuối (EXPIRED/REAPED/FAILED) ⇒ dừng hẳn', () => {
    for (const status of [5, 6, 7]) {
      expect(reasonFromStatus(status).gone).toBe(true);
    }
  });

  it('BIÊN: ngay dưới ngưỡng vẫn là phiên còn sống ⇒ thử tiếp', () => {
    // Kiểm đúng cái biên chứ không kiểm một giá trị ở giữa: sai lệch một bậc ở
    // đây biến "phiên đang provisioning" thành "phiên đã chết" và giết một phiên
    // hoàn toàn khoẻ mạnh.
    expect(reasonFromStatus(TERMINAL_STATUS_FLOOR - 1).gone).toBe(false);
    expect(reasonFromStatus(TERMINAL_STATUS_FLOOR).gone).toBe(true);
  });

  it('máy chủ trả lời mà KHÔNG kèm phiên nào ⇒ dừng hẳn', () => {
    expect(reasonFromStatus(null).gone).toBe(true);
  });

  it('thông báo cho người còn thử tiếp KHÁC người đã hết đường', () => {
    expect(reasonFromStatus(2).message).not.toBe(reasonFromStatus(7).message);
  });
});

describe('reasonFromLookupError', () => {
  it('NOT_FOUND ⇒ phiên không còn, dừng hẳn', () => {
    // Ca này là hồi quy của bản inline cũ ở `/session`: nó để NOT_FOUND rơi vào
    // nhánh catch chung (`gone: false`), nên một phiên đã bị reaper xoá vẫn quay
    // vòng backoff như thể mạng chập.
    expect(reasonFromLookupError('NOT_FOUND', 'bất kỳ').gone).toBe(true);
  });

  it('FORBIDDEN/UNAUTHORIZED ⇒ dừng hẳn, và nói về quyền chứ không nói về mạng', () => {
    for (const code of ['FORBIDDEN', 'UNAUTHORIZED']) {
      const outcome = reasonFromLookupError(code, 'bất kỳ');
      expect(outcome.gone).toBe(true);
      expect(outcome.message).toMatch(/quyền/);
    }
  });

  it('lỗi mạng (không có mã) ⇒ KHÔNG kết luận phiên chết, và giữ nguyên văn lỗi', () => {
    const outcome = reasonFromLookupError(null, 'Không gọi được máy chủ.');
    expect(outcome.gone).toBe(false);
    expect(outcome.message).toBe('Không gọi được máy chủ.');
  });

  it('mã lạ của server ⇒ vẫn thử tiếp', () => {
    // Mặc định phải là "thử tiếp": kết luận "chết" từ một mã chưa biết sẽ giết
    // phiên sống, còn thử tiếp thừa chỉ tốn một vòng backoff.
    expect(reasonFromLookupError('INTERNAL_SERVER_ERROR', 'lỗi').gone).toBe(false);
  });
});
