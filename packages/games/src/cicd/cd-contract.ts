/**
 * Hợp đồng **chương CD** của game Đường ống CI/CD — 19.B.
 *
 * ⛔ LEAD SỞ HỮU FILE NÀY. Ba lane chạy song song code ĐỐI KHÁNG với nó:
 * `release.ts` (19.B.4–B.6), `gitops.ts` (19.B.7–B.8), `masking.ts` (19.B.9).
 * Phần đường ống (19.B.1–B.3: danh tính artifact, cổng phê duyệt, bản ghi phát
 * hành theo môi trường) nằm ở `contract.ts` + `engine.ts` và lead làm. Thấy hợp
 * đồng thiếu gì thì BÁO LEAD, không sửa lén — xem đầu `contract.ts`.
 *
 * Kế hoạch: `plans/devops-learning-platform/phase-19.md` §19.B.
 * SSOT thiết kế: `plans/reports/2026-09-11-brainstorm-git-cicd-games.md` §4.3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỐN QUYẾT ĐỊNH ĐÃ CHỐT (chủ dự án, 2026-09-17)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **1. Đường ống + ba bộ mô phỏng thuần.** Engine CI (`engine.ts`) chỉ thêm
 *    đúng thứ phải xảy ra TRONG vòng xếp lịch — ai cấp sản phẩm cho ai, cổng
 *    phê duyệt. Phát hành, GitOps, che bí mật là ba hàm thuần riêng, mỗi hàm một
 *    file, mỗi hàm một bản ghi. Không hàm nào đọc bản ghi của hàm kia; tầng
 *    chấm gom chúng vào `CicdScoringContext`.
 *
 * **2. Chương CD đếm bằng GIÂY NGUYÊN, không bằng tick.** Tick của CI là 10 giây
 *    (`SECONDS_PER_TICK`), nên "blue-green lùi dưới 5 giây" không viết được bằng
 *    tick — nó thành `0`. Mọi trường thời gian dưới đây mang hậu tố `Seconds`
 *    và là SỐ NGUYÊN; không trường nào ở file này là tick. Trộn hai đơn vị trong
 *    một phép tính là lỗi, không phải quy đổi.
 *
 * **3. Rebuild LUÔN ra danh tính khác.** Danh tính = băm(commit, sản phẩm, stage
 *    đã dựng nó). Đúng với image thật (dấu thời gian, phụ thuộc trôi). Build
 *    tái lập được là kiến thức cho bài lý thuyết, không phải một cờ của engine.
 *
 * **4. Nhiễu canary theo SỐ REQUEST.** Số lỗi mỗi khoảng đo rút từ xấp xỉ nhị
 *    thức theo số request thật mà mỗi nhóm nhận. Weight nhỏ ⇒ ít request ⇒ tỷ lệ
 *    lỗi nhảy mạnh. Đó là bài C21: tín hiệu tách khỏi nhiễu bằng CỠ MẪU, không
 *    bằng nhìn kỹ hơn.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RÀNG BUỘC CHUNG — kế thừa nguyên từ `contract.ts`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - **Lõi trung lập.** Không tên nhà cung cấp CI, không tên công cụ GitOps cụ
 *   thể. `scripts/check-cicd-vendor-neutral.mjs` quét cả thư mục.
 * - **Tất định.** Không `Map`/`Set` trong bản ghi, không `Date.now()`, không
 *   `Math.random()`, không `localeCompare`. Ngẫu nhiên đi qua `core/rng.ts`, rút
 *   theo KHOÁ (`contract.ts` §4 luật 1), không theo một bộ sinh chạy dọc.
 * - **Không `node:*`, không DOM.** Kể cả `btoa`/`Buffer` — tự viết base64.
 * - **Không trường suy ra được.** "Thời gian lùi" là `recoveredAtSecond -
 *   backoutAtSecond`, không phải một trường. Mỗi kiểu bản ghi dưới đây ghi SỰ
 *   KIỆN (lúc nào chuyện gì xảy ra); độ dài, tỷ lệ, số đếm là phép chiếu.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. PHÁT HÀNH — 19.B.4 chiến lược · B.5 mét-ric canary · B.6 lùi hay tiến
// ═══════════════════════════════════════════════════════════════════════════
//
// Một LƯỢT PHÁT HÀNH đưa một bản ứng viên thay cho bản đang chạy trên một đội
// máy, dưới lưu lượng thật. Hai nguồn dữ liệu, hai vai — đúng như
// `WorkflowSpec`/`WorkloadSpec` ở chương CI:
//
//   ReleasePolicy   — NGƯỜI CHƠI chọn: chiến lược, tham số canary, lùi hay tiến.
//   ReleaseScenario — LEVEL cấp: đội máy, lưu lượng, bản ứng viên TỐT hay XẤU,
//                     tốc độ hạ tầng. Người chơi không sửa được và không nhìn
//                     thấy `candidateErrorRate` trực tiếp — đọc nó qua mét-ric
//                     chính là bài học.

import type { ReleaseStrategy } from './contract.ts';

export interface CanaryPolicy {
  /** % lưu lượng dồn vào bản ứng viên trong lúc phân tích. 1..50, số nguyên. */
  readonly weightPercent: number;
  /** Độ dài MỘT khoảng đo, giây. ≥ 1. */
  readonly intervalSeconds: number;
  /** Số khoảng đo trước khi quyết. ≥ 1. Cửa sổ = `intervalSeconds × intervals`. */
  readonly intervals: number;
  /**
   * Ngưỡng hủy: tỷ lệ lỗi GỘP của canary trừ tỷ lệ lỗi GỘP của nhóm đối chứng
   * trên cả cửa sổ, vượt ngưỡng này ⇒ lùi. Phân số, 0..1 (`0.01` = 1 điểm %).
   *
   * ⚠ So HIỆU với nhóm đối chứng CÙNG khoảng đo, không so với một hằng số tuyệt
   * đối: lỗi nền của cả hệ dao động, và một ngưỡng tuyệt đối sẽ hủy bản tốt vào
   * đúng lúc nền xấu đi.
   */
  readonly maxErrorRateDelta: number;
}

export interface RollingPolicy {
  /** Số máy thay mỗi đợt. 1..instances. */
  readonly batchSize: number;
}

export const BAD_RELEASE_RESPONSES = ['rollback', 'roll-forward'] as const;

export type BadReleaseResponse = (typeof BAD_RELEASE_RESPONSES)[number];

export interface ReleasePolicy {
  readonly strategy: ReleaseStrategy;
  /** Bắt buộc khi `strategy === 'canary'`, bị bỏ qua ở chiến lược khác. */
  readonly canary?: CanaryPolicy;
  /** Bắt buộc khi `strategy === 'rolling'`, bị bỏ qua ở chiến lược khác. */
  readonly rolling?: RollingPolicy;
  /** Khi phát hiện bản ứng viên xấu: lùi về bản cũ, hay dựng bản sửa rồi tiến. */
  readonly onBadRelease: BadReleaseResponse;
}

export const MIGRATION_KINDS = ['none', 'reversible', 'irreversible'] as const;

export type MigrationKind = (typeof MIGRATION_KINDS)[number];

export interface ReleaseScenario {
  /** Số máy của bản đang chạy. ≥ 1. */
  readonly instances: number;
  /** Request mỗi giây vào CẢ đội máy. ≥ 1. */
  readonly requestsPerSecond: number;
  /** Tỷ lệ lỗi của bản đang chạy, 0..1. */
  readonly baselineErrorRate: number;
  /**
   * Tỷ lệ lỗi THẬT của bản ứng viên, 0..1. SỰ THẬT của level.
   *
   * Bản ứng viên **xấu** ⇔ `candidateErrorRate > baselineErrorRate`. Không có
   * vùng xám nào ở tầng hợp đồng: level muốn dạy "gần như bằng nhau" thì đặt hai
   * số sát nhau và để nhiễu làm phần còn lại.
   */
  readonly candidateErrorRate: number;
  /** Giây để một máy mới khởi động xong và nhận lưu lượng. ≥ 1. */
  readonly replaceSeconds: number;
  /** Giây để đổi bộ chọn lưu lượng giữa hai môi trường (blue-green). ≥ 1. */
  readonly switchSeconds: number;
  /** Giây để một thay đổi trọng số lưu lượng có hiệu lực (canary). ≥ 1. */
  readonly routeSeconds: number;
  /**
   * Giây từ lúc bản ứng viên nhận TOÀN BỘ lưu lượng tới lúc cảnh báo kêu —
   * dùng cho rolling và blue-green, vốn không có giai đoạn phân tích riêng.
   * Chỉ áp khi bản ứng viên xấu. ≥ 1.
   */
  readonly alertSeconds: number;
  readonly migration: MigrationKind;
  /** Giây để dựng + đẩy một bản sửa (đường tiến). ≥ 1. */
  readonly fixForwardSeconds: number;
}

/** Một khoảng đo canary. Số đếm thô, không tỷ lệ — tỷ lệ là phép chiếu. */
export interface CanaryIntervalRecord {
  /** Đếm từ 0. */
  readonly index: number;
  readonly startSecond: number;
  readonly canaryRequests: number;
  readonly canaryErrors: number;
  readonly baselineRequests: number;
  readonly baselineErrors: number;
}

export const RELEASE_OUTCOMES = [
  /** Bản ứng viên thay xong và ở lại. Có thể là bản XẤU lọt qua — đọc `ReleaseScenario`. */
  'promoted',
  /** Phát hiện xấu (hoặc tưởng là xấu), lùi về bản cũ. */
  'rolled-back',
  /** Phát hiện xấu, dựng bản sửa rồi tiến. */
  'rolled-forward',
  /**
   * Chọn lùi, nhưng migration không lùi được ⇒ bản cũ chạy trên lược đồ mới.
   * Sự cố dữ liệu; phục hồi thật chỉ tới khi bản sửa lên (`fixForwardSeconds`).
   */
  'rollback-blocked',
] as const;

export type ReleaseOutcome = (typeof RELEASE_OUTCOMES)[number];

/**
 * Một lượt phát hành, ghi bằng SỰ KIỆN.
 *
 * ⛔ Không có `rollbackSeconds`, `exposureSeconds`, `badReleaseEscaped`. Cả ba
 * suy ra: `recoveredAtSecond - backoutAtSecond`; khoảng bản ứng viên còn nhận
 * lưu lượng; `outcome === 'promoted' && candidate xấu`.
 */
export interface ReleasePassRecord {
  /** Đếm từ 0. Đi vào khoá rút ngẫu nhiên. */
  readonly pass: number;
  readonly outcome: ReleaseOutcome;
  /** Rỗng khi chiến lược không phải canary. */
  readonly intervals: readonly CanaryIntervalRecord[];
  /**
   * Giây bản ứng viên bắt đầu nhận lưu lượng thật. Canary: sau `routeSeconds`.
   * Rolling: sau đợt máy đầu khởi động xong. Blue-green: sau khi môi trường mới
   * dựng xong VÀ bộ chọn đã đổi.
   */
  readonly exposedAtSecond: number;
  /**
   * Giây quyết định rút bản ứng viên (hủy canary, hoặc cảnh báo kêu). `null` khi
   * `outcome === 'promoted'`.
   */
  readonly backoutAtSecond: number | null;
  /**
   * Giây bản ứng viên thôi nhận lưu lượng lỗi: lùi xong, hoặc bản sửa đã lên.
   * `null` khi `outcome === 'promoted'`.
   *
   * ⚠ Với `'rollback-blocked'`: mốc bản sửa lên, KHÔNG phải mốc lùi xong — lùi
   * xong mà dữ liệu hỏng thì chưa phục hồi gì cả.
   */
  readonly recoveredAtSecond: number | null;
  /** Giây lượt phát hành kết thúc hẳn (thay xong, hoặc phục hồi xong). */
  readonly finishedAtSecond: number;
  /** Số máy cao nhất chạy CÙNG LÚC. Chi phí tài nguyên của chiến lược. */
  readonly peakInstances: number;
}

export interface ReleaseEvaluationSpec {
  readonly baseSeed: number;
  /** ≥ 1. Canary cần nhiều lượt để thấy tỷ lệ hủy nhầm / lọt lưới. */
  readonly passes: number;
}

export interface ReleaseRecord {
  readonly baseSeed: number;
  /**
   * `null` = chạy được. Khác `null` ⇒ `passes` rỗng. Chính sách thiếu phần của
   * chiến lược nó chọn (canary mà không có `canary`) là lỗi CỨNG, không phải
   * mặc định ngầm — một mặc định ngầm là một bài làm được chấm bằng tham số
   * người chơi chưa từng chọn.
   */
  readonly error: { readonly kind: 'missing-strategy-params'; readonly strategy: ReleaseStrategy } | null;
  readonly passes: readonly ReleasePassRecord[];
}

/*
 * LUẬT MÔ PHỎNG — `release.ts` PHẢI theo, và `release.test.ts` ghim từng luật.
 *
 * R1. Rolling. `ceil(instances / batchSize)` đợt; đợt k (đếm từ 0) bắt đầu ở giây
 *     `k × replaceSeconds` và xong ở `(k+1) × replaceSeconds`. Mỗi đợt tạm thêm
 *     `batchSize` máy (mới lên trước, cũ tắt sau) ⇒ `peakInstances = instances +
 *     batchSize`. `exposedAtSecond = replaceSeconds`. Bản xấu: `backoutAtSecond =
 *     exposedAtSecond + alertSeconds`; số đợt ĐÃ BẮT ĐẦU tới lúc đó =
 *     `min(tổng đợt, floor(backoutAtSecond / replaceSeconds) + 1)`, đợt dở dang
 *     được coi là đã đổi; lùi = chạy lại đúng ngần ấy đợt: `số đợt ×
 *     replaceSeconds`.
 * R2. Blue-green. Dựng đủ `instances` máy mới song song: `replaceSeconds`, rồi
 *     đổi bộ chọn: `switchSeconds`. `peakInstances = 2 × instances`. Bản xấu:
 *     `backoutAtSecond = exposedAtSecond + alertSeconds`; lùi = đổi bộ chọn về:
 *     `switchSeconds` (môi trường cũ còn nguyên).
 * R3. Canary. Dựng `ceil(instances × weightPercent / 100)` máy: `replaceSeconds`,
 *     đổi trọng số: `routeSeconds` ⇒ `exposedAtSecond`. Rồi `intervals` khoảng
 *     đo. Cuối cửa sổ: hiệu tỷ lệ lỗi gộp > `maxErrorRateDelta` ⇒ hủy,
 *     `backoutAtSecond` = cuối cửa sổ, lùi = trọng số về 0: `routeSeconds`.
 *     Ngược lại ⇒ thăng hạng: thay số máy cũ còn lại theo kiểu rolling với
 *     `batchSize = số máy canary` (mỗi đợt `replaceSeconds`), `outcome =
 *     'promoted'`. Nhờ vậy `peakInstances = instances + số máy canary` suốt cả
 *     lượt — canary rẻ hơn blue-green chính vì nó không bao giờ dựng đủ đội máy
 *     thứ hai.
 *     ⚠ Canary quyết TRÊN SỐ LIỆU, không trên sự thật: hủy nhầm bản tốt và cho
 *     lọt bản xấu đều là kết cục hợp lệ, và đó là thứ level đếm.
 * R4. Nhiễu. Mỗi khoảng đo: `canaryRequests = round(rps × intervalSeconds ×
 *     weight)`, `baselineRequests = round(rps × intervalSeconds) -
 *     canaryRequests`. Số lỗi = xấp xỉ chuẩn của nhị thức `(n, p)`: `round(n·p +
 *     z·sqrt(n·p·(1-p)))`, kẹp về `[0, n]`, với `z` = tổng 12 lần rút liên tiếp
 *     trừ 6 (Irwin–Hall, phương sai 1). Khoá rút:
 *     `${baseSeed}|release|${pass}|${index}|${'canary'|'baseline'}` băm bằng
 *     `hashDrawKey` (`rng-keys.ts`) — DÙNG LẠI, không viết hàm băm thứ hai.
 *     ⛔ SỬA 2026-09-17 (lead): bản đầu ghi Box–Muller. `Math.log`/`Math.cos`/
 *     `Math.exp`/`Math.pow` được ECMAScript cho phép lệch giữa các engine, nên
 *     Node (chấm lại OJ) và Safari (người chơi) có thể ra hai số lỗi khác nhau.
 *     Không phép tính nào trên đường nhiễu được dùng các hàm đó; `Math.sqrt` thì
 *     được (phép cơ bản IEEE 754, làm tròn đúng).
 * R5. Lùi hay tiến, chỉ áp khi đã quyết rút:
 *     - `'roll-forward'` ⇒ `outcome = 'rolled-forward'`,
 *       `recoveredAtSecond = backoutAtSecond + fixForwardSeconds`.
 *     - `'rollback'` và `migration === 'irreversible'` ⇒ `'rollback-blocked'`,
 *       `recoveredAtSecond = backoutAtSecond + fixForwardSeconds` (xem
 *       `ReleasePassRecord.recoveredAtSecond`).
 *     - `'rollback'` còn lại ⇒ `'rolled-back'`,
 *       `recoveredAtSecond = backoutAtSecond + thời gian lùi của chiến lược`.
 * R6. Bản TỐT dưới rolling/blue-green không bao giờ bị rút (không có cảnh báo
 *     giả ở hai chiến lược đó — chúng không có giai đoạn phân tích để sai).
 *
 * AC-B (phase-19): cùng một `ReleaseScenario` với bản xấu, `onBadRelease:
 * 'rollback'`, `migration: 'none'`, thời gian lùi xếp đúng thứ tự
 * blue-green < canary < rolling.
 *
 * ⚠ Nói thật về chỗ thứ tự đó đến từ đâu, để test không khẳng định quá tay:
 * - canary/blue-green < rolling là CƠ CHẾ — một thao tác định tuyến có độ dài
 *   KHÔNG đổi, còn rolling tỷ lệ với số máy đã đổi. Test PHẢI đo thêm: nhân đôi
 *   `instances` ⇒ lùi rolling dài ra, lùi hai chiến lược kia KHÔNG đổi.
 * - blue-green < canary là DỮ LIỆU của kịch bản (`switchSeconds <
 *   routeSeconds`, theo thiết kế §4.3: "dưới 5 giây" và "dưới 30 giây"). Test
 *   ghi rõ điều đó thay vì trình bày như một định lý của engine.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 2. GITOPS — 19.B.7 vòng đối soát · B.8 tự sửa + danh sách loại trừ
// ═══════════════════════════════════════════════════════════════════════════

export interface GitOpsPolicy {
  /** Chu kỳ đối soát, giây. ≥ 1. Đối soát chạy ở giây `k × reconcileEverySeconds`, k ≥ 1. */
  readonly reconcileEverySeconds: number;
  /** Tự đưa trạng thái sống về trạng thái khai trong git khi phát hiện lệch. */
  readonly selfHeal: boolean;
  /** Trường KHÔNG đối soát — lệch ở đây không bị phát hiện, không bị sửa. */
  readonly ignoreFields: readonly string[];
}

export const GITOPS_ACTORS = ['git', 'human', 'controller'] as const;

export type GitOpsActor = (typeof GITOPS_ACTORS)[number];

/**
 * Một thay đổi.
 *
 * - `'git'` — một commit đổi TRẠNG THÁI KHAI của trường. Trạng thái sống chỉ
 *   theo khi đối soát kế tiếp chạy (đồng bộ tự động luôn bật; `selfHeal` KHÔNG
 *   quyết chuyện này).
 * - `'human'` — ai đó sửa tay trạng thái SỐNG. Lệch.
 * - `'controller'` — một bộ điều khiển trong cụm sửa trạng thái sống, và NÓ SẼ
 *   SỬA LẠI sau mỗi `reassertEverySeconds` nếu bị đè. Đây là bài C25: tự sửa
 *   bật mà không loại trừ trường đó thì hai bên giành nhau mãi.
 */
export interface GitOpsChange {
  readonly atSecond: number;
  readonly actor: GitOpsActor;
  readonly field: string;
  readonly value: string;
  /** Chỉ cho `'controller'`. ≥ 1. */
  readonly reassertEverySeconds?: number;
}

export interface GitOpsScenario {
  /** Mô phỏng tới hết giây này (bao gồm). ≥ 1. */
  readonly horizonSeconds: number;
  /** Trạng thái khai ban đầu. Trạng thái sống ban đầu khớp với nó. */
  readonly initial: readonly { readonly field: string; readonly value: string }[];
  readonly changes: readonly GitOpsChange[];
}

/**
 * Một đoạn trạng thái sống KHÁC trạng thái khai trên một trường.
 *
 * ⛔ Không có `durationSeconds`: `endedAtSecond - startedAtSecond`, và
 * `endedAtSecond === null` nghĩa là còn lệch tới hết `horizonSeconds`.
 */
export interface DriftRecord {
  readonly field: string;
  /** Ai gây lệch. `'git'` = khai đổi mà sống chưa kịp theo. */
  readonly cause: GitOpsActor;
  readonly startedAtSecond: number;
  /** Lần đối soát đầu tiên THẤY đoạn lệch này. `null` = chưa lần nào (bỏ qua, hoặc hết giờ). */
  readonly detectedAtSecond: number | null;
  readonly endedAtSecond: number | null;
  /**
   * `'reconcile'` = đối soát đưa sống về khai (tự sửa, hoặc đồng bộ commit).
   * `'overwritten'` = một thay đổi khác làm sống khớp khai trở lại.
   */
  readonly endedBy: 'reconcile' | 'overwritten' | null;
}

export interface GitOpsRecord {
  readonly drifts: readonly DriftRecord[];
  /** Mọi giây đối soát đã chạy, tăng dần. Ghi vì tầng 3D vẽ nhịp này. */
  readonly reconcileSeconds: readonly number[];
}

/*
 * LUẬT MÔ PHỎNG — `gitops.ts` PHẢI theo.
 *
 * G1. Trong CÙNG một giây: mọi thay đổi của giây đó áp TRƯỚC (theo thứ tự
 *     `actor` git < human < controller, rồi `field` so mã đơn vị, rồi thứ tự
 *     mảng), đối soát chạy SAU. Hệ quả: một thay đổi tay ở đúng giây đối soát
 *     bị phát hiện ngay ở giây đó. Ghi luật này vào test, vì chọn ngược lại cũng
 *     "tất định" mà cho số khác một chu kỳ.
 * G2. Đối soát ở giây s, mỗi trường KHÔNG nằm trong `ignoreFields`:
 *     - khai đổi từ lần đồng bộ trước ⇒ sống := khai (đồng bộ), đóng đoạn lệch
 *       `'git'` với `endedBy: 'reconcile'`;
 *     - sống ≠ khai do `'human'`/`'controller'` ⇒ đánh dấu `detectedAtSecond`
 *       (nếu chưa); `selfHeal` ⇒ sống := khai, đóng đoạn lệch `'reconcile'`.
 * G3. `ignoreFields`: không phát hiện, không sửa, không đồng bộ commit cho trường
 *     đó. Đoạn lệch vẫn được GHI (có thật), với `detectedAtSecond: null`.
 * G4. Bộ điều khiển: sau khi bị đè ở giây s, nó đặt lại giá trị của nó ở giây
 *     `s + reassertEverySeconds` — mở một đoạn lệch MỚI. Số đoạn lệch
 *     `'controller'` bị `'reconcile'` đóng chính là số lần giành nhau (phép chiếu).
 * G5. Một thay đổi làm sống khớp khai trở lại (ví dụ người sửa tay rồi tự hoàn
 *     tác) đóng đoạn lệch với `endedBy: 'overwritten'`.
 *
 * AC-B (phase-19): `selfHeal: true`, một thay đổi `'human'` ở giây t không trùng
 * nhịp đối soát ⇒ đoạn lệch dài ĐÚNG `ceil(t / P) × P - t` giây, P = chu kỳ. Test
 * ghim thêm ca t trùng nhịp (dài 0, theo G1) và ca `selfHeal: false` (không đóng).
 *
 * LÀM RÕ SAU KHI HIỆN THỰC (lead, 2026-09-17 — đọc cùng `gitops.ts`):
 * - Công thức AC-B chỉ đúng với t > 0. Nhịp là k × P với k ≥ 1, nên giây 0 KHÔNG
 *   phải nhịp, và thay đổi ở giây 0 lệch đúng P giây chứ không phải 0.
 * - Một thay đổi giữ trường vẫn lệch (3 → 5 rồi 5 → 7) không tách đoạn lệch;
 *   `cause` là của kẻ mở đoạn. Hai cách kết thúc đều đòi sống khớp khai trở lại.
 * - Đồng bộ commit ở G2 đóng đoạn lệch ĐANG MỞ bất kể ai gây ra: đồng bộ đè giá
 *   trị sống bằng giá trị khai mới, nên một chỉnh tay cũng bị đè theo.
 * - "Khai đổi từ lần đồng bộ trước" so theo GIÁ TRỊ: commit rồi hoàn tác trước
 *   nhịp kế tiếp thì không có gì để đồng bộ.
 * - Mỗi trường có TỐI ĐA MỘT thay đổi `'controller'` — hai bộ điều khiển, hay một
 *   bộ đổi giá trị của nó, chưa có luật và bị từ chối (ném). Đủ cho bài C25.
 * - Bản ghi không có trường lỗi (khác `ReleaseRecord.error`), nên dữ liệu kịch
 *   bản sai thì NÉM: chu kỳ/horizon không nguyên hoặc < 1, `atSecond` ngoài
 *   `[0, horizonSeconds]`, trường không có trong `initial` hoặc khai trùng,
 *   `reassertEverySeconds` thiếu ở controller hay có mặt ở actor khác.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 3. CHE BÍ MẬT TRONG LOG — 19.B.9
// ═══════════════════════════════════════════════════════════════════════════

export const SECRET_FORMS = ['raw', 'base64', 'url', 'reversed'] as const;

/**
 * Dạng một bí mật xuất hiện trong log.
 *
 * Bộ che chỉ biết CHUỖI ĐÃ ĐĂNG KÝ. Bí mật đi qua một phép biến đổi là một chuỗi
 * khác, và lọt nguyên vẹn — đó là chỗ rò thật, không phải lỗi của bộ che.
 * `'url'` = mã hoá phần trăm theo RFC 3986 (chỉ giữ nguyên `A-Za-z0-9-._~`).
 */
export type SecretForm = (typeof SECRET_FORMS)[number];

export interface SecretSpec {
  readonly id: string;
  /** ASCII in được, ≥ 4 ký tự. Level cấp. */
  readonly value: string;
}

/**
 * Một dòng log, dạng mẫu. `{{id}}` chèn bí mật dạng thô, `{{id|form}}` chèn dạng
 * đã biến đổi. `split: true` ⇒ chèn NỬA ĐẦU giá trị (đã biến đổi) ở dòng này và
 * nửa sau ở dòng KẾ TIẾP — rò kiểu "in theo từng mảnh".
 */
export interface LogLineTemplate {
  readonly text: string;
  readonly split?: boolean;
}

export interface MaskingScenario {
  readonly secrets: readonly SecretSpec[];
  readonly lines: readonly LogLineTemplate[];
}

/** Người chơi chọn đăng ký che những dạng nào của những bí mật nào. */
export interface MaskingPolicy {
  readonly masked: readonly { readonly secret: string; readonly form: SecretForm }[];
}

export interface SecretLeak {
  /** Đếm từ 0, theo dòng ĐÃ dựng (sau khi tách `split`). */
  readonly line: number;
  readonly secret: string;
  readonly form: SecretForm;
  /** `true` = chỉ lộ khi ghép dòng này với dòng kế tiếp. */
  readonly acrossLines: boolean;
}

export interface MaskingRecord {
  /** Log sau khi che, đúng thứ người xem thấy. */
  readonly lines: readonly string[];
  readonly leaks: readonly SecretLeak[];
}

/*
 * LUẬT — `masking.ts` PHẢI theo.
 *
 * M1. Dựng log: thay mọi `{{id}}` / `{{id|form}}` theo dạng. Mẫu nhắc bí mật
 *     không tồn tại là lỗi CỨNG (ném) — dữ liệu level sai, không phải một dòng
 *     trống.
 * M2. Che: với mỗi mục `masked`, thay MỌI lần xuất hiện của chuỗi (dạng đã biến
 *     đổi) bằng `***`. Mục dài trước, rồi `secret` so mã đơn vị, rồi `form` —
 *     để một giá trị là chuỗi con của giá trị khác không che dở dang.
 * M3. Rò: sau khi che, với mọi bí mật × mọi dạng trong `SECRET_FORMS`, một dòng
 *     còn chứa chuỗi đó ⇒ một `SecretLeak` (`acrossLines: false`). Ghép dòng i
 *     với dòng i+1 (không ký tự nối) còn chứa chuỗi mà KHÔNG dòng nào chứa riêng
 *     ⇒ `acrossLines: true` ở dòng i. Sắp theo (line, secret, form).
 * M4. Không có dạng nào "gần đúng": khớp là khớp chuỗi chính xác.
 *
 * LÀM RÕ SAU KHI HIỆN THỰC (lead, 2026-09-17 — đọc cùng `masking.ts`):
 * - "rồi `form`" ở M2 và "(line, secret, form)" ở M3 so `form` bằng MÃ ĐƠN VỊ,
 *   không theo vị trí trong `SECRET_FORMS` — ràng buộc 2 của `contract.ts`. Khác
 *   biệt nhìn thấy được: bí mật `abcd`, che cả `reversed` lẫn `url`, dòng
 *   `abcdcba` ra `abc***`. `masking.test.ts` ghim ca đó.
 * - `leakCount` đếm MỤC `SecretLeak` (dòng × bí mật × dạng), không đếm dòng. Một
 *   giá trị không có ký tự cần mã hoá cho `url` trùng `raw`, nên một chỗ lộ đếm
 *   thành hai mục — đúng, vì cả hai dạng đều thật sự lọt.
 * - Lỗi CỨNG thêm vào, cùng tinh thần M1 (bản ghi không có trường lỗi nên chỉ
 *   có ném hoặc im): id bí mật trùng; mục che trỏ bí mật/dạng không tồn tại;
 *   `split: true` mà không có chỗ chèn nào; `\n`/`\r` trong mẫu (che mất phép
 *   dò rò qua dòng); hơn một `|` trong chỗ chèn.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 4. CHỮ KÝ — ba cửa vào, mỗi file một cửa
// ═══════════════════════════════════════════════════════════════════════════
//
// `release.ts`  export function simulateRelease(policy: ReleasePolicy, scenario: ReleaseScenario, evaluation: ReleaseEvaluationSpec): ReleaseRecord
// `gitops.ts`   export function simulateGitOps(policy: GitOpsPolicy, scenario: GitOpsScenario): GitOpsRecord
// `masking.ts`  export function renderMaskedLog(policy: MaskingPolicy, scenario: MaskingScenario): MaskingRecord
//
// Ba hàm THUẦN: không đọc hàm nào khác trong ba hàm, không đọc `engine.ts`. Phép
// chiếu (thời gian lùi, số lần giành nhau, số dòng rò) đặt trong CÙNG file với
// hàm của nó, export, và có test riêng — `predicates.ts` (lead) gọi chúng.
export type CdSimulators = {
  readonly simulateRelease: (
    policy: ReleasePolicy,
    scenario: ReleaseScenario,
    evaluation: ReleaseEvaluationSpec,
  ) => ReleaseRecord;
  readonly simulateGitOps: (policy: GitOpsPolicy, scenario: GitOpsScenario) => GitOpsRecord;
  readonly renderMaskedLog: (policy: MaskingPolicy, scenario: MaskingScenario) => MaskingRecord;
};
