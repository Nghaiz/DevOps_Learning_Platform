import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Mọi file văn bản của nội dung FIRST-PARTY phải xuống dòng LF.
 *
 * Markdown đã được parser tự chuẩn hoá (`normalizeNewlines`), nhưng script
 * (`verify.sh`, `setup/*.sh`, `solution.sh`) thì KHÔNG đi qua parser nào: chúng
 * tới thẳng bash trong pod, nơi một `\r` cuối dòng thành `$'\r': command not
 * found` ở MỖI dòng. Script chấm hỏng kiểu đó trả exit ≠ 0, tức người học nhận
 * "chưa đạt" cho một bài làm đúng — và trên máy soạn (Windows) mọi thứ trông bình
 * thường. `.gitattributes` là lớp chặn ở git; file này là lớp chặn ở CI, vì một
 * dòng `.gitattributes` đặt sai thứ tự im lặng vô hiệu (xem chú thích ở đó).
 *
 * Bài nhập từ upstream (`content/scenarios/<không dlp->`) bị loại có chủ ý: chúng
 * là bản sao byte-exact, `scripts/vendor-scenarios.mjs --check` canh chúng.
 */

const CONTENT = path.resolve(import.meta.dirname, '..', '..', '..', 'content');
const TEXT_EXT = new Set([
  '.md', '.sh', '.json', '.tex', '.svg', '.py', '.go', '.mod', '.yaml', '.yml',
  '.conf', '.ini', '.txt', '.html', '.js', '.env', '.toml', '.cfg', '.sql',
]);
const TEXT_NAMES = new Set(['Dockerfile', '.dockerignore', '.gitignore', 'Makefile']);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (TEXT_EXT.has(path.extname(name)) || TEXT_NAMES.has(name)) {
      out.push(full);
    }
  }
}

function firstPartyFiles(): string[] {
  const files: string[] = [];
  for (const kind of ['labs', 'playgrounds', 'paths', 'quizzes']) {
    walk(path.join(CONTENT, kind), files);
  }
  for (const id of readdirSync(path.join(CONTENT, 'scenarios'))) {
    if (id.startsWith('dlp-')) {
      walk(path.join(CONTENT, 'scenarios', id), files);
    }
  }
  return files;
}

describe('nội dung first-party xuống dòng LF', () => {
  const files = firstPartyFiles();

  it('có file để kiểm (một cổng không thấy file nào là cổng không kiểm gì)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('không file văn bản nào chứa \\r', () => {
    const offenders = files
      .filter((file) => readFileSync(file).includes(0x0d))
      .map((file) => path.relative(CONTENT, file));
    expect(offenders).toEqual([]);
  });
});
