import Link from 'next/link';
import { Button, EmptyArt, Icon, Page } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { NAV_SECTIONS } from '../components/shell/nav';

/** 404 chung: minh hoạ lạc đường, một câu nói thẳng, và lối ra về các mục chính. */
export default function NotFound() {
  const exits = NAV_SECTIONS.filter((section) => section.roles === 'everyone');
  return (
    <Page className="flex flex-1 flex-col justify-center py-16 md:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col items-start gap-4">
          <EmptyArt kind="lost" width={200} className="animate-enter" />
          <p aria-hidden="true" className="font-mono text-sm text-ink-3">
            {t('common.not-found.code')}
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            {t('common.not-found.title')}
          </h1>
          <p className="max-w-[52ch] text-lg text-ink-2">{t('common.not-found.body')}</p>
          <Button asChild variant="primary" icon="arrow-left" className="mt-2">
            <Link href="/">{t('common.not-found.home')}</Link>
          </Button>
        </div>
        <ul className="flex flex-col border-t border-rule">
          {exits.map((section) => (
            <li key={section.id} data-section={section.id} className="border-b border-rule">
              <Link
                href={section.hub}
                className="group/exit flex items-start gap-3 py-3.5"
              >
                <Icon
                  name={section.icon}
                  size={24}
                  tint="acc"
                  className="shrink-0 text-acc-ink transition-transform duration-200 ease-out group-hover/exit:-rotate-6"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-ink transition-colors duration-150 group-hover/exit:text-acc-ink">{section.label}</span>
                  <span className="text-sm text-ink-3">{section.lead}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
