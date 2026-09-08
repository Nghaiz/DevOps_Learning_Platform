import type { Metadata } from 'next';
// Đường dẫn TƯƠNG ĐỐI, không phải `@/components/...`: repo này không khai
// `paths` ở tsconfig nào và không đặt alias webpack, nên dạng `@/` sẽ đỏ ở cả
// typecheck lẫn `next build`.
import { ArenaEntry } from '../../../components/k8s-arena/arena-entry';

export const metadata: Metadata = {
  title: 'Kubernetes Arena — DevOps Learning Platform',
  description: 'Dựng và cứu một cluster Kubernetes qua từng level, ngay trong trình duyệt.',
};

/**
 * `/games/k8s` — vỏ route của Kubernetes Arena.
 *
 * Server Component **rỗng nghiệp vụ**, có chủ ý: không tạo phiên, không giữ
 * state game, không đọc session. Nó làm đúng hai việc — gắn `metadata`, và đọc
 * tham số `problem` để quyết định chế độ.
 *
 * ⛔ Chỉ file NÀY đọc `?problem=`. Hợp đồng (`arena-contract.ts`, `ArenaMode`)
 * cấm các component con tự đọc: hai chỗ cùng đọc một tham số là hai chỗ có thể
 * bất đồng về việc đang ở chế độ nào, và một component thấy `problemCode == null`
 * rồi tự kết luận đang ở chế độ level sẽ hiểu sai đúng lúc bài đang tải.
 *
 * Không gác auth — game chạy hoàn toàn trong trình duyệt, tiến độ ở
 * `localStorage`, nên `/games` KHÔNG có trong `PROTECTED_PATHS` của `proxy.ts`
 * (hợp đồng §4.2). Chế độ làm bài OJ thì cổng nằm ở tRPC lúc nộp bài, không nằm
 * ở route này.
 *
 * KHÔNG render `main` của riêng nó — vỏ ứng dụng sở hữu landmark đó cho mọi
 * trang (`components/session/landmark-contract.test.ts` quét tĩnh việc này).
 */
export default async function K8sArenaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.problem;
  const problemCode = typeof raw === 'string' && raw.length > 0 ? raw : null;

  return <ArenaEntry problemCode={problemCode} />;
}
