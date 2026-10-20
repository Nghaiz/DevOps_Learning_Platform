import type { Metadata } from 'next';
import { Suspense } from 'react';
import { t } from '@devops-platform/copy';
// Đường dẫn TƯƠNG ĐỐI, không phải `@/components/...`: repo này không khai
// `paths` ở tsconfig nào và không đặt alias webpack, nên dạng `@/` sẽ đỏ ở cả
// typecheck lẫn `next build`.
import { ArenaEntry } from '../../../components/k8s-arena/arena-entry';
import { K8sCampaign } from '../../../components/games/k8s/k8s-campaign';

export const metadata: Metadata = {
  title: t('games.k8s.meta-title'),
  description: t('games.k8s.meta-description'),
};

/**
 * `/games/k8s`: trang chọn màn của Kubernetes Arena, hoặc một bài OJ.
 *
 * Server Component rỗng nghiệp vụ: không tạo phiên, không giữ state game, không
 * đọc session.
 *
 * ⛔ Chỉ file NÀY đọc `?problem=`. Hợp đồng (`arena-contract.ts`, `ArenaMode`)
 * cấm component con tự đọc: hai chỗ cùng đọc một tham số là hai chỗ có thể bất
 * đồng về việc đang ở chế độ nào. Có mã bài ⇒ đi đường `ArenaEntry` của chính
 * arena (màn làm bài dựng level từ đề), phủ kín vỏ trang. Không có ⇒ trang chọn
 * màn `K8sCampaign`, nằm ngoài canvas game và giữ màn đang chơi ở `?level=`.
 *
 * `arena-entry.tsx` vẫn chứa đường chọn màn cũ (`LevelPicker`); route này không
 * còn đi qua nhánh đó, nhưng file thuộc arena nên được để nguyên.
 *
 * Không gác auth: game chạy hoàn toàn trong trình duyệt, tiến độ ở
 * `localStorage`, nên `/games` KHÔNG có trong `PROTECTED_PATHS` của `proxy.ts`.
 *
 * KHÔNG render `main` của riêng nó: vỏ ứng dụng sở hữu landmark đó.
 */
export default async function K8sArenaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.problem;
  const problemCode = typeof raw === 'string' && raw.length > 0 ? raw : null;

  if (problemCode !== null) {
    // z-[45]: trên thanh đầu trang, dưới portal Radix. Xem `k8s-campaign.tsx`.
    return (
      <div className="fixed inset-0 z-[45] bg-ink">
        <ArenaEntry problemCode={problemCode} />
      </div>
    );
  }

  return (
    <Suspense>
      <K8sCampaign />
    </Suspense>
  );
}
