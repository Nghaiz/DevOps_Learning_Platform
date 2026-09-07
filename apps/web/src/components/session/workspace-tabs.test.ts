import { describe, expect, it } from 'vitest';
import {
  TERMINAL_PERCENT_DEFAULT,
  TERMINAL_PERCENT_MAX,
  TERMINAL_PERCENT_MIN,
  clampTerminalPercent,
  isEditorVisible,
  listWorkspaceTabs,
  nextTabOnKey,
  nextTerminalPercentOnKey,
  parseWorkspaceState,
  readWorkspaceState,
  resolveActiveTab,
  workspaceLayoutToken,
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

describe('listWorkspaceTabs — bài không có editor chỉ còn MỘT mục', () => {
  it('có editor ⇒ Editor đứng trước, Terminal sau', () => {
    expect(listWorkspaceTabs(true)).toEqual(['editor', 'terminal']);
  });

  it('không có editor ⇒ đúng một mục', () => {
    // §Y4: panel dùng độ dài này để quyết định có vẽ `role="tablist"` không —
    // một tablist một mục là nhiễu thị giác chứ không phải chức năng.
    expect(listWorkspaceTabs(false)).toEqual(['terminal']);
  });
});

describe('resolveActiveTab', () => {
  it('giữ nguyên tab có thật', () => {
    expect(resolveActiveTab('editor', true)).toBe('editor');
    expect(resolveActiveTab('terminal', true)).toBe('terminal');
  });

  it('kẹp `editor` về `terminal` ở bài không có editor', () => {
    // Ca thật: một `activeTab: 'editor'` đọc lại từ localStorage của bài IDE
    // trước đó. Không kẹp thì hàng 1 rỗng chiếm chỗ bên trên terminal.
    expect(resolveActiveTab('editor', false)).toBe('terminal');
  });
});

describe('isEditorVisible — biến DUY NHẤT mà chuyển tab đổi', () => {
  it('chỉ hiện ở tab Editor của bài có editor', () => {
    expect(isEditorVisible('editor', true)).toBe(true);
    expect(isEditorVisible('terminal', true)).toBe(false);
    expect(isEditorVisible('editor', false)).toBe(false);
    expect(isEditorVisible('terminal', false)).toBe(false);
  });

  /*
    ⚠ Nửa "âm" của bất biến §Y1 KHÔNG được gác ở file này, và đó là có chủ ý:
    ở đây không có hàm nào trả lời "terminal có hiện không" vì câu trả lời là
    LUÔN LUÔN CÓ. Ô gác thật nằm ở `workspace-panel.test.tsx` ("hàng terminal
    KHÔNG BAO GIỜ mang `hidden`"), nơi có markup thật để khẳng định. Một ô ở đây
    chỉ có thể khẳng định về chính danh sách export của mình — tức một phép kiểm
    tự-đúng, xanh kể cả khi panel ẩn terminal.
  */
});

describe('clampTerminalPercent', () => {
  it('kẹp về [MIN, MAX] và làm tròn', () => {
    expect(clampTerminalPercent(40.4)).toBe(40);
    expect(clampTerminalPercent(0)).toBe(TERMINAL_PERCENT_MIN);
    expect(clampTerminalPercent(-30)).toBe(TERMINAL_PERCENT_MIN);
    expect(clampTerminalPercent(100)).toBe(TERMINAL_PERCENT_MAX);
  });

  it('NaN/Infinity ⇒ MẶC ĐỊNH, không lan ra ngoài', () => {
    // `Math.min`/`Math.max` với NaN lan NaN, và `flexBasis: "NaN%"` là khai báo
    // CSS không hợp lệ — trình duyệt bỏ qua trong im lặng và khoang trở về kích
    // thước tự nhiên, không có gì báo. Ca thật: chia cho một `rect.height` = 0.
    expect(clampTerminalPercent(Number.NaN)).toBe(TERMINAL_PERCENT_DEFAULT);
    expect(clampTerminalPercent(Number.POSITIVE_INFINITY)).toBe(TERMINAL_PERCENT_DEFAULT);
  });
});

describe('nextTerminalPercentOnKey — bàn phím trên thanh kéo', () => {
  it('mũi tên LÊN làm terminal cao thêm, XUỐNG thì thấp đi', () => {
    // Thanh kéo đi lên ⇒ phần dưới nó (terminal) rộng ra.
    expect(nextTerminalPercentOnKey('ArrowUp', 40)).toBeGreaterThan(40);
    expect(nextTerminalPercentOnKey('ArrowDown', 40)).toBeLessThan(40);
  });

  it('Home/End nhảy về hai đầu', () => {
    expect(nextTerminalPercentOnKey('Home', 40)).toBe(TERMINAL_PERCENT_MIN);
    expect(nextTerminalPercentOnKey('End', 40)).toBe(TERMINAL_PERCENT_MAX);
  });

  it('không vượt biên khi đã ở sát mép', () => {
    expect(nextTerminalPercentOnKey('ArrowUp', TERMINAL_PERCENT_MAX)).toBe(TERMINAL_PERCENT_MAX);
    expect(nextTerminalPercentOnKey('ArrowDown', TERMINAL_PERCENT_MIN)).toBe(TERMINAL_PERCENT_MIN);
  });

  it('null cho phím ngoài khuôn — call-site KHÔNG được preventDefault', () => {
    // Nuốt mọi phím ở đây sẽ chặn cả `Tab` (đường thoát khỏi thanh kéo) lẫn
    // phím tắt của trình duyệt.
    expect(nextTerminalPercentOnKey('Tab', 40)).toBeNull();
    expect(nextTerminalPercentOnKey('ArrowLeft', 40)).toBeNull();
    expect(nextTerminalPercentOnKey('a', 40)).toBeNull();
  });
});

describe('workspaceLayoutToken — dấu hiệu "phải fit() lại" (§Y1)', () => {
  /**
   * ⛔ Ô quan trọng nhất của file.
   *
   * `TerminalPane` gọi `handle.fit()` mỗi khi chuỗi này đổi. Nếu chuyển tab
   * KHÔNG đổi chuỗi thì terminal giữ số cột/hàng của bố cục cũ sau khi khoang
   * đã cao gấp đôi — dòng gãy cho tới lần resize sau, và không có gì báo.
   */
  it('chuyển tab ĐỔI chuỗi', () => {
    const split = workspaceLayoutToken({ activeTab: 'editor', hasEditor: true, terminalPercent: 40 });
    const full = workspaceLayoutToken({ activeTab: 'terminal', hasEditor: true, terminalPercent: 40 });
    expect(split).not.toBe(full);
  });

  it('kéo thanh chia ĐỔI chuỗi', () => {
    // §Y6: đổi chiều cao cũng là đổi kích thước, nên nó cũng phải kéo theo một
    // lượt fit — không chỉ lúc chuyển tab.
    const a = workspaceLayoutToken({ activeTab: 'editor', hasEditor: true, terminalPercent: 40 });
    const b = workspaceLayoutToken({ activeTab: 'editor', hasEditor: true, terminalPercent: 70 });
    expect(a).not.toBe(b);
  });

  it('cùng hình học ⇒ CÙNG chuỗi (không fit thừa)', () => {
    const a = workspaceLayoutToken({ activeTab: 'editor', hasEditor: true, terminalPercent: 40 });
    const b = workspaceLayoutToken({ activeTab: 'editor', hasEditor: true, terminalPercent: 40.2 });
    expect(a).toBe(b);
  });

  it('ở tab Terminal, phần trăm KHÔNG vào chuỗi', () => {
    // Terminal chiếm trọn khoang bất kể phần trăm đã lưu là bao nhiêu. Nhét nó
    // vào sẽ đẻ ra một lượt fit thừa mỗi lần khôi phục giá trị từ storage.
    const a = workspaceLayoutToken({ activeTab: 'terminal', hasEditor: true, terminalPercent: 20 });
    const b = workspaceLayoutToken({ activeTab: 'terminal', hasEditor: true, terminalPercent: 80 });
    expect(a).toBe(b);
  });

  it('bài không có editor luôn là "toàn khoang"', () => {
    expect(workspaceLayoutToken({ activeTab: 'editor', hasEditor: false, terminalPercent: 40 })).toBe(
      workspaceLayoutToken({ activeTab: 'terminal', hasEditor: false, terminalPercent: 40 }),
    );
  });
});

describe('nextTabOnKey — khuôn tablist ngang của ARIA APG', () => {
  const tabs: readonly WorkspaceTabId[] = ['editor', 'terminal'];

  it('mũi tên phải đi tới, có VÒNG LẠI', () => {
    expect(nextTabOnKey('ArrowRight', tabs, 'editor')).toBe('terminal');
    expect(nextTabOnKey('ArrowRight', tabs, 'terminal')).toBe('editor');
  });

  it('mũi tên trái đi lui, có VÒNG LẠI', () => {
    expect(nextTabOnKey('ArrowLeft', tabs, 'terminal')).toBe('editor');
    expect(nextTabOnKey('ArrowLeft', tabs, 'editor')).toBe('terminal');
  });

  it('Home/End nhảy hai đầu', () => {
    expect(nextTabOnKey('Home', tabs, 'terminal')).toBe('editor');
    expect(nextTabOnKey('End', tabs, 'editor')).toBe('terminal');
  });

  it('null cho phím ngoài khuôn — call-site KHÔNG được preventDefault', () => {
    expect(nextTabOnKey('Tab', tabs, 'editor')).toBeNull();
    expect(nextTabOnKey('a', tabs, 'editor')).toBeNull();
    expect(nextTabOnKey('ArrowDown', tabs, 'editor')).toBeNull();
  });

  it('không ném khi activeTab không nằm trong danh sách', () => {
    expect(nextTabOnKey('ArrowRight', ['terminal'], 'editor')).toBe('terminal');
  });

  it('null khi không có tab nào', () => {
    expect(nextTabOnKey('ArrowRight', [], 'editor')).toBeNull();
  });
});

describe('workspaceStorageKey — bố cục ide và bố cục thường KHÔNG dùng chung khoá', () => {
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
    writeWorkspaceState(
      workspaceStorageKey('lesson', true),
      { activeTab: 'editor', terminalPercent: 70 },
      storage,
    );

    expect(readWorkspaceState(workspaceStorageKey('lesson', false), storage)).toBeNull();
    expect(readWorkspaceState(workspaceStorageKey('lesson', true), storage)).toEqual({
      activeTab: 'editor',
      terminalPercent: 70,
    });
  });
});

describe('parseWorkspaceState — giá trị rác không được làm sập bố cục', () => {
  it('đọc lại đúng thứ đã ghi', () => {
    const storage = fakeStorage();
    writeWorkspaceState('k', { activeTab: 'terminal', terminalPercent: 55 }, storage);
    expect(readWorkspaceState('k', storage)).toEqual({ activeTab: 'terminal', terminalPercent: 55 });
  });

  /**
   * ⚠ Bản ghi của mô hình CŨ phải trả `null`, không được đọc "một nửa".
   *
   * `terminal-1` không còn là tab hợp lệ, và `split` không còn là chiều cao. Im
   * lặng chấp nhận một trong hai sẽ mở bài ở một trạng thái không ai chọn.
   */
  it('bản ghi mô hình cũ (terminal-1 / split) ⇒ null, người dùng nhận mặc định', () => {
    expect(parseWorkspaceState('{"activeTab":"terminal-1","split":false}')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"editor","split":true}')).toBeNull();
  });

  it('null cho JSON hỏng, hình dạng sai, hoặc tab lạ', () => {
    expect(parseWorkspaceState(null)).toBeNull();
    expect(parseWorkspaceState('{')).toBeNull();
    expect(parseWorkspaceState('"chuỗi"')).toBeNull();
    expect(parseWorkspaceState('null')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"terminal-9","terminalPercent":40}')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"editor"}')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"editor","terminalPercent":"40"}')).toBeNull();
  });

  it('phần trăm ngoài biên bị KẸP lúc đọc, không bị vứt', () => {
    // Khác với một trường sai KIỂU: 999 vẫn là một con số người dùng từng kéo
    // tới (hoặc một bản ghi từ máy có biên khác), nên kẹp còn hơn trả mặc định.
    expect(parseWorkspaceState('{"activeTab":"editor","terminalPercent":999}')).toEqual({
      activeTab: 'editor',
      terminalPercent: TERMINAL_PERCENT_MAX,
    });
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
      writeWorkspaceState('k', { activeTab: 'editor', terminalPercent: 40 }, throwing);
    }).not.toThrow();
  });

  it('storage null (SSR) ⇒ không đọc, không ghi, không ném', () => {
    expect(readWorkspaceState('k', null)).toBeNull();
    expect(() => {
      writeWorkspaceState('k', { activeTab: 'editor', terminalPercent: 40 }, null);
    }).not.toThrow();
  });
});
