/**
 * Hợp đồng chung cho MỌI game của trụ cột ③.
 *
 * ⛔ File này do lead sở hữu. Lane cần một field mới thì BÁO LEAD, không tự thêm —
 * nó là điểm giao của bốn lane chạy song song, và một field thêm lặng lẽ ở đây sẽ
 * làm ba lane kia biên dịch được nhưng hiểu sai nhau (xem
 * `plans/devops-learning-platform/phase-14-exec.md` §3.3).
 *
 * Ràng buộc kiến trúc: KHÔNG `import` bất kỳ thứ gì từ `node:*`, không DOM API,
 * không React. Logic game chạy trong bundle trình duyệt; `tsconfig.json` của
 * package cố ý bỏ `types: ["node"]` để một lần lạc tay là đỏ ngay ở typecheck.
 */

/**
 * Mọi game của trụ cột ③.
 *
 * ⚠ `'pipeline'` GIỮ LẠI dù không có game nào mang id đó và đợt P17 không làm
 * nó. Xoá một nhánh khỏi union này là **đổi hợp đồng lưu trữ**: khoá
 * `localStorage` là `dlp.games.v1.<gameId>` (xem `storageKey` ở cuối file), nên
 * một người đã có bản lưu dưới `dlp.games.v1.pipeline` sẽ thấy `progress.ts`
 * không còn đường nào đọc nó ra. Mất tiến độ không kèm lỗi, không kèm cảnh báo.
 *
 * `'git'` và `'cicd'` thêm ở 17.A (P17). Chỉ `'git'` có engine ở đợt này;
 * `'cicd'` khai trước theo đúng lý do trên — bản lưu sinh ra trước khi game
 * xong vẫn phải đọc lại được.
 *
 * Vì sao `'cicd'` chứ không dùng lại `'pipeline'`: quyết định #2 của design doc
 * là thiết kế lại từ đầu và rộng hơn CI thuần (có CD, môi trường, rollback,
 * GitOps). Hai id khác nhau vì hai game khác nhau, không phải vì đặt tên lại.
 */
export const GAME_IDS = ['k8s', 'pipeline', 'netpol', 'dockerfile', 'git', 'cicd'] as const;

export type GameId = (typeof GAME_IDS)[number];

/**
 * Cùng thang với `--difficulty-*` của hệ thiết kế — đừng đặt thang thứ hai.
 *
 * ⚠ BA bậc, và nó cố ý KHÁC bốn bậc `PROBLEM_DIFFICULTIES` (`core/problem.ts`).
 * Đừng ánh xạ ngầm giữa hai thang; chỗ nào cần đi từ thang này sang thang kia
 * thì khai một bảng tường minh và nói ra phần mất mát.
 *
 * Danh sách runtime đi kèm kiểu (đúng lối `GAME_IDS`/`GameId` ngay trên) vì
 * `level-draft.ts` phải kiểm một giá trị đọc từ JSON người dùng dán vào — một
 * danh sách chép tay ở đó là một bản sao sẽ lệch.
 */
export const DIFFICULTIES = ['basic', 'intermediate', 'advanced'] as const;

export type Difficulty = (typeof DIFFICULTIES)[number];

/**
 * Kết quả MỘT lượt chơi.
 *
 * ⛔ KHÔNG field suy ra được. `passed` = `objectivesMet.length === objectivesTotal`,
 * `percent`, `durationSeconds` = `finishedAt - startedAt` — cả ba tính ở chỗ dùng.
 * Quy ước "No Derived Fields" của repo (`rules/code-conventions.md`) áp cho
 * `localStorage` y như cho Postgres: một bản ghi lưu sẵn `passed` sẽ nói dối ngay
 * lần đầu ai đó đổi cách chấm.
 */
export interface RunResult {
  readonly gameId: GameId;
  readonly levelId: string;
  /** Hạt giống PRNG. Có nó thì phát lại được đúng lượt chơi đó. */
  readonly seed: number;
  /** epoch ms. Mọi MỐC thời gian trong package này là epoch ms. */
  readonly startedAt: number;
  readonly finishedAt: number;
  /** id của các objective đã đạt — id, không phải chỉ số, để level sửa được mà không hỏng lịch sử. */
  readonly objectivesMet: readonly string[];
  readonly objectivesTotal: number;
  readonly commandsUsed: number;
  readonly hintsUsed: number;
  /** 0..1000, do `scoring.ts` của từng game tính. */
  readonly score: number;
}

export interface Achievement {
  readonly id: string;
  /** `'all'` cho thành tựu bắc cầu nhiều game. */
  readonly gameId: GameId | 'all';
  /** Tiếng Việt. Thuật ngữ hạ tầng giữ tiếng Anh: pod, container, cluster, deployment. */
  readonly title: string;
  readonly description: string;
  /**
   * `true` = `description` bị giấu cho tới khi mở khoá, và `teaser` hiện thay.
   *
   * ⛔ `hidden: true` BẮT BUỘC kèm `teaser`. Chỉ đạo của chủ dự án
   * (2026-09-08): thành tựu ẩn phải cho người chơi ĐỦ để mày mò, không được mù
   * tuyệt đối. Một ô xám không gợi ý gì không phải phần thưởng — nó là một ô
   * người ta bỏ qua, và nó làm hỏng đúng thứ mà thành tựu ẩn sinh ra để tạo:
   * tò mò.
   */
  readonly hidden: boolean;
  /**
   * BẮT BUỘC khi `hidden: true`, CẤM khi `hidden: false`. Một dòng tiếng Việt
   * hiện thay cho `description` lúc còn khoá.
   *
   * Nguyên tắc viết (đây là thiết kế game, không phải văn phong): teaser nói
   * **miền**, giấu **hành động**. "Có những lệnh bạn chỉ gõ khi mọi thứ đã
   * cháy" là tốt — người chơi biết đi tìm ở đâu mà vẫn phải tự nghĩ ra làm gì.
   * "Làm điều gì đó đặc biệt" là vô dụng. "Chạy `kubectl logs --previous` ba
   * lần" thì không còn là ẩn.
   *
   * Kiểm nhanh: đọc teaser xong, người chơi có nảy ra một GIẢ THUYẾT để thử
   * không? Có thì đạt. Không thì viết lại.
   */
  readonly teaser?: string;
}

/**
 * Hình dạng lưu ở `localStorage`, một khoá cho mỗi game:
 * `dlp.games.v1.<gameId>`.
 *
 * `version` là số nguyên tăng dần. `progress.ts` phải chịu được cả bốn trường hợp
 * mà KHÔNG ném: khoá vắng · JSON hỏng · version lạ (cũ hơn ⇒ migrate, mới hơn ⇒
 * bỏ qua và giữ nguyên đĩa, đừng ghi đè dữ liệu của một bản sau) · chính
 * `localStorage` ném (chế độ riêng tư của trình duyệt).
 */
export interface GameSave {
  readonly version: 1;
  readonly runs: readonly RunResult[];
  readonly achievements: readonly string[];
  readonly settings: GameSettings;
}

export interface GameSettings {
  /**
   * Tắt khung 3D. Bật thì module scene KHÔNG được nạp chút nào — đây là đường
   * thoát cho máy yếu, và là hành vi mặc định khi hệ điều hành báo
   * `prefers-reduced-motion`.
   */
  readonly disable3d: boolean;
  readonly showHints: boolean;
}

export const STORAGE_KEY_PREFIX = 'dlp.games.v1.';

export function storageKey(gameId: GameId): string {
  return `${STORAGE_KEY_PREFIX}${gameId}`;
}
