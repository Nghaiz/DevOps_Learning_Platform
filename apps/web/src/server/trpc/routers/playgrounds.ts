import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { InvalidCursorError } from '@devops-platform/scenario';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_CAPABILITIES,
  scenarioIdSchema,
} from '@devops-platform/shared-types/scenario';
import { unsupportedCapabilities } from '../../lessons/catalog';
import { playgroundSource, requirePlayground } from '../../labs/catalog';
import { createSandboxSession } from '../../labs/session';
import { applySessionPreferences } from '../../sessions/preferences';
import { createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

/**
 * `playgrounds.*` — trụ cột ② (P8 8.E). Contract §4.
 *
 * Playground là sandbox TRỐNG: không task, không bảng, không tiến độ để mất.
 * `start` chỉ mở một sandbox và trả `sessionId` + `ttlSeconds` — không ghi
 * DÒNG nào (khác `labs.startAttempt`, cố ý — contract §4 "Không lưu tiến độ,
 * không bảng nào").
 */

const IDEMPOTENCY_KEY_SCHEMA = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'idempotencyKey chỉ nhận [A-Za-z0-9_-], tối đa 64 ký tự');

const getInput = z.object({ playgroundId: scenarioIdSchema }).strict();
const startInput = z
  .object({ playgroundId: scenarioIdSchema, idempotencyKey: IDEMPOTENCY_KEY_SCHEMA })
  .strict();

/**
 * D9 (phase-13) — bộ lọc SERVER. Chỉ nhận những gì playground THẬT SỰ CÓ.
 *
 * ⛔ **`difficulty` đã bị GỠ (2026-09-06), và không được thêm lại.** Bản trước
 * nhận nó rồi bỏ qua, với lý do "để form lọc dùng chung component với hai trang
 * kia không phải rẽ nhánh". Đó là đổi một lời nói dối trong API lấy một câu
 * `if` ở một component. Một tham số server NHẬN rồi PHỚT LỜ là đúng chế độ hỏng
 * mà `noCursorListInputSchema` đã đặt tên và từ chối: câu trả lời trông hợp lệ,
 * không lỗi, không dấu hiệu — người dùng chọn "Nâng cao" và nhận lại nguyên
 * danh sách cũ, rồi kết luận là bộ lọc hỏng chứ không phải không áp dụng được.
 *
 * `.strict()` biến nó thành 400 `unrecognized_keys`, đúng cách `paths.list` và
 * `quiz.list` từ chối bộ lọc chúng không đáp ứng được. `PlaygroundSummary`
 * không có độ khó (`playgroundSchema` cố ý không có — không có bài để khó/dễ),
 * nên ở đây không có "ý nghĩa thật" nào để gán cho tham số này.
 *
 * ⚠ Hệ quả cho FE (lane C): `/playgrounds` KHÔNG được gửi `difficulty` — hôm
 * nay nó không gửi (`playgrounds-client.tsx` truyền `fields={['tier']}`), nên
 * thay đổi này không phá màn hình nào. Nó CÓ phá `catalog-input.test.ts`, chỗ
 * `playgrounds.list` còn nằm trong nhóm `FILTERABLE` — xem report.
 *
 * ⛔ Cũng KHÔNG có `orderBy`, cùng một lý lẽ: playground không có độ khó lẫn
 * thời lượng, nên hai thứ tự server hỗ trợ đều vô nghĩa với nó. Thứ tự duy nhất
 * nó có là `id` — thứ đã là mặc định, không cần một tham số để nói ra.
 */
const listPlaygroundsInput = listInputSchema
  .extend({
    tier: z.enum(SANDBOX_TIER_NAMES).optional(),
    capability: z.enum(SCENARIO_CAPABILITIES).optional(),
  })
  .strict();

export const playgroundsRouter = createTRPCRouter({
  /**
   * Danh sách playground cho trang `/playgrounds`. Luật 4: `limit` bị ÉP về
   * ≤100.
   *
   * D9 (phase-13) — cùng khuôn `lessons.list`.
   */
  list: protectedProcedure.input(listPlaygroundsInput).query(async ({ input }) => {
    try {
      const result = await playgroundSource().listPlaygroundsPage({
        limit: input.limit,
        cursor: input.cursor,
        filter: { tier: input.tier, capability: input.capability },
      });
      return { items: result.items, limit: input.limit, nextCursor: result.nextCursor };
    } catch (cause) {
      if (cause instanceof InvalidCursorError) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ', cause });
      }
      throw cause;
    }
  }),

  /** Nội dung đầy đủ một playground. */
  get: protectedProcedure.input(getInput).query(async ({ input }) => {
    const playground = await requirePlayground(input.playgroundId);
    return {
      playground,
      // Playground KHÔNG có `requiresCapabilities` (schema `.pick()` bỏ nó có
      // chủ ý: không có bài nào để đòi ít hơn thứ image cung cấp), nên ở đây
      // `capabilities` ĐÃ là tập hiệu lực.
      unsupportedCapabilities: unsupportedCapabilities(playground.capabilities),
    };
  }),

  /**
   * Mở sandbox trống. `ttlSeconds` của NỘI DUNG làm TTL session (kẹp bởi
   * `HARD_CAP` phía orchestrator) — TTL là dữ liệu của playground vì AC 8.E đòi
   * nó hiện trên UI TRƯỚC khi người dùng bắt đầu, không phải một hằng số chôn
   * ở server.
   */
  start: protectedProcedure.input(startInput).mutation(async ({ ctx, input }) => {
    const playground = await requirePlayground(input.playgroundId);
    const { session } = await createSandboxSession(ctx, {
      tier: playground.tier,
      ttlSeconds: playground.ttlSeconds,
      idempotencyKey: input.idempotencyKey,
      capabilities: playground.capabilities,
    });
    const { preferencesApplied } = await applySessionPreferences(ctx, session);
    return { sessionId: session.id, ttlSeconds: playground.ttlSeconds, preferencesApplied };
  }),
});
