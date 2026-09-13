// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import type {
  SceneCommitNode,
  SceneLayout,
  SceneProps,
  SceneView,
} from '../shared/scene-props.ts';
import { GitSvgScene, commitAriaLabel, navigateFrom } from './git-svg-scene.tsx';
import { ModeToggle } from './mode-toggle.tsx';
import { sceneNodes } from '../shared/scene-props.ts';

/**
 * Renderer SVG 2D — ô nghiệm thu AC-B (DOM thật) và AC-6 / AC-L (a11y + bàn phím).
 *
 * ⚠ `ModeToggle` được kiểm ở CUỐI file này chứ không ở file riêng: bảng sở hữu
 * của lane không cấp `mode-toggle.test.tsx`, và đây là file jsdom duy nhất lane
 * sở hữu trong `git/`. Ghi ra để không ai đi tìm một file không tồn tại.
 */

afterEach(cleanup);

function node(
  oid: string,
  parents: readonly string[],
  extra: Partial<SceneCommitNode> = {},
): SceneCommitNode {
  return {
    oid,
    shortOid: oid.slice(0, 7),
    message: `Thông điệp ${oid}`,
    author: 'Bạn',
    parents,
    logicalTime: 1,
    reachable: true,
    repo: 'local',
    accent: 'normal',
    ...extra,
  };
}

const VIEW: SceneView = {
  nodes: [
    node('c1', []),
    node('c2', ['c1']),
    node('c3', ['c2'], { accent: 'head' }),
    node('c4', ['c2'], { accent: 'fresh' }),
    node('c9', ['c2'], { reachable: false, accent: 'orphaned', message: 'Commit đã mất' }),
    node('c1', [], { repo: 'origin' }),
    node('c2', ['c1'], { repo: 'origin' }),
  ],
  edges: [
    { from: 'c2', to: 'c1', kind: 'parent' },
    { from: 'c3', to: 'c2', kind: 'parent' },
    { from: 'c4', to: 'c2', kind: 'merge-parent' },
    { from: 'c9', to: 'c2', kind: 'parent' },
    { from: 'c1', to: 'c1', kind: 'remote-mirror' },
    { from: 'c2', to: 'c2', kind: 'remote-mirror' },
  ],
  refs: [
    {
      name: 'refs/heads/main',
      shortName: 'main',
      oid: 'c3',
      kind: 'branch',
      repo: 'local',
      isCurrent: true,
    },
    {
      name: 'refs/heads/feature',
      shortName: 'feature',
      oid: 'c4',
      kind: 'branch',
      repo: 'local',
      isCurrent: false,
    },
    {
      name: 'refs/tags/v1',
      shortName: 'v1',
      oid: 'c1',
      kind: 'tag',
      repo: 'local',
      isCurrent: false,
    },
    {
      name: 'refs/heads/main',
      shortName: 'main',
      oid: 'c2',
      kind: 'branch',
      repo: 'origin',
      isCurrent: false,
    },
  ],
  files: [],
  detached: false,
  hasOrigin: true,
  logicalTime: 7,
};

const LOCAL: SceneLayout = {
  nodes: [
    { id: 'c1', depth: 0, lane: 0 },
    { id: 'c2', depth: 1, lane: 0 },
    { id: 'c3', depth: 2, lane: 0 },
    { id: 'c4', depth: 2, lane: 1 },
    { id: 'c9', depth: 3, lane: 2 },
  ],
  edges: [
    { from: 'c1', to: 'c2', points: [[0, 0], [1, 0]] },
    { from: 'c2', to: 'c3', points: [[1, 0], [2, 0]] },
    { from: 'c2', to: 'c4', points: [[1, 0], [1, 1], [2, 1]] },
    // Cố ý MỘT ĐOẠN CHÉO: layout thật không sinh ra nó, nhưng renderer phải tự
    // nắn về góc vuông chứ không tin lời — xem ô "không đoạn chéo nào" dưới.
    { from: 'c2', to: 'c9', points: [[1, 0], [3, 2]] },
  ],
  laneCount: 3,
  depthCount: 4,
};

const ORIGIN: SceneLayout = {
  nodes: [
    { id: 'c1', depth: 0, lane: 0 },
    { id: 'c2', depth: 1, lane: 0 },
  ],
  edges: [{ from: 'c1', to: 'c2', points: [[0, 0], [1, 0]] }],
  laneCount: 1,
  depthCount: 2,
};

function props(overrides: Partial<SceneProps> = {}): SceneProps {
  return {
    view: VIEW,
    layouts: { local: LOCAL, origin: ORIGIN },
    interaction: { selectedId: null, hoveredId: null, onSelect: () => {}, onHover: () => {} },
    label: 'Đồ thị commit của bài G07',
    ...overrides,
  };
}

describe('T0 · cảnh thật sự vẽ ra một tập node không rỗng', () => {
  it('số nút bấm trên DOM khớp CHÍNH XÁC sceneNodeIds — hai renderer đọc chung một nguồn', () => {
    render(<GitSvgScene {...props()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(sceneNodes(props()).length);
    expect(buttons.length).toBe(7);
  });
});

describe('AC-6 · cấu trúc a11y', () => {
  it('svg là role=group có tên và mô tả bằng lời, KHÔNG phải role=img', () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('group');
    /*
      `role="img"` biến toàn bộ cây con thành presentational — cả đồ thị gộp
      thành MỘT nhãn và từng commit không đọc được nữa, tức xoá đúng lý do 2D
      tồn tại. Ghim ở đây để một lượt "sửa cho khớp brief" phải đọc dòng này.
    */
    expect(svg?.getAttribute('role')).not.toBe('img');
    expect(container.querySelector('title')?.textContent).toBe('Đồ thị commit của bài G07');
    const desc = container.querySelector('desc')?.textContent ?? '';
    expect(desc).toContain('7 commit');
    expect(desc).toContain('hai kho tách rời');
    expect(desc).toContain('Tab');
  });

  it('mỗi commit là một phần tử FOCUS ĐƯỢC, có role và nhãn tiếng Việt', () => {
    render(<GitSvgScene {...props()} />);
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('tabindex')).toBe('0');
      expect((button.getAttribute('aria-label') ?? '').length).toBeGreaterThan(20);
    }
  });

  it('nhãn nói đủ: message, oid ngắn, ref nào trỏ tới, còn sống hay đã mất', () => {
    render(<GitSvgScene {...props()} />);
    const head = screen.getByRole('button', { name: /Thông điệp c3/ });
    const label = head.getAttribute('aria-label') ?? '';
    expect(label).toContain('c3');
    expect(label).toContain('HEAD đang ở đây');
    expect(label).toContain('nhánh main');
    expect(label).toContain('còn với tới được');
    expect(label).toContain('Kho trên máy bạn');
  });

  it('commit đã mất VẪN được vẽ, và nhãn nói rõ nó đã mất', () => {
    render(<GitSvgScene {...props()} />);
    const lost = screen.getByRole('button', { name: /Commit đã mất/ });
    const label = lost.getAttribute('aria-label') ?? '';
    expect(label).toContain('đã mất, chỉ còn trong kho object');
    expect(label).toContain('không ref nào trỏ tới');
  });

  it('hai kho là hai nhóm có nhãn riêng', () => {
    render(<GitSvgScene {...props()} />);
    expect(screen.getByRole('group', { name: /Kho trên máy bạn \(local\), 5 commit/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: /Kho từ xa \(origin\), 2 commit/ })).toBeTruthy();
  });

  it('axe: 0 vi phạm, và nó thật sự ĐÁNH GIÁ các node commit', async () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const result = await axe.run(container);
    const detail = result.violations.map((v) => `${v.id}: ${v.nodes.length} chỗ`).join(' · ');
    expect(result.violations.map((v) => v.id), detail).toEqual([]);

    /*
      Một `axe.run` trên một cây mà nó không đánh giá được luật nào cũng trả
      `violations: []` — xanh và vô nghĩa. Nên ô này khẳng định ĐÍCH DANH ba
      luật đã CHẠY và ĐẠT trên chính các node commit, chứ không chỉ đếm tổng:

        aria-command-name  — node role=button CÓ tên khả truy cập
        nested-interactive — không có phần tử tương tác lồng nhau
        tabindex           — không tabindex dương nào (bẫy thứ tự Tab)

      Đo được trên cây này: 14 luật chạy, 73 luật không áp dụng.

      ⚠ `color-contrast` LUÔN nằm ở `incomplete`: jsdom không có layout và
      không có canvas 2D (dòng "Not implemented: HTMLCanvasElement's
      getContext()" trong log là của chính luật đó). Tương phản của lane được
      đo ở `git-palette.test.ts` qua cổng token — đừng đọc ô này thành "đã
      kiểm tương phản".
    */
    const passed = new Map(result.passes.map((p) => [p.id, p.nodes.length]));
    expect([...passed.keys()]).toEqual(expect.arrayContaining(['aria-command-name', 'nested-interactive', 'tabindex']));
    expect(passed.get('aria-command-name')).toBe(7);
    expect(result.incomplete.map((v) => v.id)).toContain('color-contrast');
  });

  it('đối chứng DƯƠNG · làm hỏng một node commit thì axe phải ĐỎ đúng node đó', async () => {
    /*
      Không có ô này thì "axe 0 vi phạm" chỉ chứng minh axe đã CHẠY, không
      chứng minh nó BIẾT KÊU trên một cây SVG — `rules/green-that-proves-nothing.md`.

      Hai phép phá đã thử và KHÔNG dùng được, ghi lại để không ai thử lại:

      • **Gỡ `aria-label`** — axe vẫn xanh, và đó là TIN TỐT bị hiểu nhầm thành
        cổng hỏng: `<g role="button">` chứa `<text>`, nên tên khả truy cập rơi
        về NỘI DUNG CHỮ (oid ngắn + thông điệp). Ô commit có HAI lớp tên;
        `aria-label` làm nó đầy đủ hơn chứ không phải thứ duy nhất giữ nó khỏi
        vô danh.
      • **`aria-hidden="true"`** — luật `aria-hidden-focus` chuyển sang
        `incomplete`, KHÔNG sang `violations`: trong jsdom axe không quyết được
        một `<g tabindex>` có thật sự focus được hay không (không có layout).
        Một đối chứng dựa vào nó sẽ đỏ/xanh tuỳ môi trường.

      Phép phá dùng ở đây phá được ở mọi môi trường vì nó thuần ARIA, không cần
      layout: đổi `role` thành `menuitem`, một vai đòi cha `menu`/`menubar` và
      cấm `aria-pressed`.
    */
    const { container } = render(<GitSvgScene {...props()} />);
    const victim = screen.getAllByRole('button')[0];
    expect(victim).toBeDefined();
    victim?.setAttribute('role', 'menuitem');
    const result = await axe.run(container);
    expect(result.violations.map((v) => v.id)).toEqual(
      expect.arrayContaining(['aria-allowed-attr', 'aria-required-parent']),
    );
  });
});

describe('AC-L · bàn phím đủ cho mọi thao tác', () => {
  const placed = sceneNodes(props());

  it('→ đi theo cạnh xuống con, ← về cha thứ nhất', () => {
    expect(navigateFrom(placed, 'local:c2', 'ArrowRight')).toBe('local:c3');
    expect(navigateFrom(placed, 'local:c3', 'ArrowLeft')).toBe('local:c2');
    expect(navigateFrom(placed, 'local:c1', 'ArrowLeft')).toBeNull();
  });

  it('↑ / ↓ đổi làn, và BẮC ĐƯỢC qua khoảng trống giữa hai kho', () => {
    // Làn cuối của local (lane 2) đi xuống ⇒ sang kho origin.
    expect(navigateFrom(placed, 'local:c9', 'ArrowDown')).toMatch(/^origin:/);
    // Và đi ngược lại được.
    expect(navigateFrom(placed, 'origin:c1', 'ArrowUp')).toBe('local:c9');
  });

  it('Home / End về commit đầu và cuối', () => {
    expect(navigateFrom(placed, 'local:c4', 'Home')).toBe(placed[0]?.id);
    expect(navigateFrom(placed, 'local:c4', 'End')).toBe(placed[placed.length - 1]?.id);
  });

  it('MỌI node tới được bằng mũi tên từ node đầu — không node nào là ốc đảo', () => {
    const seen = new Set<string>();
    const queue = [placed[0]?.id ?? ''];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const) {
        const next = navigateFrom(placed, id, key);
        if (next !== null && !seen.has(next)) queue.push(next);
      }
    }
    expect(seen.size).toBe(placed.length);
  });

  it('Enter chọn, Enter lần nữa bỏ chọn', () => {
    const onSelect = vi.fn();
    render(<GitSvgScene {...props({ interaction: { selectedId: null, hoveredId: null, onSelect, onHover: () => {} } })} />);
    const first = screen.getByRole('button', { name: /Thông điệp c1.*Kho trên máy bạn/ });
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith('local:c1');

    cleanup();
    const onSelect2 = vi.fn();
    render(
      <GitSvgScene
        {...props({
          interaction: { selectedId: 'local:c1', hoveredId: null, onSelect: onSelect2, onHover: () => {} },
        })}
      />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Thông điệp c1.*Kho trên máy bạn/ }), {
      key: ' ',
    });
    expect(onSelect2).toHaveBeenCalledWith(null);
  });

  it('bấm chuột và bấm phím cho ra CÙNG một kết quả — không thao tác nào chỉ có ở chuột', () => {
    const byKey = vi.fn();
    const { unmount } = render(
      <GitSvgScene {...props({ interaction: { selectedId: null, hoveredId: null, onSelect: byKey, onHover: () => {} } })} />,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: /Thông điệp c4/ }), { key: 'Enter' });
    unmount();

    const byMouse = vi.fn();
    render(
      <GitSvgScene {...props({ interaction: { selectedId: null, hoveredId: null, onSelect: byMouse, onHover: () => {} } })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Thông điệp c4/ }));
    expect(byKey.mock.calls).toEqual(byMouse.mock.calls);
  });

  it('mũi tên chuyển FOCUS trên DOM thật', () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const start = screen.getByRole('button', { name: /Thông điệp c2.*Kho trên máy bạn/ });
    (start as unknown as HTMLElement).focus();
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    const active = container.ownerDocument.activeElement;
    expect(active?.getAttribute('aria-label')).toContain('Thông điệp c3');
  });
});

describe('hình học của cảnh', () => {
  it('MỌI cạnh là đường gấp khúc GÓC VUÔNG — không một đoạn chéo nào', () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const paths = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
    expect(paths.length).toBeGreaterThan(4);

    let segments = 0;
    for (const d of paths) {
      // Nhãn tag dùng `path` có `Z` (hình khía) — đó là một BADGE, không phải cạnh.
      if (d.includes('Z')) continue;
      const points = [...d.matchAll(/[ML]\s(-?[\d.]+)\s(-?[\d.]+)/g)].map(
        (m) => [Number(m[1]), Number(m[2])] as const,
      );
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1] as readonly [number, number];
        const b = points[i] as readonly [number, number];
        segments++;
        expect(
          a[0] === b[0] || a[1] === b[1],
          `đoạn chéo từ (${a[0]},${a[1]}) tới (${b[0]},${b[1]}) trong "${d}"`,
        ).toBe(true);
      }
    }
    expect(segments).toBeGreaterThan(5);
  });

  it('hai kho tách rời: không commit origin nào chồng lên vùng của local', () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const bottoms: number[] = [];
    const tops: number[] = [];
    for (const button of screen.getAllByRole('button')) {
      const rect = button.querySelector('rect');
      const y = Number(rect?.getAttribute('y') ?? 0);
      const h = Number(rect?.getAttribute('height') ?? 0);
      if ((button.getAttribute('aria-label') ?? '').includes('Kho từ xa')) tops.push(y);
      else bottoms.push(y + h);
    }
    expect(container.querySelector('svg')).toBeTruthy();
    expect(Math.min(...tops) - Math.max(...bottoms)).toBeGreaterThan(40);
  });

  it('nhãn nhánh LẶP LẠI dọc theo làn, không chỉ một cái ở đầu', () => {
    render(<GitSvgScene {...props()} />);
    /*
      Đếm TRONG vùng local thôi. Đếm toàn cảnh sẽ cộng cả nhãn `main` của kho
      origin, và lúc đó ô này xanh ngay cả khi phần lặp bị gỡ hẳn — một ô đếm
      trên tổng thì không gác được thứ nó định gác.
    */
    const local = screen.getByRole('group', { name: /Kho trên máy bạn/ });
    expect(within(local).getAllByText('main').length).toBeGreaterThan(1);
    expect(within(local).getAllByText('feature').length).toBeGreaterThan(1);
  });

  it('"mờ" của commit mồ côi KHÔNG làm bằng opacity', () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const lost = screen.getByRole('button', { name: /Commit đã mất/ });
    expect(lost.getAttribute('opacity')).toBeNull();
    expect((lost.getAttribute('style') ?? '')).not.toContain('opacity');
    // Nét đứt là kênh hình học thay cho opacity.
    expect(lost.querySelector('rect')?.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('chuyển động tự tắt dưới prefers-reduced-motion', () => {
    const { container } = render(<GitSvgScene {...props()} />);
    const css = container.querySelector('style')?.textContent ?? '';
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('animation: none');
  });

  it('cảnh một kho không dựng vùng origin', () => {
    render(
      <GitSvgScene
        {...props({
          view: { ...VIEW, hasOrigin: false },
          layouts: { local: LOCAL, origin: null },
        })}
      />,
    );
    expect(screen.queryByRole('group', { name: /Kho từ xa/ })).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});

describe('commitAriaLabel — một câu DÙNG CHUNG với renderer 3D', () => {
  it('cùng một commit ⇒ cùng một câu, không phụ thuộc renderer', () => {
    const spot = sceneNodes(props()).find((n) => n.id === 'local:c3');
    expect(spot).toBeDefined();
    if (spot === undefined) return;
    const a = commitAriaLabel(spot, ['nhánh main']);
    const b = commitAriaLabel(spot, ['nhánh main']);
    expect(a).toBe(b);
    expect(a.endsWith('.')).toBe(true);
  });
});

describe('17.B.6 · nút 2D/3D ở thanh trên', () => {
  it('hiện CẢ HAI nút, kể cả khi 3D chưa có', () => {
    render(
      <ModeToggle
        resolved={{ mode: '2d', reason: 'no-3d-build' }}
        enabled={['2d']}
        onChange={() => {}}
      />,
    );
    const group = screen.getByRole('group', { name: 'Chế độ hiển thị đồ thị' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
  });

  it('nút 3D vẫn FOCUS ĐƯỢC và nói rõ "sắp có" — không dùng thuộc tính disabled', () => {
    render(
      <ModeToggle
        resolved={{ mode: '2d', reason: 'no-3d-build' }}
        enabled={['2d']}
        onChange={() => {}}
      />,
    );
    const three = screen.getByRole('button', { name: /Cảnh 3D — sắp có/ });
    expect(three.hasAttribute('disabled')).toBe(false);
    expect(three.getAttribute('aria-disabled')).toBe('true');
    expect(three.getAttribute('title')).toContain('sắp có');
  });

  it('bấm nút chưa dùng được thì KHÔNG gọi onChange', () => {
    const onChange = vi.fn();
    render(
      <ModeToggle
        resolved={{ mode: '2d', reason: 'no-3d-build' }}
        enabled={['2d']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cảnh 3D/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('bấm nút dùng được và chưa active thì gọi onChange', () => {
    const onChange = vi.fn();
    render(
      <ModeToggle
        resolved={{ mode: '3d', reason: 'user' }}
        enabled={['2d', '3d']}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sơ đồ 2D' }));
    expect(onChange).toHaveBeenCalledWith('2d');
  });

  it('nút đang bật mang aria-pressed', () => {
    render(
      <ModeToggle resolved={{ mode: '2d', reason: 'user' }} enabled={['2d']} onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Sơ đồ 2D' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('axe: 0 vi phạm', async () => {
    const { container } = render(
      <ModeToggle
        resolved={{ mode: '2d', reason: 'no-3d-build' }}
        enabled={['2d']}
        onChange={() => {}}
      />,
    );
    const result = await axe.run(container);
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
