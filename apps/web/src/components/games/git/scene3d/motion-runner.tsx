'use client';

/**
 * Bộ chạy chuyển động 17.K.7 — **không giữ một chút nghĩa nào**.
 *
 * Tất cả phần nghĩa ("rebase bỏ lại cái bóng", "reflog trả về ĐÚNG chỗ cũ")
 * nằm ở `motion-script.ts` và có test ở env `node`. Ở đây chỉ còn ba việc,
 * và cả ba đều là việc của `@react-three/fiber` chứ không phải của git:
 *
 *  1. đọc `prefers-reduced-motion`;
 *  2. cộng dồn thời gian thực, độc lập nhịp khung;
 *  3. giữ đúng hợp đồng `invalidate()` của `frameloop="demand"`.
 *
 * Thành phần này **không vẽ gì**. Nó trả `null` và đẩy từng khung ra ngoài qua
 * `onFrame`, để bên gọi tự ghi thẳng vào `mesh.position` / `material.opacity`.
 * Đó là lý do nó KHÔNG nhận `children` dạng hàm: một render-prop sẽ dựng lại
 * cây React ở mỗi khung hình, tức là 60 lượt render React mỗi giây cho một
 * cảnh vốn được thiết kế để React đứng yên hoàn toàn trong lúc ba mesh động
 * đậy. Cùng khuôn với `k8s-arena/scene/frame-pump.tsx`.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { advanceMotion, motionFrame, type MotionFrame, type MotionInput } from './motion-script.ts';

/**
 * `prefers-reduced-motion: reduce` của hệ điều hành.
 *
 * Khởi tạo `false` rồi sửa trong effect: `matchMedia` không tồn tại lúc render
 * trên máy chủ, và một giá trị khác nhau giữa hai lượt sẽ làm React kêu lệch
 * hydrate.
 *
 * Bản sao của `usePrefersReducedMotion` ở `k8s-arena/scene/arena-scene.tsx` —
 * hàm đó là nội bộ của file kia, không export, và file kia thuộc lane khác
 * trong đợt này. Chỗ đúng để gộp là `games/shared/`.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listen = (event: MediaQueryListEvent): void => setReduced(event.matches);
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  return reduced;
}

export interface MotionRunnerProps {
  /** Chuyển động đang chạy. `null` = đứng yên; đổi giá trị = chạy lại từ đầu. */
  readonly motion: MotionInput | null;
  /**
   * Gọi MỖI khung hình trong lúc chạy, và đúng MỘT lần ở trạng thái cuối khi
   * chuyển động kết thúc (hoặc bị tắt bởi reduced-motion).
   *
   * ⚠ Hàm này chạy trong vòng lặp vẽ. Đừng `setState` trong đó.
   */
  readonly onFrame: (frame: MotionFrame) => void;
  /** Gọi đúng một lần sau khung cuối. Dùng để trả quyền vẽ về cho cảnh tĩnh. */
  readonly onDone?: (() => void) | undefined;
}

export function MotionRunner({ motion, onFrame, onDone }: MotionRunnerProps): ReactElement | null {
  const invalidate = useThree((s) => s.invalidate);
  const reducedMotion = usePrefersReducedMotion();

  /*
   * Callback đọc qua ref: bên gọi hầu như luôn truyền hàm nội tuyến, và nếu
   * chúng nằm trong mảng phụ thuộc của effect dưới thì chuyển động RESET ở mỗi
   * lượt render cha — nó sẽ giật về `t=0` mãi mãi và không bao giờ kết thúc.
   */
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const elapsedRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (motion === null) {
      runningRef.current = false;
      return;
    }
    elapsedRef.current = 0;

    if (reducedMotion) {
      /*
       * Nhảy thẳng tới trạng thái cuối và KHÔNG mở vòng lặp nào.
       *
       * ⚠ `git-palette.ts` ghi rõ vì sao đây không phải một sự nhân nhượng:
       * chuyển động là một trong các kênh phân biệt trạng thái, nên khi nó tắt,
       * hệ tụt xuống ít kênh hơn cho ĐÚNG nhóm người dùng cần nó nhất. Điều đó
       * chỉ chấp nhận được nếu trạng thái cuối TỰ NÓ đọc được — bản cũ của
       * `rebase` vẫn nằm đó mờ 0.32, commit của `reset --hard` vẫn nằm dưới đáy.
       * Cả hai đúng là hình dạng mà `motionFrame(input, 1)` trả về.
       */
      runningRef.current = false;
      onFrameRef.current(motionFrame(motion, 1));
      invalidate();
      onDoneRef.current?.();
      return;
    }

    // Khung ĐẦU phải được xin bằng tay: dưới `frameloop="demand"` không ai vẽ
    // nếu không ai đòi, nên `useFrame` bên dưới sẽ không bao giờ chạy lượt nào.
    runningRef.current = true;
    onFrameRef.current(motionFrame(motion, 0));
    invalidate();

    return () => {
      runningRef.current = false;
    };
  }, [motion, reducedMotion, invalidate]);

  useFrame((_state, delta) => {
    if (motion === null || !runningRef.current) return;

    const tick = advanceMotion(motion.kind, elapsedRef.current, delta, false);
    elapsedRef.current = tick.elapsedS;
    onFrameRef.current(motionFrame(motion, tick.t));

    if (tick.running) {
      // Còn chạy ⇒ xin khung kế tiếp. Quên dòng này thì chuyển động đứng hình
      // ngay khung thứ hai và trông y như một cảnh bị treo.
      invalidate();
      return;
    }

    /*
     * Xong ⇒ NGỪNG xin. Quên vế này thì cảnh vẽ 60fps vĩnh viễn — đúng lỗi đã
     * buộc repo gỡ `idleSpinAfterMs` ngày 2026-09-08, và nó không bao giờ lộ ra
     * như một lỗi: cảnh vẫn đúng, chỉ có quạt máy và cổng "0 khung hình khi
     * tĩnh" biết.
     */
    runningRef.current = false;
    onDoneRef.current?.();
  });

  return null;
}
