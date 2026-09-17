/**
 * Hai bài mẫu CI/CD phải GIẢI ĐƯỢC, và phải CHƯA GIẢI SẴN — 19.J.4.
 *
 * ## Vì sao cả hai vế, và vì sao vế thứ hai dễ quên
 *
 * Một đề mà trạng thái ban đầu đã qua hết testcase là một đề **không dạy gì**:
 * người làm bấm "Nộp bài" ngay khi mở ra và nhận `AC`. Nó không đỏ ở đâu cả —
 * mọi cổng xuất bản đều xanh, bộ chấm chạy tới nơi, verdict hợp lệ. Chỉ một ô
 * khẳng định trạng thái đầu ra `WA` mới nói được điều đó.
 *
 * Vế thứ nhất (có lời giải) là rủi ro số 3 của kế hoạch 19.J: *"bài CD ra đề
 * không giải được vì thiếu núm"*. Ô dưới chạy LỜI GIẢI THẬT qua đúng bộ chấm mà
 * máy chủ chạy, nên nó đo chính điều đó thay vì tin vào mắt người soạn.
 *
 * ⛔ Lời giải phải đi qua ĐÚNG hai cửa mà người chơi đi: YAML cho workflow, bảng
 * núm cho chính sách CD. Nạp thẳng một `WorkflowSpec` vào bộ chấm sẽ bỏ qua bộ
 * đọc YAML và khuôn job — hai thứ đã chặn hai đường lách ở review PR #141 — nên
 * ô sẽ xanh trên một lời giải mà giao diện không phát ra được.
 */

import { describe, expect, it } from 'vitest';

import type { CicdGameAction } from '../action.ts';
import type { CicdCdPolicies } from '../cd-contract.ts';
import type { Testcase } from '../../core/problem.ts';
import type { WorkflowSpec } from '../contract.ts';
import { gradeCicdProblem, type CicdProblemSpec } from '../problem-plugin.ts';
import { writeWorkflowYaml } from '../yaml-write.ts';
import { CICD_PROBLEMS_SEED, type CicdProblemSeed } from './index.ts';

function de(code: string): CicdProblemSeed {
  const found = CICD_PROBLEMS_SEED.find((problem) => problem.code === code);
  if (found === undefined) throw new Error(`không có bài ${code} trong bộ seed`);
  return found;
}

function testcasesCua(seed: CicdProblemSeed): readonly Testcase[] {
  return seed.objectives.map((objective) => ({
    id: objective.id,
    label: objective.label,
    check: objective.check,
    ...(objective.args === undefined ? {} : { args: objective.args }),
    visible: objective.visible,
  }));
}

function cham(
  seed: CicdProblemSeed,
  actions: readonly CicdGameAction[],
): ReturnType<typeof gradeCicdProblem> {
  return gradeCicdProblem({
    initialState: seed.initialState as CicdProblemSpec,
    actions,
    testcases: testcasesCua(seed),
    seed: 1,
  });
}

function nop(workflow: WorkflowSpec, cd: CicdCdPolicies | null = null): CicdGameAction {
  return {
    gameId: 'cicd',
    tick: 0,
    kind: 'evaluate',
    source: writeWorkflowYaml(workflow).yaml,
    overrides: {},
    cd,
  };
}

/** Workflow ban đầu của một đề, đọc TỪ đề chứ không chép lại. */
function workflowBanDau(seed: CicdProblemSeed): WorkflowSpec {
  return (seed.initialState as CicdProblemSpec).workflow;
}

describe('bộ seed CI/CD — hình dạng', () => {
  it('mọi bài khai `gameId: cicd` và trạng thái `published`', () => {
    /*
     * `game_id` có MẶC ĐỊNH `'k8s'` ở tầng cột (`schema.ts`), nên một dòng seed
     * quên trường này nằm trong bảng dưới cờ K8s và `gradeProblemRun` tra sai
     * plugin — im lặng. Và `draft` thì `problems.list` của người học lọc cứng
     * `state = 'published'`, nên một lượt seed XANH vẫn để `/problems` rỗng.
     */
    for (const problem of CICD_PROBLEMS_SEED) {
      expect(problem.gameId, problem.code).toBe('cicd');
      expect(problem.state, problem.code).toBe('published');
    }
  });

  it('mã bài mang tiền tố `CICD` và không trùng nhau', () => {
    const codes = CICD_PROBLEMS_SEED.map((problem) => problem.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code.startsWith('CICD-')).toBe(true);
  });

  it('có ít nhất một bài dùng chương CD — nếu không, khối `cd` không được đo ở đâu', () => {
    /*
     * ĐỐI CHỨNG cho chính bộ seed. Bỏ `CICD-0002` đi thì mọi ô e2e còn lại vẫn
     * xanh trên một hệ thống không chấm nổi một bài CD nào — khối `cd` sẽ không
     * đi qua biên ghi, bộ chấm, hay adapter phát lại ở bất kỳ đâu trong CI.
     */
    const coCd = CICD_PROBLEMS_SEED.filter(
      (problem) => (problem.initialState as CicdProblemSpec).cd !== undefined,
    );
    expect(coCd.length).toBeGreaterThanOrEqual(1);
  });
});

describe('CICD-0001 — hai job không cần đợi nhau', () => {
  const seed = de('CICD-0001');

  it('trạng thái ĐẦU chưa đạt — bài có gì để làm', () => {
    expect(cham(seed, []).verdict).toBe('WA');
  });

  it('lời giải qua đúng cửa YAML ⇒ AC', () => {
    /*
     * Lời giải: `dong-goi` đổi từ `needs: kiem-tra` sang `needs: clone`. Tập job
     * và dãy bước GIỮ NGUYÊN — khuôn job sẽ từ chối chấm nếu đổi, và đó là điều
     * đề bài nói thẳng với người làm.
     */
    const goc = workflowBanDau(seed);
    const loiGiai: WorkflowSpec = {
      name: goc.name,
      stages: goc.stages.map((stage) =>
        stage.id === 'dong-goi' ? { ...stage, dependsOn: ['clone'] } : stage,
      ),
    };
    const ket = cham(seed, [nop(loiGiai)]);
    expect(ket.verdict, ket.failedReason ?? '').toBe('AC');
  });

  it('xoá sạch cạnh phụ thuộc KHÔNG đạt — testcase thứ hai giữ đúng vế đó', () => {
    /*
     * Bắt được: một đề chỉ khai `stageNotDependsOn` mà quên `stageDependsOn`.
     * Khi đó "gỡ hết `needs`" cũng ra AC — một lời giải sai mà đề khen đúng, và
     * người làm học được đúng điều ngược với bài học.
     */
    const goc = workflowBanDau(seed);
    const xoaSach: WorkflowSpec = {
      name: goc.name,
      stages: goc.stages.map((stage) => ({ ...stage, dependsOn: [] })),
    };
    expect(cham(seed, [nop(xoaSach)]).verdict).toBe('WA');
  });
});

describe('CICD-0002 — bản phát hành xấu', () => {
  const seed = de('CICD-0002');

  it('trạng thái ĐẦU chưa đạt — chính sách khởi điểm là câu trả lời sai', () => {
    expect(cham(seed, []).verdict).toBe('WA');
  });

  it('xoay đúng núm ⇒ AC, và núm đó nằm trong `editable`', () => {
    const cd = (seed.initialState as CicdProblemSpec).cd;
    expect(cd?.editable).toContain('release.onBadRelease');

    const loiGiai: CicdCdPolicies = {
      release: {
        strategy: 'canary',
        onBadRelease: 'rollback',
        canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
      },
    };
    const ket = cham(seed, [nop(workflowBanDau(seed), loiGiai)]);
    expect(ket.verdict, ket.failedReason ?? '').toBe('AC');
  });

  it('gửi chính sách NGOÀI `editable` không đổi được kết quả', () => {
    /*
     * AC-J4 trên chính đề sẽ nằm trong DB của CI. Đổi `canary.weightPercent` —
     * một núm KHÔNG mở — phải cho verdict y hệt khi không gửi gì.
     */
    const ngoaiPhamVi: CicdCdPolicies = {
      release: {
        strategy: 'canary',
        onBadRelease: 'roll-forward',
        canary: { weightPercent: 50, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.9 },
      },
    };
    expect(cham(seed, [nop(workflowBanDau(seed), ngoaiPhamVi)])).toEqual(
      cham(seed, [nop(workflowBanDau(seed), null)]),
    );
  });
});
