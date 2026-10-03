import type { Metadata } from 'next';
import { t } from '@devops-platform/copy';
import { CICD_LEVELS, GIT_LEVELS, LEVELS } from '@devops-platform/games';
import { factsOf } from '../../components/games/hub/game-facts';
import { GamesHub } from '../../components/games/hub/games-hub';

export const metadata: Metadata = {
  title: t('games.meta-title'),
  description: t('games.meta-description'),
};

/**
 * Chỉ mục `/games`.
 *
 * Server Component thuần: không `getSession`, không `redirect('/login')`. Game
 * không yêu cầu đăng nhập (hợp đồng §4.2 của P14), nên gác ở đây là dựng một
 * cánh cổng không gác gì.
 *
 * Số màn, số chương và dải độ khó TÍNH Ở ĐÂY từ dữ liệu màn thật, rồi chỉ mảng id
 * và vài con số đi xuống client: dữ liệu màn của ba game không vào bundle của
 * trang danh mục.
 *
 * KHÔNG render `main` của riêng nó: vỏ ứng dụng sở hữu landmark đó cho mọi trang
 * (`components/session/landmark-contract.test.ts` quét tĩnh việc này).
 */
export default function GamesIndexPage() {
  const facts = [factsOf('k8s', LEVELS), factsOf('git', GIT_LEVELS), factsOf('cicd', CICD_LEVELS)];
  return <GamesHub facts={facts} />;
}
