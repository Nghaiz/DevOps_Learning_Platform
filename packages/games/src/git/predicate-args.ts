/**
 * Tham số mà từng vị từ chấm ĐỌC RA — §18.E.2.
 *
 * ## Vì sao bảng này là một bản sao, và vì sao bản sao đó vẫn đúng
 *
 * `evaluatePredicate` đọc tham số qua `argString`/`argNumber`/`argBoolean`/
 * `argLines`, và nó **im lặng** khi thiếu: `argString(args, 'ref')` trả `null`,
 * vị từ trả `false`, và trên màn người soạn thấy một mục tiêu không bao giờ đạt
 * mà không có lấy một dòng nói vì sao. Không có bảng này thì giao diện chỉ dựng
 * được một ô nhập khoá/giá trị tự do, tức đẩy nguyên cái bẫy đó sang người dùng.
 *
 * Nên bảng tồn tại, và nó LÀ một nguồn thứ hai — đúng thứ `development-principles.md`
 * § SSOT cấm. Cách trả giá: ô gác ở `predicate-args.test.ts` đọc THẲNG
 * `packages/games/src/git/predicates.ts`, bóc mọi lời gọi `arg*(args, '<tên>')`
 * trong từng nhánh `case`, rồi đòi bảng dưới đây khớp. Bản sao vẫn là bản sao,
 * nhưng nó không còn TRÔI được trong im lặng: đổi engine mà quên bảng là một ô
 * đỏ nêu đích danh vị từ.
 *
 * ## `graphShapeMatches` không có tham số, và đó không phải sơ suất
 *
 * Nó so với CÂY ĐÍCH, thứ đi vào `evaluatePredicate` qua tham số `target` chứ
 * không qua `args`. Đó cũng là vị từ duy nhất đòi `draft.target`, và
 * `levelDraftIssues` đã có mã lỗi `thieu-cay-dich` riêng cho nó.
 */

import type { ProblemArgSpec } from '../core/problem-plugin.ts';
import type { GitPredicateName } from './contract.ts';

/**
 * ⛔ CHUYỂN NHÀ 2026-09-18 (P20): `apps/web/src/components/games/git/builder/` →
 * `packages/games/src/git/`.
 *
 * Bảng này từng chỉ phục vụ Level Builder của game Git nên nó sống ở tầng web.
 * Nay hợp đồng `GameProblemPlugin.predicateArgs` đòi MỌI game khai bảng của
 * mình — trang soạn bài dựng ô nhập từ đó — và plugin sống trong package này.
 *
 * Kiểu riêng cũ (`ArgKind` / `ArgSpec`) nay là BÍ DANH của kiểu chung
 * `ProblemArgSpec` ở `core/problem-plugin.ts`, không phải một bản khai thứ hai:
 * hai bản cùng hình dạng là đúng chỗ chúng trôi khỏi nhau. Giữ hai tên cũ vì
 * `git-builder.tsx` và ô gác đã gọi chúng, và đổi tên ở đây không mua được gì.
 *
 * `lines` là `argLines`: nhận cả một chuỗi (tự cắt theo xuống dòng) lẫn một mảng
 * chuỗi. Giao diện cho gõ nhiều dòng rồi gửi đi dạng mảng.
 */
export type ArgKind = ProblemArgSpec['kind'];

export type ArgSpec = ProblemArgSpec;

const REF: ArgSpec = { name: 'ref', kind: 'string', optional: false };
const MESSAGE: ArgSpec = { name: 'message', kind: 'string', optional: false };
const PATH: ArgSpec = { name: 'path', kind: 'string', optional: false };

export const PREDICATE_ARGS = {
  graphShapeMatches: [],
  refExists: [REF],
  refAbsent: [REF],
  refsEqual: [
    { name: 'a', kind: 'string', optional: false },
    { name: 'b', kind: 'string', optional: false },
  ],
  refPointsAtMessage: [REF, MESSAGE],
  headDetached: [{ name: 'detached', kind: 'boolean', optional: true }],
  commitCount: [REF, { name: 'count', kind: 'number', optional: false }],
  historyLinear: [REF],
  hasMergeCommit: [REF],
  worktreeFileEquals: [PATH, { name: 'lines', kind: 'lines', optional: false }],
  noConflictMarkers: [PATH],
  worktreeFileExists: [PATH, { name: 'present', kind: 'boolean', optional: true }],
  indexClean: [],
  worktreeClean: [],
  pathStaged: [PATH],
  commitReachable: [MESSAGE],
  commitUnreachable: [MESSAGE],
  commitInStore: [MESSAGE],
  originRefPointsAtMessage: [REF, MESSAGE],
  trackingUpToDate: [REF],
  stashCount: [{ name: 'count', kind: 'number', optional: false }],
  reflogHasOp: [
    // `argString(args, 'ref') ?? 'HEAD'` — bỏ trống thì engine đọc reflog của HEAD.
    { name: 'ref', kind: 'string', optional: true },
    { name: 'op', kind: 'string', optional: false },
  ],
  noPendingOp: [],
  pullRequestState: [
    { name: 'number', kind: 'number', optional: false },
    { name: 'state', kind: 'string', optional: false },
  ],
  tagPointsAtMessage: [
    { name: 'tag', kind: 'string', optional: false },
    MESSAGE,
  ],
} as const satisfies Record<GitPredicateName, readonly ArgSpec[]>;

/**
 * Tham số bắt buộc mà một mục tiêu chưa điền.
 *
 * Trả tên chứ không trả câu: giao diện dựng câu, và tên tham số là định danh của
 * engine nên nó không dịch.
 */
export function missingArgs(
  check: GitPredicateName,
  args: Readonly<Record<string, unknown>> | undefined,
): readonly string[] {
  return PREDICATE_ARGS[check]
    .filter((spec) => !spec.optional && !hasUsableValue(args?.[spec.name], spec.kind))
    .map((spec) => spec.name);
}

/**
 * Giá trị này có qua nổi bộ đọc của engine không.
 *
 * Phép kiểm khớp từng `arg*` một, kể cả chỗ dễ quên: `argNumber` từ chối `NaN` và
 * `Infinity` (`Number.isFinite`), nên một ô số gõ dở dang phải đọc ra là THIẾU
 * chứ không phải đã điền.
 */
function hasUsableValue(value: unknown, kind: ArgKind): boolean {
  switch (kind) {
    case 'string':
      return typeof value === 'string' && value !== '';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'lines':
      return (
        (typeof value === 'string' && value !== '') ||
        (Array.isArray(value) && value.every((line) => typeof line === 'string'))
      );
  }
}
