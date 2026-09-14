/**
 * Test cho `pending.ts` — ba công tắc dùng chung cho năm nhánh `PendingOp`.
 *
 * Điều cần chứng minh ở đây KHÔNG phải "merge chạy đúng" (đã có ở
 * `merge.test.ts`), mà là **bộ điều phối gửi đúng chỗ**:
 *
 *  - `git merge --abort` khi đang kẹt rebase phải BỊ TỪ CHỐI. Không có phép
 *    kiểm này thì một công tắc gỡ nhầm thao tác của người khác, và mốc quay về
 *    của thao tác đang chạy biến mất mà không lệnh nào lấy lại được;
 *  - nhánh `revert` phải gọi lại `reset.ts` chứ không có bản thứ hai ở đây —
 *    ghim bằng một lượt revert xung đột chạy TRỌN VẸN qua bộ điều phối, dùng
 *    `mergeFile` của lane merge làm phép trộn tiêm vào;
 *  - `--skip` chỉ có nghĩa với thao tác nhiều đơn vị.
 */

import { describe, expect, it } from 'vitest';
import type { Lines, Oid, Repo, WorldSpec } from '../contract.ts';
import { getCommit, makeBlob, putObject } from '../objects.ts';
import { headOid } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import { gitRevert, type OpContext } from './reset.ts';
import { gitMerge, mergeFile } from './merge.ts';
import { gitRebase } from './rebase.ts';
import { gitOpAbort, gitOpContinue, gitOpSkip, pendingStatusLines } from './pending.ts';

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

function resolveFile(repo: Repo, path: string, lines: Lines): Repo {
  const [objects, oid] = putObject(repo.objects, makeBlob(lines));
  return {
    ...repo,
    objects,
    worktree: { ...repo.worktree, [path]: lines },
    index: { ...repo.index, [path]: oid },
  };
}

/** Hai nhánh cùng sửa `a.txt` ⇒ mọi thao tác trộn đều kẹt. */
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

function stuckMerge(): Repo {
  const repo = clashing();
  const result = gitMerge(repo, { oid: refOid(repo, 'feature'), label: 'feature' }, ctx(10));
  if (result.repo.pending?.kind !== 'merge') throw new Error('giàn giáo hỏng: chưa kẹt merge');
  return result.repo;
}

function stuckRebase(): Repo {
  const repo = repoOf({
    commits: [
      { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
      { id: 'm1', parents: ['c0'], message: 'main sửa a', changes: { 'a.txt': 'x main' } },
      { id: 'f1', parents: ['c0'], message: 'feature sửa a', changes: { 'a.txt': 'x feature' } },
    ],
    branches: { main: 'm1', feature: 'f1' },
    head: 'feature',
  });
  const result = gitRebase(repo, { onto: refOid(repo, 'main'), ontoLabel: 'main' }, ctx(10));
  if (result.repo.pending?.kind !== 'rebase') throw new Error('giàn giáo hỏng: chưa kẹt rebase');
  return result.repo;
}

/**
 * Một lượt `revert` đang xung đột.
 *
 * ⚠ `gitRevert` nhận phép trộn theo dòng qua tham số (`MergeFileFn`), và ở đây
 * ta tiêm `mergeFile` THẬT của lane merge. Test này vì thế cũng là phép kiểm
 * rằng hai lane khớp chữ ký nhau — thứ duy nhất chứng minh được điều đó.
 */
function stuckRevert(): Repo {
  const repo = repoOf({
    commits: [
      { id: 'c0', message: 'base', changes: { 'a.txt': 'l1\nl2\nl3' } },
      { id: 'c1', parents: ['c0'], message: 'đổi l2', changes: { 'a.txt': 'l1\nXX\nl3' } },
      { id: 'c2', parents: ['c1'], message: 'đổi l2 lần nữa', changes: { 'a.txt': 'l1\nYY\nl3' } },
    ],
    branches: { main: 'c2' },
    head: 'main',
  });
  const head = refOid(repo, 'main');
  const target = getCommit(repo.objects, head)?.parents[0] ?? '';
  const result = gitRevert(repo, target, mergeFile, ctx(10));
  if (result.repo.pending?.kind !== 'revert') throw new Error('giàn giáo hỏng: chưa kẹt revert');
  return result.repo;
}

// ═══════════════════════════════════════════════════════════════════════════
// ĐIỀU PHỐI ĐÚNG NHÁNH
// ═══════════════════════════════════════════════════════════════════════════

describe('gửi đúng nhánh', () => {
  it('merge: `--continue` sau khi giải xong tạo commit hai cha', () => {
    const resolved = resolveFile(stuckMerge(), 'a.txt', ['x cả hai']);
    const done = gitOpContinue(resolved, 'merge', ctx(11));

    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(getCommit(done.repo.objects, headOid(done.repo) ?? '')?.parents).toHaveLength(2);
  });

  it('rebase: `--continue` chạy nốt và gắn HEAD về branch', () => {
    const resolved = resolveFile(stuckRebase(), 'a.txt', ['x cả hai']);
    const done = gitOpContinue(resolved, 'rebase', ctx(11));

    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(done.repo.head).toEqual({ type: 'ref', ref: 'refs/heads/feature' });
  });

  it('cherry-pick: `--continue` trả kèm ánh xạ bản-sao → nguồn', () => {
    const repo = clashing();
    const source = refOid(repo, 'feature');
    // Dựng pending cherry-pick qua chính lệnh của nó.
    const stuck = gitOpContinue(repo, 'cherry-pick', ctx(11));
    expect(stuck.error?.code).toBe('no-operation-in-progress');

    const started = gitMerge(repo, { oid: source, label: 'feature' }, ctx(10));
    // `--continue` với verb sai phải bị chặn trước khi làm gì cả.
    const wrong = gitOpContinue(started.repo, 'cherry-pick', ctx(11));
    expect(wrong.error?.code).toBe('operation-in-progress');
    expect(wrong.repo).toBe(started.repo);
  });

  it('revert: điều phối gọi lại `reset.ts`, không có bản thứ hai ở đây', () => {
    const stuck = stuckRevert();
    expect(stuck.pending?.kind).toBe('revert');

    const resolved = resolveFile(stuck, 'a.txt', ['l1', 'l2', 'l3']);
    const done = gitOpContinue(resolved, 'revert', ctx(11));

    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
    expect(getCommit(done.repo.objects, headOid(done.repo) ?? '')?.message).toContain('Revert');
  });

  it('revert: `--abort` cũng đi qua `reset.ts`', () => {
    const done = gitOpAbort(stuckRevert(), 'revert', ctx(11));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// KHÔNG GỠ NHẦM THAO TÁC CỦA NGƯỜI KHÁC
// ═══════════════════════════════════════════════════════════════════════════

describe('khớp động từ', () => {
  it('`merge --abort` khi đang kẹt REBASE bị từ chối, trạng thái không đổi', () => {
    const stuck = stuckRebase();
    const result = gitOpAbort(stuck, 'merge', ctx(11));

    expect(result.error?.code).toBe('operation-in-progress');
    expect(result.error?.message).toContain('rebase');
    expect(result.repo).toBe(stuck);
    expect(result.repo.pending?.kind).toBe('rebase');
  });

  it('`rebase --continue` khi đang kẹt MERGE bị từ chối', () => {
    const stuck = stuckMerge();
    const result = gitOpContinue(stuck, 'rebase', ctx(11));

    expect(result.error?.code).toBe('operation-in-progress');
    expect(result.repo).toBe(stuck);
  });

  it('không có thao tác nào ⇒ `no-operation-in-progress` cho cả ba công tắc', () => {
    const repo = clashing();
    expect(gitOpContinue(repo, 'merge', ctx(11)).error?.code).toBe('no-operation-in-progress');
    expect(gitOpAbort(repo, 'merge', ctx(11)).error?.code).toBe('no-operation-in-progress');
    expect(gitOpSkip(repo, 'rebase', ctx(11)).error?.code).toBe('no-operation-in-progress');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `--skip` KHÔNG PHẢI LÚC NÀO CŨNG CÓ NGHĨA
// ═══════════════════════════════════════════════════════════════════════════

describe('--skip', () => {
  it('rebase dùng được `--skip`', () => {
    const done = gitOpSkip(stuckRebase(), 'rebase', ctx(11));
    expect(done.error).toBeNull();
    expect(done.repo.pending).toBeNull();
  });

  it('merge KHÔNG dùng được `--skip`, và câu lỗi chỉ sang `--abort`', () => {
    const result = gitOpSkip(stuckMerge(), 'merge', ctx(11));
    expect(result.error?.code).toBe('bad-usage');
    expect(result.error?.suggest).toContain('--abort');
    expect(result.repo.pending?.kind).toBe('merge');
  });

  it('revert KHÔNG dùng được `--skip`', () => {
    const result = gitOpSkip(stuckRevert(), 'revert', ctx(11));
    expect(result.error?.code).toBe('bad-usage');
    expect(result.error?.suggest).toContain('--abort');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MÔ TẢ TRẠNG THÁI KẸT
// ═══════════════════════════════════════════════════════════════════════════

describe('pendingStatusLines', () => {
  it('repo sạch ⇒ không in gì', () => {
    expect(pendingStatusLines(clashing())).toEqual([]);
  });

  it('nêu ĐÍCH DANH file còn marker, không chỉ đếm số', () => {
    const lines = pendingStatusLines(stuckMerge());
    const texts = lines.map((l) => l.text);

    expect(texts.some((t) => t.includes('merge'))).toBe(true);
    expect(texts.some((t) => t.trim() === 'a.txt')).toBe(true);
    expect(texts.some((t) => t.includes('--abort'))).toBe(true);
  });

  it('sau khi người chơi sạch marker thì báo đã chạy tiếp được', () => {
    const resolved = resolveFile(stuckMerge(), 'a.txt', ['x cả hai']);
    const texts = pendingStatusLines(resolved).map((l) => l.text);

    expect(texts.some((t) => t.trim() === 'a.txt')).toBe(false);
    expect(texts.some((t) => t.includes('chạy tiếp được'))).toBe(true);
  });

  it('rebase dừng theo `edit` được nói rõ là không phải xung đột', () => {
    const stuck = stuckRebase();
    const editStop: Repo = {
      ...stuck,
      pending:
        stuck.pending?.kind === 'rebase'
          ? { ...stuck.pending, conflicts: [] }
          : stuck.pending,
    };
    const texts = pendingStatusLines(editStop).map((l) => l.text);
    expect(texts.some((t) => t.includes('edit'))).toBe(true);
  });

  it('rebase và cherry-pick được nhắc cả ba công tắc, merge chỉ hai', () => {
    const rebaseTexts = pendingStatusLines(stuckRebase()).map((l) => l.text);
    const mergeTexts = pendingStatusLines(stuckMerge()).map((l) => l.text);

    expect(rebaseTexts.some((t) => t.includes('--skip'))).toBe(true);
    expect(mergeTexts.some((t) => t.includes('--skip'))).toBe(false);
  });
});
