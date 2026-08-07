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
 * Audit trail của session lab — CHỈ để tra cứu lịch sử.
 *
 * SSOT của session đang sống nằm ở Redis (`session:{id}`). Bảng này không được
 * dùng để trả lời "session X đang chạy ở pod nào" (plan.md §4 no-derived-fields);
 * nó ghi lại chuyện đã xảy ra, không phải trạng thái hiện tại.
 */
export const sessionsAudit = pgTable(
  'sessions_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: text('session_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(),
    status: text('status').notNull(),
    podName: text('pod_name'),
    namespace: text('namespace'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reapedAt: timestamp('reaped_at', { withTimezone: true }),
    reapReason: text('reap_reason'),
  },
  (table) => [
    index('sessions_audit_user_id_idx').on(table.userId),
    index('sessions_audit_session_id_idx').on(table.sessionId),
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
export type SessionAudit = typeof sessionsAudit.$inferSelect;
export type Progress = typeof progress.$inferSelect;
