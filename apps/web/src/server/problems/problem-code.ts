/**
 * Mã bài ở dạng ĐA-GAME — `K8S-0042` và `GIT-0007` là cùng một khuôn, khác tiền tố.
 *
 * ## Vì sao cần một file riêng thay vì dùng `isProblemCode` của barrel
 *
 * `packages/games` xuất ra hai hàm trùng tên và chúng KHÔNG cùng một hàm:
 * `k8s/problem.ts` khai `isProblemCode(value)` (một tham số, khoá cứng vào
 * `^K8S-\d{4}$`), `core/problem.ts` khai `isProblemCode(value, prefix)`. Barrel
 * `index.ts` chỉ xuất được MỘT trong hai vì tên đụng nhau, và nó đang xuất bản
 * K8s — chính khối chú thích ở `index.ts` ghi lại rằng đây là trạng thái trung
 * gian có chủ ý và việc hợp nhất là bước kế tiếp của 18.A.
 *
 * Bước hợp nhất đó nằm trong `packages/games`, ngoài lane này. Nên file này lấy
 * `problemCodePattern(prefix)` — bản `core/`, có mặt trong barrel dưới tên KHÁC
 * nên không đụng — và dựng lại đúng ba phép mà `apps/web` cần.
 *
 * ## Tập tiền tố suy từ PLUGIN, không gõ tay
 *
 * `['K8S', 'GIT']` viết thẳng ở đây là bản sao thứ ba của một danh sách đã có
 * hai bản (`K8S_PROBLEM_PLUGIN.codePrefix`, `GIT_PROBLEM_CODE_PREFIX`), và bản
 * sao sẽ trôi ở đúng ngày game thứ ba có plugin: bài của nó lưu xuống được (biên
 * ghi đọc `PROBLEM_PLUGINS`) nhưng mã của nó không mở được, không sửa được,
 * không phân trang được — vì ba phép dưới đây vẫn chỉ biết hai tiền tố. Suy từ
 * `PROBLEM_PLUGINS` làm chuyện đó không xảy ra được.
 *
 * ⛔ File này chạy PHÍA MÁY CHỦ. `PROBLEM_PLUGINS` kéo theo cả engine k8s lẫn
 * engine git (`problem-plugins.ts` nhập thẳng hai plugin), nên nhập nó vào một
 * component client là kéo hai engine vào bundle của route đó. Đường tra nhãn
 * KHÔNG kéo engine là `problemTopicLabels`, không phải file này.
 */

import {
  PROBLEM_CODE_SUFFIX_DIGITS,
  PROBLEM_PLUGINS,
  problemCodePattern,
  type GameId,
} from '@devops-platform/games';

/**
 * Tiền tố hợp lệ trong một biểu thức chính quy ghép chuỗi.
 *
 * `codePrefix` tới từ dữ liệu của plugin, tức từ mã trong repo chứ không từ
 * người dùng — nên đây không phải một cổng chống chèn. Nó là một cổng chống
 * **hỏng im lặng**: một tiền tố chứa `.` hay `|` vẫn ghép ra một regex CHẠY
 * ĐƯỢC nhưng khớp sai tập, và hậu quả (mã bài của game khác lọt qua phép kiểm)
 * chỉ lộ ra rất lâu sau. Ném ở tầng module thì nó lộ ở lần import đầu tiên.
 */
const SAFE_PREFIX = /^[A-Z0-9]+$/;

/**
 * Tiền tố của mọi game ĐÃ CÓ plugin, sắp xếp để nguồn regex không đổi theo thứ
 * tự khai trong `PROBLEM_PLUGINS`. Một regex có nguồn ổn định thì test khoá được
 * nó, và một lượt sắp xếp lại khoá của bảng plugin không làm ô gác đỏ oan.
 */
export const PROBLEM_CODE_PREFIXES: readonly string[] = Object.values(PROBLEM_PLUGINS)
  /*
   * `ProblemPluginRegistry` là `Partial<Record<GameId, …>>` — bốn game chưa có
   * engine là bốn khoá VẮNG MẶT, và `Object.values` khai kiểu phần tử kèm
   * `undefined` vì nó không biết khoá nào có mặt. Lọc tường minh thay vì `!`:
   * phép `!` sẽ im lặng đúng hôm nay và im lặng sai vào ngày ai đó khai một
   * khoá với giá trị `undefined` cho một game đang tạm gỡ engine.
   */
  .filter((plugin) => plugin !== undefined)
  .map((plugin) => plugin.codePrefix)
  .map((prefix) => {
    if (!SAFE_PREFIX.test(prefix)) {
      throw new Error(
        `Tiền tố mã bài "${prefix}" không phải chữ in hoa và số, nên nó không ghép được vào khuôn mã`,
      );
    }
    return prefix;
  })
  .sort((a, b) => a.localeCompare(b));

/**
 * Khuôn của MỌI mã bài hợp lệ, bất kể game.
 *
 * ⚠ Đây là phép kiểm HÌNH DẠNG, không phải phép kiểm quyền sở hữu hay tồn tại.
 * `GIT-0001` qua được cổng này kể cả khi không có dòng nào mang mã đó — câu hỏi
 * "bài này có thật không" là việc của truy vấn, và gộp hai câu hỏi vào một phép
 * kiểm là cách một cổng bắt đầu nói dối về thứ nó gác.
 */
export const ANY_PROBLEM_CODE_PATTERN = new RegExp(
  `^(?:${PROBLEM_CODE_PREFIXES.join('|')})-\\d{${String(PROBLEM_CODE_SUFFIX_DIGITS)}}$`,
);

export function isAnyProblemCode(value: string): boolean {
  return ANY_PROBLEM_CODE_PATTERN.test(value);
}

/**
 * Tiền tố mã bài của một game.
 *
 * NÉM thay vì rơi về `'K8S'`: một game chưa có plugin là một game chưa có engine
 * chấm, và `refineByGame` đã từ chối nó ở biên ghi. Nếu lời gọi vẫn tới được đây
 * thì có một đường ghi thứ hai đi vòng qua biên đó — im lặng cấp cho nó một mã
 * `K8S-` sẽ tạo ra một bài mang mã của game khác, và không cổng nào đỏ.
 */
export function codePrefixFor(gameId: GameId): string {
  const plugin = PROBLEM_PLUGINS[gameId];
  if (plugin === undefined) {
    throw new Error(`Game "${gameId}" chưa có plugin nên không cấp được tiền tố mã bài`);
  }
  return plugin.codePrefix;
}

/** `true` khi mã thuộc đúng game này. Dùng bản `core/` hai tham số, xem đầu file. */
export function isProblemCodeOf(value: string, prefix: string): boolean {
  return problemCodePattern(prefix).test(value);
}
