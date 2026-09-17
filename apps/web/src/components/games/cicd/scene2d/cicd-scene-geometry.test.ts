import { describe, expect, it } from 'vitest';
import { placeWorkflow } from '@devops-platform/games';
import {
  cicdSceneEdges,
  cicdSceneNodes,
  sceneAxes,
  type CicdSceneProps,
} from '../scene-props';
import {
  CD_LANE_NUDGE,
  NODE_W,
  criticalHasResourceWait,
  dedupePx,
  edgePx,
  envBands,
  foldNudge,
  isPromotion,
  navigateFrom,
  orthPath,
  pathLength,
  runTotalTicks,
  scenePx,
  sceneViewBox,
  waitTicks,
  type Px,
  formatRunTime,
} from './cicd-scene-geometry';
import { cdView, ciView } from './scene-fixtures';

/**
 * Hình học px của cảnh 2D — env `node`, không DOM.
 *
 * ⚠ Mọi khẳng định về vị trí ở đây là QUAN HỆ ("cùng cột", "thấp hơn", "lệch
 * đúng một nhịp làn"), không phải một con số px tuyệt đối. Ghim px tuyệt đối
 * biến mọi lần chỉnh tỉ lệ thành một lần sửa test hàng loạt, và một test hàng
 * loạt phải sửa là một test không ai đọc nữa. Ngoại lệ DUY NHẤT là `CD_LANE_NUDGE`:
 * ở đó con số CHÍNH LÀ tính chất đang đo (trục bị gập lệch đúng một nhịp).
 */

function props(view: ReturnType<typeof ciView>): CicdSceneProps {
  return {
    view,
    placement: placeWorkflow(view),
    interaction: {
      selectedId: null,
      hoveredId: null,
      onSelect: () => {},
      onHover: () => {},
    },
  };
}

describe('phép chiếu theo chương', () => {
  it('chương CI: trục dọc là LÀN, và thời gian chờ KHÔNG đẩy node đi đâu', () => {
    const p = props(ciView());
    const axes = sceneAxes(p.view.yAxis);
    expect(axes).toEqual({ horizontal: 'x', vertical: 'z', folded: 'y' });

    const nodes = cicdSceneNodes(p);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const linux = byId.get('test[os=linux]');
    const windows = byId.get('test[os=windows]');
    expect(linux).toBeDefined();
    expect(windows).toBeDefined();
    if (linux === undefined || windows === undefined) return;

    // Cùng tầng phụ thuộc ⇒ cùng cột.
    expect(linux.spot.layer).toBe(windows.spot.layer);
    expect(scenePx(linux.spot, axes)[0]).toBe(scenePx(windows.spot, axes)[0]);

    /*
     * `test[os=windows]` chờ 6 tick nên `spot.y > 0`. Ở chương CI trục Y BỊ GẬP:
     * nó không được phép đổi vị trí dọc, và nó phải hiện ra ở kênh khác
     * (`waitTicks` → badge). Đây chính là ô bắt lỗi "gập nghĩa là biến mất".
     */
    expect(windows.spot.y).toBeGreaterThan(0);
    expect(foldNudge(windows.spot, axes)).toBe(0);
    expect(waitTicks(windows)).toBe(6);

    const sameLane = { ...windows.spot, y: 0 };
    expect(scenePx(windows.spot, axes)).toEqual(scenePx(sameLane, axes));
  });

  it('chương CD: trục dọc là DẢI môi trường, và làn thành một lệch nhỏ', () => {
    const p = props(cdView());
    const axes = sceneAxes(p.view.yAxis);
    expect(axes).toEqual({ horizontal: 'x', vertical: 'y', folded: 'z' });

    const byId = new Map(cicdSceneNodes(p).map((n) => [n.id, n]));
    const deployDev = byId.get('deploy-dev');
    const smokeDev = byId.get('smoke-dev');
    const deployProd = byId.get('deploy-prod');
    expect(deployDev).toBeDefined();
    expect(smokeDev).toBeDefined();
    expect(deployProd).toBeDefined();
    if (deployDev === undefined || smokeDev === undefined || deployProd === undefined) return;

    // Cùng môi trường ⇒ cùng dải, nhưng khác làn ⇒ lệch ĐÚNG một nhịp.
    expect(deployDev.spot.band).toBe(smokeDev.spot.band);
    const [, devY] = scenePx(deployDev.spot, axes);
    const [, smokeY] = scenePx(smokeDev.spot, axes);
    expect(Math.abs(devY - smokeY)).toBe(
      Math.abs(deployDev.spot.lane - smokeDev.spot.lane) * CD_LANE_NUDGE,
    );

    // Dải cao hơn (prod) nằm THẤP hơn trên màn hình — promote đi LÊN nghĩa là
    // đi ngược chiều trục màn hình, và đó là thứ D.2.8 vẽ bằng mũi tên.
    expect(deployProd.spot.band).toBeGreaterThan(deployDev.spot.band);
    expect(scenePx(deployProd.spot, axes)[1]).toBeGreaterThan(devY);
  });

  it('`foldNudge` dùng chung cho node và điểm gấp khúc của cạnh nên cạnh không trôi', () => {
    const p = props(cdView());
    const axes = sceneAxes(p.view.yAxis);
    const byId = new Map(cicdSceneNodes(p).map((n) => [n.id, n]));
    for (const resolved of cicdSceneEdges(p)) {
      const from = byId.get(resolved.edge.from);
      const to = byId.get(resolved.edge.to);
      if (from === undefined || to === undefined) continue;
      const pts = edgePx(resolved, axes);
      const first = pts[0];
      const last = pts.at(-1);
      expect(first).toEqual(scenePx(from.spot, axes));
      expect(last).toEqual(scenePx(to.spot, axes));
    }
  });
});

describe('đường gấp khúc', () => {
  it('bỏ điểm trùng SINH RA BỞI phép chiếu, không chỉ điểm trùng sẵn', () => {
    // Hai điểm 3D khác nhau ở trục bị gập ⇒ chiếu xuống thành một chỗ.
    const axes = sceneAxes('ci');
    const a = scenePx({ x: 1, y: 0, z: 2 }, axes);
    const b = scenePx({ x: 1, y: 5, z: 2 }, axes);
    expect(a).toEqual(b);
    expect(dedupePx([a, b])).toHaveLength(1);
  });

  it('`orthPath` xử lý các ca biên mà không sinh `d` hỏng', () => {
    expect(orthPath([])).toBe('');
    expect(orthPath([[10, 20]])).toBe('M 10 20');
    expect(orthPath([[0, 0], [100, 0]])).toBe('M 0 0 L 100 0');
  });

  it('bán kính bo bị kẹp xuống nửa đoạn ngắn nhất kề góc', () => {
    // Đoạn dài 8px với bán kính mặc định 16 ⇒ không kẹp thì hai cung chồng nhau
    // và đường vẽ quay ngược. Kẹp đúng thì điểm vào cung không vượt qua góc.
    const pts: readonly Px[] = [
      [0, 0],
      [8, 0],
      [8, 200],
    ];
    const d = orthPath(pts);
    expect(d).toContain('Q 8 0');
    // Điểm vào cung nằm giữa (0,0) và (8,0) — tức x ∈ [4, 8].
    const entry = /L (\d+(?:\.\d+)?) 0 Q/.exec(d);
    expect(entry).not.toBeNull();
    const x = Number(entry?.[1] ?? '0');
    expect(x).toBeGreaterThanOrEqual(4);
    expect(x).toBeLessThanOrEqual(8);
  });

  it('`pathLength` cộng dồn theo đoạn', () => {
    expect(pathLength([[0, 0], [3, 4]])).toBe(5);
    expect(pathLength([[0, 0]])).toBe(0);
  });
});

describe('khung nhìn', () => {
  it('`viewBox` chừa NỬA HỘP node ở mép, nếu không cột cuối bị cắt đôi', () => {
    const p = props(ciView());
    const axes = sceneAxes(p.view.yAxis);
    const box = sceneViewBox(p.placement.bounds, axes, p.placement.laneCount);
    const xs = cicdSceneNodes(p).map((n) => scenePx(n.spot, axes)[0]);
    const maxX = Math.max(...xs);
    expect(box.x + box.width).toBeGreaterThanOrEqual(maxX + NODE_W / 2);
    expect(box.x).toBeLessThanOrEqual(Math.min(...xs) - NODE_W / 2);
  });
});

describe('thời gian và đường găng', () => {
  it('`waitTicks` phân biệt "chưa tới lượt" với "tới lượt mà có máy ngay"', () => {
    const p = props(ciView());
    const byId = new Map(cicdSceneNodes(p).map((n) => [n.id, n]));
    const pkg = byId.get('package');
    const linux = byId.get('test[os=linux]');
    expect(pkg).toBeDefined();
    expect(linux).toBeDefined();
    if (pkg === undefined || linux === undefined) return;
    // `package` mới `readyTick`, chưa `startedTick` ⇒ null, KHÔNG phải 0.
    expect(waitTicks(pkg)).toBeNull();
    expect(waitTicks(linux)).toBe(0);
  });

  it('`runTotalTicks` là tick job cuối kết thúc, `null` khi chưa job nào xong', () => {
    const p = props(ciView());
    expect(runTotalTicks(cicdSceneNodes(p))).toBe(9);

    const fresh = ciView();
    const blank = {
      ...fresh,
      nodes: fresh.nodes.map((n) => ({ ...n, finishedTick: null })),
    };
    expect(runTotalTicks(cicdSceneNodes(props(blank)))).toBeNull();
  });

  it('phát hiện được đường găng đi qua một đoạn CHỜ MÁY', () => {
    const p = props(ciView());
    const edges = cicdSceneEdges(p);
    expect(criticalHasResourceWait(edges)).toBe(true);

    // Đối chứng ÂM: bỏ cờ `critical` khỏi đúng cạnh máy thì phải trả false —
    // nếu không, hàm chỉ đang đo "có cạnh máy nào không".
    const noCritical = ciView();
    const patched = {
      ...noCritical,
      edges: noCritical.edges.map((e) => (e.resourceEdge ? { ...e, critical: false } : e)),
    };
    expect(criticalHasResourceWait(cicdSceneEdges(props(patched)))).toBe(false);
  });
});

describe('dải môi trường', () => {
  it('chương CI KHÔNG có dải nào — Y ở đó là thời gian chờ', () => {
    const p = props(ciView());
    expect(envBands(cicdSceneNodes(p), sceneAxes('ci'))).toEqual([]);
  });

  it('chương CD suy dải từ chính node, không từ một bảng tên ghim sẵn', () => {
    const p = props(cdView());
    const bands = envBands(cicdSceneNodes(p), sceneAxes('cd'));
    expect(bands.map((b) => b.label)).toEqual(['chưa phát hành', 'dev', 'prod']);
    expect(bands.map((b) => b.band)).toEqual([0, 1, 2]);
  });

  it('`isPromotion` chỉ đúng ở chương CD, và chỉ cho cạnh đi LÊN dải', () => {
    const cd = props(cdView());
    const cdEdges = new Map(cicdSceneEdges(cd).map((e) => [e.key, e]));
    const promote = cdEdges.get('deploy-dev->deploy-prod');
    expect(promote).toBeDefined();
    if (promote !== undefined) expect(isPromotion(promote, sceneAxes('cd'))).toBe(true);

    // Ở chương CI, một job chờ lâu hơn có `y` lớn hơn — nhưng đó KHÔNG phải
    // promote, và nhầm hai thứ đó là dạy sai đúng quyết định #13.
    const ci = props(ciView());
    for (const e of cicdSceneEdges(ci)) {
      expect(isPromotion(e, sceneAxes('ci'))).toBe(false);
    }
  });
});

describe('bàn phím', () => {
  it('→ đi THEO CẠNH, ← đi ngược lại', () => {
    const p = props(ciView());
    const axes = sceneAxes(p.view.yAxis);
    const nodes = cicdSceneNodes(p);
    const edges = cicdSceneEdges(p);

    const next = navigateFrom(nodes, edges, 'build', 'ArrowRight', axes);
    expect(next).not.toBeNull();
    const children = edges.filter((e) => e.edge.from === 'build').map((e) => e.edge.to);
    expect(children).toContain(next);

    const back = navigateFrom(nodes, edges, next ?? '', 'ArrowLeft', axes);
    expect(back).toBe('build');
  });

  it('cạnh CHỜ-MÁY cũng đi được bằng bàn phím', () => {
    const p = props(ciView());
    const axes = sceneAxes(p.view.yAxis);
    const nodes = cicdSceneNodes(p);
    const edges = cicdSceneEdges(p);
    // `test[os=windows]` chỉ tới được từ `build` (phụ thuộc) và `test[os=linux]`
    // (chờ máy). Bỏ cạnh máy ra khỏi bàn phím là làm người dùng bàn phím mất
    // một đường mà chuột vẫn có.
    const back = navigateFrom(nodes, edges, 'test[os=windows]', 'ArrowLeft', axes);
    expect(['build', 'test[os=linux]']).toContain(back);
  });

  it('Home/End về hai đầu, và một id lạ không làm nó ném', () => {
    const p = props(ciView());
    const axes = sceneAxes(p.view.yAxis);
    const nodes = cicdSceneNodes(p);
    const edges = cicdSceneEdges(p);
    expect(navigateFrom(nodes, edges, 'build', 'Home', axes)).toBe('build');
    expect(navigateFrom(nodes, edges, 'build', 'End', axes)).toBe('package');
    expect(navigateFrom(nodes, edges, 'không-tồn-tại', 'ArrowRight', axes)).toBe('build');
    expect(navigateFrom([], edges, 'build', 'ArrowRight', axes)).toBeNull();
  });

  it('↓ sang node thấp hơn, và ở node thấp nhất thì ĐỨNG YÊN chứ không vòng lại', () => {
    const p = props(ciView());
    const axes = sceneAxes(p.view.yAxis);
    const nodes = cicdSceneNodes(p);
    const edges = cicdSceneEdges(p);

    const ordered = [...nodes].sort(
      (a, b) => scenePx(a.spot, axes)[1] - scenePx(b.spot, axes)[1],
    );
    const lowest = ordered.at(-1);
    expect(lowest).toBeDefined();
    if (lowest === undefined) return;
    expect(navigateFrom(nodes, edges, lowest.id, 'ArrowDown', axes)).toBeNull();

    const highest = ordered[0];
    if (highest !== undefined) {
      const down = navigateFrom(nodes, edges, highest.id, 'ArrowDown', axes);
      expect(down).not.toBeNull();
      if (down !== null) {
        const target = nodes.find((n) => n.id === down);
        expect(target).toBeDefined();
        if (target !== undefined) {
          expect(scenePx(target.spot, axes)[1]).toBeGreaterThan(scenePx(highest.spot, axes)[1]);
        }
      }
    }
  });
});

describe('formatRunTime — đọc ra giây, giữ tick trong ngoặc', () => {
  it('đổi tick sang giây bằng hằng của hợp đồng, không bằng một hệ số bịa', () => {
    // SECONDS_PER_TICK = 10. Bản đầu để nguyên "N tick" vì tưởng CicdGraphView
    // phải mang tickSeconds — hằng đó đã export ở barrel từ trước chặng này.
    expect(formatRunTime(5)).toBe('50 giây (5 tick)');
  });

  it('quá 60 giây thì đọc thành phút — 9 tick đã là 90 giây', () => {
    expect(formatRunTime(9)).toBe('1 phút 30 giây (9 tick)');
    expect(formatRunTime(30)).toBe('5 phút 0 giây (30 tick)');
    expect(formatRunTime(37)).toBe('6 phút 10 giây (37 tick)');
  });

  it('giữ tick trong ngoặc — người cân bằng level chỉnh bằng tick, không bằng giây', () => {
    expect(formatRunTime(1)).toContain('(1 tick)');
  });
});
