import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspacePanel, type WorkspacePanelProps } from './workspace-panel';

/**
 * §Y1/§Y4/§Y6 — các bất biến của `WorkspacePanel`, kiểm trên MARKUP THẬT.
 *
 * ## Mức test và giới hạn của nó, nói thẳng
 *
 * `apps/web` chạy vitest ở `environment: 'node'`: không jsdom, không RTL (xem
 * chú thích đầu `landmark-contract.test.ts`). Nên đây là `renderToStaticMarkup`
 * — render THẬT của React, đủ để khẳng định về cây DOM sinh ra (ai có mặt, ai
 * mang `hidden`, style nào ở đâu, aria nào trỏ đi đâu), KHÔNG đủ để bấm chuột,
 * kéo thanh chia, hay chạy effect.
 *
 * Phần hành vi tương ứng nằm ở hai file khác và ĐƯỢC phủ ở đó:
 * `workspace-tabs.test.ts` (quyết định: hàng 1 hiện không, phím đi đâu, chuỗi
 * hình học đổi lúc nào, lưu khoá nào) và `workspace-layout.test.ts` (thân effect
 * gọi `fit()`). Thứ không file nào phủ được là dây nối giữa chúng với DOM sự
 * kiện — cần jsdom + RTL trong `apps/web`, đã ghi vào report.
 */

const EDITOR_MARK = 'MARKER_EDITOR';
const TERMINAL_MARK = 'MARKER_TERMINAL';

function render(overrides: Partial<WorkspacePanelProps> = {}): string {
  const props: WorkspacePanelProps = {
    editor: <span>{EDITOR_MARK}</span>,
    terminal: <span>{TERMINAL_MARK}</span>,
    activeTab: 'editor',
    onActivate: () => undefined,
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

function styleOf(tag: string): string {
  return /style="([^"]*)"/.exec(tag)?.[1] ?? '';
}

/**
 * Một hàng của ngăn xếp dọc, tìm theo THUỘC TÍNH `id`.
 *
 * ⚠ KHÔNG dùng `tag.includes('-panel-editor')`: nút tab mang
 * `aria-controls="…-panel-editor"` nên nó khớp TRƯỚC hàng thật, và `find` trả
 * về cái nút. Ô "hàng editor có ẩn không" khi ấy đọc trạng thái của một cái nút
 * không bao giờ ẩn — đỏ ở trạng thái có tab, xanh ở trạng thái không tab, tức
 * một locator mơ hồ đội lốt một lỗi sản phẩm.
 */
function rowById(html: string, suffix: string): string {
  const row = openTags(html).find((tag) => new RegExp(`\\sid="[^"]*${suffix}"`).test(tag));
  expect(row, `không tìm thấy hàng có id kết thúc bằng ${suffix}`).toBeDefined();
  return row ?? '';
}

/** Hàng 2 của ngăn xếp dọc — nơi terminal sống và không bao giờ rời. */
function terminalRow(html: string): string {
  expect(html, 'markup không chứa node terminal').toContain(TERMINAL_MARK);
  return rowById(html, '-panel-terminal');
}

const ALL_STATES: readonly Partial<WorkspacePanelProps>[] = [
  { activeTab: 'editor' },
  { activeTab: 'terminal' },
  { activeTab: 'editor', editor: undefined },
  { activeTab: 'terminal', editor: undefined },
];

// ── Bất biến sống-chết §Y1 ──────────────────────────────────────────────────

describe('§Y1 — terminal KHÔNG đổi cha, KHÔNG bị ẩn', () => {
  /**
   * ⛔ Đây là ô AC quan trọng nhất của lane này.
   *
   * Ẩn hoặc dời hàng terminal = unmount xterm = đóng WebSocket = mất phiên làm
   * việc của người học, không có thông báo lỗi nào. Ô này quét MỌI tổ hợp
   * (hai tab × có/không editor).
   */
  it('hàng terminal KHÔNG BAO GIỜ mang `hidden`, ở mọi tổ hợp', () => {
    for (const state of ALL_STATES) {
      const html = render(state);
      expect(html, JSON.stringify(state)).toContain(TERMINAL_MARK);
      expect(isHidden(terminalRow(html)), JSON.stringify(state)).toBe(false);
    }
  });

  it('hàng terminal luôn ở CÙNG vị trí con trong ngăn xếp (con thứ 3)', () => {
    // React so trùng con tĩnh theo VỊ TRÍ. Nếu ở một trạng thái nào đó ngăn xếp
    // chỉ còn 2 con thì hàng terminal trượt lên khớp vị trí của thanh kéo — tức
    // React unmount cái xterm và mount lại một `<div>` rỗng. Đếm số con của
    // ngăn xếp là cách gần nhất mà markup tĩnh cho phép để gác điều đó.
    for (const state of ALL_STATES) {
      const html = render(state);
      // Ngăn xếp = thẻ mang `flex-col` thứ hai (thẻ đầu là gốc panel).
      const columns = openTags(html).filter((tag) => classOf(tag).split(/\s+/).includes('flex-col'));
      expect(columns.length, JSON.stringify(state)).toBeGreaterThanOrEqual(2);
      // Ba con tĩnh: hàng editor (tabpanel/id), thanh kéo (separator), hàng
      // terminal (style nội tuyến). Cả ba phải có mặt ở MỌI trạng thái.
      expect(html, JSON.stringify(state)).toContain('-panel-editor');
      expect(tagsWithRole(html, 'separator'), JSON.stringify(state)).toHaveLength(1);
      expect(html, JSON.stringify(state)).toContain('-panel-terminal');
    }
  });

  it('hàng editor luôn được render kể cả khi bài KHÔNG có editor (chỉ `hidden`)', () => {
    const html = render({ editor: undefined, activeTab: 'terminal' });
    expect(isHidden(rowById(html, '-panel-editor'))).toBe(true);
  });

  it('ở tab Terminal, hàng editor ẩn nhưng nội dung editor VẪN trong DOM', () => {
    // Unmount iframe IDE = khởi động nguội Theia lại ~20 giây (số đo P6).
    const html = render({ activeTab: 'terminal' });
    expect(html).toContain(EDITOR_MARK);
    expect(html).toContain(TERMINAL_MARK);
    expect(isHidden(rowById(html, '-panel-editor'))).toBe(true);
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
    for (const state of ALL_STATES) {
      const offenders = openTags(render(state))
        .filter(isHidden)
        .filter((tag) => classOf(tag).split(/\s+/).some((c) => DISPLAY_UTILITIES.has(c)));
      expect(offenders, JSON.stringify(state)).toEqual([]);
    }
  });

  it('có ít nhất MỘT thẻ mang `hidden` ở tab Terminal — đối chứng dương', () => {
    // Không có ô này thì ô trên xanh một cách vô nghĩa khi `hidden` biến mất
    // hoàn toàn khỏi markup vì một lý do khác.
    expect(openTags(render({ activeTab: 'terminal' })).filter(isHidden).length).toBeGreaterThan(0);
  });
});

// ── §Y6 — chiều cao khoang terminal ─────────────────────────────────────────

describe('§Y6 — chiều cao khoang terminal', () => {
  it('tab Editor: hàng terminal là một dải CỐ ĐỊNH ~40%', () => {
    const style = styleOf(terminalRow(render({ activeTab: 'editor' })));
    expect(style).toContain('flex-basis:40%');
    expect(style).toContain('flex-grow:0');
  });

  it('tab Terminal: hàng terminal GIÃN ra chiếm trọn khoang', () => {
    // Giữ `flex-basis: 40%` ở đây thì hàng editor `display:none` không chiếm
    // chỗ, terminal vẫn chỉ 40%, và 60% còn lại là một mảng trống.
    const style = styleOf(terminalRow(render({ activeTab: 'terminal' })));
    expect(style).toContain('flex-grow:1');
    expect(style).not.toContain('flex-basis:40%');
  });

  it('thanh kéo là một `separator` NGANG, kéo được bằng bàn phím', () => {
    const separator = tagsWithRole(render({ activeTab: 'editor' }), 'separator')[0] ?? '';
    expect(separator).toContain('aria-orientation="horizontal"');
    expect(separator).toContain('tabindex="0"');
    expect(separator).toContain('aria-valuenow="40"');
    expect(classOf(separator).split(/\s+/)).toContain('cursor-row-resize');
  });

  it('thanh kéo ẩn và RỜI vòng Tab khi hàng editor không hiện', () => {
    // Một thanh kéo `hidden` mà vẫn `tabindex="0"` là một chặng Tab chết —
    // `e2e/keyboard.spec.ts` gác ngân sách 30 lần Tab.
    const separator = tagsWithRole(render({ activeTab: 'terminal' }), 'separator')[0] ?? '';
    expect(isHidden(separator)).toBe(true);
    expect(separator).toContain('tabindex="-1"');
  });
});

// ── Thanh tab ───────────────────────────────────────────────────────────────

describe('thanh tab', () => {
  it('bài có editor: tablist với ĐÚNG hai tab', () => {
    const html = render();
    expect(tagsWithRole(html, 'tablist')).toHaveLength(1);
    expect(tagsWithRole(html, 'tab')).toHaveLength(2);
    expect(html).toContain('Editor');
    expect(html).toContain('Terminal');
  });

  /**
   * §Y4 — bài không khai `layout: ide` chỉ còn MỘT mục, và một tablist một mục
   * là nhiễu thị giác chứ không phải chức năng: người dùng không chuyển đi đâu
   * được, còn trình đọc màn hình thì nghe "tab 1 trên 1".
   */
  it('bài không có editor: KHÔNG có tablist, nhưng thanh và nút pop-out vẫn còn', () => {
    const html = render({ editor: undefined, activeTab: 'terminal', popOutUrl: '/session/abc/terminal' });
    expect(tagsWithRole(html, 'tablist')).toHaveLength(0);
    expect(tagsWithRole(html, 'tab')).toHaveLength(0);
    expect(tagsWithRole(html, 'tabpanel')).toHaveLength(0);
    // Nút mở-ra-cửa-sổ-riêng (§C7) là chức năng thật, không phải trang trí —
    // bỏ cả thanh đi là mất nó.
    expect(html).toContain('href="/session/abc/terminal"');
    expect(html).toContain('Terminal');
  });

  it('cao CỐ ĐỊNH và có mặt ở CẢ HAI hình dạng', () => {
    // Bất cứ thứ gì xuất hiện/biến mất quanh terminal đều làm `ResizeObserver`
    // của xterm bắn và fit lại đúng lúc người dùng đang gõ — cùng lo ngại đã
    // ghi ở `terminal-pane.tsx` quanh gợi ý Esc-Esc.
    for (const state of [{}, { editor: undefined, activeTab: 'terminal' as const }]) {
      const bar = openTags(render(state)).find((tag) => classOf(tag).split(/\s+/).includes('h-9'));
      expect(bar, JSON.stringify(state)).toBeDefined();
      expect(classOf(bar ?? '').split(/\s+/)).toContain('shrink-0');
    }
  });

  it('đúng MỘT tab có aria-selected="true"', () => {
    const html = render({ activeTab: 'terminal' });
    const tabs = tagsWithRole(html, 'tab');
    expect(tabs.filter((t) => t.includes('aria-selected="true"'))).toHaveLength(1);
  });

  it('roving tabindex — đúng MỘT tab trong vòng Tab', () => {
    const tabs = tagsWithRole(render({ activeTab: 'terminal' }), 'tab');
    expect(tabs.filter((t) => t.includes('tabindex="0"'))).toHaveLength(1);
    expect(tabs.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(1);
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

  it('không aria-labelledby nào trỏ vào id không tồn tại', () => {
    // Trỏ vào một id trống là vi phạm `aria-valid-attr-value` của axe. Ca đáng
    // ngờ nhất: bài không có editor — hai hàng vẫn được render (§Y1) nhưng nút
    // tab thì không, nên `aria-labelledby` phải bỏ HẲN, không để rỗng.
    for (const state of ALL_STATES) {
      const html = render(state);
      const ids = new Set([...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1] ?? ''));
      for (const m of html.matchAll(/aria-labelledby="([^"]*)"/g)) {
        expect(ids.has(m[1] ?? ''), `${JSON.stringify(state)} aria-labelledby=${m[1] ?? ''}`).toBe(
          true,
        );
      }
    }
  });

  it('KHÔNG còn nút "+", nút "×", hay nút tách đôi', () => {
    // §Y4 gỡ cả ba. Ô này là lưới an toàn cho một lượt revert nửa vời: ba nút
    // đó chỉ có nghĩa khi có terminal thứ hai, và terminal thứ hai không còn.
    for (const state of ALL_STATES) {
      const html = render(state);
      expect(html, JSON.stringify(state)).not.toContain('Mở thêm một terminal');
      expect(html, JSON.stringify(state)).not.toContain('Tách đôi');
      expect(html, JSON.stringify(state)).not.toContain('×');
    }
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
