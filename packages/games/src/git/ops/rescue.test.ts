import { describe, expect, it } from 'vitest';
import type { FilePath, Lines, Oid, Repo } from '../contract.ts';
import { getCommit, makeBlob, putObject, writeCommit, writeContents } from '../objects.ts';
import {
  branchRef,
  deleteRef,
  emptyRepo,
  headOid,
  setIndex,
  setWorktree,
} from '../repo.ts';
import { shortOid } from '../hash.ts';
import { liveRoots } from '../predicates.ts';
import { advanceHead, gitReset, indexFromCommit, type OpContext } from './reset.ts';
import { gitStashDrop, gitStashPush } from './stash.ts';
import { gitFsckLostFound, gitReflog, isReachable, unreachableCommits } from './rescue.ts';

function at(logicalTime: number): OpContext {
  return { logicalTime, author: 'Bạn' };
}

function commitFiles(
  repo: Repo,
  contents: Readonly<Record<FilePath, Lines>>,
  message: string,
  time: number,
): Repo {
  const [store, tree] = writeContents(repo.objects, contents);
  const head = headOid(repo);
  const [store2, oid] = writeCommit(store, {
    tree,
    parents: head === null ? [] : [head],
    message,
    author: 'Bạn',
    logicalTime: time,
  });
  const moved = advanceHead({ ...repo, objects: store2 }, oid, {
    op: 'commit',
    message,
    logicalTime: time,
  });
  return setWorktree(setIndex(moved, indexFromCommit(moved, oid)), contents);
}

function stage(repo: Repo, path: FilePath): Repo {
  const lines = repo.worktree[path] ?? [];
  const [store, oid] = putObject(repo.objects, makeBlob(lines));
  return setIndex({ ...repo, objects: store }, { ...repo.index, [path]: oid });
}

/** `main` với hai commit. */
function twoCommits(): { readonly repo: Repo; readonly c1: Oid; readonly c2: Oid } {
  let repo = emptyRepo();
  repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
  const c1 = headOid(repo) ?? '';
  repo = commitFiles(repo, { 'a.txt': ['2'] }, 'c2', 2);
  const c2 = headOid(repo) ?? '';
  return { repo, c1, c2 };
}

// ═══════════════════════════════════════════════════════════════════════════
// unreachableCommits
// ═══════════════════════════════════════════════════════════════════════════

describe('unreachableCommits', () => {
  it('repo bình thường không có commit nào mồ côi', () => {
    const { repo } = twoCommits();
    expect(unreachableCommits(repo)).toEqual([]);
  });

  it('đếm đúng sau `reset --hard` — đây là bài G26', () => {
    const { repo, c1, c2 } = twoCommits();
    const after = gitReset(repo, c1, 'hard', at(3)).repo;

    expect(unreachableCommits(after)).toEqual([c2]);
    expect(isReachable(after, c2)).toBe(false);
    expect(isReachable(after, c1)).toBe(true);
  });

  it('đếm đúng sau khi xoá branch — đây là bài G27', () => {
    const { repo, c2 } = twoCommits();
    const branched = advanceHead(
      { ...repo, head: { type: 'ref', ref: branchRef('feature') } },
      c2,
      { op: 'branch', message: 'tạo feature', logicalTime: 3 },
    );
    const feat = commitFiles(branched, { 'a.txt': ['3'] }, 'c3-tren-feature', 4);
    const c3 = headOid(feat) ?? '';

    // Quay HEAD về main rồi xoá con trỏ feature.
    const backOnMain: Repo = { ...feat, head: { type: 'ref', ref: branchRef('main') } };
    const deleted = deleteRef(backOnMain, branchRef('feature'));

    expect(unreachableCommits(deleted)).toEqual([c3]);
  });

  /*
   * ⛔ CA DỄ SAI NHẤT. `repo.refs` không hề nhắc tới commit này — chỉ HEAD giữ
   * nó. Bỏ `headOid` ra khỏi danh sách gốc thì ô này đỏ, và nếu không có ô này
   * thì lỗi đó chỉ lộ ra ở một level detached HEAD, rất lâu sau.
   */
  it('detached HEAD trỏ vào commit không branch nào trỏ tới ⇒ ĐẾM 0', () => {
    const { repo, c2 } = twoCommits();
    const detached: Repo = { ...repo, head: { type: 'detached', oid: c2 } };
    const extra = commitFiles(detached, { 'a.txt': ['3'] }, 'c3-roi', 3);
    const c3 = headOid(extra) ?? '';

    expect(extra.refs[branchRef('main')]).toBe(c2);
    expect(liveRoots(extra)).toContain(c3);
    expect(unreachableCommits(extra)).toEqual([]);

    // ĐỐI CHỨNG: bỏ HEAD khỏi c3 thì đúng commit đó thành mồ côi.
    const reattached: Repo = { ...extra, head: { type: 'ref', ref: branchRef('main') } };
    expect(unreachableCommits(reattached)).toEqual([c3]);
  });

  it('commit đang được stash giữ KHÔNG bị coi là mồ côi', () => {
    const { repo } = twoCommits();
    const dirty = stage(setWorktree(repo, { 'a.txt': ['sửa dở'] }), 'a.txt');
    const pushed = gitStashPush(dirty, null, at(3)).repo;

    expect(unreachableCommits(pushed)).toEqual([]);
  });

  it('mục stash bị drop thì commit của nó thành mồ côi — bài G30', () => {
    const { repo } = twoCommits();
    const dirty = stage(setWorktree(repo, { 'a.txt': ['sửa dở'] }), 'a.txt');
    const pushed = gitStashPush(dirty, null, at(3)).repo;
    const stashOid: Oid = pushed.stash[0]?.oid ?? '';

    const dropped = gitStashDrop(pushed, 0).repo;
    expect(unreachableCommits(dropped)).toContain(stashOid);
  });

  it('commit mà một pending op đang neo KHÔNG bị coi là mồ côi', () => {
    const { repo, c1, c2 } = twoCommits();
    const reset = gitReset(repo, c1, 'hard', at(3)).repo;
    const pending: Repo = {
      ...reset,
      pending: { kind: 'revert', target: c2, originalHead: c2, conflicts: [] },
    };

    expect(unreachableCommits(pending)).toEqual([]);
  });

  it('trả MẢNG đã sắp, không trả Set', () => {
    const { repo, c1 } = twoCommits();
    const after = gitReset(repo, c1, 'hard', at(3)).repo;
    const result = unreachableCommits(after);

    expect(Array.isArray(result)).toBe(true);
    expect([...result]).toEqual([...result].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// reflog
// ═══════════════════════════════════════════════════════════════════════════

describe('gitReflog', () => {
  it('in mới nhất trước, đúng định dạng `<oid> <ref>@{n}: <op>: <message>`', () => {
    const { repo, c1 } = twoCommits();
    const after = gitReset(repo, c1, 'hard', at(3)).repo;

    const result = gitReflog(after, null);
    expect(result.error).toBeNull();
    expect(result.output[0]?.text).toMatch(/^[0-9a-f]{7} HEAD@\{0\}: reset: /);
    expect(result.output[1]?.text).toMatch(/^[0-9a-f]{7} HEAD@\{1\}: commit: /);
  });

  it('đọc reflog của một ref cụ thể', () => {
    const { repo } = twoCommits();
    const result = gitReflog(repo, branchRef('main'));

    expect(result.error).toBeNull();
    expect(result.output[0]?.text).toContain('main@{0}');
  });

  /*
   * Bài G27, sau khi lead sửa `deleteRef` ngày 2026-09-14 để nó xoá LUÔN reflog
   * riêng của nhánh — đúng như git thật xoá `.git/logs/refs/heads/<nhánh>`.
   *
   * Ô này khẳng định hai vế, và vế thứ hai mới là bài học: hỏi thẳng nhánh đã xoá
   * cho ra câu trả lời RỖNG (không phải lỗi) kèm chỉ đường, còn đường cứu THẬT là
   * reflog của HEAD, nơi commit cuối của nhánh vẫn còn nguyên.
   */
  it('nhánh đã xoá: reflog riêng mất theo, HEAD vẫn nhớ đường về', () => {
    const { repo, c2 } = twoCommits();
    const branched = advanceHead(
      { ...repo, head: { type: 'ref', ref: branchRef('feature') } },
      c2,
      { op: 'branch', message: 'tạo feature', logicalTime: 3 },
    );
    const feat = commitFiles(branched, { 'a.txt': ['3'] }, 'c3-tren-feature', 4);
    const c3 = headOid(feat) ?? '';
    const backOnMain: Repo = { ...feat, head: { type: 'ref', ref: branchRef('main') } };
    const deleted = deleteRef(backOnMain, branchRef('feature'));

    // Vế 1 — hỏi thẳng nhánh đã xoá: rỗng, KHÔNG phải lỗi, và có chỉ đường.
    const own = gitReflog(deleted, branchRef('feature'));
    expect(own.error).toBeNull();
    expect(own.output.some((l) => l.text.includes('git reflog'))).toBe(true);

    // Vế 2 — ĐƯỜNG CỨU THẬT. Không có vế này thì G27 không giải được.
    const viaHead = gitReflog(deleted, null);
    expect(viaHead.error).toBeNull();
    expect(viaHead.output.some((l) => l.text.includes(shortOid(c3)))).toBe(true);
  });

  it('ref chưa từng tồn tại: vẫn không phải lỗi, nhưng có gợi ý tên gần đúng', () => {
    const { repo } = twoCommits();
    const result = gitReflog(repo, branchRef('mian'));

    expect(result.error).toBeNull();
    expect(result.output.some((l) => l.text.includes('`main`'))).toBe(true);
    expect(result.repo).toBe(repo);
  });

  it('ref có thật nhưng chưa dịch chuyển lần nào ⇒ không phải lỗi', () => {
    const repo = emptyRepo();
    const result = gitReflog(repo, null);
    expect(result.error).toBeNull();
    expect(result.output.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// fsck
// ═══════════════════════════════════════════════════════════════════════════

describe('gitFsckLostFound', () => {
  it('repo sạch thì nói rõ là không có gì mồ côi', () => {
    const { repo } = twoCommits();
    const result = gitFsckLostFound(repo);
    expect(result.error).toBeNull();
    expect(result.output.some((l) => l.text.includes('dangling'))).toBe(false);
  });

  it('liệt kê commit mồ côi kèm message, và Oid ĐẦY ĐỦ để dán lại được', () => {
    const { repo, c1, c2 } = twoCommits();
    const after = gitReset(repo, c1, 'hard', at(3)).repo;

    const result = gitFsckLostFound(after);
    const text = result.output.map((l) => l.text).join('\n');
    expect(text).toContain(`dangling commit ${c2}`);
    expect(text).toContain('c2');
    expect(text).toContain(`git branch cuu-ho ${c2}`);
  });
});

describe('liveRoots — SSOT của "với tới được", predicates.ts sở hữu', () => {
  it('gom đủ ref, HEAD, stash và pending.originalHead', () => {
    const { repo, c1, c2 } = twoCommits();
    const dirty = stage(setWorktree(repo, { 'a.txt': ['sửa dở'] }), 'a.txt');
    const pushed = gitStashPush(dirty, null, at(3)).repo;
    const withPending: Repo = {
      ...pushed,
      pending: { kind: 'revert', target: c1, originalHead: c2, conflicts: [] },
    };

    const roots = liveRoots(withPending);
    expect(roots).toContain(c2); // ref main + HEAD + pending.originalHead
    expect(roots).toContain(pushed.stash[0]?.oid ?? ''); // stash
    expect([...roots]).toEqual([...roots].sort());
    /*
     * KHOANG HO DA BIET: `liveRoots` khong gom `pending.target` (va `merge.theirs`,
     * `rebase.onto`, `cherry-pick.picks`, `repo.bisect`). Khang dinh nguoc o day de
     * ai sua `liveRoots` se thay ngay o nay va doc duoc ly do - xem bao cao 17.F.
     */
    expect(roots).not.toContain(c1);
  });

  it('reflog KHÔNG phải gốc — cố ý lệch khỏi git thật', () => {
    const { repo, c1, c2 } = twoCommits();
    const after = gitReset(repo, c1, 'hard', at(3)).repo;

    // c2 nằm đầy đủ trong reflog của HEAD…
    expect(after.reflog['HEAD']?.[0]?.from).toBe(c2);
    // …nhưng vẫn được coi là mồ côi. Không có điều này thì vị từ chấm bài
    // `commitUnreachable` luôn sai và cả chương 3 mất điều kiện thắng.
    expect(liveRoots(after)).not.toContain(c2);
    expect(unreachableCommits(after)).toEqual([c2]);
  });

  it('getCommit trả null cho blob nên fsck không liệt kê blob mồ côi', () => {
    const { repo, c1 } = twoCommits();
    const after = gitReset(repo, c1, 'hard', at(3)).repo;
    for (const oid of unreachableCommits(after)) {
      expect(getCommit(after.objects, oid)).not.toBeNull();
    }
  });
});
