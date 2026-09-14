/**
 * `branch` · `switch` · `checkout <ref>` · `tag`.
 *
 * Ba luật chung của tầng `ops/` nằm ở đầu `basic.ts`; file này thêm hai điều
 * riêng của việc DI CHUYỂN HEAD:
 *
 * ## 1. `detached-head-warning` KHÔNG đi ra bằng đường `error`
 *
 * `contract.ts` §5 ghim: `error !== null` ⇒ trạng thái **không đổi**, và ngoại
 * lệ duy nhất có tên là `merge-conflict`/`unmerged-paths`. Nhưng `git checkout
 * <oid>` thì ĐÃ chuyển HEAD rồi mới cảnh báo — trả nó qua `error` sẽ nói dối
 * lane engine rằng repo còn nguyên, và `undo` sẽ tin lời nói dối đó.
 *
 * Nên cảnh báo detached đi ra bằng `OutputLine` giọng `warn`. Mã
 * `detached-head-warning` trong `GitErrorCode` vì thế hiện chưa có chỗ dùng ở
 * tầng này — đã báo lead.
 *
 * ## 2. Chặn chuyển branch khi worktree bẩn, NHƯNG chỉ khi có gì để mất
 *
 * Chuyển sang một commit có **cùng tree** (trường hợp phổ biến nhất:
 * `git switch -c nhánh-mới`) không đụng một byte nào trong worktree, nên chặn
 * nó là chặn đúng thao tác mà người ta dùng nhiều nhất. Phép kiểm vì vậy là:
 * *tree đích khác tree hiện tại* **và** *worktree hoặc index đang bẩn*.
 *
 * Đơn giản hoá đã biết: git thật còn tinh hơn — nó chỉ từ chối khi file bẩn NẰM
 * TRONG tập file khác nhau giữa hai tree. Bản ở đây từ chối rộng hơn một chút.
 * Đánh đổi có ý thức: rộng hơn thì thừa an toàn, và thông báo từ chối chính là
 * cầu nối sang `git stash` (bài G22) nên nó không phải một ngõ cụt.
 */

import type { FilePath, Head, Lines, Oid, OutputLine, RefName, Repo, RepoOpResult } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { gitError, notARefError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { commitContents, commitTree, getCommit, isAncestor } from '../objects.ts';
import { knownRefNames, resolveRevision, revisionError } from '../refs-resolve.ts';
import {
  branchNames,
  branchRef,
  deleteRef,
  headOid,
  headRef,
  isBranch,
  isIndexClean,
  isWorktreeClean,
  moveHead,
  remoteRefNames,
  setRef,
  setWorktree,
  shortRefName,
  tagNames,
  tagRef,
} from '../repo.ts';
import { line, opFail, opOk, setIndexFromCommit } from './basic.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 0. CHUYỂN HEAD — lõi dùng chung của `switch` và `checkout`
// ═══════════════════════════════════════════════════════════════════════════

interface SwitchTarget {
  readonly oid: Oid;
  /** Ref đầu vào NÊU TÊN. Chỉ ref dạng branch mới làm HEAD bám vào. */
  readonly ref: RefName | null;
}

/** File đang ở worktree mà index không biết tới — chúng sống sót qua mọi lần chuyển branch. */
function untrackedFiles(repo: Repo): Readonly<Record<FilePath, Lines>> {
  const out: Record<FilePath, Lines> = {};
  for (const path of sortedKeys(repo.worktree)) {
    if (Object.hasOwn(repo.index, path)) continue;
    const lines = repo.worktree[path];
    if (lines !== undefined) out[path] = lines;
  }
  return out;
}

/** Cảnh báo detached HEAD — bài G05, và là nửa đất trống đo được ở design §3.1. */
function detachedWarning(oid: Oid): readonly OutputLine[] {
  return [
    line(`HEAD giờ trỏ THẲNG vào commit ${shortOid(oid)}, không qua branch nào.`, 'warn'),
    line(
      'Commit tạo ở trạng thái này không thuộc branch nào — chuyển đi chỗ khác là chúng thành mồ côi (vẫn còn trong kho, nhưng không ai trỏ tới).',
      'warn',
    ),
    line(`Muốn giữ lại thì đặt tên cho chỗ này: \`git switch -c <tên-branch>\`.`, 'hint'),
  ];
}

function dirtyWorktreeError(target: SwitchTarget): ReturnType<typeof gitError> {
  const where = target.ref === null ? `commit ${shortOid(target.oid)}` : shortRefName(target.ref);
  return gitError(
    'bad-usage',
    `Không chuyển sang \`${where}\` được: worktree đang có thay đổi chưa lưu.`,
    'Chuyển chỗ sẽ ghi đè worktree bằng nội dung của commit đích, và những thay đổi chưa được commit sẽ biến mất mà không có object nào giữ lại — reflog cũng không cứu được thứ chưa bao giờ được ghi.',
    'Hai đường: commit chúng lại (`git add .` rồi `git commit`), hoặc cất tạm bằng `git stash` rồi lấy lại sau bằng `git stash pop`.',
  );
}

/**
 * Chuyển HEAD sang `target`, cập nhật index và worktree.
 *
 * Trả `RepoOpResult` chứ không trả `Repo` vì nó có hai đường từ chối riêng (bẩn
 * / đè lên file chưa track), và cả hai đều cần một `GitError` đủ ba phần.
 */
function applySwitch(
  repo: Repo,
  target: SwitchTarget,
  logicalTime: number,
  reflogMessage: string,
): RepoOpResult {
  const currentTree = commitTree(repo.objects, headOid(repo));
  const targetTree = commitTree(repo.objects, target.oid);
  const sameTree = currentTree !== null && currentTree === targetTree;

  let next = repo;

  if (!sameTree) {
    if (!isIndexClean(repo) || !isWorktreeClean(repo)) {
      return opFail(repo, dirtyWorktreeError(target));
    }

    const contents = commitContents(repo.objects, target.oid);
    const survivors = untrackedFiles(repo);
    const clash = sortedKeys(survivors).filter((path) => Object.hasOwn(contents, path));
    if (clash.length > 0) {
      return opFail(
        repo,
        gitError(
          'bad-usage',
          `Chuyển chỗ sẽ ghi đè file chưa được theo dõi: ${clash.map((path) => `\`${path}\``).join(', ')}.`,
          'Commit đích có file cùng tên, mà bản đang nằm trong worktree thì chưa từng được `add` — không object nào giữ nó, nên ghi đè là mất hẳn.',
          'Đưa chúng vào index và commit, hoặc đổi tên/xoá chúng trước khi chuyển.',
        ),
      );
    }

    next = setWorktree(next, { ...survivors, ...contents });
    next = setIndexFromCommit(next, target.oid);
  }

  const head: Head =
    target.ref !== null && isBranch(target.ref)
      ? { type: 'ref', ref: target.ref }
      : { type: 'detached', oid: target.oid };

  next = moveHead(next, head, { op: 'checkout', message: reflogMessage, logicalTime });
  return opOk(next, []);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. `git branch`
// ═══════════════════════════════════════════════════════════════════════════

export interface BranchOptions {
  /** Tham số vị trí, dạng NGẮN (`main`), theo đúng thứ tự người chơi gõ. */
  readonly names?: readonly string[] | undefined;
  readonly delete?: boolean | undefined;
  /** `-f`. Kèm `-d` thành `-D`: xoá bất chấp đã merge hay chưa. */
  readonly force?: boolean | undefined;
  readonly move?: boolean | undefined;
  /** `-a`: liệt kê cả ref theo dõi remote. */
  readonly all?: boolean | undefined;
  readonly logicalTime: number;
}

function branchMissingError(repo: Repo, name: string): ReturnType<typeof gitError> {
  const existing = branchNames(repo.refs);
  return notARefError(
    name,
    existing.length === 0 ? knownRefNames(repo) : existing,
    'Branch phải có thật thì mới xoá hay đổi tên được.',
  );
}

function listBranches(repo: Repo, all: boolean): RepoOpResult {
  const current = headRef(repo);
  const locals = branchNames(repo.refs);
  const output: OutputLine[] = [];

  if (locals.length === 0) {
    output.push(line('Chưa có branch nào.', 'plain'));
    if (repo.head.type === 'ref') {
      output.push(
        line(
          `HEAD đang trỏ vào \`${shortRefName(repo.head.ref)}\`, nhưng branch đó chỉ ra đời cùng commit đầu tiên.`,
          'hint',
        ),
      );
    }
  }

  for (const name of locals) {
    const oid = repo.refs[branchRef(name)];
    const marker = current === branchRef(name) ? '*' : ' ';
    const head = oid === undefined ? '' : ` ${shortOid(oid)}`;
    const message = oid === undefined ? '' : ` ${getCommit(repo.objects, oid)?.message ?? ''}`;
    output.push(line(`${marker} ${name.padEnd(16, ' ')}${head}${message}`, marker === '*' ? 'success' : 'plain'));
  }

  if (all) {
    for (const name of remoteRefNames(repo.refs)) {
      const oid = repo.refs[`refs/remotes/${name}`];
      output.push(line(`  remotes/${name}${oid === undefined ? '' : ` ${shortOid(oid)}`}`, 'plain'));
    }
  }

  if (repo.head.type === 'detached') {
    output.push(line(`* (HEAD tách rời tại ${shortOid(repo.head.oid)})`, 'warn'));
  }

  return opOk(repo, output);
}

function deleteBranches(repo: Repo, names: readonly string[], force: boolean): RepoOpResult {
  const current = headRef(repo);
  const head = headOid(repo);

  // Kiểm HẾT trước khi xoá cái nào — nửa tác dụng là thứ luật 1 của tầng cấm.
  for (const name of names) {
    const ref = branchRef(name);
    const oid = repo.refs[ref];
    if (oid === undefined) return opFail(repo, branchMissingError(repo, name));
    if (current === ref) {
      return opFail(
        repo,
        gitError(
          'branch-checked-out',
          `Không xoá được \`${name}\`: HEAD đang đứng trên chính branch đó.`,
          'Xoá branch mình đang đứng sẽ để HEAD trỏ vào một ref không tồn tại — git không cho phép trạng thái đó.',
          `Chuyển sang branch khác trước: \`git switch <branch-khác>\`, rồi mới \`git branch -d ${name}\`.`,
        ),
      );
    }
    if (!force && (head === null || !isAncestor(repo.objects, oid, head))) {
      return opFail(
        repo,
        gitError(
          'bad-usage',
          `Không xoá được \`${name}\`: branch này chưa được merge vào chỗ bạn đang đứng.`,
          `Commit ${shortOid(oid)} của \`${name}\` không nằm trong lịch sử của \`${head === null ? 'HEAD' : shortOid(head)}\`, nên xoá con trỏ này là để lại một nhánh công việc không còn ai trỏ tới.`,
          `Merge nó trước, hoặc xoá bất chấp bằng \`git branch -D ${name}\` — commit vẫn còn trong kho, và \`git reflog\` (reflog của HEAD) chỉ ra chỗ chúng nằm.`,
        ),
      );
    }
  }

  let next = repo;
  const output: OutputLine[] = [];
  for (const name of names) {
    const ref = branchRef(name);
    const oid = repo.refs[ref];
    next = deleteRef(next, ref);
    output.push(line(`Đã xoá branch ${name} (đang ở ${shortOid(oid ?? '')}).`, 'success'));
  }
  output.push(
    line(
      'Xoá branch chỉ xoá CON TRỎ — commit vẫn nằm nguyên trong kho. Nhưng reflog RIÊNG của branch thì mất cùng nó, đúng như git thật.',
      'hint',
    ),
  );
  output.push(
    line(
      'Đường về là reflog của HEAD: hồi bạn còn đứng trên branch đó, HEAD đã từng trỏ vào commit cuối của nó. Gõ `git reflog` (không tham số) để thấy.',
      'hint',
    ),
  );
  return opOk(next, output);
}

function renameBranch(repo: Repo, names: readonly string[], force: boolean, logicalTime: number): RepoOpResult {
  const current = headRef(repo);
  const from = names.length >= 2 ? names[0] : current === null ? null : shortRefName(current);
  const to = names.length >= 2 ? names[1] : names[0];

  if (from === null || from === undefined || to === undefined || to === '') {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        '`git branch -m` cần biết đổi tên thành gì.',
        'Một tên nghĩa là "đổi tên branch hiện tại thành tên này"; hai tên nghĩa là "đổi <cũ> thành <mới>". HEAD đang tách rời thì không có branch hiện tại để đổi.',
        'Ví dụ: `git branch -m main` hoặc `git branch -m master main`',
      ),
    );
  }

  const fromRef = branchRef(from);
  const toRef = branchRef(to);
  const oid = repo.refs[fromRef];
  if (oid === undefined) return opFail(repo, branchMissingError(repo, from));

  if (!force && Object.hasOwn(repo.refs, toRef)) {
    return opFail(repo, branchExistsError(to));
  }

  let next = setRef(repo, toRef, oid, {
    op: 'branch',
    message: `đổi tên từ ${from}`,
    logicalTime,
  });
  if (current === fromRef) {
    next = moveHead(next, { type: 'ref', ref: toRef }, {
      op: 'checkout',
      message: `theo branch vừa đổi tên: ${to}`,
      logicalTime,
    });
  }
  next = deleteRef(next, fromRef);

  return opOk(next, [
    line(`Đã đổi tên branch ${from} → ${to}.`, 'success'),
    line('Commit không đổi Oid — đổi tên branch chỉ đổi tên một con trỏ.', 'hint'),
  ]);
}

function branchExistsError(name: string): ReturnType<typeof gitError> {
  return gitError(
    'branch-exists',
    `Đã có branch tên \`${name}\` rồi.`,
    'Hai branch không thể trùng tên — tên branch chính là khoá trỏ tới commit, nên trùng tên nghĩa là ghi đè con trỏ cũ.',
    `Chọn tên khác, hoặc chuyển sang branch đó bằng \`git switch ${name}\`.`,
  );
}

function createBranch(repo: Repo, name: string, startPoint: string | undefined, logicalTime: number): RepoOpResult {
  if (name === '') {
    return opFail(
      repo,
      gitError('bad-usage', 'Tên branch rỗng.', 'Branch phải có tên để trỏ tới được.', 'Ví dụ: `git branch feature`'),
    );
  }
  if (Object.hasOwn(repo.refs, branchRef(name))) return opFail(repo, branchExistsError(name));

  const revision = startPoint ?? 'HEAD';
  const resolved = resolveRevision(repo, revision);
  if (!resolved.ok) {
    return opFail(
      repo,
      revisionError(repo, revision, resolved.reason, 'Branch mới phải bắt đầu từ một commit có thật.'),
    );
  }

  const next = setRef(repo, branchRef(name), resolved.oid, {
    op: 'branch',
    message: `tạo từ ${revision}`,
    logicalTime,
  });

  return opOk(next, [
    line(`Đã tạo branch ${name} tại ${shortOid(resolved.oid)}.`, 'success'),
    line(
      'Tạo branch KHÔNG sao chép file hay commit nào — nó chỉ ghi thêm một con trỏ vào cùng commit đó. HEAD vẫn chưa chuyển đi đâu cả.',
      'hint',
    ),
  ]);
}

/** `git branch` — liệt kê, tạo, xoá (`-d`/`-D`), đổi tên (`-m`). */
export function gitBranch(repo: Repo, options: BranchOptions): RepoOpResult {
  const names = options.names ?? [];
  const force = options.force === true;

  if (options.delete === true) {
    if (names.length === 0) {
      return opFail(
        repo,
        gitError(
          'bad-usage',
          '`git branch -d` cần tên branch muốn xoá.',
          'Không nêu tên thì lệnh không biết xoá con trỏ nào.',
          'Ví dụ: `git branch -d feature`',
        ),
      );
    }
    // Không truyền `logicalTime`: `deleteRef` không ghi thêm dòng reflog nào —
    // nó XOÁ reflog riêng của branch (sửa 2026-09-14, xem chú thích của
    // `deleteRef`). Đường cứu của bài G27 vì vậy là reflog của HEAD.
    return deleteBranches(repo, names, force);
  }

  if (options.move === true) return renameBranch(repo, names, force, options.logicalTime);

  if (names.length === 0) return listBranches(repo, options.all === true);

  return createBranch(repo, names[0] ?? '', names[1], options.logicalTime);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. `git switch`
// ═══════════════════════════════════════════════════════════════════════════

export interface SwitchOptions {
  /** Tham số vị trí: branch muốn sang, hoặc điểm bắt đầu khi đi cùng `-c`. */
  readonly target?: string | undefined;
  /** `-c <tên>`: tạo branch mới rồi chuyển sang. */
  readonly create?: string | undefined;
  readonly detach?: boolean | undefined;
  readonly logicalTime: number;
}

/**
 * `git switch`.
 *
 * ⚠ **`switch` chỉ nhận branch.** Đưa cho nó một Oid hay một tag thì nó từ chối
 * và chỉ đường sang `--detach`. Đó là toàn bộ lý do git tách `switch` ra khỏi
 * `checkout` năm 2019: `checkout` im lặng detach và người học rơi vào trạng thái
 * đó mà không biết mình đang ở đâu (bài G05).
 */
export function gitSwitch(repo: Repo, options: SwitchOptions): RepoOpResult {
  if (repo.pending !== null) return opFail(repo, pendingSwitchError(repo, '`git switch`'));

  if (options.create !== undefined && options.create !== '') {
    const created = createBranch(repo, options.create, options.target, options.logicalTime);
    if (created.error !== null) return created;
    const oid = created.repo.refs[branchRef(options.create)];
    if (oid === undefined) return created;
    const moved = applySwitch(
      created.repo,
      { oid, ref: branchRef(options.create) },
      options.logicalTime,
      `sang branch mới ${options.create}`,
    );
    if (moved.error !== null) return opFail(repo, moved.error);
    return opOk(moved.repo, [
      ...created.output,
      line(`Đã chuyển sang branch ${options.create}.`, 'success'),
    ]);
  }

  const target = options.target;
  if (target === undefined || target === '') {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        '`git switch` cần biết chuyển sang đâu.',
        'Không có tham số nào và cũng không có `-c`, nên lệnh không có đích.',
        'Ví dụ: `git switch main`, hoặc `git switch -c feature` để tạo branch mới.',
      ),
    );
  }

  const resolved = resolveRevision(repo, target);
  if (!resolved.ok) {
    const error = revisionError(repo, target, resolved.reason, '`git switch` cần một branch có thật.');
    return opFail(repo, {
      ...error,
      suggest: `${error.suggest ?? ''} Chưa có branch đó thì tạo luôn: \`git switch -c ${target}\`.`.trim(),
    });
  }

  const isBranchTarget = resolved.ref !== null && isBranch(resolved.ref);
  if (!isBranchTarget && options.detach !== true) {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        `\`${target}\` không phải một branch.`,
        `Nó phân giải ra commit ${shortOid(resolved.oid)}, nhưng \`switch\` cố tình CHỈ nhận branch — đó là điểm khác nhau giữa nó và \`checkout\`, và là thứ giữ người dùng khỏi rơi vào detached HEAD mà không hay biết.`,
        `Thật sự muốn đứng thẳng trên commit đó thì nói ra: \`git switch --detach ${target}\`. Hoặc đặt tên cho nó: \`git switch -c <tên> ${target}\`.`,
      ),
    );
  }

  const moved = applySwitch(
    repo,
    { oid: resolved.oid, ref: options.detach === true ? null : resolved.ref },
    options.logicalTime,
    `sang ${target}`,
  );
  if (moved.error !== null) return moved;

  const detached = moved.repo.head.type === 'detached';
  return opOk(moved.repo, [
    line(
      detached ? `Đã tách HEAD ra khỏi branch.` : `Đã chuyển sang branch ${shortRefName(resolved.ref ?? target)}.`,
      detached ? 'warn' : 'success',
    ),
    ...(detached ? detachedWarning(resolved.oid) : []),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. `git checkout <ref>`
// ═══════════════════════════════════════════════════════════════════════════

export interface CheckoutOptions {
  readonly target?: string | undefined;
  /** `-b <tên>`: tạo branch mới rồi chuyển sang. */
  readonly createBranch?: string | undefined;
  readonly logicalTime: number;
}

/**
 * `git checkout <ref>` / `git checkout -b <tên>`.
 *
 * Khác `switch` ở đúng một điểm và điểm đó là bài học: đưa cho nó một Oid hay
 * một tag thì nó **làm luôn** và detach HEAD, chỉ kèm một cảnh báo. Đó là hành
 * vi lịch sử của git, và người học cần gặp nó ở một chỗ an toàn (ở đây) thay vì
 * ở một repo thật.
 *
 * `git checkout -- <đường-dẫn>` là một lệnh KHÁC HẲN dùng chung tên; nó nằm ở
 * `basic.ts` (`gitCheckoutPaths`). Lane bộ phân tích tách hai đường đó bằng sự
 * có mặt của `--`.
 */
export function gitCheckout(repo: Repo, options: CheckoutOptions): RepoOpResult {
  if (repo.pending !== null) return opFail(repo, pendingSwitchError(repo, '`git checkout`'));

  if (options.createBranch !== undefined && options.createBranch !== '') {
    return gitSwitch(repo, {
      create: options.createBranch,
      ...(options.target === undefined ? {} : { target: options.target }),
      logicalTime: options.logicalTime,
    });
  }

  const target = options.target;
  if (target === undefined || target === '') {
    return opFail(
      repo,
      gitError(
        'bad-usage',
        '`git checkout` cần biết chuyển sang đâu.',
        'Không có ref nào được nêu, và cũng không có `--` để chuyển sang dạng lấy lại file.',
        'Ví dụ: `git checkout main`, `git checkout -b feature`, hoặc `git checkout -- <file>`.',
      ),
    );
  }

  const resolved = resolveRevision(repo, target);
  if (!resolved.ok) {
    return opFail(
      repo,
      revisionError(repo, target, resolved.reason, '`git checkout` cần một ref hoặc commit có thật.'),
    );
  }

  const moved = applySwitch(repo, { oid: resolved.oid, ref: resolved.ref }, options.logicalTime, `sang ${target}`);
  if (moved.error !== null) return moved;

  const detached = moved.repo.head.type === 'detached';
  return opOk(moved.repo, [
    line(
      detached ? 'HEAD đã tách rời.' : `Đã chuyển sang branch ${shortRefName(resolved.ref ?? target)}.`,
      detached ? 'warn' : 'success',
    ),
    ...(detached ? detachedWarning(resolved.oid) : []),
  ]);
}

function pendingSwitchError(repo: Repo, what: string): ReturnType<typeof gitError> {
  const kind = repo.pending?.kind ?? 'merge';
  return gitError(
    'operation-in-progress',
    `${what} chưa chạy được: đang giữa một \`${kind}\`.`,
    'Chuyển branch lúc này sẽ bỏ lại một thao tác nửa chừng, và repo sẽ ở trạng thái không ai đọc ra được nó đang làm gì.',
    `Kết thúc bằng \`git ${kind} --continue\`, hoặc quay về chỗ cũ bằng \`git ${kind} --abort\`.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. `git tag`
// ═══════════════════════════════════════════════════════════════════════════

export interface TagOptions {
  readonly names?: readonly string[] | undefined;
  readonly delete?: boolean | undefined;
  readonly list?: boolean | undefined;
  /** `-a`. Game chỉ có tag nhẹ — xem chú thích của `gitTag`. */
  readonly annotate?: boolean | undefined;
  readonly message?: string | undefined;
  readonly logicalTime: number;
}

/**
 * `git tag`.
 *
 * ⚠ **Chỉ tag nhẹ.** Tag của game là một ref trỏ thẳng vào commit, không có
 * "tag object" mang tác giả và chú thích riêng. Cố tình: một object thứ tư
 * trong kho sẽ đẻ ra một tầng Oid trung gian mà người chơi không bao giờ nhìn
 * thấy, trong khi không level nào trong 32 level dạy sự khác nhau giữa tag nhẹ
 * và tag có chú thích.
 *
 * Nên `-a`/`-m` được NHẬN chứ không báo lỗi — từ chối một cờ có thật trong bảng
 * lệnh sẽ dạy người chơi rằng git không có nó — nhưng lệnh nói thẳng ra rằng nó
 * tạo một tag nhẹ.
 */
export function gitTag(repo: Repo, options: TagOptions): RepoOpResult {
  const names = options.names ?? [];

  if (options.delete === true) {
    const name = names[0];
    if (name === undefined || name === '') {
      return opFail(
        repo,
        gitError(
          'bad-usage',
          '`git tag -d` cần tên tag muốn xoá.',
          'Không nêu tên thì lệnh không biết xoá cái nào.',
          'Ví dụ: `git tag -d v1.0`',
        ),
      );
    }
    const ref = tagRef(name);
    if (!Object.hasOwn(repo.refs, ref)) {
      return opFail(repo, notARefError(name, tagNames(repo.refs), 'Tag phải có thật thì mới xoá được.'));
    }
    return opOk(deleteRef(repo, ref), [
      line(`Đã xoá tag ${name}.`, 'success'),
      line('Commit mà nó trỏ tới vẫn còn nguyên — xoá tag chỉ xoá cái tên.', 'hint'),
    ]);
  }

  if (options.list === true || names.length === 0) {
    const tags = tagNames(repo.refs);
    if (tags.length === 0) return opOk(repo, [line('Chưa có tag nào.', 'plain')]);
    return opOk(
      repo,
      tags.map((name) => {
        const oid = repo.refs[tagRef(name)];
        return line(`${name.padEnd(16, ' ')}${oid === undefined ? '' : shortOid(oid)}`);
      }),
    );
  }

  const name = names[0] ?? '';
  if (Object.hasOwn(repo.refs, tagRef(name))) {
    // ⚠ `GitErrorCode` chưa có `tag-exists`; `branch-exists` là mã gần nhất
    // ("tên ref này đã có chủ") và thông điệp nói rõ đây là tag. Đã báo lead.
    return opFail(
      repo,
      gitError(
        'branch-exists',
        `Đã có tag tên \`${name}\` rồi.`,
        'Tag là một con trỏ cố định; trùng tên nghĩa là ghi đè con trỏ cũ, và git không làm việc đó trong im lặng.',
        `Xoá cái cũ trước nếu thật sự muốn dời: \`git tag -d ${name}\`.`,
      ),
    );
  }

  const revision = names[1] ?? 'HEAD';
  const resolved = resolveRevision(repo, revision);
  if (!resolved.ok) {
    return opFail(repo, revisionError(repo, revision, resolved.reason, 'Tag phải gắn vào một commit có thật.'));
  }

  const next = setRef(repo, tagRef(name), resolved.oid, {
    op: 'tag',
    message: `gắn vào ${revision}`,
    logicalTime: options.logicalTime,
  });

  const output: OutputLine[] = [
    line(`Đã gắn tag ${name} vào ${shortOid(resolved.oid)}.`, 'success'),
  ];
  if (options.annotate === true || (options.message !== undefined && options.message !== '')) {
    output.push(
      line(
        'Game chỉ có tag NHẸ: một con trỏ tới commit, không có object riêng mang tác giả và chú thích. `-a`/`-m` vì vậy không tạo thêm gì.',
        'hint',
      ),
    );
  }
  output.push(line('Khác branch ở chỗ tag KHÔNG tự dời khi bạn commit tiếp.', 'hint'));
  return opOk(next, output);
}
