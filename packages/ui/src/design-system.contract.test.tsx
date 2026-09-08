import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as UI from './index.ts';
import { Badge, type BadgeVariant } from './index.ts';

/**
 * Cổng cho **chính `docs/design-system.md`**.
 *
 * ## Lỗ hổng nó bịt
 *
 * Ô nghiệm thu 13 nói: "mọi component mới có đủ 4 trạng thái
 * loading/empty/error/disabled (**checklist trong `docs/design-system.md`**)".
 * Trước file này, KHÔNG test nào đọc tài liệu đó. Nên đường đi để ô AC xanh mà
 * điều nó khẳng định lại sai là hoàn toàn thông: thêm một component, khai nó ở
 * `index.ts`, cập nhật `exports.contract.test.ts` — và quên bảng §4a. Cả
 * `typecheck`, `lint`, `test` đều xanh. Ô AC dựa vào một tài liệu mà không có
 * gì buộc tài liệu đó đúng.
 *
 * Hai cổng sẵn có gác hai thứ KHÁC: `tokens.contract.test.ts` gác token
 * (`globals.css`), `exports.contract.test.ts` gác bề mặt export. Không cái nào
 * mở tài liệu ra. Đây là cổng thứ ba, và nó chỉ gác một mệnh đề: **tài liệu
 * mô tả đúng cái đang có trong mã.**
 *
 * ## Vì sao lấy danh sách từ `index.ts` chứ không từ `exports.contract.test.ts`
 *
 * `C2_EXPORTS` là một `const` NẰM TRONG một file test, không được export. Muốn
 * dùng lại thì phải import một file test vào file test khác — mọi `describe`
 * của nó sẽ chạy lần hai. Còn nguồn mà chính `C2_EXPORTS` đối chiếu tới là
 * namespace runtime của `index.ts`, nên đọc thẳng nguồn đó **không phải là cơ
 * chế thứ hai** — nó là cùng một nguồn, bớt một lớp trung gian. Hệ quả có lợi:
 * `SCROLL_REGION_FOCUS` (lane khác thêm vào ngày 2026-09-06, giữa lúc viết
 * file này) xuất hiện ở đây ngay lập tức, không chờ ai chép tay sang.
 *
 * ## Ba phép kiểm, và cả ba đều ĐỎ ĐƯỢC
 *
 * Mỗi phép kiểm là một hàm THUẦN nhận markdown, nên đối chứng dương ở cuối file
 * chạy được chúng trên các bản đã bị bẻ gãy có chủ đích (thêm component ma, xoá
 * một dòng thật, làm rỗng một ô). Một test chỉ đọc file rồi khẳng định "file
 * không rỗng" là test không bao giờ đỏ — đúng thứ đã để ô AC này hở.
 */

/**
 * ⚠ KHÔNG dùng `import.meta.url`: môi trường jsdom cấp một URL scheme
 * **http://localhost/**, nên `fileURLToPath()` ném `TypeError` NGAY LÚC NẠP
 * module — cả file báo "0 test" thay vì một assertion đỏ, rất dễ đọc nhầm
 * thành "chưa viết test".
 *
 * Hàm này lặp lại `workspaceRoot()` của `theme/tokens.contract.test.ts` một
 * cách CÓ Ý THỨC. Gộp lại thành helper dùng chung là việc đúng, nhưng nó buộc
 * phải sửa `theme/tokens.contract.test.ts` — file thuộc lane khác đang viết dở.
 * Tám dòng trùng đổi lấy việc không đụng vào file của người khác; khi hai lane
 * đã hạ cánh thì tách ra `src/test-support/workspace-root.ts`.
 */
function workspaceRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Không tìm thấy gốc workspace từ ' + process.cwd());
    dir = parent;
  }
}

const DOC_PATH = resolvePath(workspaceRoot(), 'docs/design-system.md');
const DOC = readFileSync(DOC_PATH, 'utf8');

// ─── Đọc bảng markdown ───────────────────────────────────────────────────────

interface MarkdownTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/** Thân của một mục, từ dòng tiêu đề `prefix` tới tiêu đề `##`/`###` kế tiếp. */
function sectionBody(md: string, headingPrefix: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex((line) => line.startsWith(headingPrefix));
  if (start === -1) throw new Error(`Không tìm thấy mục bắt đầu bằng "${headingPrefix}" trong ${DOC_PATH}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{2,3} /.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/**
 * Bảng markdown ĐẦU TIÊN trong `body`, cắt ô theo dấu `|`.
 *
 * Số ô của mỗi hàng KHÔNG được suy ra rồi bỏ qua — hàng lệch số ô được trả về
 * nguyên trạng để phép kiểm gọi hàm này tự báo. Một ô chứa `|` không escape
 * (rất dễ xảy ra khi ai đó viết `shadow-elevation-1|2`) sẽ làm hàng vỡ thành
 * sáu ô, và im lặng bỏ qua nó là cách bảng này mục ruỗng.
 */
function parseTable(body: string): MarkdownTable {
  const lines = body.split('\n').filter((line) => line.trimStart().startsWith('|'));
  if (lines.length < 3) throw new Error('Không tìm thấy bảng markdown (cần tối thiểu tiêu đề + kẻ + 1 hàng)');

  const cells = (line: string): string[] => {
    const parts = line.trim().split('|');
    return parts.slice(1, parts.length - 1).map((cell) => cell.trim());
  };

  const headers = cells(lines[0] as string);
  const isRule = (line: string): boolean => /^\|[\s:|-]+\|$/.test(line.trim());
  const rows = lines.slice(1).filter((line) => !isRule(line)).map(cells);
  return { headers, rows };
}

/** Chỉ số cột theo tên tiêu đề — bảng đổi thứ tự cột thì phép kiểm vẫn đúng. */
function columnIndex(table: MarkdownTable, header: string): number {
  const index = table.headers.indexOf(header);
  if (index === -1) {
    throw new Error(`Bảng không còn cột "${header}". Có: ${table.headers.join(' | ')}`);
  }
  return index;
}

// ─── §4a — checklist 4 trạng thái ────────────────────────────────────────────

const STATE_COLUMNS = ['Loading', 'Empty', 'Error', 'Disabled'] as const;

/**
 * Tên component trong ô đầu của một hàng §4a.
 *
 * Hai cách viết, cả hai đều đang dùng trong bảng:
 *
 * - liệt kê thẳng — `` `Toaster` / `useToast` ``, `` `ContentView`/`SplitPane` ``;
 * - gộp sub-part — `` `Card` (+Header/Title/Content) `` ⇒ `Card`, `CardHeader`,
 *   `CardTitle`, `CardContent`. Tiền tố là tên đứng LIỀN TRƯỚC nhóm, nên
 *   `` `Select` (+Value/Group) `` ra `SelectValue`/`SelectGroup` chứ không ghép
 *   nhầm vào một tên nào khác trong hàng.
 */
function namesInCell(cell: string): string[] {
  const names: string[] = [];
  const token = /`([A-Za-z][A-Za-z0-9]*)`|\(\+([^)]+)\)/g;
  let match: RegExpExecArray | null;
  let lastStandalone: string | null = null;

  while ((match = token.exec(cell)) !== null) {
    const [, standalone, group] = match;
    if (standalone !== undefined) {
      lastStandalone = standalone;
      names.push(standalone);
      continue;
    }
    if (group !== undefined) {
      if (lastStandalone === null) {
        throw new Error(`Nhóm "(+${group})" không có tên đứng trước để ghép, ở ô: ${cell}`);
      }
      for (const part of group.split('/')) {
        names.push(lastStandalone + part.trim());
      }
    }
  }
  return names;
}

interface ChecklistAudit {
  /**
   * Hàng không đọc được: số ô khác 5 (thường là một `|` chưa escape), hoặc ô
   * đầu không chứa tên component nào.
   *
   * Vế thứ hai được thêm sau khi đối chứng dương bên dưới bắt được nó: bản đầu
   * của `namesInCell` chỉ khớp `[A-Za-z0-9]`, nên một hàng có tên ngoài bảng
   * chữ đó (dấu tiếng Việt, gạch nối) bị **bỏ qua trong im lặng** — hàng nằm
   * đấy, không component nào khớp, và cổng vẫn xanh. Một hàng không phân tích
   * được phải KÊU, chứ không được biến mất khỏi phép kiểm.
   */
  readonly malformedRows: readonly string[];
  /** Ô trạng thái rỗng, hoặc chỉ có `—` (chú giải §4a chỉ định nghĩa `n/a`). */
  readonly undeclaredStates: readonly string[];
  /** Component được export nhưng KHÔNG có dòng nào trong bảng. */
  readonly missingFromDoc: readonly string[];
  /** Dòng trong bảng trỏ tới một tên KHÔNG còn được export. */
  readonly staleInDoc: readonly string[];
}

function auditChecklist(md: string, exported: readonly string[]): ChecklistAudit {
  const table = parseTable(sectionBody(md, '### 4a.'));
  const componentColumn = columnIndex(table, 'Component');
  const stateColumns = STATE_COLUMNS.map((name) => [name, columnIndex(table, name)] as const);

  const malformedRows: string[] = [];
  const undeclaredStates: string[] = [];
  const documented = new Set<string>();

  for (const row of table.rows) {
    if (row.length !== table.headers.length) {
      malformedRows.push(`${row.length} ô (cần ${table.headers.length}): ${row.join(' | ').slice(0, 90)}`);
      continue;
    }
    const label = row[componentColumn] as string;
    const names = namesInCell(label);
    if (names.length === 0) {
      malformedRows.push(`ô đầu không chứa tên component nào: ${label.slice(0, 90)}`);
      continue;
    }
    for (const name of names) documented.add(name);

    for (const [stateName, index] of stateColumns) {
      const cell = (row[index] ?? '').trim();
      if (cell === '' || cell === '—' || cell === '-') {
        undeclaredStates.push(`${label} → cột ${stateName} bỏ trống ("${cell}")`);
      }
    }
  }

  return {
    malformedRows,
    undeclaredStates,
    missingFromDoc: exported.filter((name) => !documented.has(name)),
    staleInDoc: [...documented].filter((name) => !exported.includes(name)),
  };
}

/**
 * Export KHÔNG cần dòng ở §4a, kèm lý do từng cái.
 *
 * Danh sách miễn trừ là chỗ một cổng hay chết: thêm component rồi thêm luôn tên
 * nó vào đây thì cổng im. Nên nó (a) yêu cầu một lý do viết ra, và (b) có phép
 * kiểm đối ứng bên dưới — một tên đã ngừng được export mà còn nằm đây là rác,
 * và rác trong danh sách miễn trừ chính là cách nó lớn dần lên.
 */
const NOT_IN_CHECKLIST: Readonly<Record<string, string>> = {
  cn: 'tiện ích class, không phải component — không có trạng thái để khai',
  ThemeProvider: 'cơ chế theme, đã tả ở §2; không phải primitive trình bày',
  useTheme: 'hook đọc theme, không render gì',
  THEME_STORAGE_KEY: 'hằng chuỗi',
  THEME_INIT_SCRIPT: 'hằng chuỗi (script nhúng trước paint, §2)',
  SCROLL_REGION_FOCUS: 'hằng chuỗi class focus cho vùng cuộn — xem lesson/scroll-region.ts',
};

/** Tên export mà tài liệu PHẢI mô tả. */
function componentExports(): string[] {
  return Object.keys(UI)
    .filter((name) => !Object.hasOwn(NOT_IN_CHECKLIST, name))
    .sort();
}

describe('§4a — checklist 4 trạng thái mô tả đúng bề mặt export', () => {
  const audit = auditChecklist(DOC, componentExports());

  it('mọi hàng có đủ 5 ô (không có `|` lạc trong ô)', () => {
    expect(audit.malformedRows).toEqual([]);
  });

  it('mọi component export ĐỀU có dòng trong bảng', () => {
    expect(
      audit.missingFromDoc,
      'Component được export nhưng vắng mặt ở §4a của docs/design-system.md. ' +
        'Thêm một dòng khai đủ 4 trạng thái (dùng `n/a` + lý do ngắn cho trạng thái không áp dụng). ' +
        'Nếu đây KHÔNG phải component (hằng/tiện ích/hook) ⇒ khai vào NOT_IN_CHECKLIST kèm lý do.',
    ).toEqual([]);
  });

  it('không dòng nào trỏ tới component đã bị xoá', () => {
    expect(
      audit.staleInDoc,
      'Bảng §4a còn dòng cho tên không còn được export từ packages/ui/src/index.ts. ' +
        'Xoá component thì xoá luôn dòng của nó — một bảng tả những thứ không tồn tại ' +
        'còn tệ hơn không có bảng.',
    ).toEqual([]);
  });

  it('mọi hàng khai ĐỦ CẢ BỐN trạng thái, không ô nào bỏ trống', () => {
    expect(
      audit.undeclaredStates,
      'Ô trạng thái bỏ trống. Chú giải §4a chỉ định nghĩa `n/a` (kèm lý do ngắn); ' +
        'một ô rỗng hay một gạch ngang trần thì người đọc không phân biệt được ' +
        '"không áp dụng" với "chưa ai nghĩ tới".',
    ).toEqual([]);
  });

  it('danh sách miễn trừ không có tên đã chết (đối ứng của chính nó)', () => {
    const stale = Object.keys(NOT_IN_CHECKLIST).filter((name) => !Object.hasOwn(UI, name));
    expect(
      stale,
      'NOT_IN_CHECKLIST còn tên không còn được export. Miễn trừ cho một thứ đã biến mất ' +
        'là một lỗ hổng vĩnh viễn: tên đó quay lại dưới dạng component thật sẽ đi thẳng qua cổng.',
    ).toEqual([]);
  });
});

// ─── §4c — bảng icon của Badge ───────────────────────────────────────────────

/** `SignalLow` → `signal-low`; đúng quy ước tên class `lucide-*` khi render. */
function kebab(pascal: string): string {
  return pascal.replace(/(?<!^)([A-Z])/g, '-$1').toLowerCase();
}

interface DocumentedIcon {
  readonly variant: string;
  readonly icon: string;
}

function documentedIcons(md: string): DocumentedIcon[] {
  const table = parseTable(sectionBody(md, '### 4c.'));
  const variantColumn = columnIndex(table, 'Biến thể');
  const iconColumn = columnIndex(table, 'Icon');

  return table.rows.map((row) => {
    const read = (index: number): string => {
      const cell = row[index] ?? '';
      const match = /`([^`]+)`/.exec(cell);
      if (match === null) throw new Error(`Ô "${cell}" thiếu tên trong dấu backtick`);
      return match[1] as string;
    };
    return { variant: read(variantColumn), icon: read(iconColumn) };
  });
}

/** Class `lucide-<tên>` của `<svg>` đầu tiên — thứ duy nhất phân biệt icon trong jsdom. */
function renderedIcon(variant: string): string | null {
  const { container } = render(<Badge variant={variant as BadgeVariant}>Nhãn</Badge>);
  const svg = container.querySelector('svg');
  if (svg === null) return null;
  return Array.from(svg.classList).find((name) => name.startsWith('lucide-')) ?? null;
}

afterEach(() => {
  cleanup();
});

/**
 * `badge.test.tsx` đã gác rằng bảy biến thể có icon và các icon KHÁC NHAU. Nó
 * KHÔNG gác cặp cụ thể nào — đổi `difficulty-basic` từ `SignalLow` sang
 * `SignalHigh` thì mọi test ở đó vẫn xanh (vẫn đủ ba hình khác nhau), trong khi
 * bảng §4c đã in ra một lời hứa cụ thể: "1 vạch". Đây là chiều mà cổng kia
 * không với tới: **tài liệu → mã**.
 *
 * Cột "Nhãn tiếng Việt" cố ý KHÔNG được gác ở đây: nhãn nằm ở
 * `apps/web/src/components/catalog/catalog-labels.ts` (ngoài package này), và
 * `status-locked` chưa có nơi gọi nào nên nửa bảng sẽ không có gì để đối chiếu.
 * Một phép kiểm chỉ phủ được một nửa miền của nó thì dễ đọc thành bảo đảm đầy
 * đủ hơn là nó thật sự có.
 */
describe('§4c — bảng icon của Badge khớp DOM thật', () => {
  const documented = documentedIcons(DOC);

  it('bảng liệt kê đủ tám biến thể ngữ nghĩa', () => {
    expect(documented.map((row) => row.variant)).toEqual([
      'difficulty-basic',
      'difficulty-intermediate',
      'difficulty-advanced',
      'difficulty-expert',
      'status-todo',
      'status-progress',
      'status-done',
      'status-locked',
    ]);
  });

  it.each(documentedIcons(DOC))('variant=$variant render đúng icon $icon mà tài liệu hứa', (row) => {
    expect(
      renderedIcon(row.variant),
      `§4c nói \`${row.variant}\` dùng \`${row.icon}\`. Sửa mã hoặc sửa tài liệu — ` +
        'đừng để hai bên nói hai chuyện khác nhau.',
    ).toBe('lucide-' + kebab(row.icon));
  });
});

// ─── Đối chứng dương — cổng này ĐỎ ĐƯỢC ─────────────────────────────────────

/**
 * Bốn phép bẻ gãy có chủ đích, chạy trên bản markdown TRONG BỘ NHỚ (không ghi
 * vào file). Không có khối này thì cả cổng chỉ chứng minh được rằng tài liệu
 * hiện tại đang đúng — chứ không chứng minh rằng nó biết kêu khi tài liệu sai,
 * và hai điều đó khác nhau đúng bằng toàn bộ giá trị của một cổng.
 */
describe('đối chứng dương — cổng đỏ khi tài liệu sai', () => {
  const exported = componentExports();

  it('thêm một component MA vào bảng ⇒ báo dòng thừa', () => {
    const broken = DOC.replace(
      '| `Kbd` | n/a | n/a | n/a | n/a |',
      '| `Kbd` | n/a | n/a | n/a | n/a |\n| `GhostComponent` | n/a | n/a | n/a | n/a |',
    );
    expect(broken).not.toBe(DOC);
    expect(auditChecklist(broken, exported).staleInDoc).toContain('GhostComponent');
  });

  /**
   * Đối chứng cho chính phép phân tích tên. Bản đầu của `namesInCell` chỉ khớp
   * `[A-Za-z0-9]`, nên hàng ma đầu tiên viết ở đây (`KhôngHềTồnTại`) đi lọt —
   * cổng xanh trong khi bảng có một dòng rác. Giữ ca đó lại vĩnh viễn: một
   * hàng không phân tích được phải rơi vào `malformedRows`, không được im.
   */
  it('hàng có tên KHÔNG phải định danh ⇒ báo hàng hỏng, không bỏ qua im lặng', () => {
    const broken = DOC.replace(
      '| `Kbd` | n/a | n/a | n/a | n/a |',
      '| `Kbd` | n/a | n/a | n/a | n/a |\n| `KhôngHềTồnTại` | n/a | n/a | n/a | n/a |',
    );
    expect(broken).not.toBe(DOC);
    expect(auditChecklist(broken, exported).malformedRows.join('\n')).toContain('KhôngHềTồnTại');
  });

  /**
   * ⚠ `\r?` KHÔNG thừa — bỏ nó đi là ca này ĐỎ trên mọi checkout Windows.
   *
   * `.` trong regex JS không khớp `\r` (nó là line terminator), nên `.*\n` dừng
   * trước `\r` rồi đòi `\n` và không bao giờ khớp trên file CRLF. Khi đó
   * `replace` không xoá gì, `broken === DOC`, và ô đỏ là chính ĐỐI CHỨNG DƯƠNG —
   * đọc ra như "tài liệu sai" trong khi tài liệu hoàn toàn đúng.
   *
   * Git chuyển LF→CRLF lúc checkout trên Windows, nên lỗi này vô hình trên CI
   * Linux và chỉ cắn máy dev. Đo 2026-09-07: 593 xanh / 2 đỏ, cả hai ở đây.
   */
  it('xoá một dòng THẬT ⇒ báo component thiếu tài liệu', () => {
    const broken = DOC.replace(/^\| `Badge` \|.*\r?\n/m, '');
    expect(broken).not.toBe(DOC);
    expect(auditChecklist(broken, exported).missingFromDoc).toContain('Badge');
  });

  it('xoá một dòng GỘP ⇒ báo thiếu CẢ sub-part, không chỉ tên gốc', () => {
    const broken = DOC.replace(/^\| `Alert` \(\+Title\/Description\).*\r?\n/m, '');
    expect(broken).not.toBe(DOC);
    const { missingFromDoc } = auditChecklist(broken, exported);
    expect(missingFromDoc).toEqual(expect.arrayContaining(['Alert', 'AlertTitle', 'AlertDescription']));
  });

  it('làm rỗng một ô trạng thái ⇒ báo trạng thái chưa khai', () => {
    const broken = DOC.replace(
      '| `Skeleton` | CHÍNH LÀ trạng thái loading (khối chờ tải) | n/a | n/a | n/a |',
      '| `Skeleton` | CHÍNH LÀ trạng thái loading (khối chờ tải) |  | n/a | n/a |',
    );
    expect(broken).not.toBe(DOC);
    expect(auditChecklist(broken, exported).undeclaredStates.join('\n')).toContain('Empty');
  });

  it('đổi icon trong bảng §4c ⇒ lệch với DOM thật', () => {
    const broken = DOC.replace('| `difficulty-basic` | Cơ bản | `SignalLow` |', '| `difficulty-basic` | Cơ bản | `SignalHigh` |');
    expect(broken).not.toBe(DOC);
    const row = documentedIcons(broken).find((entry) => entry.variant === 'difficulty-basic');
    expect(row?.icon).toBe('SignalHigh');
    expect(renderedIcon('difficulty-basic')).not.toBe('lucide-' + kebab(row?.icon ?? ''));
  });

  it('phép kiểm hàng lệch ô bắt được một `|` lạc', () => {
    const broken = DOC.replace(
      '| `Kbd` | n/a | n/a | n/a | n/a |',
      '| `Kbd` | n/a | n/a | n/a | n/a | thừa |',
    );
    expect(broken).not.toBe(DOC);
    expect(auditChecklist(broken, exported).malformedRows).not.toEqual([]);
  });
});
