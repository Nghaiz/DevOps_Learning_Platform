/**
 * Test cho `cherry-pick.ts`.
 *
 * Ba khẳng định mang cả bài G11:
 *
 *  1. bản sao có **Oid khác**, **cha khác**, **nội dung trùng** — nó là bản sao,
 *     không phải bản di chuyển;
 *  2. commit **nguồn vẫn với tới được** — khác hẳn rebase, nơi bản cũ mồ côi;
 *  3. chép cùng một commit hai lần ra **hai commit khác Oid** — engine KHÔNG
 *     khử trùng lặp, vì đúng cái trùng lặp đó là cái giá bài G11 dạy.
 *
 * Vế 3 là chỗ dễ "sửa" nhầm nhất: một hiện thực thấy cây không đổi rồi từ chối
 * tạo commit trông rất hợp lý, và nó xoá mất đúng tình huống người chơi cần
 * nhìn thấy.
 */

import { describe, expect, it } from 'vitest';
import type { Lines, Oid, Repo, WorldSpec } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { getCommit, hasObject, makeBlob, putObject, reachableFrom } from '../objects.ts';
import { liveRoots } from '../predicates.ts';
import { headOid } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import type { OpContext } from './reset.ts';
import {
  cherryPickAbort,
  cherryPickContinue,
  cherryPickSkip,
  gitCherryPick,
} from './cherry-pick.ts';

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

/** Người chơi sửa xong một file đang xung đột và `git add` nó. */
function resolveFile(repo: Repo, path: string, lines: Lines): Repo {
  const [objects, oid] = putObject(repo.objects, makeBlob(lines));
  return {
    ...repo,
    objects,
    worktree: { ...repo.worktree, [path]: lines },
    index: { ...repo.index, [path]: oid },
  };
}

/**
 * `main` đã tiến, `feature` có một bản vá độc lập do người khác viết.
 * HEAD ở `main` — đúng tư thế trước `git cherry-pick <bản vá>`.
 */
function withPatch(): Repo {
  return repoOf({
    commits: [
      { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
      { id: 'm1', parents: ['c0'], message: 'main tiến', changes: { 'main.txt': 'm' } },
      {
        id: 'f1',
        parents: ['c0'],
        message: 'bản vá quan trọng',
        author: 'Đồng nghiệp',
        changes: { 'fix.txt': 'đã vá' },
      },
    ],
    branches: { main: 'm1', feature: 'f1' },
    head: 'main',
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// BẢN SAO, KHÔNG PHẢI DI CHUYỂN
// ═══════════════════════════════════════════════════════════════════════════

describe('cherry-pick một commit', () => {
  it('tạo commit MỚI: khác Oid, khác cha, trùng nội dung', () => {
    const repo = withPatch();
    const source = refOid(repo, 'feature');
    const before = commitCount(repo);

    const result = gitCherryPick(repo, [source], ctx(10));
    expect(result.error).toBeNull();

    const copyOid = headOid(result.repo);
    expect(copyOid).not.toBe(source);
    expect(commitCount(result.repo)).toBe(before + 1);

    const copy = getCommit(result.repo.objects, copyOid ?? '');
    expect(copy?.parents).toEqual([refOid(repo, 'main')]);
    expect(copy?.message).toBe('bản vá quan trọng');
    // Nội dung của bản vá đã sang, và nội dung của main không mất.
    expect(result.repo.worktree['fix.txt']).toEqual(['đã vá']);
    expect(result.repo.worktree['main.txt']).toEqual(['m']);
  });

  it('giữ TÁC GIẢ của commit nguồn, không lấy tác giả người đang chép', () => {
    const repo = withPatch();
    const result = gitCherryPick(repo, [refOid(repo, 'feature')], ctx(10));
    expect(getCommit(result.repo.objects, headOid(result.repo) ?? '')?.author).toBe('Đồng nghiệp');
  });

  it('commit nguồn VẪN với tới được — cherry-pick không mồ côi hoá gì cả', () => {
    const repo = withPatch();
    const source = refOid(repo, 'feature');
    const after = gitCherryPick(repo, [source], ctx(10)).repo;

    expect(hasObject(after.objects, source)).toBe(true);
    expect(isReachable(after, source)).toBe(true);
    expect(refOid(after, 'feature')).toBe(source);
  });

  it('trả ánh xạ `bản sao → nguồn` cho tầng view', () => {
    const repo = withPatch();
    const source = refOid(repo, 'feature');
    const result = gitCherryPick(repo, [source], ctx(10));
    const copyOid = headOid(result.repo) ?? '';

    expect(result.duplicateOf[copyOid]).toBe(source);
    expect(sortedKeys(result.duplicateOf)).toEqual([copyOid]);
  });

  it('chép NHIỀU commit theo đúng thứ tự được nêu', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main tiến', changes: { 'main.txt': 'm' } },
        { id: 's1', parents: ['c0'], message: 'vá 1', changes: { 'p1.txt': '1' } },
        { id: 's2', parents: ['s1'], message: 'vá 2', changes: { 'p2.txt': '2' } },
      ],
      branches: { main: 'm1', side: 's2' },
      head: 'main',
    });
    const s2 = refOid(repo, 'side');
    const s1 = getCommit(repo.objects, s2)?.parents[0] ?? '';

    const result = gitCherryPick(repo, [s1, s2], ctx(10));
    expect(result.error).toBeNull();

    const head = getCommit(result.repo.objects, headOid(result.repo) ?? '');
    expect(head?.message).toBe('vá 2');
    expect(getCommit(result.repo.objects, head?.parents[0] ?? '')?.message).toBe('vá 1');
    expect(sortedKeys(result.duplicateOf)).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⛔ KHÔNG KHỬ TRÙNG LẶP
// ═══════════════════════════════════════════════════════════════════════════

describe('không khử trùng lặp', () => {
  it('chép CÙNG một commit hai lần ⇒ HAI commit khác Oid', () => {
    const repo = withPatch();
    const source = refOid(repo, 'feature');

    const first = gitCherryPick(repo, [source], ctx(10));
    expect(first.error).toBeNull();
    const firstCopy = headOid(first.repo) ?? '';

    const second = gitCherryPick(first.repo, [source], ctx(11));
    expect(second.error).toBeNull();
    const secondCopy = headOid(second.repo) ?? '';

    expect(firstCopy).not.toBe(secondCopy);
    expect(hasObject(second.repo.objects, firstCopy)).toBe(true);
    expect(getCommit(second.repo.objects, secondCopy)?.parents).toEqual([firstCopy]);
    // Cả hai đều nằm trên đường của `main` — trùng lặp hiện ra thật.
    expect(getCommit(second.repo.objects, secondCopy)?.message).toBe('bản vá quan trọng');
    expect(getCommit(second.repo.objects, firstCopy)?.message).toBe('bản vá quan trọng');
  });

  it('bản sao rỗng vẫn được tạo, kèm cảnh báo', () => {
    const repo = withPatch();
    const source = refOid(repo, 'feature');
    const first = gitCherryPick(repo, [source], ctx(10));
    const second = gitCherryPick(first.repo, [source], ctx(11));

    expect(second.error).toBeNull();
    expect(second.output.some((l) => l.tone === 'warn')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TỪ CHỐI CÓ LÝ DO
// ═══════════════════════════════════════════════════════════════════════════

describe('từ chối', () => {
  it('commit merge bị từ chối, trạng thái không đổi', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'a1', parents: ['c0'], message: 'nhánh a', changes: { 'a1.txt': '1' } },
        { id: 'b1', parents: ['c0'], message: 'nhánh b', changes: { 'b1.txt': '2' } },
        { id: 'mg', parents: ['a1', 'b1'], message: 'merge hai nhánh' },
        { id: 'z1', parents: ['c0'], message: 'chỗ đứng', changes: { 'z.txt': 'z' } },
      ],
      branches: { main: 'z1', tron: 'mg' },
      head: 'main',
    });
    const result = gitCherryPick(repo, [refOid(repo, 'tron')], ctx(10));

    expect(result.error?.code).toBe('bad-usage');
    expect(result.repo).toBe(repo);
  });

  it('danh sách có phần tử hỏng ⇒ KHÔNG áp phần tử nào cả', () => {
    const repo = withPatch();
    const before = commitCount(repo);
    const result = gitCherryPick(repo, [refOid(repo, 'feature'), 'khong-ton-tai'], ctx(10));

    expect(result.error?.code).toBe('not-a-commit');
    expect(commitCount(result.repo)).toBe(before);
    expect(result.repo).toBe(repo);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// XUNG ĐỘT
// ═══════════════════════════════════════════════════════════════════════════

describe('cherry-pick gặp xung đột', () => {
  function clashing(): Repo {
    return repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main sửa a', changes: { 'a.txt': 'x main' } },
        { id: 'f1', parents: ['c0'], message: 'feature sửa a', changes: { 'a.txt': 'x feature' } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
  }

  it('đặt pending `cherry-pick` với `picks[0]` là commit đang kẹt', () => {
    const repo = clashing();
    const source = refOid(repo, 'feature');
    const result = gitCherryPick(repo, [source], ctx(10));

    expect(result.error?.code).toBe('merge-conflict');
    const pending = result.repo.pending;
    if (pending?.kind !== 'cherry-pick') throw new Error('pending phải là cherry-pick');
    expect(pending.picks[0]).toBe(source);
    expect(pending.originalHead).toBe(refOid(repo, 'main'));
    expect(pending.conflicts.map((c) => c.path)).toEqual(['a.txt']);
    // Con trỏ chưa dịch chuyển.
    expect(headOid(result.repo)).toBe(refOid(repo, 'main'));
  });

  it('`--continue` khi còn marker ⇒ lỗi NÊU TÊN FILE', () => {
    const stuck = gitCherryPick(clashing(), [refOid(clashing(), 'feature')], ctx(10)).repo;
    const result = cherryPickContinue(stuck, ctx(11));

    expect(result.error?.code).toBe('unmerged-paths');
    expect(result.error?.message).toContain('a.txt');
  });

  it('`--continue` sau khi giải xong tạo bản sao', () => {
    const repo = clashing();
    const source = refOid(repo, 'feature');
    const stuck = gitCherryPick(repo, [source], ctx(10)).repo;
    const resolved = resolveFile(stuck, 'a.txt', ['x cả hai']);

    const done = cherryPickContinue(resolved, ctx(11));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(getCommit(done.repo.objects, headOid(done.repo) ?? '')?.message).toBe('feature sửa a');
    expect(done.repo.worktree['a.txt']).toEqual(['x cả hai']);
    expect(sortedKeys(done.duplicateOf)).toEqual([headOid(done.repo) ?? '']);
  });

  it('`--skip` bỏ commit đang kẹt, không tạo bản sao nào của nó', () => {
    const repo = clashing();
    const before = commitCount(repo);
    const stuck = gitCherryPick(repo, [refOid(repo, 'feature')], ctx(10)).repo;

    const done = cherryPickSkip(stuck, ctx(11));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(commitCount(done.repo)).toBe(before);
    expect(headOid(done.repo)).toBe(refOid(repo, 'main'));
    expect(done.repo.worktree['a.txt']).toEqual(['x main']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `--abort` SAU KHI ĐÃ CHÉP ĐƯỢC MỘT PHẦN
// ═══════════════════════════════════════════════════════════════════════════

describe('cherry-pick --abort', () => {
  /** Commit đầu chép sạch, commit thứ hai kẹt — đúng ca `--abort` phải lùi ref. */
  function halfway(): Repo {
    return repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main sửa a', changes: { 'a.txt': 'x main' } },
        { id: 'g1', parents: ['c0'], message: 'thêm g', changes: { 'g.txt': 'g' } },
        { id: 'b1', parents: ['g1'], message: 'sửa a kiểu khác', changes: { 'a.txt': 'x other' } },
      ],
      branches: { main: 'm1', side: 'b1' },
      head: 'main',
    });
  }

  function picks(repo: Repo): readonly Oid[] {
    const b1 = refOid(repo, 'side');
    const g1 = getCommit(repo.objects, b1)?.parents[0] ?? '';
    return [g1, b1];
  }

  it('lùi con trỏ về `originalHead`, bản sao đã tạo thành mồ côi nhưng CÒN trong kho', () => {
    const before = halfway();
    const stuck = gitCherryPick(before, picks(before), ctx(10));
    expect(stuck.error?.code).toBe('merge-conflict');

    // Bản sao của `g1` đã tồn tại và con trỏ đã tiến.
    const copyOid = headOid(stuck.repo) ?? '';
    expect(copyOid).not.toBe(refOid(before, 'main'));

    const after = cherryPickAbort(stuck.repo, ctx(11)).repo;

    expect(headOid(after)).toBe(refOid(before, 'main'));
    expect(after.refs['refs/heads/main']).toBe(refOid(before, 'main'));
    expect(after.pending).toBeNull();
    expect(after.worktree).toEqual(before.worktree);
    expect(after.index).toEqual(before.index);
    // ⛔ Bản sao mồ côi KHÔNG bị xoá khỏi kho.
    expect(hasObject(after.objects, copyOid)).toBe(true);
    expect(isReachable(after, copyOid)).toBe(false);
  });

  it('không có cherry-pick nào đang dở ⇒ `no-operation-in-progress`', () => {
    const repo = withPatch();
    expect(cherryPickAbort(repo, ctx(10)).error?.code).toBe('no-operation-in-progress');
    expect(cherryPickContinue(repo, ctx(10)).error?.code).toBe('no-operation-in-progress');
    expect(cherryPickSkip(repo, ctx(10)).error?.code).toBe('no-operation-in-progress');
  });
});
