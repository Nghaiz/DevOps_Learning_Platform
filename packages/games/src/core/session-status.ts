/**
 * Trạng thái một phiên chơi — hình dạng DÙNG CHUNG cho mọi game.
 *
 * Tách lên `core/` ngày 2026-09-14 (P17). Bốn trường này không có gì riêng của
 * Kubernetes: "đang chơi / thắng / thua", "mục tiêu nào đang đạt", "đã mở mấy
 * gợi ý", "đã đi mấy nước" là từ vựng của *một game có mục tiêu*, không phải của
 * một cụm K8s.
 *
 * ⚠ `k8s/contract.ts` hiện còn khai bản của riêng nó. Đó là NỢ CÓ TÊN, không
 * phải thiết kế: lúc file này ra đời thì một lane khác đang sửa `k8s/contract.ts`
 * và hai bên cùng ghi một file là cách nhanh nhất để mất việc của nhau
 * (`rules/parallel-teammate-git-index-race.md`). Việc phải làm ngay khi lane đó
 * xong: `k8s/contract.ts` re-export hai kiểu này thay vì tự khai. Hai bản khai
 * song song sẽ lệch, và chúng lệch trong im lặng vì chúng cấu trúc-tương-thích.
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
