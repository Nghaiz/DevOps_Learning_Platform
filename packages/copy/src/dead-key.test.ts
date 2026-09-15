import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { MESSAGES, SURFACE_PREFIXES } from './registry.ts';

/**
 * **Cổng CHIỀU NGƯỢC của T4, cho CẢ MƯỜI MỘT surface.**
 *
 * T4 xuôi (`ui-source-coverage.test.ts`, cộng các `copy-gate.test.ts` của từng
 * lane) hỏi "còn chuỗi người dùng nào nằm ngoài bản đồ không". Không cổng nào
 * hỏi câu ngược lại: "còn khoá nào trong bản đồ mà không nơi nào gọi không".
 *
 * Lớp lỗi đó KHÔNG làm màn hình sai, nên không cổng nào khác thấy nó. Nó chỉ
 * lớn dần cho tới lúc bản đồ mô tả một giao diện không còn tồn tại. Hai khoá
 * `catalog.toolbar.topic-legend` và `catalog.toolbar.search-label` đã sống qua
 * mọi cổng của P16 và chỉ lộ ra khi có người đọc tay; chúng đã bị xoá, nhưng
 * lỗ hổng thì tới file này mới được bịt.
 *
 * Hai lane 16.F và 16.H đã dựng cổng ngược cho RIÊNG surface của mình bằng
 * grep văn bản trên file surface. File này thay phép grep đó bằng hai thứ mạnh
 * hơn, và phủ cả mười một surface thay vì hai:
 *
 * · tập khoá lấy thẳng từ `Object.keys(MESSAGES)`, không phải regex trên file
 *   nguồn. Một bảng miễn trừ trông giống bản đồ không còn đọc ra thành khoá,
 *   và một khoá khai bằng hình dạng lạ cũng không còn lọt.
 * · nơi gọi đọc bằng CÂY CÚ PHÁP, không phải `String.includes`. Một khoá chỉ
 *   được nhắc trong chú thích không còn được tính là còn sống.
 *
 * ## Dương tính giả, thứ phải tránh trước tiên
 *
 * Một cổng ngây thơ báo chết mọi khoá được gọi bằng khoá GHÉP lúc chạy, ví dụ
 * `` t(`home.demo.${topic}.title`) ``, và cổng đó sẽ bị tắt trong tuần đầu.
 * Repo hiện có 18 hình dạng ghép như vậy (`home.journey.stage${chapter}.kicker`,
 * `admin.health.source.${name}`, `me.role.${role}`, ...), nên đây là chuyện
 * chắc chắn chứ không phải rủi ro.
 *
 * Cách xử lý: mỗi template literal ở nơi gọi được dịch thành một BIỂU THỨC
 * KHỚP, phần nội suy thành một đoạn khoá `[A-Za-z0-9_-]+` không vượt qua dấu
 * chấm. `home.journey.stage${chapter}.kicker` vì vậy nhận đúng
 * `home.journey.stage0.kicker`, và KHÔNG nhận `home.journey.stage0.body`.
 *
 * Phần nội suy không vượt dấu chấm là điều kiện để cổng còn ý nghĩa: nếu nó
 * vượt, một dòng `` `${a}.${b}` `` ở bất kỳ đâu trong repo sẽ nhận mọi khoá và
 * cổng thành no-op xanh vĩnh viễn. Cùng lý do, một template chỉ được tính khi
 * phần ĐẦU của nó mở bằng một tiền tố surface đã khai; `` `${x}.${y}` `` không
 * mở bằng tiền tố nào nên bị bỏ qua hoàn toàn. Có ô đối chứng cho cả hai.
 *
 * ## Phạm vi quét, và cái giá của nó
 *
 * Chỉ mã SẢN PHẨM: `apps/web/src`, `packages/games/src`, `packages/ui/src`,
 * bỏ file `.test.`/`.spec.`. Một khoá chỉ xuất hiện trong file test hoặc trong
 * `e2e/` là khoá chết theo đúng nghĩa: không đường nào đưa nó tới người dùng.
 * Giá phải trả là một khoá được e2e khẳng định nhưng sản phẩm gọi bằng đường
 * khác sẽ bị báo; cách xử lý đúng lúc đó là nối nó vào sản phẩm, không phải
 * nới danh sách này.
 */

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const CALL_SITE_DIRS: readonly string[] = [
  join('apps', 'web', 'src'),
  join('packages', 'games', 'src'),
  join('packages', 'ui', 'src'),
];

const SKIP_DIRS: ReadonlySet<string> = new Set(['node_modules', '.next', '.turbo', 'gen']);

/** Mọi tiền tố hợp lệ, lấy từ chính bảng của `registry.ts`, không gõ lại. */
const PREFIXES: readonly string[] = Object.values(SURFACE_PREFIXES).flat();

interface SourceInput {
  readonly file: string;
  readonly source: string;
}

interface KeyUses {
  /** Khoá xuất hiện nguyên văn trong một literal chuỗi. */
  readonly exact: ReadonlySet<string>;
  /** Khoá ghép lúc chạy, mỗi template literal thành một biểu thức khớp. */
  readonly dynamic: readonly RegExp[];
}

/** Một ĐOẠN khoá. Không chứa dấu chấm, nên phần ghép không nuốt cả bản đồ. */
const SEGMENT = '[A-Za-z0-9_-]+';

/**
 * Các mảnh CHỮ của một template literal, theo thứ tự, thành một biểu thức khớp.
 *
 * Ghép thẳng từ mảng thay vì nối lại thành một chuỗi rồi cắt theo ký tự dấu
 * chỗ: mọi ký tự dùng làm dấu chỗ đều có thể xuất hiện thật trong mã nguồn, và
 * lúc đó phép cắt sinh thêm chỗ trống, tức là nới bộ dò trong im lặng.
 */
function templatePattern(pieces: readonly string[]): RegExp {
  const body = pieces.map((piece) => piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(SEGMENT);
  return new RegExp(`^${body}$`);
}

function collectKeyUses(inputs: readonly SourceInput[]): KeyUses {
  const exact = new Set<string>();
  const dynamic: RegExp[] = [];

  for (const input of inputs) {
    const tree = ts.createSourceFile(
      input.file,
      input.source,
      ts.ScriptTarget.Latest,
      false,
      input.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        exact.add(node.text);
      } else if (ts.isTemplateExpression(node)) {
        const head = node.head.text;
        if (PREFIXES.some((prefix) => head.startsWith(`${prefix}.`))) {
          dynamic.push(
            templatePattern([head, ...node.templateSpans.map((span) => span.literal.text)]),
          );
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(tree);
  }

  return { exact, dynamic };
}

/**
 * Hàm đo DUY NHẤT. Ô thật và mọi ô đối chứng gọi chính nó, nên một lượt nới
 * lỏng bộ dò làm ô đối chứng đỏ ngay thay vì làm ô thật xanh trong im lặng.
 */
function findDeadKeys(keys: readonly string[], inputs: readonly SourceInput[]): string[] {
  const uses = collectKeyUses(inputs);
  return keys.filter(
    (key) => !uses.exact.has(key) && !uses.dynamic.some((pattern) => pattern.test(key)),
  );
}

function collect(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(?:test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Nền đã pin: 22 khoá còn lại sau lượt đóng nợ.
 *
 * Cổng này đo ra 36 khoá chết lúc dựng. 14 trong số đó đã được xử lý ngay trong
 * cùng nhánh, theo quyết định của lead ("không để lại nợ"):
 *
 * · 7 khoá XOÁ vì màn hình của chúng không còn tồn tại. Bốn khoá
 *   `session.lab.checklist-caption|col-task|col-weight|col-state` là caption và
 *   tên cột của một `<table>` đã bị `task-checklist.tsx` thay bằng danh sách
 *   kiểm; `session.workspace.separator` là thanh kéo chia đôi đã gỡ hẳn (không
 *   còn `[role="separator"]` nào, và `workspace-panel.test.tsx` khẳng định đúng
 *   điều đó); `session.ide.booting-status` và `session.ide.open-new-tab-error`
 *   là bản nhãn thứ hai cho hai chỗ mà `ide-pane.tsx` đã dựng bằng
 *   `session.ide.booting-title|booting-detail` và `session.ide.open-new-tab`.
 * · 5 khoá `error.*` NỐI DÂY vào `apps/web/src/server/trpc/init.ts`, đúng năm
 *   literal mà §4 hợp đồng đã chốt chữ để thay.
 * · 2 khoá `home.og.*` XOÁ vì chúng giống TỪNG KÝ TỰ với `shell.brand.name` và
 *   `common.og-description`, hai khoá mà `app/layout.tsx` đang thật sự đọc.
 *   `shell.ts` đã ghi sẵn rằng việc gộp thuộc về L0 "sau khi mọi lane gộp
 *   xong"; lượt này là lúc đó.
 *
 * 22 khoá còn lại dưới đây là vốn từ dùng chung của L0.
 *
 * Đây là một nền pin, nên nó mang đủ nghĩa vụ của `pinned-baseline-test-companion`:
 * pin theo TÊN chứ không theo SỐ ĐẾM (36 khoá chết khác vẫn là 36), và có ô
 * gác CẢ HAI CHIỀU ngay dưới đây. Chiều lên bắt khoá chết mới; chiều xuống bắt
 * đúng cái nguy hiểm hơn: một dòng miễn trừ còn nằm đây sau khi khoá của nó đã
 * được nối dây hoặc đã bị xoá. Không có chiều xuống thì bảng này thành nghĩa
 * địa mà không ai rà lại.
 *
 * ⚠ Khi một dòng ở đây đỏ vì khoá đã có nơi gọi: XOÁ dòng đó. ĐỪNG hạ nó
 * xuống một lý do mới. Pin chỉ được đi theo một chiều, là biến mất.
 *
 * Vì sao pin thay vì xoá 36 khoá ngay: chúng nằm ở bốn surface mà lane này
 * không sở hữu (`common.`/`unit.`/`error.` của L0, `session.` của 16.G,
 * `home.` của 16.E), và ít nhất nhóm `error.` là chữ đã chốt từng chữ ở §4 của
 * hợp đồng cho một chỗ nối dây chưa làm. Xoá chúng là quyết định biên tập của
 * chủ surface, không phải việc của một lượt đóng nợ; báo ra là đủ.
 */
function pin(reason: string, keys: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(keys.map((key) => [key, reason]));
}

const KNOWN_UNCALLED: Readonly<Record<string, string>> = {
  ...pin(
    '2026-09-13: vốn từ dùng chung của L0, soạn sẵn cho mọi surface nhưng chưa màn nào gọi tới. Chủ surface quyết định giữ hay xoá, không phải lane đóng nợ.',
    [
      'common.action.close',
      'common.action.edit',
      'common.action.back',
      'common.action.prev',
      'common.action.copy',
      'common.action.copied',
      'common.action.confirm',
      'common.action.search',
      'common.action.clear-filter',
      'common.action.reload',
      'common.action.more',
      'common.action.dismiss',
      'common.state.loading',
      'common.state.saving',
      'common.state.empty',
      'common.state.offline',
      'common.label.required',
      'common.label.optional',
      'unit.hour',
      'unit.day',
      'unit.point',
    ],
  ),
};

/** Cùng định dạng với `intentionalThree`: có ngày, và có lý do đọc ra được. */
const REASON_SHAPE = /^\d{4}-\d{2}-\d{2}: .{20,}/;

const FILES: readonly string[] = CALL_SITE_DIRS.flatMap((dir) => collect(join(ROOT, dir)));
const INPUTS: readonly SourceInput[] = FILES.map((file) => ({
  file,
  source: readFileSync(file, 'utf8'),
}));
const KEYS: readonly string[] = Object.keys(MESSAGES);
const DEAD: readonly string[] = findDeadKeys(KEYS, INPUTS);

describe('T4 chiều ngược, không khoá nào trong bản đồ thiếu nơi gọi', () => {
  it('bộ quét nhìn thấy một tập file THẬT và một bản đồ THẬT', () => {
    expect(FILES.length, 'glob nơi gọi rỗng, bộ quét đang nhìn sai chỗ').toBeGreaterThan(400);
    for (const dir of CALL_SITE_DIRS) {
      expect(
        FILES.some((file) => file.startsWith(join(ROOT, dir))),
        `${dir} không góp file nào`,
      ).toBe(true);
    }
    expect(KEYS.length).toBeGreaterThan(1500);
  });

  it('không khoá chết MỚI nào', () => {
    expect(
      DEAD.filter((key) => !(key in KNOWN_UNCALLED)),
      'Mỗi khoá trên nằm trong bản đồ mà không nơi nào trong mã sản phẩm gọi. ' +
        'Xoá nó, hoặc nối nó vào chỗ đáng ra phải dùng. Cổng T4 xuôi KHÔNG bắt ' +
        'được lớp lỗi này. ĐỪNG nới bộ dò, và ĐỪNG thêm dòng vào KNOWN_UNCALLED ' +
        'để làm suite xanh lại: bảng đó là nền đã đo một lần, không phải chỗ đổ ' +
        'khoá mới.',
    ).toEqual([]);
  });

  it('không dòng miễn trừ nào ôi', () => {
    const revived = Object.keys(KNOWN_UNCALLED).filter(
      (key) => key in MESSAGES && !DEAD.includes(key),
    );
    expect(
      revived,
      'Mỗi khoá trên đã có nơi gọi thật. XOÁ dòng của nó khỏi KNOWN_UNCALLED. ' +
        'Một pin chỉ được đi theo chiều biến mất.',
    ).toEqual([]);

    const vanished = Object.keys(KNOWN_UNCALLED).filter((key) => !(key in MESSAGES));
    expect(
      vanished,
      'Mỗi khoá trên đã bị xoá khỏi bản đồ. XOÁ luôn dòng miễn trừ của nó, ' +
        'nếu không bảng này thành nghĩa địa mà không ai rà lại.',
    ).toEqual([]);

    for (const [key, reason] of Object.entries(KNOWN_UNCALLED)) {
      expect(reason, `${key} thiếu ngày hoặc lý do quá ngắn`).toMatch(REASON_SHAPE);
    }
  });

  it('đối chứng dương, bộ đo ĐỎ được với một khoá không ai gọi', () => {
    const probe: readonly SourceInput[] = [
      { file: 'probe.tsx', source: "const a = <p>{t('catalog.noun.labs')}</p>;" },
    ];
    expect(findDeadKeys(['catalog.noun.labs', 'catalog.noun.ghost'], probe)).toEqual([
      'catalog.noun.ghost',
    ]);
  });

  it('đối chứng âm, khoá ghép lúc chạy KHÔNG bị báo chết', () => {
    const probe: readonly SourceInput[] = [
      { file: 'probe.tsx', source: 'const a = t(`home.demo.${topic}.title`);' },
    ];
    expect(findDeadKeys(['home.demo.k8s.title'], probe)).toEqual([]);
    // Cùng tiền tố, khác đuôi: phần ghép không được nuốt luôn khoá anh em.
    expect(findDeadKeys(['home.demo.k8s.subtitle'], probe)).toEqual(['home.demo.k8s.subtitle']);
  });

  it('đối chứng âm, khoá ghép ở GIỮA một đoạn vẫn nhận', () => {
    const probe: readonly SourceInput[] = [
      { file: 'probe.tsx', source: 'const a = t(`home.journey.stage${chapter}.kicker`);' },
    ];
    expect(findDeadKeys(['home.journey.stage0.kicker'], probe)).toEqual([]);
    expect(findDeadKeys(['home.journey.stage0.body'], probe)).toEqual(['home.journey.stage0.body']);
  });

  it('phần nội suy KHÔNG vượt dấu chấm, và template không mở bằng tiền tố thì bị bỏ qua', () => {
    const wild: readonly SourceInput[] = [
      { file: 'probe.ts', source: 'const k = `${group}.${name}`;' },
      { file: 'probe2.ts', source: 'const k = `catalog.${rest}`;' },
    ];
    // Không có hai dòng này thì một template bất kỳ trong repo có thể biến cổng
    // thành no-op xanh vĩnh viễn mà không ai nhận ra.
    expect(findDeadKeys(['catalog.noun.labs'], wild)).toEqual(['catalog.noun.labs']);
    expect(findDeadKeys(['catalog.noun'], wild)).toEqual([]);
  });

  it('chú thích nhắc tới khoá KHÔNG làm khoá đó sống lại', () => {
    const probe: readonly SourceInput[] = [
      { file: 'probe.ts', source: "// Khoá catalog.noun.labs và 'catalog.noun.labs' đã bỏ." },
    ];
    expect(findDeadKeys(['catalog.noun.labs'], probe)).toEqual(['catalog.noun.labs']);
  });
});
