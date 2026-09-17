import { join } from 'node:path';

import { CICD_LEVELS, type TheoryDoc } from '@devops-platform/games';

import { loadTheoryDocs } from './theory-docs';

/**
 * Bộ nạp bài lý thuyết của game CI/CD (19.I) — chạy ở SERVER, một lần mỗi lần tải
 * trang, cùng lý do game Git: đọc lúc chơi là một lời gọi backend, và AC-2 đo 0.
 *
 * ⚠ `content/` đọc lúc chạy nên Next không trace nó vào output standalone. Hai
 * điều kiện image (COPY content + ngoại lệ markdown ở `.dockerignore`) ghi ở đầu
 * `git-theory.ts`, và áp nguyên cho thư mục này.
 */

const THEORY_DIR = join(process.cwd(), '..', '..', 'content', 'games', 'cicd', 'theory');

/** Thư mục nội dung, cũng dùng cho phép kiểm trong test. */
export function cicdTheoryDir(): string {
  return THEORY_DIR;
}

/** Đọc mọi bài và kiểm chéo với ĐỦ 28 level của hai chương. Ném khi lệch. */
export function loadCicdTheory(): readonly TheoryDoc[] {
  return loadTheoryDocs(
    THEORY_DIR,
    'cicd',
    CICD_LEVELS.map((level) => level.id),
    'game CI/CD',
  );
}
