import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button, Icon } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { readRequestSession } from '../../server/auth/config';
import { withReturnPath } from '../login/return-path';
import { readHubCounts } from '../../components/hub/hub-data.server';
import { HubHeader, HubPage, SectionDoors } from '../../components/hub/hub';
import { RunningMachines } from '../../components/me/running-machines';
import { sectionById } from '../../components/shell/nav';

export const metadata: Metadata = { title: t('shell.section.practice') };

const RULES = [
  { key: 'hub.practice.rule.expiry', icon: 'hourglass' },
  { key: 'hub.practice.rule.shared', icon: 'users' },
  { key: 'hub.practice.rule.size', icon: 'cpu' },
  { key: 'hub.practice.rule.window', icon: 'expand' },
] as const;

/**
 * `/practice`: tổng quan mục Thực hành. Cửa vào lab và sân chơi, máy đang chạy của
 * người xem, và bốn điều nên biết trước khi mở một máy trên cụm dùng chung.
 */
export default async function PracticeHubPage() {
  const session = await readRequestSession();
  if (session === null) {
    redirect(withReturnPath('/login', '/practice'));
  }

  const counts = await readHubCounts();
  const section = sectionById('practice');

  return (
    <HubPage>
      <HubHeader
        title={section.label}
        lead={section.lead}
        art="practice"
        actions={
          <>
            <Button asChild variant="primary" icon="flask">
              <Link href="/labs">{t('hub.practice.start')}</Link>
            </Button>
            <Button asChild variant="secondary" icon="sandbox">
              <Link href="/playgrounds">{t('hub.practice.playground')}</Link>
            </Button>
          </>
        }
      />
      <SectionDoors
        section={section}
        stats={{
          '/labs': { value: counts.labs, unit: t('hub.unit.labs') },
          '/playgrounds': { value: counts.playgrounds, unit: t('hub.unit.playgrounds') },
        }}
      />
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16">
        <RunningMachines />
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-semibold text-ink">{t('hub.practice.rule.title')}</h2>
          <ul className="flex flex-col">
            {RULES.map((rule) => (
              <li key={rule.key} className="flex gap-3 border-b border-rule py-3 text-sm text-ink-2 last:border-b-0">
                <Icon name={rule.icon} size={20} tint="acc" className="mt-0.5 shrink-0 text-acc-ink" />
                <span>{t(rule.key)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </HubPage>
  );
}
