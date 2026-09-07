/**
 * C6 — chuỗi điều khiển tmux gửi vào PTY. Đây là chỗ DUY NHẤT trong `apps/web`
 * được phép biết `\x02` nghĩa là gì.
 *
 * ## Vì sao đa terminal là tmux window, không phải WebSocket thứ hai
 *
 * `GATEWAY_MAX_WS_PER_SESSION` giữ nguyên **1**. Tab "Terminal 2" KHÔNG mở kết
 * nối mới — nó gõ một chuỗi vào ĐÚNG cái PTY đang có, và tmux đổi window bên
 * trong pod. Hệ quả cho tầng React: chỉ có MỘT `TerminalSurface` thật; mọi tab
 * terminal dùng chung đúng một vùng hiển thị (xem `workspace-panel.tsx`).
 *
 * ## ⚠ `base-index 1` — window đầu tiên là 1, KHÔNG phải 0
 *
 * `images/sandbox-base/skel/.tmux.conf:36` đặt `set -g base-index 1` (và dòng
 * 37 đặt `pane-base-index 1`). Bảng dưới đây được suy ra TỪ giá trị đó. Ai đổi
 * `base-index` trong image mà không sửa file này sẽ làm nút "Terminal 1" chọn
 * một window không tồn tại — tmux im lặng không làm gì, nên triệu chứng là
 * "bấm tab không có phản ứng", không phải một lỗi đọc được.
 *
 * ## Vì sao là hàm chứ không phải hằng chuỗi rải rác
 *
 * Prefix + phím là hai thứ đi cùng nhau và chỉ đúng khi đi cùng nhau. Một hằng
 * `'\x02'` lộ ra ngoài là lời mời nối chuỗi ở call-site, và call-site thứ hai
 * là chỗ nó bắt đầu lệch.
 */

/** Ctrl-B — prefix mặc định của tmux (`.tmux.conf` KHÔNG remap nó). */
const TMUX_PREFIX = '\x02';

/**
 * Chỉ số window của tmux ứng với từng tab terminal.
 *
 * ⛔ Suy ra từ `base-index 1`. Đọc chú thích đầu file trước khi đổi.
 *
 * ## Ánh xạ CỨNG — và đó là lý do việc TẠO window phải nêu chỉ số
 *
 * Bảng này là hợp đồng một chiều: "tab `terminal-N` ⟺ tmux window N". Bản đầu
 * tạo window bằng `\x02 c`, mà `c` KHÔNG chọn chỉ số — tmux lấy chỗ trống kế
 * tiếp. Hợp đồng vỡ ngay khi tập window thật khác dãy 1,2,3…:
 *
 * - **Người dùng tự gõ `Ctrl-B c`.** Một phím tắt tmux bình thường, không ai
 *   chặn. tmux đã có window 2, nên '+' của giao diện tạo window **3** trong khi
 *   ta đăng ký nó là `terminal-2`. Từ giây đó `\x02 2` — và mọi `{{exec T2}}`
 *   — chọn window người dùng tự tạo. Không lỗi, không cảnh báo; triệu chứng là
 *   "lệnh chạy nhưng không thấy gì".
 * - **Đóng tab rồi mở lại.** Cùng một lệch, cùng một gốc.
 *
 * Nên `tmuxNewWindowAt` NÊU chỉ số. Điều đó giữ hợp đồng ở CẢ HAI nhánh, và
 * nhánh thứ hai mới là chỗ đáng nói:
 *
 * - chỉ số còn trống ⇒ tmux tạo đúng tại đó. ✓
 * - chỉ số đã bị người dùng chiếm ⇒ lệnh lỗi (`index in use`), và vì `status off`
 *   nên không ai đọc được câu lỗi đó. Nhưng hợp đồng VẪN GIỮ: window N có thật và
 *   là một terminal dùng được, nên lượt `\x02 N` ngay sau chọn đúng nó. Người
 *   dùng nhận lại chính window mình vừa mở — hơi bất ngờ, nhưng ĐÚNG, và khác hẳn
 *   việc gõ lệnh vào một window vô hình.
 *
 * ⛔ Đừng thêm `-k` cho "chắc": `-k` GIẾT window đang chiếm chỗ, tức xoá phiên làm
 * việc người dùng tự mở. Lỗi im lặng đổi thành mất dữ liệu.
 *
 * Nút `×` đóng tab vẫn ẩn (Lane F không truyền `onCloseTerminal`): đóng được thì
 * còn vế tái dùng chỉ số, và vế đó chưa có phép kiểm nào.
 */
export const TMUX_WINDOW_BY_TAB = {
  'terminal-1': 1,
  'terminal-2': 2,
} as const;

export type TmuxControlledTab = keyof typeof TMUX_WINDOW_BY_TAB;

/**
 * Chuỗi để chuyển sang window thứ `index`.
 *
 * Ném khi `index` không phải số nguyên trong 0..9: tmux chỉ nhận MỘT phím sau
 * prefix, nên `\x02` + "10" thực chất là "chọn window 1" rồi gõ ký tự `0` vào
 * shell — một lệnh rác lọt vào dòng lệnh của người học. Ném ở đây còn hơn để
 * nó im lặng gõ bậy (`development-principles.md` § "Errors Over Silent
 * Fallbacks").
 */
function assertWindowIndex(index: number, fn: string): void {
  if (!Number.isInteger(index) || index < 0 || index > 9) {
    throw new RangeError(
      `${fn}: chỉ số window phải là số nguyên 0..9 (nhận ${String(index)}) — ` +
        'tmux chỉ đọc MỘT phím sau prefix, nên số hai chữ số sẽ gõ rác vào shell. ' +
        'Trần 9 áp cho CẢ hàm tạo window, để hai bên không bao giờ lệch miền giá trị.',
    );
  }
}

export function tmuxSelectWindow(index: number): string {
  assertWindowIndex(index, 'tmuxSelectWindow');
  return `${TMUX_PREFIX}${String(index)}`;
}

/**
 * Chuỗi để tạo window tại ĐÚNG chỉ số `index`.
 *
 * ⛔ KHÔNG dùng `prefix c`: nó không chọn chỉ số, và bảng `TMUX_WINDOW_BY_TAB`
 * thì ánh xạ cứng — hai thứ đó chỉ khớp khi không ai đụng vào tmux ngoài giao
 * diện. Đọc khối "Ánh xạ CỨNG" ở đầu file.
 *
 * Đi qua dấu nhắc lệnh của tmux (`prefix :`) chứ không phải một phím tắt, vì
 * không có phím tắt nào nhận tham số. `\r` cuối là phím Enter gửi lệnh đi.
 */
export function tmuxNewWindowAt(index: number): string {
  assertWindowIndex(index, "tmuxNewWindowAt");
  return `${TMUX_PREFIX}:new-window -t ${String(index)}\r`;
}

/**
 * Chuỗi cần gõ khi người dùng bấm sang một tab terminal. `null` cho tab không
 * phải terminal (`'editor'`) — chuyển sang Editor KHÔNG được gửi gì vào PTY.
 */
export function tmuxSelectForTab(tab: string): string | null {
  if (!isTmuxControlledTab(tab)) {
    return null;
  }
  return tmuxSelectWindow(TMUX_WINDOW_BY_TAB[tab]);
}

export function isTmuxControlledTab(tab: string): tab is TmuxControlledTab {
  return Object.hasOwn(TMUX_WINDOW_BY_TAB, tab);
}
