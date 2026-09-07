/**
 * C5 — "còn N chỗ" cho khung phiên dùng chung.
 *
 * ⛔ **Ngưỡng KHÔNG nằm ở đây.** Số học (số còn lại, mức `ok`/`low`/`full`,
 * ngữ nghĩa "chưa biết") sống ở `components/shell/capacity.ts` và file này chỉ
 * là lớp CHỮ: nhãn cạnh nút Bắt đầu + câu cảnh báo trước khi bấm.
 *
 * Trước 2026-09-06 file này có ngưỡng riêng (`LOW_REMAINING = 3`) trong khi vỏ
 * dùng tỉ lệ 20% trần mềm. Với trần 20 và 16 phiên đang chạy, badge trên thanh
 * đầu trang đọc "sắp hết chỗ" còn nhãn cạnh nút Bắt đầu ngay bên dưới đọc
 * "còn 4 chỗ" bình thường — cùng dữ liệu, cùng màn hình, hai câu ngược nhau.
 * Ngưỡng cố định cũng mục đúng kiểu hằng `capacitySoftLimit` viết tay mà D5 đã
 * gỡ khỏi orchestrator, nên bản gộp giữ tỉ lệ của vỏ. Chiều phụ thuộc là
 * session → shell: vỏ nằm trên tất cả và không kéo theo phụ thuộc terminal nào.
 *
 * Hàm THUẦN, tách khỏi React, vì thứ cần gác ở đây là NGỮ NGHĨA của con số —
 * đặc biệt là ranh giới "chưa biết" vs "biết là 0". `apps/web` để vitest ở
 * `environment: 'node'` cho MẶC ĐỊNH; từ 2026-09-08 jsdom + RTL bật được cho
 * TỪNG file bằng docblock `// @vitest-environment jsdom`, nên "không test được
 * ngoài hàm thuần" không còn là ràng buộc. Ngữ nghĩa của một con số thì vẫn
 * nên khẳng định thẳng: đọc ngược nó ra từ DOM là đo qua một lớp trung gian
 * không liên quan.
 */

import { readCapacity } from '../shell/capacity';

// Cùng MỘT kiểu, không phải hai kiểu trùng hình dạng: C5 giữ tên, vỏ giữ định
// nghĩa. Khai lại ở đây là mở lại đúng khe hở vừa bịt.
export type { CapacitySnapshot, CapacityTone } from '../shell/capacity';

import type { CapacityTone } from '../shell/capacity';

export interface CapacityHint {
  readonly remaining: number;
  readonly exhausted: boolean;
  readonly tone: CapacityTone;
  /** Nhãn ngắn cạnh nút Bắt đầu. */
  readonly label: string;
  /** Câu cảnh báo hiện TRƯỚC khi bấm; `null` khi còn chỗ. */
  readonly warning: string | null;
}

/**
 * `null` = **CHƯA BIẾT**, và nó KHÁC "biết là đã đầy".
 *
 * Query lỗi / chưa chạy / đang tắt đều cho `undefined`, và vẽ chúng thành
 * "Sandbox đang đầy" là bịa ra một sự thật hạ tầng từ một lỗi mạng. Người gọi
 * nhận `null` thì KHÔNG hiện gì cả — im lặng đúng hơn là sai. Cổng này nằm
 * trong `readCapacity` (vỏ) để vỏ và khung phiên không thể lệch nhau về nó.
 */
export function describeCapacity(
  snapshot: Parameters<typeof readCapacity>[0],
): CapacityHint | null {
  const level = readCapacity(snapshot);
  if (level === null) {
    return null;
  }

  return {
    ...level,
    label: level.exhausted ? 'Sandbox đang đầy' : `Còn ${String(level.remaining)} chỗ`,
    warning: level.exhausted
      ? 'Sandbox đang đầy — mọi chỗ đều đang có người dùng. Bạn vẫn bấm Bắt đầu được, ' +
        'nhưng nhiều khả năng sẽ bị từ chối. Hãy thử lại sau vài phút, hoặc kết thúc một ' +
        'phiên khác bạn đang mở ở trang Của tôi.'
      : null,
  };
}
