/**
 * P16 · 16.D.2 — quyết định hình học của bố cục "nội dung cạnh terminal", tách
 * khỏi React.
 *
 * §16.D mục 2 nói "chia đôi viết lại, vẫn tự viết, vẫn tách quyết định hình học
 * ra hàm thuần". `workspace-tabs.ts` đã làm đúng thế cho ngăn xếp DỌC; file này
 * làm nốt cho lượt chia NGANG, thứ trước đó còn nằm thẳng trong thân component
 * dưới dạng một `if (wideEnough === false)`.
 *
 * ## Vì sao một `if` ba dòng đáng được kéo ra
 *
 * Không phải vì nó dài. Vì mệnh đề nó mang không đọc được từ chỗ nó nằm: giá
 * trị `null` của `useMinWidth` ("chưa đo được bề rộng") đi theo nhánh RỘNG, và
 * đó là một quyết định có lý lẽ chứ không phải một phép ép kiểu tiện tay. Là
 * hàm thuần thì lý lẽ ấy có một chỗ để ở, và có một bảng vào/ra khẳng định nó.
 */

/**
 * Hai hình dạng, và chỉ hai.
 *
 * `side-by-side` là bố cục đích: nội dung bên trái, khoang terminal bên phải.
 * `stacked` là bản HẠ CẤP CÓ CHỦ Ý dưới `TERMINAL_MIN_WIDTH_PX` (13.B mục 8):
 * nội dung chiếm trọn bề rộng, và thứ đáng lẽ ở khoang phải xuống dưới nó.
 */
export type SplitShape = 'side-by-side' | 'stacked';

/**
 * `wideEnough` là giá trị thô của `useMinWidth`: `true` / `false` / `null` khi
 * chưa đo được (SSR và khung hình đầu tiên).
 *
 * ⚠ `null` đi theo nhánh RỘNG, và đây là chỗ duy nhất trong file có một lựa
 * chọn thật:
 *
 * - Mục tiêu chính của nền tảng là ≥1280px, nên nhánh rộng khớp phần lớn lượt
 *   mở. Máy hẹp chịu đúng một lần đổi bố cục sau khung hình đầu; máy rộng thì
 *   không bao giờ.
 * - Chọn ngược lại (chưa đo ⇒ coi là hẹp) bắt MỌI máy desktop nhìn bố cục nhảy
 *   một cái ở mỗi lần tải trang, để đổi lấy việc một số máy hẹp đỡ nhảy.
 *
 * ⛔ Đừng đọc `null` thành "hẹp" với lý do an toàn. Nhánh hẹp không phải một
 * trạng thái trung tính: nó KHẲNG ĐỊNH với người dùng rằng "màn hình của bạn
 * quá nhỏ để mở terminal", và khẳng định đó khi chưa đo là nói sai với một nửa
 * số lượt mở.
 */
export function resolveSplitShape(wideEnough: boolean | null): SplitShape {
  return wideEnough === false ? 'stacked' : 'side-by-side';
}

/**
 * Khoang dưới của bố cục xếp chồng.
 *
 * Bố cục `ide` truyền riêng terminal vào `narrowSide`: khoang editor (Theia
 * trong iframe) không có dạng hẹp nào dùng được, và nạp nguội nó ~20 giây trên
 * một khung 768px là bắt người dùng chờ một thứ họ không thao tác nổi.
 *
 * Hàm này chỉ nói ra luật chọn, để cả hai chỗ (component và test) đọc cùng một
 * câu: có `narrowSide` thì dùng nó, không thì dùng `side`.
 *
 * ⚠ `undefined` khác `null`. `narrowSide === null` là một lựa chọn HỢP LỆ nghĩa
 * là "khi hẹp thì không hiện gì ở dưới"; chỉ `undefined` mới là "chưa khai, lấy
 * mặc định". Gộp hai thứ bằng `??` trên một prop khai kiểu `ReactNode` sẽ nuốt
 * mất lựa chọn đầu, vì `null` là một `ReactNode` hợp lệ.
 */
export function resolveStackedBottom<T>(side: T, narrowSide: T | undefined): T {
  return narrowSide === undefined ? side : narrowSide;
}
