/**
 * ĐỐI CHỨNG DƯƠNG cho từng bộ dò trong `scan.ts`.
 *
 * File này tồn tại để trả lời đúng một câu hỏi: nếu thứ bộ dò này canh đang
 * hỏng ngay bây giờ, nó có đỏ không? Một cổng chưa từng được nhìn thấy đỏ là
 * một cổng chưa được chứng minh, và trong repo này nó còn tệ hơn không có cổng,
 * vì màu xanh của nó sẽ kết thúc mọi cuộc điều tra.
 *
 * Số bộ dò phải BẰNG số nhóm đối chứng, và có một test khẳng định đúng điều đó
 * ở cuối file. Thêm một hàm vào `scan.ts` mà quên đối chứng là đỏ, không phải im
 * lặng.
 *
 * ⛔ Ba ký tự bị cấm và dấu chấm giữa KHÔNG BAO GIỜ gõ thẳng ở đây. Chúng dựng
 * bằng `String.fromCharCode`, vì hai lý do: bộ quét T1a đọc cả file test này
 * (không loại trừ file nào), và một đối chứng gõ tay là một đối chứng không ai
 * kiểm được bằng mắt.
 */
import { describe, expect, it } from 'vitest';

import * as scanModule from './scan.ts';
import {
  groupBySiblingPrefix,
  renderEntry,
  renderMessages,
  scanBlocked,
  scanDashes,
  scanLatinLiteral,
  scanNfc,
  scanStripped,
  scanThree,
} from './scan.ts';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const BAR = String.fromCharCode(0x2015);
const MID = String.fromCharCode(0x00b7);

/** Mỗi tên ở đây phải có một `describe` bên dưới, và ngược lại. */
const CONTROLLED_DETECTORS = [
  'scanDashes',
  'scanStripped',
  'scanThree',
  'groupBySiblingPrefix',
  'scanLatinLiteral',
  'scanNfc',
  'scanBlocked',
  'renderEntry',
  'renderMessages',
] as const;

describe('đối chứng · scanDashes', () => {
  it('bắt cả ba ký tự bị cấm, đúng vị trí và đúng điểm mã', () => {
    for (const [dash, cp, kind] of [
      [EM, 0x2014, 'em-dash'],
      [EN, 0x2013, 'en-dash'],
      [BAR, 0x2015, 'horizontal-bar'],
    ] as const) {
      const found = scanDashes(`a ${dash} b`);
      expect(found).toHaveLength(1);
      expect(found[0]).toEqual({ index: 2, codePoint: cp, kind });
    }
  });

  it('bắt dấu chấm giữa thiếu khoảng trắng', () => {
    const found = scanDashes(`a${MID}b`);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('middot-spacing');
    expect(found[0]?.codePoint).toBe(0x00b7);
  });

  it('bắt cả dấu chấm giữa THỪA khoảng trắng, vì đúng một là đúng một', () => {
    expect(scanDashes(`a  ${MID}  b`)).toHaveLength(1);
  });

  it('đối chứng âm: dấu chấm giữa đúng một khoảng trắng hai bên thì sạch', () => {
    expect(scanDashes(`Trung cấp ${MID} 25 phút`)).toEqual([]);
  });

  it('đối chứng âm: chuỗi tiếng Việt thường thì sạch', () => {
    expect(scanDashes('Bạn đã dùng hết 30 lượt thao tác.')).toEqual([]);
  });
});

describe('đối chứng · scanStripped', () => {
  /**
   * Chuỗi này NHÚNG THẲNG dưới dạng literal, tuyệt đối không đọc từ `lab.json`.
   *
   * Lý do: `lab.json` sẽ được sửa. Một đối chứng đọc file sẽ chuyển sang xanh
   * đúng lúc lỗi được vá, và từ giây đó nó không còn chứng minh gì trong khi vẫn
   * trông như đang gác.
   */
  const SHIPPED_DEFECT =
    'docker: khong lien quan o buoc nay. Dung ps aux hoac pgrep de tim PID';

  it('bắt khiếm khuyết đang chạy trên sản phẩm, và NÓI RA token nào làm nó đỏ', () => {
    const result = scanStripped(SHIPPED_DEFECT);
    expect(result.flagged).toBe(true);
    expect(result.matched).toContain('khong');
  });

  it('đối chứng âm: chính câu đó đã sửa dấu thì sạch', () => {
    const fixed =
      'docker: không liên quan ở bước này. Dùng ps aux hoặc pgrep để tìm PID';
    expect(scanStripped(fixed).flagged).toBe(false);
  });

  /**
   * Chốt lại hành vi dương-tính-giả đã CHẤP NHẬN. Câu này chứa đúng ba từ WEAK
   * (do, so, can), tức ngay dưới ngưỡng. Một lần siết danh sách WEAK sau này sẽ
   * làm nó đỏ, và lúc đó người siết phải trả lời câu hỏi này trước.
   */
  it('đối chứng âm: câu tiếng Anh ba từ WEAK vẫn dưới ngưỡng', () => {
    expect(scanStripped('Do not close this tab so the session can stay open').flagged).toBe(
      false,
    );
  });

  it('nhánh WEAK cũng phải đỏ được, không chỉ nhánh STRONG', () => {
    const result = scanStripped('ba hai cho ma');
    expect(result.strong).toEqual([]);
    expect(result.weak.length).toBeGreaterThanOrEqual(4);
    expect(result.flagged).toBe(true);
  });

  it('bóc phần không phải văn xuôi trước khi đối chiếu', () => {
    expect(scanStripped('`khong duoc nguoi`').flagged).toBe(false);
    expect(scanStripped('https://example.com/khong/duoc/nguoi').flagged).toBe(false);
    expect(scanStripped('quyen-600').flagged).toBe(false);
    expect(scanStripped('KHONG DUOC NGUOI').flagged).toBe(false);
  });
});

describe('đối chứng · scanThree', () => {
  /**
   * Surface GIẢ, dựng bên trong file test. Nó KHÔNG nằm trong `surfaces/`, vì
   * nếu nằm ở đó thì nó lọt vào cổng thật và làm cổng thật đỏ vĩnh viễn.
   */
  const FAKE = {
    'fake.list.three': { items: ['a', 'b', 'c'] },
    'fake.bullets': '- mot\n- hai\n- ba',
    'fake.step.1': 'A',
    'fake.step.2': 'B',
    'fake.step.3': 'C',
  };

  it('bắt đủ BA hình dạng, đúng 3 vi phạm với đúng 3 khoá', () => {
    const found = scanThree(FAKE, {});
    expect(found).toHaveLength(3);
    expect(found.map((v) => v.key).sort()).toEqual(['fake.bullets', 'fake.list.three', 'fake.step']);
    expect(found.map((v) => v.kind).sort()).toEqual([
      'list-of-three',
      'three-bullets',
      'three-siblings',
    ]);
  });

  it('đối chứng âm: nhóm 2 khoá và nhóm 4 khoá đều sạch', () => {
    expect(scanThree({ 'x.a': '1', 'x.b': '2' }, {})).toEqual([]);
    expect(scanThree({ 'y.1': 'a', 'y.2': 'b', 'y.3': 'c', 'y.4': 'd' }, {})).toEqual([]);
  });

  it('đối chứng âm: mảng 3 phần tử đã khai intentionalThree hợp lệ thì sạch', () => {
    const ok = {
      'z.list': {
        items: ['a', 'b', 'c'],
        intentionalThree: '2026-09-10: dung ba runtime sandbox ton tai va khop SandboxTierName',
      },
    };
    expect(scanThree(ok, {})).toEqual([]);
  });

  it('intentionalThree thiếu ngày phải ĐỎ, không được đọc như một dấu tích', () => {
    const bad = { 'z.list': { items: ['a', 'b', 'c'], intentionalThree: 'ok' } };
    const found = scanThree(bad, {});
    expect(found.map((v) => v.kind)).toContain('bad-intentional-three');
  });

  it('lý do quá ngắn cũng ĐỎ, vì ngưỡng 20 ký tự là điểm chính của luật', () => {
    const short = { 'z.list': { items: ['a', 'b', 'c'], intentionalThree: '2026-09-10: ngan' } };
    expect(scanThree(short, {}).map((v) => v.kind)).toContain('bad-intentional-three');
  });

  it('miễn trừ không còn khớp gì phải ĐỎ, nếu không bảng ngoại lệ chỉ lớn lên', () => {
    const surface = { 'x.a': '1', 'x.b': '2' };
    const stale = { x: '2026-09-10: ly do cu con dai hon hai muoi ky tu nhung da het hieu luc' };
    expect(scanThree(surface, stale).map((v) => v.kind)).toContain('stale-intentional-three');
  });

  /**
   * Nửa còn lại của vế chống-ôi, và nó từng MÙ.
   *
   * Bảng miễn trừ viết tiền tố có dấu chấm (`x.verdict`) trong khi khoá thật
   * đặt PHẲNG bằng gạch nối (`x.verdict-ac`). Phép kiểm cũ hỏi
   * `startsWith(prefix + '.')`, tức bắt buộc một dấu chấm, nên nó không thấy
   * hậu duệ nào và im lặng bỏ qua. Hậu quả đo được ở 18.C: dòng
   * `catalog.problem.verdict` nằm trong `catalogIntentionalThree` mà không
   * miễn trừ nhóm nào, cũng không bị báo là ôi.
   *
   * Surface ở đây cố ý chỉ có HAI khoá: ba khoá thì nhóm `x` cũng thành nhóm
   * ba và đẻ thêm một vi phạm `three-siblings`, làm mờ đúng thứ đang đo.
   */
  it('miễn trừ trỏ vào nhóm đặt tên PHẲNG cũng phải ĐỎ, không chỉ tên có dấu chấm', () => {
    const surface = { 'x.verdict-ac': 'AC', 'x.verdict-wa': 'WA' };
    const stale = {
      'x.verdict': '2026-09-15: ly do con dai hon hai muoi ky tu nhung nhom da doi ten',
    };
    const found = scanThree(surface, stale);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('stale-intentional-three');
    expect(found[0]?.key).toBe('x.verdict');
  });
});

describe('đối chứng · groupBySiblingPrefix', () => {
  it('gom theo tiền tố bỏ phân đoạn cuối', () => {
    const groups = groupBySiblingPrefix(['a.b.c', 'a.b.d', 'a.e', 'f']);
    expect(groups.get('a.b')).toEqual(['c', 'd']);
    expect(groups.get('a')).toEqual(['e']);
    expect(groups.has('f')).toBe(false);
  });
});

describe('đối chứng · scanLatinLiteral', () => {
  it('bắt JSX text có dấu tiếng Việt', () => {
    const found = scanLatinLiteral('<p>Xin chào</p>');
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('jsx-text');
  });

  it('bắt literal chuỗi có dấu tiếng Việt', () => {
    expect(scanLatinLiteral("const a = 'Xin chào';")).toHaveLength(1);
  });

  it('đối chứng âm: gọi qua bản đồ thì sạch', () => {
    expect(scanLatinLiteral("<p>{t('auth.hello')}</p>")).toEqual([]);
  });

  it('đối chứng âm: U+00D7 và U+00F7 nằm trong dải nhưng không phải chữ', () => {
    expect(scanLatinLiteral('<p>× 3</p>')).toEqual([]);
    expect(scanLatinLiteral('<p>6 ÷ 2</p>')).toEqual([]);
  });

  /**
   * Chú thích tiếng Việt trong mã của lane là HỢP LỆ. Một cổng bắt chúng thì
   * không lane nào dùng được, nên bước bóc chú thích là một phần của hợp đồng
   * chứ không phải một tối ưu.
   */
  it('đối chứng âm: chú thích tiếng Việt không bị tính', () => {
    expect(scanLatinLiteral('// Đây là chú thích tiếng Việt\nconst a = 1;')).toEqual([]);
    expect(scanLatinLiteral('/* Khối chú thích có dấu */\nconst a = 1;')).toEqual([]);
  });
});

describe('đối chứng · scanNfc', () => {
  /**
   * Hai dòng `toHaveLength` KHÔNG thừa: chúng chốt rằng đầu vào đúng là hai dạng
   * khác nhau, chứ không phải cùng một chuỗi đã bị chuẩn hoá về một dạng trước
   * khi test chạy. Một số công cụ chỉnh sửa tự chuẩn hoá khi lưu file, nên đối
   * chứng này bắt buộc phải dựng bằng mã.
   */
  const NFC = String.fromCharCode(0x1ebf);
  const NFD = String.fromCharCode(0x65, 0x0302, 0x0301);

  it('phân biệt hai dạng trông giống hệt nhau trên màn hình', () => {
    expect(NFC).toHaveLength(1);
    expect(NFD).toHaveLength(3);
    expect(scanNfc({ 'x.y': NFD })).toHaveLength(1);
    expect(scanNfc({ 'x.y': NFC })).toEqual([]);
  });
});

describe('đối chứng · scanBlocked', () => {
  it('mỗi luật trong bốn luật phải đỏ được riêng', () => {
    expect(scanBlocked('Xin chào các bạn').map((v) => v.rule)).toContain('V1');
    expect(scanBlocked('Chào mừng bạn tới nền tảng').map((v) => v.rule)).toContain('V2');
    expect(scanBlocked('Công cụ này rất mạnh mẽ').map((v) => v.rule)).toContain('V7');
    expect(scanBlocked('Bạn đã xong bài. Chúc bạn học tốt.').map((v) => v.rule)).toContain('V8');
  });

  it('đối chứng âm: câu mang thông tin thì sạch', () => {
    expect(scanBlocked('Còn 3 chỗ trong lab này.')).toEqual([]);
  });

  it('V2 chỉ bắt ở ĐẦU, không bắt giữa câu', () => {
    expect(scanBlocked('Trang này hiện lời chào mừng sau khi đăng nhập.')).toEqual([]);
  });
});

describe('đối chứng · renderEntry', () => {
  it('dựng đủ sáu dạng mục', () => {
    expect(renderEntry('tĩnh')).toEqual(['tĩnh']);
    expect(renderEntry((p: { n: number }) => `có ${p.n}`)).toEqual(['có 7']);
    expect(renderEntry({ what: 'Hỏng.', next: 'Làm lại.' })).toEqual(['Hỏng. Làm lại.']);
    expect(renderEntry(() => ({ what: 'Hỏng.', next: 'Làm lại.' }))).toEqual(['Hỏng. Làm lại.']);
    expect(renderEntry({ items: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  it('Counted dựng cả bốn nhánh, kể cả many(2) và many(11)', () => {
    const counted = { zero: 'Hết chỗ.', one: 'Còn 1 chỗ.', many: (n: number) => `Còn ${n} chỗ.` };
    expect(renderEntry(counted)).toEqual(['Hết chỗ.', 'Còn 1 chỗ.', 'Còn 2 chỗ.', 'Còn 11 chỗ.']);
  });

  it('mục không dựng được trả về null, KHÔNG trả về rỗng', () => {
    expect(renderEntry({ foo: 1 })).toBeNull();
    expect(renderEntry(42)).toBeNull();
  });
});

describe('đối chứng · renderMessages', () => {
  it('gom giá trị theo khoá và báo ra khoá không dựng được', () => {
    const result = renderMessages({ 'a.b': 'x', 'a.c': { foo: 1 } });
    expect(result.values).toEqual([{ key: 'a.b', value: 'x' }]);
    expect(result.failures).toEqual(['a.c']);
  });

  it('danh sách failures phải KHÁC RỖNG được, nếu không cổng T0 dựa vào nó là vô nghĩa', () => {
    expect(renderMessages({ 'a.c': Symbol('x') }).failures).toHaveLength(1);
  });
});

describe('số bộ dò bằng số nhóm đối chứng', () => {
  it('mọi hàm export từ scan.ts đều có đối chứng, và ngược lại', () => {
    const exported = Object.entries(scanModule)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name)
      .sort();
    expect(exported).toEqual([...CONTROLLED_DETECTORS].sort());
  });
});
