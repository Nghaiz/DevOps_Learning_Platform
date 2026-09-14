import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * **T4 cho lane 16.B** — `p16-copy.md` §6.2 mục 1: "T4 xanh trên glob của lane.
 * Đây là cổng, không phải lời hứa."
 *
 * Bộ dò là hàm THUẦN của `packages/copy` (`scanLatinLiteral`), không phải một
 * bản chép ở đây. Một bản chép sẽ trôi khỏi bản gốc, và khi trôi thì cổng của
 * lane nói một điều còn cổng của gói nói điều khác. Cùng khuôn với
 * `components/session/copy-gate.test.ts` (16.D) và
 * `components/admin/copy-gate.test.ts` (16.F).
 *
 * ## Cái nó bắt, và cái nó KHÔNG bắt
 *
 * Nó bắt literal chuỗi và JSX text chứa ký tự Latin CÓ DẤU. Một lane vẫn lách
 * được bằng cách viết tiếng Việt không dấu (rơi vào `scanStripped`, cổng của
 * gói copy) hoặc viết tiếng Anh, và `aria-label="Close"` đi lọt hoàn toàn.
 *
 * Chú thích được bóc trước khi quét: chú thích tiếng Việt trong mã của lane là
 * hợp lệ, và một cổng bắt cả chúng thì không lane nào dùng được.
 *
 * ## ⚠ File test bị LOẠI khỏi phạm vi quét, và đây là lý do
 *
 * Một ô test khẳng định nhãn đọc ra là "Bài học" chỉ có giá trị khi nó viết
 * THẲNG chuỗi đó. Viết `expect(...).toBe(t('shell.nav.lessons'))` là so bản đồ
 * với chính nó: ô đó xanh với mọi giá trị, kể cả chuỗi rỗng, kể cả một chuỗi
 * mất dấu. Đó chính là lý do `nav.test.ts` giữ nguyên bảy chuỗi viết thẳng sau
 * khi `nav.ts` chuyển sang gọi `t()`.
 *
 * Cái giá được nói ra: một chuỗi người dùng đọc mà chỉ xuất hiện trong file
 * test thì cổng này không thấy. Điều đó vô hại, vì một chuỗi chỉ sống trong
 * test thì không tới được người dùng.
 */

/** Gốc `apps/web/src`, suy từ vị trí file này (`src/components/shell`). */
const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Glob sở hữu của lane 16.B, khai TƯỜNG MINH theo bảng ở `phase-16.md` §3.
 *
 * Bốn thư mục route xác thực nằm rời nhau vì Next.js App Router lấy thư mục
 * làm URL. Không gộp được, và cũng không nên: `/register` không tồn tại trước
 * P16, nên một glob viết theo kiểu `app/(auth)` sẽ mô tả một cấu trúc không có
 * thật.
 */
const LANE_DIRS: readonly string[] = [
  path.join('components', 'shell'),
  path.join('app', 'login'),
  path.join('app', 'register'),
  path.join('app', 'forgot-password'),
  path.join('app', 'reset-password'),
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
  // Password reset email is part of the auth surface and runs on the server.
  path.join(SRC_ROOT, 'server', 'auth', 'password-reset-mail.ts'),
];

describe('T4 · glob của lane 16.B không còn chuỗi người dùng nằm ngoài bản đồ', () => {
  /*
    Ô "tập đầu vào không rỗng" chạy TRƯỚC ô đếm vi phạm, theo đúng khuôn T0 của
    hợp đồng §3.0. Không có nó thì một lượt đổi tên thư mục, hay một `collect`
    trả mảng rỗng vì `import.meta.dirname` trỏ sai chỗ, biến cả cổng này thành
    một no-op xanh vĩnh viễn.
  */
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob của lane rỗng, bộ quét đang nhìn sai chỗ').toBeGreaterThan(18);

    const names = FILES.map((f) => path.basename(f));
    // Vài file mốc, đủ để một lượt đổi tên thư mục làm ô này đỏ ngay. Bốn tên
    // cuối là bốn màn xác thực: nếu một thư mục route biến mất thì `collect`
    // ném ENOENT chứ không im lặng bỏ qua, và ô này nói ra thư mục nào.
    expect(names).toContain('app-shell.tsx');
    expect(names).toContain('user-menu.tsx');
    expect(names).toContain('capacity-indicator.tsx');
    expect(names).toContain('login-form.tsx');
    expect(names).toContain('register-form.tsx');
    expect(names).toContain('forgot-password-form.tsx');
    expect(names).toContain('reset-password-form.tsx');
    expect(names).toContain('password-reset-mail.ts');
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
        'Chuyển nó vào packages/copy/src/surfaces/{shell,auth}.ts rồi gọi qua t()/err(). ' +
        'ĐỪNG nới cổng này để làm suite xanh lại.',
    ).toEqual([]);
  });

  it('đối chứng dương: bộ quét ĐỎ được', () => {
    // Không có ô này thì một `scanLatinLiteral` luôn trả mảng rỗng (import
    // hỏng, regex bị nới, subpath `./scan` trỏ nhầm) cũng làm ô trên xanh, tức
    // xanh vì mù chứ không phải vì sạch.
    expect(scanLatinLiteral('<p>Xin chào</p>')).toHaveLength(1);
    expect(scanLatinLiteral("const x = 'Đang đăng xuất';")).toHaveLength(1);
  });

  it('đối chứng âm: mã đã đi qua bản đồ thì KHÔNG bị bắt', () => {
    // Chốt lại rằng cổng không đỏ với chính hình dạng mà nó yêu cầu người ta
    // viết. Một cổng đỏ cả với lời giải đúng là một cổng sẽ bị tắt.
    expect(scanLatinLiteral("<p>{t('shell.nav.lessons')}</p>")).toEqual([]);
    expect(scanLatinLiteral('// Chú thích tiếng Việt vẫn hợp lệ')).toEqual([]);
  });
});

/**
 * Chiều NGƯỢC LẠI của T4, và nó là lớp lỗi đã lọt qua cả 16.C lẫn 16.D.
 *
 * T4 hỏi "còn chuỗi nào ngoài bản đồ không". Ô dưới đây hỏi "còn khoá nào
 * trong bản đồ mà không ai gọi không". Một khoá chết không làm màn hình sai,
 * nên không cổng nào khác thấy nó; nó chỉ lớn dần cho tới lúc bản đồ mô tả một
 * giao diện không còn tồn tại.
 *
 * Lane 16.B gác HAI surface (`shell.` và `auth.`) vì nó sở hữu cả hai. Khuôn
 * lấy từ `components/admin/copy-gate.test.ts` (16.F), không dựng lại.
 *
 * Phép đếm là grep văn bản trên chính glob của lane cộng file surface, không
 * phải phân tích cú pháp. Hai hình dạng gọi được chấp nhận:
 *
 * · nguyên khoá trong một lời gọi, ví dụ `t('shell.nav.lessons')`;
 * · khoá ghép bằng template literal, và ở ca này ô chỉ khẳng định TIỀN TỐ có
 *   mặt. Đó là giới hạn thật của một phép grep, nói ra thay vì giả vờ là không
 *   có.
 */
describe('T4 chiều ngược · mọi khoá của hai surface đều có nơi gọi', () => {
  const SURFACES_DIR = path.resolve(
    SRC_ROOT,
    '..',
    '..',
    '..',
    'packages',
    'copy',
    'src',
    'surfaces',
  );

  /*
    Cắt ở `<surface>IntentionalThree` TRƯỚC khi trích khoá. Bảng miễn trừ đúng
    ba dùng cùng một hình dạng dòng (hai dấu cách, một chuỗi có tiền tố surface,
    dấu hai chấm), nên một regex chạy trên cả file đọc các TIỀN TỐ nhóm thành
    khoá chết. Đó là một ô đỏ về chính bộ đo, không phải về sản phẩm, và lane
    16.F đã mất một lượt vào nó.
  */
  function keysOf(surface: 'shell' | 'auth'): readonly string[] {
    const whole = readFileSync(path.join(SURFACES_DIR, `${surface}.ts`), 'utf8');
    const marker = `export const ${surface}IntentionalThree`;
    const cut = whole.indexOf(marker);
    const source = cut === -1 ? whole : whole.slice(0, cut);
    const pattern = new RegExp(`^ {2}'(${surface}\\.[a-z0-9.-]+)':`, 'gm');
    return [...source.matchAll(pattern)].map((m) => m[1] as string);
  }

  const keys = [...keysOf('shell'), ...keysOf('auth')];
  const callSites = FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

  it('đọc được một tập khoá THẬT từ hai file surface', () => {
    expect(keys.length, 'không trích được khoá nào, regex hoặc đường dẫn sai').toBeGreaterThan(70);
    expect(keys).toContain('shell.nav.lessons');
    expect(keys).toContain('shell.error.sign-out');
    expect(keys).toContain('auth.login.title');
    expect(keys).toContain('auth.error.network');
  });

  it('không khoá nào chết', () => {
    const dead = keys.filter((key) => {
      if (callSites.includes(`'${key}'`)) {
        return false;
      }
      // Khoá ghép qua template literal: chỉ khẳng định tiền tố có mặt.
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
