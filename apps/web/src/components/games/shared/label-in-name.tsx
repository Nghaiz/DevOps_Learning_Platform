/**
 * WCAG 2.5.3 Label in Name cho các node SVG `role="button"` của game.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LUẬT, ĐÚNG NHƯ axe-core 4.14 ĐO NÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `label-content-name-mismatch` (đọc ở `labelContentNameMismatchEvaluate` trong
 * `axe.js`) lấy CHỮ NHÌN THẤY của phần tử — mọi text node con đang hiện trên
 * màn, kể cả nằm trong `aria-hidden="true"`, vì phép "nhìn thấy" ở đây là THỊ
 * GIÁC — rồi cùng với tên khả truy cập: chuẩn hoá NFKD, bỏ ngoặc tròn, đổi mọi
 * ký tự không phải chữ/số thành khoảng trắng, tách từ. Đạt khi dãy từ nhìn thấy
 * là một dãy CON LIỀN MẠCH, ĐÚNG THỨ TỰ của dãy từ trong tên.
 *
 * Người dùng nhập bằng giọng nói nói đúng chữ họ thấy ("bấm clone"). Tên không
 * chứa chữ đó thì lệnh nói không trúng nút nào.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HAI BẪY, CẢ HAI ĐÃ ĐO TRÊN CHROMIUM THẬT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Chữ bị cắt** ("deploy-producti…") không phải từ "production". Tên phải
 *    chứa ĐÚNG chuỗi đã vẽ, nên nó được dựng từ CHÍNH chuỗi đó chứ không dựng
 *    lại từ dữ liệu gốc — hai nơi tự cắt là hai nơi lệch nhau được.
 *
 * 2. **Các `<text>` anh em DÍNH vào nhau.** axe nối text node bằng chuỗi RỖNG,
 *    và React không chèn khoảng trắng nào giữa hai phần tử JSX. Hai dòng
 *    `clone` / `clone` thành MỘT từ `cloneclone` — không tên nào chứa được nó,
 *    dù tên đúng từng chữ. Đo 2026-10-27 (Chromium 156, axe 4.14):
 *    `<text>clone</text><text>clone</text>` → vi phạm;
 *    thêm `{' '}` giữa hai thẻ → đạt. Cùng aria-label, khác đúng một khoảng trắng.
 *
 * `FaceText` sửa bẫy 2 tại gốc: mỗi dòng chữ trên mặt node mang theo một khoảng
 * trắng NGOÀI thẻ `<text>`. SVG không vẽ ký tự nằm trực tiếp trong `<g>`, nên
 * hình không đổi một pixel; thứ đổi là `textContent` của nút giờ có ranh giới
 * từ đúng như mắt thấy (hai dòng là hai từ).
 *
 * `<title>` KHÔNG được axe tính là chữ nhìn thấy (cũng đo ở lượt trên), nên
 * tooltip được giữ nguyên.
 */

import type { ReactElement, SVGProps } from 'react';

/** Có ít nhất một chữ cái hay chữ số — tức có một TỪ để đọc hoặc nói ra. */
const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * Phần "nhìn thấy" của tên: các chuỗi đã vẽ, đúng thứ tự DOM, nối bằng dấu phẩy.
 *
 * Chuỗi KHÔNG mang từ nào (glyph trạng thái `✓`, sigil `@`, dấu `*` của nhánh
 * hiện tại) bị bỏ: axe vốn đã coi chúng là khoảng trắng, người nói không nói
 * được chúng, còn trình đọc màn hình đọc chúng thành "dấu kiểm"/"a còng" — tiếng
 * ồn lặp lại đúng ý mà câu mô tả phía sau đã nói bằng chữ. `null` = phần tử đó
 * không được vẽ ở lượt này.
 */
export function spokenFace(parts: readonly (string | null)[]): string {
  return parts.filter((p): p is string => p !== null && HAS_WORD.test(p)).join(', ');
}

/**
 * Tên khả truy cập = chữ nhìn thấy TRƯỚC (WCAG 2.5.3 khuyên tên BẮT ĐẦU bằng
 * nhãn nhìn thấy), rồi câu mô tả đầy đủ có sẵn — người dùng trình đọc màn hình
 * không mất chữ nào so với trước.
 */
export function nameWithVisibleLabel(
  face: readonly (string | null)[],
  description: string,
): string {
  const seen = spokenFace(face);
  return seen.length === 0 ? description : `${seen}. ${description}`;
}

/**
 * Một dòng chữ trên mặt node: `<text>` + MỘT khoảng trắng ngay sau thẻ.
 *
 * Dùng cho MỌI `<text>` nằm trong một nút có `aria-label`, không chỉ những chỗ
 * "đang dính" — một dòng thêm sau này mà quên khoảng trắng sẽ dính vào dòng
 * trước nó. `axe.run` trong jsdom KHÔNG bắt được (luật này rơi vào `incomplete`
 * ở đó); thứ bắt được là ô "dãy con liền mạch" của từng cảnh, đọc DOM qua
 * `label-in-name-check.ts` — đã thử bỏ khoảng trắng này: hai ô đó đỏ.
 */
export function FaceText(props: SVGProps<SVGTextElement>): ReactElement {
  return (
    <>
      <text {...props} />{' '}
    </>
  );
}
