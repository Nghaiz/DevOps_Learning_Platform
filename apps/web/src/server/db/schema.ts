import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CONTENT_KINDS,
  CONTENT_STATES,
} from '@devops-platform/shared-types/authoring';
import {
  GAME_IDS,
  PROBLEM_DIFFICULTIES,
  PROBLEM_FAILURE_CODES,
  PROBLEM_STATES,
  type ProblemHint,
  type ResourceKind,
  type Testcase,
} from '@devops-platform/games';
import { LEARNING_PATH_STATES, PATH_ITEM_KINDS } from '@devops-platform/shared-types/path';
import { QUIZ_QUESTION_KINDS, QUIZ_STATES } from '@devops-platform/shared-types/quiz';

/**
 * Schema Postgres — Drizzle là owner DUY NHẤT của mọi bảng ở đây.
 *
 * Quy ước 1-owner/bảng (phase-0.md 0.C task 11): Go KHÔNG ghi vào các bảng này.
 * Nếu về sau orchestrator cần bảng riêng, nó sở hữu schema riêng bằng sqlc — không
 * để hai ORM cùng ghi một bảng.
 */

/**
 * `author` được NỐI VÀO CUỐI (P9 9.A task 1), không chèn giữa: Postgres không
 * cho đổi chỗ giá trị enum mà không viết lại kiểu, và migration `ALTER TYPE …
 * ADD VALUE` chỉ nối được vào cuối trong một câu lệnh không khoá bảng.
 *
 * Mọi user cũ giữ nguyên `user` — `default('user')` không đổi, và `ADD VALUE`
 * không đụng tới dòng nào đang có.
 */
export const userRole = pgEnum('user_role', ['user', 'admin', 'author']);

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
    /**
     * Phép duyệt chuỗi khi phát hiện replay đi theo `rotated_from`, không theo
     * `user_id` — index ở trên không phục vụ nó. Phép duyệt ấy chạy TRONG
     * transaction đang giữ khoá hàng `users`, nên một lượt quét bảng ở đó là
     * thời gian mọi request khác của cùng tài khoản phải xếp hàng. Một review
     * độc lập chỉ ra (N7, 2026-09-13).
     */
    index('auth_refresh_tokens_rotated_from_idx').on(table.rotatedFrom),
  ],
);

export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type NewAuthRefreshToken = typeof authRefreshTokens.$inferInsert;

/**
 * Hàng đợi gửi thư đặt lại mật khẩu (P16 §8).
 *
 * Vì sao có bảng này: trước đó việc gửi nằm gọn trong `after()` của Next — chạy
 * SAU khi response đã trả, nên tiến trình chết giữa chừng là thư bốc hơi, không
 * dấu vết, không log. Ghi được một dòng ở đây = đã NHẬN việc, và cái chết của
 * tiến trình không còn xoá được việc đã nhận.
 *
 * ⚠ `code` là BÍ MẬT NGẮN HẠN nằm ở dạng BẢN RÕ trong DB. Đây là đánh đổi có
 * chủ ý chứ không phải sơ suất: muốn gửi lại được sau khi tiến trình chết thì mã
 * phải sống sót qua cái chết đó, mà mã thì KHÔNG băm được — thư gửi cho người
 * dùng buộc phải chứa bản rõ. (Bảng `verifications` vẫn chỉ giữ BĂM của mã; đây
 * là bản sao thứ hai, có tuổi thọ ngắn hơn.) Cửa sổ phơi bày bị chặn ở cả hai
 * đầu: dòng bị XOÁ ngay khi gửi xong, và dòng quá `expires_at` bị dọn mà không
 * gửi. CẤM log cột này, CẤM để nó lọt vào `last_error` — xem
 * `server/auth/password-reset-outbox.ts`.
 *
 * ⛔ CẤM cột suy ra được (`rules/code-conventions.md`): KHÔNG có `state`/
 * `status`/`sent_at`/`failed`. "Đang chờ" = dòng còn tồn tại; "hết lượt thử" =
 * `attempts` chạm trần; "đã gửi" = không còn dòng. Cả ba đọc được từ thứ đã lưu.
 *
 * `expires_at` thì KHÔNG phải cột suy ra được, dù nhìn qua giống
 * `created_at + PASSWORD_RESET_TTL_SECONDS`: nó ghi lại TTL ĐANG CÓ HIỆU LỰC lúc
 * dòng được tạo. Đổi hằng TTL thì công thức đó trả về một thời điểm khác với thời
 * điểm mã thật sự chết, nên `created_at` một mình không khôi phục được nó. Cùng
 * lập luận với `verifications.expires_at` và `auth_refresh_tokens.expires_at` ở
 * trên — hai bảng auth đã có sẵn đều lưu cả hai mốc.
 */
export const passwordResetOutbox = pgTable(
  'password_reset_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** BẢN RÕ — xem cảnh báo ở chú thích bảng. */
    code: text('code').notNull(),
    /** Số lượt gửi đã THẤT BẠI. Chạm `PASSWORD_RESET_MAX_ATTEMPTS` là ngừng thử. */
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    /** ĐÃ LÀM SẠCH trước khi ghi: không chứa địa chỉ người nhận lẫn mã. */
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('password_reset_outbox_next_attempt_at_idx').on(table.nextAttemptAt),
    /**
     * Lượt dọn dòng quá hạn quét theo `expires_at`, KHÔNG theo `next_attempt_at`
     * — hai vị từ khác nhau, nên index ở trên không phục vụ nó. Lượt dọn ấy chạy
     * ở ĐẦU MỖI lượt drain (mỗi request đã nhận việc, cộng một lượt quét 60 giây
     * trên MỌI replica), nên thiếu index này nó là một lượt quét toàn bảng lặp
     * lại mãi. Một review độc lập chỉ ra (N3, 2026-09-13).
     */
    index('password_reset_outbox_expires_at_idx').on(table.expiresAt),
  ],
);

export type PasswordResetOutboxRow = typeof passwordResetOutbox.$inferSelect;
export type NewPasswordResetOutboxRow = typeof passwordResetOutbox.$inferInsert;

/**
 * === Labs (P8 — trụ cột ②) ===
 *
 * Một lần thử làm lab. MỘT DÒNG MỖI LẦN THỬ — khác `progress` (một dòng mỗi cặp
 * user+lesson): một lab cho phép thử lại nhiều lần (leaderboard xếp theo lần
 * NỘP, không phải lần làm), nên "lần thử" phải là một thực thể riêng có id.
 *
 * ⛔ **CẤM** các cột suy ra được — rà từng cột trước khi thêm cột mới:
 * `score`/`percent` (= tổng `weight` các task đạt / tổng `weight`, tính từ
 * `lab_task_results` + `Lab.tasks`), `status` (= so `percent` với
 * `Lab.passThresholdPercent`), `duration_seconds` (=
 * `submitted_at - started_at`), `task_count`/`passed_count` (đếm được từ
 * `lab_task_results`). Tất cả tính ở chỗ dùng — xem
 * `packages/scenario/src/lab-score.ts` (contract §2) và `docs/lab-format.md`
 * § "Không lưu field suy ra được".
 */
export const labAttempts = pgTable(
  'lab_attempts',
  {
    /** Sinh ở tầng router (`crypto.randomUUID()`) — không phải cột suy ra được. */
    id: text('id').primaryKey(),
    /** Chủ sở hữu lần thử. Cascade: xoá tài khoản thì xoá luôn lịch sử lab của họ. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * KHÔNG FK: nội dung lab nằm trên đĩa (`content/labs/**`, giống
     * `progress.lessonId`), không phải một bảng Postgres.
     */
    labId: text('lab_id').notNull(),
    /** Sandbox pod đã dùng cho lần thử này — truy nguyên khi có khiếu nại chấm sai. */
    sessionId: text('session_id').notNull(),
    /** Mốc bắt đầu — vế đầu của `duration_seconds` (tính, không lưu). */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** `null` = đang làm dở. Khác `null` = đã nộp — mốc cuối của duration. */
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    /**
     * Lựa chọn CỦA NGƯỜI HỌC (mặc định ẩn danh) — không tính được từ đâu, đây là
     * dữ liệu chính. `labs.leaderboard` đọc cột này ở mỗi truy vấn (không đóng
     * băng lúc nộp), nên đổi ý sau khi đã nộp vẫn có tác dụng.
     */
    displayNamePublic: boolean('display_name_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lab_attempts_user_lab_started_idx').on(table.userId, table.labId, table.startedAt),
    index('lab_attempts_lab_submitted_idx').on(table.labId, table.submittedAt),
  ],
);

/**
 * Một lượt chấm ĐÃ LƯU của một task, trong một lần thử.
 *
 * **Bất biến (contract §1):** một dòng ở đây LUÔN là phán quyết chấm bài THẬT —
 * `labs.checkTask` chỉ ghi dòng này sau khi `runScriptInSession` trả lời mà
 * KHÔNG ném lỗi. Lỗi hạ tầng (script hỏng / hết hạn / pod chết) ném `TRPCError`
 * và không đi tới câu `insert` — không có dòng "lỗi hạ tầng" nào trong bảng này.
 *
 * ⛔ **CẤM** `passed` (= `exit_code === 0`, xem `ScriptOutcome.passed` của
 * `validate.ts`) và `attempt_no` (= đếm dòng trước đó của cùng
 * `(attempt_id, task_id)` cộng một).
 */
export const labTaskResults = pgTable(
  'lab_task_results',
  {
    /** Sinh ở tầng router (`crypto.randomUUID()`). */
    id: text('id').primaryKey(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => labAttempts.id, { onDelete: 'cascade' }),
    /** Khớp `LabTask.id` — định danh BỀN, không phải chỉ số vị trí trong `tasks[]`. */
    taskId: text('task_id').notNull(),
    /** Phán quyết thô của `/exec` — nguồn sự thật duy nhất cho "task này đạt chưa". */
    exitCode: integer('exit_code').notNull(),
    /** Đã cắt cỡ ở server TRƯỚC khi lưu (`LAB_OUTPUT_MAX_BYTES`, `server/labs/output.ts`). */
    output: text('output').notNull(),
    /** Thứ tự các lần thử lại của CÙNG một task — vế cần để lấy "lần chấm gần nhất". */
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('lab_task_results_attempt_task_checked_idx').on(
      table.attemptId,
      table.taskId,
      table.checkedAt,
    ),
  ],
);

export type LabAttemptRow = typeof labAttempts.$inferSelect;
export type NewLabAttemptRow = typeof labAttempts.$inferInsert;
export type LabTaskResultRow = typeof labTaskResults.$inferSelect;
export type NewLabTaskResultRow = typeof labTaskResults.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Nội dung SOẠN TRÊN UI (P9) — ràng buộc dài hạn #4: "soạn bài trực tiếp trên
// UI, không hardcode vào repo".
//
// ⚠ Ba bảng dưới đây là NGUỒN, không phải bản sao. Đây chính là điều kiện mà
// `packages/scenario/src/source.ts` đặt ra khi CẤM dựng bảng `scenarios` ở P2:
// *"bảng đó thuộc về ngày có UI soạn bài, và ngày đó nó là NGUỒN chứ không phải
// bản sao."* Nội dung vendored trên đĩa KHÔNG được chép vào đây — hai nguồn
// sống song song, luật gộp ở `docs/content-sources.md`.
//
// ⛔ Mỗi cột dưới đây phải có LÝ DO TỒN TẠI ghi ngay tại chỗ (task 6). Cột nào
// tính được từ cột khác thì không được có mặt; review chặn.
// ─────────────────────────────────────────────────────────────────────────────

export const contentKind = pgEnum('content_kind', CONTENT_KINDS);
export const contentState = pgEnum('content_state', CONTENT_STATES);

/**
 * `bytea` — Drizzle không có builder sẵn cho nó.
 *
 * `fromDriver`/`toDriver` để mặc định: node-postgres đã trả `bytea` dưới dạng
 * `Buffer` và nhận `Buffer` khi ghi. Không đổi sang base64 ở tầng này — chuyển
 * đổi ở đây làm mọi caller phải nhớ nó đã bị chuyển, và chỗ quên đầu tiên là
 * chỗ ảnh hỏng.
 */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Một đơn vị nội dung soạn trên UI — lesson, lab, hoặc playground.
 *
 * ## Vì sao MỘT bảng cho cả ba loại
 *
 * Ba DTO của chúng không phải ba cây song song: `labSchema` và
 * `playgroundSchema` đều `extend`/`pick` từ `contentBaseSchema`
 * (`packages/shared-types/src/scenario.ts`) — đúng mười field chung. Ba bảng sẽ
 * chép mười cột đó ra ba chỗ, và chúng lệch ở lần đầu tiên ai đó thêm một tier
 * hay một capability. Cột riêng-theo-loại được để `null`, và schema Zod của
 * từng loại là thứ ép chúng có mặt (`server/content/validate.ts`) — kiểm ở biên
 * ghi, không phải bằng một `CHECK` chép lại luật một lần nữa.
 *
 * ## Không có cột nào cho những thứ này, và đó là cố ý
 *
 * · `stepCount` / `taskCount` — `count(content_steps)`. Task 6 cấm đích danh.
 * · `source` (repo/commit/license upstream) — bài soạn trên UI KHÔNG có
 *   upstream; hằng `null`. Một cột luôn NULL nói dối về việc nó có thể khác.
 * · `ignoredUpstreamFields` — cùng lý do; hằng `[]`.
 * · trạng thái "đã xuất bản chưa" — `state` LÀ nó, không cần một boolean thứ hai.
 */
export const contentItems = pgTable(
  'content_items',
  {
    /**
     * Slug của bài (`scenarioIdSchema`), KHÔNG phải uuid: nó đi thẳng vào URL,
     * vào `progress.lesson_id` và `lab_attempts.lab_id` — cùng không-gian định
     * danh với nội dung trên đĩa. Đó cũng là lý do va chạm id giữa hai nguồn có
     * thể xảy ra và phải có luật ưu tiên.
     */
    id: text('id').primaryKey(),
    kind: contentKind('kind').notNull(),
    /**
     * ⚠ KHÔNG cascade khi xoá user, và KHÔNG phải sơ suất: xoá một tài khoản
     * tác giả mà kéo theo mọi bài họ đã xuất bản sẽ làm tiến độ của người học
     * trỏ vào hư không (`progress.lesson_id` là cột text không FK). Postgres
     * mặc định NO ACTION ⇒ xoá tác giả khi còn bài sẽ LỖI, buộc người vận hành
     * archive hoặc chuyển chủ trước. Ồn ào là đúng ở đây.
     */
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    state: contentState('state').notNull().default('draft'),

    // ── contentBaseSchema, phần chung của cả ba loại ────────────────────────
    title: text('title').notNull(),
    description: text('description'),
    /** `null` cho playground — nó cố ý không có độ khó (xem `playgroundSchema`). */
    difficulty: text('difficulty'),
    /**
     * Người soạn NHẬP TAY, nên nó KHÔNG phải derived (task 6 nói rõ ngoại lệ
     * này). Không có cách nào tính thời lượng từ markdown mà không bịa ra một
     * hằng số "phút mỗi từ".
     */
    estimatedMinutes: integer('estimated_minutes'),
    tier: sandboxTier('tier').notNull(),
    /**
     * `ScenarioCapability[]`. jsonb chứ không phải `text[]`: nó được đọc nguyên
     * khối và đưa thẳng vào Zod, không có truy vấn nào lọc theo phần tử.
     */
    capabilities: jsonb('capabilities').notNull(),
    /**
     * Với bài vendored đây là `backend.imageid` nguyên văn upstream (giữ để
     * truy nguyên). Với bài soạn trên UI không có upstream để dẫn — nó là lựa
     * chọn image của người soạn, và `contentBaseSchema` đòi nó `min(1)`.
     */
    backendImageId: text('backend_image_id').notNull(),
    /** `interface.layout` — `null` = terminal thường. */
    interfaceLayout: text('interface_layout'),
    /**
     * `SandboxTool[]` — bộ công cụ bật thêm trong pod cho RIÊNG bài này
     * (`dlp-tools enable …` lúc setup phiên).
     *
     * ⚠ `text` chứa **chuỗi JSON của mảng**, KHÔNG phải `jsonb` như
     * `capabilities` ngay trên — và đó là hợp đồng C4 chốt sẵn cho sáu lane,
     * không phải sơ suất sao chép. Hệ quả phải nhớ ở mọi call-site: đọc thì
     * `JSON.parse`, ghi thì `JSON.stringify`. Cột `capabilities` không cần hai
     * bước đó vì driver tự parse `jsonb`.
     *
     * `notNull().default('[]')` chứ không nullable: "không bật công cụ nào" là
     * một mảng rỗng, và một `null` thứ hai mang cùng nghĩa là hai cách viết
     * cùng một sự thật — chỗ để hai call-site xử lý khác nhau.
     */
    toolset: text('toolset').notNull().default('[]'),
    /**
     * `ScenarioAsset[]` — file ĐẨY VÀO SANDBOX lúc start (host/file/target/chmod).
     *
     * ⚠ KHÁC HẲN bảng `content_assets` bên dưới, và hai thứ này rất dễ lẫn:
     * đây là *chỉ thị copy file vào pod*; bảng kia là *byte của ảnh minh hoạ
     * phục vụ qua HTTP*. Upstream gọi cả hai là "assets".
     */
    assets: jsonb('assets').notNull(),

    // ── riêng lesson ────────────────────────────────────────────────────────
    /** `scenarioPhaseSchema | null` — phase mở đầu, không phải một bước có số. */
    intro: jsonb('intro'),
    /** `scenarioPhaseSchema | null` — phase kết, không phải một bước có số. */
    finish: jsonb('finish'),

    // ── riêng lab ───────────────────────────────────────────────────────────
    /**
     * `phaseScriptsSchema | null` — setup chạy MỘT lần khi dựng môi trường lab.
     * Lab cố ý không có setup-per-task (xem `labSchema.setup`).
     */
    setup: jsonb('setup'),
    /** Mốc ĐẠT theo % trọng số. Dữ liệu chính: trạng thái đạt/trượt được TÍNH từ nó. */
    passThresholdPercent: integer('pass_threshold_percent'),
    /** Bật xếp hạng — lựa chọn tường minh của người soạn, mặc định tắt. */
    leaderboard: boolean('leaderboard'),

    // ── riêng playground ────────────────────────────────────────────────────
    /** TTL riêng, ngắn hơn lesson/lab. Trần 7200 khớp HARD_CAP của orchestrator. */
    ttlSeconds: integer('ttl_seconds'),

    // ── vòng đời ────────────────────────────────────────────────────────────
    /**
     * Mốc bắt đầu lượt chạy thử của `publish` (task 18). Tồn tại vì lượt đó
     * chạy NGOÀI request: `web` có 2 replica và pod đang chạy thử có thể chết
     * giữa chừng, để lại một bài kẹt ở `publishing` vĩnh viễn. Có mốc này thì
     * "đang chạy thử" và "đã treo" phân biệt được bằng một phép trừ ở chỗ đọc —
     * chứ không cần một cột `stale` thứ hai.
     */
    publishStartedAt: timestamp('publish_started_at', { withTimezone: true }),
    /**
     * Vì sao lượt xuất bản gần nhất TRƯỢT. `null` = chưa chạy, hoặc đã đạt.
     * Không tính được từ đâu: nó là output của một lượt chạy thật đã kết thúc.
     */
    publishError: text('publish_error'),
    /**
     * Lần ĐẦU xuất bản thành công. KHÔNG cập nhật ở các lần xuất bản sau —
     * "sửa đổi gần nhất" đã là `updatedAt`, và gộp hai câu hỏi vào một cột làm
     * mất câu trả lời của cả hai.
     */
    publishedAt: timestamp('published_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Vế mà `dbContentSource` KHÔNG cache dựa vào — sửa xong phải thấy ngay (task 11). */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Truy vấn nóng nhất: `listItems(kind, visibility)` = lọc theo `(kind,
    // state)` rồi sắp theo `id`. `id` là PK nên nó đã có cây riêng; index này
    // phục vụ vế lọc.
    index('content_items_kind_state_idx').on(table.kind, table.state),
    // Trang soạn: "bài của TÔI", mọi state.
    index('content_items_author_state_idx').on(table.authorId, table.state),
  ],
);

/**
 * Một BƯỚC của lesson, hoặc một TASK của lab. Cùng bảng, và đó là một khẳng
 * định về hình dạng dữ liệu chứ không phải sự tiết kiệm.
 *
 * `scenarioStepSchema` và `labTaskSchema` khác nhau đúng bốn field
 * (`weight`/`hint` có ở lab; `setup`/`index` có ở lesson) trên một thân chung
 * là `(title, markdown, verifyScript)`. Hai bảng sẽ nhân đôi cột `markdown` —
 * cột to nhất — và nhân đôi mọi truy vấn đếm.
 *
 * ⛔ Playground KHÔNG có dòng nào ở đây: nó là môi trường không có bài. Một
 * playground có bước là một lesson bị gán nhầm loại.
 */
export const contentSteps = pgTable(
  'content_steps',
  {
    /** Sinh ở tầng router (`crypto.randomUUID()`). */
    id: text('id').primaryKey(),
    contentId: text('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    /**
     * Vị trí 0-based, liên tục.
     *
     * Với LESSON đây LÀ định danh của bước: nó khớp `progress.step_index` và
     * `ScenarioStep.index`. Không có cột `index` thứ hai — đó sẽ là hai tên cho
     * cùng một số.
     */
    ordinal: integer('ordinal').notNull(),
    /**
     * LAB: `LabTask.id` — ĐỊNH DANH BỀN, và nó tồn tại CHÍNH VÌ `ordinal` không
     * đủ. `lab_task_results.task_id` trỏ vào giá trị này; chèn một task vào
     * giữa mà id suy từ vị trí thì mọi kết quả đã lưu gắn sai việc, không lỗi,
     * không cảnh báo (xem `labTaskIdSchema`).
     *
     * LESSON: `null` — ở đó vị trí LÀ định danh, và tiến độ đã lưu theo số.
     */
    taskId: text('task_id'),
    /** `null` hợp lệ cho lesson (upstream `use-images` không có title). Lab đòi có. */
    title: text('title'),
    markdown: text('markdown').notNull(),
    /**
     * `setup.foreground` — script HIỆN trong terminal người học.
     *
     * ⚠ Hai cột `setup_*` chứ KHÔNG phải một cột `setup_script` như phase-9
     * task 5 phác. Killercoda phân biệt hai loại và `runSetup` chạy chúng khác
     * nhau: gộp lại là mất đúng thông tin quyết định UX ("terminal treo câm" vs
     * "màn hình đang chạy gì đó"). Xem `phaseScriptsSchema`.
     */
    setupForeground: text('setup_foreground'),
    /** `setup.background` — chạy ẩn. */
    setupBackground: text('setup_background'),
    /**
     * `null` = bước này không chấm (hợp lệ cho lesson).
     *
     * ⛔ Với LAB thì `labTaskSchema` đòi `min(1)`: một task không chấm được
     * luôn ở trạng thái "chưa đạt" mà không có cách nào đạt. Luật đó được ép ở
     * biên ghi bằng chính Zod schema, không phải bằng một CHECK chép lại nó.
     */
    verifyScript: text('verify_script'),
    /** LAB: trọng số khi tính điểm. `null` cho lesson. */
    weight: integer('weight'),
    /** LAB: gợi ý. `null` cho lesson, và `null` cho task không có gợi ý. */
    hint: text('hint'),
  },
  (table) => [
    // Thứ tự bước là dữ liệu, không phải may mắn: `get()` đọc theo `(contentId,
    // ordinal)` và unique chặn hai bước cùng vị trí — thứ sẽ hiện ra dưới dạng
    // "bài nhảy bước" tuỳ thứ tự trả về của Postgres.
    uniqueIndex('content_steps_content_ordinal_key').on(table.contentId, table.ordinal),
    // Task id phải duy nhất TRONG một lab — trùng nghĩa là hai task chia nhau
    // một dòng điểm. Postgres coi mọi NULL là khác nhau, nên hàng lesson
    // (`task_id IS NULL`) không va vào nhau ở index này.
    uniqueIndex('content_steps_content_task_key').on(table.contentId, table.taskId),
  ],
);

/**
 * Ảnh minh hoạ người soạn TẢI LÊN — byte nằm ngay trong dòng.
 *
 * ## Vì sao trong Postgres, khi phase-9 task 15 nói "không lưu blob trong Postgres"
 *
 * Câu đó viết khi chưa đối chiếu với `infra/helm/platform/values.yaml`:
 * `web.replicaCount: 2`, và storageclass duy nhất trên cụm là `local-path`,
 * vốn **RWO**. Chart đã ghi đúng hệ quả cho registry-mirror: *"Recreate vì PVC
 * là RWO: hai pod cùng mount một PV local-path không lên"*. Một asset ghi qua
 * pod A sẽ 404 ở pod B trong khoảng nửa số lượt — một lỗi ngắt quãng, khó tin,
 * và người soạn sẽ báo nó là "ảnh lúc có lúc không".
 *
 * Postgres là kho DÙNG CHUNG duy nhất đang có, nên nó là chỗ đúng cho tới khi
 * có object store thật. Cái giá được giữ trong tầm bằng trần
 * `MAX_CONTENT_ASSET_BYTES` (2 MiB) + allowlist chỉ ảnh raster.
 * `docs/content-sources.md` § "Asset" ghi đường đi tới MinIO khi cần.
 *
 * ⛔ KHÔNG có `size_bytes` dù task 7 liệt kê: `octet_length(bytes)` cho nó,
 * cùng dòng, không cần join. Tính ở chỗ dùng.
 */
export const contentAssets = pgTable(
  'content_assets',
  {
    /** Sinh ở tầng router (`crypto.randomUUID()`). */
    id: text('id').primaryKey(),
    contentId: text('content_id')
      .notNull()
      .references(() => contentItems.id, { onDelete: 'cascade' }),
    /**
     * Định danh lưu trữ do SERVER sinh — và là thứ DUY NHẤT đi vào URL (task 16).
     *
     * ⚠ Tên file người dùng nhập KHÔNG BAO GIỜ chạm đường dẫn. Đó là toàn bộ
     * cách chống path traversal ở tầng này: không phải bằng cách lọc `..` cho
     * khéo, mà bằng cách không có đường dẫn nào để traverse. `E8` của image
     * sandbox đã có guard `..`; tầng web không được yếu hơn.
     */
    storageKey: text('storage_key').notNull(),
    /** Tên gốc — CHỈ để hiển thị cho người soạn. Không bao giờ nối vào đường dẫn. */
    filename: text('filename').notNull(),
    /** Lấy từ allowlist theo ĐUÔI, không từ `Content-Type` client gửi. */
    contentType: text('content_type').notNull(),
    /**
     * sha256 tính LÚC NHẬN.
     *
     * Đây là ngoại lệ có lý do của luật no-derived-fields, và lý do phải nói rõ
     * kẻo lần review sau xoá nhầm: tính lại nó từ chính `bytes` đang lưu rồi so
     * với chính nó thì không chứng minh được gì. Giá trị này là *nhân chứng của
     * thứ đã nhận ở biên*, nên nó phát hiện được hỏng ngầm — và nó làm được
     * ETag mà không phải đọc cả blob lên.
     */
    sha256: text('sha256').notNull(),
    bytes: bytea('bytes').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // `storageKey` là khoá tra cứu của route phục vụ asset — unique TOÀN CỤC,
    // không phải theo content: URL không mang contentId thì hai bài trùng key
    // sẽ phục vụ lẫn ảnh của nhau.
    uniqueIndex('content_assets_storage_key_key').on(table.storageKey),
    index('content_assets_content_idx').on(table.contentId),
  ],
);

export type ContentItemRecord = typeof contentItems.$inferSelect;
export type NewContentItemRecord = typeof contentItems.$inferInsert;
export type ContentStepRecord = typeof contentSteps.$inferSelect;
export type NewContentStepRecord = typeof contentSteps.$inferInsert;
export type ContentAssetRecord = typeof contentAssets.$inferSelect;
export type NewContentAssetRecord = typeof contentAssets.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// LỘ TRÌNH + QUIZ (P10) — hai mục cuối lấy từ KodeKloud trong ràng buộc dài hạn.
//
// ⛔ RANH GIỚI, và đây là chỗ dễ trượt nhất của cả dự án: "khoá học" ở đây CHỈ
// là cách nhóm nội dung — một danh sách có thứ tự. KHÔNG cột `price`, `sku`,
// `entitlement`, `is_paid`, không bảng `enrollments` mang trạng thái thanh toán.
// Quyền truy cập vẫn chỉ là ĐĂNG NHẬP. Một migration sau này thêm cột như thế
// là dấu hiệu phạm vi đã trượt sang thương mại — dừng và hỏi chủ dự án.
//
// ⛔ Mỗi cột dưới đây có LÝ DO TỒN TẠI ghi ngay tại chỗ (AC #2). Cột nào tính
// được từ cột khác thì không có mặt; review chặn.
// ─────────────────────────────────────────────────────────────────────────────

export const learningPathState = pgEnum('learning_path_state', LEARNING_PATH_STATES);
export const pathItemKind = pgEnum('path_item_kind', PATH_ITEM_KINDS);
export const quizState = pgEnum('quiz_state', QUIZ_STATES);
export const quizQuestionKind = pgEnum('quiz_question_kind', QUIZ_QUESTION_KINDS);

/**
 * Một lộ trình — danh sách nội dung CÓ THỨ TỰ.
 *
 * ⛔ CẤM ở bảng này (AC #2, cả ba đếm/cộng được từ `learning_path_items` và từ
 * tiến độ từng item): `item_count`, `total_minutes`, `completion_percent`.
 * Chúng vẫn xuất hiện trong DTO — tính ở chỗ truy vấn, cùng khuôn
 * `authoringItemSchema.stepCount`. Cấm là cấm LƯU, không phải cấm tính.
 */
export const learningPaths = pgTable(
  'learning_paths',
  {
    /**
     * Slug, không phải uuid — nó đi thẳng vào URL `/paths/<id>`, cùng không-gian
     * định danh với `content_items.id` và với nội dung trên đĩa.
     */
    id: text('id').primaryKey(),
    /**
     * KHÔNG cascade, cùng lý lẽ `content_items.author_id`: xoá một tài khoản tác
     * giả mà kéo theo lộ trình họ đã xuất bản sẽ làm tiến độ người học trỏ vào
     * hư không. NO ACTION ⇒ xoá tác giả khi còn lộ trình sẽ LỖI, buộc người vận
     * hành archive hoặc chuyển chủ trước. Ồn ào là đúng ở đây.
     */
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    state: learningPathState('state').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description'),
    /**
     * Task 4 — khoá tuần tự là TUỲ CHỌN, mặc định TẮT (học tự do).
     *
     * Dữ liệu chính: lựa chọn của người soạn, không suy được từ đâu. Luật mở
     * ("item N mở khi N−1 đạt") sống ở `packages/scenario/src/path-progress.ts`
     * và được kiểm Ở SERVER — cột này chỉ nói luật đó CÓ áp dụng hay không.
     */
    sequential: boolean('sequential').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('learning_paths_author_state_idx').on(table.authorId, table.state)],
);

/**
 * Một mắt xích của lộ trình.
 *
 * ⛔ CẤM `title`: nó thuộc về bài, và tác giả bài sửa được nó. Chép vào đây là
 * dựng bản sao thứ hai không có cách nào biết mình đã cũ — tiêu đề được nạp từ
 * nguồn nội dung lúc đọc.
 *
 * ⛔ CẤM một cột `passed`/`completed`: tiến độ thuộc về CẶP (người học, item),
 * không thuộc về mắt xích. Nó đã có nguồn — `progress` cho lesson,
 * `lab_attempts` cho lab, `quiz_attempts` cho quiz.
 */
export const learningPathItems = pgTable(
  'learning_path_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pathId: text('path_id')
      .notNull()
      .references(() => learningPaths.id, { onDelete: 'cascade' }),
    /**
     * Vị trí trong lộ trình. Dữ liệu chính — thứ tự LÀ nội dung của lộ trình,
     * không suy được từ gì khác.
     */
    ordinal: integer('ordinal').notNull(),
    itemKind: pathItemKind('item_kind').notNull(),
    /**
     * KHÔNG FK, và có ba lý do độc lập: (a) `lesson` có thể tới từ ĐĨA
     * (`content/scenarios/**`) chứ không phải bảng nào; (b) `quiz` nằm ở bảng
     * `quizzes` còn `lab` ở `content_items` — một FK không trỏ được vào hai
     * bảng; (c) bài bị archive vẫn phải giữ được mắt xích để người soạn thấy lộ
     * trình đang thủng. Cái giá: một id gõ sai không bị DB chặn, nên nó hiện ra
     * ở DTO với `title: null` thay vì bị lọc đi im lặng.
     */
    itemId: text('item_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /**
     * Hai item cùng `ordinal` trong một lộ trình là một thứ tự không xác định,
     * và luật `sequential` khi đó phụ thuộc vào thứ tự Postgres trả về — tức là
     * vào may rủi. Chặn ở DB, không ở tầng ứng dụng.
     */
    uniqueIndex('learning_path_items_path_ordinal_key').on(table.pathId, table.ordinal),
    /**
     * Cùng một item được phép xuất hiện ở NHIỀU lộ trình (task 2) — nên KHÔNG
     * có unique trên `item_id` toàn cục. Nhưng lặp lại chính nó trong CÙNG một
     * lộ trình thì vô nghĩa: người học "đạt" nó một lần là đạt cả hai chỗ.
     */
    uniqueIndex('learning_path_items_path_item_key').on(
      table.pathId,
      table.itemKind,
      table.itemId,
    ),
  ],
);

/**
 * Một quiz — BẢNG RIÊNG, không phải một `content_items.kind` thứ tư (task 12).
 *
 * ## Lý do, và nó là bằng chứng chứ không phải sở thích
 *
 * `content_items.tier` và `content_items.backend_image_id` đều `NOT NULL`. Một
 * quiz không có tier và không có image: nó không dựng pod nào. Nhét quiz vào
 * bảng đó buộc phải nới cả hai cột thành nullable — tức là làm YẾU ràng buộc
 * cho ba loại nội dung thật sự cần chúng, để chứa một loại không cần. Cộng thêm
 * `content_steps` (step/script/asset) sẽ toàn `null` cho quiz, đúng thứ task 12
 * dự đoán.
 *
 * Cái giá của bảng riêng: vòng đời nháp→xuất bản không dùng lại được
 * `content_states`. Trả giá đó một lần ở đây, có ý thức — xem `QUIZ_STATES` về
 * việc vì sao quiz KHÔNG có `publishing`.
 */
export const quizzes = pgTable(
  'quizzes',
  {
    /** Slug — đi vào URL `/quiz/<id>` và vào `learning_path_items.item_id`. */
    id: text('id').primaryKey(),
    /** KHÔNG cascade — cùng lý lẽ `learning_paths.author_id`. */
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    state: quizState('state').notNull().default('draft'),
    title: text('title').notNull(),
    description: text('description'),
    /**
     * Mốc ĐẠT theo % số câu đúng. Dữ liệu chính (người soạn nhập) và là thứ
     * `sequential` đọc để trả lời "item này đã đạt chưa" — đối xứng với
     * `content_items.pass_threshold_percent` của lab.
     */
    passThresholdPercent: integer('pass_threshold_percent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('quizzes_author_state_idx').on(table.authorId, table.state)],
);

/**
 * Một câu hỏi.
 *
 * ⛔ CẤM `choice_count` và `correct_count` — đếm được từ `quiz_choices`.
 */
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    /**
     * Định danh BỀN trong phạm vi quiz — đi vào `quiz_answers.question_id`.
     * KHÁC `id` (uuid của dòng) và KHÁC `ordinal` (vị trí): chèn một câu vào
     * giữa hoặc đổi thứ tự KHÔNG được làm câu trả lời đã lưu trỏ nhầm câu hỏi.
     * Cùng lý lẽ `content_steps.task_id` của lab.
     */
    questionId: text('question_id').notNull(),
    /** Vị trí hiển thị. Dữ liệu chính — thứ tự là lựa chọn của người soạn. */
    ordinal: integer('ordinal').notNull(),
    kind: quizQuestionKind('kind').notNull(),
    markdown: text('markdown').notNull(),
    /** Hiện SAU khi nộp. `null` = tác giả không viết giải thích cho câu này. */
    explanation: text('explanation'),
  },
  (table) => [
    uniqueIndex('quiz_questions_quiz_question_key').on(table.quizId, table.questionId),
    uniqueIndex('quiz_questions_quiz_ordinal_key').on(table.quizId, table.ordinal),
  ],
);

/**
 * Một lựa chọn.
 *
 * ⚠ `is_correct` sống ở ĐÂY và chỉ ở đây. Nó KHÔNG được đi vào bất kỳ DTO nào
 * người học nhận trước khi nộp — rào compile ở
 * `packages/shared-types/src/quiz.ts` (`QuizChoiceForLearner`) và bằng chứng ở
 * `quiz-dto-leak.test.ts`.
 */
export const quizChoices = pgTable(
  'quiz_choices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questionRowId: uuid('question_row_id')
      .notNull()
      .references(() => quizQuestions.id, { onDelete: 'cascade' }),
    /** Định danh BỀN trong phạm vi câu hỏi — đi vào `quiz_answers.selected_choice_ids`. */
    choiceId: text('choice_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    markdown: text('markdown').notNull(),
    isCorrect: boolean('is_correct').notNull(),
  },
  (table) => [
    uniqueIndex('quiz_choices_question_choice_key').on(table.questionRowId, table.choiceId),
    uniqueIndex('quiz_choices_question_ordinal_key').on(table.questionRowId, table.ordinal),
  ],
);

/**
 * Một lượt LÀM quiz.
 *
 * ⛔ CẤM `score` / `percent` / `passed` — tính 100% từ `quiz_answers` so với
 * `quiz_choices.is_correct` (task 8). ⛔ CẤM `attempt_no`: nó là "đếm số dòng
 * trước đó của cùng `(user_id, quiz_id)` cộng một", đúng loại cột mà chú thích
 * của `lab_task_results` đã cấm bằng tên. Bản phác của phase-10 có nhắc "lần
 * thử thứ mấy" ở task 8 — nó là thứ được TÍNH và trả trong
 * `quizAttemptResultSchema.attemptNumber`, không phải một cột.
 */
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    /** Sinh ở tầng router (`crypto.randomUUID()`). */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * FK KHÔNG cascade (khác `lab_attempts.lab_id`, vốn không có FK vì lab có
     * thể nằm trên đĩa). Quiz chỉ sống trong DB, nên ràng buộc thật là làm được
     * — và NO ACTION biến "xoá một quiz đang có người làm" thành một lỗi ồn ào
     * thay vì một lịch sử trỏ vào hư không. Đường đúng là `archive`.
     */
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id),
    /**
     * Mốc NỘP. Một dòng ở đây LUÔN là một lượt đã nộp — `quiz.submit` ghi
     * attempt và answers trong CÙNG một transaction, nên không có trạng thái
     * "đang làm dở" nào tồn tại ở tầng này.
     *
     * Khác `lab_attempts.submitted_at` (nullable, vì lab mở sandbox trước rồi
     * mới nộp): quiz không dựng gì cả, nên không có gì để mở trước.
     */
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('quiz_attempts_user_quiz_submitted_idx').on(
      table.userId,
      table.quizId,
      table.submittedAt,
    ),
  ],
);

/**
 * Người học đã CHỌN GÌ, ở câu nào, trong lượt nào.
 *
 * ⛔ CẤM `is_correct` — so `selected_choice_ids` với `quiz_choices.is_correct`
 * là ra (task 8). Đây là dữ liệu chính duy nhất của việc chấm; mọi thứ khác suy
 * ra từ nó.
 *
 * ⚠ Hệ quả đã cân nhắc: chấm LẠI một lượt cũ dùng đáp án HIỆN TẠI, nên tác giả
 * sửa đáp án sau khi có người nộp sẽ đổi điểm lịch sử. Cùng tính chất mà
 * `computeLabScore` đã có (nó chấm theo `lab` hiện tại), và cùng lý do: đóng
 * băng đáp án vào từng lượt nộp là chép `quiz_choices` vào đây — bản sao thứ
 * hai, đúng thứ luật no-derived-fields cấm. Ghi lại ở `docs/quiz-format.md`.
 */
export const quizAnswers = pgTable(
  'quiz_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: text('attempt_id')
      .notNull()
      .references(() => quizAttempts.id, { onDelete: 'cascade' }),
    /** Khớp `quiz_questions.question_id` — định danh BỀN, KHÔNG phải uuid dòng. */
    questionId: text('question_id').notNull(),
    /**
     * `string[]` — id các lựa chọn đã chọn. jsonb chứ không phải `text[]`: nó
     * được đọc nguyên khối và đưa thẳng vào `gradeQuiz`, không có truy vấn nào
     * lọc theo phần tử.
     *
     * MẢNG cho cả `single` lẫn `multiple` — `single` chỉ là ràng buộc "đúng một
     * phần tử", kiểm khi chấm. Hai hình dạng khác nhau sẽ bắt mọi consumer viết
     * một nhánh `typeof`, và nhánh đó là chỗ đầu tiên có người quên.
     */
    selectedChoiceIds: jsonb('selected_choice_ids').notNull(),
  },
  (table) => [
    uniqueIndex('quiz_answers_attempt_question_key').on(table.attemptId, table.questionId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// HỒ SƠ + QUẢN TRỊ (P13, contract §2 C4) — hai bảng mới của lane BE1.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shell mặc định của terminal, theo lựa chọn của người dùng ở `/settings`.
 *
 * `bash` là mặc định vì đó là shell của ĐA SỐ ảnh hướng dẫn DevOps trên mạng —
 * cùng lý lẽ `sudo` ở `images/sandbox-base/Dockerfile` E1. Ba giá trị khớp CHÍNH
 * XÁC ba đường dẫn tuyệt đối cố định trong `apps/web/src/server/sessions/preferences.ts`
 * (`SHELL_PATHS`) — enum thêm giá trị thì bảng đó phải thêm dòng CÙNG lúc,
 * không thì D7 áp dụng một tuỳ chọn mà không có đường dẫn nào để chạy.
 */
export const defaultShellPref = pgEnum('default_shell_pref', ['bash', 'zsh', 'pwsh']);

/**
 * Tuỳ chọn cá nhân — MỘT dòng mỗi user, tạo LƯỜI (upsert lần đầu ghi, xem
 * `server/me/preferences.ts`). Không có dòng nào là "chưa từng đặt tuỳ chọn",
 * không phải "user không tồn tại" — mọi cột ở đây có default, nên vắng dòng và
 * dòng-toàn-default là tương đương về ngữ nghĩa; ta chọn KHÔNG insert lúc user
 * đăng ký để tránh một trigger/hook thứ hai phải giữ đồng bộ với bảng `users`.
 *
 * `terminal_theme` là `text` NULLABLE, không phải một `pgEnum` thứ hai ăn theo
 * `ThemeName` của `packages/terminal`: theme sống ở một package KHÁC (không
 * phải Drizzle schema của service này), và một `pgEnum` Postgres phải khớp
 * BYTE-VỚI-BYTE với danh sách đó mãi mãi — thêm một theme mới ở `packages/terminal`
 * sẽ đòi một migration ở service này mà không có lý do kỹ thuật nào bắt buộc.
 * `null` = theo theme trang (suy từ `useTheme()`, xem D2/C5); giá trị hợp lệ
 * được ép bởi `THEME_NAMES` (từ `@devops-platform/terminal`) ở biên ghi
 * (`me.updatePreferences`), không phải bởi kiểu cột.
 */
export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  defaultShell: defaultShellPref('default_shell').notNull().default('bash'),
  terminalTheme: text('terminal_theme'),
  leaderboardNamePublic: boolean('leaderboard_name_public').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UserPreferencesRow = typeof userPreferences.$inferSelect;
export type NewUserPreferencesRow = typeof userPreferences.$inferInsert;

/**
 * Nhật ký hành động QUẢN TRỊ — append-only, cùng triết lý `sessions_audit`: một
 * dòng là một sự kiện đã xảy ra, không phải trạng thái hiện tại.
 *
 * `actor_id` KHÔNG có foreign key — cùng lý lẽ `sessions_audit.user_id`: một
 * admin bị xoá tài khoản (hoặc hạ quyền) không được kéo theo việc mất bằng
 * chứng những gì họ đã làm lúc còn là admin.
 *
 * `target_type`/`target_id` là cặp text tự do (`'user'`/`'session'`/…) thay vì
 * FK: mục tiêu của một hành động quản trị thuộc nhiều bảng khác nhau
 * (`users`, phiên sandbox chỉ sống ở Redis) — một FK không trỏ được vào nhiều
 * bảng, và một session id không có FK nào để trỏ tới (Postgres không giữ nó).
 */
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    detail: jsonb('detail'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('admin_audit_occurred_at_idx').on(table.occurredAt)],
);

export type AdminAuditRow = typeof adminAudit.$inferSelect;
export type NewAdminAuditRow = typeof adminAudit.$inferInsert;

export type LearningPathRow = typeof learningPaths.$inferSelect;
export type NewLearningPathRow = typeof learningPaths.$inferInsert;
export type LearningPathItemRow = typeof learningPathItems.$inferSelect;
export type NewLearningPathItemRow = typeof learningPathItems.$inferInsert;
export type QuizRow = typeof quizzes.$inferSelect;
export type NewQuizRow = typeof quizzes.$inferInsert;
export type QuizQuestionRow = typeof quizQuestions.$inferSelect;
export type NewQuizQuestionRow = typeof quizQuestions.$inferInsert;
export type QuizChoiceRow = typeof quizChoices.$inferSelect;
export type NewQuizChoiceRow = typeof quizChoices.$inferInsert;
export type QuizAttemptRow = typeof quizAttempts.$inferSelect;
export type NewQuizAttemptRow = typeof quizAttempts.$inferInsert;
export type QuizAnswerRow = typeof quizAnswers.$inferSelect;
export type NewQuizAnswerRow = typeof quizAnswers.$inferInsert;

// ── Hệ bài tập kiểu OJ (P14 lane D) ─────────────────────────────────────────

/**
 * Hai bảng dưới đây hiện thực `packages/games/src/k8s/problem.ts`. Đọc file đó
 * TRƯỚC — nó giải thích vì sao `Problem` khác `Level` và khác `Lab`, và vì sao
 * ba khái niệm rất dễ lẫn ấy phải ở ba chỗ khác nhau.
 *
 * Hai thang bậc cố ý KHÔNG dùng chung với phần còn lại của repo:
 *
 * - `problem_difficulty` bốn bậc, KHÁC `SCENARIO_DIFFICULTIES` ba bậc. Đây là
 *   quyết định của hợp đồng, không phải sơ suất — bài lab là nội dung dạy nên
 *   ba bậc đủ, còn một OJ cần tách "khó" khỏi "rất khó" vì đó là ranh giới
 *   người ta dựa vào để chọn bài kế tiếp. Vì hai thang khác nhau, KHÔNG ánh xạ
 *   ngầm giữa chúng ở bất kỳ đâu.
 * - `problem_state` ba giá trị trùng TÊN với `content_state` nhưng là kiểu
 *   RIÊNG. Gộp lại sẽ trói vòng đời bài OJ vào vòng đời nội dung soạn — hai thứ
 *   đã khác nhau ngay từ bây giờ (`content_state` có `publishing` và một lượt
 *   chạy thử ngoài request; bài OJ không có gì tương ứng).
 */
export const problemDifficulty = pgEnum('problem_difficulty', PROBLEM_DIFFICULTIES);
export const problemState = pgEnum('problem_state', PROBLEM_STATES);

export const problems = pgTable(
  'problems',
  {
    /**
     * Khoá chính là `code` (`K8S-0042`), KHÔNG phải `slug` và KHÔNG phải uuid.
     * Lý lẽ đầy đủ ở `problem.ts` § "Định danh": `code` là thứ DUY NHẤT không
     * bao giờ đổi — `slug` sinh từ tiêu đề nên đổi theo tiêu đề, còn một uuid
     * thì không ai đọc cho nhau nghe được.
     *
     * Bốn chữ số cố định làm `ORDER BY code` đúng bằng so sánh chuỗi, nên cây
     * btree của khoá chính đã phục vụ luôn thứ tự mặc định của danh sách —
     * không cần một chỉ mục thứ hai cho nó.
     */
    code: text('code').primaryKey(),
    /**
     * Game nào chấm bài này — §18.A, cột thêm ở migration 0015.
     *
     * ## Vì sao cột này tới MUỘN, và vì sao muộn là một lỗi chứ không phải thứ tự
     *
     * 18.A đã tổng quát `Problem` ở tầng miền (`core/problem.ts` khai `gameId`)
     * và ở tầng giao diện (`/author/problems` đổi biểu mẫu theo plugin), nhưng
     * **kho lưu thì không đi theo**. Hệ quả đo được ngày 2026-09-15: một bài Git
     * soạn xong qua giao diện mới không có chỗ nào để lưu, vì mọi cột ở đây đều
     * mang hình dạng K8s. "OJ đa-game" đúng ở hai tầng trên và sai ở tầng dưới
     * cùng — tức là chưa đúng.
     *
     * ## `'k8s'` là mặc định ĐÚNG NGHĨA cho dòng cũ
     *
     * Không phải chỗ giữ chỗ: mọi dòng viết trước 0015 thật sự LÀ bài K8s —
     * `initial_state` của chúng là `ClusterSpec`, `topics` của chúng nằm trong
     * `PROBLEM_TOPICS` của K8s. Backfill bằng một hằng khác sẽ là bịa.
     *
     * ⚠ Tập giá trị là toàn bộ `GAME_IDS`, KHÔNG phải tập game đã có plugin
     * chấm. Một bài `draft` của game chưa có engine là hợp lệ và nên lưu được;
     * thứ phải chặn là **xuất bản** nó, và chỗ chặn là `publish-gate.ts` —
     * `submit.ts` ném `INTERNAL_SERVER_ERROR` nếu một bài `published` thuộc game
     * không có plugin, nên cổng xuất bản là thứ giữ cho nhánh đó không tới được.
     */
    gameId: text('game_id', { enum: GAME_IDS }).notNull().default('k8s'),
    /** Nằm trong URL, sinh từ tiêu đề, ĐỔI ĐƯỢC. Duy nhất riêng, xem index dưới. */
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    /** Markdown, trần cứng 150 từ — gác ở tầng ghi (`problems/validate.ts`). */
    statement: text('statement').notNull(),
    difficulty: problemDifficulty('difficulty').notNull(),
    /**
     * `text[]` + GIN, KHÔNG phải `jsonb` như `content_items.capabilities`.
     *
     * Khác biệt quyết định là CÓ LỌC THEO PHẦN TỬ hay không. `capabilities` được
     * đọc nguyên khối rồi đưa thẳng vào Zod, không truy vấn nào chạm tới từng
     * phần tử — jsonb đúng ở đó. Ở đây thì ngược lại: bộ lọc danh sách hỏi "bài
     * nào có BẤT KỲ chủ đề nào trong tập này" (`&&`) và "bài nào có ĐỦ mọi tag
     * này" (`@>`); cả hai là toán tử mảng của Postgres và có chỉ mục GIN phục vụ
     * trực tiếp. Viết cùng câu hỏi đó trên jsonb phải qua `jsonb_path_exists`
     * hoặc `EXISTS (SELECT … jsonb_array_elements)` — một phép quét không dùng
     * được chỉ mục nào.
     *
     * Vì sao `text[]` chứ không phải `pgEnum(...).array()`, dù `PROBLEM_TOPICS`
     * là tập ĐÓNG: một mảng kiểu enum bắt mọi tham số truyền vào `&&`/`@>` phải
     * ép sang `problem_topic[]`, trong khi driver `postgres` gửi mảng chuỗi dưới
     * dạng `text[]` — Postgres từ chối với `operator does not exist:
     * problem_topic[] && text[]`, một lỗi chỉ lộ lúc chạy. Tập đóng vẫn được
     * gác, nhưng gác ở biên GHI bằng chính `PROBLEM_TOPICS` (SSOT của hợp đồng)
     * chứ không bằng một bản sao thứ hai của danh sách nằm trong DB.
     *
     * ⚠ `{ enum: PROBLEM_TOPICS }` ĐÃ GỠ ở 0015, và đây là chỗ dễ đọc nhầm nhất
     * trong cả khối này. `PROBLEM_TOPICS` là tập chủ đề **của riêng K8s**; từ
     * 18.A mỗi plugin mang tập chủ đề riêng (`GIT_PROBLEM_TOPICS`, …) và hợp
     * đồng đã nới `ProblemTopicId = string`. Giữ enum cũ ở đây nghĩa là một bài
     * Git hợp lệ bị TypeScript từ chối ngay tại chỗ ghi.
     *
     * Việc gác tập đóng KHÔNG mất đi, nó chỉ đổi chỗ đúng hơn: biên ghi hỏi
     * plugin của `game_id` xem chủ đề có thuộc tập của game đó không. Một danh
     * sách hợp nhất mọi game nằm ở tầng DB sẽ nhận `git-rebase` cho một bài K8s
     * — hẹp về kiểu mà rộng về nghĩa, tức là sai.
     */
    topics: text('topics').array().notNull(),
    /** Phân loại tự do, đã chuẩn hoá thường + gạch nối. Rỗng là hợp lệ. */
    tags: text('tags').array().notNull(),
    /** `null` = không giới hạn giờ — không phải bài nào cũng nên chạy đua. */
    timeLimitSec: integer('time_limit_sec'),
    /**
     * Trạng thái đầu của thế giới — `ClusterSpec` với K8s, `WorldSpec` với Git.
     * Đọc nguyên khối để dựng phiên mô phỏng, không lọc theo phần tử.
     *
     * ⛔ `$type<unknown>()` là CHỦ Ý, không phải chỗ chưa làm xong. Hợp đồng
     * `ProblemBase<Spec>` nói rõ vì sao `Spec` là tham số kiểu chứ không phải
     * một union: kiểu đúng của cột này phụ thuộc `game_id` của CHÍNH DÒNG ĐÓ,
     * và TypeScript không diễn đạt được ràng buộc liên-cột. Một union
     * `ClusterSpec | WorldSpec` trông hẹp hơn mà không hẹp thật — nó vẫn cho
     * `ClusterSpec` lọt vào một dòng `game_id = 'git'`, chỉ là im lặng hơn.
     *
     * Chỗ hẹp lại là `gradeProblemRun`, vốn đã nhận `initialState: unknown` và
     * ép kiểu SAU khi tra plugin theo `gameId` (`problem-plugins.ts`). Đó là
     * điểm duy nhất trong hệ biết đủ hai vế để nói kiểu nào đúng.
     */
    initialState: jsonb('initial_state').$type<unknown>().notNull(),
    /**
     * Trạng thái ĐÍCH, với bài chấm bằng cách so hình dạng (`graphShapeMatches`
     * của Git). `null` với phần lớn bài. Cùng lý lẽ `unknown` như trên.
     */
    targetState: jsonb('target_state').$type<unknown>(),
    /**
     * Testcase của bài. Tên cột giữ nguyên `objectives` **có chủ ý**: quyết định
     * #20 của thiết kế nói thẳng *"Objective = testcase"*, nên cái tên không nói
     * dối về nội dung, và đổi tên cột là một migration dữ liệu không mua thêm
     * điều gì.
     *
     * ⚠ `$type<Testcase[]>` là hình dạng ĐÍCH sau §18.D.1, KHÔNG phải hình dạng
     * của các lượt ghi hôm nay — và chỗ này từng khai quá, sửa lại 2026-09-15
     * theo phép đo của lane dọn tầng máy chủ. Chừng nào `problemBodyShape`
     * (`validate.ts`) chưa mở sang đa-game thì đường GHI vẫn đẻ ra hình dạng
     * `Objective` (có `required`, không có `visible`), và `crud.ts` phải ép kiểu
     * ở biên ghi — ép kiểu đó có ghi chú tại chỗ và §18.D.1 là chỗ gỡ nó.
     *
     * Dòng viết trước 18.B cũng mang `required` và không mang `visible`. Nên
     * ĐỪNG đọc cột này trực tiếp — `problems/testcases.ts` (`problemTestcases`)
     * là biên đọc, nó nhận `readonly unknown[]` đúng vì lý do đó và mặc định
     * `visible: true` cho dòng cũ.
     */
    objectives: jsonb('objectives').$type<Testcase[]>().notNull(),
    /** `null` = cho dùng mọi loại tài nguyên. Một mảng đủ 26 loại KHÔNG tương đương. */
    allowedResources: jsonb('allowed_resources').$type<ResourceKind[]>(),
    /** `ProblemHint[]` — gợi ý CÓ GIÁ, nên mỗi cái cần `id` và `penaltyPoints`. */
    hints: jsonb('hints').$type<ProblemHint[]>().notNull(),
    /** `null` = không chấm theo số nước đi; `computeScore` đọc 0 đúng nghĩa đó. */
    parMoves: integer('par_moves'),
    /**
     * Bài này có sinh được đề theo seed không — §18.D.6, cột thêm ở 0015.
     *
     * ## Mặc định `false`, và chiều mặc định là phần quan trọng
     *
     * `false` là hướng AN TOÀN, không phải hướng tiện. Cờ này gác một thứ có
     * hậu quả thật: §18.G.3 cấm đưa bài `seedable: false` vào kỳ thi dùng
     * `per-student`, vì mỗi sinh viên sẽ nhận một đề **khác độ khó** mà không ai
     * biết. Mặc định `true` cho hàng trăm dòng cũ là tuyên bố chúng sinh đề được
     * — một lời khai chưa ai kiểm — và cái giá của việc sai là một kỳ thi không
     * công bằng, phát hiện ra sau khi đã chấm.
     *
     * Sai theo chiều `false` thì cái giá là một bài không được chọn vào đề thi
     * cho tới khi tác giả bật cờ. Ồn ào, sửa được, không ai mất điểm.
     *
     * ⚠ Cột này MỘT MÌNH không đóng được §18.G. Nó gác lúc SOẠN ĐỀ. Còn cổng thứ
     * hai gác lúc NỘP — `submit.ts` hiện nhận `log.seed` vô điều kiện, nên
     * người nộp tự chọn được thế giới đầu của mình. Hai cổng, hai thời điểm; xem
     * `phase-18.md` §18.G khối "CỔNG SEED".
     */
    seedable: boolean('seedable').notNull().default(false),
    state: problemState('state').notNull().default('draft'),
    /**
     * `null` với bài seed trong repo — chúng không có tài khoản tác giả.
     *
     * ⚠ KHÔNG cascade khi xoá user, cùng lý lẽ đã ghi ở `content_items`: xoá một
     * tài khoản tác giả mà kéo theo mọi bài họ đã xuất bản sẽ làm lịch sử nộp
     * bài của người học trỏ vào hư không. Postgres mặc định NO ACTION ⇒ xoá tác
     * giả khi còn bài sẽ LỖI, buộc người vận hành chuyển chủ hoặc archive
     * trước. Ồn ào là đúng ở đây.
     */
    authorId: text('author_id').references(() => users.id),
    /**
     * ⚠ `precision: 3` — KHÁC mọi bảng khác trong file này, và không phải cho đẹp.
     *
     * `created_at` là một khoá sắp xếp của hợp đồng (`PROBLEM_ORDER_KEYS`), nên
     * nó đi vào con trỏ keyset. Mặc định `timestamptz` của Postgres giữ tới
     * MICRO giây, còn `Date` của JavaScript chỉ có MILI giây — driver `postgres`
     * cắt phần dư khi dựng `Date`. Con trỏ vì thế mang một mốc NHỎ HƠN mốc thật
     * của chính dòng nó trỏ tới, và mệnh đề `created_at > $cursor` nhận lại
     * đúng dòng đó ở đầu trang sau: dòng LẶP, im lặng, chỉ lộ khi có người đếm.
     *
     * Ép cột về đúng độ chính xác mà JS biểu diễn được thì vòng đọc-ghi khép
     * kín, và phép so trong keyset là phép so trên cùng một giá trị. Cách khác
     * — loại trừ dòng con trỏ bằng `code <> …` — chỉ vá được dòng CUỐI của
     * trang, không vá được những dòng khác cùng mili giây.
     */
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('problems_slug_key').on(table.slug),
    // Truy vấn nóng nhất của trang danh sách: lọc `state` (người học chỉ thấy
    // `published`) rồi sắp theo `difficulty`.
    index('problems_state_difficulty_idx').on(table.state, table.difficulty),
    // Trang soạn: "bài của TÔI", mọi state.
    index('problems_author_state_idx').on(table.authorId, table.state),
    // Phục vụ `&&` (chủ đề: HOẶC) và `@>` (tag: VÀ) — xem chú thích cột `topics`.
    index('problems_topics_gin_idx').using('gin', table.topics),
    index('problems_tags_gin_idx').using('gin', table.tags),
  ],
);

/**
 * Một lượt làm bài đã kết thúc.
 *
 * ⛔ KHÔNG có `solver_count` / `attempt_count` / `acceptance_rate` ở bảng
 * `problems`, và đó là điều kiện tồn tại của bảng này. `problem.ts` §
 * `ProblemStats` viết thẳng: đó là chỗ mọi thiết kế OJ đều trượt — thêm cột cho
 * "truy vấn nhanh" rồi vĩnh viễn phải giữ chúng đồng bộ bằng trigger hoặc cron,
 * và chúng sẽ lệch. Cả ba số TÍNH từ bảng này ngay tại chỗ dùng
 * (`server/problems/stats.ts`). `acceptance_rate` còn tệ hơn hai cái kia: nó
 * suy ra được từ chính hai cái kia, nên lưu nó là lưu cùng một sự thật ba lần.
 *
 * Ngoại lệ duy nhất được cân nhắc nếu ĐO ĐƯỢC rằng truy vấn này là nút cổ chai:
 * MATERIALIZED VIEW có lịch refresh — không phải thêm cột.
 *
 * ⛔ KHÔNG lưu `RunLog`, vì hợp đồng `ProblemSubmission` không có nó. Hệ quả
 * phải biết: đã chấm xong thì KHÔNG chấm lại được. Đổi công thức điểm về sau
 * không áp ngược lên lịch sử, và một khiếu nại "tôi giải được mà máy báo không"
 * không còn gì để phân xử. Đây là đánh đổi của hợp đồng, không phải thứ bị bỏ
 * quên — muốn đổi thì đổi ở `problem.ts` trước.
 */
export const problemSubmissions = pgTable(
  'problem_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * KHÔNG cascade khi xoá bài: `crud.ts` từ chối xoá một bài đã có lượt nộp và
     * bảo người soạn dùng `archive`. Cascade ở đây sẽ biến một cú bấm "xoá" trên
     * trang soạn thành xoá lịch sử của mọi người đã làm bài đó, im lặng.
     */
    problemCode: text('problem_code')
      .notNull()
      .references(() => problems.code),
    /** Cascade: xoá tài khoản thì xoá luôn lịch sử làm bài — cùng `lab_attempts`. */
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Kết quả CỦA MÁY CHỦ sau khi phát lại nhật ký, không phải lời khai client.
     * `false` cũng ghi: một lượt không xác minh được vẫn là dữ liệu của người
     * dùng và vẫn tính vào `attemptCount` — nó chỉ mất quyền được điểm.
     */
    solved: boolean('solved').notNull(),
    /** 0..1000, do máy chủ chấm lại. Xem `server/problems/submit.ts`. */
    score: integer('score').notNull(),
    /**
     * Giờ TREO TƯỜNG do client khai, đã kẹp về không âm.
     *
     * ⚠ KHÔNG xác minh được, và cố ý không giả vờ xác minh: `verify.ts` nói rõ
     * `startedAt`/`finishedAt` không nằm trong nhật ký nên phát lại không tái
     * tạo được. Đừng dùng cột này làm khoá xếp hạng.
     */
    durationSeconds: integer('duration_seconds').notNull(),
    /** ĐẾM TỪ nhật ký theo `COMMAND_KINDS`, không lấy từ lời khai. */
    movesUsed: integer('moves_used').notNull(),
    /** Id gợi ý đã mở, đọc ra từ các action `hint` trong nhật ký. */
    hintsRevealed: text('hints_revealed').array().notNull(),
    /**
     * Id các testcase ĐÃ QUA của lượt này — mô hình testcase (§18.B.2).
     *
     * ID CHỨ KHÔNG PHẢI CHỈ SỐ, và hợp đồng `core/problem.ts` § `Submission`
     * nói thẳng vì sao: *"chỉ số vỡ khi tác giả đổi thứ tự."* Một mảng `[0,1,3]`
     * lưu hôm nay sẽ trỏ sang ba testcase khác ngay lần đầu người soạn kéo một
     * dòng lên trên, và không có gì đỏ để báo.
     *
     * Máy chủ tự chấm bằng `gradeProblemRun` (phát lại nhật ký), không đọc lời
     * khai của client — `server/problems/submit.ts`.
     *
     * Rỗng ở lượt `CE`: hợp đồng `GradeResult` bắt *"`CE` mang `passed` rỗng"*.
     */
    passed: text('passed').array().notNull().default([]),
    /**
     * Số testcase của bài TẠI THỜI ĐIỂM NỘP.
     *
     * ⚠ KHÔNG vi phạm quy ước No Derived Fields (`rules/code-conventions.md`),
     * và lý do phải nằm ngay đây vì vế suy-ra-được hay nấp cạnh vế hợp lệ: số
     * này **không** suy được từ bài lúc đọc ra, vì bài có thể đã bị sửa SAU lượt
     * nộp. Nó là một **sự thật lịch sử** — "lúc nộp, bài có bấy nhiêu testcase".
     * Không chốt lại tại thời điểm nộp thì một lượt `WA (4/5)` hôm nay sẽ tự đọc
     * thành `WA (4/7)` sau khi tác giả thêm hai case, và cả lịch sử làm bài của
     * mọi người lặng lẽ đổi nghĩa. `core/problem.ts` § `Submission` ghi cùng một
     * điều cho `passed`.
     *
     * ⛔ Cặp `(passed, total)` KHÔNG được bổ sung một cột điểm-theo-testcase:
     * điểm là `passed.length / total`, tính ở chỗ dùng. Cột `score` bên trên là
     * của mô hình cũ (0..1000 theo gợi ý và số nước) — một đại lượng KHÁC, đừng
     * gộp hai thứ.
     *
     * `0` ở dòng cũ (trước 18.C) là đúng nghĩa chứ không phải chỗ giữ chỗ:
     * `problemVerdictOf(_, 0)` trả `CE`, và một lượt nộp ghi trước khi có bộ
     * chấm testcase thật sự **không chấm được** theo mô hình này.
     */
    total: integer('total').notNull().default(0),
    /**
     * VÌ SAO lượt này không chấm được. `null` khi nó chấm được bình thường.
     *
     * ## Cột này tồn tại vì hai cột trên KHÔNG phân biệt nổi hai ca
     *
     * Nợ ghi ở `phase-18.md` §0.3a, đo lại ngày 2026-09-15. Đường đẻ ra nó là
     * `submit.ts` nhánh `engine-khong-tat-dinh`:
     *
     * ```ts
     * if (status === 'engine-khong-tat-dinh') return gradeOf(status, [], testcases.length);
     * ```
     *
     * Nó ghi `passed = []` với `total = <số testcase>`, tức `total > 0`. Đọc lại
     * bằng `problemVerdictOf(0, 5)` ra `WA`, nên lịch sử hiện `WA (0/5)` cho một
     * lượt mà máy chủ đã kết luận là KHÔNG chấm được.
     *
     * ⛔ Và không sửa được bằng cách suy từ `passed.length === 0`: một `WA (0/5)`
     * THẬT — người làm chạy được nhưng không qua case nào — có dữ liệu giống hệt.
     * Hai nguyên nhân, một biểu hiện; cột thứ ba là đường ra duy nhất.
     *
     * Cột lưu MÃ (`PROBLEM_FAILURE_CODES`) chứ không lưu câu tiếng Việt: câu chữ
     * viết cho người đọc và sẽ được sửa, còn mã thì không đổi trong im lặng.
     * `problemFailureMessage` dựng lại câu từ mã, nên lịch sử hiện đúng câu mà
     * lượt nộp đã hiện.
     *
     * ⚠ `null` mang HAI nghĩa và chỗ đọc phải xử cả hai: lượt chấm được bình
     * thường, **và** dòng ghi trước 0015 (cột chưa tồn tại). Phân biệt bằng
     * `total`: `total > 0` + `null` là `WA`/`AC` thật; `total === 0` + `null` là
     * dòng cũ chưa chấm theo testcase.
     */
    failCode: text('fail_code', { enum: PROBLEM_FAILURE_CODES }),
    /** `precision: 3` — cùng lý do keyset đã ghi ở `problems.created_at`. */
    submittedAt: timestamp('submitted_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    // `stats.ts` gộp theo `problem_code` và đếm distinct `user_id`; cặp này phủ
    // cả phép gộp lẫn phép tra "người xem đã giải bài này chưa".
    index('problem_submissions_problem_user_idx').on(table.problemCode, table.userId),
    // `mySubmissions`: keyset `(submitted_at, id)` giảm dần trong phạm vi một người.
    index('problem_submissions_user_submitted_idx').on(table.userId, table.submittedAt),
  ],
);

export type ProblemRow = typeof problems.$inferSelect;
export type NewProblemRow = typeof problems.$inferInsert;
/**
 * Lượt MỞ GỢI Ý của một người trên một bài.
 *
 * ⚠ Bảng thứ BA, ngoài hai bảng brief của lane D liệt kê — thêm vào sau khi hợp
 * đồng đổi ngày 2026-09-08. `ProblemHintTeaser.revealed` viết rõ *"Máy chủ
 * quyết, không phải client"*, và không có bảng này thì máy chủ không có gì để
 * quyết bằng: nó sẽ phải tin một cờ do trình duyệt gửi lên, tức là đúng thứ mà
 * cả cơ chế gợi-ý-có-giá sinh ra để chặn.
 *
 * Bảng này còn bịt một lỗ mà nhật ký một mình không bịt được. Điểm trừ vốn tính
 * từ các action `kind: 'hint'` trong `RunLog`, mà nhật ký thì do client dựng —
 * nên gọi thẳng `problems.revealHint` bằng tab công cụ nhà phát triển và KHÔNG
 * ghi action tương ứng sẽ đọc được gợi ý mà không mất điểm. Có bản ghi phía máy
 * chủ thì `submit.ts` lấy HỢP của hai tập (nhật ký ∪ bảng này) làm tập bị trừ,
 * và đường vòng đó hết tác dụng.
 *
 * Vì sao không lưu nội dung hay điểm trừ ở đây: cả hai đọc được từ
 * `problems.hints` theo `hint_id`. Chép sang đây là lưu trường suy ra được, và
 * nó sẽ nói dối ngay lần đầu người soạn sửa lời một gợi ý.
 *
 * Khoá chính GỘP `(problem_code, user_id, hint_id)`: mở lại một gợi ý đã mở
 * không phải một sự kiện mới, và một `uuid` riêng sẽ cho phép hai dòng cùng
 * nghĩa tồn tại song song — lúc đó "đã mở chưa" có hai câu trả lời.
 */
export const problemHintReveals = pgTable(
  'problem_hint_reveals',
  {
    problemCode: text('problem_code')
      .notNull()
      .references(() => problems.code),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Id trong `problems.hints`. KHÔNG có FK — mảng jsonb không trỏ FK được. */
    hintId: text('hint_id').notNull(),
    revealedAt: timestamp('revealed_at', { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'problem_hint_reveals_pk',
      columns: [table.problemCode, table.userId, table.hintId],
    }),
  ],
);

export type ProblemHintRevealRow = typeof problemHintReveals.$inferSelect;
export type NewProblemHintRevealRow = typeof problemHintReveals.$inferInsert;

export type ProblemSubmissionRow = typeof problemSubmissions.$inferSelect;
export type NewProblemSubmissionRow = typeof problemSubmissions.$inferInsert;

/**
 * Lớp học (18.F).
 *
 * ## Chủ lớp là một CỘT, không phải một dòng thành viên
 *
 * `class_members` chứa ĐÚNG sinh viên. Chủ lớp nằm ở `classes.owner_id`, trỏ
 * tới một tài khoản `admin`. Hai lý do, và cái thứ hai mới là cái nặng:
 *
 *  · Một bảng thành viên mang cả chủ lẫn học viên cần thêm một cột `role` để
 *    phân biệt, mà cột đó chỉ có một giá trị thật (`student`) ở mọi dòng còn
 *    lại. Một cột chỉ mang một giá trị không mang tin gì.
 *  · Nó làm câu hỏi "ai được xem bảng điểm lớp này" có HAI nguồn trả lời
 *    (`owner_id` và một dòng `class_members.role = 'teacher'`), và hai nguồn
 *    thì sớm muộn lệch nhau. Ở đây câu hỏi đó có một nguồn duy nhất.
 *
 * ## ⛔ Những cột đã CÂN NHẮC RỒI BỎ vì suy ra được
 *
 * Repo đã bác đúng khuôn này bốn lần (`problems` không có `solver_count`,
 * `attempt_count`, `acceptance_rate`; `sessions_audit` không có `status`), nên
 * danh sách này là để lần thứ năm không phải tranh luận lại:
 *
 * | Cột bị bỏ | Tính từ đâu |
 * |---|---|
 * | `classes.member_count` | `count(*)` trên `class_members` |
 * | `classes.average_score` | gộp `problem_submissions` theo tập thành viên |
 * | `classes.owner_name` / `owner_email` | join `users` |
 * | `class_members.role` | hằng số; chủ lớp đã là `classes.owner_id` |
 * | `class_members.solved_count` / `last_submitted_at` | gộp `problem_submissions` |
 *
 * Cả năm đều là cùng một cái bẫy: rẻ lúc ghi, rồi phải giữ đồng bộ bằng trigger
 * hoặc cron mãi mãi, và chúng sẽ lệch. `server/classes/scoreboard.ts` tính
 * chúng tại chỗ dùng.
 *
 * ## Vai trò: KHÔNG có `teacher`
 *
 * Chủ dự án chốt 2026-09-11: giảng viên dùng lại `admin`. Cái giá đã được ghi
 * rõ trong `plans/devops-learning-platform/phase-18.md` §2 (một giảng viên được
 * cấp `admin` có TOÀN QUYỀN hệ thống). Đây là đánh đổi có chủ ý ở quy mô một
 * lớp NCKH, không phải sơ suất. Đừng "sửa" nó bằng cách thêm một vai trò thứ tư
 * mà không đổi quyết định ở plan trước.
 */
export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Mô tả ngắn, không bắt buộc. `null` = người tạo không nhập gì. */
    description: text('description'),
    /**
     * Chủ lớp. PHẢI là một tài khoản `admin` lúc tạo, và điều đó kiểm ở tầng
     * ứng dụng (`adminProcedure`) chứ không ở lược đồ: Postgres không có ràng
     * buộc "khoá ngoại tới một dòng có role = 'admin'" mà không dùng trigger,
     * và một trigger ở đây sẽ khoá cứng một quyết định (§ Vai trò ở trên) mà
     * plan đã nói là có thể phải tách lại về sau.
     *
     * ⚠ `cascade`, KHÁC tiền lệ `content_items.author_id` (NO ACTION). Lý do
     * có thật chứ không phải sao chép nhầm: một bài học không chủ vẫn là nội
     * dung người học đọc được, nên chặn xoá tác giả là đúng; còn một lớp không
     * chủ thì KHÔNG ai mở được (mọi điểm cuối của lớp đứng sau `adminProcedure`
     * và lọc theo `owner_id`), tức nó là dữ liệu không với tới được. Chuyển chủ
     * lớp chưa có đường nào ở chặng này.
     */
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** `precision: 3` — cùng lý do keyset đã ghi ở `problems.created_at`. */
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    // Keyset của `classes.list`: `(created_at desc, id desc)`.
    index('classes_created_idx').on(table.createdAt, table.id),
    // Một chủ lớp không có hai lớp trùng tên. Bấm hai lần nút "Tạo lớp" là
    // chuyện thường, và hai dòng trùng tên thì không ai phân biệt được lớp nào
    // là lớp mình vừa thêm sinh viên vào.
    uniqueIndex('classes_owner_name_key').on(table.ownerId, table.name),
  ],
);

/**
 * Thành viên lớp — CHỈ sinh viên. Xem chú thích của `classes`.
 *
 * Khoá chính GỘP `(class_id, user_id)`: "đã ở trong lớp" là một quan hệ, không
 * phải một chuỗi sự kiện. Một `uuid` riêng sẽ cho phép hai dòng cùng nghĩa tồn
 * tại song song, và lúc đó phép đếm sĩ số có hai câu trả lời.
 *
 * Cả hai khoá ngoại đều `cascade`: xoá lớp thì danh sách thành viên của nó hết
 * nghĩa, xoá tài khoản thì tư cách thành viên cũng vậy. KHÔNG có bản ghi nào ở
 * đây cần sống lâu hơn hai bảng gốc — khác `sessions_audit`, bảng này không
 * phải nhật ký.
 */
export const classMembers = pgTable(
  'class_members',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'class_members_pk', columns: [table.classId, table.userId] }),
    // "Những lớp mà người này đang ở trong" — khoá chính gộp mở đầu bằng
    // `class_id` nên không phục vụ được chiều tra ngược này.
    index('class_members_user_idx').on(table.userId),
  ],
);

export type ClassRow = typeof classes.$inferSelect;
export type NewClassRow = typeof classes.$inferInsert;
export type ClassMemberRow = typeof classMembers.$inferSelect;
export type NewClassMemberRow = typeof classMembers.$inferInsert;
