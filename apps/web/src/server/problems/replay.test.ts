import { describe, expect, it } from 'vitest';
import {
  ALL_KINDS,
  isVerified,
  tallyLog,
  verifyRun,
  type GameAction,
  type Problem,
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

/**
 * Bài tối thiểu chạy được thật trên engine: một node, một namespace, mục tiêu là
 * dựng một pod. Dùng `resource-exists` + `pod-running` — hai vị từ mà `l01` dùng,
 * nên chúng chắc chắn có trong bảng `PREDICATES`.
 */
function makeProblem(overrides: Partial<Problem> = {}): Problem {
  return {
    code: 'K8S-0001',
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
    objectives: [
      {
        id: 'pod-ton-tai',
        label: 'Có một pod tên `web`',
        check: 'resource-exists',
        args: { kind: 'Pod', name: 'web', namespace: 'hoc-tap' },
        required: true,
      },
      {
        id: 'pod-chay',
        label: 'Pod `web` đang Running',
        check: 'pod-running',
        args: { namespace: 'hoc-tap', name: 'web' },
        required: false,
      },
    ],
    allowedResources: null,
    hints: [
      { id: 'goi-y-1', text: 'Dùng `kubectl apply`.', penaltyPoints: 50 },
      { id: 'goi-y-2', text: 'Image `nginx:1.27-alpine`.', penaltyPoints: 120 },
    ],
    parMoves: 1,
    state: 'published',
    authorId: null,
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

const APPLY_POD: GameAction = {
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

function makeLog(problem: Problem, actions: readonly GameAction[]): RunLog {
  return { levelId: problem.code, seed: 12345, actions };
}

/** Chạy phát lại một lần để lấy con số THẬT mà engine sinh ra cho nhật ký này. */
function replayedScore(problem: Problem, log: RunLog, revealedIds: readonly string[]): number {
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

function makeClaim(problem: Problem, log: RunLog, score: number, objectivesMet: readonly string[]): RunResult {
  const tally = tallyLog(log);
  return {
    gameId: 'k8s',
    levelId: problem.code,
    seed: log.seed,
    startedAt: 1_000,
    finishedAt: 61_000,
    objectivesMet,
    objectivesTotal: problem.objectives.length,
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
      { tick: 0, kind: 'hint', index: 0 },
      { tick: 1, kind: 'hint', index: 0 },
      APPLY_POD,
    ]);
    const openOnce = makeLog(problem, [{ tick: 0, kind: 'hint', index: 0 }, APPLY_POD]);
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
    const foreign: RunLog = { levelId: 'K8S-9999', seed: 1, actions: [] };
    const engine = problemReplayEngine(problem, []);
    const claim = makeClaim(problem, foreign, 0, []);
    expect(verifyRun(foreign, claim, engine).status).not.toBe('da-xac-minh');
  });
});

describe('isSolved đọc mục tiêu BẮT BUỘC', () => {
  it('đủ mục tiêu bắt buộc là đã giải, dù thiếu mục tiêu thưởng', () => {
    expect(isSolved(makeProblem(), ['pod-ton-tai'])).toBe(true);
  });

  it('thiếu mục tiêu bắt buộc thì chưa giải, dù có mục tiêu thưởng', () => {
    expect(isSolved(makeProblem(), ['pod-chay'])).toBe(false);
  });

  it('bài không có mục tiêu bắt buộc nào thì KHÔNG tự động là đã giải', () => {
    // "Mọi phần tử của tập rỗng đều thoả" là đúng về logic và sai về sản phẩm:
    // nó cho không điểm cho một bài dữ liệu đã hỏng.
    const problem = makeProblem();
    const noRequired = makeProblem({
      objectives: problem.objectives.map((objective) => ({ ...objective, required: false })),
    });
    expect(isSolved(noRequired, ['pod-ton-tai', 'pod-chay'])).toBe(false);
  });
});

describe('đọc gợi ý đã mở ra từ nhật ký', () => {
  it('lấy id theo index, bỏ qua index ngoài phạm vi', () => {
    const problem = makeProblem();
    const log = makeLog(problem, [
      { tick: 0, kind: 'hint', index: 1 },
      { tick: 1, kind: 'hint', index: 99 },
      APPLY_POD,
    ]);
    expect(hintIdsFromLog(problem, log)).toEqual(['goi-y-2']);
  });
});

function objectivesFrom(problem: Problem, log: RunLog): readonly string[] {
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
