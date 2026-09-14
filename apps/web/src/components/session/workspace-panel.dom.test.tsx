// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePanel, type WorkspacePanelProps } from './workspace-panel';
import {
  EDITOR_TAB,
  TERMINAL_TAB,
  hasDisplayUtility,
  workspaceStorageKey,
  type WorkspaceTabId,
} from './workspace-tabs';

/**
 * §Y1/§Y4/§Y6 — DÂY NỐI của `WorkspacePanel` với DOM sự kiện.
 *
 * ## File này phủ đúng cái mà ba file kia KHÔNG phủ được
 *
 * | File | Mức | Phủ cái gì |
 * |---|---|---|
 * | `workspace-tabs.test.ts` | hàm THUẦN | quyết định: hàng 1 hiện không, phím đi đâu, lưu khoá nào |
 * | `workspace-layout.test.ts` | hàm THUẦN | thân effect gọi `fit()` |
 * | `workspace-panel.test.tsx` | markup SSR TĨNH | cây DOM sinh ra ở MỘT lượt render |
 * | **file này** | **DOM sống (jsdom + RTL)** | **bấm/gõ → gọi đúng hàm với đúng tham số → DOM đổi thật** |
 *
 * Ba mức trên đều không chạm được tới: một cú bấm chuột có gọi `onActivate`
 * đúng tham số không, một phím mũi tên có nổi bọt từ NÚT lên tablist không,
 * `preventDefault` có được gọi đúng chỗ không, `localStorage` sau hai effect
 * chạy cùng nhịp commit còn giữ đúng số không, và — quan trọng nhất — React có
 * **giữ nguyên node terminal** qua một lượt reconcile thật không. Một lượt
 * `renderToStaticMarkup` chỉ render MỘT lần, nên nó về cấu trúc không thể quan
 * sát chuyện gì xảy ra ở lượt render THỨ HAI.
 *
 * ## Vì sao là docblock per-file chứ không phải `environment` toàn cục
 *
 * ⛔ Đặt `environment: 'jsdom'` trong `vitest.config.ts` là đổi nền dưới chân
 * các test tích hợp của gói này (authz, repository-page-sql… — chúng đi Postgres
 * THẬT và chạy ở `node`). Docblock ở dòng 1 bật jsdom cho ĐÚNG file này.
 *
 * ⚠ `environmentMatchGlobs` (khuôn quen thuộc của vitest 1/2) **không còn tồn
 * tại**: đo 2026-09-08 trên `vitest@4.1.11` đã cài, grep toàn bộ package ra 0
 * kết quả. Đường còn sống là docblock (dùng ở đây) hoặc `test.projects`.
 * Docblock được chọn vì nó không phải tái cấu trúc cả file cấu hình cho một file
 * test.
 *
 * Đã kiểm bằng ĐỐI CHỨNG ÂM trong cùng một lượt chạy, không suy luận từ tài
 * liệu: một file có docblock thấy `document`, một file không có docblock thấy
 * `typeof document === 'undefined'`. Tức docblock ăn, và nó KHÔNG rò sang file
 * khác.
 */

const EDITOR_NODE = 'editor-node';
const TERMINAL_NODE = 'terminal-node';
const STORAGE_BASE = 'dlp-test-workspace';

/** Khoá thật mà panel dùng ở bố cục có editor (`base:ide`). */
const IDE_KEY = workspaceStorageKey(STORAGE_BASE, true);

/**
 * ⚠ RTL KHÔNG tự dọn ở gói này.
 *
 * Auto-cleanup của `@testing-library/react` chỉ tự đăng ký khi `afterEach` là
 * một biến TOÀN CỤC — tức khi vitest chạy với `globals: true`. `vitest.config.ts`
 * của `apps/web` không bật cờ đó, nên phải gọi tay. Không có dòng này thì mỗi
 * `render` chồng thêm một cây vào `document.body` và `screen.getByRole` đỏ với
 * "found multiple elements" ở test THỨ HAI trở đi — một lỗi đọc ra như lỗi sản
 * phẩm chứ không như lỗi dọn dẹp.
 */
afterEach(() => {
  cleanup();
});

beforeEach(() => {
  localStorage.clear();
});

function baseProps(overrides: Partial<WorkspacePanelProps> = {}): WorkspacePanelProps {
  return {
    editor: <span data-testid={EDITOR_NODE}>EDITOR</span>,
    terminal: <span data-testid={TERMINAL_NODE}>TERMINAL</span>,
    activeTab: EDITOR_TAB,
    onActivate: () => undefined,
    popOutUrl: null,
    ...overrides,
  };
}

/** Dựng panel với một `onActivate` giả để khẳng định ĐÚNG THAM SỐ, không chỉ "đã gọi". */
function mount(overrides: Partial<WorkspacePanelProps> = {}): {
  readonly onActivate: ReturnType<typeof vi.fn<(tab: WorkspaceTabId) => void>>;
} {
  const onActivate = vi.fn<(tab: WorkspaceTabId) => void>();
  render(<WorkspacePanel {...baseProps({ onActivate, ...overrides })} />);
  return { onActivate };
}

/**
 * Panel với một cha THẬT giữ state — để một cú bấm/gõ đi trọn vòng
 * (sự kiện → `onActivate` → state của cha → render lại → DOM đổi).
 *
 * `activeTab` là prop ĐIỀU KHIỂN (§Y4), nên không có cha thì bấm bao nhiêu lần
 * DOM cũng đứng yên — và một test khẳng định "DOM đổi theo" mà thiếu cha sẽ đo
 * nhầm chính cái thiếu đó.
 */
function ControlledPanel({
  initialTab = EDITOR_TAB,
  hasEditor = true,
  storageKey,
}: {
  readonly initialTab?: WorkspaceTabId;
  readonly hasEditor?: boolean;
  /** Truyền vào khi ô test cần quan sát vòng khôi-phục-rồi-ghi trên storage THẬT. */
  readonly storageKey?: string;
}): ReactElement {
  const [tab, setTab] = useState<WorkspaceTabId>(initialTab);
  return (
    <WorkspacePanel
      {...(hasEditor ? { editor: <span data-testid={EDITOR_NODE}>EDITOR</span> } : {})}
      {...(storageKey === undefined ? {} : { storageKey })}
      terminal={<span data-testid={TERMINAL_NODE}>TERMINAL</span>}
      activeTab={tab}
      onActivate={setTab}
      popOutUrl={null}
    />
  );
}

/**
 * Một hàng của ngăn xếp dọc, tìm theo `id`.
 *
 * ⚠ Phải neo bằng `[id$=…]`, KHÔNG dùng `[id*=…]` hay `aria-controls`: nút tab
 * mang `aria-controls="…-panel-editor"` nên một bộ chọn lỏng sẽ khớp cái NÚT
 * trước hàng thật — đúng cái bẫy `workspace-panel.test.tsx` đã ghi lại.
 */
function row(suffix: 'editor' | 'terminal'): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[id$="-panel-${suffix}"]`);
  expect(el, `không tìm thấy hàng -panel-${suffix}`).not.toBeNull();
  return el as HTMLElement;
}

function tab(name: 'Editor' | 'Terminal'): HTMLElement {
  return screen.getByRole('tab', { name });
}

function savedState(key: string = IDE_KEY): { activeTab: string } | null {
  const raw = localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as { activeTab: string });
}

// ── Bấm chuột lên tab ───────────────────────────────────────────────────────

describe('bấm chuột lên tab — gọi ĐÚNG hàm với ĐÚNG tham số', () => {
  it('bấm Terminal ⇒ onActivate("terminal"), đúng một lần', async () => {
    const { onActivate } = mount({ activeTab: EDITOR_TAB });
    await userEvent.click(tab('Terminal'));
    // `mock.calls` chứ không phải `toHaveBeenCalled`: khẳng định CẢ số lần lẫn
    // tham số. Một `onActivate` gọi đúng một lần nhưng sai tab vẫn là hỏng.
    expect(onActivate.mock.calls).toEqual([[TERMINAL_TAB]]);
  });

  it('bấm Editor ⇒ onActivate("editor"), đúng một lần', async () => {
    const { onActivate } = mount({ activeTab: TERMINAL_TAB });
    await userEvent.click(tab('Editor'));
    expect(onActivate.mock.calls).toEqual([[EDITOR_TAB]]);
  });

  it('bấm lại tab ĐANG hoạt vẫn báo CHÍNH NÓ, không lật sang tab kia', async () => {
    /*
      Đối chứng cho hai ô trên. Một bản cài đặt "lật" — `onActivate(active ===
      EDITOR ? TERMINAL : EDITOR)` — vẫn XANH ở cả hai ô trên vì ở đó tab được
      bấm luôn khác tab đang hoạt. Chỉ ô này phân biệt được "báo tên nút vừa
      bấm" với "lật trạng thái".
    */
    const { onActivate } = mount({ activeTab: EDITOR_TAB });
    await userEvent.click(tab('Editor'));
    expect(onActivate.mock.calls).toEqual([[EDITOR_TAB]]);
  });
});

// ── Bàn phím trên thanh tab ─────────────────────────────────────────────────

describe('bàn phím trên thanh tab — sự kiện nổi bọt từ NÚT lên tablist', () => {
  /*
    `onKeyDown` nằm trên `<div role="tablist">`, không nằm trên từng nút. Nên mọi
    ô dưới đây bắn phím lên chính cái NÚT: nếu handler bị đặt nhầm chỗ (hoặc một
    lần refactor chặn nổi bọt), chúng đỏ. Bắn thẳng lên tablist sẽ xanh cả ở bản
    đặt nhầm — tức đo mất đúng phần dây nối cần đo.
  */
  it('ArrowRight đi tới tab kế', () => {
    const { onActivate } = mount({ activeTab: EDITOR_TAB });
    fireEvent.keyDown(tab('Editor'), { key: 'ArrowRight' });
    expect(onActivate.mock.calls).toEqual([[TERMINAL_TAB]]);
  });

  it('ArrowLeft VÒNG LẠI về cuối danh sách', () => {
    const { onActivate } = mount({ activeTab: EDITOR_TAB });
    fireEvent.keyDown(tab('Editor'), { key: 'ArrowLeft' });
    expect(onActivate.mock.calls).toEqual([[TERMINAL_TAB]]);
  });

  it('Home về tab đầu, End về tab cuối', () => {
    const { onActivate } = mount({ activeTab: TERMINAL_TAB });
    fireEvent.keyDown(tab('Terminal'), { key: 'Home' });
    fireEvent.keyDown(tab('Terminal'), { key: 'End' });
    expect(onActivate.mock.calls).toEqual([[EDITOR_TAB], [TERMINAL_TAB]]);
  });

  it('phím TRONG khuôn bị preventDefault — không để trình duyệt cuộn thanh tab', () => {
    mount({ activeTab: EDITOR_TAB });
    const event = createEvent.keyDown(tab('Editor'), { key: 'ArrowRight' });
    fireEvent(tab('Editor'), event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('phím NGOÀI khuôn KHÔNG bị nuốt — Tab vẫn thoát khỏi thanh tab', () => {
    /*
      Đây là nửa còn lại của hợp đồng `nextTabOnKey → null`. Hàm thuần đã được
      phủ ở `workspace-tabs.test.ts`, nhưng "call-site KHÔNG được preventDefault"
      là một câu về DÂY NỐI: chỉ đọc được `defaultPrevented` trên một sự kiện
      THẬT. Nuốt `Tab` ở đây là khoá người dùng bàn phím lại trong thanh tab.
    */
    const { onActivate } = mount({ activeTab: EDITOR_TAB });
    for (const key of ['Tab', 'a', 'Enter', 'ArrowUp']) {
      const event = createEvent.keyDown(tab('Editor'), { key });
      fireEvent(tab('Editor'), event);
      expect(event.defaultPrevented, `phím ${key}`).toBe(false);
    }
    expect(onActivate).not.toHaveBeenCalled();
  });
});

// ── Vòng đầy đủ: sự kiện → cha → DOM ────────────────────────────────────────

describe('chuyển tab THẬT trong DOM (có cha giữ state)', () => {
  it('bấm chuột: aria-selected, tabindex và `hidden` cùng đổi', async () => {
    render(<ControlledPanel />);

    expect(tab('Editor').getAttribute('aria-selected')).toBe('true');
    expect(tab('Editor').getAttribute('tabindex')).toBe('0');
    expect(tab('Terminal').getAttribute('tabindex')).toBe('-1');
    expect(row('editor').hidden).toBe(false);

    await userEvent.click(tab('Terminal'));

    expect(tab('Terminal').getAttribute('aria-selected')).toBe('true');
    expect(tab('Editor').getAttribute('aria-selected')).toBe('false');
    // Roving tabindex phải ĐI THEO tab đang hoạt, không đứng yên ở nút cũ.
    expect(tab('Terminal').getAttribute('tabindex')).toBe('0');
    expect(tab('Editor').getAttribute('tabindex')).toBe('-1');
    expect(row('editor').hidden).toBe(true);
    // ⛔ §Y1 — hàng terminal không bao giờ ẩn.
    expect(row('terminal').hidden).toBe(false);
  });

  it('bàn phím: ArrowRight đổi tab thật, không chỉ gọi callback', () => {
    render(<ControlledPanel />);
    fireEvent.keyDown(tab('Editor'), { key: 'ArrowRight' });
    expect(tab('Terminal').getAttribute('aria-selected')).toBe('true');
    expect(row('editor').hidden).toBe(true);
  });

  /**
   * ⛔ SỬA ĐỔI 3 — ô đo đúng chỉ đạo "tab IDE thì hiện IDE, tab terminal thì
   * hiện terminal, hết".
   *
   * Hai hàng phải LOẠI TRỪ nhau ở mọi trạng thái. Một bản cài đặt quên ẩn hàng
   * 2 sẽ trông vẫn đúng ở tab Terminal (hàng 1 ẩn, terminal đầy khoang) và chỉ
   * sai ở tab Editor — nên phải khẳng định CẢ HAI chiều, không chỉ chiều dễ.
   */
  it('hai hàng loại trừ nhau: tab Editor ẩn terminal, tab Terminal ẩn editor', async () => {
    render(<ControlledPanel />);
    expect(row('editor').hidden).toBe(false);
    expect(row('terminal').hidden).toBe(true);

    await userEvent.click(tab('Terminal'));
    expect(row('editor').hidden).toBe(true);
    expect(row('terminal').hidden).toBe(false);

    await userEvent.click(tab('Editor'));
    expect(row('editor').hidden).toBe(false);
    expect(row('terminal').hidden).toBe(true);
  });

  /**
   * Hàng đang hiện phải CHIẾM TRỌN khoang.
   *
   * Không có ô này thì một hàng `flex-basis` cũ còn sót lại vẫn "hiện" đúng
   * theo `.hidden` mà chỉ cao 40%, và 60% còn lại là một mảng trống — đúng
   * triệu chứng mà ô §Y6 cũ ở chỗ này từng gác.
   */
  it('hàng đang hiện chiếm trọn khoang, không còn dải phần trăm nào', async () => {
    render(<ControlledPanel />);
    expect(row('terminal').style.flexBasis).toBe('');
    expect(row('editor').className).toContain('flex-1');

    await userEvent.click(tab('Terminal'));
    expect(row('terminal').className).toContain('flex-1');
  });

  /**
   * ⛔ Thanh kéo đã bị GỠ, không phải ẩn đi.
   *
   * Ô này là đối chứng cho quyết định đó: để lại một `[role="separator"]` không
   * bao giờ hiện được là mã chết, và mã chết trong cây này là thứ người đọc sau
   * sẽ tưởng còn dùng.
   */
  it('không còn thanh kéo nào trong DOM lẫn trong cây trợ năng', async () => {
    render(<ControlledPanel />);
    expect(document.querySelector('[role="separator"]')).toBeNull();
    expect(screen.queryByRole('separator')).toBeNull();

    await userEvent.click(tab('Terminal'));
    expect(document.querySelector('[role="separator"]')).toBeNull();
  });
});

// ── ⛔ Bất biến sống-chết §Y1, kiểm qua một lượt RECONCILE thật ──────────────

describe('⛔ §Y1 — chuyển tab KHÔNG dựng lại node terminal', () => {
  /*
    Đây là ô AC quan trọng nhất mà chỉ DOM sống mới kiểm được.

    `workspace-panel.test.tsx` đếm được số con và vị trí của chúng trong MỘT
    lượt render, nhưng "React có giữ nguyên node cũ không" là câu hỏi về lượt
    render THỨ HAI — nó chỉ tồn tại khi có một lượt reconcile thật. Node terminal
    bị dựng lại = unmount xterm = đóng WebSocket = mất phiên của người học, im
    lặng hoàn toàn.

    `toBe` là so sánh THAM CHIẾU: cùng một object DOM, không phải "hai node
    trông giống nhau".
  */
  it('cùng MỘT node DOM trước và sau khi chuyển tab', async () => {
    render(<ControlledPanel />);
    const before = screen.getByTestId(TERMINAL_NODE);
    const beforeParent = before.parentElement;

    await userEvent.click(tab('Terminal'));

    const after = screen.getByTestId(TERMINAL_NODE);
    expect(after).toBe(before);
    expect(after.parentElement).toBe(beforeParent);
    expect(after.isConnected).toBe(true);
  });

  it('chuyển đi rồi chuyển về vẫn là node đó', async () => {
    render(<ControlledPanel />);
    const before = screen.getByTestId(TERMINAL_NODE);
    await userEvent.click(tab('Terminal'));
    await userEvent.click(tab('Editor'));
    expect(screen.getByTestId(TERMINAL_NODE)).toBe(before);
  });

  it('bài đổi từ CÓ editor sang KHÔNG (thanh tab đổi hình dạng) vẫn giữ node', () => {
    /*
      Lượt này đổi cấu trúc NHIỀU hơn một cú chuyển tab: `<div role="tablist">`
      với hai nút bị thay bằng một `<span>` nhãn tĩnh, và hai hàng mất luôn
      `role="tabpanel"` + `aria-labelledby`. Nếu có gì trong ngăn xếp bị so trùng
      lại vì thay đổi đó, ô này đỏ.
    */
    const props = baseProps();
    const { rerender } = render(<WorkspacePanel {...props} />);
    const before = screen.getByTestId(TERMINAL_NODE);

    rerender(<WorkspacePanel {...props} editor={undefined} activeTab={TERMINAL_TAB} />);

    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByTestId(TERMINAL_NODE)).toBe(before);
  });

  it('nội dung editor VẪN trong DOM ở tab Terminal (không nạp nguội Theia lại)', async () => {
    render(<ControlledPanel />);
    const editorNode = screen.getByTestId(EDITOR_NODE);
    await userEvent.click(tab('Terminal'));
    expect(screen.getByTestId(EDITOR_NODE)).toBe(editorNode);
    expect(editorNode.isConnected).toBe(true);
  });
});

// ── Ghi nhớ qua localStorage ────────────────────────────────────────────────

describe('ghi nhớ qua localStorage — hai effect chạy cùng một nhịp commit', () => {
  /**
   * ⚠ Đối chứng TƯƠNG THÍCH NGƯỢC của SỬA ĐỔI 3, và nó gác một hồi quy im lặng.
   *
   * Bản ghi cũ còn mang `terminalPercent`. Nếu `parseWorkspaceState` từ chối cả
   * bản ghi vì trường thừa đó, thì mọi người đang dùng mất tab đã nhớ ở đúng
   * lượt cập nhật này — không lỗi, không log, chỉ là "tab đã lưu không có tác
   * dụng nữa".
   */
  it('bản ghi cũ có terminalPercent vẫn khôi phục được TAB', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: TERMINAL_TAB, terminalPercent: 70 }));
    const { onActivate } = mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    expect(onActivate.mock.calls).toEqual([[TERMINAL_TAB]]);
  });

  it('tab đã lưu khác tab cha đang giữ ⇒ YÊU CẦU cha đổi, đúng một lần, đúng tab', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: TERMINAL_TAB }));
    const { onActivate } = mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    // Panel KHÔNG tự đổi tab (prop điều khiển, §Y4) — nó chỉ được phép yêu cầu.
    expect(onActivate.mock.calls).toEqual([[TERMINAL_TAB]]);
  });

  it('tab đã lưu TRÙNG tab cha ⇒ KHÔNG gọi onActivate thừa', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: EDITOR_TAB }));
    const { onActivate } = mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    expect(onActivate).not.toHaveBeenCalled();
  });

  /**
   * ⚠ HỒI QUY: effect khôi phục và effect ghi chạy trong CÙNG một lượt commit.
   *
   * `restoredRef` là thứ duy nhất chặn lượt ghi đầu tiên. Bỏ nó đi thì effect
   * ghi chạy trước khi effect khôi phục kịp đọc, và nó ghi đè bản ghi đã lưu
   * bằng tab mặc định của cha — nên lần vào sau nữa cũng không khôi phục được.
   * Triệu chứng ngoài đời: chọn tab Terminal, hai lần vào sau vẫn về Editor.
   * Không có gì báo.
   *
   * ⚠ Ô này BẮT BUỘC dùng cha THẬT. Với một `onActivate` giả, panel không bao
   * giờ nhận được tab mới, nên nó ghi lại đúng tab cha đang giữ — và đó là hành
   * vi ĐÚNG, không phải lỗi. Đo bằng cha giả ở đây là đo nhầm chính cái giả đó.
   */
  it('⚠ HỒI QUY: vòng khôi-phục-rồi-ghi KHÔNG được đè tab đã lưu', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: TERMINAL_TAB }));
    render(<ControlledPanel initialTab={EDITOR_TAB} storageKey={STORAGE_BASE} />);
    expect(savedState()).toEqual({ activeTab: TERMINAL_TAB });
  });

  it('KHÔNG truyền storageKey ⇒ không đụng vào localStorage', () => {
    const { onActivate } = mount({ activeTab: EDITOR_TAB });
    expect(onActivate).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('bố cục ide và bố cục thường ghi vào HAI khoá khác nhau — quan sát trên storage THẬT', () => {
    /*
      `workspaceStorageKey` (hàm thuần) đã được phủ. Thứ chưa ai kiểm là panel có
      thật sự đi qua nó không — một bản dùng thẳng `storageKey` sẽ trộn trạng
      thái bài IDE với bài thường, và triệu chứng là "tab đã lưu không có tác
      dụng" chứ không phải một lỗi ai đó đi tìm.
    */
    mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    cleanup();
    mount({ editor: undefined, activeTab: TERMINAL_TAB, storageKey: STORAGE_BASE });

    expect(localStorage.getItem(workspaceStorageKey(STORAGE_BASE, true))).not.toBeNull();
    expect(localStorage.getItem(workspaceStorageKey(STORAGE_BASE, false))).not.toBeNull();
    expect(localStorage.getItem(STORAGE_BASE)).toBeNull();
  });
});

// ── Bài không có editor ─────────────────────────────────────────────────────

describe('bài không có editor — hình dạng một mục', () => {
  it('không có tab nào, nhưng CẢ HAI hàng vẫn trong DOM (§Y1)', () => {
    mount({ editor: undefined, activeTab: TERMINAL_TAB });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByTestId(TERMINAL_NODE).isConnected).toBe(true);
    // Cả hai con tĩnh còn nguyên — chỉ ẩn, không bị gỡ. Gỡ hàng 1 sẽ đẩy hàng 2
    // lên vị trí của nó và React unmount cái xterm.
    expect(row('editor').hidden).toBe(true);
    expect(row('terminal').hidden).toBe(false);
  });
});

// ── AC-1 · ĐỐI CHỨNG DƯƠNG cho phép đo danh tính node ───────────────────────

/**
 * Hợp đồng `p16-workspace.md` §8 AC-1 đòi một đối chứng dương, và cho tới
 * 2026-09-10 nó KHÔNG có: file này chỉ khẳng định `expect(after).toBe(before)`
 * trên panel thật.
 *
 * Vì sao thiếu nó là một lỗ hổng thật chứ không phải thủ tục: ô AC-1 xanh khi
 * hai tham chiếu bằng nhau. Một `getByTestId` trả về CÙNG một phần tử vì lý do
 * khác hẳn — ví dụ panel không hề render lại (prop `activeTab` không tới nơi),
 * hoặc `userEvent.click` bắn vào một nút không nối gì — cũng cho `toBe` xanh.
 * Lúc đó ô quan trọng nhất của cả lane đang đo "không có gì đổi" thay vì đo
 * "React giữ nguyên node qua một lượt reconcile".
 *
 * Nên phép đo được tách thành MỘT hàm, và hàm đó chạy hai lần: một lần trên
 * panel thật (phải `toBe`), một lần trên một component CỐ Ý SAI theo đúng hình
 * dạng §1.5 (phải `not.toBe`). Chỉ khi cả hai cùng đúng thì AC-1 mới nói được
 * điều nó tuyên bố.
 */

/** Đúng MỘT phép đo, dùng cho cả panel thật lẫn component cố ý sai. */
function terminalNodeIdentityAcrossTabSwitch(ui: (tab: WorkspaceTabId) => ReactElement): {
  readonly sameNode: boolean;
  readonly sameParent: boolean;
} {
  const { rerender } = render(ui(EDITOR_TAB));
  const before = screen.getByTestId(TERMINAL_NODE);
  const beforeParent = before.parentElement;

  rerender(ui(TERMINAL_TAB));
  const after = screen.getByTestId(TERMINAL_NODE);

  return { sameNode: after === before, sameParent: after.parentElement === beforeParent };
}

describe('⛔ AC-1 — phép đo danh tính node ĐỎ được (đối chứng dương)', () => {
  /**
   * Hình dạng cấm số 1 của §1.5: hai nhánh JSX = hai cây.
   *
   * ```tsx
   * {activeTab === 'terminal' ? <Terminal/> : <><Editor/><Terminal/></>}
   * ```
   *
   * React so trùng con theo VỊ TRÍ và theo KIỂU phần tử. Ở vị trí 0 nó thấy một
   * `<div>` ở nhánh này và một Fragment ở nhánh kia — hai kiểu khác nhau ⇒ huỷ
   * cây cũ, dựng cây mới. Đó chính là `terminal.dispose()` + WebSocket đóng mà
   * §1.2 mô tả, và nó không phát ra một lỗi nào.
   */
  function ForbiddenTwoBranchPanel({ activeTab }: { readonly activeTab: WorkspaceTabId }) {
    const terminalRow = (
      <div className="min-h-0 min-w-0 overflow-hidden">
        <span data-testid={TERMINAL_NODE}>TERMINAL</span>
      </div>
    );
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === TERMINAL_TAB ? (
          terminalRow
        ) : (
          <>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
              <span data-testid={EDITOR_NODE}>EDITOR</span>
            </div>
            {terminalRow}
          </>
        )}
      </div>
    );
  }

  it('component cố ý sai (hai nhánh JSX) ⇒ node terminal ĐỔI — phép đo không mù', () => {
    const measured = terminalNodeIdentityAcrossTabSwitch((activeTab) => (
      <ForbiddenTwoBranchPanel activeTab={activeTab} />
    ));

    expect(
      measured.sameNode,
      'phép đo danh tính đang MÙ: nó không phân biệt được một node bị dựng lại ' +
        'với một node giữ nguyên. Mọi khẳng định §Y1 phía trên vì thế không ' +
        'chứng minh gì. Sửa phép đo TRƯỚC, đừng sửa panel.',
    ).toBe(false);
  });

  it('panel THẬT, đo bằng ĐÚNG hàm đó ⇒ node và cha đều giữ nguyên', () => {
    // Cùng một `terminalNodeIdentityAcrossTabSwitch`, cùng một lượt chạy. Đây
    // là thứ biến ô trên thành một đối chứng chứ không phải một test riêng lẻ
    // về một component đồ chơi.
    const measured = terminalNodeIdentityAcrossTabSwitch((activeTab) => (
      <WorkspacePanel {...baseProps({ activeTab })} />
    ));

    expect(measured.sameNode).toBe(true);
    expect(measured.sameParent).toBe(true);
  });
});

// ── AC-2 · quét TOÀN BỘ cây DOM ở CẢ HAI tab ────────────────────────────────

describe('AC-2 — mọi phần tử [hidden] trong cây đều không mang tiện ích display', () => {
  /**
   * `workspace-panel.test.tsx` quét chuỗi markup SSR; ô này quét cây DOM SỐNG.
   * Hai thứ khác nhau: markup là lượt render đầu, còn DOM là thứ còn lại sau
   * hydrate và sau mọi lượt đổi class do state gây ra.
   *
   * Danh sách tiện ích đến từ `workspace-tabs.ts`, không chép tay — xem chú
   * thích tại chỗ khai.
   */
  function hiddenOffenders(): readonly string[] {
    return [...document.querySelectorAll<HTMLElement>('[hidden]')]
      .filter((el) => hasDisplayUtility(el.className))
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
  }

  const CASES: readonly { readonly label: string; readonly props: Partial<WorkspacePanelProps> }[] =
    [
      { label: 'có editor · tab Editor', props: { activeTab: EDITOR_TAB } },
      { label: 'có editor · tab Terminal', props: { activeTab: TERMINAL_TAB } },
      { label: 'không editor · tab Terminal', props: { editor: undefined, activeTab: TERMINAL_TAB } },
    ];

  for (const testCase of CASES) {
    it(`${testCase.label} — không phần tử [hidden] nào mang display`, () => {
      mount(testCase.props);
      expect(hiddenOffenders()).toEqual([]);
    });
  }

  it('đối chứng dương (bộ quét): một cây giả `<div hidden class="flex">` bị BẮT', () => {
    // Không có ô này thì một `hiddenOffenders` luôn trả mảng rỗng — vì
    // `querySelectorAll` trượt, vì `className` rỗng trên SVG, vì bất cứ lý do
    // nào — cũng làm ba ô trên xanh.
    const scratch = document.createElement('div');
    scratch.innerHTML = '<div hidden class="min-h-0 flex flex-col"></div>';
    document.body.append(scratch);

    expect(hiddenOffenders()).toEqual(['div.min-h-0 flex flex-col']);

    scratch.remove();
  });

  it('đối chứng dương (query trúng đích): ở tab Editor, hàng 1 KHÔNG mang `hidden`', () => {
    // Vế còn lại của AC-2. Không có nó thì một `row('editor')` trượt (trả một
    // phần tử luôn `hidden`, hoặc luôn không) cũng làm vế "có `hidden`" xanh
    // một cách rỗng tuếch.
    mount({ activeTab: EDITOR_TAB });
    expect(row('editor').hidden).toBe(false);

    cleanup();
    mount({ activeTab: TERMINAL_TAB });
    expect(row('editor').hidden).toBe(true);
  });
});

// ── AC-3 · không tổ tiên nào của hàng terminal bị ẩn, và node luôn còn sống ──

describe('AC-3 — không TỔ TIÊN nào của hàng terminal bị ẩn, và node luôn còn sống', () => {
  /**
   * ⚠ Ô này ĐÃ ĐỔI NGHĨA ở SỬA ĐỔI 3, và chỗ đổi là chỗ phải đọc kỹ.
   *
   * Bản trước khẳng định hàng terminal KHÔNG BAO GIỜ mang `hidden`. Điều đó
   * không còn đúng và không còn nên đúng: chỉ đạo 2026-09-13 là tab IDE chỉ có
   * IDE, nên ở tab Editor hàng 2 phải ẩn.
   *
   * Thứ CÒN NGUYÊN là bất biến thật, và nó là hai vế khác nhau:
   *
   * 1. Không TỔ TIÊN nào của hàng terminal được mang `hidden`. Một `hidden` đặt
   *    nhầm lên ngăn xếp dọc (thay vì lên đúng một hàng) sẽ ẩn terminal ở CẢ
   *    HAI tab, và triệu chứng là terminal biến mất không lỗi không log.
   * 2. Node terminal luôn `isConnected` — ẩn là thôi được vẽ, không phải bị gỡ
   *    khỏi cây. Đây là vế phân biệt `hidden` (an toàn) với unmount (đóng
   *    WebSocket của người học).
   *
   * Vế "tổ tiên" là vế mà `workspace-panel.test.tsx` không nói được: markup
   * tĩnh cho biết thẻ nào mang `hidden`, nhưng "thẻ đó có phải tổ tiên của hàng
   * terminal không" là một câu hỏi về cây, không phải về chuỗi.
   */
  function hiddenAncestors(el: HTMLElement): readonly string[] {
    const out: string[] = [];
    for (let node = el.parentElement; node !== null; node = node.parentElement) {
      if (node.hidden) {
        out.push(`${node.tagName.toLowerCase()}#${node.id}`);
      }
    }
    return out;
  }

  for (const hasEditor of [true, false]) {
    for (const activeTab of [EDITOR_TAB, TERMINAL_TAB] as const) {
      it(`hasEditor=${String(hasEditor)} · tab ${activeTab} — node terminal sống, không tổ tiên nào ẩn`, () => {
        mount({ ...(hasEditor ? {} : { editor: undefined }), activeTab });

        const terminalRow = row('terminal');
        // Chính hàng 2: ẩn ĐÚNG KHI editor đang chiếm khoang, không lúc nào khác.
        expect(terminalRow.hidden).toBe(hasEditor && activeTab === EDITOR_TAB);
        // Tổ tiên: không bao giờ.
        expect(hiddenAncestors(terminalRow)).toEqual([]);
        // Ẩn ≠ gỡ. Đây là vế giữ WebSocket sống.
        expect(screen.getByTestId(TERMINAL_NODE).isConnected).toBe(true);
      });
    }
  }

  it('đối chứng dương: cùng phép dò báo ĐÚNG rằng hàng 1 bị ẩn ở tab Terminal', () => {
    // Chứng minh `.hidden` thật sự đọc được DOM. Không có ô này thì một phép dò
    // luôn trả `false` cũng làm bốn ô trên xanh.
    mount({ activeTab: TERMINAL_TAB });
    expect(row('editor').hidden).toBe(true);
    expect(hiddenAncestors(screen.getByTestId(EDITOR_NODE))).toEqual([
      `div#${row('editor').id}`,
    ]);
  });

  it('đối chứng dương chiều ngược: hàng 2 bị ẩn ở tab Editor', () => {
    // Nửa DƯƠNG của vế mới. Nếu bản cài đặt quên `hidden={editorVisible}` thì
    // ô này ĐỎ — nếu không có nó, bốn ô trên vẫn xanh với một hàng 2 không bao
    // giờ ẩn, tức đúng cái hồi quy mà SỬA ĐỔI 3 sinh ra để chặn.
    mount({ activeTab: EDITOR_TAB });
    expect(row('terminal').hidden).toBe(true);
    expect(hiddenAncestors(screen.getByTestId(TERMINAL_NODE))).toEqual([
      `div#${row('terminal').id}`,
    ]);
  });
});

