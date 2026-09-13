/**
 * Vòng pull request mô phỏng — bài G23 và G24.
 *
 * Không có mạng, không có backend: một `PullRequest` là một bản ghi trong
 * `GitWorld.pullRequests`, và "trộn PR" là một phép biến đổi trên kho `origin`
 * nằm cùng bộ nhớ. Đó là điều kiện §2.2 của design doc (0 lời gọi backend trong
 * lúc chơi), và cũng là thứ làm chế độ thi phát lại được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA NÚT MERGE = BA HÌNH DẠNG LỊCH SỬ. ĐÓ LÀ TOÀN BỘ BÀI G24.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mọi nhà cung cấp (GitHub, GitLab, Bitbucket) đều cho ba nút, và hầu hết người
 * dùng bấm nút giữa vì nó ở giữa. Ba nút ra ba lịch sử KHÁC HẲN nhau:
 *
 * | Nút | Commit mới | Cha | Lịch sử |
 * |---|---|---|---|
 * | `--merge` | 1 commit merge | **hai** cha | rẽ nhánh rồi gặp lại |
 * | `--squash` | 1 commit thường | **một** cha | tuyến tính, commit gốc mồ côi |
 * | `--rebase` | N commit mới | một cha mỗi cái | tuyến tính, N Oid mới |
 *
 * Chỗ đắt nhất và ít ai nói ra: với `--squash` và `--rebase`, commit GỐC của
 * nhánh nguồn **ở lại kho và không ai trỏ tới nữa**. Chúng không biến mất —
 * `ObjectStore` không bao giờ xoá — nên chúng vẫn cứu được, và đó chính là cầu
 * nối sang chương 3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRỘN XẢY RA Ở ORIGIN, KHÔNG Ở LOCAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bấm nút merge trên trang web thì máy bạn KHÔNG biết gì cả cho tới lần `fetch`
 * kế tiếp. Ở đây cũng vậy: `prMerge` chỉ đụng `world.origin`. Người chơi phải
 * `git fetch` (hoặc `git pull`) mới thấy. Làm khác đi sẽ dạy một phản xạ sai ở
 * đúng chỗ người mới hay sai nhất — tưởng rằng merge trên web tự động cập nhật
 * máy mình.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MỘT CHỖ LỆCH HỢP ĐỒNG, CÓ TÊN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hợp đồng §5 nêu ngoại lệ: `merge-conflict` trả `error` KÈM thế giới ĐÃ đổi
 * (pending op được đặt). Ngoại lệ đó **không áp dụng ở đây**, và cố ý: trộn PR
 * chạy trên kho `origin`, mà `origin` theo hợp đồng §4 luôn có
 * `index`/`worktree`/`pending` rỗng — không có worktree nào để chèn marker vào,
 * không có ai để `--continue`. Nhà cung cấp thật cũng hành xử y hệt: nút merge
 * bị khoá và bạn được bảo về máy tự trộn.
 *
 * Nên `prMerge` khi xung đột trả mã `merge-conflict` với thế giới **NGUYÊN
 * VẸN**. Ghi ra đây vì một người đọc hợp đồng rồi đọc file này sẽ tưởng là lỗi.
 */

import type {
  FilePath,
  GitError,
  GitWorld,
  Lines,
  ObjectStore,
  Oid,
  OutputLine,
  PullRequest,
  PullRequestReview,
  Repo,
} from '../contract.ts';
import { sortedEntries, sortedKeys } from '../deterministic.ts';
import { linesEqual } from '../diff.ts';
import { merge3 } from '../diff3.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import {
  commitContents,
  commitsBetween,
  getCommit,
  isAncestor,
  mergeBase,
  writeCommit,
  writeContents,
} from '../objects.ts';
import { branchNames, branchRef, setRef } from '../repo.ts';
import { line } from './basic.ts';
import { DEFAULT_REMOTE, currentBranch, worldFail, worldOk } from './remote.ts';
import type { WorldOpResult } from './remote.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. TRỘN NỘI DUNG BA NGẢ Ở MỨC CÂY
// ═══════════════════════════════════════════════════════════════════════════

export interface ContentMerge {
  readonly contents: Readonly<Record<FilePath, Lines>>;
  /** Đường dẫn xung đột, đã sắp. Rỗng = trộn sạch. */
  readonly conflicts: readonly FilePath[];
}

/**
 * Trộn ba ngả TOÀN BỘ CÂY, không phải một file.
 *
 * `diff3.merge3` giải một file; cái còn thiếu là tầng trên nó — ai xuất hiện, ai
 * biến mất, ai chỉ có ở một phía. Bốn ca dưới đây là chỗ một cài đặt "trông có
 * vẻ đúng" hay nuốt mất dữ liệu:
 *
 * 1. **MỘT phía thêm file mới, phía kia không có nó** ⇒ nhận, sạch. Nghe hiển
 *    nhiên, nhưng đây đúng là ca đã sai ở lượt viết đầu: "ours không có file"
 *    bị đọc thành "ours đã xoá file", nên mọi file mới của nhánh kia thành xung
 *    đột và **không pull request bình thường nào trộn được**. Phân biệt hai
 *    nghĩa đó chỉ bằng một câu hỏi: `base` có file này không?
 * 2. **Một phía xoá, phía kia không đụng** ⇒ xoá. (Nếu coi "vắng mặt" là "rỗng"
 *    thì file sẽ sống lại dưới dạng một file 0 dòng — sai và khó thấy.)
 * 3. **Một phía xoá, phía kia SỬA** ⇒ xung đột thật. git thật cũng vậy
 *    (`deleted by us` / `modified by them`), và nuốt nó là mất việc của ai đó.
 * 4. **Cả hai thêm cùng đường dẫn, nội dung khác nhau** ⇒ trộn ba ngả với base
 *    rỗng, xung đột nếu khác.
 * 5. **Cả hai đổi GIỐNG HỆT** ⇒ không xung đột. Hai người cùng sửa một lỗi chính
 *    tả phải trộn sạch; luật này hay bị bỏ sót và đẻ ra xung đột GIẢ.
 *
 * ⚠ Hàm này sẽ trùng vai với `ops/merge.ts` (lane khác) ở phần lõi. Nó nằm đây
 * vì trộn PR chạy trên một kho BARE — không worktree, không marker, không pending
 * op — nên nó dùng chung được đúng phần "tính nội dung" chứ không dùng chung
 * được phần còn lại. Lane merge landing xong thì lead gom phần lõi lại; báo cáo
 * lane 17.H có ghi mục này.
 */
export function mergeContentsTrees(
  base: Readonly<Record<FilePath, Lines>>,
  ours: Readonly<Record<FilePath, Lines>>,
  theirs: Readonly<Record<FilePath, Lines>>,
): ContentMerge {
  const universe: Record<FilePath, true> = {};
  for (const path of sortedKeys(base)) universe[path] = true;
  for (const path of sortedKeys(ours)) universe[path] = true;
  for (const path of sortedKeys(theirs)) universe[path] = true;

  const contents: Record<FilePath, Lines> = {};
  const conflicts: FilePath[] = [];

  for (const path of sortedKeys(universe)) {
    const b = base[path] ?? null;
    const o = ours[path] ?? null;
    const t = theirs[path] ?? null;

    if (o === null && t === null) continue; // cả hai xoá — đồng thuận
    if (o !== null && t !== null && linesEqual(o, t)) {
      contents[path] = o; // giống hệt nhau, kể cả khi cả hai cùng đổi
      continue;
    }

    if (o === null) {
      // ⚠ "ours không có file" có HAI nghĩa hoàn toàn khác nhau, và gộp chúng
      // lại là lỗi đã lọt qua lượt viết đầu của hàm này:
      //   • base cũng không có  ⇒ theirs vừa THÊM một file mới ⇒ nhận, sạch.
      //   • base có            ⇒ ours đã XOÁ nó ⇒ mới cần xét tới theirs.
      // Nhầm vế đầu thành vế sau biến mọi file mới của nhánh kia thành xung
      // đột, tức là mọi pull request bình thường đều không trộn được.
      if (b === null) {
        contents[path] = t as Lines;
        continue;
      }
      if (t === null || linesEqual(b, t)) continue; // ours xoá, theirs không đụng
      conflicts.push(path); // ours xoá / theirs sửa — xung đột thật
      contents[path] = t;
      continue;
    }

    if (t === null) {
      // Đối xứng hoàn toàn với nhánh trên.
      if (b === null) {
        contents[path] = o;
        continue;
      }
      if (linesEqual(b, o)) continue; // theirs xoá, ours không đụng
      conflicts.push(path);
      contents[path] = o;
      continue;
    }
    const result = merge3(b ?? [], o, t);
    contents[path] = result.merged;
    if (result.conflicted) conflicts.push(path);
  }

  return { contents, conflicts };
}

/** Như trên nhưng nhận Oid commit. Kho object là nơi duy nhất đọc nội dung. */
function mergeCommits(
  store: ObjectStore,
  base: Oid | null,
  ours: Oid,
  theirs: Oid,
): ContentMerge {
  return mergeContentsTrees(
    commitContents(store, base),
    commitContents(store, ours),
    commitContents(store, theirs),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MỞ / LIỆT KÊ / REVIEW
// ═══════════════════════════════════════════════════════════════════════════

export interface PrOpenOptions {
  readonly title: string;
  readonly logicalTime: number;
  /** Bỏ trống = branch HEAD đang đứng. */
  readonly sourceBranch?: string | undefined;
  /** Bỏ trống = nhánh mặc định của origin (`main` nếu có). */
  readonly targetBranch?: string | undefined;
}

/**
 * `git pr open`.
 *
 * ## Nhánh nguồn phải CÓ TRÊN ORIGIN trước đã
 *
 * Đây không phải phép kiểm thừa, nó là nửa đầu của bài G23. Người mới mở PR
 * xong rồi hỏi "sao PR trống không?" — vì họ commit ở máy mà chưa `push`. Nhà
 * cung cấp chỉ nhìn thấy thứ đã nằm trên server, và game nói thẳng điều đó ra
 * thay vì tạo một PR rỗng rồi để người chơi tự đoán.
 */
export function prOpen(world: GitWorld, options: PrOpenOptions): WorldOpResult {
  const origin = world.origin;
  if (origin === null) return worldFail(world, prNeedsRemoteError('open'));

  const source = options.sourceBranch ?? currentBranch(world.local);
  if (source === null) {
    return worldFail(
      world,
      gitError(
        'bad-usage',
        '`git pr open` không biết mở PR cho branch nào.',
        'HEAD đang TÁCH RỜI nên bạn không đứng trên branch nào. Một pull request luôn là "trộn branch X vào branch Y".',
        'Đặt tên cho chỗ bạn đang đứng: `git switch -c <tên-branch>`, push lên, rồi mở PR.',
      ),
    );
  }

  const target = options.targetBranch ?? defaultTargetBranch(origin);
  if (target === null) {
    return worldFail(
      world,
      gitError(
        'branch-missing',
        '`git pr open` không tìm được branch đích.',
        'Kho origin chưa có branch nào để trộn vào.',
        'Đẩy branch chính lên trước: `git push -u origin main`.',
      ),
    );
  }
  if (source === target) {
    return worldFail(
      world,
      gitError(
        'bad-usage',
        `Không mở được pull request từ \`${source}\` vào chính \`${target}\`.`,
        'Nguồn và đích là cùng một branch, nên không có commit nào để trộn cả.',
        'Nêu branch đích khác bằng `--base <branch>`.',
      ),
    );
  }

  if (!Object.hasOwn(origin.refs, branchRef(source))) {
    return worldFail(
      world,
      gitError(
        'branch-missing',
        `Branch \`${source}\` chưa có trên origin, nên chưa mở được pull request.`,
        'Pull request là một thứ sống trên server: nó so hai branch mà SERVER nhìn thấy. Commit của bạn hiện chỉ nằm ở máy bạn — origin chưa biết chúng tồn tại.',
        `\`git push -u ${DEFAULT_REMOTE} ${source}\` rồi mở lại.`,
      ),
    );
  }
  if (!Object.hasOwn(origin.refs, branchRef(target))) {
    return worldFail(world, prTargetMissingError(target, branchNames(origin.refs)));
  }

  const existing = world.pullRequests.find(
    (pr) => pr.state === 'open' && pr.sourceBranch === source && pr.targetBranch === target,
  );
  if (existing !== undefined) {
    return worldFail(
      world,
      gitError(
        'not-allowed-here',
        `Đã có pull request #${existing.number} mở sẵn cho \`${source}\` -> \`${target}\`.`,
        'Một cặp branch chỉ có một pull request mở tại một thời điểm — đúng như nhà cung cấp thật. Push thêm commit vào `' +
          source +
          '` thì PR đó tự cập nhật.',
        `Xem nó bằng \`git pr list\`, hoặc trộn bằng \`git pr merge ${existing.number}\`.`,
      ),
    );
  }

  // Số PR: lớn nhất + 1. Tất định, và không tái sử dụng số của PR đã đóng —
  // giống hệt nhà cung cấp thật, nơi số PR là một dãy chỉ tăng.
  let next = 1;
  for (const pr of world.pullRequests) if (pr.number >= next) next = pr.number + 1;

  const created: PullRequest = {
    number: next,
    title: options.title,
    sourceBranch: source,
    targetBranch: target,
    state: 'open',
    reviews: [],
    mergedWith: null,
  };

  const store = origin.objects;
  const sourceOid = origin.refs[branchRef(source)] ?? null;
  const targetOid = origin.refs[branchRef(target)] ?? null;
  const ahead =
    sourceOid === null || targetOid === null
      ? 0
      : commitsBetween(store, mergeBase(store, targetOid, sourceOid), sourceOid).length;

  return worldOk({ ...world, pullRequests: [...world.pullRequests, created] }, [
    line(`Đã mở pull request #${next}: ${options.title}`, 'success'),
    line(`   ${source} -> ${target}  (${ahead} commit)`, 'plain'),
    line(
      'PR so hai branch TRÊN ORIGIN. Bạn commit thêm ở máy thì PR chưa đổi — phải `git push` đã.',
      'hint',
    ),
  ]);
}

/** `git pr list` — chỉ đọc, không đổi gì. */
export function prList(world: GitWorld): WorldOpResult {
  if (world.pullRequests.length === 0) {
    return worldOk(world, [
      line('Chưa có pull request nào.', 'plain'),
      line('Mở một cái bằng `git pr open --title "..."`.', 'hint'),
    ]);
  }
  const out: OutputLine[] = [];
  for (const pr of world.pullRequests) {
    const badge =
      pr.state === 'open'
        ? 'MỞ'
        : pr.state === 'merged'
          ? `ĐÃ TRỘN (${pr.mergedWith ?? '?'})`
          : 'ĐÃ ĐÓNG';
    out.push(
      line(
        `#${pr.number}  [${badge}]  ${pr.title}  —  ${pr.sourceBranch} -> ${pr.targetBranch}`,
        pr.state === 'open' ? 'plain' : 'success',
      ),
    );
    for (const review of pr.reviews) {
      out.push(line(`      ${verdictLabel(review.verdict)} ${review.author}: ${review.body}`, 'plain'));
    }
  }
  return worldOk(world, out);
}

function verdictLabel(verdict: PullRequestReview['verdict']): string {
  if (verdict === 'approve') return '[chấp thuận]';
  if (verdict === 'request-changes') return '[yêu cầu sửa]';
  return '[bình luận]';
}

export interface PrReviewOptions {
  readonly number: number;
  readonly author: string;
  readonly verdict: PullRequestReview['verdict'];
  readonly body: string;
  readonly logicalTime: number;
}

/** `git pr review` — cũng là đường bot đồng đội để lại nhận xét. */
export function prReview(world: GitWorld, options: PrReviewOptions): WorldOpResult {
  const found = findOpenPr(world, options.number);
  if (found.error !== null) return worldFail(world, found.error);
  const pr = found.pr;

  const review: PullRequestReview = {
    author: options.author,
    verdict: options.verdict,
    body: options.body,
    logicalTime: options.logicalTime,
  };
  const updated: PullRequest = { ...pr, reviews: [...pr.reviews, review] };

  return worldOk(replacePr(world, updated), [
    line(`#${pr.number} ${verdictLabel(options.verdict)} bởi ${options.author}`, 'success'),
    line(`   ${options.body}`, 'plain'),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. MERGE — ba nút, ba hình dạng
// ═══════════════════════════════════════════════════════════════════════════

export type PrMergeStrategy = 'merge' | 'squash' | 'rebase';

export interface PrMergeOptions {
  readonly number: number;
  readonly strategy: PrMergeStrategy;
  readonly logicalTime: number;
  readonly author: string;
}

/**
 * `git pr merge`.
 *
 * ⚠ Đồng hồ: `--rebase` đúc N commit, nên `world.logicalTime` được đẩy lên qua
 * hết N cái đó. Không đẩy thì hai commit dùng chung một `logicalTime`, và
 * `commitsBetween` (sắp theo thời gian, hoà thì theo Oid) có thể trả con TRƯỚC
 * cha — đủ để một lần rebase sau đó áp sai thứ tự. Lỗi ấy chỉ lộ ở một level
 * cụ thể, rất lâu sau, nên nó được chặn tại đây bằng cách giữ thời gian luôn
 * tăng thật.
 */
export function prMerge(world: GitWorld, options: PrMergeOptions): WorldOpResult {
  const origin = world.origin;
  if (origin === null) return worldFail(world, prNeedsRemoteError('merge'));

  const found = findOpenPr(world, options.number);
  if (found.error !== null) return worldFail(world, found.error);
  const pr = found.pr;

  const sourceOid = origin.refs[branchRef(pr.sourceBranch)] ?? null;
  const targetOid = origin.refs[branchRef(pr.targetBranch)] ?? null;
  if (sourceOid === null) {
    return worldFail(world, prSourceGoneError(pr.sourceBranch));
  }
  if (targetOid === null) {
    return worldFail(world, prTargetMissingError(pr.targetBranch, branchNames(origin.refs)));
  }

  const store = origin.objects;
  if (isAncestor(store, sourceOid, targetOid)) {
    return worldFail(
      world,
      gitError(
        'not-allowed-here',
        `#${pr.number} không còn commit nào để trộn.`,
        `Mọi commit của \`${pr.sourceBranch}\` đã nằm trong lịch sử của \`${pr.targetBranch}\` rồi.`,
        `Đóng nó lại là xong — hoặc push thêm commit vào \`${pr.sourceBranch}\` nếu còn việc.`,
      ),
    );
  }

  const outcome =
    options.strategy === 'rebase'
      ? mergeByRebase(store, targetOid, sourceOid, options)
      : mergeByCommit(store, targetOid, sourceOid, pr, options);

  if (outcome.error !== null) return worldFail(world, outcome.error);

  const nextOrigin = setRef(
    { ...origin, objects: outcome.objects },
    branchRef(pr.targetBranch),
    outcome.tip,
    {
      op: 'pr-merge',
      message: `pr merge --${options.strategy}: #${pr.number} vào ${pr.targetBranch}`,
      logicalTime: outcome.logicalTime,
    },
  );

  const merged: PullRequest = { ...pr, state: 'merged', mergedWith: options.strategy };
  const next: GitWorld = {
    ...replacePr(world, merged),
    origin: nextOrigin,
    logicalTime: Math.max(world.logicalTime, outcome.logicalTime),
  };

  return worldOk(next, mergeOutput(pr, options.strategy, outcome, world));
}

interface MergeOutcome {
  readonly objects: ObjectStore;
  readonly tip: Oid;
  /** Commit mới đúc ra, cũ trước mới sau. */
  readonly created: readonly Oid[];
  /** Commit gốc của nhánh nguồn nay không còn ai trỏ tới (squash/rebase). */
  readonly orphaned: readonly Oid[];
  readonly logicalTime: number;
  readonly error: GitError | null;
}

function failedOutcome(store: ObjectStore, tip: Oid, error: GitError): MergeOutcome {
  return { objects: store, tip, created: [], orphaned: [], logicalTime: 0, error };
}

/** `--merge` (hai cha) và `--squash` (một cha) — cùng một cây kết quả. */
function mergeByCommit(
  store: ObjectStore,
  targetOid: Oid,
  sourceOid: Oid,
  pr: PullRequest,
  options: PrMergeOptions,
): MergeOutcome {
  const base = mergeBase(store, targetOid, sourceOid);
  const result = mergeCommits(store, base, targetOid, sourceOid);
  if (result.conflicts.length > 0) {
    return failedOutcome(store, targetOid, prConflictError(pr, result.conflicts));
  }

  const squash = options.strategy === 'squash';
  const [afterTree, tree] = writeContents(store, result.contents);
  const [afterCommit, oid] = writeCommit(afterTree, {
    tree,
    // ⚠ Đây là chỗ hai nút tách ra. `--merge` giữ HAI cha nên lịch sử còn nhìn
    // thấy chỗ hai nhánh gặp nhau; `--squash` chỉ giữ cha bên đích, nên nhánh
    // nguồn biến mất khỏi đồ thị dù commit của nó vẫn nằm trong kho.
    parents: squash ? [targetOid] : [targetOid, sourceOid],
    message: squash
      ? `${pr.title} (#${pr.number})`
      : `Merge pull request #${pr.number} từ ${pr.sourceBranch}`,
    author: options.author,
    logicalTime: options.logicalTime,
  });

  return {
    objects: afterCommit,
    tip: oid,
    created: [oid],
    orphaned: squash ? commitsBetween(store, base, sourceOid) : [],
    logicalTime: options.logicalTime,
    error: null,
  };
}

/**
 * `--rebase`: áp TỪNG commit của nhánh nguồn lên đầu nhánh đích.
 *
 * Mỗi bước là một phép trộn ba ngả thật: `base` = cây của cha commit đang áp,
 * `ours` = cây ở đầu con trỏ hiện tại, `theirs` = cây của chính commit đó. Đó là
 * định nghĩa của "áp một thay đổi lên một nền khác", và nó giải thích vì sao
 * rebase xung đột được ở từng bước chứ không phải một lần duy nhất.
 *
 * Mọi commit ra Oid MỚI — cùng nội dung, cùng message, khác cha và khác
 * `logicalTime`. Bản cũ ở lại kho, mồ côi. Đó là cả bài G11 và là cầu sang G31.
 */
function mergeByRebase(
  store: ObjectStore,
  targetOid: Oid,
  sourceOid: Oid,
  options: PrMergeOptions,
): MergeOutcome {
  const base = mergeBase(store, targetOid, sourceOid);
  const picks = commitsBetween(store, base, sourceOid);

  let objects = store;
  let cursor = targetOid;
  let clock = options.logicalTime;
  const created: Oid[] = [];

  for (const pick of picks) {
    const commit = getCommit(objects, pick);
    if (commit === null) continue;

    const result = mergeContentsTrees(
      commitContents(objects, commit.parents[0] ?? null),
      commitContents(objects, cursor),
      commitContents(objects, pick),
    );
    if (result.conflicts.length > 0) {
      return failedOutcome(store, targetOid, rebaseConflictError(pick, commit.message, result.conflicts));
    }

    const [afterTree, tree] = writeContents(objects, result.contents);
    const [afterCommit, oid] = writeCommit(afterTree, {
      tree,
      parents: [cursor],
      message: commit.message,
      author: commit.author,
      logicalTime: clock,
    });
    objects = afterCommit;
    cursor = oid;
    created.push(oid);
    clock += 1;
  }

  return {
    objects,
    tip: cursor,
    created,
    orphaned: picks,
    // `clock` đã tiến qua commit cuối, nên lùi lại một để nó là thời điểm THẬT
    // của commit cuối cùng chứ không phải một thời điểm chưa ai dùng.
    logicalTime: created.length === 0 ? options.logicalTime : clock - 1,
    error: null,
  };
}

function mergeOutput(
  pr: PullRequest,
  strategy: PrMergeStrategy,
  outcome: MergeOutcome,
  before: GitWorld,
): readonly OutputLine[] {
  const out: OutputLine[] = [
    line(`Đã trộn #${pr.number} vào \`${pr.targetBranch}\` bằng \`--${strategy}\`.`, 'success'),
  ];

  if (strategy === 'merge') {
    out.push(
      line(
        `   commit merge ${shortOid(outcome.tip)} có HAI cha — lịch sử giữ lại chỗ hai nhánh gặp nhau.`,
        'plain',
      ),
    );
  } else if (strategy === 'squash') {
    out.push(
      line(
        `   một commit duy nhất ${shortOid(outcome.tip)}, cha là đầu \`${pr.targetBranch}\` — lịch sử tuyến tính.`,
        'plain',
      ),
    );
  } else {
    out.push(
      line(
        `   ${outcome.created.length} commit mới, mỗi cái một Oid mới: ${outcome.created.map(shortOid).join(' -> ')}.`,
        'plain',
      ),
    );
  }

  if (outcome.orphaned.length > 0) {
    out.push(
      line(
        `⚠ ${outcome.orphaned.length} commit gốc của \`${pr.sourceBranch}\` giờ không nằm trong lịch sử \`${pr.targetBranch}\`: ${outcome.orphaned
          .map(shortOid)
          .join(', ')}.`,
        'warn',
      ),
    );
    out.push(
      line(
        'Chúng vẫn nằm trong kho origin và branch nguồn vẫn trỏ tới chúng. Xoá branch nguồn đi thì chúng mồ côi — vẫn cứu được, nhưng phải biết đường.',
        'hint',
      ),
    );
  }

  if (before.origin !== null) {
    out.push(
      line(
        'Máy bạn CHƯA biết gì cả — merge vừa xảy ra ở origin. Chạy `git fetch` (hoặc `git pull`) để thấy nó.',
        'hint',
      ),
    );
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TIỆN ÍCH + LỖI
// ═══════════════════════════════════════════════════════════════════════════

function defaultTargetBranch(origin: Repo): string | null {
  const names = branchNames(origin.refs);
  return names.includes('main') ? 'main' : (names[0] ?? null);
}

function replacePr(world: GitWorld, updated: PullRequest): GitWorld {
  return {
    ...world,
    pullRequests: world.pullRequests.map((pr) => (pr.number === updated.number ? updated : pr)),
  };
}

type PrLookup =
  | { readonly pr: PullRequest; readonly error: null }
  | { readonly pr: PullRequest; readonly error: GitError };

function findOpenPr(world: GitWorld, number: number): PrLookup {
  const placeholder: PullRequest = {
    number,
    title: '',
    sourceBranch: '',
    targetBranch: '',
    state: 'closed',
    reviews: [],
    mergedWith: null,
  };
  const pr = world.pullRequests.find((item) => item.number === number);
  if (pr === undefined) {
    const open = world.pullRequests.filter((item) => item.state === 'open').map((item) => item.number);
    return {
      pr: placeholder,
      error: gitError(
        'bad-usage',
        `Không có pull request nào mang số #${number}.`,
        open.length === 0
          ? 'Hiện không có pull request nào đang mở.'
          : `Pull request đang mở: ${open.map((n) => `#${n}`).join(', ')}.`,
        '`git pr list` để xem toàn bộ.',
      ),
    };
  }
  if (pr.state !== 'open') {
    return {
      pr,
      error: gitError(
        'not-allowed-here',
        `#${pr.number} không còn mở.`,
        pr.state === 'merged'
          ? `Nó đã được trộn bằng \`--${pr.mergedWith ?? '?'}\` rồi, nên không trộn lại được nữa.`
          : 'Nó đã bị đóng mà không trộn.',
        '`git pr list` để xem những cái còn mở.',
      ),
    };
  }
  return { pr, error: null };
}

function prNeedsRemoteError(what: string): GitError {
  return gitError(
    'no-remote',
    `\`git pr ${what}\` cần một kho từ xa, mà level này không có.`,
    'Pull request là thứ sống trên server của nhà cung cấp. Không có origin thì không có nơi nào để nó tồn tại.',
    'Chương 1 là kho một mình — vòng pull request bắt đầu từ chương 2.',
  );
}

function prTargetMissingError(target: string, available: readonly string[]): GitError {
  return gitError(
    'branch-missing',
    `Branch đích \`${target}\` không có trên origin.`,
    available.length === 0
      ? 'Kho origin chưa có branch nào.'
      : `Branch trên origin: ${available.map((b) => `\`${b}\``).join(', ')}.`,
    'Nêu branch đích bằng `--base <branch>`.',
  );
}

function prSourceGoneError(source: string): GitError {
  return gitError(
    'branch-missing',
    `Branch nguồn \`${source}\` đã biến mất khỏi origin.`,
    'Ai đó đã xoá nó ở phía remote (`git push --delete`) sau khi pull request được mở. Không còn commit nào để trộn vào đâu cả.',
    `Đẩy lại bằng \`git push ${DEFAULT_REMOTE} ${source}\` nếu bạn còn bản local.`,
  );
}

/**
 * Xung đột khi trộn PR.
 *
 * ⚠ Thế giới KHÔNG đổi — xem chú thích đầu file về chỗ lệch hợp đồng có tên.
 * Câu chữ phải nói rõ điều đó, vì người chơi vừa đọc bài G18 sẽ đi tìm
 * `--abort` mà chẳng có gì để abort.
 */
function prConflictError(pr: PullRequest, conflicts: readonly FilePath[]): GitError {
  return gitError(
    'merge-conflict',
    `#${pr.number} không trộn tự động được: ${conflicts.length} file xung đột.`,
    `\`${pr.sourceBranch}\` và \`${pr.targetBranch}\` cùng sửa ${conflicts.map((p) => `\`${p}\``).join(', ')} theo hai hướng khác nhau kể từ chỗ chúng tách ra. ` +
      'Không có gì thay đổi cả: origin là kho bare, không có worktree để chèn marker và không có gì để `--abort`. Đúng như nút merge bị khoá trên trang web.',
    `Về máy mà trộn: \`git switch ${pr.sourceBranch}\`, \`git pull ${DEFAULT_REMOTE} ${pr.targetBranch}\`, giải xung đột, rồi push lại — PR sẽ tự mở khoá.`,
  );
}

function rebaseConflictError(
  oid: Oid,
  message: string,
  conflicts: readonly FilePath[],
): GitError {
  return gitError(
    'merge-conflict',
    `\`--rebase\` kẹt ở commit ${shortOid(oid)} ("${message}").`,
    `Rebase áp TỪNG commit một, và commit này đụng ${conflicts.map((p) => `\`${p}\``).join(', ')}. ` +
      'Những commit trước nó áp sạch, nhưng vì origin là kho bare nên không có chỗ dừng lại để sửa — toàn bộ lần trộn bị bỏ, branch đích giữ nguyên.',
    'Dùng `--merge` nếu chấp nhận một commit merge, hoặc rebase ở máy bạn rồi push lại.',
  );
}

/** Số commit mà một PR đang mang. Dùng cho giao diện, không đổi trạng thái. */
export function prCommitCount(world: GitWorld, pr: PullRequest): number {
  const origin = world.origin;
  if (origin === null) return 0;
  const sourceOid = origin.refs[branchRef(pr.sourceBranch)] ?? null;
  const targetOid = origin.refs[branchRef(pr.targetBranch)] ?? null;
  if (sourceOid === null || targetOid === null) return 0;
  const store = origin.objects;
  return commitsBetween(store, mergeBase(store, targetOid, sourceOid), sourceOid).length;
}

/** Đường dẫn xuất hiện ở bất kỳ cây nào trong ba cây — xuất ra để test dùng lại. */
export function unionPaths(
  ...trees: readonly Readonly<Record<FilePath, Lines>>[]
): readonly FilePath[] {
  const seen: Record<FilePath, true> = {};
  for (const tree of trees) for (const [path] of sortedEntries(tree)) seen[path] = true;
  return sortedKeys(seen);
}
