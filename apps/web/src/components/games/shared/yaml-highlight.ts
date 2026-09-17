/**
 * Tách một dòng YAML thành các mẩu có màu — TOÁN THUẦN, không React, không DOM.
 *
 * Chỉ đủ cho YAML mà arena thật sự hiện: manifest do `toManifestYaml` phát ra,
 * cộng với những gì người chơi gõ tay vào ô soạn thảo. Cố ý KHÔNG phải một bộ
 * đọc YAML đầy đủ — nó không dựng cây, không phân giải anchor, không quan tâm
 * ngữ nghĩa. Nó chỉ tô màu, và tô sai một dòng lạ thì hậu quả là dòng đó màu
 * xám, không phải một lỗi.
 *
 * ⛔ Đây KHÔNG phải chỗ để kiểm tra cú pháp. Câu trả lời "YAML này có hợp lệ
 * không" là của engine, phát ra khi bấm Lưu (`ArenaEdit`). Một bộ tô màu tự ý
 * gắn cờ đỏ sẽ mâu thuẫn với engine đúng vào lúc người học cần tin một trong hai.
 */

export type YamlTokenKind =
  /** Khoảng trắng đầu dòng, dấu `-` của danh sách, dấu hai chấm. */
  | 'punctuation'
  | 'key'
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'comment'
  /** Không nhận ra — giữ màu chữ thường. */
  | 'plain';

export interface YamlToken {
  readonly text: string;
  readonly kind: YamlTokenKind;
}

/** `true`/`false` theo nghĩa YAML 1.2 lõi. `yes`/`no` KHÔNG tính — YAML 1.2 đã bỏ. */
const BOOLEANS = new Set(['true', 'false']);
const NULLS = new Set(['null', '~']);

/** Số nguyên, thập phân, số mũ. Không nhận `1.27` có hậu tố (đó là tag image). */
const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Phần trước dấu hai chấm có phải một KHOÁ không.
 *
 * Dấu hai chấm phải theo sau bởi khoảng trắng hoặc hết dòng — đúng luật YAML, và
 * đó chính là thứ giữ cho `image: nginx:1.27-alpine` không bị đọc thành hai khoá.
 * Bỏ luật này là tô sai gần như mọi manifest trong game, vì tag image ở khắp nơi.
 */
function keyEnd(rest: string): number {
  let quote: string | null = null;
  for (let i = 0; i < rest.length; i += 1) {
    const char = rest[i];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#') {
      return -1;
    }
    if (char === ':') {
      const next = rest[i + 1];
      if (next === undefined || next === ' ' || next === '\t') {
        return i;
      }
    }
  }
  return -1;
}

function valueKind(value: string): YamlTokenKind {
  const trimmed = value.trim();
  if (trimmed === '') return 'plain';
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) return 'string';
  if (NUMBER.test(trimmed)) return 'number';
  if (BOOLEANS.has(trimmed)) return 'boolean';
  if (NULLS.has(trimmed)) return 'null';
  if (trimmed === '[]' || trimmed === '{}') return 'punctuation';
  return 'string';
}

/** Tách phần chú thích `#` ở cuối, tôn trọng dấu nháy. `-1` nếu không có. */
function commentStart(text: string): number {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t')) {
      return i;
    }
  }
  return -1;
}

function push(out: YamlToken[], text: string, kind: YamlTokenKind): void {
  if (text !== '') {
    out.push({ text, kind });
  }
}

/**
 * Một dòng → danh sách mẩu.
 *
 * BẤT BIẾN: nối `text` của mọi mẩu lại phải ra ĐÚNG dòng ban đầu, từng ký tự.
 * Đây là điều kiện để lớp tô màu chồng khít lên `<textarea>` bên trên nó — lệch
 * một ký tự là lệch cả phần còn lại của dòng.
 */
export function tokenizeYamlLine(line: string): readonly YamlToken[] {
  const out: YamlToken[] = [];
  if (line === '') {
    return out;
  }

  const indentLength = line.length - line.trimStart().length;
  push(out, line.slice(0, indentLength), 'punctuation');
  let rest = line.slice(indentLength);

  // Dòng chú thích nguyên vẹn.
  if (rest.startsWith('#')) {
    push(out, rest, 'comment');
    return out;
  }

  // Dấu tách tài liệu.
  if (rest === '---' || rest === '...') {
    push(out, rest, 'punctuation');
    return out;
  }

  // Chuỗi dấu `- ` lồng nhau của danh sách.
  while (rest.startsWith('- ') || rest === '-') {
    const marker = rest === '-' ? '-' : '- ';
    push(out, marker, 'punctuation');
    rest = rest.slice(marker.length);
  }

  const comment = commentStart(rest);
  const body = comment === -1 ? rest : rest.slice(0, comment);
  const tail = comment === -1 ? '' : rest.slice(comment);

  const split = keyEnd(body);
  if (split === -1) {
    push(out, body, valueKind(body));
  } else {
    push(out, body.slice(0, split), 'key');
    push(out, ':', 'punctuation');
    const value = body.slice(split + 1);
    const valueStart = value.length - value.trimStart().length;
    push(out, value.slice(0, valueStart), 'punctuation');
    // Khoảng trắng ĐUÔI tách riêng: nếu để dính vào giá trị thì mẩu "giá trị"
    // của `replicas: 3  # ghi chú` là `"3  "` chứ không phải `"3"`, và mọi phép
    // kiểm (lẫn mọi người đọc) đều phải tự đi trim lại.
    const valueEnd = value.length - value.trimEnd().length;
    const actual = value.slice(valueStart, value.length - valueEnd);
    push(out, actual, valueKind(actual));
    push(out, value.slice(value.length - valueEnd), 'punctuation');
  }

  push(out, tail, 'comment');
  return out;
}

/** Cả khối, giữ nguyên số dòng (kể cả dòng trống). */
export function tokenizeYaml(source: string): readonly (readonly YamlToken[])[] {
  return source.split('\n').map(tokenizeYamlLine);
}
