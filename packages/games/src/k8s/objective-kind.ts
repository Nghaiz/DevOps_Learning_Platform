/**
 * Mục tiêu nào là VIỆC PHẢI LÀM, mục tiêu nào là ĐIỀU PHẢI GIỮ.
 *
 * ## Vấn đề nó sinh ra để giải
 *
 * Chủ dự án báo 2026-09-08: *"tôi vừa vào mà đã có task được hoàn thành rồi"*.
 * Đo lại toàn bộ 36 level: 22 level có ít nhất một mục tiêu ĐẠT NGAY ở tick 0,
 * trước khi người chơi làm gì. Ví dụ level 10 có `toan-bo-image-moi` (*"pod của
 * `web` chạy image `nginx:1.27-alpine`"*) — Deployment đã khai đúng image đó
 * trong `initialState`, nên ô này tích xanh từ giây đầu và thanh tiến độ mở bài
 * ở 1/3.
 *
 * Đó KHÔNG phải lỗi nội dung. Những mục tiêu ấy là ràng buộc *"đừng làm hỏng thứ
 * đang chạy"* — chúng có mặt để người chơi không sửa được bài bằng cách đập bỏ
 * hết rồi dựng lại. Lỗi nằm ở chỗ TRÌNH BÀY: một ràng buộc "giữ nguyên" hiện ra
 * y hệt một việc đã làm xong, nên người chơi đọc được một câu sai — *"bài này tự
 * hoàn thành hộ tôi một phần"*.
 *
 * ## Vì sao PHÂN LOẠI thay vì thêm một trường vào `Objective`
 *
 * Thêm `kind: 'goal' | 'guard'` vào hợp đồng thì phải phân loại tay 100+ mục
 * tiêu trên 36 file, và mỗi mục tiêu mới sau này lại là một chỗ có thể quên —
 * quên thì im lặng, vì không có gì đỏ khi một guard bị gắn nhãn goal.
 *
 * Phép thử ở đây suy ra điều đó từ chính hành vi của engine, và định nghĩa nó
 * dùng chính là định nghĩa đúng:
 *
 * > Mục tiêu vẫn ĐẠT sau khi mô phỏng chạy một lúc mà người chơi KHÔNG làm gì
 * > là một điều phải GIỮ. Mục tiêu tuột mất, hoặc chưa từng đạt, là việc phải LÀM.
 *
 * ## Vì sao phải đo ở HAI thời điểm, không phải một
 *
 * Chỉ đọc tick 0 là chưa đủ, và level 3 chứng minh: `khong-con-ly-do-loi`
 * (*"pod không còn lý do lỗi"*) ĐẠT ở tick 0 chỉ vì container chưa kịp sập —
 * sự cố đã được gieo nhưng cần vài tick mới biểu hiện. Nó là một GOAL bị đọc
 * nhầm thành guard. Đo thêm ở tick `SETTLE_TICKS` rồi lấy GIAO của hai tập thì
 * level 3 rơi đúng về goal (`t0=[khong-con-ly-do-loi]`, `t40=[]` ⇒ giao rỗng).
 *
 * Hàm THUẦN và tất định theo `seed` — cùng level, cùng hạt giống, luôn cùng kết
 * quả. Nó không đụng tới phiên chơi thật: `initialState` dựng một cụm riêng rồi
 * vứt đi.
 */

import type { Level } from './contract.ts';
import { initialState } from './reducer.ts';
import { evaluateObjectives } from './session.ts';
import { advance } from './tick.ts';

/**
 * Số tick chạy không tải trước khi đọc lần thứ hai.
 *
 * 40 tick ≈ 20 giây mô phỏng ở `TICK_MS` mặc định — đủ dài để một sự cố đã gieo
 * biểu hiện ra (CrashLoopBackOff cần vài lần thử cộng backoff), và đủ ngắn để
 * chạy xong trong vài mili-giây lúc vào bài.
 */
export const SETTLE_TICKS = 40;

export interface ObjectiveKinds {
  /** Mục tiêu ĐANG đúng từ đầu và người chơi phải giữ cho nó đúng. */
  readonly guards: readonly string[];
  /** Mục tiêu người chơi phải LÀM cho đạt. Thanh tiến độ đếm đúng tập này. */
  readonly goals: readonly string[];
}

export function classifyObjectives(
  level: Level,
  seed: number,
  settleTicks: number = SETTLE_TICKS,
): ObjectiveKinds {
  const start = initialState(level, seed);
  const metNow = new Set(evaluateObjectives(start, level.objectives));
  /*
   * `advance` chứ không `reduce`: đây là mô phỏng chạy KHÔNG có hành động nào
   * của người chơi, tức đúng câu hỏi ta đang hỏi — "nếu người chơi ngồi yên thì
   * điều này còn đúng không?".
   */
  const metLater = new Set(evaluateObjectives(advance(start, settleTicks), level.objectives));

  const guards: string[] = [];
  const goals: string[] = [];
  for (const objective of level.objectives) {
    if (metNow.has(objective.id) && metLater.has(objective.id)) {
      guards.push(objective.id);
    } else {
      goals.push(objective.id);
    }
  }
  return { guards, goals };
}
