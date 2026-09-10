import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * **T4 cho lane 16.E** — `p16-copy.md` §6.2 mục 1: "T4 xanh trên glob của lane.
 * Đây là cổng, không phải lời hứa."
 *
 * Cùng khuôn với `components/session/copy-gate.test.ts` của lane 16.D, và cố ý
 * cùng khuôn: bộ dò là hàm THUẦN của `packages/copy` (`scanLatinLiteral`),
 * không phải một bản chép ở đây. Một bản chép sẽ trôi khỏi bản gốc, và khi trôi
 * thì cổng của lane nói một điều còn cổng của gói nói điều khác.
 *
 * ## Cái nó bắt, và cái nó KHÔNG bắt
 *
 * Bắt literal chuỗi và JSX text chứa ký tự Latin CÓ DẤU. Một lane vẫn lách được
 * bằng cách viết tiếng Việt không dấu (rơi vào `scanStripped`, cổng của gói
 * copy) hoặc viết tiếng Anh, và `aria-label="Close"` đi lọt hoàn toàn. Cổng này
 * bắt đường lười phổ biến, không bắt đường cố ý. Phần còn lại là review.
 *
 * File test bị loại khỏi phạm vi quét, cùng lý do đã ghi ở lane 16.D: một ô
 * khẳng định nhãn đọc ra là một câu cụ thể chỉ có giá trị khi nó viết THẲNG câu
 * đó. Ép test đi qua `t()` biến ô đó thành phép so bản đồ với chính nó, xanh
 * với mọi giá trị kể cả chuỗi rỗng.
 *
 * ## Glob của lane 16.E gồm cả ba file lẻ trong `app/`
 *
 * Bảng sở hữu ở `phase-16.md` §3 giao cho lane này `components/marketing/**`,
 * `app/page.tsx` và `app/home-cta.tsx`; `app/opengraph-image.tsx` đi kèm vì chữ
 * trên ảnh xem trước là chữ của chính trang chủ. Ba file lẻ đó khai TƯỜNG MINH
 * chứ không suy từ một mẫu đường dẫn, vì `app/` chứa mười lane khác.
 */

/** Gốc `apps/web/src`, suy từ vị trí file này (`src/components/marketing`). */
const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

const LANE_DIRS: readonly string[] = [path.join('components', 'marketing')];

const LANE_FILES: readonly string[] = [
  path.join('app', 'page.tsx'),
  path.join('app', 'home-cta.tsx'),
  path.join('app', 'opengraph-image.tsx'),
];

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

describe('T4 · glob của lane 16.E không còn chuỗi người dùng nằm ngoài bản đồ', () => {
  /*
    ⚠ Ô "tập đầu vào không rỗng" chạy TRƯỚC ô đếm vi phạm, theo khuôn T0 của
    hợp đồng §3.0.

    Không có nó thì một lượt đổi tên thư mục, hay một `collect` trả mảng rỗng vì
    `import.meta.dirname` trỏ sai chỗ, biến cả cổng này thành một no-op xanh
    vĩnh viễn. Repo đã trả giá đúng hình dạng đó hai lần: `--shard` chia theo
    file khiến 2/3 phần chạy 0 ô mà vẫn thoát 0, và `go test` thoát 0 khi mọi
    test đều skip.
  */
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob của lane rỗng, bộ quét đang nhìn sai chỗ').toBeGreaterThan(9);

    const names = FILES.map((f) => path.basename(f));
    // Vài file mốc, đủ để một lượt đổi tên thư mục làm ô này đỏ ngay.
    expect(names).toContain('hero.tsx');
    expect(names).toContain('loop-story-client.tsx');
    expect(names).toContain('loop-scene.tsx');
    expect(names).toContain('catalog-stats.tsx');
    expect(names).toContain('page.tsx');
    expect(names).toContain('opengraph-image.tsx');
  });

  it('không file nguồn nào còn literal tiếng Việt', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const jsx = file.endsWith('.tsx');
      for (const violation of scanLatinLiteral(readFileSync(file, 'utf8'))) {
        // Xem khối "jsx-text chỉ áp cho .tsx" ngay dưới describe này.
        if (violation.kind === 'jsx-text' && !jsx) {
          continue;
        }
        offenders.push(
          `${path.relative(SRC_ROOT, file)}:${String(violation.line)} [${violation.kind}] ${violation.text}`,
        );
      }
    }

    expect(
      offenders,
      'Mỗi dòng trên là một chuỗi người dùng đọc còn nằm trong TSX. ' +
        'Chuyển nó vào packages/copy/src/surfaces/home.ts rồi gọi qua t(). ' +
        'ĐỪNG nới cổng này để làm suite xanh lại.',
    ).toEqual([]);
  });

  /*
    ── `jsx-text` chỉ áp cho `.tsx`, và đây là ĐO chứ không phải nới ──────────

    `scanLatinLiteral` dò JSX text bằng mẫu `>([^<>]*)<`. Trong một file `.ts`
    thuần không có JSX nào, mẫu đó vẫn khớp mọi đoạn nằm giữa một dấu `>` và dấu
    `<` kế tiếp, và trong TypeScript hai ký tự đó là mũi tên hàm với dấu mở
    generic. `catalog-stats.server.ts` vì vậy bị báo MỘT vi phạm `jsx-text` dài
    18 dòng, chở cả thân hai hàm cùng lúc, và trong 18 dòng đó không có một ký
    tự JSX nào.

    Bộ dò tự khai giới hạn này ("máy trạng thái vẫn sai trên literal regex chứa
    hai dấu chéo"); đây là một họ hàng của nó ở tầng cú pháp chứ không phải chú
    thích. Lọc theo ĐUÔI FILE là phép thu hẹp chính xác: một file `.ts` không
    biên dịch nổi JSX, nên không có `jsx-text` thật nào để bỏ sót. Vi phạm dạng
    `string-literal` KHÔNG bị lọc, và đó mới là dạng bắt được chuỗi thật.

    Cái giá phải nói ra: một chuỗi người dùng đọc viết dưới dạng JSX trong một
    file đặt sai đuôi sẽ đi lọt. Đổi lại, không lọc thì cổng này báo động giả
    100% trên mọi file `.ts` của lane, và một cổng như thế bị tắt trong hai tuần.
  */
  it('đối chứng dương cho phép lọc: bộ dò VẪN báo jsx-text trên .tsx', () => {
    const found = scanLatinLiteral('<p>Xin chào</p>');
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('jsx-text');
  });

  it('đối chứng dương: bộ quét ĐỎ được', () => {
    // Không có ô này thì một `scanLatinLiteral` luôn trả mảng rỗng (import hỏng,
    // đổi chữ ký, regex bị vô hiệu) sẽ làm ô trên xanh vĩnh viễn.
    expect(scanLatinLiteral('<p>Xin chào</p>')).toHaveLength(1);
    expect(scanLatinLiteral("const x = 'Đang tải nội dung';")).toHaveLength(1);
  });

  it('đối chứng âm: chuỗi đã đi qua bản đồ KHÔNG bị kêu', () => {
    expect(scanLatinLiteral("<p>{t('home.hero.title')}</p>")).toEqual([]);
    expect(scanLatinLiteral('// Chú thích tiếng Việt vẫn hợp lệ')).toEqual([]);
  });
});
