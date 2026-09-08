import { z } from 'zod';
import {
  PROBLEM_DIFFICULTIES,
  PROBLEM_ORDER_KEYS,
  PROBLEM_STATES,
  PROBLEM_TOPICS,
  type ProblemFilter,
  type ProblemListOptions,
  type ProblemOrderKey,
} from '@devops-platform/games';
import { listInputSchema } from '../trpc/init';
import { problemCodeSchema, tagSchema, toContractShape } from './validate';

/**
 * Hình dạng INPUT của các thủ tục ĐỌC.
 *
 * Tách khỏi `validate.ts` vì hai bộ schema gác hai thứ khác nhau: bên kia gác dữ
 * liệu GHI XUỐNG (một field lọt qua đó là một dòng hỏng nằm lại trong DB), còn
 * đây gác tham số ĐỌC (một field lọt qua chỉ làm một truy vấn sai, sửa xong là
 * hết). Gộp lại thì cả hai cùng mang mức nghiêm ngặt của bên nghiêm ngặt hơn, và
 * người sửa sau không đọc ra được cái nào đang bảo vệ cái gì.
 */

/** Bộ lọc của hợp đồng. Không mở rộng thêm khoá nào — `ProblemFilter` là SSOT. */
export const problemFilterSchema = z
  .object({
    difficulty: z.array(z.enum(PROBLEM_DIFFICULTIES)).readonly().optional(),
    topics: z.array(z.enum(PROBLEM_TOPICS)).readonly().optional(),
    tags: z.array(tagSchema).readonly().optional(),
    state: z.array(z.enum(PROBLEM_STATES)).readonly().optional(),
    query: z.string().max(200).optional(),
    viewerStatus: z.array(z.enum(['solved', 'attempted', 'untouched'])).readonly().optional(),
  })
  .strict();

export const problemOrderKeySchema = z.enum(PROBLEM_ORDER_KEYS);

/** Bộ lọc đã chuẩn hoá về `ProblemFilter` — cùng lý do như `toContractShape`. */
export const problemFilterInput = problemFilterSchema.transform((parsed) =>
  toContractShape<ProblemFilter>(parsed),
);

export const codeInput = z.object({ code: problemCodeSchema }).strict();

/**
 * `listInputSchema` cho `limit` (luật 4: bị ÉP về ≤ 100, không bị từ chối), cộng
 * ba field của hợp đồng. `.strict()` kế thừa từ nó — field lạ bị 400 chứ không
 * bị nhận-rồi-bỏ-qua.
 */
export const listProblemsInput = listInputSchema.extend({
  filter: problemFilterInput.optional(),
  orderBy: problemOrderKeySchema.optional(),
  direction: z.enum(['asc', 'desc']).optional(),
  /**
   * Ghi đè `cursor` của `listInputSchema` để NHẬN `null`.
   *
   * Hợp đồng khai `ProblemListOptions.cursor?: string | null`, và `ProblemPage`
   * trả `nextCursor: string | null` — nên cách dùng tự nhiên nhất là lấy
   * `nextCursor` rồi đưa thẳng lại vào lần gọi sau. Với `z.string().optional()`
   * thì vòng đó ĐỎ, và thông báo lỗi không hề nói ra rằng validator hẹp hơn hợp
   * đồng; lane E đo được đúng chỗ này (2026-09-08) và đã phải tự thu hẹp kiểu
   * phía họ. Sửa ở đây thì không ai phải làm vậy nữa.
   */
  cursor: z.string().nullish(),
});

/**
 * Input đã phân tích → `ProblemListOptions` của hợp đồng.
 *
 * Phải dựng bằng spread có điều kiện chứ không gán thẳng: dưới
 * `exactOptionalPropertyTypes: true`, `filter?: ProblemFilter` nghĩa là "vắng
 * mặt, hoặc là một `ProblemFilter`" — KHÔNG được có mặt với giá trị `undefined`.
 * Mà `.optional()` của Zod sinh ra đúng hình dạng bị cấm đó. Bốn dòng spread này
 * là chỗ hai quy ước gặp nhau, và chúng ở đây một lần thay vì rải ra hai
 * procedure.
 *
 * `null` của `cursor` thì ĐI QUA nguyên vẹn — hợp đồng cho phép, và
 * `listProblems` đọc `null` đúng nghĩa "trang đầu".
 */
export function toListOptions(input: {
  readonly filter?: ProblemFilter | undefined;
  readonly orderBy?: ProblemOrderKey | undefined;
  readonly direction?: 'asc' | 'desc' | undefined;
  readonly limit: number;
  readonly cursor?: string | null | undefined;
}): ProblemListOptions {
  return {
    limit: input.limit,
    ...(input.filter !== undefined ? { filter: input.filter } : {}),
    ...(input.orderBy !== undefined ? { orderBy: input.orderBy } : {}),
    ...(input.direction !== undefined ? { direction: input.direction } : {}),
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  };
}
