import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanLatinLiteral } from '@devops-platform/copy/scan';

/**
 * **T4 cho lane 16.F** — `p16-copy.md` §6.2 mục 1: "T4 xanh trên glob của lane.
 * Đây là cổng, không phải lời hứa."
 *
 * Bộ dò là hàm THUẦN của `packages/copy` (`scanLatinLiteral`), không phải một
 * bản chép ở đây. Một bản chép sẽ trôi khỏi bản gốc, và khi trôi thì cổng của
 * lane nói một điều còn cổng của gói nói điều khác. Cùng khuôn với
 * `components/session/copy-gate.test.ts` của lane 16.D.
 *
 * ## Cái nó bắt, và cái nó KHÔNG bắt
 *
 * Nó bắt literal chuỗi và JSX text chứa ký tự Latin CÓ DẤU. Một lane vẫn lách
 * được bằng cách viết tiếng Việt không dấu (rơi vào `scanStripped`, cổng của
 * gói copy) hoặc viết tiếng Anh, và `aria-label="Close"` đi lọt hoàn toàn.
 *
 * ⚠ Và một lớp nữa mà cổng này KHÔNG thấy, nói ra vì nó đã lọt qua hai lane
 * trước: một khoá thêm vào bản đồ mà KHÔNG có nơi gọi. T4 chỉ gác một chiều
 * (chuỗi ngoài bản đồ), nên khoá chết đi qua nó. Ô cuối cùng dưới đây gác chiều
 * còn lại cho riêng surface `admin.`.
 *
 * Chú thích được bóc trước khi quét, bằng máy trạng thái chạy theo ký tự: chú
 * thích tiếng Việt trong mã của lane là hợp lệ, và một cổng bắt cả chúng thì
 * không lane nào dùng được.
 *
 * ## ⚠ File test bị LOẠI khỏi phạm vi quét, và đây là lý do
 *
 * Một ô test khẳng định nhãn đọc ra là "Đang chạy" chỉ có giá trị khi nó viết
 * THẲNG chuỗi đó. Viết `expect(...).toBe(t('admin.session-status.running'))` là
 * so bản đồ với chính nó: ô đó xanh với mọi giá trị, kể cả chuỗi rỗng, kể cả
 * một chuỗi mất dấu. Cái giá được nói ra: một chuỗi người dùng đọc mà chỉ xuất
 * hiện trong file test thì cổng này không thấy. Điều đó vô hại, vì một chuỗi
 * chỉ sống trong test thì không tới được người dùng.
 */

/** Gốc `apps/web/src`, suy từ vị trí file này (`src/components/admin`). */
const SRC_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * Glob sở hữu của lane 16.F, khai TƯỜNG MINH theo bảng ở `phase-16.md` §3.
 *
 * `app/admin/layout.tsx` NẰM TRONG phạm vi quét dù lane không được sửa phần
 * gác auth của nó: cổng đo chuỗi, không đo quyền sửa. Một chuỗi người dùng đọc
 * lọt vào file đó vẫn phải đỏ, và cách xử lý đúng lúc đó là báo lead chứ không
 * phải nới danh sách này.
 */
const LANE_DIRS: readonly string[] = [
  path.join('components', 'admin'),
  path.join('app', 'admin'),
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

describe('T4 · glob của lane 16.F không còn chuỗi người dùng nằm ngoài bản đồ', () => {
  /*
    Ô "tập đầu vào không rỗng" chạy TRƯỚC ô đếm vi phạm, theo đúng khuôn T0 của
    hợp đồng §3.0. Không có nó thì một lượt đổi tên thư mục, hay một `collect`
    trả mảng rỗng vì `import.meta.dirname` trỏ sai chỗ, biến cả cổng này thành
    một no-op xanh vĩnh viễn.
  */
  it('bộ quét nhìn thấy một tập file THẬT', () => {
    expect(FILES.length, 'glob của lane rỗng, bộ quét đang nhìn sai chỗ').toBeGreaterThan(15);

    const names = FILES.map((f) => path.basename(f));
    // Vài file mốc, đủ để một lượt đổi tên thư mục làm ô này đỏ ngay.
    expect(names).toContain('users-client.tsx');
    expect(names).toContain('sessions-client.tsx');
    expect(names).toContain('content-client.tsx');
    expect(names).toContain('audit-client.tsx');
    expect(names).toContain('health-panel.tsx');
    expect(names).toContain('confirm-dialog.tsx');
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
        'Chuyển nó vào packages/copy/src/surfaces/admin.ts rồi gọi qua t()/err(). ' +
        'ĐỪNG nới cổng này để làm suite xanh lại.',
    ).toEqual([]);
  });

  it('đối chứng dương: bộ quét ĐỎ được', () => {
    // Không có ô này thì một `scanLatinLiteral` luôn trả mảng rỗng (import
    // hỏng, regex bị nới, subpath `./scan` trỏ nhầm) cũng làm ô trên xanh, tức
    // xanh vì mù chứ không phải vì sạch.
    expect(scanLatinLiteral('<p>Xin chào</p>')).toHaveLength(1);
    expect(scanLatinLiteral("const x = 'Đang tải danh sách';")).toHaveLength(1);
  });

  it('đối chứng âm: mã đã đi qua bản đồ thì KHÔNG bị bắt', () => {
    // Chốt lại rằng cổng không đỏ với chính hình dạng mà nó yêu cầu người ta
    // viết. Một cổng đỏ cả với lời giải đúng là một cổng sẽ bị tắt.
    expect(scanLatinLiteral("<p>{t('admin.users.title')}</p>")).toEqual([]);
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
 * Phép đếm là grep văn bản trên chính glob của lane cộng file surface, không
 * phải phân tích cú pháp. Hai hình dạng gọi được chấp nhận:
 *
 * · nguyên khoá trong một lời gọi, ví dụ `t('admin.users.title')`;
 * · khoá ghép bằng template literal, ví dụ `` t(`admin.role.${role}`) ``, và ở
 *   ca này ô chỉ khẳng định TIỀN TỐ có mặt. Đó là giới hạn thật của một phép
 *   grep, nói ra thay vì giả vờ là không có.
 */
describe('T4 chiều ngược · mọi khoá của surface admin đều có nơi gọi', () => {
  const SURFACE = path.resolve(
    SRC_ROOT,
    '..',
    '..',
    '..',
    'packages',
    'copy',
    'src',
    'surfaces',
    'admin.ts',
  );

  const source = readFileSync(SURFACE, 'utf8');
  const keys = [...source.matchAll(/^ {2}'(admin\.[a-z0-9.-]+)':/gm)].map((m) => m[1] as string);
  const callSites = FILES.map((file) => readFileSync(file, 'utf8')).join('\n');

  it('đọc được một tập khoá THẬT từ file surface', () => {
    expect(keys.length, 'không trích được khoá nào, regex hoặc đường dẫn sai').toBeGreaterThan(80);
    expect(keys).toContain('admin.users.title');
    expect(keys).toContain('admin.error.users-list');
  });

  it('không khoá nào chết', () => {
    const dead = keys.filter((key) => {
      if (callSites.includes(`'${key}'`)) {
        return false;
      }
      // Khoá ghép: `admin.role.user` được gọi qua `` `admin.role.${role}` ``.
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
