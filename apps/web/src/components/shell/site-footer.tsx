import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { cn } from '@devops-platform/ui';
import { sectionsFor, type Viewer } from './nav';
import { SECTION_TONE } from './section-tone';

/**
 * Chân trang: dải chrome, tên sản phẩm cỡ biển ga, cột liên kết theo section.
 * Không hiện trên trang immersive (vỏ ứng dụng quyết định).
 */
export function SiteFooter({ viewer }: { readonly viewer: Viewer | null }) {
  return (
    <footer aria-label={t('shell.footer.aria')} className="mt-auto bg-chrome text-chrome-foreground">
      <div className="mx-auto max-w-[1440px] px-5 pt-14 pb-8 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <p className="type-poster leading-none">
              {t('shell.brand.medium')}
              <span className="text-primary">.</span>
            </p>
            <p className="mt-4 max-w-md text-chrome-muted">{t('shell.footer.note')}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {sectionsFor(viewer).map((section) => (
              <div key={section.id}>
                <p className="flex items-center gap-2 type-label text-chrome-muted">
                  <span className={cn('size-2.5', SECTION_TONE[section.tone].bar)} aria-hidden="true" />
                  {section.label}
                </p>
                <ul className="mt-3 grid gap-2">
                  {section.items.map((entry) => (
                    <li key={entry.href}>
                      <Link
                        href={entry.href}
                        className="text-sm text-chrome-foreground/85 underline-offset-4 transition-colors hover:text-chrome-foreground hover:underline"
                      >
                        {entry.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-chrome-border pt-5 text-xs text-chrome-muted sm:flex-row sm:justify-between">
          <span>{t('shell.brand.org')}</span>
          <span>{t('shell.footer.source')}</span>
        </div>
      </div>
    </footer>
  );
}
