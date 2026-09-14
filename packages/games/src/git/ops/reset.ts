/**
 * `git reset` ba kiểu và `git revert` — cộng hai kiểu dữ liệu mà cả bốn file
 * `ops/` của lane cứu hộ dùng chung.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO `reset` LÀ MISFIT, KHÔNG PHẢI MỘT LỆNH KHÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Perez De Rosso & Jackson (MIT, Onward! 2013) đo được rằng *staged version* và
 * *working version* không trực giao trong đầu người dùng: "có xảy ra hay không
 * thì tuỳ tham số truyền vào". `git reset` là chỗ sự không-trực-giao đó lộ ra
 * rõ nhất, vì cùng một động từ chạm **ba tập vùng khác nhau** tuỳ một cờ:
 *
 * |            | ref HEAD | index                | worktree             |
 * |------------|----------|----------------------|----------------------|
 * | `--soft`   | dời      | GIỮ NGUYÊN           | GIỮ NGUYÊN           |
 * | `--mixed`  | dời      | đặt lại theo đích    | GIỮ NGUYÊN           |
 * | `--hard`   | dời      | đặt lại theo đích    | đặt lại theo đích    |
 *
 * Bảng này KHÔNG được đoán, và test của file này khẳng định **từng ô một**: ba
 * kiểu × ba vùng = chín phép khẳng định. Một test chỉ kiểm "ref đã dời" sẽ xanh
 * cho cả ba kiểu, tức chứng minh được đúng con số không.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `reset --hard` KHÔNG XOÁ GÌ KHỎI KHO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Commit bị bỏ lại vẫn nằm nguyên trong `ObjectStore`; chỉ *reachability* mất.
 * Đó là toàn bộ điều kiện của bài G26 (cứu commit sau `reset --hard`) và là thứ
 * Learn Git Branching không thể dạy — mô hình cây thuần của nó không tách *lưu
 * trữ* khỏi *với-tới-được*. Xem chú thích đầu `objects.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE CHƯA TRACK SỐNG SÓT QUA `--hard`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Đúng như git thật: `reset --hard` vứt thay đổi ở file ĐÃ TRACK, còn file chưa
 * track thì để nguyên (chỉ xoá cái nào "chắn đường" một file được ghi đè lên).
 * Mô hình hoá ở `untrackedWorktree()` dưới đây. Bỏ chi tiết này đi sẽ làm bài
 * dạy `reset --hard` vs `clean` mất luôn sự tương phản.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `revert` VÀ RANH GIỚI VỚI LANE MERGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `git revert C` là một merge ba ngả với `base = C`, `ours = HEAD`,
 * `theirs = cha của C`. Tầng này quyết ĐƯỜNG ĐI (file nào lấy bên nào, file nào
 * phải trộn theo dòng, pending op đặt ra sao); phép trộn THEO DÒNG là của lane
 * merge/diff3 và được **tiêm vào** qua `MergeFileFn`. Tiêm chứ không import vì
 * hai lý do: lane kia chưa có lúc file này viết, và test ở đây cần một bản trộn
 * giả để cô lập đúng phần logic của mình.
 */

import type {
  ConflictFile,
  FilePath,
  GitError,
  Index,
  Lines,
  MergeHunk,
  ObjectStore,
  Oid,
  OutputLine,
  OutputTone,
  Repo,
  Worktree,
} from '../contract.ts';
import { sortedEntries, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import {
  commitContents,
  getCommit,
  getTree,
  makeBlob,
  makeTree,
  putObject,
  treeToRecord,
  writeCommit,
  writeContents,
} from '../objects.ts';
import {
  blobOid,
  headContents,
  headOid,
  headRef,
  isIndexClean,
  isWorktreeClean,
  moveHead,
  setIndex,
  setRef,
  setWorktree,
  shortRefName,
} from '../repo.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 0. KIỂU DÙNG CHUNG CHO CẢ LANE `ops/`
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thứ một thao tác cần biết ngoài bản thân repo.
 *
 * `logicalTime` do TẦNG TRÊN truyền xuống, không bao giờ do tầng này tự sinh —
 * `Date.now()` bị cấm tuyệt đối trong `packages/games/src/git/**` và có cổng
 * grep §17.J.2 gác, kèm đối chứng dương.
 */
export interface OpContext {
  readonly logicalTime: number;
  readonly author: string;
}

/**
 * Kết quả một thao tác ở tầng `Repo`.
 *
 * ⚠ Đây là bản sao THU NHỎ của `CommandResult` ở `contract.ts`, khác đúng một
 * chỗ: nó mang `Repo` chứ không mang `GitWorld`. Tầng này cố ý không biết gì về
 * `origin`, `bots`, hay `logicalTime` toàn cục — tầng điều phối lệnh nâng
 * `Repo → GitWorld`. Nếu lane khác cũng tự khai một kiểu y hệt thì lead nên gom
 * về `contract.ts`; xem báo cáo lane 17.F.
 *
 * Khi `error !== null` thì `repo` là trạng thái **CŨ, không đổi** — trừ đúng
 * một ngoại lệ có tên trong hợp đồng: `merge-conflict` trả repo ĐÃ đặt pending
 * op, vì xung đột không phải lỗi của người chơi mà là bài học.
 */
export interface GitOpResult {
  readonly repo: Repo;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
}

export function line(text: string, tone: OutputTone = 'plain'): OutputLine {
  return { text, tone };
}

export function ok(repo: Repo, output: readonly OutputLine[] = []): GitOpResult {
  return { repo, output, error: null };
}

/** Lỗi ⇒ trạng thái CŨ, không đổi. Đây là chỗ duy nhất bất biến đó được viết ra. */
export function fail(repo: Repo, error: GitError): GitOpResult {
  return { repo, output: [], error };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TIỆN ÍCH DÙNG LẠI TRONG CẢ LANE
// ═══════════════════════════════════════════════════════════════════════════

export function linesEqual(a: Lines, b: Lines): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** `path → oid` của tree một commit. Rỗng khi commit không tồn tại. */
export function indexFromCommit(repo: Repo, oid: Oid | null): Index {
  if (oid === null) return {};
  const commit = getCommit(repo.objects, oid);
  if (commit === null) return {};
  const tree = getTree(repo.objects, commit.tree);
  return tree === null ? {} : treeToRecord(tree);
}

/**
 * File trong worktree mà KHÔNG có ở index lẫn ở commit HEAD — tức "chưa track".
 *
 * Tách ra vì ba lệnh cần đúng khái niệm này: `reset --hard`, `revert`, và bước
 * checkout của `bisect`. Cả ba đều phải giữ lại file chưa track.
 */
export function untrackedWorktree(repo: Repo): Worktree {
  const head = headContents(repo);
  const out: Record<FilePath, Lines> = {};
  for (const [path, lines] of sortedEntries(repo.worktree)) {
    if (Object.hasOwn(repo.index, path)) continue;
    if (Object.hasOwn(head, path)) continue;
    out[path] = lines;
  }
  return out;
}

/**
 * Worktree sau khi "checkout" một commit: nội dung commit đó, cộng file chưa
 * track được giữ lại. Trùng đường dẫn thì commit thắng (file chưa track "chắn
 * đường" bị ghi đè, đúng như git thật).
 */
export function worktreeAt(repo: Repo, oid: Oid | null): Worktree {
  return { ...untrackedWorktree(repo), ...commitContents(repo.objects, oid) };
}

/**
 * Dời chỗ HEAD đang chỉ tới, dù HEAD bám ref hay đang detached.
 *
 * ⛔ Mọi lệnh trong lane này đi qua đây thay vì tự chọn `setRef`/`moveHead`. Cả
 * hai hàm đó ghi reflog, nhưng chúng ghi cho hai đối tượng khác nhau, và chọn
 * nhầm một lần là bài G26 thỉnh thoảng không giải được — tuỳ người chơi đang
 * detached hay không, tức một lỗi chỉ lộ ở một lượt chơi cụ thể.
 */
export function advanceHead(
  repo: Repo,
  oid: Oid,
  entry: { readonly op: string; readonly message: string; readonly logicalTime: number },
): Repo {
  const ref = headRef(repo);
  if (ref !== null) return setRef(repo, ref, oid, entry);
  return moveHead(repo, { type: 'detached', oid }, entry);
}

/** Nhãn phía "ours" trong một merge: tên nhánh, hoặc `HEAD` khi detached. */
export function oursLabelOf(repo: Repo): string {
  const ref = headRef(repo);
  return ref === null ? 'HEAD' : shortRefName(ref);
}

function describeCommit(repo: Repo, oid: Oid): string {
  const commit = getCommit(repo.objects, oid);
  return commit === null ? shortOid(oid) : `${shortOid(oid)} ${commit.message}`;
}

function notACommit(oid: Oid): GitError {
  return gitError(
    'not-a-commit',
    `\`${shortOid(oid)}\` không phải một commit.`,
    'Object mang Oid này không có trong kho, hoặc có nhưng là blob/tree chứ không phải commit.',
    'Gõ `git log --oneline` để xem những commit đang với tới được, hoặc `git reflog` nếu bạn đang tìm một commit vừa mất.',
  );
}

function unbornHead(what: string): GitError {
  return gitError(
    'bad-usage',
    `Chưa có commit nào nên không ${what} được.`,
    'HEAD đang trỏ vào một branch chưa sinh ra — branch chỉ ra đời khi có commit đầu tiên trỏ vào nó.',
    'Tạo commit đầu tiên trước: `git add .` rồi `git commit -m "commit đầu"`.',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. `git reset`
// ═══════════════════════════════════════════════════════════════════════════

export type ResetMode = 'soft' | 'mixed' | 'hard';

/**
 * `git reset [--soft|--mixed|--hard] <commit>`.
 *
 * `target` đã được phân giải sẵn thành `Oid` ở tầng trên (`refs-resolve.ts`) —
 * tầng này không biết `HEAD~2` nghĩa là gì và cố tình không biết.
 */
export function gitReset(
  repo: Repo,
  target: Oid,
  mode: ResetMode,
  ctx: OpContext,
): GitOpResult {
  if (getCommit(repo.objects, target) === null) return fail(repo, notACommit(target));

  // ⚠ Tính TRƯỚC khi đụng vào index: định nghĩa "chưa track" đọc cả index lẫn
  // HEAD, nên tính sau khi index đã đổi sẽ ra một tập khác.
  const keepUntracked = untrackedWorktree(repo);

  const from = headOid(repo);
  let next = advanceHead(repo, target, {
    op: 'reset',
    message: `dời về ${shortOid(target)} (--${mode})`,
    logicalTime: ctx.logicalTime,
  });

  if (mode !== 'soft') {
    next = setIndex(next, indexFromCommit(next, target));
  }
  if (mode === 'hard') {
    next = setWorktree(next, { ...keepUntracked, ...commitContents(next.objects, target) });
  }

  const output: OutputLine[] = [line(`HEAD giờ ở ${describeCommit(next, target)}`, 'success')];
  if (mode === 'soft') {
    output.push(
      line('Index và worktree giữ nguyên — thay đổi của commit cũ vẫn đang staged.', 'hint'),
    );
  } else if (mode === 'mixed') {
    output.push(line('Index đã đặt lại. Worktree giữ nguyên, không mất gì cả.', 'hint'));
  } else {
    output.push(
      line('Index và worktree đã đặt lại. Thay đổi chưa commit ở file đã track đã mất.', 'warn'),
    );
  }
  if (from !== null && from !== target) {
    output.push(
      line(`Chỗ cũ (${shortOid(from)}) vẫn nằm trong kho — \`git reflog\` tìm lại được.`, 'hint'),
    );
  }
  return ok(next, output);
}

/**
 * `git reset [<commit>] -- <đường-dẫn>…` — dạng theo ĐƯỜNG DẪN.
 *
 * Khác hẳn ba kiểu ở trên dù cùng một động từ, và đó chính là chỗ khó: dạng này
 * **không dời ref, không đụng worktree**, chỉ kéo vài ô của index về theo commit
 * đích. Nó là `git reset HEAD <file>` mà ai cũng đã từng copy-paste mà không
 * biết mình vừa làm gì — tức đúng một bài học.
 *
 * Không ghi reflog: không ref nào dịch chuyển thì không có gì để ghi.
 */
export function gitResetPaths(
  repo: Repo,
  target: Oid,
  paths: readonly FilePath[],
): GitOpResult {
  if (getCommit(repo.objects, target) === null) return fail(repo, notACommit(target));
  const tree = indexFromCommit(repo, target);

  for (const path of paths) {
    if (Object.hasOwn(tree, path)) continue;
    if (Object.hasOwn(repo.index, path)) continue;
    return fail(
      repo,
      gitError(
        'path-not-found',
        `\`${path}\` không có ở commit đích lẫn ở index.`,
        '`git reset -- <đường-dẫn>` kéo một ô của index về theo commit đích. Đường dẫn này không có ở bên nào cả nên không có gì để kéo.',
        'Xem `git status` để biết đường dẫn nào đang được theo dõi.',
      ),
    );
  }

  const index: Record<FilePath, Oid> = {};
  for (const [path, oid] of sortedEntries(repo.index)) index[path] = oid;
  const touched: FilePath[] = [];
  for (const path of [...paths].sort()) {
    const wanted = tree[path];
    if (wanted === undefined) {
      if (Object.hasOwn(index, path)) {
        delete index[path];
        touched.push(path);
      }
      continue;
    }
    if (index[path] !== wanted) touched.push(path);
    index[path] = wanted;
  }

  const output: OutputLine[] =
    touched.length === 0
      ? [line('Không có gì phải bỏ staged — index đã khớp commit đích.', 'hint')]
      : [
          line('Đã bỏ staged, worktree KHÔNG đụng tới:', 'success'),
          ...touched.map((path) => line(`  ${path}`)),
        ];
  return ok(setIndex(repo, index), output);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. `git revert`
// ═══════════════════════════════════════════════════════════════════════════

/** Một file cần trộn theo DÒNG. Lane merge/diff3 hiện thực phép trộn thật. */
export interface MergeFileInput {
  readonly path: FilePath;
  readonly base: Lines;
  readonly ours: Lines;
  readonly theirs: Lines;
  readonly oursLabel: string;
  readonly theirsLabel: string;
}

export interface MergeFileOutput {
  /**
   * Nội dung ghi vào worktree. Xung đột thì ĐÃ chèn marker.
   *
   * ⚠ Khác `Diff3Result.merged` của `diff3.ts` ở đúng ca xung đột: bên đó
   * `merged` chỉ có nghĩa khi KHÔNG xung đột (ca xung đột nó trả `ours` làm hệ
   * quy chiếu cho `MergeHunk.start`, không phải một lời giải). Bộ điều phối lệnh
   * nối hai bên bằng đúng bốn dòng:
   *
   * ```ts
   * const mergeFile: MergeFileFn = ({ base, ours, theirs, oursLabel, theirsLabel }) => {
   *   const r = merge3(base, ours, theirs);
   *   const merged = r.conflicted ? renderConflict(r.hunks, oursLabel, theirsLabel) : r.merged;
   *   return { merged, hunks: r.hunks, conflicted: r.conflicted };
   * };
   * ```
   */
  readonly merged: Lines;
  readonly hunks: readonly MergeHunk[];
  readonly conflicted: boolean;
}

/**
 * Phép trộn ba ngả theo dòng, **tiêm từ ngoài vào**.
 *
 * ⚠ Đây là hình dạng lane 17.F CẦN, không phải hợp đồng chính thức. Lane
 * merge/diff3 sở hữu hàm thật; nếu chữ ký của nó khác thì lead gom một chỗ và
 * file này đổi theo. Để nó bắt buộc (không phải tuỳ chọn) là chủ ý: một bản
 * mặc định "không trộn được thì coi như xung đột" sẽ biến một thiếu sót nối dây
 * thành một hành vi sản phẩm im lặng.
 */
export type MergeFileFn = (input: MergeFileInput) => MergeFileOutput;

/** Kết quả quyết định-theo-file của một phép trộn ba ngả. */
export interface ThreeWayPlan {
  readonly contents: Record<FilePath, Lines>;
  readonly conflicts: readonly ConflictFile[];
}

/**
 * `git revert <commit>` — **thêm một commit đảo ngược**, không dời con trỏ về
 * quá khứ.
 *
 * Đây là nửa kia của bài G10: `reset` viết lại lịch sử (chỗ cũ thành mồ côi),
 * `revert` giữ nguyên lịch sử và nối thêm. Trên một nhánh đã đẩy lên chung thì
 * chỉ `revert` là an toàn — và người học chỉ thấy được điều đó khi hai lệnh nằm
 * cạnh nhau, cùng đạt một mục tiêu, với hai hình dạng cây khác hẳn.
 */
export function gitRevert(
  repo: Repo,
  target: Oid,
  mergeFile: MergeFileFn,
  ctx: OpContext,
): GitOpResult {
  if (repo.pending !== null) return fail(repo, operationInProgress(repo));

  const commit = getCommit(repo.objects, target);
  if (commit === null) return fail(repo, notACommit(target));
  if (commit.parents.length > 1) {
    return fail(
      repo,
      gitError(
        'bad-usage',
        `\`${shortOid(target)}\` là một commit merge nên không đảo thẳng được.`,
        'Commit merge có hai cha, nên "đảo ngược nó" là câu hỏi thiếu vế: đảo so với nhánh nào? Git thật đòi `-m 1` hoặc `-m 2` để chọn cha làm mốc.',
        'Game chưa dạy `revert -m`. Chọn một commit thường trên một trong hai nhánh để đảo.',
      ),
    );
  }

  const head = headOid(repo);
  if (head === null) return fail(repo, unbornHead('revert'));
  if (!isIndexClean(repo) || !isWorktreeClean(repo)) return fail(repo, dirtyTree(repo, 'revert'));

  const plan = planRevert(repo, target, commit.parents[0] ?? null, mergeFile);

  if (plan.conflicts.length > 0) {
    // Ngoại lệ CÓ TÊN của hợp đồng: `merge-conflict` trả repo ĐÃ đổi.
    const [store, index] = stageNonConflicted(repo, plan);
    const staged = setIndex({ ...repo, objects: store }, index);
    const withTree = setWorktree(staged, { ...untrackedWorktree(repo), ...plan.contents });
    const pending: Repo = {
      ...withTree,
      pending: { kind: 'revert', target, originalHead: head, conflicts: plan.conflicts },
    };
    return {
      repo: pending,
      output: [
        line(`Đảo ngược ${describeCommit(repo, target)} gây xung đột.`, 'error'),
        ...plan.conflicts.map((c) => line(`  xung đột: ${c.path}`, 'error')),
        line('Sửa file, `git add` từng file đã sửa, rồi `git revert --continue`.', 'hint'),
        line('Đổi ý thì `git revert --abort` đưa mọi thứ về đúng lúc trước khi gõ lệnh.', 'hint'),
      ],
      error: gitError(
        'merge-conflict',
        `Đảo ngược \`${shortOid(target)}\` chạm vào dòng mà HEAD cũng đã sửa.`,
        `${plan.conflicts.length} file có phần chồng nhau nên git không tự quyết được giữ bên nào. Repo đang ở giữa một thao tác revert dở dang.`,
        '`git status` liệt kê file đang xung đột. Sửa xong thì `git add <file>` rồi `git revert --continue`.',
      ),
    };
  }

  return commitRevert(repo, plan.contents, target, head, ctx, 'revert');
}

/** `git revert --continue` sau khi người chơi đã sửa và `git add`. */
export function gitRevertContinue(repo: Repo, ctx: OpContext): GitOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('revert'));
  if (pending.kind !== 'revert') return fail(repo, wrongPendingKind(pending.kind, 'revert'));

  const unresolved = pending.conflicts
    .map((c) => c.path)
    .filter((path) => !isResolved(repo, path));
  if (unresolved.length > 0) {
    return fail(
      repo,
      gitError(
        'unmerged-paths',
        `Còn ${unresolved.length} file chưa được đánh dấu là đã giải quyết.`,
        `Git biết một file đã xong khi nội dung của nó được \`git add\` vào index. Chưa add: ${unresolved.map((p) => `\`${p}\``).join(', ')}.`,
        `Sửa xong thì \`git add ${unresolved[0] ?? '<file>'}\`, rồi \`git revert --continue\`.`,
      ),
    );
  }

  const head = headOid(repo);
  if (head === null) return fail(repo, unbornHead('revert --continue'));

  // Commit lấy nội dung từ INDEX, không từ worktree — đúng như git thật, và đó
  // là lý do bước `git add` ở trên không phải thủ tục thừa.
  const [store, tree] = putObject(repo.objects, makeTree(repo.index));
  const [store2, oid] = writeCommit(store, {
    tree,
    parents: [head],
    message: revertMessage(repo, pending.target),
    author: ctx.author,
    logicalTime: ctx.logicalTime,
  });

  const withStore: Repo = { ...repo, objects: store2, pending: null };
  const moved = advanceHead(withStore, oid, {
    op: 'revert',
    message: `đảo ngược ${shortOid(pending.target)}`,
    logicalTime: ctx.logicalTime,
  });
  return ok(moved, [
    line(`Đã tạo commit đảo ngược ${describeCommit(moved, oid)}`, 'success'),
    line('Lịch sử KHÔNG bị viết lại — commit cũ vẫn nằm nguyên chỗ của nó.', 'hint'),
  ]);
}

/**
 * `git revert --abort` — về đúng lúc trước khi gõ lệnh.
 *
 * Ref chưa hề dịch chuyển (commit đảo ngược chỉ ra đời ở `--continue`), nên ở
 * đây chỉ phải trả index và worktree về theo `originalHead`. Cố ý KHÔNG gọi
 * `advanceHead`: ghi một mục reflog cho một ref không dịch chuyển là bịa ra lịch
 * sử, và `git reflog` sẽ hiện một dòng ứng với việc không xảy ra.
 */
export function gitRevertAbort(repo: Repo): GitOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('revert'));
  if (pending.kind !== 'revert') return fail(repo, wrongPendingKind(pending.kind, 'revert'));

  const back = pending.originalHead;
  const restored: Repo = {
    ...setWorktree(setIndex(repo, indexFromCommit(repo, back)), worktreeAt(repo, back)),
    pending: null,
  };
  return ok(restored, [
    line(`Đã huỷ revert. Quay về ${describeCommit(restored, back)}`, 'success'),
  ]);
}

// ── Nội bộ của revert ───────────────────────────────────────────────────────

/**
 * Quyết định cho TỪNG file: lấy bên nào, hay phải trộn theo dòng.
 *
 * Ba luật, theo đúng thứ tự:
 *
 *  1. `base == theirs` ⇒ phía kia không đụng file này ⇒ giữ `ours`.
 *  2. `base == ours`   ⇒ phía ta chưa đụng file này ⇒ lấy thẳng `theirs`
 *                        (kể cả khi `theirs` là "file không tồn tại", tức xoá).
 *  3. còn lại          ⇒ hai bên cùng sửa ⇒ trộn theo dòng.
 *
 * Luật 1 và 2 là phép trộn TẦM THƯỜNG ở mức FILE; chỉ luật 3 mới cần diff3. Tách
 * hai tầng ra là chủ ý: phần lớn file trong một merge đời thực rơi vào luật 1
 * hoặc 2, và gọi diff3 cho chúng chỉ tốn công mà kết quả không đổi.
 *
 * Dùng chung cho `revert` (base = commit bị đảo, theirs = cha của nó) và cho
 * `stash apply` (base = commit lúc cất, theirs = ảnh chụp đã cất). Hai lệnh đó
 * khác nhau ở chỗ CHỌN ba ngả, không khác ở luật hợp nhất.
 */
export function planThreeWay(input: {
  readonly base: Readonly<Record<FilePath, Lines>>;
  readonly ours: Readonly<Record<FilePath, Lines>>;
  readonly theirs: Readonly<Record<FilePath, Lines>>;
  readonly oursLabel: string;
  readonly theirsLabel: string;
  readonly mergeFile: MergeFileFn;
}): ThreeWayPlan {
  const { base, ours, theirs, oursLabel, theirsLabel, mergeFile } = input;

  const paths: Record<FilePath, true> = {};
  for (const p of sortedKeys(base)) paths[p] = true;
  for (const p of sortedKeys(theirs)) paths[p] = true;
  for (const p of sortedKeys(ours)) paths[p] = true;

  const contents: Record<FilePath, Lines> = {};
  const conflicts: ConflictFile[] = [];

  for (const path of sortedKeys(paths)) {
    const inBase = Object.hasOwn(base, path);
    const inTheirs = Object.hasOwn(theirs, path);
    const inOurs = Object.hasOwn(ours, path);
    const b = base[path] ?? [];
    const t = theirs[path] ?? [];
    const o = ours[path] ?? [];

    if (inBase === inTheirs && linesEqual(b, t)) {
      if (inOurs) contents[path] = o;
      continue;
    }
    if (inBase === inOurs && linesEqual(b, o)) {
      if (inTheirs) contents[path] = t;
      continue;
    }
    const merged = mergeFile({ path, base: b, ours: o, theirs: t, oursLabel, theirsLabel });
    contents[path] = merged.merged;
    if (merged.conflicted) {
      conflicts.push({ path, hunks: merged.hunks, oursLabel, theirsLabel });
    }
  }
  return { contents, conflicts };
}

/**
 * Ba ngả của `git revert C`: `base = C`, `ours = HEAD`, `theirs = cha của C`.
 *
 * Chọn ba ngả như vậy mới là phần riêng của revert — phép hợp nhất thì dùng
 * chung `planThreeWay`.
 */
function planRevert(
  repo: Repo,
  target: Oid,
  parent: Oid | null,
  mergeFile: MergeFileFn,
): ThreeWayPlan {
  return planThreeWay({
    base: commitContents(repo.objects, target),
    ours: headContents(repo),
    theirs: commitContents(repo.objects, parent),
    oursLabel: oursLabelOf(repo),
    theirsLabel: `cha của ${shortOid(target)}`,
    mergeFile,
  });
}

/**
 * Index trong lúc một phép trộn đang xung đột: file đã giải quyết được staged
 * sẵn, file còn xung đột GIỮ NGUYÊN ô index cũ.
 *
 * Giữ nguyên ô cũ là cách mô hình này thay cho "unmerged stage" của git thật:
 * worktree lúc này chứa marker nên `blobOid(worktree) !== index[path]`, và phép
 * kiểm của `--continue` tự động đỏ cho tới khi người chơi `git add`. Không cần
 * thêm một trường trạng thái nào vào hợp đồng.
 */
export function stageNonConflicted(
  repo: Repo,
  plan: ThreeWayPlan,
): readonly [ObjectStore, Index] {
  const conflicted = new Set(plan.conflicts.map((c) => c.path));
  let store = repo.objects;
  const index: Record<FilePath, Oid> = {};
  for (const [path, oid] of sortedEntries(repo.index)) {
    if (conflicted.has(path)) index[path] = oid;
  }
  for (const [path, lines] of sortedEntries(plan.contents)) {
    if (conflicted.has(path)) continue;
    // ⚠ Phải trả `store` ra ngoài. Băm một blob rồi vứt kho mới đi sẽ để index
    // trỏ vào một Oid không có trong kho — và triệu chứng là file biến mất khi
    // `--continue` dựng tree từ index, rất lâu sau, không lỗi nào báo.
    const [next, oid] = putObject(store, makeBlob(lines));
    store = next;
    index[path] = oid;
  }
  return [store, index];
}

/**
 * Một đường dẫn đã được người chơi đánh dấu xong chưa.
 *
 * "Xong" = nội dung worktree hiện tại đã nằm trong index (tức đã `git add`),
 * hoặc file đã bị xoá khỏi cả hai vùng. `blobOid` băm mà KHÔNG ghi vào kho —
 * một phép kiểm chỉ đọc không được làm kho phình ra.
 */
export function isResolved(repo: Repo, path: FilePath): boolean {
  const inIndex = Object.hasOwn(repo.index, path);
  const inWork = Object.hasOwn(repo.worktree, path);
  if (!inIndex && !inWork) return true;
  if (!inIndex || !inWork) return false;
  return repo.index[path] === blobOid(repo.worktree[path] ?? []);
}

function revertMessage(repo: Repo, target: Oid): string {
  // Giữ đúng chữ git thật sinh ra (`Revert "…"`) chứ không dịch: người chơi sẽ
  // gặp lại đúng dòng này trong một repo thật, và dịch nó đi là dạy sai một thứ
  // họ phải nhận ra.
  const commit = getCommit(repo.objects, target);
  return `Revert "${commit?.message ?? shortOid(target)}"`;
}

function commitRevert(
  repo: Repo,
  contents: Readonly<Record<FilePath, Lines>>,
  target: Oid,
  head: Oid,
  ctx: OpContext,
  op: string,
): GitOpResult {
  const [store, tree] = writeContents(repo.objects, contents);
  const headCommit = getCommit(repo.objects, head);
  if (headCommit !== null && headCommit.tree === tree) {
    return fail(
      repo,
      gitError(
        'nothing-to-commit',
        `Đảo ngược \`${shortOid(target)}\` không thay đổi gì cả.`,
        'Nội dung của commit đó đã bị hoàn tác từ trước rồi, nên bản đảo ngược sẽ ra đúng cây hiện tại — một commit rỗng.',
        'Xem `git log --oneline` để tìm commit thật sự cần đảo.',
      ),
    );
  }

  const [store2, oid] = writeCommit(store, {
    tree,
    parents: [head],
    message: revertMessage(repo, target),
    author: ctx.author,
    logicalTime: ctx.logicalTime,
  });

  const withStore: Repo = { ...repo, objects: store2 };
  const moved = advanceHead(withStore, oid, {
    op,
    message: `đảo ngược ${shortOid(target)}`,
    logicalTime: ctx.logicalTime,
  });
  const staged = setIndex(moved, indexFromCommit(moved, oid));
  const written = setWorktree(staged, { ...untrackedWorktree(repo), ...contents });
  return ok(written, [
    line(`Đã tạo commit đảo ngược ${describeCommit(written, oid)}`, 'success'),
    line(`Commit gốc ${shortOid(target)} vẫn nằm nguyên trong lịch sử.`, 'hint'),
  ]);
}

// ── Lỗi dùng chung cho pending op ───────────────────────────────────────────

export function operationInProgress(repo: Repo): GitError {
  const kind = repo.pending?.kind ?? 'merge';
  return gitError(
    'operation-in-progress',
    `Đang có một \`${kind}\` dở dang.`,
    'Git chỉ giữ được một thao tác nhiều bước tại một thời điểm. Bắt đầu cái thứ hai khi cái thứ nhất chưa xong sẽ làm mất mốc quay về của cái đang chạy.',
    `Chạy tiếp bằng \`git ${kind} --continue\`, hoặc bỏ bằng \`git ${kind} --abort\`.`,
  );
}

export function noOperation(kind: string): GitError {
  return gitError(
    'no-operation-in-progress',
    `Không có \`${kind}\` nào đang dở dang.`,
    `\`--continue\` và \`--abort\` chỉ có nghĩa khi repo đang kẹt giữa chừng một thao tác. Repo hiện tại sạch.`,
    '`git status` cho biết repo có đang ở giữa thao tác nào không.',
  );
}

export function wrongPendingKind(actual: string, wanted: string): GitError {
  return gitError(
    'operation-in-progress',
    `Đang dở dang một \`${actual}\`, không phải \`${wanted}\`.`,
    `Mỗi thao tác nhiều bước có mốc quay về riêng, nên \`git ${wanted} --continue\` không đọc được trạng thái của một \`${actual}\`.`,
    `Dùng \`git ${actual} --continue\` hoặc \`git ${actual} --abort\`.`,
  );
}

export function dirtyTree(repo: Repo, what: string): GitError {
  return gitError(
    'bad-usage',
    `Có thay đổi chưa commit nên không ${what} được.`,
    `\`${what}\` ghi đè index và worktree theo một commit khác, nên thay đổi đang dở sẽ biến mất mà không reflog nào tìm lại được — reflog chỉ nhớ commit, không nhớ worktree.`,
    'Cất tạm bằng `git stash`, hoặc commit lại, rồi gõ lại lệnh.',
  );
}
