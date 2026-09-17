/**
 * ⚠ **STUB do lead dựng trước khi fan-out (19.D).** lane-3d thay thế ở 19.D.3.
 *
 * ⛔ **BARREL DUY NHẤT của cảnh 3D.** Mọi thứ chạm `three` / `@react-three/*` /
 * `postprocessing` phải nằm SAU file này, và bên gọi nạp nó bằng
 * `next/dynamic` + `ssr: false` (đúng khuôn `k8s-arena/arena-root.tsx:38`).
 *
 * Lý do là một ô nghiệm thu, không phải sở thích: `three` + R3F +
 * `postprocessing` là ~631KB, và P17 đã một lần rò engine sang 6 route không
 * liên quan qua đúng một barrel (`44f8e39`). AC-D9 đo chiều này, có đối chứng
 * dương.
 */

export { CicdScene3d } from './cicd-scene-3d';
export type { CicdScene3dProps } from './cicd-scene-3d';
