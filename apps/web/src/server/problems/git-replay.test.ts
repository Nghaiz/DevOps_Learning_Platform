import { describe, expect, it } from 'vitest';
import { gradeProblemRun, type RunLog, type RunResult } from '@devops-platform/games';
import type { StoredProblem } from './dto';
import { problemAsGitLevel, verifyProblemRun, UnsupportedReplayGameError } from './replay';
import { submitProblem } from './submit';

/**
 * §18.C cho GAME THỨ HAI — ô gác mà plan tự nói là dễ nói dối.
 *
 * `phase-18.md` §18.C viết thẳng lời cảnh báo:
 *
 * > ⚠ Ô nghiệm thu này dễ nói dối. "Server chấm lại" mà server dùng chung một
 * > tiến trình với client thì không chứng minh gì. Test phải chạy engine ở **env
 * > node** với đầu vào là JSON thô, không phải gọi hàm trong cùng bundle.
 *
 * Hai vế đó được thi hành ở đây như sau, và chỗ thứ hai là chỗ phải đọc kỹ:
 *
 * 1. **env node.** `apps/web/vitest.config.ts` cố ý KHÔNG đặt `environment`,
 *    nên mặc định là `node`; file nào cần DOM phải tự khai docblock
 *    `@vitest-environment jsdom`. File này không khai, nên nó chạy ở node —
 *    cùng runtime mà máy chủ Next chạy, khác runtime mà người chơi chạy.
 *
 * 2. **Đầu vào là JSON thô.** Mọi dữ liệu dưới đây là một CHUỖI, và nó đi qua
 *    `JSON.parse` trước khi chạm bất kỳ hàm nào của `packages/games`. Đó không
 *    phải trang trí: một fixture viết bằng object literal TypeScript có thể chở
 *    `undefined`, một `Map`, một tham chiếu dùng chung với chỗ khác — ba thứ
 *    không sống sót qua dây. Ép qua `JSON.parse` là cách rẻ nhất để khẳng định
 *    máy chủ dựng lại thế giới từ DỮ LIỆU chứ không mượn một object client đã
 *    dựng sẵn.
 *
 * ⚠ Ô này KHÔNG cần Postgres và vì thế nó LUÔN chạy. Đó là chủ ý: đường đi qua
 * `submitProblem` cần DB, và một suite xanh nhờ skip trông y hệt một suite xanh
 * thật. Thứ nó không nói được là hai cột ghi xuống DB — phần đó thuộc
 * `submission-grade.integration.test.ts`.
 *
 * ── Vế "đi qua HTTP thật" — ĐÃ MỞ 2026-09-15 ──
 *
 * Khối cũ ở đây ghi rằng `problems.submit` khai `runLog.gameId: z.literal('k8s')`
 * nên một lượt nộp Git bị Zod từ chối trước khi `submitProblem` chạy. Lời khai đó
 * ĐÚNG lúc viết và đã HẾT ĐÚNG: schema nay là `z.enum(GAME_IDS)` và
 * `actions[].gameId` thừa kế từ gốc (`bc18b81`).
 *
 * Ghi lại thay vì xoá đè, vì một dòng "chưa làm" còn lại trên một việc đã làm sẽ
 * khiến người sau đi làm lần thứ hai — đúng hình dạng
 * `rules/debt-lists-quote-stale-docs.md`, thứ phase này đã dính nhiều lần.
 *
 * Ô dưới đây vẫn gác đúng phần máy chủ tự chấm; vế đi qua dây thuộc
 * `submission-grade.integration.test.ts`.
 */

// ── Dữ liệu, dưới dạng CHUỖI JSON ───────────────────────────────────────────

const CODE = 'GIT-9001';

/**
 * Thế giới đầu: một commit gốc trên `main`. Đúng `initialSpec()` của
 * `GIT_PROBLEM_PLUGIN` — thế giới nhỏ nhất `buildWorld` dựng được.
 */
const PROBLEM_JSON = `{
  "code": "${CODE}",
  "gameId": "git",
  "slug": "tao-nhanh-feature",
  "title": "Tao nhanh feature",
  "statement": "Tao mot nhanh ten feature tro vao commit hien tai.",
  "difficulty": "easy",
  "topics": ["branching"],
  "tags": [],
  "timeLimitSec": null,
  "initialState": {
    "commits": [
      { "id": "c1", "message": "khoi tao du an", "changes": { "README.md": "Du an mau" } }
    ],
    "branches": { "main": "c1" },
    "head": "main"
  },
  "testcases": [
    { "id": "t1", "label": "Co nhanh feature", "check": "refExists", "args": { "ref": "feature" }, "visible": true },
    { "id": "t2", "label": "Co nhanh hotfix", "check": "refExists", "args": { "ref": "hotfix" }, "visible": true }
  ],
  "allowedResources": null,
  "hints": [],
  "parMoves": null,
  "seedable": false,
  "state": "published",
  "authorId": null,
  "createdAt": "2026-09-15T00:00:00.000Z",
  "updatedAt": "2026-09-15T00:00:00.000Z"
}`;

/**
 * Seed = `1`.
 *
 * ⛔ KHÔNG phải một con số tuỳ ý, và cũng không phải một hằng tra ở lúc chấm.
 * `GIT_UNSEEDED_REPLAY_SEED = 1` là số CLIENT nạp vào `createGitSession` khi mở
 * một bài Git không seedable, rồi ghi vào `Submission.seed`; máy chủ đọc lại
 * chính số đó từ nhật ký. Khối chú thích của hằng ấy ghi lại vì sao: đã có lúc
 * hai plugin điền hai hằng khác nhau (`0` và `1`) ở lúc chấm, và mọi lượt nộp
 * HỢP LỆ đều bị từ chối vì máy chủ phát lại trên một thế giới khác.
 */
const SEED = 1;

/** Nhật ký GIẢI ĐÚNG MỘT NỬA — tạo `feature`, không tạo `hotfix`. */
const LOG_MOT_NUA_JSON = `{
  "gameId": "git",
  "levelId": "${CODE}",
  "seed": ${SEED},
  "actions": [
    { "gameId": "git", "tick": 0, "kind": "command", "command": "git branch feature" }
  ]
}`;

/** Nhật ký giải TRỌN VẸN — cả hai nhánh. */
const LOG_TRON_VEN_JSON = `{
  "gameId": "git",
  "levelId": "${CODE}",
  "seed": ${SEED},
  "actions": [
    { "gameId": "git", "tick": 0, "kind": "command", "command": "git branch feature" },
    { "gameId": "git", "tick": 1, "kind": "command", "command": "git branch hotfix" }
  ]
}`;

function problem(): StoredProblem {
  return JSON.parse(PROBLEM_JSON) as StoredProblem;
}

function log(json: string): RunLog {
  return JSON.parse(json) as RunLog;
}

/**
 * Lời khai TRUNG THỰC cho nhật ký một-nửa.
 *
 * `score: 350` là số ĐO ĐƯỢC từ chính lượt phát lại đầu tiên, viết thành hằng
 * chứ KHÔNG gọi lại `scoreProblemRun` tại chỗ. Tính lại bằng chính hàm mà cổng
 * đang dùng là một ô tự điều chỉnh — nó xanh kể cả khi công thức đổi, tức nó
 * không gác gì cả.
 */
const CLAIM_THAT_THA: RunResult = JSON.parse(`{
  "gameId": "git",
  "levelId": "${CODE}",
  "seed": ${SEED},
  "startedAt": 1700000000000,
  "finishedAt": 1700000060000,
  "objectivesMet": ["t1"],
  "objectivesTotal": 2,
  "commandsUsed": 1,
  "hintsUsed": 0,
  "score": 350
}`) as RunResult;

/** Điểm của lượt giải TRỌN VẸN — cũng là một phép ĐO, không phải một phép tính. */
const DIEM_TRON_VEN = 1000;

function grade(logJson: string): ReturnType<typeof gradeProblemRun> {
  const bai = problem();
  const nhatKy = log(logJson);
  return gradeProblemRun({
    gameId: bai.gameId,
    initialState: bai.initialState,
    actions: nhatKy.actions,
    testcases: bai.testcases,
    seed: nhatKy.seed,
  });
}

// ── Đường đi được ───────────────────────────────────────────────────────────

describe('bài Git đi qua đường phát lại của máy chủ', () => {
  it('dựng được `GitLevel` mang đúng `problem.code` làm `id`', () => {
    const level = problemAsGitLevel(problem());
    // `id` là khoá so của `verifyRun` và của `init` — xem khối chú thích ở
    // `problemAsGitLevel`. Một `id` khác `problem.code` làm MỌI lượt nộp Git
    // thành `phat-lai-loi`, và câu lỗi sẽ nói về "bộ mô phỏng".
    expect(level.id).toBe(CODE);
    // `null`, KHÔNG phải `[]` — hai giá trị nghĩa ngược nhau. `[]` cấm mọi lệnh,
    // tức mọi lượt phát lại trượt TRONG IM LẶNG (lệnh bị chặn không phải lỗi).
    expect(level.allowedCommands).toBeNull();
    expect(level.objectives.map((o) => o.id)).toEqual(['t1', 't2']);
    // Quyết định #20 — "Objective = testcase", và một testcase thì luôn chặn.
    expect(level.objectives.every((o) => o.required)).toBe(true);
  });

  it('ném khi đưa nhầm một bài K8s vào — không ép im lặng', () => {
    const bai = { ...problem(), gameId: 'k8s' } as StoredProblem;
    expect(() => problemAsGitLevel(bai)).toThrow(/thuộc game "k8s"/);
  });

  it('lượt giải trọn vẹn ra `AC (2/2)`', () => {
    const ketQua = grade(LOG_TRON_VEN_JSON);
    expect(ketQua.verdict).toBe('AC');
    expect([...ketQua.passed].sort()).toEqual(['t1', 't2']);
    expect(ketQua.total).toBe(2);
    expect(ketQua.failedCode).toBeNull();
  });

  it('lời khai trung thực ⇒ `da-xac-minh`', () => {
    const verdict = verifyProblemRun(problem(), log(LOG_MOT_NUA_JSON), CLAIM_THAT_THA, []);
    expect(verdict.mismatches).toEqual([]);
    expect(verdict.status).toBe('da-xac-minh');
  });
});

// ── ĐỐI CHỨNG DƯƠNG — verdict client sửa tay ────────────────────────────────

/**
 * AC-C mở rộng sang game thứ hai: *"một bài nộp với verdict client bị sửa tay
 * thành `AC` vẫn ra `WA` từ server"*.
 *
 * ## Hai kiểu sửa tay, HAI kết cục khác nhau — và sự khác nhau đó là điểm chính
 *
 * Client không gửi một trường `verdict`. Thứ nó gửi là `objectivesMet` +
 * `objectivesTotal`, và verdict hiện trên màn là một SUY RA từ cặp đó
 * (`problemVerdictOf`). Nên "sửa verdict thành AC" có đúng hai cách làm, và
 * chúng đi qua hai cổng khác nhau:
 *
 * | Sửa gì | Cổng bắt | Kết cục |
 * |---|---|---|
 * | `objectivesMet` (khai đạt cả hai) | `verifyRun` — nó so từng id | `khong-khop` ⇒ `CE`, `passed: []` |
 * | `objectivesTotal` (hạ mẫu số xuống 1) | **chỉ** `gradeProblemRun` | `da-xac-minh`, nhưng verdict máy chủ là `WA (1/2)` |
 *
 * Ca thứ hai là ca AC-C mô tả bằng chữ, và nó là ca ĐÁNG SỢ hơn: `verifyRun`
 * KHÔNG đọc `objectivesTotal` một lần nào (`core/verify.ts` so `levelId`,
 * `seed`, `commandsUsed`, `hintsUsed`, `objectivesMet`, `score` — hết). Một
 * người sửa đúng một con số đó đi lọt toàn bộ tầng chống gian lận, và thứ duy
 * nhất còn chặn họ là việc máy chủ tự đếm testcase của BÀI thay vì tin mẫu số
 * họ gửi lên.
 */
describe('ĐỐI CHỨNG DƯƠNG — client khai AC, máy chủ vẫn nói WA', () => {
  it('hạ `objectivesTotal` xuống 1 ⇒ client đọc ra AC mà máy chủ chấm `WA (1/2)`', () => {
    const SUA_TAY: RunResult = { ...CLAIM_THAT_THA, objectivesTotal: 1 };

    // Vế 1 — lời khai này đi LỌT tầng xác minh. Không có vế này thì vế 2 xanh
    // vì một lý do khác (lượt nộp bị chặn sớm), và ô mất hết ý nghĩa.
    const verdict = verifyProblemRun(problem(), log(LOG_MOT_NUA_JSON), SUA_TAY, []);
    expect(verdict.status).toBe('da-xac-minh');

    // Vế 2 — client tự chấm thì ra `AC` (1 đạt / 1 tổng).
    const clientDocRa = SUA_TAY.objectivesMet.length === SUA_TAY.objectivesTotal ? 'AC' : 'WA';
    expect(clientDocRa).toBe('AC');

    // Vế 3 — máy chủ đếm testcase của BÀI, không đọc mẫu số client gửi.
    const ketQua = grade(LOG_MOT_NUA_JSON);
    expect(ketQua.verdict).toBe('WA');
    expect(ketQua.total).toBe(2);
    expect([...ketQua.passed]).toEqual(['t1']);
  });

  it('khai đạt cả hai testcase ⇒ `khong-khop` (đường thứ hai, ra `CE`)', () => {
    const SUA_TAY: RunResult = {
      ...CLAIM_THAT_THA,
      objectivesMet: ['t1', 't2'],
      score: 1000,
    };
    const verdict = verifyProblemRun(problem(), log(LOG_MOT_NUA_JSON), SUA_TAY, []);
    expect(verdict.status).toBe('khong-khop');
    // BẰNG CHỨNG, không phải bản sao của `status`: phải nói ra field nào lệch.
    expect(verdict.mismatches.map((m) => m.field).sort()).toEqual(['objectivesMet', 'score']);
  });

  it('ĐỐI CHỨNG ÂM: nhật ký giải trọn vẹn + khai trọn vẹn vẫn `da-xac-minh`', () => {
    // Không có ô này thì hai ô trên cũng xanh khi MỌI lượt đều `khong-khop` —
    // tức khi đường phát lại Git hỏng hoàn toàn.
    const nhatKy = log(LOG_TRON_VEN_JSON);
    const bai = problem();
    const engineVerdict = verifyProblemRun(
      bai,
      nhatKy,
      {
        ...CLAIM_THAT_THA,
        objectivesMet: ['t1', 't2'],
        objectivesTotal: 2,
        commandsUsed: 2,
        score: DIEM_TRON_VEN,
      },
      [],
    );
    expect(engineVerdict.mismatches).toEqual([]);
    expect(engineVerdict.status).toBe('da-xac-minh');
  });
});

// ── Game chưa có adapter ────────────────────────────────────────────────────

describe('game chưa có adapter phát lại nói đúng tên vấn đề', () => {
  it('ném `UnsupportedReplayGameError` kèm `gameId`', () => {
    const bai = { ...problem(), gameId: 'pipeline' } as StoredProblem;
    /*
     * Một lớp lỗi CÓ TÊN, không phải một `VerifyResult` hỏng. Trả một
     * `VerifyResult` hỏng ở đây sẽ hiện trên màn hình là "không xác minh được"
     * — một câu đổ lỗi cho người nộp về một mảnh nền tảng còn thiếu.
     */
    expect(() => verifyProblemRun(bai, log(LOG_MOT_NUA_JSON), CLAIM_THAT_THA, [])).toThrow(
      UnsupportedReplayGameError,
    );
  });
});

// ── `gameId` chốt về MỘT nguồn ──────────────────────────────────────────────

/**
 * Khe mở ra đúng lúc điểm cuối nhận game thứ hai.
 *
 * `verifyProblemRun` tra adapter theo `problem.gameId` (đọc từ DB);
 * `gradeSubmission` tra plugin theo `log.gameId` (client gửi lên). Hai nguồn cho
 * cùng một câu hỏi. Chừng nào mọi bài đều là K8s thì chúng luôn bằng nhau và
 * khe này là mã chết — nên nó chỉ trở thành thật ở đúng lượt thay đổi này, và
 * phải đóng trong cùng lượt.
 *
 * ⚠ Ô này gọi `submitProblem` với `db` là `undefined`, CÓ CHỦ Ý. Phép kiểm chạy
 * trước dòng chạm DB đầu tiên, nên một `db` thật ở đây chỉ thêm một phụ thuộc
 * Postgres cho một ô không đo gì về Postgres — và đã có tiền lệ trong repo này
 * về việc một suite xanh nhờ skip trông y hệt một suite xanh thật. Nếu ai đó
 * chuyển phép kiểm xuống sau lượt đọc DB, ô này ĐỎ bằng một `TypeError` chứ
 * không im lặng, và đó là hành vi đúng.
 */
describe('nhật ký khai sai game bị từ chối trước khi chạm engine nào', () => {
  it('`log.gameId` lệch `problem.gameId` ⇒ BAD_REQUEST, nói ra cả hai', async () => {
    const nhatKy = { ...log(LOG_MOT_NUA_JSON), gameId: 'k8s' } as RunLog;
    await expect(
      submitProblem(undefined as never, problem(), 'u-git-sai-game-1', nhatKy, CLAIM_THAT_THA),
    ).rejects.toThrow(/khai game "k8s"[\s\S]*thuộc game "git"/);
  });

  it('`claimed.gameId` lệch cũng bị từ chối — dù hôm nay không ai đọc nó', async () => {
    // Trường này không đi vào phép chấm nào hôm nay. Bỏ qua nó sẽ "chạy đúng"
    // cho tới ngày ai đó đọc nó và đọc phải một giá trị chưa bao giờ được kiểm.
    const khai = { ...CLAIM_THAT_THA, gameId: 'k8s' } as RunResult;
    await expect(
      submitProblem(undefined as never, problem(), 'u-git-sai-game-2', log(LOG_MOT_NUA_JSON), khai),
    ).rejects.toThrow(/thuộc game "git"/);
  });
});
