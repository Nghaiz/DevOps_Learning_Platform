import type { Metadata } from 'next';
// Đường dẫn TƯƠNG ĐỐI, không phải `@/components/...`: repo này không khai
// `paths` ở tsconfig nào và không đặt alias webpack, nên dạng `@/` sẽ đỏ ở cả
// typecheck lẫn `next build`.
import { K8sGame } from '../../../components/games/k8s-game';

export const metadata: Metadata = {
  title: 'Kubernetes Game — DevOps Learning Platform',
  description: 'Dựng và cứu một cluster Kubernetes qua từng level, ngay trong trình duyệt.',
};

/**
 * `/games/k8s` — vỏ route của Kubernetes Game.
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
  return <K8sGame />;
}
