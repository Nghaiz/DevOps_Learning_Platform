import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { LINE_CLASSES, cn, type LineId } from '@devops-platform/ui';
import { sectionById, type SectionId } from '../shell/nav';
import { SECTION_TONE } from '../shell/section-tone';
import { SectionSwitcher } from './section-switcher';

/** Khung chiều ngang chung: 1440px cho trang rộng, 68ch cho trang đọc. */
export function PageContainer({
  children,
  width = 'wide',
  className,
}: {
  readonly children: ReactNode;
  readonly width?: 'wide' | 'read';
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-5 md:px-8',
        width === 'wide' ? 'max-w-[1440px]' : 'max-w-[calc(68ch+4rem)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Đầu trang kiểu biển ga (design-brief §4.1): dải màu chữ ký của section, kết cấu
 * gạch chéo mờ, nhãn mono, tiêu đề cỡ poster, một câu dẫn, khe phải tuỳ chọn, và
 * thanh chuyển trang con ghép ở mép dưới. Render `h1` duy nhất của trang.
 */
export function PosterHeader({
  section,
  line,
  watermark,
  kicker,
  title,
  lead,
  aside,
  switcher = true,
  children,
}: {
  readonly section: SectionId;
  /** Trang chi tiết: tô theo tuyến chủ đề thay cho màu section (thanh chuyển trang tắt). */
  readonly line?: LineId;
  /** Chữ lớn mờ phía sau; mặc định là tên section. */
  readonly watermark?: string;
  readonly kicker?: string;
  readonly title: string;
  readonly lead?: string;
  readonly aside?: ReactNode;
  /** `false` để tắt thanh chuyển trang con (ví dụ trang chi tiết). */
  readonly switcher?: boolean;
  readonly children?: ReactNode;
}) {
  const def = sectionById(section);
  const fill = line ? LINE_CLASSES[line].fill : SECTION_TONE[def.tone].fill;
  const showSwitcher = switcher && line === undefined && def.items.length > 1;
  return (
    <header className={cn('relative overflow-hidden', fill)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-hatch opacity-[0.07]" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 bottom-0 hidden select-none font-display text-[16rem] leading-[0.78] font-extrabold opacity-[0.09] [font-stretch:125%] lg:block"
      >
        {watermark ?? def.label}
      </div>
      <PageContainer className="relative">
        <div className="grid gap-8 pt-12 pb-10 md:pt-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
          <div className="animate-rise">
            {kicker && <p className="type-label opacity-80">{kicker}</p>}
            <h1 className="mt-3 type-poster">{title}</h1>
            {lead && <p className="mt-5 max-w-2xl type-lead opacity-90">{lead}</p>}
            {children}
          </div>
          {aside && <div className="animate-rise [animation-delay:90ms]">{aside}</div>}
        </div>
        {showSwitcher && <SectionSwitcher section={section} />}
      </PageContainer>
    </header>
  );
}

/**
 * Đầu trang công cụ (design-brief §4.2) cho trang chi tiết, trình soạn, quản trị.
 * Render `h1` duy nhất của trang.
 */
export function ToolHeader({
  crumbs,
  title,
  status,
  actions,
  kicker,
}: {
  readonly crumbs?: readonly { readonly href?: string; readonly label: string }[];
  readonly title: string;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly kicker?: string;
}) {
  return (
    <header className="border-b border-border bg-background">
      <PageContainer>
        <div className="flex flex-col gap-4 py-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            {crumbs && crumbs.length > 0 && <Crumbs items={crumbs} />}
            {kicker && <p className="type-label text-muted-foreground">{kicker}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="type-headline">{title}</h1>
              {status}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </PageContainer>
    </header>
  );
}

function Crumbs({ items }: { readonly items: readonly { readonly href?: string; readonly label: string }[] }) {
  return (
    <nav aria-label={t('shell.crumbs.aria')} className="mb-2">
      <ol className="flex flex-wrap items-center gap-1.5 type-label text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${item.label}-${String(index)}`} className="flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link href={item.href} className="underline-offset-4 hover:text-foreground hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Khối nội dung có nhãn (tuỳ chọn). `tone` đổi nền cả dải. */
export function Section({
  title,
  kicker,
  actions,
  children,
  tone = 'plain',
  className,
  headingLevel = 2,
}: {
  readonly title?: string;
  readonly kicker?: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly tone?: 'plain' | 'muted' | 'ink';
  readonly className?: string;
  readonly headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      className={cn(
        tone === 'muted' && 'bg-muted',
        tone === 'ink' && 'bg-chrome text-chrome-foreground',
        className,
      )}
    >
      <PageContainer className="py-10 md:py-14">
        {(title || kicker || actions) && (
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              {kicker && <p className="type-label text-muted-foreground">{kicker}</p>}
              {title && <Heading className="mt-1 type-headline">{title}</Heading>}
            </div>
            {actions}
          </div>
        )}
        {children}
      </PageContainer>
    </section>
  );
}

/**
 * Bố cục Thuỵ Sĩ lệch 4/8: cột nhãn dính bên trái (số + tiêu đề), nội dung bên
 * phải. Cột trái là NHÃN, không phải điều hướng. Vùng nào có thanh dính riêng
 * (trình soạn của Xưởng) đặt biến `--split-sticky-top` để nhãn dính ngay dưới nó.
 */
export function Split({
  index,
  title,
  aside,
  children,
}: {
  readonly index?: string;
  readonly title: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-6 border-t border-border py-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="lg:sticky lg:top-[var(--split-sticky-top,6rem)] lg:self-start">
        {index && <p className="font-mono text-sm text-muted-foreground tabular-nums">{index}</p>}
        <h2 className="mt-1 type-title">{title}</h2>
        {aside && <div className="mt-3 text-sm text-muted-foreground">{aside}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Biến CSS cho hiệu ứng stagger (`animate-rise stagger`). */
export function staggerStyle(index: number, tint?: string): CSSProperties {
  const style: Record<string, string | number> = { '--i': index };
  if (tint) style['--row-tint'] = tint;
  return style as CSSProperties;
}
