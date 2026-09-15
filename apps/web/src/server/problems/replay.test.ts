import { describe, expect, it } from 'vitest';
import {
  ALL_KINDS,
  isVerified,
  tallyLog,
  verifyRun,
  type GameAction,
  type Testcase,
  type RunLog,
  type RunResult,
} from '@devops-platform/games';
import {
  hintIdsFromLog,
  isSolved,
  problemAsLevel,
  problemDifficultyToLevelDifficultyLossy,
  problemReplayEngine,
  problemScoreRun,
} from './replay';
import type { StoredProblem } from './dto';

/**
 * Bài tối thiểu chạy được thật trên engine: một node, một namespace, mục tiêu là
 * dựng một pod. Dùng `resource-exists` + `pod-running` — hai vị từ mà `l01` dùng,
 * nên chúng chắc chắn có trong bảng `PREDICATES`.
 */
function makeProblem(overrides: Partial<StoredProblem> = {}): StoredProblem {
  return {
    code: 'K8S-0001',
    gameId: 'k8s',
    slug: 'pod-dau-tien',
    title: 'Pod đầu tiên',
    statement: 'Dựng một pod tên `web` trong namespace `hoc-tap`.',
    difficulty: 'easy',
    topics: ['workload'],
    tags: [],
    timeLimitSec: null,
    initialState: {
      nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
      namespaces: ['hoc-tap'],
      resources: [],
    },
    testcases: [
      {
        id: 'pod-ton-tai',
        label: 'Có một pod tên `web`',
        check: 'resource-exists',
        args: { kind: 'Pod', name: 'web', namespace: 'hoc-tap' },
        visible: true,
      },
      {
        id: 'pod-chay',
        label: 'Pod `web` đang Running',
        check: 'pod-running',
        args: { namespace: 'hoc-tap', name: 'web' },
        visible: true,
      },
    ],
    allowedResources: null,
    hints: [
      { id: 'goi-y-1', text: 'Dùng `kubectl apply`.', penaltyPoints: 50 },
      { id: 'goi-y-2', text: 'Image `nginx:1.27-alpine`.', penaltyPoints: 120 },
    ],
    parMoves: 1,
    seedable: false,
    state: 'published',
    authorId: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

const APPLY_POD: GameAction = {
  gameId: 'k8s',
  tick: 0,
  kind: 'apply',
  yaml: [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: web',
    '  namespace: hoc-tap',
    'spec:',
    '  containers:',
    '    - name: web',
    '      image: nginx:1.27-alpine',
  ].join('\n'),
};

function makeLog(problem: StoredProblem, actions: readonly GameAction[]): RunLog {
  return { gameId: 'k8s', levelId: problem.code, seed: 12345, actions };
}

/** Chạy phát lại một lần để lấy con số THẬT mà engine sinh ra cho nhật ký này. */
function replayedScore(problem: StoredProblem, log: RunLog, revealedIds: readonly string[]): number {
  const engine = problemReplayEngine(problem, revealedIds);
  const state = engine.init(log.levelId, log.seed);
  try {
    let current = state;
    for (const action of log.actions) {
      current = engine.reduce(current, action);
    }
    return engine.score(current, tallyLog(log));
  } finally {
    engine.dispose?.(state);
  }
}

function makeClaim(problem: StoredProblem, log: RunLog, score: number, objectivesMet: readonly string[]): RunResult {
  const tally = tallyLog(log);
  return {
    gameId: 'k8s',
    levelId: problem.code,
    seed: log.seed,
    startedAt: 1_000,
    finishedAt: 61_000,
    objectivesMet,
    objectivesTotal: problem.testcases.length,
    commandsUsed: tally.commandsUsed,
    hintsUsed: tally.hintsUsed,
    score,
  };
}

describe('bọc Problem thành Level để phát lại', () => {
  it('`allowedResources: null` dựng lại thành ALL_KINDS, KHÔNG thành mảng rỗng', () => {
    // Hai giá trị mang nghĩa NGƯỢC NHAU: `null` là "cho dùng mọi loại", `[]` là
    // "cấm mọi loại". Hôm nay engine không đọc field này khi phát lại, nên viết
    // sai chưa gây triệu chứng — ô này gác đúng chỗ mà nó SẼ gây, im lặng.
    expect(problemAsLevel(makeProblem()).allowedResources).toEqual(ALL_KINDS);
    expect(problemAsLevel(makeProblem()).allowedResources.length).toBeGreaterThan(0);
  });

  it('giữ nguyên danh sách khi bài có giới hạn', () => {
    const level = problemAsLevel(makeProblem({ allowedResources: ['Pod'] }));
    expect(level.allowedResources).toEqual(['Pod']);
  });

  it('thang bốn bậc gộp về ba bậc, và phép gộp KHÔNG đảo ngược được', () => {
    expect(problemDifficultyToLevelDifficultyLossy('easy')).toBe('basic');
    expect(problemDifficultyToLevelDifficultyLossy('medium')).toBe('intermediate');
    // `hard` và `expert` cùng ra `advanced` — đó chính là chỗ thông tin mất, và
    // là lý do hàm mang chữ `Lossy` trong tên.
    expect(problemDifficultyToLevelDifficultyLossy('hard')).toBe('advanced');
    expect(problemDifficultyToLevelDifficultyLossy('expert')).toBe('advanced');
  });

  it('bậc độ khó KHÔNG ảnh hưởng kết quả phát lại', () => {
    // Đối chứng cho câu khẳng định "engine chỉ đọc id/initialState/objectives".
    // Ngày nào engine bắt đầu đọc `difficulty`, ô này đỏ và câu khẳng định kia
    // phải viết lại — thay vì trôi đi không ai biết.
    const log = makeLog(makeProblem(), [APPLY_POD]);
    const easy = replayedScore(makeProblem({ difficulty: 'easy' }), log, []);
    const expert = replayedScore(makeProblem({ difficulty: 'expert' }), log, []);
    expect(easy).toBe(expert);
  });
});

describe('chấm điểm khi phát lại', () => {
  it('chỉ trừ MỘT lần cho mỗi gợi ý, dù nhật ký lặp lại lần mở', () => {
    const problem = makeProblem();
    const openTwice = makeLog(problem, [
      { gameId: 'k8s', tick: 0, kind: 'hint', index: 0 },
      { gameId: 'k8s', tick: 1, kind: 'hint', index: 0 },
      APPLY_POD,
    ]);
    const openOnce = makeLog(problem, [{ gameId: 'k8s', tick: 0, kind: 'hint', index: 0 }, APPLY_POD]);
    expect(replayedScore(problem, openTwice, hintIdsFromLog(problem, openTwice))).toBe(
      replayedScore(problem, openOnce, hintIdsFromLog(problem, openOnce)),
    );
  });

  it('mở gợi ý đắt hơn thì mất nhiều điểm hơn', () => {
    const problem = makeProblem();
    const log = makeLog(problem, [APPLY_POD]);
    const base = replayedScore(problem, log, []);
    const cheap = replayedScore(problem, log, ['goi-y-1']);
    const dear = replayedScore(problem, log, ['goi-y-2']);
    expect(base - cheap).toBe(50);
    expect(base - dear).toBe(120);
  });

  it('id gợi ý không còn tồn tại thì BỎ QUA, không ném', () => {
    // Xảy ra thật khi bài được sửa đề trong lúc có người đang làm dở. Ném ở đây
    // sẽ huỷ cả lượt nộp vì một thay đổi người chơi không gây ra.
    const problem = makeProblem();
    const log = makeLog(problem, [APPLY_POD]);
    expect(replayedScore(problem, log, ['goi-y-da-xoa'])).toBe(replayedScore(problem, log, []));
  });

  it('hai lần phát lại cùng nhật ký ra cùng một điểm', () => {
    // Tất định là điều kiện tiên quyết của cả cơ chế: engine không tất định thì
    // MỌI lượt chơi hợp lệ đều bị gắn cờ, và lỗi nằm ở ta chứ không ở người chơi.
    const problem = makeProblem();
    const log = makeLog(problem, [APPLY_POD]);
    expect(replayedScore(problem, log, [])).toBe(replayedScore(problem, log, []));
  });

  it('điểm không bao giờ âm dù gợi ý đắt hơn cả bài', () => {
    const problem = makeProblem({
      hints: [{ id: 'qua-dat', text: 'x', penaltyPoints: 1000 }],
    });
    const log = makeLog(problem, [APPLY_POD]);
    expect(replayedScore(problem, log, ['qua-dat'])).toBeGreaterThanOrEqual(0);
  });

  it('hàm chấm là closure tất định — cùng đầu vào, cùng đầu ra', () => {
    const problem = makeProblem();
    const score = problemScoreRun(problem, ['goi-y-1']);
    const status = { phase: 'won' as const, objectivesMet: ['pod-ton-tai'], hintsRevealed: 1, movesUsed: 1 };
    const tally = { commandsUsed: 1, hintsUsed: 1, lastTick: 1, actionCount: 2 };
    expect(score(status, tally)).toBe(score(status, tally));
  });
});

describe('xác minh đầu-cuối bằng verifyRun', () => {
  it('lời khai ĐÚNG bằng số phát lại thì được xác minh', () => {
    const problem = makeProblem();
    const log = makeLog(problem, [APPLY_POD]);
    const engine = problemReplayEngine(problem, []);
    const truth = replayedScore(problem, log, []);
    const objectivesMet = objectivesFrom(problem, log);
    const verdict = verifyRun(log, makeClaim(problem, log, truth, objectivesMet), engine);
    expect(verdict.status, verdict.detail).toBe('da-xac-minh');
    expect(isVerified(verdict)).toBe(true);
  });

  it('khai điểm cao hơn số phát lại thì KHÔNG được xác minh', () => {
    // Đây là đường gian lận rẻ nhất, và là lý do cả cơ chế tồn tại.
    const problem = makeProblem();
    const log = makeLog(problem, [APPLY_POD]);
    const engine = problemReplayEngine(problem, []);
    const claim = makeClaim(problem, log, 1000, objectivesFrom(problem, log));
    const verdict = verifyRun(log, { ...claim, score: 1000 }, engine);
    if (verdict.status === 'da-xac-minh') {
      // Nhật ký này có thể đạt đúng 1000 điểm; nếu vậy ca gian lận phải dựng
      // bằng một số KHÁC. Nói ra thay vì để ô test xanh một cách rỗng.
      const higher = verifyRun(log, { ...claim, score: 999 }, engine);
      expect(higher.status).toBe('khong-khop');
    } else {
      expect(verdict.status).toBe('khong-khop');
    }
  });

  it('nhật ký của bài KHÁC thì phát lại thất bại, không âm thầm chấm', () => {
    const problem = makeProblem();
    const foreign: RunLog = { gameId: 'k8s', levelId: 'K8S-9999', seed: 1, actions: [] };
    const engine = problemReplayEngine(problem, []);
    const claim = makeClaim(problem, foreign, 0, []);
    expect(verifyRun(foreign, claim, engine).status).not.toBe('da-xac-minh');
  });

  /**
   * ⛔ ĐỐI CHỨNG DƯƠNG cho `objectivesTotal` — bản K8s của
   * `git-replay.test.ts` § "client khai AC, máy chủ vẫn nói WA".
   *
   * ## Vì sao ô này tồn tại, và vì sao KHÔNG sửa `verifyRun` thay vào đó
   *
   * Bảng nợ của kế hoạch (§5.4, §6.4) ghi *"`objectivesTotal` KHÔNG nằm trong
   * sáu trường `verifyRun` so. Hai bên lệch trường đó thì không ô nào đỏ"*. Vế
   * đầu ĐÚNG; vế sau — và cái kết luận ngầm rằng đó là một khe hở — thì SAI, và
   * đo được là sai:
   *
   * - `problemScoreRun` (`replay.ts`) và đường chấm đều lấy mẫu số từ
   *   `problem.testcases.length`. Lời khai của client không được đọc một lần nào.
   * - `problem_submissions` KHÔNG có cột `objectivesTotal`. Không có gì để lưu
   *   một con số bịa.
   * - Chỗ DUY NHẤT đọc `claimed.objectivesTotal` là `warnOnVerdictDivergence`
   *   (`submit.ts`), và việc của nó chính là kêu lên khi hai bên lệch.
   *
   * Nên thêm trường này vào `verifyRun` sẽ không đóng đường nào, lại còn LÀM TẮT
   * cảnh báo đó: lệch ⇒ `khong-khop` ⇒ `CE`, mà `warnOnVerdictDivergence` thoát
   * sớm ở nhánh `CE`. Đổi một dòng log có tên lấy một `CE` vô danh.
   *
   * Thứ đáng làm là CHỨNG MINH tầng đang chịu lực vẫn chịu được — và Git đã có ô
   * đó từ trước, K8s thì chưa. Đây là ô còn thiếu.
   */
  it('⛔ hạ `objectivesTotal` ⇒ đi LỌT xác minh, nhưng mẫu số thật vẫn của BÀI', () => {
    const problem = makeProblem();
    const log = makeLog(problem, [APPLY_POD]);
    const engine = problemReplayEngine(problem, []);
    const truth = replayedScore(problem, log, []);
    const objectivesMet = objectivesFrom(problem, log);

    // Bài có nhiều hơn một testcase, nếu không thì "hạ mẫu số" không có nghĩa.
    expect(problem.testcases.length).toBeGreaterThan(1);
    // Và lượt chơi này cố ý KHÔNG qua hết — đó là điều kiện để mẫu số quan trọng.
    expect(objectivesMet.length).toBeLessThan(problem.testcases.length);

    const suaTay: RunResult = {
      ...makeClaim(problem, log, truth, objectivesMet),
      objectivesTotal: objectivesMet.length,
    };

    // Vế 1 — lời khai này ĐI LỌT tầng xác minh. Không có vế này thì vế 3 xanh vì
    // một lý do khác (lượt nộp bị chặn sớm) và ô mất hết ý nghĩa.
    expect(verifyRun(log, suaTay, engine).status).toBe('da-xac-minh');

    // Vế 2 — client tự suy thì ra `AC`: nó chia cho chính mẫu số nó vừa sửa.
    expect(new Set(suaTay.objectivesMet).size === suaTay.objectivesTotal).toBe(true);

    // Vế 3 — thứ THẬT SỰ chặn: mẫu số của máy chủ đếm từ BÀI, và `isSolved` đọc
    // mọi testcase. Một lời khai AC không biến lượt này thành đã-giải.
    expect(isSolved(problem, objectivesMet)).toBe(false);
  });
});

/*
 * ⚠ NHÓM NÀY ĐỔI NGHĨA Ở 18.B, và ghi lại thay vì lặng lẽ sửa kỳ vọng cho xanh.
 *
 * Bản cũ tên là "isSolved đọc mục tiêu BẮT BUỘC" và gác một bất biến nay đã
 * CHẾT: quyết định #20 bỏ hẳn khái niệm mục tiêu thưởng (*"Objective =
 * testcase"*, và `core/problem.ts` § `Testcase` bỏ `required` vì *"một testcase
 * thì luôn chặn"*). Ô "đủ phần bắt buộc là đã giải dù thiếu mục tiêu thưởng"
 * mô tả một hành vi KHÔNG CÒN ĐÚNG, nên nó bị đảo chứ không bị chỉnh số.
 *
 * Ô thứ ba thì ngược lại — bất biến của nó CÒN SỐNG (tập rỗng không được tự
 * động là "đã giải"), chỉ cách dựng dữ liệu là chết: nó dựng ca đó bằng
 * `required: false` cho mọi mục tiêu, một câu không còn diễn đạt được gì. Dựng
 * lại bằng một bài KHÔNG CÓ testcase nào, đúng thứ nó định gác từ đầu.
 */
describe('isSolved đọc MỌI testcase', () => {
  it('đạt hết testcase mới là đã giải', () => {
    expect(isSolved(makeProblem(), ['pod-ton-tai', 'pod-chay'])).toBe(true);
  });

  it('ĐẢO NGHĨA từ 18.B: đạt một phần thì CHƯA giải', () => {
    // Trước #20 đây là `true` — `pod-chay` là mục tiêu thưởng nên không chặn.
    // Từ #20 mọi testcase đều chặn, nên thiếu một cái là chưa giải.
    expect(isSolved(makeProblem(), ['pod-ton-tai'])).toBe(false);
  });

  it('thiếu testcase khác cũng chưa giải', () => {
    expect(isSolved(makeProblem(), ['pod-chay'])).toBe(false);
  });

  it('bài KHÔNG CÓ testcase nào thì KHÔNG tự động là đã giải', () => {
    // "Mọi phần tử của tập rỗng đều thoả" là đúng về logic và sai về sản phẩm:
    // nó cho không điểm cho một bài dữ liệu đã hỏng.
    const noTestcases = makeProblem({ testcases: [] as readonly Testcase[] });
    expect(isSolved(noTestcases, [])).toBe(false);
    expect(isSolved(noTestcases, ['pod-ton-tai', 'pod-chay'])).toBe(false);
  });
});

describe('đọc gợi ý đã mở ra từ nhật ký', () => {
  it('lấy id theo index, bỏ qua index ngoài phạm vi', () => {
    const problem = makeProblem();
    const log = makeLog(problem, [
      { gameId: 'k8s', tick: 0, kind: 'hint', index: 1 },
      { gameId: 'k8s', tick: 1, kind: 'hint', index: 99 },
      APPLY_POD,
    ]);
    expect(hintIdsFromLog(problem, log)).toEqual(['goi-y-2']);
  });
});

function objectivesFrom(problem: StoredProblem, log: RunLog): readonly string[] {
  const engine = problemReplayEngine(problem, []);
  const state = engine.init(log.levelId, log.seed);
  try {
    let current = state;
    for (const action of log.actions) {
      current = engine.reduce(current, action);
    }
    return [...engine.objectivesMet(current)];
  } finally {
    engine.dispose?.(state);
  }
}
