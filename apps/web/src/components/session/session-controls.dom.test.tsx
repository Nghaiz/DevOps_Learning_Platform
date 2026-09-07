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
    expect(screen.getByText(/nhiều khả năng sẽ bị từ chối/)).toBeDefined();
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
