import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ⛔ Danh sách `COPY packages/…` trong `apps/web/Dockerfile` phải theo kịp
 * workspace thật.
 *
 * ## Vì sao cổng này tồn tại: BỐN lần, và lần nào cũng im lặng
 *
 * Chú thích trong chính `Dockerfile` đã kể ba lượt (`terminal` 1.F, `scenario`
 * 2.B, `games` 2026-09-09) rồi kết luận: *"danh sách này KHÔNG tự đỏ khi thiếu
 * — nó chỉ đỏ ở lần build ĐẦU TIÊN sau khi có người import package mới"*. Kết
 * luận đúng, và nó vẫn không ngăn được lượt thứ tư.
 *
 * Lượt thứ tư (`copy` + `motion`, 2026-09-14) im lặng lâu nhất: `ci.yml` bị tạm
 * dừng từ 2026-09-04 nên job `images` không chạy lần nào, kể cả khi hai PR gộp
 * vào `main` ngày 09-11. Lần build đầu tiên sau đó đỏ ngay, với:
 *
 * ```
 * @devops-platform/games:build: src/k8s/problem.ts(22,19):
 *   error TS2307: Cannot find module '@devops-platform/copy'
 * ```
 *
 * Thông điệp trỏ vào một file `.ts` của `games`, KHÔNG trỏ vào Dockerfile —
 * đúng chế độ "đi sửa nhầm chỗ" mà cảnh báo kia mô tả.
 *
 * ## Vì sao cổng ở ĐÂY chứ không phải ở lượt build image
 *
 * Lượt build image chỉ chạy khi push vào `main`. Cổng này chạy trong `pnpm test`
 * của `apps/web`, tức ở mọi PR — bắt sớm hơn một bậc, và không cần Docker.
 *
 * ## Vì sao quét THƯ MỤC chứ không đọc `package.json` của web
 *
 * Đọc `dependencies` của `apps/web` chỉ thấy gói web phụ thuộc TRỰC TIẾP. Một
 * gói vào gián tiếp (`ui` → `motion`, `games` → `copy`) vẫn phải có mặt trong
 * image để `turbo run build` dựng được nó. Quét `packages/*` phủ cả hai đường,
 * và nó không thể "quên" theo cách một danh sách viết tay quên được.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const PACKAGES_DIR = join(REPO_ROOT, 'packages');
const DOCKERFILE = join(REPO_ROOT, 'apps', 'web', 'Dockerfile');

/** Tên gói trong `packages/` — nguồn sự thật là ĐĨA, không phải một mảng viết tay. */
function workspacePackages(): readonly string[] {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Hai danh sách TÁCH RỜI trong Dockerfile, và thiếu cái nào cũng hỏng theo kiểu
 * khác nhau:
 *
 * - `COPY packages/<p>/package.json …` chạy TRƯỚC `pnpm install`. Thiếu nó thì
 *   pnpm không biết gói tồn tại, nên không dựng symlink workspace.
 * - `COPY packages/<p> …` chạy sau. Thiếu nó thì có manifest mà không có mã.
 */
function copiedIn(dockerfile: string, kind: 'manifest' | 'source'): readonly string[] {
  const pattern =
    kind === 'manifest'
      ? /^COPY packages\/([a-z0-9-]+)\/package\.json /gm
      : /^COPY packages\/([a-z0-9-]+) packages\/\1$/gm;
  return [...dockerfile.matchAll(pattern)].map((m) => m[1] ?? '').sort();
}

describe('apps/web/Dockerfile — danh sách COPY theo kịp workspace', () => {
  const dockerfile = readFileSync(DOCKERFILE, 'utf8');
  const packages = workspacePackages();

  /**
   * ⚠ Phép kiểm ĐẦU VÀO. Nếu `packages/` đọc ra rỗng, hoặc regex không khớp
   * dòng nào, thì hai ô dưới so hai tập rỗng và XANH vĩnh viễn.
   */
  it('đọc được cả hai đầu vào (chống cổng chạy trên tập rỗng)', () => {
    expect(packages.length, 'không đọc được packages/').toBeGreaterThan(0);
    expect(
      copiedIn(dockerfile, 'manifest').length,
      'không khớp dòng `COPY packages/<p>/package.json` nào — regex đã lạc hậu?',
    ).toBeGreaterThan(0);
    expect(copiedIn(dockerfile, 'source').length).toBeGreaterThan(0);
  });

  for (const kind of ['manifest', 'source'] as const) {
    it(`mọi gói trong packages/ đều có dòng COPY (${kind})`, () => {
      const copied = new Set(copiedIn(dockerfile, kind));
      const missing = packages.filter((p) => !copied.has(p));
      expect(
        missing,
        `Thiếu trong apps/web/Dockerfile: ${missing.join(', ')}. ` +
          'Image web dựng bằng `turbo run build` trên workspace ĐÃ COPY, nên gói ' +
          'thiếu sẽ làm build đỏ với `Cannot find module @devops-platform/<tên>` ' +
          'trỏ vào file import chứ không trỏ vào Dockerfile. Thêm CẢ HAI dòng: ' +
          '`COPY packages/<tên>/package.json …` và `COPY packages/<tên> packages/<tên>`.',
      ).toEqual([]);
    });
  }

  /**
   * ⛔ Nửa chống-ôi. Một dòng COPY trỏ vào gói KHÔNG còn tồn tại làm `docker
   * build` đỏ ngay ở bước COPY — ồn ào, nhưng ồn ào ở tầng đắt nhất (lượt build
   * image trên CI). Bắt ở đây rẻ hơn nhiều.
   */
  it('không dòng COPY nào trỏ vào gói đã biến mất', () => {
    const known = new Set(packages);
    const stale = [...new Set([...copiedIn(dockerfile, 'manifest'), ...copiedIn(dockerfile, 'source')])]
      .filter((p) => !known.has(p))
      .sort();
    expect(stale, 'xoá các dòng COPY này, gói không còn trong packages/').toEqual([]);
  });

  /**
   * ⛔ ĐỐI CHỨNG DƯƠNG, và nó phải ĐỘC LẬP với trạng thái thật của repo.
   *
   * Bản đầu của ô này lấy `copiedIn(dockerfile, …)` của Dockerfile THẬT rồi thêm
   * một tên bịa. Phá thử cho thấy vì sao thế là sai: gỡ dòng COPY của
   * `packages/copy` ra thì ô này đỏ THEO, vì tập thật thiếu thêm một phần tử.
   * Một đối chứng đỏ cùng lúc với ô nó đang bảo chứng thì không bảo chứng được
   * gì — đúng lỗi Q5 mà đợt này đã bắt một lần ở cổng khác.
   *
   * Nay nó chạy `copiedIn` trên một Dockerfile DỰNG SẴN, nên kết quả không phụ
   * thuộc repo. Vẫn là CÙNG một hàm mà hai ô trên gọi: phá `copiedIn` thì cả ba
   * cùng đỏ, đó mới là điều đối chứng này khẳng định.
   */
  it('đối chứng dương — CHÍNH phép dò đọc đúng một Dockerfile dựng sẵn', () => {
    const fake = [
      'FROM node:24-alpine',
      'COPY packages/co-mat/package.json packages/co-mat/package.json',
      'COPY packages/chi-co-manifest/package.json packages/chi-co-manifest/package.json',
      'COPY packages/co-mat packages/co-mat',
      'COPY packages/chi-co-ma packages/chi-co-ma',
      'RUN pnpm install',
    ].join('\n');

    expect(copiedIn(fake, 'manifest')).toEqual(['chi-co-manifest', 'co-mat']);
    expect(copiedIn(fake, 'source')).toEqual(['chi-co-ma', 'co-mat']);

    // Và vế quan trọng: một gói CÓ trong workspace mà vắng ở một trong hai danh
    // sách thì bị phát hiện — đúng hình dạng của cả bốn lượt đã xảy ra.
    const giaDinh = ['co-mat', 'chi-co-manifest', 'chi-co-ma'];
    const thieuSource = giaDinh.filter((p) => !new Set(copiedIn(fake, 'source')).has(p));
    expect(thieuSource).toEqual(['chi-co-manifest']);
  });
});
