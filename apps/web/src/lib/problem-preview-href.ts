import type { GameId } from '@devops-platform/games';

/**
 * Đường vào đấu trường để MỞ một bài theo mã, theo game. `null` = game đó chưa
 * có đường vào nào (§18.D.5).
 *
 * ## Vì sao một bảng tra chứ không phải `/games/${gameId}?problem=`
 *
 * Bởi vì công thức đó SAI, và nó sai theo kiểu im lặng. Ba game (`pipeline`,
 * `netpol`, `dockerfile`) chưa có route nào, nên link tới đó là một 404
 * thẳng. Và tệ hơn 404: một route CÓ tồn tại nhưng không đọc `?problem=` sẽ bỏ
 * qua tham số đó và mở ra một ván bình thường — không lỗi, không 404, không dòng
 * log nào — nên người bấm thấy một game chạy và kết luận rằng bài của họ đã mở
 * được.
 *
 * ## ⛔ Vì sao file này ở `lib/` chứ không ở `author/problems/`
 *
 * Nó TỪNG ở `app/author/problems/game-plugin-view.ts`, và ở đó nó không dùng lại
 * được. Module ấy nhập `PROBLEM_PLUGINS` (cho `initialSpecFor`), mà bảng plugin
 * kéo theo `createSession` + `createGitSession` — **cả hai engine**. Nhập nó vào
 * `(session)/problems/**` để dùng chung một bảng tra sẽ đẩy engine vào bundle của
 * mọi trang danh mục bài.
 *
 * Cái giá đã đo: PR #124 (2026-09-14) thấy một chunk 369.938 B chứa engine git
 * nằm ở 7/38 route, 5 trong 7 là route `problems`, và nó đẩy `/games/k8s/page`
 * vượt trần `bundle:check`.
 *
 * ⚠ Và ô gác `engine-leak.test.ts` **KHÔNG bắt được lượt rò này**: nó chỉ đi
 * trong đồ thị nhập của `packages/games`, không đi trong `apps/web`. Cổng duy
 * nhất thấy được là `bundle:check`, và nó chỉ chạy SAU `next build` — tức sau khi
 * một PR đã xanh hết mọi ô nhanh. Nên file này giữ **zero** import lúc chạy: chỉ
 * một `import type`, thứ biến mất khi biên dịch.
 *
 * ⚠ Thêm một dòng vào bảng này là một lời KHAI rằng route đó đọc `?problem=`.
 * Trước khi thêm, mở chính `app/games/<gameId>/page.tsx` và đọc `searchParams`.
 * `arena-preview.test.ts` gác lời khai đó bằng cách mở đúng file ấy.
 */
const PREVIEW_ROUTE_BY_GAME: Readonly<Partial<Record<GameId, string>>> = {
  k8s: '/games/k8s',
  git: '/games/git',
  // 19.H. Lời khai này đi kèm một điều kiện đo được: `app/games/cicd/page.tsx`
  // đọc `params.problem`. Cổng giữ nó là ô cuối `arena-preview.test.ts`, và ô
  // đó mở CHÍNH file kia ra đọc chứ không tin dòng này.
  cicd: '/games/cicd',
};

export function problemPreviewHref(gameId: GameId, code: string): string | null {
  const route = PREVIEW_ROUTE_BY_GAME[gameId];
  return route === undefined ? null : `${route}?problem=${encodeURIComponent(code)}`;
}
