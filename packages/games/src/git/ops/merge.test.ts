/**
 * Test cho `merge.ts`.
 *
 * Ô nghiệm thu AC-D..H đòi đúng ba nhánh của merge diff3 — **không xung đột** /
 * **xung đột MỘT hunk** / **xung đột NHIỀU hunk chồng nhau** — và chúng nằm ở
 * khối đầu tiên, đặt tên thẳng theo AC để ai đối chiếu cũng thấy ngay.
 *
 * Phần còn lại ghim những thứ mà một cài đặt "trông có vẻ đúng" hay làm sai, và
 * mỗi cái sai đều đắt theo một kiểu riêng:
 *
 *  - fast-forward mà vẫn tạo commit ⇒ dạy sai điều quan trọng nhất về merge, và
 *    `--no-ff` mất hết lý do tồn tại. Ghim bằng phép **đếm commit object**, chứ
 *    không bằng "ref đã dời" — vế sau xanh cho cả hai hành vi;
 *  - đảo thứ tự hai cha ⇒ `HEAD~1` và `HEAD^2` chỉ về nhánh sai, không lỗi nào
 *    báo, mọi bài về `~`/`^` dạy ngược;
 *  - một phía xoá file / phía kia sửa ⇒ nuốt mất bản sửa nếu coi "xoá" là
 *    "không đổi";
 *  - một phía thêm file mới ⇒ coi là xung đột thì phần lớn merge đời thực kẹt;
 *  - `--abort` quên một trong bốn thứ (worktree, index, ref, `pending`) ⇒ repo
 *    ở trạng thái nửa vời mà không lệnh nào gỡ được.
 */

import { describe, expect, it } from 'vitest';
import type { Lines, Oid, Repo, WorldSpec } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { getCommit, reachableFrom } from '../objects.ts';
import { liveRoots } from '../predicates.ts';
import { blobOid, headOid } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import type { OpContext } from './reset.ts';
import { gitMerge, mergeAbort, mergeContinue, planThreeWay } from './merge.ts';

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

/** Chỉ đếm COMMIT object. Blob và tree tăng lên là chuyện bình thường. */
function commitCount(repo: Repo): number {
  return sortedKeys(repo.objects).filter((oid) => getCommit(repo.objects, oid) !== null).length;
}

function isReachable(repo: Repo, oid: Oid): boolean {
  return reachableFrom(repo.objects, liveRoots(repo)).has(oid);
}

function work(repo: Repo, path: string): Lines {
  const lines = repo.worktree[path];
  if (lines === undefined) throw new Error(`worktree không có '${path}'`);
  return lines;
}

/** Bảy dòng, đủ chỗ để hai phía sửa hai đầu mà vẫn còn dòng ổn định ở giữa. */
const SEVEN = 'l1\nl2\nl3\nl4\nl5\nl6\nl7';

/**
 * `main` và `feature` cùng tách khỏi `base`, mỗi bên sửa `a.txt` một kiểu.
 * HEAD đứng ở `main`.
 */
function twoBranches(mainContent: string, featureContent: string): Repo {
  return repoOf({
    commits: [
      { id: 'c0', message: 'base', changes: { 'a.txt': SEVEN } },
      { id: 'm1', parents: ['c0'], message: 'main sửa', changes: { 'a.txt': mainContent } },
      { id: 'f1', parents: ['c0'], message: 'feature sửa', changes: { 'a.txt': featureContent } },
    ],
    branches: { main: 'm1', feature: 'f1' },
    head: 'main',
  });
}

function mergeFeature(repo: Repo, time = 10): ReturnType<typeof gitMerge> {
  return gitMerge(repo, { oid: refOid(repo, 'feature'), label: 'feature' }, ctx(time));
}

// ═══════════════════════════════════════════════════════════════════════════
// AC-D..H — BA NHÁNH CỦA MERGE DIFF3
// ═══════════════════════════════════════════════════════════════════════════

describe('AC — ba nhánh của merge ba ngả', () => {
  it('KHÔNG xung đột: hai phía sửa hai vùng cách xa nhau', () => {
    const repo = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'l1\nl2\nl3\nl4\nl5\nl6\nFEAT');
    const result = mergeFeature(repo);

    expect(result.error).toBeNull();
    expect(result.repo.pending).toBeNull();
    expect(work(result.repo, 'a.txt')).toEqual(['MAIN', 'l2', 'l3', 'l4', 'l5', 'l6', 'FEAT']);

    const merged = headOid(result.repo);
    expect(merged).not.toBeNull();
    expect(getCommit(result.repo.objects, merged ?? '')?.parents).toHaveLength(2);
  });

  it('xung đột MỘT hunk: hai phía sửa cùng một dòng', () => {
    const repo = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'FEAT\nl2\nl3\nl4\nl5\nl6\nl7');
    const result = mergeFeature(repo);

    expect(result.error?.code).toBe('merge-conflict');
    expect(result.repo.pending?.kind).toBe('merge');
    expect(result.repo.pending?.conflicts).toHaveLength(1);

    const conflict = result.repo.pending?.conflicts[0];
    expect(conflict?.path).toBe('a.txt');
    expect(conflict?.hunks.filter((h) => h.conflicted)).toHaveLength(1);

    const lines = work(result.repo, 'a.txt');
    expect(lines.some((l) => l.startsWith('<<<<<<<'))).toBe(true);
    expect(lines.some((l) => l.startsWith('|||||||'))).toBe(true);
    expect(lines.some((l) => l === '=======')).toBe(true);
    expect(lines.some((l) => l.startsWith('>>>>>>>'))).toBe(true);
    // Nhãn phải nêu đúng hai phía, không phải "ours"/"theirs" trần.
    expect(lines.some((l) => l === '<<<<<<< main')).toBe(true);
    expect(lines.some((l) => l === '>>>>>>> feature')).toBe(true);
  });

  it('xung đột NHIỀU hunk: hai vùng tách rời, cả hai đều đụng độ', () => {
    const repo = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nMAIN7', 'FEAT\nl2\nl3\nl4\nl5\nl6\nFEAT7');
    const result = mergeFeature(repo);

    expect(result.error?.code).toBe('merge-conflict');
    const conflict = result.repo.pending?.conflicts[0];
    expect(conflict?.hunks.filter((h) => h.conflicted)).toHaveLength(2);
  });

  it('xung đột nhiều hunk CHỒNG NHAU: hai vùng sửa giao nhau gộp thành một khối', () => {
    // ours thay dòng 2–4, theirs thay dòng 3–5. Hai vùng giao nhau, nên diff3
    // gộp chúng thành MỘT hunk phủ dòng 2–5 — không phải hai hunk cắt ngang
    // nhau, thứ sẽ đẻ ra marker lồng nhau không đọc được.
    const repo = twoBranches(
      'l1\nA2\nA3\nA4\nl5\nl6\nl7',
      'l1\nl2\nB3\nB4\nB5\nl6\nl7',
    );
    const result = mergeFeature(repo);

    expect(result.error?.code).toBe('merge-conflict');
    const hunks = result.repo.pending?.conflicts[0]?.hunks ?? [];
    const conflicted = hunks.filter((h) => h.conflicted);
    expect(conflicted).toHaveLength(1);
    expect(conflicted[0]?.base).toEqual(['l2', 'l3', 'l4', 'l5']);

    // Marker không được lồng nhau: đúng một khối mở và một khối đóng.
    const lines = work(result.repo, 'a.txt');
    expect(lines.filter((l) => l.startsWith('<<<<<<<'))).toHaveLength(1);
    expect(lines.filter((l) => l.startsWith('>>>>>>>'))).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FAST-FORWARD
// ═══════════════════════════════════════════════════════════════════════════

describe('fast-forward', () => {
  /** `feature` đi trước `main` đúng một commit, nên merge chỉ phải dời con trỏ. */
  function ahead(): Repo {
    return repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'c1', parents: ['c0'], message: 'feature thêm', changes: { 'b.txt': 'y' } },
      ],
      branches: { main: 'c0', feature: 'c1' },
      head: 'main',
    });
  }

  it('KHÔNG tạo commit nào — đếm commit object trước và sau', () => {
    const repo = ahead();
    const before = commitCount(repo);
    const result = mergeFeature(repo);

    expect(result.error).toBeNull();
    expect(commitCount(result.repo)).toBe(before);
    expect(refOid(result.repo, 'main')).toBe(refOid(repo, 'feature'));
    // Và con trỏ trỏ thẳng vào commit CÓ SẴN, không vào một bản sao.
    expect(getCommit(result.repo.objects, refOid(result.repo, 'main'))?.parents).toHaveLength(1);
  });

  it('kéo theo cả worktree và index', () => {
    const result = mergeFeature(ahead());
    expect(work(result.repo, 'b.txt')).toEqual(['y']);
    expect(result.repo.index['b.txt']).toBe(blobOid(['y']));
  });

  it('`--no-ff` ép tạo commit merge hai cha', () => {
    const repo = ahead();
    const before = commitCount(repo);
    const result = gitMerge(
      repo,
      { oid: refOid(repo, 'feature'), label: 'feature' },
      ctx(10),
      { noFf: true },
    );

    expect(result.error).toBeNull();
    expect(commitCount(result.repo)).toBe(before + 1);
    expect(getCommit(result.repo.objects, headOid(result.repo) ?? '')?.parents).toHaveLength(2);
  });

  it('đã cập nhật rồi ⇒ không đổi gì cả', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'c1', parents: ['c0'], message: 'thêm', changes: { 'b.txt': 'y' } },
      ],
      branches: { main: 'c1', feature: 'c0' },
      head: 'main',
    });
    const before = commitCount(repo);
    const result = mergeFeature(repo);

    expect(result.error).toBeNull();
    expect(commitCount(result.repo)).toBe(before);
    expect(refOid(result.repo, 'main')).toBe(refOid(repo, 'main'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THỨ TỰ HAI CHA
// ═══════════════════════════════════════════════════════════════════════════

describe('commit merge', () => {
  it('cha THỨ NHẤT là HEAD, cha THỨ HAI là nhánh trộn vào', () => {
    const repo = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'l1\nl2\nl3\nl4\nl5\nl6\nFEAT');
    const headBefore = refOid(repo, 'main');
    const theirs = refOid(repo, 'feature');

    const result = mergeFeature(repo);
    const merged = getCommit(result.repo.objects, headOid(result.repo) ?? '');

    expect(merged?.parents[0]).toBe(headBefore);
    expect(merged?.parents[1]).toBe(theirs);
  });

  it('`--squash` không tạo commit và không ghi cha thứ hai', () => {
    const repo = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'l1\nl2\nl3\nl4\nl5\nl6\nFEAT');
    const before = commitCount(repo);
    const result = gitMerge(
      repo,
      { oid: refOid(repo, 'feature'), label: 'feature' },
      ctx(10),
      { squash: true },
    );

    expect(result.error).toBeNull();
    expect(commitCount(result.repo)).toBe(before);
    expect(refOid(result.repo, 'main')).toBe(refOid(repo, 'main'));
    expect(work(result.repo, 'a.txt')).toEqual(['MAIN', 'l2', 'l3', 'l4', 'l5', 'l6', 'FEAT']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CA BIÊN Ở MỨC FILE — thứ `merge3` không mô tả được
// ═══════════════════════════════════════════════════════════════════════════

describe('ca biên ở mức file', () => {
  it('modify/delete: ours sửa, theirs xoá ⇒ XUNG ĐỘT, không nuốt bản sửa', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x\ny' } },
        { id: 'm1', parents: ['c0'], message: 'main sửa', changes: { 'a.txt': 'x SỬA\ny' } },
        { id: 'f1', parents: ['c0'], message: 'feature xoá', changes: { 'a.txt': null } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
    const result = mergeFeature(repo);

    expect(result.error?.code).toBe('merge-conflict');
    expect(result.repo.pending?.conflicts.map((c) => c.path)).toEqual(['a.txt']);
    // Bản sửa của ours vẫn nằm trong file, giữa hai marker.
    expect(work(result.repo, 'a.txt')).toContain('x SỬA');
  });

  it('delete/modify: ours xoá, theirs sửa ⇒ cũng XUNG ĐỘT (đối xứng)', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x\ny' } },
        { id: 'm1', parents: ['c0'], message: 'main xoá', changes: { 'a.txt': null } },
        { id: 'f1', parents: ['c0'], message: 'feature sửa', changes: { 'a.txt': 'x SỬA\ny' } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
    const result = mergeFeature(repo);

    expect(result.error?.code).toBe('merge-conflict');
    expect(result.repo.pending?.conflicts.map((c) => c.path)).toEqual(['a.txt']);
    expect(work(result.repo, 'a.txt')).toContain('x SỬA');
  });

  it('xoá một phía + phía kia KHÔNG đụng ⇒ xoá thắng, không xung đột', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x', 'b.txt': 'giữ' } },
        { id: 'm1', parents: ['c0'], message: 'main sửa chỗ khác', changes: { 'b.txt': 'giữ+' } },
        { id: 'f1', parents: ['c0'], message: 'feature xoá', changes: { 'a.txt': null } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
    const result = mergeFeature(repo);

    expect(result.error).toBeNull();
    expect(Object.hasOwn(result.repo.worktree, 'a.txt')).toBe(false);
    expect(Object.hasOwn(result.repo.index, 'a.txt')).toBe(false);
  });

  it('một phía THÊM file mới ⇒ lấy file, KHÔNG xung đột', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main sửa', changes: { 'a.txt': 'x main' } },
        { id: 'f1', parents: ['c0'], message: 'feature thêm', changes: { 'moi.txt': 'nội dung' } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
    const result = mergeFeature(repo);

    expect(result.error).toBeNull();
    expect(work(result.repo, 'moi.txt')).toEqual(['nội dung']);
    expect(work(result.repo, 'a.txt')).toEqual(['x main']);
  });

  it('add/add: hai phía cùng thêm một đường dẫn với nội dung khác ⇒ XUNG ĐỘT', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main thêm', changes: { 'moi.txt': 'bản của main' } },
        { id: 'f1', parents: ['c0'], message: 'feature thêm', changes: { 'moi.txt': 'bản của feature' } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
    const result = mergeFeature(repo);

    expect(result.error?.code).toBe('merge-conflict');
    expect(result.repo.pending?.conflicts.map((c) => c.path)).toEqual(['moi.txt']);
    // Base rỗng: khối `|||||||` không có dòng nào giữa nó và `=======`.
    const hunk = result.repo.pending?.conflicts[0]?.hunks.find((h) => h.conflicted);
    expect(hunk?.base).toEqual([]);
  });

  it('add/add với nội dung GIỐNG HỆT ⇒ không xung đột', () => {
    const repo = repoOf({
      commits: [
        { id: 'c0', message: 'base', changes: { 'a.txt': 'x' } },
        { id: 'm1', parents: ['c0'], message: 'main thêm', changes: { 'moi.txt': 'y hệt' } },
        { id: 'f1', parents: ['c0'], message: 'feature thêm', changes: { 'moi.txt': 'y hệt' } },
      ],
      branches: { main: 'm1', feature: 'f1' },
      head: 'main',
    });
    const result = mergeFeature(repo);

    expect(result.error).toBeNull();
    expect(work(result.repo, 'moi.txt')).toEqual(['y hệt']);
  });

  it('planThreeWay thuần: cùng đầu vào ⇒ cùng đầu ra, không đụng repo', () => {
    const input = {
      base: { 'a.txt': ['x'] as Lines },
      ours: { 'a.txt': ['x', 'ours'] as Lines },
      theirs: { 'a.txt': ['x', 'theirs'] as Lines },
      oursLabel: 'main',
      theirsLabel: 'feature',
    };
    expect(planThreeWay(input)).toEqual(planThreeWay(input));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// `--continue` / `--abort`
// ═══════════════════════════════════════════════════════════════════════════

describe('merge --continue', () => {
  function stuck(): Repo {
    const repo = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'FEAT\nl2\nl3\nl4\nl5\nl6\nl7');
    return mergeFeature(repo).repo;
  }

  it('còn marker ⇒ lỗi `unmerged-paths`, và thông báo NÊU TÊN FILE', () => {
    const result = mergeContinue(stuck(), ctx(11));

    expect(result.error?.code).toBe('unmerged-paths');
    expect(result.error?.message).toContain('a.txt');
    // Trạng thái không đổi: vẫn đang kẹt.
    expect(result.repo.pending?.kind).toBe('merge');
  });

  it('sạch marker ⇒ tạo commit merge hai cha, nội dung lấy từ worktree', () => {
    const repo = stuck();
    const resolved: Repo = {
      ...repo,
      worktree: { ...repo.worktree, 'a.txt': ['CẢ HAI', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'] },
    };
    const result = mergeContinue(resolved, ctx(11));

    expect(result.error).toBeNull();
    expect(result.repo.pending).toBeNull();
    const merged = getCommit(result.repo.objects, headOid(result.repo) ?? '');
    expect(merged?.parents).toHaveLength(2);
    expect(merged?.parents[0]).toBe(repo.pending?.kind === 'merge' ? repo.pending.originalHead : '');
    expect(work(result.repo, 'a.txt')[0]).toBe('CẢ HAI');
  });

  it('xoá hẳn file đang xung đột cũng là một cách giải hợp lệ', () => {
    const repo = stuck();
    const worktree = { ...repo.worktree };
    delete worktree['a.txt'];
    const result = mergeContinue({ ...repo, worktree }, ctx(11));

    expect(result.error).toBeNull();
    expect(Object.hasOwn(result.repo.worktree, 'a.txt')).toBe(false);
  });

  it('không có thao tác nào đang chạy ⇒ `no-operation-in-progress`', () => {
    const repo = twoBranches(SEVEN, SEVEN);
    expect(mergeContinue(repo, ctx(11)).error?.code).toBe('no-operation-in-progress');
  });
});

describe('merge --abort', () => {
  it('trả worktree, index, ref VÀ pending về đúng trạng thái trước', () => {
    const before = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'FEAT\nl2\nl3\nl4\nl5\nl6\nl7');
    const stuck = mergeFeature(before).repo;
    expect(stuck.pending).not.toBeNull();

    const after = mergeAbort(stuck).repo;

    expect(after.worktree).toEqual(before.worktree); // 1. worktree
    expect(after.index).toEqual(before.index); // 2. index
    expect(after.refs).toEqual(before.refs); // 3. ref
    expect(after.pending).toBeNull(); // 4. pending
  });

  it('không tạo thêm commit nào và không xoá gì khỏi kho', () => {
    const before = twoBranches('MAIN\nl2\nl3\nl4\nl5\nl6\nl7', 'FEAT\nl2\nl3\nl4\nl5\nl6\nl7');
    const stuck = mergeFeature(before).repo;
    const after = mergeAbort(stuck).repo;

    expect(commitCount(after)).toBe(commitCount(before));
    for (const oid of sortedKeys(before.objects)) {
      expect(Object.hasOwn(after.objects, oid)).toBe(true);
    }
    expect(isReachable(after, refOid(before, 'feature'))).toBe(true);
  });

  it('không có merge nào đang dở ⇒ `no-operation-in-progress`', () => {
    const repo = twoBranches(SEVEN, SEVEN);
    expect(mergeAbort(repo).error?.code).toBe('no-operation-in-progress');
  });
});
