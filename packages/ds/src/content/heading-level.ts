/**
 * ⛔ Chuẩn hoá cấp heading của markdown do TÁC GIẢ viết, trước khi nó nhúng vào
 * một trang đã có `<h1>` của riêng trang.
 *
 * ## Vì sao "hạ một bậc" là chưa đủ
 *
 * Bản trước của `markdown-view.tsx` ánh xạ cứng `#`→`<h2>`, `##`→`<h3>`,
 * `###`→`<h4>`. Phép đó ĐÚNG, nhưng chỉ khi tài liệu mở đầu bằng `#`. Một tài
 * liệu mở đầu bằng `##` rơi thẳng xuống `<h3>` ngay sau `<h1>` của trang — nhảy
 * qua `<h2>`, và đó là vi phạm `heading-order` của axe.
 *
 * Đây không phải giả định. Đo trên `content/` ngày 2026-09-14, trong 61 file
 * markdown có **50 file mở đầu bằng `#`, 2 file bằng `##`, 4 file bằng `###`**
 * (5 file không có heading nào). Sáu file lệch nằm trong ba scenario NHẬP TỪ
 * UPSTREAM — `ckad-configmap-as-files`, `loxilb-tcp-load-balancing`,
 * `prolug-linux-system-checking`. Nói cách khác: cấp mở đầu là quy ước của
 * người viết upstream, và ta không kiểm soát nó. Sửa sáu file là sửa triệu
 * chứng; lần nhập sau sẽ mang về đúng chuyện đó.
 *
 * Triệu chứng đo được: `/lessons/ckad-configmap-as-files` cho axe một lỗi
 * `[moderate] heading-order` ở `h3:nth-child(1)`. Ô e2e `axe /lessons/:id` chỉ
 * mở bài ĐẦU của danh mục, và suốt một thời gian dài bài đầu là một fixture rò
 * rỉ rỗng — trang trống thì axe luôn sạch, nên ô đó xanh mà không đo gì. Dọn
 * rác DB xong thì nó mở bài thật và lỗi hiện ra ngay.
 *
 * ## Phép chuẩn hoá
 *
 * Lấy cấp NHỎ NHẤT xuất hiện trong tài liệu và ánh xạ nó về `<h2>`, giữ nguyên
 * độ sâu tương đối của các cấp còn lại:
 *
 * | tài liệu mở đầu | `#` | `##` | `###` |
 * |---|---|---|---|
 * | bằng `#` (50 file) | h2 | h3 | h4 |
 * | bằng `##` (2 file) | — | h2 | h3 |
 * | bằng `###` (4 file) | — | — | h2 |
 *
 * Dòng đầu tiên y hệt hành vi cũ, nên 50 file kia không đổi lấy một thẻ.
 *
 * ⚠ Kẹp ở `<h6>`: HTML không có `<h7>`. Một tài liệu dùng tới `######` sau khi
 * dời sẽ dồn các cấp sâu nhất vào `h6` — dồn thì xấu, nhưng nó KHÔNG nhảy cấp,
 * còn phát ra `<h7>` thì trình duyệt dựng ra một phần tử vô nghĩa.
 */

/** Cấp thấp nhất mà nội dung nhúng được phép dùng: trang đã giữ `<h1>`. */
export const EMBEDDED_TOP_LEVEL = 2;

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Cấp nhỏ nhất xuất hiện trong markdown, BỎ QUA phần bên trong khối mã.
 *
 * ⚠ Vế "bỏ qua khối mã" không phải tỉ mỉ thừa: một khối mã shell gần như luôn
 * có dòng `# chú thích`, và ở đầu dòng nó khớp y hệt một heading `#`. Đọc nhầm
 * nó thành cấp 1 sẽ kéo cả tài liệu dời sai một bậc — im lặng, và vẫn đúng ở
 * những tài liệu không có khối mã, nên rất khó thấy.
 *
 * Trả `null` khi tài liệu không có heading nào (5 file trong `content/`).
 */
export function smallestHeadingLevel(markdown: string): HeadingLevel | null {
  let smallest: HeadingLevel | null = null;
  let fence: string | null = null;

  for (const line of markdown.split(NEWLINE)) {
    const trimmed = line.trim();

    // Rào mã: ``` hoặc ~~~. Đóng bằng rào CÙNG LOẠI ký tự.
    const fenceMatch = FENCE.exec(trimmed);
    if (fenceMatch !== null) {
      const marker = fenceMatch[1] ?? '';
      if (fence === null) {
        fence = marker[0] ?? null;
      } else if (marker[0] === fence) {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;

    // ATX heading: tối đa 3 dấu cách thụt đầu, rồi 1-6 `#`, rồi khoảng trắng.
    const heading = ATX_HEADING.exec(line);
    if (heading === null) continue;

    const level = (heading[1]?.length ?? 0) as HeadingLevel;
    if (smallest === null || level < smallest) {
      smallest = level;
    }
  }
  return smallest;
}

const NEWLINE = '\n';
const FENCE = /^(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:\s|$)/;

/**
 * Cấp thẻ THẬT cho một heading cấp `level` của markdown, sau khi chuẩn hoá.
 *
 * `markdown` là TOÀN VĂN tài liệu, không phải riêng dòng heading: phép dời phụ
 * thuộc cấp nhỏ nhất của cả tài liệu chứ không của một dòng.
 */
export function embeddedHeadingLevel(markdown: string, level: HeadingLevel): HeadingLevel {
  const smallest = smallestHeadingLevel(markdown) ?? 1;
  const shifted = level - smallest + EMBEDDED_TOP_LEVEL;
  return Math.min(Math.max(shifted, EMBEDDED_TOP_LEVEL), 6) as HeadingLevel;
}
