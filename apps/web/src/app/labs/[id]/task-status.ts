import { latestResultPerTask } from '@devops-platform/scenario';
import type { Lab, LabTask, LabTaskResult } from '@devops-platform/shared-types/lab';

/**
 * Trạng thái hiển thị của một task, suy từ MẢNG `LabTaskResult[]` mà
 * `labs.getAttempt`/`labs.checkTask`/`labs.submit` trả về.
 *
 * ⛔ Dùng LẠI `latestResultPerTask` của `@devops-platform/scenario`
 * (`packages/scenario/src/lab-score.ts`) chứ không đếm/lọc lại ở đây — đó là
 * hàm THUẦN mà router server cũng dùng để tính điểm (contract §2), và viết một
 * bản khác ở FE (dù chỉ để tô màu) là dựng hai nơi quyết định "kết quả mới nhất
 * của một task là gì", đúng thứ `docs/lab-format.md` cấm.
 *
 * `passed`/`failed`/`not-attempted` — BA nhánh, không phải hai: một task "chưa
 * chấm lần nào" không phải là "chưa đạt" theo cùng nghĩa với một task ĐÃ chấm
 * và trượt. AC 8.C đòi hiện rõ "tasks chưa từng được chấm" trước khi nộp bài —
 * gộp hai trạng thái này làm mất đúng thông tin đó.
 */
export type TaskCheckState = 'not-attempted' | 'passed' | 'failed';

export interface TaskDisplay {
  readonly task: LabTask;
  readonly state: TaskCheckState;
  readonly lastExitCode: number | null;
  readonly lastOutput: string | null;
}

/**
 * Hình dạng THẬT của `LabTaskResult` khi đi qua tRPC — `checkedAt` là `Date` ở
 * kiểu (`labAttemptSchema`, `packages/shared-types/src/lab.ts`) nhưng router
 * KHÔNG dùng transformer (`lib/trpc-react.tsx` §"KHÔNG có transformer" — cố ý,
 * để không procedure nào âm thầm trả bigint/Date thô). `labs.ts` trả thẳng
 * `row.checkedAt` (Date của drizzle) qua JSON chứ không tự đổi sang chuỗi như
 * `toJsonSession` đã làm cho session — nên `@trpc/react-query` suy kiểu ĐÚNG
 * với thứ thật sự tới: `useQuery().data` có `checkedAt: string`. `tsc` đã bắt
 * đúng lệch này ở call site (`lab-client.tsx`) trước khi có commit nào.
 */
type WireLabTaskResult = Omit<LabTaskResult, 'checkedAt'> & { checkedAt: Date | string };

export function buildTaskDisplays(
  lab: Pick<Lab, 'tasks'>,
  results: readonly WireLabTaskResult[],
): TaskDisplay[] {
  // `new Date(...)` chuẩn hoá CẢ HAI ca (chuỗi ISO qua HTTP thật, lẫn `Date`
  // thật khi gọi trực tiếp trong test) — bỏ qua bước này thì
  // `latestResultPerTask` gọi `.getTime()` trên một string và NÉM ngay lượt
  // đầu tiên `/labs/[id]` tải qua HTTP thật.
  const normalized = results.map((result) => ({ ...result, checkedAt: new Date(result.checkedAt) }));
  const latest = latestResultPerTask(normalized);
  return lab.tasks.map((task) => {
    const result = latest.get(task.id);
    if (result === undefined) {
      return { task, state: 'not-attempted', lastExitCode: null, lastOutput: null };
    }
    return {
      task,
      state: result.exitCode === 0 ? 'passed' : 'failed',
      lastExitCode: result.exitCode,
      lastOutput: result.output,
    };
  });
}

/** AC 8.C — "làm rõ tasks nào chưa từng được chấm trước khi nộp bài". */
export function uncheckedTaskCount(displays: readonly TaskDisplay[]): number {
  return displays.filter((d) => d.state === 'not-attempted').length;
}
