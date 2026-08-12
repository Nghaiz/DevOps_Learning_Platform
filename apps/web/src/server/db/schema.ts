import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Schema Postgres — Drizzle là owner DUY NHẤT của mọi bảng ở đây.
 *
 * Quy ước 1-owner/bảng (phase-0.md 0.C task 11): Go KHÔNG ghi vào các bảng này.
 * Nếu về sau orchestrator cần bảng riêng, nó sở hữu schema riêng bằng sqlc — không
 * để hai ORM cùng ghi một bảng.
 */

export const userRole = pgEnum('user_role', ['user', 'admin']);

/** Khớp `SandboxTier` trong proto/orchestrator/v1/session.proto (bỏ UNSPECIFIED). */
export const sandboxTier = pgEnum('sandbox_tier', ['sysbox', 'gvisor', 'kata']);

/**
 * Sự kiện trong vòng đời session. Đây là ĐỘNG TỪ (chuyện đã xảy ra), không phải
 * trạng thái hiện tại — xem chú thích của `sessionsAudit`.
 */
export const sessionEvent = pgEnum('session_event', [
  'created',
  'claimed',
  /**
   * Gia hạn. CHỈ ghi khi lần gia hạn đó CHẠM TRẦN CỨNG — xem `Service.Extend`
   * trong services/orchestrator/internal/lifecycle/extend.go.
   *
   * Gia hạn thường là heartbeat (gateway gọi theo nhịp traffic), nên ghi mọi
   * lần sẽ đổ hàng nghìn dòng mỗi phiên và chôn vùi năm sự kiện thật sự đáng
   * đọc. Câu hỏi "phiên còn sống không" đã có `lastActiveAt` trong Redis trả
   * lời; câu hỏi bảng này trả lời là "chuyện gì đã xảy ra với phiên đó".
   */
  'extended',
  'expired',
  'reaped',
  'failed',
]);

/**
 * `users` cố ý mang đúng bộ field lõi mà Better Auth cần (id text, name, email,
 * emailVerified, image, createdAt, updatedAt) cộng thêm `role` của platform.
 * Ở 0.D, Better Auth sẽ trỏ model `user` vào bảng này qua `modelName` thay vì tự
 * sinh bảng thứ hai — tránh phải migrate lại ngay sau khi vừa tạo.
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    role: userRole('role').notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_email_key').on(table.email)],
);

/**
 * Nhật ký sự kiện append-only của session lab. MỘT DÒNG MỖI SỰ KIỆN, không phải
 * một dòng mỗi session.
 *
 * Bản đầu có `status`/`claimed_at`/`reaped_at` trên cùng một dòng — tức là một
 * bản sao trạng thái sống của Redis, đúng thứ mà plan.md §4 (no-derived-fields)
 * cấm: hai nguồn cùng trả lời "session X đang thế nào" thì sớm muộn chúng lệch
 * nhau, và không ai biết bên nào đúng. Ở đây mỗi dòng là một sự thật lịch sử bất
 * biến; trạng thái HIỆN TẠI chỉ Redis trả lời.
 *
 * `user_id` KHÔNG có foreign key và KHÔNG cascade một cách cố ý: audit trail phải
 * sống lâu hơn user. Xoá tài khoản một learner bị ban vì abuse sandbox mà mất luôn
 * bằng chứng thì bảng này vô nghĩa.
 */
export const sessionsAudit = pgTable(
  'sessions_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id').notNull(),
    event: sessionEvent('event').notNull(),
    tier: sandboxTier('tier').notNull(),
    /**
     * Pod GẮN VỚI SỰ KIỆN NÀY, không phải pod hiện tại của session. Một session
     * đi qua nhiều dòng (`created`/`claimed`/`reaped`) và mỗi dòng giữ tên pod
     * đúng tại thời điểm đó.
     *
     * ⚠ Ranh giới dễ bị vượt: `… WHERE session_id=X ORDER BY occurred_at DESC
     * LIMIT 1` sẽ TRÔNG như trả lời được "session X đang ở pod nào". Nó không —
     * nó trả lời "pod của sự kiện gần nhất ĐÃ GHI", và hai câu đó lệch nhau ngay
     * khi reaper xoá pod mà không kịp ghi audit (audit được phép hỏng mà RPC vẫn
     * thành công — chính là AC "tắt Postgres"). Câu hỏi hiện-tại chỉ Redis trả
     * lời; dùng bảng này để trả lời nó là dựng nguồn sự thật thứ hai.
     */
    podName: text('pod_name'),
    namespace: text('namespace'),
    /**
     * Hạn dùng được ĐẶT tại thời điểm sự kiện này (thường là `claimed`). Đây là
     * sự thật lịch sử "lúc claim, TTL được đặt tới X", không phải trạng thái hiện
     * tại — nên không vi phạm no-derived-fields.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Lý do reap, thông điệp lỗi, tên component gọi — tuỳ `event`. */
    detail: text('detail'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_audit_session_id_idx').on(table.sessionId, table.occurredAt),
    index('sessions_audit_user_id_idx').on(table.userId, table.occurredAt),
  ],
);

/** Tiến độ học của user trên từng lesson. Một dòng cho mỗi (user, lesson). */
export const progress = pgTable(
  'progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').notNull(),
    stepIndex: integer('step_index').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('progress_user_lesson_key').on(table.userId, table.lessonId)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type SessionAuditEvent = typeof sessionsAudit.$inferSelect;
export type Progress = typeof progress.$inferSelect;

/**
 * === Better Auth (0.D) ===
 *
 * Better Auth sở hữu 4 bảng dưới đây (session/account/verification/jwks) — quy ước
 * 1-owner/bảng vẫn giữ: Drizzle/TS là owner DUY NHẤT, Go không đụng vào.
 *
 * `sessions`/`accounts`/`verifications` dùng ĐÚNG tên field Better Auth mong đợi
 * (camelCase ở tầng TS — xem drizzle-adapter docs) để có thể pass thẳng object bảng
 * vào `drizzleAdapter(db, { schema: { ...schema, user: schema.users } })` mà không
 * cần `modelName`/`fields` override rườm rà. `users` (bảng đã có từ 0.C) đã khớp sẵn
 * field lõi Better Auth cần nên KHÔNG tạo bảng `user` thứ hai — xem chú thích ở
 * `users` phía trên.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_key').on(table.token),
    index('sessions_user_id_idx').on(table.userId),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Chỉ có giá trị cho provider credential (email/password). NULL với OAuth. */
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('accounts_user_id_idx').on(table.userId),
    uniqueIndex('accounts_provider_account_key').on(table.providerId, table.accountId),
  ],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

/**
 * Khoá ký JWT của plugin `jwt()` — luân phiên theo `jwks.rotationInterval`.
 *
 * `expires_at` NULLABLE và có mặt TỪ TRƯỚC khi rotation được bật (rủi ro R5,
 * phase-0.md): rotation mà thiếu cột này thì khoá cũ không bao giờ hết hiệu lực
 * — mọi khoá từng ký đều verify được mãi mãi, tức thu hồi một khoá bị lộ là bất
 * khả. Thêm cột sau khi đã có khoá đang chạy là migration trên dữ liệu sống;
 * thêm lúc bảng còn rỗng thì miễn phí.
 *
 * NULL = khoá chưa có hạn (chế độ hiện tại, rotation chưa bật). Khi bật
 * rotation, mỗi khoá mới sinh ra PHẢI có expires_at; verifier từ chối khoá có
 * expires_at trong quá khứ.
 */
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

/**
 * Refresh token — TÁCH BIỆT khỏi access JWT và khỏi session cookie của Better Auth
 * (luật 6,7 — phase-0.md 0.D task 15). Access JWT (Better Auth JWT plugin, TTL 15m,
 * `aud` per-service) không tự refresh được: client PHẢI gọi `/api/auth/refresh`
 * mang theo cookie `refresh_token` httpOnly này.
 *
 * Rotation: mỗi lần refresh thành công, dòng cũ bị đánh `revoked_at` NGAY (không xoá
 * — giữ audit chain qua `rotated_from`) và một dòng mới được tạo. Dùng lại refresh
 * token đã revoke (replay sau rotation) → từ chối (luật 7). `token_hash` lưu SHA-256
 * của token thô — token thô không bao giờ chạm DB ở dạng plaintext.
 */
export const authRefreshTokens = pgTable(
  'auth_refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    rotatedFrom: uuid('rotated_from'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_refresh_tokens_token_hash_key').on(table.tokenHash),
    index('auth_refresh_tokens_user_id_idx').on(table.userId),
  ],
);

export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type NewAuthRefreshToken = typeof authRefreshTokens.$inferInsert;
