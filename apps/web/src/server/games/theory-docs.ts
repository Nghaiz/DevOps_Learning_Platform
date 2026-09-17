import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { validateTheoryDocs, type GameId, type TheoryDoc } from '@devops-platform/games';

/**
 * Bộ nạp bài lý thuyết DÙNG CHUNG cho mọi game có `content/games/<game>/theory/`.
 *
 * Tách khỏi `git-theory.ts` khi game CI/CD (19.I) cần đúng chuỗi đọc → kiểm chéo →
 * ném đó. Chép lại bộ đọc frontmatter cho game thứ hai là mời một bản sửa CRLF
 * chỉ chạm một bản. Ràng buộc về `content/` trong image (Dockerfile + `.dockerignore`)
 * ghi ở đầu `git-theory.ts` và áp nguyên cho mọi game.
 */

export interface RawDoc {
  readonly frontmatter: Record<string, unknown>;
  readonly body: string;
}

/**
 * Bộ đọc frontmatter tối giản, đủ cho đúng năm khoá của khuôn bài lý thuyết.
 *
 * ⛔ CỐ Ý không thêm một thư viện YAML. `packages/games` đã có một bộ đọc YAML
 * cho manifest Kubernetes, và bộ đó hiểu cấu trúc lồng nhau mà frontmatter ở
 * đây không bao giờ dùng. Hai bộ đọc cho hai mục đích khác nhau thì rõ hơn một
 * bộ đọc tổng quát bị gọi ở hai chỗ với hai kỳ vọng khác nhau.
 *
 * ⚠ CRLF: repo này có tiền sử một parser nuốt sạch nội dung vì `\r` dính vào
 * cuối mỗi dòng và không ai thấy gì đỏ. Bỏ `\r` ngay ở bước tách dòng.
 */
export function parseFrontmatter(text: string): RawDoc | null {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (!normalized.startsWith('---\n')) return null;
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return null;

  const head = normalized.slice(4, end);
  const body = normalized.slice(end + 5).trim();

  const frontmatter: Record<string, unknown> = {};
  let listKey: string | null = null;
  const list: string[] = [];

  for (const line of head.split('\n')) {
    if (line.trim() === '') continue;
    if (line.startsWith('  - ') || line.startsWith('- ')) {
      list.push(line.replace(/^\s*-\s*/, '').trim());
      continue;
    }
    if (listKey !== null) {
      frontmatter[listKey] = [...list];
      list.length = 0;
      listKey = null;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (value === '') {
      listKey = key;
      continue;
    }
    frontmatter[key] = /^\d+$/.test(value) ? Number.parseInt(value, 10) : value;
  }
  if (listKey !== null) frontmatter[listKey] = [...list];

  return { frontmatter, body };
}

export function toTheoryDoc(raw: RawDoc, gameId: GameId): TheoryDoc | null {
  const { frontmatter, body } = raw;
  const id = frontmatter['id'];
  const title = frontmatter['title'];
  const readMinutes = frontmatter['readMinutes'];
  const usedByLevels = frontmatter['usedByLevels'];
  if (typeof id !== 'string' || typeof title !== 'string') return null;
  if (typeof readMinutes !== 'number') return null;
  if (!Array.isArray(usedByLevels)) return null;

  return {
    frontmatter: {
      id,
      title,
      gameId,
      readMinutes,
      usedByLevels: usedByLevels.filter((x): x is string => typeof x === 'string'),
    },
    body,
  };
}

/**
 * Đọc mọi bài `.md` của một thư mục và kiểm chéo với tập level.
 *
 * ⚠ Ném khi `validateTheoryDocs` báo lỗi: bài trỏ vào level không tồn tại, hay
 * level không bài nào phủ, là lỗi NỘI DUNG và phải nổ lúc dựng trang, không
 * thành một nút "Bài giảng" bấm vào thì trống.
 */
export function loadTheoryDocs(
  dir: string,
  gameId: GameId,
  levelIds: readonly string[],
  gameLabel: string,
): readonly TheoryDoc[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const docs: TheoryDoc[] = [];
  for (const file of files) {
    const raw = parseFrontmatter(readFileSync(join(dir, file), 'utf8'));
    if (raw === null) continue;
    const doc = toTheoryDoc(raw, gameId);
    if (doc !== null) docs.push(doc);
  }

  const issues = validateTheoryDocs(docs, levelIds);
  if (issues.length > 0) {
    const lines = issues.map((i) => `  [${i.code}] ${i.message}`).join('\n');
    throw new Error(
      `Nội dung bài lý thuyết ${gameLabel} không hợp lệ (${String(issues.length)} lỗi):\n${lines}`,
    );
  }
  return docs;
}
