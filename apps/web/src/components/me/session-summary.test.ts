import { describe, expect, it } from 'vitest';
import { SessionStatus } from '@devops-platform/shared-types';
import { TERMINAL_STATUS_FLOOR } from '../../lib/session-reason';
import {
  describeEndSessionError,
  describeMySessionStatus,
  describeSessionExpiry,
  shortSessionId,
} from './session-summary';

describe('describeMySessionStatus', () => {
  it('phủ đúng MỌI giá trị của enum SessionStatus sinh từ proto', () => {
    // Bảng trong `session-summary.ts` khai bằng SỐ để không kéo
    // `@bufbuild/protobuf` vào bundle trình duyệt. Phép kiểm này là thứ giữ hai
    // bên khỏi trôi: thêm một trạng thái mới ở orchestrator mà quên dịch sẽ ĐỎ
    // ở đây, không lặng lẽ hiện "Trạng thái lạ" cho người học.
    const fromProto = Object.values(SessionStatus).filter(
      (value): value is number => typeof value === 'number',
    );
    expect(fromProto.length).toBeGreaterThan(0);

    for (const status of fromProto) {
      expect(describeMySessionStatus(status).label).not.toContain('Trạng thái lạ');
    }
  });

  it('`live` bám đúng TERMINAL_STATUS_FLOOR, không chép lại con số', () => {
    const fromProto = Object.values(SessionStatus).filter(
      (value): value is number => typeof value === 'number',
    );
    for (const status of fromProto) {
      expect(describeMySessionStatus(status).live).toBe(status < TERMINAL_STATUS_FLOOR);
    }
  });

  it('dùng câu chữ của NGƯỜI HỌC, không phải của người trực hệ thống', () => {
    // `components/admin/session-row.ts` gọi WARM là "Pod ấm trong pool" — đúng
    // với người trực, vô nghĩa với người vào học buổi đầu. Bản song song này
    // tồn tại đúng vì khác biệt đó; nếu nó trôi về cùng câu chữ thì nó thành
    // một bản chép thừa.
    expect(describeMySessionStatus(SessionStatus.RUNNING).label).toBe('Đang chạy');
    expect(describeMySessionStatus(SessionStatus.WARM).label).toBe('Đang chuẩn bị máy');
    expect(describeMySessionStatus(SessionStatus.WARM).label).not.toContain('pool');
    expect(describeMySessionStatus(SessionStatus.REAPED).label).not.toContain('thu hồi');
  });

  it('trạng thái lạ hiện đúng con số thay vì ô trống hoặc "Đang chạy"', () => {
    const view = describeMySessionStatus(42);
    expect(view.label).toBe('Trạng thái lạ (42)');
    expect(view.live).toBe(false);
  });
});

describe('describeSessionExpiry', () => {
  const now = Date.parse('2026-09-06T10:00:00.000Z');

  it('còn hạn', () => {
    expect(describeSessionExpiry('2026-09-06T10:30:00.000Z', now)).toBe('còn 30 phút');
  });

  it('quá hạn KHÔNG hiện số phút âm', () => {
    const text = describeSessionExpiry('2026-09-06T09:57:00.000Z', now);
    expect(text).toBe('đã quá hạn, đang được dọn');
    expect(text).not.toContain('-');
  });

  it('thiếu hạn hoặc chuỗi hỏng: nói không rõ, không hiện Invalid Date', () => {
    expect(describeSessionExpiry(null, now)).toBe('không rõ hạn');
    expect(describeSessionExpiry('không-phải-ngày', now)).toBe('không rõ hạn');
  });
});

describe('shortSessionId', () => {
  it('giữ nguyên id ngắn, rút gọn id dài', () => {
    expect(shortSessionId('abc')).toBe('abc');
    expect(shortSessionId('0123456789abcdef')).toBe('0123456789ab…');
  });
});

describe('describeEndSessionError', () => {
  it('mỗi câu lỗi nói CHUYỆN GÌ và LÀM GÌ TIẾP', () => {
    const notFound = describeEndSessionError('NOT_FOUND', 'Không tìm thấy phiên');
    expect(notFound).toContain('hết hạn');
    // Nửa `next` của `ErrorEntry` là câu riêng mở đầu bằng động từ, nên chữ
    // `T` viết hoa. Khẳng định vẫn là "câu này bảo người dùng tải lại".
    expect(notFound).toContain('Tải lại danh sách');

    const other = describeEndSessionError(null, 'Mất kết nối tới máy chủ.');
    expect(other).toContain('Mất kết nối tới máy chủ.');
    expect(other.toLowerCase()).toContain('thử lại');
  });
});
