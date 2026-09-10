// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdePane } from './ide-pane';
import { IDE_BOOT_TIMEOUT_MS } from './ide-layout';

/**
 * `p16-workspace.md` §8 **AC-8** — khoang IDE.
 *
 * ## File này là MỚI, và sự vắng mặt của nó trước đó là một lỗ hổng thật
 *
 * `ide-pane.tsx` được sửa ngày 2026-09-07 sau một lỗi đo được trên cụm: IDE
 * hỏng ở gần như MỌI lần mở đầu tiên trong khi gateway, ảnh sandbox và cờ layout
 * đều đúng. Bản vá (thăm dò bằng `fetch` rồi mới gắn iframe) đúng, nhưng nó
 * **chưa có một ô test nào** cho tới 2026-09-10. Tức là thứ duy nhất giữ cho
 * `onLoad` không quay lại là một khối chú thích, và khối chú thích ĐÃ THUA một
 * lần rồi: bản trước có sẵn dòng "`load` không chứng minh thành công" nằm ngay
 * trên đoạn mã dùng `load` làm bằng chứng thành công.
 *
 * ## Đo cái gì, và vì sao đo được
 *
 * `fetch` bị thay bằng một hàm giả trả về mã trạng thái theo kịch bản, nên bốn
 * nhánh của bảng §6.2 kiểm được mà không cần cụm nào. Đồng hồ dùng timer giả:
 * nhịp thăm dò là 2 giây và hạn chờ là 45 giây, và một ô test chờ thật 45 giây
 * là một ô test sẽ bị `--bail` hoặc bị ai đó xoá.
 *
 * ⚠ `advanceTimersByTimeAsync`, KHÔNG phải `advanceTimersByTime`. Vòng thăm dò
 * `await` một promise bọc `setTimeout`; bản đồng bộ đẩy đồng hồ nhưng không nhả
 * microtask nào, nên vòng lặp đứng nguyên tại chỗ `await` và ô test đọc ra là
 * "không có lượt thử thứ hai" trong khi mã hoàn toàn đúng.
 */

const IDE_URL_FRAGMENT = '/ide/session/';

function iframe(): HTMLIFrameElement | null {
  return document.querySelector('iframe');
}

/** Số lượt `fetch` đã bắn — đại lượng nói "vòng thăm dò còn sống hay đã dừng". */
function fetchCalls(): number {
  return vi.mocked(globalThis.fetch).mock.calls.length;
}

/**
 * `fetch` giả chạy theo một hàng đợi mã trạng thái. Phần tử cuối được LẶP LẠI
 * cho mọi lượt sau, để mô tả được "hỏng mãi" mà không phải liệt kê 22 phần tử.
 *
 * `'network'` mô phỏng một lượt ném thật (DNS hỏng, kết nối bị chặn), thứ hợp
 * đồng §6.2 xếp CÙNG NHÓM với 5xx.
 */
function stubFetch(statuses: readonly (number | 'network')[]): void {
  let at = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown) => {
      const url = String(input);
      if (!url.includes(IDE_URL_FRAGMENT)) {
        throw new Error(`thăm dò gọi nhầm URL: ${url}`);
      }
      const status = statuses[Math.min(at, statuses.length - 1)];
      at += 1;
      if (status === 'network') {
        return Promise.reject(new Error('mạng hỏng'));
      }
      return Promise.resolve({ ok: status >= 200 && status < 300, status } as Response);
    }),
  );
}

/** Đẩy đồng hồ giả và nhả microtask, bọc trong `act` để React commit hết. */
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('AC-8 · chỉ 2xx mới gắn iframe', () => {
  it('503 rồi 200 ⇒ iframe gắn ĐÚNG MỘT LẦN, và chỉ sau lượt 200', async () => {
    /*
      Đây là kịch bản THẬT của ngày 2026-09-07: phiên trả về lúc t+8s, Theia bind
      cổng 4000 ở ~t+20s, nên lượt nạp đầu tiên rơi vào giữa cửa sổ khởi động và
      gateway trả 503. Bản trước dừng ở đó vĩnh viễn.
    */
    stubFetch([503, 503, 200]);
    render(<IdePane sessionId="s-1" />);

    // Lượt thăm dò đầu chạy ngay, không đợi nhịp nào.
    await tick(0);
    expect(iframe(), 'iframe KHÔNG được gắn khi server còn trả 503').toBeNull();

    await tick(2_000);
    expect(iframe()).toBeNull();

    await tick(2_000);
    expect(iframe()).not.toBeNull();
    expect(iframe()?.getAttribute('src')).toContain('/ide/session/s-1/');

    // Đúng MỘT iframe, không phải một cái mới mỗi lượt thử.
    expect(document.querySelectorAll('iframe')).toHaveLength(1);
  });

  it('đối chứng dương: 200 ngay lượt đầu ⇒ iframe GẮN', async () => {
    /*
      Không có ô này thì một component KHÔNG BAO GIỜ gắn iframe (một lỗi render,
      một điều kiện luôn sai) cũng làm mọi ô "không gắn" ở trên xanh. Đây là ô
      duy nhất chứng minh phép dò `document.querySelector('iframe')` thật sự
      thấy được một iframe khi có một cái.
    */
    stubFetch([200]);
    render(<IdePane sessionId="s-2" />);

    await tick(0);
    expect(iframe()).not.toBeNull();
  });

  it('lỗi mạng xếp cùng nhóm với 5xx: vẫn thử lại, rồi thành công', async () => {
    stubFetch(['network', 200]);
    render(<IdePane sessionId="s-3" />);

    await tick(0);
    expect(iframe()).toBeNull();

    await tick(2_000);
    expect(iframe()).not.toBeNull();
  });
});

describe('AC-8 · 4xx là lỗi thật, dừng NGAY và nêu mã', () => {
  it('403 ⇒ không iframe, có role="alert", và thông báo chứa "403"', async () => {
    stubFetch([403]);
    render(<IdePane sessionId="s-4" />);
    await tick(0);

    expect(iframe()).toBeNull();

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('403');
  });

  it('403 KHÔNG đốt hết 45 giây — dừng ở đúng một lượt thăm dò', async () => {
    /*
      Vì sao 4xx dừng ngay thay vì thử lại tới hạn: thử lại 22 lần cũng ra đúng
      kết quả đó, chỉ chậm hơn, và một câu chung chung sau 45 giây là thứ không
      ai chẩn đoán được. Câu đúng là "máy chủ trả HTTP 403 cho đường /ide".

      Đo bằng SỐ LƯỢT `fetch`, không đo bằng chữ trên màn hình: chữ có thể đúng
      trong khi vòng lặp vẫn quay nền và vẫn đập vào gateway 22 lần.
    */
    stubFetch([403]);
    render(<IdePane sessionId="s-5" />);
    await tick(0);

    const afterFirst = fetchCalls();
    expect(afterFirst).toBe(1);

    await tick(30_000);
    expect(fetchCalls()).toBe(afterFirst);
  });

  it('thông báo có ĐỦ HAI NỬA: hỏng cái gì, và giờ làm gì', async () => {
    /*
      Luật V4. "Không tải được IDE" một mình là một ngõ cụt: người học không biết
      mình mất gì (bài vẫn làm được bằng terminal) và không biết thử gì tiếp.
      Hai nửa nay tách rời ở TẦNG KIỂU (`ErrorEntry`), nên ô này gác cái dây nối
      chứ không gác câu chữ.
    */
    stubFetch([404]);
    render(<IdePane sessionId="s-6" />);
    await tick(0);

    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).toContain('404');
    expect(text).toMatch(/terminal/);
  });
});

describe('AC-8 · quá hạn', () => {
  it('5xx mãi ⇒ thông báo NÊU SỐ GIÂY, và vòng lặp dừng hẳn', async () => {
    stubFetch([503]);
    render(<IdePane sessionId="s-7" />);

    await tick(IDE_BOOT_TIMEOUT_MS + 4_000);

    const seconds = String(Math.round(IDE_BOOT_TIMEOUT_MS / 1000));
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text, 'thông báo quá hạn phải nêu con số, không nói chung chung').toContain(seconds);

    // Đã dừng: đẩy thêm 30 giây nữa không sinh lượt thăm dò nào.
    const settled = fetchCalls();
    await tick(30_000);
    expect(fetchCalls()).toBe(settled);
  });

  it('màn chờ đếm số giây đã trôi, và con số đó TĂNG', async () => {
    /*
      16.D.5. Hai mươi giây nhìn một khối xám đọc ra là trang hỏng. Ô này gác
      đúng một điều: có một con số, và nó chạy.

      Đối chứng âm nằm ngay trong ô: nếu đồng hồ chết thì `after` bằng `before`,
      và một màn chờ có đồng hồ đứng yên còn tệ hơn một màn chờ không đồng hồ.
    */
    stubFetch([503]);
    render(<IdePane sessionId="s-8" />);
    await tick(0);

    await tick(3_000);
    const before = screen.getByText(/Đã chờ/).textContent ?? '';

    await tick(5_000);
    const after = screen.getByText(/Đã chờ/).textContent ?? '';

    expect(before).not.toBe(after);
    expect(after).toContain('8');
  });
});

describe('AC-8 · tháo giữa chừng', () => {
  it('unmount trong lúc đang ngủ giữa hai lượt ⇒ vòng lặp DỪNG', async () => {
    /*
      `cancelled` chứ không chỉ `AbortController`, và đây là ô chứng minh vì sao:
      `abort()` cắt được một `fetch` ĐANG BAY, nhưng vòng lặp phần lớn thời gian
      đang NGỦ trong `setTimeout`. Không có cờ thì nó tỉnh dậy sau khi component
      đã tháo, gọi `fetch` tiếp, rồi `setState` vào một cây đã chết.

      Đo bằng số lượt `fetch` sau khi tháo. Đo bằng cảnh báo của React thì không
      được: React 19 đã bỏ cảnh báo "setState on unmounted component", nên một ô
      test rình cảnh báo đó sẽ xanh vĩnh viễn dù mã có hỏng hay không.
    */
    stubFetch([503]);
    const view = render(<IdePane sessionId="s-9" />);
    await tick(0);

    const atUnmount = fetchCalls();
    expect(atUnmount).toBe(1);

    view.unmount();
    await tick(20_000);

    expect(fetchCalls(), 'vòng thăm dò vẫn quay sau khi component đã tháo').toBe(atUnmount);
  });
});

describe('AC-8 · chưa có phiên', () => {
  it('sessionId null ⇒ không thăm dò, không iframe, có câu giải thích', async () => {
    stubFetch([200]);
    render(<IdePane sessionId={null} />);
    await tick(5_000);

    expect(fetchCalls()).toBe(0);
    expect(iframe()).toBeNull();
    expect(screen.getByText(/Bấm Bắt đầu/)).toBeDefined();
  });
});
