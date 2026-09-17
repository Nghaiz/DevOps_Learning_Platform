/**
 * Chỗ ĐÓNG generic `CicdActionShape` lại bằng kiểu thật của game — 19.J.1.1.
 *
 * Cùng vai với `k8s/contract.ts` § `K8sGameAction = K8sActionShape<ResourceRef>`,
 * và có mặt vì cùng một ràng buộc: `core/run-log.ts` không được nhập từ thư mục
 * game (`cicd/contract.ts` nhập `RunLog` từ đó, nên chiều ngược lại là một vòng),
 * nên `core/` khai hình dạng MỞ và tầng game khoá nó lại.
 *
 * ── Vì sao một file RIÊNG, không đặt trong `contract.ts` ──
 *
 * `CicdGameAction` nay cần HAI kiểu nằm ở hai file khác:
 * `CicdPlayerOverrides` (`hydrate.ts`) và `CicdCdPolicies` (`cd-contract.ts`).
 * Cả hai file đó nhập `contract.ts`.
 *
 * Lý do tách KHÔNG phải "vòng chỉ-kiểu không biên dịch được" — nó biên dịch
 * được, và `contract.ts` ↔ `cd-contract.ts` đã là một vòng như thế. Lý do là
 * TẦNG: `hydrate.ts` là mã hành vi, `contract.ts` là hợp đồng, và một hợp đồng
 * nhập kiểu từ mã hành vi thì người đọc phải biết cách ghép mới hiểu nổi hình
 * dạng dữ liệu. File này là một lá — không ai trong `cicd/` nhập nó — nên nó
 * nhận được cả hai phía mà không đảo tầng của ai.
 *
 * Hệ quả phải biết: `contract.ts` KHÔNG còn tái xuất `CicdGameAction`. Nhập nó
 * từ `./action.ts` (hoặc từ barrel `@devops-platform/games`).
 */

import type { CicdActionShape, RunLog } from '../core/run-log.ts';
import type { CicdCdPolicies } from './cd-contract.ts';
import type { CicdPlayerOverrides } from './hydrate.ts';

/**
 * Hành động của game CI/CD, đã khoá về kiểu thật.
 *
 * Nhánh `evaluate` chở BA mảnh — YAML, bảng núm, chính sách CD — vì cả ba đều
 * đổi kết quả mô phỏng và chỉ mảnh đầu đi qua văn bản. Lý lẽ đầy đủ ở
 * `core/run-log.ts` § `CicdActionShape`.
 */
export type CicdGameAction = CicdActionShape<CicdPlayerOverrides, CicdCdPolicies>;

/**
 * `tick` ở đây là **số lần chấm đã chạy**, không phải tick mô phỏng.
 *
 * Hai đồng hồ khác nhau và trùng tên là một cái bẫy: `RunRecord.finishedTick`
 * đếm tick bên trong một lượt mô phỏng, còn `GameActionBase.tick` đếm hành động
 * của người chơi. Cả hai tất định, nhưng cộng chúng lại thì không ra gì cả.
 */
export type CicdRunLog = RunLog<CicdGameAction>;
