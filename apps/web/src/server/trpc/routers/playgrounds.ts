import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { scenarioIdSchema } from '@devops-platform/shared-types/scenario';
import { unsupportedCapabilities } from '../../lessons/catalog';
import { playgroundSource, requirePlayground } from '../../labs/catalog';
import { createSandboxSession } from '../../labs/session';
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

export const playgroundsRouter = createTRPCRouter({
  /** Danh sách playground cho trang `/playgrounds`. Luật 4: `limit` bị ÉP về ≤100. */
  list: protectedProcedure.input(listInputSchema).query(async ({ input }) => {
    const all = await playgroundSource().listPlaygrounds();

    let start = 0;
    if (input.cursor !== undefined) {
      const at = all.findIndex((p) => p.id === input.cursor);
      if (at < 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
      }
      start = at + 1;
    }

    const page = all.slice(start, start + input.limit);
    const next = start + input.limit;
    return {
      items: page,
      limit: input.limit,
      nextCursor: next < all.length ? (page[page.length - 1]?.id ?? null) : null,
    };
  }),

  /** Nội dung đầy đủ một playground. */
  get: protectedProcedure.input(getInput).query(async ({ input }) => {
    const playground = await requirePlayground(input.playgroundId);
    return {
      playground,
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
    });
    return { sessionId: session.id, ttlSeconds: playground.ttlSeconds };
  }),
});
