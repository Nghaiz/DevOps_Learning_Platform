/**
 * Bảng định tuyến: một `ParsedCommand` → đúng một thao tác ở `ops/`.
 *
 * File này là chỗ DUY NHẤT biết cả hai phía: hình dạng cờ mà bộ phân tích trả
 * về, và chữ ký mà từng thao tác nhận. Gom vào một chỗ vì đây là mặt tiếp xúc
 * giữa sáu lane chạy song song, và mỗi lane đã chọn hình dạng tham số hợp với
 * việc của nó — ép sáu lane dùng chung một hình dạng sẽ tệ hơn, vì `gitReset`
 * và `prMerge` không có gì chung ngoài việc cùng là "một lệnh".
 *
 * ⛔ KHÔNG có logic git ở đây. Nếu bạn thấy mình viết `if (mergeBase(...))` thì
 * việc đó thuộc về một file trong `ops/`, không thuộc về bảng định tuyến.
 */

import type {
  FilePath,
  GitError,
  GitLevel,
  GitWorld,
  Oid,
  OutputLine,
  Repo,
} from './contract.ts';
import type { ParsedCommand } from './parser.ts';
import { pathOperands } from './parser.ts';
import type { ViewHints } from './view.ts';

import { gitError } from './errors.ts';
import { resolveRevision } from './refs-resolve.ts';
import { branchRef, headOid, shortRefName } from './repo.ts';

import { gitAdd, gitCheckoutPaths, gitCommit, gitDiff, gitInit, gitStatus } from './ops/basic.ts';
import { gitBranch, gitCheckout, gitSwitch, gitTag } from './ops/branch.ts';
import { gitLog, gitShow } from './ops/inspect.ts';
import { gitReset, gitResetPaths, gitRevert, gitRevertAbort, gitRevertContinue } from './ops/reset.ts';
import { mergeFile } from './ops/merge.ts';
import { gitStashApply, gitStashDrop, gitStashList, gitStashPop, gitStashPush, parseStashIndex } from './ops/stash.ts';
import { gitFsck, gitReflog } from './ops/rescue.ts';
import { gitBisectMark, gitBisectReset, gitBisectStart } from './ops/bisect.ts';
import { gitMerge, mergeAbort, mergeContinue } from './ops/merge.ts';
import { defaultRebaseSteps, gitRebase, rebaseAbort, rebaseContinue, rebaseSkip } from './ops/rebase.ts';
import { cherryPickAbort, cherryPickContinue, cherryPickSkip, gitCherryPick, type PickOutcome } from './ops/cherry-pick.ts';
import { gitFetch, gitPull, gitPush, gitRemote } from './ops/remote.ts';
import { prList, prMerge, prOpen, prReview } from './ops/pull-request.ts';

export interface DispatchDeps {
  readonly level: GitLevel;
}

export interface DispatchResult {
  readonly world: GitWorld;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
  /** Gợi ý cho tầng vẽ: commit nào vừa tạo, bản sao nào của ai. */
  readonly hints?: ViewHints;
}

interface RepoLevelResult {
  readonly repo: Repo;
  readonly output: readonly OutputLine[];
  readonly error: GitError | null;
}

/** Nâng kết quả tầng `Repo` lên tầng `GitWorld`. */
function lift(world: GitWorld, r: RepoLevelResult, hints?: ViewHints): DispatchResult {
  const next: GitWorld = { ...world, local: r.repo };
  return hints === undefined
    ? { world: next, output: r.output, error: r.error }
    : { world: next, output: r.output, error: r.error, hints };
}

function fail(world: GitWorld, error: GitError): DispatchResult {
  return { world, output: [], error };
}

function flag(cmd: ParsedCommand, name: string): boolean {
  return Object.hasOwn(cmd.flags, name);
}

function flagStr(cmd: ParsedCommand, name: string): string | null {
  const v = cmd.flags[name];
  return typeof v === 'string' ? v : null;
}

function flagNum(cmd: ParsedCommand, name: string): number | null {
  const v = flagStr(cmd, name);
  if (v === null) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Phân giải một tham số thành Oid, hoặc trả lỗi đã có đủ ba phần.
 *
 * Gom ở đây thay vì để mỗi nhánh tự làm: 14 nhánh cần nó, và 14 bản sao là 14
 * cơ hội quên mất ca `not-found` rồi ném `undefined` vào một thao tác.
 */
function rev(repo: Repo, input: string): { readonly oid: Oid } | { readonly error: GitError } {
  const r = resolveRevision(repo, input);
  if (r.ok) return { oid: r.oid };
  const reason =
    r.reason === 'ambiguous'
      ? 'khớp nhiều hơn một object'
      : r.reason === 'bad-syntax'
        ? 'sai cú pháp tham chiếu'
        : 'không có ref hay commit nào mang tên đó';
  return {
    error: gitError(
      'not-a-ref',
      `Không phân giải được '${input}'.`,
      `Chuỗi '${input}' ${reason}.`,
      'Thử `git branch` để xem tên nhánh, hoặc `git log --oneline` để lấy Oid rút gọn.',
    ),
  };
}

/** Đích của `merge`/`rebase`: một Oid kèm nhãn người đọc được. */
function target(repo: Repo, input: string): { readonly oid: Oid; readonly label: string } | { readonly error: GitError } {
  const r = rev(repo, input);
  if ('error' in r) return r;
  return { oid: r.oid, label: input };
}

export function dispatchCommand(
  world: GitWorld,
  cmd: ParsedCommand,
  deps: DispatchDeps,
): DispatchResult {
  const repo = world.local;
  const ctx = { logicalTime: world.logicalTime, author: world.author };
  const lt = world.logicalTime;

  switch (cmd.verb) {
    // ── Nền ────────────────────────────────────────────────────────────────
    case 'init':
      return lift(world, gitInit(repo));

    case 'add':
      return lift(
        world,
        gitAdd(repo, pathsOf(cmd), flag(cmd, '--all') ? { all: true } : {}),
      );

    case 'commit': {
      const message = flagStr(cmd, '--message');
      if (message === null && !flag(cmd, '--amend')) {
        return fail(
          world,
          gitError(
            'bad-usage',
            '`git commit` cần một lời nhắn.',
            'Không có lời nhắn thì commit không nói được nó làm gì, và lịch sử thành một dãy vô nghĩa.',
            'Dùng `git commit -m "lời nhắn"`.',
          ),
        );
      }
      const before = headOid(repo);
      const result = gitCommit(repo, {
        message: message ?? '',
        logicalTime: lt,
        author: world.author,
        ...(flag(cmd, '--amend') ? { amend: true } : {}),
        ...(flag(cmd, '--allow-empty') ? { allowEmpty: true } : {}),
        ...(flag(cmd, '--all') ? { all: true } : {}),
      });
      const after = headOid(result.repo);
      const fresh = after !== null && after !== before ? [after] : [];
      return lift(world, result, { freshOids: fresh });
    }

    case 'status':
      return lift(world, gitStatus(repo));

    case 'diff':
      return lift(world, gitDiff(repo, diffOptions(cmd)));

    case 'log':
      return lift(world, gitLog(repo, logOptions(cmd)));

    case 'show':
      return lift(world, gitShow(repo, showOptions(cmd)));

    // ── Nhánh, HEAD, tag ───────────────────────────────────────────────────
    case 'branch':
      return lift(world, gitBranch(repo, branchOptions(cmd, lt)));

    case 'switch':
      return lift(world, gitSwitch(repo, switchOptions(cmd, lt)));

    case 'checkout': {
      // `git checkout -- <path>` và `git checkout --ours/--theirs <path>` là
      // lệnh khôi phục FILE, không phải lệnh đổi HEAD. Phân biệt bằng sự có mặt
      // của path chứ không bằng cờ, vì cả hai dạng đều có thể mang `--`.
      // ⚠ `--ours`/`--theirs` đổi NGHĨA của toán hạng: `git checkout <ref>` nhận
      // một ref, nhưng `git checkout --theirs <file>` nhận một ĐƯỜNG DẪN. Bảng
      // lệnh khai `argKinds: ['ref','ref']` cho động từ này, nên `pathOperands`
      // đúng đắn trả rỗng — phải đọc `args` ở đây, và đó là lý do phép kiểm cờ
      // phải đứng TRƯỚC phép đọc đường dẫn.
      const side = flag(cmd, '--ours') ? 'ours' : flag(cmd, '--theirs') ? 'theirs' : null;
      if (side !== null) {
        const conflictPaths = cmd.hasPathSeparator ? cmd.paths : cmd.args;
        return lift(world, resolveConflictSide(repo, conflictPaths, side));
      }

      // `pathOperands` đọc `argKinds` của động từ, mà `checkout` khai
      // `['ref','ref']` — đúng cho dạng đổi HEAD, sai cho dạng khôi phục file.
      // Khi có `--` thì mọi thứ sau nó LÀ đường dẫn theo định nghĩa, nên đọc
      // thẳng `cmd.paths`.
      const paths = cmd.hasPathSeparator ? cmd.paths : pathsOf(cmd);
      if (paths.length > 0) {
        const source = cmd.args[0];
        return lift(
          world,
          gitCheckoutPaths(repo, source === undefined ? { paths } : { paths, rev: source }),
        );
      }
      return lift(world, gitCheckout(repo, checkoutOptions(cmd, lt)));
    }

    case 'tag':
      return lift(world, gitTag(repo, tagOptions(cmd, lt)));

    // ── Lịch sử ────────────────────────────────────────────────────────────
    case 'reset': {
      // `git reset <X>` mơ hồ theo đúng thiết kế của git: X là một ref thì lệnh
      // dời con trỏ, X là một đường dẫn thì lệnh gỡ file khỏi index. git thật
      // giải bằng cách THỬ PHÂN GIẢI trước, và ta làm y hệt — phân biệt bằng
      // dấu `--` thôi là không đủ, vì `git reset tmp.log` (không có `--`) là
      // dạng người ta gõ thật.
      const explicitPaths = cmd.hasPathSeparator ? cmd.paths : [];
      const first = cmd.args[0];
      const firstIsRev = first !== undefined && !('error' in rev(repo, first));
      const paths =
        explicitPaths.length > 0
          ? explicitPaths
          : firstIsRev
            ? cmd.args.slice(1)
            : cmd.args;
      const spec = firstIsRev ? (first ?? 'HEAD') : 'HEAD';
      const r = rev(repo, spec);
      if ('error' in r) return fail(world, r.error);
      if (paths.length > 0) return lift(world, gitResetPaths(repo, r.oid, paths));
      const mode = flag(cmd, '--soft')
        ? 'soft'
        : flag(cmd, '--hard')
          ? 'hard'
          : 'mixed';
      return lift(world, gitReset(repo, r.oid, mode, ctx));
    }

    case 'revert': {
      if (flag(cmd, '--abort')) return lift(world, gitRevertAbort(repo));
      if (flag(cmd, '--continue')) return lift(world, gitRevertContinue(repo, ctx));
      const spec = cmd.args[0];
      if (spec === undefined) return fail(world, needsArg('revert', 'một commit'));
      const r = rev(repo, spec);
      if ('error' in r) return fail(world, r.error);
      return lift(world, gitRevert(repo, r.oid, mergeFile, ctx));
    }

    case 'merge': {
      if (flag(cmd, '--abort')) return lift(world, mergeAbort(repo));
      if (flag(cmd, '--continue')) return lift(world, mergeContinue(repo, ctx));
      const spec = cmd.args[0];
      if (spec === undefined) return fail(world, needsArg('merge', 'một nhánh hoặc commit'));
      const t = target(repo, spec);
      if ('error' in t) return fail(world, t.error);
      return lift(
        world,
        gitMerge(repo, { oid: t.oid, label: t.label }, ctx, {
          ...(flag(cmd, '--no-ff') ? { noFf: true } : {}),
          ...(flag(cmd, '--squash') ? { squash: true } : {}),
        }),
      );
    }

    case 'rebase': {
      if (flag(cmd, '--abort')) return lift(world, rebaseAbort(repo, ctx));
      if (flag(cmd, '--continue')) return lift(world, rebaseContinue(repo, ctx));
      if (flag(cmd, '--skip')) return lift(world, rebaseSkip(repo, ctx));
      const ontoSpec = flagStr(cmd, '--onto') ?? cmd.args[0];
      if (ontoSpec === undefined) return fail(world, needsArg('rebase', 'một nhánh đích'));
      const t = target(repo, ontoSpec);
      if ('error' in t) return fail(world, t.error);

      const base = { onto: t.oid, ontoLabel: t.label };
      const scripted = flagStr(cmd, '--script');
      const options =
        scripted === null
          ? base
          : { ...base, steps: parseRebaseScript(scripted, defaultRebaseSteps(repo, base)) };
      return lift(world, gitRebase(repo, options, ctx));
    }

    case 'cherry-pick': {
      if (flag(cmd, '--abort')) return lift(world, cherryPickAbort(repo, ctx));
      if (flag(cmd, '--continue')) return lift(world, cherryPickContinue(repo, ctx));
      if (flag(cmd, '--skip')) return lift(world, cherryPickSkip(repo, ctx));
      const specs = cmd.args;
      if (specs.length === 0) return fail(world, needsArg('cherry-pick', 'một commit'));
      const oids: Oid[] = [];
      for (const spec of specs) {
        const r = rev(repo, spec);
        if ('error' in r) return fail(world, r.error);
        oids.push(r.oid);
      }
      const outcome = gitCherryPick(repo, oids, ctx);
      return lift(world, outcome, cherryHints(outcome));
    }

    // ── Cất việc, cứu hộ ───────────────────────────────────────────────────
    case 'stash': {
      const sub = cmd.sub ?? 'push';
      switch (sub) {
        case 'push':
          return lift(world, gitStashPush(repo, flagStr(cmd, '--message'), ctx));
        case 'list':
          return lift(world, gitStashList(repo));
        case 'pop':
          return lift(world, gitStashPop(repo, parseStashIndex(cmd.args[0] ?? null) ?? 0));
        case 'apply':
          return lift(world, gitStashApply(repo, parseStashIndex(cmd.args[0] ?? null) ?? 0));
        case 'drop':
          return lift(world, gitStashDrop(repo, parseStashIndex(cmd.args[0] ?? null) ?? 0));
        default:
          return fail(world, unknownSub('stash', sub));
      }
    }

    case 'reflog': {
      const spec = cmd.args[0];
      if (spec === undefined || spec === 'HEAD') return lift(world, gitReflog(repo, null));
      return lift(world, gitReflog(repo, branchRef(spec)));
    }

    case 'fsck':
      return lift(world, gitFsck(repo, flag(cmd, '--lost-found')));

    case 'bisect': {
      const sub = cmd.sub ?? 'start';
      const spec = cmd.args[0];
      const resolved = spec === undefined ? null : rev(repo, spec);
      if (resolved !== null && 'error' in resolved) return fail(world, resolved.error);
      const oid = resolved === null ? null : resolved.oid;
      switch (sub) {
        case 'start':
          return lift(world, gitBisectStart(repo, null, oid, ctx));
        case 'good':
        case 'bad':
          return lift(world, gitBisectMark(repo, sub, oid, ctx));
        case 'reset':
          return lift(world, gitBisectReset(repo, ctx));
        default:
          return fail(world, unknownSub('bisect', sub));
      }
    }

    // ── Kho từ xa ──────────────────────────────────────────────────────────
    case 'clone':
      return fail(
        world,
        gitError(
          'bad-usage',
          'Level này đã có sẵn kho, không cần `git clone`.',
          'Trong game, `clone` chỉ dùng ở màn sandbox để dựng kho thứ hai.',
          'Thử `git remote -v` để xem kho từ xa đã đăng ký.',
        ),
      );

    case 'fetch':
      return withWorld(gitFetch(world, fetchOptions(cmd, lt)));

    case 'push':
      return withWorld(gitPush(world, pushOptions(cmd, lt)));

    case 'pull':
      return withWorld(
        gitPull(world, pullOptions(cmd, lt, world.author), {
          // `PullDeps` nhận MỘT object gộp cả đích lẫn ngữ cảnh; `gitMerge` và
          // `gitRebase` tách chúng làm hai tham số. Bộ chuyển hai dòng ở đây là
          // chỗ rẻ nhất để hoà hai hình dạng, và nó giữ cho `ops/remote.ts`
          // không phải import `ops/merge.ts` — đó là điều làm hai lane test
          // được độc lập.
          merge: (r, o) =>
            gitMerge(
              r,
              { oid: o.theirs, label: o.theirsLabel },
              { logicalTime: o.logicalTime, author: o.author },
            ),
          rebase: (r, o) =>
            gitRebase(
              r,
              { onto: o.onto, ontoLabel: o.ontoLabel },
              { logicalTime: o.logicalTime, author: o.author },
            ),
        }),
      );

    case 'remote':
      return withWorld(gitRemote(world, remoteOptions(cmd, lt)));

    // ── Pull request ───────────────────────────────────────────────────────
    case 'pr': {
      const sub = cmd.sub ?? 'list';
      switch (sub) {
        case 'open': {
          const title = flagStr(cmd, '--title');
          if (title === null) return fail(world, needsFlag('pr open', '--title'));
          const base = flagStr(cmd, '--base');
          return withWorld(
            prOpen(world, base === null ? { title, logicalTime: lt } : { title, logicalTime: lt, targetBranch: base }),
          );
        }
        case 'list':
          return withWorld(prList(world));
        case 'review': {
          const number = Number(cmd.args[0] ?? '');
          if (!Number.isSafeInteger(number)) return fail(world, needsArg('pr review', 'số hiệu PR'));
          const verdict = flag(cmd, '--approve')
            ? 'approve'
            : flag(cmd, '--request-changes')
              ? 'request-changes'
              : 'comment';
          return withWorld(
            prReview(world, {
              number,
              author: world.author,
              verdict,
              body: flagStr(cmd, '--message') ?? '',
              logicalTime: lt,
            }),
          );
        }
        case 'merge': {
          const number = Number(cmd.args[0] ?? '');
          if (!Number.isSafeInteger(number)) return fail(world, needsArg('pr merge', 'số hiệu PR'));
          const strategy = flag(cmd, '--squash') ? 'squash' : flag(cmd, '--rebase') ? 'rebase' : 'merge';
          return withWorld(prMerge(world, { number, strategy, logicalTime: lt, author: world.author }));
        }
        default:
          return fail(world, unknownSub('pr', sub));
      }
    }

    // ── Soạn thảo file ─────────────────────────────────────────────────────
    case 'write':
      return lift(world, writeFileOp(repo, cmd));
  }

  // `deps` giữ lại vì `level` sẽ cần khi thêm lệnh phụ thuộc level; đọc ở đây
  // để lint không báo tham số thừa mà không phải gỡ nó khỏi chữ ký công khai.
  void deps;
  return fail(world, unknownSub('git', cmd.verb));
}

// ═══════════════════════════════════════════════════════════════════════════
// Bộ chuyển cờ → tham số của từng thao tác
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Toán hạng đường dẫn thật sự của một lệnh.
 *
 * ⚠ Bản đầu của hàm này gộp `args` vào `paths` khi không có `--`, và đó là SAI
 * theo cách ô nghiệm thu AC-8 bắt được ngay lần chạy đầu: `git checkout HEAD~1`
 * biến `HEAD~1` thành một đường dẫn, nên lệnh trả `path-not-found` thay vì
 * chuyển HEAD. Lane parser đã nói trước điều này trong báo cáo của họ ("với
 * lệnh nhận path, toán hạng thật là `pathOperands()`, đừng tự ghép") và tôi đã
 * bỏ qua.
 *
 * `pathOperands` biết `argKinds` của từng lệnh, nên nó phân biệt được
 * `git add <path>` với `git checkout <ref>` — thứ mà một phép gộp mù không làm
 * được.
 */
function pathsOf(cmd: ParsedCommand): readonly FilePath[] {
  return pathOperands(cmd);
}

function withWorld(r: { world: GitWorld; output: readonly OutputLine[]; error: GitError | null }): DispatchResult {
  return { world: r.world, output: r.output, error: r.error };
}

function diffOptions(cmd: ParsedCommand): { staged?: boolean; paths?: readonly FilePath[] } {
  const staged = flag(cmd, '--staged') || flag(cmd, '--cached');
  const paths = cmd.paths;
  return {
    ...(staged ? { staged: true } : {}),
    ...(paths.length > 0 ? { paths } : {}),
  };
}

function logOptions(cmd: ParsedCommand): {
  rev?: string;
  oneline?: boolean;
  graph?: boolean;
  all?: boolean;
  max?: number;
} {
  const spec = cmd.args[0];
  const max = flagNum(cmd, '-n');
  return {
    ...(spec === undefined ? {} : { rev: spec }),
    ...(flag(cmd, '--oneline') ? { oneline: true } : {}),
    ...(flag(cmd, '--graph') ? { graph: true } : {}),
    ...(flag(cmd, '--all') ? { all: true } : {}),
    ...(max === null ? {} : { max }),
  };
}

function showOptions(cmd: ParsedCommand): { rev?: string } {
  const spec = cmd.args[0];
  return spec === undefined ? {} : { rev: spec };
}

function branchOptions(
  cmd: ParsedCommand,
  logicalTime: number,
): { names?: readonly string[]; delete?: boolean; force?: boolean; move?: boolean; all?: boolean; logicalTime: number } {
  return {
    logicalTime,
    ...(cmd.args.length > 0 ? { names: cmd.args } : {}),
    ...(flag(cmd, '--delete') ? { delete: true } : {}),
    ...(flag(cmd, '--force') ? { force: true } : {}),
    ...(flag(cmd, '--move') ? { move: true } : {}),
    ...(flag(cmd, '--all') ? { all: true } : {}),
  };
}

function switchOptions(
  cmd: ParsedCommand,
  logicalTime: number,
): { target?: string; create?: string; detach?: boolean; logicalTime: number } {
  const create = flagStr(cmd, '--create');
  const spec = cmd.args[0];
  return {
    logicalTime,
    ...(create === null ? {} : { create }),
    ...(spec === undefined ? {} : { target: spec }),
    ...(flag(cmd, '--detach') ? { detach: true } : {}),
  };
}

function checkoutOptions(
  cmd: ParsedCommand,
  logicalTime: number,
): { target?: string; createBranch?: string; logicalTime: number } {
  const create = flagStr(cmd, '--branch');
  const spec = cmd.args[0];
  return {
    logicalTime,
    ...(create === null ? {} : { createBranch: create }),
    ...(spec === undefined ? {} : { target: spec }),
  };
}

function tagOptions(
  cmd: ParsedCommand,
  logicalTime: number,
): { names?: readonly string[]; delete?: boolean; list?: boolean; annotate?: boolean; message?: string; logicalTime: number } {
  const message = flagStr(cmd, '--message');
  return {
    logicalTime,
    ...(cmd.args.length > 0 ? { names: cmd.args } : {}),
    ...(flag(cmd, '--delete') ? { delete: true } : {}),
    ...(flag(cmd, '--list') ? { list: true } : {}),
    ...(flag(cmd, '--annotate') ? { annotate: true } : {}),
    ...(message === null ? {} : { message }),
  };
}

function fetchOptions(cmd: ParsedCommand, logicalTime: number): { logicalTime: number; remote?: string; branch?: string } {
  const remote = cmd.args[0];
  const branch = cmd.args[1];
  return {
    logicalTime,
    ...(remote === undefined ? {} : { remote }),
    ...(branch === undefined ? {} : { branch }),
  };
}

function pushOptions(
  cmd: ParsedCommand,
  logicalTime: number,
): {
  logicalTime: number;
  remote?: string;
  branch?: string;
  force?: boolean;
  forceWithLease?: boolean;
  setUpstream?: boolean;
  deleteRemote?: boolean;
} {
  const remote = cmd.args[0];
  const branch = cmd.args[1];
  return {
    logicalTime,
    ...(remote === undefined ? {} : { remote }),
    ...(branch === undefined ? {} : { branch }),
    ...(flag(cmd, '--force') ? { force: true } : {}),
    ...(flag(cmd, '--force-with-lease') ? { forceWithLease: true } : {}),
    ...(flag(cmd, '--set-upstream') ? { setUpstream: true } : {}),
    ...(flag(cmd, '--delete') ? { deleteRemote: true } : {}),
  };
}

function pullOptions(
  cmd: ParsedCommand,
  logicalTime: number,
  author: string,
): { logicalTime: number; author: string; remote?: string; branch?: string; rebase?: boolean } {
  const remote = cmd.args[0];
  const branch = cmd.args[1];
  return {
    logicalTime,
    author,
    ...(remote === undefined ? {} : { remote }),
    ...(branch === undefined ? {} : { branch }),
    ...(flag(cmd, '--rebase') ? { rebase: true } : {}),
  };
}

function remoteOptions(
  cmd: ParsedCommand,
  logicalTime: number,
): { action: 'list' | 'add' | 'remove' | 'rename' | 'show'; logicalTime: number; name?: string; url?: string; newName?: string; verbose?: boolean } {
  const sub = (cmd.sub ?? 'list') as 'list' | 'add' | 'remove' | 'rename' | 'show';
  const a0 = cmd.args[0];
  const a1 = cmd.args[1];
  return {
    action: sub,
    logicalTime,
    ...(a0 === undefined ? {} : { name: a0 }),
    ...(a1 === undefined ? {} : sub === 'rename' ? { newName: a1 } : { url: a1 }),
    ...(flag(cmd, '--verbose') ? { verbose: true } : {}),
  };
}

/**
 * `--script pick,squash,squash` → danh sách `RebaseStep`.
 *
 * Cờ CỦA GAME, không có ở git thật — xem chú thích ở `levels/c1-07-12.ts` G12.
 * Nó tồn tại để `rebase -i` có một dạng ghi lại được trong `RunLog`, vì bản thật
 * mở một trình soạn thảo và một test tự động không gõ được vào đó.
 */
function parseRebaseScript(
  script: string,
  fallback: readonly { readonly action: string; readonly oid: Oid }[],
): readonly { readonly action: 'pick' | 'squash' | 'fixup' | 'drop' | 'reword' | 'edit'; readonly oid: Oid }[] {
  const verbs = script.split(',').map((s) => s.trim());
  const out: { action: 'pick' | 'squash' | 'fixup' | 'drop' | 'reword' | 'edit'; oid: Oid }[] = [];
  for (let i = 0; i < fallback.length; i++) {
    const step = fallback[i];
    if (step === undefined) continue;
    const raw = verbs[i] ?? 'pick';
    const action =
      raw === 'squash' || raw === 'fixup' || raw === 'drop' || raw === 'reword' || raw === 'edit'
        ? raw
        : 'pick';
    out.push({ action, oid: step.oid });
  }
  return out;
}

/**
 * `git checkout --ours|--theirs <path>` khi đang xung đột.
 *
 * Lấy một phía của hunk thay vì bắt người chơi sửa tay. Đây là dạng git THẬT
 * (cờ `-2`/`-3`), và nó là lời giải tự động hoá được cho bài G17 — không có nó
 * thì level conflict không có `solutionCommands` chạy được, tức AC-8 mất một ô.
 */
function resolveConflictSide(
  repo: Repo,
  paths: readonly FilePath[],
  side: 'ours' | 'theirs',
): RepoLevelResult {
  const pending = repo.pending;
  if (pending === null) {
    return {
      repo,
      output: [],
      error: gitError(
        'no-operation-in-progress',
        '`git checkout --ours/--theirs` chỉ dùng được khi đang có xung đột.',
        'Kho hiện không ở giữa một merge, rebase, cherry-pick hay revert nào.',
        'Chạy `git status` để xem kho đang ở trạng thái nào.',
      ),
    };
  }

  let next = repo;
  const output: OutputLine[] = [];
  for (const path of paths) {
    const conflict = pending.conflicts.find((c) => c.path === path);
    if (conflict === undefined) {
      output.push({ text: `${path}: không nằm trong danh sách xung đột, bỏ qua.`, tone: 'warn' });
      continue;
    }
    const lines: string[] = [];
    for (const hunk of conflict.hunks) {
      lines.push(...(hunk.conflicted ? (side === 'ours' ? hunk.ours : hunk.theirs) : hunk.ours));
    }
    next = { ...next, worktree: { ...next.worktree, [path]: lines } };
    output.push({
      text: `${path}: lấy phía ${side === 'ours' ? shortRefName(conflict.oursLabel) : shortRefName(conflict.theirsLabel)}.`,
      tone: 'success',
    });
  }
  return { repo: next, output, error: null };
}

/**
 * `cherry-pick` trả `duplicateOf` (bản sao → nguồn) để tầng view vẽ "sợi chỉ mờ
 * nối về nguồn" (design §3.5). Không có nó thì hai commit trùng nội dung trông
 * như hai việc không liên quan, và cái giá của cherry-pick ở bài G11 mất hình.
 */
function cherryHints(outcome: PickOutcome): ViewHints {
  return { duplicateOf: outcome.duplicateOf };
}

/**
 * `git write <path> -c "nội dung"` — lệnh CỦA GAME, không có ở git thật.
 *
 * Vì sao nó phải tồn tại: game mô phỏng một kho git, nhưng nó KHÔNG mô phỏng
 * một trình soạn thảo. Người chơi sửa file bằng một ô nhập ở giao diện, và thao
 * tác đó không có dạng dòng lệnh nào để ghi vào `RunLog`.
 *
 * Hệ quả nếu thiếu: mọi level cần "sửa file rồi commit" (G22 vá lỗi gấp, G23
 * sửa theo nhận xét review) không có `solutionCommands` chạy được, tức chúng
 * biến mất khỏi ô nghiệm thu AC-8 trong im lặng — và AC-8 vẫn xanh, vì nó chỉ
 * chạy những lời giải có tồn tại.
 *
 * Cùng lý do với cờ `--script` của `rebase -i`: thao tác giao diện phải quy được
 * về một chỉ thị phát lại được, nếu không thì việc chấm lại phía máy chủ (P18)
 * không phủ hết những gì người chơi làm được.
 */
function writeFileOp(repo: Repo, cmd: ParsedCommand): RepoLevelResult {
  const path = cmd.args[0] ?? cmd.paths[0];
  if (path === undefined) {
    return { repo, output: [], error: needsArg('write', 'một đường dẫn') };
  }

  if (flag(cmd, '--delete')) {
    if (!Object.hasOwn(repo.worktree, path)) {
      return {
        repo,
        output: [],
        error: gitError(
          'path-not-found',
          `Không có file nào tên \`${path}\` trong worktree.`,
          'Xoá một file không tồn tại thì không có gì để xoá.',
          'Chạy `git status` để xem worktree đang có gì.',
        ),
      };
    }
    const next: Record<FilePath, readonly string[]> = {};
    for (const [k, v] of Object.entries(repo.worktree)) {
      if (k !== path) next[k] = v;
    }
    return {
      repo: { ...repo, worktree: next },
      output: [{ text: `đã xoá ${path}`, tone: 'success' }],
      error: null,
    };
  }

  const raw = flagStr(cmd, '--content') ?? '';
  // Hai ký tự `\` và `n` gõ trên dòng lệnh KHÔNG phải một ký tự xuống dòng.
  // Đổi ở đây vì đây là chỗ duy nhất biết chuỗi vừa đi qua một dòng lệnh; làm
  // ở tầng dưới sẽ đổi cả nội dung file mà người chơi cố ý viết dấu chéo ngược.
  const lines = raw.split(String.raw`\n`).join('\n').split('\n');
  const existing = repo.worktree[path] ?? [];
  const nextLines = flag(cmd, '--append') ? [...existing, ...lines] : lines;

  return {
    repo: { ...repo, worktree: { ...repo.worktree, [path]: nextLines } },
    output: [
      {
        text: `${flag(cmd, '--append') ? 'đã nối vào' : 'đã ghi'} ${path} (${String(nextLines.length)} dòng)`,
        tone: 'success',
      },
    ],
    error: null,
  };
}

function needsArg(verb: string, what: string): GitError {
  return gitError(
    'bad-usage',
    `\`git ${verb}\` cần ${what}.`,
    `Lệnh chạy mà không có ${what} thì không có đích để làm gì.`,
    'Xem `git log --oneline` hoặc `git branch` để lấy tên.',
  );
}

function needsFlag(verb: string, flagName: string): GitError {
  return gitError(
    'bad-usage',
    `\`${verb}\` cần cờ ${flagName}.`,
    `Thiếu ${flagName} thì lệnh không đủ thông tin để chạy.`,
    `Ví dụ: \`${verb} ${flagName} "..."\`.`,
  );
}

function unknownSub(verb: string, sub: string): GitError {
  return gitError(
    'unknown-command',
    `\`${verb} ${sub}\` chưa được hỗ trợ.`,
    'Game mô phỏng một tập lệnh git đủ cho ba chương, không phải toàn bộ git.',
    'Gõ `help` để xem danh sách lệnh dùng được.',
  );
}
