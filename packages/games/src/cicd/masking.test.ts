/**
 * Ghim bộ che bí mật (19.B.9) — và ghim nó **che ĐÚNG như một bộ che thật**,
 * tức là KHÔNG thông minh hơn.
 *
 * Phần lớn test ở đây không đo "có thay được chuỗi không". Chúng đo bốn thứ mà
 * một hiện thực sai vẫn qua được test ngây thơ:
 *
 *   1. Bốn phép biến đổi khớp giá trị TÍNH TAY, không khớp một hàm có sẵn. Hàm
 *      mã hoá URL của JS giữ `! * ' ( )`; RFC 3986 thì không. Một hiện thực gọi
 *      nhầm hàm đó xanh trên mọi chuỗi chữ-số và đỏ đúng ở năm ký tự đó.
 *   2. Chỗ rò CÓ THẬT vẫn được báo: base64 lọt khi chỉ đăng ký dạng thô; in theo
 *      mảnh lọt dù đăng ký gì đi nữa. Một bộ dò luôn báo sạch sẽ qua mọi test
 *      "che xong thì không rò" — nên mỗi ca sạch ở đây có một ca bẩn đi kèm.
 *   3. Thứ tự che (M2) và thứ tự bản ghi (M3) không phụ thuộc thứ tự mảng khai.
 *   4. Dữ liệu level sai là lỗi CỨNG, không phải một dòng trống lặng lẽ.
 */
import { describe, expect, it } from 'vitest';

import type { LogLineTemplate, MaskingPolicy, MaskingScenario, SecretForm, SecretSpec } from './cd-contract.ts';
import { leakCount, leakedSecrets, renderMaskedLog, transformSecret } from './masking.ts';

function scenario(secrets: readonly SecretSpec[], lines: readonly (string | LogLineTemplate)[]): MaskingScenario {
  return { secrets, lines: lines.map((line) => (typeof line === 'string' ? { text: line } : line)) };
}

function policy(...masked: readonly (readonly [string, SecretForm])[]): MaskingPolicy {
  return { masked: masked.map(([secret, form]) => ({ secret, form })) };
}

const NO_MASK = policy();

/** Có dấu `:` để dạng url KHÁC dạng thô — nếu không, mỗi chỗ lộ thô thành hai mục rò. */
const API: SecretSpec = { id: 'api', value: 's3cr3t:Key_42' };
const WEB: SecretSpec = { id: 'web', value: 'p@ss w/rd' };

describe('transformSecret — bốn dạng, đối chiếu giá trị tính tay', () => {
  it('raw giữ nguyên', () => {
    expect(transformSecret('s3cr3t-Key_42', 'raw')).toBe('s3cr3t-Key_42');
  });

  it('base64 không đệm, đệm một, đệm hai', () => {
    // "abc" = 0x61 0x62 0x63 = 011000 010110 001001 100011 = Y W J j.
    // "d" còn lẻ = 0x64 = 011001 00(0000) = Z A, thiếu hai byte ⇒ "==".
    expect(transformSecret('abcdef', 'base64')).toBe('YWJjZGVm');
    expect(transformSecret('abcde', 'base64')).toBe('YWJjZGU=');
    expect(transformSecret('abcd', 'base64')).toBe('YWJjZA==');
  });

  it('base64 dùng đúng hai ký tự cuối bảng chữ chuẩn: + và /', () => {
    // "???" = 0x3F ×3 = 001111 110011 111100 111111 = P z 8 /.
    // "?>>" = 0x3F 0x3E 0x3E = 001111 110011 111000 111110 = P z 4 +.
    // Bảng chữ "an toàn cho URL" (- và _) sẽ đỏ ở đúng hai ca này.
    expect(transformSecret('????', 'base64')).toBe('Pz8/Pw==');
    expect(transformSecret('?>>?>>', 'base64')).toBe('Pz4+Pz4+');
    expect(transformSecret('s3cr3t-Key_42', 'base64')).toBe('czNjcjN0LUtleV80Mg==');
  });

  it('url mã hoá phần trăm, hex viết HOA', () => {
    // @ = 0x40, dấu cách = 0x20, / = 0x2F. Chữ F hoa là thứ được ghim.
    expect(transformSecret('p@ss w/rd', 'url')).toBe('p%40ss%20w%2Frd');
    expect(transformSecret('a:b;c', 'url')).toBe('a%3Ab%3Bc');
  });

  it('url giữ nguyên đúng bốn dấu unreserved -._~ cùng chữ và số', () => {
    expect(transformSecret('k~e.y-v_1', 'url')).toBe('k~e.y-v_1');
  });

  it('url mã hoá cả năm ký tự mà hàm có sẵn của JS bỏ qua: ! * \' ( )', () => {
    expect(transformSecret("a*b(c)!d'", 'url')).toBe('a%2Ab%28c%29%21d%27');
  });

  it('reversed đảo từng ký tự', () => {
    expect(transformSecret('s3cr3t-Key_42', 'reversed')).toBe('24_yeK-t3rc3s');
  });

  it('từ chối ký tự ngoài ASCII in được, ở mọi dạng', () => {
    for (const form of ['raw', 'base64', 'url', 'reversed'] as const) {
      expect(() => transformSecret(`abc${String.fromCharCode(0xe9)}`, form)).toThrow(/ASCII in được/);
      expect(() => transformSecret('ab\tcd', form)).toThrow(/ASCII in được/);
      expect(() => transformSecret(`abc${String.fromCharCode(0x7f)}`, form)).toThrow(/ASCII in được/);
    }
  });

  it('đối chứng: hai biên 0x20 (dấu cách) và 0x7E (~) được nhận', () => {
    expect(transformSecret(' ~ok', 'url')).toBe('%20~ok');
  });

  it('từ chối dạng lạ đến từ dữ liệu không qua kiểu', () => {
    expect(() => transformSecret('abcd', 'hex' as SecretForm)).toThrow(/SECRET_FORMS/);
  });
});

describe('renderMaskedLog — dựng log (M1)', () => {
  it('thay {{id}} bằng dạng thô và {{id|form}} bằng dạng đã biến đổi', () => {
    /*
     * Nhãn `raw=` / `b64=` và dấu `;` ngăn cách là CÓ CHỦ Ý. Bản đầu viết
     * `key=… basic=…`, và gitleaks (`generic-api-key`) bắt dòng mong đợi vì thấy
     * chữ `Key` ngay trước `basic=<chuỗi base64>` — một fixture giả làm cổng quét
     * bí mật của PR đỏ. Dấu `;` cắt mẫu từ-khoá-rồi-gán của rule, nên dòng không
     * còn giống khai báo khoá, mà phép thử vẫn đo đúng hai dạng.
     */
    const record = renderMaskedLog(
      NO_MASK,
      scenario([API, WEB], ['raw={{api}}; b64={{api|base64}}', 'q={{web|url}} r={{web|reversed}}']),
    );
    expect(record.lines).toEqual([
      'raw=s3cr3t:Key_42; b64=czNjcjN0OktleV80Mg==',
      'q=p%40ss%20w%2Frd r=dr/w ss@p',
    ]);
  });

  it('bí mật không tồn tại là lỗi cứng', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['x={{nope}}']))).toThrow(/"nope" không có/);
  });

  it('dạng không tồn tại là lỗi cứng', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['x={{api|hex}}']))).toThrow(/"hex"/);
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['x={{api|}}']))).toThrow(/SECRET_FORMS/);
  });

  it('chỗ chèn có hai dấu | là lỗi cứng, không lặng lẽ lấy phần đầu', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['x={{api|raw|url}}']))).toThrow(/dấu \|/);
  });

  it('khoảng trắng trong chỗ chèn không được lặng lẽ để thành chữ', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['x={{ api }}']))).toThrow(/" api " không có/);
  });

  it('giá trị đã chèn không bị quét lại như một mẫu', () => {
    const tricky: SecretSpec = { id: 'tricky', value: '{{api}}' };
    const record = renderMaskedLog(NO_MASK, scenario([API, tricky], ['v={{tricky}}']));
    expect(record.lines).toEqual(['v={{api}}']);
  });

  it('dòng không có chỗ chèn giữ nguyên, kể cả ngoặc nhọn lẻ', () => {
    const record = renderMaskedLog(NO_MASK, scenario([API], ['echo {{ lẻ', 'done }}']));
    expect(record.lines).toEqual(['echo {{ lẻ', 'done }}']);
  });

  it('id bí mật trùng là lỗi cứng', () => {
    const twin: SecretSpec = { id: 'api', value: 'other-value' };
    expect(() => renderMaskedLog(NO_MASK, scenario([API, twin], ['x']))).toThrow(/khai trùng/);
  });

  it('bí mật ngắn hơn 4 ký tự là lỗi cứng — kể cả khi không mẫu nào nhắc tới', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([{ id: 'tiny', value: 'abc' }], ['x']))).toThrow(/ngắn hơn 4/);
  });

  it('đối chứng: đúng 4 ký tự được nhận', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([{ id: 'four', value: 'abcd' }], ['x']))).not.toThrow();
  });

  it('bí mật ngoài ASCII in được là lỗi cứng ở tầng kịch bản', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([{ id: 'vi', value: 'mật-khẩu' }], ['x']))).toThrow(
      /"vi".*ASCII in được/,
    );
  });

  it('mục che trỏ vào bí mật hay dạng không tồn tại là lỗi cứng', () => {
    expect(() => renderMaskedLog(policy(['nope', 'raw']), scenario([API], ['x']))).toThrow(/"nope" không có/);
    expect(() => renderMaskedLog(policy(['api', 'hex' as SecretForm]), scenario([API], ['x']))).toThrow(
      /SECRET_FORMS/,
    );
  });

  it('mẫu chứa ký tự xuống dòng là lỗi cứng — nó sẽ làm mù phép dò rò qua dòng', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['a\nb']))).toThrow(/xuống dòng/);
    expect(() => renderMaskedLog(NO_MASK, scenario([API], ['a\rb']))).toThrow(/xuống dòng/);
  });
});

describe('renderMaskedLog — split', () => {
  const K: SecretSpec = { id: 'k', value: 'abcde' };

  it('bố cục: chữ dẫn + nửa đầu ceil(len/2) | nửa sau + chữ đuôi, trên một dòng MỚI', () => {
    const record = renderMaskedLog(
      NO_MASK,
      scenario([K], ['start', { text: 'export K={{k}};', split: true }, 'after']),
    );
    // Độ dài 5 ⇒ nửa đầu 3 ký tự (ceil), nửa sau 2. Dòng "after" dời xuống chỉ số 3.
    expect(record.lines).toEqual(['start', 'export K=abc', 'de;', 'after']);
  });

  it('ghép hai mảnh lại (không ký tự nối) ra đúng dòng như khi không tách', () => {
    const whole = renderMaskedLog(NO_MASK, scenario([API], ['T={{api|base64}} end']));
    const pieces = renderMaskedLog(NO_MASK, scenario([API], [{ text: 'T={{api|base64}} end', split: true }]));
    expect(pieces.lines).toHaveLength(2);
    expect(pieces.lines.join('')).toBe(whole.lines[0]);
    // base64 dài 20 ⇒ cắt đúng giữa.
    expect(pieces.lines).toEqual(['T=czNjcjN0Ok', 'tleV80Mg== end']);
  });

  it('split với hai chỗ chèn là lỗi cứng', () => {
    expect(() =>
      renderMaskedLog(NO_MASK, scenario([API, K], [{ text: '{{api}} {{k}}', split: true }])),
    ).toThrow(/có 2 chỗ chèn/);
  });

  it('split không có chỗ chèn nào là lỗi cứng', () => {
    expect(() => renderMaskedLog(NO_MASK, scenario([API], [{ text: 'plain', split: true }]))).toThrow(
      /có 0 chỗ chèn/,
    );
  });
});

describe('renderMaskedLog — che và rò (M2–M4)', () => {
  it('đăng ký dạng thô ⇒ dòng thô sạch và hiện ***', () => {
    const record = renderMaskedLog(policy(['api', 'raw']), scenario([API], ['key={{api}}']));
    expect(record.lines).toEqual(['key=***']);
    expect(record.leaks).toEqual([]);
  });

  it('đối chứng: không đăng ký gì thì chính dòng đó rò', () => {
    const record = renderMaskedLog(NO_MASK, scenario([API], ['key={{api}}']));
    expect(record.leaks).toEqual([{ line: 0, secret: 'api', form: 'raw', acrossLines: false }]);
  });

  it('BÀI HỌC THẬT: chỉ che dạng thô thì base64 của nó vẫn lọt nguyên vẹn', () => {
    const lines = ['key={{api}}', 'Authorization: Basic {{api|base64}}'];
    const rawOnly = renderMaskedLog(policy(['api', 'raw']), scenario([API], lines));
    expect(rawOnly.lines).toEqual(['key=***', 'Authorization: Basic czNjcjN0OktleV80Mg==']);
    expect(rawOnly.leaks).toEqual([{ line: 1, secret: 'api', form: 'base64', acrossLines: false }]);

    const both = renderMaskedLog(policy(['api', 'raw'], ['api', 'base64']), scenario([API], lines));
    expect(both.lines).toEqual(['key=***', 'Authorization: Basic ***']);
    expect(both.leaks).toEqual([]);
  });

  it('in theo mảnh ⇒ rò qua dòng ở dòng i, và che nguyên giá trị KHÔNG cứu được', () => {
    const lines = ['begin', { text: 'key={{api}}', split: true }, 'end'];
    const expectedLines = ['begin', 'key=s3cr3t:', 'Key_42', 'end'];
    const expectedLeak = { line: 1, secret: 'api', form: 'raw', acrossLines: true };

    const bare = renderMaskedLog(NO_MASK, scenario([API], lines));
    expect(bare.lines).toEqual(expectedLines);
    expect(bare.leaks).toEqual([expectedLeak]);

    // Đăng ký đủ bốn dạng: bộ che chỉ thấy từng dòng nguyên vẹn, không mảnh nào khớp.
    const everything = renderMaskedLog(
      policy(['api', 'raw'], ['api', 'base64'], ['api', 'url'], ['api', 'reversed']),
      scenario([API], lines),
    );
    expect(everything.lines).toEqual(expectedLines);
    expect(everything.leaks).toEqual([expectedLeak]);
  });

  it('rò qua dòng áp cho MỌI cặp dòng kề, không chỉ dòng split', () => {
    const record = renderMaskedLog(NO_MASK, scenario([API], ['part one s3cr3t', ':Key_42 part two']));
    expect(record.leaks).toEqual([{ line: 0, secret: 'api', form: 'raw', acrossLines: true }]);
  });

  it('dòng đã chứa trọn chuỗi thì dòng trước nó KHÔNG bị báo rò qua dòng', () => {
    // "prefix s3cr3ts3cr3t:Key_42" ghép với dòng trước vẫn chứa chuỗi, nhưng dòng 1 chứa riêng
    // ⇒ theo M3 chỉ có một mục, ở dòng 1, không phải qua dòng.
    const record = renderMaskedLog(NO_MASK, scenario([API], ['prefix s3cr3t', 's3cr3t:Key_42']));
    expect(record.leaks).toEqual([{ line: 1, secret: 'api', form: 'raw', acrossLines: false }]);
  });

  it('M2: giá trị này là chuỗi con của giá trị kia ⇒ cái dài bị che trọn', () => {
    const short: SecretSpec = { id: 'short', value: 'pass' };
    const long: SecretSpec = { id: 'long', value: 'password1' };
    const lines = ['login {{long}} then {{short}}'];
    const shortFirstInArray = renderMaskedLog(policy(['short', 'raw'], ['long', 'raw']), scenario([short, long], lines));
    const longFirstInArray = renderMaskedLog(policy(['long', 'raw'], ['short', 'raw']), scenario([short, long], lines));
    // Che "pass" trước sẽ để lại "***word1" — một đuôi lộ ra.
    expect(shortFirstInArray.lines).toEqual(['login *** then ***']);
    expect(longFirstInArray).toEqual(shortFirstInArray);
  });

  it('M2: dài bằng nhau thì id bí mật nhỏ hơn (mã đơn vị) che trước', () => {
    // "abcd" và "dcba" chồng nhau trong "abcdcba": ai che trước thì người kia mất chỗ khớp.
    const line = ['abcdcba'];
    const xIsForward = renderMaskedLog(
      policy(['y', 'raw'], ['x', 'raw']),
      scenario([{ id: 'x', value: 'abcd' }, { id: 'y', value: 'dcba' }], line),
    );
    expect(xIsForward.lines).toEqual(['***cba']);

    const xIsBackward = renderMaskedLog(
      policy(['y', 'raw'], ['x', 'raw']),
      scenario([{ id: 'x', value: 'dcba' }, { id: 'y', value: 'abcd' }], line),
    );
    expect(xIsBackward.lines).toEqual(['abc***']);
  });

  it('M2: cùng bí mật, dài bằng nhau ⇒ dạng so theo mã đơn vị: reversed trước url', () => {
    // "abcd" không có ký tự nào phải mã hoá nên url = "abcd", reversed = "dcba", cùng dài 4.
    // Thứ tự khai trong SECRET_FORMS (url trước reversed) sẽ cho "***cba" — test này đỏ.
    const record = renderMaskedLog(
      policy(['s', 'url'], ['s', 'reversed']),
      scenario([{ id: 's', value: 'abcd' }], ['abcdcba']),
    );
    expect(record.lines).toEqual(['abc***']);
  });

  it('một chỗ lộ, hai dạng trùng chuỗi ⇒ hai mục rò; che một dạng là hết cả hai', () => {
    const plain: SecretSpec = { id: 'plain', value: 'hunter2-pass' };
    const bare = renderMaskedLog(NO_MASK, scenario([plain], ['pw={{plain}}']));
    expect(bare.leaks).toEqual([
      { line: 0, secret: 'plain', form: 'raw', acrossLines: false },
      { line: 0, secret: 'plain', form: 'url', acrossLines: false },
    ]);
    expect(renderMaskedLog(policy(['plain', 'url']), scenario([plain], ['pw={{plain}}'])).leaks).toEqual([]);
  });

  it('M4: gần đúng không phải khớp — không che, không báo rò', () => {
    const record = renderMaskedLog(
      policy(['api', 'raw']),
      scenario([API], ['cut s3cr3t:Key_4 end', 'case S3CR3T:KEY_42 end']),
    );
    expect(record.lines).toEqual(['cut s3cr3t:Key_4 end', 'case S3CR3T:KEY_42 end']);
    expect(record.leaks).toEqual([]);
  });

  it('M3: bản ghi sắp theo (line, secret, form), không theo thứ tự khai', () => {
    const zeta: SecretSpec = { id: 'zeta', value: 'zz-top-42' };
    const alpha: SecretSpec = { id: 'alpha', value: 'p@ss w/rd' };
    const record = renderMaskedLog(
      NO_MASK,
      scenario([zeta, alpha], ['a={{zeta}} b={{alpha|url}}', '{{alpha|base64}}', 'nothing here', '{{zeta|reversed}}']),
    );
    expect(record.leaks).toEqual([
      { line: 0, secret: 'alpha', form: 'url', acrossLines: false },
      { line: 0, secret: 'zeta', form: 'raw', acrossLines: false },
      { line: 0, secret: 'zeta', form: 'url', acrossLines: false },
      { line: 1, secret: 'alpha', form: 'base64', acrossLines: false },
      { line: 3, secret: 'zeta', form: 'reversed', acrossLines: false },
    ]);
  });

  it('đối chứng dương: log không nhắc bí mật nào ⇒ không mục rò nào', () => {
    const record = renderMaskedLog(NO_MASK, scenario([API, WEB], ['build ok', 'test ok', 'deploy ok']));
    expect(record.lines).toEqual(['build ok', 'test ok', 'deploy ok']);
    expect(record.leaks).toEqual([]);
    expect(leakCount(record)).toBe(0);
  });
});

describe('renderMaskedLog — tất định', () => {
  const lines = [
    'key={{api}} q={{web|url}}',
    { text: 'chunk={{web|base64}}', split: true },
    'basic {{api|base64}} rev {{web|reversed}}',
  ];
  const masks: readonly (readonly [string, SecretForm])[] = [
    ['web', 'url'],
    ['api', 'raw'],
    ['web', 'reversed'],
  ];

  it('chạy lại cho ra cùng bản ghi', () => {
    const a = renderMaskedLog(policy(...masks), scenario([API, WEB], lines));
    const b = renderMaskedLog(policy(...masks), scenario([API, WEB], lines));
    expect(b).toEqual(a);
  });

  it('hoán vị bí mật và mục che không đổi bản ghi', () => {
    const base = renderMaskedLog(policy(...masks), scenario([API, WEB], lines));
    const permuted = renderMaskedLog(policy(...[...masks].reverse()), scenario([WEB, API], lines));
    expect(permuted).toEqual(base);
    // Và bản ghi này không rỗng — hoán vị một bản ghi rỗng thì bằng nhau chẳng chứng minh gì.
    expect(base.leaks.length).toBeGreaterThan(0);
  });
});

describe('phép chiếu', () => {
  it('leakCount đếm từng mục (dòng, bí mật, dạng)', () => {
    const record = renderMaskedLog(
      NO_MASK,
      scenario([API, WEB], ['{{api}}', '{{api|base64}}', '{{web|reversed}}']),
    );
    expect(record.leaks).toHaveLength(3);
    expect(leakCount(record)).toBe(3);
  });

  it('leakedSecrets không lặp và sắp theo mã đơn vị', () => {
    const record = renderMaskedLog(
      NO_MASK,
      scenario([WEB, API], ['{{web|reversed}}', '{{api}}', '{{web|base64}}', '{{api|base64}}']),
    );
    expect(leakedSecrets(record)).toEqual(['api', 'web']);
  });

  it('leakedSecrets rỗng khi sạch, và bỏ bí mật đã che hết', () => {
    const record = renderMaskedLog(policy(['api', 'raw']), scenario([API, WEB], ['{{api}}', '{{web|url}}']));
    expect(leakedSecrets(record)).toEqual(['web']);
    expect(leakedSecrets({ lines: [], leaks: [] })).toEqual([]);
  });
});
