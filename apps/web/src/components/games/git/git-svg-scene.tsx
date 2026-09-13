'use client';

/**
 * Renderer SVG 2D của game Git (17.B.4). **DOM thật, không canvas.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ MẶT CHÍNH CỦA GAME, KHÔNG PHẢI BẢN DỰ PHÒNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chủ dự án chốt cho đợt này: đường 2D là đường ĐƯỢC ĐÁNH BÓNG DUY NHẤT; tầng
 * 3D (17.K) sang một chặng sau. Design §2.3 vốn đã đặt 2D là chế độ NGANG HÀNG
 * vì nó giải bốn việc mà 3D không giải được, và ba trong bốn việc đó KHÔNG liên
 * quan gì tới phần cứng:
 *
 *   1. máy không cấp được WebGL2;
 *   2. **trình đọc màn hình** — một canvas WebGL là một ô đen với a11y;
 *   3. **ảnh in** cho báo cáo NCKH (in đen trắng ⇒ màu không còn là một kênh);
 *   4. **test tự động** — assert DOM dễ hơn assert pixel nhiều bậc.
 *
 * Mục 2 và 3 là lý do mọi trạng thái ở đây mã hoá ít nhất ba kênh, và lý do
 * "mờ" không bao giờ được làm bằng `opacity` (xem `git-palette.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ `role="img"` ĐÃ BỊ TỪ CHỐI CÓ CHỦ Ý — ĐỌC TRƯỚC KHI "SỬA LẠI"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brief của lane ghi `<svg role="img">` với `<title>`/`<desc>`, và điều đó mâu
 * thuẫn với chính ô nghiệm thu ngay dưới nó ("mỗi node là một phần tử focus
 * được, có role, có aria-label").
 *
 * Theo ARIA, `role="img"` khiến **toàn bộ cây con thành presentational**: trình
 * đọc màn hình gộp cả đồ thị thành MỘT nhãn duy nhất và không đọc từng node
 * nữa. Tức là nó xoá đúng cái lý do #2 ở trên — hai trăm commit trở thành một
 * câu. axe không bắt lỗi này (không có luật nào cấm phần tử focus được nằm
 * trong `role="img"`), nên nó sẽ đi qua cổng trong im lặng, đúng hình dạng mà
 * `rules/green-that-proves-nothing.md` mô tả.
 *
 * Nên: `<svg role="group">` + `aria-labelledby` trỏ vào `<title>` và
 * `aria-describedby` trỏ vào `<desc>`. **`<title>`/`<desc>` vẫn còn nguyên** —
 * yêu cầu thật của brief ("mô tả đồ thị bằng lời") được giữ; chỉ cái role đổi,
 * để cây con còn đọc được. Mỗi kho là một `role="group"` lồng có nhãn riêng,
 * mỗi commit là một `role="button"` focus được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BÀN PHÍM ĐỦ CHO MỌI THAO TÁC (AC-L)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `Tab` đi qua từng commit (mọi node `tabIndex={0}`, không dùng roving
 * tabindex) · `→` theo cạnh xuống con, `←` theo cạnh về cha thứ nhất · `↑`/`↓`
 * sang làn trên/dưới, và **bắc được qua khoảng trống giữa hai kho** · `Enter`
 * hoặc `Space` chọn · `Home`/`End` về commit đầu/cuối. Không thao tác nào chỉ
 * làm được bằng chuột.
 *
 * Vì sao KHÔNG roving tabindex (khuôn APG cho grid/tree): với roving thì `Tab`
 * RỜI KHỎI đồ thị sau một node, mà brief yêu cầu "Tab giữa các node". Đánh đổi
 * đã biết: ở một level đông, `Tab` phải bấm nhiều lần để đi hết — bù lại bằng
 * `Home`/`End` và bằng mũi tên đi theo cạnh, tức đường đi ngắn luôn có sẵn.
 */

import { useCallback, useId, useMemo, useRef, type KeyboardEvent, type ReactElement } from 'react';
import { cn } from '@devops-platform/ui';
import {
  laneLabels,
  refsAt,
  sceneEdges,
  sceneNodeId,
  sceneNodes,
  type SceneLayout,
  type SceneNodeId,
  type ScenePlacedNode,
  type SceneProps,
  type SceneRefBadge,
  type SceneRepo,
} from '../shared/scene-props.ts';
import { ACCENT_STYLE, EDGE_STYLE, REF_STYLE, cssVar } from './git-palette.ts';

// ═══════════════════════════════════════════════════════════════════════════
// Lưới — px. Đây là nơi DUY NHẤT ô lưới của `core/layout/` thành pixel.
// ═══════════════════════════════════════════════════════════════════════════

const NODE_W = 104;
const NODE_H = 44;
/** Bước ngang một tầng. Lớn hơn `NODE_W` để còn khe cho nhãn làn lặp lại. */
const DEPTH_STEP = 148;
const LANE_STEP = 84;
/** Cột trái giữ nhãn làn đầy đủ. */
const GUTTER = 92;
const PAD_TOP = 38;
const PAD_BOTTOM = 24;
/** Khoảng trống giữa hai kho. Đủ rộng để đọc ra "hai khối", không phải "một khối có kẻ". */
const REPO_GAP = 88;
const BADGE_H = 20;
const BADGE_GAP = 4;
/** Lặp nhãn làn sau mỗi bao nhiêu cột. Xem `laneLabels()` về vì sao phải lặp. */
const LANE_LABEL_EVERY = 3;

function columnX(depth: number): number {
  return GUTTER + depth * DEPTH_STEP;
}

function laneY(top: number, lane: number): number {
  return top + lane * LANE_STEP;
}

function regionHeight(layout: SceneLayout): number {
  return Math.max(layout.laneCount, 1) * LANE_STEP;
}

interface Region {
  readonly repo: SceneRepo;
  readonly layout: SceneLayout;
  readonly top: number;
  readonly label: string;
}

/**
 * Đường gấp khúc **GÓC VUÔNG** từ các điểm ô lưới.
 *
 * `core/layout/edge-route.ts` đã trả đường góc vuông (nó export cả
 * `countDiagonalSegments` để test khẳng định 0 đoạn chéo). Hàm này vẫn tự chèn
 * khuỷu khi một đoạn đổi CẢ hai toạ độ: một đoạn chéo lọt vào đây sẽ không
 * hỏng gì thấy được, nó chỉ làm đồ thị khó lần theo hơn một chút mỗi lần — tức
 * là một hồi quy im lặng. Chèn khuỷu là rẻ và làm tính chất này đúng tại chỗ
 * vẽ, chứ không chỉ đúng ở tầng tính.
 *
 * ⛔ KHÔNG bundling cạnh. Gom nhiều cạnh vào một bó làm màn hình gọn hơn và phá
 * đúng việc game dạy: lần theo MỘT đường phụ thuộc từ commit này về commit kia.
 */
function orthogonalPath(points: readonly (readonly [number, number])[], top: number): string {
  if (points.length === 0) return '';
  const px = points.map(([depth, lane]) => [
    columnX(depth) + NODE_W / 2,
    laneY(top, lane) + NODE_H / 2,
  ]);
  const first = px[0] as [number, number];
  let d = `M ${first[0]} ${first[1]}`;
  for (let i = 1; i < px.length; i++) {
    const prev = px[i - 1] as [number, number];
    const cur = px[i] as [number, number];
    if (prev[0] !== cur[0] && prev[1] !== cur[1]) {
      // Ngang trước, dọc sau — một quy ước, giữ cố định để hình dạng ổn định.
      d += ` L ${cur[0]} ${prev[1]}`;
    }
    d += ` L ${cur[0]} ${cur[1]}`;
  }
  return d;
}

/** Đường nối hai điểm bất kỳ bằng ba đoạn góc vuông (cạnh không nằm trong layout). */
function elbowPath(from: readonly [number, number], to: readonly [number, number]): string {
  const midX = (from[0] + to[0]) / 2;
  return `M ${from[0]} ${from[1]} L ${midX} ${from[1]} L ${midX} ${to[1]} L ${to[0]} ${to[1]}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Điều hướng bàn phím — HÀM THUẦN, test được không cần render
// ═══════════════════════════════════════════════════════════════════════════

export type NavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

const REPO_ORDER: Readonly<Record<SceneRepo, number>> = { local: 0, origin: 1 };

/**
 * Node kế tiếp khi bấm một phím điều hướng. `null` = không đi đâu được.
 *
 * `←`/`→` đi theo CẠNH (cha thứ nhất / con đầu tiên) — đó là cách người ta đọc
 * một DAG, và nó dạy đúng thứ game dạy. `↑`/`↓` đi theo LÀN, và cố ý bắc được
 * qua khoảng trống giữa hai kho: nếu không, mọi commit của `origin` chỉ tới
 * được bằng `Tab`, và một người dùng bàn phím ở giữa đồ thị sẽ tưởng kho kia
 * không tồn tại.
 */
export function navigateFrom(
  placed: readonly ScenePlacedNode[],
  currentId: SceneNodeId,
  key: NavKey,
): SceneNodeId | null {
  if (placed.length === 0) return null;
  if (key === 'Home') return placed[0]?.id ?? null;
  if (key === 'End') return placed[placed.length - 1]?.id ?? null;

  const current = placed.find((n) => n.id === currentId);
  if (current === undefined) return placed[0]?.id ?? null;

  if (key === 'ArrowLeft') {
    const parent = current.node.parents[0];
    if (parent === undefined) return null;
    const id = sceneNodeId(current.node.repo, parent);
    return placed.some((n) => n.id === id) ? id : null;
  }

  if (key === 'ArrowRight') {
    const children = placed.filter(
      (n) => n.node.repo === current.node.repo && n.node.parents.includes(current.node.oid),
    );
    return children[0]?.id ?? null;
  }

  // ↑ / ↓ — làn liền kề, kể cả sang kho bên cạnh.
  const rank = (n: ScenePlacedNode): number => REPO_ORDER[n.node.repo] * 1_000_000 + n.lane;
  const here = rank(current);
  const wanted = key === 'ArrowUp' ? Math.max(...ranksBelow(placed, here)) : Math.min(...ranksAbove(placed, here));
  if (!Number.isFinite(wanted)) return null;

  const band = placed.filter((n) => rank(n) === wanted);
  const best = band.reduce((a, b) =>
    Math.abs(a.depth - current.depth) <= Math.abs(b.depth - current.depth) ? a : b,
  );
  return best.id;
}

function ranksBelow(placed: readonly ScenePlacedNode[], here: number): number[] {
  const all = placed.map((n) => REPO_ORDER[n.node.repo] * 1_000_000 + n.lane).filter((r) => r < here);
  return all.length === 0 ? [Number.NEGATIVE_INFINITY] : all;
}

function ranksAbove(placed: readonly ScenePlacedNode[], here: number): number[] {
  const all = placed.map((n) => REPO_ORDER[n.node.repo] * 1_000_000 + n.lane).filter((r) => r > here);
  return all.length === 0 ? [Number.POSITIVE_INFINITY] : all;
}

function isNavKey(key: string): key is NavKey {
  return (
    key === 'ArrowLeft' ||
    key === 'ArrowRight' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'Home' ||
    key === 'End'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Nhãn đọc ra
// ═══════════════════════════════════════════════════════════════════════════

const REPO_LABEL: Readonly<Record<SceneRepo, string>> = {
  local: 'Kho trên máy bạn (local)',
  origin: 'Kho từ xa (origin)',
};

/**
 * Câu mô tả một commit cho trình đọc màn hình.
 *
 * Xuất khẩu để renderer 3D (P17b) đọc ra **đúng một câu** cho cùng một commit.
 * Hai renderer mô tả khác nhau là một lỗi a11y mà không cổng nào bắt được —
 * axe chỉ kiểm có nhãn hay không, không kiểm hai nhãn có khớp nhau không.
 */
export function commitAriaLabel(
  placed: ScenePlacedNode,
  refNames: readonly string[],
): string {
  const node = placed.node;
  const parts = [
    `Commit ${node.shortOid}: ${node.message}`,
    ACCENT_STYLE[node.accent].label,
    node.reachable ? 'còn với tới được' : 'đã mất, chỉ còn trong kho object',
    refNames.length === 0 ? 'không ref nào trỏ tới' : `được trỏ tới bởi ${refNames.join(', ')}`,
    `tác giả ${node.author}`,
    REPO_LABEL[node.repo],
  ];
  return `${parts.join('. ')}.`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Chuyển động — một khối, và nó TỰ TẮT dưới prefers-reduced-motion
// ═══════════════════════════════════════════════════════════════════════════

/*
 * Đặt trong `<style>` của chính SVG chứ không thêm vào một stylesheet chung:
 * lane này không sở hữu file `.css` nào, và quan trọng hơn — bốn keyframe này
 * chỉ có nghĩa với cảnh Git, nên để chúng sống cạnh chỗ dùng là đúng phạm vi.
 *
 * Không một màu nào ở đây, chỉ `transform` và `opacity` — nên cổng màu không có
 * gì để kêu, và trình duyệt chạy cả bốn trên compositor.
 */
const MOTION_CSS = `
.gitscene-pulse { animation: gitscene-pulse 2s var(--ease-out) infinite; transform-box: fill-box; transform-origin: center; }
.gitscene-pop { animation: gitscene-pop var(--motion-slow) var(--ease-out) 1; transform-box: fill-box; transform-origin: center; }
.gitscene-shake { animation: gitscene-shake 520ms var(--ease-out) 2; transform-box: fill-box; transform-origin: center; }
@keyframes gitscene-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes gitscene-pop { from { transform: scale(0.82); } to { transform: scale(1); } }
@keyframes gitscene-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
@media (prefers-reduced-motion: reduce) {
  .gitscene-pulse, .gitscene-pop, .gitscene-shake { animation: none; }
}
`;

const MOTION_CLASS = {
  none: undefined,
  pulse: 'gitscene-pulse',
  pop: 'gitscene-pop',
  shake: 'gitscene-shake',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export interface GitSvgSceneProps extends SceneProps {
  readonly className?: string;
}

export function GitSvgScene(props: GitSvgSceneProps): ReactElement {
  const { view, layouts, interaction, label, className } = props;
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;
  const nodeRefs = useRef(new Map<SceneNodeId, SVGGElement>());

  const placed = useMemo(() => sceneNodes(props), [props]);
  const edges = useMemo(() => sceneEdges(props), [props]);

  const regions = useMemo<readonly Region[]>(() => {
    const localHeight = regionHeight(layouts.local);
    const out: Region[] = [
      { repo: 'local', layout: layouts.local, top: PAD_TOP, label: REPO_LABEL.local },
    ];
    if (layouts.origin !== null) {
      out.push({
        repo: 'origin',
        layout: layouts.origin,
        top: PAD_TOP + localHeight + REPO_GAP,
        label: REPO_LABEL.origin,
      });
    }
    return out;
  }, [layouts]);

  const topOf = useCallback(
    (repo: SceneRepo): number => regions.find((r) => r.repo === repo)?.top ?? PAD_TOP,
    [regions],
  );

  const centerOf = useCallback(
    (id: SceneNodeId): readonly [number, number] | null => {
      const spot = placed.find((n) => n.id === id);
      if (spot === undefined) return null;
      return [
        columnX(spot.depth) + NODE_W / 2,
        laneY(topOf(spot.node.repo), spot.lane) + NODE_H / 2,
      ];
    },
    [placed, topOf],
  );

  const depthCount = Math.max(1, ...regions.map((r) => r.layout.depthCount));
  const lastRegion = regions[regions.length - 1];
  const width = GUTTER + (depthCount - 1) * DEPTH_STEP + NODE_W + 48;
  const height =
    (lastRegion === undefined ? PAD_TOP : lastRegion.top + regionHeight(lastRegion.layout)) +
    PAD_BOTTOM;

  const onKeyDown = useCallback(
    (event: KeyboardEvent<SVGGElement>, id: SceneNodeId): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        interaction.onSelect(interaction.selectedId === id ? null : id);
        return;
      }
      if (!isNavKey(event.key)) return;
      const next = navigateFrom(placed, id, event.key);
      if (next === null) return;
      event.preventDefault();
      nodeRefs.current.get(next)?.focus();
    },
    [interaction, placed],
  );

  const summary = describeGraph(view.nodes.length, edges.length, regions.length, view.detached);

  return (
    <svg
      role="group"
      aria-labelledby={titleId}
      aria-describedby={descId}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      className={cn('block h-auto w-full select-none', className)}
    >
      <title id={titleId}>{label ?? 'Đồ thị commit của kho Git'}</title>
      <desc id={descId}>{summary}</desc>
      <style>{MOTION_CSS}</style>

      {/* Cạnh vẽ TRƯỚC node để node luôn nằm trên, không bị nét cắt ngang chữ. */}
      <g aria-hidden="true">
        {edges.map((edge) => {
          const style = EDGE_STYLE[edge.kind];
          const routed =
            edge.repo === null
              ? null
              : regions
                  .find((r) => r.repo === edge.repo)
                  ?.layout.edges.find(
                    (e) =>
                      sceneNodeId(edge.repo as SceneRepo, e.from) === edge.to &&
                      sceneNodeId(edge.repo as SceneRepo, e.to) === edge.from,
                  );
          const from = centerOf(edge.from);
          const to = centerOf(edge.to);
          if (from === null || to === null) return null;
          const d =
            routed === undefined || routed === null
              ? elbowPath(from, to)
              : orthogonalPath(routed.points, topOf(edge.repo as SceneRepo));
          return (
            <g key={edge.key}>
              <path
                d={d}
                fill="none"
                stroke={cssVar(style.stroke)}
                strokeWidth={style.width}
                strokeLinecap="square"
                strokeLinejoin="miter"
                {...(style.dash === null ? {} : { strokeDasharray: style.dash })}
              />
              {style.joint ? (
                <circle cx={from[0]} cy={from[1]} r={4} fill={cssVar(style.stroke)} />
              ) : null}
            </g>
          );
        })}
      </g>

      {regions.map((region) => (
        <RepoRegion
          key={region.repo}
          region={region}
          props={props}
          placed={placed}
          nodeRefs={nodeRefs}
          onKeyDown={onKeyDown}
        />
      ))}
    </svg>
  );
}

function describeGraph(
  nodeCount: number,
  edgeCount: number,
  repoCount: number,
  detached: boolean,
): string {
  const kho = repoCount > 1 ? 'hai kho tách rời: kho trên máy bạn và kho từ xa' : 'một kho duy nhất';
  const head = detached
    ? 'HEAD đang ở trạng thái detached — nó trỏ thẳng vào một commit, không qua nhánh nào.'
    : 'HEAD đang trỏ vào một nhánh.';
  return (
    `Đồ thị commit gồm ${nodeCount} commit và ${edgeCount} liên kết, xếp thành ${kho}. ` +
    `${head} Dùng Tab để đi qua từng commit; mũi tên trái và phải đi theo quan hệ cha con; ` +
    `mũi tên lên và xuống đổi làn nhánh; Enter để chọn.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function RepoRegion({
  region,
  props,
  placed,
  nodeRefs,
  onKeyDown,
}: {
  readonly region: Region;
  readonly props: SceneProps;
  readonly placed: readonly ScenePlacedNode[];
  readonly nodeRefs: React.RefObject<Map<SceneNodeId, SVGGElement>>;
  readonly onKeyDown: (event: KeyboardEvent<SVGGElement>, id: SceneNodeId) => void;
}): ReactElement {
  const { view, interaction } = props;
  const mine = placed.filter((n) => n.node.repo === region.repo);
  const lanes = laneLabels(view, region.layout, region.repo);

  return (
    <g role="group" aria-label={`${region.label}, ${mine.length} commit`}>
      <text
        x={8}
        y={region.top - 14}
        fill={cssVar('--muted-foreground')}
        fontSize={12}
        fontWeight={600}
      >
        {region.label}
      </text>

      {/* Nhãn làn, LẶP LẠI dọc theo làn — xem `laneLabels()` về nghịch lý VR-Git. */}
      {Object.entries(lanes).map(([lane, name]) => {
        const y = laneY(region.top, Number(lane)) + NODE_H / 2 + 4;
        const repeats: number[] = [];
        for (let d = LANE_LABEL_EVERY; d < region.layout.depthCount; d += LANE_LABEL_EVERY) {
          repeats.push(d);
        }
        return (
          <g key={`${region.repo}-lane-${lane}`} aria-hidden="true">
            <text x={8} y={y} fill={cssVar('--muted-foreground')} fontSize={11}>
              {name}
            </text>
            {repeats.map((d) => (
              <text
                key={d}
                x={columnX(d) - 8}
                y={y - 14}
                textAnchor="end"
                fill={cssVar('--muted-foreground')}
                fontSize={9}
              >
                {name}
              </text>
            ))}
          </g>
        );
      })}

      {mine.map((spot) => (
        <CommitNode
          key={spot.id}
          spot={spot}
          top={region.top}
          refs={refsAt(view, region.repo, spot.node.oid)}
          selected={interaction.selectedId === spot.id}
          hovered={interaction.hoveredId === spot.id}
          onSelect={interaction.onSelect}
          onHover={interaction.onHover}
          onKeyDown={onKeyDown}
          register={(el) => {
            if (el === null) nodeRefs.current.delete(spot.id);
            else nodeRefs.current.set(spot.id, el);
          }}
        />
      ))}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function CommitNode({
  spot,
  top,
  refs,
  selected,
  hovered,
  onSelect,
  onHover,
  onKeyDown,
  register,
}: {
  readonly spot: ScenePlacedNode;
  readonly top: number;
  readonly refs: readonly SceneRefBadge[];
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly onSelect: (id: SceneNodeId | null) => void;
  readonly onHover: (id: SceneNodeId | null) => void;
  readonly onKeyDown: (event: KeyboardEvent<SVGGElement>, id: SceneNodeId) => void;
  readonly register: (el: SVGGElement | null) => void;
}): ReactElement {
  const style = ACCENT_STYLE[spot.node.accent];
  const x = columnX(spot.depth);
  const y = laneY(top, spot.lane);
  const rx = style.shape === 'sharp' ? 1 : 8;
  const dashed = style.shape === 'dashed';

  return (
    <g
      ref={register}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={commitAriaLabel(
        spot,
        refs.map((r) => `${REF_STYLE[r.kind].label} ${r.shortName}`),
      )}
      className={cn('cursor-pointer outline-none', MOTION_CLASS[style.motion])}
      onClick={() => onSelect(selected ? null : spot.id)}
      onKeyDown={(event) => onKeyDown(event, spot.id)}
      onFocus={() => onHover(spot.id)}
      onBlur={() => onHover(null)}
      onMouseEnter={() => onHover(spot.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* `stacked` = hai tờ giấy chồng lên nhau; kênh hình học của trạng thái "bản sao". */}
      {style.shape === 'stacked' ? (
        <rect
          x={x + 5}
          y={y - 5}
          width={NODE_W}
          height={NODE_H}
          rx={rx}
          fill={cssVar(style.fill)}
          stroke={cssVar(style.stroke)}
          strokeWidth={style.strokeWidth}
        />
      ) : null}

      {/* `ringed` = vòng ngoài đồng tâm; kênh hình học của "HEAD ở đây". */}
      {style.shape === 'ringed' ? (
        <rect
          x={x - 5}
          y={y - 5}
          width={NODE_W + 10}
          height={NODE_H + 10}
          rx={rx + 3}
          fill="none"
          stroke={cssVar(style.stroke)}
          strokeWidth={1.5}
        />
      ) : null}

      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx={rx}
        fill={cssVar(style.fill)}
        stroke={cssVar(selected || hovered ? '--ring' : style.stroke)}
        strokeWidth={selected ? style.strokeWidth + 1.5 : style.strokeWidth}
        {...(dashed ? { strokeDasharray: '5 4' } : {})}
      />

      <text
        x={x + 10}
        y={y + 18}
        fill={cssVar(style.text)}
        fontSize={12}
        fontFamily="var(--font-mono, monospace)"
      >
        {spot.node.shortOid}
      </text>
      <text x={x + 10} y={y + 34} fill={cssVar(style.text)} fontSize={11}>
        {truncate(spot.node.message, 15)}
      </text>
      {style.sigil === '' ? null : (
        <text
          x={x + NODE_W - 9}
          y={y + 16}
          textAnchor="end"
          fill={cssVar(style.text)}
          fontSize={13}
          fontWeight={700}
        >
          {style.sigil}
        </text>
      )}

      {refs.map((ref, index) => (
        <RefBadge
          key={ref.name}
          badge={ref}
          x={x}
          y={y - BADGE_H - BADGE_GAP - index * (BADGE_H + BADGE_GAP)}
        />
      ))}
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════════════

function RefBadge({
  badge,
  x,
  y,
}: {
  readonly badge: SceneRefBadge;
  readonly x: number;
  readonly y: number;
}): ReactElement {
  const style = REF_STYLE[badge.kind];
  const text = badge.shortName;
  const width = 14 + text.length * 6.6 + (badge.isCurrent ? 12 : 0);
  const notch = style.shape === 'notched' ? 7 : 0;

  return (
    <g aria-hidden="true">
      {style.shape === 'double' ? (
        <rect
          x={x - 3}
          y={y - 3}
          width={width + 6}
          height={BADGE_H + 6}
          rx={5}
          fill="none"
          stroke={cssVar(style.fill)}
          strokeWidth={1.5}
        />
      ) : null}
      {notch === 0 ? (
        <rect
          x={x}
          y={y}
          width={width}
          height={BADGE_H}
          rx={4}
          fill={cssVar(style.fill)}
          {...(style.shape === 'dashed'
            ? { stroke: cssVar(style.text), strokeWidth: 1, strokeDasharray: '3 3' }
            : {})}
        />
      ) : (
        <path
          d={`M ${x + notch} ${y} L ${x + width} ${y} L ${x + width} ${y + BADGE_H} L ${x + notch} ${y + BADGE_H} L ${x} ${y + BADGE_H / 2} Z`}
          fill={cssVar(style.fill)}
        />
      )}
      <text
        x={x + notch + 6}
        y={y + 14}
        fill={cssVar(style.text)}
        fontSize={11}
        fontWeight={badge.isCurrent ? 700 : 500}
      >
        {badge.isCurrent ? `* ${text}` : text}
      </text>
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
