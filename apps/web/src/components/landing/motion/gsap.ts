import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

/** Đường cong ra chậm dùng cho mọi chuyển cảnh của landing (gần expo.out nhưng mềm hơn ở đuôi). */
export const EASE_OUT = 'landing.out';
export const EASE_IN_OUT = 'landing.inOut';

let registered = false;

/**
 * Đăng ký plugin MỘT lần, trong effect phía client. Không gọi ở tầng module: file này nằm trong
 * cây của landing, và một lời gọi có side effect ở tầng module là thứ đã từng kéo cả một engine
 * vào mọi route (xem memory barrel-side-effect-leaks-engine-to-every-route).
 */
export function registerLandingGsap(): void {
  if (registered) return;
  gsap.registerPlugin(
    useGSAP,
    ScrollTrigger,
    ScrambleTextPlugin,
    DrawSVGPlugin,
    MorphSVGPlugin,
    MotionPathPlugin,
    CustomEase,
  );
  CustomEase.create(EASE_OUT, '0.16,1,0.3,1');
  CustomEase.create(EASE_IN_OUT, '0.65,0,0.35,1');
  ScrollTrigger.config({ ignoreMobileResize: true });
  registered = true;
}

export { gsap, ScrollTrigger, useGSAP };
