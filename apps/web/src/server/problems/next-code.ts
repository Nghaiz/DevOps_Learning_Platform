import { TRPCError } from '@trpc/server';
import { desc, sql } from 'drizzle-orm';
import { isProblemCode } from '@devops-platform/games';
import type { DbOrTx } from '../db/client';
import { problems } from '../db/schema';

/** `K8S-9999` là bài cuối cùng biểu diễn được — bốn chữ số là hợp đồng, không phải gợi ý. */
const MAX_SERIAL = 9999;
const SERIAL_DIGITS = 4;

export function formatProblemCode(serial: number): string {
  return `K8S-${String(serial).padStart(SERIAL_DIGITS, '0')}`;
}

/**
 * Mã bài kế tiếp = mã lớn nhất đang có, cộng một.
 *
 * ⚠ Hàm này MỘT MÌNH KHÔNG chống được đua, và nó không giả vờ chống. Hai người
 * bấm "tạo bài" cùng lúc dưới `READ COMMITTED` đều đọc ra cùng một `max(code)`,
 * nên cả hai nhận cùng một mã. Trọng tài là KHOÁ CHÍNH: `createProblem` chèn
 * trong một vòng lặp và bắt `23505 unique_violation` để tính lại — kẻ thua đọc
 * lại `max` (giờ đã gồm dòng của kẻ thắng) và lấy mã kế tiếp.
 *
 * Vì sao không dùng `SEQUENCE`, vốn không đua: bài seed trong repo được chèn với
 * mã VIẾT SẴN (`K8S-0001`…), và một sequence không biết gì về chúng — nó vẫn
 * đứng ở 1 và sẽ đụng ngay bài seed đầu tiên. Phải `setval` sau mỗi lần seed,
 * tức là một bước bảo trì bằng tay mà quên là hỏng, và hỏng theo kiểu chỉ lộ ra
 * khi có người tạo bài mới.
 *
 * Vì sao không dùng advisory lock: nó tuần tự hoá được, nhưng thêm một loại khoá
 * nữa vào hệ để giải một cuộc đua mà khoá chính vốn đã giải xong.
 *
 * `ORDER BY code DESC LIMIT 1` chứ không phải `max(substring(code from 5)::int)`:
 * bốn chữ số cố định làm thứ tự chuỗi trùng thứ tự số (chính là lý do hợp đồng
 * chọn độ dài cố định), nên phép này đi thẳng vào cây btree của khoá chính thay
 * vì quét cả bảng để ép kiểu từng dòng.
 */
export async function nextProblemCode(db: DbOrTx): Promise<string> {
  const rows = await db
    .select({ code: problems.code })
    .from(problems)
    // Bài có mã không đúng khuôn (nếu ai đó chèn tay) không được kéo `max` lên
    // trời và làm cạn không gian mã. Lọc bằng chính regex của hợp đồng.
    .where(sql`${problems.code} ~ '^K8S-[0-9]{4}$'`)
    .orderBy(desc(problems.code))
    .limit(1);

  const highest = rows[0]?.code;
  const serial = highest === undefined || !isProblemCode(highest) ? 0 : Number(highest.slice(4));
  const next = serial + 1;
  if (next > MAX_SERIAL) {
    // Errors over silent fallbacks: quay vòng về `K8S-0001` sẽ ghi đè một bài
    // đang có, hoặc đụng khoá chính vĩnh viễn ở mọi lần thử. Nói ra.
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Đã dùng hết ${String(MAX_SERIAL)} mã bài — cần mở rộng khuôn mã trước khi tạo thêm`,
    });
  }
  return formatProblemCode(next);
}
