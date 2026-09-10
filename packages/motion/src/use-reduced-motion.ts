/**
 * Cầu nối React cho cổng §7. Toàn bộ LOGIC nằm ở `reduced-motion.ts`; file này
 * chỉ đóng gói nó thành một external store.
 *
 * ⚠ Vì sao tách `reducedMotionStore` ra thành một hằng số EXPORT thay vì viết
 * thẳng ba hàm vào lời gọi hook: `packages/motion` không có `react-dom` (chỉ
 * `react` là peer), nên ở đây **không render được** một component để test hook.
 * Một hook không test được là một hook hỏng trong im lặng. Tách store ra thì ba
 * hàm nó thực sự làm việc được khẳng định bằng bảng vào/ra, còn `useReducedMotion`
 * rút xuống đúng một dòng nối dây — và test khẳng định nó nối đúng ba hàm ĐÓ.
 */

import { useSyncExternalStore } from 'react';

import { prefersReducedMotion, subscribeReducedMotion } from './media-query.ts';

export interface ReducedMotionStore {
  subscribe(onStoreChange: () => void): () => void;
  getSnapshot(): boolean;
  getServerSnapshot(): boolean;
}

/**
 * `getSnapshot` trả một `boolean` — nguyên thuỷ, so sánh theo GIÁ TRỊ. Đây là
 * điều kiện `useSyncExternalStore` đòi hỏi: trả một object mới mỗi lần gọi sẽ
 * làm React render vô hạn, và nó không báo lỗi mà chỉ treo.
 *
 * `getServerSnapshot` trả `false` vì cùng lý do đã ghi ở `prefersReducedMotion`:
 * server không đọc được cài đặt của người dùng, và `false` là thứ khớp với CSS
 * mặc định nên không đẻ ra hydration mismatch.
 */
export const reducedMotionStore: ReducedMotionStore = {
  subscribe(onStoreChange: () => void): () => void {
    return subscribeReducedMotion(() => {
      onStoreChange();
    });
  },
  getSnapshot(): boolean {
    return prefersReducedMotion();
  },
  getServerSnapshot(): boolean {
    return false;
  },
};

/**
 * `true` khi người dùng đã bật giảm chuyển động, và cập nhật NGAY khi họ đổi
 * cài đặt giữa phiên.
 *
 * Dùng cho quyết định ở mức component (bỏ hẳn một biến thể framer-motion, đổi
 * sang một khung tĩnh). KHÔNG dùng để "đặt duration về 0" — khối CSS ở
 * `globals.css` đã làm việc đó tốt hơn cho mọi transition, kể cả những chỗ
 * không có component nào nhớ hỏi.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    reducedMotionStore.subscribe,
    reducedMotionStore.getSnapshot,
    reducedMotionStore.getServerSnapshot,
  );
}
