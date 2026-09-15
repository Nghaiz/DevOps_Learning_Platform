/**
 * Test cho `sessionReplayEngine` — adapter phát lại của game K8s.
 *
 * Chuyển nguyên vẹn từ `core/verify.test.ts` ở 18.A, cùng lúc với chính hàm nó
 * gác. Không nới lỏng một phép kiểm nào: nhóm này gác cả chiều "engine của TA
 * hỏng" — chiều khó dựng nhất và là chiều duy nhất nói được điều gì
 * (`rules/green-that-proves-nothing.md`).
 *
 * Phần CƠ CHẾ xác minh (`verifyRun`, `checkDeterminism`, `tallyLog`, nhãn) ở lại
 * `core/verify.test.ts` và chạy trên engine giả thuần — nó phải đúng với mọi
 * game, nên nó không được biết K8s là gì.
 */

import { describe, expect, it } from 'vitest';
import type { RunLog } from '../core/run-log.ts';
import type { RunResult } from '../core/types.ts';
import { MAX_REPLAY_TICK, verifyRun, type VerifyResult } from '../core/verify.ts';
import type {
  ClusterView,
  CreateSessionOptions,
  K8sGameAction,
  K8sRunLog,
  K8sSession,
  Level,
  SessionStatus,
} from './contract.ts';
import { sessionReplayEngine } from './replay-engine.ts';
import { createSession } from './session.ts';

// ── Dữ liệu ─────────────────────────────────────────────────────────────────

const LEVEL = 'k8s-01-pod-dau-tien';
const SEED = 424242;

/*
 * `K8sRunLog`, không phải `RunLog` rộng: fixture này cũng đóng vai nhật ký của
 * một `K8sSession` giả ở cuối file (`getLog()` phải trả đúng `K8sRunLog`). Mọi
 * chỗ khác trong file nhận dạng rộng, và `K8sRunLog` gán được vào đó — mảng
 * `readonly` là hiệp biến, xem chú thích `RunLog<A>` ở `core/run-log.ts`.
 */
const genuineLog: K8sRunLog = {
  gameId: 'k8s',
  levelId: LEVEL,
  seed: SEED,
  actions: [
    { gameId: 'k8s', tick: 0, kind: 'apply', yaml: 'web' },
    { gameId: 'k8s', tick: 3, kind: 'wait', ticks: 2 },
    { gameId: 'k8s', tick: 5, kind: 'apply', yaml: 'db' },
    { gameId: 'k8s', tick: 8, kind: 'hint', index: 0 },
    { gameId: 'k8s', tick: 9, kind: 'kubectl', command: 'get pods' },
  ],
};

function mismatchFor(result: VerifyResult, field: string) {
  return result.mismatches.find((m) => m.field === field);
}

// ── Adapter sang K8sSession thật của lane B ─────────────────────────────────

/**
 * `K8sSession` giả — CÓ TRẠNG THÁI THAY ĐỔI TẠI CHỖ, khác hẳn engine thuần ở
 * `core/verify.test.ts`. Đó chính là lý do phải có nhóm test này: `verifyRun`
 * phát lại hai lần, và với một session mutable thì lần hai PHẢI chạy trên một
 * session mới hoàn toàn. Nếu adapter dùng lại session cũ thì lần hai sẽ nối
 * tiếp trạng thái lần một và mọi lượt chơi hợp lệ bị gắn cờ.
 */
const FAKE_LEVEL: Level = {
  id: LEVEL,
  chapter: 1,
  title: 'Pod đầu tiên',
  mission: 'Tạo một pod chạy được.',
  brief: 'Tạo một pod.',
  difficulty: 'basic',
  initialState: { nodes: [], namespaces: ['default'], resources: [] },
  allowedResources: ['Pod'],
  objectives: [{ id: 'obj-web', label: 'Pod web chạy', check: 'pod-dang-chay', required: true }],
  hints: ['Dùng kubectl apply.'],
  parMoves: 2,
  teaches: ['pod'],
  teaching: {
    primer: 'Pod là đơn vị chạy nhỏ nhất của Kubernetes.',
    cheatsheet: [{ command: 'kubectl apply -f pod.yaml', explain: 'Tạo tài nguyên từ manifest.' }],
    takeaways: ['Pod bọc container và là thứ scheduler xếp lên node.'],
  },
};

interface SessionSpy {
  readonly optionsSeen: CreateSessionOptions[];
  disposeCount: number;
  createCount: number;
}

/**
 * `viewDrift` mô phỏng một engine mà `ClusterView` đổi giữa hai lần phát lại
 * TRONG KHI `objectivesMet` và `score` vẫn y hệt — đúng hình dạng mà một phép so
 * "bốc vài field" sẽ bỏ lọt.
 */
function makeFakeCreateSession(spy: SessionSpy, viewDrift = false) {
  return (options: CreateSessionOptions): K8sSession => {
    spy.optionsSeen.push(options);
    const runIndex = spy.createCount++;
    const applied: string[] = [];
    let hints = 0;
    let moves = 0;
    let tick = 0;

    const status = (): SessionStatus => ({
      phase: applied.length > 0 ? 'won' : 'playing',
      objectivesMet: applied.map((name) => `obj-${name}`),
      hintsRevealed: hints,
      movesUsed: moves,
    });

    return {
      getView: (): ClusterView => ({
        // Với `viewDrift`, `tick` mang số thứ tự phiên — nó KHÔNG lọt vào
        // objectivesMet hay score, nên chỉ phép so trên hình chiếu đầy đủ mới
        // thấy. Đây là đối chứng cho lời khuyên "so ClusterView, đừng bốc field".
        tick: viewDrift ? tick + runIndex * 1000 : tick,
        nodes: [],
        objects: applied.map((name) => ({
          uid: `uid-${name}`,
          kind: 'Pod' as const,
          name,
          namespace: 'default',
          /* Bốn trường dưới là vật liệu tối thiểu để `ObjectView` hợp lệ, cố ý
           * để rỗng: phép so ở đây là so TOÀN BỘ hình chiếu, nên nội dung của
           * chúng không cần giống thật — chỉ cần TẤT ĐỊNH giữa hai lần phát lại,
           * và hằng số thì tất định tuyệt đối. */
          labels: {},
          requests: null,
          limits: null,
          createdTick: 0,
          phase: 'Running' as const,
          nodeName: 'node-1',
          ownerUid: null,
          statusToken: 'success' as const,
          ariaLabel: `Pod ${name} đang chạy`,
        })),
        edges: [],
        events: [],
        incidents: [],
      }),
      getStatus: status,
      subscribe: () => () => {},
      dispatch: (action) => {
        tick = action.tick;
        if (action.kind === 'apply') {
          applied.push(action.yaml);
          moves++;
        } else if (action.kind === 'hint') hints++;
        else if (action.kind !== 'wait') moves++;
      },
      getLog: () => genuineLog,
      /* Nhịp phát không đụng tới phát lại: xác minh chạy nhanh hết mức, không
       * theo đồng hồ. Fixture để rỗng là ĐÚNG, không phải chỗ chưa làm. */
      setSpeed: () => {},
      /* Cùng lập luận với `setSpeed`: tạm dừng là chuyện của đồng hồ treo tường,
       * còn phát lại chạy nhanh hết mức và không có đồng hồ nào để dừng. */
      pause: () => {},
      resume: () => {},
      dispose: () => {
        spy.disposeCount++;
      },
    };
  };
}

function newSpy(): SessionSpy {
  return { optionsSeen: [], disposeCount: 0, createCount: 0 };
}

const scoreFromStatus = (status: SessionStatus, tally: { hintsUsed: number }) =>
  status.objectivesMet.length * 100 - tally.hintsUsed * 10;

/**
 * Lời khai ĐÚNG cho phiên giả.
 *
 * Bản gốc ở `core/verify.test.ts` lấy phần chung từ `genuineResult()`, hàm tính
 * bằng engine thuần giả — thứ ở lại file kia. Ở đây dựng thẳng, và mọi con số
 * giữ NGUYÊN giá trị của bản gốc: `score` vẫn là hằng gõ tay `2 * 100 - 1 * 10`
 * (một `score` tính lại bằng chính `scoreFromStatus` sẽ khớp kể cả khi hàm đó
 * sai, tức là test chiều dương thành tautology), còn `objectivesMet` vẫn TÍNH từ
 * `genuineLog` đúng như bản gốc tính nó từ engine.
 */
function sessionResult(): RunResult {
  return {
    gameId: 'k8s',
    levelId: LEVEL,
    seed: SEED,
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_060_000,
    // Engine giả dạng session đếm objective theo yaml đã apply, giống engine
    // thuần ở `core/verify.test.ts`; điểm thì theo `scoreFromStatus`.
    objectivesMet: genuineLog.actions.flatMap((a) => (a.kind === 'apply' ? [`obj-${a.yaml}`] : [])),
    objectivesTotal: 2,
    score: 2 * 100 - 1 * 10,
    commandsUsed: 3,
    hintsUsed: 1,
  };
}

describe('sessionReplayEngine — adapter sang CreateSession thật', () => {
  it('luôn tạo phiên với autoTick: false — phát lại không được phụ thuộc đồng hồ', () => {
    const spy = newSpy();
    const engine = sessionReplayEngine(makeFakeCreateSession(spy), FAKE_LEVEL, scoreFromStatus);
    verifyRun(genuineLog, sessionResult(), engine);

    expect(spy.optionsSeen.length).toBeGreaterThan(0);
    for (const options of spy.optionsSeen) {
      expect(options.autoTick).toBe(false);
      expect(options.seed).toBe(SEED);
      expect(options.level.id).toBe(LEVEL);
    }
  });

  it('lượt chơi thật qua session thật ⇒ đã xác minh (chiều dương)', () => {
    const spy = newSpy();
    const engine = sessionReplayEngine(makeFakeCreateSession(spy), FAKE_LEVEL, scoreFromStatus);
    expect(verifyRun(genuineLog, sessionResult(), engine).status).toBe('da-xac-minh');
  });

  it('sửa score ⇒ không xác minh được (chiều âm)', () => {
    const spy = newSpy();
    const engine = sessionReplayEngine(makeFakeCreateSession(spy), FAKE_LEVEL, scoreFromStatus);
    const result = verifyRun(genuineLog, { ...sessionResult(), score: 1000 }, engine);
    expect(result.status).toBe('khong-khop');
    expect(mismatchFor(result, 'score')?.claimed).toBe('1000');
  });

  it('mỗi lần phát lại dùng một phiên MỚI, và phiên nào cũng được đóng', () => {
    // Session là mutable. Dùng lại phiên cũ cho lần phát lại thứ hai thì trạng
    // thái nối tiếp và kết quả lệch — mọi lượt chơi hợp lệ bị gắn cờ oan.
    const spy = newSpy();
    const engine = sessionReplayEngine(makeFakeCreateSession(spy), FAKE_LEVEL, scoreFromStatus);
    verifyRun(genuineLog, sessionResult(), engine);
    expect(spy.createCount).toBe(2);
    expect(spy.disposeCount).toBe(2);
  });

  it('ClusterView lệch giữa hai lần ⇒ engine-khong-tat-dinh, dù điểm và objective y hệt', () => {
    // Đối chứng cho "so hình chiếu đầy đủ, đừng bốc vài field": ở đây `score` và
    // `objectivesMet` KHỚP hoàn toàn giữa hai lần phát lại; chỉ `ClusterView.tick`
    // lệch. Một phép so bốc tay field sẽ báo đã-xác-minh và bỏ lọt một engine hỏng.
    const spy = newSpy();
    const engine = sessionReplayEngine(
      makeFakeCreateSession(spy, true),
      FAKE_LEVEL,
      scoreFromStatus,
    );
    expect(verifyRun(genuineLog, sessionResult(), engine).status).toBe('engine-khong-tat-dinh');
  });

  it('phát lại nhật ký của level khác ⇒ phat-lai-loi, không đổ cho người chơi', () => {
    const spy = newSpy();
    const engine = sessionReplayEngine(makeFakeCreateSession(spy), FAKE_LEVEL, scoreFromStatus);
    const otherLevelLog: RunLog = { ...genuineLog, levelId: 'k8s-99-khac' };
    const claimed: RunResult = { ...sessionResult(), levelId: 'k8s-99-khac' };
    const result = verifyRun(otherLevelLog, claimed, engine);
    expect(result.status).toBe('phat-lai-loi');
    expect(result.detail).toContain('k8s-99-khac');
  });
});

// ── C2: phát lại phải TUA ĐỒNG HỒ ───────────────────────────────────────────

/**
 * Ô gác cho `phase-18-exec.md` §5.3 — *"phép phát lại K8s không bao giờ tua
 * đồng hồ"*.
 *
 * ⚠ Nhóm này chạy trên `createSession` **THẬT**, không phải
 * `makeFakeCreateSession` của các nhóm trên. Đó là cả điểm của nó: C2 nằm trong
 * `session.ts:applyAction`, tức đúng phần mà mọi session giả THAY THẾ. Một ô
 * dựng trên session giả cấu trúc **không thể** bác bỏ lời tuyên bố nó đang gác
 * — `rules/green-that-proves-nothing.md`.
 *
 * ⚠ Kỳ vọng viết TAY (`toContain('deploy-san-sang')`), KHÔNG tính bằng chính
 * phép phát lại. `apps/web/src/server/problems/replay.test.ts` mắc lỗi ngược
 * lại — nó lấy kỳ vọng từ `objectivesFrom(...)`, tức so phép phát lại với chính
 * nó, nên nó xanh y nguyên suốt thời gian C2 sống.
 */
const CLOCK_LEVEL: Level = {
  id: 'k8s-test-dong-ho',
  chapter: 1,
  title: 'Deployment lên đủ replica',
  mission: 'Tạo một Deployment và đợi nó sẵn sàng.',
  brief: '',
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['hoc-tap'],
    resources: [],
  },
  allowedResources: ['Deployment', 'Pod'],
  objectives: [
    {
      id: 'deploy-san-sang',
      label: '`web` có đủ 2 replica sẵn sàng',
      // Cùng `check` + khuôn `args` với bài seed THẬT `k8s-0001`, không phải một
      // vị từ bịa ra cho test. Tên bịa vẫn làm ô xanh khi hai bản dựng chỉ CHÉP
      // chuỗi đó qua nhau (đã cắn một lần, xem `c4fa97a`).
      check: 'deployment-ready',
      args: { name: 'web', namespace: 'hoc-tap', replicas: 2 },
      required: true,
    },
  ],
  hints: [],
  parMoves: 1,
  teaches: [],
  teaching: { primer: 'Fixture của test, không phải nội dung dạy học.', cheatsheet: [], takeaways: [] },
};

const CLOCK_DEPLOY_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: hoc-tap
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
`;

/** Chạy trọn một nhật ký qua engine thật, trả về objective đạt được. */
function objectivesAfterReplay(actions: readonly K8sGameAction[]): readonly string[] {
  const engine = sessionReplayEngine(createSession, CLOCK_LEVEL, () => 0);
  const session = engine.init(CLOCK_LEVEL.id, 7);
  try {
    let current = session;
    for (const action of actions) {
      current = engine.reduce(current, action);
    }
    return [...engine.objectivesMet(current)];
  } finally {
    engine.dispose?.(session);
  }
}

describe('C2 — phát lại tua đồng hồ tới tick đã ghi trong nhật ký', () => {
  it('lời giải ĐÚNG cho mục tiêu `deployment-ready` ra objective ĐÃ ĐẠT', () => {
    /*
     * Hình dạng CHƠI THẬT, và đây là chỗ C2 cắn: người chơi `apply` ở tick 0,
     * ngồi nhìn cụm khoảng 30 giây, rồi gõ một lệnh kiểm tra. Khoảng 60 tick ở
     * giữa tới từ ĐỒNG HỒ (`autoTick` của phiên thật), KHÔNG từ một action
     * `wait` — và `wait` là đường DUY NHẤT còn tua được khi C2 chưa vá, nên một
     * fixture dùng `wait` sẽ xanh giả và không gác gì.
     */
    const met = objectivesAfterReplay([
      { gameId: 'k8s', tick: 0, kind: 'apply', yaml: CLOCK_DEPLOY_YAML },
      { gameId: 'k8s', tick: 60, kind: 'kubectl', command: 'get pods' },
    ]);
    expect(met).toContain('deploy-san-sang');
  });

  it('đối chứng — nhật ký DỪNG ở tick 0 thì objective CHƯA đạt', () => {
    /*
     * Nửa âm, và nó không thừa: thiếu nó thì một `deployment-ready` trả `true`
     * vô điều kiện cũng qua được ô trên, và ta sẽ tin là đồng hồ đã tua trong
     * khi vị từ chỉ đang gật bừa. Pod cần vài tick để lên `Running`, nên ở tick
     * 0 nó PHẢI chưa đạt.
     */
    const met = objectivesAfterReplay([
      { gameId: 'k8s', tick: 0, kind: 'apply', yaml: CLOCK_DEPLOY_YAML },
    ]);
    expect(met).not.toContain('deploy-san-sang');
  });
});

describe('trần phát lại — nhật ký bịa ra không đốt được CPU', () => {
  it('tick vượt trần ⇒ NÉM, và câu báo nói ra con số', () => {
    expect(() =>
      objectivesAfterReplay([
        { gameId: 'k8s', tick: MAX_REPLAY_TICK + 1, kind: 'kubectl', command: 'get pods' },
      ]),
    ).toThrow(/vượt trần phát lại/);
  });

  it('`wait.ticks` cũng bị chặn — cửa thứ hai, và nó mở TRƯỚC bản vá C2', () => {
    /*
     * Cửa này không đi qua `action.tick`: `reducer.apply` cộng thẳng
     * `action.ticks` vào mô phỏng. Một trần chỉ đọc `action.tick` sẽ xanh ở đây
     * và không chặn gì — đo 2026-09-15: client gửi `ticks: 50000` tua đúng
     * 50.000 tick kể cả khi phép ghi đè tick còn nguyên.
     */
    expect(() =>
      objectivesAfterReplay([
        { gameId: 'k8s', tick: 0, kind: 'wait', ticks: MAX_REPLAY_TICK + 1 },
      ]),
    ).toThrow(/vượt trần phát lại/);
  });

  it('nhật ký vượt trần đọc ra là `phat-lai-loi`, KHÔNG phải cáo buộc gian lận', () => {
    /*
     * Phân loại quan trọng ngang bản thân cổng. `khong-khop` nói *"số của anh
     * không khớp số của tôi"* — một câu về NGƯỜI NỘP. Một nhật ký vượt trần là
     * dữ liệu hỏng hoặc một cuộc tấn công, và cả hai đều thuộc ô "lỗi của ta
     * hoặc của dữ liệu".
     */
    const engine = sessionReplayEngine(createSession, CLOCK_LEVEL, () => 0);
    const overLog: RunLog = {
      gameId: 'k8s',
      levelId: CLOCK_LEVEL.id,
      seed: 7,
      actions: [{ gameId: 'k8s', tick: MAX_REPLAY_TICK + 1, kind: 'kubectl', command: 'get pods' }],
    };
    const claimed: RunResult = {
      ...sessionResult(),
      levelId: CLOCK_LEVEL.id,
      seed: 7,
    };
    expect(verifyRun(overLog, claimed, engine).status).toBe('phat-lai-loi');
  });

  it('đối chứng — phiên CHƠI THẬT không bị trần chạm tới', () => {
    /*
     * Nửa dương của cổng, và nó gác một hồi quy có thật chứ không phải giả
     * định: gác nhầm ở phiên chơi thật sẽ làm vỡ game của người để tab mở lâu,
     * và triệu chứng (game ném sau nhiều giờ) gần như không ai tái hiện nổi.
     *
     * `honorActionTick` mặc định `false`, nên tick bên gọi gửi bị đóng dấu lại
     * và con số khổng lồ kia không bao giờ tới `advance()`.
     */
    const live = createSession({ level: CLOCK_LEVEL, seed: 7, autoTick: false });
    try {
      expect(() =>
        live.dispatch({ gameId: 'k8s', tick: MAX_REPLAY_TICK * 5, kind: 'kubectl', command: 'get pods' }),
      ).not.toThrow();
      expect(live.getState().tick).toBe(0);
    } finally {
      live.dispose();
    }
  });
});
