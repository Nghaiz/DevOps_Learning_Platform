/**
 * Test cho `rebase.ts`.
 *
 * Khẳng định đắt nhất ở đây là **hai vế rời nhau** sau mỗi lượt rebase:
 *
 *  1. commit cũ **CÒN** trong `objects` (`hasObject`);
 *  2. commit cũ **KHÔNG** còn với tới được từ ref nào.
 *
 * Chỉ kiểm vế 2 thì một hiện thực lỡ tay xoá object vẫn xanh — và cả chương 3
 * (reflog, cứu hộ) sẽ sụp mà không test nào đỏ. Chỉ kiểm vế 1 thì một hiện thực
 * quên dời branch cũng xanh. Hai vế phải cùng có mặt.
 *
 * Ba chỗ còn lại dễ sai và đắt:
 *
 *  - `squash`/`fixup` nối SAU commit trước thay vì THAY THẾ nó ⇒ ra N commit
 *    thay vì N-1, và người chơi thấy đúng cái họ vừa bảo git gộp đi;
 *  - branch dịch chuyển trong lúc rebase ⇒ `--abort` phải kéo ref ngược, và
 *    `git log` lúc đang kẹt nói dối về chỗ người chơi đang đứng;
 *  - hai kiểu dừng (xung đột / `edit`) dùng chung `remaining` mà không phân biệt
 *    ⇒ `--continue` áp một commit hai lần.
 */

import { describe, expect, it } from 'vitest';
import type { Oid, RebaseStep, Repo, WorldSpec } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { commitsBetween, firstParentChain, getCommit, hasObject, reachableFrom } from '../objects.ts';
import { liveRoots } from '../predicates.ts';
import { headOid } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import type { OpContext } from './reset.ts';
import {
  defaultRebaseSteps,
  gitRebase,
  rebaseAbort,
  rebaseContinue,
  rebaseRange,
  rebaseSkip,
} from './rebase.ts';

// ── Giàn giáo ───────────────────────────────────────────────────────────────

function repoOf(spec: WorldSpec): Repo {
  return buildWorld(spec, 1).local;
}

function ctx(logicalTime: number): OpContext {
  return { logicalTime, author: 'Bạn' };
}

function refOid(repo: Repo, shortName: string): Oid {
  const oid = repo.refs[`refs/heads/${shortName}`];
  if (oid === undefined) throw new Error(`không có branch '${shortName}'`);
  return oid;
}

function commitCount(repo: Repo): number {
  return sortedKeys(repo.objects).filter((oid) => getCommit(repo.objects, oid) !== null).length;
}

function isReachable(repo: Repo, oid: Oid): boolean {
  return reachableFrom(repo.objects, liveRoots(repo)).has(oid);
}

function messages(repo: Repo, from: Oid | null): readonly string[] {
  return firstParentChain(repo.objects, from).map(
    (oid) => getCommit(repo.objects, oid)?.message ?? '?',
  );
}

/**
 * `main` tiến một bước, `feature` tách sớm hơn và có hai commit riêng.
 * HEAD đứng ở `feature` — đúng tư thế trước một `git rebase main`.
 */
function forked(): Repo {
  return repoOf({
    commits: [
      { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
      { id: 'm1', parents: ['c0'], message: 'main tiến', changes: { 'main.txt': 'm' } },
      { id: 'f1', parents: ['c0'], message: 'feature 1', changes: { 'f1.txt': 'a' } },
      { id: 'f2', parents: ['f1'], message: 'feature 2', changes: { 'f2.txt': 'b' } },
    ],
    branches: { main: 'm1', feature: 'f2' },
    head: 'feature',
  });
}

function ontoMain(repo: Repo): { onto: Oid; ontoLabel: string } {
  return { onto: refOid(repo, 'main'), ontoLabel: 'main' };
}

// ═══════════════════════════════════════════════════════════════════════════
// KHOẢNG ÁP LẠI
// ═══════════════════════════════════════════════════════════════════════════

describe('rebaseRange', () => {
  it('chỉ lấy commit RIÊNG của nhánh, không lấy phần chung', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));

    expect(range).toHaveLength(2);
    expect(messages(repo, range[1] ?? null)[0]).toBe('feature 2');
    expect(range.includes(refOid(repo, 'main'))).toBe(false);
  });

  it('kịch bản `-i` mặc định là `pick` tất, đúng thứ tự cũ', () => {
    const repo = forked();
    const steps = defaultRebaseSteps(repo, ontoMain(repo));
    expect(steps.map((s) => s.action)).toEqual(['pick', 'pick']);
    expect(steps.map((s) => s.oid)).toEqual([...rebaseRange(repo, ontoMain(repo))]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REBASE THẲNG
// ═══════════════════════════════════════════════════════════════════════════

describe('rebase thẳng', () => {
  it('sinh Oid MỚI cho mọi commit được áp lại', () => {
    const repo = forked();
    const oldF1 = rebaseRange(repo, ontoMain(repo))[0] ?? '';
    const oldF2 = rebaseRange(repo, ontoMain(repo))[1] ?? '';

    const result = gitRebase(repo, ontoMain(repo), ctx(10));
    expect(result.error).toBeNull();

    const chain = firstParentChain(result.repo.objects, headOid(result.repo));
    expect(chain).not.toContain(oldF1);
    expect(chain).not.toContain(oldF2);
    expect(messages(result.repo, headOid(result.repo))).toEqual([
      'feature 2',
      'feature 1',
      'main tiến',
      'base',
    ]);
  });

  it('⛔ commit cũ CÒN trong kho VÀ KHÔNG còn với tới được — hai vế rời nhau', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const oldF1 = range[0] ?? '';
    const oldF2 = range[1] ?? '';

    const after = gitRebase(repo, ontoMain(repo), ctx(10)).repo;

    // vế 1 — lưu trữ
    expect(hasObject(after.objects, oldF1)).toBe(true);
    expect(hasObject(after.objects, oldF2)).toBe(true);
    // vế 2 — reachability
    expect(isReachable(after, oldF1)).toBe(false);
    expect(isReachable(after, oldF2)).toBe(false);
  });

  it('branch được kéo tới con trỏ mới và HEAD gắn lại vào branch', () => {
    const repo = forked();
    const after = gitRebase(repo, ontoMain(repo), ctx(10)).repo;

    expect(after.head).toEqual({ type: 'ref', ref: 'refs/heads/feature' });
    expect(refOid(after, 'feature')).toBe(headOid(after));
    expect(refOid(after, 'feature')).not.toBe(refOid(repo, 'feature'));
    // `main` không đụng tới.
    expect(refOid(after, 'main')).toBe(refOid(repo, 'main'));
  });

  it('worktree mang nội dung của cả hai nhánh sau khi áp xong', () => {
    const after = gitRebase(forked(), ontoMain(forked()), ctx(10)).repo;
    expect(Object.hasOwn(after.worktree, 'main.txt')).toBe(true);
    expect(Object.hasOwn(after.worktree, 'f1.txt')).toBe(true);
    expect(Object.hasOwn(after.worktree, 'f2.txt')).toBe(true);
  });

  it('nhánh không có commit riêng ⇒ fast-forward, không tạo object nào', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main tiến', changes: { 'b.txt': 'y' } },
      ],
      branches: { main: 'm1', feature: 'c0' },
      head: 'feature',
    });
    const before = commitCount(repo);
    const result = gitRebase(repo, ontoMain(repo), ctx(10));

    expect(result.error).toBeNull();
    expect(commitCount(result.repo)).toBe(before);
    expect(refOid(result.repo, 'feature')).toBe(refOid(repo, 'main'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `rebase -i`
// ═══════════════════════════════════════════════════════════════════════════

describe('rebase -i', () => {
  it('`squash` cho ra đúng N-1 commit, message được nối lại', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const steps: readonly RebaseStep[] = [
      { action: 'pick', oid: range[0] ?? '' },
      { action: 'squash', oid: range[1] ?? '' },
    ];

    const after = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10)).repo;
    const onTop = commitsBetween(after.objects, refOid(after, 'main'), headOid(after) ?? '');

    expect(range).toHaveLength(2);
    expect(onTop).toHaveLength(1); // N-1
    const squashed = getCommit(after.objects, headOid(after) ?? '');
    expect(squashed?.message).toContain('feature 1');
    expect(squashed?.message).toContain('feature 2');
    // Nội dung của cả hai commit vẫn có mặt.
    expect(Object.hasOwn(after.worktree, 'f1.txt')).toBe(true);
    expect(Object.hasOwn(after.worktree, 'f2.txt')).toBe(true);
  });

  it('`fixup` cũng cho N-1 commit nhưng VỨT message của commit bị gộp', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const steps: readonly RebaseStep[] = [
      { action: 'pick', oid: range[0] ?? '' },
      { action: 'fixup', oid: range[1] ?? '' },
    ];

    const after = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10)).repo;
    const onTop = commitsBetween(after.objects, refOid(after, 'main'), headOid(after) ?? '');

    expect(onTop).toHaveLength(1);
    expect(getCommit(after.objects, headOid(after) ?? '')?.message).toBe('feature 1');
    expect(Object.hasOwn(after.worktree, 'f2.txt')).toBe(true);
  });

  it('`drop` cho N-1 commit, và commit bị bỏ VẪN nằm trong kho', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const dropped = range[1] ?? '';
    const steps: readonly RebaseStep[] = [
      { action: 'pick', oid: range[0] ?? '' },
      { action: 'drop', oid: dropped },
    ];

    const after = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10)).repo;
    const onTop = commitsBetween(after.objects, refOid(after, 'main'), headOid(after) ?? '');

    expect(onTop).toHaveLength(1);
    expect(hasObject(after.objects, dropped)).toBe(true);
    expect(isReachable(after, dropped)).toBe(false);
    // Thay đổi của commit bị bỏ cũng biến khỏi worktree.
    expect(Object.hasOwn(after.worktree, 'f2.txt')).toBe(false);
    expect(Object.hasOwn(after.worktree, 'f1.txt')).toBe(true);
  });

  it('`reword` đổi message mà giữ nguyên nội dung', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const steps: readonly RebaseStep[] = [
      { action: 'pick', oid: range[0] ?? '' },
      { action: 'reword', oid: range[1] ?? '', message: 'tên mới hẳn' },
    ];

    const after = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10)).repo;
    expect(getCommit(after.objects, headOid(after) ?? '')?.message).toBe('tên mới hẳn');
    expect(Object.hasOwn(after.worktree, 'f2.txt')).toBe(true);
  });

  it('`squash` ở bước ĐẦU TIÊN bị từ chối, trạng thái không đổi', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const steps: readonly RebaseStep[] = [{ action: 'squash', oid: range[0] ?? '' }];

    const result = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10));
    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo.refs).toEqual(repo.refs);
    expect(result.repo.head).toEqual(repo.head);
  });

  it('kịch bản nhắc commit ngoài khoảng bị từ chối', () => {
    const repo = forked();
    const steps: readonly RebaseStep[] = [{ action: 'pick', oid: refOid(repo, 'main') }];

    const result = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10));
    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo).toBe(repo);
  });

  it('`edit` dừng lại với `conflicts` RỖNG — dừng theo lệnh, không phải kẹt', () => {
    const repo = forked();
    const range = rebaseRange(repo, ontoMain(repo));
    const steps: readonly RebaseStep[] = [
      { action: 'edit', oid: range[0] ?? '' },
      { action: 'pick', oid: range[1] ?? '' },
    ];

    const stopped = gitRebase(repo, { ...ontoMain(repo), steps }, ctx(10));
    expect(stopped.error).toBeNull();
    expect(stopped.repo.pending?.kind).toBe('rebase');
    const pending = stopped.repo.pending;
    if (pending?.kind !== 'rebase') throw new Error('pending phải là rebase');
    expect(pending.conflicts).toHaveLength(0);
    // Bước `edit` ĐÃ áp xong nên không nằm trong `remaining`.
    expect(pending.remaining).toHaveLength(1);
    expect(pending.remaining[0]?.oid).toBe(range[1]);

    const done = rebaseContinue(stopped.repo, ctx(11));
    expect(done.error).toBeNull();
    expect(messages(done.repo, headOid(done.repo))).toEqual([
      'feature 2',
      'feature 1',
      'main tiến',
      'base',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// XUNG ĐỘT GIỮA CHỪNG
// ═══════════════════════════════════════════════════════════════════════════

describe('rebase gặp xung đột', () => {
  /** `f1` và `m1` cùng sửa `a.txt`, nên bước đầu của rebase chắc chắn kẹt. */
  function clashing(): Repo {
    return repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main sửa a', changes: { 'a.txt': 'x main' } },
        { id: 'f1', parents: ['c0'], message: 'feature sửa a', changes: { 'a.txt': 'x feature' } },
        { id: 'f2', parents: ['f1'], message: 'feature thêm b', changes: { 'b.txt': 'khác' } },
      ],
      branches: { main: 'm1', feature: 'f2' },
      head: 'feature',
    });
  }

  it('dừng ở bước đầu: pending mang `remaining[0]` là bước CHƯA áp', () => {
    const repo = clashing();
    const range = rebaseRange(repo, ontoMain(repo));
    const result = gitRebase(repo, ontoMain(repo), ctx(10));

    expect(result.error?.code).toBe('merge-conflict');
    const pending = result.repo.pending;
    if (pending?.kind !== 'rebase') throw new Error('pending phải là rebase');
    expect(pending.conflicts).toHaveLength(1);
    expect(pending.remaining).toHaveLength(2);
    expect(pending.remaining[0]?.oid).toBe(range[0]);
    expect(pending.originalHead).toBe(refOid(repo, 'feature'));
    expect(pending.originalRef).toBe('refs/heads/feature');
  });

  it('branch KHÔNG dịch chuyển trong lúc kẹt — HEAD detached mới là con trỏ', () => {
    const repo = clashing();
    const stuck = gitRebase(repo, ontoMain(repo), ctx(10)).repo;

    expect(stuck.refs).toEqual(repo.refs);
    expect(stuck.head.type).toBe('detached');
  });

  it('`--continue` khi còn marker ⇒ lỗi NÊU TÊN FILE', () => {
    const stuck = gitRebase(clashing(), ontoMain(clashing()), ctx(10)).repo;
    const result = rebaseContinue(stuck, ctx(11));

    expect(result.error?.code).toBe('unmerged-paths');
    expect(result.error?.message).toContain('a.txt');
    expect(result.repo.pending?.kind).toBe('rebase');
  });

  it('`--continue` sau khi sạch marker chạy nốt các bước còn lại', () => {
    const repo = clashing();
    const stuck = gitRebase(repo, ontoMain(repo), ctx(10)).repo;
    const resolved: Repo = {
      ...stuck,
      worktree: { ...stuck.worktree, 'a.txt': ['x cả hai'] },
    };

    const done = rebaseContinue(resolved, ctx(11));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(done.repo.head).toEqual({ type: 'ref', ref: 'refs/heads/feature' });
    expect(messages(done.repo, headOid(done.repo))).toEqual([
      'feature thêm b',
      'feature sửa a',
      'main sửa a',
      'base',
    ]);
    expect(done.repo.worktree['a.txt']).toEqual(['x cả hai']);
  });

  it('`--skip` bỏ commit đang kẹt và áp nốt phần còn lại', () => {
    const repo = clashing();
    const range = rebaseRange(repo, ontoMain(repo));
    const skippedOid = range[0] ?? '';
    const stuck = gitRebase(repo, ontoMain(repo), ctx(10)).repo;

    const done = rebaseSkip(stuck, ctx(11));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(messages(done.repo, headOid(done.repo))).toEqual([
      'feature thêm b',
      'main sửa a',
      'base',
    ]);
    // Nội dung của bước bị bỏ không lọt vào.
    expect(done.repo.worktree['a.txt']).toEqual(['x main']);
    // Nhưng bản gốc của nó vẫn nằm trong kho.
    expect(hasObject(done.repo.objects, skippedOid)).toBe(true);
  });

  it('`--abort` trả branch, HEAD, worktree, index và pending về nguyên trạng', () => {
    const before = clashing();
    const stuck = gitRebase(before, ontoMain(before), ctx(10)).repo;
    const after = rebaseAbort(stuck, ctx(11)).repo;

    expect(after.refs).toEqual(before.refs);
    expect(after.head).toEqual(before.head);
    expect(after.worktree).toEqual(before.worktree);
    expect(after.index).toEqual(before.index);
    expect(after.pending).toBeNull();
  });

  it('`--abort` không xoá gì khỏi kho', () => {
    const before = clashing();
    const stuck = gitRebase(before, ontoMain(before), ctx(10)).repo;
    const after = rebaseAbort(stuck, ctx(11)).repo;

    for (const oid of sortedKeys(before.objects)) {
      expect(hasObject(after.objects, oid)).toBe(true);
    }
  });

  it('không có rebase nào đang dở ⇒ `no-operation-in-progress`', () => {
    const repo = forked();
    expect(rebaseContinue(repo, ctx(10)).error?.code).toBe('no-operation-in-progress');
    expect(rebaseAbort(repo, ctx(10)).error?.code).toBe('no-operation-in-progress');
    expect(rebaseSkip(repo, ctx(10)).error?.code).toBe('no-operation-in-progress');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TẤT ĐỊNH
// ═══════════════════════════════════════════════════════════════════════════

describe('tất định', () => {
  it('cùng repo + cùng ctx ⇒ cùng Oid kết quả', () => {
    const a = gitRebase(forked(), ontoMain(forked()), ctx(10));
    const b = gitRebase(forked(), ontoMain(forked()), ctx(10));
    expect(headOid(a.repo)).toBe(headOid(b.repo));
    expect(sortedKeys(a.repo.objects)).toEqual(sortedKeys(b.repo.objects));
  });
});
