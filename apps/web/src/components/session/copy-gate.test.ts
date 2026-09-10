import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * **T4 cho lane 16.D** — `p16-copy.md` §6.2 mục 1: "T4 xanh trên glob của lane.
 * Đây là cổng, không phải lời hứa."
 *
 * Bộ dò là hàm THUẦN của `packages/copy` (`scanLatinLiteral`), không phải một
 * bản chép ở đây. Một bản chép sẽ trôi khỏi bản gốc, và khi trôi thì cổng của
 * lane nói một điều còn cổng của gói nói điều khác.
 *
 * ## Cái nó bắt, và cái nó KHÔNG bắt (nói ra thay vì để người sau tưởng)
 *
 * Nó bắt literal chuỗi và JSX text chứa ký tự Latin CÓ DẤU. Một lane vẫn lách
 * được bằng cách viết tiếng Việt không dấu (rơi vào `scanStripped`, cổng của
 * gói copy) hoặc viết tiếng Anh, và `aria-label="Close"` đi lọt hoàn toàn. Cổng
 * này bắt đường lười phổ biến, không bắt đường cố ý. Phần còn lại là review.
 *
 * Chú thích được bóc trước khi quét, bằng máy trạng thái chạy theo ký tự: chú
 * thích tiếng Việt trong mã của lane là hợp lệ, và một cổng bắt cả chúng thì
 * không lane nào dùng được.
 *
 * ## ⚠ File test bị LOẠI khỏi phạm vi quét, và đây là lý do
 *
 * `p16-copy.md` §3.4 nói "miễn trừ: chính `surfaces/**`, không miễn trừ gì
 * khác" — nhưng câu đó nói về cổng quét chính `packages/copy`. Ở glob của một
 * lane, file test là một QUẦN THỂ khác, và loại chúng ra không phải là nới cổng:
 *
 * Một ô test khẳng định nhãn đọc ra là "Không chấm được" chỉ có giá trị khi nó
 * viết THẲNG chuỗi đó. Viết `expect(...).toBe(t('session.task.state.infra'))`
 * là so bản đồ với chính nó: ô đó xanh với mọi giá trị, kể cả chuỗi rỗng, kể cả
 * một chuỗi mất dấu. Ép test đi qua `t()` vì vậy KHÔNG làm sản phẩm đúng hơn,
 * nó chỉ biến mọi ô kiểm câu chữ thành một phép lặp thừa.
 *
 * Cái giá phải trả được nói ra: một chuỗi người dùng đọc mà chỉ xuất hiện trong
 * file test thì cổng này không thấy. Điều đó vô hại, vì một chuỗi chỉ sống
 * trong test thì không tới được người dùng.
 */

/** Gốc `apps/web/src`, suy từ vị trí file này (`src/components/session`). */
const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Glob sở hữu của lane 16.D, khai TƯỜNG MINH.
 *
 * Không suy ra từ một mẫu đường dẫn: bảng sở hữu ở `phase-16.md` §3 là một
 * quyết định của người, và `app/playgrounds/[id]` chỉ vào lane này vì nó dùng
 * `use-playground-session.ts` chứ không vì tên thư mục nó giống ai.
 */
const LANE_DIRS: readonly string[] = [
  path.join('components', 'session'),
  path.join('app', 'labs', '[id]'),
  path.join('app', 'lessons', '[id]'),
  path.join('app', 'playgrounds', '[id]'),
  path.join('app', 'session'),
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

const FILES: readonly string[] = LANE_DIRS.flatMap((dir) => collect(path.join(SRC_ROOT, dir)));

describe('T4 · glob của lane 16.D không còn chuỗi người dùng nằm ngoài bản đồ', () => {
  /*
    ⚠ Ô "tập đầu vào không rỗng" chạy TRƯỚC ô đếm vi phạm, theo đúng khuôn T0
    của hợp đồng §3.0.

    Không có nó thì một lượt đổi tên thư mục, hay một `collect` trả mảng rỗng vì
    `import.meta.dirname` trỏ sai chỗ, biến cả cổng này thành một no-op xanh
    vĩnh viễn. Repo đã trả giá đúng hình dạng đó hai lần rồi: `--shard` chia
    theo file khiến 2/3 phần chạy 0 ô mà vẫn thoát 0, và `go test` thoát 0 khi
    mọi test đều skip.
  */
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob của lane rỗng — bộ quét đang nhìn sai chỗ').toBeGreaterThan(25);

    const names = FILES.map((f) => path.basename(f));
    // Vài file mốc, đủ để một lượt đổi tên thư mục làm ô này đỏ ngay.
    expect(names).toContain('workspace-panel.tsx');
    expect(names).toContain('lab-client.tsx');
    expect(names).toContain('lesson-client.tsx');
    expect(names).toContain('playground-client.tsx');
    expect(names).toContain('terminal-window-client.tsx');
  });

  it('không file nguồn nào còn literal tiếng Việt', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const violation of scanLatinLiteral(readFileSync(file, 'utf8'))) {
        offenders.push(
          `${path.relative(SRC_ROOT, file)}:${String(violation.line)} [${violation.kind}] ${violation.text}`,
        );
      }
    }

    expect(
      offenders,
      'Mỗi dòng trên là một chuỗi người dùng đọc còn nằm trong TSX. ' +
        'Chuyển nó vào packages/copy/src/surfaces/session.ts rồi gọi qua t()/err(). ' +
        'ĐỪNG nới cổng này để làm suite xanh lại.',
    ).toEqual([]);
  });

  it('đối chứng dương: bộ quét ĐỎ được', () => {
    // Không có ô này thì một `scanLatinLiteral` luôn trả mảng rỗng (import
    // hỏng, regex bị nới, subpath `./scan` trỏ nhầm) cũng làm ô trên xanh —
    // xanh vì mù, không phải vì sạch.
    expect(scanLatinLiteral('<p>Xin chào</p>')).toHaveLength(1);
    expect(scanLatinLiteral("const x = 'Đang tải…';")).toHaveLength(1);
  });

  it('đối chứng âm: mã đã đi qua bản đồ thì KHÔNG bị bắt', () => {
    // Chốt lại rằng cổng không đỏ với chính hình dạng mà nó yêu cầu người ta
    // viết. Một cổng đỏ cả với lời giải đúng là một cổng sẽ bị tắt.
    expect(scanLatinLiteral("<p>{t('session.lesson.loading')}</p>")).toEqual([]);
    expect(scanLatinLiteral('// Chú thích tiếng Việt vẫn hợp lệ')).toEqual([]);
  });
});
