// Subpath `./lab-score`, KHÔNG phải barrel `.` — cùng lý do đã ghi ở đầu
// `task-status.ts`: barrel kéo theo loader đọc đĩa (`node:fs/promises`) và làm
// `next build` đổ với "the chunking context does not support external modules".
import { computeLabScore, computeLabStatus } from '@devops-platform/scenario/lab-score';
import type { Lab, LabAttemptStatus, LabScore } from '@devops-platform/shared-types/lab';
import {
  buildTaskDisplays,
  uncheckedTaskCount,
  type TaskDisplay,
  type WireLabTaskResult,
} from './task-status';

/**
 * Nhãn + số đo của bảng điểm lab — **tính lúc hiển thị**, không lưu ở đâu cả.
 *
 * ## Vì sao là một module riêng, không phải mấy chuỗi nội suy trong JSX
 *
 * Cùng lý lẽ `lessons/[id]/progress.ts` (nợ P2 §2): nhãn cũ ở đó nói
 * `"4/4 bước"` từ ĐÚNG MỘT lượt chấm — con số không sai với thứ nó đo, nhưng
 * câu chữ khẳng định một TẬP bước đã đạt, thứ không lưu ở đâu. `phase-13.md`
 * task 13 nói thẳng bẫy đó *"lặp lại y hệt ở đây nếu ẩu"*, và ở lab nó lặp lại
 * ở đúng hai chỗ:
 *
 * 1. **`{percent}%` đứng một mình.** Trước lúc nộp, `percent` là điểm tính trên
 *    MỌI task (task chưa chấm nằm ở mẫu số — `computeLabScore`), nên "45%" đọc
 *    ra như một kết quả trong khi nó là "nếu nộp bây giờ thì được 45%". Hai câu
 *    đó khác nhau đúng ở chỗ người học cần biết nhất.
 * 2. **`{passedCount}/{taskCount}` cạnh một `percent` tính theo TRỌNG SỐ.** Lab
 *    cho phép `weight` khác nhau giữa các task, nên "3/7 nhiệm vụ — 60%" là hai
 *    con số đều đúng mà đọc như một mâu thuẫn. `weighted` dưới đây tồn tại để
 *    câu chữ tự nói ra điều đó thay vì để người học tự đoán.
 *
 * Tách thành hàm thuần để phép kiểm bám được vào: một chuỗi nội suy nằm giữa
 * JSX chỉ kiểm được bằng cách render cả trang, mà `apps/web` chạy vitest ở
 * `environment: 'node'` (không jsdom, không RTL) — tức là không kiểm được.
 *
 * ## Vì sao FE tính lại điểm mà server cũng trả về `score`
 *
 * `labs.getAttempt` trả `score`/`status` đã tính sẵn, và chúng là AUTHORITY cho
 * mọi thứ được lưu (bảng xếp hạng đọc từ server, không từ đây). Nhưng bảng
 * trạng thái từng task ở trang này vẽ từ mảng `results`, và nếu tiêu đề đọc
 * `score` của lượt query TRƯỚC còn các badge đọc mảng của lượt query SAU thì hai
 * chỉ báo cạnh nhau nói hai điều khác nhau về cùng một lần thử — cửa sổ đó mở ra
 * ở mỗi lượt `invalidate` sau khi chấm.
 *
 * Nên trang này suy MỌI nhãn từ ĐÚNG MỘT mảng, bằng ĐÚNG những hàm thuần server
 * dùng (`computeLabScore`/`computeLabStatus` của `packages/scenario`). Đây là
 * dùng lại SSOT, không phải hiện thực thứ hai: viết một phép tính điểm riêng ở
 * FE mới là thứ `docs/lab-format.md` § "Không lưu field suy ra được" cấm.
 */

export type LabScoreTone = 'neutral' | 'success' | 'warning';

export interface LabScoreSummary {
  /**
   * Trạng thái từng task, đã suy sẵn.
   *
   * Trả kèm ở đây (thay vì để nơi gọi tự gọi `buildTaskDisplays` lần nữa) chính
   * là cách bảo đảm badge và tiêu đề không thể lệch nhau: chúng ra từ một lượt
   * suy duy nhất trên một mảng duy nhất.
   */
  readonly displays: readonly TaskDisplay[];
  readonly score: LabScore;
  readonly status: LabAttemptStatus;
  /** Số task có kết quả MỚI NHẤT `exitCode === 0`. */
  readonly passedCount: number;
  readonly taskCount: number;
  /** Task chưa từng được chấm lần nào (AC 8.C). */
  readonly uncheckedCount: number;
  /** Các task KHÔNG cùng trọng số ⇒ `passedCount/taskCount` không tỉ lệ với `percent`. */
  readonly weighted: boolean;
  readonly submitted: boolean;
  /** Câu chính. Nói đúng thứ hệ thống biết, không hơn. */
  readonly headline: string;
  /** Câu phụ giải thích điểm. `null` khi không có gì để nói thêm. */
  readonly caveat: string | null;
  readonly tone: LabScoreTone;
}

export interface LabScoreInput {
  readonly lab: Lab;
  readonly results: readonly WireLabTaskResult[];
  /**
   * `attempt.submittedAt` — chuỗi ISO 8601 qua dây tRPC, `null` khi lần thử còn
   * đang mở. Đây là thứ DUY NHẤT phân biệt "điểm hiện tại" với "kết quả".
   */
  readonly submittedAt: string | null;
}

export function summarizeLabScore(input: LabScoreInput): LabScoreSummary {
  const { lab, results, submittedAt } = input;

  const displays = buildTaskDisplays(lab, results);
  const uncheckedCount = uncheckedTaskCount(displays);
  // `computeLabScore` nhận `checkedAt` là `Date` HOẶC chuỗi (`Instant`) nên
  // mảng dây tRPC đi thẳng vào được — không chuẩn hoá lần hai ở đây.
  const score = computeLabScore(lab, results);
  const status = computeLabStatus(lab, score, submittedAt === null ? null : new Date(submittedAt));

  const taskCount = lab.tasks.length;
  const passedCount = score.passedTaskIds.length;
  const weighted = new Set(lab.tasks.map((task) => task.weight)).size > 1;
  const submitted = submittedAt !== null;

  // Chỉ hiện cặp trọng số khi nó THÊM thông tin. Lab mọi task cùng trọng số thì
  // "(4/4 điểm trọng số)" chỉ lặp lại "4/4 nhiệm vụ" bằng chữ khác.
  const weightNote = weighted
    ? ` (${String(score.earnedWeight)}/${String(score.totalWeight)} điểm trọng số)`
    : '';

  if (!submitted) {
    return {
      displays,
      score,
      status,
      passedCount,
      taskCount,
      uncheckedCount,
      weighted,
      submitted,
      // "nộp bây giờ được X%" chứ không phải "X%": trước lúc nộp, con số này là
      // một DỰ BÁO có điều kiện, và điều kiện đó (không chấm thêm gì nữa) phải
      // nằm trong câu chữ.
      headline: `Đã đạt ${String(passedCount)}/${String(taskCount)} nhiệm vụ — nộp bây giờ được ${String(score.percent)}%${weightNote}`,
      caveat:
        uncheckedCount > 0
          ? `Còn ${String(uncheckedCount)} nhiệm vụ chưa được chấm lần nào — nếu nộp bây giờ, chúng tính là chưa đạt. Hãy bấm Chấm ở từng nhiệm vụ trước khi nộp.`
          : null,
      tone: 'neutral',
    };
  }

  return {
    displays,
    score,
    status,
    passedCount,
    taskCount,
    uncheckedCount,
    weighted,
    submitted,
    headline: `${status === 'passed' ? 'Đạt' : 'Chưa đạt'} — ${String(score.percent)}% (mốc ${String(lab.passThresholdPercent)}%)${weightNote}`,
    // Sau khi nộp, câu phụ đổi vai: nó không còn cảnh báo nữa mà GIẢI THÍCH vì
    // sao điểm thấp hơn số nhiệm vụ người học tưởng mình đã làm.
    caveat:
      uncheckedCount > 0
        ? `${String(uncheckedCount)} nhiệm vụ chưa từng được chấm nên tính là chưa đạt trong điểm trên.`
        : null,
    tone: status === 'passed' ? 'success' : 'warning',
  };
}
