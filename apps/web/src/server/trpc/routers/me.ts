import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { progress, users } from '../../db/schema';
import { createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

export const meRouter = createTRPCRouter({
  /** Luôn chỉ đọc resource của CHÍNH ctx.user — không nhận userId từ input. */
  get: protectedProcedure.input(z.object({}).strict()).query(async ({ ctx }) => {
    const [row] = await ctx.db.select().from(users).where(eq(users.id, ctx.user.id)).limit(1);
    if (!row) {
      // Session hợp lệ nhưng user đã bị xoá khỏi DB — không nên xảy ra, nhưng
      // errors-over-silent-fallbacks: báo rõ thay vì trả undefined im lặng.
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User của session không còn tồn tại' });
    }
    return { id: row.id, name: row.name, email: row.email, role: row.role };
  }),

  /** Luật 4 — dùng listInputSchema dùng chung, limit bị ép về ≤100. */
  listProgress: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(progress)
      .where(eq(progress.userId, ctx.user.id))
      .orderBy(desc(progress.createdAt))
      .limit(input.limit);
    return { items: rows, limit: input.limit };
  }),
});
