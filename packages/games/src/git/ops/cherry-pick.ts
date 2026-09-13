/**
 * `git cherry-pick` — chép thay đổi của một commit sang chỗ khác.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẢN SAO, KHÔNG PHẢI DI CHUYỂN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Commit mới có **cha khác** và **nội dung trùng** commit nguồn. Commit nguồn
 * nằm nguyên chỗ cũ, không mất ref, không mờ đi. Đây là chỗ cherry-pick khác
 * hẳn `rebase`: rebase VIẾT LẠI (bản cũ thành mồ côi), cherry-pick NHÂN ĐÔI.
 *
 * Hàm trả về ánh xạ `bản sao → nguồn` để tầng view vẽ được "sợi chỉ mờ nối về
 * nguồn" (`ViewHints.duplicateOf` ở `../view.ts`, ra cạnh `cherry-source` và
 * accent `duplicate`). Không có ánh xạ đó thì hai commit trùng nội dung trông
 * như hai commit không liên quan, và bài G11 mất hẳn hình ảnh của nó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ KHÔNG KHỬ TRÙNG LẶP — CÁI GIÁ PHẢI HIỆN RA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bài G11 dạy **cái giá** của cherry-pick: chép một commit sang nhánh khác rồi
 * merge hai nhánh đó lại thì cùng một thay đổi xuất hiện hai lần trong lịch sử.
 * File này cố tình KHÔNG thông minh về chuyện đó — không dò "thay đổi này đã có
 * rồi", không gộp, không bỏ qua.
 *
 * Hệ quả cụ thể và có chủ ý: **cherry-pick một commit đã nằm trong lịch sử vẫn
 * tạo ra một commit mới**, dù cây kết quả y hệt cây cũ (một "commit rỗng").
 * Git thật từ chối ca này và đòi `--allow-empty`. Ở đây nó được phép, kèm một
 * dòng cảnh báo, vì chặn nó đi là chặn luôn đúng tình huống bài G11 muốn người
 * chơi nhìn thấy. Ô nghiệm thu ghim điều này: cherry-pick cùng một commit hai
 * lần phải ra hai commit khác Oid.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TÁC GIẢ ĐI THEO BẢN SAO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Commit mới giữ `author` của commit NGUỒN, không lấy `ctx.author`. Đúng như
 * git thật (git tách author khỏi committer; mô hình này chỉ có một trường nên
 * giữ author là lựa chọn đúng hơn), và nó là thứ làm bài "chép bản vá của đồng
 * nghiệp sang nhánh phát hành" đọc được: tên người viết bản vá vẫn ở đó.
 */

import type { Oid, OutputLine, PendingOp, Repo } from '../contract.ts';
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
import { headContents, headOid, isIndexClean, isWorktreeClean, setIndex, setWorktree } from '../repo.ts';
import {
  advanceHead,
  dirtyTree,
  fail,
  indexFromCommit,
  line,
  noOperation,
  ok,
  operationInProgress,
  oursLabelOf,
  untrackedWorktree,
  wrongPendingKind,
  type GitOpResult,
  type OpContext,
} from './reset.ts';
import {
  describeCommit,
  enterConflict,
  notACommitError,
  parentContents,
  planThreeWay,
  restoreTo,
  stageConflicted,
  unbornHeadError,
  unmergedPathsError,
  unresolvedPaths,
} from './merge.ts';

/**
 * Kết quả cherry-pick, kèm ánh xạ `bản sao → nguồn`.
 *
 * ⚠ Ánh xạ này chỉ chứa những bản sao do **lệnh vừa chạy** tạo ra. Nó là gợi ý
 * cho renderer trong một lượt vẽ, không phải trạng thái được lưu — `GitWorld`
 * cố ý không mang nó, vì "bản sao của cái gì" suy ra được từ nội dung và lưu nó
 * lại là đúng thứ `code-conventions.md` §"No Derived Fields" cấm. Hệ quả phải
 * biết: sau một xung đột rồi `--continue`, những bản sao tạo ra TRƯỚC lúc kẹt
 * không còn trong ánh xạ của lệnh `--continue`. Sợi chỉ mờ của chúng biến mất ở
 * lượt vẽ đó — chấp nhận được, vì nó là hiệu ứng nhấn mạnh chứ không phải dữ
 * liệu người chơi cần để giải bài.
 */
export interface PickOutcome extends GitOpResult {
  readonly duplicateOf: Readonly<Record<Oid, Oid>>;
}

function withDuplicates(
  result: GitOpResult,
  duplicateOf: Readonly<Record<Oid, Oid>>,
): PickOutcome {
  return { ...result, duplicateOf };
}

function mergeCommitRefused(oid: Oid): ReturnType<typeof gitError> {
  return gitError(
    'bad-usage',
    `\`${shortOid(oid)}\` là một commit merge nên không chép thẳng được.`,
    'Commit merge có hai cha, nên "thay đổi của nó" là câu hỏi thiếu vế: so với nhánh nào? Git thật đòi `-m 1` hoặc `-m 2` để chọn cha làm mốc.',
    'Game chưa dạy `cherry-pick -m`. Chọn một commit thường trên một trong hai nhánh.',
  );
}

/**
 * `git cherry-pick <commit>…`
 *
 * Áp lần lượt từng commit lên HEAD hiện tại. Mỗi commit là một phép trộn ba ngả
 * với `base` = cha của nó, `theirs` = chính nó, `ours` = HEAD lúc đó.
 *
 * ⚠ Mọi commit được kiểm TRƯỚC khi commit đầu tiên được áp. Một danh sách có
 * phần tử hỏng ở giữa mà đã áp mất nửa đầu sẽ để repo ở trạng thái nửa vời
 * không có `--abort` nào gỡ được — và đó đúng là thứ hợp đồng cấm ("lệnh hỏng
 * trả trạng thái CŨ, không đổi").
 */
export function gitCherryPick(repo: Repo, picks: readonly Oid[], ctx: OpContext): PickOutcome {
  if (repo.pending !== null) return withDuplicates(fail(repo, operationInProgress(repo)), {});

  for (const oid of picks) {
    const commit = getCommit(repo.objects, oid);
    if (commit === null) return withDuplicates(fail(repo, notACommitError(oid)), {});
    if (commit.parents.length > 1) {
      return withDuplicates(fail(repo, mergeCommitRefused(oid)), {});
    }
  }

  if (headOid(repo) === null) {
    return withDuplicates(fail(repo, unbornHeadError('cherry-pick')), {});
  }
  if (!isIndexClean(repo) || !isWorktreeClean(repo)) {
    return withDuplicates(fail(repo, dirtyTree(repo, 'cherry-pick')), {});
  }
  if (picks.length === 0) {
    return withDuplicates(
      ok(repo, [line('Không có commit nào được nêu, nên không có gì để chép.', 'hint')]),
      {},
    );
  }

  const originalHead = headOid(repo) ?? '';
  return applyPicks(repo, picks, originalHead, ctx, {}, []);
}

/**
 * Vòng áp từng commit. Dùng lại nguyên vẹn cho `--continue` và `--skip`, nên
 * ba lệnh đó không có bản sao thứ hai của logic áp.
 *
 * `carried` là ánh xạ bản-sao đã tích luỹ từ trước (khi được gọi lại từ
 * `--continue`), `prefix` là những dòng output đã sinh ra trước đó.
 */
function applyPicks(
  repo: Repo,
  picks: readonly Oid[],
  originalHead: Oid,
  ctx: OpContext,
  carried: Readonly<Record<Oid, Oid>>,
  prefix: readonly OutputLine[],
): PickOutcome {
  let current = repo;
  const duplicateOf: Record<Oid, Oid> = { ...carried };
  const output: OutputLine[] = [...prefix];

  for (let i = 0; i < picks.length; i += 1) {
    const source = picks[i];
    if (source === undefined) continue;
    const commit = getCommit(current.objects, source);
    if (commit === null) {
      return withDuplicates(fail(repo, notACommitError(source)), {});
    }

    const head = headOid(current);
    if (head === null) {
      return withDuplicates(fail(repo, unbornHeadError('cherry-pick')), {});
    }

    const theirsLabel = `${shortOid(source)} ${commit.message}`;
    const plan = planThreeWay({
      base: parentContents(current.objects, source),
      ours: headContents(current),
      theirs: commitContents(current.objects, source),
      oursLabel: oursLabelOf(current),
      theirsLabel,
    });

    if (plan.conflicts.length > 0) {
      const pending: PendingOp = {
        kind: 'cherry-pick',
        // Phần tử [0] là commit ĐANG kẹt — cùng quy ước với `remaining` của
        // rebase, để `--continue` và `--skip` đọc một chỗ duy nhất.
        picks: picks.slice(i),
        originalHead,
        conflicts: plan.conflicts,
      };
      return withDuplicates(
        {
          repo: enterConflict(current, plan, pending),
          output: [
            ...output,
            line(`Chép ${describeCommit(current, source)} gặp xung đột.`, 'error'),
            ...plan.conflicts.map((c) => line(`  xung đột: ${c.path}`, 'error')),
            line(
              'Đây KHÔNG phải lỗi của bạn: commit này được viết cho một nền khác, và ở những chỗ này nền hiện tại đã đổi so với lúc đó.',
              'hint',
            ),
            line('Sửa file, xoá hết dòng marker, rồi `git cherry-pick --continue`.', 'hint'),
            line(
              'Bỏ riêng commit này mà vẫn chép tiếp phần còn lại thì `git cherry-pick --skip`; bỏ hết thì `--abort`.',
              'hint',
            ),
          ],
          error: gitError(
            'merge-conflict',
            `${plan.conflicts.length} file xung đột khi chép \`${shortOid(source)}\`.`,
            `Repo đang ở giữa một cherry-pick dở dang: còn ${picks.length - i} commit chưa chép xong. ` +
              'Thay đổi của commit nguồn chạm vào những dòng mà nền hiện tại đã khác so với lúc nó được viết.',
            '`git status` liệt kê file đang xung đột. Sửa xong thì `git cherry-pick --continue`.',
          ),
        },
        duplicateOf,
      );
    }

    const [store, tree] = writeContents(current.objects, plan.contents);
    const headCommit = getCommit(current.objects, head);
    const emptyCopy = headCommit !== null && headCommit.tree === tree;

    const [store2, oid] = writeCommit(store, {
      tree,
      parents: [head],
      message: commit.message,
      // Tác giả đi theo bản sao — xem chú thích đầu file.
      author: commit.author,
      logicalTime: ctx.logicalTime,
    });

    const withStore: Repo = { ...current, objects: store2 };
    const moved = advanceHead(withStore, oid, {
      op: 'cherry-pick',
      message: `chép ${shortOid(source)}`,
      logicalTime: ctx.logicalTime,
    });
    const staged = setIndex(moved, indexFromCommit(moved, oid));
    current = setWorktree(staged, { ...untrackedWorktree(current), ...plan.contents });

    duplicateOf[oid] = source;
    output.push(
      line(`Đã chép ${shortOid(source)} thành ${describeCommit(current, oid)}`, 'success'),
    );
    if (emptyCopy) {
      output.push(
        line(
          `Bản sao này KHÔNG đổi gì cả — thay đổi của ${shortOid(source)} đã có sẵn ở đây. Commit vẫn được tạo, và lịch sử giờ có hai commit nói cùng một chuyện.`,
          'warn',
        ),
      );
    }
  }

  output.push(
    line(
      'Commit nguồn vẫn nằm nguyên chỗ cũ. `cherry-pick` NHÂN ĐÔI chứ không di chuyển — merge hai nhánh này về sau sẽ thấy cùng một thay đổi hai lần.',
      'hint',
    ),
  );
  return withDuplicates(ok(current, output), duplicateOf);
}

/** `git cherry-pick --continue` sau khi người chơi đã xoá hết marker. */
export function cherryPickContinue(repo: Repo, ctx: OpContext): PickOutcome {
  const pending = repo.pending;
  if (pending === null) return withDuplicates(fail(repo, noOperation('cherry-pick')), {});
  if (pending.kind !== 'cherry-pick') {
    return withDuplicates(fail(repo, wrongPendingKind(pending.kind, 'cherry-pick')), {});
  }

  const unresolved = unresolvedPaths(repo, pending.conflicts);
  if (unresolved.length > 0) {
    return withDuplicates(fail(repo, unmergedPathsError('cherry-pick', unresolved)), {});
  }

  const source = pending.picks[0];
  if (source === undefined) {
    return withDuplicates(
      ok({ ...repo, pending: null }, [line('Không còn commit nào phải chép.', 'hint')]),
      {},
    );
  }
  const commit = getCommit(repo.objects, source);
  if (commit === null) return withDuplicates(fail(repo, notACommitError(source)), {});

  const head = headOid(repo);
  if (head === null) return withDuplicates(fail(repo, unbornHeadError('cherry-pick')), {});

  const staged = stageConflicted(repo, pending.conflicts);
  const [store, tree] = putObject(staged.objects, makeTree(staged.index));
  const [store2, oid] = writeCommit(store, {
    tree,
    parents: [head],
    message: commit.message,
    author: commit.author,
    logicalTime: ctx.logicalTime,
  });

  const withStore: Repo = { ...staged, objects: store2, pending: null };
  const moved = advanceHead(withStore, oid, {
    op: 'cherry-pick',
    message: `chép ${shortOid(source)}`,
    logicalTime: ctx.logicalTime,
  });
  const resynced = setIndex(moved, indexFromCommit(moved, oid));

  return applyPicks(
    resynced,
    pending.picks.slice(1),
    pending.originalHead,
    ctx,
    { [oid]: source },
    [line(`Xung đột đã giải xong. Đã chép ${shortOid(source)} thành ${describeCommit(resynced, oid)}`, 'success')],
  );
}

/**
 * `git cherry-pick --skip` — bỏ commit đang kẹt, chép tiếp phần còn lại.
 *
 * Khác `--abort` ở chỗ những bản sao đã tạo trước đó ĐƯỢC GIỮ. Đây là lệnh cho
 * tình huống "commit này không còn cần nữa" chứ không phải "tôi làm sai từ đầu".
 */
export function cherryPickSkip(repo: Repo, ctx: OpContext): PickOutcome {
  const pending = repo.pending;
  if (pending === null) return withDuplicates(fail(repo, noOperation('cherry-pick')), {});
  if (pending.kind !== 'cherry-pick') {
    return withDuplicates(fail(repo, wrongPendingKind(pending.kind, 'cherry-pick')), {});
  }

  const head = headOid(repo);
  if (head === null) return withDuplicates(fail(repo, unbornHeadError('cherry-pick')), {});

  const skipped = pending.picks[0];
  // Vứt nội dung có marker đi: quay index + worktree về đúng HEAD hiện tại.
  const cleaned = restoreTo(repo, head);
  const rest = pending.picks.slice(1);

  if (rest.length === 0) {
    return withDuplicates(
      ok(cleaned, [
        line(
          `Đã bỏ qua ${skipped === undefined ? 'commit đang kẹt' : shortOid(skipped)}. Không còn commit nào phải chép.`,
          'success',
        ),
      ]),
      {},
    );
  }

  return applyPicks(cleaned, rest, pending.originalHead, ctx, {}, [
    line(
      `Đã bỏ qua ${skipped === undefined ? 'commit đang kẹt' : shortOid(skipped)} — không có bản sao nào của nó được tạo.`,
      'success',
    ),
  ]);
}

/**
 * `git cherry-pick --abort` — về đúng lúc trước khi gõ lệnh.
 *
 * ⚠ Khác `merge --abort`: ở đây con trỏ CÓ dịch chuyển nếu vài commit đầu đã
 * chép xong, nên phải dời nó về `originalHead`. Những bản sao đã tạo thành mồ
 * côi — vẫn nằm nguyên trong kho, `git reflog` còn nhớ, và đó là bài chương 3.
 */
export function cherryPickAbort(repo: Repo, ctx: OpContext): GitOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('cherry-pick'));
  if (pending.kind !== 'cherry-pick') {
    return fail(repo, wrongPendingKind(pending.kind, 'cherry-pick'));
  }

  const back = pending.originalHead;
  const moved =
    headOid(repo) === back
      ? repo
      : advanceHead(repo, back, {
          op: 'cherry-pick',
          message: 'huỷ cherry-pick',
          logicalTime: ctx.logicalTime,
        });
  const restored = restoreTo(moved, back);

  return ok(restored, [
    line(`Đã huỷ cherry-pick. Quay về ${describeCommit(restored, back)}`, 'success'),
    line(
      'Bản sao đã tạo trước lúc kẹt giờ không còn ref nào trỏ tới, nhưng chúng vẫn nằm trong kho — `git reflog` nhớ đường về.',
      'hint',
    ),
  ]);
}
