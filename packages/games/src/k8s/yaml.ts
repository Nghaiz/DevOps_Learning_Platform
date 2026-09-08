/**
 * Bộ phân tích YAML TỐI THIỂU cho manifest Kubernetes, cộng phép chuyển manifest
 * → `ResourceSpec` phẳng.
 *
 * ## Vì sao tự viết thay vì kéo một thư viện
 *
 * `js-yaml` là 40 KB gzip vào bundle của một trang game, để phân tích một tập
 * con mà manifest K8s chỉ dùng đúng một góc. Nặng hơn: nó nhận cả anchor, alias,
 * merge key và tag tuỳ biến — những thứ một người học Kubernetes không cần, và
 * mỗi thứ là một hình dạng đầu vào phải nghĩ tới. Tập con dưới đây là thứ *mọi*
 * ví dụ trong tài liệu Kubernetes dùng, và không hơn.
 *
 * ## Nhận cái gì
 *
 * Map theo thụt lề · dãy `- ` · vô hướng (chuỗi, số, `true`/`false`, `null`) ·
 * chuỗi trong nháy đơn/kép · chú thích `#` · tách tài liệu `---` · tập hợp rỗng
 * dạng dòng (`{}` và `[]` — `podSelector: {}` của NetworkPolicy cần nó, và đó là
 * cách viết một policy default-deny).
 *
 * ## KHÔNG nhận, và báo lỗi rõ ràng
 *
 * Tab thụt lề · anchor/alias · chuỗi nhiều dòng (`|`, `>`) · flow map/list có
 * nội dung. Báo lỗi tiếng Việt kèm SỐ DÒNG. Im lặng bỏ qua một dòng không hiểu
 * là cách một manifest "được nhận" rồi tạo ra một object thiếu field, và người
 * chơi sẽ đi tìm lỗi ở mô phỏng.
 */

import type { ResourceKind } from './contract.ts';
import { isNamespaced, resolveKind } from './resources.ts';

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export type YamlResult =
  | { readonly ok: true; readonly documents: readonly YamlValue[] }
  | { readonly ok: false; readonly error: string; readonly line: number };

interface Line {
  readonly indent: number;
  readonly text: string;
  readonly number: number;
}

class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

export function parseYaml(source: string): YamlResult {
  try {
    const documents: YamlValue[] = [];
    for (const block of splitDocuments(source)) {
      const lines = readLines(block.text, block.offset);
      documents.push(lines.length === 0 ? null : parseBlock(lines, 0, lines[0]?.indent ?? 0).value);
    }
    return { ok: true, documents: documents.filter((doc) => doc !== null) };
  } catch (error) {
    if (error instanceof YamlError) {
      return { ok: false, error: error.message, line: error.line };
    }
    return { ok: false, error: 'Không đọc được YAML.', line: 0 };
  }
}

function splitDocuments(source: string): readonly { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let current: string[] = [];
  let offset = 0;
  let index = 0;
  // `\r` bị cắt ở đây chứ không ở chỗ khác: một file YAML dán từ Windows có CRLF,
  // và `\r` sót lại sẽ nằm im trong giá trị chuỗi rồi làm mọi phép so tên tài
  // nguyên trượt — hỏng lặng lẽ, đúng loại lỗi repo đã trả giá một lần.
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    index += 1;
    if (raw.trim() === '---') {
      out.push({ text: current.join('\n'), offset });
      current = [];
      offset = index;
      continue;
    }
    current.push(raw);
  }
  out.push({ text: current.join('\n'), offset });
  return out;
}

function readLines(text: string, offset: number): readonly Line[] {
  const out: Line[] = [];
  let number = offset;
  for (const raw of text.split('\n')) {
    number += 1;
    if (raw.includes('\t')) {
      throw new YamlError('YAML không cho phép dùng tab để thụt lề — hãy dùng dấu cách.', number);
    }
    const withoutComment = stripComment(raw);
    if (withoutComment.trim() === '') {
      continue;
    }
    out.push({
      indent: withoutComment.length - withoutComment.trimStart().length,
      text: withoutComment.trim(),
      number,
    });
  }
  return out;
}

/** `#` chỉ mở chú thích khi nằm NGOÀI nháy — `image: nginx#1` không phải chú thích. */
function stripComment(raw: string): string {
  let quote: string | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '#' && (i === 0 || raw[i - 1] === ' ')) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

// ── Phân tích ───────────────────────────────────────────────────────────────

interface Parsed {
  readonly value: YamlValue;
  readonly next: number;
}

function parseBlock(lines: readonly Line[], start: number, indent: number): Parsed {
  const first = lines[start];
  if (first === undefined) {
    return { value: null, next: start };
  }
  return first.text.startsWith('- ') || first.text === '-'
    ? parseSequence(lines, start, indent)
    : parseMapping(lines, start, indent);
}

function parseSequence(lines: readonly Line[], start: number, indent: number): Parsed {
  const items: YamlValue[] = [];
  let cursor = start;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined || line.indent < indent) {
      break;
    }
    if (line.indent > indent || !(line.text.startsWith('- ') || line.text === '-')) {
      throw new YamlError(`Dòng ${line.number}: thụt lề không khớp với dãy đang mở.`, line.number);
    }
    const inline = line.text === '-' ? '' : line.text.slice(2).trim();
    cursor += 1;
    if (inline === '') {
      const parsed = parseBlock(lines, cursor, lines[cursor]?.indent ?? indent + 2);
      items.push(parsed.value);
      cursor = parsed.next;
      continue;
    }
    // `- name: web` mở một map NGAY TRÊN cùng dòng với gạch đầu dòng. Các dòng
    // sau của map đó thụt sâu hơn gạch đầu dòng chứ không thụt theo `name`, nên
    // phải ghép dòng ảo này với phần còn lại chứ không đọc nó như một vô hướng.
    if (isMappingEntry(inline)) {
      const virtual: Line = { indent: indent + 2, text: inline, number: line.number };
      const rest = collectDeeper(lines, cursor, indent);
      const parsed = parseMapping([virtual, ...rest.lines], 0, indent + 2);
      items.push(parsed.value);
      cursor = rest.next;
      continue;
    }
    items.push(parseScalar(inline, line.number));
  }
  return { value: items, next: cursor };
}

function collectDeeper(
  lines: readonly Line[],
  start: number,
  indent: number,
): { lines: readonly Line[]; next: number } {
  const out: Line[] = [];
  let cursor = start;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined || line.indent <= indent) {
      break;
    }
    out.push(line);
    cursor += 1;
  }
  return { lines: out, next: cursor };
}

function parseMapping(lines: readonly Line[], start: number, indent: number): Parsed {
  const map: Record<string, YamlValue> = {};
  let cursor = start;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined || line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new YamlError(`Dòng ${line.number}: thụt lề sâu hơn mức của map đang mở.`, line.number);
    }
    const split = splitKey(line.text);
    if (split === null) {
      throw new YamlError(
        `Dòng ${line.number}: không phải cặp "khoá: giá trị" — YAML của manifest cần dấu hai chấm.`,
        line.number,
      );
    }
    cursor += 1;
    if (split.value === '') {
      const child = lines[cursor];
      if (child === undefined || child.indent <= indent) {
        map[split.key] = null;
        continue;
      }
      const parsed = parseBlock(lines, cursor, child.indent);
      map[split.key] = parsed.value;
      cursor = parsed.next;
      continue;
    }
    map[split.key] = parseScalar(split.value, line.number);
  }
  return { value: map, next: cursor };
}

function isMappingEntry(text: string): boolean {
  return splitKey(text) !== null;
}

/** Tách ở dấu `:` đầu tiên NGOÀI nháy — `image: "a:b"` có khoá `image`. */
function splitKey(text: string): { key: string; value: string } | null {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ':' && (i + 1 === text.length || text[i + 1] === ' ')) {
      return { key: unquote(text.slice(0, i).trim()), value: text.slice(i + 1).trim() };
    }
  }
  return null;
}

function unquote(text: string): string {
  const first = text[0];
  if ((first === '"' || first === "'") && text.length >= 2 && text.endsWith(first)) {
    return text.slice(1, -1);
  }
  return text;
}

function parseScalar(text: string, line: number): YamlValue {
  if (text === '{}') {
    return {};
  }
  if (text === '[]') {
    return [];
  }
  if (text.startsWith('|') || text.startsWith('>')) {
    throw new YamlError(
      `Dòng ${line}: chuỗi nhiều dòng (| và >) chưa được hỗ trợ trong game.`,
      line,
    );
  }
  if (text.startsWith('&') || text.startsWith('*')) {
    throw new YamlError(`Dòng ${line}: anchor/alias của YAML chưa được hỗ trợ trong game.`, line);
  }
  if (text.startsWith('[') || text.startsWith('{')) {
    throw new YamlError(
      `Dòng ${line}: chỉ nhận [] và {} rỗng ở dạng dòng; hãy viết danh sách bằng gạch đầu dòng.`,
      line,
    );
  }
  const first = text[0];
  if (first === '"' || first === "'") {
    return unquote(text);
  }
  if (text === 'true' || text === 'false') {
    return text === 'true';
  }
  if (text === 'null' || text === '~') {
    return null;
  }
  // ⚠ CHỈ nhận số ở dạng thập phân thuần. `1.27` là số, nhưng `1.27-alpine` thì
  // không — `Number.parseFloat` sẽ trả 1.27 và nuốt mất phần `-alpine`, biến một
  // tag image hợp lệ thành một con số. Đó là lỗi im lặng: pod tạo ra được, chỉ là
  // dùng sai image.
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return Number.parseFloat(text);
  }
  return text;
}

// ── Manifest → ResourceSpec phẳng ───────────────────────────────────────────

/**
 * Manifest thật lồng `metadata` / `spec` / `template.metadata.labels`. Từ vựng
 * mà level và mô phỏng dùng thì PHẲNG (`labels` và `containers` cùng cấp), theo
 * quy ước lane C ở `levels/index.ts`.
 *
 * Làm phẳng ở ĐÂY, một chỗ duy nhất, chứ không để mô phỏng đọc được cả hai dạng:
 * hai dạng nghĩa là mọi vị từ, mọi controller phải nhớ thử cả hai, và cái quên
 * đầu tiên sẽ là một level chỉ hỏng khi người chơi gõ YAML thay vì dùng bảng.
 *
 * Chiều ngược lại — người chơi VẪN gõ YAML thật, có `metadata`, có
 * `template.spec` — được giữ nguyên. Dạy một cú pháp YAML riêng của game thì
 * người học mang về cụm thật không dùng được.
 */
export interface Manifest {
  readonly kind: ResourceKind;
  readonly name: string;
  readonly namespace: string;
  readonly spec: Readonly<Record<string, unknown>>;
}

export type ManifestResult =
  | { readonly ok: true; readonly manifests: readonly Manifest[] }
  | { readonly ok: false; readonly error: string };

const RESERVED = new Set(['apiVersion', 'kind', 'metadata', 'spec', 'status']);

export function parseManifests(source: string, defaultNamespace = 'default'): ManifestResult {
  const parsed = parseYaml(source);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  if (parsed.documents.length === 0) {
    return { ok: false, error: 'YAML rỗng — không có manifest nào để áp.' };
  }
  const manifests: Manifest[] = [];
  for (const document of parsed.documents) {
    const record = asYamlMap(document);
    if (record === null) {
      return { ok: false, error: 'Manifest phải là một map ở cấp cao nhất.' };
    }
    const kindText = typeof record['kind'] === 'string' ? record['kind'] : '';
    const kind = resolveKind(kindText);
    if (kind === null) {
      return {
        ok: false,
        error:
          kindText === ''
            ? 'Manifest thiếu trường `kind`.'
            : `Không biết loại tài nguyên "${kindText}".`,
      };
    }
    const metadata = asYamlMap(record['metadata']) ?? {};
    const name = typeof metadata['name'] === 'string' ? metadata['name'] : '';
    if (name === '') {
      return { ok: false, error: `Manifest ${kind} thiếu \`metadata.name\`.` };
    }
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!RESERVED.has(key)) {
        extras[key] = value;
      }
    }
    const spec = asYamlMap(record['spec']) ?? {};
    const merged: Record<string, unknown> = { ...extras, ...spec };
    const labels = asYamlMap(metadata['labels']);
    if (labels !== null) {
      merged['labels'] = labels;
    }
    if (merged['template'] !== undefined) {
      merged['template'] = flattenPodTemplate(merged['template']);
    }
    if (merged['jobTemplate'] !== undefined) {
      merged['jobTemplate'] = flattenJobTemplate(merged['jobTemplate']);
    }
    manifests.push({
      kind,
      name,
      namespace: isNamespaced(kind)
        ? typeof metadata['namespace'] === 'string'
          ? metadata['namespace']
          : defaultNamespace
        : '',
      spec: merged,
    });
  }
  return { ok: true, manifests };
}

function asYamlMap(value: unknown): Record<string, YamlValue> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, YamlValue>;
}

/** `{metadata:{labels}, spec:{containers}}` → `{labels, containers}`. Đã phẳng thì giữ nguyên. */
function flattenPodTemplate(value: unknown): unknown {
  const template = asYamlMap(value);
  if (template === null) {
    return value;
  }
  const metadata = asYamlMap(template['metadata']);
  const spec = asYamlMap(template['spec']);
  if (metadata === null && spec === null) {
    return template;
  }
  const out: Record<string, unknown> = { ...(spec ?? {}) };
  for (const [key, item] of Object.entries(template)) {
    if (key !== 'metadata' && key !== 'spec') {
      out[key] = item;
    }
  }
  const labels = metadata === null ? null : asYamlMap(metadata['labels']);
  if (labels !== null) {
    out['labels'] = labels;
  }
  return out;
}

function flattenJobTemplate(value: unknown): unknown {
  const job = asYamlMap(value);
  if (job === null) {
    return value;
  }
  const spec = asYamlMap(job['spec']) ?? job;
  const out: Record<string, unknown> = { ...spec };
  if (out['template'] !== undefined) {
    out['template'] = flattenPodTemplate(out['template']);
  }
  return out;
}
