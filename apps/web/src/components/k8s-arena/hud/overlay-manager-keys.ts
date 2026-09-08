/**
 * Hai phép hỏi mà MỌI lớp nổi nghe bàn phím đều phải hỏi trước khi hành động.
 *
 * Tách ra một chỗ vì cả `overlay-manager.tsx` (phím tắt theo `ARENA_KEYS`),
 * `palette-rail.tsx` (phím số 1..9) và `terminal-panel.tsx` đều cần đúng hai câu
 * hỏi này — đủ ngưỡng rule-of-two của `code-conventions.md` § No Duplicated
 * Logic. Ba bản sao của cùng một điều kiện sẽ lệch nhau ở bản sao thứ hai.
 */

/**
 * Con trỏ đang nằm trong một ô nhập?
 *
 * Phím tắt phải nhường chỗ cho nội dung: gõ `m` trong terminal là chữ `m`, không
 * phải lệnh bật bảng số liệu. Đây là lỗi kinh điển của HUD game trên web, và nó
 * chỉ lộ ra khi có người thật gõ một lệnh có chứa đúng ký tự phím tắt.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Có hộp thoại (Radix Dialog) nào đang mở không?
 *
 * ⚠ Hỏi qua DOM chứ không qua state, và đó là lựa chọn có lý do: hộp thoại được
 * render qua Portal bởi component KHÁC (hộp đặt tên của bảng tài nguyên), nên
 * bộ nghe phím ở `window` không có đường nào biết về nó qua props. Không hỏi thì
 * một lần bấm Esc vừa đóng hộp thoại vừa đóng luôn lớp nổi phía sau — người dùng
 * mất hai thứ cho một lần bấm.
 *
 * Radix đặt `data-state="open"` trên chính phần tử `role="dialog"`, nên phép
 * chọn này bám vào hợp đồng DOM công khai của thư viện, không phải vào class
 * hay chi tiết dựng cây.
 */
export function isDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}
