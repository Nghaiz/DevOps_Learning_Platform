'use client';

/**
 * Một job trong cảnh 2D (19.D.2.2 + D.2.5 + D.2.9).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `role="button"`, KHÔNG `role="img"` — ĐỌC TRƯỚC KHI "SỬA LẠI THEO KẾ HOẠCH"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Brief của lane ghi `role="img"` cho mỗi node. Node ở đây **bấm được** (chọn,
 * drill-in) và **đi tới được bằng bàn phím** — hai việc mà chính brief đòi ở
 * cùng một gạch đầu dòng. Một phần tử focus được, phản hồi `Enter`/`Space`, mà
 * tự khai là `img`, nói với trình đọc màn hình rằng nó là một bức ảnh: người
 * dùng nghe xong không biết bấm được.
 *
 * Tiền lệ trong chính repo này: `git-svg-scene.tsx` từ chối `role="img"` ở gốc
 * `<svg>` vì ARIA biến TOÀN BỘ cây con thành presentational, và dùng
 * `role="button"` cho mỗi commit. axe không có luật nào cấm cả hai cách, nên
 * chọn sai sẽ đi qua cổng trong im lặng — đúng hình dạng
 * `rules/green-that-proves-nothing.md` mô tả.
 *
 * Thứ brief THỰC SỰ đòi — "aria-label nói trạng thái bằng CHỮ" — được giữ
 * nguyên: nhãn lấy từ `StageNodeView.ariaLabel` mà hợp đồng đã dựng sẵn bằng
 * tiếng Việt. Đã ghi vào báo cáo lane như một sai lệch có chủ ý.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỐN KÊNH, KHÔNG PHẢI MỘT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * màu (`paintOf().fill`) · hình học (`GEOMETRY_STYLE`) · chuyển động
 * (`effectiveMotion`) · **chữ** (icon + nhãn trạng thái viết ra trong hộp).
 *
 * Kênh chữ là kênh duy nhất sống sót qua CẢ `prefers-reduced-motion` (giết kênh
 * chuyển động) LẪN bản in đen trắng của báo cáo NCKH (giết kênh màu). Nên nhãn
 * trạng thái được VIẾT RA trong hộp, không chỉ nằm trong `aria-label`.
 */

import { useId, type KeyboardEvent, type ReactElement } from 'react';
import { motion } from '@devops-platform/motion/react';
import {
  CICD_NODE_ATTR,
  CICD_NODE_STATE_ATTR,
  type CicdPlacedNode,
  type SceneAxes,
} from '../scene-props';
import {
  CRITICAL_TOKEN,
  FOREGROUND_TOKEN,
  SURFACE_LINE_TOKEN,
  cssVar,
  effectiveMotion,
  nodeAriaLabel,
  paintOf,
} from './cicd-palette';
import { NODE_H, NODE_W, scenePx, waitTicks } from './cicd-scene-geometry';

/** Độ sâu giả: hộp nổi lên bao nhiêu px so với "mặt sàn" phía sau nó. */
const DEPTH = 7;
/** Cạnh của góc bị khuyết (`notched`). */
const NOTCH = 22;
/** Hộp `sunken` chìm xuống bao nhiêu px dưới mép sàn. */
const SINK = 9;
const RADIUS = 12;

/**
 * `d` của thân hộp. Góc khuyết (`notched`) nằm ở góc TRÊN-PHẢI, cùng chỗ với
 * badge trạng thái — hai kênh chồng nhau ở một điểm mắt đã phải nhìn.
 */
export function bodyPath(w: number, h: number, notch: boolean): string {
  const r = RADIUS;
  const top = notch
    ? `M ${r} 0 H ${w - NOTCH} L ${w} ${NOTCH}`
    : `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r}`;
  return [
    top,
    `V ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    `H ${r}`,
    `Q 0 ${h} 0 ${h - r}`,
    `V ${r}`,
    `Q 0 0 ${r} 0`,
    'Z',
  ].join(' ');
}

/** Cắt tên job cho vừa hộp. `textLength` co chữ lại đến mức không đọc được. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export interface CicdSceneNodeProps {
  readonly placed: CicdPlacedNode;
  readonly axes: SceneAxes;
  readonly selected: boolean;
  readonly hovered: boolean;
  /** Bị đẩy ra nền vì drill-in đang tập trung vào một job khác (D.2.7). */
  readonly dimmed: boolean;
  readonly reduced: boolean;
  /** `true` khi job này nằm trên đường găng (D.2.4). */
  readonly critical: boolean;
  readonly glowId: string;
  readonly onSelect: (id: string) => void;
  readonly onHover: (id: string | null) => void;
  readonly onDrillIn?: ((id: string) => void) | undefined;
  readonly onKeyDown: (event: KeyboardEvent<SVGGElement>, id: string) => void;
  readonly register: (id: string, el: SVGGElement | null) => void;
}

export function CicdSceneNode(props: CicdSceneNodeProps): ReactElement {
  const { placed, axes, selected, hovered, dimmed, reduced, critical } = props;
  const node = placed.node;
  const paint = paintOf(node.state);
  const geo = paint.geometry;
  const motionKind = effectiveMotion(paint.motion, reduced);
  const hatchId = `${useId()}-hatch`;

  const [cx, cy] = scenePx(placed.spot, axes);
  const x = cx - NODE_W / 2;
  const y = cy - NODE_H / 2;
  const sink = geo.sunk ? SINK : 0;
  const wait = waitTicks(placed);

  const fill = cssVar(paint.fill);
  const text = cssVar(paint.text);
  const stroke = cssVar(paint.stroke);

  /*
   * ⛔ Node "mờ" khi drill-in KHÔNG dùng `opacity` — cùng lý do đã ghi ở
   * `cicd-palette.ts`: hạ opacity hạ luôn tương phản chữ theo đúng hệ số đó và
   * ô a11y mất. Ở đây "ra nền" là **bỏ tô nền** + nét mảnh hơn, chữ giữ nguyên
   * token của nó.
   */
  const bodyFill = dimmed ? cssVar('--muted') : fill;
  const bodyText = dimmed ? cssVar('--muted-foreground') : text;
  const bodyStroke = dimmed ? cssVar(SURFACE_LINE_TOKEN) : stroke;

  return (
    <motion.g
      initial={false}
      /*
       * D.2.6 — node GIỮ ĐỊNH DANH giữa hai lượt chạy. `key` ở bên gọi là
       * `InstanceKey`, nên React không tháo/dựng lại phần tử khi đồ thị xếp
       * lại; framer-motion nội suy từ chỗ cũ sang chỗ mới. Đổi `key` sang chỉ
       * số mảng là mất trọn tính chất này mà không gì đỏ.
       */
      animate={{ x, y }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 180, damping: 26 }}
    >
      <g
        ref={(el) => props.register(placed.id, el)}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={nodeAriaLabel(node)}
        {...{ [CICD_NODE_ATTR]: placed.id, [CICD_NODE_STATE_ATTR]: node.state }}
        data-cicd-motion={motionKind}
        data-cicd-node-critical={critical ? 'true' : undefined}
        className="cursor-pointer outline-none"
        onClick={() => props.onSelect(placed.id)}
        onDoubleClick={() => props.onDrillIn?.(placed.id)}
        onKeyDown={(event) => props.onKeyDown(event, placed.id)}
        onFocus={() => props.onHover(placed.id)}
        onBlur={() => props.onHover(null)}
        onMouseEnter={() => props.onHover(placed.id)}
        onMouseLeave={() => props.onHover(null)}
      >
        <title>{nodeAriaLabel(node)}</title>

        {/* Vành chọn/hover — ngoài cùng, không đụng vào hộp. */}
        {(selected || hovered) && (
          <rect
            x={-7}
            y={-7 + sink}
            width={NODE_W + 14}
            height={NODE_H + 14}
            rx={RADIUS + 6}
            fill="none"
            stroke={cssVar(selected ? FOREGROUND_TOKEN : SURFACE_LINE_TOKEN)}
            strokeWidth={selected ? 3 : 1.5}
            strokeDasharray={selected ? undefined : '5 5'}
          />
        )}

        {/* Mép sàn của node `sunken`: hộp chìm xuống DƯỚI đường này. */}
        {geo.sunk && (
          <line
            x1={-4}
            y1={0}
            x2={NODE_W + 4}
            y2={0}
            stroke={cssVar(SURFACE_LINE_TOKEN)}
            strokeWidth={2}
          />
        )}

        <motion.g
          animate={motionKind === 'shake-once' ? { x: [0, -5, 5, -3, 0] } : { x: 0 }}
          transition={motionKind === 'shake-once' ? { duration: 0.45 } : { duration: 0 }}
        >
          {/* Chiều sâu giả: một lớp sàn tối hơn lệch xuống dưới thân hộp. */}
          {geo.depth && (
            <path
              d={bodyPath(NODE_W, NODE_H, geo.notch)}
              transform={`translate(0 ${DEPTH + sink})`}
              fill={cssVar(SURFACE_LINE_TOKEN)}
              opacity={0.35}
            />
          )}

          <g transform={`translate(0 ${sink})`}>
            <path
              d={bodyPath(NODE_W, NODE_H, geo.notch)}
              fill={bodyFill}
              stroke={bodyStroke}
              strokeWidth={geo.strokeWidth}
              strokeDasharray={geo.dash ?? undefined}
              filter={motionKind === 'spin' ? `url(#${props.glowId})` : undefined}
            />

            {/*
             * Gạch chéo của `hollow`. ⚠ Đây là chỗ "theme sáng không phải theme
             * tối đảo ngược" cắn: wireframe RỖNG biến mất trên nền trắng, nên
             * `skipped` là ĐẶC (`--muted`) + gạch chéo ở cả hai theme.
             */}
            {geo.hatch && (
              <>
                <defs>
                  <pattern
                    id={hatchId}
                    width={9}
                    height={9}
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <line
                      x1={0}
                      y1={0}
                      x2={0}
                      y2={9}
                      stroke={cssVar(SURFACE_LINE_TOKEN)}
                      strokeWidth={2}
                    />
                  </pattern>
                </defs>
                <path
                  d={bodyPath(NODE_W, NODE_H, geo.notch)}
                  fill={`url(#${hatchId})`}
                  stroke="none"
                />
              </>
            )}

            {/*
             * Mép trên bắt sáng — kênh "khối 3D giả" của D.2.2.
             *
             * ⚠ Đây là chỗ "theme sáng không phải theme tối đảo ngược" suýt cắn.
             * Cách hiển nhiên — phủ một mảng `--background` mờ 22% lên mặt trên —
             * làm mặt trên SÁNG hơn ở theme sáng (`--background` gần trắng) và
             * TỐI hơn ở theme tối (`--background` gần đen). Tức cái gợi ý chiều
             * sâu **đảo chiều** giữa hai theme, trong khi bóng đổ phía dưới thì
             * không đổi — khối đọc ra lồi ở theme này và lõm ở theme kia.
             *
             * Nên mép trên là một NÉT (hình học) chứ không phải một mảng SHADE:
             * nó vẽ bằng token chữ của chính node, nên nó tương phản với thân hộp
             * ở CẢ HAI theme, và một đường viền sáng dọc mép trên đọc ra là "mép"
             * bất kể nó sáng hơn hay tối hơn nền. Không ô tự động nào bắt được
             * lỗi đảo chiều kia — nó chỉ lộ ra khi đọc lại bảng token.
             */}
            {geo.depth && (
              <path
                d={`M 2 ${RADIUS} Q 2 2 ${RADIUS} 2 H ${NODE_W - (geo.notch ? NOTCH : RADIUS)}${
                  geo.notch
                    ? ` L ${NODE_W - 3} ${NOTCH - 1}`
                    : ` Q ${NODE_W - 2} 2 ${NODE_W - 2} ${RADIUS}`
                }`}
                fill="none"
                stroke={bodyText}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.45}
              />
            )}

            {/* Vành: 1 cho `running`, 2 cho `retrying` — phân biệt khi đã tắt chuyển động. */}
            {geo.rings > 0 && (
              <motion.g
                style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
                animate={motionKind === 'spin' ? { rotate: 360 } : { rotate: 0 }}
                transition={
                  motionKind === 'spin'
                    ? { duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }
                    : { duration: 0 }
                }
              >
                <ellipse
                  cx={NODE_W / 2}
                  cy={NODE_H / 2}
                  rx={NODE_W / 2 + 6}
                  ry={NODE_H / 2 + 6}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray="14 10"
                />
                {geo.rings === 2 && (
                  <ellipse
                    cx={NODE_W / 2}
                    cy={NODE_H / 2}
                    rx={NODE_W / 2 + 13}
                    ry={NODE_H / 2 + 13}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={1.5}
                    strokeDasharray="6 8"
                  />
                )}
              </motion.g>
            )}

            {/* Mạch đập chậm của `queued` — trên VÀNH, không trên chữ. */}
            {motionKind === 'pulse-slow' && (
              <motion.rect
                x={-5}
                y={-5}
                width={NODE_W + 10}
                height={NODE_H + 10}
                rx={RADIUS + 4}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                animate={{ opacity: [0.85, 0.2, 0.85] }}
                transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
              />
            )}

            {/* Badge trạng thái: icon chữ. Kênh sống sót qua in đen trắng. */}
            <circle
              cx={NODE_W - 20}
              cy={20}
              r={13}
              fill={bodyText}
              stroke={bodyFill}
              strokeWidth={1.5}
            />
            <text
              x={NODE_W - 20}
              y={20}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={14}
              fill={bodyFill}
            >
              {paint.icon}
            </text>

            {/* Nhãn đặt THẲNG TRÊN HÌNH (D.2.2). */}
            <text x={14} y={28} fontSize={15} fontWeight={600} fill={bodyText}>
              {clip(node.name, 16)}
            </text>
            <text x={14} y={48} fontSize={11.5} fill={bodyText} opacity={0.85}>
              {clip(node.stageId, 20)}
            </text>
            <text x={14} y={69} fontSize={11.5} fontWeight={600} fill={bodyText}>
              {paint.icon} {paint.stateLabel}
              {node.attempt > 0 ? ` ·  lần ${node.attempt + 1}` : ''}
            </text>
          </g>
        </motion.g>

        {/*
         * TRỤC BỊ GẬP CỦA CHƯƠNG CI, cứu bằng chữ.
         *
         * Y của chương CI là thời gian chờ hàng đợi, và phép chiếu 2D bỏ nó đi.
         * Nó là thứ bài "thêm máy chạy" dạy, nên nó phải đọc được — ở đây là một
         * badge số tick treo dưới hộp, chỉ hiện khi CÓ chờ.
         */}
        {axes.folded === 'y' && wait !== null && wait > 0 && (
          <g data-cicd-wait={wait}>
            <rect
              x={0}
              y={NODE_H + sink + DEPTH + 4}
              width={104}
              height={22}
              rx={11}
              fill={cssVar('--warning')}
            />
            <text
              x={10}
              y={NODE_H + sink + DEPTH + 19}
              fontSize={11.5}
              fontWeight={600}
              fill={cssVar('--warning-foreground')}
            >
              chờ máy {wait} tick
            </text>
          </g>
        )}

        {/* Dấu đường găng trên chính node — kênh hình học, không chỉ trên cạnh. */}
        {critical && !dimmed && (
          <rect
            x={-3}
            y={-3 + sink}
            width={NODE_W + 6}
            height={NODE_H + 6}
            rx={RADIUS + 3}
            fill="none"
            stroke={cssVar(CRITICAL_TOKEN)}
            strokeWidth={2.5}
          />
        )}
      </g>
    </motion.g>
  );
}
