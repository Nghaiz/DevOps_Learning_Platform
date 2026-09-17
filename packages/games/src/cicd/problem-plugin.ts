/**
 * Phần RIÊNG của game CI/CD trong hệ OJ đa-game — §19.H, theo hợp đồng §18.A.3.
 *
 * Game thứ ba cắm vào bảng đăng ký. Trước file này, `gameId: 'cicd'` bị chặn ở
 * BA chỗ cùng lúc và không chỗ nào nói ra là vì sao: biên ghi
 * (`apps/web/src/server/problems/validate.ts`) từ chối lưu, `problemPluginMeta`
 * trả `null`, còn `gradeProblemRun` ném `UnknownProblemGameError`. Ba cửa đóng
 * vì cùng MỘT nguyên nhân — không có plugin — nên mở đúng một chỗ là đủ.
 *
 * ── BỐN QUYẾT ĐỊNH, CẢ BỐN ĐỀU CÓ LÝ DO ĐO ĐƯỢC ──
 *
 * 1. **`Spec` là một BỘ BA, không phải `WorkflowSpec` trần.** Đây là khác biệt
 *    lớn nhất so với hai plugin trước. `evaluate(workflow, workload, evaluation)`
 *    cần ba thứ, mà YAML chỉ chở được thứ nhất — hợp đồng nói thẳng ở
 *    `WorkflowSpec`: *"KHÔNG chứa số máy chạy, không chứa dòng commit, không
 *    chứa đầu vào nào biến động. Ba thứ đó là dữ liệu level"*. Một bài OJ không
 *    có level nào đứng sau, nên chính BÀI phải chở hai mảnh còn lại. Đó cũng
 *    đúng hình dạng `CicdLevel` đang mang (`initialWorkflow` + `workload` +
 *    `evaluation`), nên không phải một cấu trúc mới, chỉ là cùng một bộ ba đổi
 *    chỗ đứng.
 *
 *    Hệ quả nếu làm khác: `Spec = WorkflowSpec` thì bộ chấm phải bịa ra một
 *    workload mặc định, và mọi bài đo lead time / thông lượng / runner-phút sẽ
 *    chấm trên một đội máy chạy mà người soạn chưa từng khai — ba trục điểm ra
 *    số, chỉ là số của một thế giới khác.
 *
 * 2. **`record.error !== null` KHÔNG phải `CE`.** Một workflow có chu trình làm
 *    `evaluate()` trả `EvaluationRecord` mang `error.kind === 'cycle'` và
 *    `passes` rỗng. Cám dỗ là gọi đó là "chạy không tới nơi" ⇒ `CE`. Sai, và
 *    sai ở đúng chỗ quan trọng nhất: `graphAcyclic` là một vị từ THẬT, đọc
 *    `ctx.workflow` bằng `findCycle` chứ không đọc bản ghi, và nó tồn tại để
 *    chấm đúng cái đầu vào có vòng đó. Trả `CE` ở đó là biến một bài "hãy gỡ
 *    vòng phụ thuộc" thành một bài không bao giờ chấm được — và người làm nhận
 *    một thông điệp nói bài soạn hỏng trong khi bài hoàn toàn đúng.
 *
 *    `CE` ở đây giữ đúng nghĩa hợp đồng đặt cho nó: **bài soạn hỏng** hoặc
 *    **YAML người làm gõ không đọc được**. Một đồ thị đọc được nhưng chạy không
 *    được là một câu trả lời SAI, tức `WA`.
 *
 * 3. **`seedSpec` vắng mặt** ⇒ mọi bài CI/CD buộc `seedable: false`, đúng như
 *    hai plugin trước. Engine CI/CD có tất định riêng của nó
 *    (`EvaluationSpec.baseSeed`), nhưng đó là hạt giống của phép MÔ PHỎNG, không
 *    phải hạt giống sinh ĐỀ: đổi `baseSeed` cho ra cùng một đồ thị, cùng một
 *    workload, cùng một câu hỏi. Khai một `seedSpec` chỉ đổi `baseSeed` sẽ làm
 *    cổng §18.G.3 cho kỳ thi `per-student` chạy trong khi mọi sinh viên nhận
 *    cùng một đề — đúng lời nói dối mà `core/problem-plugin.ts` cấm.
 *
 * 4. **Vị từ không chấm được bị chặn, nhưng ở HAI tầng khác nhau.**
 *    Khai một tên mà mọi lượt nộp sẽ trượt là mời người soạn dựng một bài không
 *    ai giải được, không ai biết vì sao. Hai loại "không chấm được", hai chỗ gác:
 *
 *    | Loại | Gác ở đâu | Vì sao ở đó |
 *    |---|---|---|
 *    | chưa có hiện thực (`UNIMPLEMENTED_CICD_PREDICATES`, rỗng từ 19.B) | `predicateNames` | đúng-sai với MỌI bài, nên một danh sách tĩnh nói đủ |
 *    | cần kịch bản CD (`CD_PREDICATE_NEEDS`) | `grade`, theo từng bài | phụ thuộc bài CÓ khối `cd` nào; `predicateNames` không biết bài nào |
 *
 *    ⛔ ĐỔI Ở 19.J: trước đợt này tám vị từ CD bị trừ thẳng khỏi `predicateNames`,
 *    vì bộ ba của bài OJ không chở kịch bản nào. `CicdProblemSpec.cd` nay chở,
 *    nên lệnh cấm phẳng đó đã thành sai — nó khoá đúng nửa game mà chương CD mở
 *    ra. Phép gác không mất đi, nó chuyển xuống `grade` và hỏi một câu hẹp hơn:
 *    *bài NÀY có khối kịch bản mà vị từ NÀY đọc không.*
 *
 * 5. **Ba mảnh của một lượt nộp đi cùng nhau hoặc không đi** (19.J). `evaluate`
 *    chở YAML + `overrides` + `cd`, vì cả ba đổi kết quả mô phỏng và chỉ mảnh đầu
 *    đi qua văn bản. Ghép YAML của lượt này với núm của lượt kia là chấm một lượt
 *    chơi chưa từng xảy ra — xem `luotNopCuoiCung`.
 */

import type { AuthorField, GameProblemPlugin } from '../core/problem-plugin.ts';
import type { GradeResult, Testcase } from '../core/problem.ts';
import { problemVerdictOf, type ProblemFailureCode } from '../core/problem.ts';
import { CICD_PLUGIN_PREDICATE_ARGS } from './predicate-args-plugin.ts';
import { CICD_PROBLEM_TOPICS } from '../problem-topic-labels.ts';
import type { CicdGameAction } from './action.ts';
import type { CicdCdPolicies, CicdLevelCd } from './cd-contract.ts';
import { runLevelCd } from './cd-run.ts';
import type {
  CicdObjective,
  CicdPredicateName,
  EvaluationSpec,
  WorkflowSpec,
  WorkloadSpec,
} from './contract.ts';
import { CICD_PREDICATE_NAMES, DEFAULT_EVALUATION_PASSES, EDITABLE_PARTS } from './contract.ts';
import { evaluate } from './engine.ts';
import type { CicdPlayerOverrides } from './hydrate.ts';
import { hydrateWorkflow } from './hydrate.ts';
import { checkJobShapes } from './job-shapes.ts';
import type { CicdCdRecords, CicdScoringContext } from './predicates.ts';
import {
  CD_PREDICATE_NEEDS,
  UNIMPLEMENTED_CICD_PREDICATES,
  checkObjective,
  validateObjectiveArgs,
} from './predicates.ts';
import { readWorkflowYaml } from './yaml-read.ts';

// ── Định danh ───────────────────────────────────────────────────────────────

/**
 * Tiền tố mã bài. BỐN ký tự, và đó là chỗ nó khác `K8S` / `GIT`.
 *
 * `isProblemCode` (`core/problem.ts`) suy tiền tố hợp lệ TỪ bảng plugin và chỉ
 * đòi `/^[A-Z0-9]+$/`, không đòi độ dài — nên `CICD` hợp lệ, và phần đuôi số vẫn
 * có độ dài cố định (`PROBLEM_CODE_SUFFIX_DIGITS`) nên `ORDER BY code` vẫn sắp
 * đúng TRONG một game. Giữa hai game khác tiền tố thì thứ tự chuỗi vốn đã là
 * thứ tự chữ cái, không phải thứ tự thời gian, ở cả ba trường hợp.
 *
 * ⚠ KHÔNG dùng `CI`. Game này ship cả chương CD (`CD_STAGE_KINDS`,
 * `RELEASE_STRATEGIES`, hai vị từ chờ 19.B), nên một mã `CI-0007` trên một bài
 * về phát hành sẽ đặt tên sai cho đúng nửa mà hợp đồng đã dành chỗ sẵn. Một
 * tiền tố là khoá chính trong DB — đổi sau khi có dữ liệu thì không đổi được.
 */
export const CICD_PROBLEM_CODE_PREFIX = 'CICD';

/**
 * Seed mà client nạp khi mở một bài CI/CD không seedable, rồi ghi vào
 * `Submission.seed`.
 *
 * Cùng vai với `GIT_UNSEEDED_REPLAY_SEED` / `K8S_UNSEEDED_REPLAY_SEED`, và có
 * mặt vì cùng lý do: `Submission.seed` là một số THẬT mang theo lượt nộp, nên
 * phải có một chỗ duy nhất nói số đó là bao nhiêu khi bài không sinh đề.
 *
 * ⚠ Số này KHÔNG đi vào phép chấm. Engine CI/CD lấy hạt giống từ
 * `EvaluationSpec.baseSeed` của chính bài — xem `gradeCicdProblem`. Hai nguồn
 * hạt giống nghe như một chỗ hỏng, nhưng chúng trả lời hai câu khác nhau: cái
 * này nói "lượt chơi mang số nào", cái kia nói "phép mô phỏng rút xúc xắc từ
 * đâu". Nếu gộp, đổi seed của lượt chơi sẽ đổi luôn kết quả mô phỏng, và hai
 * lượt nộp cùng một workflow sẽ cho hai verdict khác nhau.
 */
export const CICD_UNSEEDED_REPLAY_SEED = 1;

// ── Trạng thái ban đầu ──────────────────────────────────────────────────────

/**
 * Trạng thái ban đầu của một bài CI/CD — BỘ BA, xem quyết định 1 ở đầu file.
 *
 * Ba mảnh, ba vai khác nhau, và chỉ mảnh đầu đi qua ô soạn thảo của người làm:
 *
 * | Mảnh | Ai sửa | Vì sao ở đây |
 * |---|---|---|
 * | `workflow` | NGƯỜI LÀM (qua YAML) | điểm xuất phát; cũng là thứ được chấm khi nhật ký rỗng |
 * | `workload` | người soạn | số máy chạy + dòng commit + đầu vào biến động; YAML không chở được |
 * | `evaluation` | người soạn | `baseSeed` + số lượt mô phỏng; quyết định tính lặp lại của điểm |
 * | `cd` | người soạn | kịch bản chương CD + núm nào cho xoay; VẮNG ⇒ bài thuần CI |
 */
export interface CicdProblemSpec {
  readonly workflow: WorkflowSpec;
  readonly workload: WorkloadSpec;
  readonly evaluation: EvaluationSpec;
  /**
   * Khối chương CD — 19.J.1.2. Vắng ⇒ bài thuần CI, và mọi vị từ CD bị từ chối
   * lúc chấm (xem `gradeCicdProblem`).
   *
   * ⛔ Kiểu suy ra bằng `Omit`, KHÔNG gõ lại. Đây đúng là `CicdLevelCd` trừ hai
   * trường lời giải, và một bản khai song song sẽ trôi khỏi bản gốc ở lần đầu
   * tiên ai đó thêm một bộ mô phỏng thứ tư — im lặng, vì cả hai vẫn biên dịch.
   *
   * Vì sao trừ `solution`/`altSolution`: chúng là LỜI GIẢI của level, và một đề
   * thi không chở lời giải. `problems.byCode` cắt `check`/`args` của testcase
   * trước khi rời máy chủ (§18.B.4) chính vì lý do đó; để hai trường này ở lại
   * sẽ gửi thẳng đáp án CD xuống trình duyệt qua đúng đường vừa bịt.
   */
  readonly cd?: CicdProblemCd;
}

/** Xem `CicdProblemSpec.cd`. */
export type CicdProblemCd = Omit<CicdLevelCd, 'solution' | 'altSolution'>;

/**
 * Bộ ba nhỏ nhất mà `evaluate()` chạy tới nơi, và người soạn nhìn vào là hiểu
 * phải thêm gì.
 *
 * ⚠ Hàm chứ không phải hằng dùng chung — `core/problem-plugin.ts` nói rõ cái
 * bẫy: hai tab soạn bài cùng trỏ vào một object thì sửa tab này đổi luôn tab
 * kia, và triệu chứng trên màn hình là "tự nhiên mất dữ liệu", không phải một
 * lỗi.
 *
 * Ba con số trong `workload` không tuỳ tiện: BA commit chứ không phải một, vì
 * hợp đồng ghi rằng một level một commit làm thông lượng thành đúng
 * `1 / leadTime` — trục thứ hai trở thành một phép chia của trục thứ nhất và
 * không đo được gì nữa. HAI máy chạy để một bài dạy song song có chỗ mà dạy.
 */
function specBanDau(): CicdProblemSpec {
  return {
    workflow: {
      name: 'Đường ống mẫu',
      stages: [
        {
          id: 'clone',
          kind: 'clone',
          name: 'Lấy mã nguồn',
          dependsOn: [],
          blocking: true,
          retries: 0,
          runnerClass: 'linux',
          steps: [
            {
              id: 'tai-ma',
              name: 'Tải mã nguồn',
              durationTicks: 3,
              blocking: true,
              script: 'tai-ma-nguon',
            },
          ],
        },
      ],
    },
    workload: {
      runners: [{ id: 'linux', label: 'Máy Linux', count: 2 }],
      inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
      commits: [
        { id: 'c1', tick: 0 },
        { id: 'c2', tick: 20 },
        { id: 'c3', tick: 40 },
      ],
    },
    evaluation: { baseSeed: 1901, passes: DEFAULT_EVALUATION_PASSES },
  };
}

// ── Vị từ khai được ─────────────────────────────────────────────────────────

/**
 * Vị từ người soạn được chọn: mọi tên trong hợp đồng, TRỪ những tên chưa có
 * hiện thực.
 *
 * ⛔ Suy từ DỮ LIỆU, không chép tay. `UNIMPLEMENTED_CICD_PREDICATES` là danh
 * sách TẠM mà `predicates.ts` hứa sẽ rỗng đi khi 19.B lên; một bản chép tay ở
 * đây sẽ không tự lành theo, và hai vị từ chương CD sẽ vẫn bị cấm khai sau khi
 * đã viết xong — im lặng, vì không có gì đỏ.
 *
 * `problem-plugin.test.ts` ghim CẢ HAI chiều: tập này cộng tập chưa-hiện-thực
 * phủ đúng bảng `CICD_PREDICATES`, VÀ tập này không chứa tên nào chưa hiện thực.
 *
 * ⛔ ĐỔI Ở 19.J.1.4: tám vị từ `CD_SIMULATION_PREDICATES` nay **khai được**.
 * Bản trước trừ chúng ra vì bộ ba của bài OJ không chở kịch bản CD nào; nay
 * `CicdProblemSpec.cd` chở, nên một lệnh cấm phẳng ở đây sẽ khoá đúng nửa game
 * mà chương CD vừa mở ra.
 *
 * Phép gác KHÔNG biến mất, nó ĐỔI CHỖ và đổi hình dạng: từ "cấm mọi bài" thành
 * "cấm bài THIẾU khối `cd` tương ứng", cưỡng chế ở `gradeCicdProblem` qua
 * `CD_PREDICATE_NEEDS`. Đây là điều kiện phụ thuộc bài, mà `predicateNames` là
 * một danh sách tĩnh không biết gì về một bài cụ thể — nên nó không thể là chỗ
 * gác, và giả vờ nó gác được là cách mất phép gác.
 */
export const CICD_IMPLEMENTED_PREDICATE_NAMES: readonly CicdPredicateName[] =
  CICD_PREDICATE_NAMES.filter((name) => !UNIMPLEMENTED_CICD_PREDICATES.includes(name));

// ── Form soạn `initialState` ────────────────────────────────────────────────

/**
 * Mô tả form cho bộ ba. BA ô `json`, và đó là quyết định có chủ ý.
 *
 * Cùng lời khai như bản Git, vì cùng lý do hợp đồng đã dự liệu: *"một
 * `WorldSpec` của git có cây commit lồng nhau, và ép nó thành widget trực quan
 * sẽ hỏng trước khi hữu ích"*. `WorkflowSpec` còn lồng sâu hơn — stage chứa
 * bước, bước chứa `cache` / `flake` / `requires` / `produces`, và `dependsOn`
 * trỏ vào id của stage khác trong cùng mảng. Một `kind: 'list'` dựng được ba ô
 * text cho mỗi stage nhưng KHÔNG kiểm được rằng `dependsOn` trỏ tới id có thật,
 * tức cho phép soạn ra một đồ thị có cạnh treo mà biểu mẫu trông vẫn đầy đủ.
 *
 * ⚠ Ba đường dẫn là khoá PHẲNG ở cấp cao nhất (`workflow`, `workload`,
 * `evaluation`), không phải đường có dấu chấm. Form của trang soạn bài đọc
 * `props.value[field.path]` nguyên văn, nên `evaluation.baseSeed` sẽ tra một
 * khoá tên đúng như vậy và luôn ra `undefined` — một ô trống không bao giờ lưu
 * được gì, và không có gì đỏ.
 *
 * Nhãn để chuỗi tiếng Việt thẳng chứ không qua `t()`: khoá chữ cho game này
 * chưa tồn tại, và `t()` trả CHUỖI RỖNG cho khoá chưa có — tức ba ô không nhãn,
 * trông y hệt một lỗi render. Ngày `packages/copy` có khoá thì đổi sang `t()`.
 */
export const CICD_AUTHOR_FIELDS: readonly AuthorField[] = [
  {
    kind: 'json',
    path: 'workflow',
    label: 'Đường ống ban đầu',
    help: 'Điểm xuất phát người làm nhận được. Cũng là thứ bị chấm khi lượt nộp chưa gõ gì.',
    required: true,
  },
  {
    kind: 'json',
    path: 'workload',
    label: 'Tải của bài',
    help: 'Máy chạy, đầu vào biến động và dòng commit. YAML không chở được ba thứ này nên chúng thuộc về bài.',
    required: true,
  },
  {
    kind: 'json',
    path: 'evaluation',
    label: 'Cấu hình chấm',
    help: 'Hạt giống gốc và số lượt mô phỏng. Cùng hạt giống cho cùng kết quả, từng byte.',
    required: true,
  },
  {
    /*
     * Ô THỨ TƯ, và là ô duy nhất KHÔNG bắt buộc (19.J.2.1): một bài thuần CI bỏ
     * trống nó, và đó là trạng thái đúng chứ không phải một ô chưa điền.
     *
     * `json` vì cùng lý do ba ô trên: `ReleaseScenario` có mười ba trường số,
     * `GitOpsScenario` chứa một mảng thay đổi mỗi cái bốn trường, và `editable`
     * là một tập con của một hằng tám phần tử. Một biểu mẫu trực quan cho ngần
     * ấy sẽ hỏng trước khi hữu ích — đúng lời `core/problem-plugin.ts` đã ghi.
     */
    kind: 'json',
    path: 'cd',
    label: 'Chương CD (tuỳ chọn)',
    help:
      'Kịch bản phát hành / GitOps / che bí mật, kèm "editable" (núm cho xoay) và "initial" ' +
      '(chính sách khởi điểm). Bỏ trống nếu bài chỉ dạy CI. Vị từ CD chỉ chấm được khi khối ' +
      'tương ứng có mặt ở đây.',
    required: false,
  },
];

// ── Chấm ────────────────────────────────────────────────────────────────────

function compileError(
  reason: string,
  code: ProblemFailureCode = 'phat-lai-loi',
): GradeResult {
  return { verdict: 'CE', passed: [], total: 0, failedReason: reason, failedCode: code };
}

/**
 * Một khối `cd` CÓ THẬT — object thường, không `null`, không mảng.
 *
 * ⚠ `!== undefined` là phép so SAI ở đây: `initialState` tới qua `gradeProblemRun`
 * ở kiểu `unknown` rồi bị ép (hợp đồng nói thẳng rằng phép ép đó không kiểm được
 * gì), nên `cd.release: null` lọt qua mọi phép so với `undefined` rồi ném ở
 * `cd-run.ts` tại một phép destructure nằm NGOÀI khối `try` của nó.
 */
function laKhoi(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Xem chú thích cùng tên ở `git/problem-plugin.ts` — `catch` nhận `unknown`. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `Testcase` của hệ OJ đọc thành `CicdObjective` của engine.
 *
 * Hai kiểu tả cùng một thứ ở hai tầng, và chúng lệch nhau đúng một trường:
 * `Testcase` có `visible` (ẩn/hiện với người làm — §18.B.4), `CicdObjective` có
 * `required` (mục thưởng hay bắt buộc). Bài OJ KHÔNG có mục thưởng — verdict
 * `AC` đòi qua hết testcase, không có "AC một phần" — nên `required: true` cho
 * mọi testcase là đúng nghĩa, không phải một giá trị điền cho đủ.
 */
function asObjective(testcase: Testcase): CicdObjective {
  return {
    id: testcase.id,
    label: testcase.label,
    check: testcase.check as CicdPredicateName,
    args: testcase.args ?? {},
    required: true,
  };
}

/**
 * Chạy engine trên workflow của lượt nộp rồi chấm từng testcase.
 *
 * ⛔ Hàm thuần và tất định — cùng ràng buộc, cùng lý do như hai plugin trước.
 * Engine CI/CD đã có bất biến đó ở tầng của nó (`FlakeDrawKey`: mọi lần rút đi
 * qua một khoá, không qua một bộ sinh chạy dọc), nên chỗ duy nhất file này có
 * thể làm hỏng là chính nó: không `Date.now()`, không `Math.random()`, không
 * lặp trên `Set` / `Map`.
 *
 * ── WORKFLOW NÀO ĐƯỢC CHẤM ──
 *
 * Hành động `evaluate` CUỐI CÙNG trong nhật ký, và chỉ nó. Mỗi lần nộp là một
 * bản YAML ĐỘC LẬP — khác hẳn hai game kia, nơi mỗi lệnh biến đổi một thế giới
 * tích luỹ dần. Phát lại theo kiểu tích luỹ ở đây sẽ vô nghĩa: bản thứ hai
 * không "áp lên" bản thứ nhất, nó THAY bản thứ nhất.
 *
 * Nhật ký KHÔNG có `evaluate` nào ⇒ chấm `initialState.workflow`. Đó là tiền lệ
 * của cả hai plugin trước (một lượt chơi rỗng chấm trạng thái đầu và ra `WA`,
 * không ra `CE`), và nó đúng ở đây vì một lý do riêng nữa: trạng thái đầu là
 * một workflow HỢP LỆ, chạy được, chỉ là chưa giải xong bài. Trả `CE` cho nó là
 * nói bài soạn hỏng trong khi người làm chỉ chưa bắt đầu.
 *
 * Hành động `hint` bỏ qua có chủ ý: nó không đụng tới workflow. Điểm trừ vì mở
 * gợi ý tính từ `Submission.hintsRevealed`, không tính từ đây.
 *
 * ── BA ĐƯỜNG RA `CE`, VÀ MỘT ĐƯỜNG CỐ Ý KHÔNG PHẢI `CE` ──
 *
 * | Tình huống | Verdict | Vì sao |
 * |---|---|---|
 * | Bài không có testcase nào | `CE` / `chua-co-testcase` | chưa chấm gì; `total === 0` một mình không tách được ba nguyên nhân |
 * | Testcase gọi tên vị từ lạ, hoặc vị từ chưa hiện thực, hoặc thiếu tham số | `CE` | bài soạn hỏng; để chạy tiếp là một testcase VĨNH VIỄN đỏ, trông y hệt một lời giải sai |
 * | YAML người làm gõ không đọc được | `CE` | đúng nghĩa §18.B.5 — lỗi cú pháp |
 * | Đồ thị đọc được nhưng có chu trình | **`WA`** | xem quyết định 2 ở đầu file |
 *
 * Phép kiểm tham số gọi `validateObjectiveArgs`, đúng hàm mà tầng test của level
 * gọi. Nó tồn tại vì luật 3 của `predicates.ts`: vị từ trả `false` khi thiếu
 * tham số (để một level viết sai không làm sập phiên chơi), nên KHÔNG gọi hàm
 * này thì một testcase gõ nhầm `stages` thay vì `stage` sẽ không bao giờ qua
 * được và không có gì đỏ ở đâu cả.
 */
export function gradeCicdProblem(input: {
  readonly initialState: CicdProblemSpec;
  /**
   * Nhận rồi BỎ QUA. Không vị từ CI/CD nào so hai workflow với nhau — chúng đọc
   * hình dạng đồ thị và bản ghi mô phỏng của CHÍNH lượt nộp. Khai ra ở đây để
   * hợp đồng đọc được, không phải để dùng.
   */
  readonly targetState?: CicdProblemSpec;
  readonly actions: readonly CicdGameAction[];
  readonly testcases: readonly Testcase[];
  readonly seed: number;
}): GradeResult {
  const { initialState, actions, testcases } = input;

  if (testcases.length === 0) {
    // Mã RIÊNG, không dùng `phat-lai-loi` mặc định — cùng lý do như hai plugin
    // trước: `total === 0` một mình không tách được ba nguyên nhân, và một mã
    // sai ở đây làm cột đó mất đúng khả năng nó sinh ra để có.
    return compileError('bài chưa có testcase nào nên không chấm được', 'chua-co-testcase');
  }

  const known: readonly string[] = CICD_PREDICATE_NAMES;
  const chuaHienThuc: readonly string[] = UNIMPLEMENTED_CICD_PREDICATES;
  for (const testcase of testcases) {
    if (!known.includes(testcase.check)) {
      return compileError(`testcase "${testcase.id}" gọi vị từ không tồn tại: "${testcase.check}"`);
    }
    if (chuaHienThuc.includes(testcase.check)) {
      /*
       * Chặn ở ĐÂY chứ không để `checkObjective` ném, dù nhánh ném vẫn còn và
       * vẫn đúng. Khác biệt là THÔNG ĐIỆP: một ngoại lệ bắt được ở cuối sẽ nói
       * "testcase X chấm lỗi", còn câu dưới nói ra thứ người soạn cần biết —
       * tên đó chưa có engine đỡ, và đường sửa là chọn tên khác chứ không phải
       * sửa tham số.
       */
      return compileError(
        `testcase "${testcase.id}" gọi vị từ "${testcase.check}" — tên này chưa có hiện thực ` +
          '(chương CD chưa lên), nên không bài nào chấm bằng nó được',
      );
    }
    /*
     * Cổng 19.J.1.4 — vị từ CD chỉ mở khi bài CÓ đúng khối kịch bản nó đọc.
     *
     * Chặn ở đây, TRƯỚC khi mô phỏng, chứ không để vị từ trả `false` lúc chấm:
     * thiếu bản ghi thì mọi vị từ CD trả `false` một cách im lặng, nên một bài
     * soạn thiếu khối `cd` sẽ đọc ra thành "chưa ai giải nổi bài này" thay vì
     * "bài này soạn hỏng". Hai chẩn đoán đó dẫn tới hai hành động trái ngược.
     */
    const canKhoi = CD_PREDICATE_NEEDS[testcase.check as CicdPredicateName];
    if (canKhoi !== undefined) {
      /*
       * ⛔ HAI khối, không phải một (sửa sau review PR #146). Kịch bản cho bộ mô
       * phỏng biết chạy CÁI GÌ; `cd.initial` cho nó biết chạy VỚI chính sách
       * nào. `mergeCdPolicies` bỏ hẳn một bộ khi `initial` thiếu khối tương ứng,
       * và `runLevelCd` chỉ ghi bản ghi khi cả hai có mặt — thiếu một vế thì vị
       * từ trả `false` ở MỌI lượt nộp, im lặng.
       *
       * `laKhoi` chứ không `!== undefined`: `null` thoả phép so đó nhưng ném ở
       * `cd-run.ts` tại một phép destructure ngoài khối `try`.
       */
      const thieu = !laKhoi(initialState.cd?.[canKhoi])
        ? `cd.${canKhoi}`
        : !laKhoi(initialState.cd?.initial[canKhoi])
          ? `cd.initial.${canKhoi}`
          : null;
      if (thieu !== null) {
        return compileError(
          `testcase "${testcase.id}" gọi vị từ "${testcase.check}" — vị từ này đọc bản ghi của bộ ` +
            `mô phỏng "${canKhoi}", mà bài không khai khối "${thieu}". Thêm khối đó vào đề, hoặc ` +
            'chấm bằng một vị từ khác',
        );
      }
    }
    const loiThamSo = validateObjectiveArgs(asObjective(testcase));
    if (loiThamSo !== null) {
      return compileError(loiThamSo);
    }
  }

  /*
   * ⚠ MỘT khối `try` cho cả phần đọc `initialState` lẫn phần chạy engine.
   *
   * `initialState` tới đây qua `gradeProblemRun` ở kiểu `unknown` rồi bị ép —
   * hợp đồng nói thẳng rằng phép ép đó không kiểm được gì và mỗi plugin phải tự
   * bọc. Nên một bộ ba thiếu `workload`, hay một `workflow` không có `stages`,
   * lọt được tới đây và sẽ ném ở lần chạm đầu tiên.
   *
   * ⛔ KHÔNG viết phép kiểm `null` bằng tay cho từng mảnh. Kiểu đã khai chúng
   * là bắt buộc, nên `initialState.workload === undefined` là một điều kiện mà
   * `no-unnecessary-condition` báo thừa — và làm nó im bằng cách nới kiểu thành
   * tuỳ chọn là nói dối ở chỗ đắt hơn nhiều: mọi chỗ đọc sau đó phải xử một
   * nhánh không tồn tại.
   */
  let ctx: CicdScoringContext;
  try {
    const cuoi = luotNopCuoiCung(actions);
    let workflow: WorkflowSpec;
    if (cuoi === null) {
      workflow = initialState.workflow;
    } else {
      const doc = readWorkflowYaml(cuoi.source);
      if (!doc.ok) {
        /*
         * Chuyển tiếp NGUYÊN VẸN dòng + cột của từng lỗi. `yaml-read.ts` đã giữ
         * chúng qua cả tầng quét cho ô soạn thảo của 19.E.2 gạch chân được;
         * gộp thành một câu chung chung ở đây là vứt đi đúng thứ 19.C.3 tồn tại
         * để có, và người làm nhận một `CE` không chỉ được chỗ nào sai.
         */
        const chiTiet = doc.errors
          .map((loi) => `dòng ${loi.line}, cột ${loi.column}: ${loi.message}`)
          .join(' · ');
        return compileError(`YAML của lượt nộp không đọc được — ${chiTiet}`);
      }
      /*
       * `ignored` KHÔNG phải lỗi. Bộ đọc liệt kê những khoá của nhà cung cấp mà
       * mô hình này không có chỗ chứa; một workflow thật luôn mang vài khoá như
       * vậy. Coi chúng là lỗi sẽ từ chối đúng những bản YAML sát đời thật nhất
       * — tức là từ chối thứ game tồn tại để dạy.
       *
       * ⛔ GHÉP trước khi chấm. YAML không chở `durationTicks`/`flake`/`cache`,
       * nên `doc.workflow` là một đường ống dài 0 giây. Bản đầu chấm thẳng nó:
       * đo 2026-09-16, nộp YAML lời giải c01 ⇒ `leadTimeUnder 1 giây` ra AC.
       *
       * Bài OJ không có level, nên `initialState.workflow` đóng cả hai vai —
       * đúng lối bàn thử của 19.H — và mọi phần mở: bài không khai `editable`.
       *
       * ✅ KHE ĐÃ ĐÓNG (19.J.1.3). Câu cũ ở đây ghi *"`retries`/`cache` KHÔNG vào
       * được đây vì `CicdGameAction.evaluate` chỉ chở YAML"*. Nay action chở
       * `overrides`, và chúng đi thẳng vào `hydrateWorkflow` dưới đây — đúng cùng
       * một đường mà màn chơi level dùng (`components/games/cicd/cicd-run.ts`).
       * Không có bước này thì bảng núm trên màn làm bài là một bảng núm giả: xoay
       * hay không xoay đều ra cùng một verdict.
       */
      /*
       * ⛔ KHUÔN JOB trước khi ghép (`job-shapes.ts`). Bài OJ chỉ có một workflow
       * đã biết — `initialState.workflow` — nên người làm sửa được đồ thị /
       * blocking / retries mà không đổi được tập job hay dãy bước. Không có luật
       * này thì đổi tên một bước làm thời lượng về 0 và `leadTimeUnder` ra AC
       * (review PR #141, đo được). Lệch khuôn là câu trả lời SAI, tức WA — cùng lý
       * do với đồ thị có chu trình (quyết định 2): bài không hỏng, bài làm sai.
       */
      if (checkJobShapes(doc.workflow, [initialState.workflow], initialState.workflow, EDITABLE_PARTS).length > 0) {
        return {
          verdict: problemVerdictOf(0, testcases.length),
          passed: [],
          total: testcases.length,
          failedReason: null,
          failedCode: null,
        };
      }
      workflow = hydrateWorkflow(
        doc.workflow,
        { baseline: initialState.workflow, catalogue: initialState.workflow },
        EDITABLE_PARTS,
        cuoi.overrides,
      );
    }

    /*
     * Chương CD — 19.J.1.3. Bài không khai khối `cd` ⇒ `cd` của ngữ cảnh VẮNG,
     * và mọi vị từ CD đã bị cổng ở vòng trên từ chối, nên không có đường nào
     * chấm một bài CD bằng một bản ghi rỗng.
     *
     * ⛔ `runLevelCd` gọi `mergeCdPolicies` BÊN TRONG nó — đó là lý do ta gửi
     * chính sách người làm NGUYÊN VẸN chứ không tự khoá trước. Phần không nằm
     * trong `cd.editable` luôn lấy từ `cd.initial`, bất kể lượt nộp gửi gì. Đây
     * là phép gác thật của AC-J4: thiếu nó, một bài "tìm đúng ngưỡng canary"
     * giải được bằng cách sửa luôn kịch bản.
     */
    let cdRecords: CicdCdRecords | null = null;
    if (initialState.cd !== undefined) {
      const daGui: CicdCdPolicies = cuoi?.cd ?? {};
      /*
       * `CicdProblemCd` là `CicdLevelCd` TRỪ hai trường lời giải, mà `runLevelCd`
       * đòi bản đầy đủ. Hai trường thiếu KHÔNG được đọc trong đó (`cd-run.ts` chỉ
       * chạm `release`/`gitops`/`masking`/`editable`/`initial`), nên đắp vào bằng
       * `{}` là trung thực chứ không phải bịa: một đề thi không có lời giải, và
       * đây là chỗ nói ra điều đó thay vì im lặng ép kiểu.
       */
      const run = runLevelCd({ ...initialState.cd, solution: {}, altSolution: {} }, daGui);
      if (!run.ok) {
        /*
         * Bộ mô phỏng NÉM vì giá trị ngoài miền (ví dụ canary weight 0). Đó là
         * một bài làm SAI, không phải một bài soạn hỏng — cùng lý lẽ với đồ thị
         * có chu trình (quyết định 2 ở đầu file). Trả `CE` ở đây sẽ nói với người
         * làm rằng đề hỏng trong khi chính họ vừa nhập một con số không hợp lệ.
         */
        return {
          verdict: problemVerdictOf(0, testcases.length),
          passed: [],
          total: testcases.length,
          failedReason: null,
          failedCode: null,
        };
      }
      cdRecords = run.records;
    }

    ctx = {
      workflow,
      ...(cdRecords === null ? {} : { cd: cdRecords }),
      /*
       * Hạt giống lấy từ BÀI (`evaluation.baseSeed`), không phải từ `seed` của
       * lượt nộp. Đó là điều kiện để hai lượt nộp cùng một workflow cho cùng
       * một verdict: nếu phép mô phỏng đi theo seed của lượt chơi thì cùng một
       * lời giải sẽ đạt ở lượt này và trượt ở lượt sau, và người làm không có
       * cách nào đọc ra vì sao.
       */
      record: evaluate(workflow, initialState.workload, initialState.evaluation),
    };
  } catch (error) {
    return compileError(`không dựng được lượt chấm: ${errorText(error)}`);
  }

  const passed: string[] = [];
  for (const testcase of testcases) {
    try {
      if (checkObjective(asObjective(testcase), ctx)) {
        passed.push(testcase.id);
      }
    } catch (error) {
      return compileError(`testcase "${testcase.id}" chấm lỗi: ${errorText(error)}`);
    }
  }

  return {
    verdict: problemVerdictOf(passed.length, testcases.length),
    passed,
    total: testcases.length,
    failedReason: null,
    failedCode: null,
  };
}

/** Ba mảnh của một lượt nộp, tách khỏi union để chỗ dùng không phải hỏi lại `kind`. */
interface LuotNop {
  readonly source: string;
  readonly overrides: CicdPlayerOverrides;
  readonly cd: CicdCdPolicies | null;
}

/**
 * Hành động `evaluate` CUỐI CÙNG, hoặc `null` khi không có.
 *
 * ⛔ Trả CẢ BA mảnh, không riêng YAML (19.J.1.3). Bản trước trả `string` và
 * chính chữ ký đó là chỗ `overrides`/`cd` không có đường đi tiếp: một hàm trả
 * một chuỗi thì người gọi không thể ghép cái nó không nhận được.
 *
 * ⚠ Ba mảnh phải đến từ CÙNG một hành động. Lấy YAML của lượt cuối rồi ghép với
 * núm của một lượt khác là chấm một lượt chơi chưa từng xảy ra — nên gom chúng
 * thành một object ở đây thay vì ba vòng quét riêng.
 *
 * Vòng lặp xuôi gán đè chứ không `findLast`: cùng kết quả, và nó đọc ra ngay
 * rằng thứ tự nhật ký là thứ tự thời gian. Xem khối "WORKFLOW NÀO ĐƯỢC CHẤM".
 */
function luotNopCuoiCung(actions: readonly CicdGameAction[]): LuotNop | null {
  let cuoi: LuotNop | null = null;
  for (const action of actions) {
    if (action.kind === 'evaluate') {
      cuoi = { source: action.source, overrides: action.overrides, cd: action.cd };
    }
  }
  return cuoi;
}

// ── Plugin ──────────────────────────────────────────────────────────────────

/**
 * Plugin CI/CD. `seedSpec` cố ý VẮNG MẶT — xem quyết định 3 ở đầu file.
 */
export const CICD_PROBLEM_PLUGIN: GameProblemPlugin<CicdProblemSpec, CicdGameAction> = {
  gameId: 'cicd',
  codePrefix: CICD_PROBLEM_CODE_PREFIX,
  topics: CICD_PROBLEM_TOPICS,
  predicateNames: CICD_IMPLEMENTED_PREDICATE_NAMES,
  predicateArgs: CICD_PLUGIN_PREDICATE_ARGS,
  initialSpec: specBanDau,
  authorFields: CICD_AUTHOR_FIELDS,
  grade: gradeCicdProblem,
};
