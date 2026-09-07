// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspacePanel, type WorkspacePanelProps } from './workspace-panel';
import {
  EDITOR_TAB,
  TERMINAL_PERCENT_DEFAULT,
  TERMINAL_PERCENT_MAX,
  TERMINAL_PERCENT_MIN,
  TERMINAL_PERCENT_STEP,
  TERMINAL_TAB,
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
}: {
  readonly initialTab?: WorkspaceTabId;
  readonly hasEditor?: boolean;
}): ReactElement {
  const [tab, setTab] = useState<WorkspaceTabId>(initialTab);
  return (
    <WorkspacePanel
      {...(hasEditor ? { editor: <span data-testid={EDITOR_NODE}>EDITOR</span> } : {})}
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

/**
 * Thanh kéo, lấy qua DOM chứ KHÔNG qua `getByRole`.
 *
 * `getByRole` đọc cây trợ năng, mà ở tab Terminal thanh này mang `hidden` nên nó
 * đã RỜI khỏi cây đó (một khẳng định riêng ở cuối file). Ở đây ta cần chính cái
 * phần tử DOM để bắn sự kiện lên nó ở cả hai trạng thái.
 */
function separator(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[role="separator"]');
  expect(el, 'không tìm thấy thanh kéo').not.toBeNull();
  return el as HTMLElement;
}

function tab(name: 'Editor' | 'Terminal'): HTMLElement {
  return screen.getByRole('tab', { name });
}

function percentNow(): string | null {
  return separator().getAttribute('aria-valuenow');
}

function savedState(key: string = IDE_KEY): { activeTab: string; terminalPercent: number } | null {
  const raw = localStorage.getItem(key);
  return raw === null ? null : (JSON.parse(raw) as { activeTab: string; terminalPercent: number });
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

  it('chuyển tab đổi hình học hàng terminal (§Y6): dải 40% ⇄ chiếm trọn khoang', async () => {
    render(<ControlledPanel />);
    expect(row('terminal').style.flexBasis).toBe(`${String(TERMINAL_PERCENT_DEFAULT)}%`);
    expect(row('terminal').style.flexGrow).toBe('0');

    await userEvent.click(tab('Terminal'));

    // Giữ nguyên 40% ở đây thì hàng editor `display:none` không chiếm chỗ mà
    // terminal vẫn chỉ 40% — 60% còn lại là một mảng trống.
    expect(row('terminal').style.flexGrow).toBe('1');
    expect(row('terminal').style.flexBasis).toBe('auto');
  });

  it('thanh kéo rời/vào vòng Tab và cây trợ năng theo tab', async () => {
    render(<ControlledPanel />);
    expect(screen.getByRole('separator')).toBe(separator());
    expect(separator().getAttribute('tabindex')).toBe('0');

    await userEvent.click(tab('Terminal'));

    // `hidden` ⇒ ra khỏi cây trợ năng. `queryByRole` là thứ duy nhất trong repo
    // nói được điều này: markup tĩnh không tính được cây trợ năng.
    expect(screen.queryByRole('separator')).toBeNull();
    expect(separator().hidden).toBe(true);
    expect(separator().getAttribute('tabindex')).toBe('-1');
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

// ── §Y6 — bàn phím trên thanh kéo ───────────────────────────────────────────

describe('§Y6 — bàn phím trên thanh kéo đổi chiều cao THẬT', () => {
  /*
    `nextTerminalPercentOnKey` (hàm thuần) đã được phủ. Thứ đo ở đây là hai sợi
    dây khác: phím → state, và state → CẢ `aria-valuenow` LẪN `flex-basis`. Hai
    thứ sau phải luôn khớp nhau — một bản đọc lệch nguồn (ví dụ `aria-valuenow`
    lấy từ state còn style lấy từ một biến cũ) là một thanh kéo nói dối với
    trình đọc màn hình.
  */
  it('ArrowUp làm terminal CAO THÊM; aria-valuenow và flex-basis đi cùng nhau', () => {
    mount({ activeTab: EDITOR_TAB });
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_DEFAULT));
    expect(row('terminal').style.flexBasis).toBe(`${String(TERMINAL_PERCENT_DEFAULT)}%`);

    fireEvent.keyDown(separator(), { key: 'ArrowUp' });

    const raised = TERMINAL_PERCENT_DEFAULT + TERMINAL_PERCENT_STEP;
    expect(percentNow()).toBe(String(raised));
    expect(row('terminal').style.flexBasis).toBe(`${String(raised)}%`);
  });

  it('ArrowDown làm terminal THẤP đi', () => {
    mount({ activeTab: EDITOR_TAB });
    fireEvent.keyDown(separator(), { key: 'ArrowDown' });
    const lowered = TERMINAL_PERCENT_DEFAULT - TERMINAL_PERCENT_STEP;
    expect(percentNow()).toBe(String(lowered));
    expect(row('terminal').style.flexBasis).toBe(`${String(lowered)}%`);
  });

  it('Home/End nhảy về hai đầu và KẸP ở đó', () => {
    mount({ activeTab: EDITOR_TAB });
    fireEvent.keyDown(separator(), { key: 'Home' });
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_MIN));
    // Nhấn thêm ở sát mép không được vượt biên.
    fireEvent.keyDown(separator(), { key: 'ArrowDown' });
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_MIN));

    fireEvent.keyDown(separator(), { key: 'End' });
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_MAX));
    fireEvent.keyDown(separator(), { key: 'ArrowUp' });
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_MAX));
  });

  it('phím trong khuôn bị preventDefault, phím ngoài khuôn thì KHÔNG', () => {
    mount({ activeTab: EDITOR_TAB });

    const inModel = createEvent.keyDown(separator(), { key: 'ArrowUp' });
    fireEvent(separator(), inModel);
    expect(inModel.defaultPrevented).toBe(true);

    // ⚠ Chốt giá trị SAU ArrowUp, không so lại với mặc định: ô này bắt đầu bằng
    // một phím CÓ tác dụng, nên "không đổi gì" nghĩa là không đổi so với 44 —
    // không phải so với 40. Bản đầu so nhầm với mặc định và đỏ, đúng lý do đó.
    const before = percentNow();

    const outside = createEvent.keyDown(separator(), { key: 'PageUp' });
    fireEvent(separator(), outside);
    expect(outside.defaultPrevented).toBe(false);
    // `PageUp` là phím cuộn của trình duyệt, không phải của ta — nuốt nó là lấy
    // mất đường cuộn trang của người dùng bàn phím.
    expect(percentNow()).toBe(before);
  });
});

// ── Kéo bằng con trỏ ────────────────────────────────────────────────────────

describe('§Y6 — kéo thanh chia bằng con trỏ', () => {
  /**
   * jsdom KHÔNG có bộ tính bố cục và KHÔNG cài pointer capture.
   *
   * Đo 2026-09-08 trên jsdom đã cài: `getBoundingClientRect()` trả toàn số 0,
   * còn `Element.prototype.setPointerCapture` là `undefined` — mà
   * `handlePointerDown` gọi thẳng nó, không bọc try/catch, nên không có hai thứ
   * dưới đây thì mọi ô trong khối này ném `TypeError` ngay ở `pointerdown`.
   *
   * Hai stub này CẤP thứ jsdom thiếu; chúng không thay thế logic nào của
   * component (phép tính phần trăm và nhịp ghi storage vẫn là mã thật chạy).
   *
   * ⚠ Giới hạn phải nói thẳng: vì `setPointerCapture` là hàm rỗng, khối này
   * KHÔNG chứng minh con trỏ thật sự bị "bắt" khi kéo nhanh ra ngoài thanh. Đó
   * là hành vi của trình duyệt thật và chỉ Playwright mới gác được.
   */
  const STACK_BOTTOM = 400;
  const STACK_HEIGHT = 400;
  const captured: number[] = [];

  beforeEach(() => {
    captured.length = 0;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: STACK_BOTTOM,
      width: 800,
      height: STACK_HEIGHT,
      toJSON: () => ({}),
    } as DOMRect);

    // `defineProperty` chứ không `vi.spyOn`: spy trên một thuộc tính KHÔNG tồn
    // tại thì vitest ném "does not exist" — nên phải tự đặt vào rồi tự gỡ ra.
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      value: (id: number) => {
        captured.push(id);
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as unknown as Record<string, unknown>)['setPointerCapture'];
    delete (Element.prototype as unknown as Record<string, unknown>)['releasePointerCapture'];
  });

  function drag(clientY: number): void {
    fireEvent.pointerDown(separator(), { pointerId: 7 });
    fireEvent.pointerMove(separator(), { pointerId: 7, clientY });
  }

  it('đo từ ĐÁY lên: kéo LÊN làm terminal cao thêm', () => {
    mount({ activeTab: EDITOR_TAB });
    drag(100);
    // (400 - 100) / 400 * 100 = 75. Một bản đo từ ĐỈNH xuống sẽ ra 25 — cùng
    // một con số hợp lệ, ngược hướng, và không hàm thuần nào bắt được vì phép
    // đảo chiều này chỉ sống trong thân component.
    expect(percentNow()).toBe('75');
    expect(row('terminal').style.flexBasis).toBe('75%');
    expect(captured).toEqual([7]);
  });

  it('kéo XUỐNG làm terminal thấp đi, và bị KẸP ở sàn', () => {
    mount({ activeTab: EDITOR_TAB });
    drag(300);
    expect(percentNow()).toBe('25');

    fireEvent.pointerMove(separator(), { pointerId: 7, clientY: 390 });
    // (400 - 390) / 400 * 100 = 2.5 ⇒ kẹp về sàn, không phải 2 hay 3.
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_MIN));
  });

  it('pointermove khi CHƯA bấm xuống không đổi gì', () => {
    mount({ activeTab: EDITOR_TAB });
    fireEvent.pointerMove(separator(), { pointerId: 7, clientY: 100 });
    expect(percentNow()).toBe(String(TERMINAL_PERCENT_DEFAULT));
  });

  it('đang kéo thì KHOÁ bôi đen chữ, thả ra thì bỏ khoá', () => {
    mount({ activeTab: EDITOR_TAB });
    const stack = row('terminal').parentElement;
    expect(stack).not.toBeNull();

    fireEvent.pointerDown(separator(), { pointerId: 7 });
    expect(stack?.className).toContain('select-none');

    fireEvent.pointerUp(separator(), { pointerId: 7 });
    expect(stack?.className).not.toContain('select-none');
  });

  it('ghi storage ĐÚNG MỘT LẦN lúc THẢ, không phải mỗi lần pointermove', () => {
    /*
      `pointermove` bắn hàng chục lần/giây; ghi ở mỗi lần là I/O đồng bộ thừa.
      Nhịp này là một quyết định nằm HẲN trong thân component — không hàm thuần
      nào mang nó, và markup tĩnh thì không có sự kiện nào để quan sát.
    */
    mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    expect(savedState()?.terminalPercent).toBe(TERMINAL_PERCENT_DEFAULT);

    drag(100);
    // Đã đổi trên màn hình…
    expect(percentNow()).toBe('75');
    // …nhưng CHƯA chốt xuống storage.
    expect(savedState()?.terminalPercent).toBe(TERMINAL_PERCENT_DEFAULT);

    fireEvent.pointerUp(separator(), { pointerId: 7 });
    expect(savedState()?.terminalPercent).toBe(75);
  });
});

// ── Ghi nhớ qua localStorage ────────────────────────────────────────────────

describe('ghi nhớ qua localStorage — hai effect chạy cùng một nhịp commit', () => {
  it('khôi phục chiều cao đã lưu vào DOM ngay lúc mount', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: EDITOR_TAB, terminalPercent: 70 }));
    mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    expect(percentNow()).toBe('70');
    expect(row('terminal').style.flexBasis).toBe('70%');
  });

  it('tab đã lưu khác tab cha đang giữ ⇒ YÊU CẦU cha đổi, đúng một lần, đúng tab', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: TERMINAL_TAB, terminalPercent: 40 }));
    const { onActivate } = mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    // Panel KHÔNG tự đổi tab (prop điều khiển, §Y4) — nó chỉ được phép yêu cầu.
    expect(onActivate.mock.calls).toEqual([[TERMINAL_TAB]]);
  });

  it('tab đã lưu TRÙNG tab cha ⇒ KHÔNG gọi onActivate thừa', () => {
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: EDITOR_TAB, terminalPercent: 40 }));
    const { onActivate } = mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('⚠ HỒI QUY: lượt ghi cùng nhịp commit KHÔNG được đè giá trị vừa khôi phục', () => {
    /*
      Lớp lỗi mà `percentRef` trong `useWorkspaceMemory` tồn tại để chặn, và là
      lý do duy nhất của cái ref đó.

      Effect khôi phục và effect ghi-khi-đổi-tab chạy trong CÙNG một lượt commit.
      Nếu effect ghi đọc `terminalPercent` từ state, nó đọc giá trị của lượt
      render vừa rồi — tức mặc định 40 — và ghi đè đúng con số vừa khôi phục.
      Triệu chứng ngoài đời: kéo lên 70%, phiên này vẫn 70%, lần vào sau về 40%.
      Không có gì báo.

      Bỏ `percentRef` đi thì ô này ĐỎ (ra 40). Đó là điều làm nó không phải một
      ô xanh trang trí.
    */
    localStorage.setItem(IDE_KEY, JSON.stringify({ activeTab: EDITOR_TAB, terminalPercent: 70 }));
    mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    expect(savedState()?.terminalPercent).toBe(70);
  });

  it('nhấn phím trên thanh kéo CHỐT ngay — không đợi một sự kiện "thả" nào', () => {
    mount({ activeTab: EDITOR_TAB, storageKey: STORAGE_BASE });
    fireEvent.keyDown(separator(), { key: 'End' });
    expect(savedState()).toEqual({
      activeTab: EDITOR_TAB,
      terminalPercent: TERMINAL_PERCENT_MAX,
    });
  });

  it('KHÔNG truyền storageKey ⇒ không đụng vào localStorage', () => {
    mount({ activeTab: EDITOR_TAB });
    fireEvent.keyDown(separator(), { key: 'End' });
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
  it('không có tab nào, nhưng terminal và thanh kéo VẪN trong DOM (§Y1)', () => {
    mount({ editor: undefined, activeTab: TERMINAL_TAB });
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByTestId(TERMINAL_NODE).isConnected).toBe(true);
    // Cả ba con tĩnh còn nguyên — chỉ ẩn, không bị gỡ.
    expect(row('editor').hidden).toBe(true);
    expect(separator().hidden).toBe(true);
    expect(row('terminal').hidden).toBe(false);
  });

  it('thanh kéo RỜI cây trợ năng và RỜI vòng Tab', () => {
    mount({ editor: undefined, activeTab: TERMINAL_TAB });
    expect(screen.queryByRole('separator')).toBeNull();
    expect(separator().getAttribute('tabindex')).toBe('-1');
  });
});
