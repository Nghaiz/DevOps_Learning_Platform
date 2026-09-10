'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'framer-motion';

/**
 * Cổng giảm chuyển động ở gốc app — nửa mà CSS không làm được.
 *
 * `index.ts` của gói này khai rằng hai cơ chế lo việc giảm chuyển động, và
 * `<MotionConfig reducedMotion="user">` là cơ chế thứ nhất. Cho tới
 * 2026-09-10 câu đó **sai**: không file nào trong repo dựng `MotionConfig`,
 * nên chỉ nửa CSS còn sống. Component này làm cho câu đó thành đúng.
 *
 * ## Vì sao nửa CSS là chưa đủ
 *
 * Khối `@media (prefers-reduced-motion: reduce)` trong `globals.css` phủ
 * `transition-duration` và `animation-duration`. Nó **không** chạm tới thứ
 * framer-motion làm: thư viện này animate bằng cách ghi thẳng vào style theo
 * từng khung hình, không qua `transition` của CSS. Một `@media` không dừng nổi
 * một vòng ghi style. Nên nếu thiếu component này, người bật giảm chuyển động
 * vẫn nhận đủ mọi `x`, `y`, `scale`, `rotate` — và trang **trông như** đã tuân
 * thủ, vì phần CSS thì đã tuân thủ thật.
 *
 * `reducedMotion="user"` bảo framer-motion đọc `prefers-reduced-motion` của hệ
 * điều hành rồi bỏ mọi biến đổi hình học, chỉ giữ `opacity`. Giữ `opacity` là
 * có chủ ý: nó không gây chóng mặt, và bỏ luôn nó thì các lượt vào/ra thành
 * nhấp nháy đột ngột, khó chịu hơn.
 *
 * ⛔ KHÔNG hạ thời lượng trong từng biến thể để bù. Ba cơ chế phủ ba tầng khác
 * nhau và chồng lên nhau; một biến thể tự hạ số là tầng thứ tư không ai gác.
 * Vòng `requestAnimationFrame` thì cả ba tầng đều không với tới — đó là việc
 * của `@devops-platform/motion/reduced-motion`.
 *
 * ## Ranh giới client
 *
 * `'use client'` ở đây là bắt buộc chứ không phải phòng xa: `MotionConfig`
 * dựng React context và đọc `matchMedia`, hai thứ không tồn tại khi render trên
 * server. Bọc ở gốc app cho phép `layout.tsx` ở lại Server Component — chỉ
 * đúng component này vượt ranh giới, không phải cả cây.
 */
export function MotionProvider({ children }: { readonly children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
