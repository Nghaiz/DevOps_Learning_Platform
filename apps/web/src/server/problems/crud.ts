import { TRPCError } from '@trpc/server';
import { count, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { ProblemState } from '@devops-platform/games';
import type { Database } from '../db/client';
import { isUniqueViolation } from '../db/pg-errors';
import { problems, problemSubmissions } from '../db/schema';
import type { AuthedUser } from '../trpc/init';
import { findProblemForWrite } from './authz';
import { toProblemDTO, type StoredProblem } from './dto';
import { nextProblemCode } from './next-code';
import { publishIssues } from './publish-gate';
import type { ProblemBody } from './validate';

/**
 * Số lần thử cấp mã trước khi bỏ cuộc.
 *
 * Mỗi lần thua một cuộc đua thì mã kế tiếp tiến lên một, nên năm lần chỉ thua
 * khi có năm lượt tạo bài đồng thời — một con số mà trang soạn bài không tới
 * được. Không lặp vô hạn: nếu `23505` tới từ `slug` chứ không từ `code` thì lặp
 * lại sẽ vấp y hệt mãi mãi, và một vòng lặp vô hạn im lặng tệ hơn một lỗi.
 */
const CODE_ATTEMPTS = 5;

/**
 * Tạo bài mới. Luôn ra đời ở `draft`.
 *
 * Vòng lặp là chống đua trên MÃ, không phải trên slug — xem `next-code.ts`. Một
 * `23505` ở lần thử cuối được dịch sang câu nói được thay vì để nó thành 500:
 * hai nguyên nhân khả dĩ (`slug` trùng, hoặc thua đua mã năm lần) cần hai hành
 * động khác nhau từ người soạn, nên không gộp thành một câu.
 */
export async function createProblem(
  db: Database,
  authorId: string,
  body: ProblemBody,
): Promise<StoredProblem> {
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const code = await nextProblemCode(db);
    try {
      const rows = await db
        .insert(problems)
        .values({ ...toRowValues(body), code, authorId, state: 'draft', updatedAt: new Date() })
        .returning();
      const row = rows[0];
      if (row === undefined) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Không tạo được bài' });
      }
      return toProblemDTO(row);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      if (await slugTaken(db, body.slug, null)) {
        throw new TRPCError({ code: 'CONFLICT', message: `Slug "${body.slug}" đã có bài khác dùng` });
      }
      // Không phải slug ⇒ thua đua mã. Vòng lặp tính lại `max(code)`, giờ đã gồm
      // dòng của người thắng.
    }
  }
  throw new TRPCError({
    code: 'CONFLICT',
    message: 'Không cấp được mã bài sau nhiều lần thử — hãy thử lại',
  });
}

export async function updateProblem(
  db: Database,
  user: AuthedUser,
  code: string,
  body: ProblemBody,
): Promise<StoredProblem> {
  await findProblemForWrite(db, user, code);
  if (await slugTaken(db, body.slug, code)) {
    throw new TRPCError({ code: 'CONFLICT', message: `Slug "${body.slug}" đã có bài khác dùng` });
  }
  const rows = await db
    .update(problems)
    // `code`, `authorId`, `state` KHÔNG nằm trong `body` (schema không khai
    // chúng), nên phép `set` này không có đường đổi chủ sở hữu hay đổi trạng
    // thái — đó là ràng buộc của KIỂU, không phải của một dòng kiểm tra.
    .set({ ...toRowValues(body), updatedAt: new Date() })
    .where(eq(problems.code, code))
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
  }
  return toProblemDTO(row);
}

/**
 * Xuất bản — cổng cuối, và là cổng CHẶT hơn cổng lưu nháp.
 *
 * Ném `BAD_REQUEST` với `cause` là `ZodError`, nên `errorFormatter` của repo đưa
 * nó ra client dưới `data.zodError` có `path` theo từng field. Client chặn trước
 * cho người dùng đỡ mất công, nhưng lớp này mới là lớp có hiệu lực.
 */
export async function publishProblem(
  db: Database,
  user: AuthedUser,
  code: string,
): Promise<StoredProblem> {
  const row = await findProblemForWrite(db, user, code);
  const issues = publishIssues({
    statement: row.statement,
    objectives: row.objectives,
    hints: row.hints,
  });
  if (issues.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Bài chưa đủ điều kiện xuất bản',
      cause: new z.ZodError([...issues]),
    });
  }
  return setState(db, code, 'published');
}

export async function archiveProblem(
  db: Database,
  user: AuthedUser,
  code: string,
): Promise<StoredProblem> {
  await findProblemForWrite(db, user, code);
  return setState(db, code, 'archived');
}

/**
 * Xoá — CHỈ khi chưa ai nộp bài.
 *
 * Cùng lý lẽ đã ghi cho `content_items`: xoá một bài đã có người làm là xoá lịch
 * sử của họ, và một cú bấm trên trang soạn không được phép làm điều đó im lặng.
 * Khoá ngoại `problem_submissions.problem_code` cố ý KHÔNG cascade, nên kể cả
 * khi kiểm tra dưới đây bị bỏ qua thì Postgres vẫn chặn — hai lớp, và lớp dưới
 * không phụ thuộc vào việc lớp trên được gọi.
 */
export async function deleteProblem(
  db: Database,
  user: AuthedUser,
  code: string,
): Promise<{ readonly code: string }> {
  await findProblemForWrite(db, user, code);
  const rows = await db
    .select({ total: count() })
    .from(problemSubmissions)
    .where(eq(problemSubmissions.problemCode, code));
  const total = rows[0]?.total ?? 0;
  if (total > 0) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Bài đã có ${String(total)} lượt nộp — dùng "lưu trữ" thay vì xoá để không mất lịch sử của người học`,
    });
  }
  await db.delete(problems).where(eq(problems.code, code));
  return { code };
}

async function setState(db: Database, code: string, state: ProblemState): Promise<StoredProblem> {
  const rows = await db
    .update(problems)
    .set({ state, updatedAt: new Date() })
    .where(eq(problems.code, code))
    .returning();
  const row = rows[0];
  if (row === undefined) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Không có bài đó' });
  }
  return toProblemDTO(row);
}

/**
 * Body hợp đồng → giá trị cột.
 *
 * Ghi ra từng field thay vì `...body`: hợp đồng dùng mảng `readonly`, còn kiểu
 * insert của Drizzle đòi mảng ghi được, nên mỗi mảng phải sao chép. Một
 * `...body` sẽ đỏ ở đúng những field ấy, và cách vá nhanh là một `as` — thứ sẽ
 * im lặng nuốt một field thật sự sai vào lần sau ai đó thêm cột.
 *
 * Nó cũng là chỗ khẳng định lần nữa rằng `code`/`authorId`/`state` KHÔNG tới từ
 * body: chúng không có trong hàm này, nên không có đường nào cho chúng đi qua.
 *
 * ⛔ ĐÃ MỞ 2026-09-15 (§18.D.1 nửa sau). Bản trước bỏ qua `gameId`/`seedable`/
 * `targetState` và dựa vào DEFAULT của migration 0015 (`'k8s'`, `false`, `null`),
 * nên mọi bài ghi ra đều là bài K8s không seed được — kể cả khi người soạn chọn
 * Git trên màn hình. Ba dòng dưới đây là thứ làm ô chọn game có tác dụng thật.
 */
function toRowValues(body: ProblemBody) {
  return {
    gameId: body.gameId,
    slug: body.slug,
    title: body.title,
    statement: body.statement,
    difficulty: body.difficulty,
    topics: [...body.topics],
    tags: [...body.tags],
    timeLimitSec: body.timeLimitSec,
    initialState: body.initialState,
    /*
     * `targetState` vắng mặt ⇒ ghi `null`, KHÔNG bỏ khoá.
     *
     * Hai thứ trông giống nhau và khác nhau ở `update`: bỏ khoá thì `.set()` của
     * Drizzle GIỮ NGUYÊN giá trị cũ trong cột, nên một người soạn xoá trạng thái
     * đích của bài sẽ thấy nó quay lại sau khi tải trang. Ghi `null` tường minh
     * là phép xoá thật. Hợp đồng (`ProblemBase.targetState?`) dùng "vắng mặt"
     * còn cột dùng `null`; đây là chỗ đổi giữa hai quy ước đó.
     */
    targetState: body.targetState ?? null,
    /*
     * ⛔ Phép ép `as unknown as Testcase[]` ĐÃ GỠ ở đợt này — ghi lại vì lý do nó
     * tồn tại đã chết, chứ không phải vì nó được "dọn".
     *
     * Nó có mặt vì hai hình dạng không so sánh được: cột khai `$type<Testcase[]>`
     * (có `visible`), còn `problemBodyShape` khi đó nhận `Objective` cũ (có
     * `required`). Nay `testcaseSchema` ở `validate.ts` nhận đúng `Testcase`, nên
     * hai đầu khớp nhau thật và phép ép không còn gì để nói.
     *
     * ⚠ Chú thích cũ ở đây cảnh báo rằng `replay.ts` § `isSolved` lọc
     * `objectives.filter((o) => o.required)` nên bỏ `required` sẽ làm mọi lượt
     * nộp đọc ra "chưa giải". Cảnh báo đó nay SAI — đo lại 2026-09-15:
     * `isSolved` đã đổi sang `problem.testcases.every(...)` trên MỌI testcase
     * (plan §0.4 mục 1). Để nguyên một cảnh báo đã hết hiệu lực thì lần sau sẽ
     * có người tin nó và không dám gỡ.
     */
    objectives: [...body.objectives],
    allowedResources: body.allowedResources === null ? null : [...body.allowedResources],
    hints: [...body.hints],
    parMoves: body.parMoves,
    seedable: body.seedable,
  };
}

/** `exceptCode` cho phép một bài giữ nguyên slug của chính nó khi sửa. */
async function slugTaken(db: Database, slug: string, exceptCode: string | null): Promise<boolean> {
  const rows = await db
    .select({ code: problems.code })
    .from(problems)
    .where(eq(problems.slug, slug))
    .limit(2);
  return rows.some((row) => row.code !== exceptCode);
}
