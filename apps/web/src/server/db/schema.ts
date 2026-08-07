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
