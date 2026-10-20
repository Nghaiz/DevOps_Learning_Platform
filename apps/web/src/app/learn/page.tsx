import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { readRequestSession } from '../../server/auth/config';
import { withReturnPath } from '../login/return-path';
import { readHubCounts } from '../../components/hub/hub-data.server';
import { HubHeader, HubPage, SectionDoors } from '../../components/hub/hub';
import { ContinueLearning } from '../../components/me/continue-learning';
import { sectionById } from '../../components/shell/nav';

export const metadata: Metadata = { title: t('shell.section.learn') };

/**
 * `/learn`: tổng quan mục Học. Ba cửa vào (lộ trình, bài học, trắc nghiệm) có số nội
 * dung đã xuất bản, rồi phần đang học dở của chính người xem.
 */
export default async function LearnHubPage() {
  const session = await readRequestSession();
  if (session === null) {
    redirect(withReturnPath('/login', '/learn'));
  }

  const counts = await readHubCounts();
  const section = sectionById('learn');

  return (
    <HubPage>
      <HubHeader
        title={section.label}
        lead={section.lead}
        art="learn"
        actions={
          <>
            <Button asChild variant="primary" icon="book">
              <Link href="/lessons">{t('hub.learn.start')}</Link>
            </Button>
            <Button asChild variant="secondary" icon="stairs">
              <Link href="/paths">{t('hub.learn.paths')}</Link>
            </Button>
          </>
        }
      />
      <SectionDoors
        section={section}
        stats={{
          '/paths': { value: counts.paths, unit: t('hub.unit.paths') },
          '/lessons': { value: counts.lessons, unit: t('hub.unit.lessons') },
          '/quiz': { value: counts.quizzes, unit: t('hub.unit.quizzes') },
        }}
      />
      <ContinueLearning />
    </HubPage>
  );
}
