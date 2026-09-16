/**
 * Bộ phân tích YAML TỐI THIỂU, trung lập với mọi game.
 *
 * ## Vì sao tự viết thay vì kéo một thư viện
 *
 * `js-yaml` là 40 KB gzip vào bundle của một trang game, để phân tích một tập
 * con mà manifest hạ tầng chỉ dùng đúng một góc. Nặng hơn: nó nhận cả anchor,
 * alias, merge key và tag tuỳ biến — những thứ một người học không cần, và mỗi
 * thứ là một hình dạng đầu vào phải nghĩ tới. Tập con dưới đây là thứ *mọi* ví
 * dụ trong tài liệu của các công cụ hạ tầng phổ biến dùng, và không hơn.
 *
 * ## Vì sao nằm ở `core/` chứ không ở trong một game
 *
 * Bộ quét này ra đời trong game Kubernetes. Game thứ hai cũng cần đọc YAML, và
 * một bộ quét thứ hai sẽ trôi khỏi bộ thứ nhất TRONG IM LẶNG: cả hai đều trả
 * `YamlValue` đúng kiểu, nên không có ô nào đỏ khi chúng bắt đầu bất đồng ý về
 * `#` trong nháy hay về `1.27-alpine`. Một bộ, một chỗ.
 *
 * Đổi lại, file này KHÔNG được biết bất kỳ game nào. Không `import` từ `k8s/`,
 * `git/`, `cicd/`; không tên tài nguyên, không tên nhà cung cấp CI. Phần biết
 * miền nằm ở adapter của từng game.
 *
 * ## Nhận cái gì
 *
 * Map theo thụt lề · dãy `- ` · vô hướng (chuỗi, số, `true`/`false`, `null`) ·
 * chuỗi trong nháy đơn/kép · chú thích `#` · tách tài liệu `---` · tập hợp rỗng
 * dạng dòng (`{}` và `[]`): một map rỗng là cách viết "khớp tất cả", một dãy
 * rỗng là cách viết "không có mục nào" — hai câu mà tài liệu cấu hình nào cũng
 * phải nói được, và cả hai chỉ viết được ở dạng dòng.
 *
 * ## KHÔNG nhận, và báo lỗi rõ ràng
 *
 * Tab thụt lề · anchor/alias · chuỗi nhiều dòng (`|`, `>`) · flow map/list có
 * nội dung. Báo lỗi tiếng Việt kèm DÒNG VÀ CỘT. Im lặng bỏ qua một dòng không
 * hiểu là cách một tài liệu "được nhận" rồi tạo ra một object thiếu field, và
 * người chơi sẽ đi tìm lỗi ở chỗ khác.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

// ── Vị trí ──────────────────────────────────────────────────────────────────

/**
 * Một điểm trong văn bản nguồn.
 *
 * Quy ước, cố định và là HỢP ĐỒNG cho mọi tầng trên:
 *
 * - `line` **1-based** — dòng đầu tiên của nguồn là 1. Đếm theo dòng của nguồn
 *   GỐC, kể cả dòng trống và dòng chỉ có chú thích (những dòng mà bộ quét bỏ
 *   qua): người chơi đếm dòng trong ô nhập của họ, không đếm trong cây đã lọc.
 *   Dấu tách `---` cũng chiếm một dòng.
 * - `column` **1-based** — ký tự đầu dòng là cột 1.
 * - Cột đếm theo **mã đơn vị UTF-16**, tức là đúng chỉ số trong chuỗi JS
 *   (`column - 1 === index`). Ký tự ngoài BMP (emoji) do đó chiếm 2 cột. Chọn
 *   như vậy vì mọi ô nhập trong trình duyệt (`selectionStart`, `Range`) cũng
 *   đếm bằng mã đơn vị UTF-16 — đổi sang "đếm ký tự" sẽ làm con trỏ nhảy sai
 *   đúng ở những chuỗi có dấu tiếng Việt tổ hợp.
 * - `{ line: 0, column: 0 }` là giá trị canh gác nghĩa là **không biết vị trí**;
 *   nó không bao giờ trỏ vào một điểm thật, vì cả hai đều 1-based.
 */
export interface YamlPosition {
  readonly line: number;
  readonly column: number;
}

/** Vị trí của một cặp trong map, hoặc một phần tử trong dãy. */
export interface YamlEntryPosition {
  /**
   * Với map: ký tự đầu của KHOÁ (sau thụt lề, trước dấu nháy nếu khoá có nháy).
   * Với dãy: chính dấu `-` của phần tử.
   *
   * Đây là thứ một lỗi ngữ nghĩa nên trỏ vào — "khoá này tham chiếu tới thứ
   * không tồn tại" là lỗi CỦA KHOÁ, và người đọc tìm khoá chứ không tìm giá trị.
   */
  readonly key: YamlPosition;
  /**
   * Ký tự đầu của GIÁ TRỊ khi giá trị nằm cùng dòng với khoá (`replicas: 3` →
   * trỏ vào `3`). `null` khi giá trị là một khối con ở các dòng dưới — khi đó
   * hãy tra `node()` trên chính giá trị đó để lấy vị trí của khối.
   */
  readonly value: YamlPosition | null;
}

/** Vị trí của một map hoặc một dãy đã phân tích, cùng vị trí của từng thành phần. */
export interface YamlNodePosition {
  /**
   * Vị trí của chính nút: với map là khoá đầu tiên, với dãy là gạch đầu dòng
   * đầu tiên, với `{}`/`[]` dạng dòng là ký tự `{` hoặc `[`.
   */
  readonly self: YamlPosition;
  /**
   * Khoá của map này (giữ nguyên tên sau khi bỏ nháy), hoặc chỉ số của dãy đã
   * đổi sang chuỗi (`'0'`, `'1'`, …). Dùng `key()` / `value()` bên dưới thay vì
   * đọc thẳng map này, để khỏi phải tự nhớ luật đổi chỉ số sang chuỗi.
   */
  readonly entries: ReadonlyMap<string, YamlEntryPosition>;
}

/**
 * Tra cứu ngược: từ một nút TRONG CÂY ĐÃ PHÂN TÍCH về chỗ của nó trong văn bản.
 *
 * ⚠ Tra theo **THAM CHIẾU object**, không theo đường dẫn. Hệ quả phải biết:
 *
 * - Chỉ tra được map và dãy. Một vô hướng (`3`, `'web'`) không phải object nên
 *   không có danh tính riêng — vị trí của nó nằm ở `value` của cặp chứa nó,
 *   tra qua `value(mapCha, 'khoá')`.
 * - **Sao chép cây là mất dấu.** `{ ...node }`, `structuredClone`, `JSON.parse`
 *   của `JSON.stringify`, hay bất kỳ phép làm phẳng nào đều tạo object mới, và
 *   object mới không có trong bản đồ. Tầng nào cần báo lỗi kèm vị trí thì phải
 *   giữ chính cây mà `parseYaml` trả về, chứ không giữ một bản đã biến hình.
 * - Bản đồ giữ tham chiếu YẾU tới các nút, nên nó không giữ cây sống thêm; khi
 *   tầng trên buông cây thì cả hai cùng được thu hồi.
 */
export interface YamlPositionIndex {
  /** Vị trí của một map/dãy, hoặc `null` nếu nút này không đến từ lượt quét đó. */
  node(container: unknown): YamlNodePosition | null;
  /** Vị trí KHOÁ `key` trong map `container` (hoặc dấu `-` của phần tử thứ `key` trong dãy). */
  key(container: unknown, key: string | number): YamlPosition | null;
  /** Vị trí GIÁ TRỊ cùng dòng của `key`; `null` khi giá trị là khối con ở dưới. */
  value(container: unknown, key: string | number): YamlPosition | null;
}

export type YamlResult =
  | {
      readonly ok: true;
      /**
       * Một phần tử cho MỖI tài liệu ngăn bởi `---`, theo đúng thứ tự nguồn —
       * kể cả tài liệu rỗng, xuất hiện ở đây là `null`. Bộ quét cố tình không
       * lọc: "có ba tài liệu, cái giữa rỗng" là thông tin mà một số tầng trên
       * cần báo lại, và tầng nào không cần thì lọc một dòng.
       */
      readonly documents: readonly YamlValue[];
      readonly positions: YamlPositionIndex;
    }
  | {
      readonly ok: false;
      readonly error: string;
      /** Dòng 1-based; `0` nghĩa là không xác định được vị trí. */
      readonly line: number;
      /** Cột 1-based tính bằng mã đơn vị UTF-16; `0` nghĩa là không xác định được. */
      readonly column: number;
    };

// ── Bản đồ vị trí (triển khai) ──────────────────────────────────────────────

interface NodeRecord {
  readonly self: YamlPosition;
  readonly entries: Map<string, YamlEntryPosition>;
}

class PositionIndex implements YamlPositionIndex {
  private readonly nodes = new WeakMap<object, NodeRecord>();

  /** Đăng ký một nút và trả về map entries để nơi gọi ghi tiếp trong lúc quét. */
  open(container: object, self: YamlPosition): Map<string, YamlEntryPosition> {
    const record: NodeRecord = { self, entries: new Map() };
    this.nodes.set(container, record);
    return record.entries;
  }

  node(container: unknown): YamlNodePosition | null {
    if (typeof container !== 'object' || container === null) {
      return null;
    }
    return this.nodes.get(container) ?? null;
  }

  key(container: unknown, key: string | number): YamlPosition | null {
    return this.entry(container, key)?.key ?? null;
  }

  value(container: unknown, key: string | number): YamlPosition | null {
    return this.entry(container, key)?.value ?? null;
  }

  private entry(container: unknown, key: string | number): YamlEntryPosition | undefined {
    return this.node(container)?.entries.get(String(key));
  }
}

// ── Cắt dòng ────────────────────────────────────────────────────────────────

interface Line {
  /** Số dấu cách thụt lề — đại lượng LOGIC mà phép phân tích so sánh với nhau. */
  readonly indent: number;
  /** Nội dung đã bỏ chú thích và trim hai đầu. */
  readonly text: string;
  /** Dòng 1-based trong nguồn gốc. */
  readonly number: number;
  /**
   * Cột 1-based của ký tự đầu của `text` trong nguồn gốc. Tách khỏi `indent` vì
   * một dòng ẢO (phần sau `- ` của `- name: web`) có `indent` do luật phân tích
   * quyết định, còn `column` phải là chỗ thật trong văn bản người chơi gõ.
   */
  readonly column: number;
}

class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
  }
}

export function parseYaml(source: string): YamlResult {
  const index = new PositionIndex();
  try {
    const documents: YamlValue[] = [];
    for (const block of splitDocuments(source)) {
      const lines = readLines(block.text, block.offset);
      documents.push(
        lines.length === 0 ? null : parseBlock(lines, 0, lines[0]?.indent ?? 0, index).value,
      );
    }
    return { ok: true, documents, positions: index };
  } catch (error) {
    if (error instanceof YamlError) {
      return { ok: false, error: error.message, line: error.line, column: error.column };
    }
    return { ok: false, error: 'Không đọc được YAML.', line: 0, column: 0 };
  }
}

function splitDocuments(source: string): readonly { text: string; offset: number }[] {
  const out: { text: string; offset: number }[] = [];
  let current: string[] = [];
  let offset = 0;
  let index = 0;
  // `\r` bị cắt ở đây chứ không ở chỗ khác: một file YAML dán từ Windows có CRLF,
  // và `\r` sót lại sẽ nằm im trong giá trị chuỗi rồi làm mọi phép so tên tài
  // nguyên trượt — hỏng lặng lẽ, đúng loại lỗi repo đã trả giá một lần. `\r` chỉ
  // đứng cuối dòng nên việc cắt không xê dịch cột của bất kỳ ký tự nào.
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
    const tab = raw.indexOf('\t');
    if (tab !== -1) {
      throw new YamlError(
        'YAML không cho phép dùng tab để thụt lề — hãy dùng dấu cách.',
        number,
        tab + 1,
      );
    }
    const withoutComment = stripComment(raw);
    if (withoutComment.trim() === '') {
      continue;
    }
    const indent = withoutComment.length - withoutComment.trimStart().length;
    out.push({ indent, text: withoutComment.trim(), number, column: indent + 1 });
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

function parseBlock(
  lines: readonly Line[],
  start: number,
  indent: number,
  index: PositionIndex,
): Parsed {
  const first = lines[start];
  if (first === undefined) {
    return { value: null, next: start };
  }
  return first.text.startsWith('- ') || first.text === '-'
    ? parseSequence(lines, start, indent, index)
    : parseMapping(lines, start, indent, index);
}

function parseSequence(
  lines: readonly Line[],
  start: number,
  indent: number,
  index: PositionIndex,
): Parsed {
  const items: YamlValue[] = [];
  const anchor = lines[start];
  const entries = index.open(
    items,
    anchor === undefined ? { line: 0, column: 0 } : { line: anchor.number, column: anchor.column },
  );
  let cursor = start;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined || line.indent < indent) {
      break;
    }
    if (line.indent > indent || !(line.text.startsWith('- ') || line.text === '-')) {
      throw new YamlError(
        `Dòng ${line.number}: thụt lề không khớp với dãy đang mở.`,
        line.number,
        line.column,
      );
    }
    const dash: YamlPosition = { line: line.number, column: line.column };
    const slot = String(items.length);
    const inlineOffset = line.text === '-' ? -1 : 2 + leadingSpaces(line.text.slice(2));
    const inline = line.text === '-' ? '' : line.text.slice(2).trim();
    cursor += 1;
    if (inline === '') {
      entries.set(slot, { key: dash, value: null });
      const parsed = parseBlock(lines, cursor, lines[cursor]?.indent ?? indent + 2, index);
      items.push(parsed.value);
      cursor = parsed.next;
      continue;
    }
    const at: YamlPosition = { line: line.number, column: line.column + inlineOffset };
    // `- name: web` mở một map NGAY TRÊN cùng dòng với gạch đầu dòng. Các dòng
    // sau của map đó thụt sâu hơn gạch đầu dòng chứ không thụt theo `name`, nên
    // phải ghép dòng ảo này với phần còn lại chứ không đọc nó như một vô hướng.
    if (isMappingEntry(inline)) {
      entries.set(slot, { key: dash, value: at });
      const virtual: Line = {
        indent: indent + 2,
        text: inline,
        number: line.number,
        column: at.column,
      };
      const rest = collectDeeper(lines, cursor, indent);
      const parsed = parseMapping([virtual, ...rest.lines], 0, indent + 2, index);
      items.push(parsed.value);
      cursor = rest.next;
      continue;
    }
    entries.set(slot, { key: dash, value: at });
    items.push(parseScalar(inline, at, index));
  }
  return { value: items, next: cursor };
}

function leadingSpaces(text: string): number {
  return text.length - text.trimStart().length;
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

function parseMapping(
  lines: readonly Line[],
  start: number,
  indent: number,
  index: PositionIndex,
): Parsed {
  const map: Record<string, YamlValue> = {};
  const anchor = lines[start];
  const entries = index.open(
    map,
    anchor === undefined ? { line: 0, column: 0 } : { line: anchor.number, column: anchor.column },
  );
  let cursor = start;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined || line.indent < indent) {
      break;
    }
    if (line.indent > indent) {
      throw new YamlError(
        `Dòng ${line.number}: thụt lề sâu hơn mức của map đang mở.`,
        line.number,
        line.column,
      );
    }
    const split = splitKey(line.text);
    if (split === null) {
      throw new YamlError(
        `Dòng ${line.number}: không phải cặp "khoá: giá trị" — YAML của manifest cần dấu hai chấm.`,
        line.number,
        line.column,
      );
    }
    const at: YamlPosition = { line: line.number, column: line.column };
    cursor += 1;
    if (split.value === '') {
      entries.set(split.key, { key: at, value: null });
      const child = lines[cursor];
      if (child === undefined || child.indent <= indent) {
        map[split.key] = null;
        continue;
      }
      const parsed = parseBlock(lines, cursor, child.indent, index);
      map[split.key] = parsed.value;
      cursor = parsed.next;
      continue;
    }
    const valueAt: YamlPosition = { line: line.number, column: line.column + split.valueOffset };
    entries.set(split.key, { key: at, value: valueAt });
    map[split.key] = parseScalar(split.value, valueAt, index);
  }
  return { value: map, next: cursor };
}

function isMappingEntry(text: string): boolean {
  return splitKey(text) !== null;
}

interface KeySplit {
  readonly key: string;
  readonly value: string;
  /** Chỉ số 0-based trong `text` nơi giá trị bắt đầu; `-1` khi không có giá trị cùng dòng. */
  readonly valueOffset: number;
}

/** Tách ở dấu `:` đầu tiên NGOÀI nháy — `image: "a:b"` có khoá `image`. */
function splitKey(text: string): KeySplit | null {
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
      const rest = text.slice(i + 1);
      const value = rest.trim();
      return {
        key: unquote(text.slice(0, i).trim()),
        value,
        valueOffset: value === '' ? -1 : i + 1 + leadingSpaces(rest),
      };
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

function parseScalar(text: string, at: YamlPosition, index: PositionIndex): YamlValue {
  if (text === '{}') {
    const empty: Record<string, YamlValue> = {};
    index.open(empty, at);
    return empty;
  }
  if (text === '[]') {
    const empty: YamlValue[] = [];
    index.open(empty, at);
    return empty;
  }
  if (text.startsWith('|') || text.startsWith('>')) {
    throw new YamlError(
      `Dòng ${at.line}: chuỗi nhiều dòng (| và >) chưa được hỗ trợ trong game.`,
      at.line,
      at.column,
    );
  }
  if (text.startsWith('&') || text.startsWith('*')) {
    throw new YamlError(
      `Dòng ${at.line}: anchor/alias của YAML chưa được hỗ trợ trong game.`,
      at.line,
      at.column,
    );
  }
  if (text.startsWith('[') || text.startsWith('{')) {
    throw new YamlError(
      `Dòng ${at.line}: chỉ nhận [] và {} rỗng ở dạng dòng; hãy viết danh sách bằng gạch đầu dòng.`,
      at.line,
      at.column,
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
  // tag image hợp lệ thành một con số. Đó là lỗi im lặng: tài nguyên tạo ra
  // được, chỉ là dùng sai image.
  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return Number.parseFloat(text);
  }
  return text;
}
