import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  describeCapacity,
  type CapacityHint,
  type KnownCapacityHint,
  type ProfileCapacityView,
} from './capacity';
import {
  LOW_CAPACITY_RATIO,
  describeProfileCapacity as describeShellProfileCapacity,
} from '../shell/capacity';

/**
 * Ô AC 13.B/13.D: *"'Còn N chỗ' phản ánh trần thật của P12; chạm trần thì báo
 * trước, không để người dùng gặp 429 trần trụi."*
 *
 * ## Ràng buộc ĐÃ ĐỔI trong lượt này (2026-09-08) — nói ra chứ không giấu
 *
 * Bản trước của file này khẳng định `hint.remaining === describeShellCapacity(…)
 * .remaining`, tức nó GHIM khung phiên vào công thức `softCapacity − active`.
 * Công thức đó chính là thứ đã in **"Còn 14 chỗ"** ngày 2026-09-07 đúng lúc
 * `lessons.startSession` trả **429**: `softCapacity` suy từ `CAPACITY_HARD_LIMIT
 * = 23 = 5952Mi ÷ 256Mi`, một hằng số mã hoá giả định "mọi phiên đều là bài
 * thường", trong khi bài đang mở là bài IDE (768Mi) và quota chỉ còn 576Mi.
 *
 * Ràng buộc MỚI: khung phiên phải khớp `describeProfileCapacity` — trần TÍNH
 * TỪ ResourceQuota + LimitRange, **theo từng profile**. Cổng chống-lệch vẫn
 * còn (vỏ và khung phiên không được nói hai câu khác nhau về cùng một mức), chỉ
 * là nó neo vào nguồn ĐÚNG. Lane trước cố ý không đổi `describeCapacity` của vỏ
 * để khỏi làm file này đỏ; lượt này sở hữu cả hai nên đổi cả hai.
 *
 * Ca quan trọng nhất của file vẫn là ca "chưa biết": một hiện thực trả
 * `{remaining: 0}` cho dữ liệu vắng mặt sẽ ĐI QUA mọi ca còn lại và chỉ hỏng
 * khi orchestrator có sự cố — đúng lúc người học cần trang này chạy nhất.
 */

/**
 * Payload TÁI DỰNG ĐÚNG tình huống đã đo ngày 2026-09-07.
 *
 * `requests.memory` khi đó ở `5376/5952Mi` ⇒ còn **576Mi**:
 *   · bài thường (LimitRange 256Mi) ⇒ 576 ÷ 256 = **2** chỗ, trần 5952 ÷ 256 = 23;
 *   · bài IDE (768Mi)               ⇒ 576 < 768 ⇒ **0** chỗ, trần 5952 ÷ 768 = 7;
 *   · lab K8s (1024Mi)              ⇒ **0** chỗ, trần 5952 ÷ 1024 = 5.
 *
 * ⚠ `activeSessions: 6` / `softCapacity: 20` giữ NGUYÊN trong payload — đó
 * chính là cặp số cho ra con số 14 của công thức cũ. Chúng nằm đây để các ca
 * dưới chứng minh được điều mạnh hơn "kết quả đúng": nguyên liệu để nói sai vẫn
 * có sẵn mà không nhánh nào chạm vào nó.
 */
const SU_CO_20260907: ProfileCapacityView = {
  activeSessions: 6,
  softCapacity: 20,
  hardCapacity: 23,
  fetchedAt: '2026-09-07T10:00:00.000Z',
  quotaReadable: true,
  quotaError: '',
  profileCapacity: {
    '': { slotsFree: 2, slotsTotal: 23 },
    ide: { slotsFree: 0, slotsTotal: 7 },
    k8s: { slotsFree: 0, slotsTotal: 5 },
  },
};

function view(patch: Partial<ProfileCapacityView>): ProfileCapacityView {
  return { ...SU_CO_20260907, ...patch };
}

/** Kỳ vọng "đã biết" + thu hẹp kiểu. Ném kèm giá trị thật để lỗi đọc được ngay. */
function known(hint: CapacityHint | null): KnownCapacityHint {
  if (hint === null || !hint.known) {
    throw new Error(`kỳ vọng sức chứa ĐÃ BIẾT, nhận: ${JSON.stringify(hint)}`);
  }
  return hint;
}

describe('describeCapacity — nói theo profile của CHÍNH bài đang mở', () => {
  it('chưa có payload (query lỗi/chưa chạy) ⇒ null, KHÔNG phải "đang đầy"', () => {
    expect(describeCapacity(null)).toBeNull();
    expect(describeCapacity(undefined)).toBeNull();
    expect(describeCapacity(null, 'ide')).toBeNull();
  });

  it('bài MẶC ĐỊNH ⇒ đếm theo trần của profile mặc định', () => {
    const hint = known(describeCapacity(view({}), DEFAULT_PROFILE));
    expect(hint.remaining).toBe(2);
    expect(hint.exhausted).toBe(false);
    expect(hint.label).toBe('Chỉ còn 2 chỗ');
    // Câu đầy đủ phải tự thu hẹp lời hứa: đây là số CHO BÀI THƯỜNG.
    expect(hint.detail).toContain('cho bài thường');
    expect(hint.detail).toContain('trần riêng');
  });

  it('bài IDE ⇒ đếm theo trần của profile `ide`, KHÔNG mượn số của bài thường', () => {
    const hint = known(describeCapacity(view({}), 'ide'));
    expect(hint.remaining).toBe(0);
    expect(hint.exhausted).toBe(true);
    expect(hint.tone).toBe('full');
    expect(hint.detail).toContain('cho bài này');
    // Không dán ghi chú "bài IDE có trần riêng" lên chính bài IDE.
    expect(hint.detail).not.toContain('cho bài thường');
  });

  it('lab K8s ⇒ đếm theo trần của profile `k8s`', () => {
    const ngay = view({
      profileCapacity: {
        '': { slotsFree: 12, slotsTotal: 23 },
        ide: { slotsFree: 4, slotsTotal: 7 },
        k8s: { slotsFree: 3, slotsTotal: 5 },
      },
    });
    expect(known(describeCapacity(ngay, 'k8s')).remaining).toBe(3);
    expect(known(describeCapacity(ngay, 'ide')).remaining).toBe(4);
    expect(known(describeCapacity(ngay, DEFAULT_PROFILE)).remaining).toBe(12);
  });

  it('quota CHƯA ĐỌC ĐƯỢC ⇒ "Chưa rõ sức chứa" kèm lý do — KHÔNG rơi về số cũ', () => {
    const hint = describeCapacity(
      view({
        quotaReadable: false,
        quotaError: 'resourcequotas is forbidden: User cannot list resource',
        profileCapacity: {},
      }),
      'ide',
    );
    expect(hint).not.toBeNull();
    expect(hint?.known).toBe(false);
    expect(hint?.label).toBe('Chưa rõ sức chứa');
    expect(hint?.detail).toContain('forbidden');
    // Vẫn bấm được — "chưa rõ" không được biến thành một cái chặn.
    expect(hint?.detail).toContain('vẫn bấm Bắt đầu được');
    // Con số của công thức cũ (20 − 6 = 14) có sẵn trong payload và KHÔNG được
    // xuất hiện ở bất kỳ đâu.
    expect(JSON.stringify(hint)).not.toContain('14');
  });

  it('server không khai profile đó ⇒ chưa rõ, KHÔNG âm thầm dùng profile mặc định', () => {
    const thieuIde = view({ profileCapacity: { '': { slotsFree: 9, slotsTotal: 23 } } });
    expect(describeCapacity(thieuIde, 'ide')?.known).toBe(false);
    // Cùng payload, profile mặc định vẫn đọc được — tức nhánh trên KHÔNG phải
    // do payload hỏng, mà đúng là "chưa biết cho riêng profile này".
    expect(known(describeCapacity(thieuIde, DEFAULT_PROFILE)).remaining).toBe(9);
  });

  it('số không hữu hạn (payload hỏng) cũng là chưa rõ, không phải 0', () => {
    const hong = view({ profileCapacity: { ide: { slotsFree: Number.NaN, slotsTotal: 7 } } });
    expect(describeCapacity(hong, 'ide')?.known).toBe(false);
  });

  it('quota đủ ĐÚNG 1 chỗ ⇒ còn 1, chưa cảnh báo', () => {
    const hint = known(
      describeCapacity(view({ profileCapacity: { ide: { slotsFree: 1, slotsTotal: 7 } } }), 'ide'),
    );
    expect(hint.remaining).toBe(1);
    expect(hint.exhausted).toBe(false);
    expect(hint.warning).toBeNull();
    // 1 ≤ 7 × 0.2 = 1.4 ⇒ "sắp hết", ngưỡng đi theo trần THẬT của profile này.
    expect(hint.tone).toBe('low');
  });

  it('thiếu đúng 1 byte ⇒ 0 chỗ, cảnh báo TRƯỚC, và không nói dối theo cả hai chiều', () => {
    const hint = known(
      describeCapacity(view({ profileCapacity: { ide: { slotsFree: 0, slotsTotal: 7 } } }), 'ide'),
    );
    expect(hint.exhausted).toBe(true);
    expect(hint.remaining).toBe(0);
    expect(hint.label).toBe('Hết chỗ');
    expect(hint.warning).not.toBeNull();
    // Chiều 1 — đừng hứa chỗ không có: nói rõ nhiều khả năng bị từ chối.
    expect(hint.warning).toContain('bị từ chối');
    // Chiều 2 — đừng chặn người dùng khỏi một chỗ đang có: `slots_free` là CẬN
    // DƯỚI (không cộng pod đang ấm), nên nút vẫn bấm được và câu chữ phải nói ra.
    expect(hint.warning).toContain('vẫn bấm Bắt đầu được');
    expect(hint.warning).toContain('cận dưới');
  });

  it('slotsFree âm (đo lệch nhịp) vẫn kẹp ở 0, không hiện số âm', () => {
    const hint = known(
      describeCapacity(view({ profileCapacity: { ide: { slotsFree: -3, slotsTotal: 7 } } }), 'ide'),
    );
    expect(hint.remaining).toBe(0);
    expect(hint.exhausted).toBe(true);
  });

  it('KHÔNG chôn hằng số trần: cùng số chỗ còn, trần khác ⇒ mức khác', () => {
    const mucCuaTran = (slotsTotal: number): string =>
      known(
        describeCapacity(view({ profileCapacity: { ide: { slotsFree: 2, slotsTotal } } }), 'ide'),
      ).tone;
    // 2 > 7 × 0.2 = 1.4 ⇒ 'ok'. Với trần 10 thì 2 = 10 × 0.2 ⇒ 'low'.
    expect(mucCuaTran(7)).toBe('ok');
    expect(mucCuaTran(10)).toBe('low');
    expect(LOW_CAPACITY_RATIO).toBe(0.2);
  });
});

/**
 * CA TRUNG TÂM — tái hiện đúng mâu thuẫn 2026-09-07.
 *
 * Đây là ca mà bản cũ KHÔNG THỂ có: nó không nhận profile nào, nên với payload
 * này nó chỉ có một câu trả lời và câu đó là 14.
 */
describe('2026-09-07: quota còn 576Mi, bài IDE cần 768Mi', () => {
  it('nhãn nói 0 chỗ cho bài IDE — KHÔNG nói 14', () => {
    const hint = known(describeCapacity(SU_CO_20260907, 'ide'));
    expect(hint.remaining).toBe(0);
    expect(hint.remaining).not.toBe(14);
    expect(hint.label).toBe('Hết chỗ');
    expect(hint.warning).not.toBeNull();
  });

  it('con số 14 của công thức cũ không xuất hiện ở BẤT KỲ profile nào', () => {
    // `softCapacity − activeSessions` = 20 − 6 = 14 vẫn nằm trong payload.
    expect(SU_CO_20260907.softCapacity - SU_CO_20260907.activeSessions).toBe(14);
    for (const profile of ['', 'ide', 'k8s']) {
      expect(known(describeCapacity(SU_CO_20260907, profile)).remaining).not.toBe(14);
    }
  });

  it('cùng payload, hai bài khác nhau ⇒ hai câu trả lời khác nhau', () => {
    expect(known(describeCapacity(SU_CO_20260907, DEFAULT_PROFILE)).remaining).toBe(2);
    expect(known(describeCapacity(SU_CO_20260907, 'ide')).remaining).toBe(0);
  });
});

/**
 * Cổng CHỐNG-LỆCH giữa hai chỗ hiển thị, neo vào nguồn MỚI.
 *
 * Ca đã hỏng thật một lần: vỏ dùng ngưỡng tỉ lệ 20% trần, khung phiên dùng
 * ngưỡng cố định `LOW_REMAINING = 3` — cùng dữ liệu, cùng màn hình, hai câu
 * ngược nhau. Kiểm bằng CẢ HAI hàm thật, không so hằng số với hằng số: một
 * phép kiểm so hai hằng vẫn xanh khi ai đó thêm một nhánh `if` chỉ ở một bên.
 */
describe('vỏ và khung phiên nói cùng một mức', () => {
  const cases: ReadonlyArray<{ profile: string; slotsFree: number; slotsTotal: number }> = [
    { profile: '', slotsFree: 20, slotsTotal: 23 },
    { profile: '', slotsFree: 4, slotsTotal: 23 },
    { profile: '', slotsFree: 0, slotsTotal: 23 },
    { profile: 'ide', slotsFree: 6, slotsTotal: 7 },
    { profile: 'ide', slotsFree: 1, slotsTotal: 7 },
    { profile: 'ide', slotsFree: 0, slotsTotal: 7 },
    { profile: 'k8s', slotsFree: 5, slotsTotal: 5 },
    { profile: 'k8s', slotsFree: 1, slotsTotal: 5 },
    { profile: 'k8s-multinode', slotsFree: 3, slotsTotal: 3 },
    { profile: 'k8s-multinode', slotsFree: 0, slotsTotal: 0 },
  ];

  it.each(cases)('cùng mức tại $profile $slotsFree/$slotsTotal', (c) => {
    const payload = view({
      profileCapacity: { [c.profile]: { slotsFree: c.slotsFree, slotsTotal: c.slotsTotal } },
    });
    const hint = known(describeCapacity(payload, c.profile));
    const reading = describeShellProfileCapacity(payload, c.profile);
    expect(reading).not.toBeNull();
    expect(hint.tone).toBe(reading?.tone);
    expect(hint.remaining).toBe(reading?.remaining);
    // Nhãn cũng lấy nguyên của vỏ — hai câu chữ cho một mức là hai câu sẽ lệch.
    expect(hint.label).toBe(reading?.label);
  });

  it('"chưa biết" của vỏ ⇒ "chưa rõ" của khung phiên, không bên nào đọc thành 0', () => {
    const mu = view({ quotaReadable: false, quotaError: '', profileCapacity: {} });
    expect(describeShellProfileCapacity(mu, 'ide')).toBeNull();
    expect(describeCapacity(mu, 'ide')?.known).toBe(false);
  });
});
