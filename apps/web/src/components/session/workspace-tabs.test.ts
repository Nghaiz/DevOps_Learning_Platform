import { describe, expect, it } from 'vitest';
import {
  computeRegionVisibility,
  isClosableTab,
  listWorkspaceTabs,
  nextTabOnKey,
  parseWorkspaceState,
  readWorkspaceState,
  resolveActiveTab,
  splitDisabledReason,
  workspaceStorageKey,
  writeWorkspaceState,
  type StorageLike,
  type WorkspaceTabId,
} from './workspace-tabs';

/** `localStorage` giả — `apps/web` chạy vitest ở env `node`, không có DOM. */
function fakeStorage(seed: Record<string, string> = {}): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe('listWorkspaceTabs — thứ tự là HẰNG SỐ, không theo thứ tự chèn map', () => {
  it('Editor đứng trước, terminal theo thứ tự cố định', () => {
    expect(listWorkspaceTabs(true, ['terminal-2', 'terminal-1'])).toEqual([
      'editor',
      'terminal-1',
      'terminal-2',
    ]);
  });

  it('không có Editor ⇒ chỉ terminal', () => {
    expect(listWorkspaceTabs(false, ['terminal-1'])).toEqual(['terminal-1']);
  });

  it('bỏ qua khoá lạ trong map', () => {
    expect(listWorkspaceTabs(false, ['terminal-1', 'terminal-9'])).toEqual(['terminal-1']);
  });
});

describe('isClosableTab', () => {
  it('chỉ Terminal 2 đóng được', () => {
    // Terminal 1 là window đầu của tmux — đóng nó là kết thúc phiên shell, chứ
    // không phải đóng một tab giao diện.
    expect(isClosableTab('terminal-2')).toBe(true);
    expect(isClosableTab('terminal-1')).toBe(false);
    expect(isClosableTab('editor')).toBe(false);
  });
});

describe('computeRegionVisibility — HAI vùng cho BA tab (§C6)', () => {
  const base = { hasEditor: true, hasTerminal: true } as const;

  it('tab Editor, không tách ⇒ chỉ vùng editor hiện', () => {
    expect(computeRegionVisibility({ ...base, activeTab: 'editor', split: false })).toEqual({
      editor: true,
      terminal: false,
    });
  });

  it('tab Terminal 1 ⇒ chỉ vùng terminal hiện', () => {
    expect(computeRegionVisibility({ ...base, activeTab: 'terminal-1', split: false })).toEqual({
      editor: false,
      terminal: true,
    });
  });

  /**
   * ⛔ Bất biến §C6, đây là ô quan trọng nhất của cả file.
   *
   * Cả phiên chỉ có MỘT WebSocket và MỘT xterm. Bấm sang "Terminal 2" là gửi
   * `\x02 2` vào chính cái PTY đang mở, nên nội dung window 2 hiện ra TRONG cái
   * xterm đang có. Nếu vùng terminal bị ẩn khi tab hoạt là `terminal-2` thì ta
   * vừa ẩn đúng thứ người dùng vừa yêu cầu hiện.
   */
  it('tab Terminal 2 vẫn hiện ĐÚNG cái vùng terminal đang chứa xterm', () => {
    expect(computeRegionVisibility({ ...base, activeTab: 'terminal-2', split: false })).toEqual({
      editor: false,
      terminal: true,
    });
  });

  it('tách ⇒ cả hai vùng cùng hiện, bất kể tab nào đang hoạt', () => {
    for (const activeTab of ['editor', 'terminal-1', 'terminal-2'] as const) {
      expect(computeRegionVisibility({ ...base, activeTab, split: true })).toEqual({
        editor: true,
        terminal: true,
      });
    }
  });

  it('split:true từ localStorage của bài IDE KHÔNG có tác dụng ở bài không có editor', () => {
    expect(
      computeRegionVisibility({
        hasEditor: false,
        hasTerminal: true,
        activeTab: 'terminal-1',
        split: true,
      }),
    ).toEqual({ editor: false, terminal: true });
  });

  it('activeTab trỏ vào tab đã biến mất ⇒ vẫn có một vùng hiện, không phải khoang trắng', () => {
    // Nhịp giữa "cha gọi onCloseTerminal" và "cha đổi activeTab".
    const v = computeRegionVisibility({
      hasEditor: true,
      hasTerminal: false,
      activeTab: 'terminal-2',
      split: false,
    });
    expect(v.editor || v.terminal).toBe(true);
  });
});

describe('resolveActiveTab', () => {
  const tabs: readonly WorkspaceTabId[] = ['editor', 'terminal-1'];

  it('giữ nguyên tab có thật', () => {
    expect(resolveActiveTab('terminal-1', tabs)).toBe('terminal-1');
  });

  it('kẹp về tab đầu khi tab yêu cầu không tồn tại', () => {
    expect(resolveActiveTab('terminal-2', tabs)).toBe('editor');
  });

  it('null khi không còn tab nào', () => {
    expect(resolveActiveTab('editor', [])).toBeNull();
  });
});

describe('nextTabOnKey — khuôn tablist ngang của ARIA APG', () => {
  const tabs: readonly WorkspaceTabId[] = ['editor', 'terminal-1', 'terminal-2'];

  it('mũi tên phải đi tới, có VÒNG LẠI', () => {
    expect(nextTabOnKey('ArrowRight', tabs, 'editor')).toBe('terminal-1');
    expect(nextTabOnKey('ArrowRight', tabs, 'terminal-2')).toBe('editor');
  });

  it('mũi tên trái đi lui, có VÒNG LẠI', () => {
    expect(nextTabOnKey('ArrowLeft', tabs, 'terminal-1')).toBe('editor');
    expect(nextTabOnKey('ArrowLeft', tabs, 'editor')).toBe('terminal-2');
  });

  it('Home/End nhảy hai đầu', () => {
    expect(nextTabOnKey('Home', tabs, 'terminal-2')).toBe('editor');
    expect(nextTabOnKey('End', tabs, 'editor')).toBe('terminal-2');
  });

  it('null cho phím ngoài khuôn — call-site KHÔNG được preventDefault', () => {
    // Nuốt mọi phím ở đây sẽ chặn cả `Tab` (đường thoát khỏi thanh tab) lẫn
    // phím tắt của trình duyệt.
    expect(nextTabOnKey('Tab', tabs, 'editor')).toBeNull();
    expect(nextTabOnKey('a', tabs, 'editor')).toBeNull();
    expect(nextTabOnKey('ArrowDown', tabs, 'editor')).toBeNull();
  });

  it('không ném khi activeTab không nằm trong danh sách', () => {
    expect(nextTabOnKey('ArrowRight', ['terminal-1'], 'editor')).toBe('terminal-1');
  });

  it('null khi không có tab nào', () => {
    expect(nextTabOnKey('ArrowRight', [], 'editor')).toBeNull();
  });
});

describe('splitDisabledReason — nút tách phải nói vì sao nó chết', () => {
  it('có editor + có terminal ⇒ bấm được', () => {
    expect(splitDisabledReason(true, true)).toBeNull();
  });

  it('không có editor ⇒ vô hiệu, và lý do nói rõ đây là giới hạn của C6', () => {
    const reason = splitDisabledReason(false, true);
    expect(reason).not.toBeNull();
    expect(reason).toContain('Editor');
    // Câu chữ phải nói ra ràng buộc thật (một kết nối, dùng chung một cửa sổ),
    // không chỉ "không khả dụng" — nếu không người dùng sẽ đi tìm cách bật nó.
    expect(reason).toContain('một kết nối');
  });

  it('có editor nhưng chưa có terminal ⇒ vô hiệu với lý do khác', () => {
    expect(splitDisabledReason(true, false)).toContain('terminal');
  });
});

describe('workspaceStorageKey — bố cục ide và bố cục thường KHÔNG dùng chung khoá', () => {
  /**
   * Bài học đã có sẵn trong repo ở tỉ lệ `SplitPane` (xem chú thích quanh
   * `dlp-lesson-split-ide` trong `app/lessons/[id]/lesson-client.tsx`). Ở tab
   * còn khó thấy hơn: `activeTab: 'editor'` lưu từ bài IDE, đọc lại ở bài
   * thường, là một tab không tồn tại — bị kẹp im lặng, nên triệu chứng là "lưu
   * không có tác dụng" chứ không phải một lỗi ai đó đi tìm.
   */
  it('cùng base sinh hai khoá khác nhau', () => {
    expect(workspaceStorageKey('dlp-lesson-ws', true)).not.toBe(
      workspaceStorageKey('dlp-lesson-ws', false),
    );
  });

  it('khoá là hàm thuần của (base, hasEditor)', () => {
    expect(workspaceStorageKey('x', true)).toBe(workspaceStorageKey('x', true));
    expect(workspaceStorageKey('x', true)).toContain('x');
  });

  it('trạng thái lưu ở bố cục ide KHÔNG đọc được từ bố cục thường', () => {
    const storage = fakeStorage();
    writeWorkspaceState(workspaceStorageKey('lesson', true), { activeTab: 'editor', split: true }, storage);

    expect(readWorkspaceState(workspaceStorageKey('lesson', false), storage)).toBeNull();
    expect(readWorkspaceState(workspaceStorageKey('lesson', true), storage)).toEqual({
      activeTab: 'editor',
      split: true,
    });
  });
});

describe('parseWorkspaceState — giá trị rác không được làm sập bố cục', () => {
  it('đọc lại đúng thứ đã ghi', () => {
    const storage = fakeStorage();
    writeWorkspaceState('k', { activeTab: 'terminal-2', split: false }, storage);
    expect(readWorkspaceState('k', storage)).toEqual({ activeTab: 'terminal-2', split: false });
  });

  it('null cho JSON hỏng, hình dạng sai, hoặc tab lạ', () => {
    expect(parseWorkspaceState(null)).toBeNull();
    expect(parseWorkspaceState('{')).toBeNull();
    expect(parseWorkspaceState('"chuỗi"')).toBeNull();
    expect(parseWorkspaceState('null')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"terminal-9","split":true}')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"editor"}')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"editor","split":"true"}')).toBeNull();
  });

  it('storage ném (chế độ riêng tư) ⇒ trả null / không ném ra ngoài', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readWorkspaceState('k', throwing)).toBeNull();
    expect(() => {
      writeWorkspaceState('k', { activeTab: 'editor', split: false }, throwing);
    }).not.toThrow();
  });

  it('storage null (SSR) ⇒ không đọc, không ghi, không ném', () => {
    expect(readWorkspaceState('k', null)).toBeNull();
    expect(() => {
      writeWorkspaceState('k', { activeTab: 'editor', split: false }, null);
    }).not.toThrow();
  });
});
