import { LogoMark } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';

/**
 * Chân trang gọn: một dòng nhận diện và nơi chạy máy ảo. Điều hướng đã có ở thanh
 * trên và bảng lệnh, không lặp lại ở đây.
 */
export function SiteFooter() {
  return (
    <footer aria-label={t('shell.footer.aria')} className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-6 text-sm text-ink-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div className="flex items-center gap-3">
          <LogoMark size={22} />
          <span>
            <span className="font-medium text-ink-2">{t('shell.brand.name')}</span>
            {', '}
            {t('shell.brand.org')}
          </span>
        </div>
        <p className="flex flex-col gap-0.5 sm:items-end">
          <span>{t('shell.footer.note')}</span>
          <span>{t('shell.footer.source')}</span>
        </p>
      </div>
    </footer>
  );
}
