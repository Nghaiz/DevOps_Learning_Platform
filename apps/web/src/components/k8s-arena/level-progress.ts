'use client';

import {
  appendRun,
  browserStorage,
  readSave,
  writeSave,
  type RunResult,
} from '@devops-platform/games';

/**
 * Tiến độ từng màn, đọc/ghi trên máy người chơi.
 *
 * ## Vì sao file này tồn tại
 *
 * `packages/games/src/core/progress.ts` đã có sẵn một tầng lưu trữ đầy đủ —
 * phiên bản, di trú, xử lý bản lưu hỏng, từ chối ghi đè bản lưu của phiên bản
 * mới hơn — và có test. Nhưng barrel không mở một hàm nào của nó ra, nên nó là
 * MÃ CHẾT: không có gì trong ứng dụng gọi được, và tiến độ chưa từng được lưu.
 *
 * Trong khi đó `/games` viết *"tiến độ lưu ngay trên máy bạn"* và
 * `games/layout.tsx` viết *"tiến độ lưu ở localStorage"*. Cả hai câu đều sai.
 *
 * File này là lớp mỏng nối hai đầu đó lại. Nó KHÔNG tự viết logic lưu trữ —
 * viết bản thứ hai là bỏ qua đúng phần đã được nghĩ kỹ và đã có test.
 *
 * ## Vì sao đọc bằng hàm, không bằng state toàn cục
 *
 * `localStorage` có thể ném ngay ở lúc TRUY CẬP (cửa sổ riêng tư, trình duyệt
 * chặn dữ liệu trang, lúc chụp ảnh thu nhỏ). `browserStorage()` đã trả `null`
 * trong những trường hợp đó, và mọi hàm dưới đây phải chạy tiếp như bình
 * thường: mất tiến độ là phiền, còn một trang trắng vì lưu trữ bị chặn là hỏng.
 */

const GAME_ID = 'k8s';

export interface LevelProgress {
  /** Đã hoàn thành ít nhất một lần. */
  readonly completed: boolean;
  /** Điểm cao nhất, 0..1000. `0` khi chưa từng thắng. */
  readonly bestScore: number;
  /** Số lần đã chơi màn này, kể cả lần bỏ dở đã ghi kết quả. */
  readonly attempts: number;
}

export type ProgressMap = Readonly<Record<string, LevelProgress>>;

/**
 * Tiến độ của mọi màn, gom từ danh sách lượt chơi đã lưu.
 *
 * TÍNH tại chỗ chứ không lưu một bảng tổng hợp: bảng đó sẽ là một trường suy ra
 * được, và nó lệch ngay lần đầu ai đó thêm một lượt chơi mà quên cập nhật nó.
 * Danh sách lượt chơi là SSOT.
 */
export function readProgress(): ProgressMap {
  const save = readSave(GAME_ID, browserStorage());
  const out: Record<string, LevelProgress> = {};
  for (const run of save.runs) {
    const won = run.objectivesMet.length >= run.objectivesTotal && run.objectivesTotal > 0;
    const current = out[run.levelId] ?? { completed: false, bestScore: 0, attempts: 0 };
    out[run.levelId] = {
      completed: current.completed || won,
      bestScore: Math.max(current.bestScore, won ? run.score : 0),
      attempts: current.attempts + 1,
    };
  }
  return out;
}

/**
 * Ghi lại một lượt chơi đã xong.
 *
 * Trả `false` khi không ghi được (lưu trữ bị chặn, hoặc trên đĩa đang là bản
 * lưu của một phiên bản MỚI hơn — `writeSave` từ chối đè, và từ chối đó là
 * đúng: đè lên là xoá tiến độ mà người chơi tạo ra ở một bản sau).
 */
export function recordRun(run: RunResult): boolean {
  const storage = browserStorage();
  const save = readSave(GAME_ID, storage);
  return writeSave(GAME_ID, appendRun(save, run), storage);
}

/** Ba trạng thái mà màn chọn màn cần phân biệt. */
export type LevelState = 'done' | 'playing' | 'new';

export function levelState(progress: ProgressMap, levelId: string): LevelState {
  const entry = progress[levelId];
  if (entry === undefined) {
    return 'new';
  }
  return entry.completed ? 'done' : 'playing';
}
