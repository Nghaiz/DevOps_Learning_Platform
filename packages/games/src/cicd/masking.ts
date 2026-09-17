/**
 * Che bí mật trong log của đường ống, và chỉ ra **chỗ nó vẫn lọt** — 19.B.9.
 *
 * Hàm thuần theo `cd-contract.ts` §3 (luật M1–M4) và §4 (chữ ký). Không đọc
 * engine, không đọc hai bộ mô phỏng kia, không thời gian, không ngẫu nhiên.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BÀI HỌC MÀ FILE NÀY PHẢI DẠY ĐÚNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bộ che của một hệ CI thật chỉ làm đúng một việc: tìm CHUỖI đã đăng ký trong
 * từng dòng log và thay nó bằng `***`. Nó không hiểu ngữ nghĩa, không giải mã,
 * không nhìn sang dòng bên cạnh. Ba chỗ rò kinh điển đều đến từ đó:
 *
 * 1. **Biến đổi.** Bí mật đi qua base64 (header xác thực kiểu Basic), mã hoá
 *    URL (tham số truy vấn), hay bị đảo ngược là một chuỗi KHÁC — bộ che không
 *    biết gì về nó và nó lọt nguyên vẹn. Sửa được, bằng cách đăng ký thêm đúng
 *    dạng đó.
 * 2. **In theo mảnh.** Một bí mật cắt đôi qua hai dòng không nằm trọn trong dòng
 *    nào, nên bộ che không thấy. KHÔNG sửa được bằng đăng ký thêm gì cả: đăng ký
 *    nguyên giá trị vẫn chỉ khớp nguyên giá trị. Cách sửa duy nhất là đừng in nó.
 * 3. **Chuỗi con.** Hai bí mật lồng nhau mà che cái ngắn trước thì cái dài còn
 *    thừa một đuôi lộ ra. Đó là lý do M2 ghim thứ tự che.
 *
 * Nếu file này "thông minh" hơn bộ che thật (giải base64 trước khi so, ghép dòng
 * trước khi che) thì game dạy sai: người chơi mang về niềm tin rằng hệ CI sẽ lo
 * hộ, và nó không lo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁC LỖI CỨNG — và vì sao là ném chứ không phải bỏ qua
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * M1 chốt rằng mẫu nhắc bí mật không tồn tại là lỗi CỨNG. File này mở rộng đúng
 * tinh thần đó cho những dữ liệu sai khác mà bỏ qua thì bộ phát hiện rò sẽ báo
 * xanh giả, và `MaskingRecord` không có trường lỗi nào để mang chúng đi:
 *
 * - Id bí mật trùng — `{{id}}` không biết lấy giá trị nào.
 * - Giá trị ngắn hơn 4 ký tự, hoặc có ký tự ngoài ASCII in được (`0x20..0x7E`).
 *   Base64 và mã hoá URL ở đây làm trên từng BYTE ASCII; một ký tự ngoài ASCII
 *   sẽ ra một dạng mã hoá sai so với công cụ thật, tức là dạy sai.
 * - Mục che trỏ vào bí mật hay dạng không tồn tại — không tính được chuỗi để che.
 * - Dòng `split` có số chỗ chèn khác 1 — không xác định được mảnh nào tách.
 * - Mẫu dòng chứa ký tự xuống dòng — một "dòng" như thế hiện thành hai dòng
 *   trước mắt người xem, nhưng phép dò rò kiểu "ghép dòng i với i+1" sẽ không
 *   thấy mảnh nằm giữa, và báo sạch trên một chỗ rò thật.
 */

import { compareKeys } from '../git/deterministic.ts';
import {
  SECRET_FORMS,
  type LogLineTemplate,
  type MaskingPolicy,
  type MaskingRecord,
  type MaskingScenario,
  type SecretForm,
  type SecretLeak,
  type SecretSpec,
} from './cd-contract.ts';

/** Chuỗi thay thế của bộ che. Hợp đồng M2 ghim nguyên văn. */
const MASK = '***';

/** `SecretSpec.value` tối thiểu. Chuỗi rỗng khớp ở MỌI vị trí của mọi dòng. */
const MIN_SECRET_LENGTH = 4;

const PRINTABLE_ASCII_MIN = 0x20;
const PRINTABLE_ASCII_MAX = 0x7e;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_PAD = '=';
const HEX_UPPER = '0123456789ABCDEF';

/** RFC 3986 §2.3 — bốn ký tự "unreserved" ngoài chữ và số. */
const URL_UNRESERVED_MARKS = '-._~';

/**
 * Chỗ chèn `{{...}}`. Bên trong không được có ngoặc nhọn, nên `{{{a}}}` là chữ
 * `{` + chỗ chèn `{{a}}` + chữ `}`. Mọi thứ khớp khuôn này đều là chỗ chèn và
 * được kiểm nghiêm — `{{ a }}` (có khoảng trắng) là id `" a "`, không tồn tại,
 * nên ném, thay vì lặng lẽ để nguyên thành chữ.
 */
const PLACEHOLDER_SOURCE = String.raw`\{\{([^{}]*)\}\}`;

function isSecretForm(form: string): form is SecretForm {
  return (SECRET_FORMS as readonly string[]).includes(form);
}

/** Vị trí ký tự đầu tiên ngoài ASCII in được, hoặc `-1`. */
function firstNonPrintableIndex(value: string): number {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < PRINTABLE_ASCII_MIN || code > PRINTABLE_ASCII_MAX) return i;
  }
  return -1;
}

/**
 * Base64 bảng chữ chuẩn, có đệm `=`, trên từng byte ASCII.
 *
 * Tự viết vì hợp đồng cấm `btoa`/`Buffer` (không DOM, không `node:*`). Mỗi ba
 * byte gộp thành 24 bit rồi cắt bốn nhóm 6 bit; nhóm cuối thiếu byte thì đệm.
 */
function encodeBase64(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i += 3) {
    const remaining = value.length - i;
    const b0 = value.charCodeAt(i);
    const b1 = remaining > 1 ? value.charCodeAt(i + 1) : 0;
    const b2 = remaining > 2 ? value.charCodeAt(i + 2) : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET.charAt((triple >> 18) & 0x3f);
    out += BASE64_ALPHABET.charAt((triple >> 12) & 0x3f);
    out += remaining > 1 ? BASE64_ALPHABET.charAt((triple >> 6) & 0x3f) : BASE64_PAD;
    out += remaining > 2 ? BASE64_ALPHABET.charAt(triple & 0x3f) : BASE64_PAD;
  }
  return out;
}

function isUrlUnreserved(char: string, code: number): boolean {
  const isUpper = code >= 0x41 && code <= 0x5a;
  const isLower = code >= 0x61 && code <= 0x7a;
  const isDigit = code >= 0x30 && code <= 0x39;
  return isUpper || isLower || isDigit || URL_UNRESERVED_MARKS.includes(char);
}

/**
 * Mã hoá phần trăm theo RFC 3986: chỉ giữ `A-Za-z0-9-._~`, còn lại `%XX` hex HOA.
 *
 * ⚠ Hẹp hơn hàm mã hoá thành phần URL có sẵn của JS: hàm đó giữ nguyên
 * `! * ' ( )`. Dùng nó (dù không được phép ở đây) sẽ lệch hợp đồng ở đúng năm
 * ký tự đó, và test ghim cả năm.
 */
function encodeUrl(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const char = value.charAt(i);
    const code = value.charCodeAt(i);
    out += isUrlUnreserved(char, code)
      ? char
      : `%${HEX_UPPER.charAt(code >> 4)}${HEX_UPPER.charAt(code & 0x0f)}`;
  }
  return out;
}

function reverse(value: string): string {
  let out = '';
  for (let i = value.length - 1; i >= 0; i--) out += value.charAt(i);
  return out;
}

/**
 * Dạng một giá trị bí mật xuất hiện trong log.
 *
 * Ném khi giá trị có ký tự ngoài ASCII in được, hoặc `form` không thuộc
 * `SECRET_FORMS` (kiểu TS chặn ở lúc biên dịch, nhưng dữ liệu level có thể đến từ
 * JSON). Thông điệp KHÔNG in lại giá trị — thói quen đúng với bí mật, kể cả bí
 * mật giả của một game.
 */
export function transformSecret(value: string, form: SecretForm): string {
  const bad = firstNonPrintableIndex(value);
  if (bad !== -1) {
    throw new Error(
      `transformSecret: ký tự thứ ${bad} (mã ${value.charCodeAt(bad)}) không phải ASCII in được — chỉ nhận 0x20..0x7E`,
    );
  }
  switch (form) {
    case 'raw':
      return value;
    case 'base64':
      return encodeBase64(value);
    case 'url':
      return encodeUrl(value);
    case 'reversed':
      return reverse(value);
    default:
      throw new Error(`transformSecret: dạng "${String(form)}" không thuộc SECRET_FORMS`);
  }
}

function validateSecrets(secrets: readonly SecretSpec[]): void {
  const ids = secrets.map((s) => s.id).sort(compareKeys);
  for (let i = 1; i < ids.length; i++) {
    if (ids[i] === ids[i - 1]) {
      throw new Error(`renderMaskedLog: id bí mật "${String(ids[i])}" khai trùng — {{id}} không biết lấy giá trị nào`);
    }
  }
  for (const secret of secrets) {
    if (secret.value.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `renderMaskedLog: bí mật "${secret.id}" ngắn hơn ${MIN_SECRET_LENGTH} ký tự — hợp đồng đòi ≥ ${MIN_SECRET_LENGTH}`,
      );
    }
    const bad = firstNonPrintableIndex(secret.value);
    if (bad !== -1) {
      throw new Error(`renderMaskedLog: bí mật "${secret.id}" có ký tự thứ ${bad} ngoài ASCII in được`);
    }
  }
}

function findSecret(secrets: readonly SecretSpec[], id: string): SecretSpec | undefined {
  return secrets.find((s) => s.id === id);
}

interface Placeholder {
  readonly start: number;
  readonly end: number;
  /** Giá trị ĐÃ biến đổi, đúng thứ được chèn vào dòng. */
  readonly value: string;
}

function findPlaceholders(text: string, templateIndex: number, secrets: readonly SecretSpec[]): readonly Placeholder[] {
  const out: Placeholder[] = [];
  for (const match of text.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'g'))) {
    const parts = (match[1] ?? '').split('|');
    if (parts.length > 2) {
      throw new Error(`renderMaskedLog: mẫu dòng ${templateIndex} có chỗ chèn "${match[0]}" nhiều hơn một dấu | (M1)`);
    }
    const [id = '', form = 'raw'] = parts;
    const secret = findSecret(secrets, id);
    if (secret === undefined) {
      throw new Error(`renderMaskedLog: mẫu dòng ${templateIndex} nhắc bí mật "${id}" không có trong kịch bản (M1)`);
    }
    if (!isSecretForm(form)) {
      throw new Error(`renderMaskedLog: mẫu dòng ${templateIndex} dùng dạng "${form}" không thuộc SECRET_FORMS (M1)`);
    }
    out.push({ start: match.index, end: match.index + match[0].length, value: transformSecret(secret.value, form) });
  }
  return out;
}

/**
 * Một mẫu ra một dòng, hoặc hai dòng nếu `split`.
 *
 * Chèn trong MỘT lượt trái sang phải trên văn bản mẫu: giá trị đã chèn không
 * bao giờ bị quét lại, nên một bí mật chứa chữ `{{x}}` vẫn là chữ.
 *
 * **Bố cục `split`** (chỗ hợp đồng để ngỏ, ghim ở đây và trong test): chỗ chèn
 * duy nhất có giá trị `v`, cắt tại `ceil(len/2)`:
 *
 *     dòng này   = phần mẫu TRƯỚC chỗ chèn + nửa đầu của v
 *     dòng mới   = nửa sau của v + phần mẫu SAU chỗ chèn
 *
 * Tức là đúng thứ một lệnh in hai lần liên tiếp để lại: đoạn chữ dẫn nằm với
 * mảnh đầu, đoạn chữ đuôi nằm với mảnh cuối, và ghép hai dòng lại (không ký tự
 * nối) là ra nguyên dòng như khi không tách.
 */
function renderTemplate(
  template: LogLineTemplate,
  templateIndex: number,
  secrets: readonly SecretSpec[],
): readonly string[] {
  const { text } = template;
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error(`renderMaskedLog: mẫu dòng ${templateIndex} chứa ký tự xuống dòng — một mẫu là đúng một dòng`);
  }
  const placeholders = findPlaceholders(text, templateIndex, secrets);

  if (template.split === true) {
    const [only] = placeholders;
    if (only === undefined || placeholders.length !== 1) {
      throw new Error(
        `renderMaskedLog: mẫu dòng ${templateIndex} bật split nhưng có ${placeholders.length} chỗ chèn — cần đúng 1`,
      );
    }
    const cut = Math.ceil(only.value.length / 2);
    return [text.slice(0, only.start) + only.value.slice(0, cut), only.value.slice(cut) + text.slice(only.end)];
  }

  let line = '';
  let cursor = 0;
  for (const p of placeholders) {
    line += text.slice(cursor, p.start) + p.value;
    cursor = p.end;
  }
  return [line + text.slice(cursor)];
}

interface Needle {
  readonly secret: string;
  readonly form: SecretForm;
  readonly text: string;
}

/**
 * M2 — dài trước, rồi `secret`, rồi `form`.
 *
 * Cả `secret` lẫn `form` so theo MÃ ĐƠN VỊ (`compareKeys`), theo ràng buộc 2 của
 * `contract.ts` cho mọi phép sắp chuỗi. Với `form` điều này KHÁC thứ tự khai
 * trong `SECRET_FORMS` ở đúng một cặp (`reversed` < `url`), và cặp đó đổi được
 * kết quả khi hai dạng dài bằng nhau chồng lên nhau — test ghim ca này.
 */
function compareMaskOrder(a: Needle, b: Needle): number {
  if (a.text.length !== b.text.length) return b.text.length - a.text.length;
  const bySecret = compareKeys(a.secret, b.secret);
  if (bySecret !== 0) return bySecret;
  return compareKeys(a.form, b.form);
}

function maskNeedles(policy: MaskingPolicy, secrets: readonly SecretSpec[]): readonly Needle[] {
  const needles = policy.masked.map((entry): Needle => {
    const secret = findSecret(secrets, entry.secret);
    if (secret === undefined) {
      throw new Error(`renderMaskedLog: mục che nhắc bí mật "${entry.secret}" không có trong kịch bản`);
    }
    if (!isSecretForm(entry.form)) {
      throw new Error(`renderMaskedLog: mục che dùng dạng "${String(entry.form)}" không thuộc SECRET_FORMS`);
    }
    return { secret: entry.secret, form: entry.form, text: transformSecret(secret.value, entry.form) };
  });
  return [...needles].sort(compareMaskOrder);
}

/** Mọi lần xuất hiện, không chồng lấn, trái sang phải. Chuỗi rỗng không tới được đây (≥ 4 ký tự). */
function applyMask(line: string, needles: readonly Needle[]): string {
  let out = line;
  for (const needle of needles) out = out.split(needle.text).join(MASK);
  return out;
}

/** M3 — (line, secret, form); hai chuỗi so theo mã đơn vị. Khoá này đã là khoá duy nhất, xem `detectLeaks`. */
function compareLeaks(a: SecretLeak, b: SecretLeak): number {
  if (a.line !== b.line) return a.line - b.line;
  const bySecret = compareKeys(a.secret, b.secret);
  if (bySecret !== 0) return bySecret;
  return compareKeys(a.form, b.form);
}

/**
 * M3 + M4 — khớp chuỗi chính xác, trên log ĐÃ che.
 *
 * Mọi bí mật × mọi dạng, kể cả khi hai dạng trùng chuỗi (một giá trị không có ký
 * tự nào phải mã hoá thì `url` giống hệt `raw`): khi đó MỘT chỗ lộ ra HAI mục rò.
 * Đó là hệ quả trực tiếp của "mọi dạng trong `SECRET_FORMS`", không phải đếm đôi
 * nhầm.
 *
 * `(line, secret, form)` là duy nhất: `acrossLines: true` ở dòng i đòi dòng i KHÔNG
 * chứa chuỗi, còn `false` đòi dòng i chứa nó — hai điều không thể cùng đúng, và id
 * bí mật đã bị cấm trùng.
 */
function detectLeaks(lines: readonly string[], secrets: readonly SecretSpec[]): readonly SecretLeak[] {
  const needles = secrets.flatMap((secret) =>
    SECRET_FORMS.map((form): Needle => ({ secret: secret.id, form, text: transformSecret(secret.value, form) })),
  );
  const leaks: SecretLeak[] = [];
  lines.forEach((line, index) => {
    const next = lines[index + 1];
    for (const needle of needles) {
      const base = { line: index, secret: needle.secret, form: needle.form };
      if (line.includes(needle.text)) {
        leaks.push({ ...base, acrossLines: false });
      } else if (next !== undefined && !next.includes(needle.text) && (line + next).includes(needle.text)) {
        leaks.push({ ...base, acrossLines: true });
      }
    }
  });
  return leaks.sort(compareLeaks);
}

/**
 * Dựng log từ mẫu (M1), che theo lựa chọn của người chơi (M2), rồi liệt kê mọi
 * chỗ còn lộ (M3, M4).
 *
 * Kiểm dữ liệu TRƯỚC khi dựng bất cứ gì: kịch bản hỏng thì không có nửa bản ghi
 * nào để đọc nhầm.
 */
export function renderMaskedLog(policy: MaskingPolicy, scenario: MaskingScenario): MaskingRecord {
  validateSecrets(scenario.secrets);
  const needles = maskNeedles(policy, scenario.secrets);
  const rendered = scenario.lines.flatMap((template, index) => renderTemplate(template, index, scenario.secrets));
  const lines = rendered.map((line) => applyMask(line, needles));
  return { lines, leaks: detectLeaks(lines, scenario.secrets) };
}

/** Số mục rò — mỗi `(dòng, bí mật, dạng)` là một mục. `0` ⇔ log sạch. */
export function leakCount(record: MaskingRecord): number {
  return record.leaks.length;
}

/** Id các bí mật đã lộ ở bất kỳ dạng nào, không lặp, sắp theo mã đơn vị. */
export function leakedSecrets(record: MaskingRecord): readonly string[] {
  const ids = record.leaks.map((leak) => leak.secret).sort(compareKeys);
  return ids.filter((id, i) => i === 0 || id !== ids[i - 1]);
}
