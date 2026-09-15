import type {
  ClusterSpec,
  GameId,
  ProblemBase,
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
export type ProblemDraftInput = Omit<
  ProblemBase<unknown>,
  'code' | 'state' | 'authorId' | 'createdAt' | 'updatedAt' | 'testcases'
> & {
  /**
   * Tên LỊCH SỬ của cùng một thứ. Hợp đồng miền gọi nó `testcases`; cột DB, gói
   * tin lên dây và file JSON xuất ra đều gọi `objectives`, và hai cái sau nằm
   * trong máy người khác nên không đổi được. `server/problems/validate.ts` §
   * `ProblemBody` có bảng ba tên và lý do đầy đủ.
   */
  readonly objectives: readonly Testcase[];
  /** ⚠ K8s-only — xem khối nợ ở `server/problems/dto.ts` § `StoredProblem`. */
  readonly allowedResources: readonly ResourceKind[] | null;
};

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
  /**
   * §18.D.2 — người làm có thấy testcase này TRƯỚC khi nộp không.
   *
   * ⛔ KHÔNG phải `required` đổi tên, và chỗ này là chỗ dễ nhầm nhất của cả lane.
   * `server/problems/testcases.ts` đầu file có bảng so sánh: `required` hỏi
   * *không đạt thì có chặn không*, `visible` hỏi *có được XEM trước khi nộp
   * không*. Hai câu hỏi khác nhau, và ánh xạ `required: false` → `visible: false`
   * sẽ biến một mục tiêu THƯỞNG cũ thành một testcase ẨN — đổi nghĩa dữ liệu
   * đang có mà không ai ra lệnh.
   *
   * `required` biến mất theo quyết định #20 (*"một testcase thì luôn chặn — đó
   * là nghĩa của AC"*), nên bài cũ nạp lên nhận `visible: true` SUY TỪ ĐỊNH
   * NGHĨA của biên đọc (`problemTestcases`: chỉ một `false` tường minh mới ẩn),
   * không suy từ giá trị `required` cũ — biên đọc đã không còn chở nó.
   */
  visible: boolean;
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
   * ⛔ ĐÃ ĐI LÊN MÁY CHỦ từ 2026-09-15. Bản trước của chú thích này nói trường
   * chỉ lái GIAO DIỆN và không đi lên máy chủ, vì `problemBodyShape` khi đó
   * không có ô nào cho nó. §18.D.1 nửa sau mở ô đó, nên `toProblemDraft` nay
   * phát `gameId` thật và `PERSISTABLE_GAMES` đã xoá.
   */
  gameId: GameId;
  /**
   * §18.D.6 — bài có sinh được đề theo seed không.
   *
   * ⚠ Hôm nay LUÔN `false` trên thực tế, và giao diện nói thẳng lý do: không
   * plugin nào khai `seedSpec`, nên bật cờ là hứa một thứ chưa có gì thực hiện.
   * Cả `formWithGame` lẫn biên ghi đều ép nó về `false` khi plugin thiếu
   * `seedSpec` — hai lớp, vì giao diện không phải cổng.
   */
  seedable: boolean;
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
  // `visible: true` là mặc định AN TOÀN, cùng chiều với biên đọc: một testcase
  // ẩn ngoài ý muốn giấu mất đề bài của người làm, còn một testcase hiện ngoài
  // ý muốn chỉ làm bài dễ hơn dự định. Hai lỗi không cùng giá.
  return { key, id: '', label: '', check: '', args: {}, visible: true };
}

/**
 * Đổi chỗ một mục tiêu với hàng xóm của nó — §18.D.2.
 *
 * Hàm THUẦN và nằm ngoài JSX, cùng lý lẽ đã ghi cho `formWithGame`: ô nghiệm thu
 * đo được nó mà không phải dựng DOM, và một phép hoán vị sai chỗ thì chỉ lộ ra
 * khi có người bấm đúng nút ở đúng vị trí đầu/cuối danh sách.
 *
 * Trả về CHÍNH mảng cũ khi nước đi ra ngoài biên, chứ không phải một bản sao:
 * React so sánh theo tham chiếu, nên một bản sao đồng nội dung vẫn làm cả tab
 * render lại và làm `hasUnsavedChanges` bật lên sau một cú bấm không đổi gì.
 *
 * ⚠ `key` đi THEO phần tử, không theo vị trí. Nếu đổi chỗ mà giữ `key` tại chỗ
 * thì React giữ nguyên DOM cũ ở mỗi ô và giá trị đang gõ dở nhảy sang mục tiêu
 * khác — đúng lỗi mà `problem-json.ts` đã ghi lại cho `clusterFromSpec`.
 */
export function moveObjective(
  objectives: readonly ObjectiveFormState[],
  index: number,
  delta: -1 | 1,
): readonly ObjectiveFormState[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= objectives.length) {
    return objectives;
  }
  const next = [...objectives];
  const moved = next[index];
  const swapped = next[target];
  if (moved === undefined || swapped === undefined) {
    return objectives;
  }
  next[index] = swapped;
  next[target] = moved;
  return next;
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
  return {
    ...form,
    gameId,
    specText: specTextForGame(gameId),
    topics: [],
    // `seedable` TẮT khi game mới không sinh được đề theo seed. Giữ nguyên cờ
    // đang bật sẽ để lại một ô đánh dấu vừa BẬT vừa BỊ VÔ HIỆU HOÁ trên màn
    // hình — người soạn không tắt được nó, và lượt Lưu bị máy chủ từ chối bằng
    // một lỗi trỏ vào ô họ không bấm được.
    seedable: form.seedable && (pluginViewFor(gameId)?.canSeed ?? false),
  };
}

export function emptyForm(nextKey: () => string): ProblemFormState {
  return {
    gameId: DEFAULT_AUTHOR_GAME,
    seedable: false,
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
  /**
   * Game của bài đã lưu. TUỲ CHỌN, và đó là lời khai của hai người gọi chứ
   * không phải chỗ bỏ lỏng: `problem-json.ts` dựng object này từ một file có
   * thể được xuất ra TRƯỚC khi định dạng có khoá `gameId`, nên đòi bắt buộc là
   * đòi một thứ dữ liệu cũ không có. Vắng mặt ⇒ `DEFAULT_AUTHOR_GAME`, đúng
   * nghĩa "mọi bài viết trước 0015 đều là bài K8s" mà migration đã chọn làm
   * DEFAULT của cột.
   */
  readonly gameId?: GameId;
  readonly seedable?: boolean;
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
  /*
   * ⛔ ĐỌC `gameId` THẬT từ 2026-09-15 — bản trước chốt cứng `DEFAULT_AUTHOR_GAME`.
   *
   * Nó chốt cứng vì nửa GHI chưa theo kịp: `problemBodyShape` khai
   * `initialState: clusterSpecSchema`, nên đọc `gameId` thật sẽ cho một biểu mẫu
   * MỞ được bài Git rồi lưu đè nó bằng một `ClusterSpec`. Chú thích cũ nói rõ
   * *"hai nửa phải đi cùng một lượt"*, và đây là lượt đó: biên ghi nay nhận
   * `gameId` cùng `initialState` đa-game.
   */
  const gameId = problem.gameId ?? DEFAULT_AUTHOR_GAME;
  const view = pluginViewFor(gameId);
  /*
   * Trạng thái ban đầu đi về ĐÚNG MỘT trong hai trường, do `specEditor` quyết.
   *
   * `cluster` và `specText` cùng tồn tại trong form nhưng mỗi lượt soạn chỉ có
   * một trường được trình soạn đọc (xem chú thích `ProblemFormState.specText`).
   * Nạp nhầm trường là một lỗi im lặng: biểu mẫu hiện ra trống trơn, người soạn
   * bấm Lưu, và bản gốc bị ghi đè bằng một spec rỗng.
   */
  const usesClusterForm = view === null || view.specEditor === 'cluster';
  const loadedSpec =
    typeof problem.initialState === 'object' && problem.initialState !== null
      ? (problem.initialState as Readonly<Record<string, unknown>>)
      : null;

  return {
    gameId,
    // `seedable` của bài thắng, nhưng chỉ khi plugin còn sinh được đề theo seed.
    // Một bài cũ khai `true` trên một plugin đã gỡ `seedSpec` mà nạp lên thành
    // `true` sẽ là một ô bật-mà-không-tắt-được, y hệt ca ở `formWithGame`.
    seedable: (problem.seedable ?? false) && (view?.canSeed ?? false),
    specText:
      usesClusterForm || view === null || loadedSpec === null
        ? specTextForGame(gameId)
        : specToText(view.authorFields, loadedSpec),
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
    cluster: usesClusterForm
      ? clusterFromSpec(problem.initialState as ClusterSpec, nextKey)
      : emptyCluster(nextKey),
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
       * ĐỌC THẲNG `visible` — cùng một trường, không phải một phép suy.
       *
       * Bản trước ghi cứng `required: true` và giải thích rằng ô `required` trên
       * màn hình đang mất dần ý nghĩa. §18.D.2 gỡ hẳn nó: `ObjectiveFormState`
       * nay mang `visible`, nên biên nạp chỉ việc chở giá trị sang.
       *
       * ⛔ Dòng này KHÔNG phải `required` đọc ngược, dù nó đứng đúng chỗ dòng đó
       * từng đứng. Giá trị tới từ `problemTestcases` — biên đọc đã bỏ `required`
       * và dựng `visible` theo luật *"chỉ một `false` TƯỜNG MINH mới làm testcase
       * ẩn"*, nên một mục tiêu THƯỞNG cũ (`required: false`) nạp lên thành
       * `visible: true`, không thành testcase ẩn. Đó là chiều đúng: nó đổi cái
       * bài đó CHẤM thế nào (theo #20, mọi case đều chặn), chứ không đổi cái
       * người làm ĐƯỢC XEM.
       */
      visible: testcase.visible,
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
