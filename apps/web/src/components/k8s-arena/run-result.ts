import type { Level, RunResult, SessionStatus } from '@devops-platform/games';
import { computeScore } from '@devops-platform/games';

/**
 * Dựng `RunResult` — lời khai của client về một lượt chơi vừa kết thúc.
 *
 * ## Vì sao là một hàm THUẦN nằm riêng
 *
 * Đúng object này đi vào HAI chỗ, và chúng phải bằng nhau từng trường:
 *
 * 1. `recordRun()` — bản lưu tiến độ trên máy người chơi (`level-progress.ts`).
 * 2. `claimed` của `problems.submit` — lời khai mà MÁY CHỦ chấm lại bằng cách
 *    phát lại nhật ký và so với nó (`server/problems/submit.ts`).
 *
 * Hai bản dựng song song sẽ lệch ở lần đầu ai đó sửa một trong hai, và phần
 * lệch KHÔNG đỏ ở đâu cả: bản lưu vẫn ghi được, lượt nộp vẫn gửi được, chỉ có
 * `verifyRun` trả `khong-khop` và người chơi nhận `CE` với câu *"phát lại ra
 * kết quả khác với kết quả trình duyệt gửi lên"*. Tức một lỗi của chúng ta đọc
 * ra như một lượt chơi gian lận.
 *
 * ## Vì sao nhận `source` chứ không nhận cả `ArenaSessionHandle`
 *
 * Để hàm này gọi được ngoài React. `ArenaSessionHandle` mang `sceneSubscribe`,
 * `dispatch`, `manifest` — một test muốn kiểm phép dựng phải giả lập cả mười
 * bảy trường đó, và cái giá ấy là lý do những phép dựng kiểu này thường không
 * có test nào.
 */
export interface RunResultSource {
  readonly seed: number;
  readonly status: Pick<SessionStatus, 'objectivesMet' | 'movesUsed' | 'hintsRevealed'>;
}

export function buildRunResult(
  level: Level,
  source: RunResultSource,
  startedAt: number,
  finishedAt: number,
): RunResult & { readonly gameId: 'k8s' } {
  return {
    gameId: 'k8s',
    levelId: level.id,
    seed: source.seed,
    startedAt,
    finishedAt,
    objectivesMet: source.status.objectivesMet,
    objectivesTotal: level.objectives.length,
    commandsUsed: source.status.movesUsed,
    hintsUsed: source.status.hintsRevealed,
    /*
     * `computeScore` của engine, KHÔNG phải một công thức thứ hai ở đây. Máy chủ
     * chấm lại điểm bằng đúng hàm này; một phép tính riêng ở client chỉ tạo ra
     * một con số để máy chủ bác bỏ.
     */
    score: computeScore({
      objectivesMet: source.status.objectivesMet.length,
      objectivesTotal: level.objectives.length,
      movesUsed: source.status.movesUsed,
      parMoves: level.parMoves,
      hintsUsed: source.status.hintsRevealed,
      hintsAvailable: level.hints.length,
    }),
  };
}
