import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, gt, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { classMembers, classes, users } from '../db/schema';
import { decodeClassCursor, encodeClassCursor } from './cursor';

/**
 * Đọc/ghi lớp học (18.F.1 + 18.F.2).
 *
 * ⛔ KHÔNG có phép kiểm vai trò nào trong file này, và đó là chủ ý: mọi đường
 * vào đều là `adminProcedure` (`trpc/routers/classes.ts`), nên một phép kiểm
 * thứ hai ở đây sẽ là nguồn sự thật thứ hai cho cùng một câu hỏi. Ngược lại,
 * đừng gọi thẳng các hàm này từ một procedure KHÔNG phải admin: đó là đường
 * duy nhất làm chúng rò dữ liệu của lớp ra ngoài.
 */

export interface ClassSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly ownerEmail: string;
  /**
   * ĐẾM tại chỗ dùng, không phải một cột `classes.member_count`.
   *
   * Cột đó là cái bẫy repo đã bác bốn lần (xem chú thích của `classes` trong
   * `db/schema.ts`): rẻ lúc ghi, rồi phải giữ đồng bộ mãi mãi bằng trigger, và
   * nó sẽ lệch ngay lần đầu một tài khoản bị xoá.
   */
  readonly memberCount: number;
  readonly createdAt: string;
}

export interface ClassMemberView {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly joinedAt: string;
}

/** Phép đếm sĩ số, viết MỘT lần và dùng lại ở cả `list` lẫn `get`. */
const memberCountSql = sql<number>`(
  select count(*)::int from ${classMembers} where ${classMembers.classId} = ${classes.id}
)`;

const summaryColumns = {
  id: classes.id,
  name: classes.name,
  description: classes.description,
  ownerId: classes.ownerId,
  ownerName: users.name,
  ownerEmail: users.email,
  memberCount: memberCountSql,
  createdAt: classes.createdAt,
} as const;

function toSummary(row: {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  createdAt: Date;
}): ClassSummary {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

/**
 * Danh sách lớp, mới nhất trước.
 *
 * Keyset `(created_at desc, id desc)` viết BẰNG `or`/`and` tường minh thay vì
 * một phép so bộ giá trị `(a, b) < (c, d)`: hai cách cho cùng kết quả, nhưng
 * bản tường minh đọc ra được là nó dùng ĐÚNG hai cột mà `classes_created_idx`
 * phủ, còn bản kia thì phải tin vào cách Postgres viết lại biểu thức.
 */
export async function listClassesPage(
  db: Database,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<{ items: readonly ClassSummary[]; nextCursor: string | null }> {
  const after = options.cursor === undefined ? null : decodeClassCursor(options.cursor);
  const keyset =
    after === null
      ? undefined
      : or(
          lt(classes.createdAt, new Date(after.createdAtMs)),
          and(eq(classes.createdAt, new Date(after.createdAtMs)), lt(classes.id, after.id)),
        );

  const rows = await db
    .select(summaryColumns)
    .from(classes)
    .innerJoin(users, eq(users.id, classes.ownerId))
    .where(keyset)
    .orderBy(desc(classes.createdAt), desc(classes.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toSummary),
    nextCursor: hasMore && last !== undefined ? encodeClassCursor(last) : null,
  };
}

export async function getClass(db: Database, classId: string): Promise<ClassSummary> {
  const [row] = await db
    .select(summaryColumns)
    .from(classes)
    .innerJoin(users, eq(users.id, classes.ownerId))
    .where(eq(classes.id, classId))
    .limit(1);
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có lớp đó' });
  }
  return toSummary(row);
}

/**
 * Tạo lớp. Chủ lớp LUÔN là người đang gọi, không nhận `ownerId` từ input.
 *
 * Nhận `ownerId` qua input sẽ mở đúng một lỗ: một admin tạo lớp mang tên người
 * khác làm chủ, và cả màn danh sách lẫn dòng audit đều chỉ về người đó. Người
 * gọi đã có sẵn trong `ctx.user`, nên cầm nó từ input là thêm một đường vào mà
 * không thêm một khả năng nào.
 */
export async function createClass(
  db: Database,
  ownerId: string,
  input: { readonly name: string; readonly description: string | null },
): Promise<ClassSummary> {
  const [inserted] = await db
    .insert(classes)
    .values({ ownerId, name: input.name, description: input.description })
    // `classes_owner_name_key`: bấm hai lần nút "Tạo lớp" là chuyện thường, và
    // một câu 409 nói được phải làm gì thì tốt hơn một lỗi Postgres thô đi qua
    // `errorFormatter` rồi ra thành câu chung chung.
    .onConflictDoNothing({ target: [classes.ownerId, classes.name] })
    .returning({ id: classes.id });
  if (inserted === undefined) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Bạn đã có một lớp trùng tên' });
  }
  return getClass(db, inserted.id);
}

/**
 * Thành viên của một lớp, keyset trên `user_id` tăng dần.
 *
 * Khác `classes.list` (sắp theo thời gian tạo): danh sách sinh viên được đọc
 * để TRA CỨU một cái tên, không để xem ai vào sau cùng, nên một thứ tự ổn định
 * và duy nhất theo từng dòng là đủ. Cùng khuôn `admin.users.list`.
 */
export async function listClassMembersPage(
  db: Database,
  classId: string,
  options: { readonly limit: number; readonly cursor?: string | undefined },
): Promise<{ items: readonly ClassMemberView[]; nextCursor: string | null }> {
  // Lớp không tồn tại phải là NOT_FOUND, không phải một trang rỗng: "lớp này
  // chưa có ai" và "lớp này không có thật" dẫn tới hai việc khác hẳn nhau.
  await getClass(db, classId);

  const conditions = [eq(classMembers.classId, classId)];
  if (options.cursor !== undefined) {
    conditions.push(gt(classMembers.userId, options.cursor));
  }

  const rows = await db
    .select({
      userId: classMembers.userId,
      name: users.name,
      email: users.email,
      joinedAt: classMembers.joinedAt,
    })
    .from(classMembers)
    .innerJoin(users, eq(users.id, classMembers.userId))
    .where(and(...conditions))
    .orderBy(asc(classMembers.userId))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({ ...row, joinedAt: row.joinedAt.toISOString() })),
    nextCursor: hasMore && last !== undefined ? last.userId : null,
  };
}

/**
 * Thêm sinh viên bằng EMAIL.
 *
 * Email chứ không phải id: người vận hành lớp có trong tay danh sách email của
 * sinh viên, và không ai có `users.id` (một chuỗi do Better Auth sinh ra).
 *
 * So khớp bằng `lower(...) = lower(...)` chứ KHÔNG bằng `ILIKE`: `ILIKE` đọc
 * `%` và `_` trong chuỗi đầu vào là ký tự đại diện, mà `_` thì hợp lệ trong
 * email. `a_b@x.test` sẽ khớp cả `aXb@x.test`, tức thêm nhầm người vào lớp mà
 * không có dấu hiệu nào. Cái giá là không dùng được `users_email_key`; ở quy
 * mô một thao tác quản trị thủ công thì đó không phải chỗ tốn thời gian.
 */
export async function addClassMemberByEmail(
  db: Database,
  classId: string,
  email: string,
): Promise<ClassMemberView> {
  const target = await getClass(db, classId);

  const [found] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  if (found === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có tài khoản nào mang email đó' });
  }

  /*
    Chủ lớp KHÔNG được là thành viên của chính lớp mình. Đây không phải một quy
    tắc trang trí: `class_members` được định nghĩa là tập SINH VIÊN, và bảng
    điểm đọc đúng tập đó. Để chủ lớp lọt vào là để người chấm điểm xuất hiện
    trong bảng điểm của chính mình, và mọi phép tính trên sĩ số sau đó lệch một.
  */
  if (found.id === target.ownerId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Chủ lớp không thể đồng thời là sinh viên của lớp mình',
    });
  }

  const [inserted] = await db
    .insert(classMembers)
    .values({ classId, userId: found.id })
    .onConflictDoNothing({ target: [classMembers.classId, classMembers.userId] })
    .returning({ joinedAt: classMembers.joinedAt });
  if (inserted === undefined) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Người này đã ở trong lớp' });
  }

  return {
    userId: found.id,
    name: found.name,
    email: found.email,
    joinedAt: inserted.joinedAt.toISOString(),
  };
}

/**
 * Bỏ một sinh viên khỏi lớp.
 *
 * KHÔNG im lặng khi không có gì để xoá: một nút "Bỏ khỏi lớp" báo thành công
 * trong khi không xoá dòng nào là một no-op đội lốt, và người bấm sẽ tin rằng
 * danh sách đã đổi. `NOT_FOUND` nói thẳng rằng tư cách thành viên đó không còn
 * (có thể người khác vừa bỏ trước, hoặc tài khoản đã bị xoá).
 */
export async function removeClassMember(
  db: Database,
  classId: string,
  userId: string,
): Promise<{ readonly userId: string }> {
  const removed = await db
    .delete(classMembers)
    .where(and(eq(classMembers.classId, classId), eq(classMembers.userId, userId)))
    .returning({ userId: classMembers.userId });
  const row = removed[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Người này không ở trong lớp' });
  }
  return row;
}
