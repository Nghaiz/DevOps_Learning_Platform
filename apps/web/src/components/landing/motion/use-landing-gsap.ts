'use client';

import type { RefObject } from 'react';
import { registerLandingGsap, useGSAP } from './gsap';
import { useMotionMode } from './motion-provider';

/**
 * `useGSAP` chỉ chạy ở chế độ `full`, và tự đăng ký plugin trước khi chạy.
 *
 * ⚠ Không trông vào effect của `LandingMotion` để đăng ký: React chạy effect của component CON
 * trước component CHA, nên ScrollTrigger của từng khu sẽ được tạo trước khi provider kịp
 * `registerPlugin`. `registerLandingGsap` là idempotent, gọi ở đây không tốn gì.
 *
 * Mọi tween/ScrollTrigger tạo trong `callback` được `useGSAP` gom vào một context và tự revert
 * khi đổi chế độ (bật giảm chuyển động giữa chừng) hoặc khi unmount.
 */
export function useLandingGSAP(
  callback: () => void | (() => void),
  options: { readonly scope?: RefObject<HTMLElement | null>; readonly dependencies?: readonly unknown[] } = {},
): void {
  const mode = useMotionMode();
  useGSAP(
    () => {
      if (mode !== 'full') return undefined;
      registerLandingGsap();
      return callback();
    },
    {
      ...(options.scope === undefined ? {} : { scope: options.scope }),
      dependencies: [mode, ...(options.dependencies ?? [])],
    },
  );
}
