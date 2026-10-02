import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';

/**
 * Biểu trưng PTIT + chữ "DevOps Lab". Ảnh lấy từ `public/logo-ptit-mark.svg`
 * (dựng từ file vector chính thức). `<img>` chứ không `next/image`: SVG nhỏ, và
 * CSP `img-src 'self'` đã cho phép.
 */
export function BrandMark({
  compact = false,
  className,
}: {
  readonly compact?: boolean;
  readonly className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label={t('shell.brand.home')}
      className={cn(
        'group flex h-full shrink-0 items-center gap-3 pr-4 text-chrome-foreground',
        className,
      )}
    >
      <span className="grid size-10 place-items-center transition-transform duration-200 group-hover:-rotate-6">
        <img src="/logo-ptit-mark.svg" alt="" width={26} height={32} className="h-8 w-auto" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="type-label text-chrome-muted">PTIT</span>
          <span className="font-display text-[1.05rem] font-extrabold tracking-tight [font-stretch:112%]">
            {t('shell.brand.medium')}
          </span>
        </span>
      )}
    </Link>
  );
}
