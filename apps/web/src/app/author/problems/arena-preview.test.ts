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
   * Ô này KHÔNG phải "Git chưa làm xong". Nó khoá một lựa chọn: thà không có
   * nút còn hơn một nút mở ra ván Git bình thường ở level mặc định, vì lượt đó
   * không lỗi, không 404, và người soạn kết luận rằng bài của họ xem trước được.
   */
  it('Git trả null — một link sai im lặng tệ hơn không có link', () => {
    expect(problemPreviewHref('git', 'GIT-0001')).toBeNull();
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
   */
  it('phép dò THẬT SỰ phân biệt được route có đọc và route không đọc', () => {
    const gitPage = resolve(APP_DIR, 'games/git/page.tsx');
    expect(existsSync(gitPage)).toBe(true);
    expect(readFileSync(gitPage, 'utf8')).not.toContain('params.problem');
  });
});
