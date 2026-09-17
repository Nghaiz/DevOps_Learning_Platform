import { describe, expect, it } from 'vitest';
import {
  CICD_UNSEEDED_REPLAY_SEED,
  PROBLEM_PLUGINS,
  isVerified,
  scoreProblemRun,
  type GameId,
  type RunLog,
  type RunResult,
} from '@devops-platform/games';

import type { StoredProblem } from './dto';
import { UnsupportedReplayGameError, verifyProblemRun } from './replay';

/**
 * Adapter phát lại của game CI/CD — 19.J.
 *
 * ## ⛔ Ô ĐẦU FILE LÀ CỔNG MÀ CHÚ THÍCH `verifyProblemRun` ĐÃ HỨA, VÀ CHƯA CÓ
 *
 * `replay.ts` viết rằng *"`verify-game-split.test.ts` — ô đó khẳng định mọi
 * `GameId` có plugin chấm thì cũng phải có adapter phát lại, nên game thứ ba cắm
 * plugin vào mà quên chỗ này sẽ ĐỎ chứ không im lặng"*.
 *
 * File đó KHÔNG TỒN TẠI (kiểm 2026-09-17). Thứ tồn tại là một ô trong
 * `git-replay.test.ts` ném trên `gameId: 'pipeline'` — một game KHÔNG có plugin
 * chấm, nên nó chỉ đo rằng nhánh `default` còn sống. Nó không bao giờ đỏ vì một
 * game có plugin mà thiếu adapter, tức đúng cái nó được viện dẫn để gác.
 *
 * Hậu quả đo được: `cicd` có plugin chấm từ 19.H, và `verifyProblemRun` không có
 * nhánh cho nó cho tới 19.J — mọi lượt nộp bài CI/CD sẽ ném
 * `UnsupportedReplayGameError` → 500, và không ô nào đỏ trong suốt quãng đó.
 *
 * Ô dưới đây suy từ `PROBLEM_PLUGINS` chứ không chép tay danh sách game, nên
 * game thứ tư cắm plugin vào mà quên adapter sẽ đỏ kèm đúng tên nó.
 */

const CD_KHOI = {
  release: {
    scenarios: [
      {
        instances: 100,
        requestsPerSecond: 10_000,
        baselineErrorRate: 0.01,
        candidateErrorRate: 0.15,
        replaceSeconds: 60,
        switchSeconds: 3,
        routeSeconds: 12,
        alertSeconds: 30,
        migration: 'none',
        fixForwardSeconds: 300,
      },
    ],
    evaluation: { baseSeed: 200_801, passes: 20 },
  },
  editable: ['release.onBadRelease'],
  initial: {
    release: {
      strategy: 'canary',
      onBadRelease: 'roll-forward',
      canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
    },
  },
};

/** Đề CI/CD lưu trong DB, dựng từ chính plugin để không chép hình dạng bộ ba. */
function baiCicd(overrides: Partial<StoredProblem> = {}): StoredProblem {
  const spec = PROBLEM_PLUGINS['cicd']?.initialSpec() as Record<string, unknown>;
  return {
    id: 'p1',
    code: 'CICD-0001',
    gameId: 'cicd',
    slug: 'duong-ong',
    title: 'Đường ống đầu tiên',
    statement: 'Sửa đường ống.',
    difficulty: 'easy',
    state: 'published',
    topics: [],
    tags: [],
    timeLimitSec: null,
    seedable: false,
    initialState: spec,
    allowedResources: null,
    testcases: [
      { id: 'co-clone', label: 'Có job clone', check: 'stageExists', args: { stage: 'clone' }, visible: true },
    ],
    hints: [],
    parMoves: null,
    authorId: 'a1',
    ...overrides,
  } as unknown as StoredProblem;
}

function nhatKy(source: string): RunLog {
  return {
    gameId: 'cicd',
    levelId: 'CICD-0001',
    seed: CICD_UNSEEDED_REPLAY_SEED,
    actions: [
      { gameId: 'cicd', tick: 0, kind: 'evaluate', source, overrides: {}, cd: null },
    ],
  } as unknown as RunLog;
}

/**
 * Lời khai khớp một nhật ký có `soLenh` hành động `evaluate`.
 *
 * ⚠ `commandsUsed` phải khớp `tallyLog` phía máy chủ ĐÚNG TỪNG SỐ, và đây là
 * chỗ ô này suýt nói dối: bản đầu ghim cứng `1` rồi phát lại một nhật ký RỖNG,
 * nên `verifyRun` trả `khong-khop` — đúng, nhưng vì một lý do không liên quan
 * tới thứ đang đo. Tham số hoá là cách giữ ô đo đúng câu hỏi của nó.
 */
function loiKhai(objectivesMet: readonly string[], total: number, soLenh = 1): RunResult {
  return {
    gameId: 'cicd',
    levelId: 'CICD-0001',
    seed: CICD_UNSEEDED_REPLAY_SEED,
    startedAt: 0,
    finishedAt: 1000,
    objectivesMet,
    objectivesTotal: total,
    commandsUsed: soLenh,
    hintsUsed: 0,
    score: scoreProblemRun({
      objectivesMet: new Set(objectivesMet).size,
      objectivesTotal: total,
      movesUsed: soLenh,
      parMoves: null,
      hints: [],
      revealedHintIds: [],
    }),
  };
}

describe('mọi game có plugin chấm đều phải có adapter phát lại', () => {
  /*
   * Suy từ DỮ LIỆU (`PROBLEM_PLUGINS`), không chép tay. Một danh sách gõ tay ở
   * đây sẽ đứng im đúng vào ngày game thứ tư được thêm, và ô này sẽ xanh trong
   * khi chính thứ nó gác đã hỏng.
   */
  const coPlugin = Object.keys(PROBLEM_PLUGINS) as GameId[];

  it('có ít nhất ba game trong bảng plugin — nếu không, ô dưới không đo gì', () => {
    /*
     * ĐỐI CHỨNG cho chính vòng lặp bên dưới. `Object.keys({})` cho mảng rỗng, và
     * một `for` trên mảng rỗng là một ô XANH tuyệt đối — đúng hình dạng "phép đo
     * trên một tập rỗng" mà `rules/green-that-proves-nothing.md` gọi tên.
     */
    expect(coPlugin.length).toBeGreaterThanOrEqual(3);
    expect(coPlugin).toContain('cicd');
  });

  for (const gameId of coPlugin) {
    it(`"${gameId}" không ném \`UnsupportedReplayGameError\``, () => {
      /*
       * Đề dựng với đúng `gameId` đang xét; nhật ký và lời khai cố ý tối thiểu.
       * Ô này KHÔNG hỏi lượt nộp có hợp lệ không — mọi kết cục xác minh đều là
       * câu trả lời đúng. Nó hỏi đúng một câu: có adapter cho game này chưa.
       *
       * Nên mọi lỗi khác được nuốt, và CHỈ `UnsupportedReplayGameError` làm đỏ.
       */
      try {
        verifyProblemRun(baiCicd({ gameId }), nhatKy('name: x'), loiKhai([], 1), []);
      } catch (error) {
        expect(error, `game "${gameId}" chưa có adapter phát lại`).not.toBeInstanceOf(
          UnsupportedReplayGameError,
        );
      }
    });
  }
});

describe('phát lại một lượt nộp CI/CD', () => {
  /*
   * Bắt được: `'evaluate'` rơi khỏi `ACTION_KINDS` (`core/verify.ts`). Khi đó
   * `logShapeError` từ chối nhật ký với "kind lạ" và `verifyRun` trả `log-hong`
   * — một thông điệp đổ lỗi cho nhật ký của người nộp về một mảnh nền tảng còn
   * thiếu. Đúng trạng thái trước 19.J.
   */
  it('nhật ký một `evaluate` KHÔNG bị coi là "kind lạ"', () => {
    const ket = verifyProblemRun(baiCicd(), nhatKy('name: x'), loiKhai([], 1), []);
    expect(ket.status).not.toBe('log-hong');
    expect(ket.detail ?? '').not.toContain('kind lạ');
  });

  /*
   * Đường ĐẦY ĐỦ: nhật ký rỗng-YAML chấm `initialState.workflow`, mà bộ ba mặc
   * định của plugin CÓ job `clone` — nên testcase `stageExists{clone}` qua, và
   * một lời khai trung thực phải được xác minh.
   */
  it('lời khai TRUNG THỰC được xác minh', () => {
    const bai = baiCicd();
    const log = { ...nhatKy(''), actions: [] } as unknown as RunLog;
    const ket = verifyProblemRun(bai, log, loiKhai(['co-clone'], 1, 0), []);
    expect(isVerified(ket), `${ket.status}: ${ket.detail ?? ''}`).toBe(true);
  });

  /*
   * Và chiều NGƯỢC LẠI, vì một hàm luôn trả `da-xac-minh` cũng làm ô trên xanh.
   * Khai đã qua một testcase mà phát lại nói chưa ⇒ phải KHÔNG xác minh.
   */
  it('lời khai THỔI PHỒNG bị từ chối', () => {
    const bai = baiCicd({
      testcases: [
        { id: 'co-lint', label: 'Có job lint', check: 'stageExists', args: { stage: 'lint' }, visible: true },
      ],
    } as unknown as Partial<StoredProblem>);
    const log = { ...nhatKy(''), actions: [] } as unknown as RunLog;
    const ket = verifyProblemRun(bai, log, loiKhai(['co-lint'], 1, 0), []);
    expect(isVerified(ket)).toBe(false);
  });

  /*
   * Nhật ký mang seed khác ⇒ `phat-lai-loi`, không phải một verdict âm thầm.
   * Bài CI/CD không sinh đề theo seed, nên một số khác nghĩa là client đang khai
   * một lượt chơi khác lượt nó vừa chơi.
   */
  it('seed lạ ⇒ phát lại lỗi, không chấm bừa', () => {
    const log = { ...nhatKy('name: x'), seed: 999 } as unknown as RunLog;
    const ket = verifyProblemRun(baiCicd(), log, loiKhai([], 1), []);
    expect(isVerified(ket)).toBe(false);
  });

  /*
   * Đề CÓ khối CD phát lại được, và phát lại HAI LẦN ra cùng kết quả —
   * `verifyRun` tự làm phép so đó và trả `engine-khong-tat-dinh` nếu lệch. Bắt
   * được: một bộ mô phỏng CD rò rỉ trạng thái giữa hai lượt phát lại.
   */
  it('đề có chương CD phát lại tất định', () => {
    const bai = baiCicd({
      initialState: {
        ...(PROBLEM_PLUGINS['cicd']?.initialSpec() as Record<string, unknown>),
        cd: CD_KHOI,
      },
    } as unknown as Partial<StoredProblem>);
    const log = { ...nhatKy(''), actions: [] } as unknown as RunLog;
    const ket = verifyProblemRun(bai, log, loiKhai(['co-clone'], 1, 0), []);
    expect(ket.status).not.toBe('engine-khong-tat-dinh');
  });
});
