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

export type GameId = 'k8s' | 'pipeline' | 'netpol' | 'dockerfile';

/** Cùng thang với `--difficulty-*` của hệ thiết kế — đừng đặt thang thứ hai. */
export type Difficulty = 'basic' | 'intermediate' | 'advanced';

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
   * `true` = không hiện mô tả cho tới khi mở khoá. Dùng tiết chế: thành tựu ẩn
   * mà người chơi không đoán nổi đường tới thì không phải phần thưởng, chỉ là
   * một ô xám.
   */
  readonly hidden: boolean;
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
