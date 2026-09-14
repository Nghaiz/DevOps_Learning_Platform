/**
 * Định tuyến lệnh — MỐI NỐI giữa bộ phân tích và `ops/`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO FILE NÀY RA ĐỜI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `git stash pop --continue` và `git stash pop --abort` từng KHÔNG chạy được,
 * và cả ba bộ test hiện có đều xanh trong lúc đó:
 *
 *  - `command-table.test.ts` chứng minh hai cờ ĐƯỢC KHAI;
 *  - `parser.test.ts` chứng minh bộ phân tích NHẬN chúng (`hasFlag(...)` xanh);
 *  - `ops/stash.test.ts` chứng minh `gitStashApplyContinue` / `...Abort` CHẠY
 *    đúng khi được gọi.
 *
 * Không ô nào trong ba bộ đó kiểm thứ nằm GIỮA: `dispatch.ts` bỏ qua hai cờ và
 * đi áp lại stash từ đầu, nên người chơi đang kẹt — được chính output của game
 * bảo gõ `git stash pop --continue` — nhận về `operationInProgress` và không có
 * đường ra. Mỗi tầng tự kiểm tầng của mình thì không tầng nào kiểm mối nối.
 *
 * Nên nguyên tắc của file này: đi từ CHUỖI người chơi gõ, qua bộ phân tích
 * thật, tới `dispatchCommand` thật. Không tiêm gì, không gọi tắt hàm `ops/`.
 */

import { describe, expect, it } from 'vitest';

import type { GitWorld, Lines, Repo } from './contract.ts';
import { dispatchCommand, type DispatchDeps, type DispatchResult } from './dispatch.ts';
import { parseGitCommand } from './parser.ts';
import { sandboxLevel } from './sandbox.ts';
import { buildWorld } from './world-spec.ts';
import { blobOid, emptyRepo, headOid, setIndex, setWorktree } from './repo.ts';
import { makeBlob, putObject, writeCommit, writeContents } from './objects.ts';
import { advanceHead, indexFromCommit } from './ops/reset.ts';
import { gitStashPush } from './ops/stash.ts';

/* `deps.level` hiện chưa được nhánh nào đọc (`void deps` trong dispatch.ts) —
 * một level sandbox rỗng là đủ, và nó không lôi 32 level thật vào test này. */
const DEPS: DispatchDeps = { level: sandboxLevel({}) };

/** Chạy đúng đường người chơi đi: chuỗi → bộ phân tích thật → định tuyến thật. */
function run(world: GitWorld, input: string): DispatchResult {
  const parsed = parseGitCommand(input);
  // Đỏ ở đây nghĩa là bảng lệnh chưa khai cờ — một lỗi KHÁC hẳn lỗi định tuyến,
  // nên nó phải hiện ra bằng tên của nó thay vì nấp trong một `error` chung.
  expect(parsed.ok, `bộ phân tích từ chối \`${input}\``).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return dispatchCommand(world, parsed.command, DEPS);
}

function wrap(local: Repo): GitWorld {
  return { ...buildWorld({}, 1), local };
}

function write(repo: Repo, path: string, lines: Lines): Repo {
  return setWorktree(repo, { ...repo.worktree, [path]: lines });
}

function stage(repo: Repo, path: string): Repo {
  const [store, oid] = putObject(repo.objects, makeBlob(repo.worktree[path] ?? []));
  return setIndex({ ...repo, objects: store }, { ...repo.index, [path]: oid });
}

function commitOne(repo: Repo, path: string, lines: Lines): Repo {
  const [store, tree] = writeContents(repo.objects, { [path]: lines });
  const [store2, oid] = writeCommit(store, {
    tree,
    parents: headOid(repo) === null ? [] : [headOid(repo) ?? ''],
    message: 'c1',
    author: 'Bạn',
    logicalTime: 1,
  });
  const moved = advanceHead({ ...repo, objects: store2 }, oid, {
    op: 'commit',
    message: 'c1',
    logicalTime: 1,
  });
  return setWorktree(setIndex(moved, indexFromCommit(moved, oid)), { [path]: lines });
}

/**
 * Một thế giới đang KẸT ở `PendingOp` nhánh `'stash'`, dựng bằng lệnh thật.
 *
 * ⚠ Dùng diff3 THẬT, không tiêm bản trộn giả: mục đích của file này là mối nối,
 * và một bản trộn giả sẽ làm ô xanh kể cả khi `dispatch.ts` gọi nhầm hàm.
 * Hai bên thêm hai dòng khác nhau ở cùng vị trí ⇒ xung đột thật.
 */
function stuckWorld(): { readonly world: GitWorld; readonly beforeApply: Repo } {
  let repo = commitOne(emptyRepo(), 'a.txt', ['1']);
  repo = write(repo, 'a.txt', ['1', 'việc đang cất']);
  repo = gitStashPush(repo, null, { logicalTime: 2, author: 'Bạn' }).repo;

  repo = write(repo, 'a.txt', ['1', 'việc làm sau khi cất']);
  repo = stage(repo, 'a.txt');
  repo = write(repo, 'a.txt', ['1', 'việc làm sau khi cất', 'sửa thêm, chưa add']);
  const beforeApply = repo;

  const popped = run(wrap(repo), 'git stash pop');
  expect(popped.error?.code, 'phải kẹt thì mới có gì để gỡ').toBe('merge-conflict');
  expect(popped.world.local.pending?.kind).toBe('stash');
  return { world: popped.world, beforeApply };
}

describe('`git stash pop --abort` — cờ đã khai phải NỐI tới hàm gỡ', () => {
  it('gỡ được xung đột thay vì đâm vào `operationInProgress`', () => {
    const { world } = stuckWorld();
    const back = run(world, 'git stash pop --abort');

    // ⚠ Đây là dấu vân tay của lỗi cũ. Khi hai cờ chưa được nối, nhánh `pop` đi
    // áp lại stash từ đầu và `applyEntry` từ chối vì `repo.pending !== null` —
    // nên ô này đỏ với đúng mã đó chứ không phải với một lỗi định tuyến.
    expect(back.error?.code).not.toBe('operation-in-progress');
    expect(back.error).toBeNull();
    expect(back.world.local.pending).toBeNull();
  });

  it('trả lại việc chưa commit, không trả về nội dung commit HEAD', () => {
    const { world, beforeApply } = stuckWorld();
    const back = run(world, 'git stash pop --abort');

    expect(back.world.local.worktree).toEqual(beforeApply.worktree);
    expect(back.world.local.index).toEqual(beforeApply.index);
    expect(back.world.local.worktree['a.txt']).toEqual([
      '1',
      'việc làm sau khi cất',
      'sửa thêm, chưa add',
    ]);
    // `['1']` = nội dung commit HEAD = hành vi trước 2026-09-14.
    expect(back.world.local.worktree['a.txt']).not.toEqual(['1']);
    expect(back.world.local.index['a.txt']).not.toBe(blobOid(['1']));
  });

  it('mục stash không bị bỏ', () => {
    const { world } = stuckWorld();
    expect(run(world, 'git stash pop --abort').world.local.stash.length).toBe(1);
  });

  it('`git stash apply --abort` đi cùng một đường', () => {
    // Nhánh `'stash'` cố tình không nhớ mình sinh ra từ `pop` hay `apply`, nên
    // hai lối vào phải gỡ được cùng một trạng thái kẹt.
    const { world, beforeApply } = stuckWorld();
    const back = run(world, 'git stash apply --abort');

    expect(back.error).toBeNull();
    expect(back.world.local.pending).toBeNull();
    expect(back.world.local.worktree).toEqual(beforeApply.worktree);
  });
});

describe('`git stash pop --continue` — cùng mối nối, đường kia', () => {
  it('chưa `git add` thì từ chối, và từ chối bằng ĐÚNG mã của mình', () => {
    const { world } = stuckWorld();
    const tooSoon = run(world, 'git stash pop --continue');

    // Không phải `operation-in-progress`: đó sẽ là dấu hiệu lệnh lại rơi vào
    // đường áp-stash-từ-đầu thay vì đường gỡ.
    expect(tooSoon.error?.code).toBe('unmerged-paths');
    expect(tooSoon.world.local.pending?.kind).toBe('stash');
  });

  it('`git add` xong thì xoá pending và GIỮ mục stash lại', () => {
    const { world } = stuckWorld();
    const fixed = wrap(stage(write(world.local, 'a.txt', ['1', 'gộp tay']), 'a.txt'));
    const done = run(fixed, 'git stash pop --continue');

    expect(done.error).toBeNull();
    expect(done.world.local.pending).toBeNull();
    expect(done.world.local.worktree['a.txt']).toEqual(['1', 'gộp tay']);
    // Xung đột thì git KHÔNG tự bỏ mục đi, kể cả với `pop`.
    expect(done.world.local.stash.length).toBe(1);
  });
});

describe('`git stash pop` không cờ vẫn là lệnh áp stash', () => {
  it('đường thường không bị hai cờ mới chắn mất', () => {
    // Đối chứng cho nhánh gộp `case 'pop': case 'apply':` — nếu hai dòng `flag()`
    // đặt sai chỗ thì lệnh không cờ cũng rơi vào đường gỡ và không áp gì cả.
    let repo = commitOne(emptyRepo(), 'a.txt', ['1']);
    repo = write(repo, 'a.txt', ['1', 'việc đang cất']);
    repo = gitStashPush(repo, null, { logicalTime: 2, author: 'Bạn' }).repo;
    expect(repo.worktree['a.txt']).toEqual(['1']);

    const popped = run(wrap(repo), 'git stash pop');
    expect(popped.error).toBeNull();
    expect(popped.world.local.worktree['a.txt']).toEqual(['1', 'việc đang cất']);
    expect(popped.world.local.stash.length).toBe(0);
  });

  it('`git stash apply` không cờ GIỮ mục lại', () => {
    let repo = commitOne(emptyRepo(), 'a.txt', ['1']);
    repo = write(repo, 'a.txt', ['1', 'việc đang cất']);
    repo = gitStashPush(repo, null, { logicalTime: 2, author: 'Bạn' }).repo;

    const applied = run(wrap(repo), 'git stash apply');
    expect(applied.error).toBeNull();
    expect(applied.world.local.worktree['a.txt']).toEqual(['1', 'việc đang cất']);
    expect(applied.world.local.stash.length).toBe(1);
  });
});
