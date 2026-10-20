import { describe, expect, it } from 'vitest';
import { SessionStatus } from '@devops-platform/shared-types';
import { TERMINAL_STATUS_FLOOR } from '../../lib/session-reason';
import {
  describeExpiry,
  describeSessionOwner,
  describeSessionStatus,
  describeTerminateError,
  planTerminate,
  shortId,
} from './session-row';

const VIEWER = 'usr_admin_1';

describe('describeSessionStatus', () => {
  /**
   * Bảng nhãn khai bằng SỐ (để không kéo module proto vào bundle trình duyệt),
   * nên phải có một phép kiểm nối nó với enum THẬT. Không có ca này thì
   * orchestrator đổi số là bảng quản trị nói sai mà không ai biết.
   */
  it('phủ đúng mọi giá trị của enum SessionStatus sinh từ proto', () => {
    const fromProto = Object.values(SessionStatus).filter(
      (value): value is number => typeof value === 'number',
    );
    for (const status of fromProto) {
      expect(describeSessionStatus(status).label).not.toContain('Trạng thái lạ');
    }
  });

  it('khớp ngưỡng terminal dùng chung, không chép lại số 5', () => {
    for (const status of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(describeSessionStatus(status).live).toBe(status < TERMINAL_STATUS_FLOOR);
    }
  });

  it('RUNNING đọc ra "Đang chạy"', () => {
    expect(describeSessionStatus(SessionStatus.RUNNING).label).toBe('Đang chạy');
  });

  it('REAPED không còn sống', () => {
    expect(describeSessionStatus(SessionStatus.REAPED).live).toBe(false);
  });

  /** Giá trị lạ KHÔNG được đọc ra "đang chạy" và KHÔNG được thành ô trống. */
  it('trạng thái lạ: hiện đúng con số, không sống, không rỗng', () => {
    const view = describeSessionStatus(42);
    expect(view.label).toContain('42');
    expect(view.label).not.toBe('');
    expect(view.live).toBe(false);
  });
});

describe('planTerminate — nói ra AI là người bấm', () => {
  const plan = planTerminate({
    sessionId: 'sess_abcdefghijklmnop',
    ownerUserId: 'usr_hoc_9',
    viewerId: VIEWER,
  });

  it('nêu chủ phiên', () => {
    expect(plan.body).toContain('usr_hoc_9');
  });

  /**
   * D15: `ReapSession` có nhánh actor riêng `admin_user_id` đúng để orchestrator
   * ghi reap dưới tên ADMIN thay vì dưới tên chủ phiên (bản trước ghi ra một
   * dòng audit SAI, không phải một dòng thiếu). Giao diện phải nói ra sự phân
   * biệt đó, nếu không cả công của D15 vô hình với người dùng nó.
   */
  it('nói rõ nhật ký ghi dưới tên NGƯỜI BẤM, không phải chủ phiên', () => {
    expect(plan.body).toContain('dưới tên bạn');
    expect(plan.body).toContain('không phải tên chủ phiên');
  });

  /**
   * review-1 #26: mã lý do `admin_terminated` là chuỗi nội bộ gửi xuống
   * orchestrator, không phải câu cho người bấm. Câu xác nhận nói việc bằng lời;
   * chuỗi gốc vẫn hiện nguyên ở cột Chi tiết của trang Nhật ký
   * (`describeAuditDetail`, gác ở `audit-row.test.ts`).
   */
  it('không lộ mã lý do nội bộ trong câu xác nhận', () => {
    expect(plan.body).not.toContain('admin_terminated');
  });

  it('cảnh báo hậu quả không hoàn tác được', () => {
    expect(plan.body).toContain('sẽ mất');
    expect(plan.body).toContain('không được báo trước');
  });

  it('phiên của chính admin: vẫn là hành động quản trị, và nói ra điều đó', () => {
    const own = planTerminate({
      sessionId: 'sess_1',
      ownerUserId: VIEWER,
      viewerId: VIEWER,
    });
    expect(own.ownedBySelf).toBe(true);
    expect(own.body).toContain('chính bạn');
    expect(own.body).toContain('dưới tên bạn');
  });

  it('tiêu đề nêu phiên nào', () => {
    expect(plan.title).toContain('sess_abcdefg');
  });
});

describe('describeSessionOwner', () => {
  it('phiên của người khác: hiện id đầy đủ', () => {
    expect(describeSessionOwner('usr_hoc_9', VIEWER)).toBe('usr_hoc_9');
  });

  it('phiên của chính mình được đánh dấu', () => {
    expect(describeSessionOwner(VIEWER, VIEWER)).toContain('(bạn)');
  });

  it('chủ phiên rỗng: nói không rõ, KHÔNG để ô trống', () => {
    expect(describeSessionOwner('', VIEWER)).toContain('không rõ');
  });
});

describe('describeExpiry', () => {
  const now = Date.parse('2026-09-06T10:00:00.000Z');

  it('còn hạn thì đếm ngược theo phút', () => {
    expect(describeExpiry('2026-09-06T10:25:00.000Z', now)).toBe('còn 25 phút');
  });

  /**
   * Phiên QUÁ HẠN mà vẫn nằm trong danh sách là thông tin thật (lượt dọn phiên
   * chưa chạy tới). "còn -3 phút" thì không ai đọc ra điều đó. Câu nói bằng lời
   * thường, không bằng tên tiến trình nội bộ (review-1 #26).
   */
  it('quá hạn nói rõ là quá hạn và chưa được dọn', () => {
    const text = describeExpiry('2026-09-06T09:57:00.000Z', now);
    expect(text).toContain('quá hạn 3 phút');
    expect(text).toContain('sắp được dọn');
    expect(text).not.toContain('reaper');
    expect(text).not.toContain('-3');
  });

  it('không có hạn hoặc chuỗi hỏng: nói không rõ', () => {
    expect(describeExpiry(null, now)).toBe('không rõ hạn');
    expect(describeExpiry('hôm qua', now)).toBe('không rõ hạn');
  });
});

describe('shortId', () => {
  it('id ngắn giữ nguyên; id dài cắt nhưng vẫn còn phần phân biệt được', () => {
    expect(shortId('sess_123')).toBe('sess_123');
    expect(shortId('sess_abcdefghijklmnop')).toBe('sess_abcdefg…');
  });
});

describe('describeTerminateError', () => {
  it('NOT_FOUND: gợi ý phiên có thể đã tự hết hạn', () => {
    const text = describeTerminateError('NOT_FOUND', 'Không có phiên đó');
    expect(text).toContain('hết hạn');
    // Chữ hoa: nửa `next` của ErrorEntry là một câu riêng và mở đầu bằng động
    // từ (p16-copy.md luật số 4), nên nó không còn nằm giữa câu như bản cũ.
    expect(text).toContain('Tải lại');
  });

  it('lỗi khác: không khẳng định phiên còn sống hay đã chết', () => {
    expect(describeTerminateError(null, 'Không gọi được máy chủ.')).toContain('Tải lại danh sách');
  });
});
