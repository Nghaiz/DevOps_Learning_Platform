import { TRPCError } from '@trpc/server';

/**
 * Con trỏ keyset cho mọi bảng sắp xếp theo `(created_at desc, id desc)` với
 * `id` là `uuid`.
 *
 * ## Vì sao nó ở `db/` chứ không nằm trong một miền
 *
 * Bản đầu viết cho `classes` (18.F). §18.G cần y hệt cho `exams`, và một bản
 * sao thứ hai sẽ trôi khỏi bản đầu — hai phép giải mã cho cùng một hình dạng
 * chuỗi là hai chỗ để sửa khi tìm ra một ca biên. `classes/cursor.ts` nay chỉ
 * mở lại tên từ đây.
 *
 * ⚠ `created_at` KHÔNG duy nhất theo từng dòng: hai dòng tạo trong cùng một
 * mili giây là chuyện có thật khi ai đó nhập liệu bằng script, và một keyset
 * chỉ so trên nó sẽ MẤT DÒNG một cách im lặng (không sai thứ tự, không lỗi,
 * chỉ thiếu). Vì vậy con trỏ mang cả `id` làm khoá phá hoà, đúng khuôn
 * `ProblemCursor` đã ghi cho `problems`.
 *
 * Hình dạng `<mili giây>:<uuid>` — không phải một lược đồ thứ ba: `problems`
 * dùng `<tiền tố>:<giá trị>:<định danh>` vì nó có bốn khoá sắp xếp; ở đây chỉ
 * có MỘT khoá nên tiền tố không phân biệt gì cả và chỉ là một ký tự để gõ sai.
 */
export interface CreatedAtCursor {
  readonly createdAtMs: number;
  readonly id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cùng thông điệp mà một con trỏ KHÔNG TỒN TẠI nhận được, và cùng mã 400.
 *
 * Với người gọi, "sai định dạng" và "đã biến mất" dẫn tới đúng một việc phải
 * làm: bắt đầu lại từ trang đầu. Và nó phải là 400 chứ không 500 — nếu để
 * chuỗi lạ đi thẳng vào `WHERE id > $1` thì Postgres ném `22P02` ở tầng kiểu,
 * tức một input hỏng của client đọc ra như một sự cố máy chủ (bẫy đã ghi ở
 * `assertUuidCursor` trong `trpc/init.ts`).
 */
function invalid(): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
}

export function encodeCreatedAtCursor(row: {
  readonly createdAt: Date;
  readonly id: string;
}): string {
  return `${String(row.createdAt.getTime())}:${row.id}`;
}

export function decodeCreatedAtCursor(cursor: string): CreatedAtCursor {
  const parts = cursor.split(':');
  const [rawMs, id] = parts;
  if (parts.length !== 2 || rawMs === undefined || id === undefined || !UUID_RE.test(id)) {
    invalid();
  }
  const createdAtMs = Number(rawMs);
  if (rawMs === '' || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) {
    invalid();
  }
  return { createdAtMs, id };
}
