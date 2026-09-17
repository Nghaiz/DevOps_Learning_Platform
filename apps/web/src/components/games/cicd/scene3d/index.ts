/**
 * ⛔ **BARREL DUY NHẤT của cảnh 3D.**
 *
 * Mọi thứ chạm `three` / `@react-three/*` / `postprocessing` phải nằm SAU file
 * này, và bên gọi nạp nó bằng `next/dynamic` + `ssr: false` — đúng khuôn
 * `k8s-arena/arena-root.tsx:38`:
 *
 * ```ts
 * const CicdScene3d = dynamic(async () => (await import('./scene3d')).CicdScene3d, {
 *   ssr: false,
 * });
 * ```
 *
 * `ssr: false` là BẮT BUỘC, không phải tối ưu: `three` chạm `window` lúc dựng
 * renderer, nên render phía máy chủ sẽ ném.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ MỘT Ô NGHIỆM THU CHỨ KHÔNG PHẢI MỘT SỞ THÍCH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `three` + R3F là ~631KB, và P17 đã một lần rò engine sang **6 route không
 * liên quan** qua đúng một barrel (`44f8e39`). Cơ chế thì tầm thường và chính vì
 * thế nó lặp lại được: bundler không phân biệt "import để dùng" với "import cho
 * có" — một cạnh trong đồ thị import là một cạnh, và `tsc`, `eslint`, `vitest`
 * đều mù với nó. AC-D9 đo chiều này, có đối chứng dương.
 *
 * Nên: **không ai được import thẳng một file con dưới `scene3d/`.** Thêm một
 * export ở đây thì kiểm lại rằng thứ được export không kéo theo `three` nếu bên
 * gọi chỉ cần kiểu.
 *
 * ⚠ Riêng `CicdScene3dProps` là một KIỂU, nên `import type` từ đây bị xoá hoàn
 * toàn lúc biên dịch và không tạo cạnh runtime nào. Nhưng chỉ khi bên gọi viết
 * `import type` — một `import { type X }` lẫn trong một import giá trị vẫn giữ
 * nguyên cạnh đó.
 */

export { CicdScene3d } from './cicd-scene-3d';
export type { CicdScene3dProps } from './cicd-scene-3d';

/**
 * Số liệu đo của cảnh, cho ô AC-D4.
 *
 * Kiểu thôi — cửa sổ đo thật phát ở `globalThis.__dlpCicdScene` lúc chạy.
 */
export type { CicdSceneStats } from './frame-pump-3d';
