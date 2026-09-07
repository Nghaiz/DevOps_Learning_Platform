import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  LOW_CAPACITY_RATIO,
  describeCapacity,
  describeProfileCapacity,
  formatFetchedAt,
  readProfileCapacity,
  type ProfileCapacityView,
} from './capacity';

function view(activeSessions: number, softCapacity: number, hardCapacity = softCapacity + 3) {
  return { activeSessions, softCapacity, hardCapacity, fetchedAt: '2026-09-06T10:00:00.000Z' };
}

describe('describeCapacity — số còn lại', () => {
  it('còn = soft − active', () => {
    expect(describeCapacity(view(5, 17)).remaining).toBe(12);
  });

  it('không bao giờ âm khi active vượt trần mềm (pool đang trả pod về)', () => {
    const reading = describeCapacity(view(19, 17));
    expect(reading.remaining).toBe(0);
    expect(reading.tone).toBe('full');
  });

  /**
   * Cổng chống hằng số viết tay: nếu ai đó thay `view.softCapacity` bằng 20 hay
   * 23 (hai con số đã lưu hành trong các report P12), cùng một đầu vào sẽ ra
   * một số khác — và test này đỏ. Trần mềm là thứ orchestrator TÍNH, FE chỉ trừ.
   */
  it('bám trần trong payload, không bám một hằng số của riêng FE', () => {
    expect(describeCapacity(view(4, 8)).label).toBe('Còn 4 chỗ');
    expect(describeCapacity(view(4, 30)).label).toBe('Còn 26 chỗ');
    expect(describeCapacity(view(4, 17)).label).toBe('Còn 13 chỗ');
  });
});

describe('describeCapacity — ba mức', () => {
  it('ok khi còn nhiều hơn ngưỡng tỉ lệ', () => {
    const reading = describeCapacity(view(0, 20));
    expect(reading.tone).toBe('ok');
    expect(reading.label).toBe('Còn 20 chỗ');
  });

  it('low ở đúng ngưỡng tỉ lệ, và ngưỡng co giãn theo trần', () => {
    // 20% của 20 = 4 ⇒ còn 4 là "sắp hết", còn 5 thì chưa.
    expect(describeCapacity(view(16, 20)).tone).toBe('low');
    expect(describeCapacity(view(15, 20)).tone).toBe('ok');
    // Trần đổi ⇒ ngưỡng đổi theo, không cần sửa dòng nào.
    expect(describeCapacity(view(8, 10)).tone).toBe('low');
    expect(describeCapacity(view(7, 10)).tone).toBe('ok');
    expect(LOW_CAPACITY_RATIO).toBe(0.2);
  });

  it('full khi hết chỗ, và câu nói rõ phải làm gì tiếp', () => {
    const reading = describeCapacity(view(17, 17));
    expect(reading.tone).toBe('full');
    expect(reading.label).toBe('Hết chỗ');
    expect(reading.detail).toContain('sẽ bị từ chối');
    expect(reading.detail).toContain('Của tôi');
  });

  it('trần mềm 0 (pool ăn hết quota) đọc là hết chỗ, không phải "còn 0 chỗ"', () => {
    expect(describeCapacity(view(0, 0, 3)).tone).toBe('full');
  });
});

describe('describeCapacity — câu hiển thị', () => {
  it('mọi mức đều nêu cả active lẫn hai trần', () => {
    for (const reading of [
      describeCapacity(view(0, 20, 23)),
      describeCapacity(view(18, 20, 23)),
      describeCapacity(view(20, 20, 23)),
    ]) {
      expect(reading.detail).toContain('20');
      expect(reading.detail).toContain('trần cứng 23');
    }
  });

  /**
   * "Hết chỗ" là đúng chỗ một sản phẩm thương mại sẽ chèn "nâng cấp gói để có
   * thêm sandbox". Nền tảng này KHÔNG có phần đó (ràng buộc chủ dự án), nên câu
   * hết chỗ phải chỉ sang việc kết thúc một phiên, không sang việc mua thêm.
   *
   * Chỉ kiểm tiếng Việt — nửa tiếng Anh do lệnh grep AC ở `phase-13-exec.md` §5
   * gác; xem chú thích cùng lý do ở `nav.test.ts`.
   */
  it('không chứa lối thoát thương mại nào', () => {
    const all = [describeCapacity(view(0, 20)), describeCapacity(view(20, 20))]
      .flatMap((reading) => [reading.label, reading.detail])
      .join(' ');
    expect(all).not.toMatch(/giá|gói cước|thanh toán|nâng cấp|dùng thử/i);
  });
});

/**
 * Payload vỏ NHẬN THẬT sau bản vá 2026-09-08 — gồm cả phần theo profile.
 *
 * `softCapacity`/`hardCapacity` giữ nguyên giá trị của cảnh đã đo hôm 2026-09-07
 * (20 và 23) CÓ CHỦ Ý: các ô dưới đây phải chứng minh được rằng đường mới KHÔNG
 * còn đọc hai số đó nữa.
 */
function profileView(
  profileCapacity: Record<string, { slotsFree: number; slotsTotal: number }>,
  overrides: Partial<ProfileCapacityView> = {},
): ProfileCapacityView {
  return {
    activeSessions: 6,
    softCapacity: 20,
    hardCapacity: 23,
    fetchedAt: '2026-09-08T10:00:00.000Z',
    quotaReadable: true,
    quotaError: '',
    profileCapacity,
    ...overrides,
  };
}

describe('describeProfileCapacity — bản vá mâu thuẫn 2026-09-07', () => {
  /**
   * Ô CHÍNH. Cùng một payload, đúng trạng thái đã đo: quota còn 576Mi nên bài
   * IDE (768Mi/pod) KHÔNG vào được, trong khi bài thường còn 2 chỗ.
   *
   * Đường CŨ đọc `soft − active` = 20 − 6 = **14** và in "Còn 14 chỗ" ngay lúc
   * `startSession` trả 429. Ô này khẳng định đường mới KHÔNG ra 14 ở bất kỳ
   * profile nào — tức nó ĐỎ ngay khi ai đó nối lại công thức cũ.
   */
  it('bài IDE hết chỗ trong khi công thức cũ vẫn nói "còn 14"', () => {
    const v = profileView({
      [DEFAULT_PROFILE]: { slotsFree: 2, slotsTotal: 23 },
      ide: { slotsFree: 0, slotsTotal: 7 },
    });

    // Công thức cũ, tính tại chỗ để so — vẫn ra đúng con số đã in ra màn hình.
    expect(describeCapacity(v).remaining).toBe(14);

    const ide = describeProfileCapacity(v, 'ide');
    expect(ide?.remaining).toBe(0);
    expect(ide?.tone).toBe('full');
    expect(ide?.label).toBe('Hết chỗ');
    expect(ide?.remaining).not.toBe(describeCapacity(v).remaining);

    const thuong = describeProfileCapacity(v);
    expect(thuong?.remaining).toBe(2);
  });

  it('nhãn của vỏ NÓI RÕ nó chỉ đúng cho bài thường', () => {
    const reading = describeProfileCapacity(
      profileView({ [DEFAULT_PROFILE]: { slotsFree: 20, slotsTotal: 23 } }),
    );
    expect(reading?.label).toBe('Còn 20 chỗ');
    // Ràng buộc: vỏ không biết người dùng sắp mở bài nào, nên câu đầy đủ phải
    // thu hẹp lời hứa thay vì khẳng định một con số cho mọi bài.
    expect(reading?.detail).toContain('cho bài thường');
    expect(reading?.detail).toMatch(/IDE|Kubernetes/);
    expect(reading?.detail).toContain('trần riêng');
  });

  it('trên một bài cụ thể thì nói "cho bài này", không dán thêm cảnh báo trần riêng', () => {
    const reading = describeProfileCapacity(
      profileView({ ide: { slotsFree: 3, slotsTotal: 7 } }),
      'ide',
    );
    expect(reading?.detail).toContain('cho bài này');
    expect(reading?.detail).not.toContain('trần riêng');
  });

  it('ngưỡng "sắp hết" co theo trần CỦA CHÍNH profile đó, không theo trần chung', () => {
    // 20% của 7 (bài IDE) = 1.4 ⇒ còn 1 là "sắp hết".
    expect(describeProfileCapacity(profileView({ ide: { slotsFree: 1, slotsTotal: 7 } }), 'ide')?.tone).toBe('low');
    expect(describeProfileCapacity(profileView({ ide: { slotsFree: 2, slotsTotal: 7 } }), 'ide')?.tone).toBe('ok');
    // Cùng con số "còn 2" nhưng trên trần 23 (bài thường) thì là "sắp hết" —
    // chứng minh mẫu số ĐANG được dùng, không phải một hằng số.
    expect(
      describeProfileCapacity(profileView({ [DEFAULT_PROFILE]: { slotsFree: 2, slotsTotal: 23 } }))?.tone,
    ).toBe('low');
    expect(LOW_CAPACITY_RATIO).toBe(0.2);
  });

  it('CHƯA BIẾT ⇒ null, và KHÔNG rơi về softCapacity', () => {
    const cases: ProfileCapacityView[] = [
      // quota không đọc được (403 thiếu RBAC `resourcequotas`).
      profileView({}, { quotaReadable: false, quotaError: 'resourcequotas is forbidden' }),
      // quota đọc được nhưng server không khai profile mặc định (thiếu LimitRange).
      profileView({ ide: { slotsFree: 6, slotsTotal: 7 } }),
      // payload hỏng.
      profileView({ [DEFAULT_PROFILE]: { slotsFree: Number.NaN, slotsTotal: 23 } }),
      profileView({ [DEFAULT_PROFILE]: { slotsFree: 2, slotsTotal: Number.NaN } }),
    ];
    for (const v of cases) {
      expect(describeProfileCapacity(v)).toBeNull();
      expect(readProfileCapacity(v)).toBeNull();
      // Cổng CHỐNG RƠI VỀ SỐ CŨ: `describeCapacity(v)` vẫn ra một con số, và
      // đúng cái con số đó là thứ đã nói dối. "Chưa rõ" phải là null, không
      // phải 14.
      expect(describeCapacity(v).remaining).toBe(14);
    }
  });

  it('một profile server không khai thì VẮNG MẶT, không phải 0', () => {
    const v = profileView({ [DEFAULT_PROFILE]: { slotsFree: 5, slotsTotal: 23 } });
    expect(describeProfileCapacity(v, 'khong-ton-tai')).toBeNull();
    expect(describeProfileCapacity(v)?.remaining).toBe(5);
  });

  it('slotsFree âm (quota bị thu hẹp) đọc thành 0, không phải số âm', () => {
    const reading = describeProfileCapacity(
      profileView({ [DEFAULT_PROFILE]: { slotsFree: -2, slotsTotal: 23 } }),
    );
    expect(reading?.remaining).toBe(0);
    expect(reading?.tone).toBe('full');
  });

  it('không chứa lối thoát thương mại nào', () => {
    const all = [
      describeProfileCapacity(profileView({ [DEFAULT_PROFILE]: { slotsFree: 20, slotsTotal: 23 } })),
      describeProfileCapacity(profileView({ [DEFAULT_PROFILE]: { slotsFree: 0, slotsTotal: 23 } })),
      describeProfileCapacity(profileView({ ide: { slotsFree: 1, slotsTotal: 7 } }), 'ide'),
    ]
      .flatMap((reading) => [reading?.label ?? '', reading?.detail ?? ''])
      .join(' ');
    expect(all).not.toMatch(/giá|gói cước|thanh toán|nâng cấp|dùng thử/i);
  });
});

/**
 * CÁCH LY `describeCapacity` (công thức cũ) — phép kiểm TĨNH, quét mã nguồn.
 *
 * Sau 2026-09-08 hàm đó KHÔNG còn call-site sản phẩm nào; nó sống tiếp vì đúng
 * hai lý do đã ghi tại chỗ (`capacity.ts`): nó là đối chứng của các ô
 * `describeProfileCapacity` ngay phía trên, và xoá hẳn còn phải gỡ một dòng ở
 * `components/shell/index.ts` — barrel, ngoài sở hữu của lượt dọn nợ này.
 *
 * "Còn sống nhưng không ai gọi" là trạng thái tự mục: lần sau ai đó cần một câu
 * "còn N chỗ" sẽ thấy nó trong gợi ý của barrel, gọi nó, và in lại đúng con số
 * đã nói dối ngày 2026-09-07. Nên nó bị cách ly bằng một danh sách miễn trừ
 * ĐÍCH DANH, và phép kiểm chạy theo CẢ HAI CHIỀU:
 *
 *   · file MỚI import nó ⇒ ĐỎ. Việc phải làm là dùng `describeProfileCapacity`,
 *     KHÔNG phải thêm tên file vào danh sách dưới đây.
 *   · một mục trong danh sách hết import nó ⇒ CŨNG ĐỎ. Đặc biệt khi mục đó là
 *     `components/shell/index.ts`: lúc ấy rào chắn duy nhất của việc xoá đã tự
 *     rơi, và việc phải làm là XOÁ hàm + xoá cả khối này, không phải sửa danh
 *     sách cho nó xanh lại.
 *
 * ⚠ Chỉ tính `describeCapacity` CỦA VỎ, và phải phân giải ĐƯỜNG DẪN MODULE của
 * từng lệnh import chứ không grep theo tên. `components/session/capacity.ts` có
 * một hàm TRÙNG TÊN (nhận thêm `profile`, đọc `profile_capacity`) đang được
 * `session-controls.tsx` dùng thật. Bản đầu của khối này đếm theo tên và ĐỎ NGAY
 * trên cây đúng, gọi tám file lành là vi phạm — trong đó có cả hai trang vừa
 * được vá. Một phép kiểm luôn đỏ là một phép kiểm sẽ bị tắt, nên chính sự phân
 * biệt đó có một ô gác riêng ("phân biệt được hàm trùng tên của khung phiên").
 */
const QUARANTINE_DEFINITION = 'components/shell/capacity.ts';

const QUARANTINE_ALLOW = [
  'components/shell/capacity.test.ts', // đối chứng của chính file này
  'components/shell/index.ts', // dòng re-export — thứ chặn việc xoá hẳn
] as const;

const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo']);

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsFiles(full, out);
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * `<file>` + `<specifier>` → khoá module, chuẩn hoá về dạng posix tương đối
 * `src/`. Bỏ đuôi và bỏ `/index` để `'../shell'`, `'../shell/index'` và
 * `'../../components/shell/index.ts'` cùng đọc ra một khoá.
 */
function moduleKey(fromFile: string, specifier: string, srcRoot: string): string | null {
  if (!specifier.startsWith('.')) {
    return null;
  }
  const resolved = path.resolve(path.dirname(fromFile), specifier);
  const rel = path.relative(srcRoot, resolved).split(path.sep).join('/');
  return rel.replace(/\.tsx?$/, '').replace(/\/index$/, '');
}

/** Khoá module trỏ tới `describeCapacity` CỦA VỎ (file thật hoặc qua barrel). */
const SHELL_CAPACITY_KEYS = new Set(['components/shell/capacity', 'components/shell']);

/** Mọi `import {…} from '…'` / `export {…} from '…'`, kể cả bản `type`. */
const NAMED_FROM = /(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g;

function importsShellDescribeCapacity(source: string, file: string, srcRoot: string): boolean {
  for (const match of source.matchAll(NAMED_FROM)) {
    const [, bindings = '', specifier = ''] = match;
    const names = bindings
      .split(',')
      // `describeCapacity as legacy` ⇒ vẫn là cùng một hàm; lấy vế TRÁI.
      .map((raw) => raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '');
    if (!names.includes('describeCapacity')) {
      continue;
    }
    const key = moduleKey(file, specifier, srcRoot);
    if (key !== null && SHELL_CAPACITY_KEYS.has(key)) {
      return true;
    }
  }
  return false;
}

describe('describeCapacity — cách ly (công thức cũ, không call-site sản phẩm)', () => {
  const srcRoot = path.resolve(import.meta.dirname, '..', '..');

  /*
    Đọc MỘT lượt ở pha thu thập, không trong thân `it` — quét vài trăm file bằng
    `readFileSync` khi turbo chạy nhiều gói song song trên Windows đủ vượt
    `testTimeout` 5000ms, và lúc đó ô đỏ vì tranh I/O chứ không vì hợp đồng bị
    phá. Cùng lý do đã ghi ở `components/session/landmark-contract.test.ts`.
  */
  const files = collectTsFiles(srcRoot).map((file) => {
    const source = readFileSync(file, 'utf8');
    return {
      relative: path.relative(srcRoot, file).split(path.sep).join('/'),
      mentions: source.includes('describeCapacity'),
      definesIt: /export function describeCapacity\b/.test(source),
      importsShell: importsShellDescribeCapacity(source, file, srcRoot),
    };
  });

  it('quét được một tập đáng kể, và VẪN thấy hàm bị cách ly (đối chứng dương)', () => {
    expect(files.length).toBeGreaterThan(50);
    // Regex/phân giải đường dẫn còn chạy: nếu hỏng, danh sách này rỗng và mọi ô
    // dưới xanh vì không đo gì.
    expect(files.filter((f) => f.importsShell).length).toBeGreaterThan(0);
    // Và hàm vẫn còn ở chỗ nó phải ở. Mất dòng này ⇒ ai đó đã xoá hàm rồi, và
    // việc phải làm là xoá luôn cả khối cách ly này chứ không sửa nó cho xanh.
    const dinhNghia = files.find((f) => f.relative === QUARANTINE_DEFINITION);
    expect(dinhNghia?.definesIt, `${QUARANTINE_DEFINITION} không còn định nghĩa describeCapacity`).toBe(
      true,
    );
  });

  /**
   * ĐỐI CHỨNG PHÂN BIỆT — ô đắt nhất của khối này.
   *
   * `components/session/capacity.ts` export một hàm TRÙNG TÊN (nhận thêm
   * `profile`), và `session-controls.tsx` import nó THẬT, mỗi lần render. Một
   * phép kiểm đếm theo TÊN sẽ gọi hai file đó là vi phạm — tức đỏ ở đúng bản
   * ĐÚNG, và rồi bị tắt. Ô này ghim rằng hai file đó nhắc tên nhưng KHÔNG nối
   * vào module của vỏ.
   */
  it('phân biệt được hàm trùng tên của khung phiên', () => {
    for (const relative of ['components/session/session-controls.tsx', 'components/session/capacity.ts']) {
      const f = files.find((x) => x.relative === relative);
      expect(f, `không tìm thấy ${relative}`).toBeDefined();
      expect(f?.mentions).toBe(true);
      expect(f?.importsShell, `${relative} bị tính nhầm là dùng describeCapacity của VỎ`).toBe(false);
    }
  });

  it('không file nào ngoài danh sách miễn trừ import nó', () => {
    const allow = new Set<string>(QUARANTINE_ALLOW);
    const offenders = files
      .filter((f) => f.importsShell && !allow.has(f.relative))
      .map((f) => f.relative);
    expect(
      offenders,
      'dùng `describeProfileCapacity` (đọc ResourceQuota theo từng profile) — ' +
        '`describeCapacity` tính `soft − active`, chính con số đã in "Còn 14 chỗ" ' +
        'trong lúc startSession trả 429. KHÔNG thêm file vào QUARANTINE_ALLOW.',
    ).toEqual([]);
  });

  it('không mục miễn trừ nào đã cũ (hết import ⇒ XOÁ hàm, không sửa danh sách)', () => {
    const stale = QUARANTINE_ALLOW.filter(
      (relative) => files.find((f) => f.relative === relative)?.importsShell !== true,
    );
    expect(
      stale,
      'mục này không còn import `describeCapacity` của vỏ. Nếu là ' +
        '`components/shell/index.ts` thì rào chắn duy nhất của việc xoá đã rơi: xoá ' +
        'hàm ở capacity.ts và xoá luôn khối cách ly này.',
    ).toEqual([]);
  });
});

describe('formatFetchedAt', () => {
  it('trả chuỗi giờ cho thời điểm hợp lệ', () => {
    expect(formatFetchedAt('2026-09-06T10:00:00.000Z')).not.toBeNull();
  });

  it('trả null (không phải "Invalid Date") cho chuỗi rác', () => {
    expect(formatFetchedAt('không-phải-thời-điểm')).toBeNull();
    expect(formatFetchedAt('')).toBeNull();
  });
});
