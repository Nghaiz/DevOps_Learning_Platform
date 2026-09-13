import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  PURGE_HANDLED_BLOCKING_FKS,
  PURGE_MIN_AGE_MS,
  PURGE_ROOT_TABLES,
  closeTestDb,
  purgeLeakedFixtures,
  purgeOwnFixtures,
  testDb,
} from './test-helpers';

/**
 * ⛔ Cổng cho chính lượt dọn fixture — hỏi DB, không hỏi một danh sách viết tay.
 *
 * ## Vì sao cổng này phải tồn tại
 *
 * `purgeLeakedFixtures` từng mang một chú thích khẳng định "`schema.ts` khai
 * `onDelete: 'cascade'` cho mọi khoá ngoại trỏ về `users`, `content_items` và
 * `quizzes`". Câu đó sai ở bảy khoá ngoại, và **không có gì báo**: hàm chạy
 * xanh suốt trên một DB chưa có `learning_paths` nào của fixture, rồi chết ở
 * `beforeAll` của `me-idor.test.ts` đúng lượt đầu tiên có một dòng như thế.
 *
 * Một lời hứa trong chú thích không gác được lược đồ. `information_schema` thì
 * gác được, vì nó là chính cái mà Postgres đang thi hành.
 *
 * ## Hai vế, và vế thứ hai mới là vế chống nghĩa địa
 *
 * 1. Mọi khoá ngoại `NO ACTION` trỏ về một bảng gốc PHẢI có tên trong
 *    `PURGE_HANDLED_BLOCKING_FKS` — thêm bảng mà quên dạy hàm dọn ⇒ đỏ.
 * 2. Mọi dòng trong `PURGE_HANDLED_BLOCKING_FKS` phải còn tồn tại thật —
 *    một khoá ngoại được đổi sang cascade (hoặc bảng bị xoá) thì dòng khai báo
 *    thành rác, và việc phải làm là XOÁ dòng đó, không phải để nó nằm lại.
 *
 * ## Ô thứ ba: hàm dọn CHẠY ĐƯỢC trên dữ liệu chặn thật
 *
 * Hai ô trên là hợp đồng lược đồ; chúng vẫn xanh nếu ai đó giữ đúng sổ đăng ký
 * mà viết sai thứ tự `DELETE`. Ô thứ ba dựng đúng hình rác đã làm hàm cũ chết
 * (một user fixture + một `learning_paths` thuộc về nó) rồi đòi lượt dọn đi
 * qua được. Bỏ câu `DELETE FROM learning_paths` ⇒ ô này đỏ với đúng lỗi khoá
 * ngoại đã giết `me-idor.test.ts`.
 *
 * ## Ô thứ tư: ĐỐI CHỨNG ÂM cho ngưỡng tuổi
 *
 * Ô thứ ba một mình không phân biệt được "dọn đúng rác cũ" với "dọn sạch mọi
 * thứ khớp khuôn". Cái thứ hai là hành vi đã làm hai file test ăn thịt nhau khi
 * chạy song song, nên nó phải có một ô riêng đỏ khi nó quay lại: một fixture
 * MỚI phải sống sót qua lượt dọn.
 *
 * ⚠ Cần DB thật, cùng ràng buộc với `me-idor.test.ts` và
 * `authoring.integration.test.ts`.
 */

interface BlockingFk {
  readonly table: string;
  readonly column: string;
  readonly target: string;
}

async function blockingForeignKeys(): Promise<readonly BlockingFk[]> {
  const rows = await testDb().execute(sql`
    SELECT
      tc.table_name    AS table_name,
      kcu.column_name  AS column_name,
      ccu.table_name   AS target_table
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON kcu.constraint_name = tc.constraint_name
     AND kcu.constraint_schema = tc.constraint_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.constraint_schema = tc.constraint_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
     AND rc.constraint_schema = tc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND rc.delete_rule = 'NO ACTION'
      AND ccu.table_name IN (${sql.join(
        PURGE_ROOT_TABLES.map((t) => sql`${t}`),
        sql`, `,
      )})
  `);
  return (rows as unknown as ReadonlyArray<Record<string, unknown>>).map((r) => ({
    table: String(r['table_name']),
    column: String(r['column_name']),
    target: String(r['target_table']),
  }));
}

afterAll(async () => {
  await closeTestDb();
});

describe('purgeLeakedFixtures — hợp đồng với lược đồ thật', () => {
  it('mọi khoá ngoại chặn-xoá đều đã được lượt dọn biết tới', async () => {
    const found = await blockingForeignKeys();
    expect(
      found.length,
      'Không đọc được khoá ngoại nào. Hoặc DB rỗng/chưa migrate, hoặc truy vấn ' +
        'information_schema đã hỏng — cả hai đều biến ô này thành một cổng mù.',
    ).toBeGreaterThan(0);

    const known = new Set(PURGE_HANDLED_BLOCKING_FKS);
    const unknown = found
      .map((fk) => `${fk.table}.${fk.column}`)
      .filter((name: string) => !known.has(name as `${string}.${string}`))
      .sort();

    expect(
      unknown,
      'Lược đồ mọc thêm khoá ngoại NO ACTION trỏ về một bảng gốc, và ' +
        '`purgeLeakedFixtures` chưa xoá bảng con đó trước. Để nguyên thì lượt dọn ' +
        'ở `beforeAll` sẽ chết bằng lỗi khoá ngoại và KHÔNG dọn được gì. Thêm câu ' +
        '`DELETE` vào đúng vị trí trong `steps`, rồi khai tên vào ' +
        '`PURGE_HANDLED_BLOCKING_FKS`.',
    ).toEqual([]);
  });

  it('sổ đăng ký không có dòng ôi — mỗi dòng phải còn là một khoá ngoại thật', async () => {
    const found = new Set((await blockingForeignKeys()).map((fk) => `${fk.table}.${fk.column}`));
    const stale = PURGE_HANDLED_BLOCKING_FKS.filter((name) => !found.has(name));

    expect(
      stale,
      'Những dòng này không còn là khoá ngoại NO ACTION nào trong DB — khoá đã ' +
        'đổi sang cascade, đổi tên, hoặc bảng đã bị xoá. XOÁ chúng khỏi ' +
        '`PURGE_HANDLED_BLOCKING_FKS` (và bỏ câu `DELETE` tương ứng nếu nó thành ' +
        'thừa). Giữ lại là dựng một nghĩa địa mà lần sau không ai dám đụng.',
    ).toEqual([]);
  });

  /**
   * Id fixture mang dấu thời gian ở giữa, nên "già" dựng được mà không cần chờ:
   * gõ thẳng một `Date.now()` của quá khứ vào đúng chỗ `uniqueId` đặt nó.
   */
  function agedId(prefix: string, ageMs: number): string {
    const stamp = String(Date.now() - ageMs).padStart(13, '0');
    return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  }

  it('dọn được đúng hình rác đã làm bản trước chết', async () => {
    const db = testDb();
    const userId = agedId('u-purge', PURGE_MIN_AGE_MS * 2);
    const pathId = agedId('lp-purge', PURGE_MIN_AGE_MS * 2);

    await db.execute(sql`
      INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
      VALUES (${userId}, ${`${userId}@dlp.local`}, 'Purge fixture', false, now(), now())
    `);
    // `learning_paths.author_id` KHÔNG cascade — đây chính là khoá ngoại đã làm
    // `me-idor.test.ts` chết ở `beforeAll`.
    await db.execute(sql`
      INSERT INTO learning_paths (id, author_id, state, title, created_at, updated_at)
      VALUES (${pathId}, ${userId}, 'draft', 'Purge fixture path', now(), now())
    `);

    const removed = await purgeLeakedFixtures(db);
    expect(removed).toBeGreaterThanOrEqual(2);

    const left = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM users          WHERE id = ${userId}) AS u,
        (SELECT count(*) FROM learning_paths WHERE id = ${pathId}) AS p
    `);
    const row = (left as unknown as ReadonlyArray<Record<string, unknown>>)[0];
    expect(Number(row?.['u'] ?? -1)).toBe(0);
    expect(Number(row?.['p'] ?? -1)).toBe(0);
  });

  it('đối chứng âm — fixture VỪA tạo sống sót qua lượt dọn', async () => {
    const db = testDb();
    // Không dùng `agedId`: đây phải là một id của HIỆN TẠI, đúng thứ một file
    // test chạy song song vừa gieo xong.
    const userId = agedId('u-fresh', 0);

    await db.execute(sql`
      INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
      VALUES (${userId}, ${`${userId}@dlp.local`}, 'Fresh fixture', false, now(), now())
    `);

    try {
      await purgeLeakedFixtures(db);

      const left = await db.execute(sql`SELECT count(*) AS n FROM users WHERE id = ${userId}`);
      const row = (left as unknown as ReadonlyArray<Record<string, unknown>>)[0];
      expect(
        Number(row?.['n'] ?? -1),
        'Lượt dọn vừa xoá một fixture mới tinh. Chạy song song, đó là fixture mà ' +
          'một file test khác vừa gieo và sắp dùng — nó sẽ đỏ với ' +
          '`... is not present in table "users"` ở một câu INSERT, và trỏ vào sai chỗ. ' +
          'Xem `PURGE_MIN_AGE_MS`.',
      ).toBe(1);
    } finally {
      await purgeOwnFixtures(db, [userId]);
    }
  });
});
