// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import axe from 'axe-core';
import { placeWorkflow, type CicdGraphView } from '@devops-platform/games';
import {
  CICD_EDGE_ATTR,
  CICD_EDGE_COUNT_ATTR,
  CICD_EDGE_CRITICAL_ATTR,
  CICD_NODE_ATTR,
  CICD_NODE_COUNT_ATTR,
  CICD_SCENE_TESTIDS,
  cicdSceneEdgeKeys,
  cicdSceneNodeIds,
  type CicdSceneProps,
} from '../scene-props';
import { CicdSvgScene } from './cicd-svg-scene';
import { cdView, ciView, edge, stage } from './scene-fixtures';
import { explainMismatch, isLabelInName, visibleText } from '../../shared/label-in-name-check';

/**
 * Cảnh 2D — DOM thật. Ô nghiệm thu D.2.1/D.2.4/D.2.9 + AC-D1 + AC-D10.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * GIẢ LẬP `matchMedia` — VÀ VÌ SAO NÓ PHẢI ĐỌC LẠI GIÁ TRỊ MỖI LẦN GỌI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * jsdom không cài `window.matchMedia`, và `useReducedMotion` của framer-motion
 * khởi tạo trạng thái đúng MỘT LẦN cho cả module (`hasReducedMotionListener`),
 * rồi cập nhật qua listener. Nên một mock trả hằng số `false` sẽ khoá cứng cả
 * file test ở nhánh "không giảm chuyển động", và ô AC-D10 sẽ XANH mà không đo
 * gì — đúng hình dạng `rules/green-that-proves-nothing.md`.
 *
 * Mock dưới đây giữ `matches` là một GETTER và gọi lại mọi listener khi giá trị
 * đổi, nên `setReduce(true)` thật sự tới được framer-motion. Ô "đối chứng dương"
 * (có `spin` khi KHÔNG giảm) tồn tại để một mock hỏng làm test ĐỎ chứ không
 * phải xanh giả.
 */

const listeners = new Set<() => void>();
let reduceMotion = false;

beforeEach(() => {
  reduceMotion = false;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      get matches(): boolean {
        return reduceMotion;
      },
      media: query,
      onchange: null,
      addListener: (l: () => void) => listeners.add(l),
      removeListener: (l: () => void) => listeners.delete(l),
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      dispatchEvent: () => false,
    }),
  });
});

function setReduce(value: boolean): void {
  reduceMotion = value;
  for (const l of listeners) l();
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
});

function props(view: CicdGraphView): CicdSceneProps {
  return {
    view,
    placement: placeWorkflow(view),
    interaction: {
      selectedId: null,
      hoveredId: null,
      onSelect: () => {},
      onHover: () => {},
    },
    label: 'Đường ống của bài C03',
  };
}

function scene(container: HTMLElement): SVGSVGElement {
  const el = container.querySelector<SVGSVGElement>(
    `[data-testid="${CICD_SCENE_TESTIDS.scene2d}"]`,
  );
  if (el === null) throw new Error('không tìm thấy gốc cảnh 2D');
  return el;
}

describe('AC-D1 · số node vẽ ra = số THỰC THỂ', () => {
  it('level có quạt ra: ba thực thể cùng stageId ra BA node', () => {
    const p = props(ciView());

    /*
     * Ô GÁC CỦA CHÍNH Ô NÀY. Chạy phép đếm trên một level KHÔNG quạt ra thì
     * đếm-theo-`stageId` và đếm-theo-`InstanceKey` cho cùng một số, và ô này
     * xanh mà không phân biệt được hai cách — đúng con bug `CICD_NODE_ATTR`
     * tồn tại để bắt. Khẳng định fixture thật sự quạt ra TRƯỚC khi đếm.
     */
    const stageIds = new Set(p.view.nodes.map((n) => n.stageId));
    expect(stageIds.size).toBeLessThan(p.view.nodes.length);

    const { container } = render(<CicdSvgScene {...p} />);
    const drawn = container.querySelectorAll(`[${CICD_NODE_ATTR}]`);
    expect(drawn).toHaveLength(cicdSceneNodeIds(p).length);
    expect(drawn).toHaveLength(5);

    // Mỗi node mang ĐÚNG `InstanceKey`, không phải `stageId`.
    const ids = [...drawn].map((el) => el.getAttribute(CICD_NODE_ATTR));
    expect([...ids].sort()).toEqual([...cicdSceneNodeIds(p)].sort());
  });

  it('bộ đếm trên gốc cảnh khớp số phần tử thật', () => {
    const p = props(ciView());
    const { container } = render(<CicdSvgScene {...p} />);
    const root = scene(container);

    expect(root.getAttribute(CICD_NODE_COUNT_ATTR)).toBe(String(cicdSceneNodeIds(p).length));
    expect(root.getAttribute(CICD_EDGE_COUNT_ATTR)).toBe(String(cicdSceneEdgeKeys(p).length));
    expect(container.querySelectorAll(`[${CICD_NODE_ATTR}]`)).toHaveLength(
      Number(root.getAttribute(CICD_NODE_COUNT_ATTR)),
    );
    expect(container.querySelectorAll(`[${CICD_EDGE_ATTR}]`)).toHaveLength(
      Number(root.getAttribute(CICD_EDGE_COUNT_ATTR)),
    );
  });

  it('không lọc `view.nodes` theo cách riêng — cạnh vẽ ra khớp `cicdSceneEdgeKeys`', () => {
    const p = props(ciView());
    const { container } = render(<CicdSvgScene {...p} />);
    const keys = [...container.querySelectorAll(`[${CICD_EDGE_ATTR}]`)].map((el) =>
      el.getAttribute(CICD_EDGE_ATTR),
    );
    expect([...keys].sort()).toEqual([...cicdSceneEdgeKeys(p)].sort());
  });
});

describe('D.2.4 · đường găng', () => {
  it('cạnh găng mang dấu riêng, cạnh thường KHÔNG', () => {
    const p = props(ciView());
    const { container } = render(<CicdSvgScene {...p} />);
    const marked = [...container.querySelectorAll(`[${CICD_EDGE_CRITICAL_ATTR}="true"]`)].map(
      (el) => el.getAttribute(CICD_EDGE_ATTR),
    );
    const expected = p.view.edges.filter((e) => e.critical).map((e) => `${e.from}->${e.to}`);
    expect([...marked].sort()).toEqual([...expected].sort());
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.length).toBeLessThan(p.view.edges.length);
  });

  it('nhãn tổng thời gian hiện ra, và nó nói bằng TICK chứ không bịa ra giây', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const badge = container.querySelector('[data-cicd-critical-badge]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent ?? '').toContain('9 tick');
  });

  it('nói thành CHỮ khi đường găng đi qua một đoạn chờ máy', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const desc = container.querySelector('desc')?.textContent ?? '';
    expect(desc).toContain('chờ máy');
    expect(container.querySelector('[data-cicd-critical-badge]')?.textContent ?? '').toContain(
      'CHỜ MÁY',
    );
  });

  it('cạnh CHỜ-MÁY giữ nét đứt CẢ KHI nằm trên đường găng', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const resource = container.querySelector(
      `[data-cicd-resource="true"][${CICD_EDGE_CRITICAL_ATTR}="true"]`,
    );
    expect(resource).not.toBeNull();
    const dashed = [...(resource?.querySelectorAll('path') ?? [])].some(
      (p) => (p.getAttribute('stroke-dasharray') ?? '').length > 0,
    );
    expect(dashed).toBe(true);

    // Đối chứng: một cạnh phụ thuộc thì KHÔNG có nét đứt nào.
    const dependency = container.querySelector(
      `[${CICD_EDGE_ATTR}="build->test[os=linux]"]`,
    );
    expect(dependency).not.toBeNull();
    const anyDash = [...(dependency?.querySelectorAll('path') ?? [])].some(
      (p) => (p.getAttribute('stroke-dasharray') ?? '').length > 0,
    );
    expect(anyDash).toBe(false);
  });
});

describe('AC-D10 · giảm chuyển động', () => {
  it('ĐỐI CHỨNG DƯƠNG · bình thường thì CÓ chuyển động lặp vô hạn', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const motions = [...container.querySelectorAll('[data-cicd-motion]')].map((el) =>
      el.getAttribute('data-cicd-motion'),
    );
    expect(motions).toContain('spin');
    expect(motions).toContain('pulse-slow');
    expect(container.querySelectorAll('[data-cicd-flowing="true"]').length).toBeGreaterThan(0);
  });

  it('`prefers-reduced-motion: reduce` ⇒ KHÔNG còn chuyển động lặp nào', () => {
    setReduce(true);
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    expect(scene(container).getAttribute('data-cicd-reduced')).toBe('true');

    const motions = [...container.querySelectorAll('[data-cicd-motion]')].map((el) =>
      el.getAttribute('data-cicd-motion'),
    );
    expect(motions.length).toBeGreaterThan(0);
    expect([...new Set(motions)]).toEqual(['none']);
    expect(container.querySelectorAll('[data-cicd-flowing="true"]')).toHaveLength(0);
  });
});

describe('hai chương vẽ khác nhau', () => {
  it('chương CD có dải môi trường, chương CI thì KHÔNG', () => {
    const cd = render(<CicdSvgScene {...props(cdView())} />);
    expect(scene(cd.container).getAttribute('data-cicd-chapter')).toBe('cd');
    expect(cd.container.querySelectorAll('[data-cicd-band]').length).toBe(3);
    cleanup();

    const ci = render(<CicdSvgScene {...props(ciView())} />);
    expect(scene(ci.container).getAttribute('data-cicd-chapter')).toBe('ci');
    expect(ci.container.querySelectorAll('[data-cicd-band]')).toHaveLength(0);
  });

  it('trục bị gập của chương CI hiện ra bằng CHỮ, không bằng vị trí', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const wait = container.querySelector('[data-cicd-wait]');
    expect(wait).not.toBeNull();
    expect(wait?.getAttribute('data-cicd-wait')).toBe('6');
    expect(wait?.textContent ?? '').toContain('chờ máy 6 tick');
  });
});

describe('D.2.9 · a11y và bàn phím', () => {
  it('gốc cảnh là `group` có tên, KHÔNG phải `img` (nếu không cây con câm)', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const root = scene(container);
    expect(root.getAttribute('role')).toBe('group');
    const titleId = root.getAttribute('aria-labelledby') ?? '';
    expect(container.querySelector(`#${CSS.escape(titleId)}`)?.textContent).toBe(
      'Đường ống của bài C03',
    );
  });

  it('mỗi job nói trạng thái bằng CHỮ và đi tới được bằng Tab', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const nodes = [...container.querySelectorAll(`[${CICD_NODE_ATTR}]`)];
    for (const node of nodes) {
      expect(node.getAttribute('tabindex')).toBe('0');
      expect(node.getAttribute('role')).toBe('button');
      expect(node.getAttribute('aria-label') ?? '').not.toBe('');
    }
    const windows = container.querySelector(`[${CICD_NODE_ATTR}="test[os=windows]"]`);
    // Chữ vẽ trên hộp đứng đầu (WCAG 2.5.3), câu của hợp đồng giữ nguyên phía sau.
    expect(windows?.getAttribute('aria-label')).toBe(
      'test, test, đang chạy, chờ máy 6 tick. test trên windows, đang chạy',
    );

    // Trạng thái cũng được VIẾT RA trong hộp — kênh chữ là kênh duy nhất sống
    // sót qua cả reduced-motion lẫn bản in đen trắng.
    expect(windows?.textContent ?? '').toContain('đang chạy');
  });

  it('→ chuyển tiêu điểm sang job kế theo cạnh', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const build = container.querySelector<SVGGElement>(`[${CICD_NODE_ATTR}="build"]`);
    expect(build).not.toBeNull();
    build?.focus();
    expect(document.activeElement).toBe(build);

    fireEvent.keyDown(build as Element, { key: 'ArrowRight' });
    expect(document.activeElement).not.toBe(build);
    expect(document.activeElement?.getAttribute(CICD_NODE_ATTR)).toMatch(/^test\[os=/);
  });

  it('phím I mở drill-in, Esc đóng lại', () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const root = scene(container);
    const build = container.querySelector<SVGGElement>(`[${CICD_NODE_ATTR}="build"]`);
    expect(root.getAttribute('data-cicd-drill')).toBe('workflow');

    fireEvent.keyDown(build as Element, { key: 'i' });
    expect(root.getAttribute('data-cicd-drill')).toBe('job');
    expect(container.querySelector('[data-cicd-detail="build"]')).not.toBeNull();

    fireEvent.keyDown(build as Element, { key: 'Escape' });
    expect(root.getAttribute('data-cicd-drill')).toBe('workflow');
  });

  it('axe: 0 vi phạm, và ba luật đã THẬT SỰ chạy trên các node job', async () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const result = await axe.run(container);
    const detail = result.violations.map((v) => `${v.id}: ${v.nodes.length} chỗ`).join(' · ');
    expect(result.violations.map((v) => v.id), detail).toEqual([]);

    /*
     * Một `axe.run` trên một cây mà nó không đánh giá được luật nào cũng trả
     * `violations: []` — xanh và vô nghĩa. Nên ô này khẳng định ĐÍCH DANH ba
     * luật đã CHẠY và ĐẠT.
     *
     * ⚠ `color-contrast` KHÔNG nằm trong số đó và không thể nằm: jsdom không có
     * layout và không có canvas 2D, nên luật đó luôn rơi vào `incomplete`. Đừng
     * đọc ô này thành "đã kiểm tương phản hai theme". Tương phản của lane này
     * đến từ bảng đo trong `../../git/git-palette.ts` mà `cicd-palette.ts` dùng
     * lại nguyên (cùng bộ token, cùng ngưỡng), và phép đo hai theme THẬT nằm ở
     * tầng e2e của lead — nơi có trình duyệt thật.
     */
    const passed = new Set(result.passes.map((p) => p.id));
    expect([...passed].includes('aria-command-name')).toBe(true);
    expect([...passed].includes('nested-interactive')).toBe(true);
    expect([...passed].includes('tabindex')).toBe(true);
  });

  it('ĐỐI CHỨNG DƯƠNG · làm hỏng một node thì axe phải ĐỎ đúng node đó', async () => {
    const { container } = render(<CicdSvgScene {...props(ciView())} />);
    const build = container.querySelector(`[${CICD_NODE_ATTR}="build"]`);
    expect(build).not.toBeNull();
    build?.setAttribute('tabindex', '3');

    const result = await axe.run(container);
    expect(result.violations.map((v) => v.id)).toContain('tabindex');
  });

  it('theme tối: cấu trúc a11y không đổi (⚠ jsdom KHÔNG đo được tương phản)', async () => {
    document.documentElement.classList.add('dark');
    const { container } = render(<CicdSvgScene {...props(cdView())} />);
    const result = await axe.run(container);
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('WCAG 2.5.3 · chữ vẽ trên node nằm TRONG tên khả truy cập', () => {
  /*
   * Ca khó nhất mà một level thật sinh ra được: tên dài hơn hộp (bị cắt), stage
   * id cũng bị cắt, đang ở lượt thử lại (thêm `· lần 2`), và có badge chờ-máy
   * treo dưới hộp — tức đủ năm `<text>` cùng lúc, cộng hai glyph trạng thái.
   */
  const LONG = 'deploy-production-eu-west';
  const LONG_ID = 'deploy[env=production]';
  const LONG_DESC = `${LONG} (env=production) — đang thử lại, lần thứ 2`;

  function longView(): CicdGraphView {
    const base = ciView();
    return {
      ...base,
      nodes: [
        ...base.nodes,
        stage(LONG_ID, LONG, {
          state: 'retrying',
          statusToken: 'status-progress',
          attempt: 1,
          readyTick: 9,
          startedTick: 12,
          ariaLabel: LONG_DESC,
        }),
      ],
      edges: [...base.edges, edge('package', LONG_ID)],
    };
  }

  it('MỌI node: dãy từ nhìn thấy là dãy con liền mạch, đúng thứ tự của tên', () => {
    const { container } = render(<CicdSvgScene {...props(longView())} />);
    const nodes = [...container.querySelectorAll(`[${CICD_NODE_ATTR}]`)];
    expect(nodes.length).toBe(6);
    for (const node of nodes) {
      const seen = visibleText(node);
      const name = node.getAttribute('aria-label') ?? '';
      expect(isLabelInName(seen, name), explainMismatch(seen, name)).toBe(true);
    }
  });

  it('tên bắt đầu bằng đúng chữ ĐÃ CẮT, rồi mới tới câu đầy đủ', () => {
    const { container } = render(<CicdSvgScene {...props(longView())} />);
    const node = container.querySelector(`[${CICD_NODE_ATTR}="${LONG_ID}"]`);
    if (node === null) throw new Error('node tên dài không được vẽ');
    expect(node.getAttribute('aria-label')).toBe(
      `deploy-producti…, deploy-production-e…, đang thử lại · lần 2, chờ máy 3 tick. ${LONG_DESC}`,
    );
    // Tooltip vẫn là câu đầy đủ — nó là thứ duy nhất cho người dùng chuột đọc tên chưa cắt.
    expect(node.querySelector('title')?.textContent).toBe(LONG_DESC);
  });

  it('ĐỐI CHỨNG ÂM · nhãn cũ (chỉ câu mô tả) phải RỚT trên chính node đó', () => {
    const { container } = render(<CicdSvgScene {...props(longView())} />);
    const node = container.querySelector(`[${CICD_NODE_ATTR}="${LONG_ID}"]`);
    if (node === null) throw new Error('node tên dài không được vẽ');
    // Không có ô này thì một bản sao luật luôn trả `true` cũng làm ô trên xanh.
    expect(isLabelInName(visibleText(node), LONG_DESC)).toBe(false);
  });
});
