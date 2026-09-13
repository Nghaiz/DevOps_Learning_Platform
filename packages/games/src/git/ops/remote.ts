/**
 * Kho từ xa: `clone` · `fetch` · `push` · `pull` · `remote`.
 *
 * Đây là tầng ĐẦU TIÊN trong `ops/` nhìn thấy `GitWorld` thay vì một `Repo`.
 * `basic.ts`, `reset.ts`, `stash.ts` cố ý không biết `origin` tồn tại; từ đây
 * trở đi thì biết, vì mọi lệnh trong file này đọc hoặc ghi CẢ HAI kho.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LANE NÀY LÀ CHỖ GAME KHÁC HẲN CÁC CÔNG CỤ DẠY GIT KHÁC
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design §3.1 đo trên mã nguồn Learn Git Branching: LGB **có** cờ `--force`
 * nhưng **không có hậu quả** — không commit nào biến mất, không ai mất việc.
 * Toàn bộ chương 2 (12 level) sống ở file này, và bài G20 ("force-push huỷ việc
 * đồng đội") là bài cả game được nhớ vì nó. Nên hai bất biến dưới đây không phải
 * chi tiết cài đặt, chúng LÀ sản phẩm:
 *
 * 1. **`push --force` làm mất việc thật.** Commit chỉ có ở origin sẽ không còn
 *    ref nào trỏ tới sau khi bị ghi đè. Chúng **ở lại `origin.objects`** — kho
 *    không bao giờ xoá — và chính sự ở lại đó là điều kiện để bài G31 (cứu việc
 *    bị force-push đè) giải được. Đừng "dọn" gì cả.
 * 2. **`fetch` KHÔNG đụng nhánh local.** Một `fetch` lỡ tay chạm
 *    `refs/heads/*`, `index` hay `worktree` sẽ xoá sạch sự khác nhau giữa
 *    `fetch` và `pull`, tức xoá luôn bài G15. Hàm `gitFetch` dưới đây chỉ ghi
 *    vào `objects` và `refs/remotes/*`, và test khẳng định cả ba vùng kia giữ
 *    nguyên **theo tham chiếu**, không chỉ theo giá trị.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HAI CHỖ MÔ HÌNH LỆCH GIT THẬT, CÓ CHỦ Ý
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **Upstream là thứ SUY RA, không phải thứ lưu.** git thật ghi
 * `branch.<tên>.merge` vào `.git/config`. `Repo` của hợp đồng không có chỗ chứa
 * config, và thêm một trường `upstream` sẽ là một trường **suy ra được** —
 * `rules/code-conventions.md` § "No Derived Fields" cấm đúng thứ đó. Nên ở đây:
 *
 *     nhánh `X` có upstream  ⟺  ref `refs/remotes/origin/X` tồn tại ở local
 *
 * Điều đó đúng với git thật ở chỗ quan trọng nhất (push lần đầu tạo ra ref theo
 * dõi), và làm `-u` thành một cờ **mô tả** chứ không phải một cờ có tác dụng
 * riêng: mọi `push` thành công đều đặt ref theo dõi. `-u` chỉ đổi câu thông báo
 * để người chơi thấy chuyện đó vừa xảy ra. Xem `PushOptions.setUpstream`.
 *
 * **Game có đúng MỘT remote, tên `origin`.** `GitWorld.origin` là một trường vị
 * trí, không phải một bản ghi `tên → kho`, nên `git remote rename` không biểu
 * diễn được và `git remote add upstream …` cũng vậy. `gitRemote` từ chối hai
 * lệnh đó bằng `not-allowed-here` kèm lời giải thích, chứ không giả vờ làm được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RÀNG BUỘC KẾ THỪA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Không `node:*` · không `Date.now()` / `Math.random()` (đồng hồ là tham số) ·
 * mọi phép lặp trên `Record` qua `deterministic.ts` · mọi lần đổi ref qua
 * `setRef`/`deleteRef` của `repo.ts` · lệnh hỏng trả trạng thái CŨ nguyên vẹn.
 */

import type {
  FilePath,
  GitError,
  GitObject,
  GitWorld,
  Lines,
  ObjectStore,
  Oid,
  OutputLine,
  RefName,
  Repo,
} from '../contract.ts';
import { sortedEntries, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import {
  commitContents,
  commitsBetween,
  getCommit,
  getTree,
  isAncestor,
  reachableSorted,
} from '../objects.ts';
import {
  blobOid,
  branchNames,
  branchRef,
  deleteRef,
  emptyRepo,
  headOid,
  isRemoteRef,
  remoteRef,
  setIndex,
  setRef,
  setWorktree,
  shortRefName,
  tagNames,
  tagRef,
} from '../repo.ts';
import { line } from './basic.ts';
import type { RepoOpResult } from './basic.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 0. KẾT QUẢ Ở TẦNG THẾ GIỚI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kết quả một thao tác chạm CẢ HAI kho.
 *
 * ⚠ Khác `RepoOpResult` của `basic.ts` (và `GitOpResult` của `reset.ts` — hai
 * lane khai trùng một kiểu, lead nên gom) đúng một chỗ: nó mang `GitWorld`.
 * Không thao tác nào ở đây biểu diễn được bằng một `Repo` duy nhất, vì `push`
 * đọc local ghi origin và `fetch` đọc origin ghi local.
 *
 * ⛔ Bất biến: `error !== null` ⇒ `world` là **tham chiếu đầu vào**. Ngoại lệ có
 * tên duy nhất là `merge-conflict` đi ra từ `gitPull` (thao tác merge được tiêm
 * vào đã đặt pending op) — đúng ngoại lệ mà hợp đồng §5 nêu đích danh. `pr
 * merge` thì KHÔNG rơi vào ngoại lệ đó: xem chú thích ở `pull-request.ts`.
 */
export interface WorldOpResult {
  readonly world: GitWorld;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
}

export function worldOk(world: GitWorld, output: readonly OutputLine[] = []): WorldOpResult {
  return { world, output, error: null };
}

/** Hỏng ⇒ thế giới CŨ, không đổi. Đừng truyền vào đây một biến đã biến đổi dở. */
export function worldFail(
  world: GitWorld,
  error: GitError,
  output: readonly OutputLine[] = [],
): WorldOpResult {
  return { world, output, error };
}

/** Tên remote duy nhất game có. Xem chú thích đầu file. */
export const DEFAULT_REMOTE = 'origin';

/** `main` → `refs/remotes/origin/main`. */
export function trackingRef(branch: string): RefName {
  return remoteRef(`${DEFAULT_REMOTE}/${branch}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CHUYỂN OBJECT GIỮA HAI KHO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mọi Oid cần để đọc được lịch sử từ `roots`: commit, tree của chúng, và blob
 * trong từng tree.
 *
 * `reachableFrom` của `objects.ts` chỉ đi trên **commit** — đúng cho câu hỏi
 * reachability, thiếu cho câu hỏi "chép gì sang kho kia". Một `push` chỉ chép
 * commit sẽ để lại tree không giải được ở đầu bên kia, và triệu chứng là một
 * commit rỗng hiện ra trong đồ thị thay vì một lỗi.
 */
function objectClosure(source: ObjectStore, roots: readonly Oid[]): readonly Oid[] {
  const out: Oid[] = [];
  for (const commitOid of reachableSorted(source, roots)) {
    out.push(commitOid);
    const commit = getCommit(source, commitOid);
    if (commit === null) continue;
    out.push(commit.tree);
    const tree = getTree(source, commit.tree);
    if (tree === null) continue;
    for (const entry of tree.entries) out.push(entry.oid);
  }
  return out;
}

/**
 * Chép bao đóng object của `roots` từ `source` sang `target`.
 *
 * Trả về CHÍNH `target` khi không có gì để chép — giữ tham chiếu cũ là thứ làm
 * test "fetch không đổi gì" khẳng định được bằng `toBe` thay vì `toEqual`.
 */
function copyObjects(
  target: ObjectStore,
  source: ObjectStore,
  roots: readonly Oid[],
): ObjectStore {
  const added: Record<Oid, GitObject> = {};
  let any = false;
  for (const oid of objectClosure(source, roots)) {
    if (Object.hasOwn(target, oid) || Object.hasOwn(added, oid)) continue;
    const object = source[oid];
    if (object === undefined) continue;
    added[oid] = object;
    any = true;
  }
  return any ? { ...target, ...added } : target;
}

/**
 * Kho object hợp nhất của hai bên, dùng cho các phép hỏi về đồ thị.
 *
 * Cần vì một phép kiểm tổ tiên trước khi `push` phải nhìn thấy cả commit của
 * local lẫn commit của origin — mà người chơi CHƯA `fetch` thì local không có
 * commit của origin. Đây là kho chỉ để TÍNH, không bao giờ đi vào trạng thái.
 */
function joinedStore(a: Repo, b: Repo): ObjectStore {
  return { ...a.objects, ...b.objects };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CLONE
// ═══════════════════════════════════════════════════════════════════════════

export interface CloneOptions {
  readonly logicalTime: number;
  /** Nhánh sẽ được tạo ở local. Mặc định `'main'`, lùi về nhánh đầu của origin. */
  readonly defaultBranch?: string | undefined;
}

/**
 * Dựng một kho local từ một kho origin — phép biến đổi thuần, không biết
 * `GitWorld`.
 *
 * ## Clone tạo ĐÚNG MỘT nhánh local, và đó là cả bài G13
 *
 * origin có `main`, `feature-a`, `feature-b` thì sau `git clone` bạn có **một**
 * nhánh local (`main`) và **ba** ref theo dõi (`origin/main`, `origin/feature-a`,
 * `origin/feature-b`). Người mới hầu như luôn tưởng ngược lại, rồi gõ `git
 * branch` thấy đúng một dòng và kết luận là clone bị lỗi.
 *
 * Sự lệch đó không phải chi tiết vụn: nó là lý do `git switch feature-a` hoạt
 * động được dù `feature-a` "chưa có" — git tự tạo nhánh local bám vào ref theo
 * dõi cùng tên.
 *
 * Tag thì chép hết, đúng như git thật (`git clone` lấy mọi tag).
 */
export function cloneRepo(origin: Repo, options: CloneOptions): Repo {
  const preferred = options.defaultBranch ?? 'main';
  const originBranches = branchNames(origin.refs);
  const defaultBranch = originBranches.includes(preferred)
    ? preferred
    : (originBranches[0] ?? preferred);

  const stamp = {
    op: 'clone',
    message: `clone: lấy về từ ${DEFAULT_REMOTE}`,
    logicalTime: options.logicalTime,
  };

  // Chép TOÀN BỘ kho object của origin. git thật cũng vậy: clone kéo cả lịch sử
  // chứ không chỉ nhánh mặc định, và đó là điều kiện để `git switch feature-a`
  // ngay sau clone chạy được mà không cần gọi mạng lần nữa.
  let repo: Repo = { ...emptyRepo(defaultBranch), objects: { ...origin.objects } };

  for (const branch of originBranches) {
    const oid = origin.refs[branchRef(branch)];
    if (oid === undefined) continue;
    repo = setRef(repo, trackingRef(branch), oid, stamp);
  }
  for (const tag of tagNames(origin.refs)) {
    const oid = origin.refs[tagRef(tag)];
    if (oid === undefined) continue;
    repo = setRef(repo, tagRef(tag), oid, stamp);
  }

  const tip = origin.refs[branchRef(defaultBranch)];
  if (tip === undefined) return repo;

  // Nhánh local đặt SAU ref theo dõi để dòng reflog của HEAD nằm đúng chỗ: mục
  // mới nhất phải là lần HEAD tới được commit, không phải lần một ref theo dõi
  // được ghi.
  repo = setRef(repo, branchRef(defaultBranch), tip, stamp);

  const contents = commitContents(repo.objects, tip);
  const index: Record<FilePath, Oid> = {};
  for (const [path, lines] of sortedEntries(contents)) index[path] = blobOid(lines);
  return setWorktree(setIndex(repo, index), contents);
}

/**
 * `git clone` ở tầng thế giới.
 *
 * Level dựng sẵn `origin` và để `local` trống; người chơi gõ `git clone` để
 * thấy chuyện gì thật sự xảy ra. Kho local đã có lịch sử thì từ chối — git thật
 * clone vào một thư mục mới, và ở đây "thư mục mới" là kho rỗng.
 */
export function gitClone(world: GitWorld, options: CloneOptions): WorldOpResult {
  const origin = world.origin;
  if (origin === null) return worldFail(world, noRemoteError('clone'));

  if (branchNames(world.local.refs).length > 0) {
    return worldFail(
      world,
      gitError(
        'not-allowed-here',
        '`git clone` không chạy được trong một kho đã có lịch sử.',
        'Kho local hiện tại đã có branch và commit. git thật clone vào một THƯ MỤC MỚI; ở đây "thư mục mới" nghĩa là một kho chưa có ref nào.',
        'Level này cho bạn một kho sẵn rồi — thử `git remote -v` để xem nó đang nối với origin nào, rồi `git fetch` để lấy commit mới về.',
      ),
    );
  }

  const local = cloneRepo(origin, options);
  const branches = branchNames(local.refs);
  const tracking = sortedKeys(local.refs).filter(isRemoteRef).map(shortRefName);

  const output: OutputLine[] = [
    line(`Đang chép kho từ ${DEFAULT_REMOTE}…`, 'plain'),
    line(
      `Đã lấy về ${tracking.length} nhánh: ${tracking.map((name) => `\`${name}\``).join(', ')}.`,
      'success',
    ),
    line(
      `Nhưng ở máy bạn chỉ có ĐÚNG MỘT branch local: ${branches.map((b) => `\`${b}\``).join(', ')}.`,
      'warn',
    ),
    line(
      'Đó không phải lỗi. `origin/feature-x` là thứ local NHỚ về origin; branch local chỉ ra đời khi bạn `git switch feature-x`.',
      'hint',
    ),
  ];
  return worldOk({ ...world, local }, output);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. FETCH
// ═══════════════════════════════════════════════════════════════════════════

export interface FetchOptions {
  readonly logicalTime: number;
  /** Bỏ trống = `origin`. Tên khác `origin` là lỗi — game chỉ có một remote. */
  readonly remote?: string | undefined;
  /** Bỏ trống = mọi nhánh của origin. */
  readonly branch?: string | undefined;
}

/**
 * `git fetch` — **chỉ** cập nhật ref theo dõi.
 *
 * ⛔ ĐÂY LÀ HÀM DỄ LÀM SAI NHẤT TRONG CẢ LANE. Ba vùng sau phải đi ra y nguyên
 * **theo tham chiếu**: `refs/heads/*`, `index`, `worktree`. Cộng thêm `head`,
 * `stash`, `pending`, `bisect`.
 *
 * Vì sao nghiêm đến thế: khác biệt giữa `fetch` và `pull` là toàn bộ bài G15, và
 * là thứ người học hiểu sai lâu nhất trong cả git. Một `fetch` "tiện tay" cập
 * nhật luôn nhánh hiện tại sẽ làm hai lệnh trở thành một, và bài học biến mất mà
 * không test nào ngoài test của chính hàm này đỏ.
 *
 * Hệ quả người chơi thấy ngay: sau `fetch`, `git status` nói "nhánh của bạn đi
 * sau origin/main N commit" — thông tin MỚI, trạng thái CŨ.
 *
 * Ref theo dõi không đổi giá trị thì **không ghi reflog**: git thật cũng chỉ ghi
 * khi ref dịch chuyển, và một dòng reflog mỗi lần gõ `fetch` sẽ làm chương 3
 * nhiễu đúng chỗ nó cần sạch.
 */
export function gitFetch(world: GitWorld, options: FetchOptions): WorldOpResult {
  const origin = world.origin;
  if (origin === null) return worldFail(world, noRemoteError('fetch'));

  const remoteError = checkRemoteName(options.remote, 'fetch');
  if (remoteError !== null) return worldFail(world, remoteError);

  const available = branchNames(origin.refs);
  if (options.branch !== undefined && !available.includes(options.branch)) {
    return worldFail(world, branchMissingOnRemoteError(options.branch, available));
  }
  const wanted = options.branch === undefined ? available : [options.branch];

  let local = world.local;
  const updated: string[] = [];

  for (const branch of wanted) {
    const oid = origin.refs[branchRef(branch)];
    if (oid === undefined) continue;

    local = { ...local, objects: copyObjects(local.objects, origin.objects, [oid]) };

    const ref = trackingRef(branch);
    const before = local.refs[ref] ?? null;
    if (before === oid) continue;

    local = setRef(local, ref, oid, {
      op: 'fetch',
      message: `fetch ${DEFAULT_REMOTE}: ${branch}`,
      logicalTime: options.logicalTime,
    });
    updated.push(
      `${DEFAULT_REMOTE}/${branch}  ${before === null ? '[mới]' : shortOid(before)} -> ${shortOid(oid)}`,
    );
  }

  if (updated.length === 0) {
    return worldOk({ ...world, local }, [
      line(`Đã cập nhật rồi — ${DEFAULT_REMOTE} không có gì mới.`, 'plain'),
    ]);
  }

  const output: OutputLine[] = [
    line(`Từ ${DEFAULT_REMOTE}`, 'plain'),
    ...updated.map((text) => line(`   ${text}`, 'success')),
    line(
      'Chỉ ref theo dõi đổi. Branch, index và worktree của bạn KHÔNG bị đụng tới — `fetch` chỉ mang thông tin về, không trộn gì cả.',
      'hint',
    ),
  ];
  return worldOk({ ...world, local }, output);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. PUSH
// ═══════════════════════════════════════════════════════════════════════════

export interface PushOptions {
  readonly logicalTime: number;
  readonly remote?: string | undefined;
  /** Bỏ trống = branch HEAD đang đứng. HEAD tách rời thì đây là lỗi. */
  readonly branch?: string | undefined;
  /** Ghi đè, KHÔNG kiểm gì. Đây là cờ làm mất việc của đồng đội (G20). */
  readonly force?: boolean | undefined;
  /** Ghi đè, nhưng chỉ khi ref theo dõi của bạn còn khớp origin thật (G21). */
  readonly forceWithLease?: boolean | undefined;
  /**
   * Chỉ đổi CÂU THÔNG BÁO. Mọi `push` thành công đều đặt ref theo dõi, vì trong
   * mô hình này "có upstream" nghĩa là "ref theo dõi tồn tại" — xem chú thích
   * đầu file.
   */
  readonly setUpstream?: boolean | undefined;
  /** `--delete`: xoá branch TRÊN origin, và bỏ luôn ref theo dõi ở local. */
  readonly deleteRemote?: boolean | undefined;
}

/** Phán quyết cho một lần push, tách riêng để `bot.ts` dùng lại nguyên vẹn. */
export type PushDecision =
  | { readonly kind: 'up-to-date' }
  /** Branch chưa có trên origin. */
  | { readonly kind: 'create' }
  | { readonly kind: 'fast-forward' }
  /** Ghi đè: có commit chỉ-có-ở-origin sắp mất ref. */
  | { readonly kind: 'forced'; readonly orphaned: readonly Oid[] }
  | { readonly kind: 'rejected'; readonly error: GitError };

export interface PushDecisionInput {
  readonly store: ObjectStore;
  readonly branch: string;
  readonly localOid: Oid;
  readonly remoteOid: Oid | null;
  /** Ref theo dõi ở local — "bản origin mà bạn TƯỞNG mình đang ghi đè". */
  readonly leaseOid: Oid | null;
  readonly force: boolean;
  readonly forceWithLease: boolean;
}

/**
 * Quyết định một lần push mà KHÔNG đụng trạng thái.
 *
 * Tách ra vì ba chỗ cần đúng phán quyết này: `gitPush`, bot đồng đội, và test.
 * Gộp nó vào `gitPush` sẽ buộc bot phải đi qua một hàm trả `WorldOpResult` rồi
 * vứt output đi — và tệ hơn, hai đường push sẽ trôi khác nhau theo thời gian.
 *
 * ## Thứ tự kiểm: lease TRƯỚC fast-forward, và đó không phải tuỳ tiện
 *
 * `--force-with-lease` là một điều kiện về **origin đang ở đâu**, không phải một
 * điều kiện về hình dạng lịch sử. git thật từ chối ngay cả một push
 * fast-forward khi lease lệch, vì ý nghĩa của cờ là "tôi chỉ ghi đè cái tôi đã
 * nhìn thấy". Đảo thứ tự sẽ làm `--force-with-lease` im lặng đúng ở tình huống
 * bài G21 muốn nó lên tiếng.
 */
export function decidePush(input: PushDecisionInput): PushDecision {
  const { store, branch, localOid, remoteOid, leaseOid } = input;

  if (input.forceWithLease && leaseOid !== remoteOid) {
    return { kind: 'rejected', error: staleLeaseError(branch, leaseOid, remoteOid, store) };
  }
  if (remoteOid === null) return { kind: 'create' };
  if (remoteOid === localOid) return { kind: 'up-to-date' };
  if (isAncestor(store, remoteOid, localOid)) return { kind: 'fast-forward' };

  if (!input.force && !input.forceWithLease) {
    return { kind: 'rejected', error: nonFastForwardError(branch, localOid, remoteOid, store) };
  }
  // Commit có ở origin mà KHÔNG có trong lịch sử local — chính là thứ sắp mất
  // chỗ trỏ tới. Chúng ở lại `objects` mãi mãi; đó là điều kiện của bài G31.
  return { kind: 'forced', orphaned: commitsBetween(store, localOid, remoteOid) };
}

/**
 * Đặt một branch của origin về `oid` và đồng bộ ref theo dõi ở local.
 *
 * Dùng chung cho `gitPush` và cho bot. Hàm này KHÔNG kiểm gì — mọi phán quyết đã
 * nằm ở `decidePush`.
 *
 * ⛔ Không có chỗ nào ở đây xoá phần tử khỏi `objects`, kể cả khi ghi đè. Đó là
 * bất biến của cả engine và là điều kiện tồn tại của chương 3.
 */
export interface PushApplyInput {
  readonly branch: string;
  readonly oid: Oid;
  /** Kho có sẵn object cần chép sang origin — local của người chơi, hoặc kho tạm của bot. */
  readonly source: Repo;
  readonly logicalTime: number;
  readonly op: string;
  readonly message: string;
}

/**
 * Ghi một branch của origin, chép kèm object cần thiết. **Chỉ đụng origin.**
 *
 * ⛔ Tách khỏi `applyPush` vì bot đồng đội PHẢI dùng bản này. Một bot push mà
 * cũng cập nhật ref theo dõi của NGƯỜI CHƠI sẽ làm `--force-with-lease` của họ
 * đi qua trót lọt — tức là xoá thẳng bài G21, vì lease chỉ có nghĩa khi nó là
 * thứ người chơi đã nhìn thấy bằng `fetch` của chính họ. Đó là loại lỗi không
 * làm test nào khác đỏ.
 */
export function writeBranchOnOrigin(origin: Repo, input: PushApplyInput): Repo {
  const withObjects: Repo = {
    ...origin,
    objects: copyObjects(origin.objects, input.source.objects, [input.oid]),
  };
  return setRef(withObjects, branchRef(input.branch), input.oid, {
    op: input.op,
    message: input.message,
    logicalTime: input.logicalTime,
  });
}

/** Push của NGƯỜI CHƠI: ghi origin, rồi kéo ref theo dõi của local đi theo. */
export function applyPush(world: GitWorld, input: PushApplyInput): GitWorld {
  const origin = world.origin;
  if (origin === null) return world;

  const nextOrigin = writeBranchOnOrigin(origin, input);

  // Ref theo dõi ở LOCAL đi theo: sau một push thành công, local ĐÃ nhìn thấy
  // origin ở vị trí mới. Bỏ bước này thì lần `--force-with-lease` kế tiếp sẽ từ
  // chối chính người vừa push.
  const nextLocal = setRef(world.local, trackingRef(input.branch), input.oid, {
    op: 'update-ref',
    message: `${input.op}: ${DEFAULT_REMOTE}/${input.branch}`,
    logicalTime: input.logicalTime,
  });

  return { ...world, local: nextLocal, origin: nextOrigin };
}

/** Kho object hợp nhất hai kho — xuất ra để `bot.ts` hỏi về đồ thị trước khi push. */
export function unionStore(a: Repo, b: Repo): ObjectStore {
  return joinedStore(a, b);
}

/** `git push`. */
export function gitPush(world: GitWorld, options: PushOptions): WorldOpResult {
  const origin = world.origin;
  if (origin === null) return worldFail(world, noRemoteError('push'));

  const remoteError = checkRemoteName(options.remote, 'push');
  if (remoteError !== null) return worldFail(world, remoteError);

  const branch = options.branch ?? currentBranch(world.local);
  if (branch === null) return worldFail(world, detachedPushError(world.local));

  if (options.deleteRemote === true) return pushDelete(world, origin, branch, options);

  const localOid = world.local.refs[branchRef(branch)] ?? null;
  if (localOid === null) {
    return worldFail(world, branchMissingLocallyError(branch, branchNames(world.local.refs)));
  }

  const store = joinedStore(world.local, origin);
  const decision = decidePush({
    store,
    branch,
    localOid,
    remoteOid: origin.refs[branchRef(branch)] ?? null,
    leaseOid: world.local.refs[trackingRef(branch)] ?? null,
    force: options.force === true,
    forceWithLease: options.forceWithLease === true,
  });

  if (decision.kind === 'rejected') return worldFail(world, decision.error);

  if (decision.kind === 'up-to-date') {
    return worldOk(world, [line('Mọi thứ đã ở trên origin rồi — không có gì để đẩy.', 'plain')]);
  }

  const next = applyPush(world, {
    branch,
    oid: localOid,
    source: world.local,
    logicalTime: options.logicalTime,
    op: 'push',
    message:
      decision.kind === 'forced'
        ? `push --force: ${branch} -> ${DEFAULT_REMOTE}/${branch}`
        : `push: ${branch} -> ${DEFAULT_REMOTE}/${branch}`,
  });

  return worldOk(next, pushOutput(branch, localOid, decision, options));
}

function pushOutput(
  branch: string,
  localOid: Oid,
  decision: PushDecision,
  options: PushOptions,
): readonly OutputLine[] {
  const out: OutputLine[] = [line(`Tới ${DEFAULT_REMOTE}`, 'plain')];

  if (decision.kind === 'create') {
    out.push(line(`   [branch mới]   ${branch} -> ${branch}`, 'success'));
  } else if (decision.kind === 'fast-forward') {
    out.push(line(`   ${branch} -> ${branch}  (${shortOid(localOid)})`, 'success'));
  } else if (decision.kind === 'forced') {
    out.push(line(`   + ${branch} -> ${branch}  (ghi đè)`, 'warn'));
    if (decision.orphaned.length > 0) {
      out.push(
        line(
          `⚠ ${decision.orphaned.length} commit trên origin vừa mất chỗ trỏ tới: ${decision.orphaned
            .map(shortOid)
            .join(', ')}.`,
          'error',
        ),
      );
      out.push(
        line(
          'Chúng CHƯA bị xoá — object vẫn nằm trong kho origin, chỉ là không branch nào với tới được nữa. Đó là lý do việc bị force-push đè vẫn cứu được.',
          'hint',
        ),
      );
    }
  }

  if (options.setUpstream === true) {
    out.push(
      line(
        `Branch \`${branch}\` giờ theo dõi \`${DEFAULT_REMOTE}/${branch}\` — lần sau \`git push\` trống là đủ.`,
        'hint',
      ),
    );
  }
  return out;
}

function pushDelete(
  world: GitWorld,
  origin: Repo,
  branch: string,
  options: PushOptions,
): WorldOpResult {
  const ref = branchRef(branch);
  if (!Object.hasOwn(origin.refs, ref)) {
    return worldFail(world, branchMissingOnRemoteError(branch, branchNames(origin.refs)));
  }
  const nextOrigin = deleteRef(origin, ref);
  const nextLocal = deleteRef(world.local, trackingRef(branch));
  void options;

  return worldOk({ ...world, local: nextLocal, origin: nextOrigin }, [
    line(`Tới ${DEFAULT_REMOTE}`, 'plain'),
    line(`   - [đã xoá]   ${branch}`, 'warn'),
    line(
      'Branch mất ở phía origin, nên mọi người khác cũng mất nó ở lần fetch kế tiếp. Commit thì vẫn còn trong kho origin.',
      'hint',
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. PULL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `git merge <theirs>` do lane `ops/merge.ts` cấp.
 *
 * ⛔ Lane này KHÔNG hiện thực merge, và nhận nó qua tham số là chủ ý chứ không
 * phải tạm bợ: `pull` = `fetch` + `merge`, nên hiện thực merge lần thứ hai ở đây
 * là vi phạm SSOT theo cách tệ nhất — hai bộ luật diff3 sẽ trôi khác nhau, và
 * triệu chứng là `git pull` giải xung đột khác `git merge` ở đúng một hunk.
 *
 * ⚠ Hình dạng này CỐ Ý không phải chữ ký của `gitMerge`. `gitMerge` tách đích và
 * ngữ cảnh làm hai tham số; ở đây gộp làm một, và `dispatch.ts` giữ bộ chuyển
 * hai dòng giữa chúng. Cái giá là hai dòng ở chỗ ráp; cái mua được là
 * `ops/remote.ts` KHÔNG import `ops/merge.ts` — nên hai lane test được độc lập,
 * và file này không đỏ theo mỗi lần lane merge đổi chữ ký nội bộ.
 *
 * Kiểu trả về là cấu trúc `{ repo, output, error }` — khớp cả `RepoOpResult` của
 * `basic.ts` lẫn `GitOpResult` của `reset.ts`, nên lane merge chọn kiểu nào cũng
 * gắn vào được.
 */
export type MergeIntoHead = (
  repo: Repo,
  options: {
    readonly theirs: Oid;
    readonly theirsLabel: string;
    readonly logicalTime: number;
    readonly author: string;
  },
) => RepoOpResult;

/** `git rebase <onto>` do lane `ops/rebase.ts` cấp. Xem chú thích `MergeIntoHead`. */
export type RebaseOntoHead = (
  repo: Repo,
  options: {
    readonly onto: Oid;
    readonly ontoLabel: string;
    readonly logicalTime: number;
    readonly author: string;
  },
) => RepoOpResult;

export interface PullDeps {
  readonly merge: MergeIntoHead;
  readonly rebase: RebaseOntoHead;
}

export interface PullOptions {
  readonly logicalTime: number;
  readonly author: string;
  readonly remote?: string | undefined;
  readonly branch?: string | undefined;
  readonly rebase?: boolean | undefined;
}

/**
 * `git pull` = `git fetch` rồi trộn.
 *
 * Bài G17: `pull` không phải một lệnh nguyên khối, nó là hai lệnh dán lại. Hiểu
 * được điều đó là hiểu vì sao `pull` đôi khi đẻ ra một commit merge mà bạn không
 * yêu cầu — và vì sao `--rebase` chữa được chuyện đó.
 *
 * Nhánh CHƯA SINH RA được xử ngay tại đây thay vì đẩy cho merge: khi local chưa
 * có commit nào thì không có "ba ngả" nào để trộn cả, chỉ có việc đặt ref và nạp
 * nội dung. Gọi merge với `ours` rỗng sẽ ra đúng kết quả nhưng qua một đường
 * vòng mà không ai đọc hiểu được.
 */
export function gitPull(world: GitWorld, options: PullOptions, deps: PullDeps): WorldOpResult {
  if (world.origin === null) return worldFail(world, noRemoteError('pull'));

  if (world.local.pending !== null) {
    return worldFail(
      world,
      gitError(
        'operation-in-progress',
        '`git pull` không chạy được khi còn một thao tác dở dang.',
        `Repo đang kẹt ở giữa một \`${world.local.pending.kind}\`. Kéo thêm commit về lúc này sẽ chồng hai thao tác lên nhau, và không còn đường lùi rõ ràng cho cái nào cả.`,
        'Giải quyết cái đang dở trước: `--continue` khi đã sửa xong, hoặc `--abort` để quay về trạng thái trước đó.',
      ),
    );
  }

  const fetched = gitFetch(world, {
    logicalTime: options.logicalTime,
    ...(options.remote === undefined ? {} : { remote: options.remote }),
    ...(options.branch === undefined ? {} : { branch: options.branch }),
  });
  if (fetched.error !== null) return fetched;

  const branch = options.branch ?? currentBranch(fetched.world.local);
  if (branch === null) return worldFail(world, detachedPullError());

  const local = fetched.world.local;
  const upstream = local.refs[trackingRef(branch)] ?? null;
  if (upstream === null) return worldFail(world, noUpstreamError(branch, local));

  const head = local.refs[branchRef(branch)] ?? null;

  // ── Nhánh chưa sinh ra ──
  if (head === null) {
    const adopted = adoptCommit(local, branchRef(branch), upstream, options.logicalTime);
    return worldOk({ ...fetched.world, local: adopted }, [
      ...fetched.output,
      line(`Branch \`${branch}\` vừa ra đời tại ${shortOid(upstream)}.`, 'success'),
    ]);
  }

  if (head === upstream) {
    return worldOk(fetched.world, [
      ...fetched.output,
      line('Đã cập nhật rồi — không có gì để trộn.', 'plain'),
    ]);
  }

  const label = `${DEFAULT_REMOTE}/${branch}`;
  const merged =
    options.rebase === true
      ? deps.rebase(local, {
          onto: upstream,
          ontoLabel: label,
          logicalTime: options.logicalTime,
          author: options.author,
        })
      : deps.merge(local, {
          theirs: upstream,
          theirsLabel: label,
          logicalTime: options.logicalTime,
          author: options.author,
        });

  const next: GitWorld = { ...fetched.world, local: merged.repo };
  const output = [...fetched.output, ...merged.output];

  // ⚠ Ngoại lệ CÓ TÊN của hợp đồng §5: `merge-conflict` đi ra kèm thế giới ĐÃ
  // đổi (pending op đã được đặt). Không được nuốt nó thành `worldFail(world, …)`
  // — làm thế thì `git merge --continue` sau đó không có gì để tiếp tục.
  return merged.error === null
    ? worldOk(next, output)
    : { world: next, output, error: merged.error };
}

/**
 * Đặt một ref chưa tồn tại về một commit và nạp index + worktree theo nó.
 *
 * Chỉ dùng cho nhánh chưa sinh ra. Không phải checkout: không có gì để bỏ đi,
 * nên không có phép kiểm "worktree bẩn" nào ở đây.
 */
function adoptCommit(repo: Repo, ref: RefName, oid: Oid, logicalTime: number): Repo {
  const moved = setRef(repo, ref, oid, {
    op: 'pull',
    message: `pull: nhánh ra đời tại ${shortOid(oid)}`,
    logicalTime,
  });
  const contents = commitContents(moved.objects, oid);
  const index: Record<FilePath, Oid> = {};
  for (const [path, lines] of sortedEntries(contents)) index[path] = blobOid(lines);
  return setWorktree(setIndex(moved, index), contents);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. REMOTE
// ═══════════════════════════════════════════════════════════════════════════

export type RemoteAction = 'list' | 'add' | 'remove' | 'rename' | 'show';

export interface RemoteOptions {
  readonly action: RemoteAction;
  readonly logicalTime: number;
  readonly name?: string | undefined;
  readonly url?: string | undefined;
  readonly newName?: string | undefined;
  readonly verbose?: boolean | undefined;
}

/**
 * `git remote` — tối giản có chủ ý.
 *
 * Game có đúng một remote tên `origin` (xem chú thích đầu file), nên `add` một
 * tên khác và `rename` đều từ chối thẳng bằng `not-allowed-here` kèm lời giải
 * thích. Giả vờ làm được rồi hỏng ngầm ở một level khác thì tệ hơn nhiều.
 */
export function gitRemote(world: GitWorld, options: RemoteOptions): WorldOpResult {
  switch (options.action) {
    case 'list':
      return remoteList(world, options.verbose === true);
    case 'show':
      return remoteShow(world, options.name ?? DEFAULT_REMOTE);
    case 'add':
      return remoteAdd(world, options.name ?? '');
    case 'remove':
      return remoteRemove(world, options.name ?? '');
    case 'rename':
      return worldFail(
        world,
        gitError(
          'not-allowed-here',
          '`git remote rename` không có trong game.',
          'Thế giới của game có đúng MỘT remote và nó luôn tên `origin` — cái tên đó là vị trí trong mô hình, không phải một giá trị lưu ở đâu đó. Đổi tên nó sẽ làm mọi ref `origin/*` trỏ vào hư không.',
          'Trên git thật thì `git remote rename <cũ> <mới>` chạy được; ở đây bạn cứ dùng `origin`.',
        ),
      );
  }
}

function remoteList(world: GitWorld, verbose: boolean): WorldOpResult {
  if (world.origin === null) {
    return worldOk(world, [
      line('Chưa có remote nào.', 'plain'),
      line('Level này là kho một mình — không có ai khác để đẩy lên hay kéo về.', 'hint'),
    ]);
  }
  if (!verbose) return worldOk(world, [line(DEFAULT_REMOTE, 'plain')]);
  return worldOk(world, [
    line(`${DEFAULT_REMOTE}\tmem://origin (fetch)`, 'plain'),
    line(`${DEFAULT_REMOTE}\tmem://origin (push)`, 'plain'),
    line(
      'Địa chỉ là `mem://` vì không có mạng nào cả: "kho từ xa" là một repo thứ hai nằm ngay trong bộ nhớ trình duyệt.',
      'hint',
    ),
  ]);
}

function remoteShow(world: GitWorld, name: string): WorldOpResult {
  const origin = world.origin;
  if (origin === null) return worldFail(world, noRemoteError('remote show'));
  if (name !== DEFAULT_REMOTE) return worldFail(world, unknownRemoteError(name));

  const out: OutputLine[] = [line(`* remote ${DEFAULT_REMOTE}`, 'plain')];
  out.push(line('  Branch trên origin:', 'plain'));
  for (const branch of branchNames(origin.refs)) {
    const there = origin.refs[branchRef(branch)];
    const here = world.local.refs[trackingRef(branch)];
    const state =
      here === undefined
        ? 'bạn chưa fetch branch này bao giờ'
        : here === there
          ? 'ref theo dõi của bạn đang khớp'
          : `ref theo dõi của bạn còn ở ${shortOid(here)} — đã cũ`;
    out.push(line(`    ${branch}  ${shortOid(there ?? '')}  (${state})`, 'plain'));
  }
  out.push(
    line(
      'Cột bên phải là chỗ `fetch` có nghĩa: nó chỉ kéo cái cột đó cho khớp, không đụng gì tới branch local.',
      'hint',
    ),
  );
  return worldOk(world, out);
}

function remoteAdd(world: GitWorld, name: string): WorldOpResult {
  if (name !== DEFAULT_REMOTE) {
    return worldFail(
      world,
      gitError(
        'not-allowed-here',
        `Game không thêm được remote tên \`${name}\`.`,
        'Thế giới của game có đúng một ô cho kho từ xa, và ô đó luôn mang tên `origin`. Một remote thứ hai (`upstream` chẳng hạn) không có chỗ để tồn tại.',
        'Trên git thật `git remote add upstream <url>` là cách theo dõi kho gốc khi bạn fork. Ở đây thì `origin` là tất cả những gì có.',
      ),
    );
  }
  if (world.origin !== null) {
    return worldFail(
      world,
      gitError(
        'not-allowed-here',
        '`origin` đã tồn tại rồi.',
        'Kho này đã nối với origin. `git remote add` chỉ tạo được một remote CHƯA có.',
        'Xem nó đang ở đâu bằng `git remote show origin`, hoặc kéo commit mới bằng `git fetch`.',
      ),
    );
  }
  return worldOk({ ...world, origin: emptyRepo() }, [
    line(`Đã thêm remote \`${DEFAULT_REMOTE}\` — hiện đang rỗng.`, 'success'),
    line('Đẩy branch đầu tiên lên bằng `git push -u origin main`.', 'hint'),
  ]);
}

function remoteRemove(world: GitWorld, name: string): WorldOpResult {
  if (world.origin === null) return worldFail(world, noRemoteError('remote remove'));
  if (name !== DEFAULT_REMOTE) return worldFail(world, unknownRemoteError(name));

  // Bỏ remote thì ref theo dõi cũng phải đi theo — chúng là thứ local NHỚ về
  // remote đó, và giữ lại một ký ức về một remote không còn tồn tại sẽ làm
  // `git branch -a` nói dối.
  let local = world.local;
  for (const ref of sortedKeys(local.refs)) {
    if (!isRemoteRef(ref)) continue;
    if (!shortRefName(ref).startsWith(`${DEFAULT_REMOTE}/`)) continue;
    local = deleteRef(local, ref);
  }
  return worldOk({ ...world, local, origin: null }, [
    line(`Đã bỏ remote \`${DEFAULT_REMOTE}\`, kèm mọi ref theo dõi của nó.`, 'warn'),
    line('Commit trong kho local thì vẫn còn nguyên — bỏ remote không xoá lịch sử.', 'hint'),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LỖI
// ═══════════════════════════════════════════════════════════════════════════

/** Branch HEAD đang bám, dạng ngắn. `null` khi HEAD tách rời. */
export function currentBranch(repo: Repo): string | null {
  return repo.head.type === 'ref' ? shortRefName(repo.head.ref) : null;
}

function noRemoteError(what: string): GitError {
  return gitError(
    'no-remote',
    `\`git ${what}\` cần một remote, mà level này không có cái nào.`,
    'Đây là một kho đứng một mình: `GitWorld.origin` rỗng, nên không có kho thứ hai nào để nói chuyện. Mọi lệnh của chương 1 vẫn chạy bình thường.',
    'Xem danh sách remote bằng `git remote -v`.',
  );
}

function unknownRemoteError(name: string): GitError {
  return gitError(
    'no-remote',
    `Không có remote nào tên \`${name}\`.`,
    `Game có đúng một remote và nó tên \`${DEFAULT_REMOTE}\`.`,
    `Ý bạn là \`${DEFAULT_REMOTE}\`?`,
  );
}

function checkRemoteName(name: string | undefined, what: string): GitError | null {
  if (name === undefined || name === DEFAULT_REMOTE) return null;
  return gitError(
    'no-remote',
    `\`git ${what} ${name}\` không chạy được: không có remote nào tên \`${name}\`.`,
    `Game có đúng một remote, tên \`${DEFAULT_REMOTE}\`. Đây cũng là chỗ dễ lẫn nhất của git: \`origin main\` là HAI tham số (một remote, một branch), còn \`origin/main\` là MỘT ref theo dõi.`,
    `Thử \`git ${what} ${DEFAULT_REMOTE} ${name}\` — có phải \`${name}\` là tên branch không?`,
  );
}

function branchMissingOnRemoteError(branch: string, available: readonly string[]): GitError {
  return gitError(
    'branch-missing',
    `\`${DEFAULT_REMOTE}\` không có branch nào tên \`${branch}\`.`,
    available.length === 0
      ? 'Kho origin hiện chưa có branch nào cả.'
      : `Branch đang có trên origin: ${available.map((b) => `\`${b}\``).join(', ')}.`,
    'Đẩy nó lên trước bằng `git push -u origin ' + branch + '`.',
  );
}

function branchMissingLocallyError(branch: string, available: readonly string[]): GitError {
  return gitError(
    'branch-missing',
    `Không có branch local nào tên \`${branch}\` để đẩy lên.`,
    available.length === 0
      ? 'Kho này chưa có branch nào — chưa commit lần nào thì cũng chưa có branch nào.'
      : `Branch local đang có: ${available.map((b) => `\`${b}\``).join(', ')}.`,
    '`git branch` để xem danh sách, `git switch -c ' + branch + '` để tạo mới.',
  );
}

function detachedPushError(repo: Repo): GitError {
  const oid = headOid(repo);
  return gitError(
    'bad-usage',
    '`git push` không biết phải đẩy branch nào.',
    `HEAD đang TÁCH RỜI, trỏ thẳng vào commit ${oid === null ? '(chưa có)' : shortOid(oid)} chứ không bám vào branch nào. Mà push đẩy một BRANCH, nên không có gì để đẩy.`,
    'Đặt tên cho chỗ bạn đang đứng đã: `git switch -c <tên-branch>`, rồi push branch đó lên.',
  );
}

function detachedPullError(): GitError {
  return gitError(
    'bad-usage',
    '`git pull` không biết phải trộn vào đâu.',
    'HEAD đang TÁCH RỜI nên không có branch nào để cập nhật. `pull` cập nhật một branch, không cập nhật một con trỏ rời.',
    'Quay về một branch bằng `git switch <tên>`, hoặc đặt tên cho chỗ này bằng `git switch -c <tên>`.',
  );
}

function noUpstreamError(branch: string, repo: Repo): GitError {
  const tracked = sortedKeys(repo.refs).filter(isRemoteRef).map(shortRefName);
  return gitError(
    'no-upstream',
    `Branch \`${branch}\` chưa theo dõi branch nào trên origin.`,
    tracked.length === 0
      ? 'Local chưa có ref theo dõi nào cả, nên `pull` không biết phải kéo cái gì về.'
      : `Ref theo dõi đang có: ${tracked.map((t) => `\`${t}\``).join(', ')} — không cái nào ứng với \`${branch}\`.`,
    `\`git push -u ${DEFAULT_REMOTE} ${branch}\` để nối hai bên lại, hoặc nói thẳng: \`git pull ${DEFAULT_REMOTE} ${branch}\`.`,
  );
}

/**
 * Từ chối non-fast-forward — bài G16.
 *
 * `explain` phải nói repo ĐANG ở trạng thái nào, không chỉ báo sai: người chơi
 * cần hiểu rằng origin có commit mà local chưa từng nhìn thấy. Đó là lý do câu
 * này nêu đích danh chữ `fetch` — thứ chưa xảy ra chính là nguyên nhân.
 */
function nonFastForwardError(
  branch: string,
  localOid: Oid,
  remoteOid: Oid,
  store: ObjectStore,
): GitError {
  const behind = commitsBetween(store, localOid, remoteOid).length;
  return gitError(
    'non-fast-forward',
    `origin từ chối nhận \`${branch}\`: đây là một push non-fast-forward.`,
    `\`${DEFAULT_REMOTE}/${branch}\` đang ở ${shortOid(remoteOid)}, và commit đó KHÔNG nằm trong lịch sử của \`${branch}\` ở máy bạn (${shortOid(localOid)}). ` +
      `Nghĩa là bên kia có ${behind} commit mà bạn chưa \`fetch\` về, nên local không hề biết chúng tồn tại. ` +
      'Nhận push này thì chúng mất chỗ trỏ tới — git từ chối thay bạn.',
    `\`git fetch ${DEFAULT_REMOTE}\` để nhìn thấy chúng, rồi \`git pull --rebase\` để đặt việc của bạn lên trên việc của họ, rồi push lại.`,
  );
}

/**
 * `--force-with-lease` từ chối — bài G21, và là cặp tương phản của G20.
 *
 * Câu chữ phải khác hẳn `non-fast-forward`: ở kia người chơi thiếu commit, ở đây
 * người chơi có đủ thẩm quyền ghi đè nhưng **bản origin họ tưởng mình đang ghi
 * đè đã không còn là bản thật**. Hai thông báo giống nhau sẽ làm hai bài học
 * nhập một.
 */
function staleLeaseError(
  branch: string,
  leaseOid: Oid | null,
  remoteOid: Oid | null,
  store: ObjectStore,
): GitError {
  const lease = leaseOid === null ? '(chưa fetch bao giờ)' : shortOid(leaseOid);
  const actual = remoteOid === null ? '(branch không còn trên origin)' : shortOid(remoteOid);
  const unseen =
    leaseOid !== null && remoteOid !== null ? commitsBetween(store, leaseOid, remoteOid).length : 0;

  return gitError(
    'stale-lease',
    `\`--force-with-lease\` từ chối ghi đè \`${branch}\` trên origin.`,
    `Lần \`fetch\` gần nhất của bạn thấy \`${DEFAULT_REMOTE}/${branch}\` ở ${lease}, nhưng ngay lúc này origin đang ở ${actual}. ` +
      `Có người đã push sau lần fetch cuối của bạn${unseen > 0 ? ` — ${unseen} commit bạn chưa từng nhìn thấy` : ''}. ` +
      'Cái bạn định ghi đè không còn là cái bạn đã xem, nên cờ này dừng tay bạn lại.',
    `\`git fetch ${DEFAULT_REMOTE}\` rồi \`git log ${DEFAULT_REMOTE}/${branch}\` để xem họ làm gì. ` +
      'Muốn giữ cả hai thì `git pull --rebase`. `--force` trần sẽ ghi đè và xoá việc của họ mà không hỏi một câu nào.',
  );
}

/** Nội dung file mà một commit nhìn thấy — dùng lại ở `pull-request.ts`. */
export function contentsAt(store: ObjectStore, oid: Oid | null): Readonly<Record<FilePath, Lines>> {
  return commitContents(store, oid);
}
