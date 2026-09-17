import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Cổng chống RÒ ENGINE vào bundle của route `problems` (§18.D).
 *
 * ## Vì sao nó ở `apps/web` chứ không ở `packages/games`
 *
 * Bản đầu viết trong `packages/games`, và nó làm `pnpm --filter
 * @devops-platform/games typecheck` ĐỎ với `TS2591`: package đó CỐ Ý không khai
 * `@types/node` vì nó chạy trong trình duyệt. Cách duy nhất làm nó xanh lại là
 * thêm `@types/node`, tức mở đường cho mã engine `import` `node:fs` mà không
 * cổng nào kêu , đổi một ô gác lấy một lỗ hổng lớn hơn thứ nó gác.
 *
 * Nhà đúng là ĐÂY, chỗ hậu quả rơi xuống: thứ bị đội lên là bundle của ứng dụng
 * web, và `bundle:check` , cổng duy nhất khác thấy được chuyện này , cũng thuộc
 * về `apps/web`.
 *
 * ## Vấn đề nó gác
 *
 * `/problems` và `/problems/:code` tra nhãn chủ đề qua `problemTopicLabels`.
 * Phép tra "đúng hơn" là đi qua `PROBLEM_PLUGINS`, nhưng bảng đó `import`
 * `K8S_PROBLEM_PLUGIN` + `GIT_PROBLEM_PLUGIN`, và hai plugin đó `import`
 * `createSession` / `createGitSession` , tức CẢ HAI engine. PR #124
 * (2026-09-14) đo được cái giá: một chunk 369.938 B chứa engine git nằm ở 7/38
 * route, 5 trong 7 là route `problems`, và nó đẩy `/games/k8s/page` vượt trần
 * `bundle:check`.
 *
 * ⚠ `tsc`, `eslint` và `vitest` đều MÙ với chuyện bundle. `bundle:check` thấy
 * nhưng chỉ chạy SAU `next build`, tức sau khi một PR đã xanh hết mọi ô nhanh.
 * Ô này là thứ báo NGAY.
 */

const GAMES_SRC = resolve(process.cwd(), '../../packages/games/src');

/**
 * Các module CHỞ ENGINE, theo TÊN FILE chứ không theo tên hàm: `createSession`
 * có thể đổi tên, còn "file này là engine" thì không.
 */
const ENGINE_MODULES = [
  'k8s/session.ts',
  'k8s/replay-engine.ts',
  'git/engine.ts',
  'k8s/problem-plugin.ts',
  'git/problem-plugin.ts',
  'core/problem-plugins.ts',
  /*
   * Engine CI/CD, thêm 2026-09-16 (19.H). Hai tên này ĐI TRƯỚC mã chúng gác:
   * `cicd/problem-plugin.ts` chưa tồn tại, và đó chính là lý do thêm bây giờ.
   *
   * Ô này đọc bao đóng import của `problem-topic-labels.ts`, còn một tên không
   * có trong bao đóng thì vô hại. Nếu đợi tới lúc plugin ra đời mới thêm, thì
   * giữa hai thời điểm đó một dòng `import` duy nhất từ `problem-topic-labels.ts`
   * sang plugin sẽ kéo cả engine CI/CD (1009 dòng) vào bundle của MỌI route
   * `/problems` — và KHÔNG ô nào đỏ, vì danh sách này chưa biết tên nó. Đúng
   * hình dạng PR #124 đã trả giá một lần với engine git.
   */
  'cicd/engine.ts',
  'cicd/problem-plugin.ts',
] as const;

/** Đi theo mọi `import`/`export … from './x.ts'` TƯƠNG ĐỐI, đệ quy. */
function relativeImportClosure(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [resolve(GAMES_SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) {
      continue;
    }
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    const specifiers = [...src.matchAll(/from\s+'(\.[^']+)'/gu)].map((match) => match[1]);
    for (const specifier of specifiers) {
      if (specifier !== undefined) {
        queue.push(resolve(dirname(file), specifier));
      }
    }
  }
  return [...seen].map((file) => relative(GAMES_SRC, file).split('\\').join('/'));
}

describe('nhãn chủ đề không kéo engine vào route problems', () => {
  it('đồ thị nhập của problem-topic-labels.ts KHÔNG chạm engine nào', () => {
    const closure = relativeImportClosure('problem-topic-labels.ts');
    const leaked = closure.filter((file) => ENGINE_MODULES.some((engine) => file === engine));
    expect(
      leaked,
      'Mỗi dòng trên là một module engine mà `problemTopicLabels` kéo theo. ' +
        'Nó sẽ đi vào bundle của MỌI route problems. Tra dữ liệu lá ' +
        '(`k8s/problem.ts`, `git/problem-topics.ts`), đừng tra qua `PROBLEM_PLUGINS`.',
    ).toEqual([]);
  });

  /*
   * ĐỐI CHỨNG DƯƠNG. Không có ô này thì một `relativeImportClosure` hỏng (regex
   * sai, đường dẫn sai, đọc nhầm file) cũng làm ô trên XANH , và nó xanh mãi
   * mãi, đúng hình dạng `rules/green-that-proves-nothing.md`.
   */
  it('phép dò THẬT SỰ thấy engine khi có', () => {
    const closure = relativeImportClosure('git/problem-plugin.ts');
    expect(closure).toContain('git/engine.ts');
  });

  /*
   * Ô T0: nếu `GAMES_SRC` trỏ sai chỗ thì `readFileSync` sẽ NÉM, nhưng nếu một
   * ngày nào đó nó trỏ vào một thư mục rỗng hợp lệ thì hai ô trên thành vô
   * nghĩa trên một tập rỗng. Ô này đòi phép dò đọc được một cây THẬT.
   */
  it('phép dò đọc được một cây nhập thật, không phải một tập rỗng', () => {
    expect(relativeImportClosure('problem-topic-labels.ts').length).toBeGreaterThan(2);
  });
});
