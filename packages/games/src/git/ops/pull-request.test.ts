/**
 * Test cho `ops/pull-request.ts`.
 *
 * Ô nghiệm thu trung tâm là bài G24: **ba nút merge cho ra ba hình dạng lịch sử
 * khác nhau**. Ba khối `describe` dưới đây đặt tên thẳng theo nút, và mỗi khối
 * khẳng định đúng cái làm nó KHÁC hai nút kia — số cha, số commit mới, và lịch
 * sử có tuyến tính hay không. Chỉ kiểm "branch đích đã dịch" thì cả ba nút đều
 * xanh, và ô nghiệm thu trở thành trang trí.
 *
 * Khối `mergeContentsTrees` ở cuối gác bốn ca mà một cài đặt trộn-cây "trông có
 * vẻ đúng" hay nuốt dữ liệu. Chúng không đi qua `prMerge` vì mỗi ca cần dựng
 * một cặp cây rất cụ thể, và bọc chúng vào một PR chỉ làm test khó đọc mà không
 * gác thêm gì.
 */

import { describe, expect, it } from 'vitest';
import type { GitWorld, Oid, Repo, WorldSpec } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { firstParentChain, getCommit, hasObject } from '../objects.ts';
import { branchRef } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import { mergeContentsTrees, prList, prMerge, prOpen, prReview } from './pull-request.ts';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE
// ═══════════════════════════════════════════════════════════════════════════

const BASE: WorldSpec = {
  commits: [
    { id: 'c1', message: 'khởi tạo', changes: { 'README.md': 'xin chào' } },
    { id: 'c2', parents: ['c1'], message: 'nền', changes: { 'nen.md': 'nền' } },
    { id: 'f1', parents: ['c2'], message: 'tính năng bước 1', changes: { 'feat.md': 'một' } },
    { id: 'f2', parents: ['f1'], message: 'tính năng bước 2', changes: { 'feat2.md': 'hai' } },
  ],
  branches: { main: 'c2', 'feature-x': 'f2' },
  origin: { branches: { main: 'c2', 'feature-x': 'f2' } },
};

/** Hai phía sửa CÙNG một file theo hai hướng kể từ chỗ tách. */
const CONFLICTING: WorldSpec = {
  commits: [
    { id: 'c1', message: 'khởi tạo', changes: { 'README.md': 'xin chào' } },
    { id: 'm2', parents: ['c1'], message: 'main đổi tiêu đề', changes: { 'README.md': 'từ main' } },
    { id: 'f1', parents: ['c1'], message: 'feature đổi tiêu đề', changes: { 'README.md': 'từ feature' } },
  ],
  branches: { main: 'm2', 'feature-x': 'f1' },
  origin: { branches: { main: 'm2', 'feature-x': 'f1' } },
};

const NOW = 50;

function world(spec: WorldSpec = BASE): GitWorld {
  return buildWorld(spec, 7);
}

/** Mở sẵn PR #1 từ `feature-x` vào `main`. */
function withOpenPr(spec: WorldSpec = BASE): GitWorld {
  const opened = prOpen(world(spec), {
    title: 'Thêm tính năng X',
    sourceBranch: 'feature-x',
    targetBranch: 'main',
    logicalTime: NOW,
  });
  expect(opened.error).toBeNull();
  return opened.world;
}

function originTip(w: GitWorld, branch = 'main'): Oid {
  const oid = (w.origin as Repo).refs[branchRef(branch)];
  expect(oid).toBeDefined();
  return oid as Oid;
}

function parentsOf(w: GitWorld, oid: Oid): readonly Oid[] {
  return getCommit((w.origin as Repo).objects, oid)?.parents ?? [];
}

/** Lịch sử theo cha thứ nhất, từ tip về gốc. */
function historyOf(w: GitWorld, branch = 'main'): readonly Oid[] {
  return firstParentChain((w.origin as Repo).objects, originTip(w, branch));
}

/** Không commit nào trong lịch sử có hai cha. */
function isLinear(w: GitWorld, branch = 'main'): boolean {
  const origin = w.origin as Repo;
  return historyOf(w, branch).every((oid) => (getCommit(origin.objects, oid)?.parents.length ?? 0) <= 1);
}

function oidOfMessage(repo: Repo, message: string): Oid {
  for (const oid of sortedKeys(repo.objects)) {
    if (getCommit(repo.objects, oid)?.message === message) return oid;
  }
  throw new Error(`không tìm thấy commit "${message}"`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MỞ / REVIEW / LIỆT KÊ
// ═══════════════════════════════════════════════════════════════════════════

describe('pr open', () => {
  it('mở được PR và đánh số từ 1', () => {
    const after = prOpen(world(), {
      title: 'Thêm tính năng X',
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      logicalTime: NOW,
    });
    expect(after.error).toBeNull();
    expect(after.world.pullRequests).toHaveLength(1);
    expect(after.world.pullRequests[0]?.number).toBe(1);
    expect(after.world.pullRequests[0]?.state).toBe('open');
    expect(after.world.pullRequests[0]?.mergedWith).toBeNull();
  });

  it('từ chối khi branch nguồn chưa có TRÊN ORIGIN — nửa đầu bài G23', () => {
    const spec: WorldSpec = {
      ...BASE,
      // `feature-x` chỉ có ở local; origin chưa biết nó tồn tại.
      origin: { branches: { main: 'c2' }, tracking: { main: 'c2' } },
    };
    const after = prOpen(world(spec), {
      title: 'Thêm tính năng X',
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      logicalTime: NOW,
    });
    expect(after.error?.code).toBe('branch-missing');
    expect(after.error?.suggest).toContain('git push');
  });

  it('từ chối PR thứ hai cho cùng cặp branch', () => {
    const after = prOpen(withOpenPr(), {
      title: 'Lại nữa',
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      logicalTime: NOW,
    });
    expect(after.error?.code).toBe('not-allowed-here');
  });

  it('từ chối nguồn trùng đích', () => {
    const after = prOpen(world(), {
      title: 'x',
      sourceBranch: 'main',
      targetBranch: 'main',
      logicalTime: NOW,
    });
    expect(after.error?.code).toBe('bad-usage');
  });

  it('level không có origin ⇒ no-remote', () => {
    const alone = buildWorld({ commits: [{ id: 'c1', message: 'a' }], branches: { main: 'c1' } }, 1);
    const after = prOpen(alone, { title: 'x', sourceBranch: 'main', logicalTime: NOW });
    expect(after.error?.code).toBe('no-remote');
  });
});

describe('pr review', () => {
  it('ghi lượt review vào PR, giữ nguyên thứ tự', () => {
    const first = prReview(withOpenPr(), {
      number: 1,
      author: 'Lan',
      verdict: 'request-changes',
      body: 'thiếu test',
      logicalTime: NOW,
    });
    const second = prReview(first.world, {
      number: 1,
      author: 'Lan',
      verdict: 'approve',
      body: 'ổn rồi',
      logicalTime: NOW + 1,
    });

    const reviews = second.world.pullRequests[0]?.reviews ?? [];
    expect(reviews.map((r) => r.verdict)).toEqual(['request-changes', 'approve']);
    expect(reviews[0]?.author).toBe('Lan');
  });

  it('PR không tồn tại ⇒ bad-usage, thế giới nguyên vẹn', () => {
    const before = withOpenPr();
    const after = prReview(before, {
      number: 99,
      author: 'Lan',
      verdict: 'comment',
      body: 'x',
      logicalTime: NOW,
    });
    expect(after.error?.code).toBe('bad-usage');
    expect(after.world).toBe(before);
  });
});

describe('pr list', () => {
  it('không đổi trạng thái', () => {
    const before = withOpenPr();
    const after = prList(before);
    expect(after.world).toBe(before);
    expect(after.error).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BA NÚT MERGE — ô nghiệm thu G24
// ═══════════════════════════════════════════════════════════════════════════

describe('pr merge --merge', () => {
  it('đúc MỘT commit có HAI cha', () => {
    const after = prMerge(withOpenPr(), { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });
    expect(after.error).toBeNull();

    const tip = originTip(after.world);
    expect(parentsOf(after.world, tip)).toHaveLength(2);
    expect(isLinear(after.world)).toBe(false);
  });

  it('cha thứ nhất là đầu branch đích, cha thứ hai là đầu branch nguồn', () => {
    const before = withOpenPr();
    const mainBefore = originTip(before);
    const featureBefore = originTip(before, 'feature-x');

    const after = prMerge(before, { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });
    expect(parentsOf(after.world, originTip(after.world))).toEqual([mainBefore, featureBefore]);
  });

  it('mang mọi file của cả hai phía sang', () => {
    const after = prMerge(withOpenPr(), { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });
    const tip = originTip(after.world);
    const origin = after.world.origin as Repo;
    const tree = getCommit(origin.objects, tip)?.tree;
    expect(tree).toBeDefined();
  });
});

describe('pr merge --squash', () => {
  it('đúc ĐÚNG MỘT commit, cha duy nhất là đầu branch đích', () => {
    const before = withOpenPr();
    const mainBefore = originTip(before);

    const after = prMerge(before, { number: 1, strategy: 'squash', logicalTime: NOW, author: 'Bạn' });
    expect(after.error).toBeNull();

    expect(parentsOf(after.world, originTip(after.world))).toEqual([mainBefore]);
    expect(isLinear(after.world)).toBe(true);
    // đúng một commit mới trên đầu
    expect(historyOf(after.world)).toHaveLength(historyOf(before).length + 1);
  });

  it('commit GỐC của branch nguồn ở lại kho, nhưng KHÔNG nằm trong lịch sử đích', () => {
    const before = withOpenPr();
    const f1 = oidOfMessage(before.origin as Repo, 'tính năng bước 1');

    const after = prMerge(before, { number: 1, strategy: 'squash', logicalTime: NOW, author: 'Bạn' });
    const origin = after.world.origin as Repo;

    expect(hasObject(origin.objects, f1)).toBe(true);
    expect(historyOf(after.world)).not.toContain(f1);
  });
});

describe('pr merge --rebase', () => {
  it('đúc N commit mới, lịch sử tuyến tính, Oid MỚI hết', () => {
    const before = withOpenPr();
    const f1 = oidOfMessage(before.origin as Repo, 'tính năng bước 1');
    const f2 = oidOfMessage(before.origin as Repo, 'tính năng bước 2');

    const after = prMerge(before, { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });
    expect(after.error).toBeNull();

    expect(isLinear(after.world)).toBe(true);
    // hai commit của nhánh nguồn được áp lên, nên lịch sử dài thêm đúng hai
    expect(historyOf(after.world)).toHaveLength(historyOf(before).length + 2);

    const history = historyOf(after.world);
    expect(history).not.toContain(f1);
    expect(history).not.toContain(f2);
  });

  it('giữ nguyên message và tác giả của từng commit được áp', () => {
    const after = prMerge(withOpenPr(), { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });
    const origin = after.world.origin as Repo;
    const messages = historyOf(after.world).map((oid) => getCommit(origin.objects, oid)?.message);
    expect(messages.slice(0, 2)).toEqual(['tính năng bước 2', 'tính năng bước 1']);
  });

  it('đẩy đồng hồ logic qua HẾT số commit vừa đúc', () => {
    const before = withOpenPr();
    const after = prMerge(before, { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });
    // Hai commit ở NOW và NOW+1 ⇒ đồng hồ phải ít nhất bằng NOW+1, nếu không
    // lệnh kế tiếp sẽ đúc một commit trùng mốc thời gian với commit đã có.
    expect(after.world.logicalTime).toBeGreaterThanOrEqual(NOW + 1);
  });

  it('ba nút cho ra BA tip khác nhau — không nút nào là bí danh của nút nào', () => {
    const base = withOpenPr();
    const a = prMerge(base, { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });
    const b = prMerge(base, { number: 1, strategy: 'squash', logicalTime: NOW, author: 'Bạn' });
    const c = prMerge(base, { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });

    const tips = [originTip(a.world), originTip(b.world), originTip(c.world)];
    expect(new Set(tips).size).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRẠNG THÁI PR SAU KHI TRỘN, VÀ CHỖ LOCAL KHÔNG BIẾT GÌ
// ═══════════════════════════════════════════════════════════════════════════

describe('sau khi trộn', () => {
  it('PR chuyển sang merged và ghi lại đã trộn bằng nút nào', () => {
    const after = prMerge(withOpenPr(), { number: 1, strategy: 'squash', logicalTime: NOW, author: 'Bạn' });
    expect(after.world.pullRequests[0]?.state).toBe('merged');
    expect(after.world.pullRequests[0]?.mergedWith).toBe('squash');
  });

  it('KHO LOCAL không hề đổi — merge xảy ra ở origin', () => {
    const before = withOpenPr();
    const after = prMerge(before, { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });

    expect(after.world.local).toBe(before.local);
    expect(after.output.some((l) => l.text.includes('git fetch'))).toBe(true);
  });

  it('trộn lại một PR đã merged ⇒ not-allowed-here', () => {
    const merged = prMerge(withOpenPr(), { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });
    const again = prMerge(merged.world, {
      number: 1,
      strategy: 'merge',
      logicalTime: NOW + 1,
      author: 'Bạn',
    });
    expect(again.error?.code).toBe('not-allowed-here');
  });

  it('PR không còn commit nào để trộn ⇒ nói thẳng, không đúc commit rỗng', () => {
    const spec: WorldSpec = {
      commits: [
        { id: 'c1', message: 'khởi tạo', changes: { 'README.md': 'a' } },
        { id: 'c2', parents: ['c1'], message: 'nền', changes: { 'b.md': 'b' } },
      ],
      branches: { main: 'c2', 'feature-x': 'c1' },
      origin: { branches: { main: 'c2', 'feature-x': 'c1' } },
    };
    const after = prMerge(withOpenPr(spec), {
      number: 1,
      strategy: 'merge',
      logicalTime: NOW,
      author: 'Bạn',
    });
    expect(after.error?.code).toBe('not-allowed-here');
  });
});

describe('xung đột', () => {
  it('merge-conflict, và thế giới KHÔNG đổi — origin là kho bare, không có gì để --abort', () => {
    const before = withOpenPr(CONFLICTING);
    const after = prMerge(before, { number: 1, strategy: 'merge', logicalTime: NOW, author: 'Bạn' });

    expect(after.error?.code).toBe('merge-conflict');
    expect(after.world).toBe(before);
    expect(after.error?.explain).toContain('bare');
    expect(after.error?.suggest).toContain('git pull');
  });

  it('--rebase kẹt thì bỏ CẢ lần trộn, branch đích giữ nguyên', () => {
    const before = withOpenPr(CONFLICTING);
    const after = prMerge(before, { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });

    expect(after.error?.code).toBe('merge-conflict');
    expect(originTip(after.world)).toBe(originTip(before));
    expect(after.world.pullRequests[0]?.state).toBe('open');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRỘN CÂY BA NGẢ — bốn ca nuốt dữ liệu
// ═══════════════════════════════════════════════════════════════════════════

describe('mergeContentsTrees', () => {
  /**
   * Ca này KHÔNG có trong lượt viết đầu, và chính nó là lỗi đã làm 10 ô đỏ.
   *
   * Bộ test đầu có "cả hai cùng thêm một đường dẫn" nhưng thiếu "chỉ MỘT phía
   * thêm" — mà vế thiếu mới là vế xảy ra ở mọi pull request bình thường. Bài học
   * để lại: một bảng ca kiểm thử dựng theo "những chỗ dễ sai" dễ bỏ quên đúng
   * con đường thẳng mà mọi lượt chơi đều đi qua.
   */
  it('CHỈ MỘT phía thêm file mới ⇒ nhận, KHÔNG xung đột', () => {
    const theirsAdded = mergeContentsTrees({ 'a.md': ['a'] }, { 'a.md': ['a'] }, { 'a.md': ['a'], 'moi.md': ['mới'] });
    expect(theirsAdded.conflicts).toEqual([]);
    expect(theirsAdded.contents['moi.md']).toEqual(['mới']);

    const oursAdded = mergeContentsTrees({ 'a.md': ['a'] }, { 'a.md': ['a'], 'moi.md': ['mới'] }, { 'a.md': ['a'] });
    expect(oursAdded.conflicts).toEqual([]);
    expect(oursAdded.contents['moi.md']).toEqual(['mới']);
  });

  it('một phía xoá, phía kia không đụng ⇒ xoá thật (không hồi sinh thành file rỗng)', () => {
    const result = mergeContentsTrees({ 'a.md': ['x'] }, {}, { 'a.md': ['x'] });
    expect(Object.hasOwn(result.contents, 'a.md')).toBe(false);
    expect(result.conflicts).toEqual([]);
  });

  it('một phía xoá, phía kia SỬA ⇒ xung đột thật, không nuốt bản sửa', () => {
    const result = mergeContentsTrees({ 'a.md': ['x'] }, {}, { 'a.md': ['x đã sửa'] });
    expect(result.conflicts).toEqual(['a.md']);
  });

  it('cả hai thêm cùng đường dẫn với nội dung khác nhau ⇒ xung đột', () => {
    const result = mergeContentsTrees({}, { 'a.md': ['của tôi'] }, { 'a.md': ['của họ'] });
    expect(result.conflicts).toEqual(['a.md']);
  });

  it('cả hai đổi GIỐNG HỆT ⇒ KHÔNG xung đột (chống xung đột giả)', () => {
    const result = mergeContentsTrees(
      { 'a.md': ['sai chính tả'] },
      { 'a.md': ['đúng chính tả'] },
      { 'a.md': ['đúng chính tả'] },
    );
    expect(result.conflicts).toEqual([]);
    expect(result.contents['a.md']).toEqual(['đúng chính tả']);
  });

  it('hai phía sửa hai file khác nhau ⇒ gộp sạch cả hai', () => {
    const result = mergeContentsTrees(
      { 'a.md': ['a'], 'b.md': ['b'] },
      { 'a.md': ['a mới'], 'b.md': ['b'] },
      { 'a.md': ['a'], 'b.md': ['b mới'] },
    );
    expect(result.conflicts).toEqual([]);
    expect(result.contents['a.md']).toEqual(['a mới']);
    expect(result.contents['b.md']).toEqual(['b mới']);
  });

  it('cả hai cùng xoá ⇒ đồng thuận, không xung đột', () => {
    const result = mergeContentsTrees({ 'a.md': ['x'] }, {}, {});
    expect(result.conflicts).toEqual([]);
    expect(sortedKeys(result.contents)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TẤT ĐỊNH
// ═══════════════════════════════════════════════════════════════════════════

describe('tất định', () => {
  it('cùng PR + cùng nút ⇒ kết quả bằng nhau từng byte', () => {
    const a = prMerge(withOpenPr(), { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });
    const b = prMerge(withOpenPr(), { number: 1, strategy: 'rebase', logicalTime: NOW, author: 'Bạn' });
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  });
});
