/**
 * Mốc hoàn thành của chiến dịch CI/CD, lưu trên máy người chơi.
 *
 * Trước đợt dựng lại PTIT (2026-10-03) game CI/CD không lưu gì: danh sách màn
 * không có cách nào nói màn nào đã qua, và trang `/games` không đọc được tiến
 * độ của game này. File này là kho nhỏ nhất đủ cho hai việc đó, cùng khuôn với
 * `git/git-progress.ts`: đã qua hay chưa, và đã chạy mấy lượt.
 *
 * Chỉ màn LEVEL ghi vào đây. Chế độ làm bài OJ chấm ở máy chủ, nên một lượt
 * chạy thử tại chỗ không nói gì về chuyện đã qua (xem `cicd-level-screen.tsx`).
 *
 * `localStorage` có thể ném ngay lúc truy cập (cửa sổ riêng tư, trình duyệt chặn
 * dữ liệu trang). Mọi hàm ở đây nuốt lỗi đó và trả trạng thái rỗng: mất tiến độ
 * là phiền, một trang trắng vì lưu trữ bị chặn là hỏng.
 */

export interface CicdMilestone {
  readonly completed: boolean;
  /** Số lượt "Chạy thử" đã ra kết quả chấm được (không tính lượt lỗi YAML). */
  readonly runs: number;
}

export type CicdProgress = Readonly<Record<string, CicdMilestone>>;

/** Khoá riêng, KHÔNG trùng `storageKey('cicd')` của tầng lưu lượt chơi. */
export const CICD_PROGRESS_KEY = 'dlp.games.v1.cicd.campaign';

function isMilestone(value: unknown): value is CicdMilestone {
  if (value === null || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.completed === 'boolean' &&
    typeof entry.runs === 'number' &&
    Number.isInteger(entry.runs) &&
    entry.runs >= 0
  );
}

export function readCicdProgress(): CicdProgress {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CICD_PROGRESS_KEY) ?? '{}');
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => isMilestone(entry)));
  } catch {
    return {};
  }
}

/**
 * Ghi một lượt chạy đã chấm. `won` một lần là đã qua mãi mãi: lượt sau trượt
 * không xoá mốc cũ (người chơi đang thử một cách khác, không phải quên bài).
 */
export function recordCicdRun(levelId: string, won: boolean): void {
  try {
    const progress = { ...readCicdProgress() };
    const previous = progress[levelId];
    progress[levelId] = {
      completed: won || previous?.completed === true,
      runs: (previous?.runs ?? 0) + 1,
    };
    localStorage.setItem(CICD_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* Lưu trữ bị chặn: màn chơi vẫn chạy, chỉ là không nhớ được. */
  }
}
