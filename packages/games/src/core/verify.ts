/**
 * Xác minh một lượt chơi bằng PHÁT LẠI TẤT ĐỊNH.
 *
 * Đây là cơ chế chống gian lận DUY NHẤT thật sự hoạt động trong trình duyệt
 * (`plans/devops-learning-platform/phase-14-exec.md` §8.3). Nó không ngăn ai sửa
 * `localStorage` — không có cách nào ngăn — nó làm cho việc sửa trở nên vô nghĩa:
 * điểm chỉ được công nhận khi chạy lại `RunLog.actions` từ `RunLog.seed` qua
 * reducer thuần cho ra đúng cái `RunResult` đã khai. Muốn có 1000 điểm thì phải
 * đính kèm một chuỗi action thật sự dẫn tới 1000 điểm — tức là phải chơi thật.
 *
 * ⛔ CÁI NÀY KHÔNG LÀM: không dò devtools, không chặn `contextmenu`, không bắt
 * phím tắt, không vòng lặp gỡ lỗi, không làm rối mã. §8.1 nói rõ vì sao: chúng bị
 * vượt trong vài giây VÀ làm hỏng điều hướng bàn phím / trình đọc màn hình, tức
 * là tự làm đỏ cổng a11y của chính dự án để đổi lấy một rào không cản được ai.
 * `scripts/check-no-antipattern.mjs` gác điều đó, có đối chứng dương.
 *
 * VÌ SAO REDUCER LÀ THAM SỐ TIÊM VÀO, KHÔNG PHẢI IMPORT
 * ----------------------------------------------------
 * Hai lý do, cả hai đều là ràng buộc thật chứ không phải sở thích kiến trúc:
 *
 *   1. Cùng một hàm xác minh phải chạy được Ở SERVER khi có bảng xếp hạng
 *      (§8.5): client gửi `RunLog`, server chạy CÙNG reducer và tự tính điểm.
 *      Import cứng một reducer cụ thể sẽ trói file này vào một game.
 *   2. Test được cả hai chiều bằng engine giả — kể cả chiều "engine của TA hỏng",
 *      là chiều không dựng được nếu reducer thật bị import cứng.
 *
 * @see docs/games/anti-cheat.md
 */

/*
 * `GameAction` / `GameActionKind` / `RunLog` tới từ `core/run-log.ts` kể từ
 * 17.A.2, KHÔNG còn từ `k8s/contract.ts`. File này cố ý làm việc trên DẠNG RỘNG:
 * nó chỉ đọc `tick` và `kind`, nên nó đúng với mọi game — đó là toàn bộ lý do
 * ba kiểu kia chuyển lên `core/`. Kéo `K8sGameAction` vào đây là trói ngược cơ
 * chế chống gian lận về lại đúng một game.
 *
 * Từ 18.A thì câu trên là MỘT SỰ THẬT ĐO ĐƯỢC chứ không còn là mong muốn: file
 * này không import gì từ `k8s/` nữa, và adapter K8s duy nhất từng ở đây
 * (`sessionReplayEngine`) đã sang `k8s/replay-engine.ts`. Ô nghiệm thu AC-A của
 * `plans/devops-learning-platform/phase-18.md` đo đúng điều đó — nó grep các
 * dòng import trỏ sang một package game và phải trả rỗng.
 *
 * ⚠ Ô đó đo PHỤ THUỘC, không đo chính tả: nhắc tên `K8sSession` trong một câu
 * chú thích như ngay bên dưới là hợp lệ và cố ý. Bản cũ của ô nghiệm thu grep
 * chữ `ClusterSpec` nên tự làm mình đỏ vì văn xuôi; đừng dựng lại kiểu đo đó.
 */
import type { GameAction, GameActionKind, RunLog } from './run-log.ts';
import type { RunResult } from './types.ts';
import { lastActionTick, stableStringify } from './integrity.ts';

// ── Kết quả xác minh ────────────────────────────────────────────────────────

/**
 * ⚠ NĂM trạng thái, không phải một boolean, và đó là điểm chính của file này.
 *
 * `khong-khop` và `engine-khong-tat-dinh` NHÌN GIỐNG HỆT NHAU từ một lần lệch
 * đơn lẻ nhưng dẫn tới kết luận NGƯỢC NHAU: một cái là "người chơi sửa dữ liệu",
 * cái kia là "reducer của chúng ta không tất định nên mọi lượt chơi hợp lệ đều
 * bị gắn cờ oan". Gộp chúng vào một `verified: false` là tự bịt mắt đúng chỗ
 * nguy hiểm nhất — xem `checkDeterminism` ở dưới.
 *
 * Bối cảnh đo được: bản upstream `rohitg00/k8sgames` có 15 lời gọi
 * `Math.random()` và không có RNG gieo hạt ở bất kỳ đâu (báo cáo khảo sát
 * `plans/devops-learning-platform/reports/2026-09-08-p14-k8sgames-upstream-study.md`
 * §6), nên với kiến trúc đó thì MỌI lượt chơi đều rơi vào
 * `engine-khong-tat-dinh`. Đây không phải một khả năng giả định.
 */
export type VerifyStatus =
  /** Phát lại khớp hoàn toàn. Đây là trạng thái DUY NHẤT được tính điểm. */
  | 'da-xac-minh'
  /** Phát lại chạy được nhưng ra kết quả khác cái đã khai. Sửa tay, HOẶC đổi version. */
  | 'khong-khop'
  /** Hai lần phát lại cùng đầu vào ra hai kết quả khác nhau. Lỗi CỦA TA, không phải của người chơi. */
  | 'engine-khong-tat-dinh'
  /** `RunLog` sai hình dạng: tick lùi, kind lạ, seed không phải số nguyên. */
  | 'log-hong'
  /** Reducer ném khi phát lại. Cũng là lỗi của ta hoặc của dữ liệu level, không phải bằng chứng gian lận. */
  | 'phat-lai-loi';

export interface Mismatch {
  readonly field: string;
  /** Giá trị người chơi khai, đã đưa về chuỗi để so và để hiển thị. */
  readonly claimed: string;
  /** Giá trị phát lại ra được. */
  readonly replayed: string;
}

/**
 * ⛔ KHÔNG có field `verified` ở đây. Nó suy ra được từ `status`
 * (`status === 'da-xac-minh'`), và quy ước "No Derived Fields" của repo
 * (`rules/code-conventions.md`) áp cho object trả về y như cho cột DB: hai field
 * mà một cái quyết định cái kia sẽ nói dối ngay lần đầu ai đó thêm một status.
 * Dùng `isVerified()` ở chỗ cần một boolean.
 */
export interface VerifyResult {
  readonly status: VerifyStatus;
  /** Rỗng khi `da-xac-minh`. Là BẰNG CHỨNG, không phải bản sao của `status`. */
  readonly mismatches: readonly Mismatch[];
  /** Tiếng Việt, một câu — chi tiết máy móc để ghi log, không phải nhãn cho người dùng. */
  readonly detail: string;
}

export function isVerified(result: VerifyResult): boolean {
  return result.status === 'da-xac-minh';
}

/**
 * Nhãn tiếng Việt hiển thị cho người chơi.
 *
 * ⚠ Không nhãn nào ở đây được nói "gian lận". Một bản lưu hỏng vì đổi version
 * rơi vào ĐÚNG nhánh `khong-khop` như một bản bị sửa tay, và buộc tội người dùng
 * dựa trên một tín hiệu không phân biệt được hai thứ đó là sai (§8.3.3).
 */
export function verifyLabel(status: VerifyStatus): string {
  switch (status) {
    case 'da-xac-minh':
      return 'Đã xác minh';
    case 'khong-khop':
      return 'Không xác minh được';
    case 'engine-khong-tat-dinh':
      return 'Không xác minh được (lỗi bộ mô phỏng)';
    case 'log-hong':
      return 'Không xác minh được (nhật ký hỏng)';
    case 'phat-lai-loi':
      return 'Không xác minh được (lỗi bộ mô phỏng)';
  }
}

// ── Đếm trên nhật ký ────────────────────────────────────────────────────────

/**
 * Các `kind` được tính là MỘT LỆNH của người chơi.
 *
 * `hint` không phải lệnh (nó có bộ đếm riêng) và `wait` cũng không (đứng nhìn
 * đồng hồ chạy không phải một nước đi).
 *
 * ⚠ Đây là hợp đồng ngầm với `SessionStatus.movesUsed` của lane B
 * (`k8s/contract.ts`). Nếu bên đó đếm khác — tính cả `wait`, hay không tính
 * `kubectl` chỉ-đọc — thì `commandsUsed` sẽ lệch ở MỌI lượt chơi HỢP LỆ và toàn
 * bộ người chơi bị gắn cờ oan. Nếu định nghĩa "nước đi" đổi thì sửa ở ĐÂY, một
 * chỗ, và cho `movesUsed` đọc theo; đừng đếm lại ở chỗ thứ hai.
 */
export const COMMAND_KINDS: readonly GameActionKind[] = [
  'apply',
  'delete',
  'scale',
  'edit',
  'kubectl',
  /*
   * `'command'` là action DUY NHẤT của game Git (`GitGameAction` ở
   * `core/run-log.ts`) — một dòng lệnh người chơi gõ. Nó thuộc về đây vì danh
   * sách này định nghĩa "cái gì tính là MỘT LỆNH", và ở game Git thì gõ lệnh là
   * toàn bộ tương tác. Bỏ nó ra thì `tallyLog` đếm `commandsUsed = 0` cho mọi
   * lượt chơi Git, và mọi lượt khai một con số thật sẽ rơi vào `khong-khop` —
   * tức toàn bộ người chơi game Git bị gắn cờ oan, đúng cái hỏng mà chú thích
   * bên trên cảnh báo.
   *
   * Không có `'wait'` phía Git: thời gian ở đó chỉ nhích khi có lệnh chạy, nên
   * "chờ xem" không phải một hành động. Xem `GitGameAction`.
   */
  'command',
];

/**
 * MỌI `kind` hợp lệ. Phải VÉT CẠN `GameActionKind` — một kind thiếu ở đây làm
 * `logShapeError` từ chối một nhật ký lành với lý do "kind lạ".
 *
 * Hôm nay: 5 kind lệnh K8s + `'command'` của Git (đều ở `COMMAND_KINDS`) + hai
 * kind không-phải-lệnh dùng chung là `'hint'` và `'wait'`.
 */
const ACTION_KINDS: readonly GameActionKind[] = [...COMMAND_KINDS, 'hint', 'wait'];

/** Những con số suy ra ĐƯỢC từ chính nhật ký, nên không cần tin lời khai. */
export interface RunTally {
  readonly commandsUsed: number;
  readonly hintsUsed: number;
  /** Tick của hành động cuối. 0 khi nhật ký rỗng. */
  readonly lastTick: number;
  readonly actionCount: number;
}

/**
 * ⚠ Đây là chỗ bắt được kiểu gian lận rẻ nhất mà phát lại KHÔNG bắt: sửa
 * `commandsUsed` xuống 3 để ăn điểm "giải bằng ít nước đi". Số lệnh đếm được từ
 * `actions`, nên lời khai không có giá trị gì — đúng tinh thần "No Derived
 * Fields": đã có `actions` thì `commandsUsed` là thứ TÍNH, không phải thứ LƯU.
 */
export function tallyLog(log: RunLog): RunTally {
  let commandsUsed = 0;
  let hintsUsed = 0;
  for (const action of log.actions) {
    if (action.kind === 'hint') hintsUsed++;
    else if (COMMAND_KINDS.includes(action.kind)) commandsUsed++;
  }
  // `lastActionTick` ở `integrity.ts` chứ không đếm lại tại chỗ: phép kiểm
  // "nhanh hơn mô phỏng" bên đó dùng đúng con số này, và hai bản sao của cùng
  // một phép đếm sẽ lệch nhau vào đúng ngày ai đó đổi nghĩa của tick.
  return {
    commandsUsed,
    hintsUsed,
    lastTick: lastActionTick(log),
    actionCount: log.actions.length,
  };
}

// ── Engine tiêm vào ─────────────────────────────────────────────────────────

/**
 * Bề mặt TỐI THIỂU mà xác minh cần từ lane B. Cố ý nhỏ: mỗi hàm thêm vào đây là
 * một hàm phải dựng lại khi chạy xác minh ở server (§8.5).
 *
 * `TState` cố ý mờ đục — xác minh không cần biết trạng thái cụm có hình gì, chỉ
 * cần nó đi từ `init` qua `reduce` ra `objectivesMet` + `score` một cách tất định.
 */
export interface ReplayEngine<TState> {
  /** Trạng thái đầu của level, PHẢI chỉ phụ thuộc `levelId` + `seed`. */
  init(levelId: string, seed: number): TState;
  reduce(state: TState, action: GameAction): TState;
  /** id các objective đã đạt ở trạng thái cuối. Thứ tự không quan trọng. */
  objectivesMet(state: TState): readonly string[];
  /** Điểm 0..1000. `tally` là số đếm ĐƯỢC TỪ NHẬT KÝ, không phải từ lời khai. */
  score(state: TState, tally: RunTally): number;
  /**
   * Hình chiếu để so hai lần phát lại sâu hơn — thường là `ClusterView`.
   * Tuỳ chọn: thiếu nó thì phép kiểm tất định chỉ so `objectivesMet` + `score`,
   * vẫn đúng nhưng thô hơn.
   */
  project?(state: TState): unknown;
  /**
   * Dọn trạng thái sau khi phát lại xong. Bắt buộc với engine có tài nguyên
   * sống — `K8sSession` giữ một vòng lặp thời gian và tự nói phải gọi
   * `dispose()`. Engine thuần (state bất biến) bỏ qua.
   */
  dispose?(state: TState): void;
}

/*
 * `sessionReplayEngine` KHÔNG còn ở đây kể từ 18.A — nó đã chuyển sang
 * `k8s/replay-engine.ts`. Nó là adapter của ĐÚNG MỘT game: nó kéo vào năm kiểu
 * K8s (`CreateSession`, `K8sGameAction`, `K8sSession`, `Level`,
 * `SessionStatus`), tức là trói `core/` vào Kubernetes đúng theo cách khối chú
 * thích đầu file cấm. Giao diện `ReplayEngine` ở trên vẫn generic và vẫn ở đây;
 * mỗi game tự dựng hiện thực của mình trong package của nó.
 */

interface ReplayOutcome {
  readonly objectivesMet: readonly string[];
  readonly score: number;
  readonly projection: string | null;
}

// ── Kiểm hình dạng nhật ký ──────────────────────────────────────────────────

/**
 * `RunLog` đến từ `localStorage` — tức là từ NGOÀI hệ thống, và người dùng sửa
 * được tuỳ ý. Kiểu TypeScript không tồn tại lúc chạy, nên phải kiểm ở biên.
 * Trả về câu lý do (tiếng Việt) khi hỏng, `null` khi lành.
 */
function logShapeError(log: RunLog): string | null {
  if (!Number.isSafeInteger(log.seed)) {
    return `seed không phải số nguyên an toàn: ${String(log.seed)}`;
  }
  if (!Array.isArray(log.actions)) return 'actions không phải mảng';

  let previousTick = -1;
  for (let i = 0; i < log.actions.length; i++) {
    const action = log.actions[i];
    if (!action) return `actions[${i}] rỗng`;
    if (!Number.isSafeInteger(action.tick) || action.tick < 0) {
      return `actions[${i}].tick không phải số nguyên không âm: ${String(action.tick)}`;
    }
    // Tick LÙI là bất khả thi trong một lượt chơi thật: thời gian mô phỏng chỉ
    // tiến. Bằng nhau thì được — nhiều thao tác trong cùng một tick là bình thường.
    if (action.tick < previousTick) {
      return `actions[${i}].tick lùi: ${action.tick} < ${previousTick}`;
    }
    previousTick = action.tick;
    if (!ACTION_KINDS.includes(action.kind)) {
      return `actions[${i}].kind lạ: ${String(action.kind)}`;
    }
  }
  return null;
}

// ── Phát lại ────────────────────────────────────────────────────────────────

function replay<TState>(engine: ReplayEngine<TState>, log: RunLog, tally: RunTally): ReplayOutcome {
  // `let` ngoài `try` để `finally` dọn được trạng thái MỚI NHẤT, không phải
  // trạng thái ban đầu.
  let state = engine.init(log.levelId, log.seed);
  try {
    for (const action of log.actions) {
      state = engine.reduce(state, action);
    }
    return {
      objectivesMet: [...engine.objectivesMet(state)],
      score: engine.score(state, tally),
      // Chuỗi hoá NGAY, không giữ tham chiếu: với engine có trạng thái thay đổi
      // tại chỗ (`K8sSession`), một tham chiếu giữ lại sẽ đọc ra trạng thái của
      // lần phát lại SAU và phép so hai lần thành tautology.
      projection: engine.project ? stableStringify(engine.project(state)) : null,
    };
  } finally {
    // `K8sSession` giữ vòng lặp thời gian; không đóng thì hai lần phát lại mỗi
    // lượt xác minh sẽ để lại rác. `finally` để một reducer ném cũng vẫn dọn.
    engine.dispose?.(state);
  }
}

/** Chuẩn hoá để so: thứ tự objective không mang thông tin, trùng lặp thì mang. */
function normalizeObjectives(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

function sameOutcome(a: ReplayOutcome, b: ReplayOutcome): boolean {
  return (
    a.score === b.score &&
    a.projection === b.projection &&
    normalizeObjectives(a.objectivesMet) === normalizeObjectives(b.objectivesMet)
  );
}

/**
 * Phát lại HAI LẦN và so hai lần với nhau.
 *
 * ⚠ Đây không phải phép kiểm thừa. Nếu reducer không tất định thì mọi lượt chơi
 * HỢP LỆ đều lệch so với lời khai, và nếu chỉ có một trạng thái thất bại thì
 * toàn bộ người chơi bị gắn cờ "không xác minh được" trong khi lỗi nằm ở ta.
 * Hai nguyên nhân đó cho ra cùng một triệu chứng nhưng cần hai hành động ngược
 * nhau (sửa engine / không tin điểm), nên phải phân biệt được TỪ MỘT LƯỢT.
 *
 * Giá phải trả là gấp đôi chi phí phát lại. Xác minh chạy đúng một lần lúc kết
 * thúc lượt chơi trên một chuỗi action hữu hạn, nên cái giá đó không đáng kể so
 * với việc chẩn đoán sai.
 */
export function checkDeterminism<TState>(
  engine: ReplayEngine<TState>,
  log: RunLog,
): { deterministic: boolean; detail: string } {
  const tally = tallyLog(log);
  const first = replay(engine, log, tally);
  const second = replay(engine, log, tally);
  if (sameOutcome(first, second)) return { deterministic: true, detail: 'hai lần phát lại khớp' };
  return {
    deterministic: false,
    detail:
      `hai lần phát lại cùng seed=${log.seed} ra khác nhau ` +
      `(điểm ${first.score} vs ${second.score}; objective ` +
      `"${normalizeObjectives(first.objectivesMet)}" vs "${normalizeObjectives(second.objectivesMet)}")`,
  };
}

// ── Cửa chính ───────────────────────────────────────────────────────────────

/**
 * Xác minh `claimed` bằng cách phát lại `log`.
 *
 * KHÔNG bao giờ ném và KHÔNG bao giờ xoá gì: một lượt không xác minh được vẫn là
 * dữ liệu của người dùng, chỉ mất quyền được tính điểm/thành tựu (§8.3.3).
 *
 * KHÔNG kiểm được và cố ý không giả vờ kiểm: `startedAt` / `finishedAt` là giờ
 * treo tường, không nằm trong nhật ký nên phát lại không tái tạo được. Chúng
 * thuộc phần kiểm tính hợp lý ở `integrity.ts`.
 */
export function verifyRun<TState>(
  log: RunLog,
  claimed: RunResult,
  engine: ReplayEngine<TState>,
): VerifyResult {
  const shapeError = logShapeError(log);
  if (shapeError !== null) {
    return { status: 'log-hong', mismatches: [], detail: shapeError };
  }

  const mismatches: Mismatch[] = [];
  if (log.levelId !== claimed.levelId) {
    mismatches.push({ field: 'levelId', claimed: claimed.levelId, replayed: log.levelId });
  }
  if (log.seed !== claimed.seed) {
    mismatches.push({ field: 'seed', claimed: String(claimed.seed), replayed: String(log.seed) });
  }
  // Nhật ký và lời khai nói về hai lượt chơi khác nhau ⇒ phát lại vô nghĩa.
  if (mismatches.length > 0) {
    return { status: 'khong-khop', mismatches, detail: 'nhật ký không thuộc lượt chơi đã khai' };
  }

  const tally = tallyLog(log);

  let first: ReplayOutcome;
  let second: ReplayOutcome;
  try {
    first = replay(engine, log, tally);
    second = replay(engine, log, tally);
  } catch (error) {
    return {
      status: 'phat-lai-loi',
      mismatches: [],
      detail: `reducer ném khi phát lại: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!sameOutcome(first, second)) {
    return {
      status: 'engine-khong-tat-dinh',
      mismatches: [
        { field: 'score', claimed: String(first.score), replayed: String(second.score) },
      ],
      detail:
        'hai lần phát lại cùng đầu vào ra khác nhau — reducer không tất định. ' +
        'Đây là lỗi của bộ mô phỏng, KHÔNG phải bằng chứng người chơi sửa dữ liệu.',
    };
  }

  if (tally.commandsUsed !== claimed.commandsUsed) {
    mismatches.push({
      field: 'commandsUsed',
      claimed: String(claimed.commandsUsed),
      replayed: String(tally.commandsUsed),
    });
  }
  if (tally.hintsUsed !== claimed.hintsUsed) {
    mismatches.push({
      field: 'hintsUsed',
      claimed: String(claimed.hintsUsed),
      replayed: String(tally.hintsUsed),
    });
  }
  const claimedObjectives = normalizeObjectives(claimed.objectivesMet);
  const replayedObjectives = normalizeObjectives(first.objectivesMet);
  if (claimedObjectives !== replayedObjectives) {
    mismatches.push({
      field: 'objectivesMet',
      claimed: claimedObjectives,
      replayed: replayedObjectives,
    });
  }
  if (first.score !== claimed.score) {
    mismatches.push({
      field: 'score',
      claimed: String(claimed.score),
      replayed: String(first.score),
    });
  }

  if (mismatches.length > 0) {
    return {
      status: 'khong-khop',
      mismatches,
      detail: `phát lại ra kết quả khác lời khai ở ${mismatches.length} field`,
    };
  }
  return { status: 'da-xac-minh', mismatches: [], detail: 'phát lại khớp hoàn toàn' };
}
