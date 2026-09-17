/**
 * Bảng tham số vị từ CI/CD ở hình dạng chung của hợp đồng plugin — P20.
 *
 * ## Vì sao là một phép CHIẾU, không phải một bảng thứ hai
 *
 * `CICD_PREDICATE_ARGS` (`predicates.ts` §4) đã là SSOT và `validateObjectiveArgs`
 * chấm bằng chính nó. Gõ lại 27 dòng ở đây dưới tên khác là dựng một bản sao sẽ
 * trôi — và chỗ trôi đúng là "giao diện đòi một tham số bộ chấm không đọc", hoặc
 * ngược lại. Nên file này CHIẾU bảng gốc sang hình dạng `ProblemArgSpec`, và
 * `predicate-args-plugin.test.ts` ghim rằng phép chiếu phủ đúng mọi tên.
 *
 * ## `optional: false` cho MỌI tham số, và đó là sự thật chứ không phải mặc định
 *
 * `validateObjectiveArgs` (`predicates.ts`) đòi ĐỦ mọi tham số trong bảng: thiếu
 * một cái là `CE` ngay ở `gradeCicdProblem`, không phải một vị từ trả `false`.
 * Nên ở game này không có tham số tuỳ chọn nào, và khai `optional: true` sẽ là
 * giao diện hứa một thứ bộ chấm từ chối.
 *
 * Khác hẳn game Git: ở đó engine đọc `argBoolean(...) ?? true`, tức có mặc định
 * thật, nên bảng của nó có `optional: true` ở vài chỗ.
 */

import type { ProblemArgSpec, ProblemPredicateArgs } from '../core/problem-plugin.ts';
import { CICD_PREDICATE_ARGS } from './predicates.ts';

/** `CicdPredicateArgSpec` → `ProblemArgSpec`. Xem khối đầu file về `optional`. */
function chieu(specs: readonly { readonly key: string; readonly kind: 'string' | 'number'; readonly oneOf?: readonly string[] }[]): readonly ProblemArgSpec[] {
  return specs.map((spec) => ({
    name: spec.key,
    kind: spec.kind,
    optional: false,
    ...(spec.oneOf === undefined ? {} : { oneOf: spec.oneOf }),
  }));
}

export const CICD_PLUGIN_PREDICATE_ARGS: ProblemPredicateArgs = Object.fromEntries(
  Object.entries(CICD_PREDICATE_ARGS).map(([name, specs]) => [name, chieu(specs)]),
);
