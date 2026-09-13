/**
 * Barrel của tầng layout.
 *
 * ⚠ Đây KHÔNG phải barrel của cả package. `packages/games/src/index.ts` do lead
 * sở hữu và lane này không chạm vào nó — cần mở ra ngoài package thì báo lead.
 * Tầng renderer (17.B.3–B.4) import qua đường `core/layout/index.ts` này.
 */

export type { DagLayout, DagNode, LaidOutEdge, LaidOutNode } from './dag-layout.ts';
export { layoutDag } from './dag-layout.ts';

export type { LaneAssignment, LaneNode } from './lane-assign.ts';
export { assignLanes } from './lane-assign.ts';

export type { LayoutPoint } from './edge-route.ts';
export { countDiagonalSegments, routeEdge } from './edge-route.ts';
