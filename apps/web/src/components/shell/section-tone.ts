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
  /** Khối đang mở TRÊN HEADER chrome (tối ở cả hai theme): tone ink phải đảo sang nền giấy. */
  readonly headerFill: string;
  readonly headerBar: string;
}

export const SECTION_TONE: Readonly<Record<SectionTone, ToneClasses>> = {
  primary: {
    fill: 'bg-primary text-primary-foreground',
    ink: 'text-brand',
    bar: 'bg-primary',
    tint: 'var(--primary)',
    headerFill: 'bg-primary text-primary-foreground',
    headerBar: 'bg-primary',
  },
  docker: {
    fill: 'bg-line-docker text-line-docker-foreground',
    ink: 'text-line-docker-ink',
    bar: 'bg-line-docker',
    tint: 'var(--line-docker)',
    headerFill: 'bg-line-docker text-line-docker-foreground',
    headerBar: 'bg-line-docker',
  },
  iac: {
    fill: 'bg-line-iac text-line-iac-foreground',
    ink: 'text-line-iac-ink',
    bar: 'bg-line-iac',
    tint: 'var(--line-iac)',
    headerFill: 'bg-line-iac text-line-iac-foreground',
    headerBar: 'bg-line-iac',
  },
  signal: {
    fill: 'bg-signal text-signal-foreground',
    ink: 'text-foreground',
    bar: 'bg-signal',
    tint: 'var(--signal)',
    headerFill: 'bg-signal text-signal-foreground',
    headerBar: 'bg-signal',
  },
  cicd: {
    fill: 'bg-line-cicd text-line-cicd-foreground',
    ink: 'text-line-cicd-ink',
    bar: 'bg-line-cicd',
    tint: 'var(--line-cicd)',
    headerFill: 'bg-line-cicd text-line-cicd-foreground',
    headerBar: 'bg-line-cicd',
  },
  ink: {
    fill: 'bg-chrome text-chrome-foreground',
    ink: 'text-foreground',
    bar: 'bg-chrome',
    tint: 'var(--foreground)',
    headerFill: 'bg-chrome-foreground text-chrome',
    headerBar: 'bg-chrome-foreground',
  },
};
