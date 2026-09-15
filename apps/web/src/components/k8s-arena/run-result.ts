import type { Level, RunResult, SessionStatus } from '@devops-platform/games';
import { computeScore } from '@devops-platform/games';

/**
 * Dựng `RunResult` — lời khai của client về một lượt chơi CHẾ ĐỘ LEVEL.
 *
 * ## ⛔ CHỈ chế độ `level`. Bài OJ dùng `k8sOjClaim` — đính chính 2026-09-15
 *
 * Bản trước của khối này viết rằng object dựng ở đây đi vào HAI chỗ:
 * `recordRun()` và `claimed` của `problems.submit`. Vế thứ hai **SAI**, và nó
 * sai ở đúng chỗ đắt nhất — `score`.
 *
 * `computeScore` bên dưới trừ điểm gợi ý theo TỈ LỆ `hintsUsed/hintsAvailable`.
 * Máy chủ chấm bài OJ bằng `scoreProblemRun` (`replay.ts` § `problemScoreRun`),
 * vốn truyền `0/0` vào chính `computeScore` rồi trừ thẳng `penaltyPoints` của
 * từng gợi ý đã mở. Hai công thức ra hai số **ngay khi bài có một gợi ý được
 * mở**, và `verifyRun` so đúng trường đó ⇒ `CE` cho một lượt chơi hợp lệ.
 *
 * Lời khai của bài OJ nay dựng ở `problem-level.ts` § `k8sOjClaim`, gọi đúng
 * hàm máy chủ gọi. Hàm dưới đây giữ nguyên và vẫn đúng — cho chế độ LEVEL, nơi
 * `recordRun` là bên đọc duy nhất và `computeScore` LÀ công thức của level.
 *
 * Bài học giữ lại vì nó đáng hơn bản vá: khối chú thích cũ mô tả một bất biến
 * ("một object, hai chỗ đọc") mà mã chưa bao giờ giữ được sau khi hệ OJ có công
 * thức riêng. Một chú thích nói về hai bên mà chỉ một bên được kiểm là một lời
 * hứa, không phải một ràng buộc.
 *
 * ## Vì sao là một hàm THUẦN nằm riêng
 *
 * Để gọi được ngoài React, và để `recordRun` cùng mọi phép kiểm đọc chung một
 * bản dựng thay vì mỗi chỗ tự ghép lấy.
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
     * `computeScore` của engine — công thức của chế độ LEVEL, không phải của
     * bài OJ. Xem khối đính chính đầu file: máy chủ chấm bài OJ bằng
     * `scoreProblemRun`, và dùng hàm này cho một lượt nộp OJ là tạo ra một con
     * số để máy chủ bác bỏ.
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
