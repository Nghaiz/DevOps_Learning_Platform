/**
 * Trạng thái một phiên chơi — hình dạng DÙNG CHUNG cho mọi game.
 *
 * Tách lên `core/` ngày 2026-09-14 (P17). Bốn trường này không có gì riêng của
 * Kubernetes: "đang chơi / thắng / thua", "mục tiêu nào đang đạt", "đã mở mấy
 * gợi ý", "đã đi mấy nước" là từ vựng của *một game có mục tiêu*, không phải của
 * một cụm K8s.
 *
 * ✅ Nợ đã trả 2026-09-14: `k8s/contract.ts` từng khai bản của riêng nó, nay
 * re-export hai kiểu ở đây. `git/contract.ts` và `git/engine.ts` vốn đã import
 * thẳng từ file này. Đây là chỗ DUY NHẤT hai kiểu này được khai.
 *
 * ⚠ Thêm một trường vào đây là một thay đổi PHÁ VỠ với mọi game: hình dạng này
 * đi ra ngoài package qua `src/index.ts` và `apps/web` đọc nó.
 */

/**
 * `'lost'` có thật, không phải một nhánh trang trí: một level có thể đặt điều
 * kiện hỏng không cứu được (game Git chương 3 làm đúng thế — mất commit KHÔNG
 * còn nằm trong store thì không có `reflog` nào cứu nổi).
 */
export type SessionPhase = 'playing' | 'won' | 'lost';

export interface SessionStatus {
  readonly phase: SessionPhase;
  /**
   * id các objective ĐANG đạt.
   *
   * Tính lại sau mỗi hành động, không tích luỹ — một objective đạt rồi có thể
   * mất lại (người chơi commit đúng rồi `reset --hard` xoá đi). Tích luỹ là một
   * trường suy ra được lưu sai chỗ, và nó làm bảng mục tiêu nói dối.
   */
  readonly objectivesMet: readonly string[];
  readonly hintsRevealed: number;
  readonly movesUsed: number;
}
