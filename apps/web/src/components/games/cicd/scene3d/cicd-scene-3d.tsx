'use client';

/**
 * ⚠ **STUB do lead dựng trước khi fan-out (19.D).** lane-3d THAY THẾ toàn bộ file
 * này ở 19.D.3 — nó có mặt chỉ để `cicd-level-screen.tsx` của lane-hud biên dịch
 * được trong lúc hai lane chạy song song.
 *
 * Stub cố ý KHÔNG import `three`: chừng nào lane-3d chưa viết thật, route
 * `/games/cicd` không được kéo 631KB engine vào bundle chỉ vì một chỗ giữ chỗ.
 *
 * Hợp đồng props: `../scene-props.ts`. Thứ được vẽ = thứ `cicdSceneNodes()` /
 * `cicdSceneEdges()` trả về (AC-D2).
 */

import type { ReactElement } from 'react';

import { cicdSceneNodes, type CicdSceneProps } from '../scene-props';

export interface CicdScene3dProps extends CicdSceneProps {
  /** Bậc chất lượng đã dò. lane-3d nối vào `shared/scene-quality.ts` ở D.3.8. */
  readonly quality?: 'low' | 'medium' | 'high';
}

export function CicdScene3d(props: CicdScene3dProps): ReactElement {
  return (
    <div
      className="h-full w-full"
      role="img"
      aria-label={props.label ?? 'Đồ thị đường ống CI/CD, chế độ 3D'}
      data-testid="cicd-scene-3d"
      data-node-count={cicdSceneNodes(props).length}
    />
  );
}
