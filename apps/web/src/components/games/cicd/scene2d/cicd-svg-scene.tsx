'use client';

/**
 * Cảnh 2D của game CI/CD — **DOM thật, không canvas** (19.D.2).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÂY LÀ CHẾ ĐỘ MẶC ĐỊNH, KHÔNG PHẢI BẢN DỰ PHÒNG CỦA 3D
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chủ dự án chốt 2026-09-17: "2D là một cảnh THẬT". Đa số người chơi thấy đúng
 * cảnh này. Bốn việc nó giải mà một canvas WebGL không giải được — ba trong bốn
 * KHÔNG liên quan tới phần cứng:
 *
 *   1. máy không cấp được WebGL2;
 *   2. **trình đọc màn hình** — canvas là một ô đen với a11y;
 *   3. **ảnh in** cho báo cáo NCKH (in đen trắng ⇒ màu không còn là một kênh);
 *   4. **test tự động** — assert DOM dễ hơn assert pixel nhiều bậc.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ `<svg role="img">` CỦA BẢN STUB ĐÃ BỊ BỎ CÓ CHỦ Ý
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Theo ARIA, `role="img"` biến **toàn bộ cây con thành presentational**: trình
 * đọc màn hình gộp cả đồ thị thành MỘT nhãn và không đọc từng job nữa — tức xoá
 * đúng lý do #2 ở trên, và mâu thuẫn với chính ô nghiệm thu D.2.9 ("mỗi node có
 * role, có aria-label; bàn phím đi được giữa các job"). axe không có luật nào
 * cấm một phần tử focus được nằm trong `role="img"`, nên cách đó đi qua cổng
 * trong IM LẶNG — đúng hình dạng `rules/green-that-proves-nothing.md` mô tả.
 *
 * Nên: `<svg role="group">` + `aria-labelledby` → `<title>`, `aria-describedby`
 * → `<desc>`. `<title>`/`<desc>` vẫn còn nguyên (yêu cầu "nhãn đọc ra cho cả đồ
 * thị" của `CicdSceneProps.label` được giữ); chỉ cái role đổi, để cây con còn
 * đọc được. Cùng kết luận `git-svg-scene.tsx` đã ghi cho game Git.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THỨ ĐƯỢC VẼ = THỨ `cicdSceneNodes()` / `cicdSceneEdges()` TRẢ VỀ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ Không một chỗ nào trong file này lọc `view.nodes` theo cách riêng. Đó là
 * điều kiện để AC-D2 ("hai renderer vẽ cùng tập node và cạnh") là một phép đo
 * chứ không phải một lời khai — xem đầu `../scene-props.ts`.
 *
 * Hai bộ đếm `data-cicd-node-count` / `data-cicd-edge-count` cũng lấy từ ĐÚNG
 * hai hàm đó, **không** từ `view.nodes.length`: `cicdSceneNodes` là phép GIAO,
 * nên hai số có thể khác nhau, và một bộ đếm nói về `view` thay vì nói về thứ
 * thật sự được vẽ là một bộ đếm nói dối đúng lúc nó cần nói thật.
 */

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { useReducedMotion } from '@devops-platform/motion/react';
import {
  CICD_EDGE_COUNT_ATTR,
  CICD_NODE_COUNT_ATTR,
  CICD_SCENE_TESTIDS,
  cicdSceneEdges,
  cicdSceneNodes,
  sceneAxes,
  type CicdPlacedNode,
  type CicdResolvedEdge,
  type CicdSceneProps,
} from '../scene-props';
import {
  CARD_TEXT_TOKEN,
  CARD_TOKEN,
  CRITICAL_TEXT_TOKEN,
  CRITICAL_TOKEN,
  FOREGROUND_TOKEN,
  SURFACE_LINE_TOKEN,
  SURFACE_TOKEN,
  cssVar,
} from './cicd-palette';
import {
  GUTTER,
  H_STEP,
  NODE_H,
  NODE_W,
  V_STEP_CD,
  criticalCount,
  criticalHasResourceWait,
  envBands,
  isNavKey,
  navigateFrom,
  runTotalTicks,
  scenePx,
  sceneViewBox,
} from './cicd-scene-geometry';
import { CicdSceneEdge } from './cicd-scene-edge';
import { CicdSceneNode } from './cicd-scene-node';
import { useSceneViewport } from './use-scene-viewport';

/** Job nằm trên đường găng = job là một đầu của ít nhất một cạnh găng. */
export function criticalNodeIds(edges: readonly CicdResolvedEdge[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (!e.edge.critical) continue;
    out.add(e.edge.from);
    out.add(e.edge.to);
  }
  return out;
}

const DONE_STATES = new Set(['passed', 'failed', 'skipped']);

/**
 * "Có việc đang chảy qua cạnh này": đầu trên đã xong, đầu dưới thì chưa.
 *
 * Đây là thứ đọc được từ dữ liệu thật thay cho "lưu lượng" mà `DagEdgeView`
 * không mang — xem khối lý lẽ ở đầu `cicd-scene-edge.tsx`.
 */
export function isFlowing(
  edge: CicdResolvedEdge,
  byId: ReadonlyMap<string, CicdPlacedNode>,
): boolean {
  const from = byId.get(edge.edge.from);
  const to = byId.get(edge.edge.to);
  if (from === undefined || to === undefined) return false;
  return DONE_STATES.has(from.node.state) && !DONE_STATES.has(to.node.state);
}

export function CicdSvgScene(props: CicdSceneProps): ReactElement {
  const { view, placement, interaction, label } = props;
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;
  const glowId = `${baseId}-glow`;
  const reduced = useReducedMotion() === true;

  const nodes = useMemo(() => cicdSceneNodes(props), [props]);
  const edges = useMemo(() => cicdSceneEdges(props), [props]);
  const axes = useMemo(() => sceneAxes(view.yAxis), [view.yAxis]);
  const box = useMemo(
    () => sceneViewBox(placement.bounds, axes, placement.laneCount),
    [placement.bounds, placement.laneCount, axes],
  );
  const viewport = useSceneViewport(box);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const criticalIds = useMemo(() => criticalNodeIds(edges), [edges]);
  const bands = useMemo(() => envBands(nodes, axes), [nodes, axes]);
  const totalTicks = useMemo(() => runTotalTicks(nodes), [nodes]);
  const criticalEdgeCount = criticalCount(edges);
  const criticalWaitsOnMachine = criticalHasResourceWait(edges);

  /**
   * Cấp drill-in đang mở (D.2.7). `null` = cấp 1, cả workflow. Có giá trị = cấp
   * 2, tập trung vào một job và hàng xóm trực tiếp của nó.
   */
  const [focusId, setFocusId] = useState<string | null>(null);
  const neighbours = useMemo(() => {
    if (focusId === null) return null;
    const out = new Set<string>([focusId]);
    for (const e of edges) {
      if (e.edge.from === focusId) out.add(e.edge.to);
      if (e.edge.to === focusId) out.add(e.edge.from);
    }
    return out;
  }, [focusId, edges]);

  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const register = useCallback((id: string, el: SVGGElement | null) => {
    if (el === null) nodeRefs.current.delete(id);
    else nodeRefs.current.set(id, el);
  }, []);

  const drillInto = useCallback(
    (id: string) => {
      setFocusId((prev) => (prev === id ? null : id));
      interaction.onDrillIn?.(id);
    },
    [interaction],
  );

  const onNodeKeyDown = useCallback(
    (event: KeyboardEvent<SVGGElement>, id: string) => {
      const key = event.key;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        interaction.onSelect(interaction.selectedId === id ? null : id);
        return;
      }
      if (key === 'i' || key === 'I') {
        event.preventDefault();
        drillInto(id);
        return;
      }
      if (key === 'Escape') {
        event.preventDefault();
        setFocusId(null);
        interaction.onSelect(null);
        return;
      }
      if (!isNavKey(key)) return;
      /*
       * ⛔ `stopPropagation` là bắt buộc, không phải dọn dẹp: mũi tên trên gốc
       * `<svg>` là PAN. Không chặn thì một lần bấm `↓` vừa nhảy sang job dưới
       * vừa kéo cả cảnh đi — và cái kéo đó trông như một lỗi vẽ.
       */
      event.preventDefault();
      event.stopPropagation();
      const next = navigateFrom(nodes, edges, id, key, axes);
      if (next === null) return;
      nodeRefs.current.get(next)?.focus();
    },
    [nodes, edges, axes, interaction, drillInto],
  );

  const onSceneKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (event.key === 'Escape') {
        setFocusId(null);
        interaction.onSelect(null);
        return;
      }
      if (viewport.handleKey(event.key)) event.preventDefault();
    },
    [viewport, interaction],
  );

  const graphLabel = label ?? 'Đồ thị đường ống CI/CD';
  const description = [
    `Đồ thị có ${nodes.length} job và ${edges.length} liên kết.`,
    criticalEdgeCount > 0
      ? `Đường găng gồm ${criticalEdgeCount} đoạn${totalTicks === null ? '' : `, lượt chạy hết ${totalTicks} tick`}.`
      : 'Lượt chạy chưa có đường găng nào được tính.',
    criticalWaitsOnMachine
      ? 'Đường găng đi qua một đoạn chờ máy chạy: muốn nhanh hơn thì thêm máy, sửa đồ thị không đổi được gì.'
      : '',
  ]
    .filter((s) => s.length > 0)
    .join(' ');

  const focused = focusId === null ? null : byId.get(focusId);

  return (
    <svg
      className="h-full w-full touch-none select-none"
      role="group"
      tabIndex={0}
      aria-labelledby={titleId}
      aria-describedby={descId}
      viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      preserveAspectRatio="xMidYMid meet"
      data-testid={CICD_SCENE_TESTIDS.scene2d}
      {...{ [CICD_NODE_COUNT_ATTR]: nodes.length, [CICD_EDGE_COUNT_ATTR]: edges.length }}
      data-cicd-chapter={view.yAxis}
      data-cicd-reduced={reduced ? 'true' : undefined}
      data-cicd-drill={focusId === null ? 'workflow' : 'job'}
      style={{ cursor: viewport.panning ? 'grabbing' : 'grab' }}
      onWheel={viewport.onWheel}
      onPointerDown={viewport.onPointerDown}
      onPointerMove={viewport.onPointerMove}
      onPointerUp={viewport.onPointerUp}
      onPointerLeave={viewport.onPointerUp}
      onKeyDown={onSceneKeyDown}
    >
      <title id={titleId}>{graphLabel}</title>
      <desc id={descId}>{description}</desc>

      <defs>
        {/* Glow của `running` (D.2.5). Không màu — nó nhân đúng màu nguồn lên. */}
        <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        fill={cssVar('--background')}
      />

      <g transform={viewport.transform}>
        {/* ── Nền: dải môi trường (chương CD) ───────────────────────────── */}
        <g aria-hidden="true">
          {bands.map((band) => (
            <g key={`band-${band.band}`} data-cicd-band={band.band}>
              <rect
                x={box.x}
                y={band.y - V_STEP_CD}
                width={box.width}
                height={V_STEP_CD * 2}
                fill={cssVar(SURFACE_TOKEN)}
                opacity={band.band % 2 === 0 ? 0.55 : 0.25}
              />
              <line
                x1={box.x}
                y1={band.y - V_STEP_CD}
                x2={box.x + box.width}
                y2={band.y - V_STEP_CD}
                stroke={cssVar(SURFACE_LINE_TOKEN)}
                strokeWidth={1}
                strokeDasharray="4 8"
              />
              <text
                x={box.x + 18}
                y={band.y - V_STEP_CD + 24}
                fontSize={13}
                fontWeight={700}
                fill={cssVar(SURFACE_LINE_TOKEN)}
              >
                {band.label}
              </text>
            </g>
          ))}

          {/* Cột tầng phụ thuộc — chương nào cũng có, X luôn là thứ tự phụ thuộc. */}
          {Array.from({ length: placement.layerCount }, (_, layer) => (
            <text
              key={`layer-${layer}`}
              x={GUTTER + layer * H_STEP}
              y={box.y + 34}
              textAnchor="middle"
              fontSize={12}
              fill={cssVar(SURFACE_LINE_TOKEN)}
            >
              tầng {layer + 1}
            </text>
          ))}
        </g>

        {/* ── Cạnh ──────────────────────────────────────────────────────── */}
        <g>
          {edges.map((edge) => (
            <CicdSceneEdge
              key={edge.key}
              resolved={edge}
              axes={axes}
              reduced={reduced}
              flowing={isFlowing(edge, byId)}
              dimmed={
                neighbours !== null &&
                !(neighbours.has(edge.edge.from) && neighbours.has(edge.edge.to))
              }
            />
          ))}
        </g>

        {/* ── Job ───────────────────────────────────────────────────────── */}
        <g>
          {nodes.map((placed) => (
            <CicdSceneNode
              key={placed.id}
              placed={placed}
              axes={axes}
              selected={interaction.selectedId === placed.id}
              hovered={interaction.hoveredId === placed.id}
              dimmed={neighbours !== null && !neighbours.has(placed.id)}
              reduced={reduced}
              critical={criticalIds.has(placed.id)}
              glowId={glowId}
              onSelect={(id) => interaction.onSelect(interaction.selectedId === id ? null : id)}
              onHover={interaction.onHover}
              onDrillIn={drillInto}
              onKeyDown={onNodeKeyDown}
              register={register}
            />
          ))}
        </g>

        {/* ── Cấp 3 của drill-in: chi tiết một job ───────────────────────── */}
        {focused !== undefined && focused !== null && (
          <JobDetail placed={focused} axes={axes} />
        )}
      </g>

      {/*
       * Nhãn đường găng + phím tắt nằm NGOÀI nhóm zoom, nên chúng giữ nguyên cỡ
       * chữ ở mọi mức thu phóng. Một nhãn co lại theo zoom là một nhãn không đọc
       * được đúng lúc người chơi thu nhỏ để nhìn toàn cảnh.
       */}
      <CriticalBadge
        box={box}
        segments={criticalEdgeCount}
        totalTicks={totalTicks}
        machineWait={criticalWaitsOnMachine}
      />
      <KeyLegend box={box} />
    </svg>
  );
}

/**
 * Nhãn ĐƯỜNG GĂNG (D.2.4) — thứ 19.A.7 đã tính mà giao diện chưa từng hiện.
 *
 * Nó nói ra thành chữ điều mà tô sáng một mình không nói được: rút ngắn một
 * stage KHÔNG nằm trên đường găng thì không đổi được gì. Và khi đường găng đi
 * qua một đoạn **chờ máy**, nó nói tiếp rằng thứ phải sửa là số máy — nếu không
 * người chơi sẽ đi sửa đồ thị và không hiểu vì sao thời gian đứng yên.
 *
 * ⚠ Đơn vị là TICK. `CicdGraphView` không mang `tickSeconds`, nên đổi ra giây ở
 * đây là bịa một hệ số (đã ghi đề xuất trong báo cáo lane).
 */
function CriticalBadge(props: {
  readonly box: { readonly x: number; readonly y: number; readonly width: number };
  readonly segments: number;
  readonly totalTicks: number | null;
  readonly machineWait: boolean;
}): ReactElement | null {
  if (props.segments === 0) return null;
  const x = props.box.x + 24;
  const y = props.box.y + 24;
  const width = props.machineWait ? 470 : 330;
  return (
    <g data-cicd-critical-badge="true" aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={width}
        height={props.machineWait ? 74 : 48}
        rx={12}
        fill={cssVar(CRITICAL_TOKEN)}
      />
      <text x={x + 16} y={y + 30} fontSize={16} fontWeight={700} fill={cssVar(CRITICAL_TEXT_TOKEN)}>
        Đường găng · {props.segments} đoạn
        {props.totalTicks === null ? '' : ` · lượt chạy hết ${props.totalTicks} tick`}
      </text>
      {props.machineWait && (
        <text x={x + 16} y={y + 56} fontSize={12.5} fill={cssVar(CRITICAL_TEXT_TOKEN)}>
          Có đoạn CHỜ MÁY trên đường găng — thêm máy chạy, sửa đồ thị không đổi được gì.
        </text>
      )}
    </g>
  );
}

/** Phím tắt, viết ra màn hình. Một thao tác chỉ làm được bằng chuột là một thao tác mất. */
function KeyLegend(props: {
  readonly box: { readonly x: number; readonly y: number; readonly height: number };
}): ReactElement {
  return (
    <text
      x={props.box.x + 24}
      y={props.box.y + props.box.height - 22}
      fontSize={12}
      fill={cssVar(SURFACE_LINE_TOKEN)}
      aria-hidden="true"
    >
      Tab: đi giữa các job · ←→: theo phụ thuộc · ↑↓: sang làn kề · Enter: chọn · I: xem chi
      tiết · + − 0: thu phóng · Esc: thoát
    </text>
  );
}

/**
 * Cấp 3 của drill-in (D.2.7) — chi tiết bên trong một job.
 *
 * ⚠ **Kế hoạch ghi "workflow → job → step", và CẤP STEP KHÔNG CÓ DỮ LIỆU.**
 * `CicdGraphView` là `Pick<CicdView, 'nodes' | 'edges' | 'yAxis'>`, và
 * `StageNodeView` không mang danh sách bước nào (không `steps`, không
 * `stepCount`). Bịa ra một danh sách bước ở tầng vẽ là dựng dữ liệu giả trong
 * một giao diện dạy học.
 *
 * Nên cấp 3 ở đây là thứ hợp đồng THẬT SỰ có về bên trong một job: các mốc
 * tick, số lần thử, và cache có trúng không — đúng ba thứ quyết định vì sao job
 * này dài bằng chừng đó. Đề xuất thêm `steps` vào `StageNodeView` đã ghi trong
 * báo cáo lane.
 */
function JobDetail(props: {
  readonly placed: CicdPlacedNode;
  readonly axes: ReturnType<typeof sceneAxes>;
}): ReactElement {
  const { placed, axes } = props;
  const node = placed.node;
  const [cx, cy] = scenePx(placed.spot, axes);
  const x = cx + NODE_W / 2 + 24;
  const y = cy - NODE_H / 2;

  const rows: readonly string[] = [
    `sẵn sàng: ${node.readyTick ?? '—'}`,
    `bắt đầu: ${node.startedTick ?? '—'}`,
    `kết thúc: ${node.finishedTick ?? '—'}`,
    `lần thử: ${node.attempt + 1}`,
    `cache: ${node.cacheHit === null ? 'không dùng' : node.cacheHit ? 'trúng' : 'trượt'}`,
    node.environment === null ? 'không phát hành' : `môi trường: ${node.environment}`,
  ];

  return (
    <g data-cicd-detail={placed.id} aria-hidden="true">
      <rect
        x={x}
        y={y}
        width={224}
        height={26 + rows.length * 20}
        rx={12}
        fill={cssVar(CARD_TOKEN)}
        stroke={cssVar(FOREGROUND_TOKEN)}
        strokeWidth={1.5}
      />
      <text x={x + 14} y={y + 22} fontSize={13} fontWeight={700} fill={cssVar(CARD_TEXT_TOKEN)}>
        Bên trong {node.name}
      </text>
      {rows.map((row, i) => (
        <text
          key={row}
          x={x + 14}
          y={y + 44 + i * 20}
          fontSize={12}
          fill={cssVar(CARD_TEXT_TOKEN)}
        >
          {row}
        </text>
      ))}
    </g>
  );
}
