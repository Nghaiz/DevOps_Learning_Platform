/**
 * Vùng cuộn được PHẢI nhận được focus bàn phím (axe `scrollable-region-focusable`).
 *
 * ## Lỗi thật, đã đo
 *
 * Lượt e2e ngày 2026-09-06 trên cụm bắt hai lỗi mức **serious** cùng luật này,
 * ở `/lessons/:id` và `/labs/:id`: khối `<pre>` trong nội dung bài cuộn ngang
 * được nhưng không có điểm dừng Tab nào, nên người dùng chỉ có bàn phím KHÔNG
 * đọc nổi phần lệnh bị tràn ra ngoài. Chuột kéo được, bàn phím thì không —
 * đúng hạng lỗi mà mắt người review không bao giờ thấy.
 *
 * Cả hai route đi qua CÙNG hai component ở `packages/ui/src/lesson`
 * (`MarkdownView` cho fence thường, `CodeBlock` cho fence có `{{copy}}/{{exec}}`),
 * và đường thứ ba — xem trước của trang soạn bài — cũng vậy. Sửa ở đây là sửa
 * cả ba; sửa ở route thì hai đường còn lại vẫn đỏ.
 *
 * ## Vì sao `role="group"` chứ không `role="region"`
 *
 * `tabIndex={0}` một mình đủ để tắt luật axe, nhưng để lại một điểm dừng Tab
 * KHÔNG TÊN — trình đọc màn hình chỉ nói "group" rỗng. Cần một `aria-label`.
 *
 * Mà `aria-label` trên một phần tử vai trò `generic` (`<pre>`, `<div>` trần) là
 * thuộc tính BỊ CẤM (`aria-prohibited-attr`, cũng mức serious) — tức là đổi
 * một lỗi lấy một lỗi khác. Nên phần tử phải có vai trò thật.
 *
 * `region` thì tạo ra landmark: một bài học mười khối mã ra mười landmark cùng
 * tên, và `landmark-unique` đỏ. `group` mang được `aria-label`, không phải
 * landmark, không đụng cấu trúc điều hướng — đó là lý do chọn nó.
 *
 * ## Vì sao `outline` chứ không `ring`
 *
 * Các control khác trong `packages/ui` dùng `ring-2` + `ring-offset-2`. Không
 * dùng được ở đây: khối mã nằm trong một khung `overflow-hidden` (CodeBlock)
 * hoặc trong khoang nội dung `overflow-y-auto` (trang bài), nên một vòng đẩy ra
 * NGOÀI mép sẽ bị cắt — cùng lý do `step-nav.tsx` phải bỏ `ring-offset`.
 * `-outline-offset-2` vẽ vào PHÍA TRONG, không mép nào cắt được.
 *
 * Màu: `outline-ring` = `--ring`, đo được 5.17:1 (sáng) / 6.85:1 (tối) trên
 * `--background` và 4.74:1 / 5.23:1 trên `--muted` — nền của cả hai khối mã.
 * Cả bốn đều trên ngưỡng 3:1 của SC 1.4.11 cho đồ hoạ.
 *
 * ## ⛔ ĐỪNG kèm `outline-none` trên cùng phần tử
 *
 * Tailwind v4: `outline-none` đặt `--tw-outline-style: none`, còn `outline-2`
 * chỉ đặt ĐỘ DÀY rồi lấy style từ đúng biến đó. Hai lớp cạnh nhau cho ra một
 * viền rộng 2px với `outline-style: none` — không vẽ gì. tailwind-merge không
 * loại lớp nào (chúng khác variant), nên chuỗi `class` TRÔNG như đã có dấu focus
 * và mọi test đọc-class đều xanh.
 *
 * Đã cắn một lần: `TabsContent` giữ `'mt-2 outline-none'` khi nhận hằng này,
 * deploy trong `dlp-web:p13a`, và `keyboard.spec.ts` trên cụm vẫn báo đúng một
 * điểm dừng Tab không có dấu focus trên `/me`. Cần dấu focus dạng RING cạnh
 * `outline-none` thì dùng `focus-visible:ring-2 focus-visible:ring-ring` —
 * ring là box-shadow nên `outline-style` không đụng tới nó.
 */
export const SCROLL_REGION_FOCUS =
  'focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2';
