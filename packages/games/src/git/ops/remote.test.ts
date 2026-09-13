/**
 * Test cho `ops/remote.ts`.
 *
 * Ô nghiệm thu của lane 17.H nằm gọn ở đây, và mỗi ô được viết sao cho nó ĐỎ khi
 * đúng thứ nó gác bị hỏng — không phải khi một thứ lân cận hỏng:
 *
 * - `fetch` không đổi branch local / index / worktree. Khẳng định bằng `toBe`
 *   (cùng THAM CHIẾU), không bằng `toEqual`: một cài đặt dựng lại worktree từ
 *   cùng nội dung sẽ qua được `toEqual` trong khi nó đã phá mất bất biến bất
 *   biến-theo-tham-chiếu mà `undo` dựa vào.
 * - Push non-fast-forward bị chặn, và `explain` nêu chữ `fetch`.
 * - Sau `--force`: commit của đồng đội **CÒN trong `origin.objects`** nhưng
 *   **KHÔNG reachable** từ ref nào của origin. HAI phép khẳng định, vì mỗi cái
 *   một mình đều qua được ở một cài đặt sai: chỉ kiểm `hasObject` thì một bản
 *   không hề ghi đè cũng xanh, còn chỉ kiểm reachability thì một bản XOÁ object
 *   cũng xanh — mà xoá là thứ giết bài G31.
 * - `--force-with-lease` có CẢ ca thành công lẫn ca thất bại. Ca thất bại quan
 *   trọng hơn: nó là toàn bộ lý do cờ đó tồn tại.
 */

import { describe, expect, it } from 'vitest';
import type { GitWorld, Oid, Repo, WorldSpec } from '../contract.ts';
import { sortedKeys } from '../deterministic.ts';
import { getCommit, getTree, hasObject, reachableFrom } from '../objects.ts';
import { branchRef, headOid, remoteRef } from '../repo.ts';
import { buildWorld } from '../world-spec.ts';
import {
  cloneRepo,
  gitClone,
  gitFetch,
  gitPull,
  gitPush,
  gitRemote,
  trackingRef,
} from './remote.ts';
import type { MergeIntoHead, PullDeps, RebaseOntoHead } from './remote.ts';

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURE
// ═══════════════════════════════════════════════════════════════════════════

const C1 = { id: 'c1', message: 'khởi tạo', changes: { 'README.md': 'xin chào' } };
const C2 = { id: 'c2', parents: ['c1'], message: 'thêm tài liệu', changes: { 'docs.md': 'tài liệu' } };

/** Local và origin khớp nhau hoàn toàn. */
const IN_SYNC: WorldSpec = {
  commits: [C1, C2],
  branches: { main: 'c2' },
  origin: { branches: { main: 'c2' } },
};

/**
 * Đồng đội đã push (`remote3`), người chơi cũng đã commit (`local3`) — hai lịch
 * sử rẽ nhau kể từ `c2`. Đây là bối cảnh của bài G16 và G20.
 *
 * `tracking` khai RIÊNG và cố tình LỆCH: ref theo dõi còn ở `c2` nghĩa là người
 * chơi CHƯA `fetch` từ lúc đồng đội push. Đó là điều kiện của `stale-lease`.
 */
const DIVERGED_STALE: WorldSpec = {
  commits: [
    C1,
    C2,
    { id: 'local3', parents: ['c2'], message: 'việc của tôi', changes: { 'mine.md': 'của tôi' } },
    { id: 'remote3', parents: ['c2'], message: 'việc của Lan', changes: { 'lan.md': 'của Lan' } },
  ],
  branches: { main: 'local3' },
  origin: { branches: { main: 'remote3' }, tracking: { main: 'c2' } },
};

/** Y hệt trên, khác đúng một chỗ: người chơi ĐÃ fetch, nên lease còn hiệu lực. */
const DIVERGED_FRESH: WorldSpec = {
  ...DIVERGED_STALE,
  origin: { branches: { main: 'remote3' }, tracking: { main: 'remote3' } },
};

/** origin có ba branch, local mới clone. */
const THREE_BRANCHES: WorldSpec = {
  commits: [
    C1,
    C2,
    { id: 'fa', parents: ['c1'], message: 'tính năng A', changes: { 'a.md': 'A' } },
    { id: 'fb', parents: ['c1'], message: 'tính năng B', changes: { 'b.md': 'B' } },
  ],
  branches: {},
  origin: { branches: { main: 'c2', 'feature-a': 'fa', 'feature-b': 'fb' }, tracking: {} },
};

function world(spec: WorldSpec): GitWorld {
  return buildWorld(spec, 1);
}

function oidOfMessage(repo: Repo, message: string): Oid {
  for (const oid of sortedKeys(repo.objects)) {
    if (getCommit(repo.objects, oid)?.message === message) return oid;
  }
  throw new Error(`không tìm thấy commit "${message}"`);
}

/** Mọi commit còn với tới được từ BẤT KỲ ref nào của một kho. */
function reachableFromAnyRef(repo: Repo): ReadonlySet<Oid> {
  const roots: Oid[] = [];
  for (const ref of sortedKeys(repo.refs)) {
    const oid = repo.refs[ref];
    if (oid !== undefined) roots.push(oid);
  }
  return reachableFrom(repo.objects, roots);
}

/**
 * Cắt kho object của local xuống còn đúng những gì ref của nó với tới.
 *
 * `buildWorld` cố ý gộp kho object của hai bên (một object thiếu bên origin sẽ
 * làm `fetch` trả về Oid không giải được), nên mặc định local ĐÃ có sẵn commit
 * của origin. Với hầu hết test thì không sao, nhưng nó làm phép khẳng định
 * "fetch chép object về" trở thành vô nghĩa — nó xanh sẵn.
 *
 * Hàm này dựng lại đúng tình huống thật: một kho chưa bao giờ nhìn thấy commit
 * bên kia.
 */
function forgetUnreferenced(world_: GitWorld): GitWorld {
  const repo = world_.local;
  const keep: Record<Oid, true> = {};
  for (const commitOid of reachableFromAnyRef(repo)) {
    keep[commitOid] = true;
    const commit = getCommit(repo.objects, commitOid);
    if (commit === null) continue;
    keep[commit.tree] = true;
    const tree = getTree(repo.objects, commit.tree);
    if (tree === null) continue;
    for (const entry of tree.entries) keep[entry.oid] = true;
  }
  // Blob của worktree cũng phải giữ: chúng không nằm trong commit nào khi file
  // chưa được track, và bỏ chúng đi sẽ làm `status` báo sai.
  const objects: Record<Oid, (typeof repo.objects)[Oid]> = {};
  for (const oid of sortedKeys(repo.objects)) {
    if (!Object.hasOwn(keep, oid)) continue;
    const object = repo.objects[oid];
    if (object !== undefined) objects[oid] = object;
  }
  return { ...world_, local: { ...repo, objects } };
}

const NOW = 99;

// ═══════════════════════════════════════════════════════════════════════════
// CLONE
// ═══════════════════════════════════════════════════════════════════════════

describe('clone', () => {
  it('tạo ĐÚNG MỘT branch local dù origin có ba — bài G13', () => {
    const origin = world(THREE_BRANCHES).origin;
    expect(origin).not.toBeNull();
    const local = cloneRepo(origin as Repo, { logicalTime: NOW });

    const branches = sortedKeys(local.refs).filter((ref) => ref.startsWith('refs/heads/'));
    expect(branches).toEqual(['refs/heads/main']);
  });

  it('nhưng lấy về ref theo dõi cho MỌI branch của origin', () => {
    const origin = world(THREE_BRANCHES).origin as Repo;
    const local = cloneRepo(origin, { logicalTime: NOW });

    const tracking = sortedKeys(local.refs).filter((ref) => ref.startsWith('refs/remotes/'));
    expect(tracking).toEqual([
      'refs/remotes/origin/feature-a',
      'refs/remotes/origin/feature-b',
      'refs/remotes/origin/main',
    ]);
  });

  it('nạp worktree và index theo nhánh mặc định', () => {
    const origin = world(THREE_BRANCHES).origin as Repo;
    const local = cloneRepo(origin, { logicalTime: NOW });

    expect(sortedKeys(local.worktree)).toEqual(['README.md', 'docs.md']);
    expect(sortedKeys(local.index)).toEqual(['README.md', 'docs.md']);
  });

  it('từ chối clone vào một kho đã có lịch sử', () => {
    const result = gitClone(world(IN_SYNC), { logicalTime: NOW });
    expect(result.error?.code).toBe('not-allowed-here');
    expect(result.world).toBe(result.world);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FETCH — ô nghiệm thu chính của lane
// ═══════════════════════════════════════════════════════════════════════════

describe('fetch', () => {
  it('KHÔNG đổi branch local, index, hay worktree — cả ba, theo tham chiếu', () => {
    const before = forgetUnreferenced(world(DIVERGED_STALE));
    const after = gitFetch(before, { logicalTime: NOW });

    expect(after.error).toBeNull();

    // 1. branch local đứng yên
    expect(after.world.local.refs[branchRef('main')]).toBe(before.local.refs[branchRef('main')]);
    // 2. index — cùng tham chiếu, không phải một bản dựng lại
    expect(after.world.local.index).toBe(before.local.index);
    // 3. worktree — như trên
    expect(after.world.local.worktree).toBe(before.local.worktree);
    // và HEAD, stash, pending cũng không được đụng tới
    expect(after.world.local.head).toBe(before.local.head);
    expect(after.world.local.stash).toBe(before.local.stash);
    expect(after.world.local.pending).toBe(before.local.pending);
  });

  it('dịch ref theo dõi tới chỗ origin đang đứng', () => {
    const before = forgetUnreferenced(world(DIVERGED_STALE));
    const origin = before.origin as Repo;
    const after = gitFetch(before, { logicalTime: NOW });

    expect(after.world.local.refs[trackingRef('main')]).toBe(origin.refs[branchRef('main')]);
    expect(after.world.local.refs[trackingRef('main')]).not.toBe(
      before.local.refs[trackingRef('main')],
    );
  });

  it('chép về object mà local chưa từng có', () => {
    const before = forgetUnreferenced(world(DIVERGED_STALE));
    const origin = before.origin as Repo;
    const lanOid = oidOfMessage(origin, 'việc của Lan');

    expect(hasObject(before.local.objects, lanOid)).toBe(false);
    const after = gitFetch(before, { logicalTime: NOW });
    expect(hasObject(after.world.local.objects, lanOid)).toBe(true);
  });

  it('không có gì mới thì không ghi thêm dòng reflog nào', () => {
    const before = world(IN_SYNC);
    const after = gitFetch(before, { logicalTime: NOW });

    expect(after.error).toBeNull();
    expect(after.world.local.reflog).toBe(before.local.reflog);
    expect(after.output[0]?.text).toContain('Đã cập nhật rồi');
  });

  it('branch không có trên origin ⇒ branch-missing, thế giới nguyên vẹn', () => {
    const before = world(IN_SYNC);
    const after = gitFetch(before, { logicalTime: NOW, branch: 'khong-co' });

    expect(after.error?.code).toBe('branch-missing');
    expect(after.world).toBe(before);
  });

  it('remote lạ ⇒ no-remote, và lỗi chỉ ra nhầm lẫn `origin main` vs `origin/main`', () => {
    const after = gitFetch(world(IN_SYNC), { logicalTime: NOW, remote: 'upstream' });
    expect(after.error?.code).toBe('no-remote');
    expect(after.error?.explain).toContain('origin/main');
  });

  it('level không có origin ⇒ no-remote', () => {
    const after = gitFetch(world({ commits: [C1], branches: { main: 'c1' } }), {
      logicalTime: NOW,
    });
    expect(after.error?.code).toBe('no-remote');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUSH
// ═══════════════════════════════════════════════════════════════════════════

describe('push', () => {
  it('fast-forward: origin đi theo, và ref theo dõi của local cũng đi theo', () => {
    const before = world({
      commits: [C1, C2],
      branches: { main: 'c2' },
      origin: { branches: { main: 'c1' }, tracking: { main: 'c1' } },
    });
    const after = gitPush(before, { logicalTime: NOW });

    expect(after.error).toBeNull();
    const tip = before.local.refs[branchRef('main')];
    expect(after.world.origin?.refs[branchRef('main')]).toBe(tip);
    expect(after.world.local.refs[trackingRef('main')]).toBe(tip);
  });

  it('đã đồng bộ thì không làm gì cả', () => {
    const before = world(IN_SYNC);
    const after = gitPush(before, { logicalTime: NOW });

    expect(after.error).toBeNull();
    expect(after.world).toBe(before);
  });

  it('non-fast-forward bị chặn, và `explain` nêu chữ `fetch`', () => {
    const before = world(DIVERGED_STALE);
    const after = gitPush(before, { logicalTime: NOW });

    expect(after.error?.code).toBe('non-fast-forward');
    expect(after.error?.explain).toContain('fetch');
    // Lệnh hỏng ⇒ trạng thái CŨ, nguyên tham chiếu.
    expect(after.world).toBe(before);
  });

  describe('--force — bài G20', () => {
    it('ghi đè: origin trỏ về commit của người chơi', () => {
      const before = world(DIVERGED_STALE);
      const after = gitPush(before, { logicalTime: NOW, force: true });

      expect(after.error).toBeNull();
      expect(after.world.origin?.refs[branchRef('main')]).toBe(
        before.local.refs[branchRef('main')],
      );
    });

    it('commit của đồng đội CÒN trong origin.objects, nhưng KHÔNG ref nào với tới', () => {
      const before = world(DIVERGED_STALE);
      const lanOid = oidOfMessage(before.origin as Repo, 'việc của Lan');

      const after = gitPush(before, { logicalTime: NOW, force: true });
      const origin = after.world.origin as Repo;

      // (1) Object KHÔNG bị xoá — điều kiện tồn tại của bài G31.
      expect(hasObject(origin.objects, lanOid)).toBe(true);
      // (2) Nhưng đã mất mọi chỗ trỏ tới — đó mới là "mất việc".
      expect(reachableFromAnyRef(origin).has(lanOid)).toBe(false);
    });

    it('nói thẳng ra là vừa làm mất mấy commit', () => {
      const after = gitPush(world(DIVERGED_STALE), { logicalTime: NOW, force: true });
      const warning = after.output.find((l) => l.tone === 'error');
      expect(warning?.text).toContain('mất chỗ trỏ tới');
    });
  });

  describe('--force-with-lease — bài G21', () => {
    it('THÀNH CÔNG khi ref theo dõi còn khớp origin thật', () => {
      const before = world(DIVERGED_FRESH);
      const after = gitPush(before, { logicalTime: NOW, forceWithLease: true });

      expect(after.error).toBeNull();
      expect(after.world.origin?.refs[branchRef('main')]).toBe(
        before.local.refs[branchRef('main')],
      );
    });

    it('THẤT BẠI khi đồng đội đã push sau lần fetch cuối', () => {
      const before = world(DIVERGED_STALE);
      const after = gitPush(before, { logicalTime: NOW, forceWithLease: true });

      expect(after.error?.code).toBe('stale-lease');
      expect(after.world).toBe(before);
    });

    it('lời giải thích KHÁC HẲN non-fast-forward — hai bài học, hai thông báo', () => {
      const stale = gitPush(world(DIVERGED_STALE), { logicalTime: NOW, forceWithLease: true });
      const nonFf = gitPush(world(DIVERGED_STALE), { logicalTime: NOW });

      expect(stale.error?.explain).not.toBe(nonFf.error?.explain);
      expect(stale.error?.explain).toContain('sau lần fetch cuối');
      expect(stale.error?.suggest).toContain('--force');
    });

    it('từ chối ngay cả khi việc ghi đè vốn là fast-forward — lease là về origin, không về hình dạng', () => {
      const before = world({
        commits: [C1, C2],
        branches: { main: 'c2' },
        origin: { branches: { main: 'c2' }, tracking: { main: 'c1' } },
      });
      // origin đã ở c2 (bằng local) nên chẳng có gì để đẩy, nhưng lease ở c1.
      const after = gitPush(before, { logicalTime: NOW, forceWithLease: true });
      expect(after.error?.code).toBe('stale-lease');
    });
  });

  it('--delete bỏ branch trên origin và bỏ luôn ref theo dõi', () => {
    const before = world({
      commits: [C1, C2],
      branches: { main: 'c2', tam: 'c2' },
      origin: { branches: { main: 'c2', tam: 'c2' } },
    });
    const after = gitPush(before, { logicalTime: NOW, branch: 'tam', deleteRemote: true });

    expect(after.error).toBeNull();
    expect(after.world.origin?.refs[branchRef('tam')]).toBeUndefined();
    expect(after.world.local.refs[trackingRef('tam')]).toBeUndefined();
    // Branch LOCAL thì không đụng tới — `--delete` xoá ở phía kia.
    expect(after.world.local.refs[branchRef('tam')]).toBeDefined();
  });

  it('HEAD tách rời ⇒ bad-usage, và explain nói rõ vì sao', () => {
    const before = world({
      commits: [C1, C2],
      branches: { main: 'c2' },
      head: { detached: 'c1' },
      origin: { branches: { main: 'c2' } },
    });
    const after = gitPush(before, { logicalTime: NOW });
    expect(after.error?.code).toBe('bad-usage');
    expect(after.error?.explain).toContain('TÁCH RỜI');
  });

  it('branch local không tồn tại ⇒ branch-missing', () => {
    const after = gitPush(world(IN_SYNC), { logicalTime: NOW, branch: 'khong-co' });
    expect(after.error?.code).toBe('branch-missing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PULL — merge/rebase được TIÊM VÀO
// ═══════════════════════════════════════════════════════════════════════════

describe('pull', () => {
  /**
   * Ghi lại tham số nhận được rồi trả repo y nguyên.
   *
   * Chữ ký khớp `MergeIntoHead`/`RebaseOntoHead` — hình dạng mà lane này KHAI,
   * cố ý khác chữ ký của `gitMerge`/`gitRebase` thật. Bộ chuyển giữa hai hình
   * dạng nằm ở `dispatch.ts`, và đó là điều làm hai lane test được độc lập.
   */
  interface Spy {
    readonly calls: { oid: Oid; label: string }[];
    readonly merge: MergeIntoHead;
    readonly rebase: RebaseOntoHead;
  }

  function spy(): Spy {
    const calls: { oid: Oid; label: string }[] = [];
    return {
      calls,
      merge: (repo, options) => {
        calls.push({ oid: options.theirs, label: options.theirsLabel });
        return { repo, output: [], error: null };
      },
      rebase: (repo, options) => {
        calls.push({ oid: options.onto, label: options.ontoLabel });
        return { repo, output: [], error: null };
      },
    };
  }

  const noop: PullDeps = {
    merge: (repo) => ({ repo, output: [], error: null }),
    rebase: (repo) => ({ repo, output: [], error: null }),
  };

  it('fetch trước, rồi giao commit ĐÃ FETCH cho merge', () => {
    const before = forgetUnreferenced(world(DIVERGED_STALE));
    const tip = (before.origin as Repo).refs[branchRef('main')];
    const m = spy();
    const r = spy();

    const after = gitPull(
      before,
      { logicalTime: NOW, author: 'Bạn' },
      { merge: m.merge, rebase: r.rebase },
    );

    expect(after.error).toBeNull();
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]?.oid).toBe(tip);
    expect(m.calls[0]?.label).toBe('origin/main');
    expect(r.calls).toHaveLength(0);
  });

  it('--rebase đi đường rebase, không đường merge', () => {
    const before = forgetUnreferenced(world(DIVERGED_STALE));
    const m = spy();
    const r = spy();

    gitPull(
      before,
      { logicalTime: NOW, author: 'Bạn', rebase: true },
      { merge: m.merge, rebase: r.rebase },
    );

    expect(m.calls).toHaveLength(0);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]?.label).toBe('origin/main');
  });

  it('xung đột đi ra KÈM thế giới đã đổi — ngoại lệ có tên của hợp đồng', () => {
    const before = forgetUnreferenced(world(DIVERGED_STALE));
    const marker = { code: 'merge-conflict' as const, message: 'x', explain: 'y' };

    const after = gitPull(
      before,
      { logicalTime: NOW, author: 'Bạn' },
      { ...noop, merge: (repo) => ({ repo, output: [], error: marker }) },
    );

    expect(after.error).toBe(marker);
    // KHÔNG được nuốt thành `worldFail(world, …)`: ref theo dõi vừa fetch phải ở lại.
    expect(after.world.local.refs[trackingRef('main')]).toBe(
      (before.origin as Repo).refs[branchRef('main')],
    );
  });

  it('chưa có ref theo dõi ⇒ no-upstream', () => {
    const before = world({
      commits: [C1, C2],
      branches: { main: 'c2' },
      origin: { branches: { khac: 'c2' }, tracking: {} },
    });
    const after = gitPull(before, { logicalTime: NOW, author: 'Bạn' }, noop);
    expect(after.error?.code).toBe('no-upstream');
    expect(after.world).toBe(before);
  });

  it('còn thao tác dở dang ⇒ operation-in-progress', () => {
    const base = world(IN_SYNC);
    const stuck: GitWorld = {
      ...base,
      local: {
        ...base.local,
        pending: {
          kind: 'merge',
          theirs: headOid(base.local) ?? '',
          theirsLabel: 'x',
          originalHead: headOid(base.local) ?? '',
          conflicts: [],
        },
      },
    };
    const after = gitPull(stuck, { logicalTime: NOW, author: 'Bạn' }, noop);
    expect(after.error?.code).toBe('operation-in-progress');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REMOTE
// ═══════════════════════════════════════════════════════════════════════════

describe('remote', () => {
  it('list nêu origin khi có, và nói rõ khi không có', () => {
    const withOrigin = gitRemote(world(IN_SYNC), { action: 'list', logicalTime: NOW });
    expect(withOrigin.output[0]?.text).toBe('origin');

    const alone = gitRemote(world({ commits: [C1], branches: { main: 'c1' } }), {
      action: 'list',
      logicalTime: NOW,
    });
    expect(alone.output[0]?.text).toContain('Chưa có remote nào');
  });

  it('show đối chiếu ref theo dõi với branch thật của origin', () => {
    const result = gitRemote(world(DIVERGED_STALE), { action: 'show', logicalTime: NOW });
    const body = result.output.map((l) => l.text).join('\n');
    expect(body).toContain('đã cũ');
  });

  it('remove bỏ cả origin lẫn mọi ref theo dõi', () => {
    const after = gitRemote(world(IN_SYNC), {
      action: 'remove',
      name: 'origin',
      logicalTime: NOW,
    });
    expect(after.error).toBeNull();
    expect(after.world.origin).toBeNull();
    expect(sortedKeys(after.world.local.refs).filter((r) => r.startsWith('refs/remotes/'))).toEqual(
      [],
    );
    // Lịch sử local không mất gì — bỏ remote không phải xoá commit.
    expect(after.world.local.refs[branchRef('main')]).toBeDefined();
  });

  it('add một remote tên khác origin bị từ chối, kèm lý do', () => {
    const after = gitRemote(world(IN_SYNC), {
      action: 'add',
      name: 'upstream',
      logicalTime: NOW,
    });
    expect(after.error?.code).toBe('not-allowed-here');
    expect(after.error?.explain).toContain('origin');
  });

  it('rename bị từ chối thay vì giả vờ làm được', () => {
    const after = gitRemote(world(IN_SYNC), { action: 'rename', logicalTime: NOW });
    expect(after.error?.code).toBe('not-allowed-here');
  });

  it('add origin vào một kho chưa có remote thì được', () => {
    const after = gitRemote(world({ commits: [C1], branches: { main: 'c1' } }), {
      action: 'add',
      name: 'origin',
      logicalTime: NOW,
    });
    expect(after.error).toBeNull();
    expect(after.world.origin).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TẤT ĐỊNH
// ═══════════════════════════════════════════════════════════════════════════

describe('tất định', () => {
  it('cùng thế giới + cùng lệnh ⇒ kết quả bằng nhau từng byte', () => {
    const a = gitPush(world(DIVERGED_STALE), { logicalTime: NOW, force: true });
    const b = gitPush(world(DIVERGED_STALE), { logicalTime: NOW, force: true });
    expect(JSON.stringify(a.world)).toBe(JSON.stringify(b.world));
  });

  it('ref theo dõi dùng đúng dạng đầy đủ mà bộ chấm bài mong đợi', () => {
    expect(trackingRef('main')).toBe(remoteRef('origin/main'));
    expect(trackingRef('main')).toBe('refs/remotes/origin/main');
  });
});
