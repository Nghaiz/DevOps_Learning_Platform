import { sql, type SQL } from 'drizzle-orm';
import { createDatabase, type Database } from '../server/db/client';
import type { AuthedUser, TRPCContext } from '../server/trpc/init';

/**
 * DB dùng chung cho các test rule-0N — một pool cho cả file test-suite, đóng ở
 * `afterAll` từng file (không đóng ở đây vì nhiều test file import module này).
 */
let shared: { db: Database; sql: ReturnType<typeof createDatabase>['sql'] } | null = null;

export function testDb(): Database {
  shared ??= createDatabase();
  return shared.db;
}

export async function closeTestDb(): Promise<void> {
  if (shared !== null) {
    await shared.sql.end({ timeout: 5 });
    shared = null;
  }
}

/**
 * Context tRPC giả cho test router trực tiếp qua `appRouter.createCaller`.
 *
 * `resHeaders` là một `Headers` THẬT chứ không phải stub: `fetchRequestHandler`
 * cũng đưa vào đúng kiểu đó và dựng `Response` từ nó, nên test đọc
 * `ctx.resHeaders.getSetCookie()` là đọc đúng thứ trình duyệt sẽ nhận.
 */
export function ctxFor(user: AuthedUser | null): TRPCContext {
  return { db: testDb(), user, reqHeaders: new Headers(), resHeaders: new Headers() };
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Khuôn id mà `uniqueId` sinh ra: `<tiền tố>-<13 chữ số>-<6 ký tự>`.
 *
 * Dùng để NHẬN DIỆN rác fixture, nên nó phải hẹp. Nội dung thật của nền tảng
 * mang id do người soạn đặt (`dlp-linux-triage`, `ckad-configmap-as-files`) và
 * không bao giờ có khối 13 chữ số ở giữa — 13 chữ số là `Date.now()`, và không
 * ai gõ tay một dấu thời gian mili giây vào id bài học.
 */
const FIXTURE_ID_PATTERN = '^[a-z0-9-]+-[0-9]{13}-[a-z0-9]{6}$';

/**
 * ⛔ Dọn rác fixture còn sót từ những lượt chạy TRƯỚC. Gọi ở `beforeAll`.
 *
 * ## Vì sao `afterAll` một mình là không đủ, và đây không phải phòng xa
 *
 * Đo 2026-09-13 trên Postgres dev: bảng `content_items` có **237 dòng
 * `Lab IDOR fixture`** và 4 dòng `Bài gốc`. 237 dòng ≈ 237 lượt chạy suite —
 * `me-idor.test.ts` chèn fixture với `state: 'published'` và `afterAll` của nó
 * chỉ gọi `closeTestDb()`, không xoá gì. Rác `published` lọt thẳng vào danh mục
 * công khai, và hậu quả đo được: `e2e/flows/lesson.flow.spec.ts` KHÔNG THỂ đỗ,
 * vì bài học published duy nhất trong DB là một fixture rò rỉ tên `Bài gốc`.
 *
 * `authoring.integration.test.ts` thì CÓ dọn, nhưng theo danh sách id tự khai —
 * nên nó rò mỗi khi suite chết hoặc bị ngắt trước `afterAll`.
 *
 * Hai chế độ hỏng đó có chung một điểm: **`afterAll` không chạy khi tiến trình
 * không sống tới đó.** Một lượt dọn ở `beforeAll` thì tự lành — lượt sau luôn
 * dọn hộ lượt trước, kể cả lượt trước bị Ctrl-C.
 *
 * ## Vì sao KHÔNG phải chỉ ba bảng — bản trước sai, và sai ồn ào
 *
 * Bản đầu của hàm này xoá `users` + `content_items` + `quizzes` trong MỘT câu
 * lệnh, với lý lẽ: "`schema.ts` khai `onDelete: 'cascade'` cho mọi khoá ngoại
 * trỏ về ba bảng đó". Câu ấy SAI, và nó sai ở bảy chỗ.
 *
 * Đếm lại bằng cách đọc từng `.references(...)` trong `schema.ts` (2026-09-13),
 * đây là toàn bộ khoá ngoại KHÔNG cascade trỏ về một bảng gốc:
 *
 * | bảng.cột | trỏ về |
 * |---|---|
 * | `content_items.author_id` | `users.id` |
 * | `learning_paths.author_id` | `users.id` |
 * | `quizzes.author_id` | `users.id` |
 * | `problems.author_id` | `users.id` |
 * | `quiz_attempts.quiz_id` | `quizzes.id` |
 * | `problem_submissions.problem_code` | `problems.code` |
 * | `problem_hint_reveals.problem_code` | `problems.code` |
 *
 * Không cái nào là sơ suất: mỗi chỗ đều có chú thích riêng giải thích vì sao
 * NO ACTION mới đúng ("xoá tác giả khi còn bài sẽ LỖI, buộc người vận hành
 * archive hoặc chuyển chủ trước"). Nên đường sửa KHÔNG phải là nới lược đồ —
 * mà là xoá theo đúng thứ tự phụ thuộc, việc của hàm này.
 *
 * Triệu chứng khi sai: `me-idor.test.ts` chết ở `beforeAll` với
 * `Key (id)=(u-author-...) is still referenced from table learning_paths`,
 * rồi hook hết giờ 10 giây. Tức lượt dọn tự-lành ở trên KHÔNG chạy được, và
 * rác vẫn nằm lại — hàm dựng ra để dọn rác lại là thứ chặn việc dọn.
 *
 * ## Vì sao vẫn còn cascade để dựa vào
 *
 * Những bảng con KHÔNG có mặt dưới đây là vì chúng cascade thật:
 * `content_steps`, `content_assets` (← `content_items`); `quiz_questions`,
 * `quiz_choices` (← `quizzes`); `quiz_answers` (← `quiz_attempts`);
 * `learning_path_items` (← `learning_paths`); `progress`, `sessions`,
 * `accounts`, `auth_refresh_tokens`, `lab_attempts`, `user_preferences` (←
 * `users`). Danh sách đó vẫn có thể trôi, nên nó KHÔNG được giữ bằng lời hứa:
 * `purge-completeness.test.ts` hỏi thẳng `information_schema` và đỏ khi lược đồ
 * mọc thêm một khoá ngoại NO ACTION mà hàm này chưa biết.
 *
 * ⚠ KHÔNG có transaction/rollback trong kiến trúc test này: `testDb()` trả về
 * factory DB của CHÍNH ứng dụng, ghi thẳng vào Postgres dev mà app đang phục vụ.
 * Hàm này giảm thiệt hại; nó không thay thế một DB test riêng.
 */
/**
 * Tuổi tối thiểu của một dòng trước khi lượt dọn được phép đụng vào: 15 phút.
 *
 * ⛔ Con số này KHÔNG phải để cho chắc. Không có nó, hàm này ăn thịt đồng loại.
 *
 * Vitest chạy các file test SONG SONG. `me-idor.test.ts` và
 * `authoring.integration.test.ts` đều gọi lượt dọn ở `beforeAll`, và cả hai đều
 * gieo fixture mang cùng khuôn id. Không lọc tuổi thì `beforeAll` của file này
 * xoá đúng những dòng `users` mà file kia vừa chèn xong và sắp dùng — triệu
 * chứng là `Key (author_id)=(u-a-...) is not present in table "users"` ở một
 * câu INSERT, tức một file đỏ vì một file khác dọn dẹp.
 *
 * ⚠ Cái đua đó có từ bản đầu; nó chỉ chưa bao giờ lộ ra vì bản đầu luôn chết ở
 * khoá ngoại `learning_paths` và do đó KHÔNG xoá được gì. Sửa lỗi khoá ngoại là
 * thứ làm nó hiện hình. Ghi ra để không ai đọc đây rồi tưởng cái đua là mới.
 *
 * 15 phút: dài hơn mọi suite DB trong repo này vài bậc (đo 2026-09-13: 6.3s cho
 * cả hai file), nên không lượt chạy song song nào chạm tới ngưỡng; và ngắn hơn
 * khoảng cách giữa hai lượt CI, nên rác của lượt trước luôn đủ già để bị dọn.
 */
export const PURGE_MIN_AGE_MS = 15 * 60 * 1000;

/**
 * Phạm vi mà một lượt dọn được phép xoá, diễn đạt bằng hai vị ngữ SQL.
 *
 * Hai chế độ dùng CHUNG thứ tự xoá ở `runOrderedPurge` — đó là điểm của kiểu
 * này. Thứ tự ấy là thứ duy nhất giữ cho lượt dọn không vấp khoá ngoại, nên nó
 * phải có đúng MỘT bản; một bản chép thứ hai cho `afterAll` là bản sẽ trôi.
 */
interface FixtureScope {
  /** Chọn các dòng `users` thuộc phạm vi (`col` là cột id của bảng `users`). */
  readonly user: (col: string) => SQL;
  /** Chọn dòng theo id của CHÍNH bảng gốc. `false` khi phạm vi chỉ theo chủ sở hữu. */
  readonly self: (col: string) => SQL;
}

/** Dấu thời gian 13 chữ số mà `uniqueId` nhúng vào giữa id. */
function fixtureTimestamp(col: string): SQL {
  return sql`(substring(${sql.raw(col)} from '-([0-9]{13})-'))::bigint`;
}

/** Rác của những lượt TRƯỚC: khớp khuôn fixture VÀ đã đủ già. */
function staleScope(cutoffMs: number): FixtureScope {
  const match = (col: string): SQL =>
    sql`(${sql.raw(col)} ~ ${FIXTURE_ID_PATTERN} AND ${fixtureTimestamp(col)} < ${cutoffMs})`;
  return { user: match, self: match };
}

/** Fixture của CHÍNH lượt này, gọi tên đích danh — không lọc tuổi, không đụng ai khác. */
function ownerScope(userIds: readonly string[]): FixtureScope {
  return {
    user: (col) => sql`${sql.raw(col)} IN (${sql.join(userIds.map((id) => sql`${id}`), sql`, `)})`,
    self: () => sql`false`,
  };
}

/**
 * Thứ tự xoá — KHÔNG hoán đổi được, và chạy TÁCH RỜI chứ không gộp vào một CTE.
 *
 * Lý do không gộp: các nhánh của một `WITH ... DELETE` cùng đọc một ảnh chụp và
 * Postgres không hứa thứ tự giữa chúng, nên một CTE "xoá cả ba bảng" vẫn vấp
 * đúng khoá ngoại mà nó tưởng đã gỡ. Bản đầu của hàm này là một CTE như vậy.
 *
 * Mỗi câu quét hai vế: id của chính dòng khớp phạm vi, HOẶC dòng thuộc về một
 * user trong phạm vi. Vế thứ hai mới là vế bắt được rác thật — một
 * `learning_paths` do fixture tạo có thể mang id do người soạn đặt, nhưng
 * `author_id` của nó thì luôn trỏ về một user fixture.
 */
async function runOrderedPurge(db: Database, scope: FixtureScope): Promise<number> {
  const owners = sql`(SELECT id FROM users WHERE ${scope.user('id')})`;
  const steps = [
    sql`DELETE FROM problem_hint_reveals WHERE problem_code IN
          (SELECT code FROM problems WHERE ${scope.self('code')} OR author_id IN ${owners})`,
    sql`DELETE FROM problem_submissions  WHERE problem_code IN
          (SELECT code FROM problems WHERE ${scope.self('code')} OR author_id IN ${owners})`,
    sql`DELETE FROM problems             WHERE ${scope.self('code')} OR author_id IN ${owners}`,
    sql`DELETE FROM quiz_attempts        WHERE quiz_id IN
          (SELECT id FROM quizzes WHERE ${scope.self('id')} OR author_id IN ${owners})`,
    sql`DELETE FROM quizzes              WHERE ${scope.self('id')} OR author_id IN ${owners}`,
    sql`DELETE FROM learning_paths       WHERE ${scope.self('id')} OR author_id IN ${owners}`,
    sql`DELETE FROM content_items        WHERE ${scope.self('id')} OR author_id IN ${owners}`,
    sql`DELETE FROM users                WHERE ${scope.user('id')}`,
  ];

  let removed = 0;
  for (const statement of steps) {
    const result = await db.execute(statement);
    // `postgres.js` gắn `count` lên chính mảng kết quả của câu không RETURNING.
    removed += Number((result as unknown as { count?: number }).count ?? 0);
  }
  return removed;
}

/**
 * Dọn rác fixture của những lượt TRƯỚC. Gọi ở `beforeAll`.
 *
 * Chỉ đụng dòng đã già hơn `PURGE_MIN_AGE_MS` — xem chú thích của hằng đó về
 * cái đua giữa các file test chạy song song. Muốn xoá fixture của CHÍNH lượt
 * này thì dùng `purgeOwnFixtures`, đừng hạ ngưỡng tuổi.
 */
export async function purgeLeakedFixtures(
  db: Database,
  minAgeMs: number = PURGE_MIN_AGE_MS,
): Promise<number> {
  return runOrderedPurge(db, staleScope(Date.now() - minAgeMs));
}

/**
 * Xoá fixture của CHÍNH lượt này theo id chủ sở hữu. Gọi ở `afterAll`.
 *
 * Khác `purgeLeakedFixtures` ở đúng một điểm, và điểm đó quan trọng: nó gọi tên
 * đích danh, nên nó không thể chạm vào fixture của một file test đang chạy song
 * song. Đó là lý do `afterAll` KHÔNG được gọi lượt dọn theo khuôn với ngưỡng
 * tuổi 0.
 */
export async function purgeOwnFixtures(
  db: Database,
  userIds: readonly string[],
): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }
  return runOrderedPurge(db, ownerScope(userIds));
}

/**
 * Khoá ngoại KHÔNG cascade trỏ về một bảng gốc, mà `runOrderedPurge` đã gỡ
 * trước khi xoá bảng gốc ấy.
 *
 * ⛔ Đây là SỔ ĐĂNG KÝ cho `purge-completeness.test.ts`, không phải tài liệu.
 * Ô test đó đọc `information_schema` của DB thật, liệt kê mọi khoá ngoại
 * `NO ACTION` trỏ về một bảng gốc, rồi đòi từng cái phải có tên ở đây. Thêm một
 * bảng vào lược đồ mà quên dạy lượt dọn xoá nó ⇒ ô đỏ, kèm đúng tên bảng.cột.
 */
export const PURGE_HANDLED_BLOCKING_FKS: ReadonlyArray<`${string}.${string}`> = [
  'content_items.author_id',
  'learning_paths.author_id',
  'quizzes.author_id',
  'problems.author_id',
  'quiz_attempts.quiz_id',
  'problem_submissions.problem_code',
  'problem_hint_reveals.problem_code',
];

/** Bảng gốc mà lượt dọn xoá trực tiếp — cũng là phạm vi quét của cổng trên. */
export const PURGE_ROOT_TABLES: readonly string[] = [
  'users',
  'content_items',
  'quizzes',
  'problems',
];
