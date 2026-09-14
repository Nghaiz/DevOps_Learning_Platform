import { t } from '@devops-platform/copy';

import type { ProblemTopicOption } from '../core/problem.ts';

/**
 * Tám chủ đề của bài OJ game Git.
 *
 * ## Vì sao dữ liệu này ở MỘT FILE RIÊNG, không nằm cùng plugin
 *
 * Tách ra ngày 2026-09-15 (§18.D, món nợ ghi ở
 * `apps/web/src/app/(session)/problems/problem-labels.ts`). Lý do là một ràng
 * buộc về BUNDLE, không phải về gọn gàng: `git/problem-plugin.ts` nhập
 * `createGitSession` từ `./engine.ts`, nên **mọi** route chạm một tên bất kỳ
 * trong file đó sẽ kéo cả engine git theo. PR #124 đo được đúng hình dạng ấy —
 * một chunk 369.938 B nằm ở 7/38 route, 5 trong 7 là route `problems`, và nó
 * đẩy `/games/k8s/page` vượt trần `bundle:check`.
 *
 * Trang danh mục bài chỉ cần NHÃN chủ đề. Một mảng tám phần tử không có lý do
 * gì phải kéo theo một engine, nên nó đứng riêng ở đây và plugin nhập lại từ
 * đây — SSOT không đổi, chỉ đổi chỗ đứng.
 *
 * ⛔ File này KHÔNG được nhập bất cứ thứ gì từ `./engine.ts`, `./predicates.ts`,
 * `./world-spec.ts`, hay `./problem-plugin.ts`. Ô gác tĩnh
 * `problem-topic-labels.test.ts` đi theo đồ thị nhập và sẽ đỏ nếu có — và nó là
 * cổng DUY NHẤT thấy được chuyện này: `tsc`, `eslint`, `vitest` đều mù với
 * bundle, còn `bundle:check` chỉ chạy sau `next build`.
 *
 * ## Vì sao TÁM, và vì sao tập ĐÓNG
 *
 * Tập đóng cùng lý do như chín chủ đề K8s: một trường tự do đẻ ra "Rebase",
 * "rebase", "nắn lịch sử", "Nan lich su" là bốn mục cho cùng một thứ, và sau
 * vài trăm bài thì không ai gộp lại được. `tags` là chỗ cho phân loại tự do.
 *
 * Tám cái tên này KHÔNG bịa ra: chúng là các mảng kiến thức mà 32 level Git
 * hiện có đang dạy, gom theo ba chương của `GitLevel.chapter` (1 = nắn lịch sử,
 * 2 = làm việc nhóm, 3 = cứu hộ) rồi tách nhỏ những chương quá rộng. Một bài OJ
 * không dạy, nên chủ đề ở đây chỉ để **lọc và chọn bài kế tiếp** — đó là lý do
 * tám chứ không phải ba: ba mục quá thô để chọn bài, hai mươi mục thì không ai
 * lọc nữa.
 *
 * ⚠ Id để TRẦN (`branching`) chứ không gắn tiền tố (`git-branching`), cùng quy
 * ước với chín id của K8s. Chúng không đụng nhau vì cổng kiểm luôn tra theo
 * `gameId` của bài. Khoá CHỮ thì phải có tiền tố `git` vì `packages/copy` là
 * một không gian tên phẳng cho cả dự án.
 */
export const GIT_PROBLEM_TOPICS: readonly ProblemTopicOption[] = [
  { id: 'commit', label: t('problem.topic.git.commit') },
  { id: 'branching', label: t('problem.topic.git.branching') },
  { id: 'merging', label: t('problem.topic.git.merging') },
  { id: 'history', label: t('problem.topic.git.history') },
  { id: 'remote', label: t('problem.topic.git.remote') },
  { id: 'collaboration', label: t('problem.topic.git.collaboration') },
  { id: 'conflict', label: t('problem.topic.git.conflict') },
  { id: 'recovery', label: t('problem.topic.git.recovery') },
];
