import type { Lab, LabAttemptStatus, LabScore } from '@devops-platform/shared-types/lab';

/**
 * Bốn hàm THUẦN tính điểm một lần thử lab — KHÔNG chạm DB, KHÔNG chạm mạng.
 *
 * Router (P8/§3, `apps/web/src/server/trpc/routers/labs.ts`) nạp
 * `lab_task_results` từ Postgres rồi gọi các hàm này để tính `score`/`status`/
 * `durationSeconds` — ba field đó KHÔNG có cột trong bảng (xem
 * `plans/devops-learning-platform/reports/harness/2026-09-04-p8-contract/contract.md`
 * §1: `⛔ CẤM` liệt kê đúng ba field này). Tách thành hàm thuần vì thế không chỉ
 * để dễ test: nó là ĐIỀU KIỆN để "không lưu field suy ra được" còn đúng — nếu
 * phép tính nằm lẫn trong router, không có gì ngăn một ngày nào đó ai đó thêm
 * lại cột `percent` "cho nhanh".
 *
 * SSOT của quy ước: `docs/lab-format.md` § "Không lưu field suy ra được".
 */

/**
 * Giữ đúng MỘT kết quả mới nhất cho mỗi `taskId` — người học có thể bấm Kiểm
 * tra lại nhiều lần trên cùng một task, và bảng `lab_task_results` không XOÁ
 * dòng cũ (nó là NHẬT KÝ, không phải trạng thái).
 *
 * Bằng nhau về `checkedAt` ⇒ giữ dòng ĐỨNG SAU trong mảng. Đây là quy ước
 * CHỐT CỨNG (contract §2), không phải hệ quả tình cờ của cách viết vòng lặp:
 * so sánh dùng `>=` khi duyệt THEO THỨ TỰ MẢNG, nên một dòng đứng sau với cùng
 * mốc thời gian luôn thắng dòng đứng trước.
 */
/**
 * Mốc thời gian tới đây từ HAI nguồn có kiểu khác nhau, và cả hai đều hợp lệ:
 *
 * · dòng DB (Drizzle) → `Date`;
 * · DTO đi qua dây tRPC → chuỗi ISO (client của app này cố ý không có
 *   transformer — xem `labTaskResultSchema.checkedAt`).
 *
 * Nhận cả hai và chuẩn hoá tại chỗ, thay vì bắt mỗi phía tự đổi trước khi gọi:
 * ép một phía đổi kiểu là mời đúng cái lỗi `"".getTime is not a function` mà
 * chú thích này tồn tại để chặn.
 */
type Instant = Date | string;

function ms(t: Instant): number {
  return (t instanceof Date ? t : new Date(t)).getTime();
}

export function latestResultPerTask<T extends { taskId: string; checkedAt: Instant }>(
  results: readonly T[],
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const result of results) {
    const existing = latest.get(result.taskId);
    if (existing === undefined || ms(result.checkedAt) >= ms(existing.checkedAt)) {
      latest.set(result.taskId, result);
    }
  }
  return latest;
}

/**
 * Điểm của một lần thử — TÍNH, không lưu.
 *
 * Một task ĐẠT ⇔ kết quả MỚI NHẤT của nó có `exitCode === 0`. Task chưa chấm
 * lần nào (không có dòng nào trong `results`) ⇒ coi như chưa đạt — nó không góp
 * vào `earnedWeight`, nhưng vẫn góp vào `totalWeight` (mọi task trong lab, kể
 * cả task chưa chấm — contract §2), nên bỏ dở một task luôn kéo điểm xuống chứ
 * không lặng lẽ biến mất khỏi mẫu số.
 *
 * `percent` làm tròn XUỐNG (`Math.floor`) — cùng lý do `labScoreSchema.percent`
 * ghi trong shared-types: một lab mốc 80% mà người học đạt 79.6% phải hiện
 * "79%" và trượt, không phải "80%" rồi vẫn trượt.
 */
export function computeLabScore(
  lab: Lab,
  results: readonly { taskId: string; exitCode: number; checkedAt: Instant }[],
): LabScore {
  const latest = latestResultPerTask(results);

  let earnedWeight = 0;
  let totalWeight = 0;
  const passedTaskIds: string[] = [];

  for (const task of lab.tasks) {
    totalWeight += task.weight;
    const result = latest.get(task.id);
    if (result !== undefined && result.exitCode === 0) {
      earnedWeight += task.weight;
      passedTaskIds.push(task.id);
    }
  }

  return {
    earnedWeight,
    totalWeight,
    percent: Math.floor((earnedWeight * 100) / totalWeight),
    passedTaskIds,
  };
}

/**
 * `submittedAt === null` ⇒ `'in_progress'` — lần thử đang mở, chưa có gì để so
 * với mốc đạt. Ngược lại: so `percent` đã tính với `lab.passThresholdPercent`
 * của CHÍNH lab đó (không phải một hằng số toàn cục — mỗi lab tự khai mốc đạt
 * của mình, xem `labSchema.passThresholdPercent`).
 */
export function computeLabStatus(
  lab: Lab,
  score: LabScore,
  submittedAt: Date | null,
): LabAttemptStatus {
  if (submittedAt === null) {
    return 'in_progress';
  }
  return score.percent >= lab.passThresholdPercent ? 'passed' : 'failed';
}

/**
 * `submittedAt === null` ⇒ `null` (chưa kết thúc thì chưa có thời lượng).
 * Ngược lại kẹp ở 0 (`Math.max(0, …)`): `startedAt`/`submittedAt` được ghi bởi
 * hai lời gọi `Date.now()` khác nhau (mutation `startAttempt` rồi `submit`),
 * và lệch đồng hồ giữa hai lần ghi — dù nhỏ — có thể cho `submittedAt` đứng
 * TRƯỚC `startedAt` theo đồng hồ máy chủ. Trả số âm ở đây là hiện "-3 giây" cho
 * người học, đúng loại lỗi hiển thị mà không hàm nào nên tạo ra.
 */
export function computeAttemptDurationSeconds(
  startedAt: Instant,
  submittedAt: Instant | null,
): number | null {
  if (submittedAt === null) {
    return null;
  }
  const diffMs = ms(submittedAt) - ms(startedAt);
  return Math.max(0, Math.floor(diffMs / 1000));
}
