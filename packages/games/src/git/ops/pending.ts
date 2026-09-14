/**
 * `--continue` / `--abort` / `--skip` — **một chỗ cho cả năm nhánh** `PendingOp`.
 *
 * Đây là bài G29, và nó là một bài về *hình dạng của git* chứ không về một lệnh:
 * năm thao tác nhiều bước khác hẳn nhau (merge, rebase, cherry-pick, revert,
 * stash) đều dừng lại ở cùng một chỗ và đều gỡ bằng cùng ba cái công tắc. Người
 * học nhận ra hình dạng đó một lần rồi dùng lại cho mọi lệnh về sau — kể cả
 * những lệnh game này không dạy.
 *
 * ⛔ **FILE NÀY KHÔNG HIỆN THỰC GÌ CẢ.** Nó điều phối. Mỗi nhánh thuộc về lane
 * đã viết ra nó, và gọi lại đúng hàm của lane đó là điều kiện để hai bên không
 * lệch nhau:
 *
 * | nhánh | `--continue` / `--abort` / `--skip` sống ở |
 * |---|---|
 * | `merge`       | `./merge.ts` |
 * | `rebase`      | `./rebase.ts` |
 * | `cherry-pick` | `./cherry-pick.ts` |
 * | `revert`      | `./reset.ts` — lane cứu hộ sở hữu, KHÔNG viết lại ở đây |
 * | `stash`       | ở đây, và chỉ vì chưa lane nào sinh ra nhánh này — xem dưới |
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NHÁNH `stash` HIỆN CHƯA CÓ AI SINH RA — ghi ra để không ai tưởng là quên
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hợp đồng khai nhánh `'stash'` với lý do "`git stash pop` lên một worktree đã
 * đổi là một phép trộn BA NGẢ thật, và nó xung đột được". Nhưng `./stash.ts`
 * hiện **PHỦ** stash lên worktree thay vì trộn (nó nói thẳng điều đó ở phần "cố
 * tình bỏ"), nên trong toàn bộ engine hiện tại **không đường nào đặt ra một
 * `PendingOp` kind `'stash'`**.
 *
 * Hai bên không sai — chúng chỉ chưa gặp nhau, và đó là việc của lead. File này
 * vẫn xử nhánh đó cho đủ năm, vì một `switch` thiếu một nhánh sẽ ném hoặc rơi
 * vào `default` im lặng đúng vào ngày ai đó nối dây xong.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `--skip` KHÔNG CÓ NGHĨA VỚI MỌI THAO TÁC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `--skip` nghĩa là "bỏ ĐƠN VỊ đang kẹt, làm tiếp phần còn lại", nên nó chỉ có
 * nghĩa khi thao tác gồm NHIỀU đơn vị: rebase có một dãy bước, cherry-pick có
 * một dãy commit. `merge` chỉ có đúng một việc phải làm, `revert` đảo đúng một
 * commit, `stash` áp đúng một mục — bỏ cái duy nhất đi thì đó là `--abort` chứ
 * không phải `--skip`.
 *
 * Trả lỗi kèm câu chỉ sang `--abort` thay vì lặng lẽ coi hai lệnh là một: một
 * người chơi gõ `git merge --skip` đang hiểu sai điều gì đó, và câu trả lời
 * đúng là sửa chỗ hiểu sai.
 */

import type { GitError, OutputLine, PendingOp, Repo } from '../contract.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { headOid } from '../repo.ts';
import {
  fail,
  gitRevertAbort,
  gitRevertContinue,
  line,
  noOperation,
  ok,
  wrongPendingKind,
  type GitOpResult,
  type OpContext,
} from './reset.ts';
import {
  describeCommit,
  mergeAbort,
  mergeContinue,
  restoreTo,
  stageConflicted,
  unmergedPathsError,
  unresolvedPaths,
  type PendingKind,
} from './merge.ts';
import { rebaseAbort, rebaseContinue, rebaseSkip } from './rebase.ts';
import {
  cherryPickAbort,
  cherryPickContinue,
  cherryPickSkip,
  type PickOutcome,
} from './cherry-pick.ts';

/**
 * Kết quả của một trong ba công tắc.
 *
 * Dùng lại `PickOutcome` thay vì khai một kiểu thứ hai y hệt: tầng điều phối
 * lệnh chỉ muốn MỘT hình dạng cho `git <bất-kỳ> --continue`, và `duplicateOf`
 * rỗng là câu trả lời đúng cho bốn nhánh không phải cherry-pick.
 */
export type PendingOutcome = PickOutcome;

const NO_DUPLICATES: Readonly<Record<string, string>> = Object.freeze({});

function plain(result: GitOpResult): PendingOutcome {
  return { ...result, duplicateOf: NO_DUPLICATES };
}

/**
 * Người chơi gõ `git <verb> --continue` trong khi đang kẹt ở một thao tác khác.
 *
 * `null` = khớp, chạy tiếp. Tách ra vì cả ba công tắc dùng chung đúng phép kiểm
 * này, và một trong ba quên kiểm sẽ cho `git merge --abort` gỡ mất một rebase.
 */
function mismatch(pending: PendingOp | null, verb: PendingKind): GitError | null {
  if (pending === null) return noOperation(verb);
  if (pending.kind !== verb) return wrongPendingKind(pending.kind, verb);
  return null;
}

function skipNotApplicable(kind: PendingKind, unit: string): GitError {
  return gitError(
    'bad-usage',
    `\`git ${kind} --skip\` không có nghĩa.`,
    `\`--skip\` bỏ ĐƠN VỊ đang kẹt rồi làm tiếp phần còn lại, nên nó chỉ dùng được với thao tác gồm nhiều đơn vị (rebase có một dãy bước, cherry-pick có một dãy commit). Một \`${kind}\` chỉ có ${unit}, nên bỏ nó đi chính là huỷ cả thao tác.`,
    `Gõ \`git ${kind} --abort\` để quay về đúng lúc trước khi bắt đầu.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. `--continue`
// ═══════════════════════════════════════════════════════════════════════════

export function gitOpContinue(repo: Repo, verb: PendingKind, ctx: OpContext): PendingOutcome {
  const wrong = mismatch(repo.pending, verb);
  if (wrong !== null) return plain(fail(repo, wrong));
  const pending = repo.pending;
  if (pending === null) return plain(fail(repo, noOperation(verb)));

  switch (pending.kind) {
    case 'merge':
      return plain(mergeContinue(repo, ctx));
    case 'rebase':
      return plain(rebaseContinue(repo, ctx));
    case 'cherry-pick':
      return cherryPickContinue(repo, ctx);
    case 'revert':
      // ⛔ Lane cứu hộ sở hữu `revert`. Gọi lại hàm của nó thay vì dựng bản thứ
      // hai — hai hiện thực của cùng một `--continue` sẽ lệch nhau ở tiêu chí
      // "đã giải xong chưa", và triệu chứng là cùng một thao tác được chấp nhận
      // ở lệnh này mà bị từ chối ở lệnh kia.
      return plain(gitRevertContinue(repo, ctx));
    case 'stash':
      return plain(stashContinue(repo, pending));
  }
}

/**
 * `stash --continue` — xác nhận đã giải xong, KHÔNG tạo commit nào.
 *
 * Khác hẳn bốn nhánh kia và khác một cách có lý do: áp một stash không sinh ra
 * commit, nên "xong" ở đây chỉ nghĩa là thôi kẹt. Mục stash vẫn nằm nguyên
 * trong `repo.stash` — người chơi tự `git stash drop` khi thấy đã dùng xong, y
 * như `git stash apply`.
 */
function stashContinue(repo: Repo, pending: Extract<PendingOp, { kind: 'stash' }>): GitOpResult {
  const unresolved = unresolvedPaths(repo, pending.conflicts);
  if (unresolved.length > 0) return fail(repo, unmergedPathsError('stash', unresolved));
  const staged = stageConflicted(repo, pending.conflicts);
  return ok({ ...staged, pending: null }, [
    line('Xung đột đã giải xong. Stash đã được áp lại đầy đủ.', 'success'),
    line(
      `Mục \`${shortOid(pending.stashOid)}\` VẪN còn trong stash — áp lại không tự bỏ nó đi. Gõ \`git stash drop\` khi chắc chắn đã dùng xong.`,
      'hint',
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. `--abort`
// ═══════════════════════════════════════════════════════════════════════════

export function gitOpAbort(repo: Repo, verb: PendingKind, ctx: OpContext): PendingOutcome {
  const wrong = mismatch(repo.pending, verb);
  if (wrong !== null) return plain(fail(repo, wrong));
  const pending = repo.pending;
  if (pending === null) return plain(fail(repo, noOperation(verb)));

  switch (pending.kind) {
    case 'merge':
      return plain(mergeAbort(repo));
    case 'rebase':
      return plain(rebaseAbort(repo, ctx));
    case 'cherry-pick':
      return plain(cherryPickAbort(repo, ctx));
    case 'revert':
      return plain(gitRevertAbort(repo));
    case 'stash':
      return plain(
        ok(restoreTo(repo, headOid(repo) ?? pending.originalHead), [
          line('Đã huỷ việc áp stash. Worktree về đúng như trước.', 'success'),
          line('Mục stash không mất — nó chưa bao giờ bị bỏ đi.', 'hint'),
        ]),
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. `--skip`
// ═══════════════════════════════════════════════════════════════════════════

export function gitOpSkip(repo: Repo, verb: PendingKind, ctx: OpContext): PendingOutcome {
  const wrong = mismatch(repo.pending, verb);
  if (wrong !== null) return plain(fail(repo, wrong));
  const pending = repo.pending;
  if (pending === null) return plain(fail(repo, noOperation(verb)));

  switch (pending.kind) {
    case 'rebase':
      return plain(rebaseSkip(repo, ctx));
    case 'cherry-pick':
      return cherryPickSkip(repo, ctx);
    case 'merge':
      return plain(fail(repo, skipNotApplicable('merge', 'đúng một nhánh để trộn')));
    case 'revert':
      return plain(fail(repo, skipNotApplicable('revert', 'đúng một commit để đảo')));
    case 'stash':
      return plain(fail(repo, skipNotApplicable('stash', 'đúng một mục để áp')));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. MÔ TẢ TRẠNG THÁI KẸT (cho `git status` và cho HUD)
// ═══════════════════════════════════════════════════════════════════════════

/** Động từ người chơi phải gõ để gỡ. Cùng tên với `kind`, trừ chỗ nó khác. */
export function pendingVerb(pending: PendingOp): string {
  return pending.kind;
}

/**
 * Vài dòng nói repo đang kẹt ở đâu và ba công tắc nào dùng được.
 *
 * ⚠ Nêu **đích danh từng file còn marker**, không phải một con số. Khảo sát
 * ICTERI §5.7 đo được "blind-testing effect": thông báo không nói rõ phải làm gì
 * ở file nào đẩy người học vào vòng gõ đại. Một dòng "3 file đang xung đột"
 * đúng về mặt sự kiện và vô dụng về mặt hành động.
 */
export function pendingStatusLines(repo: Repo): readonly OutputLine[] {
  const pending = repo.pending;
  if (pending === null) return [];

  const verb = pendingVerb(pending);
  const out: OutputLine[] = [line(`Đang ở giữa một \`${verb}\` dở dang.`, 'warn')];

  switch (pending.kind) {
    case 'merge':
      out.push(line(`  đang trộn \`${pending.theirsLabel}\` vào nhánh hiện tại.`, 'plain'));
      break;
    case 'rebase': {
      const left = pending.remaining.length;
      out.push(
        line(
          `  đang áp lại lên ${describeCommit(repo, pending.onto)} — còn ${left} bước.`,
          'plain',
        ),
      );
      if (pending.conflicts.length === 0) {
        out.push(line('  dừng theo lệnh `edit`, không phải vì xung đột.', 'plain'));
      }
      break;
    }
    case 'cherry-pick':
      out.push(line(`  còn ${pending.picks.length} commit chưa chép xong.`, 'plain'));
      break;
    case 'revert':
      out.push(line(`  đang đảo ngược ${describeCommit(repo, pending.target)}.`, 'plain'));
      break;
    case 'stash':
      out.push(line(`  đang áp mục stash \`${shortOid(pending.stashOid)}\`.`, 'plain'));
      break;
  }

  const unresolved = unresolvedPaths(repo, pending.conflicts);
  if (unresolved.length > 0) {
    out.push(line('File còn marker conflict, phải sửa trước khi chạy tiếp:', 'error'));
    for (const path of unresolved) out.push(line(`  ${path}`, 'error'));
  } else if (pending.conflicts.length > 0) {
    out.push(line('Mọi file xung đột đã sạch marker — chạy tiếp được rồi.', 'success'));
  }

  const switches =
    pending.kind === 'rebase' || pending.kind === 'cherry-pick'
      ? `\`git ${verb} --continue\` · \`git ${verb} --skip\` · \`git ${verb} --abort\``
      : `\`git ${verb} --continue\` · \`git ${verb} --abort\``;
  out.push(line(switches, 'hint'));
  return out;
}
