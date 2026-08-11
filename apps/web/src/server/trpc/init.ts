import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { z, ZodError } from 'zod';
import { getAuth } from '../auth/config';
import { getDb, type Database } from '../db/client';
import { checkRateLimit, RATE_LIMIT_WINDOW_MS } from '../security/rate-limit';

export interface AuthedUser {
  id: string;
  role: 'user' | 'admin';
}

export interface TRPCContext {
  db: Database;
  user: AuthedUser | null;
  /** Header gốc của request — session.ts forward nó để mint JWT gọi orchestrator. */
  reqHeaders: Headers;
  /**
   * Header của RESPONSE. Tồn tại cho ĐÚNG một việc ở P1: `session.create` append
   * `Set-Cookie: dlp_sandbox=…` sau khi orchestrator trả session (phase-1 G12).
   *
   * `fetchRequestHandler` tự tạo object này và dựng `Response` từ nó
   * (`@trpc/server@11.18.0` → `dist/adapters/fetch/index.mjs`: `const resHeaders =
   * new Headers()` … `headers: resHeaders`), nên route handler
   * `app/api/trpc/[trpc]/route.ts` KHÔNG cần sửa gì — đó cũng là lý do file đó
   * không nằm trong danh sách ownership của G12.
   *
   * Dùng `append`, không `set`: `Set-Cookie` là header đa-giá-trị, và `set` sẽ
   * lặng lẽ đè cookie do một middleware khác đặt.
   */
  resHeaders: Headers;
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
  return { db: getDb(), user, reqHeaders: opts.req.headers, resHeaders: opts.resHeaders };
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
 * Rate limit PER-USER cho tRPC — chặn pod-bomb: một sinh viên ĐÃ ĐĂNG NHẬP spam
 * `session.create` với chính `userId` của mình (qua được `assertOwnerOrAdmin` vì
 * là chủ resource thật) không được phép cạn tài nguyên cluster ở P1 khi
 * orchestrator bắt đầu sinh pod sandbox thật.
 *
 * Khác `proxy.ts` (khoá theo IP qua `x-forwarded-for`, SKIP hẳn khi
 * `RATE_LIMIT_TRUST_PROXY` tắt vì XFF là header client tự đặt được): ở đây luôn
 * đứng SAU middleware auth phía trên nên đã có `ctx.user.id` — danh tính thật từ
 * session cookie Better Auth, không phụ thuộc header có thể giả mạo. Vì vậy limit
 * này không hề bị vô hiệu bởi cùng lỗ hổng XFF khiến proxy IP phải skip.
 *
 * Khoá theo `(type, userId)` — CỐ Ý không thêm tên procedure vào key:
 * create/claim/reap đều tốn tài nguyên cluster tương đương (đều gọi orchestrator
 * thao tác pod), tách quota theo procedure sẽ cho phép cộng dồn N×limit thay vì
 * một hạn mức thật. Mutation quota chặt hơn query — query chỉ đọc, mutation ở P1
 * tạo pod thật.
 *
 * Giới hạn còn lại: in-memory per-process (dùng chung `checkRateLimit` với
 * `proxy.ts` — SSOT, xem `server/security/rate-limit.ts`), nên nhiều pod web
 * = mỗi pod một bucket riêng, hạn mức thật ở nhiều-instance sẽ RỘNG HƠN con số
 * khai báo (N pod × limit). Đủ cho P0/P1 một replica; hướng đi khi cần chặt ở
 * nhiều instance là bucket dùng chung qua Redis (đã có `ioredis` +
 * `packages/shared-types/src/redis-keys.ts` làm SSOT namespace key) — CHƯA tự ý
 * implement ở đây (YAGNI, ngoài phạm vi task này).
 */
export const TRPC_QUERY_LIMIT_PER_MIN = 120;
export const TRPC_MUTATION_LIMIT_PER_MIN = 20;

/**
 * Luật 1 — object-level authz: BẤT KỲ procedure nào thao tác trên resource của một
 * user cụ thể phải đi qua `protectedProcedure`, rồi tự so `input`'s owner field với
 * `ctx.user` (helper `assertOwnerOrAdmin` bên dưới). Middleware này chỉ đảm bảo có
 * user đăng nhập — KHÔNG tự suy ra resource nào thuộc về ai, vì input schema khác
 * nhau giữa các router.
 */
export const protectedProcedure = t.procedure
  .use(({ ctx, next }) => {
    if (ctx.user === null) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  })
  .use(({ ctx, type, next }) => {
    const maxRequests = type === 'mutation' ? TRPC_MUTATION_LIMIT_PER_MIN : TRPC_QUERY_LIMIT_PER_MIN;
    const key = `trpc:${type}:${ctx.user.id}`;
    if (!checkRateLimit(key, Date.now(), RATE_LIMIT_WINDOW_MS, maxRequests)) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Quá nhiều request — thử lại sau' });
    }
    return next();
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
