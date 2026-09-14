/**
 * Miễn trừ cho bộ dò tiếng Việt bị lột dấu.
 *
 * Khoá theo CẶP `(khoá bản đồ, token)`, không theo file. Miễn trừ cả file là tắt
 * cổng cho file đó, và một cổng tắt trông giống hệt một cổng xanh.
 *
 * Mỗi dòng bắt buộc có ngày và lý do. Định dạng của `reason` giống hệt
 * `intentionalThree`: `YYYY-MM-DD: <lý do dài ít nhất 20 ký tự>`.
 *
 * ⚠ CHỐNG NGHĨA ĐỊA. `copy.contract.test.ts` khẳng định mỗi dòng ở đây còn khớp
 * ít nhất một chuỗi thật. Dòng không còn khớp gì thì đỏ, và thông điệp là
 * `xoá dòng này, chuỗi nó miễn trừ không còn tồn tại`. Thiếu vế đó thì danh sách
 * chỉ lớn dần và không ai dám dọn.
 *
 * ⚠ Bảng này RỖNG ở lượt L0, và một bảng rỗng thì test chống nghĩa địa không
 * chứng minh gì cả (nó lặp qua không dòng nào). Đối chứng dương của nó nằm ở
 * `scan.control.test.ts` với một bảng giả, nên vế "đỏ được" đã có bằng chứng
 * trước khi dòng thật đầu tiên xuất hiện.
 *
 * Ba lớp dương tính giả dự đoán được, để người thêm dòng tự nhận ra mình đang ở
 * lớp nào: danh từ riêng viết không dấu, câu tiếng Anh chứa đủ bốn từ WEAK, và
 * tên định danh cố ý viết ASCII mà bước bóc không nhận ra.
 */

export interface DiacriticAllowEntry {
  /** Khoá trong `MESSAGES`. Không nhận ký tự đại diện. */
  readonly key: string;
  /** Token đã hạ chữ thường, đúng như bộ dò báo ra. */
  readonly token: string;
  /** `YYYY-MM-DD: lý do`. */
  readonly reason: string;
}

export const DIACRITIC_ALLOW: readonly DiacriticAllowEntry[] = [];
