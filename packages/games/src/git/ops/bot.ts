/**
 * Đồng đội mô phỏng — cái khiến chương 2 có người thứ hai trong đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ BOT KHÔNG BAO GIỜ ĐỘNG VÀO `world.rng`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hợp đồng ghi thẳng ở `BotAction`: bot **không "quyết định" gì cả**, nó chạy
 * một kịch bản khai sẵn trong level. Một đồng đội hành động khác nhau giữa hai
 * lần phát lại là hỏng thẳng việc chấm lại phía máy chủ (P18) — người chơi giải
 * đúng ở máy mình rồi bị chấm trượt ở server vì con bot đã push một thứ khác.
 * `RngState` có trong `GitWorld` cho những chỗ level CỐ Ý muốn biến thiên theo
 * seed; đây không phải một trong số đó. File này không import `core/rng.ts`, và
 * sự vắng mặt đó là cố ý.
 *
 * Cùng lý do: không `Date.now()`. Đồng hồ là `world.logicalTime`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BOT ĐI QUA MỘT KHO TẠM, KHÔNG GHI THẲNG VÀO `origin.refs`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi bot `clone` origin ra một `Repo` tạm, sửa file, commit, rồi `push` —
 * đúng đường một đồng nghiệp thật đi. Viết thẳng `origin.refs[...] = oid` thì
 * nhanh hơn nhiều nhưng sẽ tạo ra những trạng thái KHÔNG THỂ có ở git thật (một
 * ref trỏ vào commit mà kho không chứa, một branch tiến lên mà không qua phép
 * kiểm fast-forward), và người chơi sẽ gặp chúng đúng lúc đang học luật.
 *
 * Hệ quả quan trọng nhất, và là thứ dễ làm hỏng nhất: bot push bằng
 * `writeBranchOnOrigin`, **không** bằng `applyPush`. `applyPush` kéo luôn ref
 * theo dõi của NGƯỜI CHƠI đi theo — nếu bot dùng nó thì lease của người chơi tự
 * động khớp lại, `--force-with-lease` đi qua trót lọt, và bài G21 biến mất.
 * Lease chỉ có nghĩa khi nó là thứ người chơi đã tự `fetch` về.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KỊCH BẢN BOT — ngôn ngữ, và vì sao nó trông như vậy
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `BotAction.script` là một mảng dòng lệnh. Chúng dùng CÚ PHÁP GIT THẬT cho
 * phần git, để người soạn level đọc được kịch bản như đọc lịch sử shell của một
 * đồng nghiệp:
 *
 * | Dòng | Ý nghĩa |
 * |---|---|
 * | `git switch <b>` · `git switch -c <b>` | chuyển branch (`checkout` là bí danh) |
 * | `git commit -m "<msg>"` | commit MỌI thứ trong worktree (bot luôn ngầm `-a`) |
 * | `git push [--force] [<remote>] [<branch>]` | đẩy branch hiện tại lên origin |
 * | `write <đường-dẫn> <nội dung>` | đặt file thành ĐÚNG MỘT dòng |
 * | `append <đường-dẫn> <dòng>` | thêm một dòng vào cuối |
 * | `rm <đường-dẫn>` | xoá file |
 *
 * Ba động từ cuối không phải lệnh git, và không thể là: game không có shell,
 * không có filesystem thật, nên "sửa file" phải có cách gọi tên. Chúng cố ý
 * mang tên quen thuộc và cố ý KHÔNG bắt đầu bằng `git` để người đọc kịch bản
 * thấy ngay đâu là git và đâu là bàn tay của đồng nghiệp trên editor.
 *
 * Nội dung nhiều dòng thì dùng `write` một lần rồi `append` nhiều lần — không
 * có ký tự phân dòng nào trong cú pháp, vì mọi quy ước kiểu `\n` hay `|` đều
 * hỏng im lặng ở đúng ca người soạn cần nhất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐỒNG HỒ: BOT ĐẨY `logicalTime` LÊN, VÀ PHẢI THẾ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mỗi commit của bot nhận một `logicalTime` RIÊNG, tăng dần, và
 * `world.logicalTime` đi theo tới giá trị cuối. Cho cả loạt cùng một mốc thời
 * gian thì rẻ hơn nhưng sai: `commitsBetween` sắp theo `logicalTime` rồi hoà
 * thì theo Oid, nên một chuỗi A→B cùng mốc có thể trả B trước A — đủ để một lần
 * `rebase` sau đó áp ngược thứ tự. Lỗi đó chỉ lộ ở một level cụ thể, rất lâu
 * sau khi ai đó thêm một bot thứ hai.
 *
 * Bot nào "tới hạn" được chốt **trước** khi đồng hồ chạy (`atLogicalTime <=`
 * mốc lúc vào hàm), nên việc đẩy đồng hồ KHÔNG kích hoạt dây chuyền thêm bot
 * trong cùng một lượt. Không có chốt đó thì hai bot đặt cách nhau một nhịp sẽ
 * kéo nhau chạy hết trong một lệnh duy nhất của người chơi.
 */

import type { BotAction, FilePath, GitWorld, Lines, Oid, Repo } from '../contract.ts';
import { sortedEntries } from '../deterministic.ts';
import { shortOid } from '../hash.ts';
import { commitContents, writeCommit, writeContents } from '../objects.ts';
import { tokenize } from '../parser.ts';
import {
  blobOid,
  branchRef,
  headOid,
  headRef,
  moveHead,
  removeFile,
  setIndex,
  setRef,
  setWorktree,
  shortRefName,
  writeFile,
} from '../repo.ts';
import {
  DEFAULT_REMOTE,
  cloneRepo,
  decidePush,
  trackingRef,
  unionStore,
  writeBranchOnOrigin,
} from './remote.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. ĐIỂM VÀO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chạy mọi bot đã tới hạn.
 *
 * Trả `[thế giới mới, các dòng announce]` — đúng hình dạng
 * `GitDispatchOutcome.botAnnouncements` của hợp đồng cần.
 *
 * Bot nào chạy xong thì bị lấy khỏi `world.bots`; mảng đó là "kịch bản CÒN CHƯA
 * chạy", nên không cần thêm một cờ `đã chạy` (một trường suy ra được).
 */
export function runBots(world: GitWorld): readonly [GitWorld, readonly string[]] {
  // Chốt mốc TRƯỚC khi đồng hồ chạy — xem chú thích đầu file về dây chuyền.
  const threshold = world.logicalTime;
  const due = world.bots.filter((bot) => bot.atLogicalTime <= threshold);
  if (due.length === 0) return [world, []];

  const pending = world.bots.filter((bot) => bot.atLogicalTime > threshold);
  const announcements: string[] = [];

  let current: GitWorld = { ...world, bots: pending };

  for (const bot of due) {
    const outcome = runOneBot(current, bot);
    announcements.push(bot.announce);
    for (const problem of outcome.problems) {
      announcements.push(`⚠ ${bot.author}: ${problem}`);
    }
    current = outcome.world;
  }

  return [current, announcements];
}

interface BotOutcome {
  readonly world: GitWorld;
  readonly problems: readonly string[];
}

/**
 * Một bot, một kho tạm.
 *
 * Bước nào hỏng thì **cả bot đó bị bỏ** và thế giới quay về trạng thái trước
 * khi nó chạy — không có bot nửa vời. Kịch bản bot là DỮ LIỆU do người soạn
 * level viết, nên một bước hỏng là lỗi soạn bài, và để lại nửa tác dụng sẽ đẻ
 * ra một trạng thái không ai dựng lại được để gỡ.
 *
 * Hỏng thì kêu lên chứ không ném: một exception giữa lượt chơi giết cả phiên,
 * còn một dòng `⚠` trên HUD thì người soạn nhìn thấy ngay lần chạy thử đầu tiên.
 */
function runOneBot(world: GitWorld, bot: BotAction): BotOutcome {
  const origin = world.origin;
  if (origin === null) {
    return {
      world,
      problems: ['level không có origin, nên kịch bản đồng đội không có chỗ nào để chạy.'],
    };
  }

  let state: BotState = {
    repo: cloneRepo(origin, { logicalTime: world.logicalTime }),
    origin,
    clock: world.logicalTime,
    author: bot.author,
  };

  for (const raw of bot.script) {
    const step = runStep(state, raw);
    if (!step.ok) return { world, problems: [`\`${raw}\` — ${step.problem}`] };
    state = step.state;
  }

  return {
    world: { ...world, origin: state.origin, logicalTime: state.clock },
    problems: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MÁY THỰC THI
// ═══════════════════════════════════════════════════════════════════════════

interface BotState {
  readonly repo: Repo;
  readonly origin: Repo;
  readonly clock: number;
  readonly author: string;
}

/**
 * Kết quả một bước kịch bản.
 *
 * Kiểu phân biệt tường minh thay vì `state | null` + biến phụ: engine này bất
 * biến xuyên suốt, và một ô trạng thái dùng chung ở mức module là đúng thứ mà
 * `undo` (17.I.3) và phát lại phía máy chủ không chịu được. Giá phải trả là một
 * `{ ok: true, state }` ở mỗi nhánh — rẻ, và đọc ra ngay được nhánh nào hỏng.
 */
type StepResult =
  | { readonly ok: true; readonly state: BotState }
  | { readonly ok: false; readonly problem: string };

function stepOk(state: BotState): StepResult {
  return { ok: true, state };
}

function stepFail(problem: string): StepResult {
  return { ok: false, problem };
}

function runStep(state: BotState, raw: string): StepResult {
  const tokens = tokenize(raw);
  const head = tokens[0];
  if (head === undefined) return stepOk(state);

  if (head === 'git') return runGitStep(state, tokens.slice(1));

  if (head === 'write') return stepWrite(state, tokens.slice(1), 'set');
  if (head === 'append') return stepWrite(state, tokens.slice(1), 'append');
  if (head === 'rm') return stepRemove(state, tokens.slice(1));

  return stepFail(
    `\`${head}\` không phải động từ nào kịch bản bot hiểu. Xem bảng ở đầu \`ops/bot.ts\`.`,
  );
}

function runGitStep(state: BotState, args: readonly string[]): StepResult {
  const verb = args[0];
  if (verb === undefined) return stepFail('thiếu động từ sau `git`.');

  if (verb === 'switch' || verb === 'checkout') return stepSwitch(state, args.slice(1));
  if (verb === 'commit') return stepCommit(state, args.slice(1));
  if (verb === 'push') return stepPush(state, args.slice(1));

  return stepFail(
    `bot không chạy được \`git ${verb}\`. Kịch bản bot chỉ hiểu \`switch\`, \`commit\`, \`push\`.`,
  );
}

// ── sửa file ────────────────────────────────────────────────────────────────

function stepWrite(state: BotState, args: readonly string[], mode: 'set' | 'append'): StepResult {
  const path = args[0];
  if (path === undefined) return stepFail('thiếu đường dẫn.');
  // Nối phần còn lại bằng dấu cách: nháy kép gom sẵn thành một token, còn nội
  // dung không nháy thì vẫn ra đúng câu người soạn gõ.
  const text = args.slice(1).join(' ');
  const before: Lines = state.repo.worktree[path] ?? [];
  const lines: Lines = mode === 'set' ? [text] : [...before, text];
  return stepOk({ ...state, repo: writeFile(state.repo, path, lines) });
}

function stepRemove(state: BotState, args: readonly string[]): StepResult {
  const path = args[0];
  if (path === undefined) return stepFail('thiếu đường dẫn.');
  if (!Object.hasOwn(state.repo.worktree, path)) {
    return stepFail(`không có file \`${path}\` để xoá.`);
  }
  return stepOk({ ...state, repo: removeFile(state.repo, path) });
}

// ── switch ──────────────────────────────────────────────────────────────────

/**
 * `git switch [-c] <branch>` của bot.
 *
 * Một branch chưa có ở kho tạm nhưng CÓ ref theo dõi thì được tạo ra bám vào ref
 * đó — đúng hành vi git thật, và cần thật: kho tạm của bot vừa `clone` nên nó
 * chỉ có đúng một branch local dù origin có nhiều.
 */
function stepSwitch(state: BotState, args: readonly string[]): StepResult {
  const create = args.includes('-c') || args.includes('-b') || args.includes('--create');
  const name = args.find((token) => !token.startsWith('-'));
  if (name === undefined) return stepFail('thiếu tên branch.');

  const ref = branchRef(name);
  let repo = state.repo;
  let tip: Oid | null = repo.refs[ref] ?? null;

  if (tip === null) {
    const tracked = repo.refs[trackingRef(name)] ?? null;
    const start = tracked ?? (create ? headOid(repo) : null);
    if (start === null) {
      return stepFail(
        create
          ? `không tạo được branch \`${name}\`: kho tạm chưa có commit nào.`
          : `không có branch \`${name}\`, và kịch bản không nêu \`-c\` để tạo mới.`,
      );
    }
    repo = setRef(repo, ref, start, {
      op: 'branch',
      message: `bot tạo branch ${name}`,
      logicalTime: state.clock,
    });
    tip = start;
  }

  repo = moveHead(
    repo,
    { type: 'ref', ref },
    { op: 'checkout', message: `bot chuyển sang ${name}`, logicalTime: state.clock },
  );
  return stepOk({ ...state, repo: loadTree(repo, tip) });
}

/** Nạp index + worktree theo nội dung một commit. */
function loadTree(repo: Repo, oid: Oid | null): Repo {
  const contents = commitContents(repo.objects, oid);
  const index: Record<FilePath, Oid> = {};
  for (const [path, lines] of sortedEntries(contents)) index[path] = blobOid(lines);
  return setWorktree(setIndex(repo, index), contents);
}

// ── commit ──────────────────────────────────────────────────────────────────

/**
 * `git commit -m "<msg>"` của bot — luôn ngầm `-a`.
 *
 * Bot không có khái niệm staging, và cố ý: index là bài học của chương 1, còn
 * bot là nhân vật của chương 2. Cho bot một vùng staging riêng sẽ thêm một
 * trạng thái người chơi không bao giờ nhìn thấy nhưng vẫn phải đúng.
 */
function stepCommit(state: BotState, args: readonly string[]): StepResult {
  const at = args.findIndex((token) => token === '-m' || token === '--message');
  const message = at === -1 ? undefined : args[at + 1];
  if (message === undefined) return stepFail('thiếu `-m "<thông điệp>"`.');

  const ref = headRef(state.repo);
  if (ref === null) return stepFail('HEAD đang tách rời, bot không commit được.');

  const parent = headOid(state.repo);
  const clock = state.clock + 1;

  const [afterTree, tree] = writeContents(state.repo.objects, state.repo.worktree);
  const [afterCommit, oid] = writeCommit(afterTree, {
    tree,
    parents: parent === null ? [] : [parent],
    message,
    author: state.author,
    logicalTime: clock,
  });

  const committed = setRef({ ...state.repo, objects: afterCommit }, ref, oid, {
    op: 'commit',
    message: `bot commit: ${message}`,
    logicalTime: clock,
  });

  return stepOk({ ...state, repo: loadTree(committed, oid), clock });
}

// ── push ────────────────────────────────────────────────────────────────────

/**
 * `git push [--force] [<remote>] [<branch>]` của bot.
 *
 * Đi qua đúng `decidePush` mà người chơi đi qua, nên một bot push non-fast-forward
 * mà không nêu `--force` sẽ bị TỪ CHỐI y hệt. Đó là chủ ý: nếu bot được miễn
 * luật thì level có thể dựng ra những trạng thái origin không đạt tới được bằng
 * git thật, và người chơi sẽ học sai từ chính bối cảnh của bài.
 */
function stepPush(state: BotState, args: readonly string[]): StepResult {
  const force = args.includes('--force') || args.includes('-f');
  const positional = args.filter((token) => !token.startsWith('-'));
  const named = positional[0] === DEFAULT_REMOTE ? positional.slice(1) : positional;

  const branch = named[0] ?? currentBranchName(state.repo);
  if (branch === null) return stepFail('HEAD tách rời nên không biết đẩy branch nào.');

  const localOid = state.repo.refs[branchRef(branch)] ?? null;
  if (localOid === null) return stepFail(`kho tạm của bot không có branch \`${branch}\`.`);

  const decision = decidePush({
    store: unionStore(state.repo, state.origin),
    branch,
    localOid,
    remoteOid: state.origin.refs[branchRef(branch)] ?? null,
    leaseOid: state.repo.refs[trackingRef(branch)] ?? null,
    force,
    forceWithLease: false,
  });

  if (decision.kind === 'rejected') return stepFail(decision.error.message);
  if (decision.kind === 'up-to-date') return stepOk(state);

  const origin = writeBranchOnOrigin(state.origin, {
    branch,
    oid: localOid,
    source: state.repo,
    logicalTime: state.clock,
    op: 'push',
    message: `${state.author} push ${branch} -> ${shortOid(localOid)}`,
  });

  // Ref theo dõi của KHO TẠM đi theo (nó là bản ghi nhớ của chính bot). Ref theo
  // dõi của người chơi thì KHÔNG — đọc lại chú thích đầu file nếu định "sửa".
  const repo = setRef(state.repo, trackingRef(branch), localOid, {
    op: 'update-ref',
    message: `push: ${DEFAULT_REMOTE}/${branch}`,
    logicalTime: state.clock,
  });

  return stepOk({ ...state, repo, origin });
}

function currentBranchName(repo: Repo): string | null {
  return repo.head.type === 'ref' ? shortRefName(repo.head.ref) : null;
}
