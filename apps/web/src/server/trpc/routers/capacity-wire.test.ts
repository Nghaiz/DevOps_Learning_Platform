import { create } from '@bufbuild/protobuf';
import {
  GetCapacityResponseSchema,
  type GetCapacityResponse,
} from '@devops-platform/shared-types/orchestrator/v1';
import { describe, expect, it } from 'vitest';
import { toCapacityView } from '../../capacity/get-capacity';

/**
 * Cổng chống QUÊN ÁNH XẠ trên đường `capacity.get`.
 *
 * ## Vì sao ô này tồn tại
 *
 * `fetchCapacity` từng liệt kê từng field một. Khi orchestrator thêm
 * `quota_readable` / `quota_error` / `profile_capacity` (2026-09-08, bản vá
 * "còn N chỗ"), một danh sách chép tay sẽ nuốt gọn chúng: không lỗi biên dịch,
 * không test đỏ, chỉ là FE không bao giờ thấy dữ liệu mới. Đó là một cái bẫy
 * chứ không phải một chi tiết — và nó suýt nổ đúng trong bản vá này.
 *
 * Ô này so trực tiếp với DESCRIPTOR của proto, tức nó tự biết field mới ngay
 * lúc `pnpm proto` chạy, không cần ai nhớ cập nhật một danh sách thứ hai.
 */

/**
 * Field wire CỐ Ý không ra tới client.
 *
 * Rỗng hôm nay, và giữ lại như một chỗ khai TƯỜNG MINH: bỏ một field phải là
 * một dòng có tên + lý do, không phải một dòng bị quên. `$typeName` không nằm
 * đây vì nó không phải field proto — nó là nhãn thời chạy của protobuf-es.
 */
const CO_Y_BO_QUA: readonly string[] = [];

/** Tên JS (camelCase) của mọi field trong `GetCapacityResponse`, đọc từ proto. */
function wireFields(): string[] {
  return GetCapacityResponseSchema.fields.map((f) => f.localName);
}

/** Response đầy đủ: MỌI field khác zero, để không field nào bị `omitempty` giấu. */
function fullResponse(): GetCapacityResponse {
  return create(GetCapacityResponseSchema, {
    activeSessions: 6,
    softCapacity: 20,
    poolFree: 2,
    poolQuarantine: 1,
    hardCapacity: 23,
    quotaReadable: true,
    quotaError: '',
    profileCapacity: {
      '': { slotsFree: 20, slotsTotal: 23 },
      ide: { slotsFree: 6, slotsTotal: 7 },
    },
  });
}

describe('capacity.get — hình dạng wire tới client', () => {
  it('MỌI field của GetCapacityResponse đều ra tới client', () => {
    const view = toCapacityView(fullResponse(), '2026-09-08T10:00:00.000Z');
    const keys = new Set(Object.keys(view));

    const thieu = wireFields().filter((f) => !CO_Y_BO_QUA.includes(f) && !keys.has(f));
    expect(
      thieu,
      `Field proto không tới được client: ${thieu.join(', ')}. ` +
        'Đừng chép tay từng field — giữ nguyên spread trong toCapacityView, ' +
        'hoặc khai tên field vào CO_Y_BO_QUA kèm lý do.',
    ).toEqual([]);
  });

  it('ĐỐI CHỨNG DƯƠNG: một bản ánh xạ chép tay thiếu field thì ô trên ĐỎ', () => {
    // Đúng hình dạng `fetchCapacity` CŨ — năm field, chép tay. Nếu phép kiểm ở
    // trên không phân biệt được bản này với bản đúng thì nó không gác gì cả
    // (`green-that-proves-nothing`).
    const response = fullResponse();
    const chepTay = {
      activeSessions: response.activeSessions,
      softCapacity: response.softCapacity,
      hardCapacity: response.hardCapacity,
      poolFree: response.poolFree,
      poolQuarantine: response.poolQuarantine,
      fetchedAt: '2026-09-08T10:00:00.000Z',
    };
    const keys = new Set(Object.keys(chepTay));
    const thieu = wireFields().filter((f) => !CO_Y_BO_QUA.includes(f) && !keys.has(f));

    expect(thieu).toEqual(expect.arrayContaining(['quotaReadable', 'quotaError', 'profileCapacity']));
  });

  it('`$typeName` KHÔNG rò ra payload — nó là nhãn thời chạy, không phải dữ liệu', () => {
    const view = toCapacityView(fullResponse(), '2026-09-08T10:00:00.000Z');
    expect(Object.keys(view)).not.toContain('$typeName');
  });

  it('giá trị đi qua nguyên vẹn, gồm cả map theo profile', () => {
    const view = toCapacityView(fullResponse(), '2026-09-08T10:00:00.000Z');
    expect(view.activeSessions).toBe(6);
    expect(view.quotaReadable).toBe(true);
    expect(view.fetchedAt).toBe('2026-09-08T10:00:00.000Z');
    // Khoá "" = profile mặc định, cùng quy ước với CreateSessionRequest.profile.
    expect(view.profileCapacity['']?.slotsFree).toBe(20);
    expect(view.profileCapacity.ide?.slotsFree).toBe(6);
    expect(view.profileCapacity.ide?.slotsTotal).toBe(7);
  });
});
