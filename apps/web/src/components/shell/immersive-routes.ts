/**
 * Route "immersive" — trang chiếm trọn viewport, vỏ ứng dụng thu về tối thiểu.
 *
 * §12.3 của `phase-14-exec.md`, mở rộng ở P16 mục 16.D.1. Ba loại trang cần
 * toàn bộ chiều cao màn hình: cảnh 3D, và hai trình học có terminal. Thanh đầu
 * trang cao 56px cộng thanh cuộn trang là 56 pixel dọc mà trên màn hình lab thì
 * mỗi pixel dọc là một phần của một dòng terminal.
 *
 * ⛔ Cách SAI đã bị loại tường minh: phủ `fixed inset-0 z-50` lên vỏ. Nó để
 * `ShellHeader` nằm nguyên trong DOM phía dưới — nghĩa là link điều hướng vẫn
 * nhận Tab trong khi mắt không thấy chúng, và phải bẫy focus thủ công để chữa.
 * Ẩn đúng thứ cần ẩn thì rẻ hơn, và giữ nguyên hợp đồng "đúng MỘT `<main>`".
 *
 * Hàm thuần, tách khỏi `app-shell.tsx` để test được mà không phải dựng cả vỏ.
 *
 * ## Hai luật so khớp, và vì sao KHÔNG gộp được thành một
 *
 * `/games/k8s` là một trang CỤ THỂ: chính nó immersive, và mọi trang con của nó
 * cũng vậy. `/labs` và `/lessons` thì ngược hẳn — trang danh mục ở đúng tiền tố
 * đó là một trang đọc bình thường, PHẢI giữ thanh điều hướng; chỉ trang con
 * `/labs/<id>` mới immersive.
 *
 * Gộp hai luật lại bằng một danh sách duy nhất là mất một trong hai vế:
 *
 * | Nếu thêm `/labs` vào danh sách khớp-chính-nó | `/labs` mất thanh điều hướng |
 * | Nếu chuyển `/games/k8s` sang danh sách chỉ-khớp-con | `/games/k8s` mất immersive |
 *
 * Cả hai đều hỏng IM LẶNG: trang vẫn render, vẫn không lỗi, chỉ là vỏ sai. Nên
 * hai danh sách, mỗi cái một luật, và mỗi cái có ô test riêng.
 */

/**
 * Route immersive TÍNH CẢ CHÍNH NÓ. So khớp CHÍNH XÁC hoặc theo đoạn con.
 *
 * ⚠ So theo ĐOẠN, không phải `startsWith` trần: `startsWith('/games/k8s')` cũng
 * khớp một route tương lai tên `/games/k8s-nang-cao`, và trang đó sẽ mất thanh
 * điều hướng mà không ai hiểu vì sao.
 */
const IMMERSIVE_PREFIXES: readonly string[] = ['/games/k8s'];

/**
 * Route immersive CHỈ Ở TRANG CON. Chính tiền tố thì KHÔNG.
 *
 * `/labs` và `/lessons` là hai trang danh mục (lane 16.C) — chúng cuộn, chúng
 * cần thanh điều hướng, chúng không có terminal nào. Trang con `/labs/<id>`,
 * `/lessons/<id>` là trình học: một khoang terminal chiếm trọn chiều cao, và
 * thanh nav toàn cục ở đó ăn mất 56px của thứ đang tính từng dòng.
 *
 * ⚠ `/playgrounds/<id>` CỐ Ý không có mặt ở đây dù nó cũng có terminal. Sân
 * chơi là phiên tự do, không có nội dung bài để đọc cạnh terminal, nên nó không
 * chịu sức ép chiều cao như hai trang kia — và mất thanh điều hướng ở một trang
 * người ta hay rời đi giữa chừng thì tệ hơn là được thêm 56px. Nếu sau này đổi
 * ý thì thêm vào đây, đừng suy ra từ "trang nào có terminal".
 */
const IMMERSIVE_CHILD_PREFIXES: readonly string[] = ['/labs', '/lessons'];

/** Bỏ dấu `/` ở cuối, trừ khi đường dẫn CHÍNH LÀ `/`. */
function normalize(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

export function isImmersiveRoute(pathname: string | null): boolean {
  if (pathname === null || pathname === '') {
    return false;
  }
  const path = normalize(pathname);

  if (IMMERSIVE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }

  /*
    `startsWith(prefix + '/')` VÀ KHÔNG bằng chính tiền tố. Dấu `/` bắt buộc
    nằm trong phép so: thiếu nó thì `/labsomething` cũng khớp. Vế `path !== prefix`
    là thứ giữ trang danh mục ở chế độ thường, và nó đã được `normalize` lo cho
    trường hợp `/labs/` (có dấu chéo cuối) — nếu không, `/labs/` sẽ đọc ra là
    "một trang con có id rỗng" và trang danh mục mất vỏ ở đúng một dạng URL mà
    không ai gõ bằng tay nhưng trình duyệt thì tự sinh.
  */
  return IMMERSIVE_CHILD_PREFIXES.some(
    (prefix) => path !== prefix && path.startsWith(`${prefix}/`),
  );
}
