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
 * Hợp đồng §3.0: `entries.length > 80` và `totalBytes > 20_000`. Khẳng định
 * THẲNG theo hai con số đó, không qua một biến sàn trung gian.
 *
 * ## Vì sao hằng số sàn bị xoá, chứ không được nâng
 *
 * Từ lượt L0 tới 2026-09-11 file này giữ `MIN_ENTRIES = 39` và
 * `MIN_TOTAL_BYTES = 1_668` làm ratchet, vì lúc đó tám surface còn cố ý rỗng và
 * ghim thẳng 80 sẽ làm suite đỏ vì một lý do không ai sửa được. Luật của chính
 * ratchet đó, viết trong `RATCHET_RULE` cũ, có ba vế, và vế thứ ba nói:
 *
 *     Sàn chạm mục tiêu hợp đồng thì XOÁ hằng số và khẳng định thẳng theo hợp
 *     đồng. Không ghim lại.
 *
 * Điều kiện đó đạt từ lâu mà không ai thi hành nó. Đo 2026-09-11: bản đồ có
 * 1080 khoá, tức gấp 13,5 lần mục tiêu 80. Trong khi đó ô tự kiểm của ratchet
 * (`MIN_ENTRIES <= CONTRACT_TARGET_ENTRIES`) vẫn XANH, vì nó so SÀN với mục
 * tiêu chứ không so SỐ ĐO với mục tiêu, và sàn thì không ai nâng.
 *
 * Hệ quả đo được: bản đồ mất 1041 khoá mà T0 vẫn xanh. Một cổng chạy ở 3,6%
 * công suất là đồ trang trí, và nó là loại nguy hiểm nhất vì nó BÁO XANH.
 *
 * ## Vế thứ hai, không có trong hợp đồng, và vì sao nó cần
 *
 * Một ngưỡng trên TỔNG không thấy được việc MỘT surface bị xoá sạch: xoá cả
 * `error.` (5 khoá) thì tổng vẫn 1075, vẫn qua 80. Nên `SURFACE_FLOOR` dưới đây
 * gác theo TỪNG surface, đúng theo tinh thần T5 (cộng từng phần thay vì tin vào
 * tổng).
 */

/** Hợp đồng §3.0, khẳng định thẳng. Không có biến sàn trung gian nào nữa. */
const CONTRACT_MIN_ENTRIES = 80;
const CONTRACT_MIN_BYTES = 20_000;

/**
 * Surface được phép rỗng, kèm ngày và lý do. Hình dạng giống `intentionalThree`
 * vì nó là cùng một loại lời khai: "trạng thái này là cố ý, đây là lý do".
 *
 * ⛔ Đây là một pinned baseline, nên nó ship kèm companion ở ô cuối T0: dòng
 * miễn trừ nào KHÔNG còn đúng thì cổng ĐỎ, và cách sửa là XOÁ dòng đó, không
 * phải ghim lại một con số mới (`rules/pinned-baseline-test-companion.md`).
 */
const SURFACE_MAY_BE_EMPTY: Readonly<Record<string, string>> = {
  problem:
    '2026-09-11: surface vừa tạo cho vùng bài tập k8s, lane chuyển chuỗi chưa hạ cánh. Xoá dòng này ngay khi khoá đầu tiên vào problem.ts.',
};

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

  it('bản đồ vượt sàn hợp đồng §3.0 về SỐ KHOÁ', () => {
    const count = Object.keys(MESSAGES).length;
    expect(
      count,
      `${count} khoá, hợp đồng §3.0 đòi hơn ${CONTRACT_MIN_ENTRIES}. Tụt xuống dưới nghĩa là có khoá bị xoá: điều tra, đừng hạ ngưỡng.`,
    ).toBeGreaterThan(CONTRACT_MIN_ENTRIES);
  });

  it('giá trị dựng ra có khối lượng thật', () => {
    const bytes = RENDERED.values.reduce(
      (total, rv) => total + Buffer.byteLength(rv.value, 'utf8'),
      0,
    );
    expect(
      bytes,
      `${bytes} byte, hợp đồng §3.0 đòi hơn ${CONTRACT_MIN_BYTES}. Tụt xuống dưới nghĩa là có giá trị bị rút ngắn hoặc bị xoá.`,
    ).toBeGreaterThan(CONTRACT_MIN_BYTES);
  });

  /**
   * Vế mà hợp đồng không đòi nhưng thiếu nó thì bốn cổng dưới đây nói dối: một
   * mục KHÔNG dựng được là một mục mà T1b, T2, T5 và T6 đều không nhìn thấy, và
   * cả bốn vẫn xanh.
   */
  it('mọi mục đều dựng được, không mục nào bị bỏ qua trong im lặng', () => {
    expect(RENDERED.failures).toEqual([]);
  });

  /**
   * Vế mà một ngưỡng trên TỔNG không mua được: xoá sạch một surface nhỏ thì
   * tổng gần như không nhúc nhích và ô ở trên vẫn xanh.
   */
  it('không surface nào rỗng, trừ những cái đã khai lý do', () => {
    const empty = Object.entries(SURFACES)
      .filter(([, entries]) => Object.keys(entries).length === 0)
      .map(([name]) => name);
    const undeclared = empty.filter((name) => SURFACE_MAY_BE_EMPTY[name] === undefined);
    expect(
      undeclared,
      `surface rỗng mà không có lời khai: ${undeclared.join(', ')}. Khai vào SURFACE_MAY_BE_EMPTY kèm ngày và lý do, hoặc điều tra xem khoá đi đâu.`,
    ).toEqual([]);
  });

  /**
   * Companion của pinned baseline ở trên, theo `rules/pinned-baseline-test-companion.md`.
   *
   * Thiếu ô này thì `SURFACE_MAY_BE_EMPTY` trở thành nghĩa địa: một surface đã
   * được đổ đầy từ lâu vẫn nằm trong danh sách miễn trừ, và lần sau nó bị xoá
   * sạch thì không ô nào đỏ.
   *
   * ⛔ Ô này ĐỎ là tin TỐT. Cách sửa là XOÁ dòng miễn trừ, không phải viết lại
   * lý do cho nó khớp trạng thái mới.
   */
  it('không dòng miễn trừ nào hết hạn', () => {
    const stale = Object.keys(SURFACE_MAY_BE_EMPTY).filter((name) => {
      const entries = SURFACES[name as keyof typeof SURFACES] as Record<string, unknown> | undefined;
      return entries !== undefined && Object.keys(entries).length > 0;
    });
    expect(
      stale,
      `surface đã có khoá nhưng vẫn nằm trong SURFACE_MAY_BE_EMPTY: ${stale.join(', ')}. XOÁ dòng đó đi, đừng sửa lý do.`,
    ).toEqual([]);
  });

  it('mọi tên trong SURFACE_MAY_BE_EMPTY là một surface có thật', () => {
    const unknown = Object.keys(SURFACE_MAY_BE_EMPTY).filter((n) => !(n in SURFACES));
    expect(unknown, `tên không có trong SURFACES: ${unknown.join(', ')}`).toEqual([]);
  });

  it('mỗi lý do miễn trừ có ngày và đủ dài để đọc ra được', () => {
    for (const [name, reason] of Object.entries(SURFACE_MAY_BE_EMPTY)) {
      expect(reason, `lý do của ${name} phải mở đầu bằng YYYY-MM-DD`).toMatch(
        /^\d{4}-\d{2}-\d{2}: .{20,}/,
      );
    }
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
