/**
 * `tryGradeProblem` — chấm THỬ, chốt bởi chủ dự án 2026-09-15.
 *
 * ## Ô quan trọng nhất trong file này là ô TRẦN NHỊP
 *
 * Chấm thử trả `passed`, và `passed` chở id của **cả testcase ẩn**. Không có
 * trần dùng chung với `submit` thì đây là một máy tra đáp án: gõ thử, đọc xem
 * case ẩn nào vừa xanh, lặp lại — đúng thứ mà §18.B.4 sinh ra để chặn.
 *
 * Chung bucket làm tổng số lượt dò (thử + nộp) ≤ `SUBMIT_LIMIT_PER_MIN`, tức
 * KHÔNG rộng hơn việc dò bằng cách nộp đi nộp lại. Nếu ai đó tách bucket ra cho
 * "thử thì rẻ hơn nên cho thoải mái", ô dưới đây phải đỏ.
 *
 * ## Chạy ở env node, fixture là JSON thô
 *
 * Cùng hai vế kỷ luật mà `git-replay.test.ts` thi hành, và cùng lý do
 * (`phase-18.md` §18.C: *"server dùng chung một tiến trình với client thì không
 * chứng minh gì"*). File này không khai docblock jsdom nên nó chạy ở node; mọi
 * fixture đi qua `JSON.parse` trước khi chạm `packages/games`.
 *
 * ⚠ KHÔNG cần Postgres, nên nó LUÔN chạy. `tryGradeProblem` không nhận `db` —
 * đó là lời khai "không ghi gì" ở tầng CHỮ KÝ, mạnh hơn một ô test: một lượt ghi
 * thêm vào đây sẽ phải đổi chữ ký trước, và lượt đổi đó là thứ review thấy.
 */

import { describe, expect, it } from 'vitest';
import type { RunLog } from '@devops-platform/games';

import type { StoredProblem } from './dto';
import { tryGradeProblem } from './submit';

const CODE = 'GIT-0001';

/** Một testcase HIỆN, một testcase ẨN — ô ẩn là thứ trần nhịp bảo vệ. */
const PROBLEM_JSON = `{
  "code": "${CODE}",
  "gameId": "git",
  "slug": "tao-nhanh-feature",
  "title": "Tao nhanh feature",
  "statement": "Tao nhanh feature va hotfix.",
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
    { "id": "t2", "label": "Co nhanh hotfix", "check": "refExists", "args": { "ref": "hotfix" }, "visible": false }
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

function problem(): StoredProblem {
  return JSON.parse(PROBLEM_JSON) as StoredProblem;
}

function logJson(overrides: { gameId?: string; levelId?: string; commands?: readonly string[] }): RunLog {
  const commands = overrides.commands ?? [];
  const actions = commands
    .map(
      (command, index) =>
        `{ "gameId": "git", "tick": ${String(index)}, "kind": "command", "command": "${command}" }`,
    )
    .join(',');
  return JSON.parse(`{
    "gameId": "${overrides.gameId ?? 'git'}",
    "levelId": "${overrides.levelId ?? CODE}",
    "seed": 1,
    "actions": [${actions}]
  }`) as RunLog;
}

/** Mỗi ô một `userId` riêng: bucket nhịp là in-memory và khoá theo người dùng. */
let seq = 0;
function freshUser(): string {
  seq += 1;
  return `u-try-grade-${String(seq)}`;
}

describe('chấm thử trả đúng thứ máy chủ tự tính', () => {
  it('giải một nửa ⇒ WA, và chỉ đúng testcase đã đạt', () => {
    const grade = tryGradeProblem(problem(), freshUser(), logJson({ commands: ['git branch feature'] }));
    expect(grade.verdict).toBe('WA');
    expect([...grade.passed]).toEqual(['t1']);
    expect(grade.total).toBe(2);
  });

  it('giải trọn vẹn ⇒ AC', () => {
    const grade = tryGradeProblem(
      problem(),
      freshUser(),
      logJson({ commands: ['git branch feature', 'git branch hotfix'] }),
    );
    expect(grade.verdict).toBe('AC');
    expect([...grade.passed].sort()).toEqual(['t1', 't2']);
  });

  it('chưa gõ gì ⇒ WA 0/2, KHÔNG phải CE', () => {
    // `CE` nghĩa là lượt chơi không chạy tới nơi. Một người vừa mở bài chưa làm
    // gì thì lượt chơi của họ chạy bình thường và chưa đạt gì — hai câu khác hẳn.
    const grade = tryGradeProblem(problem(), freshUser(), logJson({}));
    expect(grade.verdict).toBe('WA');
    expect(grade.total).toBe(2);
    expect([...grade.passed]).toEqual([]);
  });
});

describe('⛔ TRẦN NHỊP dùng chung với submit', () => {
  it('lượt thứ bảy trong một phút bị từ chối', () => {
    /*
     * `SUBMIT_LIMIT_PER_MIN = 6`. Ô này cố ý KHÔNG nhập hằng đó: nhập nó vào rồi
     * lặp `for (i < LIMIT)` là một ô tự điều chỉnh — nó xanh dù ai đó đổi trần
     * lên một nghìn. Con số viết thẳng ở đây là một lời khai độc lập, và nếu trần
     * thật đổi thì ô này ĐỎ và buộc người đổi phải đọc khối chú thích trên.
     */
    const user = freshUser();
    for (let i = 0; i < 6; i += 1) {
      expect(() => tryGradeProblem(problem(), user, logJson({})), `lượt ${String(i + 1)}`).not.toThrow();
    }
    expect(() => tryGradeProblem(problem(), user, logJson({}))).toThrow(/quá nhanh/u);
  });

  it('mỗi người dùng một bucket riêng — trần của người này không chặn người kia', () => {
    const a = freshUser();
    for (let i = 0; i < 6; i += 1) tryGradeProblem(problem(), a, logJson({}));
    expect(() => tryGradeProblem(problem(), a, logJson({}))).toThrow();
    expect(() => tryGradeProblem(problem(), freshUser(), logJson({}))).not.toThrow();
  });
});

describe('hai cổng chép từ submit, cố ý không nới', () => {
  it('nhật ký khai game khác bài ⇒ từ chối', () => {
    // Chấm thử DỄ TÍNH hơn đường nộp sẽ dạy người ta rằng bài của họ đã đạt, rồi
    // lượt nộp từ chối — và họ không có cách nào biết vì sao.
    expect(() => tryGradeProblem(problem(), freshUser(), logJson({ gameId: 'k8s' }))).toThrow(
      /thuộc game "git"/u,
    );
  });

  it('nhật ký thuộc bài khác ⇒ từ chối', () => {
    expect(() =>
      tryGradeProblem(problem(), freshUser(), logJson({ levelId: 'GIT-9999' })),
    ).toThrow(/không phải "GIT-0001"/u);
  });
});
