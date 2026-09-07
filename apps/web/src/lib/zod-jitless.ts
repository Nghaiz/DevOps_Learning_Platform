'use client';

import { z } from 'zod';

/**
 * Tắt JIT của Zod TRONG TRÌNH DUYỆT — để nó thôi dò một năng lực mà CSP của ta
 * cố ý không cấp.
 *
 * ## Vi phạm CSP thật, đo trên cụm 2026-09-07
 *
 * `csp.spec.ts` bắt `script-src: eval` trên **9 màn hình** (`/lessons`, `/labs`,
 * `/playgrounds`, `/paths`, `/quiz`, `/author`, `/author/new`, `/author/:id`,
 * `/admin/content`). Máy thu nay giữ toạ độ nguồn nên truy được về đúng một chỗ:
 *
 *     _next/static/chunks/070wxo37drrwv.js:1:5990
 *
 * và mã ở đó là của **Zod 4.4.3**:
 *
 *     if (o.jitless || navigator?.userAgent?.includes("Cloudflare")) return false;
 *     try { return Function(""), true } catch (e) { return false }
 *
 * Zod 4 biên dịch validator bằng `new Function` cho nhanh, và câu trên là phép
 * DÒ xem có làm được không. Dưới `script-src` không có `'unsafe-eval'`, lời gọi
 * ném, Zod bắt đúng và rơi về đường thông dịch — hành vi hoàn toàn đúng. Nhưng
 * trình duyệt vẫn BẮN sự kiện `securitypolicyviolation` cho một lời gọi bị
 * chặn, kể cả khi mã đã `catch`. Nên ô AC "0 vi phạm CSP mới" đỏ vì một phép dò
 * vô hại.
 *
 * ## Vì sao đặt cờ chứ không nới CSP
 *
 * Thêm `'unsafe-eval'` là hạ hàng rào để phép kiểm thôi kêu — đúng thứ 13.H
 * dựng đối chứng dương lên để chặn. Cờ `jitless` được kiểm TRƯỚC `Function("")`
 * trong chính đoạn trên, nên nó cắt phép dò tại gốc.
 *
 * ## Vì sao không mất gì
 *
 * Trong client của ta Zod CHƯA BAO GIỜ JIT được — phép dò luôn thất bại. Đặt cờ
 * chỉ bỏ đi một lượt thử chắc chắn hỏng; đường thực thi sau đó y hệt. Và vì file
 * này là `'use client'`, nó KHÔNG chạm tới instance Zod phía server, nơi JIT vẫn
 * chạy và vẫn nhanh.
 *
 * ## Ràng buộc thứ tự
 *
 * Phép dò được memo hoá và chạy ở lần biên dịch schema ĐẦU TIÊN, nên cờ phải
 * được đặt trước lời `parse` đầu tiên của client. Vì thế module này được import
 * từ `app-shell.tsx` — thứ nằm trong cây của MỌI trang qua root layout — chứ
 * không từ một provider chỉ vài trang dùng.
 */
z.config({ jitless: true });

/**
 * Hằng để nơi import có thứ THAM CHIẾU tới.
 *
 * Một `import './zod-jitless'` chỉ-lấy-side-effect là thứ bundler được phép cắt
 * khi nó cho rằng module không có tác dụng phụ. Ràng buộc thứ tự ở trên quá
 * mỏng manh để phó mặc cho một suy đoán như vậy — nên nơi gọi tham chiếu hằng
 * này, và module không thể bị cắt.
 */
export const ZOD_JITLESS_APPLIED = true;
