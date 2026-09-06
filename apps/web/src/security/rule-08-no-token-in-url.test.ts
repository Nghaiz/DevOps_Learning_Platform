import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Luật 8 — không endpoint nào nhận token qua query string; grep codebase 0 kết
 * quả token-in-URL.
 *
 * Mức test: STATIC — grep thật (không phải asserting "code tôi viết thì sạch"),
 * quét toàn bộ `apps/web/src/**\/*.{ts,tsx}` (trừ chính file test này, dễ tự khớp
 * pattern của chính nó) tìm 2 hình dạng: (1) đọc `token`/`access_token`/
 * `refresh_token` từ query string (`searchParams.get(...)`, `req.query...`),
 * (2) nhét token vào URL (`?token=`, `&token=`, `&access_token=`).
 */

const TOKEN_QUERY_KEY_PATTERN = /searchParams\s*\.\s*get\(\s*['"](?:access[_-]?|refresh[_-]?)?token['"]\s*\)/i;
const QUERY_TOKEN_ASSIGN_PATTERN = /[?&](?:access[_-]?|refresh[_-]?)?token=/i;
const REQ_QUERY_TOKEN_PATTERN = /req(?:uest)?\s*\.\s*query\s*[.[]\s*['"]?(?:access[_-]?|refresh[_-]?)?token/i;

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.turbo') {
      continue;
    }
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !full.endsWith('rule-08-no-token-in-url.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('luật 8 — token không bao giờ đi qua URL/query string', () => {
  const srcRoot = path.resolve(import.meta.dirname, '..');

  /**
   * Đọc MỘT lượt cho cả ba phép kiểm, ở thân `describe` (pha thu thập) chứ không
   * trong thân `it`.
   *
   * Bản trước đọc TOÀN BỘ cây nguồn ba lần — mỗi `it` một lượt `readFileSync`
   * trên cùng tập file. Đo dưới `turbo run` với năm gói song song trên Windows:
   * 5332ms cho 4 test, tức mỗi lượt quét ~1777ms và mỗi lượt nằm TRONG một thân
   * `it` do `testTimeout` 5000ms gác. Cây nguồn đang lớn lên theo từng đợt, nên
   * đó là một cổng an ninh sẽ đỏ vì tranh I/O — và một cổng chớp tắt là một cổng
   * sẽ bị tắt. Cùng hình dạng đã cắn `landmark-contract.test.ts` (đỏ thật ở
   * 5136ms) và `packages/scenario/src/source.test.ts`; xem
   * [[turbo-parallel-load-times-out-io-tests]].
   *
   * Ba biểu thức đều không mang cờ `g`, nên gộp chung một lượt không dính bẫy
   * `lastIndex` của `RegExp.test` (cờ `g` sẽ làm `.test` trong `.filter` bỏ qua
   * cách một file).
   */
  const sources = collectSourceFiles(srcRoot).map((file) => {
    const content = readFileSync(file, 'utf8');
    return {
      file,
      readsFromSearchParams: TOKEN_QUERY_KEY_PATTERN.test(content),
      readsFromReqQuery: REQ_QUERY_TOKEN_PATTERN.test(content),
      buildsUrlWithToken: QUERY_TOKEN_ASSIGN_PATTERN.test(content),
    };
  });

  it('quét được ít nhất vài chục file nguồn (sanity — grep không chạy trên tập rỗng)', () => {
    expect(sources.length).toBeGreaterThan(10);
  });

  /**
   * ĐỐI CHỨNG DƯƠNG — bắt buộc, không phải làm đẹp.
   *
   * Ba `it` bên dưới đều khẳng định "không có vi phạm nào". Tập file khác rỗng
   * (đã kiểm ở trên) nhưng điều đó KHÔNG chứng minh ba biểu thức còn bắt được gì:
   * một dấu `\` lạc chỗ hay một nhóm bắt viết hỏng làm cả ba luôn trả `false`,
   * và cổng an ninh này chuyển sang xanh vĩnh viễn mà không ai biết. Đóng đúng
   * cái lỗ đó bằng cách bắt mỗi biểu thức nhận diện một mẫu vi phạm đã biết.
   */
  it('ba biểu thức BIẾT KÊU trên mẫu vi phạm đã biết (nếu không, ba phép kiểm dưới là xanh rỗng)', () => {
    expect(TOKEN_QUERY_KEY_PATTERN.test("searchParams.get('access_token')")).toBe(true);
    expect(REQ_QUERY_TOKEN_PATTERN.test('req.query.token')).toBe(true);
    expect(QUERY_TOKEN_ASSIGN_PATTERN.test('/ws?token=abc')).toBe(true);

    // …và KHÔNG kêu bừa trên mã sạch, nếu không cổng sẽ đỏ vĩnh viễn rồi bị tắt.
    expect(TOKEN_QUERY_KEY_PATTERN.test("searchParams.get('cursor')")).toBe(false);
    expect(REQ_QUERY_TOKEN_PATTERN.test('req.query.limit')).toBe(false);
    expect(QUERY_TOKEN_ASSIGN_PATTERN.test('/lessons?cursor=abc')).toBe(false);
  });

  it('không file nào đọc token từ searchParams.get(...)', () => {
    expect(sources.filter((source) => source.readsFromSearchParams).map((source) => source.file)).toEqual([]);
  });

  it('không file nào đọc token từ req.query...', () => {
    expect(sources.filter((source) => source.readsFromReqQuery).map((source) => source.file)).toEqual([]);
  });

  it('không file nào build URL có ?token=/&token=/&access_token=', () => {
    expect(sources.filter((source) => source.buildsUrlWithToken).map((source) => source.file)).toEqual([]);
  });
});
