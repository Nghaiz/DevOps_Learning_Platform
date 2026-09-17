'use client';

/**
 * Một cạnh trong cảnh 2D: góc vuông, chấm chạy, tô sáng đường găng
 * (19.D.2.3 + D.2.4).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CẠNH CHỜ-MÁY PHẢI TRÔNG KHÁC CẠNH PHỤ THUỘC — Ở HAI KÊNH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `DagEdgeView.resourceEdge` nói "thứ giữ cạnh này lại là MÁY CHẠY chứ không
 * phải phụ thuộc", và chú thích của hợp đồng nói thẳng hệ quả: tô một đoạn
 * chờ-máy như thể nó là một phụ thuộc sẽ dạy sai — người chơi đi sửa đồ thị
 * trong khi thứ phải sửa là số máy.
 *
 * Nên cạnh chờ-máy khác ở **nét đứt** (hình học) và **độ dày** (không chỉ màu),
 * và nó GIỮ NGUYÊN nét đứt đó cả khi nằm trên đường găng. Đây là chỗ dễ sai
 * nhất: cách tô sáng "thay toàn bộ kiểu cạnh bằng kiểu đường găng" sẽ biến đúng
 * đoạn quan trọng nhất thành một đoạn không phân biệt được — tức xoá thông tin
 * ngay tại chỗ người chơi cần nó nhất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẤM CHẠY CHẠY KHI NÀO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kế hoạch D.2.3 ghi "mật độ chấm = lưu lượng (mượn Vizceral)". `CicdGraphView`
 * không mang một đại lượng lưu lượng nào — nó là `Pick<CicdView, 'nodes' |
 * 'edges' | 'yAxis'>`, và `DagEdgeView` chỉ có `from`/`to`/`critical`/
 * `resourceEdge`. Bịa một con số ở đây là dựng một chỉ báo nói dối.
 *
 * Nên chấm chạy mã hoá thứ ĐỌC ĐƯỢC từ dữ liệu thật: **cạnh đang có việc chảy
 * qua** — đầu trên đã xong, đầu dưới chưa xong. Đó là câu trả lời cho "lúc này
 * việc đang ở đâu", và nó tự tắt khi lượt chạy kết thúc thay vì chạy vĩnh viễn.
 * Đề xuất thêm một trường lưu lượng vào hợp đồng đã ghi trong báo cáo lane.
 */

import { type ReactElement } from 'react';
import { motion } from '@devops-platform/motion/react';
import {
  CICD_EDGE_ATTR,
  CICD_EDGE_CRITICAL_ATTR,
  type CicdResolvedEdge,
  type SceneAxes,
} from '../scene-props';
import { CRITICAL_TOKEN, cssVar, edgePaint } from './cicd-palette';
import { edgePx, orthPath, pathLength, type Px } from './cicd-scene-geometry';

/** Nửa cạnh của đầu mũi tên. */
const ARROW = 7;

/** Đầu mũi tên ở đầu CON của cạnh, quay theo đoạn cuối. */
function arrowPoints(points: readonly Px[]): string | null {
  const tip = points.at(-1);
  const before = points.at(-2);
  if (tip === undefined || before === undefined) return null;
  const dx = tip[0] - before[0];
  const dy = tip[1] - before[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const ux = dx / len;
  const uy = dy / len;
  // Lùi mũi tên khỏi tâm node để nó không nằm dưới hộp.
  const bx = tip[0] - ux * 2;
  const by = tip[1] - uy * 2;
  const px = -uy;
  const py = ux;
  return [
    `${bx},${by}`,
    `${bx - ux * ARROW * 2 + px * ARROW},${by - uy * ARROW * 2 + py * ARROW}`,
    `${bx - ux * ARROW * 2 - px * ARROW},${by - uy * ARROW * 2 - py * ARROW}`,
  ].join(' ');
}

export interface CicdSceneEdgeProps {
  readonly resolved: CicdResolvedEdge;
  readonly axes: SceneAxes;
  readonly reduced: boolean;
  /** Đầu trên đã xong mà đầu dưới chưa — có việc đang chảy qua cạnh này. */
  readonly flowing: boolean;
  /** Bị đẩy ra nền vì drill-in đang tập trung chỗ khác (D.2.7). */
  readonly dimmed: boolean;
}

export function CicdSceneEdge(props: CicdSceneEdgeProps): ReactElement | null {
  const { resolved, axes, reduced, flowing, dimmed } = props;
  const points = edgePx(resolved, axes);
  if (points.length < 2) return null;

  const d = orthPath(points);
  const paint = edgePaint(resolved.edge.resourceEdge);
  const critical = resolved.edge.critical;
  const length = Math.max(1, pathLength(points));
  const arrow = arrowPoints(points);

  /*
   * Màu: đường găng thắng, NHƯNG nét đứt của cạnh chờ-máy vẫn giữ. Xem khối đầu
   * file về vì sao không được thay trọn kiểu.
   */
  const stroke = cssVar(critical && !dimmed ? CRITICAL_TOKEN : paint.stroke);
  const width = critical ? paint.width + 1.5 : paint.width;

  return (
    <g
      {...{
        [CICD_EDGE_ATTR]: resolved.key,
        ...(critical ? { [CICD_EDGE_CRITICAL_ATTR]: 'true' } : {}),
      }}
      data-cicd-resource={resolved.edge.resourceEdge ? 'true' : undefined}
      data-cicd-flowing={flowing && !reduced ? 'true' : undefined}
      /*
       * Cạnh là ĐỒ HOẠ, không phải một mục danh sách. Đưa từng cạnh vào cây a11y
       * biến một đồ thị 12 job thành ba chục mục "từ A tới B" mà người nghe phải
       * lội qua trước khi tới được job đầu tiên. Nội dung dạy học của cạnh —
       * đường găng dài bao nhiêu, nó có đi qua một đoạn chờ-máy không — được nói
       * thành CÂU trong `<desc>` của gốc cảnh, chỗ `aria-describedby` trỏ tới.
       */
      aria-hidden="true"
    >
      {/* Quầng đường găng: một nét dày hơn nằm dưới, luôn LIỀN. */}
      {critical && !dimmed && (
        <path
          d={d}
          fill="none"
          stroke={cssVar(CRITICAL_TOKEN)}
          strokeWidth={width + 7}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.22}
        />
      )}

      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={paint.dash ?? undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={dimmed ? 0.35 : 1}
      />

      {/* Chấm chạy dọc cạnh — `stroke-dasharray` ngắn + dịch `dashoffset`. */}
      {flowing && !reduced && !dimmed && (
        <motion.path
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={width + 2.5}
          strokeLinecap="round"
          strokeDasharray="1 22"
          animate={{ strokeDashoffset: [0, -length] }}
          transition={{
            duration: Math.max(1.4, length / 160),
            repeat: Number.POSITIVE_INFINITY,
            ease: 'linear',
          }}
        />
      )}

      {arrow !== null && (
        <polygon points={arrow} fill={stroke} opacity={dimmed ? 0.35 : 1} />
      )}
    </g>
  );
}
