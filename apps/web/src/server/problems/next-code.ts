import { TRPCError } from '@trpc/server';
import { desc, sql } from 'drizzle-orm';
import type { GameId } from '@devops-platform/games';
import type { DbOrTx } from '../db/client';
import { problems } from '../db/schema';
import { codePrefixFor, isProblemCodeOf } from './problem-code';

/** `K8S-9999` là bài cuối cùng biểu diễn được — bốn chữ số là hợp đồng, không phải gợi ý. */
const MAX_SERIAL = 9999;
const SERIAL_DIGITS = 4;

/**
 * ⚠ Nhận `prefix` tường minh, KHÔNG suy từ `gameId`, và KHÔNG mặc định `'K8S'`.
 *
 * Cùng lý lẽ mà `core/problem.ts` § `isProblemCode` đã ghi: `gameId.toUpperCase()`
 * đúng tình cờ ở ca `'k8s' → 'K8S'` và sai ở ca `'cicd' → 'CICD'`. Một tham số
 * mặc định thì tệ hơn nữa — chỗ gọi quên truyền vẫn biên dịch được, và bài Git
 * nhận một mã `K8S-`.
 */
export function formatProblemCode(prefix: string, serial: number): string {
  return `${prefix}-${String(serial).padStart(SERIAL_DIGITS, '0')}`;
}

/**
 * Mã bài kế tiếp TRONG DÃY CỦA GAME ĐÓ = mã lớn nhất của dãy, cộng một.
 *
 * ## Vì sao lọc theo TIỀN TỐ MÃ, không lọc theo cột `game_id`
 *
 * Hai thứ đó trông như một và không phải một. Thứ phải duy nhất là `code` —
 * khoá chính — nên phép tìm `max` phải đi trên chính không gian đó. Lọc theo
 * `game_id` sẽ bỏ sót một dòng lệch ở phía ngược lại: dãy `K8S-` mất một mã ĐÃ
 * DÙNG khỏi phép tính `max`, rồi lần tạo bài K8s kế tiếp cấp lại mã đó và đụng
 * khoá chính mãi mãi.
 *
 * ## ⛔ ĐÃ ĐÓNG 2026-09-15 — nhưng phép lọc trên vẫn phải giữ nguyên
 *
 * Bản trước của khối này ghi một hệ quả để ngỏ: sau một lượt đổi game, tiền tố
 * mã và `game_id` lệch nhau vĩnh viễn, nên `GIT-0003` có thể là một bài K8s. Nó
 * kết luận rằng vá đi sẽ phải cấp lại mã, tức phá tính ổn định mà hợp đồng hứa.
 *
 * Kết luận đó bỏ sót đường thứ ba, và đường thứ ba là đường rẻ nhất: **đừng cho
 * đổi game.** `crud.ts` § `assertGameIdUnchanged` nay chặn vô điều kiện, nên
 * tiền tố mã không còn nói dối được về `game_id` — không mã nào bị cấp lại, và
 * hợp đồng ổn định giữ nguyên. Biểu mẫu soạn bài vốn đã cấm điều này
 * (`canChange={props.code === null}`); lượt đó chỉ làm API nói cùng một câu.
 *
 * ⚠ **Đừng vì thế mà đổi phép lọc trên sang `game_id`.** Hai lý do, và cái thứ
 * hai đủ một mình: (1) một cơ sở dữ liệu đã chạy TRƯỚC lượt siết này có thể còn
 * dòng lệch, và chúng không tự sửa; (2) kể cả khi không còn dòng nào lệch, lọc
 * theo `game_id` vẫn là lọc trên một cột KHÔNG phải khoá chính để tìm `max` của
 * khoá chính — nó đúng nhờ một bất biến ở chỗ khác thay vì đúng tự thân. Cổng
 * mới làm phép lọc này thành thừa, không làm nó thành sai.
 *
 * ## Đua
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
 * khi có người tạo bài mới. Đa-game còn nhân con số đó lên: mỗi dãy một sequence.
 *
 * Vì sao không dùng advisory lock: nó tuần tự hoá được, nhưng thêm một loại khoá
 * nữa vào hệ để giải một cuộc đua mà khoá chính vốn đã giải xong.
 *
 * `ORDER BY code DESC LIMIT 1` chứ không phải `max(substring(code from 5)::int)`:
 * bốn chữ số cố định làm thứ tự chuỗi trùng thứ tự số (chính là lý do hợp đồng
 * chọn độ dài cố định), nên phép này đi thẳng vào cây btree của khoá chính thay
 * vì quét cả bảng để ép kiểu từng dòng. Mệnh đề `~` thu phạm vi về đúng một dãy;
 * `DESC` vẫn đi trên cùng chỉ mục đó.
 */
export async function nextProblemCode(db: DbOrTx, gameId: GameId): Promise<string> {
  const prefix = codePrefixFor(gameId);
  /*
   * Khuôn truyền vào dưới dạng THAM SỐ bind, không nối chuỗi vào câu SQL. Giá
   * trị tới từ plugin nên không có người dùng nào chạm vào nó, nhưng một khuôn
   * nối tay là thói quen mà lần sau sẽ có người chép sang chỗ giá trị tới từ
   * input.
   */
  const rows = await db
    .select({ code: problems.code })
    .from(problems)
    // Bài có mã không đúng khuôn (nếu ai đó chèn tay) không được kéo `max` lên
    // trời và làm cạn không gian mã. Lọc bằng chính khuôn của hợp đồng.
    .where(sql`${problems.code} ~ ${`^${prefix}-[0-9]{${String(SERIAL_DIGITS)}}$`}`)
    .orderBy(desc(problems.code))
    .limit(1);

  const highest = rows[0]?.code;
  /*
   * `prefix.length + 1` chứ không phải `4`. Con số 4 đúng với `K8S-` và `GIT-`
   * vì cả hai tiền tố dài ba ký tự, và đó chính là chỗ nó nguy hiểm: nó sẽ đúng
   * cho tới tiền tố đầu tiên có độ dài khác, rồi `Number('I-0007')` trả `NaN`,
   * `NaN + 1` trả `NaN`, và `padStart` in ra `"NaN"` — một mã bài không khớp
   * khuôn nào, chèn được, không cổng nào đỏ.
   */
  const serial =
    highest === undefined || !isProblemCodeOf(highest, prefix)
      ? 0
      : Number(highest.slice(prefix.length + 1));
  const next = serial + 1;
  if (next > MAX_SERIAL) {
    // Errors over silent fallbacks: quay vòng về `0001` sẽ ghi đè một bài đang
    // có, hoặc đụng khoá chính vĩnh viễn ở mọi lần thử. Nói ra, và nói rõ DÃY
    // NÀO cạn — trần là của từng tiền tố, không phải của cả bảng.
    throw new TRPCError({
      code: 'CONFLICT',
      message: `Đã dùng hết ${String(MAX_SERIAL)} mã bài của dãy ${prefix} — cần mở rộng khuôn mã trước khi tạo thêm`,
    });
  }
  return formatProblemCode(prefix, next);
}
