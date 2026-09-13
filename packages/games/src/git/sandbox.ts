/**
 * §17.Q — chế độ **sandbox**: kho trống, không mục tiêu, không chấm.
 *
 * Sandbox và Level Builder (P18) dùng CÙNG một màn hình: dựng cây ở đây rồi bấm
 * "lấy làm trạng thái đầu" hoặc "lấy làm trạng thái đích". Đó là lý do sandbox
 * phải xong TRƯỚC P18, và là lý do file này export `worldToSpec` — bộ soạn bài
 * cần đúng phép chiếu ngược đó.
 *
 * ⛔ Xuất/nhập đi qua `WorldSpec`, KHÔNG qua `GitWorld`.
 *
 * Hai lý do, và lý do thứ hai mới là lý do thật:
 *
 *  1. `GitWorld` mang cả `ObjectStore` — sau vài chục lệnh nó chứa hàng trăm
 *     object trung gian của những lần rebase thử-rồi-bỏ. Một file JSON chia sẻ
 *     qua URL không nên chở đống đó.
 *  2. **Oid không phải thứ chia sẻ được.** Nó sinh từ nội dung, nên một `GitWorld`
 *     xuất ra rồi nhập lại ở một bản engine có phép băm khác (hoặc có thêm một
 *     trường trong `CommitObject`) sẽ mang Oid không khớp gì cả — và nó không
 *     nổ, nó chỉ im lặng trỏ vào khoảng không. `WorldSpec` dùng id NỘI BỘ
 *     (`'c1'`, `'feat-a'`) nên nó sống sót qua mọi lần đổi cách băm.
 *
 * Ô nghiệm thu AC-Q: xuất rồi nhập lại một cây bất kỳ ⇒ **hash trạng thái không
 * đổi**. Nó đo đúng vòng tròn đó.
 */

import type {
  CommitSpec,
  FilePath,
  GitLevel,
  GitWorld,
  Lines,
  Oid,
  OriginSpec,
  Repo,
  WorldSpec,
} from './contract.ts';
import { compareKeys, sortedEntries, sortedKeys } from './deterministic.ts';
import { commitContents, getCommit, reachableFrom } from './objects.ts';
import { branchNames, branchRef, headOid, isBranch, isTag, shortRefName, tagRef } from './repo.ts';
import { buildWorld } from './world-spec.ts';
import { hashRepoState } from './hash.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Kịch bản khởi tạo
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bốn kịch bản mở sandbox. Thiết kế §3.7 nêu ba; cái thứ tư (`hai-kho`) tách ra
 * vì bật/tắt `origin` là một lựa chọn RIÊNG, không phải một mức của cùng một
 * thang "độ rối".
 */
export type SandboxScenario = 'kho-trong' | 'kho-roi' | 'kho-vua-hong' | 'hai-kho';

export const SANDBOX_SCENARIOS: readonly SandboxScenario[] = [
  'kho-trong',
  'kho-roi',
  'kho-vua-hong',
  'hai-kho',
];

export const SANDBOX_SCENARIO_LABEL: Record<SandboxScenario, string> = {
  'kho-trong': 'Kho trống',
  'kho-roi': 'Kho có sẵn lịch sử rối',
  'kho-vua-hong': 'Kho vừa bị hỏng',
  'hai-kho': 'Hai kho (có origin)',
};

/**
 * ⚠ `kho-vua-hong` dựng một commit **không nhánh nào trỏ tới** bằng cách khai
 * nó trong `commits` mà bỏ ra khỏi `branches`.
 *
 * Đó là cách duy nhất `WorldSpec` biểu diễn một commit mồ côi, và nó hoạt động
 * vì `buildRepo` chỉ đặt ref từ `branches` — commit vẫn vào `ObjectStore`. Ghi
 * ra đây vì nhìn vào spec thì trông như một dòng thừa.
 */
export function sandboxSpec(scenario: SandboxScenario): WorldSpec {
  switch (scenario) {
    case 'kho-trong':
      return { worktree: { 'README.md': '# Kho trống\n\nGõ `git status` để bắt đầu.' } };

    case 'kho-roi':
      return {
        commits: [
          { id: 'c1', message: 'Khởi tạo', changes: { 'app.js': 'v1' } },
          { id: 'c2', parents: ['c1'], message: 'Thêm tính năng A', changes: { 'a.js': 'A()' } },
          { id: 'f1', parents: ['c1'], message: 'Nhánh phụ bước 1', changes: { 'f.js': 'F1()' } },
          { id: 'f2', parents: ['f1'], message: 'Nhánh phụ bước 2', changes: { 'f.js': 'F1()\nF2()' } },
          { id: 'm1', parents: ['c2', 'f2'], message: 'Trộn nhánh phụ', changes: {} },
          { id: 'c3', parents: ['m1'], message: 'Sửa sau khi trộn', changes: { 'app.js': 'v2' } },
        ],
        branches: { main: 'c3', 'nhanh-phu': 'f2' },
        tags: { 'v0.1': 'c2' },
      };

    case 'kho-vua-hong':
      return {
        commits: [
          { id: 'c1', message: 'Nền', changes: { 'app.js': 'v1' } },
          { id: 'c2', parents: ['c1'], message: 'Việc quan trọng', changes: { 'app.js': 'v1\nquan-trong()' } },
          { id: 'c3', parents: ['c2'], message: 'Việc quan trọng 2', changes: { 'b.js': 'B()' } },
        ],
        // `main` CỐ Ý dừng ở c1: c2 và c3 nằm trong kho mà không ai trỏ tới.
        branches: { main: 'c1' },
      };

    case 'hai-kho':
      return {
        commits: [
          { id: 'c1', message: 'Khởi tạo', changes: { 'README.md': '# Dự án' } },
          { id: 'c2', parents: ['c1'], message: 'Việc của bạn', changes: { 'mine.js': 'toi()' } },
          { id: 'o1', parents: ['c1'], message: 'Việc của đồng đội', author: 'Linh', changes: { 'theirs.js': 'ho()' } },
        ],
        branches: { main: 'c2' },
        origin: { branches: { main: 'o1' }, tracking: { main: 'c1' } },
      };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Xuất — GitWorld → WorldSpec
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chiếu một `GitWorld` ngược về `WorldSpec` chia sẻ được.
 *
 * ⚠ **Phép chiếu này MẤT THÔNG TIN, và nó mất có chủ ý.** Reflog, stash, thao
 * tác dở dang, và mọi commit mồ côi KHÔNG với tới được từ một ref đều không
 * sang. `WorldSpec` mô tả một trạng thái ĐẦU của level, không mô tả lịch sử
 * thao tác của một lượt chơi — và một level mở ra với sẵn 8 dòng reflog sẽ dạy
 * sai (xem chú thích ở `world-spec.ts`).
 *
 * Hệ quả phải biết: xuất một sandbox đang giữa một `rebase` dở dang rồi nhập
 * lại sẽ cho một kho SẠCH. Đó là hành vi đúng, không phải một lỗ hổng — nhưng
 * nó phải được nói ra, nếu không người dùng sẽ tưởng công cụ nuốt mất việc.
 *
 * Id nội bộ đặt theo **thứ tự tô-pô ổn định** (`c1`, `c2`, …) chứ không theo
 * Oid: cùng một cây xuất hai lần phải ra cùng một file, nếu không thì `diff`
 * giữa hai bản xuất là vô nghĩa.
 */
export function worldToSpec(world: GitWorld): WorldSpec {
  const repo = world.local;
  const order = topoOrder(repo);
  const idOf = new Map<Oid, string>();
  order.forEach((oid, i) => idOf.set(oid, `c${String(i + 1)}`));

  const commits: CommitSpec[] = [];
  for (const oid of order) {
    const commit = getCommit(repo.objects, oid);
    if (commit === undefined || commit === null) continue;

    const parentIds = commit.parents
      .map((p) => idOf.get(p))
      .filter((x): x is string => x !== undefined);

    const before =
      commit.parents[0] === undefined ? {} : commitContents(repo.objects, commit.parents[0]);
    const after = commitContents(repo.objects, oid);

    const changes: Record<FilePath, string | Lines | null> = {};
    for (const [path, lines] of sortedEntries(after)) {
      const prev = before[path];
      if (prev === undefined || !sameLines(prev, lines)) changes[path] = [...lines];
    }
    for (const path of sortedKeys(before)) {
      if (!Object.hasOwn(after, path)) changes[path] = null;
    }

    commits.push({
      id: idOf.get(oid) ?? oid,
      ...(parentIds.length > 0 ? { parents: parentIds } : {}),
      message: commit.message,
      ...(commit.author === 'Bạn' ? {} : { author: commit.author }),
      // Giữ NGUYÊN đồng hồ logic: nó đi vào phép băm, nên suy lại từ vị trí mảng
      // sẽ đổi mọi Oid và làm AC-Q đỏ ở vế mạnh.
      logicalTime: commit.logicalTime,
      ...(Object.keys(changes).length > 0 ? { changes } : {}),
    });
  }

  const branches: Record<string, string> = {};
  for (const name of branchNames(repo.refs)) {
    const id = idOf.get(repo.refs[branchRef(name)] ?? '');
    if (id !== undefined) branches[name] = id;
  }

  const tags: Record<string, string> = {};
  for (const ref of sortedKeys(repo.refs)) {
    if (!isTag(ref)) continue;
    const id = idOf.get(repo.refs[ref] ?? '');
    if (id !== undefined) tags[shortRefName(ref)] = id;
  }

  const head = headSpec(repo, idOf);
  const origin = originSpec(world, idOf);
  const untracked = untrackedSpec(repo);

  // `exactOptionalPropertyTypes` bật: `{ head: undefined }` KHÁC với bỏ khoá đi.
  // Mọi khoá tuỳ chọn dưới đây phải vắng mặt hẳn, không được mang `undefined`.
  return {
    ...(commits.length > 0 ? { commits } : {}),
    ...(Object.keys(branches).length > 0 ? { branches } : {}),
    ...(Object.keys(tags).length > 0 ? { tags } : {}),
    ...(head === null || head === undefined ? {} : { head }),
    ...(Object.keys(untracked).length > 0 ? { worktree: untracked } : {}),
    ...(origin === null ? {} : { origin }),
    ...(world.author === 'Bạn' ? {} : { author: world.author }),
  };
}

function headSpec(
  repo: Repo,
  idOf: ReadonlyMap<Oid, string>,
): WorldSpec['head'] | null {
  if (repo.head.type === 'detached') {
    const id = idOf.get(repo.head.oid);
    return id === undefined ? null : { detached: id };
  }
  const short = shortRefName(repo.head.ref);
  return short === 'main' ? null : short;
}

function originSpec(world: GitWorld, idOf: ReadonlyMap<Oid, string>): OriginSpec | null {
  if (world.origin === null) return null;

  const branches: Record<string, string> = {};
  for (const name of branchNames(world.origin.refs)) {
    const id = idOf.get(world.origin.refs[branchRef(name)] ?? '');
    if (id !== undefined) branches[name] = id;
  }

  const tracking: Record<string, string> = {};
  for (const ref of sortedKeys(world.local.refs)) {
    if (!ref.startsWith('refs/remotes/origin/')) continue;
    const id = idOf.get(world.local.refs[ref] ?? '');
    if (id !== undefined) tracking[ref.slice('refs/remotes/origin/'.length)] = id;
  }

  return {
    branches,
    ...(Object.keys(tracking).length > 0 ? { tracking } : {}),
  };
}

/** File trong worktree mà commit HEAD không có, tức file CHƯA TRACK. */
function untrackedSpec(repo: Repo): Record<FilePath, Lines> {
  const tracked = commitContents(repo.objects, headOid(repo));
  const out: Record<FilePath, Lines> = {};
  for (const [path, lines] of sortedEntries(repo.worktree)) {
    if (!Object.hasOwn(tracked, path)) out[path] = [...lines];
  }
  return out;
}

/**
 * Thứ tự tô-pô: cha luôn đứng trước con, và thứ tự ỔN ĐỊNH giữa hai lần xuất.
 *
 * Sắp theo `logicalTime` rồi tie-break bằng Oid. Không có tie-break thì hai lần
 * xuất cùng một cây có thể ra hai thứ tự khác nhau khi hai commit cùng mốc thời
 * gian logic, và AC-Q sẽ đỏ ngẫu nhiên.
 */
function topoOrder(repo: Repo): readonly Oid[] {
  const roots: Oid[] = [];
  for (const ref of sortedKeys(repo.refs)) {
    const oid = repo.refs[ref];
    if (oid !== undefined && isBranch(ref)) roots.push(oid);
  }
  for (const ref of sortedKeys(repo.refs)) {
    const oid = repo.refs[ref];
    if (oid !== undefined && isTag(ref)) roots.push(oid);
  }
  const head = headOid(repo);
  if (head !== null) roots.push(head);

  const live = [...reachableFrom(repo.objects, roots)];
  return live.sort((a, b) => {
    const ta = getCommit(repo.objects, a)?.logicalTime ?? 0;
    const tb = getCommit(repo.objects, b)?.logicalTime ?? 0;
    if (ta !== tb) return ta - tb;
    return compareKeys(a, b);
  });
}

function sameLines(a: Lines, b: Lines): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Xuất / nhập JSON
// ═══════════════════════════════════════════════════════════════════════════

export interface SandboxExport {
  readonly version: 1;
  readonly gameId: 'git';
  readonly spec: WorldSpec;
  readonly seed: number;
}

export function exportSandbox(world: GitWorld, seed = 1): SandboxExport {
  return { version: 1, gameId: 'git', spec: worldToSpec(world), seed };
}

export function exportSandboxJson(world: GitWorld, seed = 1): string {
  // Thụt lề 2 để file đọc và `diff` được bằng mắt — nó là thứ chia sẻ qua URL
  // và dán vào issue, không phải thứ máy đọc rồi vứt.
  return JSON.stringify(exportSandbox(world, seed), null, 2);
}

/**
 * Nhập lại. Trả `null` khi dữ liệu sai hình dạng — **không ném**.
 *
 * Chuỗi JSON đến từ NGOÀI hệ thống (dán từ URL, từ một file người khác gửi), nên
 * nó là dữ liệu không tin được. Ném ở đây sẽ biến một lần dán nhầm thành một
 * trang lỗi; trả `null` để tầng giao diện nói được một câu tử tế.
 */
export function importSandboxJson(json: string): GitWorld | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  if (record['version'] !== 1 || record['gameId'] !== 'git') return null;

  const spec = record['spec'];
  if (typeof spec !== 'object' || spec === null) return null;

  const seed = typeof record['seed'] === 'number' ? record['seed'] : 1;
  try {
    return buildWorld(spec as WorldSpec, seed);
  } catch {
    // `buildWorld` NÉM khi spec sai (cha chưa định nghĩa, nhánh trỏ vào commit
    // không tồn tại). Đó là đúng ở tầng nó — một level sai spec là lỗi của
    // người soạn. Ở đây thì nó là dữ liệu người dùng dán vào, nên nuốt lại.
    return null;
  }
}

/**
 * Hash trạng thái, cho ô nghiệm thu AC-Q.
 *
 * ⚠ Chỉ băm phần **nhìn thấy được**: refs, HEAD, index, worktree. KHÔNG băm
 * `ObjectStore` — xem chú thích `hashRepoState` ở `hash.ts`: hai đường đi tới
 * cùng một trạng thái hoàn toàn có thể để lại lượng rác khác nhau, và một vòng
 * xuất-nhập tất yếu vứt rác đi.
 */
export function sandboxStateHash(world: GitWorld): string {
  return hashRepoState({
    refs: world.local.refs,
    head: world.local.head,
    index: world.local.index,
    worktree: world.local.worktree,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Bật / tắt origin
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bật `origin` cho một spec chưa có.
 *
 * Trả `null` khi KHÔNG bật được — spec chưa có commit nào (`kho-trong`), nên
 * không có gì để nhánh của origin trỏ vào. `OriginSpec.branches` ánh xạ tên →
 * **id commit spec**, và một id không tồn tại làm `buildWorld` ném.
 *
 * ⛔ Không "im lặng bỏ qua" ở trường hợp đó: giao diện phải tắt hẳn nút và nói
 * vì sao, chứ không phải bấm xong rồi chẳng có gì xảy ra.
 *
 * `tracking` đặt bằng CHÍNH commit đó, tức local đang đồng bộ với origin. Đó là
 * điểm xuất phát trung tính; muốn dựng cảnh lệch nhau thì gõ lệnh, vì chính việc
 * làm-cho-lệch là bài học (G14–G15).
 */
export function withOrigin(spec: WorldSpec): WorldSpec | null {
  if (spec.origin !== undefined) return spec;

  const branches = spec.branches ?? {};
  const at = branches['main'] ?? sortedKeys(branches).map((k) => branches[k])[0] ?? null;
  if (at === undefined || at === null) return null;

  return { ...spec, origin: { branches: { main: at }, tracking: { main: at } } };
}

/** Tắt `origin`. Luôn làm được — một kho không có remote là kho hợp lệ. */
export function withoutOrigin(spec: WorldSpec): WorldSpec {
  if (spec.origin === undefined) return spec;
  const { origin: _removed, ...rest } = spec;
  return rest;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Level giả để mượn lại engine
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bọc một `WorldSpec` thành `GitLevel` để `createGitSession` chạy được trên nó.
 *
 * Sandbox cần đúng bốn thứ của engine — điều phối lệnh, đồng hồ logic, bot, và
 * ngăn xếp hoàn tác — mà cả bốn đều đã đúng ở `engine.ts`. Viết một "engine
 * sandbox" riêng là cách chắc chắn nhất để hai đường đi lệch nhau, rồi một lỗi
 * chỉ tái hiện được ở sandbox.
 *
 * Ba trường đáng chú ý:
 *
 *  - `objectives: []` — không chấm. `verdictOf` trên mảng rỗng trả "đạt", nên
 *    giao diện sandbox **không được hiện ô kết quả**; hiện thì nó luôn nói "AC"
 *    và câu đó vô nghĩa.
 *  - `allowedCommands: null` — cho dùng MỌI lệnh. ⚠ `[]` mang nghĩa NGƯỢC LẠI
 *    (cấm tất), và đó là cái bẫy đã cắn `k8s/problem.ts` một lần.
 *  - `solutionCommands`/`altSolutionCommands` rỗng — AC-8/AC-9 duyệt `GIT_LEVELS`,
 *    mà level này KHÔNG nằm trong mảng đó, nên không ô nào chạy hai trường này.
 */
export function sandboxLevel(spec: WorldSpec): GitLevel {
  return {
    id: 'git-sandbox',
    chapter: 1,
    title: 'Sandbox',
    mission: 'Không có mục tiêu — gõ gì cũng được.',
    brief: 'Kho tự do để thử lệnh. Không chấm, không tính tiến độ.',
    difficulty: 'basic',
    setup: spec,
    allowedCommands: null,
    objectives: [],
    hints: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
    theoryId: null,
    solutionCommands: [],
    altSolutionCommands: [],
    par: 0,
  };
}
