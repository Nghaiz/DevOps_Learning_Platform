import { z } from 'zod';

import { scenarioIdSchema } from './scenario.ts';

/**
 * DTO của LỘ TRÌNH (P10 — 10.A).
 *
 * ⛔ Ranh giới, viết lại vì đây là chỗ dễ trượt nhất (phase-10 § "Ranh giới"):
 * một lộ trình CHỈ là cách nhóm nội dung — một danh sách có thứ tự. Không
 * `price`, không `sku`, không `entitlement`, không giỏ hàng, không paywall,
 * không chứng chỉ-như-hàng-hoá. Quyền truy cập vẫn chỉ là **đăng nhập**.
 *
 * Nếu một field trong file này bắt đầu cần trạng thái thanh toán — dừng lại và
 * hỏi chủ dự án. Đó là ranh giới, không phải chi tiết.
 *
 * ## Ba field CỐ Ý không tồn tại
 *
 * `itemCount`, `totalMinutes`, `completionPercent` — cả ba đếm/cộng được từ
 * `items[]` và từ tiến độ từng item (task 3). Chúng KHÔNG có cột trong
 * `learning_paths`. Hai trong ba có mặt trong DTO dưới đây và điều đó không mâu
 * thuẫn: chúng được TÍNH ở chỗ truy vấn rồi gửi đi, cùng khuôn với
 * `authoringItemSchema.stepCount`. Cấm là cấm **lưu**, không phải cấm tính.
 */

/**
 * Ba loại item xếp được vào lộ trình.
 *
 * Thứ tự ở đây là thứ tự của `pgEnum('path_item_kind', …)` — thêm giá trị chỉ
 * được NỐI VÀO CUỐI (cùng ràng buộc Postgres đã ghi ở `CONTENT_KINDS`).
 *
 * ⚠ KHÁC `CONTENT_KINDS` một cách có chủ ý: `playground` không có ở đây (một
 * sân chơi tự do không có trạng thái "đạt", nên nó không xếp vào một chuỗi tuần
 * tự được), còn `quiz` có (nó không phải một `content_items.kind`). Hai bộ từ
 * vựng gần giống nhau nhưng trả lời hai câu hỏi khác nhau; gộp chúng sẽ ép một
 * trong hai phải nói dối.
 */
export const PATH_ITEM_KINDS = ['lesson', 'lab', 'quiz'] as const;
export type PathItemKind = (typeof PATH_ITEM_KINDS)[number];

export const LEARNING_PATH_STATES = ['draft', 'published', 'archived'] as const;
export type LearningPathState = (typeof LEARNING_PATH_STATES)[number];

/**
 * Trạng thái một item ĐỐI VỚI NGƯỜI ĐANG HỎI — suy ra, không lưu ở đâu cả.
 *
 * `locked` chỉ xuất hiện khi lộ trình bật `sequential`. Mặc định là học tự do
 * (task 4), nên trên phần lớn lộ trình mọi item đều `available` hoặc `passed`.
 */
export const PATH_ITEM_STATES = ['locked', 'available', 'passed'] as const;
export type PathItemState = (typeof PATH_ITEM_STATES)[number];

export const learningPathSummarySchema = z
  .object({
    id: scenarioIdSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    /**
     * Task 4 — khoá tuần tự là TUỲ CHỌN của lộ trình, mặc định TẮT (học tự do).
     * Khi bật, luật mở là "item N mở khi N−1 đạt" và nó được kiểm Ở SERVER;
     * field này chỉ để UI vẽ ổ khoá, không phải để UI quyết định.
     */
    sequential: z.boolean(),
    /** TÍNH bằng `count(learning_path_items)` ở chỗ truy vấn — không phải cột (task 3). */
    itemCount: z.number().int().min(0),
  })
  .strict();
export type LearningPathSummary = z.infer<typeof learningPathSummarySchema>;

/**
 * Một item trong lộ trình, KÈM trạng thái của chính người gọi (task 5).
 *
 * ⚠ `title` được nạp từ nguồn nội dung tương ứng lúc đọc, KHÔNG chép vào
 * `learning_path_items`. Chép tiêu đề vào đây là dựng bản sao thứ hai của một
 * thứ tác giả sửa được — và bản sao đó không có cách nào biết mình đã cũ.
 *
 * `title: null` = item trỏ tới một bài không còn nạp được (đã archive, hoặc id
 * gõ sai). Hiện ra thay vì lọc đi: một lộ trình thủng một mắt xích là chuyện
 * người soạn phải thấy, không phải chuyện hệ thống giấu đi.
 */
export const learningPathItemViewSchema = z
  .object({
    ordinal: z.number().int().min(0),
    kind: z.enum(PATH_ITEM_KINDS),
    itemId: scenarioIdSchema,
    title: z.string().nullable(),
    state: z.enum(PATH_ITEM_STATES),
  })
  .strict();
export type LearningPathItemView = z.infer<typeof learningPathItemViewSchema>;

export const learningPathDetailSchema = learningPathSummarySchema
  .extend({
    items: z.array(learningPathItemViewSchema),
    /**
     * Số item đã đạt. TÍNH từ `items[]` — có mặt ở đây để nhãn tiến độ không
     * phải tự đếm lại và tự đếm sai.
     *
     * ⚠ Task 15, bẫy đã trả giá ở P2: nhãn tiến độ từng nói nhiều hơn thứ ta
     * lưu (`"4/4 bước"` từ đúng một lượt chấm). Hai con số dưới đây là TẤT CẢ
     * những gì lộ trình biết — "đã đạt bao nhiêu item trên bao nhiêu". Nó KHÔNG
     * biết người học đã bỏ ra bao lâu, và không có field nào ở đây cho phép một
     * nhãn khẳng định điều đó.
     */
    passedCount: z.number().int().min(0),
    /**
     * Item kế tiếp nên làm — item `available` đầu tiên theo `ordinal`, `null`
     * khi đã xong hết (hoặc khi mọi thứ còn lại đều `locked`).
     */
    nextItemId: scenarioIdSchema.nullable(),
  })
  .strict();
export type LearningPathDetail = z.infer<typeof learningPathDetailSchema>;
