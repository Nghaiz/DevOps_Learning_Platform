'use client';

/**
 * Bản đồ thu nhỏ của đồ thị đường ống (19.D.4.7).
 *
 * Mượn vai trò từ `k8s-arena/hud/minimap.tsx`: một hình chiếu nhỏ, luôn thấy
 * được toàn cảnh, bấm một chấm là chọn node đó. Ở game này nó gánh thêm MỘT
 * việc mà arena không cần:
 *
 * ⚠ **Đây là đường chọn node bằng BÀN PHÍM.** D.4.8 đòi không thao tác nào chỉ
 * làm được bằng chuột. Cảnh 3D là một `<canvas>` — với bàn phím và với trình đọc
 * màn hình nó là một ô đen — nên nếu chọn node chỉ làm được bằng cách bấm vào
 * cảnh thì cả chương này khoá cứng người dùng bàn phím. Mỗi chấm dưới đây là
 * một `<button>` thật, nằm trong luồng Tab, có nhãn đọc được.
 *
 * ⛔ **Không mang `data-cicd-node`.** Thuộc tính đó là hợp đồng đếm của AC-D1
 * (`scene-props.ts`), và ô đó đếm *số node vẽ ra*. Gắn nó ở đây là nhân đôi mọi
 * con số — ô sẽ ĐỎ với một lời giải thích sai, hoặc tệ hơn, xanh vì hai lỗi
 * triệt tiêu nhau. Bản đồ dùng tên riêng.
 */

import type { ReactElement } from 'react';
import { cn } from '@devops-platform/ui';

import { cicdSceneNodes, project2d, sceneAxes, type CicdSceneProps } from '../scene-props';

/**
 * Tên riêng của bản đồ — xem khối đầu file. Hằng này để TEST tra cứu; JSX bên
 * dưới viết thuộc tính ở dạng nguyên văn, vì một khoá ghép động không qua được
 * kiểu của thuộc tính `data-*` trong TSX.
 */
export const CICD_MINIMAP_NODE_ATTR = 'data-cicd-minimap-node';

/**
 * Token màu ⇒ lớp nền.
 *
 * Bảng tra tường minh chứ không `` `bg-${token}` ``: Tailwind quét chuỗi lớp
 * NGUYÊN VẸN trong mã nguồn, nên một lớp ghép bằng template sẽ không có mặt
 * trong CSS xuất ra — chấm mất màu, không lỗi nào báo.
 */
const STATUS_BG: Readonly<Record<string, string>> = {
  success: 'bg-success',
  destructive: 'bg-destructive',
  warning: 'bg-warning',
  'status-progress': 'bg-status-progress',
  'status-locked': 'bg-status-locked',
};

export interface CicdMinimapProps {
  readonly scene: CicdSceneProps;
  readonly className?: string;
}

export function CicdMinimap({ scene, className }: CicdMinimapProps): ReactElement {
  const nodes = cicdSceneNodes(scene);
  const axes = sceneAxes(scene.view.yAxis);
  const { bounds } = scene.placement;

  const [minH, minV] = project2d(bounds.min, axes);
  const [maxH, maxV] = project2d(bounds.max, axes);
  /*
   * Mẫu số 0 khi cả đồ thị nằm trên một đường thẳng (một job duy nhất, hay mọi
   * job cùng một tầng). Kẹp về 1 rồi chia: mọi chấm rơi vào giữa, đúng thứ cần
   * vẽ. Không kẹp thì ra `NaN` và chấm biến mất khỏi DOM — mất luôn đường chọn
   * bằng bàn phím ở đúng những level đơn giản nhất.
   */
  const spanH = maxH - minH || 1;
  const spanV = maxV - minV || 1;

  return (
    <div className={cn('relative', className)}>
      <div className="relative h-32 w-full overflow-hidden rounded-lg border border-border bg-muted/40">
        {nodes.map(({ id, node, spot }) => {
          const [h, v] = project2d(spot, axes);
          const left = ((h - minH) / spanH) * 84 + 8;
          const top = ((v - minV) / spanV) * 84 + 8;
          const selected = scene.interaction.selectedId === id;
          return (
            <button
              key={id}
              type="button"
              data-cicd-minimap-node={id}
              aria-label={node.ariaLabel}
              aria-pressed={selected}
              onClick={() => {
                scene.interaction.onSelect(selected ? null : id);
              }}
              onFocus={() => {
                scene.interaction.onHover(id);
              }}
              onBlur={() => {
                scene.interaction.onHover(null);
              }}
              style={{ left: `${left}%`, top: `${top}%` }}
              className={cn(
                'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                STATUS_BG[node.statusToken] ?? 'bg-muted-foreground',
                selected && 'ring-2 ring-ring',
              )}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[0.65rem] text-muted-foreground">
        {nodes.length} thực thể · dọc là{' '}
        {axes.vertical === 'y' ? 'dải môi trường' : 'làn job song song'}
      </p>
    </div>
  );
}
