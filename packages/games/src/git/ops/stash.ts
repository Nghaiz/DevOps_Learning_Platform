/**
 * `git stash` — push / pop / apply / list / drop.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STASH SINH RA VÌ WORKTREE DÙNG CHUNG (misfit MIT, bài G22)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trong git, mọi branch dùng CHUNG một worktree. Đổi branch khi đang sửa dở thì
 * hoặc mang thay đổi theo sang branch mới (thường là không muốn), hoặc bị chặn.
 * `stash` là câu trả lời của git cho chỗ hụt đó — và nó chỉ hiểu được khi người
 * học đã thấy ba vùng tách nhau. Đó là lý do level G22 nằm SAU G09 (`reset`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STASH **LÀ MỘT COMMIT** — và đó không phải chi tiết hiện thực
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi mục stash ở đây là commit thật trong `ObjectStore`, đúng như git thật.
 * Hệ quả trực tiếp là **bài G30**: một mục stash bị `drop` nhầm vẫn nằm trong
 * kho, không ref nào trỏ tới, nên `git fsck --lost-found` tìm lại được nó. Nếu
 * mục stash chỉ là một bản sao worktree rời trong bộ nhớ thì bài đó không tồn
 * tại, và cả chương 3 hụt một level.
 *
 * Hình dạng, mượn thẳng của git thật:
 *
 *     stash commit
 *       ├─ tree      = ảnh chụp WORKTREE lúc cất
 *       ├─ parents[0]= commit HEAD lúc cất
 *       └─ parents[1]= "index commit" — tree của nó là ảnh chụp INDEX lúc cất
 *
 * ⚠ `parents[1]` LUÔN là index commit. `pop`/`apply` đọc đúng vị trí đó, nên
 * đổi thứ tự hai cha là làm index phục hồi sai mà không lỗi nào báo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CỐ TÌNH BỎ — đọc trước khi tưởng là thiếu sót
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  - **`pop`/`apply` không trộn ba ngả.** Git thật áp stash như một merge và có
 *    thể xung đột. Ở đây stash được PHỦ lên worktree hiện tại (đường dẫn trùng
 *    thì bên stash thắng, đường dẫn chỉ có ở hiện tại thì giữ nguyên). Level
 *    chương 2–3 dùng stash để dọn worktree trước khi đổi branch, không dùng nó
 *    làm bài xung đột — bài xung đột là `merge`/`rebase`, nơi nó dạy được nhiều
 *    hơn.
 *  - **`-u` / `--include-untracked`.** Stash ở đây chỉ cất file ĐÃ TRACK, đúng
 *    như `git stash` trần. File chưa track nằm nguyên tại chỗ.
 *  - **Xoá file.** Một file đã track nhưng bị xoá khỏi worktree lúc cất sẽ quay
 *    lại sau `pop`. Mô hình tree không có khái niệm "mục đã xoá", và dựng một
 *    khái niệm như vậy chỉ để phục vụ một ca không level nào dùng là đúng thứ
 *    YAGNI cấm.
 */

import type {
  FilePath,
  GitError,
  Lines,
  Oid,
  OutputLine,
  Repo,
  StashEntry,
} from '../contract.ts';
import { sortedEntries, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import {
  commitContents,
  getCommit,
  makeTree,
  putObject,
  writeCommit,
  writeContents,
} from '../objects.ts';
import {
  headContents,
  headOid,
  headRef,
  setIndex,
  setWorktree,
  shortRefName,
  statusEntries,
} from '../repo.ts';
import {
  fail,
  indexFromCommit,
  line,
  ok,
  type GitOpResult,
  type OpContext,
} from './reset.ts';

/**
 * `stash@{2}` · `2` · không nêu gì (⇒ `0`). `null` = không đọc được.
 *
 * Sống ở đây chứ không ở `refs-resolve.ts` vì `stash@{n}` KHÔNG phải một
 * revision: nó không phân giải ra Oid theo bất kỳ ref nào, nó là chỉ số trong
 * một mảng. Trộn nó vào bộ phân giải ref sẽ làm `stash@{0}` hợp lệ ở chỗ chỉ
 * nhận commit, và thông báo lỗi ở đó sẽ vô nghĩa.
 */
export function parseStashIndex(token: string | null): number | null {
  if (token === null || token === '') return 0;
  const braced = /^stash@\{(\d+)\}$/.exec(token);
  if (braced !== null) return Number.parseInt(braced[1] ?? '0', 10);
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10);
  return null;
}

/** Nhãn nhánh hiện tại, dạng người chơi đọc. */
function branchLabel(repo: Repo, head: Oid): string {
  const ref = headRef(repo);
  return ref === null ? `(detached ${shortOid(head)})` : shortRefName(ref);
}

function emptyStash(): GitError {
  return gitError(
    'stash-empty',
    'Stash đang trống.',
    'Không có mục nào được cất, nên không có gì để lấy ra hay bỏ đi.',
    'Cất thay đổi đang dở bằng `git stash push`, rồi `git stash list` để xem.',
  );
}

function badStashIndex(repo: Repo, wanted: string): GitError {
  return gitError(
    'bad-usage',
    `Không có mục stash nào tên \`${wanted}\`.`,
    `Stash đang có ${repo.stash.length} mục, đánh số từ \`stash@{0}\` (mới nhất) tới \`stash@{${repo.stash.length - 1}}\` (cũ nhất).`,
    '`git stash list` liệt kê đúng những mục đang có.',
  );
}

/** Đường dẫn ĐÃ TRACK: có ở commit HEAD hoặc có ở index. */
function trackedPaths(repo: Repo): readonly FilePath[] {
  const seen: Record<FilePath, true> = {};
  for (const path of sortedKeys(headContents(repo))) seen[path] = true;
  for (const path of sortedKeys(repo.index)) seen[path] = true;
  return sortedKeys(seen);
}

/** Có gì để cất không — file chưa track KHÔNG tính, đúng như `git stash` trần. */
function hasTrackedChanges(repo: Repo): boolean {
  return statusEntries(repo).some(
    (entry) =>
      entry.staged !== 'unchanged' ||
      entry.unstaged === 'modified' ||
      entry.unstaged === 'deleted',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// push
// ═══════════════════════════════════════════════════════════════════════════

export function gitStashPush(
  repo: Repo,
  message: string | null,
  ctx: OpContext,
): GitOpResult {
  const head = headOid(repo);
  if (head === null) {
    return fail(
      repo,
      gitError(
        'bad-usage',
        'Chưa có commit nào nên chưa stash được.',
        'Stash cất thay đổi SO VỚI một commit. Branch chưa sinh ra thì không có mốc nào để so.',
        'Tạo commit đầu tiên trước: `git add .` rồi `git commit -m "commit đầu"`.',
      ),
    );
  }

  // Không có gì để cất KHÔNG phải lỗi — git thật cũng chỉ in một dòng rồi thoát
  // bình thường. Dựng một mã lỗi cho nó sẽ làm `git stash` trong một script
  // (hay trong một lời giải mẫu của level) đỏ vì repo đang sạch.
  if (!hasTrackedChanges(repo)) {
    return ok(repo, [
      line('Không có thay đổi nào để cất — worktree đang khớp HEAD.', 'hint'),
    ]);
  }

  const branch = branchLabel(repo, head);
  const headCommit = getCommit(repo.objects, head);
  const label =
    message ?? `WIP on ${branch}: ${shortOid(head)} ${headCommit?.message ?? ''}`.trimEnd();

  const tracked = trackedPaths(repo);
  const snapshot: Record<FilePath, Lines> = {};
  for (const path of tracked) {
    const lines = repo.worktree[path];
    if (lines !== undefined) snapshot[path] = lines;
  }

  const [store1, worktreeTree] = writeContents(repo.objects, snapshot);
  const [store2, indexTree] = putObject(store1, makeTree(repo.index));
  const [store3, indexCommit] = writeCommit(store2, {
    tree: indexTree,
    parents: [head],
    message: `index on ${branch}`,
    author: ctx.author,
    logicalTime: ctx.logicalTime,
  });
  const [store4, stashOid] = writeCommit(store3, {
    tree: worktreeTree,
    // ⚠ Thứ tự hai cha là hợp đồng nội bộ của file này. Xem chú thích đầu file.
    parents: [head, indexCommit],
    message: label,
    author: ctx.author,
    logicalTime: ctx.logicalTime,
  });

  // Worktree sau khi cất: bỏ mọi đường dẫn đã track, rồi đặt lại theo HEAD. File
  // chưa track không nằm trong `tracked` nên sống sót nguyên vẹn.
  const trackedSet = new Set(tracked);
  const cleaned: Record<FilePath, Lines> = {};
  for (const [path, lines] of sortedEntries(repo.worktree)) {
    if (trackedSet.has(path)) continue;
    cleaned[path] = lines;
  }
  const restored: Record<FilePath, Lines> = { ...cleaned, ...headContents(repo) };

  const entry: StashEntry = {
    oid: stashOid,
    message: label,
    branch,
    logicalTime: ctx.logicalTime,
  };

  const withStore: Repo = { ...repo, objects: store4, stash: [entry, ...repo.stash] };
  const next = setWorktree(setIndex(withStore, indexFromCommit(withStore, head)), restored);

  return ok(next, [
    line(`Đã cất: ${label}`, 'success'),
    line(`Worktree và index đã về đúng ${shortOid(head)}. Mục vừa cất là \`stash@{0}\`.`, 'hint'),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// pop / apply
// ═══════════════════════════════════════════════════════════════════════════

/** `git stash apply` — áp lại và **GIỮ** mục trong stash. */
export function gitStashApply(repo: Repo, at: number): GitOpResult {
  return applyEntry(repo, at, false);
}

/** `git stash pop` — áp lại rồi **BỎ** mục khỏi stash. */
export function gitStashPop(repo: Repo, at: number): GitOpResult {
  return applyEntry(repo, at, true);
}

function applyEntry(repo: Repo, at: number, drop: boolean): GitOpResult {
  if (repo.stash.length === 0) return fail(repo, emptyStash());
  const entry = repo.stash[at];
  if (entry === undefined) return fail(repo, badStashIndex(repo, `stash@{${at}}`));

  const stashCommit = getCommit(repo.objects, entry.oid);
  if (stashCommit === null) {
    return fail(
      repo,
      gitError(
        'not-a-commit',
        `Mục \`stash@{${at}}\` trỏ vào một object không phải commit.`,
        'Mỗi mục stash phải là một commit trong kho. Trạng thái này chỉ xảy ra nếu repo bị dựng sai từ đầu.',
        'Bỏ mục hỏng bằng `git stash drop`.',
      ),
    );
  }

  const stashedWorktree = commitContents(repo.objects, entry.oid);
  const indexCommit = stashCommit.parents[1] ?? null;
  const stashedIndex = indexFromCommit(repo, indexCommit);

  const worktree: Record<FilePath, Lines> = { ...repo.worktree, ...stashedWorktree };
  const index: Record<FilePath, Oid> = { ...repo.index, ...stashedIndex };

  const applied = setWorktree(setIndex(repo, index), worktree);
  const next: Repo = drop
    ? { ...applied, stash: repo.stash.filter((_, i) => i !== at) }
    : applied;

  const output: OutputLine[] = [line(`Đã áp lại: ${entry.message}`, 'success')];
  output.push(
    drop
      ? line(`\`stash@{${at}}\` đã bị bỏ khỏi stash.`, 'hint')
      : line(`\`stash@{${at}}\` vẫn còn trong stash — \`apply\` không bỏ mục đi.`, 'hint'),
  );
  if (drop) {
    output.push(
      line(
        `Commit ${shortOid(entry.oid)} của mục này vẫn nằm trong kho: \`git fsck --lost-found\` tìm lại được.`,
        'hint',
      ),
    );
  }
  return ok(next, output);
}

// ═══════════════════════════════════════════════════════════════════════════
// list / drop
// ═══════════════════════════════════════════════════════════════════════════

export function gitStashList(repo: Repo): GitOpResult {
  if (repo.stash.length === 0) {
    return ok(repo, [line('Stash đang trống.', 'hint')]);
  }
  return ok(
    repo,
    repo.stash.map((entry, i) => line(`stash@{${i}}: On ${entry.branch}: ${entry.message}`)),
  );
}

export function gitStashDrop(repo: Repo, at: number): GitOpResult {
  if (repo.stash.length === 0) return fail(repo, emptyStash());
  const entry = repo.stash[at];
  if (entry === undefined) return fail(repo, badStashIndex(repo, `stash@{${at}}`));

  const next: Repo = { ...repo, stash: repo.stash.filter((_, i) => i !== at) };
  return ok(next, [
    line(`Đã bỏ stash@{${at}}: ${entry.message}`, 'success'),
    line(
      `Commit ${shortOid(entry.oid)} KHÔNG bị xoá khỏi kho — không ref nào trỏ tới nó nữa thôi.`,
      'hint',
    ),
    line('`git fsck --lost-found` liệt kê nó, và `git branch <tên> <oid>` neo nó lại.', 'hint'),
  ]);
}
