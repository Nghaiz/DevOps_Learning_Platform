import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GAME_IDS } from './core/types.ts';
import { problemTopicLabels } from './problem-topic-labels.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Các module CHỞ ENGINE. Chạm một trong số này từ đồ thị nhập của
 * `problem-topic-labels.ts` là kéo cả engine vào mọi route `problems`.
 *
 * Danh sách theo TÊN FILE chứ không theo tên hàm: `createSession` có thể đổi
 * tên, còn "file này là engine" thì không.
 */
const ENGINE_MODULES = [
  'k8s/session.ts',
  'k8s/replay-engine.ts',
  'git/engine.ts',
  'k8s/problem-plugin.ts',
  'git/problem-plugin.ts',
  'core/problem-plugins.ts',
] as const;

/** Đi theo mọi `import`/`export … from './x.ts'` TƯƠNG ĐỐI, đệ quy. */
function relativeImportClosure(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [resolve(HERE, entry)];
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
  return [...seen].map((file) => relative(HERE, file).split('\\').join('/'));
}

describe('problemTopicLabels', () => {
  /*
   * Ô GÁC CHÍNH của file này, và nó gác một thứ không cổng nào khác thấy.
   *
   * `tsc` / `eslint` / `vitest` đều mù với bundle; `bundle:check` thấy nhưng chỉ
   * chạy SAU `next build`, tức sau khi một PR đã xanh hết mọi ô nhanh. Nên nếu
   * ai đó "dọn cho gọn" bằng cách tra qua `PROBLEM_PLUGINS`, thứ duy nhất báo
   * ngay là ô này.
   */
  it('đồ thị nhập KHÔNG chạm engine nào — đây là cả lý do file tồn tại', () => {
    const closure = relativeImportClosure('problem-topic-labels.ts');
    const leaked = closure.filter((file) =>
      ENGINE_MODULES.some((engine) => file === engine),
    );
    expect(leaked).toEqual([]);
  });

  /*
   * ĐỐI CHỨNG DƯƠNG cho phép đo ở trên. Không có ô này thì một `relativeImportClosure`
   * hỏng (trả mảng rỗng vì regex sai, vì đường dẫn sai, vì đọc nhầm file) cũng
   * làm ô trên XANH — và nó xanh mãi mãi, đúng hình dạng
   * `rules/green-that-proves-nothing.md`.
   */
  it('phép dò đồ thị THẬT SỰ thấy engine khi có — nếu không, ô trên vô giá trị', () => {
    const closure = relativeImportClosure('git/problem-plugin.ts');
    expect(closure).toContain('git/engine.ts');
  });

  it('mọi GameId tra được một bảng, không cái nào undefined', () => {
    for (const gameId of GAME_IDS) {
      expect(problemTopicLabels(gameId)).toBeTypeOf('object');
    }
  });

  it('K8s và Git cho nhãn tiếng Việt thật, không phải chính id', () => {
    expect(problemTopicLabels('k8s').workload).toBeTypeOf('string');
    expect(problemTopicLabels('k8s').workload).not.toBe('workload');
    expect(problemTopicLabels('git').branching).toBeTypeOf('string');
    expect(problemTopicLabels('git').branching).not.toBe('branching');
  });

  /*
   * Bài Git mang chủ đề Git phải tra ra nhãn — chính là món nợ §18.A đóng ở
   * đây. Trước lượt này `PROBLEM_TOPIC_LABELS` (chỉ K8s) trả `undefined` và màn
   * hình hiện một Badge RỖNG.
   */
  it('chủ đề của game này KHÔNG tra nhầm sang bảng của game kia', () => {
    expect(problemTopicLabels('k8s').branching).toBeUndefined();
    expect(problemTopicLabels('git').workload).toBeUndefined();
  });

  it('game chưa có plugin bài trả bảng RỖNG, không ném', () => {
    expect(problemTopicLabels('pipeline')).toEqual({});
  });
});
