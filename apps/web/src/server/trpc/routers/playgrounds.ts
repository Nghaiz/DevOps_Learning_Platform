import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { InvalidCursorError } from '@devops-platform/scenario';
import {
  SANDBOX_TIER_NAMES,
  SCENARIO_DIFFICULTIES,
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
 * D9 (phase-13) — bộ lọc SERVER, cùng khuôn `lessons.list`/`labs.list` (đối
 * xứng FE: cả ba trang catalog cùng một bộ điều khiển lọc).
 *
 * ⚠ `difficulty` KHÔNG có tác dụng ở đây: `PlaygroundSummary` không có field
 * đó (`playgroundSchema` cố ý không có độ khó — nó không có bài để khó/dễ).
 * `listPlaygroundsPage` bỏ qua field filter này (xem chú thích ở
 * `ContentSource.listPlaygroundsPage`); giữ ở input để form lọc dùng chung
 * component với hai trang kia không phải rẽ nhánh theo loại nội dung.
 */
const listPlaygroundsInput = listInputSchema
  .extend({
    difficulty: z.enum(SCENARIO_DIFFICULTIES).optional(),
    tier: z.enum(SANDBOX_TIER_NAMES).optional(),
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
        filter: { difficulty: input.difficulty, tier: input.tier },
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
