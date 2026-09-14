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
import { verifyRun, type VerifyResult } from '../core/verify.ts';
import type {
  ClusterView,
  CreateSessionOptions,
  K8sRunLog,
  K8sSession,
  Level,
  SessionStatus,
} from './contract.ts';
import { sessionReplayEngine } from './replay-engine.ts';

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
