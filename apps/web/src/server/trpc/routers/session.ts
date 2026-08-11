import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { SandboxTier, type Session } from '@devops-platform/shared-types';
import { sessionsAudit } from '../../db/schema';
import { mintAccessTokenFor, mintSandboxTokenFor } from '../../auth/jwt';
import { callOrchestrator, orchestratorClient } from '../../grpc/orchestrator-client';
import { assertOwnerOrAdmin, createTRPCRouter, listInputSchema, protectedProcedure } from '../init';

/**
 * `session.*` gọi thẳng services/orchestrator qua gRPC (proto/orchestrator/v1) —
 * mọi RPC ở P0 trả `Unimplemented` một cách CÓ CHỦ Ý (xem services/orchestrator).
 * Điều tRPC phải chứng minh ở đây KHÔNG PHẢI "session hoạt động" mà là: (1) luật 1 —
 * authz object-level chặn TRƯỚC KHI gói tin rời BFF, (2) lỗi gRPC nổi lên thành
 * TRPCError sạch, không rò kiểu nội bộ connect-node ra ngoài.
 */

const sandboxTierInput = z.nativeEnum(SandboxTier);

const createInput = z
  .object({
    userId: z.string().min(1),
    tier: sandboxTierInput,
    ttlSeconds: z.number().int().min(0).default(0),
    // Khớp CHÍNH XÁC validator của `rediskeys.Idem` (docs/redis-key-namespace.md
    // — cùng regex ở cả hai bản song sinh Go/TS). `.min(1)` trần cho qua `a:ws`,
    // `a{dlp}b`, chuỗi 500 ký tự — orchestrator mới từ chối, và trả `Internal`
    // thay vì `InvalidArgument` ở biên gần client nhất.
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, 'idempotencyKey chỉ nhận [A-Za-z0-9_-], tối đa 64 ký tự'),
  })
  .strict();

const claimInput = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) }).strict();

const getInput = z.object({ sessionId: z.string().min(1), userId: z.string().min(1) }).strict();

const extendInput = z
  .object({
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    // 0 = dùng idle-window mặc định của server (`EXTEND_DEFAULT`), đúng nghĩa
    // proto. Trần 2h khớp `HARD_CAP` — xin nhiều hơn cũng bị công thức của B5
    // cắt về trần, nên chặn ở biên gần client nhất thay vì để orchestrator từ chối.
    extendSeconds: z.number().int().min(0).max(7200).default(0),
  })
  .strict();

const reapInput = z
  .object({
    sessionId: z.string().min(1),
    reason: z.string().min(1),
    userId: z.string().min(1),
  })
  .strict();

/**
 * ⛔ **`Session` của proto KHÔNG serialize được ra JSON** — và đây là lỗi CÓ SẴN
 * từ P0, chỉ lộ ra ở chặng này vì G12 là thứ đầu tiên gọi `session.*` qua HTTP thật.
 *
 * Ba field là `bigint` (`expiresAt.seconds`, `createdAt.seconds`, `revision: int64`),
 * và `JSON.stringify` **NÉM** trên bigint chứ không bỏ qua. Triệu chứng đo được
 * trên cluster 2026-08-11: `POST /api/trpc/session.create` → **HTTP 500**
 * `"Do not know how to serialize a BigInt"`, sau khi pod ĐÃ được claim — tức
 * người dùng mất một pod khỏi trần quota 4 và nhận về một lỗi 500 vô nghĩa.
 *
 * **Vì sao không test nào bắt được:** `rule-01-authz` và bạn bè gọi qua
 * `appRouter.createCaller`, trả thẳng object JS — không có bước serialize nào.
 * Bằng chứng 1.C-2 thì gọi `CreateSession` bằng gRPC, cũng không qua tRPC. Đường
 * HTTP của `session.*` **chưa từng chạy** cho tới hôm nay. Cùng họ với "job chỉ
 * chạy trên `main` nên file đó không có cổng review" ở 1.E-1: một đường không ai
 * đi thì không ai gác.
 *
 * Vì thế BFF trả một shape của RIÊNG mình thay vì chuyển tiếp message proto:
 * `Timestamp` → chuỗi ISO-8601 (thứ `new Date()` phía FE đọc thẳng được, và F9
 * cần cho đồng hồ đếm ngược), `revision` → number. Kèm lợi ích thứ hai: `$typeName`
 * và các field nội bộ của connect-es không còn rò ra trình duyệt.
 */
export interface JsonSession {
  id: string;
  userId: string;
  status: number;
  podName: string;
  namespace: string;
  tier: number;
  createdAt: string | null;
  expiresAt: string | null;
  revision: number;
}

function tsToIso(ts: { seconds: bigint; nanos: number } | undefined): string | null {
  if (ts === undefined) {
    return null;
  }
  return new Date(Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1_000_000)).toISOString();
}

function toJsonSession(session: Session | undefined): JsonSession | null {
  if (session === undefined) {
    return null;
  }
  return {
    id: session.id,
    userId: session.userId,
    status: session.status,
    podName: session.podName,
    namespace: session.namespace,
    tier: session.tier,
    createdAt: tsToIso(session.createdAt),
    expiresAt: tsToIso(session.expiresAt),
    // int64 → number: revision là bộ đếm INCR trên một session, thực tế đếm hàng
    // chục. Vượt 2^53 nghĩa là đã có 9e15 lần ghi trên MỘT session — không phải
    // chế độ hỏng đáng phòng, và `string` sẽ bắt FE tự parse mà không được gì.
    revision: Number(session.revision),
  };
}

/** Đính JWT (aud=orchestrator, xem server/auth/jwt.ts) vào metadata gRPC. */
async function callHeaders(userId: string, role: string): Promise<HeadersInit> {
  const token = await mintAccessTokenFor(userId, role);
  return { authorization: `Bearer ${token}` };
}

/**
 * Thuộc tính cookie sandbox — SSOT: `docs/ws-terminal-protocol.md` §2.
 *
 * `Path=/ws` thu hẹp cookie xuống ĐÚNG đường handshake: mọi request tới `/`,
 * `/api/*`, `/session` đều KHÔNG mang nó, nên một lỗ rò header ở route khác không
 * làm lộ token mở shell.
 *
 * `Secure` KHÔNG rẽ nhánh theo NODE_ENV (khác cookie phiên của Better Auth, vốn
 * để plugin tự quyết): `.env.example` đã chốt điều này và ghi kèm bẫy của nó —
 * trình duyệt chấp nhận cookie `Secure` trên HTTP khi host là `localhost` (secure
 * context), nên dev qua `http://localhost:8080` (proxy Caddy gộp origin) chạy
 * bình thường; đổi sang `http://192.168.x.x:8080` thì Set-Cookie bị **bỏ qua
 * trong im lặng** và mọi handshake trả 401 mà không thông báo gì. Một nhánh
 * `NODE_ENV` ở đây sẽ giấu đúng lớp phòng thủ đó ở lần deploy đầu tiên mà ai đó
 * quên đặt biến.
 *
 * KHÔNG có `Domain` ⇒ host-only, và cùng với `SameSite=Strict` đó là thứ ép
 * gateway phải CÙNG ORIGIN với web (D1) — điều kiện đã dựng sẵn ở 1.B0.4.
 */
const SANDBOX_COOKIE_NAME = 'dlp_sandbox';

function buildSandboxCookie(token: string, maxAgeSeconds: number): string {
  return [
    `${SANDBOX_COOKIE_NAME}=${token}`,
    'Path=/ws',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

/**
 * Mint sandbox token cho session vừa tạo và gắn `Set-Cookie` vào response.
 *
 * **Chỉ mint khi người gọi tạo session CHO CHÍNH MÌNH.** `assertOwnerOrAdmin` cho
 * admin tạo session hộ user khác, và ở nhánh đó cả hai lựa chọn đều sai:
 * `sub=ctx.user.id` sinh ra cookie chết sẵn (gateway bước g so `hash.userId` với
 * `token.sub` → 403) mà lại ĐÈ MẤT cookie session của chính admin; `sub=input.userId`
 * thì phát cho trình duyệt admin một chìa mở thẳng shell của user kia — một quyền
 * KHÁC HẲN quyền "tạo session hộ", và không đi qua bước authz nào của luật 10.
 * Nên: admin tạo hộ thì session vẫn được tạo, cookie thì không. Chủ nhân thật sự
 * mở `/session` của mình và nhận cookie ở lượt create của chính họ.
 *
 * Thiếu `session`/`expiresAt` ⇒ NÉM, không bỏ qua im lặng: đó là vi phạm contract
 * của orchestrator, và một cookie vắng mặt sẽ hiện ra ở tận trình duyệt dưới dạng
 * "401 khi mở terminal" — cách nguyên nhân ba thành phần. Ném ở đây KHÔNG rò pod:
 * `idempotencyKey` là bắt buộc trong `createInput`, nên lượt retry trả về ĐÚNG
 * session cũ thay vì claim thêm một pod nữa khỏi trần quota 4.
 */
async function attachSandboxCookie(
  ctx: { user: { id: string }; resHeaders: Headers },
  ownerUserId: string,
  session: { id?: string; expiresAt?: { seconds: bigint } | undefined } | undefined,
): Promise<void> {
  if (ctx.user.id !== ownerUserId) {
    return;
  }
  const sessionId = session?.id;
  const expiresAt = session?.expiresAt;
  if (sessionId === undefined || sessionId === '' || expiresAt === undefined) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message:
        'orchestrator trả session thiếu id/expires_at — không mint được sandbox token (contract proto/orchestrator/v1)',
    });
  }

  // Một mốc `now` duy nhất cho cả hai phép tính: mint kiểm `exp > now` rồi cookie
  // tính `Max-Age = exp - now`. Đọc đồng hồ hai lần thì hai con số lệch nhau vài
  // ms, và đúng ở biên (`exp == now + 1`) sinh ra `Max-Age=0` — cookie bị xoá ngay
  // khi vừa đặt, trong khi token thì hợp lệ. Một lần đọc, không có cửa sổ đó.
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = Number(expiresAt.seconds);
  const token = await mintSandboxTokenFor(ownerUserId, sessionId, expiresAtSeconds);
  ctx.resHeaders.append('Set-Cookie', buildSandboxCookie(token, expiresAtSeconds - nowSeconds));
}

export const sessionRouter = createTRPCRouter({
  /**
   * G12 — điểm DUY NHẤT phát sandbox token. Không phải `claim`/`get`: token mang
   * đúng một `sid` và dùng lại được suốt TTL (contract §2), nên reconnect không
   * cần token mới và mint thêm chỗ nữa chỉ là thêm đường để lệch.
   *
   * Đánh đổi đã biết: tạo session THỨ HAI sẽ ghi đè cookie của session thứ nhất
   * (cùng tên `dlp_sandbox`, cùng `Path=/ws`), nên tab cũ mất quyền mở WS. Đó là
   * hệ quả trực tiếp của "một cookie ⇒ một sid", và nó khớp D17 (một session chỉ
   * cho một WS sống): P1 cố ý KHÔNG hỗ trợ hai phiên lab song song trên một
   * trình duyệt. Ngày cần, đường đúng là đặt tên cookie theo sid — không phải
   * nới trần D17.
   */
  create: protectedProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().createSession(
        {
          userId: input.userId,
          tier: input.tier,
          ttlSeconds: input.ttlSeconds,
          idempotencyKey: input.idempotencyKey,
        },
        { headers },
      ),
    );
    await attachSandboxCookie(ctx, input.userId, response.session);
    return { session: toJsonSession(response.session) };
  }),

  claim: protectedProcedure.input(claimInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().claimSession(
        { sessionId: input.sessionId, userId: input.userId },
        { headers },
      ),
    );
    return { session: toJsonSession(response.session) };
  }),

  /** Luật 1 — kiểm chuẩn: user A gọi get với userId=B (không phải chính mình) → 403. */
  get: protectedProcedure.input(getInput).query(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().getSession(
        { sessionId: input.sessionId, userId: input.userId },
        { headers },
      ),
    );
    return { session: toJsonSession(response.session) };
  }),

  /**
   * F9 — nút "Gia hạn" của trang `/session`.
   *
   * **Vì sao vẫn cần dù 1.C-3 đã tự gia hạn theo traffic:** contract §8 chốt
   * rằng CHỈ stdin/stdout thật mới đẩy `ExtendSession` — ping/pong và `resize`
   * cố tình không tính, để một tab bỏ quên không giữ pod tới trần cứng. Hệ quả
   * đúng-nhưng-khó-chịu: sinh viên đang ĐỌC tài liệu bên cửa sổ khác, không gõ
   * gì trong 55 phút, mất phiên dù đang ngồi ngay đó. Một cú bấm là bằng chứng
   * có người — thứ mà ping/pong không bao giờ là.
   *
   * `expectedRevision: 0` (bỏ qua optimistic lock) là ĐÚNG ở đây, không phải
   * đường tắt: FE không đọc-rồi-ghi, nó chỉ xin đẩy hạn, và công thức của B5
   * (`max(current, min(now + extend, createdAt + HARD_CAP))`) chỉ tiến không lùi
   * — nên không có ca "ghi đè mất thay đổi của người khác" để mà chặn. Gác
   * revision ở đây chỉ tạo ra `FailedPrecondition` giả mỗi khi gateway vừa tự
   * gia hạn xong trước cú bấm vài ms.
   */
  extend: protectedProcedure.input(extendInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().extendSession(
        {
          sessionId: input.sessionId,
          userId: input.userId,
          extendSeconds: input.extendSeconds,
          // `BigInt(0)` chứ không phải literal `0n`: tsconfig của apps/web target
          // ES2017 (cùng lý do đã ghi ở security/sandbox-token-cookie.test.ts).
          expectedRevision: BigInt(0),
        },
        { headers },
      ),
    );
    return {
      session: toJsonSession(response.session),
      hardCapReached: response.hardCapReached,
    };
  }),

  reap: protectedProcedure.input(reapInput).mutation(async ({ ctx, input }) => {
    assertOwnerOrAdmin(ctx, input.userId);
    const headers = await callHeaders(ctx.user.id, ctx.user.role);
    const response = await callOrchestrator(() =>
      orchestratorClient().reapSession(
        {
          sessionId: input.sessionId,
          reason: input.reason,
          actor: { case: 'userId', value: input.userId },
        },
        { headers },
      ),
    );
    return { session: toJsonSession(response.session) };
  }),

  /**
   * KHÔNG có RPC gRPC tương ứng ở proto v0 — lịch sử audit đọc thẳng Postgres
   * (sessions_audit, 0.C). Luôn lọc theo chính ctx.user.id (không nhận userId từ
   * input) nên không cần assertOwnerOrAdmin ở đây. Luật 4: limit ép về ≤100.
   */
  history: protectedProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select()
      .from(sessionsAudit)
      .where(eq(sessionsAudit.userId, ctx.user.id))
      .orderBy(desc(sessionsAudit.occurredAt))
      .limit(input.limit);
    return { items: rows, limit: input.limit };
  }),
});
