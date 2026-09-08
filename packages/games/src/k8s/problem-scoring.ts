/**
 * Chấm điểm một lượt làm bài OJ — MỘT nguồn duy nhất cho cả hai phía.
 *
 * ⛔ VÌ SAO FILE NÀY TỒN TẠI, đọc trước khi định tính điểm ở chỗ khác.
 *
 * Máy chủ không tin điểm client gửi lên: nó phát lại nhật ký hành động, tự chấm,
 * và chỉ ghi nhận khi con số nó tính ra KHỚP con số client khai. Cơ chế đó chặn
 * gian lận, nhưng nó cũng có một hệ quả khó chịu — nếu hai bên tính bằng hai
 * đoạn mã khác nhau thì mọi lượt nộp HỢP LỆ đều bị từ chối, và không ai được
 * điểm cả. Lỗi đó không trông giống lỗi công thức; nó trông giống hệ thống từ
 * chối người chơi ngẫu nhiên.
 *
 * Nên công thức nằm ở đây, thuần, trong `packages/games` — chỗ mà cả arena
 * (trình duyệt) lẫn tầng máy chủ đều với tới được. Đừng viết bản thứ hai ở
 * `apps/web` dù chỉ để "cho tiện".
 *
 * Phát hiện bởi lane D và lane E khi ghép hệ OJ, 2026-09-08.
 */

import type { ProblemHint } from './problem.ts';
import { MAX_SCORE, computeScore } from './scoring.ts';

export interface ProblemScoreInput {
  /** Số mục tiêu đạt được, tính theo id KHÁC NHAU. */
  readonly objectivesMet: number;
  readonly objectivesTotal: number;
  /** Đếm từ nhật ký hành động theo `COMMAND_KINDS`. */
  readonly movesUsed: number;
  /** `null` khi bài không chấm theo số nước đi. */
  readonly parMoves: number | null;
  /** Toàn bộ gợi ý của bài, để tra giá. */
  readonly hints: readonly ProblemHint[];
  /**
   * Id các gợi ý đã mở, gộp từ MỌI nguồn: id ghi trong nhật ký của lượt chơi,
   * cộng các dòng đã lưu ở phía máy chủ.
   *
   * Hai nguồn vì hai đường mở khác nhau, và chúng chồng lấn: mở gợi ý trong lúc
   * chơi thì cả hai nơi cùng có. Hàm tự khử trùng lặp — bên gọi không phải lo,
   * và quan trọng hơn: nếu để bên gọi lo thì client và máy chủ có thể khử khác
   * nhau, đúng loại lệch mà file này sinh ra để chặn.
   */
  readonly revealedHintIds: readonly string[];
}

/**
 * Điểm cuối cùng của một lượt làm bài, trong khoảng [0, `MAX_SCORE`].
 *
 * Ba điều dưới đây trông như tuỳ tiện nhưng đều có lý do, và đổi bất kỳ cái nào
 * cũng phải đổi ở CẢ HAI phía cùng lúc — mà vì chỉ có một hàm nên chuyện đó tự
 * đúng. Đó là toàn bộ giá trị của file này.
 */
export function scoreProblemRun(input: ProblemScoreInput): number {
  /*
   * `hintsUsed` và `hintsAvailable` cùng bằng 0, cố ý.
   *
   * `computeScore` có sẵn một phần điểm "tự lực" giảm theo tỉ lệ gợi ý đã dùng.
   * Bài OJ KHÔNG dùng cơ chế đó, vì gợi ý ở đây đã có giá riêng tính bằng
   * `penaltyPoints` và trừ thẳng bên dưới. Truyền số thật vào sẽ phạt người chơi
   * HAI lần cho cùng một lần mở gợi ý.
   *
   * Truyền 0/0 làm `selfRelianceScore` trả về trọn phần của nó (nó có nhánh
   * `hintsAvailable <= 0` trả nguyên trọng số), tức phần đó thành hằng số và
   * việc trừ điểm hoàn toàn nằm ở `penaltyPoints`. Một chỗ phạt, không phải hai.
   */
  const base = computeScore({
    objectivesMet: input.objectivesMet,
    objectivesTotal: input.objectivesTotal,
    movesUsed: input.movesUsed,
    /*
     * `null` thành 0, và 0 KHÔNG có nghĩa "mốc chuẩn là không nước đi nào".
     * `efficiencyScore` có nhánh `parMoves <= 0` trả trọn phần hiệu quả, với lý
     * lẽ đã ghi trong `scoring.ts`: không phạt người chơi vì một thiếu sót dữ
     * liệu mà họ không nhìn thấy và không sửa được. Bài OJ được phép không đặt
     * `parMoves`, nên nhánh đó là đường đi bình thường ở đây, không phải lối
     * thoát hiểm.
     */
    parMoves: input.parMoves ?? 0,
    hintsUsed: 0,
    hintsAvailable: 0,
  });

  return clampScore(base - hintPenalty(input.hints, input.revealedHintIds));
}

/**
 * Tổng điểm trừ của các gợi ý đã mở.
 *
 * Khử trùng lặp bằng `Set` trước khi cộng: một gợi ý mở hai lần vẫn chỉ trừ một
 * lần. Không có bước này thì người chơi bấm lại gợi ý đã mở sẽ mất thêm điểm,
 * trong khi họ không nhận được thông tin gì mới.
 *
 * Id không khớp gợi ý nào của bài thì BỎ QUA, không ném. Chuyện đó xảy ra thật
 * khi bài được sửa đề sau lúc ai đó đang làm dở: gợi ý cũ biến mất, nhật ký cũ
 * vẫn nhắc tới id của nó. Ném ở đây sẽ làm hỏng cả lượt nộp vì một thay đổi mà
 * người chơi không gây ra.
 */
function hintPenalty(hints: readonly ProblemHint[], revealedIds: readonly string[]): number {
  if (revealedIds.length === 0) {
    return 0;
  }
  const revealed = new Set(revealedIds);
  let penalty = 0;
  for (const hint of hints) {
    if (revealed.has(hint.id)) {
      penalty += Math.max(0, hint.penaltyPoints);
    }
  }
  return penalty;
}

/**
 * Kẹp về [0, `MAX_SCORE`].
 *
 * Cận dưới thật sự cần: tổng `penaltyPoints` của một bài nhiều gợi ý đắt có thể
 * vượt điểm gốc, và điểm âm sẽ lọt vào bảng xếp hạng cùng mọi phép cộng dồn phía
 * sau. Cận trên là phòng thủ — `computeScore` đã kẹp rồi, nhưng nó là hàm khác
 * và có thể đổi.
 */
function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(0, Math.round(value)));
}
