/**
 * Tầng điều phối lệnh: chuỗi người chơi gõ → trạng thái mới.
 *
 * Đây là chỗ DUY NHẤT nâng `Repo` lên `GitWorld`. Mọi thao tác ở `ops/` cố ý
 * chỉ biết một `Repo`: chúng không biết `origin` tồn tại, không biết bot, không
 * biết đồng hồ logic toàn cục. Giữ chúng mù như vậy là thứ làm chúng test được
 * bằng một `Repo` dựng tay hai dòng.
 *
 * Bốn việc chỉ tầng này làm được, vì cả bốn cần nhìn thấy toàn bộ thế giới:
 *
 *  1. **Nhích đồng hồ logic** đúng 1 cho mỗi lệnh CÓ TÁC DỤNG. Lệnh chỉ đọc
 *     (`status`, `log`, `diff`, `show`, `reflog`, `branch` không tham số) KHÔNG
 *     nhích nó. Nếu nhích thì bot sẽ hành động chỉ vì người chơi nhìn quanh, và
 *     một người chơi cẩn thận bị phạt vì cẩn thận.
 *  2. **Chạy bot** sau khi đồng hồ nhích.
 *  3. **Ghi nhật ký** — `RunLog` của game Git là một script shell đọc được bằng
 *     mắt, và đó là toàn bộ cơ chế chấm lại phía máy chủ.
 *  4. **Undo/redo**, bằng cách giữ ngăn xếp `GitWorld` cũ. Rẻ vì trạng thái bất
 *     biến: một bản "sao" là một tham chiếu.
 */

import type {
  CommandResult,
  GitDispatchOutcome,
  GitError,
  GitLevel,
  GitView,
  GitWorld,
  OutputLine,
  Repo,
} from './contract.ts';
import type { SessionStatus } from '../core/session-status.ts';
import type { GitGameAction, RunLog } from '../core/run-log.ts';

import { parseGitCommand, type ParsedCommand } from './parser.ts';
import { gitError } from './errors.ts';
import { buildView, type ViewHints } from './view.ts';
import { buildWorld } from './world-spec.ts';
import { evaluateObjectives, verdictOf } from './predicates.ts';
import { runBots } from './ops/bot.ts';
import { dispatchCommand, type DispatchDeps } from './dispatch.ts';

/** Lệnh chỉ ĐỌC — không nhích đồng hồ logic, không đánh thức bot. */
const READ_ONLY_VERBS: ReadonlySet<string> = new Set([
  'status',
  'log',
  'show',
  'diff',
  'reflog',
  'fsck',
]);

/**
 * `branch` và `remote` chỉ đọc KHI KHÔNG có tham số. `git branch` liệt kê;
 * `git branch x` tạo. Phân biệt bằng tham số chứ không bằng tên lệnh, vì cùng
 * một động từ mang hai nghĩa.
 */
function isReadOnly(cmd: ParsedCommand): boolean {
  if (READ_ONLY_VERBS.has(cmd.verb)) return true;
  if (cmd.verb === 'branch' || cmd.verb === 'remote' || cmd.verb === 'stash') {
    return cmd.args.length === 0 && (cmd.sub === null || cmd.sub === 'list');
  }
  if (cmd.verb === 'pr') return cmd.sub === 'list';
  return false;
}

export interface GitEngineSession {
  getWorld(): GitWorld;
  getView(): GitView;
  getStatus(): SessionStatus;
  getOutput(): readonly OutputLine[];
  getLog(): RunLog<GitGameAction>;
  subscribe(listener: () => void): () => void;
  run(command: string): GitDispatchOutcome;
  revealHint(index: number, text?: string): void;
  undo(): boolean;
  redo(): boolean;
}

export interface CreateGitSessionOptions {
  readonly level: GitLevel;
  readonly seed?: number;
  /** Số bước hoàn tác giữ lại. Mặc định 50 — đủ cho một level, không nuôi rò rỉ. */
  readonly undoDepth?: number;
}

/**
 * Trạng thái đích của level, dựng MỘT LẦN.
 *
 * Bộ chấm chạy sau mỗi lệnh, và dựng lại cây đích mỗi lần chấm là lãng phí
 * tuyến tính theo số lệnh người chơi gõ.
 */
function buildTarget(level: GitLevel, seed: number): GitWorld | null {
  return level.target === undefined ? null : buildWorld(level.target, seed);
}

export function createGitSession(options: CreateGitSessionOptions): GitEngineSession {
  const { level } = options;
  const seed = options.seed ?? 1;
  const undoDepth = options.undoDepth ?? 50;
  const target = buildTarget(level, seed);

  let world = buildWorld(level.setup, seed);
  let output: readonly OutputLine[] = [];
  let actions: readonly GitGameAction[] = [];
  let hintsRevealed = 0;
  let hints: ViewHints = {};
  let view = buildView(world, hints);

  /** Ngăn xếp hoàn tác. Phần tử [0] là trạng thái gần nhất trước hiện tại. */
  let undoStack: readonly UndoFrame[] = [];
  let redoStack: readonly UndoFrame[] = [];

  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const l of listeners) l();
  };

  const deps: DispatchDeps = { level };

  function snapshot(): UndoFrame {
    return { world, output, actions, hints, hintsRevealed };
  }

  function restore(frame: UndoFrame): void {
    world = frame.world;
    output = frame.output;
    actions = frame.actions;
    hints = frame.hints;
    hintsRevealed = frame.hintsRevealed;
    view = buildView(world, hints);
  }

  function statusOf(): SessionStatus {
    const results = evaluateObjectives(world, target, level.objectives);
    const verdict = verdictOf(results);
    return {
      phase: verdict.accepted ? 'won' : 'playing',
      objectivesMet: results.filter((r) => r.met).map((r) => r.id),
      hintsRevealed,
      movesUsed: actions.filter((a) => a.kind === 'command').length,
    };
  }

  function run(command: string): GitDispatchOutcome {
    const trimmed = command.trim();
    if (trimmed === '') {
      return { result: { world, output: [], error: null }, botAnnouncements: [] };
    }

    const before = snapshot();
    const parsed = parseGitCommand(trimmed);

    if (!parsed.ok) {
      return finishFailed(parsed.error, trimmed);
    }

    const allowed = level.allowedCommands;
    if (allowed !== null && !allowed.includes(parsed.command.verb)) {
      return finishFailed(
        gitError(
          'not-allowed-here',
          `Level này chưa mở lệnh \`git ${parsed.command.verb}\`.`,
          `Các lệnh dùng được ở đây: ${allowed.map((v) => `\`${v}\``).join(', ')}.`,
          'Mục tiêu của level giải được bằng đúng những lệnh trên. Nếu bạn nghĩ không thể thì đọc lại phần Bài giảng.',
        ),
        trimmed,
      );
    }

    const result = dispatchCommand(world, parsed.command, deps);

    // Nhật ký ghi MỌI lệnh phân tích được, kể cả lệnh trả lỗi. Một lượt chơi
    // thật có cả những lần gõ hỏng, và bên chấm phải phát lại được đúng chuỗi
    // đó — bỏ lệnh hỏng đi sẽ làm `commandsUsed` của client khác của server.
    actions = [...actions, { gameId: 'git', tick: world.logicalTime, kind: 'command', command: trimmed }];

    let nextWorld = result.world;
    let announcements: readonly string[] = [];

    if (result.error === null && !isReadOnly(parsed.command)) {
      nextWorld = { ...nextWorld, logicalTime: nextWorld.logicalTime + 1 };
      const [afterBots, said] = runBots(nextWorld);
      nextWorld = afterBots;
      announcements = said;
    }

    world = nextWorld;
    hints = result.hints ?? {};
    output = [...output, promptLine(trimmed), ...result.output, ...announcements.map(announceLine)];
    view = buildView(world, hints);

    pushUndo(before);
    notify();

    return {
      result: { world, output: result.output, error: result.error },
      botAnnouncements: announcements,
    };
  }

  function finishFailed(error: GitError, raw: string): GitDispatchOutcome {
    actions = [...actions, { gameId: 'git', tick: world.logicalTime, kind: 'command', command: raw }];
    output = [...output, promptLine(raw), ...errorLines(error)];
    notify();
    // ⚠ KHÔNG đẩy vào ngăn hoàn tác: trạng thái không đổi, nên một khung hoàn
    // tác ở đây sẽ làm `undo()` "nuốt" một lượt mà không đổi gì trên màn hình.
    // Người chơi bấm undo hai lần mới thấy tác dụng, và họ sẽ nghĩ nút hỏng.
    return { result: { world, output: [], error }, botAnnouncements: [] };
  }

  function pushUndo(frame: UndoFrame): void {
    undoStack = [frame, ...undoStack].slice(0, undoDepth);
    redoStack = [];
  }

  return {
    getWorld: () => world,
    getView: () => view,
    getStatus: statusOf,
    getOutput: () => output,
    getLog: () => ({ gameId: 'git', levelId: level.id, seed, actions }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run,
    revealHint(index, text) {
      if (index < 0 || index >= level.hints.length) return;
      if (index < hintsRevealed) return;
      hintsRevealed = index + 1;
      actions = [...actions, { gameId: 'git', tick: world.logicalTime, kind: 'hint', index }];
      /*
       * `text` của chỗ gọi thắng `level.hints[index]` — xem chú thích hợp đồng.
       * `??` chứ không `||`: một gợi ý rỗng do chỗ gọi truyền vào vẫn là lựa
       * chọn của chỗ gọi, và rơi ngược về `level.hints` ở ca đó là đoán mò.
       */
      const noiDung = text ?? level.hints[index];
      if (noiDung !== undefined && noiDung !== '') {
        output = [...output, { text: `Gợi ý ${index + 1}: ${noiDung}`, tone: 'hint' }];
      }
      notify();
    },
    /**
     * ⛔ `undo` GỠ LUÔN action cuối khỏi nhật ký — nó không phải một hành động
     * được ghi lại.
     *
     * Cùng lý do `setSpeed` của game K8s không vào nhật ký: nhật ký ghi thứ
     * người chơi làm với REPO, không ghi thứ họ làm với giao diện. Ghi `undo`
     * vào đó sẽ bắt bên phát lại hiện thực một ngăn xếp hoàn tác chỉ để tua tới
     * đúng chỗ, trong khi kết quả giống hệt việc không ghi lệnh bị hoàn tác ngay
     * từ đầu.
     *
     * Đánh đổi có ý thức: người chơi mò mẫm rồi hoàn tác sẽ có nhật ký sạch hơn
     * thực tế, tức `commandsUsed` thấp hơn và điểm cao hơn. Phạt việc thử-rồi-sửa
     * là phạt đúng thứ game muốn khuyến khích.
     */
    undo() {
      const frame = undoStack[0];
      if (frame === undefined) return false;
      redoStack = [snapshot(), ...redoStack].slice(0, undoDepth);
      undoStack = undoStack.slice(1);
      restore(frame);
      notify();
      return true;
    },
    redo() {
      const frame = redoStack[0];
      if (frame === undefined) return false;
      undoStack = [snapshot(), ...undoStack].slice(0, undoDepth);
      redoStack = redoStack.slice(1);
      restore(frame);
      notify();
      return true;
    },
  };
}

interface UndoFrame {
  readonly world: GitWorld;
  readonly output: readonly OutputLine[];
  readonly actions: readonly GitGameAction[];
  readonly hints: ViewHints;
  readonly hintsRevealed: number;
}

function promptLine(raw: string): OutputLine {
  return { text: `$ ${raw}`, tone: 'plain' };
}

function announceLine(text: string): OutputLine {
  return { text, tone: 'warn' };
}

function errorLines(error: GitError): readonly OutputLine[] {
  const out: OutputLine[] = [
    { text: error.message, tone: 'error' },
    { text: error.explain, tone: 'plain' },
  ];
  if (error.suggest !== undefined) out.push({ text: error.suggest, tone: 'hint' });
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phát lại — nền của việc chấm lại phía máy chủ (P18)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chạy lại một `RunLog` từ số không và trả trạng thái cuối.
 *
 * ⛔ Hàm này là lý do cả engine phải tất định. Máy chủ gọi nó với đúng
 * `(levelId, seed, actions)` mà client gửi lên, rồi so kết quả với lời khai của
 * client. Lệch một bit là verdict lệch, và người chơi bị từ chối một bài họ giải
 * đúng.
 *
 * Chạy được ở **cả trình duyệt lẫn Node** (§17.J.5) vì không có gì trong đường
 * đi này chạm `node:*`, DOM, `Date.now()`, hay `Math.random()`.
 */
export function replayGitLog(level: GitLevel, log: RunLog<GitGameAction>): {
  readonly world: GitWorld;
  readonly status: SessionStatus;
} {
  const session = createGitSession({ level, seed: log.seed, undoDepth: 0 });
  for (const action of log.actions) {
    if (action.kind === 'command') session.run(action.command);
    else session.revealHint(action.index);
  }
  return { world: session.getWorld(), status: session.getStatus() };
}

/**
 * Chạy một chuỗi lệnh trên một level và trả kết quả chấm.
 *
 * Đây là cỗ máy của ô nghiệm thu **AC-8** (chạy `solutionCommands` của cả 32
 * level) và **AC-9** (chạy `altSolutionCommands`). Không có nó thì "32 level qua
 * được" là một lời khai, không phải một phép đo.
 */
export function runCommands(
  level: GitLevel,
  commands: readonly string[],
  seed = 1,
): {
  readonly world: GitWorld;
  readonly status: SessionStatus;
  readonly errors: readonly { readonly command: string; readonly error: GitError }[];
} {
  const session = createGitSession({ level, seed, undoDepth: 0 });
  const errors: { command: string; error: GitError }[] = [];
  for (const command of commands) {
    const outcome = session.run(command);
    if (outcome.result.error !== null) errors.push({ command, error: outcome.result.error });
  }
  return { world: session.getWorld(), status: session.getStatus(), errors };
}

/** Trạng thái `Repo` local, tiện cho test. */
export function localRepo(world: GitWorld): Repo {
  return world.local;
}

export type { CommandResult };
