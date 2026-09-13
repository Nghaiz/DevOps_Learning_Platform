import { describe, expect, it } from 'vitest';
import type { FilePath, Lines, Oid, Repo } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import {
  getCommit,
  hasObject,
  makeBlob,
  putObject,
  reachableFrom,
  writeCommit,
  writeContents,
} from '../objects.ts';
import {
  blobOid,
  branchRef,
  emptyRepo,
  headOid,
  readReflog,
  setIndex,
  setWorktree,
} from '../repo.ts';
import {
  advanceHead,
  gitReset,
  gitResetPaths,
  gitRevert,
  gitRevertAbort,
  gitRevertContinue,
  indexFromCommit,
  type MergeFileFn,
  type OpContext,
} from './reset.ts';

/*
 * Bộ dựng repo tại chỗ.
 *
 * Cố ý KHÔNG dùng `world-spec.ts`: lane này phải đỏ vì lỗi của chính nó, không
 * vì lỗi của bộ dựng level. Bốn file test của lane 17.F lặp lại một bộ dựng
 * nhỏ như thế này — một file `ops/test-fixtures.ts` dùng chung sẽ tốt hơn,
 * nhưng nó nằm ngoài danh sách file lane này sở hữu. Xem báo cáo.
 */

const CTX: OpContext = { logicalTime: 100, author: 'Bạn' };

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

/** Mô phỏng `git add <path>` — lane `ops/basic.ts` sở hữu lệnh thật. */
function stage(repo: Repo, path: FilePath): Repo {
  const lines = repo.worktree[path] ?? [];
  const [store, oid] = putObject(repo.objects, makeBlob(lines));
  return setIndex({ ...repo, objects: store }, { ...repo.index, [path]: oid });
}

function oidOfMessage(repo: Repo, message: string): Oid {
  for (const oid of sortedKeys(repo.objects)) {
    if (getCommit(repo.objects, oid)?.message === message) return oid;
  }
  throw new Error(`không tìm thấy commit \`${message}\``);
}

/**
 * Hai commit, rồi một sửa đổi ĐÃ staged.
 *
 * Ba vùng cố tình khác nhau đôi một — đó là điều kiện để chín phép khẳng định
 * dưới đây phân biệt được ba kiểu reset:
 *
 *   c1 (đích)  = { a.txt: ['a1'] }
 *   c2 (HEAD)  = { a.txt: ['a2'], b.txt: ['b1'] }
 *   index+wt   = { a.txt: ['a3'], b.txt: ['b1'] }
 */
function threeZoneRepo(): { readonly repo: Repo; readonly c1: Oid; readonly c2: Oid } {
  let repo = emptyRepo();
  repo = commitFiles(repo, { 'a.txt': ['a1'] }, 'c1', 1);
  const c1 = headOid(repo) ?? '';
  repo = commitFiles(repo, { 'a.txt': ['a2'], 'b.txt': ['b1'] }, 'c2', 2);
  const c2 = headOid(repo) ?? '';
  repo = setWorktree(repo, { 'a.txt': ['a3'], 'b.txt': ['b1'] });
  repo = stage(repo, 'a.txt');
  return { repo, c1, c2 };
}

describe('gitReset — ĐÚNG VÙNG NÀO BỊ CHẠM', () => {
  /*
   * ⛔ Mỗi ô trong bảng của `reset.ts` được khẳng định RIÊNG: ba kiểu × ba vùng
   * = chín phép. Một test chỉ kiểm "ref đã dời" xanh cho cả ba kiểu, tức chứng
   * minh được đúng con số không — đây là misfit MIT, không được đoán.
   */

  it('--soft: dời ref, GIỮ NGUYÊN index, GIỮ NGUYÊN worktree', () => {
    const { repo, c1 } = threeZoneRepo();
    const before = repo;
    const after = gitReset(repo, c1, 'soft', CTX).repo;

    expect(headOid(after)).toBe(c1); // ô 1: ref
    expect(after.index).toEqual(before.index); // ô 2: index
    expect(after.worktree).toEqual(before.worktree); // ô 3: worktree
  });

  it('--mixed: dời ref, ĐẶT LẠI index, GIỮ NGUYÊN worktree', () => {
    const { repo, c1 } = threeZoneRepo();
    const before = repo;
    const after = gitReset(repo, c1, 'mixed', CTX).repo;

    expect(headOid(after)).toBe(c1);
    expect(after.index).toEqual({ 'a.txt': blobOid(['a1']) });
    expect(after.worktree).toEqual(before.worktree);
  });

  it('--hard: dời ref, ĐẶT LẠI index, ĐẶT LẠI worktree', () => {
    const { repo, c1 } = threeZoneRepo();
    const after = gitReset(repo, c1, 'hard', CTX).repo;

    expect(headOid(after)).toBe(c1);
    expect(after.index).toEqual({ 'a.txt': blobOid(['a1']) });
    expect(after.worktree).toEqual({ 'a.txt': ['a1'] });
  });

  /*
   * ĐỐI CHỨNG cho ba ô ở trên. Không có nó thì ba test kia vẫn xanh khi index và
   * worktree TÌNH CỜ bằng nhau ở mọi kiểu — tức khi bộ dựng repo hỏng chứ không
   * phải khi `gitReset` đúng.
   */
  it('ba vùng của repo dựng sẵn khác nhau đôi một', () => {
    const { repo, c1, c2 } = threeZoneRepo();
    expect(headOid(repo)).toBe(c2);
    expect(repo.index).not.toEqual(indexFromCommit(repo, c2));
    expect(repo.worktree).not.toEqual({ 'a.txt': ['a1'] });
    expect(c1).not.toBe(c2);
  });
});

describe('gitReset --hard và bài G26', () => {
  it('commit bị bỏ lại CÒN trong kho nhưng KHÔNG còn với tới được', () => {
    const { repo, c1, c2 } = threeZoneRepo();
    const after = gitReset(repo, c1, 'hard', CTX).repo;

    expect(hasObject(after.objects, c2)).toBe(true);
    expect(reachableFrom(after.objects, [c1]).has(c2)).toBe(false);
    expect([...reachableFrom(after.objects, Object.values(after.refs))]).not.toContain(c2);
  });

  it('reflog của HEAD ghi lại chỗ cũ, nên còn đường quay về', () => {
    const { repo, c1, c2 } = threeZoneRepo();
    const after = gitReset(repo, c1, 'hard', CTX).repo;

    const log = readReflog(after, 'HEAD');
    expect(log[0]?.op).toBe('reset');
    expect(log[0]?.from).toBe(c2); // ⇐ đây là thứ cứu được bài G26
    expect(log[0]?.to).toBe(c1);
  });

  it('giữ lại file chưa track, đúng như git thật', () => {
    const { repo, c1 } = threeZoneRepo();
    const dirty = setWorktree(repo, { ...repo.worktree, 'ghi-chu.txt': ['của riêng tôi'] });
    const after = gitReset(dirty, c1, 'hard', CTX).repo;

    expect(after.worktree).toEqual({ 'a.txt': ['a1'], 'ghi-chu.txt': ['của riêng tôi'] });
  });

  it('từ chối một Oid không phải commit và KHÔNG đổi gì cả', () => {
    const { repo } = threeZoneRepo();
    const result = gitReset(repo, blobOid(['a1']), 'hard', CTX);

    expect(result.error?.code).toBe('not-a-commit');
    expect(result.repo).toBe(repo);
  });
});

describe('gitResetPaths — dạng theo đường dẫn', () => {
  it('chỉ kéo index về, KHÔNG dời ref và KHÔNG đụng worktree', () => {
    const { repo, c2 } = threeZoneRepo();
    const before = repo;
    const after = gitResetPaths(repo, c2, ['a.txt']).repo;

    expect(headOid(after)).toBe(c2);
    expect(after.index).toEqual({ 'a.txt': blobOid(['a2']), 'b.txt': blobOid(['b1']) });
    expect(after.worktree).toEqual(before.worktree);
    expect(readReflog(after, 'HEAD').length).toBe(readReflog(before, 'HEAD').length);
  });

  it('bỏ khỏi index đường dẫn không có ở commit đích', () => {
    const { repo, c1 } = threeZoneRepo();
    const after = gitResetPaths(repo, c1, ['b.txt']).repo;
    expect(Object.hasOwn(after.index, 'b.txt')).toBe(false);
    expect(after.worktree['b.txt']).toEqual(['b1']);
  });

  it('đường dẫn không có ở đâu cả ⇒ lỗi, trạng thái không đổi', () => {
    const { repo, c1 } = threeZoneRepo();
    const result = gitResetPaths(repo, c1, ['khong-ton-tai.txt']);
    expect(result.error?.code).toBe('path-not-found');
    expect(result.repo).toBe(repo);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// revert
// ═══════════════════════════════════════════════════════════════════════════

/** Bản trộn giả luôn báo xung đột, kèm bộ đếm số lần bị gọi. */
function conflictingMerge(): { readonly fn: MergeFileFn; readonly calls: () => number } {
  let calls = 0;
  const fn: MergeFileFn = (input) => {
    calls += 1;
    return {
      merged: ['<<<<<<<', ...input.ours, '=======', ...input.theirs, '>>>>>>>'],
      hunks: [
        { start: 0, base: input.base, ours: input.ours, theirs: input.theirs, conflicted: true },
      ],
      conflicted: true,
    };
  };
  return { fn, calls: () => calls };
}

/*
 * Bản trộn giả cho các ca TẦM THƯỜNG (một bên không đổi so với base). Nó ném
 * ngay khi bị gọi, nên nó vừa là stub vừa là phép khẳng định: `planRevert` phải
 * tự quyết được những ca đó ở mức FILE, không đẩy xuống diff3. Một hiện thực
 * gọi diff3 cho mọi file vẫn cho kết quả đúng — và vẫn phải đỏ ở đây.
 */
const neverMerge: MergeFileFn = () => {
  throw new Error('phép trộn theo dòng không được gọi ở ca tầm thường');
};

function linearRepo(): { readonly repo: Repo; readonly c1: Oid; readonly c2: Oid } {
  let repo = emptyRepo();
  repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
  const c1 = headOid(repo) ?? '';
  repo = commitFiles(repo, { 'a.txt': ['1', '2'] }, 'c2', 2);
  const c2 = headOid(repo) ?? '';
  return { repo, c1, c2 };
}

describe('gitRevert — THÊM commit đảo ngược, không dời con trỏ về quá khứ', () => {
  it('tạo commit mới nối tiếp, commit gốc vẫn nằm trong lịch sử', () => {
    const { repo, c2 } = linearRepo();
    const result = gitRevert(repo, c2, neverMerge, at(3));

    expect(result.error).toBeNull();
    const head = headOid(result.repo) ?? '';
    expect(head).not.toBe(c2);
    const commit = getCommit(result.repo.objects, head);
    expect(commit?.message).toBe('Revert "c2"');
    expect(commit?.parents).toEqual([c2]);
    // Tương phản với `reset`: commit cũ VẪN với tới được.
    expect(reachableFrom(result.repo.objects, [head]).has(c2)).toBe(true);
  });

  it('đưa nội dung, index và worktree về đúng trạng thái trước commit bị đảo', () => {
    const { repo, c2 } = linearRepo();
    const result = gitRevert(repo, c2, neverMerge, at(3));

    expect(result.repo.worktree).toEqual({ 'a.txt': ['1'] });
    expect(result.repo.index).toEqual({ 'a.txt': blobOid(['1']) });
  });

  it('đảo một commit không thay đổi gì ⇒ nothing-to-commit, trạng thái không đổi', () => {
    let repo = emptyRepo();
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c2-rong', 2);
    const target = oidOfMessage(repo, 'c2-rong');

    const result = gitRevert(repo, target, neverMerge, at(3));
    expect(result.error?.code).toBe('nothing-to-commit');
    expect(result.repo).toBe(repo);
  });

  it('từ chối commit merge (thiếu vế: đảo so với nhánh nào)', () => {
    const { repo, c1, c2 } = linearRepo();
    const [store, oid] = writeCommit(repo.objects, {
      tree: getCommit(repo.objects, c2)?.tree ?? '',
      parents: [c2, c1],
      message: 'gộp hai nhánh',
      author: 'Bạn',
      logicalTime: 3,
    });
    const withMerge: Repo = { ...repo, objects: store };

    const result = gitRevert(withMerge, oid, neverMerge, at(4));
    expect(result.error?.code).toBe('bad-usage');
    expect(result.error?.message).toContain('merge');
  });

  it('từ chối khi worktree đang bẩn', () => {
    const { repo, c2 } = linearRepo();
    const dirty = setWorktree(repo, { 'a.txt': ['1', '2', 'sửa dở'] });
    const result = gitRevert(dirty, c2, neverMerge, at(3));

    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo).toBe(dirty);
  });
});

describe('gitRevert khi xung đột — pending op, --continue, --abort', () => {
  function conflicted(): {
    readonly repo: Repo;
    readonly c2: Oid;
    readonly c3: Oid;
    readonly result: ReturnType<typeof gitRevert>;
  } {
    const { repo: base, c2 } = linearRepo();
    const repo = commitFiles(base, { 'a.txt': ['1', '2', '3'] }, 'c3', 3);
    const c3 = headOid(repo) ?? '';
    const result = gitRevert(repo, c2, conflictingMerge().fn, at(4));
    return { repo, c2, c3, result };
  }

  it('đặt pending op đúng và KHÔNG dời HEAD', () => {
    const { c2, c3, result } = conflicted();

    expect(result.error?.code).toBe('merge-conflict');
    expect(result.repo.pending?.kind).toBe('revert');
    const pending = result.repo.pending;
    if (pending === null || pending.kind !== 'revert') throw new Error('thiếu pending revert');
    expect(pending.target).toBe(c2);
    expect(pending.originalHead).toBe(c3);
    expect(pending.conflicts.map((c) => c.path)).toEqual(['a.txt']);
    // Ngoại lệ CÓ TÊN của hợp đồng: lỗi mà trạng thái ĐÃ đổi.
    expect(headOid(result.repo)).toBe(c3);
    expect(result.repo.worktree['a.txt']?.[0]).toBe('<<<<<<<');
  });

  it('--continue trước khi `git add` ⇒ unmerged-paths', () => {
    const { result } = conflicted();
    const again = gitRevertContinue(result.repo, at(5));

    expect(again.error?.code).toBe('unmerged-paths');
    expect(again.repo).toBe(result.repo);
  });

  it('--continue sau khi `git add` tạo commit đảo ngược và xoá pending', () => {
    const { c2, c3, result } = conflicted();
    const resolved = setWorktree(result.repo, { 'a.txt': ['1', '3'] });
    const added = stage(resolved, 'a.txt');

    const done = gitRevertContinue(added, at(5));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();

    const head = headOid(done.repo) ?? '';
    const commit = getCommit(done.repo.objects, head);
    expect(commit?.message).toBe('Revert "c2"');
    expect(commit?.parents).toEqual([c3]);
    expect(reachableFrom(done.repo.objects, [head]).has(c2)).toBe(true);
  });

  it('--abort trả index và worktree về đúng lúc trước khi gõ lệnh', () => {
    const { repo, result } = conflicted();
    const back = gitRevertAbort(result.repo);

    expect(back.error).toBeNull();
    expect(back.repo.pending).toBeNull();
    expect(back.repo.worktree).toEqual(repo.worktree);
    expect(back.repo.index).toEqual(repo.index);
    expect(headOid(back.repo)).toBe(headOid(repo));
  });

  it('--continue / --abort khi repo sạch ⇒ no-operation-in-progress', () => {
    const { repo } = linearRepo();
    expect(gitRevertContinue(repo, CTX).error?.code).toBe('no-operation-in-progress');
    expect(gitRevertAbort(repo).error?.code).toBe('no-operation-in-progress');
  });

  it('bắt đầu revert thứ hai khi đang dở ⇒ operation-in-progress', () => {
    const { c2, result } = conflicted();
    const again = gitRevert(result.repo, c2, conflictingMerge().fn, at(5));

    expect(again.error?.code).toBe('operation-in-progress');
    expect(again.repo).toBe(result.repo);
  });
});

describe('reset trong detached HEAD', () => {
  it('dời chính HEAD chứ không dời branch nào', () => {
    const { repo, c1, c2 } = threeZoneRepo();
    const detached: Repo = { ...repo, head: { type: 'detached', oid: c2 } };
    const after = gitReset(detached, c1, 'hard', CTX).repo;

    expect(after.head).toEqual({ type: 'detached', oid: c1 });
    expect(after.refs[branchRef('main')]).toBe(c2); // branch KHÔNG bị kéo theo
  });
});
