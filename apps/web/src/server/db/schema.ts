import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CONTENT_KINDS,
  CONTENT_STATES,
} from '@devops-platform/shared-types/authoring';
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
  ],
);

export type AuthRefreshToken = typeof authRefreshTokens.$inferSelect;
export type NewAuthRefreshToken = typeof authRefreshTokens.$inferInsert;

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
