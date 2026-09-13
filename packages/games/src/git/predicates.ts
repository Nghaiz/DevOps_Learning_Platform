/**
 * Bộ chấm bài: 25 vị từ, mỗi vị từ là **một testcase**.
 *
 * ⛔ CHẤM THEO **TRẠNG THÁI**, KHÔNG THEO LỆNH ĐÃ GÕ.
 *
 * Đây là quyết định kiến trúc lớn nhất của tầng chấm, và design doc §3.3 đo được
 * cái giá của lựa chọn ngược lại: gitmastery.me khai
 * `LevelRequirement { command, requiresArgs[] }` và chấm bằng **khớp mẫu lệnh**.
 * Hệ quả trực tiếp — gõ đúng lệnh mà repo sai bét vẫn qua bài, và **không thể có
 * nhiều lời giải hợp lệ**. Learn Git Branching chấm bằng so trạng thái đồ thị, và
 * đó là mô hình phải theo.
 *
 * Ô nghiệm thu AC-9 (mỗi level ≥ 2 lời giải khác đường đi cùng qua) tồn tại
 * chính xác để **chứng minh** ta không trượt vào mô hình kia. Nó không phải một
 * ô cho đẹp: nếu ai đó lén thêm một vị từ "người chơi đã gõ lệnh X" thì AC-9 sẽ
 * đỏ, và đó là cách duy nhất phát hiện ra.
 *
 * Ánh xạ sang testcase (quyết định #20): verdict `AC` khi và chỉ khi mọi
 * objective `required` qua. Không qua hết thì hiện `4/5` kèm testcase nào đỏ.
 * Không có trọng số riêng cho từng objective.
 */

import type {
  GitObjective,
  GitPredicateName,
  GitWorld,
  Lines,
  Oid,
  Repo,
} from './contract.ts';
import { compareKeys, sortedKeys } from './deterministic.ts';
import { firstParentChain, getCommit, hasObject, reachableFrom } from './objects.ts';
import {
  blobOid,
  branchNames,
  branchRef,
  headOid,
  isDetached,
  isIndexClean,
  isWorktreeClean,
  readReflog,
  remoteRef,

  tagRef,
} from './repo.ts';
// SSOT: bộ dò marker ở `conflict-markers.ts` (lane diff3 sở hữu). Không viết
// bản thứ hai ở đây — hai bộ dò khác nhau nghĩa là vị từ `noConflictMarkers`
// có thể xanh trên một file mà `merge --continue` vẫn coi là chưa giải.
import { hasConflictMarkers } from './conflict-markers.ts';

/** Đọc một tham số kiểu chuỗi. Thiếu hoặc sai kiểu ⇒ `null`, và vị từ trả `false`. */
function argString(args: Readonly<Record<string, unknown>> | undefined, key: string): string | null {
  const v = args?.[key];
  return typeof v === 'string' ? v : null;
}

function argNumber(args: Readonly<Record<string, unknown>> | undefined, key: string): number | null {
  const v = args?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function argBoolean(
  args: Readonly<Record<string, unknown>> | undefined,
  key: string,
): boolean | null {
  const v = args?.[key];
  return typeof v === 'boolean' ? v : null;
}

function argLines(args: Readonly<Record<string, unknown>> | undefined, key: string): Lines | null {
  const v = args?.[key];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as Lines;
  if (typeof v === 'string') return v.split('\n');
  return null;
}

/**
 * Phân giải một tên ref NGẮN (`main`, `origin/main`, `v1.0`) thành Oid.
 *
 * Vị từ nhận tên ngắn vì level viết bằng tay, và người soạn viết `main` chứ
 * không viết `refs/heads/main`. Thứ tự thử: nhánh → ref theo dõi → tag → HEAD.
 */
function resolveShortRef(repo: Repo, name: string): Oid | null {
  if (name === 'HEAD') return headOid(repo);
  return (
    repo.refs[branchRef(name)] ?? repo.refs[remoteRef(name)] ?? repo.refs[tagRef(name)] ?? null
  );
}

/** Mọi commit còn với tới được từ BẤT KỲ ref nào, cộng HEAD, stash, và pending. */
export function liveRoots(repo: Repo): readonly Oid[] {
  const roots: Oid[] = [];
  for (const ref of sortedKeys(repo.refs)) {
    const oid = repo.refs[ref];
    if (oid !== undefined) roots.push(oid);
  }
  const head = headOid(repo);
  if (head !== null) roots.push(head);
  for (const entry of repo.stash) roots.push(entry.oid);
  if (repo.pending !== null) roots.push(repo.pending.originalHead);
  return [...new Set(roots)].sort(compareKeys);
}

/** Commit mang message này, nếu có. Ưu tiên commit có `logicalTime` nhỏ nhất (bản gốc). */
function findByMessage(repo: Repo, message: string, onlyReachable: boolean): Oid | null {
  const pool = onlyReachable
    ? [...reachableFrom(repo.objects, liveRoots(repo))]
    : sortedKeys(repo.objects);
  let best: Oid | null = null;
  let bestTime = Number.POSITIVE_INFINITY;
  for (const oid of [...pool].sort(compareKeys)) {
    const commit = getCommit(repo.objects, oid);
    if (commit === null || commit.message !== message) continue;
    if (commit.logicalTime < bestTime) {
      bestTime = commit.logicalTime;
      best = oid;
    }
  }
  return best;
}

/**
 * Chữ ký HÌNH DẠNG của DAG, **bỏ qua Oid**.
 *
 * Bài rebase và cherry-pick tất yếu đổi Oid — đó là cả bài học — nên so bằng Oid
 * sẽ làm mọi lời giải đúng đều trượt. LGB gọi chế độ này là
 * `compareAllBranchesHashAgnostic` và nó là chế độ dùng nhiều nhất.
 *
 * Chữ ký dựng từ: với mỗi nhánh, chuỗi commit message theo cha thứ nhất, cộng
 * số cha của từng commit (để merge commit không trông giống commit thường).
 */
function graphSignature(repo: Repo): string {
  const parts: string[] = [];
  for (const name of branchNames(repo.refs)) {
    const oid = repo.refs[branchRef(name)];
    if (oid === undefined) continue;
    const chain = firstParentChain(repo.objects, oid);
    const desc = chain.map((c) => {
      const commit = getCommit(repo.objects, c);
      return commit === null ? '?' : `${commit.message}/${commit.parents.length}`;
    });
    parts.push(`${name}:${desc.join('>')}`);
  }
  return parts.sort(compareKeys).join('|');
}

/** Kết quả chấm MỘT objective. */
export interface ObjectiveResult {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
  readonly met: boolean;
}

/**
 * Chấm một objective trên thế giới hiện tại.
 *
 * `target` là thế giới ĐÍCH đã dựng sẵn từ `GitLevel.target`, hoặc `null` khi
 * level không dùng vị từ so hình dạng. Truyền vào thay vì dựng ở đây: dựng lại
 * cây đích cho từng objective của từng lần chấm là lãng phí, và bộ chấm bị gọi
 * sau MỖI lệnh.
 */
export function evaluatePredicate(
  world: GitWorld,
  target: GitWorld | null,
  check: GitPredicateName,
  args?: Readonly<Record<string, unknown>>,
): boolean {
  const repo = world.local;

  switch (check) {
    case 'graphShapeMatches': {
      if (target === null) return false;
      return graphSignature(repo) === graphSignature(target.local);
    }

    case 'refExists': {
      const ref = argString(args, 'ref');
      return ref !== null && resolveShortRef(repo, ref) !== null;
    }

    case 'refAbsent': {
      const ref = argString(args, 'ref');
      return ref !== null && resolveShortRef(repo, ref) === null;
    }

    case 'refsEqual': {
      const a = argString(args, 'a');
      const b = argString(args, 'b');
      if (a === null || b === null) return false;
      const oa = resolveShortRef(repo, a);
      const ob = resolveShortRef(repo, b);
      return oa !== null && oa === ob;
    }

    case 'refPointsAtMessage': {
      const ref = argString(args, 'ref');
      const message = argString(args, 'message');
      if (ref === null || message === null) return false;
      const oid = resolveShortRef(repo, ref);
      return oid !== null && getCommit(repo.objects, oid)?.message === message;
    }

    case 'headDetached': {
      const want = argBoolean(args, 'detached') ?? true;
      return isDetached(repo) === want;
    }

    case 'commitCount': {
      const ref = argString(args, 'ref');
      const count = argNumber(args, 'count');
      if (ref === null || count === null) return false;
      const oid = resolveShortRef(repo, ref);
      if (oid === null) return false;
      return firstParentChain(repo.objects, oid).length === count;
    }

    case 'historyLinear': {
      const ref = argString(args, 'ref');
      if (ref === null) return false;
      const oid = resolveShortRef(repo, ref);
      if (oid === null) return false;
      return firstParentChain(repo.objects, oid).every(
        (c) => (getCommit(repo.objects, c)?.parents.length ?? 0) <= 1,
      );
    }

    case 'hasMergeCommit': {
      const ref = argString(args, 'ref');
      if (ref === null) return false;
      const oid = resolveShortRef(repo, ref);
      if (oid === null) return false;
      return firstParentChain(repo.objects, oid).some(
        (c) => (getCommit(repo.objects, c)?.parents.length ?? 0) >= 2,
      );
    }

    case 'worktreeFileEquals': {
      const path = argString(args, 'path');
      const lines = argLines(args, 'lines');
      if (path === null || lines === null) return false;
      const actual = repo.worktree[path];
      if (actual === undefined) return false;
      return blobOid(actual) === blobOid(lines);
    }

    case 'noConflictMarkers': {
      const path = argString(args, 'path');
      if (path === null) return false;
      const actual = repo.worktree[path];
      // File không tồn tại thì KHÔNG đạt. Xoá file để "hết marker" không phải
      // một lời giải, và nếu vị từ này trả `true` cho file vắng mặt thì đó
      // chính là lời giải mà một người chơi mệt mỏi sẽ tìm ra.
      if (actual === undefined) return false;
      return !hasConflictMarkers(actual);
    }

    case 'worktreeFileExists': {
      const path = argString(args, 'path');
      const present = argBoolean(args, 'present') ?? true;
      if (path === null) return false;
      return Object.hasOwn(repo.worktree, path) === present;
    }

    case 'indexClean':
      return isIndexClean(repo);

    case 'worktreeClean':
      return isWorktreeClean(repo);

    case 'pathStaged': {
      const path = argString(args, 'path');
      if (path === null) return false;
      const staged = repo.index[path];
      const work = repo.worktree[path];
      if (staged === undefined || work === undefined) return false;
      return staged === blobOid(work);
    }

    case 'commitReachable': {
      const message = argString(args, 'message');
      return message !== null && findByMessage(repo, message, true) !== null;
    }

    case 'commitUnreachable': {
      const message = argString(args, 'message');
      if (message === null) return false;
      // Phải CÓ trong kho mà KHÔNG với tới được. Một commit chưa bao giờ tồn tại
      // cũng "không với tới được", và tính nó là đạt sẽ làm bài chương 3 qua
      // được bằng cách không làm gì cả.
      const inStore = findByMessage(repo, message, false);
      const live = findByMessage(repo, message, true);
      return inStore !== null && live === null;
    }

    case 'commitInStore': {
      const message = argString(args, 'message');
      if (message === null) return false;
      const oid = findByMessage(repo, message, false);
      return oid !== null && hasObject(repo.objects, oid);
    }

    case 'originRefPointsAtMessage': {
      const ref = argString(args, 'ref');
      const message = argString(args, 'message');
      if (ref === null || message === null || world.origin === null) return false;
      const oid = resolveShortRef(world.origin, ref);
      return oid !== null && getCommit(world.origin.objects, oid)?.message === message;
    }

    case 'trackingUpToDate': {
      const ref = argString(args, 'ref');
      if (ref === null || world.origin === null) return false;
      const tracking = repo.refs[remoteRef(`origin/${ref}`)];
      const actual = world.origin.refs[branchRef(ref)];
      return tracking !== undefined && tracking === actual;
    }

    case 'stashCount': {
      const count = argNumber(args, 'count');
      return count !== null && repo.stash.length === count;
    }

    case 'reflogHasOp': {
      const ref = argString(args, 'ref') ?? 'HEAD';
      const op = argString(args, 'op');
      if (op === null) return false;
      const full = ref === 'HEAD' ? 'HEAD' : branchRef(ref);
      return readReflog(repo, full).some((e) => e.op === op);
    }

    case 'noPendingOp':
      return repo.pending === null;

    case 'pullRequestState': {
      const number = argNumber(args, 'number');
      const state = argString(args, 'state');
      if (number === null || state === null) return false;
      return world.pullRequests.some((pr) => pr.number === number && pr.state === state);
    }

    case 'tagPointsAtMessage': {
      const tag = argString(args, 'tag');
      const message = argString(args, 'message');
      if (tag === null || message === null) return false;
      const oid = repo.refs[tagRef(tag)];
      return oid !== undefined && getCommit(repo.objects, oid)?.message === message;
    }
  }
}

/** Chấm toàn bộ objective của một level. */
export function evaluateObjectives(
  world: GitWorld,
  target: GitWorld | null,
  objectives: readonly GitObjective[],
): readonly ObjectiveResult[] {
  return objectives.map((o) => ({
    id: o.id,
    label: o.label,
    required: o.required,
    met: evaluatePredicate(world, target, o.check, o.args),
  }));
}

/**
 * Verdict kiểu OJ: `AC` khi mọi objective BẮT BUỘC đạt.
 *
 * `passedCount`/`totalCount` đếm **objective bắt buộc**, không đếm mục tiêu
 * thưởng — một người chơi đạt 4/4 bắt buộc và bỏ mục thưởng đã AC, và hiện
 * `4/6` cho họ là nói dối.
 */
export interface Verdict {
  readonly accepted: boolean;
  readonly passedCount: number;
  readonly totalCount: number;
  readonly failedIds: readonly string[];
  /** Mục tiêu thưởng đã đạt. Dùng để cộng điểm, không dùng để chặn. */
  readonly bonusMet: readonly string[];
}

export function verdictOf(results: readonly ObjectiveResult[]): Verdict {
  const required = results.filter((r) => r.required);
  const passed = required.filter((r) => r.met);
  return {
    accepted: required.length > 0 && passed.length === required.length,
    passedCount: passed.length,
    totalCount: required.length,
    failedIds: required.filter((r) => !r.met).map((r) => r.id),
    bonusMet: results.filter((r) => !r.required && r.met).map((r) => r.id),
  };
}

/**
 * Mọi tên vị từ, để test khẳng định hợp đồng và hiện thực khớp nhau HAI CHIỀU.
 *
 * Chiều lên: một tên trong `GitPredicateName` mà `evaluatePredicate` không xử ⇒
 * `switch` không vét cạn ⇒ **đỏ ở typecheck**, tự động, không cần test.
 *
 * Chiều xuống: một tên ở đây mà không còn trong union ⇒ đỏ ở typecheck. Mảng này
 * tồn tại để test đếm được và để bộ soạn level liệt kê được — không phải để
 * thay cho phép vét cạn.
 */
export const GIT_PREDICATE_NAMES: readonly GitPredicateName[] = [
  'graphShapeMatches',
  'refExists',
  'refAbsent',
  'refsEqual',
  'refPointsAtMessage',
  'headDetached',
  'commitCount',
  'historyLinear',
  'hasMergeCommit',
  'worktreeFileEquals',
  'noConflictMarkers',
  'worktreeFileExists',
  'indexClean',
  'worktreeClean',
  'pathStaged',
  'commitReachable',
  'commitUnreachable',
  'commitInStore',
  'originRefPointsAtMessage',
  'trackingUpToDate',
  'stashCount',
  'reflogHasOp',
  'noPendingOp',
  'pullRequestState',
  'tagPointsAtMessage',
];
