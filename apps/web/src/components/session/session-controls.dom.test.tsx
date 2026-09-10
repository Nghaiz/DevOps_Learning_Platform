// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialState } from '@devops-platform/terminal';
import type { SandboxSession } from '../../lib/use-sandbox-session';
import { SessionControls } from './session-controls';
import type { ProfileCapacityView } from './capacity';

/**
 * DÂY NỐI giữa `describeCapacity` và cái nhãn người học thật sự nhìn thấy.
 *
 * `capacity.test.ts` gác NGỮ NGHĨA con số; file này gác chuyện con số đó có
 * chảy tới DOM không, và chảy theo ĐÚNG profile của bài đang mở không. Đây là
 * hạng lỗi đã cắn hai PR liên tiếp trong dự án này: một hàm đúng, có test, mà
 * không call-site nào truyền đúng tham số cho nó — ô AC vẫn xanh trong khi màn
 * hình vẫn nói sai.
 *
 * Docblock `// @vitest-environment jsdom` ở dòng 1 là đường bật jsdom cho ĐÚNG
 * file này (⚠ `environmentMatchGlobs` không còn ở vitest 4 — xem
 * `workspace-panel.dom.test.tsx`).
 */

/** Phiên CHƯA MỞ — nhãn sức chứa chỉ vẽ khi `state.sessionId === null`. */
const CHUA_MO: SandboxSession = {
  state: initialState,
  wsUrl: '',
  connectionKey: null,
  terminal: null,
  starting: false,
  startError: null,
  ending: false,
  extending: false,
  remainingMs: null,
  start: () => undefined,
  end: () => undefined,
  extend: () => undefined,
  onControl: () => undefined,
  onClose: () => undefined,
  onTerminalReady: () => undefined,
};

const KHONG_LAM_GI = { start: () => undefined, end: () => undefined, extend: () => undefined };

/**
 * Đúng payload của sự cố 2026-09-07: quota còn 576Mi ⇒ 2 chỗ cho bài thường,
 * 0 chỗ cho bài IDE. `activeSessions: 6` / `softCapacity: 20` giữ nguyên, tức
 * nguyên liệu để in "Còn 14 chỗ" vẫn nằm trong props.
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
  },
};

afterEach(cleanup);

describe('SessionControls — nhãn sức chứa nói về ĐÚNG bài đang mở', () => {
  it('bài IDE ⇒ badge "Hết chỗ" + cảnh báo, và KHÔNG có "14" ở đâu cả', () => {
    render(
      <SessionControls session={CHUA_MO} actions={KHONG_LAM_GI} capacity={SU_CO_20260907} profile="ide" />,
    );

    expect(screen.getByText('Hết chỗ')).toBeDefined();
    /*
      P16: câu cảnh báo được viết lại khi chuyển sang `packages/copy` (luật V3
      cấm gạch ngang dài), nên chuỗi cũ "nhiều khả năng sẽ bị từ chối" không còn.
      KHẲNG ĐỊNH thì giữ nguyên và vẫn là khẳng định đáng giá: cảnh báo phải nói
      ra khả năng bị từ chối, chứ không chỉ nói "hết chỗ" rồi để đó.
    */
    expect(screen.getByText(/Nếu bị từ chối/)).toBeDefined();
    // Nút vẫn bấm được — cảnh báo TRƯỚC, không phải chặn.
    expect(screen.getByRole('button', { name: 'Bắt đầu' }).hasAttribute('disabled')).toBe(false);
    expect(document.body.textContent).not.toContain('14');
  });

  it('CÙNG props, chỉ đổi profile ⇒ đổi hẳn câu trả lời', () => {
    render(<SessionControls session={CHUA_MO} actions={KHONG_LAM_GI} capacity={SU_CO_20260907} />);

    // Profile mặc định: 2 chỗ, và câu đầy đủ tự thu hẹp về "bài thường".
    expect(screen.getByText('Chỉ còn 2 chỗ')).toBeDefined();
    expect(screen.getByText('Chỉ còn 2 chỗ').getAttribute('title')).toContain('cho bài thường');
    expect(screen.queryByText('Hết chỗ')).toBeNull();
  });

  it('quota chưa đọc được ⇒ "Chưa rõ sức chứa", KHÔNG có con số nào và KHÔNG có câu doạ', () => {
    render(
      <SessionControls
        session={CHUA_MO}
        actions={KHONG_LAM_GI}
        capacity={{
          ...SU_CO_20260907,
          quotaReadable: false,
          quotaError: 'resourcequotas is forbidden',
          profileCapacity: {},
        }}
        profile="ide"
      />,
    );

    const badge = screen.getByText('Chưa rõ sức chứa');
    expect(badge.getAttribute('title')).toContain('forbidden');
    // "Chưa rõ" KHÔNG sinh cảnh báo đỏ: nó không phải "đầy".
    expect(screen.queryByText(/nhiều khả năng sẽ bị từ chối/)).toBeNull();
    expect(document.body.textContent).not.toContain('14');
    expect(document.body.textContent).not.toContain('chỗ.');
  });

  it('chưa có payload ⇒ không vẽ nhãn nào (im lặng đúng hơn là sai)', () => {
    render(<SessionControls session={CHUA_MO} actions={KHONG_LAM_GI} capacity={null} />);

    expect(screen.queryByText('Chưa rõ sức chứa')).toBeNull();
    expect(screen.queryByText(/chỗ$/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Bắt đầu' })).toBeDefined();
  });
});

/**
 * Cụm CÒN CHỖ — cảnh của trang lab/sân chơi Kubernetes, và là ca đắt giá hơn ca
 * IDE ở trên.
 *
 * Ở cảnh 2026-09-07 bài IDE ra `Hết chỗ` còn bài thường ra một con số, nên hai
 * câu trả lời khác nhau cả về MỨC — một hiện thực chỉ đúng "tình cờ" (ví dụ:
 * luôn báo hết chỗ khi `slotsFree` vắng) vẫn đi qua được. Ở đây cả hai profile
 * đều `ok`, cùng màu, cùng khuôn câu; **chỉ CON SỐ khác nhau**. Muốn xanh thì
 * `profile` phải thật sự được đọc.
 *
 * Số liệu suy từ cùng một quota: 5952Mi trần, đã dùng 2048Mi ⇒ còn 3904Mi.
 *   · bài thường 256Mi/pod ⇒ còn 15, trần 23;
 *   · lab K8s   1024Mi/pod ⇒ còn  3, trần  5.
 */
const CON_CHO_LAB_K8S: ProfileCapacityView = {
  activeSessions: 8,
  softCapacity: 20,
  hardCapacity: 23,
  fetchedAt: '2026-09-08T10:00:00.000Z',
  quotaReadable: true,
  quotaError: '',
  profileCapacity: {
    '': { slotsFree: 15, slotsTotal: 23 },
    k8s: { slotsFree: 3, slotsTotal: 5 },
  },
};

describe('SessionControls — lab/sân chơi Kubernetes đếm theo trần CỦA CHÍNH NÓ', () => {
  it('profile k8s ⇒ "Còn 3 chỗ" (trần 5), KHÔNG phải "Còn 15 chỗ" của bài thường', () => {
    render(
      <SessionControls
        session={CHUA_MO}
        actions={KHONG_LAM_GI}
        capacity={CON_CHO_LAB_K8S}
        profile="k8s"
        startLabel="Bắt đầu"
      />,
    );

    const badge = screen.getByText('Còn 3 chỗ');
    expect(badge.getAttribute('title')).toContain('Còn 3/5 chỗ cho bài này');
    expect(screen.queryByText('Còn 15 chỗ')).toBeNull();
    // Không dán ghi chú "bài IDE/K8s có trần riêng": trên trang một bài cụ thể
    // thì con số ĐÃ là của bài đó, nhắc thêm chỉ làm người đọc nghi ngờ nó.
    expect(badge.getAttribute('title')).not.toContain('trần riêng');
    // Còn chỗ ⇒ không có câu cảnh báo nào.
    expect(screen.queryByText(/nhiều khả năng sẽ bị từ chối/)).toBeNull();
  });

  /**
   * ĐỐI CHỨNG — chỗ này VIẾT RA chế độ hỏng mà ô trên gác.
   *
   * `profile` là prop TUỲ CHỌN, nên một trang quên truyền vẫn biên dịch sạch và
   * vẫn vẽ một badge trông bình thường. Ô này khẳng định badge đó mang con số
   * của bài thường: bỏ `profile="k8s"` ở trang lab là đổi "Còn 3 chỗ" thành
   * "Còn 15 chỗ" — sai gấp năm lần, không một dấu hiệu nào.
   *
   * Cổng chặn việc đó nằm ở `capacity-call-sites.test.ts` (quét mã nguồn của cả
   * ba trang); ô này chỉ chứng minh hậu quả là có thật, để cổng kia không phải
   * một luật gõ suông.
   */
  it('QUÊN truyền profile ⇒ vẫn vẽ badge, nhưng là con số của bài thường', () => {
    render(<SessionControls session={CHUA_MO} actions={KHONG_LAM_GI} capacity={CON_CHO_LAB_K8S} />);

    const badge = screen.getByText('Còn 15 chỗ');
    expect(badge.getAttribute('title')).toContain('cho bài thường');
    expect(screen.queryByText('Còn 3 chỗ')).toBeNull();
  });

  it('server chưa khai profile k8s ⇒ "Chưa rõ sức chứa", KHÔNG mượn số bài thường', () => {
    render(
      <SessionControls
        session={CHUA_MO}
        actions={KHONG_LAM_GI}
        capacity={{
          ...CON_CHO_LAB_K8S,
          profileCapacity: { '': { slotsFree: 15, slotsTotal: 23 } },
        }}
        profile="k8s"
      />,
    );

    expect(screen.getByText('Chưa rõ sức chứa')).toBeDefined();
    expect(screen.queryByText('Còn 15 chỗ')).toBeNull();
    expect(document.body.textContent).not.toContain('15');
  });
});
