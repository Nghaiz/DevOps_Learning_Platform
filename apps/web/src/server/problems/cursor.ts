import { TRPCError } from '@trpc/server';
import {
  PROBLEM_DIFFICULTIES,
  type ProblemDifficulty,
  type ProblemOrderKey,
} from '@devops-platform/games';
import { isAnyProblemCode } from './problem-code';

/**
 * Con trỏ keyset của danh sách bài.
 *
 * Hình dạng chép theo `packages/scenario/src/source.ts` (`encodeContentCursor`)
 * chứ không nghĩ ra cách thứ hai: khoá mặc định thì con trỏ là chính định danh;
 * khoá khác thì `<tiền tố>:<giá trị>:<định danh>`. Một dự án có hai lược đồ con
 * trỏ là một dự án mà người đọc phải nhớ đang ở nhánh nào.
 *
 * ⚠ MỌI khoá khác `code` đều phải kèm `code` làm tie-break, và `problem.ts` nói
 * rõ vì sao: `code` là khoá DUY NHẤT duy nhất theo từng dòng, nên hai bài cùng
 * độ khó (hoặc cùng số người giải) sẽ làm con trỏ nhảy cóc nếu chỉ so trên khoá
 * chính — không phải trả sai thứ tự, mà là MẤT DÒNG, im lặng.
 */
export interface ProblemCursor {
  /** `null` khi `orderBy === 'code'` — lúc đó `code` một mình đã là khoá đủ. */
  readonly sortValue: ProblemDifficulty | number | null;
  readonly code: string;
}

const PREFIX: Readonly<Record<Exclude<ProblemOrderKey, 'code'>, string>> = {
  difficulty: 'd',
  solverCount: 's',
  createdAt: 'c',
};

/**
 * ⛔ `difficulty` mã hoá GIÁ TRỊ enum, không mã hoá thứ hạng số.
 *
 * Postgres sắp `ORDER BY difficulty` theo thứ tự khai báo của kiểu enum, và nếu
 * con trỏ mang một thứ hạng do JavaScript tính thì phép so trong `WHERE` phải
 * dựng lại thứ hạng đó bằng một `CASE` — tức hai bộ so sánh phải luôn đồng ý với
 * nhau. Đó đúng là chế độ hỏng mà `CONTENT_ORDER_KEYS` đã cấm `title` vì nó
 * (`ORDER BY` một đằng, sắp lại ở tầng web một nẻo, và keyset thì MẤT DÒNG).
 * Mã hoá giá trị thì cả `ORDER BY` lẫn `>` đều do một mình Postgres quyết.
 *
 * Cái giá phải nhớ: thêm một bậc độ khó về sau bằng `ALTER TYPE … ADD VALUE`
 * chỉ nối được vào CUỐI, nên một bậc thuộc về giữa thang sẽ sắp sai. Cùng ràng
 * buộc đã ghi cho `user_role`; xử lý lúc đó là viết lại kiểu, không phải đổi
 * lược đồ con trỏ này.
 */
export function encodeProblemCursor(
  orderBy: ProblemOrderKey,
  row: { code: string; difficulty: ProblemDifficulty; createdAt: Date; solverCount: number },
): string {
  switch (orderBy) {
    case 'code':
      return row.code;
    case 'difficulty':
      return `${PREFIX.difficulty}:${row.difficulty}:${row.code}`;
    case 'solverCount':
      return `${PREFIX.solverCount}:${String(row.solverCount)}:${row.code}`;
    case 'createdAt':
      return `${PREFIX.createdAt}:${String(row.createdAt.getTime())}:${row.code}`;
  }
}

function invalid(): never {
  // Cùng thông điệp mà một cursor KHÔNG TỒN TẠI nhận được: với người gọi, "sai
  // định dạng" và "đã biến mất" dẫn tới cùng một việc phải làm — bắt đầu lại từ
  // trang đầu. Và là 400, không phải 500: đây là input hỏng của client.
  throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cursor không còn hợp lệ' });
}

export function decodeProblemCursor(cursor: string, orderBy: ProblemOrderKey): ProblemCursor {
  if (orderBy === 'code') {
    // `code` khớp `<TIỀN TỐ>-\d{4}`, không bao giờ chứa `:`. Có `:` nghĩa là con trỏ
    // của một thứ tự KHÁC còn sót lại (người dùng đổi cách sắp giữa chừng) —
    // nói ra, đừng đọc bừa theo khoá mới.
    if (!isAnyProblemCode(cursor)) {
      invalid();
    }
    return { sortValue: null, code: cursor };
  }

  const parts = cursor.split(':');
  const [prefix, rawValue, code] = parts;
  if (parts.length !== 3 || prefix !== PREFIX[orderBy] || code === undefined || !isAnyProblemCode(code)) {
    invalid();
  }
  if (rawValue === undefined || rawValue === '') {
    invalid();
  }

  if (orderBy === 'difficulty') {
    const found = PROBLEM_DIFFICULTIES.find((level) => level === rawValue);
    if (found === undefined) {
      invalid();
    }
    return { sortValue: found, code };
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    invalid();
  }
  return { sortValue: value, code };
}
