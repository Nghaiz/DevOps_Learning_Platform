import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import { Skeleton } from '@devops-platform/ui';
import { BoardSkeleton, PageContainer, PosterHeader } from '../../../components/kit';

/**
 * Đầu trang `/problems`. Tĩnh, không đọc URL, nên nó render ngay ở máy chủ và
 * KHÔNG nằm trong ranh giới `<Suspense>`: người dùng thấy biển ga ngay từ byte
 * đầu, chỉ phần danh sách chờ.
 *
 * Bộ chọn game KHÔNG ở khe `aside` của biển, dù đó là chỗ nổi bật nhất. Nó chỉ
 * đổi từ vựng chủ đề chứ không lọc bài theo game (`problem-game.ts` ghi lý do đo
 * được), và đặt nó lên biển ga là hứa một phép lọc cả trang mà máy chủ chưa có.
 */
export function ProblemsPoster(): ReactElement {
  return (
    <PosterHeader
      section="judge"
      kicker={t('problem.oj.kicker')}
      title={t('problem.oj.title')}
      lead={t('problem.oj.lead')}
    />
  );
}

/**
 * Khung chờ của phần client, cùng HÌNH với thứ sẽ hiện: một khối thanh lọc và
 * các dòng bảng tuyến. Thay cho `fallback={null}` cũ, thứ để lại một khoảng trắng
 * rồi giật cả trang xuống khi danh sách về.
 */
export function ProblemsSkeleton(): ReactElement {
  return (
    <PageContainer className="py-10 md:py-14">
      <div aria-hidden className="flex flex-col gap-4 border-y-2 border-ink py-6">
        <Skeleton className="h-12 w-full max-w-xl" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-8 w-full max-w-3xl" />
      </div>
      <BoardSkeleton rows={8} label={t('problem.oj.loading')} />
    </PageContainer>
  );
}
