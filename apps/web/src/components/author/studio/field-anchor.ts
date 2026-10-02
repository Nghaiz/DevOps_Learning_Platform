/**
 * Nối một lỗi trong bảng kiểm với ô nhập sinh ra nó.
 *
 * Ô nhập mang `data-field-path="<path>"` trên khối bọc (xem `Field` ở
 * `components/author/field.tsx`). Bảng kiểm bên phải chỉ biết `path`, nên nó tìm
 * khối bọc theo thuộc tính đó rồi đưa focus vào ô điều khiển đầu tiên bên trong.
 *
 * Vì sao một thuộc tính dữ liệu chứ không phải `id`: ô nhập dùng `useId()` để
 * nhãn trỏ đúng ô khi cùng một tên ô lặp ở nhiều bước, và id đó không đoán được
 * từ `path`. Hai cơ chế giữ hai việc khác nhau, không đè lên nhau.
 */
export const FIELD_PATH_ATTRIBUTE = 'data-field-path';

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Thuộc tính rải lên khối bọc của một ô. `undefined` thì không rải gì. */
export function fieldPathProps(path: string | undefined): Readonly<Record<string, string>> {
  return path === undefined ? {} : { [FIELD_PATH_ATTRIBUTE]: path };
}

/**
 * Đưa focus tới ô của `path`.
 *
 * Thử lại vài khung hình vì nơi gọi thường vừa đổi chế độ (tab Soạn) ngay trước
 * đó, và ô chỉ có mặt trong DOM sau lượt render kế tiếp. Hết lượt thử mà vẫn
 * không thấy thì gọi `onMissing`, để nơi gọi nói ra thay vì lặng lẽ không làm gì.
 */
export function focusFieldByPath(path: string, onMissing?: () => void, attempts = 8): void {
  const selector = `[${FIELD_PATH_ATTRIBUTE}="${CSS.escape(path)}"]`;
  const tryFocus = (left: number): void => {
    const host = document.querySelector<HTMLElement>(selector);
    if (host === null) {
      if (left > 0) {
        requestAnimationFrame(() => {
          tryFocus(left - 1);
        });
      } else {
        onMissing?.();
      }
      return;
    }
    const target = host.matches(FOCUSABLE) ? host : host.querySelector<HTMLElement>(FOCUSABLE);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    host.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    (target ?? host).focus({ preventScroll: true });
  };
  tryFocus(attempts);
}
