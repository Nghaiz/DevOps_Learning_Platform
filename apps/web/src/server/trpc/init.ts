import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { z, ZodError } from 'zod';
import { getAuth } from '../auth/config';
import { getDb, type Database } from '../db/client';
import { checkRateLimit, RATE_LIMIT_WINDOW_MS } from '../security/rate-limit';

export interface AuthedUser {
  id: string;
  role: 'user' | 'admin' | 'author';
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
  // Fail-closed: role lạ → 'user'. Đây là chỗ P9 thêm `author`, và nó PHẢI
  // được thêm ở đây chứ không chỉ ở pgEnum: một tác giả thật mà map về `user`
  // sẽ bị `authorProcedure` từ chối, và triệu chứng ("tôi là author nhưng không
  // soạn được bài") không trỏ về dòng này. Allowlist tường minh thay vì một
  // chuỗi ternary dài — thêm role thứ tư chỉ là thêm một phần tử.
  const user: AuthedUser | null = session === null ? null : { id: session.user.id, role: toRole(session.user) };
  return { db: getDb(), user, reqHeaders: opts.req.headers, resHeaders: opts.resHeaders };
}

const KNOWN_ROLES: readonly AuthedUser['role'][] = ['user', 'admin', 'author'];

function toRole(user: { role?: unknown }): AuthedUser['role'] {
  const raw = user.role;
  return KNOWN_ROLES.find((known) => known === raw) ?? 'user';
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
 * Chỉ `author` và `admin` — cổng của MỌI procedure soạn bài (P9 9.A task 2).
 *
 * ⚠ Đây là cổng THỨ NHẤT, không phải cổng duy nhất. Nó chỉ trả lời "người này
 * có được soạn bài nói chung không"; câu hỏi "bài NÀY có phải của họ không" là
 * `assertContentOwner` ở `server/content/authz.ts`, và nó chạy trên MỌI
 * procedure động tới một bài cụ thể. Gộp hai câu hỏi vào một middleware là cách
 * IDOR lọt: `author` nào cũng qua được cổng thứ nhất.
 */
export const authorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'author' && ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Cần quyền soạn bài' });
  }
  return next();
});

/**
 * Chỉ `admin` — cổng của MỌI procedure trong `admin.*` (P13 C4).
 *
 * KHÔNG có nấc trung gian nào giữa `user`/`author` và `admin` ở đây — khác
 * `authorProcedure` (cho cả `author` LẪN `admin` qua), quản trị là một quyền
 * RIÊNG, không phải một cấp cao hơn `author` trên cùng một thang. Một tác giả
 * KHÔNG tự động thấy được `admin.users.list`.
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Cần quyền quản trị' });
  }
  return next();
});

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

/**
 * Danh sách CHƯA có phân trang cursor — `limit` giữ nguyên luật 4, nhưng
 * `cursor` bị **TỪ CHỐI** (400 `unrecognized_keys` nhờ `.strict()` mà `.omit()`
 * giữ lại), không phải nhận-rồi-bỏ-qua.
 *
 * ⛔ Vì sao từ chối chứ không im lặng: một procedure NHẬN `cursor` rồi PHỚT LỜ
 * nó trả về TRANG 1 mãi mãi. Client phân trang thấy một trang hợp lệ, không lỗi,
 * không dấu hiệu — rồi hoặc dừng sớm (mất dữ liệu) hoặc nối trang 1 vào cuối
 * danh sách và lặp vô hạn. Đó đúng là chế độ hỏng mà luật `green-that-proves-
 * nothing` đặt tên: một câu trả lời không thể đỏ. Một 400 thì ồn ào và sửa được
 * ngay ở lần gọi đầu tiên.
 *
 * Đây KHÔNG phải "bỏ phân trang": C4 (phase-13) liệt kê ĐÍCH DANH những
 * procedure phải có `nextCursor` thật (`me.listProgress`, `paths.list`,
 * `quiz.list`, `me.listLabAttempts`, `me.listQuizAttempts`) và tất cả đã có.
 * Những procedure dùng schema này nằm NGOÀI danh sách đó; khi một trong số
 * chúng cần phân trang thật, đổi lại `listInputSchema` và hiện thực keyset —
 * đừng chỉ mở lại field.
 *
 * ⚠ `paths.mine` còn một lý do riêng: nó LỌC SAU khi DB đã cắt `limit`
 * (`passedCount > 0 && < itemCount`), nên một keyset ở tầng SQL sẽ sinh những
 * trang vơi bất định. Phân trang đúng cho nó là một quyết định thiết kế, không
 * phải một dòng `gt()`.
 */
export const noCursorListInputSchema = listInputSchema.omit({ cursor: true });

/**
 * Cursor trỏ vào một bảng có khoá chính `uuid` — PHẢI qua đây trước khi vào
 * `eq(col, cursor)`.
 *
 * ⛔ ĐÃ ĐO, không phải phòng xa: `cursor` là chuỗi do CLIENT gửi, và Postgres
 * từ chối một chuỗi không phải uuid ngay ở tầng kiểu (`22P02 invalid input
 * syntax for type uuid`) — tức truy vấn NÉM thay vì trả 0 dòng. Hệ quả có hai
 * vế, cả hai đều tệ hơn "cursor sai":
 *
 *  1. **500 thay vì 400.** Một input hỏng của client đọc ra như một sự cố máy
 *     chủ; nó vào log lỗi, vào cảnh báo, và không nói cho ai biết phải sửa gì.
 *  2. **Rò truy vấn ra trình duyệt.** `errorFormatter` không xoá `message`, nên
 *     `TRPCError.message` của lỗi Drizzle — nguyên văn câu SQL kèm `params`,
 *     trong đó có `user_id` của người gọi — đi thẳng vào response.
 *
 * Trả về cùng lỗi mà một cursor KHÔNG TỒN TẠI nhận được (`BAD_REQUEST` +
 * "Cursor không còn hợp lệ"): với người gọi, "cursor sai định dạng" và "cursor
 * đã biến mất" là cùng một việc phải làm — bắt đầu lại từ trang đầu.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuidCursor(cursor: string): string {
  if (!UUID_RE.test(cursor)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
  }
  return cursor;
}
