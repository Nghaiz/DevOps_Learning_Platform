'use client';

import { useEffect, useRef, useState } from 'react';
import { COUNTDOWN_RESYNC_MS, COUNTDOWN_TICK_MS, remainingFrom, type CountdownAnchor } from './countdown';

/**
 * Đếm ngược tại chỗ của màn làm bài, neo vào một lần đọc đồng hồ ĐƠN ĐIỆU.
 *
 * Mọi phép toán nằm ở `countdown.ts`; hook này chỉ lo nhịp và hai bộ hẹn giờ.
 *
 * ## ⛔ `onExpire` đi qua ref, KHÔNG vào mảng phụ thuộc của effect hẹn giờ
 *
 * Bản trước đặt `onExpire` vào mảng phụ thuộc, và nơi gọi truyền một callback
 * dựng lại ở mỗi lượt render. Nhịp 250ms gọi `setDisplay`, mỗi lượt render ra
 * một callback mới, effect dỡ cả hai `setInterval` rồi dựng lại: bộ hiệu chỉnh
 * 30 giây bị đặt lại mỗi 250ms và KHÔNG BAO GIỜ bắn. Máy ngủ rồi thức thì đồng
 * hồ trên màn chạy sai mà không có lượt hỏi máy chủ nào kéo nó về.
 * `use-countdown.dom.test.ts` gác đúng ca này.
 */
export function useCountdown(
  remainingMsFromServer: number | null,
  closed: boolean,
  onExpire: () => void,
): number {
  const anchor = useRef<CountdownAnchor | null>(null);
  const [display, setDisplay] = useState(remainingMsFromServer ?? 0);
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  // Mỗi câu trả lời mới của máy chủ ĐẶT LẠI mốc neo. Không cộng dồn: một mốc mới
  // ghi đè hoàn toàn mốc cũ, nên sai lệch tích luỹ trước đó biến mất.
  useEffect(() => {
    if (remainingMsFromServer === null) {
      anchor.current = null;
      return;
    }
    anchor.current = {
      remainingMsAtSync: remainingMsFromServer,
      monotonicAtSync: performance.now(),
    };
    expired.current = false;
    setDisplay(remainingMsFromServer);
  }, [remainingMsFromServer]);

  useEffect(() => {
    if (closed || remainingMsFromServer === null) {
      return;
    }
    const tick = setInterval(() => {
      const current = anchor.current;
      if (current === null) {
        return;
      }
      const left = remainingFrom(current, performance.now());
      setDisplay(left);
      /*
       * Chạm 0 thì HỎI máy chủ, không tự tuyên bố đã khoá: máy chủ là nơi duy
       * nhất biết hạn thật (nó cộng cả `closes_at` của kỳ thi). `expired` chặn
       * việc gọi lặp mỗi 250ms sau khi đã chạm 0.
       */
      if (left <= 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current();
      }
    }, COUNTDOWN_TICK_MS);

    // Hiệu chỉnh định kỳ: `performance.now()` DỪNG khi máy ngủ, nên không có
    // lượt này thì một lần gập máy tính mua thêm đúng ngần ấy thời gian.
    const resync = setInterval(() => onExpireRef.current(), COUNTDOWN_RESYNC_MS);

    return () => {
      clearInterval(tick);
      clearInterval(resync);
    };
  }, [closed, remainingMsFromServer]);

  return display;
}
