import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '@devops-platform/games';

import { problemPreviewHref } from './game-plugin-view';

const APP_DIR = resolve(process.cwd(), 'src/app');

describe('problemPreviewHref', () => {
  it('K8s cho đường vào thật, mã bài đã encode', () => {
    expect(problemPreviewHref('k8s', 'K8S-0001')).toBe('/games/k8s?problem=K8S-0001');
    expect(problemPreviewHref('k8s', 'A B')).toBe('/games/k8s?problem=A%20B');
  });

  /*
   * ĐẢO 2026-09-15, và đọc kỹ vì bản cũ của chính ô này khoá chiều ngược lại.
   *
   * Nó từng khẳng định `git` trả `null`, với lý lẽ đúng ở thời điểm đó: thà không có
   * nút còn hơn một nút mở ra ván Git bình thường ở level mặc định. Điều kiện đó nay
   * không còn đúng — `app/games/git/page.tsx` đọc `params.problem` và dựng thế giới từ
   * `WorldSpec` của bài — nên ô được ĐẢO chứ không được giữ lại dưới dạng một
   * ngoại lệ (`rules/pinned-baseline-test-companion.md`: khi điều kiện kết thúc của
   * một ô ghim đạt được thì lời dặn là một mệnh lệnh, không phải một gợi ý).
   *
   * Vế `toContain('params.problem')` ở ô cuối file là thứ giữ cho lời khai này
   * không trở lại thành một link sai im lặng.
   */
  it('Git cho đường vào thật từ 18.E — route đã đọc ?problem=', () => {
    expect(problemPreviewHref('git', 'GIT-0001')).toBe('/games/git?problem=GIT-0001');
  });

  it('game chưa có route nào cũng trả null, không dựng 404', () => {
    expect(problemPreviewHref('pipeline', 'X-0001')).toBeNull();
    expect(problemPreviewHref('netpol', 'X-0001')).toBeNull();
    expect(problemPreviewHref('dockerfile', 'X-0001')).toBeNull();
    expect(problemPreviewHref('cicd', 'X-0001')).toBeNull();
  });

  /*
   * CỔNG CHỐNG LỜI KHAI SAI, và là lý do file này đọc đĩa.
   *
   * Mỗi dòng trong `PREVIEW_ROUTE_BY_GAME` khai rằng route đó ĐỌC `?problem=`.
   * Không gì trong `tsc` kiểm được lời khai ấy: thêm `git: '/games/git'` biên
   * dịch sạch, lint sạch, và hỏng đúng theo kiểu đã mô tả ở trên. Ô này mở
   * chính `page.tsx` của route được khai và đòi thấy chữ `problem` trong đó.
   *
   * Nó cố tình đọc file nguồn chứ không gọi hàm: thứ cần khẳng định là một tính
   * chất của TRANG KIA, và trang kia là Server Component đọc `searchParams` —
   * không có cách gọi nào từ đây chứng minh được điều đó.
   */
  it('mọi game ĐƯỢC KHAI có đường xem trước thì route của nó thật sự đọc ?problem=', () => {
    const claimed = GAME_IDS.filter((gameId) => problemPreviewHref(gameId, 'X-0001') !== null);
    expect(claimed.length).toBeGreaterThan(0);

    for (const gameId of claimed) {
      const href = problemPreviewHref(gameId, 'X-0001');
      const route = (href ?? '').split('?')[0] ?? '';
      const page = resolve(APP_DIR, `${route.replace(/^\//u, '')}/page.tsx`);
      expect(existsSync(page), `${route} phải có page.tsx`).toBe(true);
      expect(readFileSync(page, 'utf8'), `${route} phải đọc params.problem`).toContain(
        'params.problem',
      );
    }
  });

  /*
   * ĐỐI CHỨNG DƯƠNG cho ô trên. Không có nó, một phép dò hỏng (sai đường dẫn,
   * đọc nhầm file) làm ô trên xanh mãi mãi trên một tập RỖNG.
   *
   * ⚠ ĐỔI CHỦ THỂ 2026-09-15. Đối chứng cũ là `games/git/page.tsx` — route đó nay ĐÃ
   * đọc `params.problem`, nên giữ nguyên thì ô này đỏ VÌ MỘT LÝ DO SAI: nó sẽ báo
   * "phép dò hỏng" trong khi sự thật là route đã được nối. Chọn một trang KHÁC, trang
   * danh mục game, vì nó không bao giờ có lý do đọc `?problem=`: đối chứng phải là
   * một file Ở LẠI phía "không đọc", không phải file đang trên đường đổi phe.
   */
  it('phép dò THẬT SỰ phân biệt được route có đọc và route không đọc', () => {
    const catalog = resolve(APP_DIR, 'games/page.tsx');
    expect(existsSync(catalog)).toBe(true);
    expect(readFileSync(catalog, 'utf8')).not.toContain('params.problem');

    // Vế dương: cùng phép dò, trên một file đã biết là CÓ đọc.
    const gitPage = resolve(APP_DIR, 'games/git/page.tsx');
    expect(existsSync(gitPage)).toBe(true);
    expect(readFileSync(gitPage, 'utf8')).toContain('params.problem');
  });
});
