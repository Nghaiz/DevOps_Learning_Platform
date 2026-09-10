'use client';

import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import dynamic from 'next/dynamic';
import { t } from '@devops-platform/copy';
import { startGatedFrameLoop, useReducedMotion } from '@devops-platform/motion/reduced-motion';
import { cn } from '@devops-platform/ui';
import {
  STAGES,
  STAGE_COUNT,
  snapProgress,
  stageIndexAtProgress,
} from './loop-stages';
import { hasHardwareWebgl2 } from './webgl-support';

/**
 * Bảy thẻ chặng, cộng một lớp canvas dính ở trên chúng khi máy dựng nổi.
 *
 * ## `'use client'` KHÔNG có nghĩa là "không có HTML server"
 *
 * Component này vẫn được render thành HTML trong lượt dựng phía máy chủ; chỉ
 * phần gắn sự kiện mới chạy ở trình duyệt. Bảy thẻ vì vậy nằm sẵn trong HTML
 * đầu tiên, và đó là thứ máy tìm kiếm đọc, thứ người tắt JavaScript thấy, và
 * thứ duy nhất còn lại trên máy không có WebGL2. Cái ĐƯỢC nạp muộn là chunk
 * cảnh 3D, qua `next/dynamic` với `ssr: false`.
 *
 * `next/dynamic({ ssr: false })` phải gọi TRONG một component `'use client'`.
 * Next 16 từ chối nó ở Server Component, và thông báo lỗi không nói ra rằng chỗ
 * sửa nằm ở file gọi chứ không ở file bị gọi.
 *
 * ## Ba cổng trước khi một canvas được gắn
 *
 * 1. **WebGL2 phần cứng** (`hasHardwareWebgl2`). SwiftShader trả lời "có" cho
 *    phép dò ngây thơ, nên phép dò ở đây mang `failIfMajorPerformanceCaveat`.
 * 2. **Đã vào tầm nhìn** (`IntersectionObserver`). Canvas không được là phần tử
 *    LCP, nên nó không tồn tại ở khung hình đầu tiên.
 * 3. **Trình duyệt đang rảnh** (`requestIdleCallback`). Nạp chunk three.js ngay
 *    lúc cuộn tới sẽ tranh CPU với chính lượt cuộn đó.
 *
 * ## Cổng giảm chuyển động nằm ở HAI tầng, cả hai đều là JS
 *
 * Khối `@media (prefers-reduced-motion: reduce)` trong `globals.css` đúng cho
 * mọi transition CSS, nhưng nó KHÔNG dừng nổi một vòng `requestAnimationFrame`.
 * Dựa vào nó thôi thì trang trông như đã tuân thủ trong khi canvas vẫn quay.
 *
 * - Tầng cấp khung: `startGatedFrameLoop` vẽ đúng MỘT khung tĩnh rồi thôi lập
 *   lịch khi cờ bật, và tự khởi động lại khi người dùng tắt cờ giữa phiên.
 * - Tầng dữ liệu: `snapProgress` bám tiến độ về đúng một chặng, nên những khung
 *   lẻ do cuộn sinh ra rơi vào một tư thế đã thiết kế. Cuộn NHẢY chặng thay vì
 *   nội suy, đúng như design §7.3 đòi.
 */

const LoopScene = dynamic(() => import('./loop-scene'), {
  ssr: false,
  loading: () => null,
});

/** Chỉ số chặng cuối. `p = 1` ứng với chặng này. */
const LAST = STAGE_COUNT - 1;

function clamp01(n: number): number {
  return !Number.isFinite(n) ? 0 : n < 0 ? 0 : n > 1 ? 1 : n;
}

export function LoopStoryClient(): ReactElement {
  const wrapper = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const activeRef = useRef(0);
  const invalidateRef = useRef<(() => void) | null>(null);

  const reduced = useReducedMotion();
  const [sceneReady, setSceneReady] = useState(false);
  /*
   * `activeIndex` là trạng thái RỜI RẠC, đổi nhiều nhất bảy lần trong cả dải,
   * và nó chỉ điều khiển phần nhìn của thẻ DOM. Giá trị tiến độ liên tục thì
   * KHÔNG bao giờ đi qua `useState`: nó ghi vào `progressRef` và được `useFrame`
   * đọc ra, vì một `setState` mỗi lượt cuộn là một lượt render React mỗi khung.
   */
  const [activeIndex, setActiveIndex] = useState(0);

  const handleInvalidate = useCallback((invalidate: () => void) => {
    invalidateRef.current = invalidate;
  }, []);

  // ── Cổng 1 + 2 + 3: dò WebGL2, đợi vào tầm nhìn, đợi trình duyệt rảnh ──
  useEffect(() => {
    const node = wrapper.current;
    if (node === null || !hasHardwareWebgl2(document)) {
      return;
    }

    let idle = 0;
    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        observer.disconnect();
        const schedule =
          typeof window.requestIdleCallback === 'function'
            ? window.requestIdleCallback
            : (cb: () => void): number => window.setTimeout(cb, 200);
        idle = schedule(() => {
          if (!cancelled) {
            setSceneReady(true);
          }
        });
      },
      // Bắt đầu nạp khi dải còn cách nửa màn hình, để chunk kịp tới trước khi
      // người xem nhìn vào chỗ đáng lẽ có cảnh.
      { rootMargin: '50% 0px' },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
      if (idle !== 0 && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idle);
      }
    };
  }, []);

  // ── Tiến độ cuộn: ghi vào ref, không vào state ────────────────────────
  useEffect(() => {
    const node = wrapper.current;
    if (node === null) {
      return;
    }

    const read = (): void => {
      const rect = node.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const raw = span <= 0 ? 0 : clamp01(-rect.top / span);
      const p = reduced ? snapProgress(raw) : raw;

      progressRef.current = p;
      activeRef.current = p * LAST;
      setActiveIndex(stageIndexAtProgress(raw));
      invalidateRef.current?.();
    };

    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read, { passive: true });
    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
    };
  }, [reduced]);

  // ── Cấp khung, có cổng giảm chuyển động ───────────────────────────────
  useEffect(() => {
    if (!sceneReady) {
      return;
    }
    return startGatedFrameLoop({
      onFrame: () => {
        invalidateRef.current?.();
      },
    });
  }, [sceneReady]);

  return (
    <div ref={wrapper} className="relative flex flex-col gap-6 min-[769px]:flex-row min-[769px]:gap-10">
      {/*
        Lớp cảnh. `sticky` chứ không `fixed`: `fixed` thoát khỏi dòng chảy nên
        nó tràn ra ngoài dải và đè lên phần trang phía sau khi cuộn quá.

        `aria-hidden` vì cảnh không mang thông tin nào mà bảy thẻ bên cạnh không
        có. Một mô tả thứ hai của cùng nội dung là chữ đọc thừa cho người dùng
        trình đọc màn hình, không phải chữ thêm.
      */}
      <div
        aria-hidden="true"
        className={cn(
          'sticky top-0 h-[38vh] shrink-0 overflow-hidden rounded-lg border border-border bg-muted',
          'min-[769px]:top-16 min-[769px]:h-[70vh] min-[769px]:w-1/2 min-[769px]:self-start',
        )}
      >
        {sceneReady ? (
          <LoopScene
            progressRef={progressRef}
            activeRef={activeRef}
            reduced={reduced}
            onInvalidate={handleInvalidate}
          />
        ) : null}
      </div>

      <ol className="flex min-w-0 flex-col gap-4 min-[769px]:w-1/2">
        {STAGES.map((stage, index) => {
          const current = index === activeIndex;
          return (
            <li
              key={stage.id}
              // `aria-current="step"` là thứ nói cho trình đọc màn hình biết
              // chặng nào đang được nói tới. Màu và viền chỉ nói điều đó cho
              // người nhìn thấy được màu.
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex flex-col gap-2 rounded-lg border bg-card p-5 shadow-elevation-1',
                'transition-colors motion-reduce:transition-none',
                'min-[769px]:min-h-[52vh] min-[769px]:justify-center',
                current ? 'border-primary' : 'border-border',
              )}
            >
              <p className="text-xs font-medium tabular-nums text-muted-foreground">
                {t('home.loop.stage-position', { n: index + 1, total: STAGE_COUNT })}
              </p>
              <h3
                className={cn(
                  'text-lg font-semibold text-balance',
                  current ? 'text-primary' : 'text-foreground',
                )}
              >
                {t(stage.title)}
              </h3>
              <p className="text-sm text-pretty text-muted-foreground">{t(stage.body)}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
