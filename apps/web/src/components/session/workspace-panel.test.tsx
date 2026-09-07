/*
 * ⚠ Pragma trên là BẮT BUỘC để `pnpm --filter web test` chạy được file này, và
 * nó KHÔNG thừa dù Next đã dùng runtime tự động.
 *
 * `apps/web/tsconfig.json` khai `"jsx": "preserve"` (Next tự dịch JSX bằng SWC
 * của nó). vitest thì dịch bằng esbuild, và esbuild đọc đúng khoá đó: thấy
 * `preserve` nó rơi về runtime CỔ ĐIỂN, tức sinh ra `React.createElement` trong
 * một file không import `React`. Triệu chứng là `ReferenceError: React is not
 * defined` ném lúc RENDER — không phải lúc biên dịch, nên `typecheck` xanh còn
 * test đỏ ở mọi ô có render.
 *
 * Sửa đúng ở tầng cấu hình là `esbuild: { jsx: 'automatic' }` trong
 * `apps/web/vitest.config.ts`, nhưng file đó không thuộc đường sở hữu của lane
 * này (đã ghi vào report). Pragma theo từng file là cách vá không đụng file của
 * lane khác. Bỏ nó ra khi vitest.config đã khai — lúc đó nó thành thừa thật.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspacePanel, type WorkspacePanelProps } from './workspace-panel';
import type { WorkspaceTabId } from './workspace-tabs';

/**
 * C5 — các bất biến của `WorkspacePanel`, kiểm trên MARKUP THẬT.
 *
 * ## Mức test và giới hạn của nó, nói thẳng
 *
 * `apps/web` chạy vitest ở `environment: 'node'`: không jsdom, không RTL (xem
 * chú thích đầu `landmark-contract.test.ts`). Nên đây là `renderToStaticMarkup`
 * — render THẬT của React, đủ để khẳng định về cây DOM sinh ra (ai có mặt, ai
 * mang `hidden`, aria nào ở đâu), KHÔNG đủ để bấm chuột hay chạy effect.
 *
 * Phần hành vi tương ứng nằm ở hai file khác và ĐƯỢC phủ ở đó:
 * `workspace-tabs.test.ts` (quyết định: hiện gì, phím đi đâu, lưu khoá nào) và
 * `workspace-visibility.test.ts` (thân effect gọi `fit()`). Thứ không file nào
 * phủ được là dây nối giữa chúng với DOM sự kiện — cần jsdom + RTL trong
 * `apps/web`, đã ghi vào report.
 */

const EDITOR_MARK = 'MARKER_EDITOR';
const T1_MARK = 'MARKER_TERMINAL_1';
const T2_MARK = 'MARKER_TERMINAL_2';

function terminalsWithBoth(): ReadonlyMap<WorkspaceTabId, React.ReactNode> {
  return new Map<WorkspaceTabId, React.ReactNode>([
    ['terminal-1', <span key="1">{T1_MARK}</span>],
    ['terminal-2', <span key="2">{T2_MARK}</span>],
  ]);
}

function render(overrides: Partial<WorkspacePanelProps> = {}): string {
  const props: WorkspacePanelProps = {
    editor: <span>{EDITOR_MARK}</span>,
    terminals: terminalsWithBoth(),
    activeTab: 'editor',
    onActivate: () => undefined,
    onToggleSplit: () => undefined,
    split: false,
    popOutUrl: null,
    ...overrides,
  };
  return renderToStaticMarkup(<WorkspacePanel {...props} />);
}

/** Mọi thẻ MỞ trong markup, dạng chuỗi thô (`<div role="tabpanel" …>`). */
function openTags(html: string): readonly string[] {
  return [...html.matchAll(/<[a-z]+\b[^>]*>/g)].map((m) => m[0]);
}

function tagsWithRole(html: string, role: string): readonly string[] {
  return openTags(html).filter((tag) => tag.includes(`role="${role}"`));
}

/**
 * ⚠ Phải khớp thuộc tính `hidden` THẬT, không khớp chuỗi con.
 *
 * Bản đầu dùng `/\bhidden\b/` và đỏ ba ô: `\b` khớp cả giữa `-` và `h`, nên
 * `class="… overflow-hidden"` bị đọc thành "thẻ này đang ẩn". React DOM render
 * `hidden={true}` thành đúng `hidden=""`, nên đó là thứ duy nhất cần tìm.
 */
function isHidden(tag: string): boolean {
  return /\shidden=""/.test(tag);
}

function classOf(tag: string): string {
  return /class="([^"]*)"/.exec(tag)?.[1] ?? '';
}

// ── Bất biến sống-chết: KHÔNG unmount ───────────────────────────────────────

describe('mọi tab giữ MOUNTED, ẩn bằng `hidden`', () => {
  /**
   * ⛔ Đây là ô AC quan trọng nhất của Lane E.
   *
   * Unmount vùng terminal = đóng WebSocket = mất phiên làm việc của người học.
   * Unmount iframe IDE = khởi động nguội Theia lại ~20 giây (P6). Cả hai đều
   * KHÔNG có thông báo lỗi nào — người dùng chỉ thấy công việc biến mất.
   */
  it('đang ở tab Editor: nội dung của CẢ HAI terminal vẫn nằm trong DOM', () => {
    const html = render({ activeTab: 'editor' });
    expect(html).toContain(EDITOR_MARK);
    expect(html).toContain(T1_MARK);
    expect(html).toContain(T2_MARK);
  });

  it('đang ở tab Terminal 1: nội dung Editor vẫn nằm trong DOM', () => {
    const html = render({ activeTab: 'terminal-1' });
    expect(html).toContain(EDITOR_MARK);
    expect(html).toContain(T1_MARK);
  });

  it('đang ở tab Terminal 2: node của terminal-1 KHÔNG bị ẩn (§C6 — dùng chung một xterm)', () => {
    // Cả phiên chỉ có một WebSocket. Bấm "Terminal 2" gửi `\x02 2` vào chính
    // cái PTY đang mở, nên nội dung window 2 hiện ra TRONG cái xterm đó — ẩn nó
    // đi là ẩn đúng thứ vừa được yêu cầu hiện.
    const html = render({ activeTab: 'terminal-2' });
    const panels = tagsWithRole(html, 'tabpanel');
    expect(panels).toHaveLength(2);
    expect(isHidden(panels[0] ?? '')).toBe(true); // editor
    expect(isHidden(panels[1] ?? '')).toBe(false); // terminal (dùng chung)
    expect(html).toContain(T1_MARK);
  });

  it('tab terminal chỉ khai KHOÁ (giá trị null) vẫn có nút trên thanh tab', () => {
    // Đây là hình dạng Lane F dùng: một `TerminalPane` thật ở `terminal-1`,
    // `null` ở `terminal-2`.
    const html = render({
      activeTab: 'terminal-2',
      terminals: new Map<WorkspaceTabId, React.ReactNode>([
        ['terminal-1', <span key="1">{T1_MARK}</span>],
        ['terminal-2', null],
      ]),
    });
    expect(tagsWithRole(html, 'tab')).toHaveLength(3);
    expect(html).toContain('Terminal 2');
    expect(html).toContain(T1_MARK);
  });

  it('vùng editor luôn được render kể cả khi bài KHÔNG có editor', () => {
    // React so trùng con tĩnh theo VỊ TRÍ. Bỏ hẳn vùng editor sẽ đẩy vùng
    // terminal lên khớp với gạch phân cách ⇒ unmount xterm ⇒ đóng WebSocket.
    const html = render({ editor: undefined, activeTab: 'terminal-1' });
    expect(tagsWithRole(html, 'tabpanel')).toHaveLength(2);
    expect(tagsWithRole(html, 'tab')).toHaveLength(2); // chỉ 2 tab terminal
  });
});

describe('bẫy CSS: phần tử mang `hidden` không được mang tiện ích display', () => {
  /**
   * `[hidden]{display:none}` đến từ stylesheet của TRÌNH DUYỆT; `.flex{display:flex}`
   * đến từ stylesheet của TÁC GIẢ. Cùng độ đặc hiệu thì tác giả thắng, nên một
   * `<div hidden class="flex">` VẪN HIỆN — và thuộc tính `hidden` thành ra vô
   * nghĩa mà không có gì báo. Test này là thứ duy nhất trong repo nói ra.
   */
  const DISPLAY_UTILITIES = new Set([
    'flex',
    'grid',
    'block',
    'inline',
    'inline-flex',
    'inline-block',
    'inline-grid',
    'table',
    'contents',
    'flow-root',
    'list-item',
  ]);

  it('không thẻ nào vừa có `hidden` vừa có class display', () => {
    for (const activeTab of ['editor', 'terminal-1', 'terminal-2'] as const) {
      for (const split of [false, true]) {
        const html = render({ activeTab, split });
        const offenders = openTags(html)
          .filter(isHidden)
          .filter((tag) => classOf(tag).split(/\s+/).some((c) => DISPLAY_UTILITIES.has(c)));
        expect(offenders, `activeTab=${activeTab} split=${String(split)}`).toEqual([]);
      }
    }
  });

  it('có ít nhất MỘT thẻ mang `hidden` ở trạng thái không tách — đối chứng dương', () => {
    // Không có ô này thì ô trên xanh một cách vô nghĩa khi `hidden` biến mất
    // hoàn toàn khỏi markup vì một lý do khác.
    expect(openTags(render({ activeTab: 'editor', split: false })).filter(isHidden).length)
      .toBeGreaterThan(0);
  });
});

// ── Thanh tab ───────────────────────────────────────────────────────────────

describe('thanh tab', () => {
  it('có role tablist và đúng một tab cho mỗi khoang', () => {
    const html = render();
    expect(tagsWithRole(html, 'tablist')).toHaveLength(1);
    expect(tagsWithRole(html, 'tab')).toHaveLength(3);
    expect(html).toContain('Editor');
    expect(html).toContain('Terminal 1');
    expect(html).toContain('Terminal 2');
  });

  it('cao CỐ ĐỊNH và có mặt kể cả khi chỉ có một tab', () => {
    // Bất cứ thứ gì xuất hiện/biến mất quanh terminal đều làm `ResizeObserver`
    // của xterm bắn và fit lại đúng lúc người dùng đang gõ — cùng lo ngại đã
    // ghi ở `terminal-pane.tsx` quanh gợi ý Esc-Esc.
    const html = render({
      editor: undefined,
      activeTab: 'terminal-1',
      terminals: new Map<WorkspaceTabId, React.ReactNode>([['terminal-1', <span key="1">{T1_MARK}</span>]]),
    });
    const bar = openTags(html).find((tag) => classOf(tag).split(/\s+/).includes('h-9'));
    expect(bar).toBeDefined();
    expect(classOf(bar ?? '').split(/\s+/)).toContain('shrink-0');
  });

  it('đúng MỘT tab có aria-selected="true"', () => {
    const html = render({ activeTab: 'terminal-1' });
    const tabs = tagsWithRole(html, 'tab');
    expect(tabs.filter((t) => t.includes('aria-selected="true"'))).toHaveLength(1);
  });

  it('roving tabindex — đúng MỘT tab trong vòng Tab', () => {
    // Khuôn ARIA APG. Không có nó thì thanh 3 tab ngốn 3 lần Tab của ngân sách
    // 30 lần mà `e2e/keyboard.spec.ts` gác.
    const tabs = tagsWithRole(render({ activeTab: 'terminal-2' }), 'tab');
    expect(tabs.filter((t) => t.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(2);
  });

  it('mỗi tab trỏ aria-controls tới một id tabpanel CÓ THẬT', () => {
    const html = render();
    const panelIds = new Set(
      tagsWithRole(html, 'tabpanel').map((tag) => /id="([^"]*)"/.exec(tag)?.[1] ?? ''),
    );
    for (const tab of tagsWithRole(html, 'tab')) {
      const controls = /aria-controls="([^"]*)"/.exec(tab)?.[1] ?? '';
      expect(panelIds.has(controls), `aria-controls=${controls}`).toBe(true);
    }
  });

  it('không aria-labelledby nào trỏ vào id không tồn tại (bài không có Editor)', () => {
    // Vùng editor vẫn được render khi bài không có editor (xem test ở trên),
    // nhưng nút tab của nó thì không — nên `aria-labelledby` phải bỏ hẳn.
    // Trỏ vào id trống là vi phạm `aria-valid-attr-value` của axe.
    const html = render({ editor: undefined, activeTab: 'terminal-1' });
    const ids = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? ''));
    for (const m of html.matchAll(/aria-labelledby="([^"]*)"/g)) {
      expect(ids.has(m[1] ?? ''), `aria-labelledby=${m[1] ?? ''}`).toBe(true);
    }
  });

  it('chỉ Terminal 2 có nút đóng, và chỉ khi cha truyền onCloseTerminal', () => {
    const withClose = tagsWithRole(
      renderToStaticMarkup(
        <WorkspacePanel
          editor={<span>{EDITOR_MARK}</span>}
          terminals={terminalsWithBoth()}
          activeTab="terminal-2"
          onActivate={() => undefined}
          onCloseTerminal={() => undefined}
          onToggleSplit={() => undefined}
          split={false}
          popOutUrl={null}
        />,
      ),
      'tab',
    );
    expect(withClose).toHaveLength(3);
    // `×` chỉ nằm trong tab Terminal 2. Terminal 1 là window đầu của tmux —
    // đóng nó là kết thúc phiên shell, không phải đóng một tab giao diện.
    const html = renderToStaticMarkup(
      <WorkspacePanel
        editor={<span>{EDITOR_MARK}</span>}
        terminals={terminalsWithBoth()}
        activeTab="terminal-2"
        onActivate={() => undefined}
        onCloseTerminal={() => undefined}
        onToggleSplit={() => undefined}
        split={false}
        popOutUrl={null}
      />,
    );
    expect((html.match(/×/g) ?? []).length).toBe(1);
    expect(html).toContain('nhấn Delete để đóng');

    // Không truyền onCloseTerminal ⇒ không có nút đóng nào.
    expect(render({ activeTab: 'terminal-2' })).not.toContain('×');
  });
});

// ── Nút tách ────────────────────────────────────────────────────────────────

describe('nút tách đôi', () => {
  it('bấm được khi có cả Editor lẫn terminal', () => {
    const html = render();
    expect(html).toContain('aria-disabled="false"');
    expect(html).toContain('Tách đôi: Editor cạnh terminal đang hoạt');
  });

  it('vô hiệu KÈM LÝ DO trong title khi bài không có Editor', () => {
    const html = render({ editor: undefined, activeTab: 'terminal-1' });
    const splitButton = openTags(html).find((tag) => tag.includes('aria-disabled="true"'));
    expect(splitButton).toBeDefined();
    const title = /title="([^"]*)"/.exec(splitButton ?? '')?.[1] ?? '';
    expect(title).toContain('Editor');
    expect(title).toContain('một kết nối');
  });

  it('lý do cũng đến được trình đọc màn hình, không chỉ nằm trong title', () => {
    // `title` của một nút không phải lúc nào cũng được đọc; `aria-describedby`
    // thì có. Và nút dùng `aria-disabled` (không phải thuộc tính `disabled`)
    // đúng để nó còn vào được vòng Tab mà nghe câu lý do đó.
    const html = render({ editor: undefined, activeTab: 'terminal-1' });
    const described = /aria-describedby="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(described).not.toBe('');
    expect(html).toContain(`id="${described}"`);
  });

  it('split=true ở bài không có Editor KHÔNG mở được hai vùng', () => {
    const html = render({ editor: undefined, activeTab: 'terminal-1', split: true });
    const panels = tagsWithRole(html, 'tabpanel');
    expect(isHidden(panels[0] ?? '')).toBe(true); // vùng editor rỗng, vẫn ẩn
    expect(isHidden(panels[1] ?? '')).toBe(false);
  });

  it('split=true ở bài có Editor ⇒ cả hai vùng cùng hiện', () => {
    const panels = tagsWithRole(render({ activeTab: 'terminal-1', split: true }), 'tabpanel');
    expect(isHidden(panels[0] ?? '')).toBe(false);
    expect(isHidden(panels[1] ?? '')).toBe(false);
  });
});

describe('nút mở ra cửa sổ riêng', () => {
  it('ẩn khi popOutUrl là null', () => {
    expect(render({ popOutUrl: null })).not.toContain('Mở tab này ra cửa sổ riêng');
  });

  it('hiện với rel an toàn khi có URL', () => {
    const html = render({ popOutUrl: '/session/abc/terminal' });
    expect(html).toContain('href="/session/abc/terminal"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
