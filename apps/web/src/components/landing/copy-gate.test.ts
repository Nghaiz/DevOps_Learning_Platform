import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * Cổng chữ của lane landing 3D, thay cho `components/marketing/copy-gate.test.ts` đã xoá cùng
 * thư mục marketing. Cùng khuôn và cùng bộ dò: `scanLatinLiteral` là hàm THUẦN của
 * `packages/copy`, không chép lại ở đây, để cổng của lane và cổng của gói không trôi khỏi nhau.
 *
 * Bắt literal chuỗi và JSX text chứa ký tự Latin CÓ DẤU, tức mọi câu tiếng Việt viết thẳng vào
 * mã thay vì đi qua `t()`. KHÔNG bắt tiếng Việt không dấu hay tiếng Anh; phần đó là review.
 * Chú thích được bóc trước khi quét, nên chú thích tiếng Việt vẫn hợp lệ.
 *
 * Phạm vi: mọi `.ts`/`.tsx` không phải test dưới `components/landing/**`, cộng hai file lẻ của
 * `app/` mang chữ trang chủ (khai TƯỜNG MINH, vì `app/` chứa nhiều lane khác).
 *
 * `jsx-text` chỉ áp cho `.tsx`: trong `.ts` thuần, mẫu `>…<` của bộ dò khớp mũi tên hàm và dấu
 * mở generic, nên báo động giả. Một file `.ts` không biên dịch nổi JSX, nên lọc theo đuôi không
 * bỏ sót JSX text thật nào. Vi phạm `string-literal` thì KHÔNG lọc.
 */

/** Gốc `apps/web/src`, suy từ vị trí file này (`src/components/landing`). */
const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

const LANE_DIRS: readonly string[] = [path.join('components', 'landing')];

const LANE_FILES: readonly string[] = [path.join('app', 'page.tsx'), path.join('app', 'opengraph-image.tsx')];

/** Đo 2026-10-03: 60 file. Sàn đặt thấp hơn để lane khác thêm/bớt vài file không làm đỏ oan. */
const FILE_FLOOR = 40;

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FILES: readonly string[] = [
  ...LANE_DIRS.flatMap((dir) => collect(path.join(SRC_ROOT, dir))),
  ...LANE_FILES.map((file) => path.join(SRC_ROOT, file)),
];

describe('copy gate · landing 3D không còn chuỗi người dùng nằm ngoài packages/copy', () => {
  /* Chạy TRƯỚC ô đếm vi phạm: một glob rỗng biến cả cổng thành một ô xanh vĩnh viễn. */
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob của lane quá nhỏ, bộ quét đang nhìn sai chỗ').toBeGreaterThanOrEqual(FILE_FLOOR);

    const names = FILES.map((file) => path.basename(file));
    expect(names).toContain('landing.tsx');
    expect(names).toContain('hero.tsx');
    expect(names).toContain('journey.tsx');
    expect(names).toContain('terminal.tsx');
    expect(names).toContain('stage.tsx');
    expect(names).toContain('content.ts');
    expect(names).toContain('page.tsx');
    expect(names).toContain('opengraph-image.tsx');
    expect(names.some((name) => /\.test\.tsx?$/.test(name))).toBe(false);
  });

  it('không file nguồn nào còn literal hay JSX text tiếng Việt có dấu', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const isTsx = file.endsWith('.tsx');
      for (const violation of scanLatinLiteral(readFileSync(file, 'utf8'))) {
        if (violation.kind === 'jsx-text' && !isTsx) continue;
        offenders.push(`${path.relative(SRC_ROOT, file)}:${String(violation.line)} [${violation.kind}] ${violation.text}`);
      }
    }

    expect(
      offenders,
      'Mỗi dòng trên là một chuỗi người dùng đọc còn nằm trong mã landing. ' +
        'Chuyển nó vào packages/copy/src/surfaces/home.ts rồi gọi qua t(). ' +
        'ĐỪNG nới cổng này để làm suite xanh lại.',
    ).toEqual([]);
  });

  it('đối chứng dương: bộ quét ĐỎ được với literal và JSX text có dấu', () => {
    expect(scanLatinLiteral("const label = 'Ga Đường sắt';")).toHaveLength(1);
    const jsx = scanLatinLiteral('<p>Xin chào</p>');
    expect(jsx).toHaveLength(1);
    expect(jsx[0]?.kind).toBe('jsx-text');
  });

  it('đối chứng âm: chữ đi qua t() và chú thích tiếng Việt KHÔNG bị kêu', () => {
    expect(scanLatinLiteral("<p>{t('home.hero.title')}</p>")).toEqual([]);
    expect(scanLatinLiteral('// Chú thích tiếng Việt vẫn hợp lệ\nconst x = 1;')).toEqual([]);
  });
});
