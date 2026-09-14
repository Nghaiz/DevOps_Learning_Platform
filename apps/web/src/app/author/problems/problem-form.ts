import type {
  ClusterSpec,
  GameId,
  Problem,
  ProblemDifficulty,
  ProblemHint,
  ProblemTopicId,
  ResourceKind,
  Testcase,
} from '@devops-platform/games';
import type { PredicateName } from '@devops-platform/games';
import { clusterFromSpec, emptyCluster, type ClusterFormState } from './cluster-form';
import { DEFAULT_AUTHOR_GAME, initialSpecFor, pluginViewFor } from './game-plugin-view';
import { specToText, type SpecTextState } from './spec-text';

/**
 * Mô hình FORM của một bài OJ, và hình dạng payload gửi lên router `problems`.
 *
 * ## `ProblemDraftInput` được SUY từ hợp đồng, không chép lại
 *
 * `Omit<Problem, …>` chứ không phải một interface viết tay liệt kê 12 field:
 * hợp đồng thêm một field thì chỗ này đỏ ngay, còn một bản chép tay thì lặng lẽ
 * thiếu. Năm field bị loại đều do MÁY CHỦ cấp — `code` cấp trong vòng chống đua
 * trên khoá chính, `authorId` cố ý không có trong schema input (một field
 * `authorId` là field kẻ tấn công điền được), `state` đổi qua `publish`/`archive`,
 * hai mốc thời gian do DB ghi.
 */
export type ProblemDraftInput = Omit<Problem, 'code' | 'state' | 'authorId' | 'createdAt' | 'updatedAt'>;

export interface ObjectiveFormState {
  readonly key: string;
  id: string;
  label: string;
  /** `''` = chưa chọn. Người soạn KHÔNG gõ tay được — xem `objective-fields.tsx`. */
  check: '' | PredicateName;
  /**
   * Tham số dạng CHUỖI, khoá theo `PredicateArgSpec.key`.
   *
   * Giữ nguyên khi người soạn đổi vị từ: hai vị từ họ hàng (`netpol-allows` ↔
   * `netpol-denies`) dùng chung bộ tham số, và xoá sạch mỗi lần đổi ô chọn là
   * bắt gõ lại bốn ô vì một lần bấm nhầm. Khoá thừa của vị từ cũ bị BỎ lúc
   * chuyển sang payload, nên nó không rò ra ngoài.
   */
  args: Readonly<Record<string, string>>;
  required: boolean;
}

export interface HintFormState {
  readonly key: string;
  /**
   * Định danh ỔN ĐỊNH, và vì thế nó là một ô người soạn nhìn thấy chứ không phải
   * một chuỗi sinh ngầm lúc gửi: `ProblemSubmission.hintsRevealed` lưu đúng id
   * này, nên đổi nó là mồ côi lịch sử mở gợi ý của mọi người đã làm bài.
   */
  id: string;
  text: string;
  penaltyPoints: string;
}

export interface ProblemFormState {
  /**
   * Game của bài. Quyết định biểu mẫu trạng thái ban đầu, tập chủ đề, và bảng
   * vị từ dùng cho testcase.
   *
   * ## Vì sao nó ở trong FORM mà chưa ở trong payload
   *
   * `Problem` chưa có `gameId` và `initialState` của nó vẫn khai `ClusterSpec`
   * (xem `PERSISTABLE_GAMES` trong `game-plugin-view.ts`). Nên hôm nay trường
   * này chỉ lái GIAO DIỆN; nó không đi lên máy chủ, và trang cảnh báo thẳng khi
   * game đang chọn chưa lưu được.
   *
   * Giữ nó trong form ngay từ bây giờ chứ không đợi hợp đồng lưu trữ: phần
   * "biểu mẫu đổi theo plugin" là thứ §18.A.6 đòi, và nó đo được ngay mà không
   * cần một cột DB nào.
   */
  gameId: GameId;
  /**
   * Trạng thái ban đầu cho game KHÔNG dùng biểu mẫu viết tay, giữ ở dạng map
   * chuỗi theo `path` của `authorFields`. Xem `spec-text.ts` về lý do là chuỗi.
   *
   * Với K8s thì trường này không được đọc: biểu mẫu viết tay `cluster` mới là
   * nguồn. Hai trường cùng lúc trông như hai nguồn cho một sự thật, nhưng mỗi
   * lượt soạn chỉ có ĐÚNG MỘT trường được trình soạn đọc, và `specEditor` của
   * plugin nói ra trường nào.
   */
  specText: SpecTextState;
  title: string;
  slug: string;
  statement: string;
  difficulty: ProblemDifficulty;
  /**
   * Chủ đề đang chọn, giữ ở kiểu MỜ (`ProblemTopicId` = `string`) chứ không ở
   * union đóng của K8s.
   *
   * `core/problem.ts` đã chuyển tập đóng từ `core/` xuống từng plugin, đúng vì
   * lý do này: chín tên chủ đề K8s là tri thức về Kubernetes, và một bài Git
   * không chọn chủ đề trong một danh sách nói về Pod. Giữ union K8s ở tầng form
   * thì mỗi lần bấm một ô chủ đề của game khác là một phép ép kiểu.
   *
   * Tập đóng KHÔNG mất: ô chọn chỉ dựng từ `pluginViewFor(gameId).topics`, và
   * máy chủ kiểm lại chủ đề của bài có nằm trong tập của plugin không. Phép ép
   * về union K8s còn đúng MỘT chỗ, ở `problem-draft.ts`, và nó có chú thích
   * nói vì sao còn đúng.
   */
  topics: readonly ProblemTopicId[];
  /** Ô tự do ngăn bằng dấu phẩy; chuẩn hoá thường + gạch nối lúc chuyển payload. */
  tagsText: string;
  hasTimeLimit: boolean;
  timeLimitSec: string;
  parMoves: string;
  /**
   * `false` ⇒ `allowedResources: null` (cho dùng mọi loại). Cờ này không phải
   * trường suy ra được: `null` và `[]` là HAI ý khác nhau — "không giới hạn" và
   * "không cho tạo gì cả" — mà một mảng rỗng thì không phân biệt nổi.
   */
  restrictResources: boolean;
  allowedResources: readonly ResourceKind[];
  cluster: ClusterFormState;
  objectives: readonly ObjectiveFormState[];
  hints: readonly HintFormState[];
}

export function emptyObjective(key: string): ObjectiveFormState {
  return { key, id: '', label: '', check: '', args: {}, required: true };
}

export function emptyHint(key: string): HintFormState {
  return { key, id: '', text: '', penaltyPoints: '10' };
}

/**
 * Ô nhập của biểu mẫu dựng-từ-plugin, nạp sẵn `initialSpec()` của game.
 *
 * Trả `{}` khi game chưa có plugin. Đó là câu trả lời hợp lệ, không phải lỗi:
 * trang hiện một trạng thái rỗng đọc được (xem `GameSelectField`).
 */
export function specTextForGame(gameId: GameId): SpecTextState {
  const view = pluginViewFor(gameId);
  const spec = initialSpecFor(gameId);
  if (view === null || spec === null) {
    return {};
  }
  return specToText(view.authorFields, spec);
}

/**
 * Đổi game của một bản nháp đang soạn.
 *
 * Hàm THUẦN và nằm ngoài JSX, để ô nghiệm thu đo được nó mà không phải dựng
 * DOM: ba thứ phải đổi cùng lúc, và bỏ sót một trong ba là một lỗi im lặng.
 *
 * - `specText` nạp lại từ `initialSpec()` của game mới. Giữ lại bản cũ nghĩa là
 *   một `WorldSpec` của Git mang các khoá của `ClusterSpec`.
 * - `topics` XOÁ. Tập chủ đề là ĐÓNG theo plugin, nên một chủ đề K8s còn sót
 *   trên một bài Git sẽ trượt cổng kiểm ở máy chủ mà không hiện ra ở đâu trên
 *   màn hình: ô của nó đã biến mất khỏi biểu mẫu.
 *
 * `cluster` thì GIỮ NGUYÊN, và đó là chủ ý: người soạn đổi sang Git để xem thử
 * rồi đổi về K8s không nên mất cụm đã dựng. Trường nào được đọc là do
 * `specEditor` của plugin quyết, nên một `cluster` không ai đọc thì vô hại.
 */
export function formWithGame(form: ProblemFormState, gameId: GameId): ProblemFormState {
  return { ...form, gameId, specText: specTextForGame(gameId), topics: [] };
}

export function emptyForm(nextKey: () => string): ProblemFormState {
  return {
    gameId: DEFAULT_AUTHOR_GAME,
    specText: specTextForGame(DEFAULT_AUTHOR_GAME),
    title: '',
    slug: '',
    statement: '',
    difficulty: 'easy',
    topics: [],
    tagsText: '',
    hasTimeLimit: false,
    timeLimitSec: '600',
    parMoves: '',
    restrictResources: false,
    allowedResources: [],
    cluster: emptyCluster(nextKey),
    // Một mục tiêu bắt buộc có sẵn: hợp đồng đòi ÍT NHẤT một, nên bắt đầu từ
    // không có gì là bắt đầu từ một trạng thái chắc chắn sai.
    objectives: [emptyObjective(nextKey())],
    hints: [],
  };
}

/**
 * ĐÚNG những trường `formFromProblem` đọc — không phải cả `StoredProblem`.
 *
 * Khai hẹp ở đây thay vì nhập `StoredProblem` từ `server/problems/dto.ts` vì
 * hàm này có HAI người gọi với hai hình dạng khác nhau:
 * `[code]/problem-edit-client.tsx` đưa vào thứ đến qua dây (`problems.forEdit`),
 * còn `problem-json.ts` dựng một object bằng tay từ file JSON nhập vào. Một
 * tham số nêu rõ nó cần gì thì cả hai cùng thoả mà không bên nào phải giả vờ là
 * một bài đầy đủ.
 *
 * `initialState` khai TUỲ CHỌN chứ không bắt buộc, và đó là lời khai của dây chứ
 * không phải một chỗ bỏ lỏng: hợp đồng đổi nó sang `unknown`, `unknown` bao gồm
 * `undefined`, nên kiểu đầu ra tRPC suy ra là `initialState?: unknown` —
 * `JSON.stringify` bỏ hẳn khoá mang `undefined`. Đòi bắt buộc ở đây là đòi một
 * thứ máy chủ không hứa.
 */
export interface LoadedProblemFields {
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly difficulty: ProblemDifficulty;
  readonly topics: readonly ProblemTopicId[];
  readonly tags: readonly string[];
  readonly timeLimitSec: number | null;
  readonly parMoves: number | null;
  readonly allowedResources: readonly ResourceKind[] | null;
  readonly initialState?: unknown;
  readonly testcases: readonly Testcase[];
  readonly hints: readonly ProblemHint[];
}

/** Đọc một bài đã lưu về form. Mọi số thành chuỗi, mọi `null` thành cờ tắt. */
export function formFromProblem(
  problem: LoadedProblemFields,
  nextKey: () => string,
): ProblemFormState {
  return {
    /*
     * VẪN chốt cứng K8s, dù hợp đồng NAY đã có `gameId` để đọc ra.
     *
     * Bản trước của dòng này hẹn: *"Ngày hợp đồng có `gameId` thì dòng này đọc
     * từ bài"*. Ngày đó chưa tới, và lý do nằm ở nửa GHI chứ không ở nửa ĐỌC:
     * `server/problems/validate.ts` § `problemBodyShape` vẫn khai
     * `initialState: clusterSpecSchema` và `topics: z.enum(PROBLEM_TOPICS)`, tức
     * payload lưu vẫn là K8s và chỉ K8s.
     *
     * Đọc `gameId` từ bài ngay bây giờ sẽ cho một biểu mẫu MỞ được bài Git rồi
     * lưu đè nó bằng một `ClusterSpec` — `toProblemDraft` luôn phát
     * `initialState: cluster.value`. Một trang mở được mà lưu thì hỏng dữ liệu
     * còn tệ hơn một trang nói thẳng là chưa hỗ trợ, và
     * `game-plugin-view.ts` § `PERSISTABLE_GAMES` đang nói thẳng điều đó.
     *
     * Hai nửa phải đi cùng một lượt, và lượt đó là §18.D — không phải lane này,
     * vốn không sở hữu `src/server/`.
     */
    gameId: DEFAULT_AUTHOR_GAME,
    specText: specTextForGame(DEFAULT_AUTHOR_GAME),
    title: problem.title,
    slug: problem.slug,
    statement: problem.statement,
    difficulty: problem.difficulty,
    topics: problem.topics,
    tagsText: problem.tags.join(', '),
    hasTimeLimit: problem.timeLimitSec !== null,
    timeLimitSec: problem.timeLimitSec === null ? '600' : String(problem.timeLimitSec),
    parMoves: problem.parMoves === null ? '' : String(problem.parMoves),
    restrictResources: problem.allowedResources !== null,
    allowedResources: problem.allowedResources ?? [],
    /*
     * Phép ép `unknown` → `ClusterSpec`, có tên và có lý do.
     *
     * Bảo chứng KHÔNG mất, nó chỉ đổi chỗ: trước đây kiểu `Problem` giữ nó, giờ
     * cổng ghi giữ nó (`clusterSpecSchema` ở `validate.ts`) cộng với việc mọi
     * dòng trong DB đều là K8s. Hành vi giữ NGUYÊN từng bit so với bản trước —
     * `clusterFromSpec` vẫn nhận đúng object cũ.
     *
     * ⚠ Cố ý KHÔNG bọc một nhánh phòng hờ kiểu `?? emptyCluster(nextKey)`. Nó
     * trông an toàn hơn và thật ra nguy hiểm hơn: một spec lạ sẽ hiện thành biểu
     * mẫu TRỐNG, người soạn bấm Lưu, và bản gốc bị ghi đè bằng một cụm rỗng —
     * mất dữ liệu trong im lặng. Để nó ném thì lỗi dừng ở màn hình soạn và bài
     * trong DB còn nguyên. `development-principles.md` § "Errors Over Silent
     * Fallbacks" là luật, và đây đúng là ca nó nói tới.
     */
    cluster: clusterFromSpec(problem.initialState as ClusterSpec, nextKey),
    objectives: problem.testcases.map((testcase) => ({
      key: nextKey(),
      id: testcase.id,
      label: testcase.label,
      // Vị từ đọc từ DB có thể là một tên đã bị gỡ khỏi bảng tra (bài cũ, hợp
      // đồng mới). Ép kiểu ở đây là cố ý: form phải MỞ được bài đó để người soạn
      // sửa, còn việc chặn nằm ở `problem-validate.ts` — nó kiểm tên có trong
      // bảng hay không và nói ra. Chặn ngay ở khâu nạp thì bài hỏng thành bài
      // không mở nổi.
      check: testcase.check as PredicateName,
      args: stringifyArgs(testcase.args),
      /*
       * ⛔ `true` là HẰNG SỐ của hợp đồng, KHÔNG phải `visible` đọc ngược.
       *
       * `testcases.ts` đầu file có bảng so sánh, và hai trường trả lời hai câu
       * khác nhau: `required` hỏi *không đạt thì có chặn không*, `visible` hỏi
       * *người làm có được XEM trước khi nộp không*. Ánh xạ cái này sang cái kia
       * là đổi nghĩa dữ liệu mà không ai ra lệnh — đúng thứ hợp đồng cấm.
       *
       * `Testcase` KHÔNG còn `required` để mà đọc, và quyết định #20 nói vì sao:
       * *"một testcase thì luôn chặn — đó là nghĩa của `AC`"*. Nên dưới mô hình
       * mới, giá trị đúng của ô này là `true` cho mọi case — suy từ định nghĩa,
       * không suy từ một trường khác.
       *
       * ⚠ HỆ QUẢ PHẢI NÓI RA: một bài CŨ có mục tiêu `required: false` nay nạp
       * lên form thành `true`, và lượt Lưu kế tiếp ghi `true` xuống DB. Đó là
       * một phép đổi dữ liệu, không phải một lượt đọc trong suốt. Nó KHÔNG
       * tránh được ở đây — `problemTestcases` đã bỏ `required` ở biên đọc nên
       * hàm này không còn thấy giá trị cũ — và nó KHỚP với hướng mà lead vừa
       * chọn ở `server/problems/publish-gate.ts`: cổng xuất bản bỏ hẳn phép
       * kiểm `some(o => o.required)` vì *"dưới mô hình mới thì mọi case đều
       * chặn"*. Ghi ra đây thay vì để người sau tìm thấy nó trong một diff DB.
       *
       * Ô `required` trên màn hình vì thế đang mất dần ý nghĩa. Gỡ nó phải đi
       * cùng lượt đổi `problemBodyShape` ở `validate.ts` (vẫn đòi
       * `required: z.boolean()`) và thêm ô `visible` — §18.D.2, không phải lane
       * này.
       */
      required: true,
    })),
    hints: problem.hints.map((hint) => ({
      key: nextKey(),
      id: hint.id,
      text: hint.text,
      penaltyPoints: String(hint.penaltyPoints),
    })),
  };
}

function stringifyArgs(args: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, string>> {
  if (args === undefined) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === null || value === undefined) {
      continue;
    }
    // Object (bộ chọn nhãn dạng map) về lại dạng chuỗi `k=v,k=v` của kubectl —
    // đúng dạng mà mọi level đã viết dùng, và là dạng `argSelector` đọc trước.
    out[key] =
      typeof value === 'object'
        ? Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(',')
        : String(value);
  }
  return out;
}
