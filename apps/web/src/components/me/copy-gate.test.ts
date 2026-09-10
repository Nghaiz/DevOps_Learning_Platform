import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * **T4 cho lane 16.H** — `p16-copy.md` §6.2 mục 1: "T4 xanh trên glob của lane.
 * Đây là cổng, không phải lời hứa."
 *
 * Bộ dò là hàm THUẦN của `packages/copy` (`scanLatinLiteral`), không phải một
 * bản chép ở đây. Một bản chép sẽ trôi khỏi bản gốc, và khi trôi thì cổng của
 * lane nói một điều còn cổng của gói nói điều khác. Cùng khuôn với
 * `components/admin/copy-gate.test.ts` (16.F) và
 * `components/marketing/copy-gate.test.ts` (16.E).
 *
 * ## Cái nó bắt, và cái nó KHÔNG bắt
 *
 * Nó bắt literal chuỗi và JSX text chứa ký tự Latin CÓ DẤU. Một lane vẫn lách
 * được bằng cách viết tiếng Việt không dấu (rơi vào `scanStripped`, cổng của
 * gói copy) hoặc viết tiếng Anh, và `aria-label="Close"` đi lọt hoàn toàn.
 *
 * Ba nhãn shell của lane này (`bash`, `zsh`, `PowerShell (pwsh)`) là ví dụ sống
 * của giới hạn đó: chúng KHÔNG có dấu nên cổng này mù với chúng dù chúng là chữ
 * người dùng đọc. Chúng vẫn được đưa vào bản đồ, và lý do ghi ở
 * `preference-notices.ts`: luật là §1.7, không phải "thứ cổng bắt được".
 *
 * ⚠ Và một lớp nữa mà T4 xuôi KHÔNG thấy: một khoá thêm vào bản đồ mà KHÔNG có
 * nơi gọi. Cổng chỉ gác một chiều, nên khoá chết đi qua nó. `describe` thứ hai
 * dưới đây gác chiều còn lại cho riêng surface `me.`.
 *
 * ## ⚠ File test bị LOẠI khỏi phạm vi quét, và đây là lý do
 *
 * Một ô test khẳng định nhãn đọc ra là "Đang chạy" chỉ có giá trị khi nó viết
 * THẲNG chuỗi đó. Viết `expect(...).toBe(t('me.session-status.running'))` là so
 * bản đồ với chính nó: ô đó xanh với mọi giá trị, kể cả chuỗi rỗng. Cái giá
 * được nói ra: một chuỗi người dùng đọc mà chỉ xuất hiện trong file test thì
 * cổng này không thấy. Điều đó vô hại, vì một chuỗi chỉ sống trong test thì
 * không tới được người dùng.
 */

/** Gốc `apps/web/src`, suy từ vị trí file này (`src/components/me`). */
const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Glob sở hữu của lane 16.H, khai TƯỜNG MINH theo bảng ở `phase-16.md` §3.
 *
 * `app/me/layout.tsx` và `app/settings/layout.tsx` NẰM TRONG phạm vi quét dù
 * lane không được sửa chúng: cổng đo CHUỖI, không đo quyền sửa. Một chuỗi người
 * dùng đọc lọt vào hai file đó vẫn phải đỏ, và cách xử lý đúng lúc ấy là báo
 * lead chứ không phải nới danh sách này.
 */
const LANE_DIRS: readonly string[] = [
  path.join('components', 'me'),
  path.join('app', 'me'),
  path.join('app', 'settings'),
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

describe('T4 · glob của lane 16.H không còn chuỗi người dùng nằm ngoài bản đồ', () => {
  /*
    Ô "tập đầu vào không rỗng" chạy TRƯỚC ô đếm vi phạm, theo đúng khuôn T0 của
    hợp đồng §3.0. Không có nó thì một lượt đổi tên thư mục, hay một `collect`
    trả mảng rỗng vì `import.meta.dirname` trỏ sai chỗ, biến cả cổng này thành
    một no-op xanh vĩnh viễn.
  */
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob của lane rỗng, bộ quét đang nhìn sai chỗ').toBeGreaterThan(14);

    const names = FILES.map((f) => path.basename(f));
    // Vài file mốc, đủ để một lượt đổi tên thư mục làm ô này đỏ ngay.
    expect(names).toContain('me-client.tsx');
    expect(names).toContain('settings-client.tsx');
    expect(names).toContain('active-sessions.tsx');
    expect(names).toContain('history-tabs.tsx');
    expect(names).toContain('preferences-form.tsx');
    expect(names).toContain('password-form.tsx');
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
      'Mỗi dòng trên là một chuỗi người dùng đọc còn nằm trong mã của lane. ' +
        'Chuyển nó vào packages/copy/src/surfaces/me.ts rồi gọi qua t()/err(). ' +
        'ĐỪNG nới cổng này để làm suite xanh lại.',
    ).toEqual([]);
  });

  /*
    ── `jsx-text` chỉ áp cho `.tsx`, và đây là ĐO chứ không phải nới ──────────

    `scanLatinLiteral` dò JSX text bằng mẫu `>([^<>]*)<`. Trong một file `.ts`
    thuần, mẫu đó khớp đoạn nằm giữa dấu `>` của một mũi tên hàm và dấu `<` mở
    generic — hình dạng có ở mọi chú thích dài đi kèm một hàm. Glob của lane này
    có CHÍN file `.ts` thuần, nên báo động giả là chắc chắn chứ không phải rủi ro.

    Bỏ qua `jsx-text` trên `.ts` là an toàn vì `tsc` không biên dịch nổi JSX
    trong `.ts`, nên không có `jsx-text` THẬT nào để bỏ sót. Vi phạm dạng
    `string-literal` vẫn được đếm đủ trên cả hai đuôi file, và ô đối chứng dưới
    đây chốt lại rằng phép lọc không làm bộ dò mù trên `.tsx`.

    16.E đã đo và giải đúng hình dạng này; đây là bản áp lại, không phải một
    lượt dựng lại.
  */
  it('đối chứng dương cho phép lọc: bộ dò VẪN báo jsx-text trên .tsx', () => {
    const found = scanLatinLiteral('<p>Xin chào</p>');
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('jsx-text');
  });

  it('đối chứng dương: bộ quét ĐỎ được', () => {
    // Không có ô này thì một `scanLatinLiteral` luôn trả mảng rỗng (import
    // hỏng, regex bị nới, subpath `./scan` trỏ nhầm) cũng làm ô trên xanh, tức
    // xanh vì mù chứ không phải vì sạch.
    expect(scanLatinLiteral('<p>Xin chào</p>')).toHaveLength(1);
    expect(scanLatinLiteral("const x = 'Đang tải hồ sơ';")).toHaveLength(1);
  });

  it('đối chứng âm: mã đã đi qua bản đồ thì KHÔNG bị bắt', () => {
    // Chốt lại rằng cổng không đỏ với chính hình dạng mà nó yêu cầu người ta
    // viết. Một cổng đỏ cả với lời giải đúng là một cổng sẽ bị tắt.
    expect(scanLatinLiteral("<p>{t('me.page.me-title')}</p>")).toEqual([]);
    expect(scanLatinLiteral('// Chú thích tiếng Việt vẫn hợp lệ')).toEqual([]);
  });
});

/**
 * Chiều NGƯỢC LẠI của T4, theo khuôn 16.F.
 *
 * T4 hỏi "còn chuỗi nào ngoài bản đồ không". Ô dưới đây hỏi "còn khoá nào trong
 * bản đồ mà không ai gọi không". Một khoá chết không làm màn hình sai, nên
 * không cổng nào khác thấy nó; nó chỉ lớn dần cho tới lúc bản đồ mô tả một giao
 * diện không còn tồn tại. Chính lớp lỗi đó đã đẻ ra `session.tier.*` (0 nơi
 * gọi) song song với `catalog.tier.*` ở đợt 16.C/16.D.
 *
 * Phép đếm là grep văn bản trên chính glob của lane cộng file surface, không
 * phải phân tích cú pháp. Hai hình dạng gọi được chấp nhận:
 *
 * · nguyên khoá trong một lời gọi, ví dụ `t('me.page.me-title')`;
 * · khoá ghép bằng template literal, ví dụ `` t(`me.role.${role}`) ``, và ở ca
 *   này ô chỉ khẳng định TIỀN TỐ có mặt. Đó là giới hạn thật của một phép grep,
 *   nói ra thay vì giả vờ là không có.
 */
describe('T4 chiều ngược · mọi khoá của surface me đều có nơi gọi', () => {
  const SURFACE = path.resolve(
    SRC_ROOT,
    '..',
    '..',
    '..',
    'packages',
    'copy',
    'src',
    'surfaces',
    'me.ts',
  );

  /*
    Cắt ở `meIntentionalThree` TRƯỚC khi trích khoá. Bảng miễn trừ đúng ba dùng
    CÙNG một hình dạng dòng với bản đồ (hai dấu cách, một chuỗi `me.*`, dấu hai
    chấm), nên một regex chạy trên cả file đọc bảy TIỀN TỐ nhóm thành bảy khoá
    chết. Đó là một ô đỏ về chính bộ đo, không phải về sản phẩm; 16.F đã trả giá
    cho đúng hình dạng này.
  */
  const whole = readFileSync(SURFACE, 'utf8');
  const cut = whole.indexOf('export const meIntentionalThree');
  const source = cut === -1 ? whole : whole.slice(0, cut);
  const keys = [...source.matchAll(/^ {2}'(me\.[a-z0-9.-]+)':/gm)].map((m) => m[1] as string);
  const callSites = FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

  it('đọc được một tập khoá THẬT từ file surface', () => {
    expect(keys.length, 'không trích được khoá nào, regex hoặc đường dẫn sai').toBeGreaterThan(120);
    expect(keys).toContain('me.page.me-title');
    expect(keys).toContain('me.error.sessions-load');
    // Bảng miễn trừ phải nằm NGOÀI tập khoá. Không có ô này thì phép cắt ở trên
    // có thể hỏng mà không ai biết cho tới khi bảy tiền tố nhóm bị báo là chết.
    expect(keys).not.toContain('me.history.tab');
    expect(keys).not.toContain('me.role');
  });

  it('không khoá nào chết', () => {
    const dead = keys.filter((key) => {
      if (callSites.includes(`'${key}'`)) {
        return false;
      }
      // Khoá ghép: `me.role.user` được gọi qua `` t(`me.role.${role}`) ``.
      const prefix = key.slice(0, key.lastIndexOf('.'));
      return !callSites.includes(`${prefix}.$`);
    });

    expect(
      dead,
      'Mỗi khoá trên nằm trong bản đồ mà không nơi nào gọi. Xoá nó, hoặc nối nó ' +
        'vào chỗ đáng ra phải dùng. Cổng T4 xuôi KHÔNG bắt được lớp lỗi này.',
    ).toEqual([]);
  });
});
