/**
 * Thống kê — một HÌNH CHIẾU tính tại chỗ dùng, không phải dữ liệu được lưu.
 *
 * ⛔ Không hàm nào ở đây được gọi lúc GHI. `RunResult` cố ý không mang `passed`,
 * `percent`, `durationSeconds` (xem `core/types.ts`); nếu ta lưu thêm một bảng
 * thống kê "cho nhanh" thì nó sẽ nói dối ngay lần đầu ai đó đổi cách chấm — đúng
 * cái quy ước "No Derived Fields" của repo cấm.
 *
 * §8.3 của `phase-14-exec.md` đòi trang stats tách hai cột "đã xác minh" và "tất
 * cả". Cách làm ở đây: `computeStats` nhận một danh sách lượt chơi và không biết
 * gì về xác minh — bên gọi lọc trước rồi gọi HAI LẦN. Nhét cờ `verified` vào đây
 * sẽ buộc `core/` phụ thuộc vào `verify.ts` của lane G, mà lane G lại phụ thuộc
 * ngược vào reducer — một vòng phụ thuộc để đổi lấy một tham số.
 */

import type { RunResult } from './types.ts';

/**
 * ⚠ ĐÂY là định nghĩa duy nhất của "qua level", theo đúng chú thích ở
 * `core/types.ts`. Mọi chỗ cần biết một lượt có qua hay không đều gọi hàm này,
 * không tự viết lại phép so sánh — hai định nghĩa lệch nhau là cách trang stats
 * và trang level nói hai con số khác nhau về cùng một lượt chơi.
 *
 * Dùng `Set` chứ không so `length`: `objectivesMet` tới từ `localStorage` và có
 * thể chứa id trùng (bản lưu cũ, hoặc người chơi sửa tay). `length >= total` khi
 * đó sẽ báo qua một level chưa qua.
 */
export function isPassed(run: RunResult): boolean {
  if (run.objectivesTotal <= 0) {
    return false;
  }
  return new Set(run.objectivesMet).size >= run.objectivesTotal;
}

/** Giây, làm tròn xuống. Âm (đồng hồ máy nhảy lùi) quy về 0 chứ không ném. */
export function durationSeconds(run: RunResult): number {
  const ms = run.finishedAt - run.startedAt;
  return ms > 0 ? Math.floor(ms / 1000) : 0;
}

export function percentComplete(run: RunResult): number {
  if (run.objectivesTotal <= 0) {
    return 0;
  }
  const met = Math.min(new Set(run.objectivesMet).size, run.objectivesTotal);
  return Math.round((met / run.objectivesTotal) * 100);
}

export interface LevelStat {
  readonly levelId: string;
  readonly attempts: number;
  readonly cleared: boolean;
  readonly bestScore: number;
  /** Số lệnh của lượt ĐẠT ĐIỂM CAO NHẤT, không phải lượt ít lệnh nhất. */
  readonly bestScoreCommands: number;
  /** Số lệnh ít nhất trong các lượt QUA — `null` nếu chưa qua lần nào. */
  readonly fewestCommands: number | null;
  /** epoch ms của lần qua ĐẦU TIÊN. `null` nếu chưa qua. */
  readonly firstClearedAt: number | null;
  readonly totalHintsUsed: number;
}

export interface GameStats {
  readonly totalRuns: number;
  readonly clearedRuns: number;
  /** id level đã qua ít nhất một lần, sắp xếp để so sánh được trong test. */
  readonly clearedLevelIds: readonly string[];
  readonly totalCommands: number;
  readonly totalHints: number;
  readonly totalSeconds: number;
  /** Tổng điểm CAO NHẤT mỗi level — không phải tổng mọi lượt, chơi lại không cộng dồn. */
  readonly totalBestScore: number;
  /** Khoá là `levelId`. Dùng `Map` chứ không object để id có ký tự lạ cũng an toàn. */
  readonly perLevel: ReadonlyMap<string, LevelStat>;
  /** Chuỗi ngày qua level liên tiếp dài nhất — `null` khi chưa qua level nào. */
  readonly longestStreakDays: number | null;
}

/**
 * ⚠ KHÔNG dựa vào thứ tự của `runs`. Bản lưu có thể đã bị sắp lại, và một hàm
 * thống kê đọc "lượt cuối mảng" là lượt mới nhất sẽ sai lặng lẽ khi điều đó
 * không còn đúng. Mọi phép ở đây so bằng giá trị (`startedAt`, `score`).
 */
export function computeStats(runs: readonly RunResult[]): GameStats {
  const perLevel = new Map<string, LevelStat>();
  let totalCommands = 0;
  let totalHints = 0;
  let totalSeconds = 0;
  let clearedRuns = 0;

  for (const run of runs) {
    totalCommands += run.commandsUsed;
    totalHints += run.hintsUsed;
    totalSeconds += durationSeconds(run);
    const passed = isPassed(run);
    if (passed) {
      clearedRuns += 1;
    }
    const prev = perLevel.get(run.levelId);
    const beatsBest = prev === undefined || run.score > prev.bestScore;
    const firstCleared = passed
      ? prev?.firstClearedAt === undefined || prev.firstClearedAt === null
        ? run.startedAt
        : Math.min(prev.firstClearedAt, run.startedAt)
      : (prev?.firstClearedAt ?? null);
    const fewest = passed
      ? prev?.fewestCommands == null
        ? run.commandsUsed
        : Math.min(prev.fewestCommands, run.commandsUsed)
      : (prev?.fewestCommands ?? null);
    perLevel.set(run.levelId, {
      levelId: run.levelId,
      attempts: (prev?.attempts ?? 0) + 1,
      cleared: (prev?.cleared ?? false) || passed,
      bestScore: beatsBest ? run.score : (prev?.bestScore ?? 0),
      bestScoreCommands: beatsBest ? run.commandsUsed : (prev?.bestScoreCommands ?? 0),
      fewestCommands: fewest,
      firstClearedAt: firstCleared,
      totalHintsUsed: (prev?.totalHintsUsed ?? 0) + run.hintsUsed,
    });
  }

  const clearedLevelIds = [...perLevel.values()]
    .filter((stat) => stat.cleared)
    .map((stat) => stat.levelId)
    .sort();
  const totalBestScore = [...perLevel.values()]
    .filter((stat) => stat.cleared)
    .reduce((sum, stat) => sum + stat.bestScore, 0);

  return {
    totalRuns: runs.length,
    clearedRuns,
    clearedLevelIds,
    totalCommands,
    totalHints,
    totalSeconds,
    totalBestScore,
    perLevel,
    longestStreakDays: longestStreak(runs),
  };
}

const DAY_MS = 86_400_000;

/**
 * Chuỗi ngày liên tiếp có ít nhất một lượt QUA.
 *
 * ⚠ Cắt ngày theo UTC, không theo múi giờ máy. Lý do: `RunResult.startedAt` là
 * epoch ms và không mang múi giờ, nên cắt theo giờ địa phương sẽ làm cùng một bản
 * lưu cho ra hai con số khác nhau ở hai máy — và tệ hơn, đổi khi người chơi bay
 * qua múi giờ khác. Chuỗi tính theo UTC thì lệch tối đa một ngày với cảm nhận của
 * người chơi, nhưng ổn định.
 */
function longestStreak(runs: readonly RunResult[]): number | null {
  const days = new Set<number>();
  for (const run of runs) {
    if (isPassed(run)) {
      days.add(Math.floor(run.startedAt / DAY_MS));
    }
  }
  if (days.size === 0) {
    return null;
  }
  const sorted = [...days].sort((a, b) => a - b);
  let best = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const now = sorted[i];
    if (prev === undefined || now === undefined) {
      continue;
    }
    current = now - prev === 1 ? current + 1 : 1;
    best = Math.max(best, current);
  }
  return best;
}
