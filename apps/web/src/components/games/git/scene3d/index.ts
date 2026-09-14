/**
 * Cửa DUY NHẤT vào tầng 3D game Git.
 *
 * ⚠ **Mọi thứ dưới đây kéo theo `three` (~631KB với `@react-three/*` và
 * `postprocessing`).** Barrel này tồn tại để có đúng MỘT chỗ phải nạp động, và
 * để `grep` tìm được mọi đường vào:
 *
 * ```ts
 * const GitScene3D = dynamic(
 *   () => import('./scene3d').then((m) => m.GitScene3D),
 *   { ssr: false },
 * );
 * ```
 *
 * ⛔ **Đừng `import` file này từ mã chạy ở mọi route.** P17 đã một lần rò engine
 * sang 6 route không liên quan vì một barrel (`44f8e39`), và cổng CI
 * `bundle:check` gác chính chuyện đó. `scene3d-contract.ts` thì ngược lại —
 * toán thuần, không `three`, import thẳng được từ bất cứ đâu kể cả test env
 * `node`.
 */

export { GitScene3D, type GitScene3DProps } from './git-scene-3d.tsx';
