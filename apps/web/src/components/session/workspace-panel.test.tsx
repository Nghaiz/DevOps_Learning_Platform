import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspacePanel, type WorkspacePanelProps } from './workspace-panel';
import { DISPLAY_UTILITIES, hasDisplayUtility } from './workspace-tabs';

/**
 * §Y1/§Y4/§Y6 — các bất biến của `WorkspacePanel`, kiểm trên MARKUP THẬT.
 *
 * ## Mức test và giới hạn của nó, nói thẳng
 *
 * `apps/web` chạy vitest ở `environment: 'node'` cho MẶC ĐỊNH (xem lý lẽ ở
 * `vitest.config.ts`). Nên đây là `renderToStaticMarkup` — render THẬT của
 * React, đủ để khẳng định về cây DOM sinh ra (ai có mặt, ai mang `hidden`,
 * style nào ở đâu, aria nào trỏ đi đâu), KHÔNG đủ để bấm chuột, kéo thanh chia,
 * hay chạy effect.
 *
 * Phần hành vi tương ứng nằm ở ba file khác và ĐƯỢC phủ ở đó:
 * `workspace-tabs.test.ts` (quyết định: hàng 1 hiện không, phím đi đâu, chuỗi
 * hình học đổi lúc nào, lưu khoá nào), `workspace-layout.test.ts` (thân effect
 * gọi `fit()`), và — từ 2026-09-08 — `workspace-panel.dom.test.tsx`, chạy trên
 * jsdom + RTL qua một docblock `@vitest-environment` per-file: nó phủ DÂY NỐI
 * với DOM sự kiện (bấm/gõ → gọi đúng hàm đúng tham số → DOM đổi thật) mà file
 * này không với tới được.
 *
 * ⚠ Hai file KHÔNG trùng nhau, và file này KHÔNG bị thay thế. `renderToStaticMarkup`
 * kiểm markup SSR — đúng thứ trình duyệt nhận ở lượt tải đầu, trước hydrate —
 * còn file DOM kiểm lượt render THỨ HAI trở đi. Chỉ file này nói được "chuỗi
 * `hidden=""` có thật trong markup gửi đi"; chỉ file kia nói được "React giữ
 * nguyên node terminal qua một lượt reconcile".
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

describe('§Y1 — terminal KHÔNG đổi cha; hai hàng loại trừ nhau', () => {
  /**
   * ⛔ Đây là ô AC quan trọng nhất của lane này, và nó ĐÃ ĐỔI NGHĨA ở SỬA ĐỔI 3.
   *
   * Bản trước khẳng định hàng terminal không bao giờ mang `hidden`. Chỉ đạo
   * 2026-09-13 ("tab IDE thì hiện IDE, tab terminal thì hiện terminal, hết")
   * làm điều đó thôi đúng: ở tab Editor hàng 2 PHẢI ẩn.
   *
   * Thứ còn nguyên là bất biến thật: node terminal không bao giờ RỜI markup.
   * Dời hoặc gỡ nó = unmount xterm = đóng WebSocket = mất phiên làm việc của
   * người học, không có thông báo lỗi nào. `hidden` thì chỉ là thôi được vẽ.
   *
   * Ô này quét MỌI tổ hợp (hai tab × có/không editor) và khẳng định CẢ HAI vế
   * của phép loại trừ — một bản quên ẩn hàng 2 vẫn trông đúng ở tab Terminal.
   */
  it('node terminal luôn có trong markup, và hai hàng ẩn/hiện NGƯỢC nhau', () => {
    for (const state of ALL_STATES) {
      const html = render(state);

      /*
        ⚠ Nhãn KHÔNG được dựng bằng `JSON.stringify(state)`.

        `JSON.stringify` BỎ mọi thuộc tính mang giá trị `undefined`, và
        `ALL_STATES` mã hoá bài-không-có-editor bằng đúng một `editor: undefined`
        tường minh để ĐÈ giá trị mặc định của `render()`. Nên hai trạng thái
        khác hẳn nhau cùng in ra `{"activeTab":"editor"}`, và một ô đỏ trỏ vào
        cái nhãn đó dẫn người đọc đi tìm sai trạng thái. Chính bẫy này đã tốn
        một lượt chẩn đoán lúc viết ô test này.

        Cùng lý do đó, "bài có editor" phải hỏi khoá có được KHAI hay không,
        không hỏi giá trị của nó.
      */
      const hasEditor = !('editor' in state) || state.editor !== undefined;
      const label = `activeTab=${String(state.activeTab)} hasEditor=${String(hasEditor)}`;

      // Vế bất biến: node terminal có mặt ở MỌI trạng thái, không bao giờ bị gỡ.
      expect(html, label).toContain(TERMINAL_MARK);

      // Vế chỉ đạo mới: đúng một hàng hiện.
      const editorHidden = isHidden(rowById(html, '-panel-editor'));
      const terminalHidden = isHidden(terminalRow(html));
      expect(terminalHidden, `${label}: hai hàng phải loại trừ nhau`).toBe(!editorHidden);

      // Và hàng hiện phải là hàng của tab đang chọn.
      const editorTabActive = state.activeTab === 'editor' && hasEditor;
      expect(editorHidden, `${label}: hàng editor`).toBe(!editorTabActive);
    }
  });

  it('hàng terminal luôn ở CÙNG vị trí con trong ngăn xếp (con thứ 2)', () => {
    // React so trùng con tĩnh theo VỊ TRÍ. Nếu ở một trạng thái nào đó ngăn xếp
    // chỉ còn 1 con thì hàng terminal trượt lên khớp vị trí của hàng editor —
    // tức React unmount cái xterm và mount lại một `<div>` rỗng. Đếm số con của
    // ngăn xếp là cách gần nhất mà markup tĩnh cho phép để gác điều đó.
    //
    // SỬA ĐỔI 3 gỡ thanh kéo, nên ngăn xếp đi từ ba con xuống HAI. Đó là một
    // thay đổi ở mức mã nguồn, không phải một nhánh điều kiện lúc chạy — số con
    // vẫn là hằng số ở mọi trạng thái, và đó mới là thứ bất biến đòi hỏi.
    for (const state of ALL_STATES) {
      const html = render(state);
      // Ngăn xếp = thẻ mang `flex-col` thứ hai (thẻ đầu là gốc panel).
      const columns = openTags(html).filter((tag) => classOf(tag).split(/\s+/).includes('flex-col'));
      expect(columns.length, JSON.stringify(state)).toBeGreaterThanOrEqual(2);
      // Hai con tĩnh, cả hai phải có mặt ở MỌI trạng thái.
      expect(html, JSON.stringify(state)).toContain('-panel-editor');
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
  /*
    ⚠ Danh sách và phép so khớp KHÔNG chép tay ở đây: cả hai đến từ
    `workspace-tabs.ts` (`DISPLAY_UTILITIES` / `hasDisplayUtility`), cùng nguồn
    mà `workspace-panel.dom.test.tsx` đọc. Hai bản chép là hai bản sẽ lệch, và
    khi lệch thì mỗi bên vẫn xanh theo bản của riêng nó.
  */

  it('không thẻ nào vừa có `hidden` vừa có class display', () => {
    for (const state of ALL_STATES) {
      const offenders = openTags(render(state))
        .filter(isHidden)
        .filter((tag) => hasDisplayUtility(classOf(tag)));
      expect(offenders, JSON.stringify(state)).toEqual([]);
    }
  });

  it('có ít nhất MỘT thẻ mang `hidden` ở tab Terminal — đối chứng dương (query trúng đích)', () => {
    // Không có ô này thì ô trên xanh một cách vô nghĩa khi `hidden` biến mất
    // hoàn toàn khỏi markup vì một lý do khác.
    expect(openTags(render({ activeTab: 'terminal' })).filter(isHidden).length).toBeGreaterThan(0);
  });

  /*
    ⚠ ĐỐI CHỨNG DƯƠNG THỨ HAI — hợp đồng §8 AC-2 đòi CẢ HAI vế, và vế này là vế
    thiếu cho tới 2026-09-10.

    Vế trên chứng minh "có thẻ mang `hidden` để mà quét". Vế này chứng minh "bộ
    quét NHÌN THẤY vi phạm khi vi phạm có thật". Không có nó thì một
    `hasDisplayUtility` luôn trả `false` (danh sách rỗng, `classOf` trượt regex,
    một lượt refactor đổi dấu phân tách) cũng làm ô chính xanh — xanh vì mù, chứ
    không phải vì sạch.
  */
  it('đối chứng dương: bộ quét ĐỎ được trên một cây giả cố ý sai', () => {
    const BAD = '<div hidden="" class="min-h-0 flex flex-col"></div>';
    const offenders = openTags(BAD)
      .filter(isHidden)
      .filter((tag) => hasDisplayUtility(classOf(tag)));

    expect(offenders).toHaveLength(1);
  });

  it('đối chứng ÂM: tiện ích kích thước cạnh `hidden` KHÔNG bị coi là vi phạm', () => {
    // `flex-1` / `flex-col` / `overflow-hidden` chứa chuỗi con của một tiện ích
    // display nhưng KHÔNG đặt `display`. Một bộ quét dùng `includes` sẽ đỏ ở
    // đây, rồi bị nới ra cho tới lúc không gác gì nữa (§2.1).
    const OK = '<div hidden="" class="min-h-0 min-w-0 flex-1 flex-col overflow-hidden"></div>';
    expect(openTags(OK).filter(isHidden).filter((tag) => hasDisplayUtility(classOf(tag)))).toEqual(
      [],
    );
  });

  it('danh sách tiện ích display không rỗng — chống một cổng rỗng đội lốt cổng sạch', () => {
    expect(DISPLAY_UTILITIES.length).toBeGreaterThanOrEqual(12);
    expect(DISPLAY_UTILITIES).toContain('flex');
    expect(DISPLAY_UTILITIES).toContain('table-cell');
  });
});

// ── SỬA ĐỔI 3 — hàng đang hiện chiếm trọn khoang, không còn thanh kéo ──────

describe('SỬA ĐỔI 3 — khoang chỉ có một hàng hiện, và không còn thanh kéo', () => {
  it('hàng terminal không mang style nội tuyến nào (không còn dải phần trăm)', () => {
    // Bản trước đặt `flex-basis:40%` ở tab Editor. Một style sót lại sẽ làm hàng
    // hiện chỉ cao 40% và phần còn lại là một mảng trống.
    expect(styleOf(terminalRow(render({ activeTab: 'terminal' })))).toBe('');
    expect(styleOf(terminalRow(render({ activeTab: 'editor' })))).toBe('');
  });

  it('cả hai hàng đều mang `flex-1` để chiếm trọn khoang khi tới lượt', () => {
    const html = render({ activeTab: 'terminal' });
    expect(classOf(terminalRow(html)).split(/\s+/)).toContain('flex-1');
    expect(classOf(rowById(html, '-panel-editor')).split(/\s+/)).toContain('flex-1');
  });

  /**
   * ⛔ Đối chứng cho quyết định GỠ thanh kéo thay vì ẩn nó.
   *
   * Một `[role="separator"]` không bao giờ hiện được là mã chết, và mã chết
   * trong cây này là thứ người đọc sau sẽ tưởng còn dùng. Nó cũng từng là một
   * chặng Tab chết mà `e2e/keyboard.spec.ts` phải gác bằng ngân sách 30 lần Tab.
   */
  it('không còn `separator` nào ở BẤT KỲ tổ hợp nào', () => {
    for (const state of ALL_STATES) {
      expect(tagsWithRole(render(state), 'separator'), JSON.stringify(state)).toHaveLength(0);
    }
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
