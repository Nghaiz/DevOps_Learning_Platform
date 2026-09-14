/**
 * `git stash` — push / pop / apply / list / drop, kèm `pop --continue` / `--abort`.
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
 *       ├─ parents[0]= commit HEAD lúc cất  ← đây là `base` của phép trộn khi áp
 *       └─ parents[1]= "index commit" — tree của nó là ảnh chụp INDEX lúc cất
 *
 * ⚠ Thứ tự hai cha là hợp đồng nội bộ của file này: `parents[0]` là mốc so sánh,
 * `parents[1]` là ảnh chụp index. Đổi chỗ chúng thì index phục hồi sai và phép
 * trộn lấy sai base — cả hai đều hỏng trong im lặng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ÁP STASH LÀ MỘT PHÉP TRỘN BA NGẢ THẬT, VÀ NÓ XUNG ĐỘT ĐƯỢC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `base` = commit lúc cất · `ours` = worktree HIỆN TẠI · `theirs` = ảnh chụp đã
 * cất. Bản đầu của file này chỉ PHỦ stash lên worktree, và đó là sai: hai thay
 * đổi chồng nhau sẽ mất một cái mà không ai báo gì.
 *
 * Xung đột đặt `PendingOp` nhánh `'stash'` (thêm vào hợp đồng 2026-09-14). Hợp
 * đồng đã cân nhắc và LOẠI hai đường khác: cấm áp khi worktree bẩn thì xoá mất
 * đúng tình huống G22 dạy (cất việc rồi lấy lại khi ngữ cảnh đã đổi), còn mượn
 * nhánh `merge` thì `git merge --abort` trở thành lệnh gỡ một stash và người học
 * mang nhầm lẫn đó ra git thật.
 *
 * ⚠ **Xung đột thì mục stash KHÔNG bị bỏ, kể cả với `pop`** — và nó cũng không
 * bị bỏ sau `--continue`. Đúng như git thật: "If the stash application causes
 * conflicts, the stash entry is not removed." Người chơi tự `git stash drop` khi
 * đã hài lòng. Nhờ vậy nhánh `'stash'` không cần nhớ mình là `pop` hay `apply` —
 * một trường hợp hiếm khi hành vi đúng của git cũng là hành vi ít trạng thái nhất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CỐ TÌNH BỎ / LỆCH KHỎI GIT THẬT — đọc trước khi tưởng là thiếu sót
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  - **`--index` không có, và `pop` LUÔN phục hồi index.** Git thật chỉ phục hồi
 *    index khi có `--index`. Lệch cố ý: ô nghiệm thu của lane đòi `push` rồi
 *    `pop` trả worktree **và index** về đúng như trước, và một phép phục hồi
 *    nửa vời là thứ khó dạy hơn hẳn cả hai đầu mút.
 *  - **`-u` / `--include-untracked`.** Chỉ cất file ĐÃ TRACK, đúng như `git
 *    stash` trần. File chưa track nằm nguyên tại chỗ ở mọi lệnh trong file này.
 *  - **Xoá file.** Một file đã track nhưng bị xoá khỏi worktree lúc cất sẽ quay
 *    lại sau `pop`. Mô hình tree không có khái niệm "mục đã xoá", và dựng một
 *    khái niệm như vậy chỉ để phục vụ một ca không level nào dùng là đúng thứ
 *    YAGNI cấm.
 *  - **`git stash pop --abort` không có trong git thật.** Game tự thêm, và
 *    `command-table.ts` đã hứa với người chơi rằng nó "trả worktree về đúng
 *    trạng thái trước khi áp" — xem `gitStashApplyAbort` để biết vì sao lời hứa
 *    đó phải đúng từng chữ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÃ SỬA 2026-09-14 — `--abort` TỪNG làm mất việc chưa commit
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tới 2026-09-14, `pop --abort` đưa index và worktree về theo `originalHead`,
 * tức vứt luôn thay đổi cục bộ đang dở của người chơi. Đó không phải một lựa
 * chọn thiết kế mà là *giới hạn của dữ liệu*: nhánh `'stash'` khi ấy chỉ mang
 * một `Oid`, và một `Oid` không dựng lại nổi thứ chưa bao giờ là commit.
 *
 * Ghi lại vì cái bẫy không nằm ở chỗ dễ nhìn: bốn nhánh `PendingOp` kia phục
 * hồi bằng `originalHead` và làm thế là ĐÚNG, nên "làm giống bốn nhánh kia" đọc
 * ra như sự nhất quán trong khi nó chính là lỗi. Chỗ khác nhau là điều kiện
 * khởi động — bốn nhánh kia chỉ chạy được trên worktree sạch, còn `stash pop`
 * chỉ được gõ khi worktree đang bẩn.
 */

import type {
  FilePath,
  GitError,
  Lines,
  Oid,
  OutputLine,
  Repo,
  RepoOpResult,
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
import { mergeFile as diff3MergeFile } from './merge.ts';
import {
  fail,
  indexFromCommit,
  isResolved,
  line,
  noOperation,
  ok,
  operationInProgress,
  planThreeWay,
  wrongPendingKind,
  type MergeFileFn,
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

function unbornForStash(): GitError {
  return gitError(
    'bad-usage',
    'Chưa có commit nào nên chưa stash được.',
    'Stash cất thay đổi SO VỚI một commit. Branch chưa sinh ra thì không có mốc nào để so.',
    'Tạo commit đầu tiên trước: `git add .` rồi `git commit -m "commit đầu"`.',
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
): RepoOpResult {
  if (repo.pending !== null) return fail(repo, operationInProgress(repo));

  const head = headOid(repo);
  if (head === null) return fail(repo, unbornForStash());

  // Không có gì để cất KHÔNG phải lỗi — git thật cũng chỉ in một dòng rồi thoát
  // bình thường. Dựng một mã lỗi cho nó sẽ làm `git stash` trong một lời giải
  // mẫu của level đỏ chỉ vì repo đang sạch.
  if (!hasTrackedChanges(repo)) {
    return ok(repo, [line('Không có thay đổi nào để cất — worktree đang khớp HEAD.', 'hint')]);
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

/*
 * `mergeFile` có GIÁ TRỊ MẶC ĐỊNH là phép trộn THẬT (`ops/merge.ts` gói
 * `diff3.ts`), không phải một bản rút gọn.
 *
 * Mặc định chứ không bắt buộc truyền, vì hai thứ khác nhau: một tham số bắt buộc
 * bảo vệ khỏi việc quên nối dây, còn ở đây cái mặc định CHÍNH LÀ dây đã nối —
 * không có đường nào để `git stash pop` chạy mà thiếu phép trộn. Tham số vẫn còn
 * để test tiêm được bản giả, và đó là công dụng duy nhất của nó.
 *
 * ⚠ Đây KHÔNG phải một fallback im lặng: không có nhánh nào "thiếu thì bỏ qua".
 * Bản đầu của hai hàm này bắt buộc truyền, và hệ quả là `dispatch.ts` — file của
 * lane khác — đỏ ở hai dòng mà lane này không được sửa.
 */

/** `git stash apply` — áp lại và **GIỮ** mục trong stash. */
export function gitStashApply(
  repo: Repo,
  at: number,
  mergeFile: MergeFileFn = diff3MergeFile,
): RepoOpResult {
  return applyEntry(repo, at, false, mergeFile);
}

/** `git stash pop` — áp lại rồi **BỎ** mục khỏi stash (trừ khi xung đột). */
export function gitStashPop(
  repo: Repo,
  at: number,
  mergeFile: MergeFileFn = diff3MergeFile,
): RepoOpResult {
  return applyEntry(repo, at, true, mergeFile);
}

function applyEntry(
  repo: Repo,
  at: number,
  drop: boolean,
  mergeFile: MergeFileFn,
): RepoOpResult {
  if (repo.pending !== null) return fail(repo, operationInProgress(repo));
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

  const head = headOid(repo);
  if (head === null) return fail(repo, unbornForStash());

  const plan = planThreeWay({
    base: commitContents(repo.objects, stashCommit.parents[0] ?? null),
    ours: repo.worktree,
    theirs: commitContents(repo.objects, entry.oid),
    oursLabel: 'worktree hiện tại',
    theirsLabel: `stash@{${at}}`,
    mergeFile,
  });

  if (plan.conflicts.length > 0) {
    /*
     * Index GIỮ NGUYÊN ở ca xung đột — cố ý, và khác hẳn ca sạch bên dưới.
     *
     * Git thật cũng không phục hồi index khi áp stash bị xung đột. Quan trọng
     * hơn: nó làm phép kiểm của `--continue` tự động đúng, vì worktree lúc này
     * chứa marker nên `blobOid(worktree[p]) !== index[p]` cho tới khi người chơi
     * `git add`. Stage sẵn ở đây sẽ đánh dấu "đã giải quyết" cho một file còn
     * đầy marker `<<<<<<<`.
     *
     * Và KHÔNG dùng `stageNonConflicted` như `revert`: ở đó `ours` là nội dung
     * commit HEAD (toàn file đã track), còn ở đây `ours` là cả worktree, nên nó
     * sẽ `git add` luôn những file chưa track mà người chơi không hề yêu cầu.
     */
    const withTree = setWorktree(repo, plan.contents);
    const pending: Repo = {
      ...withTree,
      pending: {
        kind: 'stash',
        stashOid: entry.oid,
        originalHead: head,
        // ⚠ Đọc `repo`, KHÔNG đọc `withTree`. `withTree` đã mang nội dung có
        // marker; chụp nó thì `--abort` sẽ "khôi phục" về đúng đống marker mà
        // người chơi đang muốn thoát khỏi. Đây là hai dòng dễ hỏng nhất file
        // này vì cả hai biến đều là `Repo` hợp lệ nên không kiểu nào cản được.
        worktreeBefore: repo.worktree,
        indexBefore: repo.index,
        conflicts: plan.conflicts,
      },
    };
    return {
      repo: pending,
      output: [
        line(`Áp \`stash@{${at}}\` gây xung đột.`, 'error'),
        ...plan.conflicts.map((c) => line(`  xung đột: ${c.path}`, 'error')),
        line(`Mục \`stash@{${at}}\` KHÔNG bị bỏ — nó còn nguyên cho tới khi bạn tự drop.`, 'hint'),
        line('Sửa file, `git add` từng file đã sửa, rồi `git stash pop --continue`.', 'hint'),
      ],
      error: gitError(
        'merge-conflict',
        `Nội dung đã cất chạm vào dòng mà worktree hiện tại cũng đã sửa.`,
        `${plan.conflicts.length} file có phần chồng nhau nên git không tự quyết được giữ bên nào. Đây chính là tình huống bài G22 dạy: cất việc đi rồi lấy lại khi ngữ cảnh đã đổi.`,
        '`git status` liệt kê file đang xung đột. Sửa xong thì `git add <file>` rồi `git stash pop --continue`.',
      ),
    };
  }

  const stashedIndex = indexFromCommit(repo, stashCommit.parents[1] ?? null);
  const index: Record<FilePath, Oid> = { ...repo.index, ...stashedIndex };
  const applied = setWorktree(setIndex(repo, index), plan.contents);
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
// pop --continue / --abort
// ═══════════════════════════════════════════════════════════════════════════

/** `git stash pop --continue` sau khi người chơi đã sửa và `git add`. */
export function gitStashApplyContinue(repo: Repo): RepoOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('stash pop'));
  if (pending.kind !== 'stash') return fail(repo, wrongPendingKind(pending.kind, 'stash pop'));

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
        `Sửa xong thì \`git add ${unresolved[0] ?? '<file>'}\`, rồi \`git stash pop --continue\`.`,
      ),
    );
  }

  const cleared: Repo = { ...repo, pending: null };
  const at = cleared.stash.findIndex((entry) => entry.oid === pending.stashOid);
  return ok(cleared, [
    line('Đã áp xong phần đã cất.', 'success'),
    at < 0
      ? line('Mục stash tương ứng không còn trong danh sách.', 'hint')
      : line(
          `\`stash@{${at}}\` vẫn còn — xung đột thì git KHÔNG tự bỏ mục đi. Hài lòng rồi thì \`git stash drop\`.`,
          'hint',
        ),
  ]);
}

/**
 * `git stash pop --abort` — bỏ phép áp đang dở, trả worktree và index về ĐÚNG
 * lúc trước khi gõ lệnh.
 *
 * ⛔ Đây là đường lui KHÔNG ĐƯỢC PHÉP mất dữ liệu, và lý do nằm ở chỗ khác chứ
 * không ở đây: chương 3 dạy "git không làm mất thứ bạn đã commit", nhưng người
 * học rút ra bài học rộng hơn là *git có đường lui*. Một lệnh `--abort` của
 * game tự tay xoá phần chưa commit sẽ dạy ngược lại đúng điều đó, và người chơi
 * mang bài học ngược ấy ra git thật.
 *
 * ⚠ Bản đầu (tới 2026-09-14) phục hồi theo `originalHead`, tức vứt luôn thay
 * đổi cục bộ chưa commit — không phải vì ai chọn thế mà vì `PendingOp` nhánh
 * `'stash'` lúc đó chỉ mang một `Oid`. `worktreeBefore` / `indexBefore` trong
 * hợp đồng là thứ gỡ ràng buộc đó; `originalHead` ở lại vì `predicates.ts` dùng
 * nó làm gốc reachability, không phải để phục hồi.
 *
 * Ba thứ phải quay lại: **worktree**, **index**, **`pending`**. Ref chưa hề dịch
 * chuyển — áp stash không tạo commit nào — nên cố ý KHÔNG ghi reflog: ghi một
 * mục cho một ref đứng yên là bịa ra lịch sử.
 */
export function gitStashApplyAbort(repo: Repo): RepoOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('stash pop'));
  if (pending.kind !== 'stash') return fail(repo, wrongPendingKind(pending.kind, 'stash pop'));

  const restored: Repo = {
    ...setWorktree(setIndex(repo, pending.indexBefore), pending.worktreeBefore),
    pending: null,
  };
  return ok(restored, [
    line('Đã huỷ phép áp stash. Worktree và index về đúng như trước khi gõ lệnh.', 'success'),
    line('Thay đổi chưa commit của bạn còn nguyên — `--abort` không vứt gì cả.', 'hint'),
    line(`Mục \`${shortOid(pending.stashOid)}\` vẫn nằm trong stash, chưa bao giờ bị bỏ đi.`, 'hint'),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// list / drop
// ═══════════════════════════════════════════════════════════════════════════

export function gitStashList(repo: Repo): RepoOpResult {
  if (repo.stash.length === 0) {
    return ok(repo, [line('Stash đang trống.', 'hint')]);
  }
  return ok(
    repo,
    repo.stash.map((entry, i) => line(`stash@{${i}}: On ${entry.branch}: ${entry.message}`)),
  );
}

export function gitStashDrop(repo: Repo, at: number): RepoOpResult {
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
