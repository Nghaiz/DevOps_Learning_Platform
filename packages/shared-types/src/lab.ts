import { z } from 'zod';

import {
  contentBaseSchema,
  phaseScriptsSchema,
  scenarioIdSchema,
  SCENARIO_DIFFICULTIES,
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
} from './scenario.ts';

/**
 * DTO của một LAB (P8 — trụ cột ②).
 *
 * Khác Lesson ở đúng MỘT điểm bản chất: lesson **dẫn** người học qua từng bước
 * đã có sẵn đáp án; lab **giao việc** rồi chấm kết quả cuối. Mọi thứ khác —
 * sandbox, terminal, `/exec`, phân loại lỗi của `validate.ts` — dùng lại nguyên
 * vẹn. Vì thế lab KHÔNG có cây DTO riêng: nó `extend` `contentBaseSchema` và
 * chỉ thay `steps[]` bằng `tasks[]`.
 *
 * SSOT của format + quyết định thiết kế: `docs/lab-format.md`.
 */

/**
 * `id` của task đi thẳng vào cột `lab_task_results.task_id`. Nó là ĐỊNH DANH
 * BỀN, không phải chỉ số: chèn một task mới vào giữa lab mà id suy ra từ vị trí
 * thì mọi kết quả đã lưu trỏ nhầm task — không lỗi, không cảnh báo, chỉ là điểm
 * của người học gắn sai việc. Cùng lý do `scenarioIdSchema` tồn tại.
 */
export const labTaskIdSchema = z
  .string()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'lab task id chỉ nhận [a-z0-9-], bắt đầu/kết thúc bằng chữ-số, dài 1–63 ký tự',
  );

export const labTaskSchema = z
  .object({
    id: labTaskIdSchema,
    title: z.string().min(1),
    markdown: z.string(),
    /**
     * ⛔ KHÔNG nullable — khác `scenarioPhaseSchema.verifyScript`.
     *
     * Một lesson-step không chấm vẫn là một step hợp lệ (nó chỉ dẫn giải). Một
     * lab-task không chấm được thì không phải một task: nó là một đoạn văn nằm
     * trong bảng điểm, và nó sẽ luôn ở trạng thái "chưa đạt" mà không có cách
     * nào đạt. Loader từ chối nó ở biên nhập.
     */
    verifyScript: z.string().min(1),
    /**
     * Trọng số khi tính điểm. Ở DTO này là BẮT BUỘC (loader đã áp default 1) —
     * cùng khuôn với `difficulty`: một default ngầm ở tầng DTO làm mọi task
     * trông nặng như nhau mà không ai biết vì sao.
     */
    weight: z.number().int().positive(),
    hint: z.string().nullable(),
  })
  .strict();
export type LabTask = z.infer<typeof labTaskSchema>;

export const labSchema = contentBaseSchema
  .extend({
    /**
     * >=1 task. Một lab không có task nào là một trang trắng có nút "Chấm".
     */
    tasks: z.array(labTaskSchema).min(1),
    /**
     * Setup chạy MỘT lần khi dựng môi trường lab (tương đương `intro.setup`
     * của lesson). Lab cố ý KHÔNG có setup-per-task: thứ tự làm task là tuỳ
     * người học, nên một setup gắn với task thứ n sẽ chạy hoặc không chạy tuỳ
     * đường đi — và bài chấm sẽ khác nhau giữa hai người làm cùng một lab.
     */
    setup: phaseScriptsSchema,
    /**
     * Mốc ĐẠT, tính theo phần trăm trọng số đã đạt. Đây là DỮ LIỆU của lab, và
     * nó phải là dữ liệu chính vì trạng thái đạt/không-đạt **không được lưu**
     * (xem `docs/lab-format.md` § "Không lưu field suy ra được"): nó được tính
     * từ `(các task đã đạt, mốc này)` ở chỗ dùng. Nếu mốc không phải dữ liệu thì
     * không có gì để tính từ.
     */
    passThresholdPercent: z.number().int().min(1).max(100),
    /**
     * Bảng xếp hạng của lab này. **Mặc định TẮT** (loader áp `false` khi vắng)
     * — bật là lựa chọn tường minh của người tạo lab, không phải mặc định của
     * nền tảng. Luật 1 ở dạng mạnh: thứ không được bật thì truy vấn xếp hạng
     * từ chối ngay, không cần lọc.
     */
    leaderboard: z.boolean(),
  })
  .strict();
export type Lab = z.infer<typeof labSchema>;

/** Bản rút gọn cho trang danh sách `/labs` — không kèm nội dung/verify script. */
export const labSummarySchema = labSchema
  .pick({
    id: true,
    title: true,
    description: true,
    difficulty: true,
    estimatedMinutes: true,
    tier: true,
    capabilities: true,
    passThresholdPercent: true,
    leaderboard: true,
  })
  .extend({ taskCount: z.number().int().positive() })
  .strict();
export type LabSummary = z.infer<typeof labSummarySchema>;

export function toLabSummary(lab: Lab): LabSummary {
  return {
    id: lab.id,
    title: lab.title,
    description: lab.description,
    difficulty: lab.difficulty,
    estimatedMinutes: lab.estimatedMinutes,
    tier: lab.tier,
    capabilities: lab.capabilities,
    passThresholdPercent: lab.passThresholdPercent,
    leaderboard: lab.leaderboard,
    taskCount: lab.tasks.length,
  };
}

/**
 * Một lượt chấm ĐÃ LƯU của một task.
 *
 * ⛔ KHÔNG có `passed` — nó suy được 100% từ `exitCode === 0` (hợp đồng
 * `ScriptOutcome` của `apps/web/src/server/lessons/validate.ts`). Lưu cả hai là
 * dựng hai nguồn sự thật cho cùng một sự kiện, và chúng lệch ở lần đầu tiên ai
 * đó sửa quy ước exit code.
 *
 * ⛔ KHÔNG có `attemptNo` — nó là "số dòng trước đó của cùng (attempt, task)
 * cộng một". Đếm ở chỗ dùng.
 *
 * ✅ CÓ `exitCode`/`output`/`checkedAt` — không cái nào tính được từ cái khác.
 *
 * Một dòng ở đây LUÔN là một phán quyết chấm bài thật: lỗi hạ tầng (script
 * hỏng / hết hạn / pod chết) NÉM lỗi và không ghi dòng nào — xem
 * `docs/lab-format.md` § "Ba ca lỗi".
 */
export const labTaskResultSchema = z
  .object({
    taskId: labTaskIdSchema,
    exitCode: z.number().int(),
    /** Đã cắt cỡ ở server trước khi lưu. */
    output: z.string(),
    checkedAt: z.date(),
  })
  .strict();
export type LabTaskResult = z.infer<typeof labTaskResultSchema>;

/**
 * Điểm của một lần thử — **tính**, không lưu.
 *
 * `percent` làm tròn XUỐNG: một lab mốc 80% mà người học đạt 79.6% thì hiện
 * "79%" và trượt, chứ không hiện "80%" rồi vẫn trượt.
 */
export const labScoreSchema = z
  .object({
    earnedWeight: z.number().int().min(0),
    totalWeight: z.number().int().positive(),
    percent: z.number().int().min(0).max(100),
    passedTaskIds: z.array(labTaskIdSchema),
  })
  .strict();
export type LabScore = z.infer<typeof labScoreSchema>;

export const LAB_ATTEMPT_STATUSES = ['in_progress', 'passed', 'failed'] as const;
export type LabAttemptStatus = (typeof LAB_ATTEMPT_STATUSES)[number];

/**
 * Một lần thử — hình dạng TRẢ VỀ (không phải hình dạng bảng).
 *
 * `status`, `score`, `durationSeconds` đều là field TÍNH ở tầng này; bảng
 * `lab_attempts` không có cột nào trong ba cái đó.
 */
export const labAttemptSchema = z
  .object({
    id: z.string().min(1),
    labId: scenarioIdSchema,
    sessionId: z.string().min(1),
    startedAt: z.date(),
    submittedAt: z.date().nullable(),
    /** Người học tự chọn; mặc định `false` (ẩn danh) — xem `labSchema.leaderboard`. */
    displayNamePublic: z.boolean(),
    results: z.array(labTaskResultSchema),
  })
  .strict();
export type LabAttempt = z.infer<typeof labAttemptSchema>;

/**
 * Một dòng bảng xếp hạng.
 *
 * ⛔ KHÔNG có `email`, KHÔNG có `userId`. `displayName` là `null` khi người học
 * chọn ẩn danh — và ẩn danh là MẶC ĐỊNH, nên "quên set" cũng không rò tên.
 */
export const labLeaderboardRowSchema = z
  .object({
    rank: z.number().int().positive(),
    displayName: z.string().nullable(),
    percent: z.number().int().min(0).max(100),
    durationSeconds: z.number().int().min(0),
    submittedAt: z.date(),
    /** `true` khi dòng này là của chính người đang xem. */
    isSelf: z.boolean(),
  })
  .strict();
export type LabLeaderboardRow = z.infer<typeof labLeaderboardRowSchema>;

// Re-export để tầng khác không phải import chéo scenario.ts chỉ vì một enum.
export { SCENARIO_DIFFICULTIES, SANDBOX_TIER_NAMES, SCENARIO_CAPABILITIES, scenarioIdSchema };
