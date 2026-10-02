/**
 * Màu chữ ký của từng section (design-brief §2.4) → class Tailwind VIẾT THẲNG.
 * Tailwind chỉ biên dịch class xuất hiện nguyên văn trong mã, nên không bao giờ
 * ghép tên class bằng chuỗi.
 */
import type { SectionTone } from './nav';

export interface ToneClasses {
  /** Nền đặc + chữ trên nền. */
  readonly fill: string;
  /** Chữ an toàn trên nền trang. */
  readonly ink: string;
  /** Màu nền dùng cho dải mỏng / gạch dưới. */
  readonly bar: string;
  /** Giá trị cho biến --row-tint của `interactive-row`. */
  readonly tint: string;
}

export const SECTION_TONE: Readonly<Record<SectionTone, ToneClasses>> = {
  primary: {
    fill: 'bg-primary text-primary-foreground',
    ink: 'text-brand',
    bar: 'bg-primary',
    tint: 'var(--primary)',
  },
  docker: {
    fill: 'bg-line-docker text-line-docker-foreground',
    ink: 'text-line-docker-ink',
    bar: 'bg-line-docker',
    tint: 'var(--line-docker)',
  },
  iac: {
    fill: 'bg-line-iac text-line-iac-foreground',
    ink: 'text-line-iac-ink',
    bar: 'bg-line-iac',
    tint: 'var(--line-iac)',
  },
  signal: {
    fill: 'bg-signal text-signal-foreground',
    ink: 'text-foreground',
    bar: 'bg-signal',
    tint: 'var(--signal)',
  },
  cicd: {
    fill: 'bg-line-cicd text-line-cicd-foreground',
    ink: 'text-line-cicd-ink',
    bar: 'bg-line-cicd',
    tint: 'var(--line-cicd)',
  },
  ink: {
    fill: 'bg-ink text-ink-foreground',
    ink: 'text-foreground',
    bar: 'bg-ink',
    tint: 'var(--foreground)',
  },
};
