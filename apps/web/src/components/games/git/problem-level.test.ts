import { describe, expect, it } from 'vitest';
import { GIT_UNSEEDED_REPLAY_SEED, createGitSession } from '@devops-platform/games';

import { gitOjClaim, gitOjGradable, gitOjLevel, type GitOjProblem } from './problem-level';

/**
 * Nửa CLIENT của hợp đồng §18.C cho game Git.
 *
 * ⛔ Ô này gác một lớp lỗi mà `tsc` không thấy được: hai bản dựng `GitLevel` (ở
 * đây và ở `server/problems/replay.ts`) đều biên dịch sạch khi lệch nhau, và chỗ
 * lệch chỉ lộ ra dưới dạng `CE` cho MỌI lượt nộp hợp lệ.
 *
 * ## Vì sao fixture là CHUỖI JSON, và vì sao nó là CHÍNH fixture của lane máy chủ
 *
 * `git-replay.test.ts` dựng đúng bài này, đúng hai nhật ký này, và đo ra hai con
 * số điểm. Chép nguyên bài sang đây rồi bắt bản dựng CLIENT đẻ ra cùng hai con
 * số là cách duy nhất so hai bên mà không cần Postgres và không cần HTTP.
 *
 * Chuỗi JSON chứ không phải object literal, cùng lý lẽ lane kia đã ghi: một
 * object literal chở được `undefined`, một `Map`, hay một tham chiếu dùng chung
 * — ba thứ không sống sót qua dây, và nếu một bên vô tình mượn object của bên
 * kia thì ô vẫn xanh.
 *
 * ## Hai con số 350 / 1000 viết thành HẰNG, không gọi lại `scoreProblemRun`
 *
 * Tính lại bằng chính hàm mà cổng đang dùng là một ô tự điều chỉnh: nó xanh kể
 * cả khi công thức đổi, tức nó không gác gì. Hai số này đo được ở lane máy chủ
 * (`2026-09-15-lane-18c-git-server.md` §3) và được chép sang như một lời khai
 * kiểm được, không phải một phép tính.
 */

const CODE = 'GIT-9001';

const PROBLEM_JSON = `{
  "code": "${CODE}",
  "title": "Tao nhanh feature",
  "statement": "Tao mot nhanh ten feature tro vao commit hien tai.",
  "difficulty": "easy",
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
  "hints": [],
  "parMoves": null
}`;

function problem(): GitOjProblem {
  return JSON.parse(PROBLEM_JSON) as GitOjProblem;
}

/** Bài như NGƯỜI HỌC nhận nó: `check`/`args` đã bị `toTestcaseTeasers` cắt. */
function problemDaChe(): GitOjProblem {
  const full = problem();
  return {
    ...full,
    testcases: full.testcases.map((testcase) => ({
      id: testcase.id,
      label: testcase.label,
      visible: testcase.visible,
    })),
  };
}

/** Chơi một chuỗi lệnh trên bài, trả lời khai client sẽ gửi đi. */
function choi(commands: readonly string[]) {
  const target = problem();
  const session = createGitSession({
    level: gitOjLevel(target),
    seed: GIT_UNSEEDED_REPLAY_SEED,
    undoDepth: 0,
  });
  for (const command of commands) session.run(command);
  return {
    log: session.getLog(),
    claim: gitOjClaim({
      problem: target,
      log: session.getLog(),
      /*
       * Trong sản phẩm, `objectivesMet` tới từ `problems.tryGrade` (máy chủ) —
       * đường của người học không chở `check` nên phiên cục bộ luôn trả rỗng.
       * Gá này CÓ `check` nên `getStatus()` dùng được, và dùng nó ở đây là cố ý:
       * ô dưới đo phép tính ĐIỂM, và nó phải đo trên một tập objective THẬT chứ
       * không trên một mảng bịa.
       */
      objectivesMet: session.getStatus().objectivesMet,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_060_000,
    }),
  };
}

describe('gitOjLevel — bốn điểm hợp đồng với problemAsGitLevel', () => {
  it('id level LÀ mã bài, không phải một hằng riêng', () => {
    /*
     * `submitProblem` so `log.levelId` với `expectedLogLevelId(problem)`, và hàm
     * đó trả thẳng `problem.code`. Một id khác ở đây là `BAD_REQUEST` trước khi
     * phát lại chạy dòng nào.
     */
    expect(gitOjLevel(problem()).id).toBe(CODE);
  });

  it('allowedCommands là null, KHÔNG phải mảng rỗng', () => {
    /*
     * Hai giá trị mang nghĩa ngược nhau và `[]` không ném: nó chỉ làm mọi lệnh
     * vô tác dụng. `toBeNull` chứ không `toHaveLength(0)` — một ô viết bằng độ
     * dài sẽ XANH với cả hai.
     */
    expect(gitOjLevel(problem()).allowedCommands).toBeNull();
  });

  it('objectives dựng từ testcases, required: true cho mọi cái', () => {
    expect(gitOjLevel(problem()).objectives).toEqual([
      { id: 't1', label: 'Co nhanh feature', check: 'refExists', args: { ref: 'feature' }, required: true },
      { id: 't2', label: 'Co nhanh hotfix', check: 'refExists', args: { ref: 'hotfix' }, required: true },
    ]);
  });

  it('bài không khai cây đích thì KHÔNG có khoá target', () => {
    // `createGitSession` đọc `level.target === undefined`; một khoá có mặt với
    // giá trị `undefined` là một hình dạng khác dưới `exactOptionalPropertyTypes`.
    expect('target' in gitOjLevel(problem())).toBe(false);
  });
});

describe('gitOjGradable — cổng chặn một bài KHÔNG chấm được', () => {
  it('bài có testcase thì nộp được', () => {
    expect(gitOjGradable(problem())).toBe(true);
  });

  /*
   * ⛔ Ô này ĐÃ ĐẢO 2026-09-15, và đảo chứ không xoá.
   *
   * Bản cũ khẳng định `problemDaChe()` KHÔNG nộp được, vì lúc đó CLIENT là bên
   * chấm và một `check` vắng mặt làm mọi vị từ trả `undefined`. Từ khi máy chủ
   * chấm (`problems.tryGrade`), client KHÔNG BAO GIỜ có `check` — đòi nó sẽ tắt
   * nút nộp của mọi người học vĩnh viễn.
   *
   * Nên ô nay khẳng định điều NGƯỢC LẠI, và nó vẫn là một ô gác: nếu ai đó khôi
   * phục phép kiểm `check` ở `gitOjGradable` thì ô này đỏ, kèm lý do ngay đây.
   * `rules/pinned-baseline-test-companion.md` — một ô xoá đi không để lại gì thì
   * lần quay lui sau không ai bắt được.
   */
  it('bài đã che check VẪN nộp được — máy chủ chấm, không phải trình duyệt', () => {
    expect(gitOjGradable(problemDaChe())).toBe(true);
  });

  it('bài không có testcase nào thì KHÔNG', () => {
    // `problemVerdictOf(0, 0)` trả `CE`, nên đây là một bài không ai nộp được.
    expect(gitOjGradable({ ...problem(), testcases: [] })).toBe(false);
  });
});

describe('gitOjClaim — lời khai khớp thứ máy chủ phát lại ra', () => {
  it('nhật ký khai gameId git ở gốc, và seed là số THẬT đã nạp', () => {
    const { log } = choi(['git branch feature']);
    expect(log.gameId).toBe('git');
    expect(log.levelId).toBe(CODE);
    expect(log.seed).toBe(GIT_UNSEEDED_REPLAY_SEED);
  });

  it('lượt giải NỬA BÀI khai đúng 350 điểm', () => {
    const { claim } = choi(['git branch feature']);
    expect(claim.gameId).toBe('git');
    expect(claim.levelId).toBe(CODE);
    expect(claim.seed).toBe(GIT_UNSEEDED_REPLAY_SEED);
    expect([...claim.objectivesMet]).toEqual(['t1']);
    expect(claim.objectivesTotal).toBe(2);
    expect(claim.commandsUsed).toBe(1);
    expect(claim.hintsUsed).toBe(0);
    expect(claim.score).toBe(350);
  });

  it('lượt giải TRỌN VẸN khai đúng 1000 điểm', () => {
    const { claim } = choi(['git branch feature', 'git branch hotfix']);
    expect([...claim.objectivesMet].sort()).toEqual(['t1', 't2']);
    expect(claim.commandsUsed).toBe(2);
    expect(claim.score).toBe(1000);
  });
});
