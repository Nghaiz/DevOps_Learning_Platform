/**
 * Test cho `verify.ts`.
 *
 * ⚠ MỌI phép kiểm ở đây đi HAI CHIỀU. Một test chỉ khẳng định "lượt chơi thật ⇒
 * verified" không chứng minh được gì cả: một hàm `return {status:'da-xac-minh'}`
 * cũng qua. Chiều thứ hai — "lượt chơi bị sửa ⇒ KHÔNG verified" — mới là chiều
 * mang thông tin (`rules/green-that-proves-nothing.md`, §8.6).
 *
 * Engine ở đây là ĐỒ GIẢ, cố ý. Nó không phải reducer thật của lane B: mục tiêu
 * là kiểm CƠ CHẾ XÁC MINH, và cơ chế đó phải đúng với mọi engine tất định. Engine
 * giả còn dựng được một trạng thái không dựng nổi bằng reducer thật — engine
 * KHÔNG tất định — là ca quan trọng nhất trong file này.
 */

import { describe, expect, it } from 'vitest';
import type { RunLog } from './run-log.ts';
import type { RunResult } from './types.ts';
import {
  ALL_ACTION_KINDS,
  COMMAND_ACTION_KINDS,
  COMMAND_KINDS,
  checkDeterminism,
  isVerified,
  tallyLog,
  verifyLabel,
  verifyRun,
  type ReplayEngine,
  type VerifyResult,
  type VerifyStatus,
} from './verify.ts';

// ── Engine giả ──────────────────────────────────────────────────────────────

interface FakeState {
  readonly levelId: string;
  readonly seed: number;
  readonly applied: readonly string[];
  readonly deleted: readonly string[];
}

/**
 * Engine tất định: trạng thái chỉ phụ thuộc `levelId`, `seed`, và chuỗi action.
 * Không đồng hồ, không `Math.random`, không đọc gì ngoài tham số — đúng ràng
 * buộc §3.4 mà lane B phải đạt.
 *
 * Nó KHÔNG phân tích YAML: coi cả khối `yaml` là tên tài nguyên. Thứ đang kiểm
 * ở file này là CƠ CHẾ XÁC MINH, không phải bộ mô phỏng Kubernetes — một engine
 * giả càng đơn giản thì test càng nói đúng về cái nó định nói.
 *
 * Narrowing theo `kind` cho ra thẳng các field (`yaml`, `target`) — `GameAction`
 * là union phân biệt chứ không còn `payload` lỏng.
 */
const deterministicEngine: ReplayEngine<FakeState> = {
  init: (levelId, seed) => ({ levelId, seed, applied: [], deleted: [] }),
  reduce: (state, action) => {
    if (action.kind === 'apply') return { ...state, applied: [...state.applied, action.yaml] };
    if (action.kind === 'delete') {
      return { ...state, deleted: [...state.deleted, action.target.name] };
    }
    return state;
  },
  objectivesMet: (state) =>
    state.applied.filter((name) => !state.deleted.includes(name)).map((name) => `obj-${name}`),
  // Điểm phụ thuộc seed để phân biệt được hai lượt chơi khác seed.
  score: (state, tally) => state.applied.length * 100 - tally.hintsUsed * 10 + (state.seed % 7),
  project: (state) => ({ applied: [...state.applied].sort(), seed: state.seed }),
};

/**
 * Engine KHÔNG tất định — mô phỏng đúng lỗi mà bản upstream `rohitg00/k8sgames`
 * mắc phải: 15 lời gọi `Math.random()`, không RNG gieo hạt (báo cáo khảo sát
 * §6). Không dùng `Math.random()` ở đây vì test phải tất định; một bộ đếm ngoài
 * hàm cho ra cùng triệu chứng mà vẫn lặp lại được.
 */
function makeNondeterministicEngine(): ReplayEngine<FakeState> {
  let calls = 0;
  return {
    ...deterministicEngine,
    score: (state, tally) => {
      calls++;
      return deterministicEngine.score(state, tally) + calls;
    },
  };
}

const throwingEngine: ReplayEngine<FakeState> = {
  ...deterministicEngine,
  reduce: () => {
    throw new Error('level không tồn tại');
  },
};

// ── Dữ liệu ─────────────────────────────────────────────────────────────────

const LEVEL = 'k8s-01-pod-dau-tien';
const SEED = 424242;

/*
 * Dạng RỘNG (`RunLog`), không phải `K8sRunLog`. Lý do từng phải dùng kiểu hẹp —
 * fixture này cũng đóng vai nhật ký của một `K8sSession` giả, mà `getLog()` của
 * nó trả đúng `K8sRunLog` — đã đi theo nhóm test adapter sang
 * `k8s/replay-engine.test.ts` ở 18.A. Ở file này mọi chỗ nhận dạng rộng, và một
 * test của `core/` đi import kiểu từ `k8s/` chính là phụ thuộc mà 18.A vừa gỡ.
 */
const genuineLog: RunLog = {
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

/** Kết quả THẬT, tính bằng chính engine giả — không gõ tay con số nào. */
function genuineResult(): RunResult {
  const tally = tallyLog(genuineLog);
  let state = deterministicEngine.init(genuineLog.levelId, genuineLog.seed);
  for (const action of genuineLog.actions) state = deterministicEngine.reduce(state, action);
  return {
    gameId: 'k8s',
    levelId: LEVEL,
    seed: SEED,
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_060_000,
    objectivesMet: deterministicEngine.objectivesMet(state),
    objectivesTotal: 2,
    commandsUsed: tally.commandsUsed,
    hintsUsed: tally.hintsUsed,
    score: deterministicEngine.score(state, tally),
  };
}

function mismatchFor(result: VerifyResult, field: string) {
  return result.mismatches.find((m) => m.field === field);
}

const ALL_STATUSES: readonly VerifyStatus[] = [
  'da-xac-minh',
  'khong-khop',
  'engine-khong-tat-dinh',
  'log-hong',
  'phat-lai-loi',
];

// ── Chiều dương: lượt chơi thật ─────────────────────────────────────────────

describe('verifyRun — chiều dương', () => {
  it('lượt chơi thật ⇒ đã xác minh', () => {
    const result = verifyRun(genuineLog, genuineResult(), deterministicEngine);
    expect(result.status).toBe('da-xac-minh');
    expect(isVerified(result)).toBe(true);
    expect(result.mismatches).toEqual([]);
  });

  it('engine không có project() vẫn xác minh được', () => {
    // `project` là tuỳ chọn; thiếu nó thì phép so tất định thô hơn nhưng phải
    // vẫn chạy — nếu không, mọi engine chưa có ClusterView đều hỏng.
    const noProject: ReplayEngine<FakeState> = {
      init: deterministicEngine.init,
      reduce: deterministicEngine.reduce,
      objectivesMet: deterministicEngine.objectivesMet,
      score: deterministicEngine.score,
    };
    expect(verifyRun(genuineLog, genuineResult(), noProject).status).toBe('da-xac-minh');
  });

  it('nhật ký rỗng vẫn hợp lệ (người chơi bỏ cuộc ngay) — 0 điểm, 0 objective', () => {
    const emptyLog: RunLog = { gameId: 'k8s', levelId: LEVEL, seed: SEED, actions: [] };
    const tally = tallyLog(emptyLog);
    const state = deterministicEngine.init(LEVEL, SEED);
    const claimed: RunResult = {
      ...genuineResult(),
      objectivesMet: deterministicEngine.objectivesMet(state),
      commandsUsed: 0,
      hintsUsed: 0,
      score: deterministicEngine.score(state, tally),
    };
    expect(verifyRun(emptyLog, claimed, deterministicEngine).status).toBe('da-xac-minh');
  });
});

// ── Chiều âm: dữ liệu bị sửa ────────────────────────────────────────────────

describe('verifyRun — chiều âm (đây mới là chiều chứng minh được điều gì)', () => {
  it('sửa score trong localStorage ⇒ KHÔNG xác minh được', () => {
    const forged: RunResult = { ...genuineResult(), score: 1000 };
    const result = verifyRun(genuineLog, forged, deterministicEngine);

    expect(result.status).toBe('khong-khop');
    expect(isVerified(result)).toBe(false);
    const mismatch = mismatchFor(result, 'score');
    expect(mismatch).toBeDefined();
    expect(mismatch?.claimed).toBe('1000');
    expect(mismatch?.replayed).toBe(String(genuineResult().score));
  });

  it('sửa commandsUsed xuống 0 để ăn điểm "ít nước đi" ⇒ bị bắt', () => {
    const forged: RunResult = { ...genuineResult(), commandsUsed: 0 };
    const result = verifyRun(genuineLog, forged, deterministicEngine);
    expect(result.status).toBe('khong-khop');
    expect(mismatchFor(result, 'commandsUsed')?.replayed).toBe('3');
  });

  it('giấu số gợi ý đã dùng ⇒ bị bắt', () => {
    const forged: RunResult = { ...genuineResult(), hintsUsed: 0 };
    const result = verifyRun(genuineLog, forged, deterministicEngine);
    expect(result.status).toBe('khong-khop');
    expect(mismatchFor(result, 'hintsUsed')?.replayed).toBe('1');
  });

  it('khai thêm objective chưa đạt ⇒ bị bắt', () => {
    const truth = genuineResult();
    const forged: RunResult = {
      ...truth,
      objectivesMet: [...truth.objectivesMet, 'obj-khong-he-lam'],
    };
    const result = verifyRun(genuineLog, forged, deterministicEngine);
    expect(result.status).toBe('khong-khop');
    expect(mismatchFor(result, 'objectivesMet')).toBeDefined();
  });

  it('ghép nhật ký của level khác vào lời khai ⇒ bị bắt trước cả khi phát lại', () => {
    const otherLog: RunLog = { ...genuineLog, levelId: 'k8s-30-chaos' };
    const result = verifyRun(otherLog, genuineResult(), deterministicEngine);
    expect(result.status).toBe('khong-khop');
    expect(mismatchFor(result, 'levelId')).toBeDefined();
  });

  it('đổi seed để mượn nhật ký của lượt khác ⇒ bị bắt', () => {
    const result = verifyRun(
      { ...genuineLog, seed: SEED + 1 },
      genuineResult(),
      deterministicEngine,
    );
    expect(result.status).toBe('khong-khop');
    expect(mismatchFor(result, 'seed')).toBeDefined();
  });

  it('thứ tự objective KHÔNG bị coi là lệch — nó không mang thông tin', () => {
    const truth = genuineResult();
    const reordered: RunResult = { ...truth, objectivesMet: [...truth.objectivesMet].reverse() };
    expect(verifyRun(genuineLog, reordered, deterministicEngine).status).toBe('da-xac-minh');
  });
});

// ── Nhật ký hỏng ────────────────────────────────────────────────────────────

describe('verifyRun — nhật ký sai hình dạng', () => {
  it('tick lùi ⇒ log-hong, không phải khong-khop', () => {
    const badLog: RunLog = {
      gameId: 'k8s',
      levelId: LEVEL,
      seed: SEED,
      actions: [
        { gameId: 'k8s', tick: 5, kind: 'apply', yaml: 'web' },
        { gameId: 'k8s', tick: 2, kind: 'apply', yaml: 'db' },
      ],
    };
    const result = verifyRun(badLog, genuineResult(), deterministicEngine);
    expect(result.status).toBe('log-hong');
    expect(result.detail).toContain('lùi');
  });

  it('kind lạ ⇒ log-hong (dữ liệu từ localStorage không có kiểu lúc chạy)', () => {
    const badLog = {
      gameId: 'k8s',
      levelId: LEVEL,
      seed: SEED,
      actions: [{ tick: 0, kind: 'sudo-win', yaml: 'thang-luon' }],
    } as unknown as RunLog;
    expect(verifyRun(badLog, genuineResult(), deterministicEngine).status).toBe('log-hong');
  });

  it('seed không phải số nguyên ⇒ log-hong', () => {
    const badLog: RunLog = { ...genuineLog, seed: 1.5 };
    expect(verifyRun(badLog, genuineResult(), deterministicEngine).status).toBe('log-hong');
  });

  it('tick âm ⇒ log-hong', () => {
    const badLog: RunLog = {
      gameId: 'k8s',
      levelId: LEVEL,
      seed: SEED,
      actions: [{ gameId: 'k8s', tick: -1, kind: 'apply', yaml: 'web' }],
    };
    expect(verifyRun(badLog, genuineResult(), deterministicEngine).status).toBe('log-hong');
  });
});

// ── Lỗi của TA, không phải của người chơi ───────────────────────────────────

describe('phân biệt "người chơi sửa dữ liệu" với "engine của ta hỏng"', () => {
  it('engine không tất định ⇒ engine-khong-tat-dinh, KHÔNG phải khong-khop', () => {
    // Đây là ca quan trọng nhất file này. Nếu gộp hai nguyên nhân vào một
    // `verified: false` thì một reducer hỏng sẽ hiện ra dưới dạng "toàn bộ người
    // chơi đang gian lận" — kết luận ngược hẳn với sự thật, và là kết luận dẫn
    // tới hành động sai (đi điều tra người dùng thay vì đi sửa reducer).
    const result = verifyRun(genuineLog, genuineResult(), makeNondeterministicEngine());
    expect(result.status).toBe('engine-khong-tat-dinh');
    expect(result.status).not.toBe('khong-khop');
    expect(isVerified(result)).toBe(false);
    expect(result.detail).toContain('KHÔNG phải bằng chứng');
  });

  it('engine không tất định ⇒ ngay cả lời khai BỊ SỬA cũng không bị gọi là sửa', () => {
    // Khi engine hỏng thì ta KHÔNG CÓ CƠ SỞ để nói ai sửa gì. Trả về
    // `khong-khop` lúc này là một cáo buộc dựa trên một phép đo đã hỏng.
    const forged: RunResult = { ...genuineResult(), score: 999 };
    const result = verifyRun(genuineLog, forged, makeNondeterministicEngine());
    expect(result.status).toBe('engine-khong-tat-dinh');
  });

  it('reducer ném ⇒ phat-lai-loi, cũng không đổ cho người chơi', () => {
    const result = verifyRun(genuineLog, genuineResult(), throwingEngine);
    expect(result.status).toBe('phat-lai-loi');
    expect(result.detail).toContain('level không tồn tại');
  });

  it('verifyRun không bao giờ ném, kể cả trên dữ liệu rác', () => {
    const garbage = { gameId: 'k8s', levelId: LEVEL, seed: Number.NaN, actions: null } as unknown as RunLog;
    expect(() => verifyRun(garbage, genuineResult(), deterministicEngine)).not.toThrow();
  });
});

// ── Tất định (AC §8.6, gạch đầu dòng 2) ─────────────────────────────────────

describe('checkDeterminism — cùng seed + cùng actions ⇒ cùng kết quả, chạy 2 lần', () => {
  it('engine tất định ⇒ hai lần phát lại khớp, kể cả hình chiếu ClusterView', () => {
    const check = checkDeterminism(deterministicEngine, genuineLog);
    expect(check.deterministic).toBe(true);
  });

  it('engine không tất định ⇒ phép kiểm ĐỎ (đối chứng dương)', () => {
    // Không có ca này thì `checkDeterminism` có thể là `return true` và không ai
    // biết. Một phép kiểm chưa từng thấy đỏ thì chưa phải một phép kiểm.
    const check = checkDeterminism(makeNondeterministicEngine(), genuineLog);
    expect(check.deterministic).toBe(false);
    expect(check.detail).toContain('khác nhau');
  });

  it('seed khác ⇒ kết quả khác (chứng minh seed thật sự đi vào trạng thái)', () => {
    // Nếu seed không ảnh hưởng gì thì phép kiểm tất định xanh một cách vô nghĩa.
    let a = deterministicEngine.init(LEVEL, 1);
    let b = deterministicEngine.init(LEVEL, 2);
    for (const action of genuineLog.actions) {
      a = deterministicEngine.reduce(a, action);
      b = deterministicEngine.reduce(b, action);
    }
    const tally = tallyLog(genuineLog);
    expect(deterministicEngine.score(a, tally)).not.toBe(deterministicEngine.score(b, tally));
  });
});

// ── Đếm trên nhật ký ────────────────────────────────────────────────────────

describe('tallyLog', () => {
  it('đếm lệnh và gợi ý theo kind, bỏ qua wait', () => {
    const tally = tallyLog(genuineLog);
    expect(tally).toEqual({ commandsUsed: 3, hintsUsed: 1, lastTick: 9, actionCount: 5 });
  });

  it('nhật ký rỗng ⇒ toàn số 0, không ném', () => {
    expect(tallyLog({ gameId: 'k8s', levelId: LEVEL, seed: SEED, actions: [] })).toEqual({
      commandsUsed: 0,
      hintsUsed: 0,
      lastTick: 0,
      actionCount: 0,
    });
  });
});

// ── Nhãn hiển thị ───────────────────────────────────────────────────────────

describe('nhãn cho người dùng', () => {
  it('isVerified chỉ đúng với da-xac-minh, sai với mọi trạng thái còn lại', () => {
    for (const status of ALL_STATUSES) {
      const result: VerifyResult = { status, mismatches: [], detail: '' };
      expect(isVerified(result)).toBe(status === 'da-xac-minh');
    }
  });

  it('không nhãn nào buộc tội người dùng', () => {
    // Một bản lưu hỏng vì đổi version rơi vào cùng nhánh với một bản bị sửa tay.
    // Không phân biệt được thì không được kết tội (§8.3.3).
    for (const status of ALL_STATUSES) {
      const label = verifyLabel(status).toLowerCase();
      expect(label).not.toContain('gian lận');
      expect(label).not.toContain('cheat');
      expect(label).not.toContain('giả mạo');
    }
  });

  it('mọi trạng thái đều có nhãn không rỗng', () => {
    for (const status of ALL_STATUSES) expect(verifyLabel(status).length).toBeGreaterThan(0);
  });
});

// ── 19.J — hai danh sách `kind` phải khớp bảng vét cạn ──────────────────────

describe('danh sách action kind không được thiếu game nào', () => {
  /*
   * ⛔ Ô này tồn tại vì một lỗi CÂM đã sống thật: `'evaluate'` của game CI/CD
   * vắng khỏi `ACTION_KINDS` từ lúc `CicdGameAction` ra đời tới 19.J, và hậu quả
   * là `logShapeError` sẽ từ chối MỌI nhật ký CI/CD với lý do "kind lạ" — một
   * thông điệp đổ lỗi cho người nộp về một mảnh nền tảng còn thiếu.
   *
   * Không gì bắt được nó: `readonly GameActionKind[]` nhận một mảng THIẾU mà vẫn
   * đúng kiểu. Cổng thật là bảng `LA_LENH` (`Record<GameActionKind, boolean>`,
   * đỏ ở `tsc` khi thiếu khoá); hai ô dưới chỉ khẳng định hai danh sách kia đọc
   * đúng bảng đó thay vì trôi thành nguồn thứ hai.
   */
  it('`COMMAND_KINDS` khớp đúng phần "là lệnh" của bảng vét cạn', () => {
    expect([...COMMAND_KINDS].sort()).toEqual([...COMMAND_ACTION_KINDS].sort());
  });

  it('mọi kind của bảng vét cạn đều là kind HỢP LỆ với `logShapeError`', () => {
    /*
     * Đối chứng ĐỘNG, không phải một danh sách chép tay: với mỗi `kind` trong
     * bảng, dựng một nhật ký một action và khẳng định nó KHÔNG bị từ chối vì
     * "kind lạ". Một kind mới thêm vào bảng mà quên `ACTION_KINDS` sẽ đỏ ngay ở
     * đây, kèm đúng tên nó.
     */
    for (const kind of ALL_ACTION_KINDS) {
      const log = {
        gameId: 'k8s' as const,
        levelId: 'l1',
        seed: 1,
        actions: [{ gameId: 'k8s', tick: 0, kind }],
      } as unknown as RunLog;
      const ket = verifyRun(log, claimKindProbe(), deterministicEngine);
      expect(ket.detail ?? '', kind).not.toContain('kind lạ');
    }
  });
});

/**
 * Lời khai cho ô dò `kind` ở trên.
 *
 * Nội dung cố ý KHÔNG khớp phép phát lại — ô đó chỉ hỏi một câu: nhật ký có bị
 * từ chối vì "kind lạ" không. Mọi lý do trượt khác (`khong-khop`, điểm lệch) là
 * câu trả lời HỢP LỆ cho câu hỏi đó, nên một lời khai tối thiểu là đủ và trung
 * thực hơn một lời khai dựng công phu để trông như đã đạt.
 */
function claimKindProbe(): RunResult {
  return {
    gameId: 'k8s',
    levelId: 'l1',
    seed: 1,
    startedAt: 0,
    finishedAt: 1,
    objectivesMet: [],
    objectivesTotal: 0,
    commandsUsed: 0,
    hintsUsed: 0,
    score: 0,
  };
}
