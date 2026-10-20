import type { CSSProperties } from 'react';
import { cn } from '@devops-platform/ui';
import fx from './fx.module.css';

/**
 * Chữ tách từng ký tự để làm kinetic typography. Render được ở server: các ký tự đã nằm sẵn
 * trong HTML, hiệu ứng lộ chữ là CSS keyframe chạy từ khung vẽ đầu tiên, không chờ JS.
 *
 * Trình đọc màn hình đọc bản `sr-only` nguyên câu; bản tách ký tự mang `aria-hidden` vì đọc từng
 * span một sẽ ra từng chữ cái rời rạc. Ký tự bắt đầu ở opacity 0,02 chứ không phải 0: phần tử
 * opacity 0 không được tính là LCP, và tiêu đề hero chính là ứng viên LCP của trang.
 *
 * Mỗi ký tự mang `--t` (0..1, vị trí trong câu) để CSS tô gradient THEO KÝ TỰ bằng `color-mix`.
 * Không dùng `background-clip: text` trên khối cha: ký tự con có `transform` thì Chrome không vẽ
 * lớp nền đã cắt lên chúng, và cả dòng chữ biến mất.
 */
export function KineticText({
  text,
  className,
  charClassName,
  delayMs = 0,
  play = 'load',
}: {
  readonly text: string;
  readonly className?: string | undefined;
  readonly charClassName?: string | undefined;
  readonly delayMs?: number;
  /**
   * `load`: keyframe CSS chạy ngay từ khung vẽ đầu (hero). `manual`: không gắn keyframe, để GSAP
   * tự diễn khi khu lộ vào màn hình. Hai cách không trộn được: animation CSS đứng TRÊN style
   * inline trong cascade, nên một tween GSAP trên ký tự đang có keyframe sẽ không thấy gì.
   */
  readonly play?: 'load' | 'manual';
}) {
  const words = text.split(' ');
  const total = Math.max(1, words.join('').length - 1);
  let index = 0;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span
        aria-hidden="true"
        className={cn(fx.kinetic, className)}
        style={{ '--kinetic-delay': `${delayMs}ms` } as CSSProperties}
      >
        {words.map((word, wordIndex) => (
          <span key={`${word}-${wordIndex}`}>
            <span className={fx.word}>
              {Array.from(word).map((char) => {
                const charIndex = index;
                index += 1;
                return (
                  <span
                    key={charIndex}
                    className={cn(play === 'load' ? fx.char : fx.charManual, charClassName)}
                    data-kinetic-char
                    style={{ '--i': charIndex, '--t': charIndex / total } as CSSProperties}
                  >
                    {char}
                  </span>
                );
              })}
            </span>
            {wordIndex < words.length - 1 ? ' ' : null}
          </span>
        ))}
      </span>
    </>
  );
}
