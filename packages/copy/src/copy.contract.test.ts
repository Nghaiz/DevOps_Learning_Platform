/**
 * CỔNG của `packages/copy`. Hợp đồng: `p16-copy.md` §3.
 *
 * ⚠ THỨ TỰ TRONG FILE NÀY LÀ MỘT PHẦN CỦA HỢP ĐỒNG. T0 chạy TRƯỚC mọi test
 * khác, vì nó là thứ duy nhất chứng minh rằng các cổng bên dưới có dữ liệu để
 * đọc. Không có nó thì một lần đổi tên thư mục biến cả file này thành no-op
 * xanh vĩnh viễn. Repo này đã trả giá đúng hai lần cho hình dạng đó: `--shard`
 * chia theo file khiến 2/3 phần chạy 0 ô mà vẫn thoát 0, và `go test` thoát 0
 * khi mọi test đều skip.
 *
 * ⛔ Ba ký tự bị cấm không gõ thẳng ở đây. Bộ quét T1a đọc cả file này.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DIACRITIC_ALLOW } from './diacritic-allow.ts';
import {
  MESSAGES,
  SURFACE_INTENTIONAL_THREE,
  SURFACE_PREFIXES,
  SURFACES,
} from './registry.ts';
import {
  renderMessages,
  scanBlocked,
  scanDashes,
  scanLatinLiteral,
  scanNfc,
  scanStripped,
  scanThree,
} from './scan.ts';

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));
const SURFACES_DIR = join(SRC_DIR, 'surfaces');
const CONTENT_DIR = fileURLToPath(new URL('../../../content', import.meta.url));

const RENDERED = renderMessages(MESSAGES);
const RENDERED_BY_KEY: Record<string, string> = {};
for (const [i, rv] of RENDERED.values.entries()) {
  RENDERED_BY_KEY[`${rv.key}#${i}`] = rv.value;
}

function walkFiles(dir: string, ext: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full, ext));
    } else if (full.endsWith(ext)) {
      out.push(full);
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// T0 · đối chứng rỗng. CHẠY TRƯỚC MỌI TEST KHÁC.
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠ RATCHET, KHÔNG PHẢI MỤC TIÊU. Hai con số dưới đây là SÀN, và chúng chỉ đi
 * lên.
 *
 * Hợp đồng §3.0 viết thẳng `entries.length > 80` và `totalBytes > 20_000`. Hai
 * ngưỡng đó mô tả trạng thái SAU KHI cả bảy lane hạ cánh. Ở lượt L0 bản đồ chỉ
 * có `common.` và `error.` (§6.1 giao đúng hai file đó cho L0), nên ghim thẳng
 * 80 sẽ làm suite đỏ ngay từ commit đầu tiên, và đỏ vì một lý do không ai sửa
 * được: tám surface còn lại CỐ Ý rỗng cho tới khi lane của chúng chạy.
 *
 * Luật của ratchet, cả ba nằm trong thông điệp lỗi bên dưới vì người gặp nó lần
 * đầu sẽ không đọc file này:
 *
 *   - Số ĐO ĐƯỢC tụt xuống dưới sàn: hồi quy. Ai đó vừa xoá khoá. Điều tra, và
 *     KHÔNG hạ sàn.
 *   - Số đo được vượt sàn: hướng tốt. LEAD nâng sàn lúc tích hợp, không phải
 *     lane nâng. Bảy lane cùng sửa một con số trong một file là đúng lớp đua ghi
 *     mà `registry.ts` được bảo vệ để tránh.
 *   - Sàn chạm mục tiêu hợp đồng: XOÁ hằng số và khẳng định thẳng theo hợp đồng.
 *     Không ghim lại.
 */
const MIN_ENTRIES = 39;
const MIN_TOTAL_BYTES = 1_668;
const CONTRACT_TARGET_ENTRIES = 80;
const CONTRACT_TARGET_BYTES = 20_000;

const RATCHET_RULE =
  'SÀN chỉ đi lên. Tụt xuống nghĩa là có khoá bị xoá: điều tra, đừng hạ sàn. ' +
  'Vượt sàn thì LEAD nâng sàn lúc tích hợp, không phải lane nâng. ' +
  `Khi sàn chạm mục tiêu hợp đồng (${CONTRACT_TARGET_ENTRIES} khoá / ${CONTRACT_TARGET_BYTES} byte) thì XOÁ hằng số và khẳng định thẳng theo hợp đồng.`;

describe('T0 · đối chứng rỗng', () => {
  it('danh sách file surface suy ra TỪ KHOÁ của SURFACES, không gõ tay', () => {
    const expected = Object.keys(SURFACES)
      .map((name) => `${name}.ts`)
      .sort();
    expect(readdirSync(SURFACES_DIR).sort()).toEqual(expected);
  });

  it('mọi surface đều khai tiền tố, và tiền tố đôi một khác nhau', () => {
    expect(Object.keys(SURFACE_PREFIXES).sort()).toEqual(Object.keys(SURFACES).sort());
    expect(Object.keys(SURFACE_INTENTIONAL_THREE).sort()).toEqual(Object.keys(SURFACES).sort());

    const seen = new Map<string, string>();
    for (const [surface, prefixes] of Object.entries(SURFACE_PREFIXES)) {
      for (const prefix of prefixes) {
        expect(seen.has(prefix), `tiền tố "${prefix}" dùng ở cả ${seen.get(prefix)} và ${surface}`).toBe(false);
        seen.set(prefix, surface);
      }
    }
  });

  it('bản đồ không rỗng', () => {
    const count = Object.keys(MESSAGES).length;
    expect(count, `${count} khoá, sàn là ${MIN_ENTRIES}. ${RATCHET_RULE}`).toBeGreaterThanOrEqual(
      MIN_ENTRIES,
    );
  });

  it('giá trị dựng ra có khối lượng thật', () => {
    const bytes = RENDERED.values.reduce(
      (total, rv) => total + Buffer.byteLength(rv.value, 'utf8'),
      0,
    );
    expect(bytes, `${bytes} byte, sàn là ${MIN_TOTAL_BYTES}. ${RATCHET_RULE}`).toBeGreaterThanOrEqual(
      MIN_TOTAL_BYTES,
    );
  });

  /**
   * Vế mà hợp đồng không đòi nhưng thiếu nó thì bốn cổng dưới đây nói dối: một
   * mục KHÔNG dựng được là một mục mà T1b, T2, T5 và T6 đều không nhìn thấy, và
   * cả bốn vẫn xanh.
   */
  it('mọi mục đều dựng được, không mục nào bị bỏ qua trong im lặng', () => {
    expect(RENDERED.failures).toEqual([]);
  });

  it('sàn chưa vượt mục tiêu hợp đồng, nếu vượt thì đã tới lúc xoá hằng số', () => {
    expect(MIN_ENTRIES, RATCHET_RULE).toBeLessThanOrEqual(CONTRACT_TARGET_ENTRIES);
    expect(MIN_TOTAL_BYTES, RATCHET_RULE).toBeLessThanOrEqual(CONTRACT_TARGET_BYTES);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T1 · gạch ngang dài
// ───────────────────────────────────────────────────────────────────────────

describe('T1a · quét NGUỒN, kể cả chú thích', () => {
  it('không file .ts nào trong src chứa U+2014, U+2013, U+2015', () => {
    const offenders: string[] = [];
    for (const file of walkFiles(SRC_DIR, '.ts')) {
      for (const violation of scanDashes(readFileSync(file, 'utf8'))) {
        offenders.push(
          `${file.slice(SRC_DIR.length)}: offset ${violation.index}, ${violation.kind}, U+${violation.codePoint.toString(16).toUpperCase()}`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it('quét được ÍT NHẤT một file, nếu không thì lượt quét này rỗng', () => {
    expect(walkFiles(SRC_DIR, '.ts').length).toBeGreaterThanOrEqual(
      Object.keys(SURFACES).length,
    );
  });
});

describe('T1b · quét GIÁ TRỊ đã dựng', () => {
  /**
   * Lượt này bắt được ký tự do một hàm phụ trợ chèn vào, ví dụ một hằng phân
   * cách nằm ngoài `surfaces/`. GIỚI HẠN: nó chỉ đi vào nhánh mà probe đi vào,
   * và T1a phủ nốt phần nó bỏ lại.
   */
  it('không giá trị nào chứa ký tự bị cấm', () => {
    const offenders = RENDERED.values
      .filter((rv) => scanDashes(rv.value).length > 0)
      .map((rv) => `${rv.key}: ${rv.value}`);
    expect(offenders).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T2 · tiếng Việt bị lột dấu
// ───────────────────────────────────────────────────────────────────────────

describe('T2 · tiếng Việt bị lột dấu', () => {
  it('không giá trị nào bị lột dấu', () => {
    const offenders: string[] = [];
    for (const rv of RENDERED.values) {
      const result = scanStripped(rv.value);
      if (!result.flagged) {
        continue;
      }
      const unallowed = result.matched.filter(
        (token) => !DIACRITIC_ALLOW.some((a) => a.key === rv.key && a.token === token),
      );
      if (unallowed.length > 0) {
        offenders.push(`${rv.key}: token [${unallowed.join(', ')}] trong ${JSON.stringify(rv.value)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * CHỐNG NGHĨA ĐỊA. Dòng miễn trừ không còn khớp gì thì đỏ. Thiếu vế này thì
   * danh sách chỉ lớn dần và không ai dám dọn.
   *
   * Bảng đang rỗng ở lượt L0, nên vòng lặp này chạy 0 lần và chưa chứng minh
   * gì. Vế "đỏ được" của nó nằm ở `scan.control.test.ts`.
   */
  it('mỗi dòng miễn trừ còn khớp ít nhất một chuỗi thật', () => {
    const dead = DIACRITIC_ALLOW.filter((entry) => {
      const hit = RENDERED.values.find((rv) => rv.key === entry.key);
      return hit === undefined || !scanStripped(hit.value).matched.includes(entry.token);
    }).map((entry) => `${entry.key} / ${entry.token}: xoá dòng này, chuỗi nó miễn trừ không còn tồn tại`);
    expect(dead).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T3 · đúng ba
// ───────────────────────────────────────────────────────────────────────────

describe('T3 · đúng ba', () => {
  it('không surface nào có nhóm ba chưa khai lý do', () => {
    const offenders: string[] = [];
    for (const [name, surface] of Object.entries(SURFACES)) {
      const table = SURFACE_INTENTIONAL_THREE[name as keyof typeof SURFACE_INTENTIONAL_THREE];
      for (const violation of scanThree(surface, table)) {
        offenders.push(`surfaces/${name}.ts :: ${violation.key} :: ${violation.kind} :: ${violation.detail}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T4 · chuỗi lọt ra ngoài bản đồ
// ───────────────────────────────────────────────────────────────────────────

describe('T4 · chuỗi lọt ra ngoài bản đồ', () => {
  /**
   * Cổng THẬT của T4 chạy trên glob sở hữu của TỪNG LANE, và nó là việc của
   * lane (§6.2 mục 1). Ở lượt L0 chưa lane nào hạ cánh, nên một cổng "quét mọi
   * glob đã khai" sẽ lặp qua danh sách rỗng và xanh mà không đo gì.
   *
   * Thứ chạy được NGAY BÂY GIỜ là đối chứng đường ống trên FILE THẬT: bộ dò
   * cộng bước đọc đĩa cộng bước bóc chú thích phải nhìn thấy chuỗi có dấu ở nơi
   * chắc chắn có, và không nhìn thấy gì ở nơi chắc chắn không có. Đối chứng đơn
   * vị ở `scan.control.test.ts` không phủ được nửa đọc-đĩa này.
   */
  it('nhìn thấy chuỗi có dấu trong file surface thật', () => {
    const source = readFileSync(join(SURFACES_DIR, 'common.ts'), 'utf8');
    expect(scanLatinLiteral(source).length).toBeGreaterThan(0);
  });

  it('không báo nhầm trên file chỉ có chú thích tiếng Việt', () => {
    const source = readFileSync(join(SRC_DIR, 'registry.ts'), 'utf8');
    expect(scanLatinLiteral(source)).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T5 · NFC, và tính duy nhất của tiền tố
// ───────────────────────────────────────────────────────────────────────────

describe('T5 · NFC và tổng khoá', () => {
  it('mọi giá trị đã chuẩn hoá NFC', () => {
    expect(scanNfc(RENDERED_BY_KEY)).toEqual([]);
  });

  it('mọi khoá mở đầu bằng một tiền tố đã khai của chính surface nó', () => {
    const offenders: string[] = [];
    for (const [name, surface] of Object.entries(SURFACES)) {
      const prefixes = SURFACE_PREFIXES[name as keyof typeof SURFACE_PREFIXES];
      for (const key of Object.keys(surface)) {
        if (!prefixes.some((p: string) => key.startsWith(`${p}.`))) {
          offenders.push(`surfaces/${name}.ts :: ${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Khoá trùng giữa hai surface sẽ NUỐT nhau trong im lặng khi spread, nên phép
   * cộng này là thứ duy nhất nói ra.
   */
  it('tổng khoá của MESSAGES bằng tổng khoá từng surface cộng lại', () => {
    const sum = Object.values(SURFACES).reduce<number>(
      (total, s) => total + Object.keys(s).length,
      0,
    );
    expect(Object.keys(MESSAGES)).toHaveLength(sum);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T6 · danh sách chặn
// ───────────────────────────────────────────────────────────────────────────

/**
 * ĐỌC KỸ TRƯỚC KHI TIN MÀU XANH CỦA TEST NÀY.
 *
 * Đây là cổng HỖ TRỢ, không phải cổng bảo đảm. Đỏ thì chắc chắn sai; xanh thì
 * CHƯA CHỨNG MINH GÌ. V2, V7 và V8 là phán đoán về nội dung câu, và một danh
 * sách chặn chỉ bắt được các mở đầu và kết thúc đã biết mặt. Một câu khởi động
 * viết bằng chữ mới đi lọt hoàn toàn.
 *
 * Ba luật kín là V3 (T1), V5 (T3), V6 (T2). Chỉ ba luật đó là phép đo.
 */
describe('T6 · danh sách chặn', () => {
  it('không giá trị nào dùng cụm bị chặn', () => {
    const offenders: string[] = [];
    for (const rv of RENDERED.values) {
      for (const violation of scanBlocked(rv.value)) {
        offenders.push(`${rv.key} :: ${violation.rule} :: ${violation.phrase}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// T7 · ratchet cho content/**
// ───────────────────────────────────────────────────────────────────────────

/**
 * ⚠ SỐ NÀY ĐO ĐƯỢC, KHÔNG PHẢI SỐ CỦA THIẾT KẾ.
 *
 * `design §1.1` ghi khuôn kết bài này xuất hiện 11 lần. Đếm lại trên cây hiện
 * tại ngày 2026-09-10: đúng MỘT file mang cả hai dấu hiệu
 * (`content/scenarios/dlp-docker-basics/finish.md`). Toàn repo có 2 file chứa
 * `# Xong rồi` và 1 file chứa `Những thứ đáng mang theo:`.
 *
 * Ghim 11 sẽ cho một cổng ĐỎ NGAY, và đỏ vì lý do ngược hẳn với thứ nó định
 * nói: người đọc thông điệp sẽ tưởng có 11 file cần sửa. Ghim con số đo được.
 */
const CONTENT_CLOSING_TEMPLATE_COUNT = 1;

const T7_RULE = [
  'Số TĂNG: hồi quy. Sửa nội dung, KHÔNG nâng số ghim.',
  'Số GIẢM: hướng tốt. Hạ số ghim xuống đúng số đo được.',
  'Số VỀ 0: xoá hằng số và ĐẢO test lại thành "không file nào được dùng khuôn này". Không ghim lại số 0.',
].join(' ');

describe('T7 · ratchet khuôn kết bài trong content', () => {
  it('số file dùng khuôn kết bài không tăng', () => {
    const files = walkFiles(CONTENT_DIR, '.md').filter((file) => {
      const text = readFileSync(file, 'utf8');
      return text.includes('# Xong rồi') && text.includes('Những thứ đáng mang theo:');
    });
    expect(
      files.length,
      `${files.length} file dùng khuôn, số ghim là ${CONTENT_CLOSING_TEMPLATE_COUNT}. ${T7_RULE}`,
    ).toBe(CONTENT_CLOSING_TEMPLATE_COUNT);
  });

  it('vẫn đọc được content/, nếu không thì lượt đếm trên là 0 vì thư mục sai', () => {
    expect(walkFiles(CONTENT_DIR, '.md').length).toBeGreaterThan(20);
  });
});
