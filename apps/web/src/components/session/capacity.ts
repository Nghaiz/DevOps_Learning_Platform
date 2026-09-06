/**
 * C5 — "còn N chỗ" cho khung phiên dùng chung.
 *
 * ⛔ KHÔNG có hằng số 20 hay 23 ở đâu trong file này, và đó là điểm.
 * `softCapacity` được orchestrator TÍNH lúc đọc (`hard − poolTarget`, xem
 * `apps/web/src/server/capacity/get-capacity.ts`); chép nó thành hằng ở FE là
 * dựng đúng cái derived field mà P8/P10 đã cấm — sửa Helm một vế thì vế kia mục
 * trong im lặng và nhãn "còn N chỗ" nói dối về trần thật.
 *
 * Hàm THUẦN, tách khỏi React, vì thứ cần gác ở đây là NGỮ NGHĨA của con số —
 * đặc biệt là ranh giới "chưa biết" vs "biết là 0". `apps/web` chạy vitest ở
 * `environment: 'node'` (không jsdom, không RTL), nên mọi thứ đáng khẳng định
 * phải sống được ngoài cây component.
 */

export interface CapacitySnapshot {
  readonly activeSessions: number;
  readonly softCapacity: number;
}

/** Mức để tô màu, KHÔNG phải để quyết định chặn — nút Bắt đầu luôn bấm được. */
export type CapacityTone = 'ok' | 'low' | 'full';

export interface CapacityHint {
  readonly remaining: number;
  readonly exhausted: boolean;
  readonly tone: CapacityTone;
  /** Nhãn ngắn cạnh nút Bắt đầu. */
  readonly label: string;
  /** Câu cảnh báo hiện TRƯỚC khi bấm; `null` khi còn chỗ. */
  readonly warning: string | null;
}

/** Dưới ngưỡng này thì đổi màu — "còn 2 chỗ" là thông tin, "còn 9 chỗ" là nhiễu. */
const LOW_REMAINING = 3;

/**
 * `null` = **CHƯA BIẾT**, và nó KHÁC "biết là đã đầy".
 *
 * Query lỗi / chưa chạy / đang tắt đều cho `undefined`, và vẽ chúng thành
 * "Sandbox đang đầy" là bịa ra một sự thật hạ tầng từ một lỗi mạng. Người gọi
 * nhận `null` thì KHÔNG hiện gì cả — im lặng đúng hơn là sai.
 */
export function describeCapacity(
  snapshot: CapacitySnapshot | null | undefined,
): CapacityHint | null {
  if (snapshot == null) {
    return null;
  }
  const { activeSessions, softCapacity } = snapshot;
  // Số không hữu hạn (JSON hỏng, field vắng) cũng là "chưa biết", không phải 0.
  if (!Number.isFinite(activeSessions) || !Number.isFinite(softCapacity)) {
    return null;
  }

  // `max(0, …)` vì `soft = hard − poolTarget` có thể ÂM khi ai đó đặt poolTarget
  // lớn hơn trần cứng. "Còn −2 chỗ" là một con số không có nghĩa với người học.
  const remaining = Math.max(0, Math.trunc(softCapacity) - Math.trunc(activeSessions));
  const exhausted = remaining === 0;

  return {
    remaining,
    exhausted,
    tone: exhausted ? 'full' : remaining < LOW_REMAINING ? 'low' : 'ok',
    label: exhausted ? 'Sandbox đang đầy' : `Còn ${remaining} chỗ`,
    warning: exhausted
      ? 'Sandbox đang đầy — mọi chỗ đều đang có người dùng. Bạn vẫn bấm Bắt đầu được, ' +
        'nhưng nhiều khả năng sẽ bị từ chối. Hãy thử lại sau vài phút, hoặc kết thúc một ' +
        'phiên khác bạn đang mở ở trang Của tôi.'
      : null,
  };
}
