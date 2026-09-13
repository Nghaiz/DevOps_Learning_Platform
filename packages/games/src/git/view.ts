/**
 * `GitWorld` → `GitView`: ranh giới engine ↔ renderer.
 *
 * ⛔ **HAI renderer dùng CHUNG một `GitView`.** Renderer SVG 2D và renderer 3D
 * nhận đúng object này và phải ra **cùng tập node và cạnh** — đó là ô nghiệm thu
 * AC-B, và nó so TẬP chứ không so pixel.
 *
 * Hệ quả thiết kế: `GitView` là **thuần dữ liệu**. Không hàm, không tham chiếu
 * ngược về `GitWorld`, không `Map`, không `Set`. Nó phải serialize được (17.Q
 * xuất/nhập JSON) và so được bằng `toEqual` trong test.
 *
 * ⛔ Ở đây KHÔNG có toạ độ. Trục X, làn, và đường rẽ cạnh do `core/layout/` tính
 * từ `GitView`. Tách như vậy vì cùng một đồ thị được vẽ ở hai không gian khác
 * nhau (2D phẳng và 2.5D), và engine không được biết cái nào đang bật.
 */

import type {
  CommitAccent,
  CommitNodeView,
  FileCellView,
  FileStatus,
  GitEdgeView,
  GitView,
  GitWorld,
  Oid,
  RefBadgeView,
  Repo,
} from './contract.ts';
import { compareKeys, sortedKeys } from './deterministic.ts';
import { getCommit, reachableFrom } from './objects.ts';
import {
  allPaths,
  headOid,
  isBranch,
  isDetached,
  isRemoteRef,
  isTag,
  pathStatus,
  shortRefName,
} from './repo.ts';
import { liveRoots } from './predicates.ts';
import { shortOid } from './hash.ts';

/**
 * Commit nào vừa được tạo bởi lệnh cuối.
 *
 * Truyền vào chứ không suy ra: "mới nhất" không phải "vừa tạo". Sau
 * `reset --hard HEAD~1` thì commit có `logicalTime` lớn nhất là commit vừa bị
 * BỎ, và tô nó màu "vừa tạo" sẽ nói ngược hẳn với chuyện vừa xảy ra.
 */
export interface ViewHints {
  readonly freshOids?: readonly Oid[];
  readonly duplicateOf?: Readonly<Record<Oid, Oid>>;
  readonly conflictedOids?: readonly Oid[];
}

function accentFor(
  oid: Oid,
  headAt: Oid | null,
  reachable: boolean,
  hints: ViewHints,
): CommitAccent {
  if (hints.conflictedOids?.includes(oid) === true) return 'conflicted';
  if (!reachable) return 'orphaned';
  if (hints.duplicateOf !== undefined && Object.hasOwn(hints.duplicateOf, oid)) return 'duplicate';
  if (hints.freshOids?.includes(oid) === true) return 'fresh';
  if (oid === headAt) return 'head';
  return 'normal';
}

/**
 * Commit nào đáng vẽ.
 *
 * KHÔNG vẽ cả `ObjectStore`: nó chứa mọi tree và blob, và sau vài chục lệnh thì
 * cũng chứa hàng trăm commit trung gian của các lần rebase thử-rồi-bỏ. Vẽ hết
 * là một màn hình không đọc được.
 *
 * Vẽ: mọi commit với tới được, CỘNG những commit mồ côi mà `reflog` còn nhắc
 * tới. Vế thứ hai là cả chương 3 — commit "đã mất" phải NHÌN THẤY ĐƯỢC (mờ đi)
 * thì người chơi mới hiểu nó chưa biến mất. Một commit không ref nào trỏ tới và
 * cũng không reflog nào nhắc thì thật sự không còn đường nào tìm lại, nên không
 * vẽ cũng đúng.
 */
function visibleCommits(repo: Repo): readonly Oid[] {
  const live = reachableFrom(repo.objects, liveRoots(repo));
  const out = new Set<Oid>(live);

  for (const ref of sortedKeys(repo.reflog)) {
    for (const entry of repo.reflog[ref] ?? []) {
      if (getCommit(repo.objects, entry.to) !== null) out.add(entry.to);
      if (entry.from !== null && getCommit(repo.objects, entry.from) !== null) out.add(entry.from);
    }
  }

  // Tổ tiên của commit mồ côi cũng phải vẽ, nếu không đồ thị có node treo lơ
  // lửng không nối vào đâu cả.
  const withAncestors = reachableFrom(repo.objects, [...out].sort(compareKeys));
  return [...withAncestors].sort(compareKeys);
}

function nodesOf(
  repo: Repo,
  repoTag: 'local' | 'origin',
  hints: ViewHints,
): readonly CommitNodeView[] {
  const head = headOid(repo);
  const live = reachableFrom(repo.objects, liveRoots(repo));
  const out: CommitNodeView[] = [];

  for (const oid of visibleCommits(repo)) {
    const commit = getCommit(repo.objects, oid);
    if (commit === null) continue;
    const reachable = live.has(oid);
    out.push({
      oid,
      shortOid: shortOid(oid),
      message: commit.message,
      author: commit.author,
      parents: commit.parents,
      logicalTime: commit.logicalTime,
      reachable,
      repo: repoTag,
      accent: accentFor(oid, head, reachable, hints),
    });
  }

  // Sắp theo thời gian logic rồi Oid. Renderer KHÔNG được phụ thuộc thứ tự này
  // để vẽ đúng, nhưng nó phải ổn định để test so được bằng `toEqual` và để
  // `layoutDag` nhận cùng đầu vào ở mọi lần chạy.
  return out.sort((a, b) => {
    if (a.logicalTime !== b.logicalTime) return a.logicalTime - b.logicalTime;
    return compareKeys(a.oid, b.oid);
  });
}

function edgesOf(nodes: readonly CommitNodeView[], hints: ViewHints): readonly GitEdgeView[] {
  const present = new Set(nodes.map((n) => n.oid));
  const out: GitEdgeView[] = [];

  for (const node of nodes) {
    for (let i = 0; i < node.parents.length; i++) {
      const parent = node.parents[i];
      if (parent === undefined || !present.has(parent)) continue;
      out.push({
        from: node.oid,
        to: parent,
        // Cha thứ nhất là nhánh đang đứng; cha thứ hai trở đi là nhánh trộn
        // vào. Vẽ khác nhau để thấy được CHỖ hai nhánh gặp, chứ không chỉ thấy
        // rằng chúng có gặp.
        kind: i === 0 ? 'parent' : 'merge-parent',
      });
    }
  }

  for (const [copy, source] of Object.entries(hints.duplicateOf ?? {})) {
    if (present.has(copy) && present.has(source)) {
      out.push({ from: copy, to: source, kind: 'cherry-source' });
    }
  }

  return out.sort((a, b) => {
    const c = compareKeys(a.from, b.from);
    if (c !== 0) return c;
    const d = compareKeys(a.to, b.to);
    if (d !== 0) return d;
    return compareKeys(a.kind, b.kind);
  });
}

function refsOf(repo: Repo, repoTag: 'local' | 'origin'): readonly RefBadgeView[] {
  const currentRef = repo.head.type === 'ref' ? repo.head.ref : null;
  const out: RefBadgeView[] = [];

  for (const name of sortedKeys(repo.refs)) {
    const oid = repo.refs[name];
    if (oid === undefined) continue;
    const kind = isBranch(name)
      ? ('branch' as const)
      : isRemoteRef(name)
        ? ('remote' as const)
        : isTag(name)
          ? ('tag' as const)
          : ('head' as const);
    out.push({
      name,
      shortName: shortRefName(name),
      oid,
      kind,
      repo: repoTag,
      isCurrent: name === currentRef,
    });
  }

  // HEAD detached được vẽ như MỘT NHÃN RIÊNG bám thẳng vào commit.
  //
  // Đây là hình ảnh của cả bài G05: ở trạng thái thường HEAD dán lên một nhãn
  // nhánh, ở detached nó dán thẳng lên commit và không có nhánh nào ở giữa.
  // Người học phải NHÌN THẤY sự khác nhau đó, không phải đọc một dòng chữ báo.
  if (repo.head.type === 'detached') {
    out.push({
      name: 'HEAD',
      shortName: 'HEAD',
      oid: repo.head.oid,
      kind: 'head',
      repo: repoTag,
      isCurrent: true,
    });
  }

  return out;
}

function statusToCell(staged: string, unstaged: string): FileStatus {
  if (unstaged === 'untracked') return 'untracked';
  if (staged === 'added') return 'added';
  if (staged === 'deleted' || unstaged === 'deleted') return 'deleted';
  if (staged === 'modified' || unstaged === 'modified') return 'modified';
  return 'unchanged';
}

/**
 * Ba vùng, mỗi file một ô ở mỗi vùng nó có mặt.
 *
 * Ba vùng nhìn thấy ĐỒNG THỜI là điều kiện để dạy `reset --soft/--mixed/--hard`
 * (misfit MIT, design §3.5). Một giao diện chỉ hiện "đã sửa / chưa sửa" đã xoá
 * mất bài học trước khi bài học bắt đầu.
 */
function filesOf(repo: Repo): readonly FileCellView[] {
  const out: FileCellView[] = [];
  for (const path of allPaths(repo)) {
    const s = pathStatus(repo, path);
    if (Object.hasOwn(repo.worktree, path)) {
      out.push({ path, zone: 'worktree', status: statusToCell(s.staged, s.unstaged) });
    }
    if (Object.hasOwn(repo.index, path)) {
      out.push({ path, zone: 'index', status: statusToCell(s.staged, 'unchanged') });
    }
  }
  const head = headOid(repo);
  if (head !== null) {
    const tree = getCommit(repo.objects, head)?.tree;
    if (tree !== undefined) {
      for (const path of sortedKeys(repo.index)) {
        // Vùng HEAD hiện những gì đã commit. Dùng `allPaths` đã sắp nên thứ tự
        // ổn định.
        void path;
      }
    }
  }
  for (const path of sortedKeys(headContentsOf(repo))) {
    out.push({ path, zone: 'head', status: 'unchanged' });
  }
  return out.sort((a, b) => {
    const c = compareKeys(a.path, b.path);
    if (c !== 0) return c;
    return compareKeys(a.zone, b.zone);
  });
}

function headContentsOf(repo: Repo): Readonly<Record<string, unknown>> {
  const head = headOid(repo);
  if (head === null) return {};
  const commit = getCommit(repo.objects, head);
  if (commit === null) return {};
  const tree = repo.objects[commit.tree];
  if (tree === undefined || tree.kind !== 'tree') return {};
  const out: Record<string, unknown> = {};
  for (const entry of tree.entries) out[entry.path] = entry.oid;
  return out;
}

/** Dựng view. Thuần: cùng `world` + cùng `hints` ⇒ cùng kết quả, sâu tới từng phần tử. */
export function buildView(world: GitWorld, hints: ViewHints = {}): GitView {
  const localNodes = nodesOf(world.local, 'local', hints);
  const originNodes =
    world.origin === null ? [] : nodesOf(world.origin, 'origin', hints);

  const nodes = [...localNodes, ...originNodes];
  const edges = [
    ...edgesOf(localNodes, hints),
    ...edgesOf(originNodes, {}),
    ...mirrorEdges(localNodes, originNodes),
  ];

  return {
    nodes,
    edges,
    refs: [
      ...refsOf(world.local, 'local'),
      ...(world.origin === null ? [] : refsOf(world.origin, 'origin')),
    ],
    files: filesOf(world.local),
    head: world.local.head,
    detached: isDetached(world.local),
    pending: world.local.pending,
    hasOrigin: world.origin !== null,
    logicalTime: world.logicalTime,
  };
}

/**
 * Cạnh nối một commit local với bản y hệt ở origin.
 *
 * Hai kho là hai khối không gian TÁCH RỜI (design §3.5), và `push`/`fetch` là
 * vật thể di chuyển qua khoảng trống giữa chúng. Cạnh này là thứ cho renderer
 * biết vật thể bay từ đâu tới đâu.
 *
 * Cùng Oid ở hai kho là CÙNG MỘT commit theo nghĩa nội dung — đó là toàn bộ ý
 * nghĩa của địa chỉ hoá theo nội dung, và nó là lý do `push` chỉ cần gửi những
 * gì bên kia chưa có.
 */
function mirrorEdges(
  local: readonly CommitNodeView[],
  origin: readonly CommitNodeView[],
): readonly GitEdgeView[] {
  if (origin.length === 0) return [];
  const originOids = new Set(origin.map((n) => n.oid));
  return local
    .filter((n) => originOids.has(n.oid))
    .map((n) => ({ from: n.oid, to: n.oid, kind: 'remote-mirror' as const }))
    .sort((a, b) => compareKeys(a.from, b.from));
}
