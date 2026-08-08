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
  const files = collectSourceFiles(srcRoot);

  it('quét được ít nhất vài chục file nguồn (sanity — grep không chạy trên tập rỗng)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('không file nào đọc token từ searchParams.get(...)', () => {
    const offenders = files.filter((file) => TOKEN_QUERY_KEY_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('không file nào đọc token từ req.query...', () => {
    const offenders = files.filter((file) => REQ_QUERY_TOKEN_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('không file nào build URL có ?token=/&token=/&access_token=', () => {
    const offenders = files.filter((file) => QUERY_TOKEN_ASSIGN_PATTERN.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
