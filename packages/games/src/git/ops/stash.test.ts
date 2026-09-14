import { describe, expect, it } from 'vitest';
import type { FilePath, Lines, Oid, Repo } from '../contract.ts';
import { getCommit, makeBlob, putObject, writeCommit, writeContents } from '../objects.ts';
import { blobOid, emptyRepo, headOid, setIndex, setWorktree } from '../repo.ts';
import {
  advanceHead,
  indexFromCommit,
  type MergeFileFn,
  type OpContext,
} from './reset.ts';
import {
  gitStashApply,
  gitStashApplyAbort,
  gitStashApplyContinue,
  gitStashDrop,
  gitStashList,
  gitStashPop,
  gitStashPush,
  parseStashIndex,
} from './stash.ts';

/*
 * Bản trộn giả cho các ca TẦM THƯỜNG (một bên không đổi so với base). Nó ném
 * ngay khi bị gọi, nên nó vừa là stub vừa là phép khẳng định: vòng tròn
 * push → pop trên một worktree không ai đụng vào phải giải được ở mức FILE,
 * không cần tới diff3. Một hiện thực gọi diff3 cho mọi file vẫn cho kết quả
 * đúng — và vẫn phải đỏ ở đây.
 */
const neverMerge: MergeFileFn = () => {
  throw new Error('phép trộn theo dòng không được gọi ở ca tầm thường');
};

/** Bản trộn giả luôn báo xung đột, dựng nội dung có marker. */
const alwaysConflict: MergeFileFn = (input) => ({
  merged: ['<<<<<<<', ...input.ours, '=======', ...input.theirs, '>>>>>>>'],
  hunks: [
    { start: 0, base: input.base, ours: input.ours, theirs: input.theirs, conflicted: true },
  ],
  conflicted: true,
});

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

function write(repo: Repo, path: FilePath, lines: Lines): Repo {
  return setWorktree(repo, { ...repo.worktree, [path]: lines });
}

/** Một commit, một sửa đổi đã staged, và một file CHƯA track. */
function dirtyRepo(): Repo {
  let repo = emptyRepo();
  repo = commitFiles(repo, { 'a.txt': ['1'], 'b.txt': ['x'] }, 'c1', 1);
  repo = write(repo, 'a.txt', ['2']);
  repo = stage(repo, 'a.txt');
  repo = write(repo, 'ghi-chu.txt', ['chưa track']);
  return repo;
}

describe('gitStashPush', () => {
  it('cất xong thì worktree về đúng HEAD, nhưng file chưa track ở lại', () => {
    const repo = dirtyRepo();
    const result = gitStashPush(repo, null, at(2));

    expect(result.error).toBeNull();
    expect(result.repo.stash.length).toBe(1);
    expect(result.repo.worktree).toEqual({
      'a.txt': ['1'],
      'b.txt': ['x'],
      'ghi-chu.txt': ['chưa track'],
    });
    expect(result.repo.index).toEqual({ 'a.txt': blobOid(['1']), 'b.txt': blobOid(['x']) });
  });

  /*
   * Đây là điều kiện của bài G30, không phải chi tiết hiện thực: một mục stash
   * chỉ cứu lại được bằng `fsck` nếu nó là commit THẬT trong kho.
   */
  it('mỗi mục stash là một commit thật trong kho', () => {
    const result = gitStashPush(dirtyRepo(), null, at(2));
    const entry = result.repo.stash[0];
    expect(entry).toBeDefined();
    expect(getCommit(result.repo.objects, entry?.oid ?? '')).not.toBeNull();
  });

  it('commit stash mang ảnh chụp INDEX ở cha thứ hai', () => {
    const result = gitStashPush(dirtyRepo(), null, at(2));
    const stashCommit = getCommit(result.repo.objects, result.repo.stash[0]?.oid ?? '');
    expect(stashCommit?.parents.length).toBe(2);

    const indexCommit = getCommit(result.repo.objects, stashCommit?.parents[1] ?? '');
    expect(indexCommit).not.toBeNull();
    expect(indexFromCommit(result.repo, stashCommit?.parents[1] ?? null)).toEqual({
      'a.txt': blobOid(['2']),
      'b.txt': blobOid(['x']),
    });
  });

  it('worktree sạch ⇒ KHÔNG phải lỗi, chỉ là không có gì để cất', () => {
    let repo = emptyRepo();
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
    const result = gitStashPush(repo, null, at(2));

    expect(result.error).toBeNull();
    expect(result.repo.stash.length).toBe(0);
    expect(result.output.length).toBeGreaterThan(0);
  });

  it('chưa có commit nào ⇒ từ chối, trạng thái không đổi', () => {
    const repo = write(emptyRepo(), 'a.txt', ['1']);
    const result = gitStashPush(repo, null, at(1));

    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo).toBe(repo);
  });

  it('nhận tên do người chơi đặt', () => {
    const result = gitStashPush(dirtyRepo(), 'đang sửa dở phần login', at(2));
    expect(result.repo.stash[0]?.message).toBe('đang sửa dở phần login');
    expect(result.repo.stash[0]?.branch).toBe('main');
  });
});

describe('gitStashPop — vòng tròn push rồi pop', () => {
  it('worktree và index về ĐÚNG như trước khi cất', () => {
    const before = dirtyRepo();
    const pushed = gitStashPush(before, null, at(2)).repo;
    const popped = gitStashPop(pushed, 0, neverMerge);

    expect(popped.error).toBeNull();
    expect(popped.repo.worktree).toEqual(before.worktree);
    expect(popped.repo.index).toEqual(before.index);
    expect(popped.repo.stash.length).toBe(0);
  });

  /*
   * Ô này là lý do stash phải là HAI commit. Với một commit duy nhất giữ ảnh
   * chụp worktree, index sẽ phục hồi bằng worktree và test trên kia vẫn xanh —
   * vì ở đó index và worktree tình cờ bằng nhau.
   */
  it('phục hồi index và worktree RIÊNG khi hai vùng đang khác nhau', () => {
    let repo = emptyRepo();
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
    repo = write(repo, 'a.txt', ['2']);
    repo = stage(repo, 'a.txt'); // index = ['2']
    repo = write(repo, 'a.txt', ['3']); // worktree = ['3'], chưa staged
    const before = repo;

    const pushed = gitStashPush(repo, null, at(2)).repo;
    const popped = gitStashPop(pushed, 0, neverMerge).repo;

    expect(popped.worktree['a.txt']).toEqual(['3']);
    expect(popped.index['a.txt']).toBe(blobOid(['2']));
    expect(popped.worktree).toEqual(before.worktree);
    expect(popped.index).toEqual(before.index);
  });

  it('stash trống ⇒ stash-empty, trạng thái không đổi', () => {
    const repo = dirtyRepo();
    const result = gitStashPop(repo, 0, neverMerge);
    expect(result.error?.code).toBe('stash-empty');
    expect(result.repo).toBe(repo);
  });

  it('chỉ số ngoài khoảng ⇒ bad-usage', () => {
    const pushed = gitStashPush(dirtyRepo(), null, at(2)).repo;
    const result = gitStashPop(pushed, 3, neverMerge);
    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo).toBe(pushed);
  });
});

describe('gitStashApply — áp lại nhưng GIỮ mục', () => {
  it('khác pop đúng ở chỗ mục vẫn còn trong stash', () => {
    const before = dirtyRepo();
    const pushed = gitStashPush(before, null, at(2)).repo;

    const applied = gitStashApply(pushed, 0, neverMerge).repo;
    expect(applied.stash.length).toBe(1);
    expect(applied.worktree).toEqual(before.worktree);

    const popped = gitStashPop(pushed, 0, neverMerge).repo;
    expect(popped.stash.length).toBe(0);
  });
});

describe('gitStashList / gitStashDrop', () => {
  it('liệt kê mới nhất trước, đánh số từ stash@{0}', () => {
    let repo = dirtyRepo();
    repo = gitStashPush(repo, 'lần một', at(2)).repo;
    repo = write(repo, 'b.txt', ['y']);
    repo = gitStashPush(repo, 'lần hai', at(3)).repo;

    const listed = gitStashList(repo);
    expect(listed.output[0]?.text).toContain('stash@{0}');
    expect(listed.output[0]?.text).toContain('lần hai');
    expect(listed.output[1]?.text).toContain('stash@{1}');
    expect(listed.output[1]?.text).toContain('lần một');
  });

  it('stash trống thì list vẫn không phải lỗi', () => {
    const result = gitStashList(emptyRepo());
    expect(result.error).toBeNull();
  });

  it('drop bỏ mục nhưng KHÔNG xoá commit khỏi kho — điều kiện của bài G30', () => {
    const pushed = gitStashPush(dirtyRepo(), null, at(2)).repo;
    const oid: Oid = pushed.stash[0]?.oid ?? '';

    const dropped = gitStashDrop(pushed, 0);
    expect(dropped.error).toBeNull();
    expect(dropped.repo.stash.length).toBe(0);
    expect(getCommit(dropped.repo.objects, oid)).not.toBeNull();
  });

  it('drop trên stash trống ⇒ stash-empty', () => {
    const repo = dirtyRepo();
    expect(gitStashDrop(repo, 0).error?.code).toBe('stash-empty');
  });
});

describe('áp stash khi worktree đã đổi — phép trộn ba ngả thật', () => {
  /*
   * Bản đầu của `stash.ts` chỉ PHỦ stash lên worktree. Nhóm test này là thứ
   * chứng minh cách đó sai: với phép phủ, ô dưới đây xanh mà thay đổi cục bộ
   * biến mất không dấu vết.
   */
  function conflicted(): { readonly before: Repo; readonly popped: ReturnType<typeof gitStashPop> } {
    let repo = emptyRepo();
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
    repo = write(repo, 'a.txt', ['1', 'việc đang cất']);
    const pushed = gitStashPush(repo, null, at(2)).repo;
    // Sau khi cất, sửa CHÍNH file đó theo một hướng khác.
    const diverged = write(pushed, 'a.txt', ['1', 'việc làm sau khi cất']);
    return { before: diverged, popped: gitStashPop(diverged, 0, alwaysConflict) };
  }

  it('đặt pending kind `stash` và GIỮ mục lại, dù là `pop`', () => {
    const { popped } = conflicted();

    expect(popped.error?.code).toBe('merge-conflict');
    expect(popped.repo.pending?.kind).toBe('stash');
    // ⛔ `pop` xung đột KHÔNG bỏ mục — đúng như git thật.
    expect(popped.repo.stash.length).toBe(1);
    expect(popped.repo.worktree['a.txt']?.[0]).toBe('<<<<<<<');
  });

  it('index GIỮ NGUYÊN ở ca xung đột, nên `--continue` đỏ cho tới khi `git add`', () => {
    const { before, popped } = conflicted();
    expect(popped.repo.index).toEqual(before.index);

    const tooSoon = gitStashApplyContinue(popped.repo);
    expect(tooSoon.error?.code).toBe('unmerged-paths');
    expect(tooSoon.repo).toBe(popped.repo);
  });

  it('`--continue` sau khi `git add` xoá pending và nhắc tự drop', () => {
    const { popped } = conflicted();
    const resolved = stage(write(popped.repo, 'a.txt', ['1', 'gộp tay']), 'a.txt');

    const done = gitStashApplyContinue(resolved);
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(done.repo.stash.length).toBe(1);
    expect(done.output.some((l) => l.text.includes('git stash drop'))).toBe(true);
  });

  it('`--abort` xoá pending, giữ mục stash, và NÓI RÕ là mất phần chưa commit', () => {
    const { popped } = conflicted();
    const back = gitStashApplyAbort(popped.repo);

    expect(back.error).toBeNull();
    expect(back.repo.pending).toBeNull();
    expect(back.repo.stash.length).toBe(1);
    expect(back.repo.worktree).toEqual({ 'a.txt': ['1'] });
    expect(back.output.some((l) => l.tone === 'warn')).toBe(true);
  });

  it('`--continue` / `--abort` khi không có gì dở dang ⇒ no-operation-in-progress', () => {
    const repo = dirtyRepo();
    expect(gitStashApplyContinue(repo).error?.code).toBe('no-operation-in-progress');
    expect(gitStashApplyAbort(repo).error?.code).toBe('no-operation-in-progress');
  });

  /*
   * ⛔ ĐỐI CHỨNG CHO VIỆC NỐI DÂY. Mọi ô khác trong nhóm này tiêm `alwaysConflict`,
   * nên chúng xanh kể cả khi `gitStashPop` mặc định KHÔNG nối vào phép trộn thật.
   * Ô này không truyền gì cả: nó chạy đúng đường mà `dispatch.ts` chạy, và nó đỏ
   * nếu giá trị mặc định bị gỡ hay trỏ vào một bản rút gọn.
   */
  it('không truyền phép trộn ⇒ vẫn dùng diff3 THẬT và vẫn phát hiện xung đột', () => {
    let repo = emptyRepo();
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
    repo = write(repo, 'a.txt', ['1', 'việc đang cất']);
    const pushed = gitStashPush(repo, null, at(2)).repo;
    const diverged = write(pushed, 'a.txt', ['1', 'việc làm sau khi cất']);

    const popped = gitStashPop(diverged, 0);

    expect(popped.error?.code).toBe('merge-conflict');
    expect(popped.repo.pending?.kind).toBe('stash');
    // Marker do `renderConflict` thật sinh ra, không phải do stub của test.
    expect(popped.repo.worktree['a.txt']?.some((l) => l.startsWith('<<<<<<<'))).toBe(true);
    expect(popped.repo.worktree['a.txt']?.some((l) => l.startsWith('>>>>>>>'))).toBe(true);
  });

  it('hai bên sửa GIỐNG HỆT nhau ⇒ diff3 thật KHÔNG báo xung đột', () => {
    let repo = emptyRepo();
    repo = commitFiles(repo, { 'a.txt': ['1'] }, 'c1', 1);
    repo = write(repo, 'a.txt', ['1', 'cùng một dòng']);
    const pushed = gitStashPush(repo, null, at(2)).repo;
    const same = write(pushed, 'a.txt', ['1', 'cùng một dòng']);

    const popped = gitStashPop(same, 0);
    expect(popped.error).toBeNull();
    expect(popped.repo.worktree['a.txt']).toEqual(['1', 'cùng một dòng']);
  });

  it('file chưa track KHÔNG bị đụng tới khi áp', () => {
    const before = dirtyRepo();
    const pushed = gitStashPush(before, null, at(2)).repo;
    const popped = gitStashPop(pushed, 0, neverMerge).repo;
    expect(popped.worktree['ghi-chu.txt']).toEqual(['chưa track']);
  });
});

describe('parseStashIndex', () => {
  it('đọc cả ba dạng người chơi gõ', () => {
    expect(parseStashIndex(null)).toBe(0);
    expect(parseStashIndex('')).toBe(0);
    expect(parseStashIndex('stash@{2}')).toBe(2);
    expect(parseStashIndex('3')).toBe(3);
  });

  it('trả null cho thứ không đọc được', () => {
    expect(parseStashIndex('stash@{x}')).toBeNull();
    expect(parseStashIndex('main')).toBeNull();
    expect(parseStashIndex('stash@{1}x')).toBeNull();
  });
});
