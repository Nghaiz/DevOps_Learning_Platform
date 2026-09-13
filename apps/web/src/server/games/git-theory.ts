import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { GIT_THEORY_IDS, validateTheoryDocs, type TheoryDoc } from '@devops-platform/games';

/**
 * Bộ nạp bài lý thuyết của game Git — **chạy ở SERVER, đúng một lần mỗi lần tải
 * trang**.
 *
 * ⛔ Vì sao không fetch lúc chơi: ô nghiệm thu AC-2 của trụ cột ③ là **0 lời gọi
 * backend trong lúc chơi**, đo bằng Playwright network trace. Một `theory.get`
 * qua tRPC lúc người chơi mở hộp bài giảng sẽ phá đúng ô đó.
 *
 * Nên toàn bộ 32 bài đi cùng payload của trang. Tổng ~15.000 từ tiếng Việt,
 * khoảng 100KB thô — chấp nhận được cho một trang mà người ta ở lại hàng chục
 * phút, và rẻ hơn một round-trip cho mỗi lần mở panel.
 *
 * ⚠ `content/` ĐỌC LÚC CHẠY nên Next **không** trace nó vào output standalone.
 * `apps/web/Dockerfile` phải `COPY content ./content` tường minh (dòng 204 hiện
 * có), và `.dockerignore` phải giữ dòng `!content/` + `**` + `/*.md` (dòng 40) để ngoại
 * lệ đó thắng luật loại-mọi-markdown ở trên. Cả hai đã đúng tại thời điểm P17; ô AC-10
 * kiểm một FILE cụ thể chứ không kiểm thư mục, vì `.dockerignore` từng bóc sạch
 * markdown mà `ls` vẫn xanh do thư mục vẫn tồn tại.
 */

const THEORY_DIR = join(process.cwd(), '..', '..', 'content', 'games', 'git', 'theory');

/** Thư mục nội dung, cũng dùng cho phép kiểm trong test và trong AC-10. */
export function gitTheoryDir(): string {
  return THEORY_DIR;
}

interface RawDoc {
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
function parseFrontmatter(text: string): RawDoc | null {
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

function toTheoryDoc(raw: RawDoc): TheoryDoc | null {
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
      gameId: 'git',
      readMinutes,
      usedByLevels: usedByLevels.filter((x): x is string => typeof x === 'string'),
    },
    body,
  };
}

/**
 * Đọc cả 32 bài từ đĩa.
 *
 * ⚠ Ném khi bộ kiểm chéo báo lỗi, và đó là chủ ý: một bài trỏ vào level không
 * tồn tại (hoặc một level không bài nào phủ) là lỗi NỘI DUNG, và nó phải nổ ở
 * lúc dựng trang chứ không im lặng cho ra một nút "Bài giảng" bấm vào thì trống.
 * Kiểu lỗi im lặng đó là thứ `validateTheoryDocs` sinh ra để chặn.
 */
export function loadGitTheory(levelIds: readonly string[]): readonly TheoryDoc[] {
  const files = readdirSync(THEORY_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

  const docs: TheoryDoc[] = [];
  for (const file of files) {
    const raw = parseFrontmatter(readFileSync(join(THEORY_DIR, file), 'utf8'));
    if (raw === null) continue;
    const doc = toTheoryDoc(raw);
    if (doc !== null) docs.push(doc);
  }

  const issues = validateTheoryDocs(docs, levelIds);
  if (issues.length > 0) {
    const lines = issues.map((i) => `  [${i.code}] ${i.message}`).join('\n');
    throw new Error(
      `Nội dung bài lý thuyết game Git không hợp lệ (${String(issues.length)} lỗi):\n${lines}`,
    );
  }
  return docs;
}

/** Danh sách id bài mong đợi, để test khẳng định đĩa khớp hợp đồng. */
export const EXPECTED_THEORY_IDS = GIT_THEORY_IDS;
