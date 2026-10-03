import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAMES, MODES } from './content';

/**
 * Mọi thẻ bấm được của landing phải trỏ tới một route CÓ THẬT trong `app/`. Một phiên FE khác
 * đang chạy song song và có thể đổi tên route; khi đó link trên trang chủ thành 404 mà không
 * cổng kiểu nào thấy (href là chuỗi).
 *
 * Route group `(tên)` không góp đoạn nào vào URL, nên bộ dò đi xuyên qua chúng: chuyển
 * `app/labs/` vào `app/(learn)/labs/` không đổi URL và không được làm ô này đỏ. Đoạn động
 * (`[id]`) thì KHÔNG được coi là khớp một href tĩnh: `/games/k8s` phải có trang riêng.
 */

/** Gốc `apps/web/src/app`, suy từ vị trí file này (`src/components/landing`). */
const APP_ROOT = path.resolve(import.meta.dirname, '..', '..', 'app');

const isDirectory = (target: string): boolean => existsSync(target) && statSync(target).isDirectory();

function routeFile(dir: string, segments: readonly string[]): string | null {
  const [head, ...rest] = segments;
  if (head === undefined) {
    const page = path.join(dir, 'page.tsx');
    if (existsSync(page)) return page;
  } else {
    const direct = path.join(dir, head);
    if (isDirectory(direct)) {
      const found = routeFile(direct, rest);
      if (found !== null) return found;
    }
  }
  for (const entry of readdirSync(dir)) {
    const group = path.join(dir, entry);
    if (/^\(.+\)$/.test(entry) && isDirectory(group)) {
      const found = routeFile(group, segments);
      if (found !== null) return found;
    }
  }
  return null;
}

const resolveHref = (href: string): string | null => routeFile(APP_ROOT, href.split('/').filter((part) => part !== ''));

const LINKED_HREFS: readonly string[] = [
  ...MODES.map((mode) => mode.href),
  ...GAMES.flatMap((game) => (game.href === null ? [] : [game.href])),
];

describe('content · mọi href của landing trỏ tới route có thật', () => {
  it('tập href không rỗng: bốn chế độ học và ít nhất một game đã mở', () => {
    expect(isDirectory(APP_ROOT), `không thấy ${APP_ROOT}`).toBe(true);
    expect(MODES).toHaveLength(4);
    expect(GAMES.some((game) => game.href !== null)).toBe(true);
    expect(LINKED_HREFS.length).toBeGreaterThanOrEqual(5);
  });

  it('href là đường dẫn tuyệt đối sạch (không query, hash, dấu / cuối)', () => {
    for (const href of LINKED_HREFS) {
      expect(href, href).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/);
    }
  });

  it.each(LINKED_HREFS)('%s có app/<route>/page.tsx', (href) => {
    expect(resolveHref(href), `${href} không có page.tsx dưới apps/web/src/app`).not.toBeNull();
  });

  it('đối chứng âm: bộ dò ĐỎ được với route không tồn tại', () => {
    expect(resolveHref('/khong-co-route-nay')).toBeNull();
    expect(resolveHref('/games/khong-co-game-nay')).toBeNull();
  });

  it('đối chứng dương: bộ dò thấy đúng file của trang chủ', () => {
    expect(resolveHref('/')).toBe(path.join(APP_ROOT, 'page.tsx'));
  });
});
