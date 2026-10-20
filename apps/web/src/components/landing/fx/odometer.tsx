'use client';

import { useRef, type CSSProperties } from 'react';
import { gsap, ScrollTrigger } from '../motion/gsap';
import { useLandingGSAP } from '../motion/use-landing-gsap';
import fx from './fx.module.css';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Số đếm kiểu đồng hồ cơ: mỗi chữ số là một cột 0..9 lăn tới đúng vị trí khi khu chứa nó lộ
 * vào màn hình. HTML từ server đã đặt sẵn mọi cột ở vị trí cuối, nên không có JS vẫn đọc đúng số.
 */
export function Odometer({
  value,
  className,
}: {
  readonly value: number;
  readonly className?: string | undefined;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const digits = String(Math.max(0, Math.trunc(value))).split('');

  useLandingGSAP(
    () => {
      const root = ref.current;
      if (root === null) return;
      const columns = Array.from(root.querySelectorAll<HTMLElement>('[data-digit]'));
      /*
        Số THẬT nằm yên cho tới đúng lúc lăn: không đặt cột về 0 trước, vì một ô chưa cuộn tới mà
        hiện "0 lộ trình" là khai sai, dù chỉ trong chốc lát (đo được 2026-10-03 trên 390px).
        Lúc lăn thì xoá transform inline của server trước: GSAP đọc translateY(-20%) có sẵn thành
        `y` rồi CỘNG thêm yPercent, ra số gấp đôi (4 lộ trình từng hiện thành 8).
      */
      ScrollTrigger.create({
        trigger: root,
        start: 'top 92%',
        once: true,
        onEnter: () => {
          columns.forEach((column, index) => {
            const digit = Number(column.dataset.digit);
            gsap.set(column, { clearProps: 'transform' });
            gsap.fromTo(column, { y: 0, yPercent: 0 }, {
              yPercent: -digit * 10,
              duration: 1.4 + index * 0.18,
              ease: 'power4.out',
              delay: index * 0.06,
            });
          });
        },
      });
    },
    { scope: ref, dependencies: [value] },
  );

  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true" ref={ref} className={fx.odometer}>
        {digits.map((digit, index) => (
          <span key={index} className={fx.odoWindow}>
            <span
              className={fx.odoColumn}
              data-digit={digit}
              style={{ transform: `translateY(${-Number(digit) * 10}%)` } as CSSProperties}
            >
              {DIGITS.map((glyph) => (
                <span key={glyph}>{glyph}</span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
