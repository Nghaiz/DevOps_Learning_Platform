/**
 * `git bisect start|good|bad|reset` — bài G32.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHIÊN SỐNG Ở `Repo.bisect`, KHÔNG Ở `PendingOp` VÀ KHÔNG Ở REF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bản đầu của file này giữ phiên trong `refs/bisect/*` để khỏi phải thêm field
 * vào hợp đồng. Lead đã đưa `Repo.bisect: BisectState | null` vào hợp đồng ngày
 * 2026-09-14 và file này theo. Cách cũ có ba chỗ dở mà cách mới bỏ được:
 *
 *  - Tên branch lúc `start` phải mã hoá vào TÊN ref (`refs/bisect/start-head/<nhánh>`)
 *    vì ref chỉ mang được Oid ở phần giá trị. `BisectState.originalHead` là một
 *    `Head` đầy đủ nên chuyện đó biến mất.
 *  - Mọi ref bisect là **gốc reachability**, nên trong lúc bisect thì `git fsck`
 *    không bao giờ báo commit nào mồ côi. Nay `rescue.ts` gom gốc từ
 *    `repo.bisect` một cách tường minh, đúng những Oid thật sự được neo.
 *  - `setRef` ghi reflog cho mọi ref, nên một phiên bisect đẻ ra hàng chục dòng
 *    nhật ký rác dưới những cái tên không ai hiển thị.
 *
 * ⚠ Và nó KHÔNG phải một nhánh của `PendingOp`, có lý do: `PendingOp` mô tả một
 * thao tác đang **chặn đường**. Bisect không chặn gì — giữa hai lần `good`/`bad`
 * người chơi vẫn chạy test, vẫn đọc log, vẫn `show` một commit. Xem chú thích
 * của `BisectState` trong `contract.ts`.
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

import type { BisectState, GitError, Oid, OutputLine, Repo, RepoOpResult } from '../contract.ts';
import { compareKeys } from '../deterministic.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import { getCommit, reachableFrom } from '../objects.ts';
import { headOid, isIndexClean, isWorktreeClean, moveHead, setIndex, setWorktree } from '../repo.ts';
import {
  dirtyTree,
  fail,
  indexFromCommit,
  line,
  ok,
  worktreeAt,
  type OpContext,
} from './reset.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. TRUY VẤN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Commit còn khả nghi: với tới được từ `bad`, không với tới được từ bất kỳ
 * `good` nào. Sắp theo `(logicalTime, oid)` tăng dần — cũ trước.
 *
 * Tập này CÓ chứa `bad`. Đó là đúng: ta đang tìm commit HỎNG ĐẦU TIÊN, và nếu
 * mọi tổ tiên của `bad` đều tốt thì chính `bad` là câu trả lời.
 */
export function bisectCandidates(repo: Repo, state: BisectState | null): readonly Oid[] {
  if (state === null || state.bad === null) return [];
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
 * Ứng viên còn PHẢI THỬ = ứng viên trừ `bad`.
 *
 * `bad` bị loại vì ta ĐÃ biết nó hỏng — hỏi lại người chơi về nó là tốn một bước
 * và làm số bước vượt trần `⌈log2(n)⌉+1`. Đây là giá trị đi vào
 * `BisectState.remaining`, và nó được TÍNH LẠI sau mỗi `good`/`bad` chứ không
 * cập nhật tăng dần (xem chú thích của trường đó trong hợp đồng).
 */
function stillToTest(repo: Repo, state: BisectState): readonly Oid[] {
  if (state.bad === null || state.good.length === 0) return [];
  return bisectCandidates(repo, state).filter((oid) => oid !== state.bad);
}

/**
 * Commit tiếp theo phải thử. `null` = không còn gì để thử, tức `bad` chính là
 * commit hỏng đầu tiên.
 *
 * Đọc thẳng `state.remaining` — trường đó là SSOT của bước kế tiếp, và mọi chỗ
 * ghi trong file này đều làm nó tươi qua `refreshed()`. Tính lại ở đây sẽ biến
 * `remaining` thành một trường trang trí mà không ai phát hiện được khi nó lệch.
 */
export function nextBisectCommit(state: BisectState | null): Oid | null {
  if (state === null || state.remaining.length === 0) return null;
  return state.remaining[Math.floor(state.remaining.length / 2)] ?? null;
}

function refreshed(repo: Repo, state: BisectState): BisectState {
  return { ...state, remaining: stillToTest(repo, state) };
}

function withBisect(repo: Repo, state: BisectState | null): Repo {
  return { ...repo, bisect: state };
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
): RepoOpResult {
  if (repo.bisect !== null) {
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
  if (headOid(repo) === null) {
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

  const state: BisectState = {
    good: good === null ? [] : [good],
    bad,
    originalHead: repo.head,
    remaining: [],
  };
  const started = withBisect(repo, refreshed(repo, state));

  return advance(started, ctx, [
    line('Bắt đầu bisect. Đánh dấu bằng `git bisect good` / `git bisect bad`.', 'hint'),
  ]);
}

/** `git bisect good|bad [<commit>]`. Không nêu commit ⇒ commit HEAD đang đứng. */
export function gitBisectMark(
  repo: Repo,
  verdict: 'good' | 'bad',
  target: Oid | null,
  ctx: OpContext,
): RepoOpResult {
  const state = repo.bisect;
  if (state === null) return fail(repo, noBisect(verdict));

  const oid = target ?? headOid(repo);
  if (oid === null || getCommit(repo.objects, oid) === null) {
    return fail(repo, notACommitForBisect(oid ?? '(HEAD)'));
  }

  const marked: BisectState =
    verdict === 'bad'
      ? { ...state, bad: oid }
      : { ...state, good: [...new Set([...state.good, oid])].sort(compareKeys) };

  const next = withBisect(repo, refreshed(repo, marked));
  return advance(next, ctx, [
    line(`${shortOid(oid)} được đánh dấu là ${verdict === 'bad' ? 'ĐÃ HỎNG' : 'CÒN TỐT'}.`),
  ]);
}

/**
 * `git bisect reset` — kết thúc phiên và trả HEAD về đúng chỗ trước khi bắt đầu.
 *
 * `originalHead` là một `Head` đầy đủ, nên người chơi quay về `main` nếu lúc
 * `start` họ đang trên `main`, và quay về detached nếu lúc đó đã detached. Bỏ
 * chi tiết này đi thì người chơi kết thúc bisect xong bị bỏ lại ở detached HEAD
 * mà không hiểu vì sao — đúng loại trải nghiệm làm người ta sợ git.
 */
export function gitBisectReset(repo: Repo, ctx: OpContext): RepoOpResult {
  const state = repo.bisect;
  if (state === null) return fail(repo, noBisect('reset'));

  const cleared = withBisect(repo, null);
  const moved = moveHead(cleared, state.originalHead, {
    op: 'bisect',
    message: 'kết thúc phiên bisect',
    logicalTime: ctx.logicalTime,
  });
  const back = headOid(moved);
  const restored = setWorktree(
    setIndex(moved, indexFromCommit(moved, back)),
    worktreeAt(moved, back),
  );

  return ok(restored, [
    line(
      state.originalHead.type === 'ref'
        ? `Đã kết thúc bisect. HEAD quay về \`${state.originalHead.ref}\`.`
        : `Đã kết thúc bisect. HEAD quay về ${shortOid(state.originalHead.oid)} (vẫn detached, như lúc bắt đầu).`,
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
function advance(repo: Repo, ctx: OpContext, prefix: readonly OutputLine[]): RepoOpResult {
  const state = repo.bisect;
  if (state === null) return ok(repo, prefix);
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

  const next = nextBisectCommit(state);
  if (next === null) {
    const answer = state.bad;
    output.push(
      line(`${shortOid(answer)} là commit hỏng đầu tiên.`, 'success'),
      line(`    ${getCommit(repo.objects, answer)?.message ?? ''}`),
      line('Gõ `git bisect reset` để quay về chỗ cũ.', 'hint'),
    );
    return ok(repo, output);
  }

  const moved = moveHead(
    repo,
    { type: 'detached', oid: next },
    { op: 'checkout', message: `bisect: kiểm tra ${shortOid(next)}`, logicalTime: ctx.logicalTime },
  );
  const checked = setWorktree(
    setIndex(moved, indexFromCommit(moved, next)),
    worktreeAt(moved, next),
  );

  output.push(
    line(`Bisecting: còn ${Math.max(state.remaining.length - 1, 0)} commit nữa sau bước này.`),
    line(
      `HEAD giờ ở ${shortOid(next)} ${getCommit(repo.objects, next)?.message ?? ''} (detached)`,
      'success',
    ),
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
    'Không có phiên bisect nào đang chạy.',
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
