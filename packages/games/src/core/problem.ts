/**
 * Hợp đồng bài tập kiểu OJ — phần KHÔNG phụ thuộc game nào.
 *
 * ⛔ ĐỌC TRƯỚC KHI SỬA. File này là nền của §18.A và nó có **một ràng buộc cứng**:
 *
 * > `core/` không được biết `ClusterSpec`, `WorldSpec`, hay bất kỳ kiểu nào của
 * > một game cụ thể. Ô nghiệm thu AC-A đo đúng điều đó:
 * > `grep -n "ClusterSpec" packages/games/src/core/` phải trả **rỗng**.
 *
 * Cách giữ ràng buộc đó mà vẫn mô tả được "trạng thái ban đầu của bài": tham số
 * kiểu `Spec`. `core/` khai *bài tập có một trạng thái ban đầu*; game nào điền
 * kiểu nấy (`ProblemBase<ClusterSpec>` ở k8s, `ProblemBase<WorldSpec>` ở git).
 * Kiểu cụ thể đi vào từ mép ngoài, không nằm ở đây.
 *
 * ── Ba khái niệm cạnh nhau, rất dễ lẫn (giữ nguyên từ `k8s/problem.ts`) ──
 *
 * | Khái niệm | Ai dạy | Chấm bằng gì                   | Ở đâu               |
 * |-----------|--------|--------------------------------|---------------------|
 * | `Level`   | CÓ dạy | vị từ trên thế giới mô phỏng   | `levels/lNN.ts`     |
 * | `Problem` | KHÔNG  | testcase trên thế giới mô phỏng| DB + file seed      |
 * | `Lab`     | KHÔNG  | `verify.sh` trong sandbox THẬT | `packages/scenario` |
 */

import { t } from '@devops-platform/copy';

import type { GameAction, RunLog } from './run-log.ts';
import type { GameId } from './types.ts';

// ── Độ khó ──────────────────────────────────────────────────────────────────

/**
 * Độ khó — BỐN bậc, cố ý KHÁC ba bậc `SCENARIO_DIFFICULTIES`
 * (`beginner | intermediate | advanced`) của `packages/scenario`, và cũng khác
 * ba bậc `Difficulty` ở `core/types.ts` (`basic | intermediate | advanced`) mà
 * `RunResult` dùng cho LEVEL.
 *
 * Đây không phải bất nhất do sơ suất, và nó vẫn đúng sau khi chuyển lên `core/`:
 * bài lab và level là nội dung dạy nên ba bậc là đủ; một OJ thì cần tách "khó"
 * khỏi "rất khó" vì đó là ranh giới người dùng dựa vào để chọn bài kế tiếp.
 *
 * ⚠ Vì BA thang khác nhau cùng tồn tại trong repo này, TUYỆT ĐỐI không ánh xạ
 * ngầm giữa chúng. Chỗ nào cần đổi qua lại thì viết hàm đổi tường minh và đặt
 * tên nói rõ nó làm mất thông tin.
 */
export const PROBLEM_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;

export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

export const PROBLEM_DIFFICULTY_LABELS: Readonly<Record<ProblemDifficulty, string>> = {
  easy: t('problem.difficulty.easy'),
  medium: t('problem.difficulty.medium'),
  hard: t('problem.difficulty.hard'),
  expert: t('problem.difficulty.expert'),
};

// ── Vòng đời ────────────────────────────────────────────────────────────────

/** Vòng đời bài. `draft` không hiện với người học, kể cả khi biết URL. */
export const PROBLEM_STATES = ['draft', 'published', 'archived'] as const;

export type ProblemState = (typeof PROBLEM_STATES)[number];

// ── Chủ đề ──────────────────────────────────────────────────────────────────

/**
 * Chủ đề ở tầng `core/` là một **chuỗi mờ**, không phải union đóng — và đó là
 * chỗ file này cố ý đi khác `k8s/problem.ts` cũ.
 *
 * Bản cũ khai `PROBLEM_TOPICS` là 9 chủ đề K8s (`workload`, `scheduling`,
 * `networking`, …). Chín tên đó là tri thức về Kubernetes, không phải tri thức
 * về "bài tập" — để chúng ở `core/` thì một bài Git sẽ phải chọn chủ đề trong
 * một danh sách nói về Pod.
 *
 * Tập đóng **không biến mất**, nó chuyển chỗ: mỗi plugin khai tập chủ đề của
 * game mình (`GameProblemPlugin.topics`), và cổng kiểm là "chủ đề của bài phải
 * nằm trong tập của plugin theo `gameId` của bài". Lý do phải đóng vẫn nguyên
 * vẹn — một trường tự do sẽ đẻ ra "Networking", "networking", "network", "Mạng"
 * là bốn mục khác nhau cho cùng một thứ, và không ai gộp lại được sau vài trăm
 * bài. `tags` bên dưới mới là chỗ cho phân loại tự do.
 */
export type ProblemTopicId = string;

/** Một chủ đề kèm nhãn hiển thị. Plugin cấp; `core/` chỉ biết hình dạng. */
export interface ProblemTopicOption {
  readonly id: ProblemTopicId;
  readonly label: string;
}

// ── Định danh ───────────────────────────────────────────────────────────────

/**
 * Mã bài hiển thị, ví dụ `K8S-0042` hoặc `GIT-0007`.
 *
 * ⚠ Mã bài KHÔNG phải khoá chính và KHÔNG phải slug URL. Ba thứ khác nhau:
 *
 * - `code` — thứ người ta đọc cho nhau nghe ("làm được K8S-0042 chưa?"). Ổn
 *   định vĩnh viễn, không đổi kể cả khi bài được sửa đề.
 * - `slug`  — thứ nằm trong URL, sinh từ tiêu đề, CÓ THỂ đổi khi sửa tiêu đề.
 * - khoá chính trong DB — `code`, vì nó là thứ duy nhất không bao giờ đổi.
 *
 * Bốn chữ số chứ không phải số tự tăng không giới hạn: 9999 bài mỗi game là
 * trần thực tế xa hơn mọi kế hoạch, và độ dài cố định làm mã sắp xếp đúng bằng
 * so sánh chuỗi — nghĩa là `ORDER BY code` không cần ép kiểu, và một chỉ mục
 * btree thường là đủ.
 *
 * Tiền tố là thứ DUY NHẤT khác nhau giữa các game, nên nó là tham số chứ không
 * phải một regex chép lại ở mỗi plugin.
 */
export const PROBLEM_CODE_SUFFIX_DIGITS = 4;

export function problemCodePattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}-\\d{${PROBLEM_CODE_SUFFIX_DIGITS}}$`);
}

/**
 * ⚠ Nhận `prefix` tường minh, KHÔNG tự suy từ `gameId`.
 *
 * Suy ngầm (`gameId.toUpperCase()`) trông gọn hơn và sai ngay ở ca thứ hai:
 * `gameId` là `'k8s'` còn tiền tố là `K8S` — trùng nhau tình cờ; `'cicd'` thì
 * tiền tố hợp lý là `CI` chứ không phải `CICD`. Một phép suy đúng ở ca đầu và
 * sai ở ca sau là thứ không ai kiểm lại. Plugin khai tiền tố của mình.
 */
export function isProblemCode(value: string, prefix: string): boolean {
  return problemCodePattern(prefix).test(value);
}

// ── Gợi ý ───────────────────────────────────────────────────────────────────

/**
 * Gợi ý CÓ GIÁ. Khác hẳn `hints: string[]` của `Level` (miễn phí, vì level dạy).
 * Ở một OJ, mở gợi ý là đánh đổi: được chỉ đường, mất điểm.
 */
export interface ProblemHint {
  readonly id: string;
  readonly text: string;
  /** Điểm bị trừ khi người làm mở gợi ý này. 0 = miễn phí. */
  readonly penaltyPoints: number;
}

/**
 * Gợi ý ở dạng NGƯỜI HỌC được phép thấy: biết nó tồn tại, biết mở thì mất bao
 * nhiêu điểm, nhưng chưa thấy nội dung.
 *
 * ⚠ Đây là một lỗ hổng ĐÃ ĐƯỢC VÁ, đừng để 18.A mở lại nó. `ProblemHint.text`
 * là trường bắt buộc, nên một API trả thẳng bài cho người học sẽ gửi kèm toàn
 * bộ nội dung gợi ý xuống trình duyệt — và lúc đó việc trừ điểm chỉ còn là một
 * hoạt cảnh: ai mở tab công cụ nhà phát triển đều đọc được gợi ý miễn phí. Che
 * ở tầng giao diện KHÔNG cứu được, vì dữ liệu đã nằm trong phản hồi rồi.
 *
 * Cách chặn duy nhất có hiệu lực là để kiểu dữ liệu ngăn chuyện đó: đường của
 * người học trả `ProblemForSolver`, và kiểu đó KHÔNG có chỗ nào chứa `text` của
 * gợi ý chưa mở.
 */
export interface ProblemHintTeaser {
  readonly id: string;
  readonly penaltyPoints: number;
  readonly revealed: boolean;
  /** Chỉ khác `null` khi `revealed` là `true`. Máy chủ quyết, không phải client. */
  readonly text: string | null;
}

// ── Testcase ────────────────────────────────────────────────────────────────

/**
 * Một testcase — §18.B.1, và là hiện thực của quyết định **#20**:
 *
 * > **Objective = testcase.** Verdict `AC` chỉ khi qua hết; nếu không thì
 * > `WA (4/5)`.
 *
 * ⚠ KHÔNG có trọng số, và KHÔNG có `required`. Cả hai đều là lựa chọn tường
 * minh, không phải thiếu sót:
 *
 * - **Trọng số**: chủ dự án đã bỏ khái niệm đó tường minh (design §1 #20). Thêm
 *   lại một cột `weight` là làm hỏng chính định nghĩa verdict — với trọng số thì
 *   "qua 4/5" không còn nói lên điều gì vì 4 case nhẹ khác 4 case nặng.
 * - **`required`**: `Objective` của LEVEL có `required: boolean` để tách mục
 *   tiêu thưởng khỏi mục tiêu chặn. Một testcase thì luôn chặn — đó là nghĩa của
 *   `AC`. Ai muốn "mục tiêu thưởng" trong một bài OJ đang muốn một thứ khác
 *   (bậc sao theo `parMoves`), và thứ đó đã có chỗ riêng.
 *
 * `Objective` ở `k8s/contract.ts` KHÔNG bị thay thế — level vẫn dùng nó. Hai
 * kiểu sống cạnh nhau vì chúng trả lời hai câu hỏi khác nhau.
 */
export interface Testcase {
  readonly id: string;
  /** Tiếng Việt, một câu, nói người làm phải đạt ĐƯỢC gì (không phải làm THẾ NÀO). */
  readonly label: string;
  /** Tên vị từ. Tập tên hợp lệ do plugin của game khai (`GameProblemPlugin.predicateNames`). */
  readonly check: string;
  /** Tham số truyền cho vị từ, ví dụ `{ name: 'web', minReplicas: 3 }`. */
  readonly args?: Readonly<Record<string, unknown>>;
  /**
   * §18.B.4 — testcase ẩn.
   *
   * `false` ⇒ người làm **chỉ thấy tên sau khi nộp**, không thấy trước. Đây là
   * thứ chặn kiểu dò đáp án bằng cách nộp nhiều lần: nếu mọi testcase đều hiện
   * thì người làm đọc được toàn bộ điều kiện chấm và lập trình ngược nó mà không
   * cần hiểu bài.
   *
   * ⚠ Cũng như `ProblemHintTeaser`, che ở tầng giao diện KHÔNG đủ. Đường của
   * người học phải KHÔNG gửi `check`/`args` của testcase ẩn xuống trình duyệt —
   * xem `TestcaseTeaser`.
   */
  readonly visible: boolean;
}

/**
 * Testcase ở dạng gửi cho người học TRƯỚC khi nộp.
 *
 * Testcase hiện thì cho xem nhãn; testcase ẩn thì chỉ cho biết *nó tồn tại* (để
 * mẫu số `n/m` trung thực) mà không cho biết nó kiểm gì.
 *
 * `check` và `args` KHÔNG có mặt trong kiểu này ở bất kỳ trường hợp nào — kể cả
 * với testcase hiện. Nhãn là đề bài; tên vị từ và tham số là cách chấm, và cách
 * chấm không phải thứ người làm cần để làm bài.
 */
export interface TestcaseTeaser {
  readonly id: string;
  /** `null` khi testcase ẩn và người làm CHƯA nộp. */
  readonly label: string | null;
  readonly visible: boolean;
}

// ── Verdict ─────────────────────────────────────────────────────────────────

/**
 * §18.B.1. Ba giá trị, không hơn.
 *
 * - `AC` — qua **hết** testcase. Không có "AC một phần".
 * - `WA` — chạy được nhưng không qua hết. Hiển thị kèm `n/m` (§18.B.3).
 * - `CE` — §18.B.5: lỗi cú pháp, lệnh không tồn tại, YAML hỏng. Khác `WA` ở chỗ
 *   lượt chơi **không chạy tới nơi**, nên `passed`/`total` không nói lên gì.
 *
 * ⚠ Cố ý KHÔNG có `TLE`/`RE`/`MLE` như một OJ chấm code. Game chạy trong trình
 * duyệt trên một thế giới mô phỏng: không có tiến trình để hết giờ, không có bộ
 * nhớ để tràn. Thêm chúng vào đây là chép một từ vựng không có nghĩa ở đây.
 *
 * ── VÌ SAO TÊN LÀ `ProblemVerdict` CHỨ KHÔNG PHẢI `Verdict` ──
 *
 * Plan §18.B.1 viết `Verdict 'AC' | 'WA' | 'CE'`. Cái tên trần đó **đã có chủ**:
 * `git/predicates.ts:383` khai `Verdict` là một *object*
 * `{ accepted, passedCount, totalCount, failedIds, bonusMet }`, và nó đang được
 * mở ra ngoài qua barrel. Hai thứ khác hẳn nhau:
 *
 * | | `git/predicates.ts` `Verdict` | `ProblemVerdict` (ở đây) |
 * |---|---|---|
 * | Dùng cho | LEVEL | bài OJ |
 * | Hình dạng | object có số liệu | một nhãn |
 * | Mục tiêu thưởng | CÓ (`bonusMet`) | không — `Testcase` cố ý bỏ `required` |
 *
 * Nên đây không phải "đổi tên cho khỏi trùng" mà là hai khái niệm thật sự khác
 * nhau. Chồng tên lên nhau sẽ cho ra một `import { Verdict }` mà người đọc
 * không biết mình đang cầm cái nào.
 *
 * ⚠ NỢ ĐÃ GHI TÊN, đừng để nó chìm: cái tên `Verdict` trần ở `git/predicates.ts`
 * quá rộng so với thứ nó mô tả (nó là kết quả chấm một LEVEL GIT). Đổi nó thành
 * `GitLevelVerdict` là việc đúng, nhưng nó đụng mã đang chạy nên thuộc một bước
 * dịch chuyển riêng của 18.A — không gộp vào commit thêm-mới này.
 */
export const PROBLEM_VERDICTS = ['AC', 'WA', 'CE'] as const;

export type ProblemVerdict = (typeof PROBLEM_VERDICTS)[number];

/**
 * Suy verdict từ kết quả chấm. **Hàm thuần, một nguồn sự thật duy nhất.**
 *
 * Cả client (hiển thị ngay) và server (chấm lại, §18.C) đều gọi hàm này. Đó
 * chính là điều làm phép so verdict ở §18.C.3 có nghĩa: nếu hai bên dùng hai
 * phép suy khác nhau thì một lệch nhau nói về hai hàm chứ không nói gì về engine.
 *
 * `total <= 0` ⇒ `CE`, không phải `AC`. Một bài không có testcase nào thì chưa
 * chấm được, và "qua hết 0 testcase" là đúng về mặt logic nhưng sai về mặt ý
 * nghĩa — nó sẽ phát `AC` cho mọi lượt nộp vào một bài soạn dở.
 */
export function problemVerdictOf(passedCount: number, total: number): ProblemVerdict {
  if (total <= 0) return 'CE';
  return passedCount >= total ? 'AC' : 'WA';
}

// ── Bài tập ─────────────────────────────────────────────────────────────────

/**
 * Bài tập, phần chung cho mọi game.
 *
 * `Spec` là kiểu trạng thái ban đầu của game — `ClusterSpec` ở k8s, `WorldSpec`
 * ở git. Xem khối đầu file về lý do nó là tham số kiểu chứ không phải một union.
 */
export interface ProblemBase<Spec> {
  readonly code: string;
  /** Quyết định plugin nào chấm bài này, và tập chủ đề / vị từ nào hợp lệ. */
  readonly gameId: GameId;
  readonly slug: string;
  readonly title: string;
  /**
   * Đề bài, markdown. NGẮN — trần cứng 150 từ, gác bằng test.
   *
   * Con số này là phản ứng trực tiếp với lời chê về `Level`: brief trung bình
   * 189 từ cộng primer 193 từ bắt người chơi đọc ~382 từ trước khi được gõ lệnh
   * đầu tiên. Một bài OJ không dạy, nên nó chỉ cần nói ĐỀ, không giảng bài.
   */
  readonly statement: string;
  readonly difficulty: ProblemDifficulty;
  /** Ít nhất một, tối đa ba. Nhiều hơn ba thì bài đang làm quá nhiều việc. */
  readonly topics: readonly ProblemTopicId[];
  /** Phân loại tự do, đã chuẩn hoá thường + gạch nối. Có thể rỗng. */
  readonly tags: readonly string[];
  /** `null` = không giới hạn giờ. Không phải bài nào cũng nên chạy đua. */
  readonly timeLimitSec: number | null;
  readonly initialState: Spec;
  /**
   * Trạng thái ĐÍCH, khi bài chấm bằng cách so hình dạng thay vì bằng vị từ rời.
   *
   * Thêm 2026-09-14 vì một vị từ **khai được nhưng dùng không được**: lane
   * 18.A.5 đưa `graphShapeMatches` vào `predicateNames` của plugin Git, rồi
   * phát hiện `ProblemBase` không có ô nào chứa cây đích để so — nên nó buộc
   * phải trả `CE` kèm lý do. Một vị từ hợp lệ ở bảng từ vựng mà không bao giờ
   * chạy được là đúng loại mã chết không đỏ ở đâu cả.
   *
   * `?` chứ không bắt buộc: phần lớn bài chấm bằng vị từ trên trạng thái cuối và
   * không có khái niệm "đích". Bài nào dùng `graphShapeMatches` thì phải có ô
   * này, và cổng kiểm của plugin là chỗ khẳng định điều đó — không phải kiểu.
   *
   * ⚠ Cùng một ô này là thứ §18.E.1 cần: Level Builder có hai nút "Đặt làm
   * trạng thái đầu" và "Đặt làm đích". Hai nhu cầu, một ô — đừng thêm ô thứ hai
   * cho Builder.
   */
  readonly targetState?: Spec;
  /** Ít nhất một. Một bài không có testcase là một bài không chấm được. */
  readonly testcases: readonly Testcase[];
  readonly hints: readonly ProblemHint[];
  /** Số nước đi "chuẩn" để tính sao. `null` = không chấm theo số nước. */
  readonly parMoves: number | null;
  /**
   * §18.D.6 — bài có sinh được đề theo seed không.
   *
   * ⚠ Đây là cổng gác của §18.G.3: một kỳ thi dùng `seedStrategy: 'per-student'`
   * mà nhận bài `seedable: false` thì **mỗi sinh viên nhận một đề khác độ khó mà
   * không ai biết**. Cờ này là thứ duy nhất chặn được chuyện đó, nên nó nằm trên
   * chính bài chứ không phải suy ra lúc tạo kỳ thi.
   */
  readonly seedable: boolean;
  readonly state: ProblemState;
  /** `null` với bài seed trong repo — chúng không có tác giả là một tài khoản. */
  readonly authorId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Bài ở dạng gửi cho người học. Khác `ProblemBase` đúng hai chỗ: gợi ý đã che,
 * testcase đã che.
 */
export type ProblemForSolver<Spec> = Omit<ProblemBase<Spec>, 'hints' | 'testcases'> & {
  readonly hints: readonly ProblemHintTeaser[];
  readonly testcases: readonly TestcaseTeaser[];
};

// ── Nộp bài ─────────────────────────────────────────────────────────────────

/**
 * Một lượt nộp bài — §18.B.2.
 *
 * "Nộp bài" ở đây không giống OJ chấm code: không có file nộp, không có diff.
 * Người làm thao tác trên thế giới mô phỏng, và cái được lưu là **đủ để phát lại
 * từ đầu**: `(gameId, problemCode, seed, actions[])`. Đó là lý do §18.C chấm lại
 * được phía server, và là lý do sửa state phía client không qua được.
 *
 * ⛔ KHÔNG CÓ CỘT ĐIỂM, và đây là ràng buộc ô nghiệm thu AC-B đo tận nơi
 * (`grep -rn "score" packages/games/src/core/problem.ts` không được có cột lưu
 * điểm). Điểm là `passed.length / total`, tính ở chỗ dùng — quy ước No Derived
 * Fields của repo (`rules/code-conventions.md`). Lưu nó là lưu cùng một sự thật
 * hai lần, và hai bản sẽ lệch nhau ngay lần đầu ai đó sửa testcase của bài.
 *
 * ⚠ `total` thì KHÁC, và nó KHÔNG vi phạm quy ước trên — đọc kỹ chỗ này vì vế
 * suy-ra-được hay nấp cạnh vế hợp lệ: `total` **không** suy được từ bài lúc đọc
 * ra, vì bài có thể đã bị sửa sau lượt nộp. Nó là một **sự thật lịch sử** — "lúc
 * nộp, bài có bấy nhiêu testcase" — và nếu không chốt lại tại thời điểm nộp thì
 * một lượt `WA (4/5)` hôm nay sẽ tự đọc thành `WA (4/7)` sau khi tác giả thêm
 * hai case. `passed` cũng vậy.
 */
export interface Submission<A extends GameAction = GameAction> {
  readonly problemCode: string;
  readonly gameId: GameId;
  /**
   * Seed ĐÃ DÙNG THẬT cho lượt chơi này. Luôn là một số.
   *
   * ⛔ ĐÍNH CHÍNH 2026-09-14 — bản đầu của hợp đồng này khai `number | null`
   * ("`null` = bài không seedable"), và đó là một lỗi thiết kế, không phải một
   * lựa chọn. Lane 18.A.4/18.A.5 đo ra hệ quả: engine **bắt buộc** nhận một số
   * để dựng trạng thái đầu, nên `null` buộc mỗi plugin phải công bố một hằng
   * "không-seed" của riêng nó — và hai hằng đó đã lệch nhau ngay từ dòng đầu
   * tiên (`K8S_UNSEEDED_REPLAY_SEED = 0`, `GIT_UNSEEDED_REPLAY_SEED = 1`).
   *
   * Hai số khác nhau ở đây không đọc ra thành một lỗi. Nó đọc ra thành: client
   * chơi trên một thế giới đầu, server phát lại trên một thế giới đầu KHÁC, và
   * mọi lượt nộp HỢP LỆ đều bị từ chối. Nhìn từ phía người dùng, nó giống hệt
   * một hệ thống từ chối người chơi ngẫu nhiên.
   *
   * Cách chặn là bỏ hẳn chỗ cho phép hai bên tự chọn: lượt nộp **mang theo số
   * đã dùng**, server phát lại bằng đúng số đó. Không phía nào tra hằng lúc
   * chấm, nên không có gì để lệch.
   *
   * ⚠ Hằng mặc định của mỗi plugin KHÔNG biến mất — nó vẫn đúng và vẫn cần, chỉ
   * đổi vai: nó là số client dùng khi BẮT ĐẦU một bài không seedable (và với
   * Git nó phải là `1`, khớp mặc định của `createGitSession`, nếu không lượt
   * chấm OJ sẽ dựng thế giới khác mọi đường git còn lại của repo). Nó là mặc
   * định lúc chơi, không còn là mặc định lúc chấm.
   *
   * ⚠ Cổng gác đi kèm, thuộc §18.G: với bài `seedable: false`, server phải
   * KIỂM rằng seed gửi lên đúng bằng seed bài quy định. Không có cổng đó thì
   * "mang theo số đã dùng" thành "người nộp tự chọn thế giới đầu dễ nhất".
   */
  readonly seed: number;
  /** Nhật ký hành động, đủ để phát lại. Xem `RunLog` ở `core/run-log.ts`. */
  readonly actions: readonly A[];
  /** Id các testcase ĐÃ QUA. Id chứ không phải chỉ số — chỉ số vỡ khi tác giả đổi thứ tự. */
  readonly passed: readonly string[];
  /** Số testcase của bài TẠI THỜI ĐIỂM NỘP. Xem khối chú thích trên. */
  readonly total: number;
  /** Id các gợi ý đã mở — để trừ điểm, và để biết bài nào gợi ý quá khó hiểu. */
  readonly hintsRevealed: readonly string[];
  readonly submittedAt: string;
}

/**
 * Kết quả chấm một lượt — thứ cả client và server tính ra, và §18.C.3 đem so.
 *
 * `CE` mang `passed` rỗng và `failedReason` khác `null`; hai verdict còn lại thì
 * ngược lại. Không ép bất biến đó bằng kiểu (một union bốn nhánh cho ba verdict
 * đọc còn khó hơn), nhưng có test gác.
 */
export interface GradeResult {
  readonly verdict: ProblemVerdict;
  readonly passed: readonly string[];
  readonly total: number;
  /** Chỉ khác `null` khi verdict là `CE`. Câu tiếng Việt nói lỗi ở đâu. */
  readonly failedReason: string | null;
}

/**
 * Đầu vào của một lượt chấm lại. Là **toàn bộ** thứ server cần — cố ý không có
 * chỗ nào cho verdict của client.
 *
 * §18.C.1 nói thẳng: điểm cuối nộp bài **không nhận verdict của client**. Kiểu
 * này là cách ép điều đó ở tầng biên dịch thay vì tin vào kỷ luật của người viết
 * điểm cuối.
 */
export interface ReplayRequest<A extends GameAction = GameAction> {
  readonly problemCode: string;
  readonly gameId: GameId;
  /** Số thật, không bao giờ `null` — xem khối chú thích ở `Submission.seed`. */
  readonly seed: number;
  readonly actions: readonly A[];
}

/** Tiện cho chỗ nào đang cầm `RunLog` mà cần dựng `ReplayRequest`. */
export type ProblemRunLog = RunLog;
