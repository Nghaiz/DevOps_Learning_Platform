import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { z, ZodError } from 'zod';
import { getAuth } from '../auth/config';
import { getDb, type Database } from '../db/client';

export interface AuthedUser {
  id: string;
  role: 'user' | 'admin';
}

export interface TRPCContext {
  db: Database;
  user: AuthedUser | null;
  /** Header gốc của request — session.ts forward nó để mint JWT gọi orchestrator. */
  reqHeaders: Headers;
}

/**
 * Context tRPC lấy user từ session cookie Better Auth (KHÔNG phải access JWT —
 * JWT chỉ dùng khi BFF gọi ra services/orchestrator qua gRPC, xem
 * server/grpc/orchestrator-client.ts). Cookie sai/hết hạn → `user: null`, không
 * throw ở đây — throw thuộc về middleware `protectedProcedure` bên dưới để
 * `publicProcedure` (nếu có) vẫn dùng context được.
 */
export async function createTRPCContext(opts: FetchCreateContextFnOptions): Promise<TRPCContext> {
  const session = await getAuth().api.getSession({ headers: opts.req.headers });
  // Annotation tường minh: TS widen 'admin'/'user' về string khi ternary lồng
  // trong conditional — annotation giữ literal type. Fail-closed: role lạ → 'user'.
  const user: AuthedUser | null =
    session === null
      ? null
      : { id: session.user.id, role: (session.user as { role?: string }).role === 'admin' ? 'admin' : 'user' };
  return { db: getDb(), user, reqHeaders: opts.req.headers };
}

const t = initTRPC.context<TRPCContext>().create({
  errorFormatter(opts) {
    const { shape, error } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/**
 * Luật 1 — object-level authz: BẤT KỲ procedure nào thao tác trên resource của một
 * user cụ thể phải đi qua `protectedProcedure`, rồi tự so `input`'s owner field với
 * `ctx.user` (helper `assertOwnerOrAdmin` bên dưới). Middleware này chỉ đảm bảo có
 * user đăng nhập — KHÔNG tự suy ra resource nào thuộc về ai, vì input schema khác
 * nhau giữa các router.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.user === null) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Luật 1 helper — gọi ngay đầu mỗi procedure có input mang `userId` của resource.
 * Admin bỏ qua kiểm tra (quản trị được xem/thao tác resource của người khác).
 */
export function assertOwnerOrAdmin(ctx: { user: AuthedUser }, ownerId: string): void {
  if (ctx.user.role === 'admin') {
    return;
  }
  if (ctx.user.id !== ownerId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Không có quyền trên resource này' });
  }
}

/**
 * Luật 4 — schema list-input dùng chung: `limit` bị ÉP về ≤ MAX_LIST_LIMIT thay vì
 * bị reject, đúng nghĩa "ép về" trong acceptance criteria (không phải "từ chối").
 * `.strict()` (luật 3) — field lạ bị reject 400.
 */
export const MAX_LIST_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 20;

export const listInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_LIST_LIMIT)
      .transform((value) => Math.min(value, MAX_LIST_LIMIT)),
    cursor: z.string().optional(),
  })
  .strict();
