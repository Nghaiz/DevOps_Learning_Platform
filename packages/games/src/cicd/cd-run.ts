/**
 * Đường chạy chương CD của MỘT level — 19.G. Hợp đồng: `cd-contract.ts` §5.
 *
 * Hai hàm, và thứ tự gọi là bắt buộc: `runLevelCd` tự gọi `mergeCdPolicies`
 * trước khi mô phỏng, nên tầng giao diện KHÔNG có cách nào chạy một chính sách
 * chưa qua khoá. Đây là cùng bài học với `hydrateWorkflow` ở chương CI: bước
 * khoá mà để người gọi tự nhớ thì sẽ có một người gọi quên, và quên thì mọi thứ
 * vẫn chạy, chỉ là chấm bằng thứ level không cho sửa.
 *
 * ⚠ Không phải một bộ mô phỏng thứ tư. File này không đọc bản ghi của hàm nào
 * để quyết định gì — nó chỉ ghép ba cửa vào (`cd-contract.ts` §4) với dữ liệu
 * level và gom bản ghi thành `CicdCdRecords` cho `predicates.ts`.
 */

import type {
  CdPolicyPart,
  CicdCdPolicies,
  CicdLevelCd,
  GitOpsPolicy,
  MaskingPolicy,
  ReleasePolicy,
} from './cd-contract.ts';
import { simulateGitOps } from './gitops.ts';
import { renderMaskedLog } from './masking.ts';
import type { CicdCdRecords } from './predicates.ts';
import { simulateRelease } from './release.ts';

function mo(editable: readonly CdPolicyPart[], part: CdPolicyPart): boolean {
  return editable.includes(part);
}

function mergeRelease(
  initial: ReleasePolicy,
  edited: ReleasePolicy | undefined,
  editable: readonly CdPolicyPart[],
): ReleasePolicy {
  const strategy = mo(editable, 'release.strategy') && edited !== undefined ? edited.strategy : initial.strategy;
  const onBadRelease =
    mo(editable, 'release.onBadRelease') && edited !== undefined ? edited.onBadRelease : initial.onBadRelease;
  const rolling = mo(editable, 'release.rolling') ? edited?.rolling : initial.rolling;
  const canary = mo(editable, 'release.canary') ? edited?.canary : initial.canary;
  /*
   * Dựng từng trường, không `...edited`: một khoá lạ gửi từ bảng điều khiển không
   * được lọt qua (bài học `hydrate.ts`, review PR #141). Thiếu phần của chiến lược
   * đã chọn thì để thiếu — `simulateRelease` trả `missing-strategy-params`, và đó
   * là lỗi người chơi phải thấy, không phải chỗ để lén điền giá trị của `initial`.
   */
  return {
    strategy,
    onBadRelease,
    ...(rolling === undefined ? {} : { rolling }),
    ...(canary === undefined ? {} : { canary }),
  };
}

function mergeGitOps(
  initial: GitOpsPolicy,
  edited: GitOpsPolicy | undefined,
  editable: readonly CdPolicyPart[],
): GitOpsPolicy {
  if (edited === undefined) return initial;
  return {
    reconcileEverySeconds: mo(editable, 'gitops.reconcileEvery')
      ? edited.reconcileEverySeconds
      : initial.reconcileEverySeconds,
    selfHeal: mo(editable, 'gitops.selfHeal') ? edited.selfHeal : initial.selfHeal,
    ignoreFields: mo(editable, 'gitops.ignoreFields') ? edited.ignoreFields : initial.ignoreFields,
  };
}

function mergeMasking(
  initial: MaskingPolicy,
  edited: MaskingPolicy | undefined,
  editable: readonly CdPolicyPart[],
): MaskingPolicy {
  return mo(editable, 'masking.masked') && edited !== undefined ? { masked: edited.masked } : initial;
}

/**
 * Chính sách thật sự đem chấm: phần `editable` lấy từ `edited`, phần còn lại từ
 * `initial` BẤT KỂ `edited` chở gì. Khối nào `initial` không có thì kết quả cũng
 * không có — người chơi không thêm được một bộ mô phỏng level không khai.
 */
export function mergeCdPolicies(
  initial: CicdCdPolicies,
  edited: CicdCdPolicies,
  editable: readonly CdPolicyPart[],
): CicdCdPolicies {
  return {
    ...(initial.release === undefined
      ? {}
      : { release: mergeRelease(initial.release, edited.release, editable) }),
    ...(initial.gitops === undefined ? {} : { gitops: mergeGitOps(initial.gitops, edited.gitops, editable) }),
    ...(initial.masking === undefined
      ? {}
      : { masking: mergeMasking(initial.masking, edited.masking, editable) }),
  };
}

export type CdSimulatorName = 'release' | 'gitops' | 'masking';

export type LevelCdRun =
  | { readonly ok: true; readonly policies: CicdCdPolicies; readonly records: CicdCdRecords }
  /**
   * Một bộ mô phỏng NÉM vì dữ liệu ngoài miền. `levels/cd-levels.test.ts` chạy mọi
   * kịch bản của mọi level với cả ba bộ chính sách, nên lúc chơi lỗi ở đây chỉ còn
   * đến được từ giá trị người chơi nhập (ví dụ weight 0). Trả về thành một nhánh
   * để giao diện nói ra `message`, không để một ô số làm sập phiên chơi.
   */
  | { readonly ok: false; readonly policies: CicdCdPolicies; readonly simulator: CdSimulatorName; readonly message: string };

function thongDiep(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runLevelCd(cd: CicdLevelCd, edited: CicdCdPolicies): LevelCdRun {
  const policies = mergeCdPolicies(cd.initial, edited, cd.editable);
  const records: {
    release?: NonNullable<CicdCdRecords['release']>;
    gitops?: NonNullable<CicdCdRecords['gitops']>;
    masking?: NonNullable<CicdCdRecords['masking']>;
  } = {};

  if (cd.release !== undefined && policies.release !== undefined) {
    const { scenarios, evaluation } = cd.release;
    const policy = policies.release;
    try {
      records.release = scenarios.map((scenario, index) => ({
        record: simulateRelease(policy, scenario, { ...evaluation, baseSeed: evaluation.baseSeed + index }),
        scenario,
      }));
    } catch (error) {
      return { ok: false, policies, simulator: 'release', message: thongDiep(error) };
    }
  }

  if (cd.gitops !== undefined && policies.gitops !== undefined) {
    const { scenario } = cd.gitops;
    try {
      records.gitops = { record: simulateGitOps(policies.gitops, scenario), scenario };
    } catch (error) {
      return { ok: false, policies, simulator: 'gitops', message: thongDiep(error) };
    }
  }

  if (cd.masking !== undefined && policies.masking !== undefined) {
    try {
      records.masking = { record: renderMaskedLog(policies.masking, cd.masking.scenario) };
    } catch (error) {
      return { ok: false, policies, simulator: 'masking', message: thongDiep(error) };
    }
  }

  return { ok: true, policies, records };
}
