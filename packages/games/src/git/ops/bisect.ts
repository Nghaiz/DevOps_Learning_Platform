/**
 * `git bisect start|good|bad|reset` — bài G32.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRẠNG THÁI PHIÊN NẰM TRONG REF, KHÔNG NẰM TRONG HỢP ĐỒNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Git thật giữ phiên bisect ở `refs/bisect/*` cộng vài file trong `.git/`. Ở
 * đây **toàn bộ** phiên nằm trong ref, và đó là quyết định có chủ ý: thêm một
 * trường `bisect` vào `Repo` sẽ bắt sáu lane khác biên dịch lại quanh một khái
 * niệm mà đúng một level dùng tới, và `contract.ts` nói thẳng là lead sở hữu nó.
 *
 *     refs/bisect/bad                  commit đã HỎNG (mốc trên)
 *     refs/bisect/good-<oid>           mỗi commit đã xác nhận TỐT (mốc dưới)
 *     refs/bisect/start                Oid của HEAD lúc `bisect start`
 *     refs/bisect/start-head/<nhánh>   cùng Oid; VẮNG ⇒ lúc start HEAD đang detached
 *
 * Ref không mang được tên nhánh ở phần *giá trị* (giá trị luôn là một Oid), nên
 * tên nhánh được mã hoá vào phần *tên*. Xấu, và được viết ra ở đây đúng vì nó
 * xấu — `bisect reset` phải trả người chơi về `main` chứ không phải về một
 * detached HEAD, và đó là khác biệt người chơi nhìn thấy.
 *
 * Hai hệ quả đã biết và chấp nhận:
 *
 *  1. Trong lúc bisect, `refs/bisect/*` là **gốc reachability**, nên `git fsck`
 *     không báo commit nào mồ côi. Đúng: `bisect reset` quay về được thì những
 *     commit đó đang sống.
 *  2. `setRef` ghi reflog cho mọi ref, kể cả ref bisect. Đó là nhiễu trong
 *     `repo.reflog`, không ai hiển thị, và **không** được tránh bằng cách sửa
 *     ref trực tiếp — `setRef` là đường DUY NHẤT đổi ref (xem `repo.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐIỂM CHIA LÀ HÀM THUẦN CỦA TẬP ỨNG VIÊN ĐÃ SẮP
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Không `Math.random()`, không heuristic phụ thuộc thứ tự duyệt. Ứng viên được
 * sắp theo `(logicalTime, oid)` tăng dần rồi lấy phần tử giữa. Với lịch sử
 * tuyến tính — đúng thứ bài G32 dựng — đó chính là phép chia đôi, và nó cho cùng
 * một chuỗi câu hỏi ở mọi máy, mọi lần phát lại.
 */

import type { GitError, Oid, OutputLine, RefName, Repo } from '../contract.ts';
import { compareKeys, sortedKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { getCommit, reachableFrom } from '../objects.ts';
import {
  branchRef,
  deleteRef,
  headOid,
  headRef,
  isIndexClean,
  isWorktreeClean,
  moveHead,
  setIndex,
  setRef,
  setWorktree,
  shortRefName,
} from '../repo.ts';
import {
  dirtyTree,
  fail,
  indexFromCommit,
  line,
  ok,
  worktreeAt,
  type GitOpResult,
  type OpContext,
} from './reset.ts';

const BISECT_PREFIX = 'refs/bisect/';
const BAD_REF: RefName = 'refs/bisect/bad';
const START_REF: RefName = 'refs/bisect/start';
const GOOD_PREFIX = 'refs/bisect/good-';
const START_HEAD_PREFIX = 'refs/bisect/start-head/';

// ═══════════════════════════════════════════════════════════════════════════
// 1. ĐỌC TRẠNG THÁI PHIÊN
// ═══════════════════════════════════════════════════════════════════════════

export interface BisectState {
  readonly active: boolean;
  readonly bad: Oid | null;
  /** Đã sắp, không lặp. */
  readonly good: readonly Oid[];
  readonly startOid: Oid | null;
  /** `null` = lúc `start` HEAD đang detached. */
  readonly startBranch: string | null;
}

export function bisectState(repo: Repo): BisectState {
  let bad: Oid | null = null;
  let startOid: Oid | null = null;
  let startBranch: string | null = null;
  const good: Oid[] = [];
  let active = false;

  for (const ref of sortedKeys(repo.refs)) {
    if (!ref.startsWith(BISECT_PREFIX)) continue;
    const oid = repo.refs[ref];
    if (oid === undefined) continue;
    active = true;
    // ⚠ So BẰNG chứ không `startsWith`: `refs/bisect/start-head/main` cũng bắt
    // đầu bằng `refs/bisect/start`, nên một phép `startsWith` ở đây sẽ đọc tên
    // nhánh thành mốc bắt đầu.
    if (ref === BAD_REF) bad = oid;
    else if (ref === START_REF) startOid = oid;
    else if (ref.startsWith(START_HEAD_PREFIX)) startBranch = ref.slice(START_HEAD_PREFIX.length);
    else if (ref.startsWith(GOOD_PREFIX)) good.push(oid);
  }

  return { active, bad, good: [...good].sort(compareKeys), startOid, startBranch };
}

/**
 * Commit còn khả nghi: với tới được từ `bad`, không với tới được từ bất kỳ
 * `good` nào. Sắp theo `(logicalTime, oid)` tăng dần — cũ trước.
 *
 * Tập này CÓ chứa `bad`. Đó là đúng: ta đang tìm commit HỎNG ĐẦU TIÊN, và nếu
 * mọi tổ tiên của `bad` đều tốt thì chính `bad` là câu trả lời.
 */
export function bisectCandidates(repo: Repo, state: BisectState): readonly Oid[] {
  if (state.bad === null) return [];
  const suspect = reachableFrom(repo.objects, [state.bad]);
  const cleared = reachableFrom(repo.objects, state.good);
  const out: Oid[] = [];
  for (const oid of suspect) {
    if (!cleared.has(oid)) out.push(oid);
  }
  return out.sort((a, b) => {
    const ta = getCommit(repo.objects, a)?.logicalTime ?? 0;
    const tb = getCommit(repo.objects, b)?.logicalTime ?? 0;
    if (ta !== tb) return ta - tb;
    return compareKeys(a, b);
  });
}

/**
 * Commit tiếp theo phải thử. `null` = không còn gì để thử, tức `bad` chính là
 * commit hỏng đầu tiên.
 *
 * `bad` bị loại khỏi danh sách thử vì ta ĐÃ biết nó hỏng — hỏi lại người chơi
 * về nó là tốn một bước và làm số bước vượt trần `⌈log2(n)⌉+1`.
 */
export function nextBisectCommit(repo: Repo, state: BisectState): Oid | null {
  if (state.bad === null || state.good.length === 0) return null;
  const toTest = bisectCandidates(repo, state).filter((oid) => oid !== state.bad);
  if (toTest.length === 0) return null;
  return toTest[Math.floor(toTest.length / 2)] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LỆNH
// ═══════════════════════════════════════════════════════════════════════════

/** `git bisect start [<xấu> <tốt>]`. Hai Oid đã được tầng trên phân giải. */
export function gitBisectStart(
  repo: Repo,
  bad: Oid | null,
  good: Oid | null,
  ctx: OpContext,
): GitOpResult {
  if (bisectState(repo).active) {
    return fail(
      repo,
      gitError(
        'operation-in-progress',
        'Đang có một phiên bisect chạy dở.',
        'Bisect thu hẹp dần khoảng nghi ngờ, nên hai phiên chồng nhau sẽ trộn hai khoảng khác nhau vào làm một.',
        'Kết thúc phiên cũ bằng `git bisect reset` rồi bắt đầu lại.',
      ),
    );
  }
  if (!isIndexClean(repo) || !isWorktreeClean(repo)) {
    return fail(repo, dirtyTree(repo, 'bisect'));
  }
  const head = headOid(repo);
  if (head === null) {
    return fail(
      repo,
      gitError(
        'bad-usage',
        'Chưa có commit nào nên không bisect được.',
        'Bisect chia đôi một đoạn lịch sử. Branch chưa sinh ra thì chưa có lịch sử nào để chia.',
        'Tạo vài commit trước đã.',
      ),
    );
  }
  for (const oid of [bad, good]) {
    if (oid !== null && getCommit(repo.objects, oid) === null) {
      return fail(repo, notACommitForBisect(oid));
    }
  }

  const stamp = { op: 'bisect', message: 'bắt đầu phiên bisect', logicalTime: ctx.logicalTime };
  let next = setRef(repo, START_REF, head, stamp);
  const ref = headRef(repo);
  if (ref !== null) {
    next = setRef(next, `${START_HEAD_PREFIX}${shortRefName(ref)}`, head, stamp);
  }
  if (bad !== null) next = setRef(next, BAD_REF, bad, stamp);
  if (good !== null) next = setRef(next, `${GOOD_PREFIX}${good}`, good, stamp);

  const opening = line('Bắt đầu bisect. Đánh dấu bằng `git bisect good` / `git bisect bad`.', 'hint');
  return advance(next, ctx, [opening]);
}

/** `git bisect good|bad [<commit>]`. Không nêu commit ⇒ commit HEAD đang đứng. */
export function gitBisectMark(
  repo: Repo,
  verdict: 'good' | 'bad',
  target: Oid | null,
  ctx: OpContext,
): GitOpResult {
  const state = bisectState(repo);
  if (!state.active) return fail(repo, noBisect(verdict));

  const oid = target ?? headOid(repo);
  if (oid === null || getCommit(repo.objects, oid) === null) {
    return fail(repo, notACommitForBisect(oid ?? '(HEAD)'));
  }

  const stamp = {
    op: 'bisect',
    message: `đánh dấu ${shortOid(oid)} là ${verdict}`,
    logicalTime: ctx.logicalTime,
  };
  const next =
    verdict === 'bad'
      ? setRef(repo, BAD_REF, oid, stamp)
      : setRef(repo, `${GOOD_PREFIX}${oid}`, oid, stamp);

  return advance(next, ctx, [
    line(`${shortOid(oid)} được đánh dấu là ${verdict === 'bad' ? 'ĐÃ HỎNG' : 'CÒN TỐT'}.`),
  ]);
}

/**
 * `git bisect reset` — kết thúc phiên và trả HEAD về đúng chỗ trước khi bắt đầu.
 *
 * Trả về nhánh cũ nếu lúc `start` HEAD đang bám một nhánh; về detached ở
 * `startOid` nếu lúc đó đã detached. Bỏ chi tiết này đi thì người chơi kết thúc
 * bisect xong bị bỏ lại ở detached HEAD mà không hiểu vì sao — đúng loại trải
 * nghiệm làm người ta sợ git.
 */
export function gitBisectReset(repo: Repo, ctx: OpContext): GitOpResult {
  const state = bisectState(repo);
  if (!state.active) return fail(repo, noBisect('reset'));

  let next = repo;
  for (const ref of sortedKeys(repo.refs)) {
    if (ref.startsWith(BISECT_PREFIX)) next = deleteRef(next, ref);
  }

  const back = state.startOid;
  if (back === null) {
    return ok(next, [line('Đã kết thúc phiên bisect.', 'success')]);
  }

  const branch = state.startBranch;
  const head =
    branch === null
      ? ({ type: 'detached', oid: back } as const)
      : ({ type: 'ref', ref: branchRef(branch) } as const);
  const moved = moveHead(next, head, {
    op: 'bisect',
    message: 'kết thúc phiên bisect',
    logicalTime: ctx.logicalTime,
  });
  const restored = setWorktree(
    setIndex(moved, indexFromCommit(moved, back)),
    worktreeAt(moved, back),
  );

  return ok(restored, [
    line(
      branch === null
        ? `Đã kết thúc bisect. HEAD quay về ${shortOid(back)} (vẫn detached, như lúc bắt đầu).`
        : `Đã kết thúc bisect. HEAD quay về \`${branch}\`.`,
      'success',
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. BƯỚC TIẾP THEO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sau mỗi lần đánh dấu: hoặc hỏi thiếu mốc, hoặc checkout commit giữa, hoặc
 * công bố kết quả. Cả ba nhánh đều KHÔNG phải lỗi — bisect là một phiên nhiều
 * bước, và "còn thiếu một mốc" là trạng thái bình thường của nó.
 */
function advance(repo: Repo, ctx: OpContext, prefix: readonly OutputLine[]): GitOpResult {
  const state = bisectState(repo);
  const output: OutputLine[] = [...prefix];

  if (state.bad === null || state.good.length === 0) {
    output.push(
      line(
        state.bad === null
          ? 'Cần một commit ĐÃ HỎNG: `git bisect bad [<commit>]`.'
          : 'Cần một commit CÒN TỐT: `git bisect good [<commit>]`.',
        'hint',
      ),
    );
    return ok(repo, output);
  }

  const next = nextBisectCommit(repo, state);
  if (next === null) {
    const answer = state.bad;
    const commit = getCommit(repo.objects, answer);
    output.push(
      line(`${shortOid(answer)} là commit hỏng đầu tiên.`, 'success'),
      line(`    ${commit?.message ?? ''}`),
      line('Gõ `git bisect reset` để quay về chỗ cũ.', 'hint'),
    );
    return ok(repo, output);
  }

  const remaining = bisectCandidates(repo, state).filter((oid) => oid !== state.bad).length;
  const moved = moveHead(
    repo,
    { type: 'detached', oid: next },
    { op: 'checkout', message: `bisect: kiểm tra ${shortOid(next)}`, logicalTime: ctx.logicalTime },
  );
  const checked = setWorktree(
    setIndex(moved, indexFromCommit(moved, next)),
    worktreeAt(moved, next),
  );

  const commit = getCommit(repo.objects, next);
  output.push(
    line(`Bisecting: còn ${Math.max(remaining - 1, 0)} commit nữa sau bước này.`),
    line(`HEAD giờ ở ${shortOid(next)} ${commit?.message ?? ''} (detached)`, 'success'),
    line('Thử xem commit này còn tốt không, rồi `git bisect good` hoặc `git bisect bad`.', 'hint'),
  );
  return ok(checked, output);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LỖI
// ═══════════════════════════════════════════════════════════════════════════

function noBisect(sub: string): GitError {
  return gitError(
    'no-operation-in-progress',
    `Không có phiên bisect nào đang chạy.`,
    `\`git bisect ${sub}\` chỉ có nghĩa bên trong một phiên — bisect nhớ mốc tốt và mốc hỏng qua từng bước, và chưa \`start\` thì chưa có mốc nào.`,
    'Bắt đầu bằng `git bisect start`, rồi đánh dấu một commit `bad` và một commit `good`.',
  );
}

function notACommitForBisect(oid: Oid): GitError {
  return gitError(
    'not-a-commit',
    `\`${shortOid(oid)}\` không phải một commit.`,
    'Bisect đi trên đồ thị commit, nên mọi mốc phải là commit có thật trong kho.',
    '`git log --oneline` liệt kê những commit đang với tới được.',
  );
}
