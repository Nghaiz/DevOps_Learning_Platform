// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceTabs } from './use-workspace-tabs';

/**
 * ⛔ `{{exec}}` phải gõ vào một terminal NGƯỜI HỌC NHÌN THẤY.
 *
 * ## Vì sao file này ra đời sau, và nó gác đúng lỗ hổng nào
 *
 * `use-workspace-tabs.ts` không có test nào cho tới 2026-09-13, và đó là lý do
 * một hồi quy đi lọt qua cả một lượt sửa có chủ đích:
 *
 * - Ở mô hình SỬA ĐỔI 2, terminal hiện ở CẢ HAI tab. `exec` vì thế cố ý KHÔNG
 *   chuyển tab, và chú thích của nó ghi rõ "không có gì để chuyển tới".
 * - SỬA ĐỔI 3 (chỉ đạo 2026-09-13) bãi bỏ đúng tiền đề đó: ở tab Editor, hàng
 *   terminal mang `hidden`. `exec` không được sửa theo.
 * - Cùng lượt ấy, một lab đầy nút `{{exec}}` được bật `interface.layout: ide`,
 *   và bài IDE mở MẶC ĐỊNH ở tab Editor.
 *
 * Chuỗi hỏng: bấm chạy ⇒ `sendInput` gửi lệnh THẬT xuống pod ⇒ `focus()` trên
 * phần tử `display:none` là no-op ⇒ màn hình không đổi gì. Không lỗi, không
 * toast. Bấm lại vài lần là lệnh chạy vài lần trong pod mà không ai biết.
 *
 * ## Vì sao phải đo bằng DOM chứ không bằng hàm thuần
 *
 * Phần sai nằm ở THỨ TỰ giữa một lượt `setState` và một lượt `focus()`. Một test
 * hàm thuần khẳng định được "exec gọi sendInput" nhưng không bao giờ thấy được
 * rằng focus tới SỚM một lượt commit — đúng nửa mà lỗi này sống trong đó.
 */

function fakeTerminal(): {
  handle: { sendInput: (s: string) => void; focus: () => void };
  sendInput: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
} {
  const sendInput = vi.fn<(s: string) => void>();
  const focus = vi.fn<() => void>();
  return { handle: { sendInput, focus }, sendInput, focus };
}

/** `useWorkspaceTabs` chỉ dùng hai phương thức trên; ép kiểu ở đúng một chỗ. */
function optionsFor(
  handle: { sendInput: (s: string) => void; focus: () => void } | null,
  hasEditor: boolean,
): Parameters<typeof useWorkspaceTabs>[0] {
  return {
    terminal: handle as unknown as Parameters<typeof useWorkspaceTabs>[0]['terminal'],
    hasEditor,
    sessionId: 'sess-1',
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§Y3 — exec khi terminal đang bị ẩn ở tab Editor', () => {
  it('bài IDE mở mặc định ở tab Editor', () => {
    const term = fakeTerminal();
    const { result } = renderHook(() => useWorkspaceTabs(optionsFor(term.handle, true)));
    expect(result.current.activeTab).toBe('editor');
  });

  /** ⛔ Ô gác chính. Không có nó, lệnh chạy trong một terminal vô hình. */
  it('exec CHUYỂN sang tab Terminal, và chỉ focus SAU khi tab đã đổi', () => {
    const term = fakeTerminal();
    const { result } = renderHook(() => useWorkspaceTabs(optionsFor(term.handle, true)));
    expect(result.current.activeTab).toBe('editor');

    act(() => {
      result.current.exec('kubectl get pods', false);
    });

    expect(result.current.activeTab, 'exec phải đưa người học tới chỗ nhìn thấy kết quả').toBe(
      'terminal',
    );
    expect(term.sendInput).toHaveBeenCalledWith('kubectl get pods\n');
    // Focus PHẢI tới — nhưng chỉ một lần, và sau lượt commit đã bỏ `hidden`.
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it('đang ở tab Terminal sẵn ⇒ focus NGAY, không đợi effect', () => {
    /*
      Nhánh này không thừa. `setChosenTab(TERMINAL_TAB)` khi đã ở terminal không
      sinh lượt render nào (React bỏ qua giá trị y hệt), nên một bản cài đặt dồn
      hết focus vào effect sẽ KHÔNG BAO GIỜ focus ở đường thường — đường mà mọi
      bài không-IDE dùng.
    */
    const term = fakeTerminal();
    const { result } = renderHook(() => useWorkspaceTabs(optionsFor(term.handle, false)));
    expect(result.current.activeTab).toBe('terminal');

    act(() => {
      result.current.exec('ls -la', false);
    });

    expect(result.current.activeTab).toBe('terminal');
    expect(term.sendInput).toHaveBeenCalledWith('ls -la\n');
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it('người dùng tự chọn tab Editor rồi exec ⇒ vẫn bị kéo về Terminal', () => {
    const term = fakeTerminal();
    const { result } = renderHook(() => useWorkspaceTabs(optionsFor(term.handle, true)));

    act(() => {
      result.current.onActivate('terminal');
    });
    expect(result.current.activeTab).toBe('terminal');

    act(() => {
      result.current.onActivate('editor');
    });
    expect(result.current.activeTab).toBe('editor');

    act(() => {
      result.current.exec('whoami', false);
    });
    expect(result.current.activeTab).toBe('terminal');
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it('exec-interrupt gửi Ctrl+C TRƯỚC lệnh, như hai sự kiện rời', () => {
    const term = fakeTerminal();
    const { result } = renderHook(() => useWorkspaceTabs(optionsFor(term.handle, true)));

    act(() => {
      result.current.exec('echo xong', true);
    });

    // Nối `\x03` vào chuỗi lệnh sẽ biến tín hiệu huỷ thành ký tự của dòng lệnh.
    expect(term.sendInput.mock.calls).toEqual([[''], ['echo xong\n']]);
  });

  it('chưa có terminal ⇒ exec không làm gì, và KHÔNG đổi tab', () => {
    const { result } = renderHook(() => useWorkspaceTabs(optionsFor(null, true)));
    act(() => {
      result.current.exec('ls', false);
    });
    // Đổi tab ở đây sẽ đá người học khỏi khoang editor để xem một terminal
    // chưa tồn tại.
    expect(result.current.activeTab).toBe('editor');
  });

  /**
   * ⛔ ĐỐI CHỨNG DƯƠNG cho phép đo focus.
   *
   * Không có ô này thì một `focus` giả không bao giờ được gọi cũng làm các ô
   * trên xanh — chúng chỉ khẳng định `toHaveBeenCalledTimes(1)`, mà một hàm
   * không ai gọi thì đếm ra 0 chứ không ném. Ô này chốt rằng phép đếm thật sự
   * phân biệt được gọi với không gọi.
   */
  it('đối chứng dương — chưa exec thì focus KHÔNG được gọi lần nào', () => {
    const term = fakeTerminal();
    renderHook(() => useWorkspaceTabs(optionsFor(term.handle, true)));
    expect(term.focus).toHaveBeenCalledTimes(0);
    expect(term.sendInput).toHaveBeenCalledTimes(0);
  });
});
