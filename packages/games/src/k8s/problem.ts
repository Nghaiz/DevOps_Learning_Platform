/**
 * Hợp đồng cho HỆ BÀI TẬP kiểu OJ (online judge) của K8s Arena.
 *
 * ⛔ ĐỌC TRƯỚC KHI SỬA — ba khái niệm cạnh nhau, rất dễ lẫn:
 *
 * | Khái niệm    | Ai dạy | Chấm bằng gì            | Ở đâu           |
 * |--------------|--------|--------------------------|-----------------|
 * | `Level`      | CÓ dạy | vị từ trên cluster mô phỏng | `levels/lNN.ts` |
 * | `Problem`    | KHÔNG  | vị từ trên cluster mô phỏng | DB + file seed  |
 * | `Lab`        | KHÔNG  | `verify.sh` trong sandbox THẬT | `packages/scenario` |
 *
 * `Problem` là thứ file này định nghĩa: một bài tập độc lập, KHÔNG dạy lý
 * thuyết, người làm tự biết hoặc tự tra. Nó chạy trên cùng engine mô phỏng với
 * `Level` (cùng `ClusterSpec`, cùng bảng `PREDICATES`), nên một bài mới không
 * cần thêm một dòng logic engine nào — đó là lý do hệ OJ này khả thi.
 *
 * `Problem` thay thế `Challenge` (contract.ts:300). `Challenge` giữ nguyên cho
 * tới khi 10 bài cũ được chuyển hết sang đây; xem `problem-migration.md`.
 */

import type { ClusterSpec, Objective, ResourceKind } from './contract.ts';
import { t } from '@devops-platform/copy';

// ── Phân loại ───────────────────────────────────────────────────────────────

/**
 * Chủ đề — tập ĐÓNG, và đóng có lý do.
 *
 * Bộ lọc phải liệt kê được mọi chủ đề để dựng checkbox; một trường tự do sẽ đẻ
 * ra "Networking", "networking", "network", "Mạng" là bốn mục khác nhau cho
 * cùng một thứ, và không ai gộp lại được nữa sau vài trăm bài. Muốn thêm chủ
 * đề thì thêm vào đây kèm nhãn trong `PROBLEM_TOPIC_LABELS` — một dòng, có
 * review.
 *
 * `tags` bên dưới mới là chỗ cho phân loại tự do.
 */
export const PROBLEM_TOPICS = [
  'workload',
  'scheduling',
  'networking',
  'storage',
  'config',
  'security',
  'scaling',
  'observability',
  'troubleshooting',
] as const;

export type ProblemTopic = (typeof PROBLEM_TOPICS)[number];

/** Giữ API nhãn cũ; mọi chữ hiển thị lấy từ bản đồ copy duy nhất. */
export const PROBLEM_TOPIC_LABELS: Readonly<Record<ProblemTopic, string>> = {
  workload: t('problem.topic.workload'),
  scheduling: t('problem.topic.scheduling'),
  networking: t('problem.topic.networking'),
  storage: t('problem.topic.storage'),
  config: t('problem.topic.config'),
  security: t('problem.topic.security'),
  scaling: t('problem.topic.scaling'),
  observability: t('problem.topic.observability'),
  troubleshooting: t('problem.topic.troubleshooting'),
};

/**
 * Độ khó — BỐN bậc, cố ý KHÁC ba bậc `SCENARIO_DIFFICULTIES`
 * (`beginner | intermediate | advanced`) của `packages/scenario`.
 *
 * Đây không phải bất nhất do sơ suất. Bài lab là nội dung dạy nên ba bậc là đủ;
 * một OJ thì cần tách "khó" khỏi "rất khó" vì đó là ranh giới người dùng dựa
 * vào để chọn bài kế tiếp. Vì hai thang KHÁC nhau, TUYỆT ĐỐI không ánh xạ ngầm
 * giữa chúng — chỗ nào cần đổi qua lại thì viết hàm đổi tường minh và đặt tên
 * nói rõ nó làm mất thông tin.
 */
export const PROBLEM_DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;

export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

export const PROBLEM_DIFFICULTY_LABELS: Readonly<Record<ProblemDifficulty, string>> = {
  easy: t('problem.difficulty.easy'),
  medium: t('problem.difficulty.medium'),
  hard: t('problem.difficulty.hard'),
  expert: t('problem.difficulty.expert'),
};

/** Vòng đời bài. `draft` không hiện với người học, kể cả khi biết URL. */
export const PROBLEM_STATES = ['draft', 'published', 'archived'] as const;

export type ProblemState = (typeof PROBLEM_STATES)[number];

// ── Định danh ───────────────────────────────────────────────────────────────

/**
 * Mã bài hiển thị, ví dụ `K8S-0042`.
 *
 * ⚠ Mã bài KHÔNG phải khoá chính và KHÔNG phải slug URL. Ba thứ khác nhau:
 *
 * - `code` — thứ người ta đọc cho nhau nghe ("làm được K8S-0042 chưa?"). Ổn
 *   định vĩnh viễn, không đổi kể cả khi bài được sửa đề.
 * - `slug`  — thứ nằm trong URL, sinh từ tiêu đề, CÓ THỂ đổi khi sửa tiêu đề.
 * - khoá chính trong DB — `code`, vì nó là thứ duy nhất không bao giờ đổi.
 *
 * Bốn chữ số chứ không phải số tự tăng không giới hạn: 9999 bài là trần thực tế
 * xa hơn mọi kế hoạch, và độ dài cố định làm mã sắp xếp đúng bằng so sánh chuỗi
 * — nghĩa là `ORDER BY code` không cần ép kiểu, và một chỉ mục btree thường là
 * đủ.
 */
export const PROBLEM_CODE_PATTERN = /^K8S-\d{4}$/;

export function isProblemCode(value: string): boolean {
  return PROBLEM_CODE_PATTERN.test(value);
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

// ── Bài tập ─────────────────────────────────────────────────────────────────

export interface Problem {
  readonly code: string;
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
  readonly topics: readonly ProblemTopic[];
  /** Phân loại tự do, đã chuẩn hoá thường + gạch nối. Có thể rỗng. */
  readonly tags: readonly string[];
  /** `null` = không giới hạn giờ. Không phải bài nào cũng nên chạy đua. */
  readonly timeLimitSec: number | null;
  readonly initialState: ClusterSpec;
  readonly objectives: readonly Objective[];
  /** `null` = cho dùng mọi loại tài nguyên. */
  readonly allowedResources: readonly ResourceKind[] | null;
  readonly hints: readonly ProblemHint[];
  /** Số nước đi "chuẩn" để tính sao. `null` = không chấm theo số nước. */
  readonly parMoves: number | null;
  readonly state: ProblemState;
  /** `null` với bài seed trong repo — chúng không có tác giả là một tài khoản. */
  readonly authorId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ── Thống kê ────────────────────────────────────────────────────────────────

/**
 * ⚠ KHÔNG một trường nào ở đây được LƯU vào bảng `problems`.
 *
 * Đây là chỗ mọi thiết kế OJ đều trượt: thêm cột `solver_count` và
 * `acceptance_rate` vào bảng bài cho "truy vấn nhanh", rồi vĩnh viễn phải giữ
 * chúng đồng bộ với bảng nộp bài qua trigger hoặc cron — và chúng sẽ lệch. Cả
 * ba số dưới đây đều TÍNH từ `problem_submissions` ngay tại chỗ dùng.
 *
 * `acceptanceRate` còn tệ hơn hai cái kia: nó suy ra được từ chính hai cái kia
 * (`solverCount / attemptCount`), nên lưu nó là lưu cùng một sự thật ba lần.
 * Nó nằm trong interface này chỉ vì tầng UI cần đọc, và nó được TÍNH lúc truy
 * vấn.
 *
 * Ngoại lệ duy nhất được cân nhắc: nếu đo được thật rằng truy vấn này là nút
 * cổ chai, thì dựng MATERIALIZED VIEW có lịch refresh — không phải thêm cột.
 */
export interface ProblemStats {
  /** Số người ĐÃ THỬ (đếm distinct user, không đếm số lần nộp). */
  readonly attemptCount: number;
  /** Số người đã giải được ít nhất một lần. */
  readonly solverCount: number;
  /** `solverCount / attemptCount`, 0 khi chưa ai thử. TÍNH, không lưu. */
  readonly acceptanceRate: number;
}

// ── Bài đã che gợi ý ────────────────────────────────────────────────────────

/**
 * Gợi ý ở dạng NGƯỜI HỌC được phép thấy: biết nó tồn tại, biết mở thì mất bao
 * nhiêu điểm, nhưng chưa thấy nội dung.
 *
 * ⚠ Lỗ hổng được vá ở đây, do lane E phát hiện khi dựng trang bài (2026-09-08).
 * `Problem.hints[].text` là trường bắt buộc, nên một API trả thẳng `Problem` cho
 * người học sẽ gửi kèm toàn bộ nội dung gợi ý xuống trình duyệt — và lúc đó
 * `revealHint` chỉ còn là một hoạt cảnh: điểm vẫn bị trừ, nhưng ai mở tab công
 * cụ nhà phát triển đều đọc được gợi ý miễn phí. Che ở tầng giao diện không cứu
 * được, vì dữ liệu đã nằm trong phản hồi rồi.
 *
 * Cách chặn duy nhất có hiệu lực là để kiểu dữ liệu ngăn chuyện đó: đường của
 * người học trả `ProblemForSolver`, và kiểu này KHÔNG có chỗ nào chứa `text`
 * của gợi ý chưa mở.
 */
export interface ProblemHintTeaser {
  readonly id: string;
  readonly penaltyPoints: number;
  readonly revealed: boolean;
  /** Chỉ khác `null` khi `revealed` là `true`. Máy chủ quyết, không phải client. */
  readonly text: string | null;
}

/**
 * Bài ở dạng gửi cho người học. Khác `Problem` đúng một chỗ: gợi ý đã che.
 *
 * `objectives` thì KHÔNG che, và đó là chủ ý: nhãn mục tiêu chính là đề bài
 * ("đưa 3 pod lên 2 node khác nhau"), giấu đi thì người ta không biết phải làm
 * gì. Tham số vị từ đi kèm có hé lộ con số cụ thể, nhưng nhãn vốn đã nói ra con
 * số đó rồi — không có gì để giấu thêm.
 */
export type ProblemForSolver = Omit<Problem, 'hints'> & {
  readonly hints: readonly ProblemHintTeaser[];
};

/** Bài kèm số liệu — hình dạng mà trang danh sách và trang chi tiết nhận. */
export interface ProblemWithStats {
  /**
   * Dạng ĐÃ CHE. Trang soạn bài cần bản đầy đủ thì dùng `Problem` qua đường
   * riêng của người soạn, đường đó đã kiểm quyền.
   */
  readonly problem: ProblemForSolver;
  readonly stats: ProblemStats;
  /** Trạng thái của NGƯỜI ĐANG XEM. `null` khi chưa đăng nhập. */
  readonly viewerStatus: ProblemViewerStatus | null;
}

export type ProblemViewerStatus = 'solved' | 'attempted' | 'untouched';

// ── Truy vấn danh sách ──────────────────────────────────────────────────────

export interface ProblemFilter {
  readonly difficulty?: readonly ProblemDifficulty[];
  /** Nhiều chủ đề = HOẶC (bài khớp bất kỳ chủ đề nào được chọn). */
  readonly topics?: readonly ProblemTopic[];
  /** Nhiều tag = VÀ (bài phải có đủ mọi tag) — cố ý khác luật của `topics`. */
  readonly tags?: readonly string[];
  readonly state?: readonly ProblemState[];
  /** Tìm trong `code` và `title`. Không tìm trong `statement`. */
  readonly query?: string;
  /** Lọc theo quan hệ với người đang xem. Bỏ qua khi chưa đăng nhập. */
  readonly viewerStatus?: readonly ProblemViewerStatus[];
}

/**
 * Khoá sắp xếp.
 *
 * ⚠ KHÔNG có `title`, và đó là chủ ý đã trả giá một lần rồi: Postgres và
 * JavaScript KHÔNG cùng thứ tự với tiếng Việt có dấu, nên `ORDER BY title` cho
 * ra một thứ tự ở tầng DB và một thứ tự khác khi tầng web sắp lại — với phân
 * trang keyset thì lệch thứ tự nghĩa là MẤT DÒNG, im lặng. `packages/scenario`
 * đã chốt cùng ràng buộc này (`CONTENT_ORDER_KEYS`, source.ts:60-82). Ai muốn
 * thêm `title` vào đây phải giải quyết collation trước.
 *
 * `code` là khoá mặc định và là khoá duy nhất DUY NHẤT theo từng dòng, nên mọi
 * khoá khác đều phải kèm `code` làm tie-break trong keyset — nếu không, hai bài
 * cùng độ khó sẽ làm con trỏ nhảy cóc.
 */
export const PROBLEM_ORDER_KEYS = ['code', 'difficulty', 'solverCount', 'createdAt'] as const;

export type ProblemOrderKey = (typeof PROBLEM_ORDER_KEYS)[number];

export interface ProblemListOptions {
  readonly filter?: ProblemFilter;
  readonly orderBy?: ProblemOrderKey;
  readonly direction?: 'asc' | 'desc';
  readonly limit?: number;
  /** Con trỏ keyset. Xem `PROBLEM_ORDER_KEYS` về lý do phải tie-break bằng `code`. */
  readonly cursor?: string | null;
}

export interface ProblemPage {
  readonly items: readonly ProblemWithStats[];
  readonly nextCursor: string | null;
}

// ── Nộp bài ─────────────────────────────────────────────────────────────────

/**
 * Một lượt làm bài đã kết thúc.
 *
 * "Nộp bài" ở đây không giống OJ chấm code: không có file nộp, không có testcase
 * diff. Người làm thao tác trên cluster mô phỏng, và cái được lưu là NHẬT KÝ
 * HÀNH ĐỘNG (`RunLog` trong contract.ts:457) — đủ để phát lại và chấm lại từ
 * đầu bằng `verify.ts`. Đó là lý do gian lận bằng cách sửa state phía client
 * không qua được: điểm chỉ tính khi phát lại nhật ký cho ra đúng trạng thái đó.
 */
export interface ProblemSubmission {
  readonly id: string;
  readonly problemCode: string;
  readonly userId: string;
  readonly solved: boolean;
  readonly score: number;
  readonly durationSeconds: number;
  readonly movesUsed: number;
  /** Id các gợi ý đã mở — dùng để trừ điểm, và để biết bài nào gợi ý quá khó hiểu. */
  readonly hintsRevealed: readonly string[];
  readonly submittedAt: string;
}
