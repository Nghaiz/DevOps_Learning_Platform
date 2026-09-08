import type { Metadata } from 'next';
// ⛔ MỐI NỐI LANE E — đổi đúng hai dòng (import + thẻ render) rồi xoá
// `k8s-game-placeholder.tsx`. Hướng dẫn đầy đủ + lý do vì sao KHÔNG dùng `@/`
// nằm ở đầu chính file đó.
import { K8sGamePlaceholder } from './k8s-game-placeholder';

export const metadata: Metadata = {
  title: 'K8s Game — DevOps Learning Platform',
  description: 'Dựng và cứu một cluster Kubernetes qua từng level, ngay trong trình duyệt.',
};

/**
 * `/games/k8s` — vỏ route của K8s Game.
 *
 * Server Component **rỗng nghiệp vụ**, có chủ ý. Nó không tạo phiên, không
 * import `@devops-platform/games`, không giữ state game, và không đọc session:
 * toàn bộ phần đó thuộc `K8sGame` (lane E, `components/games/**`). Route chỉ
 * quyết định "đường nào dẫn tới màn hình nào" và gắn `metadata`.
 *
 * Không gác auth — cùng lý do với `/games`: game chạy hoàn toàn trong trình
 * duyệt, tiến độ ở `localStorage`, nên `/games` KHÔNG có trong `PROTECTED_PATHS`
 * của `proxy.ts` (hợp đồng §4.2).
 *
 * KHÔNG render `main` của riêng nó — vỏ ứng dụng sở hữu landmark đó cho mọi
 * trang (`components/session/landmark-contract.test.ts` quét tĩnh việc này).
 */
export default function K8sGamePage() {
  return <K8sGamePlaceholder />;
}
