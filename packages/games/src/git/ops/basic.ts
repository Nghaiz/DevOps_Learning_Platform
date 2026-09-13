/**
 * `init` · `add` · `commit` · `status` · `diff` · `checkout <đường-dẫn>`.
 *
 * Tầng này nhận một `Repo` và trả một `Repo` MỚI kèm output. Nó KHÔNG phân tích
 * cú pháp (lane bộ phân tích làm), KHÔNG biết `GitWorld` hay `origin` (lane
 * engine và lane remote làm), và KHÔNG tự sinh `logicalTime` — đồng hồ là tham
 * số truyền vào, vì §17.J.2 cấm `Date.now()` và vì phát lại phía máy chủ chỉ
 * đúng khi thời gian là dữ liệu chứ không phải môi trường.
 *
 * ## Ba luật xuyên suốt cả ba file `ops/`
 *
 * 1. **Lệnh hỏng ⇒ trạng thái CŨ, nguyên vẹn.** Mọi phép kiểm chạy TRƯỚC khi
 *    dựng gì, và `opFail` luôn nhận `Repo` đầu vào. Một lệnh để lại nửa tác dụng
 *    phá `undo` (17.I.3) và phá cả niềm tin của người học.
 * 2. **Đổi ref chỉ qua `setRef`/`moveHead` của `repo.ts`** — chúng ghi reflog
 *    cùng lúc, và cả chương 3 sống trên reflog.
 * 3. **Lặp trên `Record` chỉ qua `deterministic.ts`.**
 *
 * ## INDEX LÀ ẢNH CHỤP ĐẦY ĐỦ, KHÔNG PHẢI DANH SÁCH THAY ĐỔI
 *
 * Đây là chi tiết dễ hiểu nhầm nhất của cả tầng, và `pathStatus` trong `repo.ts`
 * đã ghim nó: một file có trong HEAD mà KHÔNG có trong index nghĩa là "đã staged
 * việc XOÁ", chứ không phải "chưa đụng tới". Nên index chứa mọi file đang được
 * theo dõi, `checkout` phải nạp lại index từ tree đích, và `commit` dựng tree
 * thẳng từ index mà không cần hỏi HEAD.
 */

import type {
  FilePath,
  GitError,
  Lines,
  Oid,
  OutputLine,
  OutputTone,
  Repo,
} from '../contract.ts';
import { sortedEntries, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { commitContents, commitTree, getBlob, makeBlob, makeTree, putObject } from '../objects.ts';
import { resolveRevision, revisionError } from '../refs-resolve.ts';
import {
  allPaths,
  blobOid,
  headContents,
  headOid,
  moveHead,
  setIndex,
  setRef,
  writeFile,
  shortRefName,
  stagePath,
  statusEntries,
  unstagePath,
} from '../repo.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 0. KIỂU TRẢ VỀ DÙNG CHUNG CHO CẢ TẦNG `ops/`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kết quả một thao tác ở tầng repo.
 *
 * ⚠ Khác `CommandResult` của `contract.ts`: cái kia bọc `GitWorld` (hai kho,
 * đồng hồ, bot) và là thứ lane engine trả ra ngoài. Cái này chỉ nói về MỘT
 * `Repo`, vì không thao tác nào trong `ops/basic|branch|inspect` chạm tới
 * `origin` hay tới bot.
 *
 * ⛔ Bất biến: `error !== null` ⇒ `repo` là **tham chiếu đầu vào**, không phải
 * một bản sao gần giống. Ngoại lệ duy nhất có tên nằm ở tầng merge
 * (`merge-conflict` / `unmerged-paths`), không phải ở file này.
 *
 * Ba file `ops/` còn lại (`history.ts`, `merge.ts`, `remote.ts`, do lane khác
 * viết) cũng cần đúng kiểu này. Nó nằm ở đây vì `basic.ts` là file ops nền và
 * vì một file `ops/result.ts` riêng chưa có ai sở hữu — lead muốn dời thì dời,
 * chỗ gọi chỉ phải đổi đường import.
 */
export interface RepoOpResult {
  readonly repo: Repo;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
}

export function line(text: string, tone: OutputTone = 'plain'): OutputLine {
  return { text, tone };
}

export function opOk(repo: Repo, output: readonly OutputLine[]): RepoOpResult {
  return { repo, output, error: null };
}

/**
 * Thất bại. `repo` phải là trạng thái CHƯA ĐỤNG TỚI — đọc lại luật 1 ở đầu file
 * trước khi truyền vào đây một biến đã đi qua vài phép biến đổi.
 */
export function opFail(
  repo: Repo,
  error: GitError,
  output: readonly OutputLine[] = [],
): RepoOpResult {
  return { repo, output, error };
}

/** Thụt đầu dòng của mọi danh sách file, giống `git status` thật. */
const INDENT = '        ';

/** Nhãn cột trái của `status`/`diff`, căn đều để mắt quét dọc được. */
function label(text: string): string {
  return `${INDENT}${text.padEnd(11, ' ')}`;
}

/** `main`, hoặc `HEAD tách rời` khi detached. Dùng ở nhiều thông báo. */
export function headLabel(repo: Repo): string {
  if (repo.head.type === 'detached') return `HEAD tách rời tại ${shortOid(repo.head.oid)}`;
  return shortRefName(repo.head.ref);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. ĐỌC NỘI DUNG BA VÙNG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nội dung file mà INDEX đang giữ, đã giải blob.
 *
 * Cần vì `Index` lưu `path → Oid` (rẻ, và đúng mô hình git) trong khi `diff` và
 * `checkout -- <path>` cần dòng thật.
 */
export function indexContents(repo: Repo): Readonly<Record<FilePath, Lines>> {
  const out: Record<FilePath, Lines> = {};
  for (const [path, oid] of sortedEntries(repo.index)) {
    const blob = getBlob(repo.objects, oid);
    if (blob !== null) out[path] = blob.lines;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MỞ RỘNG ĐƯỜNG DẪN
// ═══════════════════════════════════════════════════════════════════════════

type PathExpansion =
  | { readonly ok: true; readonly paths: readonly FilePath[] }
  | { readonly ok: false; readonly missing: string };

/**
 * Đường dẫn người chơi gõ → danh sách đường dẫn thật.
 *
 * Ba dạng được nhận, và cả ba đều có trong `usage` của bảng lệnh:
 *
 * - `.` → mọi đường dẫn. Mô hình không có thư mục hiện tại (đường dẫn phẳng,
 *   POSIX, xem `contract.ts`), nên `.` chỉ có một nghĩa khả dĩ là "tất cả".
 * - `src` → mọi đường dẫn bắt đầu bằng `src/`. Không có object thư mục trong mô
 *   hình, nhưng level có đường dẫn nhiều tầng nên `git add src` phải chạy.
 * - `src/app.ts` → đúng file đó.
 *
 * `universe` là tập nền để đối chiếu: với `add` đó là cả ba vùng (để `add` một
 * file vừa bị xoá cũng chạy), với `checkout -- <path>` đó là tập file của nguồn.
 */
function expandPaths(
  universe: readonly FilePath[],
  requested: readonly FilePath[],
): PathExpansion {
  const picked: Record<FilePath, true> = {};
  for (const raw of requested) {
    const request = raw === './' ? '.' : raw;
    if (request === '.') {
      for (const path of universe) picked[path] = true;
      continue;
    }
    if (universe.includes(request)) {
      picked[request] = true;
      continue;
    }
    const prefix = request.endsWith('/') ? request : `${request}/`;
    const under = universe.filter((path) => path.startsWith(prefix));
    if (under.length === 0) return { ok: false, missing: raw };
    for (const path of under) picked[path] = true;
  }
  return { ok: true, paths: sortedKeys(picked) };
}

function pathNotFoundError(missing: string, universe: readonly FilePath[]): GitError {
  const listed =
    universe.length === 0
      ? 'Repo này chưa có file nào cả.'
      : `File đang có: ${universe.map((path) => `\`${path}\``).join(', ')}.`;
  return gitError(
    'path-not-found',
    `Không có file nào tên \`${missing}\`.`,
    `${listed} Đường dẫn trong game là dạng POSIX, không có \`./\` ở đầu.`,
    'Gõ `git status` để xem đúng tên file đang có trong worktree.',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. `git init`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `git init`.
 *
 * ⚠ **Không xoá gì cả, kể cả khi repo đã có commit.** Git thật cũng vậy — chạy
 * lại `git init` trong một repo có sẵn chỉ in "Reinitialized existing Git
 * repository" và không đụng vào một object nào. Một hiện thực "khởi tạo lại =
 * làm rỗng" sẽ xoá sạch việc của người chơi vì họ gõ nhầm một lệnh vô hại, và
 * đó là đúng loại thảm hoạ thầm lặng mà game này tồn tại để dạy người ta tránh.
 *
 * Mô hình không có trạng thái "chưa phải repo" — `Repo` luôn tồn tại, xem
 * `emptyRepo()`. Nên lệnh này chủ yếu là một lệnh DẠY: nó nói ra rằng HEAD đang
 * trỏ vào một branch CHƯA SINH RA, thứ mà `git branch` lúc này chưa liệt kê
 * được (bài G04).
 */
export function gitInit(repo: Repo): RepoOpResult {
  const born = sortedKeys(repo.refs).length > 0;
  if (born) {
    return opOk(repo, [
      line('Repo này đã được khởi tạo rồi — không có gì thay đổi.', 'warn'),
      line('`git init` chạy lại là vô hại: nó không xoá object, ref hay file nào.', 'hint'),
    ]);
  }
  return opOk(repo, [
    line('Đã khởi tạo một repo rỗng.', 'success'),
    line(
      `HEAD đang trỏ vào \`${headLabel(repo)}\`, nhưng branch đó CHƯA tồn tại — nó chỉ ra đời khi có commit đầu tiên.`,
      'plain',
    ),
    line('Vì vậy `git branch` lúc này không liệt kê gì cả, và đó là đúng.', 'hint'),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. `git add`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Đưa nội dung worktree của MỘT đường dẫn vào index.
 *
 * File không còn trong worktree ⇒ **gỡ khỏi index**, tức staged việc xoá. Đây
 * là hành vi của git từ 2.0 và nó hay làm người học ngạc nhiên: `git add` một
 * file đã xoá nghe như vô lý, nhưng "add" ở đây nghĩa là "đưa TRẠNG THÁI hiện
 * tại của đường dẫn này vào index", và trạng thái hiện tại là không tồn tại.
 */
function stageOne(repo: Repo, path: FilePath): Repo {
  const lines = repo.worktree[path];
  if (lines === undefined) return unstagePath(repo, path);
  const [objects, oid] = putObject(repo.objects, makeBlob(lines));
  return stagePath({ ...repo, objects }, path, oid);
}

export interface AddOptions {
  /** `-A` / `--all`: mọi thay đổi ở mọi đường dẫn, kể cả file mới và file đã xoá. */
  readonly all?: boolean | undefined;
}

/**
 * `git add <đường-dẫn>…` / `git add .` / `git add -A`.
 *
 * Thêm một file **đã tồn tại** là cả bài G03: nó không sao chép file đi đâu cả,
 * nó băm nội dung thành blob rồi ghi `path → Oid` vào index. Sửa file sau đó
 * thì index vẫn giữ bản cũ — đó là chỗ hai cột của `git status` tách ra.
 */
export function gitAdd(
  repo: Repo,
  paths: readonly FilePath[],
  options: AddOptions = {},
): RepoOpResult {
  const universe = allPaths(repo);

  if (options.all !== true && paths.length === 0) {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        '`git add` cần biết đưa CÁI GÌ vào index.',
        'Không có đường dẫn nào được nêu và cũng không có cờ `-A`, nên lệnh không có mục tiêu.',
        'Nêu tên file, hoặc `.` cho mọi file, hoặc `-A` cho mọi thay đổi.',
      ),
    );
  }

  const expansion =
    options.all === true ? ({ ok: true, paths: universe } as const) : expandPaths(universe, paths);
  if (!expansion.ok) return opFail(repo, pathNotFoundError(expansion.missing, universe));

  let next = repo;
  const staged: FilePath[] = [];
  for (const path of expansion.paths) {
    const before = repo.index[path];
    next = stageOne(next, path);
    if (next.index[path] !== before) staged.push(path);
  }

  if (staged.length === 0) {
    return opOk(repo, [
      line('Không có gì để đưa vào index — index đã khớp worktree ở những đường dẫn này.', 'plain'),
    ]);
  }

  return opOk(next, [
    line(`Đã đưa ${staged.length} đường dẫn vào index:`, 'success'),
    ...staged.map((path) => line(`${INDENT}${path}`)),
    line('Nội dung được CHỤP LẠI lúc này. Sửa file sau đây thì phải `add` lại.', 'hint'),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. `git commit`
// ═══════════════════════════════════════════════════════════════════════════

/** `-a`: staged mọi file ĐÃ THEO DÕI. File chưa track thì không — đúng như git thật. */
function stageTrackedChanges(repo: Repo): Repo {
  const tracked = headContents(repo);
  let next = repo;
  for (const path of allPaths(repo)) {
    const isTracked = Object.hasOwn(repo.index, path) || Object.hasOwn(tracked, path);
    if (!isTracked) continue;
    next = stageOne(next, path);
  }
  return next;
}

export interface CommitOptions {
  readonly message: string;
  /** Đồng hồ LOGIC, do chỗ gọi cấp. Đi vào phép băm nên nó định danh commit. */
  readonly logicalTime: number;
  readonly author: string;
  /** `--amend`: thay commit hiện tại, giữ nguyên cha của nó. */
  readonly amend?: boolean | undefined;
  readonly allowEmpty?: boolean | undefined;
  /** `-a`: tự `add` mọi file đã theo dõi trước khi commit. */
  readonly all?: boolean | undefined;
}

/**
 * `git commit`.
 *
 * Tree dựng từ **index**, không từ worktree — đó là toàn bộ lý do index tồn tại
 * như một vùng riêng, và là misfit mà Perez De Rosso & Jackson (MIT, Onward!
 * 2013) đo được ở người dùng thật.
 *
 * ## `--amend` KHÔNG SỬA COMMIT CŨ
 *
 * Nó tạo một commit MỚI mang cùng tập cha, rồi trỏ ref sang đó. Commit cũ **ở
 * lại trong kho** (`ObjectStore` không bao giờ xoá) và chỉ mất chỗ trỏ tới —
 * nói cách khác nó vừa trở thành một commit mồ côi cứu được bằng `git reflog`.
 * Đó là nền của cả chương 3, nên hàm này in hẳn Oid cũ ra màn hình thay vì để
 * nó biến mất không dấu vết.
 */
export function gitCommit(repo: Repo, options: CommitOptions): RepoOpResult {
  if (repo.pending !== null) {
    return opFail(repo, pendingOpError(repo, '`git commit`'));
  }

  const message = options.message.trim();
  if (message === '') {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        'Thông điệp commit rỗng.',
        'Git thật huỷ commit khi thông điệp rỗng, và game giữ nguyên điều đó: một commit không có thông điệp là một dòng lịch sử không ai đọc lại được.',
        'Ví dụ: `git commit -m "thêm trang đăng nhập"`',
      ),
    );
  }

  const base = options.all === true ? stageTrackedChanges(repo) : repo;
  const currentOid = headOid(repo);

  if (options.amend === true && currentOid === null) {
    return opFail(
      repo,
      gitError(
        'nothing-to-commit',
        'Không có commit nào để `--amend`.',
        `HEAD đang trỏ vào \`${headLabel(repo)}\`, nhưng branch đó chưa có commit nào — chưa có gì để thay.`,
        'Tạo commit đầu tiên trước: `git add .` rồi `git commit -m "commit đầu tiên"`.',
      ),
    );
  }

  // Kiểm "có gì để commit không" bằng TRỤC STAGED của `statusEntries`, không
  // bằng cách so Oid tree. Lý do: ở một repo chưa có commit nào, tree của HEAD
  // là `null` trong khi tree của index rỗng lại là một Oid có thật, nên phép so
  // Oid sẽ coi "index rỗng trên branch chưa sinh ra" là CÓ thay đổi và cho ra
  // một commit gốc rỗng không ai muốn.
  const hasStaged = statusEntries(base).some((entry) => entry.staged !== 'unchanged');
  if (!hasStaged && options.allowEmpty !== true && options.amend !== true) {
    return opFail(repo, nothingToCommitError(base));
  }

  const [withTree, treeOid] = putObject(base.objects, makeTree(base.index));

  // `--amend` giữ NGUYÊN tập cha của commit bị thay — đó là thứ làm nó "sửa tại
  // chỗ" trong mắt người dùng dù thực ra nó tạo một object hoàn toàn mới.
  const amending = options.amend === true && currentOid !== null;
  let parents: readonly Oid[] = [];
  if (amending && currentOid !== null) parents = commitParents(base, currentOid) ?? [];
  else if (currentOid !== null) parents = [currentOid];

  const [withCommit, newOid] = putObject(withTree, {
    kind: 'commit',
    tree: treeOid,
    parents,
    message,
    author: options.author,
    logicalTime: options.logicalTime,
  });

  const staged = base.objects === withCommit ? base : { ...base, objects: withCommit };
  const entry = {
    op: amending ? 'commit (amend)' : 'commit',
    message,
    logicalTime: options.logicalTime,
  };

  const next =
    repo.head.type === 'ref'
      ? setRef(staged, repo.head.ref, newOid, entry)
      : moveHead(staged, { type: 'detached', oid: newOid }, entry);

  const rootNote = parents.length === 0 ? ' (commit gốc)' : '';
  const output: OutputLine[] = [
    line(`[${headLabel(repo)}${rootNote} ${shortOid(newOid)}] ${message}`, 'success'),
    line(` ${countChangedAgainstParent(next, newOid)} file thay đổi`),
  ];

  if (amending && currentOid !== null) {
    output.push(
      line(
        `Commit cũ \`${shortOid(currentOid)}\` KHÔNG bị sửa — nó bị THAY. Bản cũ vẫn nằm trong kho, chỉ không còn ref nào trỏ tới.`,
        'warn',
      ),
      line('`git reflog` tìm lại được nó. Nhưng nếu commit cũ đã push thì lần push sau sẽ bị từ chối non-fast-forward.', 'hint'),
    );
  }

  if (repo.head.type === 'detached') {
    output.push(
      line(
        'HEAD đang tách rời, nên commit vừa tạo KHÔNG thuộc branch nào. Chuyển đi chỗ khác là nó thành mồ côi.',
        'warn',
      ),
      line(`Giữ lại bằng: \`git branch <tên> ${shortOid(newOid)}\``, 'hint'),
    );
  }

  return opOk(next, output);
}

function commitParents(repo: Repo, oid: Oid): readonly Oid[] | null {
  const object = repo.objects[oid];
  return object !== undefined && object.kind === 'commit' ? object.parents : null;
}

function countChangedAgainstParent(repo: Repo, oid: Oid): number {
  const parents = commitParents(repo, oid) ?? [];
  const before = commitContents(repo.objects, parents[0] ?? null);
  const after = commitContents(repo.objects, oid);
  return diffContents(before, after).length;
}

function nothingToCommitError(repo: Repo): GitError {
  const dirty = statusEntries(repo).filter(
    (entry) => entry.unstaged === 'modified' || entry.unstaged === 'deleted',
  );
  const untracked = statusEntries(repo).filter((entry) => entry.unstaged === 'untracked');

  if (dirty.length > 0 || untracked.length > 0) {
    const names = [...dirty, ...untracked].map((entry) => `\`${entry.path}\``).join(', ');
    return gitError(
      'nothing-to-commit',
      'Index rỗng — không có gì để đóng thành commit.',
      `Có thay đổi trong worktree (${names}), nhưng \`commit\` chỉ đóng thứ đang nằm trong INDEX. Worktree và index là hai vùng khác nhau.`,
      'Đưa chúng vào index trước: `git add <file>`, rồi commit lại.',
    );
  }

  return gitError(
    'nothing-to-commit',
    'Không có gì để commit.',
    'Index khớp hoàn toàn với commit HEAD đang trỏ tới, tức là không có thay đổi nào đang chờ được đóng lại.',
    'Sửa một file rồi `git add`, hoặc dùng `git commit --allow-empty` nếu bạn thật sự muốn một commit rỗng.',
  );
}

/**
 * Lệnh bị chặn vì đang có thao tác dở dang.
 *
 * ⚠ Ranh giới với lane merge: việc KẾT THÚC một merge/rebase (tạo commit hai
 * cha, dọn `pending`) thuộc `ops/merge.ts`. File này chỉ từ chối, và từ chối
 * theo hai giọng khác nhau vì hai trạng thái đó cần hai việc khác nhau: còn
 * conflict thì phải sửa file, hết conflict thì phải `--continue`.
 */
function pendingOpError(repo: Repo, what: string): GitError {
  const pending = repo.pending;
  if (pending === null) {
    return gitError('no-operation-in-progress', 'Không có thao tác nào đang dở dang.', '');
  }
  const names = pending.conflicts.map((file) => `\`${file.path}\``).join(', ');
  if (pending.conflicts.length > 0) {
    return gitError(
      'unmerged-paths',
      `${what} chưa chạy được: còn file đang xung đột.`,
      `Đang giữa một \`${pending.kind}\` và ${pending.conflicts.length} file còn marker xung đột: ${names}. Git không đoán hộ bạn giữ phần nào.`,
      `Sửa từng file cho hết marker \`<<<<<<<\`, \`git add\` chúng, rồi \`git ${pending.kind} --continue\`.`,
    );
  }
  return gitError(
    'operation-in-progress',
    `${what} chưa chạy được: đang giữa một \`${pending.kind}\`.`,
    'Mọi conflict đã được đánh dấu là giải xong, nhưng thao tác vẫn chưa được kết thúc — repo đang ở trạng thái nửa chừng.',
    `Kết thúc bằng \`git ${pending.kind} --continue\`, hoặc quay lại chỗ cũ bằng \`git ${pending.kind} --abort\`.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. `git status`
// ═══════════════════════════════════════════════════════════════════════════

const STAGED_LABEL: Readonly<Record<string, string>> = {
  added: 'file mới:',
  modified: 'sửa:',
  deleted: 'xoá:',
};

const UNSTAGED_LABEL: Readonly<Record<string, string>> = {
  modified: 'sửa:',
  deleted: 'xoá:',
};

/**
 * `git status`.
 *
 * **Hai cột riêng, không gộp.** Perez De Rosso & Jackson đo được rằng người
 * dùng gộp "đã sửa" và "sẽ được commit" làm một trong đầu, rồi mất phần sửa sau
 * cùng mà không hiểu vì sao. Một file hiện ở CẢ HAI cột không phải lỗi hiển thị
 * — đó là trạng thái thật và là bài học, nên hàm này nói thẳng ra khi nó xảy ra.
 */
export function gitStatus(repo: Repo): RepoOpResult {
  const entries = statusEntries(repo);
  const output: OutputLine[] = [];

  if (repo.head.type === 'detached') {
    output.push(line(`HEAD đang tách rời tại ${shortOid(repo.head.oid)}`, 'warn'));
    output.push(line('Commit tạo ở đây không thuộc branch nào cả.', 'hint'));
  } else if (headOid(repo) === null) {
    output.push(line(`Trên branch ${shortRefName(repo.head.ref)}`));
    output.push(line('Chưa có commit nào — branch này sẽ ra đời cùng commit đầu tiên.', 'hint'));
  } else {
    output.push(line(`Trên branch ${shortRefName(repo.head.ref)}`));
  }

  if (repo.pending !== null) {
    output.push(
      line(`Đang giữa một \`${repo.pending.kind}\` chưa kết thúc.`, 'warn'),
      ...repo.pending.conflicts.map((file) => line(`${label('xung đột:')}${file.path}`, 'error')),
    );
  }

  const staged = entries.filter((entry) => entry.staged !== 'unchanged');
  const unstaged = entries.filter(
    (entry) => entry.unstaged === 'modified' || entry.unstaged === 'deleted',
  );
  const untracked = entries.filter((entry) => entry.unstaged === 'untracked');

  if (staged.length > 0) {
    output.push(line('Thay đổi SẼ vào commit tới (đang ở index):', 'success'));
    for (const entry of staged) {
      output.push(line(`${label(STAGED_LABEL[entry.staged] ?? '')}${entry.path}`, 'success'));
    }
  }

  if (unstaged.length > 0) {
    output.push(line('Thay đổi CHƯA vào commit tới (mới chỉ ở worktree):', 'warn'));
    for (const entry of unstaged) {
      output.push(line(`${label(UNSTAGED_LABEL[entry.unstaged] ?? '')}${entry.path}`, 'warn'));
    }
    output.push(line('Đưa vào index bằng `git add <file>`.', 'hint'));
  }

  if (untracked.length > 0) {
    output.push(line('File chưa được theo dõi:', 'warn'));
    for (const entry of untracked) output.push(line(`${INDENT}${entry.path}`, 'warn'));
  }

  // Chỗ đáng giá nhất của cả lệnh: một đường dẫn nằm ở CẢ HAI cột nghĩa là bản
  // đã `add` khác bản đang sửa, và commit bây giờ chỉ đóng bản đã `add`.
  const both = entries.filter(
    (entry) => entry.staged !== 'unchanged' && entry.unstaged === 'modified',
  );
  for (const entry of both) {
    output.push(
      line(
        `⚠ \`${entry.path}\` có mặt ở CẢ HAI cột: bản đã \`add\` khác bản đang sửa. Commit bây giờ chỉ đóng bản đã \`add\`.`,
        'warn',
      ),
    );
  }

  if (entries.length === 0) {
    output.push(line('Không có gì để commit, worktree sạch.', 'success'));
  }

  return opOk(repo, output);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. `git diff`
// ═══════════════════════════════════════════════════════════════════════════

export type DiffChange = 'added' | 'deleted' | 'modified';

export interface DiffPair {
  readonly path: FilePath;
  readonly before: Lines;
  readonly after: Lines;
  readonly change: DiffChange;
}

/**
 * Vẽ THÂN một diff (các hunk `+`/`-`), do chỗ gọi cấp.
 *
 * ⛔ File này **không** hiện thực thuật toán diff, và sự vắng mặt đó là chủ ý:
 * `git/diff.ts` (lane khác) sở hữu phép so theo dòng, và viết bản thứ hai ở đây
 * là đúng thứ `development-principles.md` § SSOT cấm. Nhận qua tham số chứ
 * không `import` vì lúc file này ra đời `diff.ts` chưa tồn tại — một `import`
 * vào module chưa có sẽ làm cả package đỏ ở typecheck.
 *
 * Không cấp renderer thì `gitDiff` và `gitShow` in danh sách file thay đổi kèm
 * loại thay đổi. Đó là output ĐÚNG và đầy đủ ở mức của nó (`git diff
 * --name-status`), không phải một chỗ trống giả vờ.
 */
export type DiffBodyRenderer = (pair: DiffPair) => readonly OutputLine[];

/** Hai bản ghi nội dung → danh sách cặp khác nhau, đã sắp theo đường dẫn. */
export function diffContents(
  before: Readonly<Record<FilePath, Lines>>,
  after: Readonly<Record<FilePath, Lines>>,
  paths?: readonly FilePath[] | undefined,
): readonly DiffPair[] {
  const universe: Record<FilePath, true> = {};
  for (const path of sortedKeys(before)) universe[path] = true;
  for (const path of sortedKeys(after)) universe[path] = true;

  const out: DiffPair[] = [];
  for (const path of sortedKeys(universe)) {
    if (paths !== undefined && paths.length > 0 && !paths.includes(path)) continue;
    const left = before[path];
    const right = after[path];
    if (left === undefined && right === undefined) continue;
    if (left === undefined) {
      out.push({ path, before: [], after: right ?? [], change: 'added' });
      continue;
    }
    if (right === undefined) {
      out.push({ path, before: left, after: [], change: 'deleted' });
      continue;
    }
    // So bằng chính phép băm mà `status` dùng, nên hai lệnh không thể bất đồng
    // về việc một file có đổi hay không.
    if (blobOid(left) === blobOid(right)) continue;
    out.push({ path, before: left, after: right, change: 'modified' });
  }
  return out;
}

export interface DiffOptions {
  /** `true` = so index với HEAD ("thứ sắp được commit"). `false` = worktree với index. */
  readonly staged?: boolean | undefined;
  readonly paths?: readonly FilePath[] | undefined;
  readonly renderBody?: DiffBodyRenderer | undefined;
}

/**
 * Các cặp file mà `git diff` sẽ nói tới.
 *
 * ⚠ Ở chế độ không-staged, chỉ xét đường dẫn CÓ TRONG INDEX. File chưa track
 * không xuất hiện trong `git diff` của git thật, và để nó lọt vào đây sẽ khiến
 * mọi file mới trông như một thay đổi khổng lồ ngay khi người chơi vừa tạo nó.
 */
export function diffPairs(repo: Repo, options: DiffOptions = {}): readonly DiffPair[] {
  if (options.staged === true) {
    return diffContents(headContents(repo), indexContents(repo), options.paths);
  }
  const index = indexContents(repo);
  // Đường dẫn có trong index nhưng không còn trong worktree là file ĐÃ XOÁ, và
  // `diffContents` nhận ra điều đó qua sự VẮNG MẶT của khoá — nên phải bỏ hẳn
  // khoá đi, không được gán một mảng rỗng (mảng rỗng là "file tồn tại nhưng
  // không còn dòng nào", một trạng thái khác hẳn).
  const after: Record<FilePath, Lines> = {};
  for (const path of sortedKeys(index)) {
    const lines = repo.worktree[path];
    if (lines !== undefined) after[path] = lines;
  }
  return diffContents(index, after, options.paths);
}

const CHANGE_LABEL: Readonly<Record<DiffChange, string>> = {
  added: 'file mới:',
  deleted: 'xoá:',
  modified: 'sửa:',
};

/**
 * Vẽ một danh sách cặp diff.
 *
 * Dùng chung cho `git diff` và `git show` — hai lệnh khác nhau về chỗ LẤY hai
 * bản nội dung, nhưng giống hệt nhau về chỗ in ra, và tách ở đây giữ cho
 * `inspect.ts` không phải biết định dạng header `diff --git`.
 */
export function renderDiffPairs(
  pairs: readonly DiffPair[],
  render?: DiffBodyRenderer | undefined,
): readonly OutputLine[] {
  const output: OutputLine[] = [];
  for (const pair of pairs) {
    if (render === undefined) {
      output.push(line(`${label(CHANGE_LABEL[pair.change])}${pair.path}`, 'plain'));
      continue;
    }
    output.push(line(`diff --git a/${pair.path} b/${pair.path}`, 'plain'));
    output.push(line(pair.change === 'added' ? '--- /dev/null' : `--- a/${pair.path}`));
    output.push(line(pair.change === 'deleted' ? '+++ /dev/null' : `+++ b/${pair.path}`));
    output.push(...render(pair));
  }
  return output;
}

/** `git diff` / `git diff --staged`. Lệnh chỉ đọc — không bao giờ đổi trạng thái. */
export function gitDiff(repo: Repo, options: DiffOptions = {}): RepoOpResult {
  const pairs = diffPairs(repo, options);
  const scope =
    options.staged === true ? 'index với commit HEAD đang trỏ tới' : 'worktree với index';

  if (pairs.length === 0) {
    return opOk(repo, [line(`Không có khác biệt nào giữa ${scope}.`, 'plain')]);
  }

  return opOk(repo, [
    line(`Khác biệt giữa ${scope}:`),
    ...renderDiffPairs(pairs, options.renderBody),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. `git checkout -- <đường-dẫn>`
// ═══════════════════════════════════════════════════════════════════════════

export interface CheckoutPathsOptions {
  readonly paths: readonly FilePath[];
  /** Không nêu ⇒ lấy từ INDEX. Có nêu ⇒ lấy từ commit đó, và ghi cả vào index. */
  readonly rev?: string | undefined;
}

/**
 * `git checkout [<ref>] -- <đường-dẫn>…`.
 *
 * ⚠ Đây là một trong số RẤT ÍT lệnh git phá huỷ thật: nội dung worktree bị ghi
 * đè và bản cũ **không nằm ở đâu cả** — chưa `add` thì không có blob, chưa
 * commit thì không có object, nên reflog cũng không cứu được. Git thật làm việc
 * này im lặng; game thì nói ra, vì "lệnh nào cứu được, lệnh nào không" chính là
 * thứ phân biệt người dùng git tự tin với người dùng git sợ hãi.
 *
 * Hai dạng, khác nhau ở chỗ chạm:
 * - không có ref: index → worktree (index không đổi).
 * - có ref: commit → **cả index lẫn worktree**.
 */
export function gitCheckoutPaths(repo: Repo, options: CheckoutPathsOptions): RepoOpResult {
  if (options.paths.length === 0) {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        '`git checkout --` cần ít nhất một đường dẫn.',
        'Dạng có `--` là dạng LẤY LẠI NỘI DUNG FILE, nên nó phải biết lấy lại file nào.',
        'Ví dụ: `git checkout -- src/app.ts`',
      ),
    );
  }

  let source: Readonly<Record<FilePath, Lines>>;
  let fromLabel: string;
  if (options.rev === undefined) {
    source = indexContents(repo);
    fromLabel = 'index';
  } else {
    const resolved = resolveRevision(repo, options.rev);
    if (!resolved.ok) {
      return opFail(
        repo,
        revisionError(
          repo,
          options.rev,
          resolved.reason,
          '`git checkout <ref> -- <file>` lấy nội dung file từ một commit có thật.',
        ),
      );
    }
    source = commitContents(repo.objects, resolved.oid);
    fromLabel = `commit ${shortOid(resolved.oid)}`;
  }

  const universe = sortedKeys(source);
  const expansion = expandPaths(universe, options.paths);
  if (!expansion.ok) return opFail(repo, pathNotFoundError(expansion.missing, universe));

  let next = repo;
  const overwritten: FilePath[] = [];
  for (const path of expansion.paths) {
    const lines = source[path];
    if (lines === undefined) continue;
    const current = repo.worktree[path];
    if (current === undefined || blobOid(current) !== blobOid(lines)) overwritten.push(path);
    next = writeFile(next, path, lines);
    if (options.rev !== undefined) {
      const [objects, oid] = putObject(next.objects, makeBlob(lines));
      next = stagePath({ ...next, objects }, path, oid);
    }
  }

  const output: OutputLine[] = [
    line(`Đã lấy lại ${expansion.paths.length} đường dẫn từ ${fromLabel}.`, 'success'),
  ];
  if (overwritten.length > 0) {
    output.push(
      line(
        `Bản cũ trong worktree của ${overwritten.map((path) => `\`${path}\``).join(', ')} đã bị ghi đè và KHÔNG cứu lại được — nó chưa từng được \`add\` hay commit nên không có object nào giữ nó.`,
        'warn',
      ),
    );
  }
  return opOk(next, output);
}

/**
 * Đặt lại index thành đúng nội dung một commit.
 *
 * Xuất ra ngoài vì `branch.ts` cần đúng phép này khi `switch`/`checkout` chuyển
 * HEAD, và vì hiện thực lại nó ở đó sẽ là chỗ thứ hai có thể quên rằng index là
 * ẢNH CHỤP ĐẦY ĐỦ (đọc lại chú thích đầu file).
 */
export function setIndexFromCommit(repo: Repo, oid: Oid | null): Repo {
  const tree = commitTree(repo.objects, oid);
  if (tree === null) return setIndex(repo, {});
  const object = repo.objects[tree];
  if (object === undefined || object.kind !== 'tree') return setIndex(repo, {});
  const index: Record<FilePath, Oid> = {};
  for (const entry of object.entries) index[entry.path] = entry.oid;
  return setIndex(repo, index);
}
