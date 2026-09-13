/**
 * `git rebase` — áp lại từng commit lên một nền khác, kèm `-i`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ REBASE **VIẾT LẠI**. COMMIT CŨ Ở LẠI TRONG KHO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi commit được áp lại sinh ra một **Oid MỚI** — cha khác, thời gian logic
 * khác, nên băm khác. Bản cũ KHÔNG bị xoá: nó nằm nguyên trong `ObjectStore`,
 * chỉ mất hết ref trỏ tới.
 *
 * Đây là bài G08 và nó là cây cầu sang cả chương 3. "Lịch sử bị viết lại" nghe
 * như "commit cũ biến mất", và chính hiểu nhầm đó làm người ta sợ rebase. Nhìn
 * thấy bản cũ còn đó (vẽ mờ, accent `orphaned`) và `git reflog` chỉ đường về là
 * thứ biến nỗi sợ thành một thao tác bình thường.
 *
 * Nên: **tuyệt đối không dọn**. `objects.ts` cố ý không có hàm xoá; đừng ai
 * thêm vào. Ô nghiệm thu khẳng định hai vế riêng biệt sau mỗi rebase — commit cũ
 * CÒN trong kho (`hasObject`), và KHÔNG còn với tới được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HEAD DETACHED TRONG SUỐT REBASE — VÌ SAO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hàm này tách HEAD ra khỏi branch ngay từ bước đầu và chỉ gắn lại khi xong.
 * Đúng như git thật, và nó mua được một thứ rất cụ thể: **con trỏ branch không
 * hề dịch chuyển trong lúc rebase**, nên `--abort` chỉ phải gắn HEAD về chỗ cũ
 * và trả hai vùng — không có ref nào phải kéo ngược, không có mục reflog nào
 * phải bịa ra. Một hiện thực dời branch từng bước sẽ để branch trỏ vào kết quả
 * dở dang mỗi khi xung đột, và `git log` lúc đó nói dối về nơi người chơi đang
 * đứng.
 *
 * Trong lúc kẹt, **HEAD CHÍNH LÀ con trỏ hiện tại** của rebase. Vì thế
 * `PendingOp.onto` giữ đúng nghĩa đen của nó — cái nền ban đầu, để in ra cho
 * người chơi đọc — chứ không bị mượn làm biến chạy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HAI KIỂU DỪNG, PHÂN BIỆT BẰNG `conflicts`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `PendingOp` kind `'rebase'` có hai nghĩa khác nhau, và `conflicts` là thứ
 * phân biệt — không có trường thứ hai nào cần thêm vào hợp đồng:
 *
 *  - `conflicts.length > 0` ⇒ **kẹt vì xung đột**. `remaining[0]` là bước CHƯA
 *    được áp; `--continue` áp nó từ index đã giải.
 *  - `conflicts.length === 0` ⇒ **dừng theo lệnh `edit`**. Bước đó ĐÃ áp xong;
 *    `remaining` chỉ còn phần chưa chạy, và `--continue` chạy tiếp từ đầu mảng.
 *
 * Trộn hai nghĩa này lại là cách chắc chắn nhất để `--continue` áp một commit
 * hai lần, và triệu chứng sẽ là một commit trùng lặp không ai giải thích được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMIT MERGE BỊ LÀM PHẲNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Commit có hai cha bị bỏ khỏi danh sách áp lại, đúng như `git rebase` mặc
 * định (git thật cần `--rebase-merges` để giữ). Hai nhánh từng gặp nhau sẽ được
 * áp lại thành một chuỗi thẳng. Đó là hành vi đúng, và nó cũng là một bài học:
 * rebase một lịch sử có merge thì cái merge đó biến mất.
 */

import type { GitError, Oid, OutputLine, PendingOp, RebaseStep, RefName, Repo } from '../contract.ts';
import { gitError } from '../errors.ts';
import { shortOid } from '../hash.ts';
import {
  commitContents,
  commitsBetween,
  getCommit,
  makeTree,
  mergeBase,
  putObject,
  writeCommit,
  writeContents,
} from '../objects.ts';
import {
  headContents,
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
  advanceHead,
  dirtyTree,
  fail,
  indexFromCommit,
  line,
  noOperation,
  ok,
  operationInProgress,
  untrackedWorktree,
  worktreeAt,
  wrongPendingKind,
  type GitOpResult,
  type OpContext,
} from './reset.ts';
import {
  describeCommit,
  enterConflict,
  notACommitError,
  parentContents,
  planThreeWay,
  restoreTo,
  stageConflicted,
  unbornHeadError,
  unmergedPathsError,
  unresolvedPaths,
} from './merge.ts';

export interface RebaseOptions {
  /** Nền mới — commit mà chuỗi được áp lên. */
  readonly onto: Oid;
  /** Dạng người chơi đọc, cho câu output. */
  readonly ontoLabel: string;
  /**
   * Ranh giới: commit nào thuộc lịch sử của `upstream` thì KHÔNG áp lại.
   *
   * Mặc định bằng `onto`. Tách ra vì `git rebase --onto <mới> <cũ>` cần đúng
   * hai mốc khác nhau — "bỏ nền cũ đi, gắn sang nền mới" là chuyện chỉ nói được
   * khi hai mốc rời nhau.
   */
  readonly upstream?: Oid;
  /** Kịch bản `-i`. Vắng ⇒ `pick` mọi commit trong khoảng, theo thứ tự cũ. */
  readonly steps?: readonly RebaseStep[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. TÍNH KHOẢNG CẦN ÁP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Những commit sẽ được áp lại, cũ trước mới sau.
 *
 * Xuất ra ngoài vì giao diện `-i` cần chính danh sách này để dựng kịch bản mặc
 * định cho người chơi sửa. Dựng nó ở hai chỗ là bảo đảm hai chỗ lệch nhau.
 */
export function rebaseRange(repo: Repo, options: RebaseOptions): readonly Oid[] {
  const head = headOid(repo);
  if (head === null) return [];
  const upstream = options.upstream ?? options.onto;
  const base = mergeBase(repo.objects, head, upstream);
  return commitsBetween(repo.objects, base, head).filter((oid) => {
    const commit = getCommit(repo.objects, oid);
    return commit !== null && commit.parents.length <= 1;
  });
}

/** Kịch bản mặc định của `git rebase -i`: `pick` tất, giữ nguyên thứ tự. */
export function defaultRebaseSteps(repo: Repo, options: RebaseOptions): readonly RebaseStep[] {
  return rebaseRange(repo, options).map((oid) => ({ action: 'pick', oid }) as RebaseStep);
}

function stepsOutOfRange(bad: readonly Oid[]): GitError {
  return gitError(
    'bad-usage',
    `Kịch bản rebase nhắc tới ${bad.length} commit không nằm trong khoảng được áp lại.`,
    `\`${bad.map((oid) => shortOid(oid)).join('`, `')}\` không thuộc đoạn giữa nền mới và HEAD, nên không có chỗ nào để áp chúng vào.`,
    'Gõ `git log --oneline` để xem đúng đoạn sẽ bị viết lại, rồi dựng lại kịch bản chỉ với những commit trong đoạn đó.',
  );
}

function squashWithoutBase(action: string): GitError {
  return gitError(
    'bad-usage',
    `\`${action}\` không dùng được ở bước ĐẦU TIÊN.`,
    `\`squash\` và \`fixup\` gộp một commit vào commit NGAY TRƯỚC nó trong kịch bản. Ở bước đầu tiên thì chưa có commit nào phía trước để gộp vào.`,
    'Đổi bước đầu thành `pick`, rồi để `squash`/`fixup` ở những bước sau.',
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. `git rebase`
// ═══════════════════════════════════════════════════════════════════════════

export function gitRebase(repo: Repo, options: RebaseOptions, ctx: OpContext): GitOpResult {
  if (repo.pending !== null) return fail(repo, operationInProgress(repo));
  if (getCommit(repo.objects, options.onto) === null) {
    return fail(repo, notACommitError(options.onto));
  }

  const head = headOid(repo);
  if (head === null) return fail(repo, unbornHeadError('rebase'));
  if (!isIndexClean(repo) || !isWorktreeClean(repo)) return fail(repo, dirtyTree(repo, 'rebase'));

  const range = rebaseRange(repo, options);
  const steps = options.steps ?? range.map((oid) => ({ action: 'pick', oid }) as RebaseStep);

  const inRange = new Set(range);
  const bad = steps.map((s) => s.oid).filter((oid) => !inRange.has(oid));
  if (bad.length > 0) return fail(repo, stepsOutOfRange(bad));

  const firstLive = steps.find((s) => s.action !== 'drop');
  if (firstLive !== undefined && (firstLive.action === 'squash' || firstLive.action === 'fixup')) {
    return fail(repo, squashWithoutBase(firstLive.action));
  }

  if (steps.length === 0) {
    if (head === options.onto) {
      return ok(repo, [
        line(`Đã ở trên \`${options.ontoLabel}\` rồi — không có commit nào phải áp lại.`, 'hint'),
      ]);
    }
    // Không có commit riêng nào ⇒ nhánh này chỉ tụt lại phía sau. Dời con trỏ
    // tới trước là xong, và không object nào được tạo ra.
    const moved = advanceHead(repo, options.onto, {
      op: 'rebase',
      message: `fast-forward tới ${options.ontoLabel}`,
      logicalTime: ctx.logicalTime,
    });
    const staged = setIndex(moved, indexFromCommit(moved, options.onto));
    return ok(setWorktree(staged, worktreeAt(repo, options.onto)), [
      line(`Fast-forward tới ${describeCommit(repo, options.onto)}`, 'success'),
      line(
        'Nhánh của bạn không có commit nào riêng, nên không có gì để viết lại — chỉ con trỏ dời tới.',
        'hint',
      ),
    ]);
  }

  const originalRef = headRef(repo);

  // Tách HEAD ra khỏi branch. Từ đây tới lúc xong, HEAD là con trỏ chạy của
  // rebase và branch đứng yên — xem chú thích đầu file.
  const detached = moveHead(repo, { type: 'detached', oid: options.onto }, {
    op: 'rebase',
    message: `bắt đầu rebase lên ${options.ontoLabel}`,
    logicalTime: ctx.logicalTime,
  });
  const staged = setIndex(detached, indexFromCommit(detached, options.onto));
  const start = setWorktree(staged, worktreeAt(repo, options.onto));

  return runSteps(start, steps, {
    onto: options.onto,
    ontoLabel: options.ontoLabel,
    originalHead: head,
    originalRef,
    ctx,
    produced: false,
    prefix: [],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. VÒNG ÁP TỪNG BƯỚC
// ═══════════════════════════════════════════════════════════════════════════

interface RunState {
  readonly onto: Oid;
  readonly ontoLabel: string;
  readonly originalHead: Oid;
  readonly originalRef: RefName | null;
  readonly ctx: OpContext;
  /**
   * Đã có bước nào tạo ra commit chưa. `squash`/`fixup` cần biết, vì chúng gộp
   * vào commit VỪA TẠO TRONG REBASE NÀY — không phải vào commit bất kỳ đang ở
   * dưới con trỏ, thứ có thể thuộc về nền cũ.
   */
  readonly produced: boolean;
  readonly prefix: readonly OutputLine[];
}

function runSteps(repo: Repo, steps: readonly RebaseStep[], state: RunState): GitOpResult {
  let current = repo;
  let produced = state.produced;
  const output: OutputLine[] = [...state.prefix];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) continue;

    if (step.action === 'drop') {
      output.push(
        line(`drop ${describeCommit(current, step.oid)} — bỏ hẳn, không áp lại.`, 'warn'),
      );
      continue;
    }

    const source = getCommit(current.objects, step.oid);
    if (source === null) return fail(repo, notACommitError(step.oid));

    if ((step.action === 'squash' || step.action === 'fixup') && !produced) {
      return fail(repo, squashWithoutBase(step.action));
    }

    const cursor = headOid(current);
    if (cursor === null) return fail(repo, unbornHeadError('rebase'));

    const plan = planThreeWay({
      base: parentContents(current.objects, step.oid),
      ours: headContents(current),
      theirs: commitContents(current.objects, step.oid),
      oursLabel: `nền mới (${state.ontoLabel})`,
      theirsLabel: `${shortOid(step.oid)} ${source.message}`,
    });

    if (plan.conflicts.length > 0) {
      const pending: PendingOp = {
        kind: 'rebase',
        onto: state.onto,
        originalHead: state.originalHead,
        originalRef: state.originalRef,
        // Phần tử [0] là bước ĐANG kẹt, chưa được áp — xem chú thích đầu file.
        remaining: steps.slice(i),
        conflicts: plan.conflicts,
      };
      return {
        repo: enterConflict(current, plan, pending),
        output: [
          ...output,
          line(`Áp ${describeCommit(current, step.oid)} lên nền mới gặp xung đột.`, 'error'),
          ...plan.conflicts.map((c) => line(`  xung đột: ${c.path}`, 'error')),
          line(
            'Đây KHÔNG phải lỗi của bạn. Commit này được viết trên một nền khác, và nền mới đã sửa đúng những dòng đó — git có ba bản và không đoán được bạn muốn bản nào.',
            'hint',
          ),
          line('Sửa file, xoá hết dòng marker, rồi `git rebase --continue`.', 'hint'),
          line(
            'Bỏ riêng commit này thì `git rebase --skip`. Bỏ cả lượt rebase thì `git rebase --abort` — branch chưa hề dịch chuyển nên nó về nguyên vẹn.',
            'hint',
          ),
        ],
        error: gitError(
          'merge-conflict',
          `${plan.conflicts.length} file xung đột khi áp \`${shortOid(step.oid)}\`.`,
          `Repo đang ở giữa một rebase dở dang: còn ${steps.length - i} bước chưa chạy, HEAD đang detached ở con trỏ tạm, và branch \`${state.originalRef === null ? 'HEAD' : shortRefName(state.originalRef)}\` vẫn nằm yên chỗ cũ.`,
          '`git status` liệt kê file đang xung đột. Sửa xong thì `git rebase --continue`.',
        ),
      };
    }

    const [store, tree] = writeContents(current.objects, plan.contents);
    const applied = commitStep(
      { ...current, objects: store },
      step,
      tree,
      state.ctx,
      produced,
    );
    if (applied.error !== null) return fail(repo, applied.error);
    current = applied.repo;
    produced = true;
    for (const l of applied.output) output.push(l);

    if (step.action === 'edit') {
      const pending: PendingOp = {
        kind: 'rebase',
        onto: state.onto,
        originalHead: state.originalHead,
        originalRef: state.originalRef,
        // Bước `edit` ĐÃ áp xong, nên nó KHÔNG nằm trong `remaining`.
        remaining: steps.slice(i + 1),
        // Rỗng ⇒ dừng theo lệnh, không phải kẹt vì xung đột.
        conflicts: [],
      };
      return ok({ ...current, pending }, [
        ...output,
        line(`Dừng lại theo lệnh \`edit\` tại ${describeCommit(current, step.oid)}`, 'warn'),
        line(
          'Sửa file rồi `git commit --amend` nếu muốn đổi nội dung commit này, sau đó `git rebase --continue` để chạy tiếp.',
          'hint',
        ),
      ]);
    }
  }

  return finishRebase(current, state, output);
}

interface StepOutcome {
  readonly repo: Repo;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
}

/**
 * Biến một tree đã dựng thành commit, theo đúng `action` của bước.
 *
 * Dùng chung bởi vòng chạy (tree từ `plan.contents`) và bởi `--continue` (tree
 * từ index sau khi người chơi giải xung đột). Một chỗ duy nhất quyết định
 * `squash`/`fixup` gộp thế nào — hai bản sao của luật đó sẽ lệch nhau ngay lần
 * đầu ai đó sửa cách nối message.
 */
function commitStep(
  repo: Repo,
  step: RebaseStep,
  tree: Oid,
  ctx: OpContext,
  produced: boolean,
): StepOutcome {
  const source = getCommit(repo.objects, step.oid);
  if (source === null) return { repo, output: [], error: notACommitError(step.oid) };

  const cursor = headOid(repo);
  if (cursor === null) return { repo, output: [], error: unbornHeadError('rebase') };

  if (step.action === 'squash' || step.action === 'fixup') {
    if (!produced) return { repo, output: [], error: squashWithoutBase(step.action) };
    const previous = getCommit(repo.objects, cursor);
    if (previous === null) return { repo, output: [], error: notACommitError(cursor) };

    const message =
      step.action === 'fixup'
        ? previous.message
        : `${previous.message}\n\n${step.message ?? source.message}`;

    // ⚠ `parents` lấy của commit TRƯỚC, không phải `[cursor]`. Đây là một phép
    // amend: commit gộp THAY THẾ commit trước chứ không nối sau nó. Dùng
    // `[cursor]` sẽ cho ra N commit thay vì N-1, và ô nghiệm thu đếm đúng chỗ đó.
    const [store, oid] = writeCommit(repo.objects, {
      tree,
      parents: previous.parents,
      message,
      author: previous.author,
      logicalTime: ctx.logicalTime,
    });
    const moved = advanceHead({ ...repo, objects: store }, oid, {
      op: 'rebase',
      message: `${step.action} ${shortOid(step.oid)}`,
      logicalTime: ctx.logicalTime,
    });
    return {
      repo: syncWorktree(moved, oid),
      output: [
        line(
          `${step.action} ${shortOid(step.oid)} → gộp vào ${describeCommit(moved, oid)}`,
          'success',
        ),
        step.action === 'fixup'
          ? line('`fixup` vứt message của commit bị gộp đi — chỉ giữ message của commit đích.', 'hint')
          : line('`squash` nối hai message lại làm một.', 'hint'),
      ],
      error: null,
    };
  }

  const message = step.action === 'reword' ? (step.message ?? source.message) : source.message;
  const [store, oid] = writeCommit(repo.objects, {
    tree,
    parents: [cursor],
    message,
    // Rebase giữ TÁC GIẢ của commit gốc, đúng như git thật.
    author: source.author,
    logicalTime: ctx.logicalTime,
  });
  const moved = advanceHead({ ...repo, objects: store }, oid, {
    op: 'rebase',
    message: `${step.action} ${shortOid(step.oid)}`,
    logicalTime: ctx.logicalTime,
  });
  return {
    repo: syncWorktree(moved, oid),
    output: [
      line(
        `${step.action} ${shortOid(step.oid)} → ${describeCommit(moved, oid)}`,
        'success',
      ),
    ],
    error: null,
  };
}

/** Index + worktree khớp một commit; file chưa track giữ nguyên. */
function syncWorktree(repo: Repo, oid: Oid): Repo {
  const staged = setIndex(repo, indexFromCommit(repo, oid));
  return setWorktree(staged, { ...untrackedWorktree(repo), ...commitContents(repo.objects, oid) });
}

/**
 * Gắn HEAD về branch cũ và kéo branch tới con trỏ mới.
 *
 * Đây là chỗ DUY NHẤT branch dịch chuyển trong cả một lượt rebase, và cũng là
 * chỗ commit cũ chính thức mất ref cuối cùng trỏ tới nó.
 */
function finishRebase(repo: Repo, state: RunState, output: readonly OutputLine[]): GitOpResult {
  const cursor = headOid(repo);
  if (cursor === null) return fail(repo, unbornHeadError('rebase'));

  const cleared: Repo = { ...repo, pending: null };
  let done = cleared;
  if (state.originalRef !== null) {
    done = setRef(cleared, state.originalRef, cursor, {
      op: 'rebase',
      message: `rebase lên ${state.ontoLabel}`,
      logicalTime: state.ctx.logicalTime,
    });
    done = moveHead(done, { type: 'ref', ref: state.originalRef }, {
      op: 'rebase',
      message: `hoàn tất rebase lên ${state.ontoLabel}`,
      logicalTime: state.ctx.logicalTime,
    });
  }

  const label = state.originalRef === null ? 'HEAD' : shortRefName(state.originalRef);
  return ok(syncWorktree(done, cursor), [
    ...output,
    line(`\`${label}\` giờ nằm trên \`${state.ontoLabel}\`.`, 'success'),
    line(
      `Những commit cũ vẫn nằm nguyên trong kho — chúng chỉ không còn ref nào trỏ tới. \`git reflog\` còn nhớ ${shortOid(state.originalHead)}, nên chỗ cũ vẫn tìm lại được.`,
      'hint',
    ),
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. `--continue` / `--skip` / `--abort`
// ═══════════════════════════════════════════════════════════════════════════

/** Nhánh `'rebase'` của `PendingOp`, rút ra để khỏi phải ép kiểu ở ba chỗ gọi. */
type RebasePending = Extract<PendingOp, { readonly kind: 'rebase' }>;

function requireRebase(
  repo: Repo,
): { readonly pending: RebasePending } | { readonly error: GitError } {
  const pending = repo.pending;
  if (pending === null) return { error: noOperation('rebase') };
  if (pending.kind !== 'rebase') return { error: wrongPendingKind(pending.kind, 'rebase') };
  return { pending };
}

export function rebaseContinue(repo: Repo, ctx: OpContext): GitOpResult {
  const found = requireRebase(repo);
  if ('error' in found) return fail(repo, found.error);
  const pending = found.pending;

  const state: RunState = {
    onto: pending.onto,
    ontoLabel: shortOid(pending.onto),
    originalHead: pending.originalHead,
    originalRef: pending.originalRef,
    ctx,
    produced: true,
    prefix: [],
  };

  // Dừng theo lệnh `edit`: bước đó đã áp xong, chỉ việc chạy tiếp.
  if (pending.conflicts.length === 0) {
    return runSteps({ ...repo, pending: null }, pending.remaining, state);
  }

  const unresolved = unresolvedPaths(repo, pending.conflicts);
  if (unresolved.length > 0) return fail(repo, unmergedPathsError('rebase', unresolved));

  const step = pending.remaining[0];
  if (step === undefined) {
    return finishRebase({ ...repo, pending: null }, state, []);
  }

  const staged = stageConflicted(repo, pending.conflicts);
  const [store, tree] = putObject(staged.objects, makeTree(staged.index));
  const applied = commitStep({ ...staged, objects: store, pending: null }, step, tree, ctx, true);
  if (applied.error !== null) return fail(repo, applied.error);

  return runSteps(applied.repo, pending.remaining.slice(1), {
    ...state,
    prefix: [line('Xung đột đã giải xong.', 'success'), ...applied.output],
  });
}

/**
 * `git rebase --skip` — bỏ commit đang kẹt và đi tiếp.
 *
 * Bản cũ của commit bị bỏ vẫn nằm trong kho như mọi commit khác của lượt rebase
 * này. "Bỏ" ở đây nghĩa là *không áp lại*, không phải *xoá đi*.
 */
export function rebaseSkip(repo: Repo, ctx: OpContext): GitOpResult {
  const found = requireRebase(repo);
  if ('error' in found) return fail(repo, found.error);
  const pending = found.pending;

  const cursor = headOid(repo);
  if (cursor === null) return fail(repo, unbornHeadError('rebase'));

  const skipped = pending.remaining[0];
  if (skipped === undefined) {
    return fail(
      repo,
      gitError(
        'no-operation-in-progress',
        'Không còn bước nào để bỏ qua.',
        'Danh sách bước còn lại của lượt rebase này đã rỗng, nên `--skip` không có gì để bỏ.',
        'Gõ `git rebase --continue` để kết thúc lượt rebase.',
      ),
    );
  }

  // Vứt nội dung mang marker đi: quay hai vùng về đúng con trỏ hiện tại.
  const cleaned = restoreTo(repo, cursor);

  return runSteps(cleaned, pending.remaining.slice(1), {
    onto: pending.onto,
    ontoLabel: shortOid(pending.onto),
    originalHead: pending.originalHead,
    originalRef: pending.originalRef,
    ctx,
    produced: true,
    prefix: [
      line(
        `Đã bỏ qua ${describeCommit(repo, skipped.oid)} — không có bản áp lại nào của nó được tạo.`,
        'warn',
      ),
    ],
  });
}

/**
 * `git rebase --abort` — về đúng lúc trước khi gõ lệnh.
 *
 * Branch chưa hề dịch chuyển (HEAD detached suốt lượt rebase), nên ở đây chỉ
 * phải gắn HEAD về chỗ cũ và trả index + worktree. Những commit đã áp lại được
 * trước lúc kẹt thành mồ côi — vẫn trong kho, `git reflog` nhớ.
 */
export function rebaseAbort(repo: Repo, ctx: OpContext): GitOpResult {
  const found = requireRebase(repo);
  if ('error' in found) return fail(repo, found.error);
  const pending = found.pending;

  const back = pending.originalHead;
  const head =
    pending.originalRef === null
      ? ({ type: 'detached', oid: back } as const)
      : ({ type: 'ref', ref: pending.originalRef } as const);

  const moved = moveHead(repo, head, {
    op: 'rebase',
    message: 'huỷ rebase',
    logicalTime: ctx.logicalTime,
  });
  const restored = restoreTo(moved, back);

  return ok(restored, [
    line(`Đã huỷ rebase. Quay về ${describeCommit(restored, back)}`, 'success'),
    line(
      'Branch chưa hề dịch chuyển trong suốt lượt rebase, nên nó về đúng như cũ — không có gì phải sửa tay.',
      'hint',
    ),
  ]);
}
