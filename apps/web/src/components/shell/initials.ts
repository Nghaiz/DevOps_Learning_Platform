/**
 * Chữ cái khởi tạo cho avatar trong thanh đầu trang.
 *
 * Thay cho việc in thẳng tên (hoặc, khi tên rỗng, in cả chuỗi email) vào thanh
 * nav. Một địa chỉ email trần ở đó vừa chiếm chỗ vừa là dữ liệu cá nhân hiện
 * trên mọi màn hình người dùng chia sẻ hay chiếu lên máy chiếu; tên đầy đủ thì
 * bị `truncate` cắt giữa chừng ở màn hẹp. Tên và email vẫn còn nguyên BÊN TRONG
 * menu khi mở ra — chỗ người dùng chủ động nhìn.
 *
 * ## Vì sao chuẩn hoá NFC trước khi cắt
 *
 * Tiếng Việt tổ hợp (NFD) viết "Ễ" thành `E` + hai dấu rời. Lấy `[0]` trên
 * chuỗi đó ra chữ `E` TRẦN — mất dấu, và người dùng thấy một chữ cái không
 * phải chữ trong tên mình. `normalize('NFC')` gộp lại thành một ký tự dựng sẵn.
 *
 * Cắt bằng `Array.from` chứ không bằng `chuỗi[0]`: `[0]` trả về một **đơn vị
 * mã UTF-16**, nên với ký tự ngoài BMP (emoji trong tên hiển thị — hợp lệ ở
 * nhiều hệ đăng nhập) nó trả về nửa surrogate, tức một ký tự hỏng.
 */
function firstGrapheme(word: string): string {
  return Array.from(word.normalize('NFC'))[0] ?? '';
}

/** Tách theo khoảng trắng, bỏ phần rỗng do khoảng trắng thừa. */
function words(raw: string): string[] {
  return raw.trim().split(/\s+/).filter((part) => part !== '');
}

/**
 * Tối đa hai ký tự: chữ đầu của từ ĐẦU + chữ đầu của từ CUỐI.
 *
 * Từ đầu + từ cuối, không phải hai từ đầu: tiếng Việt đặt họ trước và tên gọi
 * sau ("Nguyễn Văn An" → "NA"), nên hai từ đầu sẽ ra "NV" — họ và tên đệm, tức
 * đúng phần ÍT phân biệt nhất giữa những người cùng họ.
 */
function initialsOfWords(parts: readonly string[]): string {
  if (parts.length === 0) {
    return '';
  }
  const first = firstGrapheme(parts[0] ?? '');
  const last = parts.length > 1 ? firstGrapheme(parts[parts.length - 1] ?? '') : '';
  return `${first}${last}`.toLocaleUpperCase('vi-VN');
}

/**
 * `name` rỗng ⇒ rơi về phần trước `@` của email, tách thêm theo `. _ - +` để
 * `van.an@…` ra "VA" thay vì "V".
 *
 * `'?'` là chốt cuối cùng, KHÔNG phải một lối thoát im lặng: nó chỉ tới được
 * khi cả tên lẫn email đều rỗng — trạng thái mà `Viewer` không được phép có
 * (session server luôn cấp email). Hiện một dấu hỏi vẫn hơn hiện một ô trống
 * không bấm được, và nó tự nói ra rằng dữ liệu phiên bất thường.
 */
export function avatarInitials(name: string, email: string): string {
  const fromName = initialsOfWords(words(name));
  if (fromName !== '') {
    return fromName;
  }
  const local = email.split('@')[0] ?? '';
  const fromEmail = initialsOfWords(local.split(/[._+-]+/).filter((part) => part !== ''));
  return fromEmail === '' ? '?' : fromEmail;
}
