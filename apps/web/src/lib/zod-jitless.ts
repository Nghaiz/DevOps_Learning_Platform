'use client';

import { config } from 'zod/v4/core';

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
 * ## Vì sao nhập `zod/v4/core` chứ không `zod`
 *
 * `config` mà bản đầu gọi qua `z.config` là **đúng cùng một hàm**: classic
 * re-export nó thẳng từ `../core/index.js`, và đã kiểm tại chỗ —
 * `config === z.config` trả `true`, đặt qua core thì đọc qua classic thấy ngay.
 * Nên đổi import KHÔNG đổi một chút hành vi nào.
 *
 * Thứ nó đổi là đồ thị bundle, và nhiều hơn ta tưởng. Module này mang
 * `'use client'` và được `app-shell.tsx` cố ý giữ tham chiếu để bundler không
 * cắt — mà app-shell nằm trong cây của MỌI trang. Nhập `{ z } from 'zod'` ở đây
 * vì thế kéo TOÀN BỘ barrel classic của Zod vào **nền chung**, chỉ để bật một
 * cờ boolean.
 *
 * Đo được (build thật, `pnpm bundle:check`, 2026-09-14):
 *
 *     nền chung   1.146.344 B (7 chunk)  →  786.433 B (6 chunk)   −359.911 B
 *     /games/k8s  1.583.364 B            →  1.223.453 B          −359.911 B
 *
 * Tức **~360KB rời khỏi mọi route**. Zod nay chỉ nạp ở route thật sự dùng nó, và
 * cờ vẫn được đặt sớm vì module này vẫn nằm trong app-shell.
 *
 * ⛔ Đừng "dọn" dòng này về `import { z } from 'zod'` cho đồng bộ với chỗ khác.
 * Trông thì gọn hơn, nhưng nó trả lại 360KB cho mọi trang và không cổng nào kêu
 * cho tới khi một route nào đó tình cờ chạm trần ngân sách.
 *
 * ## Ràng buộc thứ tự
 *
 * Phép dò được memo hoá và chạy ở lần biên dịch schema ĐẦU TIÊN, nên cờ phải
 * được đặt trước lời `parse` đầu tiên của client. Vì thế module này được import
 * từ `app-shell.tsx` — thứ nằm trong cây của MỌI trang qua root layout — chứ
 * không từ một provider chỉ vài trang dùng.
 */
config({ jitless: true });

/**
 * Hằng để nơi import có thứ THAM CHIẾU tới.
 *
 * Một `import './zod-jitless'` chỉ-lấy-side-effect là thứ bundler được phép cắt
 * khi nó cho rằng module không có tác dụng phụ. Ràng buộc thứ tự ở trên quá
 * mỏng manh để phó mặc cho một suy đoán như vậy — nên nơi gọi tham chiếu hằng
 * này, và module không thể bị cắt.
 */
export const ZOD_JITLESS_APPLIED = true;
