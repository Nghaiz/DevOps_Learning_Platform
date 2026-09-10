import type { IntentionalThree, Surface } from '../types.ts';

/**
 * Surface `problem.` cho toàn bộ vùng BÀI TẬP k8s: trang đọc
 * `app/(session)/problems/**` và trình soạn `app/author/problems/**`.
 *
 * ## Vì sao nó tách khỏi `author.`
 *
 * Không phải để cho gọn. Hai lý do đo được:
 *
 * 1. **Ranh giới ghi.** `surfaces/author.ts` đã mang 178 khoá của lane soạn BÀI
 *    HỌC. Nếu vùng soạn bài TẬP cũng ghi vào đó thì hai lane cùng ghi một file
 *    trong hai worktree chia chung một cây, và lượt ghi sau ĐÈ lượt trước mà
 *    không có dấu xung đột, không lỗi biên dịch. Đó đúng là lớp lỗi mà khối chú
 *    thích đầu `registry.ts` mô tả, và là lý do 16.G phải tách G1/G2 chạy nối
 *    tiếp trong P16. Một surface riêng biến ràng buộc thứ tự đó thành ràng buộc
 *    file, tức chạy song song được.
 *
 * 2. **Chủ đề khác nhau.** Chữ ở đây nói về vị từ, cụm tài nguyên, mục tiêu và
 *    gợi ý của một bài tập k8s. Chữ ở `author.` nói về bản nháp, bước, tệp đính
 *    kèm và xuất bản của một bài học. Gộp hai tập đó dưới một tiền tố làm mất
 *    khả năng đọc `SURFACE_INTENTIONAL_THREE` theo từng vùng.
 *
 * ## Cái gì KHÔNG vào đây
 *
 * ⛔ `PROBLEM_TOPIC_LABELS` và `PROBLEM_DIFFICULTY_LABELS`. Chúng sống ở
 * `packages/games/src/k8s/problem.ts` và ở lại đó. `app/(session)/problems/problem-labels.ts`
 * đã ghi lệnh cấm này tại chỗ, và `packages/games/src/k8s/problem.test.ts` gác
 * tính đủ khoá của cả hai bảng. Chép chúng sang đây là tạo nguồn sự thật thứ
 * hai cho cùng một tập nhãn.
 *
 * ⛔ Dữ liệu mẫu của bài tập (`problem-test-fixture.ts`) và bộ gợi ý biên tập
 * (`vocabulary.ts`). Chữ trong hai file đó là RUỘT của một bài tập mà tác giả
 * chọn rồi sửa tiếp, không phải VỎ của màn hình. Cả hai giữ nguyên chỗ, có lời
 * khai lý do trong bảng miễn trừ của cổng vùng đó.
 */
export const problem = {} as const satisfies Surface<'problem'>;

export const problemIntentionalThree = {} as const satisfies IntentionalThree;
