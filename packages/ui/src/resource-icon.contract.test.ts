import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESOURCE_ICON, RESOURCE_KINDS, RESOURCE_KIND_ACCENT } from './resource-icon.tsx';

/**
 * `phase-16.md` 16.A.9 — bảng icon của `packages/ui` phải KHỚP bảng của arena
 * trên mọi `ResourceKind`, và test này CHỈ ĐỌC file arena. Không sửa arena
 * (§1 và §8 của plan đặt `components/k8s-arena/**` ngoài phạm vi tuyệt đối).
 *
 * ## Vì sao đọc FILE chứ không `import`
 *
 * Ba ràng buộc cùng lúc, và chỉ phép đọc file thoả cả ba:
 *
 * 1. `packages/ui` KHÔNG được import từ `apps/web` — đó là cạnh phụ thuộc
 *    ngược hướng, một package thư viện không được biết về ứng dụng.
 * 2. `packages/ui` KHÔNG khai `@devops-platform/games` làm dependency, và
 *    không nên: `ui` là tầng TRÌNH BÀY; kéo cả gói domain của game vào chỉ để
 *    mượn một union 26 chuỗi là mở một cạnh mà sau này không ai gỡ được.
 *    (Về mặt cơ học nó cũng chưa cài: `packages/ui/node_modules/@devops-platform/`
 *    chỉ có `motion` và `scenario`.)
 * 3. Khớp phải được CHỨNG MINH, không được tin tưởng.
 *
 * Đây đúng khuôn `theme/tokens.contract.test.ts` đọc `globals.css`: không có
 * import runtime nào vượt biên, chỉ có một phép đọc file trong test.
 *
 * ## Ba thứ được đối chiếu
 *
 * | Đối chiếu | Nguồn sự thật |
 * |---|---|
 * | tập 26 khoá | `packages/games/src/k8s/contract.ts` (union `ResourceKind`) |
 * | khoá → tên icon | `apps/web/src/components/k8s-arena/hud/resource-icon.tsx` |
 * | dữ liệu `path` của 3 icon tự vẽ | cùng file arena |
 * | khoá → token `--kind-*` | `apps/web/.../arena-contract.ts` (`KIND_ACCENT`) |
 *
 * Thiếu vế thứ ba thì hai bảng có thể cùng nói "Pod dùng `PodContainers`" trong
 * khi hai `PodContainers` vẽ ra hai hình khác nhau — một sự khớp về TÊN che mất
 * một sự lệch về HÌNH.
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

const ROOT = workspaceRoot();
const ARENA_ICON_PATH = resolvePath(ROOT, 'apps/web/src/components/k8s-arena/hud/resource-icon.tsx');
const ARENA_CONTRACT_PATH = resolvePath(ROOT, 'apps/web/src/components/k8s-arena/arena-contract.ts');
const GAMES_CONTRACT_PATH = resolvePath(ROOT, 'packages/games/src/k8s/contract.ts');

const arenaIconSource = readFileSync(ARENA_ICON_PATH, 'utf8');
const arenaContractSource = readFileSync(ARENA_CONTRACT_PATH, 'utf8');
const gamesContractSource = readFileSync(GAMES_CONTRACT_PATH, 'utf8');

// ─── Bộ đọc, tách khỏi phép kiểm để đối chứng dương chạy được chúng ──────────

/**
 * Lấy các nhánh của `export type ResourceKind = 'A' | 'B' | …`.
 *
 * Cắt từ chỗ khai tới dấu `;` đầu tiên: union này trải trên 26 dòng nên một
 * regex một dòng sẽ chỉ bắt được nhánh đầu — và bắt được MỘT nhánh thì phép
 * kiểm vẫn "chạy", chỉ là nó so một tập một phần tử với 26 phần tử và đỏ vì lý
 * do sai.
 */
export function parseResourceKindUnion(source: string): string[] {
  const start = source.indexOf('export type ResourceKind =');
  if (start === -1) throw new Error('Không tìm thấy `export type ResourceKind =` trong contract.ts');
  const end = source.indexOf(';', start);
  if (end === -1) throw new Error('Khai báo `ResourceKind` không có dấu `;` kết thúc');
  const body = source.slice(start, end);
  return [...body.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1] as string);
}

/**
 * Lấy các cặp `Khoá: Giá trị,` trong một khai báo object có tên.
 *
 * Bỏ chú thích khối trước khi quét: cả hai file arena có chú thích nhóm ("Đơn
 * vị chạy", "Đường đi của gói tin", …) nằm GIỮA các cặp, và một số trong đó
 * chứa dấu hai chấm — quét thẳng sẽ đọc chúng thành cặp khoá-giá trị.
 */
export function parseNamedObject(source: string, declaration: string): Record<string, string> {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`Không tìm thấy khai báo \`${declaration}\``);
  const open = source.indexOf('{', start);
  if (open === -1) throw new Error(`\`${declaration}\` không có thân object`);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`\`${declaration}\` không đóng ngoặc`);
  const body = source.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/^\s*([A-Za-z][A-Za-z0-9]*)\s*:\s*([^,\n]+),/gm)) {
    out[match[1] as string] = (match[2] as string).trim().replace(/^'|'$/g, '');
  }
  return out;
}

/** Lấy `createLucideIcon('Tên', [ … ])` → chuỗi thô của mảng node, đã bỏ khoảng trắng thừa. */
export function parseCustomIcon(source: string, iconName: string): string {
  const marker = `createLucideIcon('${iconName}'`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Không tìm thấy \`${marker}\``);
  const open = source.indexOf('[', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '[') depth += 1;
    else if (source[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`\`${marker}\` không đóng ngoặc vuông`);
  // Chuẩn hoá khoảng trắng: hai file format khác nhau (prettier chạy với cùng
  // cấu hình nhưng độ sâu thụt lề khác), và một khác biệt về thụt lề KHÔNG phải
  // một khác biệt về hình.
  return source.slice(open, end + 1).replace(/\s+/g, ' ');
}

// ─── Đối chiếu ───────────────────────────────────────────────────────────────

const gamesKinds = parseResourceKindUnion(gamesContractSource);
const arenaIcons = parseNamedObject(arenaIconSource, 'export const RESOURCE_ICON');
const arenaAccents = parseNamedObject(arenaContractSource, 'export const KIND_ACCENT');

describe('16.A.9 — tập khoá `ResourceKind`', () => {
  it('bộ đọc lấy được đủ 26 nhánh (nếu hụt, mọi phép so dưới đây so nhầm tập)', () => {
    expect(gamesKinds).toHaveLength(26);
  });

  it('`RESOURCE_KINDS` của packages/ui KHỚP union ở @devops-platform/games', () => {
    expect(
      [...RESOURCE_KINDS].toSorted(),
      'lệch tập khoá ⇒ một loại tài nguyên hoặc không có icon, hoặc có icon cho một loại ' +
        'không tồn tại. Nguồn sự thật là packages/games/src/k8s/contract.ts.',
    ).toEqual(gamesKinds.toSorted());
  });

  it('bảng icon của arena cũng phủ đúng 26 khoá đó', () => {
    expect(Object.keys(arenaIcons).toSorted()).toEqual(gamesKinds.toSorted());
  });

  it('bảng nhóm màu của packages/ui phủ đúng 26 khoá đó', () => {
    expect(Object.keys(RESOURCE_KIND_ACCENT).toSorted()).toEqual(gamesKinds.toSorted());
  });
});

describe('16.A.9 — khoá → icon khớp giữa packages/ui và arena', () => {
  /**
   * So ĐỊNH DANH TRONG NGUỒN của cả hai bên, không so `displayName` lúc chạy.
   *
   * ⚠ Đây là bài học đo được, không phải sở thích. Bản đầu của file này đọc
   * `displayName` của component đã import và so với định danh trong nguồn
   * arena — và nó ĐỎ ở `ReplicaSet`: `lucide-react@1.40` export `Layers3` như
   * một ALIAS của `Layers`, nên `displayName` là `"Layers"` trong khi cả hai
   * file đều viết `Layers3`. Hai bảng khớp hoàn toàn, cổng vẫn báo lệch.
   *
   * Alias của thư viện là chi tiết của thư viện. Bất biến ta thật sự cần là
   * "hai file gọi CÙNG một export" — và định danh trong nguồn là thứ diễn đạt
   * đúng điều đó. Đọc bảng của chính `packages/ui` bằng CÙNG bộ đọc dùng cho
   * arena cũng làm phép so thành đối xứng: một lỗi trong bộ đọc sẽ hỏng đều cả
   * hai vế thay vì lệch một vế.
   */
  const uiIcons = parseNamedObject(
    readFileSync(resolvePath(ROOT, 'packages/ui/src/resource-icon.tsx'), 'utf8'),
    'export const RESOURCE_ICON',
  );

  it('bộ đọc lấy được đủ 26 cặp từ bảng của packages/ui', () => {
    expect(Object.keys(uiIcons)).toHaveLength(26);
  });

  it.each(RESOURCE_KINDS)('%s dùng cùng một icon ở cả hai bảng', (kind) => {
    const arena = arenaIcons[kind];
    expect(arena, `arena không khai icon cho ${kind}`).toBeDefined();
    expect(
      uiIcons[kind],
      `${kind}: packages/ui dùng "${uiIcons[kind]}", arena dùng "${arena}". ` +
        'Hai bảng lệch ⇒ cùng một tài nguyên có hai bóng dáng ở hai màn hình.',
    ).toBe(arena);
  });

  /**
   * Nửa còn lại: phép so nguồn ở trên chứng minh hai file gọi cùng một TÊN,
   * chưa chứng minh tên đó phân giải ra một thứ render được. Một import sai
   * chính tả sẽ cho `undefined` lúc chạy mà `tsc` vẫn xanh nếu nó đi qua một
   * vòng import — và React chỉ ném "type is invalid" khi render.
   */
  it.each(RESOURCE_KINDS)('%s phân giải ra một component render được', (kind) => {
    const glyph = RESOURCE_ICON[kind] as unknown;
    expect(typeof glyph, `${kind} là ${typeof glyph}, không render được`).toMatch(/^(function|object)$/);
  });
});

describe('16.A.9 — ba icon tự vẽ khớp tới từng ký tự dữ liệu path', () => {
  /**
   * Vế này là vế mà một phép so TÊN không bắt được: hai file đều có thể khai
   * `PodContainers` mà vẽ ra hai hình khác nhau. Đọc thẳng `d`/`rect` của cả
   * hai và so chuỗi đã chuẩn hoá khoảng trắng.
   */
  it.each(['PodContainers', 'DeploymentRollout', 'IngressGateway'])(
    '%s: dữ liệu hình của packages/ui trùng arena',
    (name) => {
      const ours = parseCustomIcon(readFileSync(resolvePath(ROOT, 'packages/ui/src/resource-icon.tsx'), 'utf8'), name);
      const theirs = parseCustomIcon(arenaIconSource, name);
      expect(ours).toBe(theirs);
    },
  );
});

describe('16.A.9 — khoá → token `--kind-*` khớp, và tám nhóm khớp globals.css', () => {
  it.each(RESOURCE_KINDS)('%s xếp vào cùng một nhóm màu ở cả hai bảng', (kind) => {
    expect(RESOURCE_KIND_ACCENT[kind]).toBe(arenaAccents[kind]);
  });

  /**
   * `phase-16.md` 16.A.9: "`--kind-*` … đi cùng bảng icon ở mục 9. Hai thứ đó
   * phải khớp nhau về tập khoá". Tám nhóm ở đây phải là ĐÚNG tám token
   * `--kind-*` khai trong `globals.css` — không thừa, không thiếu.
   */
  it('tám nhóm màu ↔ tám token `--kind-*` trong globals.css, hai chiều', () => {
    const groups = new Set(Object.values(RESOURCE_KIND_ACCENT));
    expect(groups.size).toBe(8);

    const css = readFileSync(resolvePath(ROOT, 'apps/web/src/app/globals.css'), 'utf8');
    const declared = new Set(
      [...css.matchAll(/^\s*(--kind-[a-z]+)\s*:/gm)].map((m) => (m[1] as string).slice(2)),
    );
    expect(declared.size, 'globals.css phải khai đúng 8 token --kind-*').toBe(8);
    expect([...groups].toSorted()).toEqual([...declared].toSorted());
  });
});

/**
 * ĐỐI CHỨNG DƯƠNG — bắt buộc theo ô nghiệm thu 16.A ("test đối chiếu icon xanh,
 * và ĐỎ ĐƯỢC khi bảng arena đổi").
 *
 * Không sửa file arena để thử; thay vào đó chạy CHÍNH ba bộ đọc ở trên trên các
 * chuỗi nguồn đã bị bẻ gãy có chủ đích. Nếu bộ đọc không phân biệt được, thì
 * mọi khẳng định phía trên chỉ là một phép so hai bản chép của cùng một thứ.
 */
describe('đối chứng dương — bộ đọc phân biệt được lệch, không chỉ đọc được khớp', () => {
  it('ĐỔI icon của một khoá ⇒ bảng đọc ra khác', () => {
    const tampered = arenaIconSource.replace('ReplicaSet: Layers3,', 'ReplicaSet: Server,');
    expect(tampered, 'chuỗi thay thế không khớp — đối chứng này đang không bẻ gãy gì').not.toBe(arenaIconSource);
    expect(parseNamedObject(tampered, 'export const RESOURCE_ICON')['ReplicaSet']).toBe('Server');
    expect(arenaIcons['ReplicaSet']).toBe('Layers3');
  });

  /*
   * ⚠ `\r?\n`, không phải `\n`. Cây làm việc là Windows với `core.autocrlf=true`
   * nên file trên đĩa có xuống dòng CRLF; một mẫu thay thế dùng `\n` trần KHÔNG
   * khớp, `replace` trả về nguyên chuỗi cũ, và đối chứng dương "bẻ gãy" một thứ
   * nó chưa hề bẻ gãy — rồi báo XANH. Dòng `expect(...).not.toBe(...)` ngay
   * dưới là thứ bắt được ca đó lần đầu; giữ nó ở MỌI đối chứng trong khối này.
   */
  it('XOÁ một khoá khỏi bảng arena ⇒ tập khoá hụt đi một', () => {
    const tampered = arenaIconSource.replace(/ {2}CronJob: AlarmClock,\r?\n/, '');
    expect(tampered, 'mẫu thay thế không khớp — đối chứng này đang không bẻ gãy gì').not.toBe(arenaIconSource);
    expect(Object.keys(parseNamedObject(tampered, 'export const RESOURCE_ICON'))).toHaveLength(25);
  });

  it('ĐỔI một toạ độ trong icon tự vẽ ⇒ chuỗi path đọc ra khác', () => {
    const tampered = arenaIconSource.replace("d: 'M12 2 22 7v10l-10 5L2 17V7Z'", "d: 'M12 3 22 7v10l-10 5L2 17V7Z'");
    expect(tampered).not.toBe(arenaIconSource);
    expect(parseCustomIcon(tampered, 'PodContainers')).not.toBe(parseCustomIcon(arenaIconSource, 'PodContainers'));
  });

  it('THÊM một nhánh vào union ⇒ tập khoá phình lên 27', () => {
    const tampered = gamesContractSource.replace("  | 'LimitRange';", "  | 'LimitRange'\n  | 'Gateway';");
    expect(tampered).not.toBe(gamesContractSource);
    expect(parseResourceKindUnion(tampered)).toHaveLength(27);
  });

  it('bộ đọc NÉM khi khai báo biến mất — không im lặng trả về object rỗng', () => {
    expect(() => parseNamedObject('const X = {};', 'export const RESOURCE_ICON')).toThrow(/Không tìm thấy/);
    expect(() => parseResourceKindUnion('type Other = string;')).toThrow(/Không tìm thấy/);
    expect(() => parseCustomIcon('const a = 1;', 'PodContainers')).toThrow(/Không tìm thấy/);
  });
});
