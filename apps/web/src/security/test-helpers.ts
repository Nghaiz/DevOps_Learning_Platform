import { sql } from 'drizzle-orm';
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
 * ## Vì sao chỉ ba bảng
 *
 * `schema.ts` khai `onDelete: 'cascade'` cho mọi khoá ngoại trỏ về `users`,
 * `content_items` và `quizzes`, nên xoá ba bảng gốc là kéo theo `content_steps`,
 * `quiz_questions`, `quiz_choices`, `quiz_attempts`, `quiz_answers`,
 * `lab_attempts`, `progress`, `user_preferences`. Liệt kê tay từng bảng con là
 * một danh sách sẽ trôi khi lược đồ thêm bảng.
 *
 * ⚠ KHÔNG có transaction/rollback trong kiến trúc test này: `testDb()` trả về
 * factory DB của CHÍNH ứng dụng, ghi thẳng vào Postgres dev mà app đang phục vụ.
 * Hàm này giảm thiệt hại; nó không thay thế một DB test riêng.
 */
export async function purgeLeakedFixtures(db: Database): Promise<number> {
  const pattern = FIXTURE_ID_PATTERN;
  const rows = await db.execute(sql`
    WITH
      u AS (DELETE FROM users          WHERE id ~ ${pattern} RETURNING 1),
      c AS (DELETE FROM content_items  WHERE id ~ ${pattern} RETURNING 1),
      q AS (DELETE FROM quizzes        WHERE id ~ ${pattern} RETURNING 1)
    SELECT
      (SELECT count(*) FROM u) + (SELECT count(*) FROM c) + (SELECT count(*) FROM q) AS removed
  `);
  const first = (rows as unknown as ReadonlyArray<Record<string, unknown>>)[0];
  return Number(first?.['removed'] ?? 0);
}
