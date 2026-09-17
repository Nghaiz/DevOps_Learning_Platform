/**
 * Hợp đồng của game **Đường ống CI/CD** (`gameId: 'cicd'`).
 *
 * ⛔ LEAD SỞ HỮU FILE NÀY. Tám lane chạy song song code ĐỐI KHÁNG với nó (19.A.2
 * bộ lập lịch · A.3 kiểm chu trình · A.4 cache · A.5 flaky · A.6 retry · A.7
 * đường găng · A.8 chạy N lượt · A.9 ba trục điểm). Sửa lén một field = một lane
 * biên dịch xanh trong khi lane kia hiểu khác, và mỗi lane vẫn typecheck xanh
 * riêng lẻ — đúng thứ `rules/contract-first-integration.md` sinh ra để chặn.
 * Thấy hợp đồng thiếu gì thì BÁO LEAD.
 *
 * SSOT thiết kế: `plans/reports/2026-09-11-brainstorm-git-cicd-games.md` §4.
 * Kế hoạch thi công: `plans/devops-learning-platform/phase-19.md`.
 * Tham khảo (KHÔNG phải đặc tả): `docs/games/pipeline.md` — mô hình stage/cache/
 * đường găng của nó vẫn tốt; tầng trình bày 2D thì bỏ. Chỗ nào file này đi khác
 * tài liệu đó, khác biệt được ghi tại chỗ kèm lý do.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ CẢNH BÁO MÔ HÌNH — ĐỌC TRƯỚC KHI VIẾT DÒNG ĐẦU TIÊN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * DAG của CI/CD **không có vòng lặp** và **không có trạng thái ổn định**. Mỗi
 * commit là một lô chạy MỘT LẦN rồi hết: đồ thị không quay về chính nó, không
 * có tồn kho, không có sản lượng mỗi giây hội tụ về một số.
 *
 * Bê nguyên mô hình steady-state kiểu Factorio vào đây là **dạy sai**. Ở
 * Factorio mục tiêu là một dây chuyền chạy mãi và bạn tối ưu điểm nghẽn để
 * sản lượng/giây hội tụ; ở đây thứ tương đương không tồn tại, và người học sẽ
 * mang về một trực giác không áp được vào bất kỳ đường ống thật nào.
 *
 * Đó là lý do mô hình chấm mượn **Opus Magnum** — nó có khái niệm "chạy một lô"
 * rõ ràng, và nó chấm ba trục tách bạch thay vì một điểm gộp. Ba trục ở §6 dưới
 * đây là ba **phép tính trên cùng một bản ghi**, không phải ba trường được lưu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BỐN RÀNG BUỘC CHI PHỐI MỌI KIỂU DƯỚI ĐÂY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **1. LÕI TRUNG LẬP.** File này và `cicd/engine.ts` KHÔNG được mang tên riêng
 *    của bất kỳ nhà cung cấp CI nào — không tên khoá YAML của họ, không tên
 *    hành động dựng sẵn của họ, không tên nhãn máy chạy của họ. Chỉ tầng
 *    đọc/ghi YAML (19.C) biết nhà cung cấp; thêm một nhà cung cấp thứ hai là
 *    thêm một bộ đọc, không đụng lõi. 19.C.6 viết một cổng grep khẳng định điều
 *    này và nó có đối chứng dương.
 *
 *    ⚠ Cổng đó KHÔNG đặt được trong `packages/games`: nó phải đọc file từ đĩa,
 *    mà package này cố ý không có `@types/node` (xem ràng buộc 3). Lane làm
 *    19.C.6 phải đặt nó ở tầng có quyền đọc đĩa — một script repo-level hoặc
 *    một package đã khai types node. Biết trước để không mất một vòng CI.
 *
 * **2. TẤT ĐỊNH TUYỆT ĐỐI.** Cùng `(WorkflowSpec, WorkloadSpec, seed)` ⇒ cùng
 *    `EvaluationRecord`, qua 1000 lượt, ở cả trình duyệt lẫn Node (AC-3). Hệ
 *    quả cứng lên hình dạng dữ liệu:
 *
 *    - **Không `Map`, không `Set` trong trạng thái.** Thứ tự lặp của chúng là
 *      thứ tự CHÈN, nên hai đường dựng cùng một workflow cho ra hai chuỗi kết
 *      quả khác nhau. Dùng mảng `readonly` (thứ tự tường minh) hoặc
 *      `Readonly<Record<K, V>>` **luôn lặp qua khoá đã sắp**.
 *    - **Sắp chuỗi bằng so sánh mã đơn vị (`a < b`), KHÔNG bằng
 *      `localeCompare`.** `localeCompare` phụ thuộc locale của môi trường: cùng
 *      dữ liệu, hai máy hai thứ tự, và triệu chứng là "điểm hợp lệ bị báo gian
 *      lận". Mọi định danh trong hợp đồng này bị ràng buộc là ASCII đúng vì lý
 *      do đó — xem `StageId`.
 *    - **Không `Date.now()`, không `Math.random()`.** Thời gian là `tick` (số
 *      nguyên). Ngẫu nhiên đi qua `core/rng.ts` — DÙNG LẠI, đừng viết PRNG thứ
 *      hai — và đi qua đúng cơ chế khoá ở §4.
 *
 * **3. KHÔNG `node:*`, không DOM, không React.** `packages/games/tsconfig.json`
 *    cố ý bỏ `types: ["node"]` nên một lần lạc tay là đỏ ngay ở typecheck.
 *
 * **4. KHÔNG FIELD SUY RA ĐƯỢC** (`rules/code-conventions.md`). Nếu `C = f(A,B)`
 *    và A, B đã có thì tính C ở chỗ dùng. Đây là chỗ plan dễ sai nhất: "lead
 *    time", "thông lượng", "runner-phút" nghe như ba trường để lưu, nhưng chúng
 *    là ba **phép chiếu trên cùng một `EvaluationRecord`** — xem §6, và xem ba
 *    nhân chứng ở đó, vì AC-9 đòi một test chứng minh chúng không suy ra được
 *    từ nhau. Lưu cả ba vào một struct làm test đó thành vô nghĩa.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CỐ TÌNH BỎ — đọc trước khi tưởng là thiếu sót
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `CicdSession` (ranh giới engine ↔ giao diện) · che giấu bí mật trong log
 * (19.B.9) · vòng reconcile GitOps và drift (19.B.7–B.8) · mét-ric canary có
 * nhiễu (19.B.5) · biểu diễn dòng log của một bước · toạ độ/bố cục 3D · tự
 * động phát hiện nhà cung cấp từ YAML.
 *
 * Bốn cái đầu thuộc 19.B/19.E và **không** cần hợp đồng đổi hình dạng để thêm
 * vào sau — xem §2.6 (chỗ cắm đã chừa). Toạ độ là việc của `core/layout/`, engine
 * không biết gì về toạ độ. Cái cuối là việc của 19.C.
 */

import type { Difficulty } from '../core/types.ts';
import type { CicdGameAction, RunLog } from '../core/run-log.ts';
import type { CdPolicyPart, CicdLevelCd } from './cd-contract.ts';

// ═══════════════════════════════════════════════════════════════════════════
// 1. ĐỊNH DANH VÀ ĐƠN VỊ ĐO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Định danh một stage trong workflow. **ASCII, `[a-z0-9-]`, không rỗng.**
 *
 * Ràng buộc ASCII không phải thẩm mỹ: `id` là khoá sắp thứ tự của hàng đợi (§4),
 * và sắp chuỗi tiếng Việt cho ra thứ tự khác nhau giữa các môi trường. Bộ đọc
 * YAML (19.C) chuẩn hoá ở biên và từ chối id không hợp lệ kèm dòng/cột.
 */
export type StageId = string;

/** Định danh một bước trong một stage. Cùng ràng buộc ASCII như `StageId`. */
export type StepId = string;

/**
 * Định danh một **đầu vào của workspace** — thứ trong kho mã có thể đổi giữa
 * hai commit: `'lockfile'`, `'src'`, `'assets'`, `'dockerfile'`.
 *
 * Đây là trục mà toàn bộ bài học cache xoay quanh (C06–C08). Không có khái niệm
 * này thì "khoá quá rộng" và "khoá quá hẹp" không phát biểu được bằng dữ liệu,
 * chỉ phát biểu được bằng văn xuôi.
 */
export type InputId = string;

/**
 * Định danh một **sản phẩm** do một bước tạo ra và bước khác cần: `'dist'`,
 * `'image'`, `'coverage'`.
 *
 * `requires`/`produces` (xem `StepSpec`) là cơ chế làm cho "thiếu một cạnh phụ
 * thuộc" trở thành một lỗi ĐỎ THẬT chứ không phải một lời nhắc: một bước cần
 * `dist` mà stage của nó không phụ thuộc (bắc cầu) vào stage sản xuất `dist`
 * thì nó đỏ, và retry bao nhiêu lần cũng đỏ. Đó chính là bài C10.
 */
export type OutputId = string;

export type CacheId = string;

/**
 * Định danh một **hạng máy chạy**: `'linux-nho'`, `'linux-lon'`, `'macos'`.
 *
 * Stage khai hạng nó cần; số lượng máy mỗi hạng là dữ liệu của level
 * (`RunnerPool`), KHÔNG nằm trong workflow. Đó là phân vai đúng với đời thật —
 * người viết workflow không quyết định đội có bao nhiêu máy — và nó giữ cho
 * 19.C chỉ phải ánh xạ đúng `WorkflowSpec`.
 */
export type RunnerClassId = string;

export type CommitId = string;

/**
 * Khoá của MỘT thực thể stage trong một lượt chạy.
 *
 * Dạng: `stageId` khi stage không quạt ra; `stageId + '#' + values.join('/')`
 * khi có (giá trị theo ĐÚNG thứ tự trục khai trong `FanOutSpec.axes`), ví dụ
 * `test#node20/ubuntu`.
 *
 * ⛔ Định dạng này là một phần của hợp đồng, không phải chi tiết hiện thực: nó
 * đi vào khoá rút ngẫu nhiên (§4), nên đổi cách nối chuỗi là đổi TOÀN BỘ kết
 * quả của mọi level đã cân bằng, trong im lặng.
 */
export type InstanceKey = string;

/**
 * Số giây thật mà một tick biểu diễn.
 *
 * Tồn tại vì hai trong ba trục điểm phát biểu bằng đơn vị đời thật ("runner-phút",
 * "commit mỗi giờ"). Không có hằng này thì tầng giao diện phải tự đoán, và ba
 * lane sẽ đoán ba số khác nhau.
 *
 * ⚠ Đây là hằng TRÌNH BÀY. Engine tính hoàn toàn bằng tick nguyên; đổi số này
 * KHÔNG được làm đổi bất kỳ bản ghi nào, chỉ đổi nhãn hiển thị.
 */
export const SECONDS_PER_TICK = 10;

/**
 * Số lượt mô phỏng mặc định cho một lần chấm.
 *
 * 20, và con số này có lý do sư phạm chứ không phải tròn số: một đường ống có
 * `flakeRate = 0.05` ở ba bước sẽ xanh khoảng 86% số lượt. Chấm trên MỘT lượt
 * là tung đồng xu, và người chơi học được đúng bài học sai — *"chạy lại là
 * hết"*. Bài C09 chỉ nhìn thấy được khi có đủ lượt để đọc một phân bố.
 */
export const DEFAULT_EVALUATION_PASSES = 20;

// ═══════════════════════════════════════════════════════════════════════════
// 2. WORKFLOW SPEC — thứ NGƯỜI CHƠI soạn, và là thứ DUY NHẤT 19.C ánh xạ
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ RANH GIỚI: bộ đọc/ghi YAML chỉ đi hai chiều với `WorkflowSpec`. Mọi thứ ở
// §3 (máy chạy, dòng commit, đầu vào biến động) là dữ liệu LEVEL và không bao
// giờ xuất hiện trong YAML người chơi gõ. Trộn hai thứ vào một kiểu là ép 19.C
// phải sinh ra YAML chứa thông tin mà không nhà cung cấp nào có khoá để tả.

/**
 * Loại việc một stage làm. Dùng cho biểu tượng, màu, và bài lý thuyết — **không**
 * cho luật chạy: engine không xử khác nhau theo `kind`, trừ `'approval'` (xem
 * `StageSpec.runnerSlots`).
 *
 * Danh sách runtime đi kèm kiểu (đúng lối `GAME_IDS` ở `core/types.ts`) vì bộ
 * đọc YAML phải kiểm một giá trị đọc từ chữ người dùng gõ — một danh sách chép
 * tay ở đó là một bản sao sẽ lệch.
 *
 * ⚠ Bước đầu tiên tên `'clone'`, và đó là chủ ý hai lần. (1) *Trung lập:* tên
 * quen thuộc hơn là từ vựng riêng của một nhà cung cấp, nên nó vi phạm ràng
 * buộc 1. (2) *Cổng chống-thương-mại:* `scripts/check-no-commerce.mjs` bắt token
 * đó ở mọi vùng, `packages/games/src` NẰM TRONG vùng quét từ 2026-09-08 (commit
 * `5c3815c`), và hiện chưa dòng miễn trừ nào phủ `cicd/`. `clone` mô tả đúng
 * việc máy chạy làm và không va vào mẫu nào — nên chọn nó, cổng không phải nới.
 */
export const STAGE_KINDS = [
  'clone',
  'restore-cache',
  'build',
  'unit-test',
  'integration-test',
  'lint',
  'sast',
  'image-scan',
  'package',
  'publish',
  'approval',
  'deploy',
  'smoke',
  'promote',
  'rollback',
  'gate',
] as const;

export type StageKind = (typeof STAGE_KINDS)[number];

/**
 * Tập con của `STAGE_KINDS` chỉ có nghĩa ở **chương CD** (19.B).
 *
 * Khai sẵn ngay từ đợt CI là chủ ý: `StageKind` là union ĐÓNG, và mở rộng nó
 * sau khi 28 level đã viết là một lần đổi hợp đồng. Ở chương CI các giá trị này
 * hợp lệ về kiểu nhưng không level nào dùng — `contract.test.ts` ghim quan hệ
 * tập con hai chiều để một lane thêm vào một danh sách mà quên danh sách kia sẽ
 * đỏ ngay.
 */
export const CD_STAGE_KINDS = [
  'approval',
  'deploy',
  'smoke',
  'promote',
  'rollback',
] as const satisfies readonly StageKind[];

export type CdStageKind = (typeof CD_STAGE_KINDS)[number];

/**
 * Bản chất của một lần đỏ ngẫu nhiên. Đây là chỗ bài C09, C10, C11 tách nhau.
 *
 * - `'infra'` — đỏ giả thật sự: máy chạy hết bộ nhớ, mạng chớp, thùng chứa khởi
 *   động chậm. Retry cứu được, và retry ở đây là việc ĐÚNG.
 * - `'latent-defect'` — bước đó đang bắt được một lỗi THẬT nhưng chỉ lộ đôi lúc
 *   (đua luồng, phụ thuộc thứ tự). Retry vẫn làm nó xanh, nhưng mỗi lần bị che
 *   như vậy là một khiếm khuyết lọt xuống bản đã phát hành.
 *
 * Hai nhánh này trông **giống hệt nhau trong lúc chạy** và chỉ lộ ra sau khi
 * lượt chạy kết thúc (`AttemptRecord.flakeNature`), đúng như đời thật. Bài C11
 * sống trọn vẹn trên khác biệt đó: người chơi gọi cả hai là "flaky", bấm chạy
 * lại, và chỉ bảng tổng kết mới nói cho họ biết họ vừa che cái gì.
 */
export const FLAKE_NATURES = ['infra', 'latent-defect'] as const;

export type FlakeNature = (typeof FLAKE_NATURES)[number];

export interface FlakeSpec {
  /** 0..1. Xác suất MỖI LẦN THỬ của bước này đỏ mà không phải lỗi trong đồ thị. */
  readonly rate: number;
  readonly nature: FlakeNature;
}

/**
 * Bộ nhớ đệm giữa các lượt chạy.
 *
 * ⚠ HAI danh sách, và đây là điểm khác quan trọng nhất so với
 * `docs/games/pipeline.md` (nó chỉ có `invalidatedBy`). Một danh sách là thứ
 * NGƯỜI CHƠI viết, một là SỰ THẬT của level; gộp chúng làm một thì hai bài học
 * C07 và C08 không còn phát biểu được bằng dữ liệu:
 *
 * - **C07 "khoá quá rộng"** — `keyParts` chứa một đầu vào đổi theo mọi commit
 *   (`'src'`), nên khoá không bao giờ trùng lượt trước ⇒ không bao giờ trúng.
 *   Cache thành một bước tốn thời gian mà chẳng tiết kiệm gì.
 * - **C08 "khoá quá hẹp"** — `keyParts` THIẾU một phần tử của `invalidatedBy`,
 *   nên khoá vẫn trùng trong khi nội dung đã ôi ⇒ trúng một cache SAI, và bước
 *   dùng nó đỏ vì một lý do không liên quan gì tới đoạn mã vừa sửa. Đây là đỏ
 *   THẬT (`FailureCause.kind === 'stale-cache'`), nên retry không cứu.
 *
 * Luật engine (A.4), phát biểu đủ để hai lane không đoán khác nhau:
 *   TRÚNG  ⇔ mọi `InputId` trong `keyParts` có cùng phiên bản với lúc lưu.
 *   ĐÚNG   ⇔ mọi `InputId` trong `invalidatedBy` có cùng phiên bản với lúc lưu.
 *   trúng ∧ đúng   ⇒ bớt `savesTicks` khỏi bước tiêu thụ.
 *   trúng ∧ ¬đúng  ⇒ bước tiêu thụ đỏ thật, không bớt tick nào.
 *   ¬trúng         ⇒ không bớt tick nào, và một mục cache MỚI được lưu.
 */
export interface CacheSpec {
  readonly id: CacheId;
  /**
   * Đầu vào mà **khoá** băm vào. NGƯỜI CHƠI sửa được (đây là thứ 19.C ánh xạ
   * từ biểu thức khoá trong YAML).
   *
   * Mảng, không phải tập hợp: thứ tự là thứ tự khai và nó đi vào chuỗi khoá, nên
   * hai thứ tự khác nhau là hai khoá khác nhau — đúng như mọi hệ cache thật.
   */
  readonly keyParts: readonly InputId[];
  /**
   * Đầu vào mà **nội dung** cache thật sự phụ thuộc. SỰ THẬT của level, người
   * chơi KHÔNG sửa được và không nhìn thấy trực tiếp.
   *
   * ⛔ Không suy ra được từ `keyParts` và không được phép suy ngược: chính khoảng
   * cách giữa hai danh sách LÀ bài học. Một hiện thực nào đó "tự động" đặt
   * `invalidatedBy = keyParts` sẽ làm C08 không bao giờ kích hoạt được, và triệu
   * chứng là một level vĩnh viễn dễ chứ không phải một lỗi đỏ ở đâu cả.
   */
  readonly invalidatedBy: readonly InputId[];
  /**
   * Tick tiết kiệm được khi trúng và đúng.
   *
   * ⚠ Engine phải kẹp về `durationTicks` của bước tiêu thụ. Một `savesTicks`
   * lớn hơn sẽ cho thời lượng âm, và thời lượng âm làm đường găng (§5) sai theo
   * một cách không ai truy ra được.
   */
  readonly savesTicks: number;
}

/**
 * Quạt một stage ra nhiều thực thể chạy song song (C12).
 *
 * Mỗi tổ hợp của các trục là một thực thể riêng, chiếm máy chạy riêng, rút
 * ngẫu nhiên riêng, và đỏ riêng. Một stage `dependsOn` stage đã quạt thì phụ
 * thuộc vào **TẤT CẢ** thực thể của nó — đó là fan-in của bài C13.
 *
 * ⚠ `axes` là MẢNG chứ không phải `Record`, và đó là quyết định tất định chứ
 * không phải sở thích: thứ tự lặp của `Record` là thứ tự chèn, nên hai đường
 * dựng cùng một ma trận sẽ sinh tổ hợp theo hai thứ tự khác nhau, tức hai
 * `InstanceKey` khác nhau, tức hai chuỗi rút ngẫu nhiên khác nhau. Mảng làm
 * chuyện đó không xảy ra được.
 *
 * Tổ hợp sinh theo thứ tự **trục đầu chạy chậm nhất** (như đếm số): với
 * `[{a:[1,2]},{b:[x,y]}]` thứ tự là `1/x, 1/y, 2/x, 2/y`.
 */
export interface FanOutAxis {
  /** ASCII. Đi vào `InstanceKey` nên đổi tên trục là đổi mọi khoá rút ngẫu nhiên. */
  readonly name: string;
  /** Ít nhất 1 phần tử. Rỗng ⇒ lỗi ngữ nghĩa, 19.C.4 báo về đúng dòng. */
  readonly values: readonly string[];
}

export interface FanOutSpec {
  readonly axes: readonly FanOutAxis[];
  /**
   * Tổ hợp bị loại, mỗi phần tử là một `InstanceKey` đầy đủ.
   *
   * Dùng `InstanceKey` chứ không phải một object trục→giá trị: nó là cùng một
   * chuỗi mà bản ghi và khoá ngẫu nhiên dùng, nên không có hai cách viết cùng
   * một tổ hợp, và so sánh là so chuỗi thẳng.
   */
  readonly exclude?: readonly InstanceKey[];
}

/**
 * Một bước bên trong một stage. Các bước chạy **tuần tự** trên cùng một máy
 * chạy, và tổng thời lượng của stage là tổng thời lượng các bước — một giá trị
 * SUY RA ĐƯỢC, nên nó không được lưu ở đâu cả.
 *
 * Vì sao tách bước khỏi stage thay vì làm phẳng: máy chạy được cấp cho stage,
 * không cho bước. Bài C03 ("song song trên giấy ≠ song song trên máy") chỉ
 * đúng nếu mô hình phân biệt được hai tầng đó. Ba cấp drill-in của tầng 3D
 * (19.D.7) cũng đọc thẳng hai tầng này.
 */
export interface StepSpec {
  readonly id: StepId;
  /** Tiếng Việt. Thuật ngữ hạ tầng giữ tiếng Anh: cache, runner, artifact. */
  readonly name: string;
  /** Tick danh nghĩa khi cache trượt và không có lỗi. Số nguyên ≥ 0. */
  readonly durationTicks: number;
  /**
   * Biên động ngẫu nhiên của thời lượng, đều trong `±durationSpreadTicks`.
   * Vắng ⇒ 0, tức thời lượng đúng bằng `durationTicks`.
   *
   * Tồn tại cho đúng một lớp tình huống mà không có nó thì không tả được: cổng
   * phê duyệt của con người (`kind: 'approval'`) có độ trễ KHÔNG đoán trước
   * được, và toàn bộ bài học "đặt nó ở đâu để nó không nằm trên đường găng"
   * dựa vào chỗ đó. Level chương CI nên để vắng ở gần hết các bước — thêm nhiễu
   * vào chỗ không cần chỉ làm phân bố khó đọc.
   *
   * Rút qua đúng cơ chế khoá ở §4, nên nó không phá tính tất định.
   */
  readonly durationSpreadTicks?: number;
  readonly flake?: FlakeSpec;
  /**
   * `false` = bước đỏ nhưng stage đi tiếp (ví dụ lint chỉ cảnh báo).
   * `true` = bước đỏ thì stage đỏ ngay, các bước sau KHÔNG chạy.
   *
   * Tên là `blocking` chứ không phải tên khoá của một nhà cung cấp nào — ràng
   * buộc 1. Chú ý nghĩa ĐẢO so với khoá quen thuộc đó: `blocking: false` mới là
   * "đỏ thì đi tiếp".
   */
  readonly blocking: boolean;
  /**
   * Lệnh bước này chạy, ở dạng TRUNG LẬP. Cả hai tuỳ chọn, và một bước chỉ nên
   * mang ĐÚNG MỘT trong hai.
   *
   * ⚠ THÊM 2026-09-16 (lead), sau khi 19.C.2 chỉ ra hệ quả của việc thiếu chúng:
   * bản YAML sinh ra có bước chỉ mang `id`/`name`, mà một nhà cung cấp thật sẽ
   * TỪ CHỐI một bước không có lệnh. Nghĩa là thứ người chơi nhìn thấy trong ô
   * soạn thảo không phải một workflow chạy được — và một game dạy CI/CD mà hiện
   * ra cú pháp không hợp lệ thì dạy sai ở đúng chỗ nó tồn tại để dạy đúng.
   *
   * `action` là tham chiếu tới một hành động dùng lại; `script` là lệnh chạy
   * thẳng. Tên đặt trung lập có chủ ý: tầng YAML ánh xạ chúng sang khoá của
   * từng nhà cung cấp, và lõi không được mang từ vựng của ai (AC-4).
   *
   * ⛔ Engine KHÔNG đọc hai trường này. Thời lượng, đỏ giả, cache đều là dữ liệu
   * của level. Chúng ở đây để tầng YAML phát ra một bản đọc được, không phải để
   * mô phỏng chạy theo lệnh.
   */
  readonly action?: string;
  readonly script?: string;
  /** Cache bước này khôi phục trước khi chạy. */
  readonly cache?: CacheSpec;
  /**
   * Sản phẩm bước này cần CÓ SẴN mới chạy được. Thiếu ⇒ đỏ thật
   * (`FailureCause.kind === 'missing-output'`), và retry không cứu.
   *
   * "Có sẵn" nghĩa là: do một bước nào đó của một stage mà stage này phụ thuộc
   * **bắc cầu** sản xuất ra, trong CÙNG lượt chạy. Hai stage chạy song song
   * không thấy sản phẩm của nhau, kể cả khi một cái đã xong trước — đó là điều
   * làm "thiếu một cạnh" trở thành lỗi chứ không phải may rủi về thời điểm.
   */
  readonly requires?: readonly OutputId[];
  readonly produces?: readonly OutputId[];
}

/**
 * Đơn vị được XẾP LỊCH: chiếm máy chạy, có phụ thuộc, thử lại được.
 *
 * `docs/games/pipeline.md` gọi field phụ thuộc là `needs`; ở đây là `dependsOn`.
 * Khác biệt có chủ ý: `needs` là tên khoá của một nhà cung cấp cụ thể, và ràng
 * buộc 1 cấm lõi mang tên đó. Ánh xạ nằm ở 19.C.
 */
export interface StageSpec {
  readonly id: StageId;
  readonly kind: StageKind;
  /** Tiếng Việt, hiện trên node 3D và trong bảng tương đương. */
  readonly name: string;
  /**
   * id các stage phải XONG trước. Đây là cạnh của DAG.
   *
   * "Xong" chứ không phải "xanh": một stage `blocking: false` đỏ vẫn cho stage
   * sau chạy. Phân biệt này là bài C05, và nó khác với luật của `requires` ở
   * `StepSpec` — một stage đỏ vẫn có thể đã sản xuất sản phẩm ở các bước trước
   * chỗ nó gãy.
   *
   * ⛔ Chu trình ⇒ workflow KHÔNG chạy được, `EvaluationRecord.error` mang
   * `kind: 'cycle'` kèm ĐÚNG danh sách stage trong vòng (A.3). Không có "gần
   * đúng" ở đây và không có điểm từng phần.
   */
  readonly dependsOn: readonly StageId[];
  readonly steps: readonly StepSpec[];
  /**
   * `false` = stage đỏ nhưng cả lượt chạy vẫn có thể xanh. Bài C05.
   */
  readonly blocking: boolean;
  /**
   * Số lần thử LẠI toàn bộ stage sau khi nó đỏ. 0 = không thử lại.
   *
   * ⚠ Thử lại ở tầng STAGE, không ở tầng bước — đúng như cách người ta bấm
   * "chạy lại job đỏ" ngoài đời, và đó là điều làm bài C10 thành thật: thử lại
   * một stage đỏ vì lỗi trong đồ thị sẽ đốt đúng `runnerTicks` của cả stage,
   * mỗi lần, và vẫn đỏ. Đặt retry khắp nơi "cho chắc" là một chiến lược THUA
   * điểm ở cả ba trục, không phải một chiến lược an toàn.
   */
  readonly retries: number;
  /** Hạng máy stage này cần. Phải khớp một `RunnerPool.id` của level. */
  readonly runnerClass: RunnerClassId;
  /**
   * Số máy chạy stage chiếm suốt thời gian chạy. Vắng ⇒ 1.
   *
   * `0` là hợp lệ và có đúng một chỗ dùng: cổng phê duyệt của con người — nó
   * TỐN thời gian và nằm trên đường găng, nhưng không giữ máy nào.
   *
   * ⚠ `runnerSlots > RunnerPool.count` ⇒ stage KHÔNG BAO GIỜ xếp lịch được.
   * Engine phải báo `EvaluationRecord.error` mang `kind: 'unschedulable'` chứ
   * KHÔNG được treo hay lặng lẽ bỏ qua stage đó (A.2).
   */
  readonly runnerSlots?: number;
  readonly fanOut?: FanOutSpec;
  /**
   * 19.B.1. Môi trường stage này phát hành vào. Engine KHÔNG xếp lịch khác đi vì
   * nó; `deploymentsOf` (`artifacts.ts`) đọc nó để trả lời "môi trường nào đang
   * chạy artifact nào", và vị từ `promotedArtifactUnchanged` đứng trên câu đó.
   */
  readonly environment?: EnvironmentId;
  /**
   * 19.B.3. Cổng phê duyệt: stage chờ người duyệt (thời lượng = các bước của nó,
   * thường `runnerSlots: 0`) và đỏ nếu commit bị từ chối. `reviewers` do vị từ
   * `environmentGuardedByApproval` đọc; engine không mô phỏng từng người.
   */
  readonly approval?: ApprovalSpec;
}

/**
 * Gốc của thứ người chơi soạn. **Đây là kiểu DUY NHẤT đi hai chiều với YAML.**
 *
 * ⚠ KHÔNG chứa số máy chạy, không chứa dòng commit, không chứa đầu vào nào biến
 * động. Ba thứ đó ở §3 và là dữ liệu level. Lý do: người viết workflow ngoài đời
 * cũng không khai chúng, và nếu chúng lọt vào đây thì 19.C.2 (ghi ngược ra YAML)
 * phải bịa ra khoá mà không nhà cung cấp nào có.
 */
/*
 * ⛔ QUYẾT ĐỊNH KIẾN TRÚC 2026-09-16 (lead) — YAML là KHUNG SOẠN, không phải
 * bản tuần tự hoá.
 *
 * 19.C.1/C.2 đo ra rằng CHÍN trường của hợp đồng không có khoá YAML nào chở
 * được: `StageSpec.retries`, `runnerSlots`, `approval`, và `StepSpec.
 * durationTicks`, `durationSpreadTicks`, `flake`, `cache`, `requires`,
 * `produces`. Không nhà cung cấp nào có khoá cho chúng.
 *
 * Ba đường, và hai đường đầu đều sai:
 *
 *   · Im lặng bỏ ⇒ một level ghi ra rồi đọc lại mất sạch thời lượng và cache.
 *     Engine vẫn chạy, điểm vẫn ra, chỉ ra SỐ KHÁC, và không gì đỏ.
 *   · Bịa khoá riêng (`x-dlp-duration:`) ⇒ dạy người chơi một khoá không tồn
 *     tại ở bất kỳ đâu ngoài game này. Phá đúng thứ game sinh ra để làm.
 *   · ĐÃ CHỌN: `WorkflowSpec` của level là NGUỒN SỰ THẬT; YAML chỉ chở phần
 *     người chơi được sửa. Bộ ghi trả kèm `dropped` liệt kê từng trường không
 *     chở được, và `read(write(spec)) === spec` khi và chỉ khi `dropped` rỗng.
 *
 * Bằng chứng cho lựa chọn này nằm ngay trong hợp đồng: `CicdLevel.editable`
 * liệt kê đúng thứ người chơi được sửa, và `durationTicks` / `flake` /
 * `requires` KHÔNG có trong danh sách đó.
 *
 * Nó còn mua thêm một tính chất không nhắm tới nhưng đáng giữ: **chống gian
 * lận**. Dữ liệu mô phỏng không đi qua ô soạn thảo, nên không ai sửa
 * `flakeRate: 0` vào YAML để biến một level thành dễ.
 *
 * ⚠ CÒN MỞ, cho 19.E: `editable` có `retries` và `cache`, tức người chơi ĐƯỢC
 * sửa hai thứ đó — nhưng YAML hiện chưa chở chúng. Hai đường: ánh xạ qua `with:`
 * của một hành động dùng lại (nhà cung cấp thật làm cache đúng như vậy), hoặc
 * cho chúng một ô điều khiển riêng ngoài ô soạn YAML. Chưa chốt.
 */
export interface WorkflowSpec {
  /** Tiếng Việt. Tên hiện ở đầu ô soạn thảo. */
  readonly name: string;
  /**
   * ⚠ Thứ tự mảng là thứ tự TRÌNH BÀY, không mang nghĩa nào với engine. Mọi
   * quyết định xếp lịch dùng `StageSpec.id` (xem §4).
   *
   * Đó là điều kiện để 19.C.2 ghi ngược an toàn: một bộ ghi sắp lại thứ tự
   * stage không được phép đổi kết quả chấm. Nếu thứ tự mảng đi vào luật xếp
   * lịch thì một vòng đọc-ghi sẽ âm thầm đổi điểm của người chơi.
   */
  readonly stages: readonly StageSpec[];
}

// ── ⬛ Chỗ cắm 19.B (chương CD) — khai kiểu, KHÔNG hiện thực ────────────────
//
// Ba kiểu dưới đây tồn tại để chương CD không phải đổi hình dạng những gì ở
// trên. Engine chương CI không đọc cái nào. Chương CD là chuỗi **cắt trước
// tiên** nếu hết giờ (phase-19.md §6), nên hợp đồng cố ý KHÔNG bắt nó phải tồn
// tại: mọi trường trỏ tới chúng đều tuỳ chọn, và xoá hết phần này đi thì chương
// CI vẫn biên dịch và vẫn chơi được.

/** Môi trường phát hành: `'dev'`, `'staging'`, `'prod'`. */
export type EnvironmentId = string;

/**
 * Danh tính của một artifact, **băm từ nội dung build** (19.B.1).
 *
 * Toàn bộ bài C16 nằm ở đây: build lại cho staging rồi build lại cho prod sinh
 * ra hai `ArtifactId` KHÁC NHAU, nên thứ đã test ở staging không phải thứ được
 * phát hành. Phép băm là việc của 19.B; hợp đồng chỉ khẳng định nó là danh tính
 * nội dung, không phải một số thứ tự tăng dần.
 */
export type ArtifactId = string;

/**
 * Ba chiến lược phát hành (19.B.4). Khai sẵn để union đóng không phải mở lại.
 *
 * Mỗi chiến lược có thời gian lùi KHÁC NHAU và chi phí tài nguyên KHÁC NHAU;
 * AC-B đòi một test khẳng định thứ tự thời gian lùi. Con số cụ thể là việc của
 * 19.B — hợp đồng cố ý không chốt chúng ở đây, vì chốt một con số chưa ai đo
 * được là mời một hằng số sai nằm lại vĩnh viễn.
 */
export const RELEASE_STRATEGIES = ['rolling', 'blue-green', 'canary'] as const;

export type ReleaseStrategy = (typeof RELEASE_STRATEGIES)[number];

export interface ApprovalSpec {
  /** Số người duyệt bắt buộc. 0 là vô nghĩa — bộ đọc từ chối. */
  readonly reviewers: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. WORKLOAD — thứ LEVEL cấp, không bao giờ đi qua YAML
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Một hạng máy chạy và số lượng có sẵn.
 *
 * Số lượng hữu hạn là một trong ba thứ định hình mọi level: đồ thị cho phép
 * mười stage chạy song song, nhưng chỉ có hai máy. Song song trên giấy khác
 * song song trên máy (C03).
 */
export interface RunnerPool {
  readonly id: RunnerClassId;
  /** Tiếng Việt, hiện trên làn máy chạy ở giao diện. */
  readonly label: string;
  /** Số máy. ≥ 1. */
  readonly count: number;
  /**
   * Trần người chơi được nâng `count` lên ở level cho phép. Vắng ⇒ không sửa
   * được.
   *
   * Nâng máy là một lời giải HỢP LỆ cho lead time nhưng nó đánh thẳng vào trục
   * runner-phút — đó là một trong những chỗ ba trục kéo nhau đi ngược hướng rõ
   * nhất, và là lý do chúng phải hiển thị cùng lúc (19.E.4).
   */
  readonly editableUpTo?: number;
}

/**
 * Một đầu vào của workspace và mức độ biến động của nó.
 *
 * `changesEvery` là **chu kỳ commit**, không phải xác suất: đầu vào đổi ở commit
 * thứ `k` khi `k % changesEvery === 0`. Cố ý tất định và cố ý dễ đọc bằng mắt —
 * người chơi phải suy luận được "lockfile đổi mỗi 5 commit" từ bảng, chứ không
 * phải đoán từ một phân bố.
 *
 * ⚠ Đây là thứ làm C07 đo được: `'src'` có `changesEvery: 1` nên một khoá cache
 * băm vào nó không bao giờ trúng.
 */
export interface WorkspaceInput {
  readonly id: InputId;
  readonly label: string;
  /** ≥ 1. `1` = đổi ở mọi commit. */
  readonly changesEvery: number;
}

/**
 * Một commit tới hàng đợi.
 *
 * ⛔ Nhiều commit KHÔNG phải một thứ trang trí: nếu một level chỉ có một commit
 * thì thông lượng bằng đúng `1 / leadTime` và trục thứ hai trở thành một phép
 * chia của trục thứ nhất — AC-9 khi đó không đo được gì. Xem §6.
 */
export interface CommitArrival {
  readonly id: CommitId;
  /** Tick commit này được đẩy lên. Không giảm dần theo thứ tự mảng. */
  readonly tick: number;
  /**
   * Đầu vào commit này đụng vào. Vắng ⇒ suy từ `WorkspaceInput.changesEvery`
   * theo VỊ TRÍ commit trong mảng (đếm từ 1).
   *
   * Cho phép khai tường minh vì một số level cần đúng một commit đụng vào
   * lockfile ở đúng một chỗ (C08), và suy theo chu kỳ không diễn đạt được.
   */
  readonly changedInputs?: readonly InputId[];
  /**
   * 19.B.3. `true` ⇒ người duyệt TỪ CHỐI commit này ở mọi stage có `approval`:
   * stage đó chạy hết thời gian chờ của nó rồi đỏ với `approval-rejected`. Thử
   * lại vẫn đỏ — người duyệt không đổi ý vì bấm lại.
   *
   * Dữ liệu LEVEL, không phải người chơi: bài C17/C27 dạy HẬU QUẢ của việc có
   * hay không có cổng, không dạy cách thuyết phục người duyệt.
   */
  readonly approvalRejected?: boolean;
}

export interface WorkloadSpec {
  readonly runners: readonly RunnerPool[];
  readonly inputs: readonly WorkspaceInput[];
  /** ⚠ Ít nhất 1. Level dạy thông lượng cần ≥ 3 để hàng thật sự dồn. */
  readonly commits: readonly CommitArrival[];
  /**
   * Cache còn sống qua bao nhiêu lượt chạy trước đó. Vắng ⇒ vô hạn.
   *
   * Có mặt vì đời thật đuổi cache theo tuổi và theo dung lượng, và vì một level
   * muốn dạy "cache nguội" cần diễn đạt được chuyện đó mà không phải bịa thêm
   * một cơ chế.
   */
  readonly cacheRetentionRuns?: number;
}

/**
 * Một lần chấm = `passes` lượt mô phỏng, hạt giống dẫn xuất từ `baseSeed`.
 *
 * Tất định giữ nguyên, nhưng được áp ở tầng NÀY: cùng `baseSeed` + cùng
 * `WorkflowSpec` + cùng `WorkloadSpec` ⇒ cùng đúng `passes` lượt đó ⇒ cùng
 * `EvaluationRecord` ⇒ cùng ba con số. Cái ngẫu nhiên nằm *bên trong* một phép
 * đo lặp lại được.
 */
export interface EvaluationSpec {
  readonly baseSeed: number;
  /** ≥ 1. Mặc định `DEFAULT_EVALUATION_PASSES`. */
  readonly passes: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TẤT ĐỊNH — hai luật engine PHẢI theo, không phải gợi ý
// ═══════════════════════════════════════════════════════════════════════════
//
// Hai luật dưới đây không diễn đạt được bằng kiểu. Chúng ở đây vì đó là chỗ
// người hiện thực đọc, và vì hai lane hiểu khác nhau về chúng sẽ cho ra hai
// engine cùng "tất định" mà khác kết quả — mỗi cái tự nhất quán, không cái nào
// đỏ ở test của chính nó.

/**
 * **LUẬT 1 — mọi lần rút ngẫu nhiên đi qua một khoá, không qua một bộ sinh
 * chạy dọc.**
 *
 * Trạng thái RNG của một lần rút phải dẫn xuất TẤT ĐỊNH từ `FlakeDrawKey` (băm
 * bốn trường rồi `seedRng`), **không** được lấy từ một `RngState` duy nhất đi
 * dần qua lượt chạy.
 *
 * Vì sao đây là ràng buộc cứng chứ không phải tối ưu: với một bộ sinh chạy dọc,
 * thứ tự rút = thứ tự xếp lịch. Người chơi thêm một máy chạy ⇒ thứ tự đổi ⇒ mọi
 * bước nhận một con xúc xắc khác ⇒ so hai lời giải trên "cùng seed" trở thành
 * so hai thế giới khác nhau. Bài C09 và bảng so lời giải (19.E.5) đều mất nghĩa,
 * và không test nào đỏ vì cả hai lượt vẫn tất định.
 *
 * Với khoá thì ngược lại: đổi số máy chạy đổi *khi nào* một bước chạy, chứ
 * không đổi *nó rút được gì*. Đó chính là điều kiện để đọc được hiệu ứng của
 * một thay đổi.
 */
export interface FlakeDrawKey {
  /** Chỉ số lượt mô phỏng trong lần chấm, đếm từ 0. */
  readonly pass: number;
  readonly commitId: CommitId;
  readonly instance: InstanceKey;
  /** Lần thử thứ mấy của stage, đếm từ 0. Thử lại phải rút xúc xắc MỚI. */
  readonly attempt: number;
  /**
   * Phân tách hai lần rút khác nhau của CÙNG một lần thử: một cho biên động
   * thời lượng, một cho flake. Thiếu nó thì hai lần rút dùng chung trạng thái
   * và tương quan với nhau theo một cách không ai định.
   */
  readonly draw: 'flake' | 'duration';
}

/**
 * **LUẬT 2 — thứ tự hàng đợi là một thứ tự TOÀN PHẦN trên số nguyên và chuỗi
 * ASCII.**
 *
 * Khi nhiều thực thể cùng sẵn sàng mà không đủ máy, engine chọn theo đúng thứ
 * tự này, lần lượt cho tới khi phân biệt được:
 *
 *   1. `readyTick` tăng dần — sẵn sàng trước thì chạy trước.
 *   2. `arrivalTick` của commit tăng dần — commit tới trước được ưu tiên (FIFO
 *      theo commit, không phải theo stage).
 *   3. `commitId` tăng dần theo mã đơn vị.
 *   4. `stageId` tăng dần theo mã đơn vị.
 *   5. `fanOutIndex` tăng dần.
 *
 * Bốn khoá đầu không đủ: hai thực thể của cùng một stage đã quạt ra có y hệt
 * bốn giá trị đầu. Khoá thứ năm mới đóng được thứ tự.
 *
 * ⚠ **Không dùng vị trí trong `WorkflowSpec.stages`.** Nếu vị trí mảng đi vào
 * luật, một vòng đọc-ghi YAML (19.C.1 → 19.C.2) sắp lại stage sẽ đổi kết quả
 * chấm mà không đổi một chữ nào trong ý nghĩa workflow.
 *
 * ⚠ **Không `localeCompare`.** Xem ràng buộc 2 ở đầu file.
 */
export const QUEUE_ORDER_KEYS = [
  'readyTick',
  'arrivalTick',
  'commitId',
  'stageId',
  'fanOutIndex',
] as const;

export type QueueOrderKey = (typeof QUEUE_ORDER_KEYS)[number];

// ═══════════════════════════════════════════════════════════════════════════
// 5. BẢN GHI KẾT QUẢ — ba tầng, không trường nào suy ra được
// ═══════════════════════════════════════════════════════════════════════════
//
// Ba tầng, và tên của chúng cố ý khác nhau vì chữ "lượt" trong tiếng Việt phủ
// cả ba:
//
//   AttemptRecord      — một lần thử một thực thể stage
//   RunRecord          — một commit đi hết workflow (đây là "một lô" của cảnh
//                        báo mô hình ở đầu file)
//   PassRecord         — một lượt mô phỏng: MỌI commit, một hạt giống
//   EvaluationRecord   — `passes` lượt mô phỏng: thứ đem đi chấm

export const ATTEMPT_OUTCOMES = ['passed', 'failed', 'skipped'] as const;

export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/**
 * Vì sao một lần thử đỏ. `'flake'` là đỏ GIẢ; bốn cái còn lại là đỏ THẬT và
 * **retry không cứu được cái nào**.
 *
 * Bài C10 sống trên khác biệt đó, nên `kind` phải là dữ liệu chứ không phải một
 * câu chữ trong thông điệp: bảng tổng kết sau lượt chấm phải đếm được "bạn đã
 * đốt bao nhiêu runner-phút để thử lại những thứ không thử lại được".
 */
export type FailureCause =
  | { readonly kind: 'flake'; readonly nature: FlakeNature }
  /** Bước cần một sản phẩm mà stage này không phụ thuộc (bắc cầu) vào nơi tạo nó. */
  | { readonly kind: 'missing-output'; readonly output: OutputId; readonly step: StepId }
  /** Trúng một cache đã ôi vì khoá quá hẹp (C08). */
  | { readonly kind: 'stale-cache'; readonly cache: CacheId; readonly step: StepId }
  /** Một stage mà nó phụ thuộc đã đỏ và stage đó `blocking`. */
  | { readonly kind: 'upstream-failed'; readonly stage: StageId }
  /** 19.B.3: cổng phê duyệt bị từ chối — `CommitArrival.approvalRejected`. Retry không cứu. */
  | { readonly kind: 'approval-rejected' };

export interface AttemptRecord {
  /** Đếm từ 0. `> 0` nghĩa là lần thử lại. */
  readonly attempt: number;
  readonly startedTick: number;
  readonly finishedTick: number;
  readonly outcome: AttemptOutcome;
  /** `null` khi `outcome !== 'failed'`. */
  readonly cause: FailureCause | null;
  /**
   * Bước đầu tiên gãy, `null` nếu không bước nào gãy.
   *
   * ⚠ Các bước sau nó KHÔNG chạy khi bước đó `blocking`, nên `steps` dưới đây
   * ngắn hơn `StageSpec.steps`. Đừng suy số bước đã chạy từ spec.
   */
  readonly failedStep: StepId | null;
  readonly steps: readonly StepRecord[];
}

export interface StepRecord {
  readonly id: StepId;
  /** Tick thực tế, ĐÃ trừ phần cache tiết kiệm và ĐÃ cộng biên động. */
  readonly durationTicks: number;
  readonly outcome: AttemptOutcome;
  /**
   * `null` = bước không khai cache. Ngược lại: trúng hay trượt.
   *
   * ⚠ "Trúng" ở đây là trúng KHOÁ, không phải "đúng nội dung". Một lần trúng
   * khoá mà nội dung đã ôi sẽ có `cacheHit: true` **và** một `FailureCause`
   * mang `kind: 'stale-cache'` — hai sự thật khác nhau, và người chơi phải thấy
   * cả hai để hiểu chuyện gì vừa xảy ra.
   */
  readonly cacheHit: boolean | null;
  /**
   * `null` = bước không đỏ vì ngẫu nhiên. Ngược lại: đỏ giả loại nào.
   *
   * ⛔ CHỈ được lộ ra giao diện **sau khi cả lượt chấm kết thúc**. Trong lúc
   * chạy, đỏ giả và đỏ thật trông giống hệt nhau — đúng như đời thật, và đó là
   * điều kiện để bài C11 có nghĩa.
   */
  readonly flakeNature: FlakeNature | null;
}

/**
 * Ràng buộc **quyết định `startedTick`** của một thực thể. Dữ liệu GHI LÚC XẾP
 * LỊCH, không suy lại được sau đó, và là thứ làm đường găng tính đúng.
 *
 * ⚠ SỬA 2026-09-16 (lead). Bản đầu mô tả trường này là "lý do nó không chạy
 * ngay lúc `readyTick`". Đọc sát chữ đó thì một thực thể chạy đúng `readyTick`
 * luôn là `none`, nên nhánh `dependency` KHÔNG BAO GIỜ xuất hiện, chuỗi đứt ở
 * mọi thực thể không phải chờ máy, và câu ngay dưới đây trở thành bất khả thi.
 * Cách đọc đúng là cách duy nhất làm cả hai nhánh có nghĩa:
 *
 * | Tình huống | Ghi |
 * |---|---|
 * | `startedTick > readyTick` (phải chờ máy) | `runner`, `instance` = thực thể vừa NHẢ chỗ |
 * | Chạy đúng `readyTick` và CÓ phụ thuộc | `dependency`, `instance` = phụ thuộc XONG MUỘN NHẤT |
 * | Không phụ thuộc gì, có máy ngay | `none` |
 *
 * Vế giữa nói "xong muộn nhất", KHÔNG phải phần tử đầu trong `dependsOn`: thứ
 * tự trong mảng là thứ tự người chơi gõ, còn thứ quyết định `readyTick` là cái
 * xong sau cùng. Hoà thì lấy `InstanceKey` nhỏ nhất theo mã đơn vị, cùng quy
 * tắc so sánh với hàng đợi (§4 luật 2), không `localeCompare`.
 *
 * ⚠ Đường găng của một đường ống có máy chạy hữu hạn **không phải** đường dài
 * nhất trong DAG. Một stage có thể xong muộn vì nó chờ MÁY chứ không chờ phụ
 * thuộc nào, và một hiện thực chỉ đi theo cạnh của DAG sẽ tô sáng một đường
 * không giải thích được thời điểm kết thúc thật. A.7 đi ngược từ thực thể kết
 * thúc muộn nhất theo chính chuỗi `blockedBy` này.
 */
export type BlockedBy =
  | { readonly kind: 'none' }
  /** Phụ thuộc xong muộn nhất, tức cái đã định ra `readyTick`. */
  | { readonly kind: 'dependency'; readonly instance: InstanceKey }
  /**
   * Sẵn sàng rồi nhưng không còn máy. `instance` = thực thể đã chiếm chỗ.
   *
   * ⚠ `commitId` THÊM 2026-09-16 (lead) và nó không thừa. `InstanceKey` chỉ là
   * `stageId` hoặc `stageId#axes`, không mang commit nào — nên trong một
   * `PassRecord` nhiều commit, thực thể của commit SAU chờ máy do commit TRƯỚC
   * giữ sẽ trỏ tới một khoá nằm ngoài `RunRecord.instances` của chính nó, và
   * hai commit còn dùng y hệt chuỗi khoá nên không phân biệt được. Thiếu trường
   * này thì đường găng cụt đúng ở những level dạy thông lượng, tức những level
   * bắt buộc phải có ≥3 commit (§3).
   *
   * Điền commit của thực thể ĐANG GIỮ máy, không phải của thực thể đang chờ.
   *
   * Vì sao không nhét `commitId` vào chính `InstanceKey`: khoá đó vừa là khoá
   * sắp hàng đợi vừa là một thành phần của `FlakeDrawKey`, nên đổi nó sẽ đổi
   * mọi con xúc xắc và mọi thứ tự hàng đợi cùng lúc.
   */
  | {
      readonly kind: 'runner';
      readonly instance: InstanceKey;
      readonly runnerClass: RunnerClassId;
      readonly commitId: CommitId;
    };

export interface StageInstanceRecord {
  readonly instance: InstanceKey;
  readonly stageId: StageId;
  /** `null` khi stage không quạt ra. */
  readonly fanOutIndex: number | null;
  /** Tick mọi phụ thuộc đã xong. Khác `startedTick` đúng bằng thời gian chờ máy. */
  readonly readyTick: number;
  readonly startedTick: number;
  readonly finishedTick: number;
  readonly attempts: readonly AttemptRecord[];
  /**
   * Lý do nó không chạy ngay lúc `readyTick`.
   *
   * ⛔ KHÔNG suy ra được từ `readyTick`/`startedTick`: hai tick đó nói *có* phải
   * chờ không, không nói *chờ ai*. Đường găng cần chờ-ai.
   */
  readonly blockedBy: BlockedBy;
  /** Tổng slot × tick đã chiếm, cộng dồn MỌI lần thử. */
  readonly runnerTicks: number;
  /**
   * 19.B.1. Với mỗi sản phẩm mà các bước của stage này `requires` VÀ có sẵn: thực
   * thể nào CẤP nó. Sắp theo `output` (so mã đơn vị). Rỗng khi stage không đòi gì,
   * hoặc khi nó không chạy (phụ thuộc đỏ).
   *
   * ⛔ GHI lúc xếp lịch, không suy lại: khi hai stage phía trên cùng tạo một sản
   * phẩm (dựng một lần, rồi DỰNG LẠI trước khi lên prod), luật chọn kẻ cấp là
   * một quyết định của engine — thực thể XONG MUỘN NHẤT, hoà thì `InstanceKey`
   * nhỏ nhất — và danh tính artifact (`artifacts.ts`) đứng trên đúng quyết định
   * đó. Suy lại ở chỗ khác là hai chỗ trả lời khác nhau cho "prod đang chạy bản
   * nào".
   */
  readonly suppliers: readonly OutputSupplier[];
}

/** Một cặp (sản phẩm, kẻ cấp) — xem `StageInstanceRecord.suppliers`. Cùng commit, nên không mang `commitId`. */
export interface OutputSupplier {
  readonly output: OutputId;
  readonly instance: InstanceKey;
}

/**
 * Một commit đi hết workflow. **Đây là "một lô" của cảnh báo mô hình.**
 *
 * ⛔ Không có `leadTimeTicks`, không có `passed`, không có `durationTicks`. Cả
 * ba suy ra được:
 *   `leadTime  = finishedTick - arrivalTick`
 *   `passed    = mọi thực thể của stage blocking đều 'passed'`
 * Lưu chúng là mời một bản ghi nói dối ngay lần đầu ai đó đổi cách chấm.
 */
export interface RunRecord {
  readonly commitId: CommitId;
  readonly arrivalTick: number;
  /** Tick thực thể cuối cùng của commit này xong. */
  readonly finishedTick: number;
  readonly instances: readonly StageInstanceRecord[];
  /**
   * Đầu vào commit này đụng vào, sau khi đã phân giải
   * `CommitArrival.changedInputs` hoặc suy từ `changesEvery`.
   *
   * Ghi lại vì phép suy cần biết commit thứ mấy, và người đọc bản ghi về sau
   * không có `WorkloadSpec` trong tay.
   */
  readonly changedInputs: readonly InputId[];
}

/** Một lượt mô phỏng: mọi commit, một hạt giống dẫn xuất. */
export interface PassRecord {
  /** Đếm từ 0. Cùng `pass` trong `FlakeDrawKey`. */
  readonly pass: number;
  readonly runs: readonly RunRecord[];
  /** Tick thực thể cuối cùng của lượt mô phỏng này xong. */
  readonly finishedTick: number;
}

/**
 * Vì sao cả lần chấm không chạy được. Đây là ba ràng buộc CỨNG, không phải trừ
 * điểm: workflow hỏng thì không có ba con số nào để đọc.
 */
export type EvaluationError =
  /** DAG có chu trình. `stages` = đúng các stage trong vòng, theo thứ tự vòng (A.3). */
  | { readonly kind: 'cycle'; readonly stages: readonly StageId[] }
  /** `dependsOn` trỏ tới một stage không tồn tại. */
  | { readonly kind: 'unknown-dependency'; readonly stage: StageId; readonly missing: StageId }
  /** `runnerSlots` lớn hơn cả hạng máy, hoặc `runnerClass` không có hạng nào khớp. */
  | { readonly kind: 'unschedulable'; readonly stage: StageId; readonly runnerClass: RunnerClassId };

/**
 * Thứ đem đi chấm, và thứ `EvaluationRecord` → ba trục điểm chiếu ra (§6).
 *
 * ⛔ Không có trường điểm nào ở đây. Điểm là một phép chiếu, và nó phụ thuộc
 * ngưỡng của LEVEL (`CicdThresholds`) — một bản ghi mang sẵn điểm sẽ nói dối
 * ngay khi ngưỡng đổi, mà bản ghi thì được lưu lại còn ngưỡng thì được sửa.
 */
export interface EvaluationRecord {
  readonly baseSeed: number;
  /** `null` = chạy được. Khác `null` ⇒ `passes` rỗng và không có gì để chấm. */
  readonly error: EvaluationError | null;
  readonly passes: readonly PassRecord[];
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. BA TRỤC ĐIỂM — ba PHÉP CHIẾU, không phải ba trường
// ═══════════════════════════════════════════════════════════════════════════
//
// Ba con số hiển thị THƯỜNG TRỰC, cạnh nhau, không giấu sau nút (19.E.4). Chúng
// chính là ba đại lượng CI/CD thật, không phải điểm phụ trợ:
//
//   ① LEAD TIME      — một commit mất bao lâu từ lúc đẩy lên tới lúc xanh.
//                      Độ trễ của MỘT lô.
//                      p50 trên mọi `RunRecord` của mọi `PassRecord`, mỗi giá
//                      trị là `finishedTick - arrivalTick`.
//
//   ② THÔNG LƯỢNG    — bao nhiêu commit qua được mỗi giờ khi hàng dồn.
//                      Năng lực của HỆ.
//                      `runs.length / PassRecord.finishedTick`, quy ra giờ bằng
//                      `SECONDS_PER_TICK`, rồi lấy p50 qua các lượt.
//
//   ③ RUNNER-PHÚT    — tài nguyên tiêu tốn. Ràng buộc thực tế.
//                      Σ `StageInstanceRecord.runnerTicks` trên mọi thực thể,
//                      chia số lượt, quy ra phút bằng `SECONDS_PER_TICK`.
//
// ⛔ VÌ SAO KHÔNG SUY RA ĐƯỢC TỪ NHAU — đây là thứ AC-9 đo, và ba nhân chứng
// dưới đây là bộ dựng sẵn cho test đó. Mỗi nhân chứng cố định hai trục và đổi
// trục thứ ba; ba nhân chứng phủ cả ba cặp.
//
//   NHÂN CHỨNG A — ② độc lập với ①.
//     Workflow: ba stage nối tiếp, mỗi stage 10 tick, mỗi stage 1 máy.
//     Workload X: 1 hạng máy `count: 1`, ba commit tới ở tick 0, 30, 60.
//     Workload Y: cùng workflow, `count: 3`, ba commit tới ở tick 0, 0, 0.
//     Lead time cả hai đều 30 tick — đường găng của MỘT commit không đổi.
//     Thông lượng: X ≈ 1 commit / 30 tick; Y ≈ 1 commit / 10 tick (ba commit
//     chồng nhau theo kiểu dây chuyền). Cùng ①, khác ② ⇒ ② không phải một hàm
//     của ①.
//     (Và đây cũng là chỗ người học hay gộp hai trục làm một. Tách chúng ra
//     cạnh nhau là cách rẻ nhất để dạy khác biệt đó.)
//
//   NHÂN CHỨNG B — ③ độc lập với ① và ②.
//     Lấy workload Y ở trên. Thêm một stage `lint` 5 tick, `dependsOn: []`,
//     `blocking: false`, và nâng `count` đủ để nó không giành chỗ với ai.
//     `lint` xong ở tick 5, tức KHÔNG nằm trên đường găng: lead time vẫn 30,
//     thông lượng vẫn như cũ. Runner-phút TĂNG đúng 5 tick × 1 slot × số commit.
//     Cùng ①, cùng ②, khác ③.
//
//   NHÂN CHỨNG C — ① độc lập với ③.
//     Hai workflow cùng tổng công việc: (a) bốn stage 10 tick nối tiếp; (b) bốn
//     stage 10 tick song song, `count: 4`. Runner-phút bằng nhau đúng 40 tick
//     mỗi commit. Lead time: 40 với (a), 10 với (b). Cùng ③, khác ①.
//
// ⚠ Nhân chứng A **đòi nhiều commit**. Với một commit duy nhất thì
// `throughput = 1 / leadTime` đúng theo định nghĩa, ba trục tụt xuống còn hai,
// và AC-9 trở thành một test chứng minh một phép chia. Đó là lý do
// `WorkloadSpec.commits` là một mảng chứ không phải một commit, và là lý do
// level dạy thông lượng phải có ≥ 3 commit.
//
// ⚠ Ba con số này KHÔNG gộp thành một "điểm". `RunResult.score` (0..1000, ở
// `core/types.ts`) vẫn tồn tại vì hạ tầng tiến độ cần một số để sắp xếp, nhưng
// nó là thứ phái sinh HẠNG HAI và giao diện không được phép hiển thị nó THAY
// cho ba trục.

/**
 * Ba con số sau khi chiếu, ở đơn vị đời thật, để giao diện và bài OJ đọc.
 *
 * ⛔ Đây là kiểu TRẢ VỀ của một hàm thuần đọc `EvaluationRecord`, KHÔNG phải
 * một trường được lưu ở đâu. Không serialize kiểu này vào `localStorage`, không
 * đưa nó vào `RunLog`: nó tính lại được trong vài micro-giây từ bản ghi, còn
 * một bản sao đã lưu thì sai lặng lẽ khi công thức đổi.
 */
export interface ScoreAxes {
  /** p50 lead time, giây. */
  readonly leadTimeSeconds: number;
  /** p50 thông lượng, commit mỗi giờ. */
  readonly throughputPerHour: number;
  /** Trung bình runner-phút mỗi lượt mô phỏng. */
  readonly runnerMinutes: number;
  /**
   * Tỷ lệ lượt mô phỏng mà MỌI commit đều xanh, 0..1.
   *
   * Không phải trục thứ tư — nó là ngưỡng ĐẠT/TRƯỢT (`CicdThresholds.minGreenRate`),
   * không phải một đại lượng để tối ưu. Tách ra khỏi ba trục vì gộp nó vào là
   * mời người chơi đánh đổi độ tin cậy lấy tốc độ, và đó là bài học ngược.
   */
  readonly greenRate: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. VIEW — ranh giới engine ↔ renderer (2D và 3D dùng CÙNG một view)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ Engine KHÔNG biết gì về toạ độ. `core/layout/` tính vị trí từ view này. Hai
// renderer nhận cùng `CicdView` và phải ra cùng TẬP node và cạnh (AC-5 so tập,
// không so pixel).

export const STAGE_RUN_STATES = [
  'pending',
  'queued',
  'running',
  'retrying',
  'passed',
  'failed',
  'skipped',
] as const;

export type StageRunState = (typeof STAGE_RUN_STATES)[number];

export interface StageNodeView {
  readonly instance: InstanceKey;
  readonly stageId: StageId;
  readonly kind: StageKind;
  readonly name: string;
  readonly state: StageRunState;
  /** Đếm từ 0. `> 0` = đang/đã thử lại — tầng 3D vẽ vòng lặp quanh node. */
  readonly attempt: number;
  readonly startedTick: number | null;
  readonly finishedTick: number | null;
  /** `null` = thực thể không khai cache nào. */
  readonly cacheHit: boolean | null;
  /**
   * Token màu NGỮ NGHĨA, không phải mã màu. Renderer tra sang màu thật bằng
   * `getComputedStyle`, và đó là thứ giữ SSOT màu ở CSS và làm 3D tự đổi theo
   * theme sáng/tối.
   *
   * ⚠ Màu là MỘT trong ba kênh mã hoá (màu + hình học + chuyển động, 19.D.10).
   * Một trạng thái chỉ phân biệt bằng màu là trạng thái người mù màu không đọc
   * được, và ô nghiệm thu a11y không cho qua.
   */
  readonly statusToken: 'success' | 'destructive' | 'warning' | 'status-progress' | 'status-locked';
  /** Tiếng Việt, một dòng, đọc được bằng trình đọc màn hình. */
  readonly ariaLabel: string;
}

/**
 * Cạnh phụ thuộc như renderer nhìn thấy.
 *
 * `critical` là thứ làm game này dạy được điều mà 2D khó thể hiện: sau mỗi lượt
 * chạy, đường găng được tô sáng, và người chơi thấy ngay rằng rút ngắn một
 * stage KHÔNG nằm trên đường găng thì không đổi được gì.
 */
export interface DagEdgeView {
  readonly from: InstanceKey;
  readonly to: InstanceKey;
  /** Cạnh này nằm trên đường găng của lượt chạy đang xem. */
  readonly critical: boolean;
  /**
   * `true` = thứ giữ cạnh này lại là MÁY CHẠY chứ không phải phụ thuộc — tức
   * một cạnh vẽ thêm, không có trong `dependsOn`.
   *
   * Có mặt vì đường găng đi qua cả hai loại (xem `BlockedBy`), và tô sáng một
   * đoạn chờ-máy như thể nó là một phụ thuộc sẽ dạy sai: người chơi sẽ đi sửa
   * đồ thị trong khi thứ phải sửa là số máy hoặc thứ tự.
   */
  readonly resourceEdge: boolean;
}

export interface RunnerLaneView {
  readonly runnerClass: RunnerClassId;
  readonly label: string;
  readonly busy: number;
  readonly total: number;
}

export interface CicdEventView {
  readonly tick: number;
  readonly level: 'info' | 'warning' | 'error';
  /** Tiếng Việt. Đây cũng là nội dung đẩy vào vùng `aria-live`. */
  readonly message: string;
  /**
   * Thực thể sự kiện nói về. `null` = sự kiện ở phạm vi cả lượt chạy.
   *
   * ⛔ Bắt buộc, không tuỳ chọn, dù giá trị có thể là `null`. Đây là trục lọc
   * DUY NHẤT đúng: cách còn lại là dò tên stage trong `message`, và cách đó sai
   * một cách IM LẶNG — một workflow có `test` và `test-e2e` sẽ cho cái trước ăn
   * hết sự kiện của cái sau, không có gì đỏ ở đâu cả.
   */
  readonly involvedInstance: InstanceKey | null;
}

/**
 * Toàn bộ thứ renderer cần cho MỘT lượt chạy đang xem.
 *
 * **Thuần dữ liệu** — không hàm, không tham chiếu ngược về engine, để serialize
 * được và so được bằng `toEqual` trong test.
 *
 * ⚠ Giao diện phải hiện CẢ HAI: một lượt chạy đang diễn ra (để nhìn được) và
 * bảng tổng `passes` lượt (để chấm). Con số dùng để chấm là p50 của cả lần
 * chấm, KHÔNG phải lượt đang xem — xem `ScoreAxes`.
 */
export interface CicdView {
  readonly tick: number;
  /** Lượt mô phỏng đang xem, đếm từ 0. */
  readonly pass: number;
  readonly commitId: CommitId;
  readonly nodes: readonly StageNodeView[];
  readonly edges: readonly DagEdgeView[];
  readonly runners: readonly RunnerLaneView[];
  readonly events: readonly CicdEventView[];
  /**
   * `'ci'` = trục Y là thời gian chờ; `'cd'` = trục Y là môi trường (19.D.3).
   *
   * ⛔ Trục Y ĐỔI THEO CHƯƠNG là quyết định #13 và nó **không có phương án lùi**
   * (phase-19.md §4). Trường này có mặt để tầng 3D biết phải đọc trục nào, và
   * để màn chuyển tiếp 19.D.4 biết khi nào phải xuất hiện. Đừng suy nó từ
   * `level.chapter` ở tầng renderer — sandbox (19.H) không có level nào.
   */
  readonly yAxis: 'ci' | 'cd';
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LEVEL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vị từ chấm. **Tên dạng chuỗi, KHÔNG phải closure** — cùng ràng buộc và cùng
 * lý do như hai game kia: level phải serialize được để lưu phát lại và để test
 * so bằng `toEqual`. Một hàm trong dữ liệu level làm hỏng cả hai, và làm level
 * không diff được trong code review.
 *
 * Kiểu dẫn xuất TỪ mảng runtime (không phải ngược lại) nên hai thứ không thể
 * lệch nhau: thêm một vị từ mà quên bảng tra là đỏ ở test của lane A.9, không
 * phải một vị từ chết nằm im.
 */
export const CICD_PREDICATE_NAMES = [
  /** DAG không có chu trình. args: `{}` */
  'graphAcyclic',
  /** Stage tồn tại. args: `{ stage }` */
  'stageExists',
  /**
   * Stage phụ thuộc (BẮC CẦU) vào stage kia. args: `{ stage, on }`
   *
   * ⛔ Bắc cầu, không phải trực tiếp, và đừng "đơn giản hoá" thành trực tiếp.
   * Mục tiêu của level phát biểu một RÀNG BUỘC THỨ TỰ, không phát biểu một hình
   * dạng đồ thị: `kiem-tra` phải chạy sau `clone` là thứ cần dạy, còn việc giữa
   * chúng có một `chuan-bi` hay không là lựa chọn của người chơi. Đọc thành
   * trực tiếp sẽ loại đúng những lời giải hợp lệ mà AC-F đòi phải có ≥2 (đã
   * cắn thật ở lời giải B của C01, chuỗi `clone → chuan-bi → kiem-tra`).
   *
   * `stageNotDependsOn` là phủ định CHÍNH XÁC của vị từ này, nên nó cũng bắc
   * cầu. Hai vế đọc theo hai nghĩa khác nhau là một cặp vị từ vừa đúng vừa sai
   * cùng lúc trên cùng một đồ thị.
   */
  'stageDependsOn',
  /** Stage KHÔNG phụ thuộc vào stage kia — bài tách song song. args: `{ stage, on }` */
  'stageNotDependsOn',
  /** Số stage tối đa. args: `{ max }` */
  'stageCountAtMost',
  /** p50 lead time dưới ngưỡng, giây. args: `{ seconds }` */
  'leadTimeUnder',
  /** p50 thông lượng ít nhất, commit/giờ. args: `{ perHour }` */
  'throughputAtLeast',
  /** Runner-phút trung bình dưới ngưỡng. args: `{ minutes }` */
  'runnerMinutesUnder',
  /** Tỷ lệ lượt xanh ít nhất. args: `{ rate }` */
  'greenRateAtLeast',
  /** Số lần trúng cache ít nhất, cộng dồn cả lần chấm. args: `{ count }` */
  'cacheHitsAtLeast',
  /** Cache này KHÔNG bao giờ trúng — đối chứng cho C07. args: `{ cache }` */
  'cacheNeverHits',
  /** Không lần đỏ nào mang nguyên nhân này. args: `{ cause }` */
  'noFailureCause',
  /** Stage có đúng/nhiều nhất N lần thử lại. args: `{ stage, max }` */
  'retriesAtMost',
  /** Stage nằm trên đường găng ở ít nhất `rate` phần các lượt. args: `{ stage, rate }` */
  'stageOnCriticalPath',
  /** Stage KHÔNG nằm trên đường găng. args: `{ stage, rate }` */
  'stageOffCriticalPath',
  /** Số khiếm khuyết lọt xuống (đỏ `latent-defect` bị retry che) tối đa. args: `{ max }` */
  'escapedDefectsAtMost',
  /** Stage này không chặn lượt chạy. args: `{ stage }` */
  'stageNonBlocking',
  /**
   * 19.B.2: ở MỌI commit phát hành vào cả hai môi trường, sản phẩm `output` ở `to`
   * cùng danh tính với ở `from` — tức được THĂNG HẠNG chứ không dựng lại.
   * args: `{ output, from, to }`. Không commit nào phát hành vào cả hai ⇒ `false`
   * (luật 4: không thoả bằng cách xoá bằng chứng).
   */
  'promotedArtifactUnchanged',
  /**
   * 19.B.3: mọi stage phát hành vào `environment` có một stage `approval` với ít
   * nhất `reviewers` người duyệt nằm phía trên nó (BẮC CẦU). args: `{ environment,
   * reviewers }`. Không stage nào phát hành vào đó ⇒ `false`.
   */
  'environmentGuardedByApproval',
  /*
   * ── Chương CD, đọc bản ghi của ba bộ mô phỏng (`cd-contract.ts`) ──
   *
   * Tám vị từ dưới đây đọc `CicdScoringContext.cd`. Vắng bản ghi mô phỏng tương
   * ứng ⇒ `false`, không ném: đó là lỗi của MỘT level (quên khai kịch bản), theo
   * luật 3 của `predicates.ts`. Bài OJ không chở kịch bản nên không khai được
   * chúng — xem `CD_SIMULATION_PREDICATES`.
   */
  /** Mọi lượt ĐÃ rút bản ứng viên đều lùi/phục hồi dưới ngưỡng, giây; phải có ≥ 1 lượt rút. args: `{ seconds }` */
  'rollbackUnder',
  /** Số lượt cho bản ứng viên XẤU lọt qua tối đa. args: `{ max }` */
  'badReleasePromotedAtMost',
  /** Số lượt hủy nhầm bản ứng viên TỐT tối đa. args: `{ max }` */
  'goodReleaseAbortedAtMost',
  /**
   * Không lượt nào lùi vào một migration không lùi được. args: `{}`
   *
   * ⚠ Đạt được bằng cách KHÔNG BAO GIỜ rút bản xấu. Level dùng nó phải ghép kèm
   * `badReleasePromotedAtMost` (hoặc `rollbackUnder`), nếu không mục tiêu dạy
   * ngược: "đừng xử lý sự cố thì không có sự cố dữ liệu".
   */
  'noDataIncident',
  /** Số máy chạy cùng lúc cao nhất, qua mọi lượt, không vượt. args: `{ max }` */
  'peakInstancesAtMost',
  /** Đoạn lệch dài nhất trên trường `field` ngắn hơn ngưỡng, giây. args: `{ field, seconds }` */
  'driftLongestUnder',
  /**
   * Số lần tự sửa giành nhau với một bộ điều khiển tối đa. args: `{ max }`
   *
   * ⚠ Đạt được bằng cách TẮT tự sửa. Level dạy C25 phải ghép kèm
   * `driftLongestUnder` trên một trường KHÔNG do bộ điều khiển quản, để "tắt hẳn"
   * không phải lời giải.
   */
  'selfHealFightsAtMost',
  /** Số mục rò bí mật trong log tối đa. args: `{ max }` */
  'secretLeaksAtMost',
] as const;

export type CicdPredicateName = (typeof CICD_PREDICATE_NAMES)[number];

/**
 * Một mục tiêu = **một testcase**. Verdict `AC` khi và chỉ khi mọi testcase
 * `required` qua. Không có trọng số riêng cho từng mục tiêu.
 */
export interface CicdObjective {
  readonly id: string;
  /** Tiếng Việt, một câu, nói người chơi phải làm ĐƯỢC gì (không phải làm THẾ NÀO). */
  readonly label: string;
  readonly check: CicdPredicateName;
  readonly args?: Readonly<Record<string, unknown>>;
  /** `false` = mục tiêu thưởng: ăn điểm, không chặn. Mỗi level cần ≥ 1 mục bắt buộc. */
  readonly required: boolean;
}

/**
 * Mốc chấm điểm của MỘT level.
 *
 * ⛔ **Ngưỡng phải phái sinh từ đây, KHÔNG được là hằng số toàn cục.** Đây là
 * lỗi thiết kế đã đo được ở upstream: mốc sao hardcode `completionTime <= 120`
 * trong khi một thử thách có ngân sách 600 giây, nên muốn điểm cao phải nhanh
 * gấp năm lần ngân sách được cấp; còn hai thử thách ngân sách 180 giây thì mốc
 * điểm giữa trùng đúng bằng hạn chót nên không bao giờ đạt nổi
 * (`2026-09-08-p14-k8sgames-upstream-study.md` §2.4).
 *
 * Một hệ chấm không đọc ngân sách của bài là một hệ chấm nói dối, và nó nói dối
 * KHÁC NHAU ở mỗi bài — nên nó không đỏ ở bất kỳ test nào viết cho một bài.
 */
export interface CicdThresholds {
  /** Lead time "chuẩn", giây. Đạt đúng mốc này ⇒ trọn điểm trục ①. */
  readonly parLeadSeconds: number;
  /** Trần cứng. Vượt ⇒ TRƯỢT level, bất kể hai trục kia. */
  readonly budgetLeadSeconds: number;
  readonly parThroughputPerHour: number;
  /** Sàn cứng. Dưới ⇒ trượt. */
  readonly minThroughputPerHour: number;
  readonly parRunnerMinutes: number;
  /** Trần cứng. Vượt ⇒ trượt. */
  readonly budgetRunnerMinutes: number;
  /** 0..1. Dưới ⇒ trượt. */
  readonly minGreenRate: number;
}

/**
 * Một mục tra nhanh. **Hai loại, vì người chơi sửa đường ống ở hai chỗ.**
 *
 * - `'yaml'` — thứ gõ vào ô soạn. `example` là một `WorkflowSpec` NHỎ NHẤT có thể
 *   minh hoạ ý, và giao diện in nó ra bằng bộ ghi của nhà cung cấp đang dùng
 *   (`writeWorkflowYaml`). Một tài liệu hoàn chỉnh chứ không phải một mẩu trơ
 *   trọi, vì với YAML chỗ đứng (thụt lề, khoá cha) là một nửa cú pháp, và đó
 *   đúng là nửa người mới gõ sai.
 *
 *   ⛔ KHÔNG phải chuỗi YAML. Bản 2026-09-16 chở chuỗi YAML viết tay ngay trong
 *   file level, và cổng `scripts/check-cicd-vendor-neutral.mjs` đỏ 68 chỗ: level
 *   là LÕI, và chuỗi đó mang khoá của một nhà cung cấp cụ thể. Chở `WorkflowSpec`
 *   thì level trung lập, và thêm nhà cung cấp thứ hai là cheatsheet tự in đúng
 *   cú pháp mới. Chỉ phần nào `writeWorkflowYaml` ghi ra mà không `dropped`
 *   mới được có mặt trong `example`.
 * - `'panel'` — thứ YAML không chở được (`retries`, `cache`), đặt ở bảng điều
 *   khiển ngoài ô soạn. `control` phải nằm trong `CicdLevel.editable` của level
 *   khai nó; một mục chỉ tới núm mà level không hiện là chỉ đường vào ngõ cụt.
 *
 * ⛔ Bản đầu chỉ có `snippet: string`, và cả 14 level điền vào đó TÊN TRƯỜNG
 * CỦA HỢP ĐỒNG NÀY (`dependsOn:`, `runnerClass:`, `cache.savesTicks: 8`) — không
 * phải thứ bộ đọc nhận, có mục còn là dữ liệu level người chơi không sửa được.
 * Nằm im được vì không màn nào render trường này. `levels/cheatsheet.test.ts`
 * nay cho từng ví dụ đi qua cặp ghi/đọc thật.
 */
export type CicdCheatSheetEntry =
  | {
      readonly where: 'yaml';
      readonly example: WorkflowSpec;
      /** Một dòng tiếng Việt: nó làm gì, và vì sao level này cần nó. */
      readonly explain: string;
    }
  | {
      readonly where: 'panel';
      readonly control: Extract<EditablePart, 'retries' | 'cache'>;
      /** Tên núm đúng như bảng điều khiển gọi, để người chơi tìm ra nó. */
      readonly label: string;
      readonly explain: string;
    }
  /**
   * 19.G — núm chính sách CD (phát hành / đối soát / che bí mật). `control` phải
   * nằm trong `CicdLevel.cd.editable` của level khai nó, cùng lý do như `'panel'`.
   */
  | {
      readonly where: 'cd-panel';
      readonly control: CdPolicyPart;
      readonly label: string;
      readonly explain: string;
    };

/**
 * Tầng dạy học. **Level DẠY, bài OJ THỬ** — quy ước đã có ở hai game kia và giữ
 * nguyên cho game này.
 *
 * Hệ quả cụ thể: một level KHÓ vì tình huống phức tạp thì được; một level khó vì
 * giấu thông tin thì SAI CHỖ.
 */
export interface CicdTeaching {
  /** Hiện TRƯỚC khi chơi. Markdown tiếng Việt, ≤ 250 từ. KHÔNG phải lời giải. */
  readonly primer: string;
  readonly cheatsheet: readonly CicdCheatSheetEntry[];
  /** Hiện SAU khi thắng. 2–4 ý đúc kết, mỗi ý một câu. */
  readonly takeaways: readonly string[];
  /** Sai lầm phổ biến KÈM vì sao nó hấp dẫn. "Đừng làm X" không kèm lý do là vô dụng. */
  readonly pitfalls?: readonly string[];
}

/** Người chơi được sửa gì ở level này. Cách kiểm soát nhịp dạy. */
export const EDITABLE_PARTS = [
  'edges',
  'retries',
  'cache',
  'runners',
  'stages',
  'fan-out',
  'blocking',
] as const;

export type EditablePart = (typeof EDITABLE_PARTS)[number];

export interface CicdLevel {
  /**
   * `cicd-c01-mot-job-mot-step` — mã chương + số hai chữ số, rồi slug tiếng Việt
   * không dấu.
   *
   * ⛔ Con số là ĐỊNH DANH, không phải VỊ TRÍ chơi. Đánh số lại một level là
   * **mồ côi toàn bộ tiến độ đã lưu** của mọi người đang chơi
   * (`RunResult.levelId` nằm trong `localStorage`) — không lỗi, không cảnh báo,
   * chỉ là lịch sử biến mất.
   */
  readonly id: string;
  /** `'ci'` = C01–C14 · `'cd'` = C15–C28. Quyết định trục Y của tầng 3D. */
  readonly chapter: 'ci' | 'cd';
  readonly title: string;
  /** Một câu, ≤ 20 từ, nói phải làm ĐƯỢC gì. Dòng chữ thường trực duy nhất trên màn. */
  readonly mission: string;
  /** Markdown tiếng Việt, ≤ 400 từ. Bối cảnh + việc cần làm, KHÔNG nói cách làm. */
  readonly brief: string;
  readonly difficulty: Difficulty;
  /** Workflow người chơi bắt đầu với. Không stage nào = dựng từ số không. */
  readonly initialWorkflow: WorkflowSpec;
  readonly workload: WorkloadSpec;
  readonly evaluation: EvaluationSpec;
  readonly editable: readonly EditablePart[];
  /**
   * Loại stage người chơi được thêm. `null` = không giới hạn.
   *
   * ⚠ `null` nghĩa là CHO DÙNG MỌI LOẠI. Một mảng rỗng `[]` mang nghĩa NGƯỢC
   * LẠI — cấm thêm stage — và đó là cái bẫy đã cắn một lần ở `k8s/problem.ts`.
   */
  readonly allowedKinds: readonly StageKind[] | null;
  readonly objectives: readonly CicdObjective[];
  readonly thresholds: CicdThresholds;
  /** Thứ tự = thứ tự mở. Gợi ý sau phải cụ thể hơn gợi ý trước. */
  readonly hints: readonly string[];
  readonly teaching: CicdTeaching;
  /** id bài lý thuyết ở `content/games/cicd/theory/`. `null` = level không có bài đọc. */
  readonly theoryId: string | null;
  /**
   * Một `WorkflowSpec` chạy được và đạt HẾT mục tiêu bắt buộc.
   *
   * AC-8 chạy cái này cho cả 28 level rồi khẳng định AC. Không có nó thì "level
   * qua được" là một lời khai, không phải một phép đo.
   */
  readonly solutionWorkflow: WorkflowSpec;
  /**
   * Lời giải THỨ HAI, **khác đường đi**, cũng đạt hết mục tiêu bắt buộc.
   *
   * AC-F/AC-G chạy cái này và khẳng định nó cũng AC — đó là bằng chứng chấm
   * theo KẾT QUẢ chứ không theo hình dạng. Hai lời giải chỉ khác nhau ở thứ tự
   * hai stage độc lập thì chưa chứng minh được gì; phải khác THẬT (ví dụ nới
   * khoá cache vs bỏ cache hẳn, hay thêm máy vs tách nhánh song song).
   */
  readonly altSolutionWorkflow: WorkflowSpec;
  /**
   * 19.G — kịch bản + chính sách chương CD. Vắng ở mọi level chương CI. Có mặt
   * KHÔNG bắt buộc ở level CD: C15–C17 dạy bằng workflow (danh tính artifact,
   * thăng hạng, cổng duyệt) và không cần bộ mô phỏng nào. Xem `cd-contract.ts` §5.
   */
  readonly cd?: CicdLevelCd;
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. HÀNH ĐỘNG VÀ NHẬT KÝ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ✅ **NỢ HỢP ĐỒNG ĐÃ ĐÓNG (lead, 2026-09-16).**
 *
 * Lane A.1 khai tạm kiểu này tại đây vì `packages/games/src/core/**` do lead sở
 * hữu. Lead đã thêm nhánh `| CicdGameAction` vào `GameAction` của
 * `core/run-log.ts`, nên bản chính tắc nay nằm ở đó cạnh `K8sActionShape` và
 * `GitGameAction`, và file này chỉ tái xuất.
 *
 * Vì sao phải đóng nợ chứ không để hai bản khai song song: `RunLog<CicdGameAction>`
 * vẫn biên dịch được khi kiểu nằm riêng (tham số chỉ bị chặn bởi `GameActionBase`),
 * nhưng nó KHÔNG gán được vào `RunLog` dạng rộng. Nghĩa là `core/verify.ts`, cơ
 * chế chấm lại phía máy chủ của 18.C, sẽ im lặng không nhận nhật ký game này, và
 * 19.H (bài OJ cho `gameId: 'cicd'`) bị chặn mà không lệnh nào báo.
 *
 * ⛔ ĐỪNG khai lại kiểu này ở đây. Hai bản khai cùng hình dạng sẽ trôi khỏi nhau
 * ở lần đầu tiên ai đó thêm một `kind` mới, và cả hai vẫn biên dịch.
 *
 * Thiết kế giữ nguyên, ghi lại vì lý lẽ nằm ở tầng game chứ không ở `core/`:
 *
 * Hai loại hành động, và sự nghèo nàn đó là chủ ý. Toàn bộ tương tác của người
 * chơi là **sửa YAML rồi bấm chạy**; không có palette kéo-thả, không có nút
 * "thêm máy" riêng (số máy nằm trong level, sửa được thì sửa qua cùng ô soạn
 * thảo). Nhờ thế một `RunLog` của game này là **một chuỗi phiên bản YAML đọc
 * được bằng mắt**: mở ra xem là biết người chơi đã thử gì.
 *
 * ⚠ `evaluate.source` ghi TOÀN VĂN chứ không ghi diff, và đó là lựa chọn có giá:
 * nhật ký phình ra theo số lần thử. Đổi lại, phát lại không cần một bộ áp diff,
 * và một `WorkflowSpec` dựng lại từ đây là dựng lại từ đúng chữ người chơi gõ,
 * kể cả khi bộ đọc YAML của 19.C về sau sửa một lỗi phân tích và đọc ra khác đi.
 * Với diff thì phát lại sẽ âm thầm cho ra một workflow khác.
 */
export type { CicdGameAction };

/**
 * `tick` ở đây là **số lần chấm đã chạy**, không phải tick mô phỏng.
 *
 * Hai đồng hồ khác nhau và trùng tên là một cái bẫy: `RunRecord.finishedTick`
 * đếm tick bên trong một lượt mô phỏng, còn `GameActionBase.tick` đếm hành động
 * của người chơi. Cả hai tất định, nhưng cộng chúng lại thì không ra gì cả.
 */
export type CicdRunLog = RunLog<CicdGameAction>;
