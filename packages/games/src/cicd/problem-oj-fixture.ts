/**
 * Đề bài dựng sẵn cho các ô nghiệm thu của chế độ làm bài CI/CD — 19.J.
 *
 * ## Vì sao một file riêng, không phải hai bản chép trong hai file test
 *
 * Ô tất định (AC-J5) chạy ở HAI môi trường — `node` và `jsdom` — và điều kiện để
 * nó có nghĩa là hai bên nhận **cùng một đầu vào từng byte**. Bộ đôi tương ứng
 * của game Git (`git/determinism.test.ts` + `.jsdom.test.ts`) chép tay `WorldSpec`
 * sang cả hai file kèm một lời nhắc *"hai file phải ra CÙNG con số"* — lời nhắc
 * đó không phải một cổng, và ngày ai đó sửa một bên thì ô kia vẫn xanh trên một
 * đề bài KHÁC. Một nguồn thì không lệch được.
 *
 * ⚠ File này KHÔNG đi vào bundle. `packages/games` xuất đúng một subpath
 * (`./src/index.ts`), nên chỉ thứ với tới được từ barrel mới được gói; không ai
 * ngoài các file test nhập file này.
 *
 * ⛔ KHÔNG dán YAML viết tay vào đây — cùng lý do đã ghi ở đầu
 * `problem-plugin.test.ts`: cổng `scripts/check-cicd-vendor-neutral.mjs` quét cả
 * thư mục `cicd/`, và một khoá của nhà cung cấp trong một chuỗi là đúng thứ nó
 * bắt. Mọi nguồn YAML dựng bằng `writeWorkflowYaml`.
 */

import type { CicdGameAction } from './action.ts';
import type { CicdCdPolicies, ReleasePolicy } from './cd-contract.ts';
import type { StageId, StageSpec, WorkflowSpec } from './contract.ts';
import type { CicdPlayerOverrides } from './hydrate.ts';
import type { CicdProblemCd, CicdProblemSpec } from './problem-plugin.ts';
import { CICD_PROBLEM_PLUGIN } from './problem-plugin.ts';
import { writeWorkflowYaml } from './yaml-write.ts';

/**
 * Một stage tối thiểu nhưng ĐỦ CHẠY: có bước, và hạng máy khớp `workload` mặc
 * định của plugin. Thiếu một trong hai thì `evaluate()` trả
 * `error.kind === 'unschedulable'` và phép đo đổi nghĩa mà không ai thấy.
 */
export function ojStage(id: StageId, dependsOn: readonly StageId[] = []): StageSpec {
  return {
    id,
    kind: 'build',
    name: id,
    dependsOn,
    blocking: true,
    retries: 0,
    runnerClass: 'linux',
    steps: [{ id: `buoc-${id}`, name: id, durationTicks: 2, blocking: true, script: `chay-${id}` }],
  };
}

export function ojWorkflow(...stages: readonly StageSpec[]): WorkflowSpec {
  return { name: 'Duong ong thu', stages };
}

/** Workflow hai job dùng chung cho mọi ô dưới đây. */
export const OJ_WORKFLOW: WorkflowSpec = ojWorkflow(ojStage('clone'), ojStage('kiem-tra', ['clone']));

/**
 * Chính sách phát hành kiểu canary, khác nhau ĐÚNG MỘT trường.
 *
 * `onBadRelease` là trường duy nhất đổi, và đó là chủ ý: một ô đo "chính sách có
 * tới được bộ chấm không" mà đổi nhiều trường cùng lúc thì khi nó đỏ, không ai
 * biết trường nào là trường đi lạc.
 */
function canary(onBadRelease: ReleasePolicy['onBadRelease']): CicdCdPolicies {
  return {
    release: {
      strategy: 'canary',
      onBadRelease,
      canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
    },
  };
}

/** Chính sách LÙI khi bản phát hành xấu — lời giải của đề `baiCanary`. */
export const CD_LUI: CicdCdPolicies = canary('rollback');

/** Chính sách ĐI TIẾP — chính sách khởi điểm, và là câu trả lời sai. */
export const CD_DI_TIEP: CicdCdPolicies = canary('roll-forward');

/**
 * Khối CD của đề: một kịch bản có bản ứng viên XẤU (15% lỗi so với nền 1%).
 *
 * Con số lấy từ `levels/c20-canary-gioi-han-luu-luong.ts` chứ không bịa: kịch bản
 * đó đã được `levels/cd-levels.test.ts` chạy qua cả ba bộ chính sách, nên ta biết
 * nó nằm trong miền hợp lệ của `simulateRelease`.
 */
export function ojCdBlock(editable: CicdProblemCd['editable']): CicdProblemCd {
  return {
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
    editable,
    initial: CD_DI_TIEP,
  };
}

/** Đề thuần CI: bộ ba mặc định của plugin, đổi mỗi `workflow`. */
export function baiCi(workflow: WorkflowSpec = OJ_WORKFLOW): CicdProblemSpec {
  return { ...CICD_PROBLEM_PLUGIN.initialSpec(), workflow };
}

/**
 * Đề có chương CD. `editable` mặc định cho xoay đúng núm `onBadRelease` — tức
 * người làm giải được bài bằng bảng núm, đúng luật `CicdLevelCd.solution`.
 */
export function baiCanary(
  editable: CicdProblemCd['editable'] = ['release.onBadRelease'],
): CicdProblemSpec {
  return { ...baiCi(), cd: ojCdBlock(editable) };
}

/** Một lượt nộp đủ ba mảnh. Mặc định: chưa xoay núm nào, bài không có CD. */
export function ojNop(
  workflow: WorkflowSpec,
  extra: {
    readonly overrides?: CicdPlayerOverrides;
    readonly cd?: CicdCdPolicies | null;
    readonly tick?: number;
  } = {},
): CicdGameAction {
  return {
    gameId: 'cicd',
    tick: extra.tick ?? 0,
    kind: 'evaluate',
    source: writeWorkflowYaml(workflow).yaml,
    overrides: extra.overrides ?? {},
    cd: extra.cd ?? null,
  };
}
