/**
 * `git merge` — fast-forward, trộn ba ngả, và xung đột.
 *
 * ⛔ FILE NÀY LÀ **LÕI BA NGẢ DÙNG CHUNG** của cả ba lệnh viết lại lịch sử.
 * `rebase.ts` và `cherry-pick.ts` import từ đây chứ không tự dựng phép trộn thứ
 * hai, và `pending.ts` chỉ điều phối. Chiều phụ thuộc một hướng:
 *
 *     merge.ts  ←  cherry-pick.ts
 *        ↑              ↑
 *        └──── rebase.ts ┘
 *                 ↑
 *             pending.ts
 *
 * Vì sao lõi nằm ở `merge.ts` chứ không ở một file `three-way.ts` riêng: rebase
 * và cherry-pick **là** merge lặp lại — mỗi commit được áp lên một base khác.
 * Tách thêm một tầng nữa chỉ đẻ ra một cái tên không ai gõ, trong khi
 * `code-conventions.md` §"Modular Boundaries" đòi một seam phải giấu nhiều phức
 * tạp hơn phần giao diện nó thêm vào.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHÉP TRỘN THEO DÒNG KHÔNG THUỘC VỀ ĐÂY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `merge3` (diff3 theo dòng) và `renderConflict` (chèn marker) là của lane
 * diff3, ở `../diff3.ts` và `../conflict-markers.ts`. File này gọi chúng và
 * **tuyệt đối không viết lại**. Hai bộ trộn khác nhau nghĩa là vị từ chấm bài
 * `noConflictMarkers` có thể xanh trên một file mà `merge --continue` vẫn coi là
 * chưa giải — một lỗi chỉ lộ ở đúng một level, rất lâu sau.
 *
 * Cái file này QUYẾT là chuyện ở **mức file**, thứ `merge3` không mô tả được vì
 * nó làm việc trên dòng:
 *
 *  - một phía XOÁ file, phía kia SỬA nó  → xung đột modify/delete;
 *  - một phía THÊM file mới, phía kia không → lấy file, không xung đột;
 *  - hai phía cùng THÊM một đường dẫn với nội dung khác → xung đột add/add
 *    (base rỗng — `merge3` xử đúng ca này, nên nó được chuyển xuống nguyên si).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FAST-FORWARD KHÔNG TẠO COMMIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Khi tổ tiên chung CHÍNH LÀ HEAD thì không có gì để trộn: nhánh kia đã chứa
 * trọn lịch sử của ta, nên `merge` chỉ **dời con trỏ**. Người học phải thấy
 * được điều này, vì "merge luôn tạo một commit merge" là một trong những nhầm
 * lẫn dai dẳng nhất, và nó dẫn thẳng tới việc không hiểu vì sao `--no-ff` tồn
 * tại. Ô nghiệm thu đếm số commit object trước/sau để ghim hành vi đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * XUNG ĐỘT TRẢ `error` KÈM WORLD ĐÃ ĐỔI — NGOẠI LỆ CÓ TÊN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Luật chung của hợp đồng (`CommandResult`) là "lệnh hỏng trả trạng thái CŨ,
 * không đổi". `merge-conflict` và `unmerged-paths` là ngoại lệ DUY NHẤT, và nó
 * có tên trong hợp đồng. Giọng của mọi câu chữ ở đây theo bài G18 — *conflict
 * không phải lỗi của bạn*: git có ba bản và hai bản sau mâu thuẫn nhau so với
 * bản đầu, nên nó dừng lại hỏi, chứ không phải bạn làm sai điều gì. Không câu
 * nào được viết giọng trách móc.
 */

import type {
  ConflictFile,
  FilePath,
  GitError,
  Index,
  Lines,
  MergeHunk,
  ObjectStore,
  Oid,
  OutputLine,
  PendingOp,
  Repo,
} from '../contract.ts';
import { sortedEntries, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { renderConflict, stripResolved } from '../conflict-markers.ts';
import { merge3 } from '../diff3.ts';
import {
  commitContents,
  getCommit,
  isAncestor,
  makeBlob,
  makeTree,
  mergeBase,
  putObject,
  writeCommit,
  writeContents,
} from '../objects.ts';
import { blobOid, headContents, headOid, isIndexClean, isWorktreeClean, setIndex, setWorktree } from '../repo.ts';
import {
  advanceHead,
  dirtyTree,
  fail,
  indexFromCommit,
  line,
  linesEqual,
  noOperation,
  ok,
  operationInProgress,
  oursLabelOf,
  untrackedWorktree,
  worktreeAt,
  wrongPendingKind,
  type GitOpResult,
  type MergeFileInput,
  type MergeFileOutput,
  type OpContext,
} from './reset.ts';

/** Năm nhánh của `PendingOp`, rút ra để `pending.ts` và các lệnh nói cùng một từ. */
export type PendingKind = PendingOp['kind'];

/** Ảnh chụp nội dung file của một phía. */
export type Contents = Readonly<Record<FilePath, Lines>>;

// ═══════════════════════════════════════════════════════════════════════════
// 1. LÕI BA NGẢ Ở MỨC FILE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phép trộn theo dòng, gói đúng hình dạng `MergeFileFn` mà `reset.ts` khai.
 *
 * Tồn tại để lane revert nối được vào bản trộn THẬT thay vì một bản giả: lúc
 * `reset.ts` được viết thì `diff3.ts` chưa có, nên nó tiêm phép trộn từ ngoài
 * vào. Đây là cái để tiêm. Có đúng một hiện thực của phép trộn trong cả game,
 * và nó nằm ở `../diff3.ts`.
 */
export function mergeFile(input: MergeFileInput): MergeFileOutput {
  const result = merge3(input.base, input.ours, input.theirs);
  return {
    merged: result.conflicted
      ? renderConflict(result.hunks, input.oursLabel, input.theirsLabel)
      : result.merged,
    hunks: result.hunks,
    conflicted: result.conflicted,
  };
}

export interface ThreeWayInput {
  readonly base: Contents;
  readonly ours: Contents;
  readonly theirs: Contents;
  readonly oursLabel: string;
  readonly theirsLabel: string;
}

export interface ThreeWayPlan {
  /**
   * Nội dung file sau khi trộn. File xung đột mang nội dung **đã chèn marker**,
   * tức đúng thứ phải nằm trong worktree lúc này.
   *
   * Đường dẫn VẮNG MẶT ở đây nghĩa là file bị xoá bởi phép trộn — khác hẳn với
   * một đường dẫn mang `[]` (file rỗng nhưng tồn tại).
   */
  readonly contents: Contents;
  readonly conflicts: readonly ConflictFile[];
}

/**
 * Một hunk phủ trọn file, luôn xung đột. Dùng cho ca modify/delete.
 *
 * Vì sao KHÔNG đẩy ca này xuống `merge3`: khi một phía vắng mặt, `theirs` truyền
 * xuống là `[]`, và `merge3` có một ca suy biến trả **không xung đột** — phía
 * ours làm rỗng file trong khi phía theirs xoá file thì luật 3 của diff3 ("hai
 * phía đổi giống hệt nhau") coi `[]` và `[]` là bằng nhau. Đúng theo dòng, sai
 * theo file: "file rỗng" và "không có file" là hai chuyện khác nhau, và ở đây
 * chỉ mức file mới trả lời được. Ghim bằng một hunk tường minh thay vì dựa vào
 * hành vi tình cờ của một hàm ở tầng dưới.
 */
function wholeFileConflict(base: Lines, ours: Lines, theirs: Lines): readonly MergeHunk[] {
  return [{ start: 0, base, ours, theirs, conflicted: true }];
}

/**
 * Quyết định cho TỪNG đường dẫn: lấy bên nào, xoá, hay trộn theo dòng.
 *
 * Thứ tự các luật dưới đây có nghĩa và không đổi chỗ được. Đọc theo cặp
 * (có ở base?) × (có ở ours?) × (có ở theirs?):
 *
 * | base | ours | theirs | kết quả |
 * |------|------|--------|---------|
 * |  ?   |  ✗   |   ✗    | không có file — cả hai cùng xoá, hoặc chưa từng có |
 * |  ✗   |  ✓   |   ✗    | ours THÊM file mới ⇒ lấy `ours`, không xung đột |
 * |  ✗   |  ✗   |   ✓    | theirs THÊM file mới ⇒ lấy `theirs`, không xung đột |
 * |  ✓   |  ✓   |   ✗    | theirs xoá. ours không đụng ⇒ xoá; ours có sửa ⇒ **xung đột** |
 * |  ✓   |  ✗   |   ✓    | đối xứng với hàng trên |
 * |  ✗   |  ✓   |   ✓    | hai phía cùng thêm ⇒ `merge3` với base rỗng (add/add) |
 * |  ✓   |  ✓   |   ✓    | ca thường ⇒ `merge3` |
 *
 * Hàng "ours THÊM file mới" là chỗ dễ sai nhất và sai rất đắt: coi nó là xung
 * đột sẽ làm mọi merge có file mới ở một phía đều kẹt, tức phần lớn merge đời
 * thực. Nó KHÔNG xung đột vì phía kia chưa từng biết tới đường dẫn đó.
 */
export function planThreeWay(input: ThreeWayInput): ThreeWayPlan {
  const { base, ours, theirs, oursLabel, theirsLabel } = input;

  const paths: Record<FilePath, true> = {};
  for (const p of sortedKeys(base)) paths[p] = true;
  for (const p of sortedKeys(ours)) paths[p] = true;
  for (const p of sortedKeys(theirs)) paths[p] = true;

  const contents: Record<FilePath, Lines> = {};
  const conflicts: ConflictFile[] = [];

  for (const path of sortedKeys(paths)) {
    const inBase = Object.hasOwn(base, path);
    const inOurs = Object.hasOwn(ours, path);
    const inTheirs = Object.hasOwn(theirs, path);
    const b = base[path] ?? [];
    const o = ours[path] ?? [];
    const t = theirs[path] ?? [];

    if (!inOurs && !inTheirs) continue;

    if (!inBase && inOurs && !inTheirs) {
      contents[path] = o;
      continue;
    }
    if (!inBase && !inOurs && inTheirs) {
      contents[path] = t;
      continue;
    }

    if (inBase && inOurs && !inTheirs) {
      if (linesEqual(b, o)) continue; // ours không đụng tới ⇒ xoá thắng
      contents[path] = renderConflict(wholeFileConflict(b, o, []), oursLabel, theirsLabel);
      conflicts.push({ path, hunks: wholeFileConflict(b, o, []), oursLabel, theirsLabel });
      continue;
    }
    if (inBase && !inOurs && inTheirs) {
      if (linesEqual(b, t)) continue; // theirs không đụng tới ⇒ xoá thắng
      contents[path] = renderConflict(wholeFileConflict(b, [], t), oursLabel, theirsLabel);
      conflicts.push({ path, hunks: wholeFileConflict(b, [], t), oursLabel, theirsLabel });
      continue;
    }

    // Cả hai phía đều có file. `base` rỗng ở đây chính là ca add/add, và
    // `merge3` đã xử đúng nó (hai phía cùng khác một base rỗng ⇒ xung đột, trừ
    // khi nội dung giống hệt nhau).
    const merged = merge3(b, o, t);
    if (merged.conflicted) {
      contents[path] = renderConflict(merged.hunks, oursLabel, theirsLabel);
      conflicts.push({ path, hunks: merged.hunks, oursLabel, theirsLabel });
    } else {
      contents[path] = merged.merged;
    }
  }

  return { contents, conflicts };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GHI KẾT QUẢ TRỘN XUỐNG REPO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Index trong lúc một thao tác đang xung đột.
 *
 * File đã giải được → staged sẵn. File còn xung đột → **giữ nguyên ô index cũ**.
 *
 * Giữ ô cũ là cách mô hình này thay cho "unmerged stage" của git thật: worktree
 * lúc đó chứa marker nên `blobOid(worktree) !== index[path]`, và `git status` tự
 * động báo file đó là đang sửa dở. Không phải thêm trường nào vào hợp đồng.
 *
 * ⚠ Phải trả `ObjectStore` mới ra ngoài. Băm một blob rồi vứt kho đi sẽ để index
 * trỏ vào một Oid không có trong kho, và triệu chứng là file biến mất lúc
 * `--continue` dựng tree từ index — rất lâu sau, không lỗi nào báo.
 */
export function stageResolved(
  repo: Repo,
  plan: ThreeWayPlan,
): readonly [ObjectStore, Index] {
  const conflicted = new Set(plan.conflicts.map((c) => c.path));
  let store = repo.objects;
  const index: Record<FilePath, Oid> = {};
  for (const [path, oid] of sortedEntries(repo.index)) {
    if (conflicted.has(path)) index[path] = oid;
  }
  for (const [path, lines] of sortedEntries(plan.contents)) {
    if (conflicted.has(path)) continue;
    const [next, oid] = putObject(store, makeBlob(lines));
    store = next;
    index[path] = oid;
  }
  return [store, index];
}

/**
 * Đặt repo vào trạng thái "đang kẹt": worktree mang marker, index staged phần
 * đã giải, `pending` được đặt.
 *
 * Dùng chung cho merge, rebase và cherry-pick — ba lệnh khác nhau ở `pending` và
 * ở câu chữ, giống nhau ở đúng ba phép ghi này.
 */
export function enterConflict(repo: Repo, plan: ThreeWayPlan, pending: PendingOp): Repo {
  const [store, index] = stageResolved(repo, plan);
  const staged = setIndex({ ...repo, objects: store }, index);
  const written = setWorktree(staged, { ...untrackedWorktree(repo), ...plan.contents });
  return { ...written, pending };
}

/** Worktree + index khớp đúng một bản nội dung, file chưa track giữ nguyên. */
export function applyContents(repo: Repo, contents: Contents): Repo {
  let store = repo.objects;
  const index: Record<FilePath, Oid> = {};
  for (const [path, lines] of sortedEntries(contents)) {
    const [next, oid] = putObject(store, makeBlob(lines));
    store = next;
    index[path] = oid;
  }
  const withStore: Repo = { ...repo, objects: store };
  return setWorktree(setIndex(withStore, index), {
    ...untrackedWorktree(repo),
    ...contents,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. KIỂM "ĐÃ GIẢI XONG CHƯA"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Đường dẫn nào còn marker conflict trong worktree.
 *
 * ⚠ **Tiêu chí là MARKER, không phải `git add`.** Đây là một khác biệt có chủ ý
 * so với git thật (và so với `gitRevertContinue` ở `reset.ts`, vốn dùng tiêu chí
 * index), và lý do là ô nghiệm thu: `--continue` khi còn marker phải đỏ **và nêu
 * tên file**. Tiêu chí index không nêu được điều đó — một file đã `git add` khi
 * còn nguyên marker sẽ đi lọt, và người chơi commit luôn cả `<<<<<<<` vào lịch
 * sử mà không gì cản.
 *
 * `git add` vẫn không thừa: `--continue` dựng commit từ INDEX, nên người chơi
 * add rồi continue là đường đi bình thường. Nhưng đường "sửa sạch marker rồi
 * continue thẳng" cũng chạy, vì `stageConflicted` dưới đây tự đồng bộ index cho
 * những đường dẫn đang xung đột. Hai lời giải cho một mục tiêu — đúng tinh thần
 * chấm theo TRẠNG THÁI của ô nghiệm thu AC-9.
 *
 * File bị xoá khỏi worktree = người chơi chọn "bỏ file này đi", và đó là một
 * cách giải hợp lệ của xung đột modify/delete.
 */
export function unresolvedPaths(
  repo: Repo,
  conflicts: readonly ConflictFile[],
): readonly FilePath[] {
  const out: FilePath[] = [];
  for (const conflict of conflicts) {
    const lines = repo.worktree[conflict.path];
    if (lines === undefined) continue;
    if (stripResolved(lines) === null) out.push(conflict.path);
  }
  return out;
}

/**
 * Đồng bộ index theo worktree cho những đường dẫn vừa xung đột.
 *
 * Chỉ chạm đúng những đường dẫn đó. Một file người chơi sửa ngoài danh sách
 * xung đột mà chưa `git add` thì vẫn KHÔNG vào commit — đúng như git thật, và
 * đó là chỗ bài học về index còn nguyên giá trị.
 */
export function stageConflicted(repo: Repo, conflicts: readonly ConflictFile[]): Repo {
  let store = repo.objects;
  let index: Record<FilePath, Oid> = { ...repo.index };
  for (const conflict of conflicts) {
    const lines = repo.worktree[conflict.path];
    if (lines === undefined) {
      const next: Record<FilePath, Oid> = {};
      for (const [path, oid] of sortedEntries(index)) {
        if (path !== conflict.path) next[path] = oid;
      }
      index = next;
      continue;
    }
    const [nextStore, oid] = putObject(store, makeBlob(lines));
    store = nextStore;
    index[conflict.path] = oid;
  }
  const withStore: Repo = { ...repo, objects: store };
  return setIndex(withStore, index);
}

/**
 * Lỗi `unmerged-paths`, **nêu đích danh từng file còn marker**.
 *
 * Ô nghiệm thu đòi đúng chỗ này: một câu chung chung kiểu "còn file chưa giải
 * quyết" đẩy người chơi vào vòng thử-đại mà khảo sát ICTERI §5.7 đo được.
 */
export function unmergedPathsError(verb: string, paths: readonly FilePath[]): GitError {
  const listed = paths.map((path) => `\`${path}\``).join(', ');
  return gitError(
    'unmerged-paths',
    `Còn ${paths.length} file mang marker conflict: ${listed}.`,
    'Marker `<<<<<<<`, `|||||||`, `=======` và `>>>>>>>` là ba bản nội dung git đặt cạnh nhau để bạn chọn. ' +
      'Chừng nào chúng còn trong file thì file đó chưa phải một nội dung có nghĩa, nên commit nó vào lịch sử là commit luôn cả dấu vết của chỗ kẹt.',
    `Mở \`${paths[0] ?? '<file>'}\`, giữ lại phần bạn muốn và xoá hết dòng marker, rồi \`git ${verb} --continue\`.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TIỆN ÍCH CHUNG
// ═══════════════════════════════════════════════════════════════════════════

export function describeCommit(repo: Repo, oid: Oid): string {
  const commit = getCommit(repo.objects, oid);
  return commit === null ? shortOid(oid) : `${shortOid(oid)} ${commit.message}`;
}

export function notACommitError(oid: Oid): GitError {
  return gitError(
    'not-a-commit',
    `\`${shortOid(oid)}\` không phải một commit.`,
    'Object mang Oid này không có trong kho, hoặc có nhưng là blob/tree chứ không phải commit.',
    'Gõ `git log --oneline` để xem commit đang với tới được, hoặc `git reflog` nếu bạn đang tìm một commit vừa mất.',
  );
}

export function unbornHeadError(what: string): GitError {
  return gitError(
    'bad-usage',
    `Chưa có commit nào nên không ${what} được.`,
    'HEAD đang trỏ vào một branch chưa sinh ra — branch chỉ ra đời khi có commit đầu tiên trỏ vào nó.',
    'Tạo commit đầu tiên trước: `git add .` rồi `git commit -m "commit đầu"`.',
  );
}

/**
 * Nội dung của cha thứ nhất một commit — tức "base" khi áp chính commit đó lên
 * chỗ khác. Commit gốc (không cha) cho ra bản rỗng, và đó là đúng: nó thêm mọi
 * file của nó vào từ hư không.
 */
export function parentContents(store: ObjectStore, oid: Oid): Contents {
  const commit = getCommit(store, oid);
  if (commit === null) return {};
  return commitContents(store, commit.parents[0] ?? null);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. `git merge`
// ═══════════════════════════════════════════════════════════════════════════

/** Nhánh (hoặc commit) đang được trộn VÀO HEAD. */
export interface MergeTarget {
  readonly oid: Oid;
  /** Dạng người chơi đọc: `feature`, `origin/main`, hoặc một Oid rút gọn. */
  readonly label: string;
  /** Quyết định câu message mặc định. Mặc định `'branch'`. */
  readonly kind?: 'branch' | 'commit';
}

export interface MergeOptions {
  /** Luôn tạo commit merge, kể cả khi fast-forward được. */
  readonly noFf?: boolean;
  /** Gom thay đổi vào index + worktree nhưng KHÔNG tạo commit merge. */
  readonly squash?: boolean;
  readonly message?: string;
}

function mergeMessage(target: MergeTarget, options: MergeOptions): string {
  if (options.message !== undefined) return options.message;
  // Giữ nguyên chữ git thật sinh ra thay vì dịch: người chơi sẽ gặp lại đúng
  // dòng này trong một repo thật, và dịch nó đi là dạy sai một thứ họ phải nhận
  // ra. Cùng lý do `reset.ts` giữ `Revert "…"`.
  return (target.kind ?? 'branch') === 'branch'
    ? `Merge branch '${target.label}'`
    : `Merge commit '${target.label}'`;
}

/**
 * `git merge <target>`.
 *
 * Ba đường đi, theo đúng thứ tự kiểm:
 *
 *  1. **Đã cập nhật rồi** — `target` đã nằm trong lịch sử HEAD. Không làm gì.
 *  2. **Fast-forward** — HEAD là tổ tiên của `target`. Chỉ dời con trỏ,
 *     **không tạo commit nào**. `--no-ff` ép sang đường 3.
 *  3. **Ba ngả** — tạo commit hai cha, hoặc dừng lại ở xung đột.
 */
export function gitMerge(
  repo: Repo,
  target: MergeTarget,
  ctx: OpContext,
  options: MergeOptions = {},
): GitOpResult {
  if (repo.pending !== null) return fail(repo, operationInProgress(repo));
  if (getCommit(repo.objects, target.oid) === null) {
    return fail(repo, notACommitError(target.oid));
  }

  const head = headOid(repo);

  // Merge vào một branch chưa sinh ra: git coi đó là fast-forward từ hư không.
  // Không phải một ca hiếm — nó xảy ra ngay sau `git init` + `git fetch`.
  if (head === null) {
    return fastForward(repo, target, ctx, true);
  }

  if (isAncestor(repo.objects, target.oid, head)) {
    return ok(repo, [
      line(`Đã cập nhật rồi — \`${target.label}\` nằm sẵn trong lịch sử của HEAD.`, 'hint'),
      line('Không có gì để trộn, nên không commit nào được tạo ra.', 'hint'),
    ]);
  }

  if (!isIndexClean(repo) || !isWorktreeClean(repo)) {
    return fail(repo, dirtyTree(repo, 'merge'));
  }

  const canFastForward = isAncestor(repo.objects, head, target.oid);
  if (canFastForward && options.noFf !== true && options.squash !== true) {
    return fastForward(repo, target, ctx, false);
  }

  const base = mergeBase(repo.objects, head, target.oid);
  const plan = planThreeWay({
    base: commitContents(repo.objects, base),
    ours: headContents(repo),
    theirs: commitContents(repo.objects, target.oid),
    oursLabel: oursLabelOf(repo),
    theirsLabel: target.label,
  });

  const unrelated: readonly OutputLine[] =
    base === null
      ? [
          line(
            `\`${target.label}\` không có tổ tiên chung với HEAD — hai lịch sử rời nhau, nên mọi file trùng đường dẫn đều phải hỏi.`,
            'warn',
          ),
        ]
      : [];

  if (plan.conflicts.length > 0) {
    const pending: PendingOp = {
      kind: 'merge',
      theirs: target.oid,
      theirsLabel: target.label,
      originalHead: head,
      conflicts: plan.conflicts,
    };
    return {
      repo: enterConflict(repo, plan, pending),
      output: [
        ...unrelated,
        line(`Trộn \`${target.label}\` vào \`${oursLabelOf(repo)}\` gặp xung đột.`, 'error'),
        ...plan.conflicts.map((c) => line(`  xung đột: ${c.path}`, 'error')),
        line(
          'Đây KHÔNG phải lỗi của bạn. Git có ba bản của mỗi file — bản gốc, bản của bạn, bản của nhánh kia — và ở những chỗ này hai bản sau mâu thuẫn nhau so với bản gốc, nên nó dừng lại hỏi thay vì đoán.',
          'hint',
        ),
        line('Mở file, giữ phần bạn muốn, xoá hết dòng marker, rồi `git merge --continue`.', 'hint'),
        line('Đổi ý thì `git merge --abort` đưa mọi thứ về đúng lúc trước khi gõ lệnh.', 'hint'),
      ],
      error: gitError(
        'merge-conflict',
        `${plan.conflicts.length} file xung đột khi trộn \`${target.label}\`.`,
        'Repo đang ở giữa một merge dở dang: worktree đã mang nội dung cả hai phía kèm marker, và con trỏ branch CHƯA dịch chuyển. ' +
          'Xung đột là chuyện bình thường của việc nhiều người cùng sửa một file — git dừng lại vì nó không có cách nào biết bạn muốn giữ bên nào.',
        '`git status` liệt kê file đang xung đột. Sửa xong thì `git merge --continue`, hoặc `git merge --abort` để quay lại.',
      ),
    };
  }

  if (options.squash === true) {
    const applied = applyContents(repo, plan.contents);
    return ok(applied, [
      ...unrelated,
      line(`Đã gom mọi thay đổi của \`${target.label}\` vào index.`, 'success'),
      line(
        'KHÔNG có commit merge nào được tạo, và không có cha thứ hai — lịch sử sẽ không ghi lại rằng hai nhánh từng gặp nhau.',
        'hint',
      ),
      line('Gõ `git commit` để biến chỗ đã gom này thành một commit thường.', 'hint'),
    ]);
  }

  return commitMerge(repo, plan.contents, [head, target.oid], mergeMessage(target, options), ctx, [
    ...unrelated,
  ]);
}

/**
 * Dời con trỏ, **không tạo object nào**.
 *
 * Cả nội dung lẫn commit đều đã nằm sẵn trong kho — đó chính là ý nghĩa của "tổ
 * tiên chung CHÍNH LÀ HEAD". Ô nghiệm thu đếm số commit object trước/sau để
 * ghim điều đó.
 */
function fastForward(
  repo: Repo,
  target: MergeTarget,
  ctx: OpContext,
  fromUnborn: boolean,
): GitOpResult {
  const moved = advanceHead(repo, target.oid, {
    op: 'merge',
    message: `fast-forward tới ${target.label}`,
    logicalTime: ctx.logicalTime,
  });
  const staged = setIndex(moved, indexFromCommit(moved, target.oid));
  const written = setWorktree(staged, worktreeAt(repo, target.oid));
  return ok(written, [
    line(`Fast-forward tới ${describeCommit(written, target.oid)}`, 'success'),
    fromUnborn
      ? line('Branch vừa sinh ra ngay tại đó — trước lệnh này nó chưa trỏ vào đâu cả.', 'hint')
      : line(
          'KHÔNG có commit merge nào được tạo. Lịch sử của bạn đã nằm trọn trong nhánh kia, nên git chỉ cần dời con trỏ tới — dùng `--no-ff` nếu bạn muốn một commit merge ghi lại lần gặp nhau này.',
          'hint',
        ),
  ]);
}

/**
 * Tạo commit merge.
 *
 * ⛔ `parents[0]` LÀ HEAD, `parents[1]` là nhánh trộn vào. Thứ tự này KHÔNG được
 * đảo: `HEAD~1` đi theo cha thứ nhất còn `HEAD^2` đi theo cha thứ hai (bài G06),
 * và đảo hai cha sẽ làm mọi phép đi trên lịch sử chỉ về nhánh sai — không lỗi
 * nào báo, chỉ là mọi bài về `~` và `^` dạy ngược.
 */
function commitMerge(
  repo: Repo,
  contents: Contents,
  parents: readonly Oid[],
  message: string,
  ctx: OpContext,
  prefix: readonly OutputLine[],
): GitOpResult {
  const [store, tree] = writeContents(repo.objects, contents);
  const [store2, oid] = writeCommit(store, {
    tree,
    parents,
    message,
    author: ctx.author,
    logicalTime: ctx.logicalTime,
  });

  const withStore: Repo = { ...repo, objects: store2, pending: null };
  const moved = advanceHead(withStore, oid, {
    op: 'merge',
    message,
    logicalTime: ctx.logicalTime,
  });
  const staged = setIndex(moved, indexFromCommit(moved, oid));
  const written = setWorktree(staged, { ...untrackedWorktree(repo), ...contents });

  return ok(written, [
    ...prefix,
    line(`Đã tạo commit merge ${describeCommit(written, oid)}`, 'success'),
    line(
      'Commit này có HAI cha. `HEAD~1` đi theo cha thứ nhất (nhánh bạn đang đứng), `HEAD^2` đi theo cha thứ hai (nhánh vừa trộn vào).',
      'hint',
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. `git merge --continue` / `--abort`
// ═══════════════════════════════════════════════════════════════════════════

export function mergeContinue(repo: Repo, ctx: OpContext): GitOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('merge'));
  if (pending.kind !== 'merge') return fail(repo, wrongPendingKind(pending.kind, 'merge'));

  const unresolved = unresolvedPaths(repo, pending.conflicts);
  if (unresolved.length > 0) {
    return fail(repo, unmergedPathsError('merge', unresolved));
  }

  const staged = stageConflicted(repo, pending.conflicts);
  const [store, tree] = putObject(staged.objects, makeTree(staged.index));
  const target = getCommit(staged.objects, pending.theirs);
  const [store2, oid] = writeCommit(store, {
    tree,
    // Cha thứ nhất là HEAD lúc bắt đầu merge — con trỏ chưa hề dịch chuyển kể từ
    // lúc đó, vì commit merge chỉ ra đời ở đây.
    parents: [pending.originalHead, pending.theirs],
    message: `Merge branch '${pending.theirsLabel}'`,
    author: ctx.author,
    logicalTime: ctx.logicalTime,
  });
  void target;

  const withStore: Repo = { ...staged, objects: store2, pending: null };
  const moved = advanceHead(withStore, oid, {
    op: 'merge',
    message: `Merge branch '${pending.theirsLabel}'`,
    logicalTime: ctx.logicalTime,
  });
  return ok(moved, [
    line(`Xung đột đã giải xong. Đã tạo commit merge ${describeCommit(moved, oid)}`, 'success'),
    line('Cả hai nhánh vẫn nằm nguyên trong lịch sử — merge KHÔNG viết lại gì cả.', 'hint'),
  ]);
}

/**
 * `git merge --abort` — về đúng lúc trước khi gõ lệnh.
 *
 * Bốn thứ phải quay lại: **worktree**, **index**, **ref**, và **`pending`**.
 * Ref chưa hề dịch chuyển (commit merge chỉ ra đời ở `--continue`), nên ở đây
 * chỉ phải trả hai vùng và xoá `pending`. Cố ý KHÔNG gọi `advanceHead`: ghi một
 * mục reflog cho một ref không dịch chuyển là bịa ra lịch sử, và `git reflog` sẽ
 * hiện một dòng ứng với việc không xảy ra.
 */
export function mergeAbort(repo: Repo): GitOpResult {
  const pending = repo.pending;
  if (pending === null) return fail(repo, noOperation('merge'));
  if (pending.kind !== 'merge') return fail(repo, wrongPendingKind(pending.kind, 'merge'));
  return ok(restoreTo(repo, pending.originalHead), [
    line(`Đã huỷ merge. Quay về ${describeCommit(repo, pending.originalHead)}`, 'success'),
    line('Không có gì của nhánh kia còn sót lại trong worktree.', 'hint'),
  ]);
}

/**
 * Trả index + worktree về đúng một commit và xoá `pending`.
 *
 * Dùng chung cho `--abort` của cả ba lệnh. File chưa track sống sót — chúng
 * chưa bao giờ thuộc về thao tác đang bị huỷ.
 */
export function restoreTo(repo: Repo, oid: Oid): Repo {
  const staged = setIndex(repo, indexFromCommit(repo, oid));
  const written = setWorktree(staged, worktreeAt(repo, oid));
  return { ...written, pending: null };
}

/** Chênh lệch giữa hai bản nội dung, dùng để in một dòng tóm tắt. */
export function changedPaths(before: Contents, after: Contents): readonly FilePath[] {
  const paths: Record<FilePath, true> = {};
  for (const p of sortedKeys(before)) paths[p] = true;
  for (const p of sortedKeys(after)) paths[p] = true;
  const out: FilePath[] = [];
  for (const path of sortedKeys(paths)) {
    const a = before[path];
    const b = after[path];
    if (a === undefined || b === undefined) {
      out.push(path);
      continue;
    }
    if (!linesEqual(a, b)) out.push(path);
  }
  return out;
}

/** Nội dung một đường dẫn đã được staged đúng như trong worktree chưa. */
export function pathStaged(repo: Repo, path: FilePath): boolean {
  const inIndex = Object.hasOwn(repo.index, path);
  const inWork = Object.hasOwn(repo.worktree, path);
  if (!inIndex && !inWork) return true;
  if (!inIndex || !inWork) return false;
  return repo.index[path] === blobOid(repo.worktree[path] ?? []);
}
