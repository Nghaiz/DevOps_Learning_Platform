import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { getClass } from './crud';

/**
 * Bảng điểm của MỘT lớp (18.F.3).
 *
 * ⛔ Đây là điểm cuối mà ô nghiệm thu **AC-F** nhắm vào: một sinh viên gọi
 * thẳng nó bằng tài khoản của mình phải BỊ TỪ CHỐI. Phép chặn nằm ở
 * `adminProcedure` trong `trpc/routers/classes.ts`, và
 * `classes/authz.integration.test.ts` + `classes/http-wire.integration.test.ts`
 * gác nó ở hai tầng khác nhau. Đừng nới cổng đó để một màn hình nào đó tiện
 * hơn: cả file này là dữ liệu của người khác.
 *
 * ## Mọi con số ở đây đều TÍNH tại chỗ dùng
 *
 * Không cột nào trong `classes`/`class_members` chứa chúng, và điều đó cố ý.
 * `db/schema.ts` liệt kê năm cột đã cân nhắc rồi bỏ vì suy ra được; ba trong
 * số đó (`average_score`, `solved_count`, `last_submitted_at`) chính là những
 * con số hàm này trả về.
 */
export interface ClassScoreRow {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  /** Số BÀI đã thử, không phải số lượt nộp. Một người nộp mười lần một bài là một. */
  readonly attemptedCount: number;
  /** Số BÀI đã giải được ít nhất một lần. */
  readonly solvedCount: number;
  /** Tổng điểm CAO NHẤT theo từng bài. Nộp lại tệ hơn không làm tụt điểm đã có. */
  readonly bestScoreTotal: number;
  /** `null` = chưa nộp bài nào. KHÁC với "nộp lúc epoch". */
  readonly lastSubmittedAt: string | null;
}

interface RawRow {
  readonly user_id: string;
  readonly name: string;
  readonly email: string;
  readonly attempted_count: number;
  readonly solved_count: number;
  readonly best_score_total: number;
  readonly last_submitted_at: Date | null;
}

/**
 * Bảng điểm đầy đủ của một lớp, xếp hạng sẵn.
 *
 * ## Vì sao là SQL thô chứ không phải query builder
 *
 * Phép gộp này có HAI tầng: gộp lần một theo `(user_id, problem_code)` để lấy
 * điểm cao nhất mỗi bài, rồi gộp lần hai theo người. Viết hai tầng đó bằng
 * builder phải dựng một subquery đặt tên rồi join lại, và bản đó dài hơn mà
 * không đọc ra được thứ tự phép gộp. Đây là chỗ SQL nói rõ hơn.
 *
 * ## Vì sao `max(score)` mỗi bài chứ không `sum(score)` mọi lượt
 *
 * `sum` mọi lượt thưởng cho việc nộp đi nộp lại: nộp một bài mười lần được
 * mười lần điểm. `max` theo từng bài là định nghĩa duy nhất khiến "tổng điểm"
 * so sánh được giữa hai sinh viên nộp số lần khác nhau.
 *
 * ## ⚠ KHÔNG phân trang, và đây là giả định phải nói ra
 *
 * Một lớp ở quy mô NCKH là hàng chục người, nên trả hết một lượt là đúng và
 * người chấm cũng cần nhìn cả bảng cùng lúc. Nếu sĩ số lên tới hàng nghìn thì
 * ĐÂY là chỗ phải thêm keyset, và khoá sắp xếp hiện tại (`best_score_total`)
 * không duy nhất nên nó sẽ phải kèm `user_id` làm khoá phá hoà, y như con trỏ
 * của `classes.list`.
 *
 * ## Thứ tự: số trước, `user_id` sau. KHÔNG sắp theo TÊN.
 *
 * Postgres bản `alpine` chạy trên musl, không có locale, nên nó sắp chuỗi theo
 * thứ tự C: mọi ký tự tiếng Việt có dấu rơi xuống sau `Z`. Một bảng điểm sắp
 * theo `name` sẽ đặt "Đặng" sau "Zulu", và không lỗi nào báo. `user_id` là
 * khoá phá hoà duy nhất theo từng dòng nên trang không bao giờ nhảy cóc.
 */
export async function classScoreboard(
  db: Database,
  classId: string,
): Promise<readonly ClassScoreRow[]> {
  // NOT_FOUND cho một lớp không tồn tại, thay vì một bảng rỗng: "lớp chưa ai
  // nộp bài" và "lớp không có thật" là hai câu trả lời khác nhau.
  await getClass(db, classId);

  const rows = await db.execute(sql`
    with best as (
      select
        ps.user_id                as user_id,
        ps.problem_code           as problem_code,
        max(ps.score)             as best_score,
        bool_or(ps.solved)        as solved,
        max(ps.submitted_at)      as last_submitted_at
      from problem_submissions ps
      join class_members cm on cm.user_id = ps.user_id and cm.class_id = ${classId}
      group by ps.user_id, ps.problem_code
    )
    select
      u.id                                                         as user_id,
      u.name                                                       as name,
      u.email                                                      as email,
      (count(b.problem_code))::int                                 as attempted_count,
      (count(b.problem_code) filter (where b.solved))::int          as solved_count,
      (coalesce(sum(b.best_score), 0))::int                        as best_score_total,
      max(b.last_submitted_at)                                     as last_submitted_at
    from class_members cm
    join users u on u.id = cm.user_id
    left join best b on b.user_id = cm.user_id
    where cm.class_id = ${classId}
    group by u.id, u.name, u.email
    order by best_score_total desc, solved_count desc, u.id asc
  `);

  return (rows as unknown as readonly RawRow[]).map((row) => ({
    userId: row.user_id,
    name: row.name,
    email: row.email,
    attemptedCount: row.attempted_count,
    solvedCount: row.solved_count,
    bestScoreTotal: row.best_score_total,
    // `max()` trên tập rỗng trả `NULL`, và một `LEFT JOIN` không khớp cũng vậy.
    // Cả hai đọc ra là "chưa nộp bài nào", đúng thứ hợp đồng trên khai.
    lastSubmittedAt: row.last_submitted_at === null ? null : row.last_submitted_at.toISOString(),
  }));
}
