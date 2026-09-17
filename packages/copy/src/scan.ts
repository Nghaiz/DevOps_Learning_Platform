/**
 * Bộ dò thuần. Không đọc đĩa, không đọc mạng, không giữ trạng thái.
 *
 * Mọi hàm ở đây có một đối chứng DƯƠNG riêng trong `scan.control.test.ts`, và
 * số bộ dò phải bằng số nhóm đối chứng. Tách hai file chính là để đếm được điều
 * đó: một bộ dò chưa từng được nhìn thấy đỏ là một bộ dò chưa được chứng minh.
 *
 * `scanStripped` được export ra ngoài gói (subpath `@devops-platform/copy/scan`)
 * vì `scripts/seed-content.mjs` phải gọi nó trên TỪNG CHUỖI trước khi ghi hàng
 * vào Postgres, và từ chối ghi nếu có vi phạm. Lý do ở §5.3 của hợp đồng: cổng
 * mất dấu đọc FILE, còn người học đọc HÀNG TRONG DB. File sạch trong khi hàng
 * vẫn lột dấu là một cổng xanh trong khi lỗi vẫn hiển thị.
 *
 * ⛔ Ba ký tự bị cấm không bao giờ gõ thẳng trong file này. Chúng viết bằng
 * escape Unicode, nên bộ quét không phải loại trừ chính `scan.ts` ra khỏi phạm
 * vi. Dấu chấm giữa (U+00B7) cũng vậy: gõ thẳng `'\u00b7'` ở đây thì luật khoảng
 * trắng của chính hàm này sẽ bắt chuỗi literal đó.
 */

import { STRONG_WORDS, WEAK_WORDS } from './diacritic-words.ts';

// ───────────────────────────────────────────────────────────────────────────
// T1 · gạch ngang dài, và khoảng trắng quanh dấu chấm giữa
// ───────────────────────────────────────────────────────────────────────────

/**
 * Bốn ký tự viết bằng escape Unicode chứ không gõ thẳng, và đó là điểm chính
 * chứ không phải một sở thích: gõ thẳng thì `scan.ts` phải nằm trong danh sách
 * loại trừ của chính bộ quét mà nó phục vụ, và một danh sách loại trừ là chỗ mà
 * thứ cần chặn đi qua.
 *
 * `MIDDOT` cũng vậy, vì một lý do khác: viết thẳng nó giữa hai dấu nháy thì hai
 * bên nó là dấu nháy chứ không phải dấu cách, nên luật khoảng trắng của chính
 * `scanDashes` sẽ bắt đúng dòng khai báo này.
 */
export const EM_DASH = '\u2014';
export const EN_DASH = '\u2013';
export const HORIZONTAL_BAR = '\u2015';
export const MIDDOT = '\u00b7';

export type DashKind = 'em-dash' | 'en-dash' | 'horizontal-bar' | 'middot-spacing';

export interface DashViolation {
  readonly index: number;
  readonly codePoint: number;
  readonly kind: DashKind;
}

const BANNED_DASHES: ReadonlyMap<string, DashKind> = new Map([
  [EM_DASH, 'em-dash'],
  [EN_DASH, 'en-dash'],
  [HORIZONTAL_BAR, 'horizontal-bar'],
]);

/**
 * Quét TOÀN BỘ chuỗi, kể cả phần trông như chú thích.
 *
 * Bỏ chú thích ra ngoài phạm vi thì cần một bộ phân tích, mà một bộ phân tích
 * viết bằng regex thì sai trên chuỗi chứa hai dấu chéo, còn một bộ phân tích
 * viết đúng thì đắt hơn giá trị nó mang lại ở đây.
 *
 * Luật thứ hai: dấu chấm giữa phải có ĐÚNG một dấu cách hai bên. `Trung cấp` +
 * dấu chấm giữa + `25 phút` đạt; không có dấu cách thì nó đọc như một toán tử,
 * và hai dấu cách thì nó đọc như một lỗi căn lề.
 */
export function scanDashes(text: string): readonly DashViolation[] {
  const out: DashViolation[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    const kind = BANNED_DASHES.get(ch);
    if (kind !== undefined) {
      out.push({ index: i, codePoint: ch.codePointAt(0) ?? 0, kind });
      continue;
    }
    if (ch === MIDDOT && !hasExactlyOneSpaceAround(text, i)) {
      out.push({ index: i, codePoint: 0x00b7, kind: 'middot-spacing' });
    }
  }
  return out;
}

function hasExactlyOneSpaceAround(text: string, i: number): boolean {
  return (
    text[i - 1] === ' ' && text[i + 1] === ' ' && text[i - 2] !== ' ' && text[i + 2] !== ' '
  );
}

// ───────────────────────────────────────────────────────────────────────────
// T2 · tiếng Việt bị lột dấu
// ───────────────────────────────────────────────────────────────────────────

export interface StrippedResult {
  readonly flagged: boolean;
  readonly matched: readonly string[];
  readonly strong: readonly string[];
  readonly weak: readonly string[];
}

const STRONG_SET: ReadonlySet<string> = new Set(STRONG_WORDS);
const WEAK_SET: ReadonlySet<string> = new Set(WEAK_WORDS);

/** Ngưỡng WEAK. Xem `diacritic-words.ts` về việc vì sao là 4 chứ không phải 3. */
export const WEAK_THRESHOLD = 4;

/**
 * Bóc phần không phải văn xuôi, rồi đối chiếu token với hai danh sách từ.
 *
 * Thứ tự các bước bóc KHÔNG hoán vị được: token viết HOA toàn bộ phải bị bóc
 * TRƯỚC khi hạ chữ thường, nếu không thì `PID` thành `pid` và mất luôn dấu hiệu
 * duy nhất cho biết nó là một định danh chứ không phải một từ.
 */
export function scanStripped(value: string): StrippedResult {
  const prose = value
    .replace(/`[^`]*`/g, ' ')
    .replace(/<code[^>]*>[\s\S]*?<\/code>/gi, ' ')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/[\w.~-]*\/[\w./~-]+/g, ' ')
    .replace(/\b[A-Z][A-Z0-9_]+\b/g, ' ')
    // Phân đoạn kebab nhận cả CHỮ SỐ, không chỉ chữ cái. Khớp hẹp hơn thì khoá
    // `quyen-600` trong content/quizzes lọt qua bước bóc và bị gắn cờ vì token
    // `quyen`, tức một định danh bị đọc thành văn xuôi. Đo được, một hit.
    .replace(/\b[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+\b/g, ' ')
    .replace(/\b[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+\b/g, ' ');

  const strong: string[] = [];
  const weak: string[] = [];
  for (const token of prose.match(/\p{L}+/gu) ?? []) {
    const word = token.toLowerCase();
    if (STRONG_SET.has(word)) {
      strong.push(word);
    } else if (WEAK_SET.has(word)) {
      weak.push(word);
    }
  }

  return {
    flagged: strong.length >= 1 || weak.length >= WEAK_THRESHOLD,
    matched: [...strong, ...weak],
    strong,
    weak,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// T3 · đúng ba
// ───────────────────────────────────────────────────────────────────────────

export type ThreeKind =
  | 'list-of-three'
  | 'three-bullets'
  | 'three-siblings'
  | 'bad-intentional-three'
  | 'stale-intentional-three';

export interface ThreeViolation {
  readonly key: string;
  readonly kind: ThreeKind;
  readonly detail: string;
}

/** `YYYY-MM-DD: lý do`, phần lý do tối thiểu 20 ký tự. */
export const INTENTIONAL_THREE_FORMAT = /^\d{4}-\d{2}-\d{2}: .{20,}/;

/**
 * Bắt BA hình dạng, và hình dạng thứ ba mới là hình dạng thật.
 *
 * `value-props.tsx:6` tự khai `ba luận điểm` và `getting-started.tsx:4` tự khai
 * `ba bước`, không cái nào là một mảng. Một test chỉ bắt mảng sẽ xanh trên đúng
 * trang chủ mà thiết kế gọi là hình dạng landing page mà mô hình nào cũng đẻ ra.
 */
export function scanThree(
  surface: Readonly<Record<string, unknown>>,
  intentionalThree: Readonly<Record<string, string>>,
): readonly ThreeViolation[] {
  const out: ThreeViolation[] = [];
  const usedExemptions = new Set<string>();

  for (const [key, value] of Object.entries(surface)) {
    if (isListEntry(value)) {
      const declared = value.intentionalThree;
      if (declared !== undefined && !INTENTIONAL_THREE_FORMAT.test(declared)) {
        out.push({
          key,
          kind: 'bad-intentional-three',
          detail: `intentionalThree phải khớp YYYY-MM-DD: <lý do dài ít nhất 20 ký tự>, nhận được ${JSON.stringify(declared)}`,
        });
      }
      if (value.items.length === 3 && declared === undefined) {
        out.push({
          key,
          kind: 'list-of-three',
          detail: 'danh sách đúng 3 phần tử mà không khai intentionalThree',
        });
      }
    }

    if (typeof value === 'string' && countBulletLines(value) === 3) {
      out.push({
        key,
        kind: 'three-bullets',
        detail: 'chuỗi chứa đúng 3 dòng gạch đầu dòng',
      });
    }
  }

  for (const [prefix, members] of groupBySiblingPrefix(Object.keys(surface))) {
    if (members.length !== 3) {
      continue;
    }
    const reason = intentionalThree[prefix];
    if (reason === undefined) {
      out.push({
        key: prefix,
        kind: 'three-siblings',
        detail: `đúng 3 khoá anh em (${members.join(', ')}) mà không khai trong intentionalThree`,
      });
      continue;
    }
    usedExemptions.add(prefix);
    if (!INTENTIONAL_THREE_FORMAT.test(reason)) {
      out.push({
        key: prefix,
        kind: 'bad-intentional-three',
        detail: `intentionalThree phải khớp YYYY-MM-DD: <lý do dài ít nhất 20 ký tự>, nhận được ${JSON.stringify(reason)}`,
      });
    }
  }

  // Vế thứ hai của cổng: một miễn trừ không còn khớp gì là một dòng không ai dám
  // dọn. Thiếu vế này thì bảng ngoại lệ chỉ lớn lên.
  for (const prefix of Object.keys(intentionalThree)) {
    if (!usedExemptions.has(prefix) && Object.keys(surface).some((k) => isDescendantKey(k, prefix))) {
      out.push({
        key: prefix,
        kind: 'stale-intentional-three',
        detail: 'xoá dòng này, nhóm nó miễn trừ không còn là ba khoá anh em',
      });
    }
  }

  return out;
}

interface ListEntry {
  readonly items: readonly unknown[];
  readonly intentionalThree?: string;
}

function isListEntry(value: unknown): value is ListEntry {
  return typeof value === 'object' && value !== null && Array.isArray((value as ListEntry).items);
}

function countBulletLines(value: string): number {
  return value.split('\n').filter((line) => /^\s*(?:-|•) /.test(line)).length;
}

/**
 * Hai dấu phân cách khoá, và hai bộ phận của cổng dùng chúng KHÁC NHAU một cách
 * có chủ ý.
 *
 * `groupBySiblingPrefix` chỉ cắt ở dấu chấm (lý do ở khối chú thích của nó).
 * Phép kiểm "miễn trừ này còn trỏ vào đâu không" thì phải nhận CẢ HAI, vì người
 * viết bảng miễn trừ đọc `catalog.problem.verdict` là cha của
 * `catalog.problem.verdict-ac`, và họ đọc đúng. Chỉ nhận dấu chấm thì một dòng
 * miễn trừ chết nằm lại mà không cổng nào nói ra, đo được ở 18.C.
 */
const KEY_SEPARATORS: ReadonlySet<string> = new Set(['.', '-']);

/** `a.b` là cha của `a.b.c` VÀ của `a.b-c`. `a.bc` thì không. */
function isDescendantKey(key: string, prefix: string): boolean {
  return (
    key.length > prefix.length + 1 &&
    key.startsWith(prefix) &&
    KEY_SEPARATORS.has(key[prefix.length] as string)
  );
}

/**
 * Gom khoá theo tiền tố bỏ phân đoạn cuối. `a.b.c` thuộc nhóm `a.b`.
 *
 * CẮT Ở DẤU CHẤM, KHÔNG CẮT Ở GẠCH NỐI, và đó là một lựa chọn đã đo chứ không
 * phải một chỗ bỏ sót. Hệ quả của nó là điểm mù ghi trong
 * `prefix-grouping-gate-blind-to-flat-names`: một nhóm ba đặt tên PHẲNG
 * (`x.verdict-ac`) rơi vào nhóm cha đông thành viên và đi qua cổng vô hình.
 * Thứ đang bịt chỗ đó là một quy ước đặt tên, ghi ở đầu bảng miễn trừ của
 * `surfaces/shell.ts` và `surfaces/me.ts`: nhóm ba THẬT thì đặt LỒNG
 * (`x.verdict.ac`) để cổng nhìn thấy.
 *
 * Vì sao không cắt luôn ở gạch nối, đo ngày 2026-09-15 trên cả 11 surface:
 *
 * - Cắt ở dấu phân cách CUỐI CÙNG (chấm hoặc gạch) thì `error.authz.not-owner`
 *   rơi vào nhóm `error.authz.not`, nên SÁU nhóm ba đang được gác biến mất
 *   (`error.authz`, `me.labs.status`, `catalog.status`, `catalog.error-hint`,
 *   `admin.health.metric`, `me.terminal-theme`) và sáu dòng miễn trừ viết công
 *   phu cho chúng thành ôi. Đó là MẤT vùng phủ, không phải thêm.
 * - Giữ nhóm theo dấu chấm rồi bóc THÊM một tầng gạch nối thì không mất nhóm
 *   nào, nhưng sinh 27 nhóm ba mới phải khai lý do, và phần lớn không phải một
 *   phân loại ba mà là ba VAI TRÒ văn bản của cùng một khối
 *   (`admin.users.search` = label, placeholder, submit). Một bảng miễn trừ 27
 *   dòng như vậy đúng là nghĩa địa mà vế chống-ôi sinh ra để chặn.
 *
 * Đổi độ mịn ở đây là một quyết định về chính sách chứ không phải một bản vá,
 * nên nó nằm ngoài lượt sửa này. Hai con số trên để lượt sau khỏi đo lại.
 */
export function groupBySiblingPrefix(keys: readonly string[]): ReadonlyMap<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const parts = key.split('.');
    if (parts.length < 2) {
      continue;
    }
    const prefix = parts.slice(0, -1).join('.');
    const last = parts[parts.length - 1] as string;
    const bucket = groups.get(prefix);
    if (bucket === undefined) {
      groups.set(prefix, [last]);
    } else {
      bucket.push(last);
    }
  }
  return groups;
}

// ───────────────────────────────────────────────────────────────────────────
// T4 · chuỗi lọt ra ngoài bản đồ
// ───────────────────────────────────────────────────────────────────────────

/**
 * U+00D7 và U+00F7 nằm giữa hai dải nhưng không phải chữ, nên hai dải được cắt
 * quanh chúng thay vì viết một dải liền.
 */
export const VIET_LETTER =
  /[À-ÖØ-öø-ÿĀ-ɏẠ-ỹ]|[\u0300-\u036F]/;

export type LatinKind = 'string-literal' | 'jsx-text';

export interface LatinViolation {
  readonly line: number;
  readonly kind: LatinKind;
  readonly text: string;
}

/**
 * Quét literal chuỗi và JSX text tìm ký tự Latin có dấu.
 *
 * GIỚI HẠN PHẢI NÓI RA: một lane vẫn lách được bằng cách viết tiếng Việt không
 * dấu (rơi vào `scanStripped`) hoặc viết tiếng Anh, và `aria-label="Close"` đi
 * lọt hoàn toàn. Hàm này bắt được đường lười phổ biến, không bắt được đường cố
 * ý. Phần còn lại là review.
 *
 * Chú thích bị bóc TRƯỚC khi quét, bằng một máy trạng thái chạy theo ký tự chứ
 * không bằng regex: chú thích tiếng Việt trong mã của lane là hợp lệ, và một
 * cổng bắt chúng thì không lane nào dùng được. Máy trạng thái vẫn sai trên
 * literal regex chứa hai dấu chéo; đó là chỗ duy nhất còn lại và nó hiếm trong
 * TSX.
 */
export function scanLatinLiteral(source: string): readonly LatinViolation[] {
  const code = blankOutComments(source);
  const out: LatinViolation[] = [];

  const patterns: readonly (readonly [RegExp, LatinKind])[] = [
    [/'(?:[^'\\\n]|\\.)*'/g, 'string-literal'],
    [/"(?:[^"\\\n]|\\.)*"/g, 'string-literal'],
    [/`(?:[^`\\]|\\.)*`/g, 'string-literal'],
    [/>([^<>]*)</g, 'jsx-text'],
  ];

  for (const [pattern, kind] of patterns) {
    for (const match of code.matchAll(pattern)) {
      const text = kind === 'jsx-text' ? (match[1] ?? '') : match[0];
      if (!VIET_LETTER.test(text)) {
        continue;
      }
      out.push({ line: lineAt(code, match.index), kind, text: text.trim() });
    }
  }

  return out;
}

/** Thay mọi ký tự của chú thích bằng dấu cách, GIỮ NGUYÊN xuống dòng và độ dài. */
function blankOutComments(source: string): string {
  const chars = [...source];
  let i = 0;
  let state: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';

  while (i < chars.length) {
    const ch = chars[i] as string;
    const next = chars[i + 1];

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line';
        continue;
      }
      if (ch === '/' && next === '*') {
        state = 'block';
        continue;
      }
      if (ch === "'") {
        state = 'single';
      } else if (ch === '"') {
        state = 'double';
      } else if (ch === '`') {
        state = 'template';
      }
      i += 1;
      continue;
    }

    if (state === 'line') {
      if (ch === '\n') {
        state = 'code';
        i += 1;
        continue;
      }
      chars[i] = ' ';
      i += 1;
      continue;
    }

    if (state === 'block') {
      if (ch === '*' && next === '/') {
        chars[i] = ' ';
        chars[i + 1] = ' ';
        state = 'code';
        i += 2;
        continue;
      }
      if (ch !== '\n') {
        chars[i] = ' ';
      }
      i += 1;
      continue;
    }

    // Trong literal: bỏ qua escape, đóng đúng dấu mở.
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (
      (state === 'single' && ch === "'") ||
      (state === 'double' && ch === '"') ||
      (state === 'template' && ch === '`')
    ) {
      state = 'code';
    }
    i += 1;
  }

  return chars.join('');
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

// ───────────────────────────────────────────────────────────────────────────
// T5 · NFC
// ───────────────────────────────────────────────────────────────────────────

export interface NfcViolation {
  readonly key: string;
  readonly length: number;
  readonly normalizedLength: number;
}

/**
 * Chữ `ê` có dấu sắc viết được bằng một điểm mã hoặc bằng ba. Hai bản render
 * giống hệt nhau trên màn hình, khác nhau ở `.length`, khác nhau khi so sánh,
 * khác nhau khi tìm kiếm.
 */
export function scanNfc(values: Readonly<Record<string, string>>): readonly NfcViolation[] {
  const out: NfcViolation[] = [];
  for (const [key, value] of Object.entries(values)) {
    const normalized = value.normalize('NFC');
    if (value !== normalized) {
      out.push({ key, length: value.length, normalizedLength: normalized.length });
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// T6 · danh sách chặn
// ───────────────────────────────────────────────────────────────────────────

export type VoiceRule = 'V1' | 'V2' | 'V7' | 'V8';

export interface BlockedViolation {
  readonly rule: VoiceRule;
  readonly phrase: string;
}

/** V1, xưng hô. Bắt ở bất kỳ đâu trong giá trị. */
export const V1_ANYWHERE: readonly string[] = [
  'các bạn',
  'quý khách',
  'quý người dùng',
  'học viên thân mến',
  'bạn nhé',
  'chúng tôi rất',
];

/** V2, câu đầu phải mang thông tin. Bắt ở ĐẦU giá trị. */
export const V2_PREFIX: readonly string[] = [
  'chào mừng',
  'hãy cùng',
  'trong phần này',
  'như bạn đã biết',
  'trước tiên',
  'đầu tiên,',
];

/** V7, số cụ thể thay tính từ. Bắt ở bất kỳ đâu. */
export const V7_ANYWHERE: readonly string[] = [
  'xuất sắc',
  'tuyệt vời',
  'hoàn hảo',
  'mạnh mẽ',
  'toàn diện',
  'phong phú',
  'nhanh chóng',
  'dễ dàng',
  'tối ưu nhất',
];

/**
 * V8, không câu tổng kết. Bắt ở CÂU CUỐI.
 *
 * Hợp đồng viết "kết bằng". Đọc theo nghĩa đen (chuỗi kết thúc đúng bằng mấy
 * chữ này) thì luật không bắt được gì thật, vì không câu nào kết thúc ở giữa
 * mệnh đề. Nên phép kiểm là: câu cuối cùng MỞ ĐẦU bằng một trong bốn cụm. Đó
 * đúng là hình dạng của một câu tổng kết.
 */
export const V8_LAST_SENTENCE: readonly string[] = ['chúc bạn', 'hy vọng', 'tóm lại', 'nói chung'];

/**
 * Cổng HỖ TRỢ, không phải cổng bảo đảm. Đỏ thì chắc chắn sai; xanh thì chưa
 * chứng minh gì. V2, V7 và V8 là phán đoán về nội dung câu, và một danh sách
 * chặn chỉ bắt được các mở đầu và kết thúc đã biết mặt. Một câu khởi động viết
 * bằng chữ mới đi lọt.
 */
export function scanBlocked(value: string): readonly BlockedViolation[] {
  const text = value.normalize('NFC').toLowerCase();
  const head = text.replace(/^[\s\-*#>]+/, '');
  const out: BlockedViolation[] = [];

  for (const phrase of V1_ANYWHERE) {
    if (text.includes(phrase)) {
      out.push({ rule: 'V1', phrase });
    }
  }
  for (const phrase of V2_PREFIX) {
    if (head.startsWith(phrase)) {
      out.push({ rule: 'V2', phrase });
    }
  }
  for (const phrase of V7_ANYWHERE) {
    if (text.includes(phrase)) {
      out.push({ rule: 'V7', phrase });
    }
  }
  const last = lastSentence(text);
  for (const phrase of V8_LAST_SENTENCE) {
    if (last.startsWith(phrase)) {
      out.push({ rule: 'V8', phrase });
    }
  }
  return out;
}

function lastSentence(text: string): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return parts[parts.length - 1] ?? '';
}

// ───────────────────────────────────────────────────────────────────────────
// Dựng giá trị: một đường ống, bốn người tiêu thụ (T1b, T2, T5, T6)
// ───────────────────────────────────────────────────────────────────────────

export interface RenderedValue {
  readonly key: string;
  readonly value: string;
}

export interface RenderResult {
  readonly values: readonly RenderedValue[];
  /** Khoá KHÔNG dựng được. Một mục ở đây là một mục không cổng nào nhìn thấy. */
  readonly failures: readonly string[];
}

const NUMBER_PROBE = new Proxy(
  {},
  { get: (_target, prop) => (typeof prop === 'symbol' ? undefined : 7) },
) as Record<string, number>;

const STRING_PROBE = new Proxy(
  {},
  { get: (_target, prop) => (typeof prop === 'symbol' ? undefined : 'X') },
) as Record<string, string>;

/**
 * Dựng mọi mục thành chuỗi.
 *
 * GIỚI HẠN PHẢI NÓI RA: lượt này chỉ đi vào nhánh mà probe đi vào. Luật "bộ chọn
 * trả về KHOÁ, không trả về câu" (§1.6) tồn tại chính vì lý do này, và lượt quét
 * NGUỒN (T1a) phủ nốt phần lượt này bỏ lại.
 */
export function renderMessages(messages: Readonly<Record<string, unknown>>): RenderResult {
  const values: RenderedValue[] = [];
  const failures: string[] = [];

  for (const [key, entry] of Object.entries(messages)) {
    const rendered = renderEntry(entry);
    if (rendered === null) {
      failures.push(key);
      continue;
    }
    for (const value of rendered) {
      values.push({ key, value });
    }
  }

  return { values, failures };
}

/** `null` nghĩa là không dựng được, KHÔNG phải nghĩa là rỗng. */
export function renderEntry(entry: unknown): readonly string[] | null {
  if (typeof entry === 'string') {
    return [entry];
  }
  if (typeof entry === 'function') {
    const called = callWithProbe(entry as (p: unknown) => unknown);
    return called === null ? null : renderEntry(called);
  }
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }

  const obj = entry as Record<string, unknown>;
  if (typeof obj['what'] === 'string' && typeof obj['next'] === 'string') {
    return [`${obj['what']} ${obj['next']}`];
  }
  if (typeof obj['zero'] === 'string' && typeof obj['one'] === 'string' && typeof obj['many'] === 'function') {
    const many = obj['many'] as (n: number) => string;
    return [obj['zero'], obj['one'], many(2), many(11)];
  }
  if (Array.isArray(obj['items'])) {
    return (obj['items'] as unknown[]).filter((x): x is string => typeof x === 'string');
  }
  return null;
}

function callWithProbe(fn: (p: unknown) => unknown): unknown {
  try {
    return fn(NUMBER_PROBE);
  } catch {
    try {
      return fn(STRING_PROBE);
    } catch {
      return null;
    }
  }
}
