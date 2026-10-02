import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button } from '@devops-platform/ui';
import { PageContainer, staggerStyle } from '../components/kit';
import { NAV_SECTIONS } from '../components/shell/nav';
import { SECTION_TONE } from '../components/shell/section-tone';

/** 404 chung: biển ga cỡ lớn + lối ra về các tuyến chính. */
export default function NotFound() {
  const exits = NAV_SECTIONS.filter((section) => section.roles === 'everyone');
  return (
    <PageContainer className="flex flex-1 flex-col justify-center py-16 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <div className="animate-rise">
          <p className="type-label text-muted-foreground">{t('common.not-found.kicker')}</p>
          <p
            aria-hidden="true"
            className="mt-2 font-display text-[clamp(6rem,22vw,16rem)] leading-[0.85] font-extrabold text-primary [font-stretch:125%]"
          >
            {t('common.not-found.code')}
          </p>
          <h1 className="mt-6 type-display">{t('common.not-found.title')}</h1>
          <p className="mt-4 max-w-xl type-lead text-muted-foreground">{t('common.not-found.body')}</p>
          <Button asChild className="mt-8" iconRight={<ArrowRight />}>
            <Link href="/">{t('common.not-found.home')}</Link>
          </Button>
        </div>
        <ul className="border-y border-border">
          {exits.map((section, index) => {
            const first = section.items[0];
            if (first === undefined) return null;
            return (
              <li key={section.id} className="border-b border-border last:border-b-0">
                <Link
                  href={first.href}
                  className="interactive-row stagger flex animate-rise items-center gap-4 px-3 py-4"
                  style={staggerStyle(index, SECTION_TONE[section.tone].tint)}
                >
                  <span className={`grid size-9 place-items-center font-mono text-xs font-bold ${SECTION_TONE[section.tone].fill}`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 type-title">{section.label}</span>
                  <ArrowRight data-row-arrow className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </PageContainer>
  );
}
