import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import type { Database } from '../db/client';
import { decodeCreatedAtCursor, encodeCreatedAtCursor } from '../db/created-at-cursor';
import { classMembers, classes, examAttempts, exams, problems, users } from '../db/schema';
import type { ExamSeedStrategy } from '../db/schema';
import { isExamOpen } from './clock';
import { composeIssues } from './compose-gate';
import type { ExamProblemFacts } from './compose-gate';

/**
 * Đọc/ghi kỳ thi (§18.G.1, §18.G.2).
 *
 * ⛔ KHÔNG có phép kiểm vai trò nào cho đường SOẠN ĐỀ trong file này, cùng chủ
 * ý như `classes/crud.ts`: mọi đường vào soạn đề là `adminProcedure`, và một
 * phép kiểm thứ hai ở đây sẽ là nguồn sự thật thứ hai cho cùng một câu hỏi.
 *
 * ⚠ Ngoại lệ, và nó KHÁC `classes`: ba hàm cuối file (`startAttempt`,
 * `getAttemptFor`, `submitAttempt`) phục vụ NGƯỜI HỌC. Chúng nhận `userId` và
 * lọc cứng theo nó — đó là phép kiểm quyền duy nhất chúng có, và nó nằm ở đây
 * chứ không ở router vì nó là một điều kiện của truy vấn, không phải một cổng
 * đứng trước. Gọi chúng với một `userId` không phải của người đang đăng nhập
 * là đường duy nhất làm rò lượt thi của người khác.
 */

export interface ExamSummary {
  readonly id: string;
  readonly classId: string;
  readonly className: string;
  readonly title: string;
  readonly problemCodes: readonly string[];
  readonly durationMinutes: number;
  readonly seedStrategy: ExamSeedStrategy;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly createdAt: string;
  /**
   * ĐẾM tại chỗ dùng, không phải một cột `exams.attempt_count`. Cùng lý do đã
   * ghi ở `ClassSummary.memberCount` — rẻ lúc ghi, rồi lệch mãi mãi.
   */
  readonly attemptCount: number;
}

const attemptCountSql = sql<number>`(
  select count(*)::int from ${examAttempts} where ${examAttempts.examId} = ${exams.id}
)`;

const summaryColumns = {
  id: exams.id,
  classId: exams.classId,
  className: classes.name,
  title: exams.title,
  problemCodes: exams.problemCodes,
  durationMinutes: exams.durationMinutes,
  seedStrategy: exams.seedStrategy,
  opensAt: exams.opensAt,
  closesAt: exams.closesAt,
  createdAt: exams.createdAt,
  attemptCount: attemptCountSql,
} as const;

function toSummary(row: {
  id: string;
  classId: string;
  className: string;
  title: string;
  problemCodes: string[];
  durationMinutes: number;
  seedStrategy: ExamSeedStrategy;
  opensAt: Date | null;
  closesAt: Date | null;
  createdAt: Date;
  attemptCount: number;
}): ExamSummary {
  return {
    ...row,
    opensAt: row.opensAt?.toISOString() ?? null,
    closesAt: row.closesAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ExamComposeBody {
  readonly classId: string;
  readonly title: string;
  readonly problemCodes: readonly string[];
  readonly durationMinutes: number;
  readonly seedStrategy: ExamSeedStrategy;
  readonly opensAt: Date | null;
  readonly closesAt: Date | null;
}

/**
 * Tra trạng thái + `seedable` của một danh sách mã bài, cho cổng soạn đề.
 *
 * Trả về một dòng cho MỌI mã được hỏi, kể cả mã không tra ra gì (`state: null`).
 * Nếu chỉ trả những mã tìm thấy thì cổng phải tự suy ra mã nào vắng mặt, và
 * "vắng mặt" là đúng ca mà một phép suy dễ bỏ sót nhất.
 */
export async function examProblemFacts(
  db: Database,
  codes: readonly string[],
): Promise<readonly ExamProblemFacts[]> {
  const unique = [...new Set(codes)];
  if (unique.length === 0) {
    return [];
  }
  const rows = await db
    .select({ code: problems.code, state: problems.state, seedable: problems.seedable })
    .from(problems)
    .where(inArray(problems.code, unique));
  const found = new Map(rows.map((row) => [row.code, row]));
  return unique.map((code) => {
    const row = found.get(code);
    return row === undefined
      ? { code, state: null, seedable: false }
      : { code, state: row.state, seedable: row.seedable };
  });
}

/**
 * Chạy cổng soạn đề và NÉM nếu có vấn đề.
 *
 * Gộp các câu lỗi thành một thông điệp thay vì ném cái đầu tiên: người ra đề
 * sửa một lượt thì tốt hơn sửa từng cái rồi bấm lưu bốn lần.
 */
async function assertComposable(db: Database, body: ExamComposeBody): Promise<void> {
  const facts = await examProblemFacts(db, body.problemCodes);
  const issues = composeIssues(body, facts);
  if (issues.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: issues.map((issue) => issue.message).join(' · '),
    });
  }
}

/** Danh sách kỳ thi, mới nhất trước. Keyset `(created_at desc, id desc)`. */
export async function listExamsPage(
  db: Database,
  options: {
    readonly limit: number;
    readonly cursor?: string | undefined;
    readonly classId?: string | undefined;
  },
): Promise<{ items: readonly ExamSummary[]; nextCursor: string | null }> {
  const after = options.cursor === undefined ? null : decodeCreatedAtCursor(options.cursor);
  const keyset =
    after === null
      ? undefined
      : or(
          lt(exams.createdAt, new Date(after.createdAtMs)),
          and(eq(exams.createdAt, new Date(after.createdAtMs)), lt(exams.id, after.id)),
        );
  const scope = options.classId === undefined ? undefined : eq(exams.classId, options.classId);

  const rows = await db
    .select(summaryColumns)
    .from(exams)
    .innerJoin(classes, eq(classes.id, exams.classId))
    .where(and(keyset, scope))
    .orderBy(desc(exams.createdAt), desc(exams.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toSummary),
    nextCursor: hasMore && last !== undefined ? encodeCreatedAtCursor(last) : null,
  };
}

export async function getExam(db: Database, examId: string): Promise<ExamSummary> {
  const [row] = await db
    .select(summaryColumns)
    .from(exams)
    .innerJoin(classes, eq(classes.id, exams.classId))
    .where(eq(exams.id, examId))
    .limit(1);
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có kỳ thi đó' });
  }
  return toSummary(row);
}

/**
 * Tạo kỳ thi. Chủ đề thi LUÔN là người đang gọi, không nhận `ownerId` từ input
 * — cùng lý do đã ghi ở `createClass`.
 *
 * `fixedSeed` do MÁY CHỦ sinh khi `seedStrategy = 'fixed'`, không nhận từ
 * input. Nhận nó qua dây thì người ra đề chọn được một seed mà họ đã thử trước,
 * và "đề chung cho cả lớp" thành "đề người ra đề đã biết trước".
 */
export async function createExam(
  db: Database,
  ownerId: string,
  body: ExamComposeBody,
): Promise<ExamSummary> {
  await assertComposable(db, body);
  const [inserted] = await db
    .insert(exams)
    .values({
      ownerId,
      classId: body.classId,
      title: body.title,
      problemCodes: [...body.problemCodes],
      durationMinutes: body.durationMinutes,
      seedStrategy: body.seedStrategy,
      fixedSeed: body.seedStrategy === 'fixed' ? randomSeed() : null,
      opensAt: body.opensAt,
      closesAt: body.closesAt,
    })
    .returning({ id: exams.id });
  if (inserted === undefined) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Không tạo được kỳ thi' });
  }
  return getExam(db, inserted.id);
}

/**
 * Sửa kỳ thi.
 *
 * ⚠ KHÔNG chặn sửa khi đã có lượt làm bài, và điều đó AN TOÀN đúng vì
 * `exam_attempts.duration_minutes` là ảnh chụp: sửa thời lượng chỉ ảnh hưởng
 * những lượt mở SAU đó. Chốt bởi chủ dự án 2026-09-15.
 *
 * ⛔ `seedStrategy` thì KHÁC và bị chặn khi đã có lượt. Đổi nó giữa chừng chia
 * lớp làm hai nhóm làm hai loại đề trong cùng một kỳ thi, và không cột nào ghi
 * lại nhóm nào là nhóm nào — bảng điểm sẽ so hai thứ không so được.
 */
export async function updateExam(
  db: Database,
  examId: string,
  body: ExamComposeBody,
): Promise<ExamSummary> {
  const current = await getExam(db, examId);
  await assertComposable(db, body);
  if (current.attemptCount > 0 && current.seedStrategy !== body.seedStrategy) {
    throw new TRPCError({
      code: 'CONFLICT',
      message:
        'Kỳ thi đã có người vào làm, không đổi được cách sinh đề — nửa lớp sẽ làm một loại đề khác nửa còn lại',
    });
  }
  await db
    .update(exams)
    .set({
      classId: body.classId,
      title: body.title,
      problemCodes: [...body.problemCodes],
      durationMinutes: body.durationMinutes,
      seedStrategy: body.seedStrategy,
      opensAt: body.opensAt,
      closesAt: body.closesAt,
    })
    .where(eq(exams.id, examId));
  return getExam(db, examId);
}

export async function deleteExam(db: Database, examId: string): Promise<void> {
  const deleted = await db.delete(exams).where(eq(exams.id, examId)).returning({ id: exams.id });
  if (deleted.length === 0) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có kỳ thi đó' });
  }
}

// ── Đường của NGƯỜI HỌC ─────────────────────────────────────────────────────

/**
 * Seed máy chủ cấp. 31 bit dương, cùng dải với seed arena tự sinh
 * (`Math.floor(Math.random() * 2 ** 31)`) — không phải tình cờ: hai bên phải
 * so bằng được với nhau, nên chúng phải nằm cùng một dải giá trị.
 */
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export interface AttemptRow {
  readonly examId: string;
  readonly userId: string;
  readonly seed: number;
  readonly durationMinutes: number;
  readonly startedAt: Date;
  readonly submittedAt: Date | null;
}

export async function getAttemptFor(
  db: Database,
  examId: string,
  userId: string,
): Promise<AttemptRow | null> {
  const [row] = await db
    .select()
    .from(examAttempts)
    .where(and(eq(examAttempts.examId, examId), eq(examAttempts.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Mở lượt thi, hoặc trả lại lượt đang có.
 *
 * ## Vì sao nó KHÔNG BAO GIỜ tạo lượt thứ hai
 *
 * `onConflictDoNothing` trên khoá chính gộp `(exam_id, user_id)`, rồi đọc lại.
 * Bấm hai lần nút "Bắt đầu", hai tab cùng mở, hay một lượt F5 đúng lúc — cả ba
 * đều phải ra CÙNG một lượt với CÙNG một seed và CÙNG một `started_at`. Một
 * bản kiểm-rồi-mới-ghi sẽ đua với chính nó ở đây, và giải thưởng cho người
 * thắng cuộc đua là một đồng hồ được đặt lại.
 *
 * ## Ba cổng trước khi mở
 *
 * Người không thuộc lớp KHÔNG mở được: đó là vế "sinh viên chỉ thấy phần của
 * mình" ở tầng ghi. Kỳ thi ngoài cửa sổ thời gian cũng không.
 */
export async function startAttempt(
  db: Database,
  examId: string,
  userId: string,
  now: Date,
): Promise<AttemptRow> {
  const existing = await getAttemptFor(db, examId, userId);
  if (existing !== null) {
    return existing;
  }

  const [exam] = await db
    .select({
      classId: exams.classId,
      durationMinutes: exams.durationMinutes,
      seedStrategy: exams.seedStrategy,
      fixedSeed: exams.fixedSeed,
      opensAt: exams.opensAt,
      closesAt: exams.closesAt,
    })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);
  if (exam === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có kỳ thi đó' });
  }

  const [membership] = await db
    .select({ userId: classMembers.userId })
    .from(classMembers)
    .where(and(eq(classMembers.classId, exam.classId), eq(classMembers.userId, userId)))
    .limit(1);
  if (membership === undefined) {
    // NOT_FOUND chứ không FORBIDDEN: một người ngoài lớp không cần biết kỳ thi
    // này có tồn tại hay không.
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có kỳ thi đó' });
  }

  if (!isExamOpen(exam, now)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Kỳ thi chưa mở hoặc đã đóng' });
  }

  /*
   * `fixed` dùng seed của kỳ thi; `per-student` sinh riêng. `fixedSeed` về lý
   * thuyết không thể `null` khi `seedStrategy = 'fixed'` (chính `createExam`
   * đặt nó), nhưng một dòng cũ hoặc một lượt sửa tay trong DB thì có thể — nên
   * ở đây có phòng hờ thay vì một `!`.
   */
  const seed =
    exam.seedStrategy === 'fixed' && exam.fixedSeed !== null ? exam.fixedSeed : randomSeed();

  await db
    .insert(examAttempts)
    .values({
      examId,
      userId,
      seed,
      durationMinutes: exam.durationMinutes,
      startedAt: now,
    })
    .onConflictDoNothing({ target: [examAttempts.examId, examAttempts.userId] });

  const created = await getAttemptFor(db, examId, userId);
  if (created === null) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Không mở được lượt thi' });
  }
  return created;
}

/**
 * Bấm nộp. Ghi `submitted_at` MỘT lần.
 *
 * `where submitted_at is null` chứ không đọc-rồi-ghi: hai tab cùng bấm nộp thì
 * mốc nộp phải là lần đầu, không phải lần cuối. Không ném khi đã nộp rồi —
 * người bấm hai lần đang muốn đúng một kết quả, và họ đã có nó.
 */
export async function submitAttempt(
  db: Database,
  examId: string,
  userId: string,
  now: Date,
): Promise<AttemptRow> {
  await db
    .update(examAttempts)
    .set({ submittedAt: now })
    .where(
      and(
        eq(examAttempts.examId, examId),
        eq(examAttempts.userId, userId),
        sql`${examAttempts.submittedAt} is null`,
      ),
    );
  const row = await getAttemptFor(db, examId, userId);
  if (row === null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Bạn chưa mở lượt thi này' });
  }
  return row;
}

/** Tên + email của những người đã vào làm, cho bảng điểm. */
export async function listAttemptRows(
  db: Database,
  examId: string,
): Promise<
  readonly (AttemptRow & { readonly name: string; readonly email: string })[]
> {
  return db
    .select({
      examId: examAttempts.examId,
      userId: examAttempts.userId,
      seed: examAttempts.seed,
      durationMinutes: examAttempts.durationMinutes,
      startedAt: examAttempts.startedAt,
      submittedAt: examAttempts.submittedAt,
      name: users.name,
      email: users.email,
    })
    .from(examAttempts)
    .innerJoin(users, eq(users.id, examAttempts.userId))
    .where(eq(examAttempts.examId, examId))
    .orderBy(users.name, examAttempts.userId);
}
