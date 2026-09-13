import { describe, expect, it } from 'vitest';
import {
  isEditorVisible,
  listWorkspaceTabs,
  nextTabOnKey,
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

describe('workspaceLayoutToken — dấu hiệu "phải fit() lại" (§Y1)', () => {
  /**
   * ⛔ Ô quan trọng nhất của file.
   *
   * `TerminalPane` gọi `handle.fit()` mỗi khi chuỗi này đổi. SỬA ĐỔI 3 làm nó
   * quan trọng hơn chứ không kém: ở tab Editor terminal bị `hidden`, tức đo ra
   * 0×0. Chuyển về tab Terminal là đi từ 0×0 sang kích thước thật — không đổi
   * chuỗi thì không có lượt fit nào, và xterm giữ nguyên số cột mặc định.
   */
  it('chuyển tab ĐỔI chuỗi', () => {
    const editorOnly = workspaceLayoutToken({ activeTab: 'editor', hasEditor: true });
    const terminalFull = workspaceLayoutToken({ activeTab: 'terminal', hasEditor: true });
    expect(editorOnly).not.toBe(terminalFull);
  });

  it('cùng tab ⇒ CÙNG chuỗi (không fit thừa)', () => {
    expect(workspaceLayoutToken({ activeTab: 'editor', hasEditor: true })).toBe(
      workspaceLayoutToken({ activeTab: 'editor', hasEditor: true }),
    );
  });

  it('bài không có editor luôn là "toàn khoang"', () => {
    // `resolveActiveTab` đã kẹp về `terminal`, nhưng token phải tự đúng kể cả
    // khi ai đó gọi thẳng với `activeTab: 'editor'` — nếu không, một bài thường
    // nhận một chuỗi "editor-only" và terminal bị fit theo một bố cục không có.
    expect(workspaceLayoutToken({ activeTab: 'editor', hasEditor: false })).toBe(
      workspaceLayoutToken({ activeTab: 'terminal', hasEditor: false }),
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
    writeWorkspaceState(workspaceStorageKey('lesson', true), { activeTab: 'editor' }, storage);

    expect(readWorkspaceState(workspaceStorageKey('lesson', false), storage)).toBeNull();
    expect(readWorkspaceState(workspaceStorageKey('lesson', true), storage)).toEqual({
      activeTab: 'editor',
    });
  });
});

describe('parseWorkspaceState — giá trị rác không được làm sập bố cục', () => {
  it('đọc lại đúng thứ đã ghi', () => {
    const storage = fakeStorage();
    writeWorkspaceState('k', { activeTab: 'terminal' }, storage);
    expect(readWorkspaceState('k', storage)).toEqual({ activeTab: 'terminal' });
  });

  /**
   * ⚠ Bản ghi của mô hình SỬA ĐỔI 1 vẫn phải trả `null`.
   *
   * `terminal-1` không còn là tab hợp lệ. Im lặng chấp nhận nó sẽ mở bài ở một
   * trạng thái không ai chọn.
   */
  it('tab của mô hình cũ (terminal-1) ⇒ null, người dùng nhận mặc định', () => {
    expect(parseWorkspaceState('{"activeTab":"terminal-1","split":false}')).toBeNull();
  });

  /**
   * ⚠ Đối chứng cho một quyết định CỐ Ý của SỬA ĐỔI 3, không phải một chỗ nới tay.
   *
   * Bản ghi của SỬA ĐỔI 2 mang thêm `terminalPercent`, mô tả một thanh kéo nay
   * không còn tồn tại. Trường đó bị BỎ QUA chứ không làm hỏng cả bản ghi: cái
   * `activeTab` trong đó vẫn khai đúng tab mà người dùng đã chọn. Từ chối cả
   * bản ghi sẽ làm mọi người đang dùng mất tab đã nhớ ở đúng lượt cập nhật này
   * — một hồi quy im lặng để đổi lấy đúng con số không.
   */
  it('bản ghi SỬA ĐỔI 2 (có terminalPercent thừa) vẫn đọc được, chỉ bỏ trường thừa', () => {
    expect(parseWorkspaceState('{"activeTab":"editor","split":true}')).toEqual({
      activeTab: 'editor',
    });
    expect(parseWorkspaceState('{"activeTab":"terminal","terminalPercent":70}')).toEqual({
      activeTab: 'terminal',
    });
    expect(parseWorkspaceState('{"activeTab":"editor","terminalPercent":"rác"}')).toEqual({
      activeTab: 'editor',
    });
  });

  it('bản ghi chỉ có activeTab (hình dạng SỬA ĐỔI 3) đọc được', () => {
    expect(parseWorkspaceState('{"activeTab":"editor"}')).toEqual({ activeTab: 'editor' });
  });

  it('null cho JSON hỏng, hình dạng sai, hoặc tab lạ', () => {
    expect(parseWorkspaceState(null)).toBeNull();
    expect(parseWorkspaceState('{')).toBeNull();
    expect(parseWorkspaceState('"chuỗi"')).toBeNull();
    expect(parseWorkspaceState('null')).toBeNull();
    expect(parseWorkspaceState('{"activeTab":"terminal-9","terminalPercent":40}')).toBeNull();
    expect(parseWorkspaceState('{"terminalPercent":40}')).toBeNull();
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
      writeWorkspaceState('k', { activeTab: 'editor' }, throwing);
    }).not.toThrow();
  });

  it('storage null (SSR) ⇒ không đọc, không ghi, không ném', () => {
    expect(readWorkspaceState('k', null)).toBeNull();
    expect(() => {
      writeWorkspaceState('k', { activeTab: 'editor' }, null);
    }).not.toThrow();
  });
});
