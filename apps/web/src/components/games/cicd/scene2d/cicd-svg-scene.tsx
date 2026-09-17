'use client';

/**
 * ⚠ **STUB do lead dựng trước khi fan-out (19.D).** lane-2d THAY THẾ toàn bộ file
 * này ở 19.D.2 — nó có mặt chỉ để `cicd-level-screen.tsx` của lane-hud biên dịch
 * được trong lúc hai lane chạy song song.
 *
 * Hợp đồng props: `../scene-props.ts` (lead sở hữu, không lane nào sửa). Thứ
 * được vẽ = thứ `cicdSceneNodes()` / `cicdSceneEdges()` trả về — đó là điều kiện
 * để AC-D2 có nghĩa.
 */

import type { ReactElement } from 'react';

import { cicdSceneEdges, cicdSceneNodes, type CicdSceneProps } from '../scene-props';

export function CicdSvgScene(props: CicdSceneProps): ReactElement {
  const nodes = cicdSceneNodes(props);
  const edges = cicdSceneEdges(props);

  return (
    <svg
      className="h-full w-full"
      role="img"
      aria-label={props.label ?? 'Đồ thị đường ống CI/CD'}
      data-testid="cicd-scene-2d"
      data-node-count={nodes.length}
      data-edge-count={edges.length}
    >
      <title>{props.label ?? 'Đồ thị đường ống CI/CD'}</title>
    </svg>
  );
}
