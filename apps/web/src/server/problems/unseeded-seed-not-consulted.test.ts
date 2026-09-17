/**
 * Cổng: KHÔNG mã sản phẩm nào được tra `*_UNSEEDED_REPLAY_SEED`.
 *
 * ## Bất biến này đắt, và trước file này nó chỉ được một CHÚ THÍCH giữ
 *
 * `core/problem.ts` § `Submission.seed` ghi lại một lỗi thiết kế đã sửa: hợp đồng
 * từng khai `seed: number | null` với ý "`null` = bài không seedable", và vì
 * engine BẮT BUỘC nhận một số để dựng trạng thái đầu, mỗi plugin phải tự công bố
 * một hằng "không-seed". Hai hằng đó lệch nhau ngay từ dòng đầu:
 *
 *     K8S_UNSEEDED_REPLAY_SEED = 0        GIT_UNSEEDED_REPLAY_SEED = 1
 *
 * Hậu quả không đọc ra thành một lỗi. Nó đọc ra thành: client chơi trên một thế
 * giới đầu, máy chủ phát lại trên một thế giới đầu KHÁC, và **mọi lượt nộp hợp
 * lệ đều bị từ chối** — nhìn từ phía người học thì giống hệt một hệ thống từ
 * chối người chơi ngẫu nhiên.
 *
 * Bản vá là bỏ hẳn chỗ cho phép hai bên tự chọn: lượt nộp MANG THEO số đã dùng,
 * máy chủ phát lại bằng đúng số đó, **không phía nào tra hằng**. Hai hằng còn
 * lại chỉ để làm gá cho test và để ghi lại lịch sử đó.
 *
 * ## Vì sao cần một cổng chứ không chỉ một chú thích
 *
 * `phase-18-exec.md` §7.6/§8.9 xếp chúng là "mã chết" và định xoá. Đo 2026-09-15
 * thì "chết" sai: chúng KHÔNG được mã sản phẩm đọc, nhưng đó là **có chủ ý** chứ
 * không phải bỏ quên — và cả hai vẫn được export qua barrel, tức bất kỳ ai cũng
 * `import` lại được. Thứ giữ cho điều đó không xảy ra hôm nay là một đoạn văn
 * xuôi, mà văn xuôi thì chỉ review mới bắt được.
 *
 * File này đổi nó thành một thứ đo được: thêm một `import` hằng vào bất kỳ file
 * sản phẩm nào ⇒ ĐỎ, kèm tên file.
 *
 * ## Vì sao gác `import`, không gác việc NHẮC TÊN
 *
 * Bốn file sản phẩm nhắc tên hai hằng trong chú thích (`core/problem.ts`,
 * `git/solvability.ts`, `submit.ts`, và chính hai file khai) — đó là tài liệu,
 * và cấm nhắc tên vấn đề trong chú thích là đúng cái bẫy `phase-18.md` §18.A đã
 * dẫm một lần ("một ô nghiệm thu chỉ qua được bằng cách cấm nhắc tên vấn đề").
 *
 * Một file chỉ TRA được giá trị nếu nó `import` hằng. Nên phép quét dựng danh
 * sách câu lệnh `import` rồi soi từng câu — chính xác, và miễn nhiễm với chú
 * thích. `index.ts` re-export bằng `export ... from`, không phải `import`, nên
 * nó không cần một dòng miễn trừ: re-export chỉ làm hằng VỚI TỚI được, không
 * tra giá trị của nó.
 *
 * ## Ô này không thể xanh-giả
 *
 * Hai phép gác đầu là `rules/green-that-proves-nothing.md` áp cho chính nó: một
 * glob sai đường dẫn quét 0 file và "không ai import" khi đó đúng một cách rỗng
 * nghĩa. Nên ô 1 đòi phép quét thấy đủ file, và ô 2 là ĐỐI CHỨNG DƯƠNG — bộ so
 * khớp phải bắt được một file CÓ import thật (file test của `packages/games`,
 * thứ nằm ngoài tập sản phẩm).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/** `apps/web/src/server/problems` → gốc repo. */
const REPO = join(import.meta.dirname, '..', '..', '..', '..', '..');

const TREES = [join(REPO, 'packages', 'games', 'src'), join(REPO, 'apps', 'web', 'src')];

const SEED_CONSTANTS = ['K8S_UNSEEDED_REPLAY_SEED', 'GIT_UNSEEDED_REPLAY_SEED'] as const;

/**
 * Từ `import` tới `from '...'`. `[\s\S]` để nuốt được import nhiều dòng — dạng
 * prettier sinh ra khi danh sách tên dài, và là dạng `problem-level.test.ts`
 * đang dùng, tức dạng đối chứng dương phải bắt được.
 */
const IMPORT_STATEMENT = /^import\b[\s\S]*?\bfrom\b\s*['"][^'"]+['"]/gmu;

function importsOf(source: string): readonly string[] {
  return source.match(IMPORT_STATEMENT) ?? [];
}

/** Tên hằng bị `import` trong file này, rỗng nếu không có. */
function seedImportsIn(source: string): readonly string[] {
  const statements = importsOf(source);
  return SEED_CONSTANTS.filter((name) =>
    statements.some((statement) => new RegExp(`\\b${name}\\b`, 'u').test(statement)),
  );
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.tsx?$/u.test(path);
}

function sourceFiles(tree: string): readonly string[] {
  return readdirSync(tree, { recursive: true, encoding: 'utf8' })
    .filter((entry) => /\.tsx?$/u.test(entry) && !isTestFile(entry))
    .map((entry) => join(tree, entry));
}

const PRODUCTION = TREES.flatMap(sourceFiles);

describe('bộ quét đọc được cây nguồn thật', () => {
  /*
   * Không có ô này thì mọi khẳng định dưới đây xanh vô nghĩa khi đường dẫn sai:
   * `readdirSync` trên một cây rỗng trả `[]`, và "không file nào import" là câu
   * ĐÚNG về một tập rỗng.
   */
  it('quét được cả hai cây, và số file đủ lớn để không phải một cây rỗng', () => {
    /*
     * Đo 2026-09-15: `packages/games/src` 138 file sản phẩm, `apps/web/src` 521
     * ⇒ 659. Ngưỡng 500 để lại biên ~24%, đủ rộng cho một lượt dọn dẹp bình
     * thường mà vẫn bắt được ca thật sự cần bắt: một đường dẫn sai cho 0 file.
     *
     * ⚠ Đây KHÔNG phải một pinned baseline (`rules/pinned-baseline-test-companion.md`):
     * nó chốt một bất biến LÀNH của chính đầu vào, nên nó đỏ khi phép quét hỏng,
     * không bao giờ đỏ vì ai đó sửa được một lỗi. Không cần ô bạn đồng hành.
     */
    expect(PRODUCTION.length).toBeGreaterThan(500);
    for (const tree of TREES) {
      expect(sourceFiles(tree).length, tree).toBeGreaterThan(50);
    }
  });

  it('ĐỐI CHỨNG DƯƠNG — bộ so khớp bắt được một file CÓ import hằng', () => {
    /*
     * File test của `packages/games` import cả hai hằng, và nó nằm NGOÀI tập
     * sản phẩm (bị `isTestFile` loại). Nên nó là gá lý tưởng: nếu
     * `seedImportsIn` gõ sai, hay `IMPORT_STATEMENT` không nuốt được import
     * nhiều dòng, ô này đỏ — trong khi ô chính vẫn xanh và không nói gì.
     */
    const control = join(REPO, 'packages', 'games', 'src', 'problem-plugins.test.ts');
    expect(seedImportsIn(readFileSync(control, 'utf8')).length).toBeGreaterThan(0);
  });
});

describe('không mã sản phẩm nào TRA hằng không-seed', () => {
  it('mọi lượt phát lại phải dùng seed do lượt nộp mang theo', () => {
    const offenders = PRODUCTION.filter(
      (file) => seedImportsIn(readFileSync(file, 'utf8')).length > 0,
    ).map((file) => relative(REPO, file).split(sep).join('/'));

    expect(
      offenders,
      'Một file sản phẩm đang import hằng không-seed. Tra hằng lúc phát lại là ' +
        'đúng lỗi mà `core/problem.ts` § `Submission.seed` mô tả: hai plugin chọn ' +
        'hai số khác nhau (0 vs 1), nên máy chủ dựng một thế giới đầu KHÁC client ' +
        'và MỌI lượt nộp hợp lệ bị từ chối — không lỗi, không log, chỉ một hệ ' +
        'thống trông như từ chối người chơi ngẫu nhiên. Dùng `submission.seed`.',
    ).toEqual([]);
  });
});
