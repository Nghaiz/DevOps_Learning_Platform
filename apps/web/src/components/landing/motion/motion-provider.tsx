'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { useReducedMotion } from '@devops-platform/motion/reduced-motion';
import { gsap, registerLandingGsap, ScrollTrigger } from './gsap';
import { landingStore, resetLandingStore } from './store';

/**
 * `pending`: HTML từ server và khung đầu tiên sau hydrate. Mọi khu render ở bố cục tĩnh, chảy
 * tự nhiên, để trang đọc được trước khi JS kịp làm gì.
 * `full`: Lenis + ScrollTrigger + canvas 3D.
 * `reduced`: người dùng bật giảm chuyển động. Không Lenis, không ghim, không canvas, không
 * scramble: KHÔNG CÓ vòng lặp nào chạy, chứ không phải vòng lặp chạy ở tốc độ 0.
 */
export type MotionMode = 'pending' | 'full' | 'reduced';

const MotionModeContext = createContext<MotionMode>('pending');

export const useMotionMode = (): MotionMode => useContext(MotionModeContext);

export function LandingMotion({ children }: { readonly children: ReactNode }) {
  const reduced = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const mode: MotionMode = hydrated ? (reduced ? 'reduced' : 'full') : 'pending';

  useEffect(() => {
    if (mode !== 'full') return undefined;
    registerLandingGsap();

    /*
      Một vòng lặp duy nhất cho cả landing: gsap.ticker. Lenis không tự chạy rAF (`autoRaf:
      false`) mà được bơm từ ticker; canvas 3D cũng chạy `frameloop="never"` và được ticker gọi
      `advance()`. Ba hệ dùng chung một nhịp nên camera không trễ một khung sau chữ.
    */
    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.085,
      smoothWheel: true,
      syncTouch: false,
      anchors: false,
      stopInertiaOnNavigate: true,
    });
    landingStore.lenis = lenis;
    lenis.on('scroll', (instance: Lenis) => {
      landingStore.velocity = instance.velocity;
      ScrollTrigger.update();
    });
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const onPointer = (event: PointerEvent) => {
      landingStore.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      landingStore.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    if (finePointer) window.addEventListener('pointermove', onPointer, { passive: true });

    /*
      Neo trong trang (#hanh-trinh, skip link...) tự xử lý thay vì `anchors: true` của Lenis: Lenis
      không chặn cú nhảy gốc của trình duyệt (một khung giật tới đích rồi kéo về), và không biết
      phần tử đang ghim nằm trong pin-spacer. Đo theo spacer mới ra đúng điểm đầu đoạn ghim.
    */
    const onAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const id = decodeURIComponent(link.hash.slice(1));
      const target = id === '' ? null : document.getElementById(id);
      if (target === null) return;
      event.preventDefault();
      const spacer = target.parentElement;
      const anchor = spacer !== null && spacer.classList.contains('pin-spacer') ? spacer : target;
      lenis.scrollTo(anchor, {
        duration: 1.4,
        onComplete: () => {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        },
      });
      window.history.replaceState(null, '', link.hash);
    };
    document.addEventListener('click', onAnchorClick);

    /* Font tải xong làm đổi chiều cao chữ, tức đổi điểm bắt đầu của mọi đoạn ghim. */
    let alive = true;
    void document.fonts?.ready.then(() => {
      if (alive) ScrollTrigger.refresh();
    });

    return () => {
      alive = false;
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('click', onAnchorClick);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      landingStore.lenis = null;
      resetLandingStore();
    };
  }, [mode]);

  return <MotionModeContext value={mode}>{children}</MotionModeContext>;
}
