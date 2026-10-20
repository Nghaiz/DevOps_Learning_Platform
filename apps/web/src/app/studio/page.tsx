import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { HubHeader, HubPage, SectionDoors } from '../../components/hub/hub';
import { StudioRecent } from '../../components/hub/studio-recent';
import { sectionById } from '../../components/shell/nav';

export const metadata: Metadata = { title: t('shell.section.studio') };

/**
 * `/studio`: tổng quan mục Soạn bài, chỉ mở cho Tác giả và Quản trị (cổng ở
 * `layout.tsx`). Ba cửa vào và năm bài sửa gần nhất của người xem.
 */
export default function StudioHubPage() {
  const section = sectionById('studio');

  return (
    <HubPage>
      <HubHeader
        title={section.label}
        lead={section.lead}
        art="studio"
        actions={
          <>
            <Button asChild variant="primary" icon="plus">
              <Link href="/author/new">{t('hub.studio.new-lesson')}</Link>
            </Button>
            <Button asChild variant="secondary" icon="problem">
              <Link href="/author/problems/new">{t('hub.studio.new-problem')}</Link>
            </Button>
          </>
        }
      />
      <SectionDoors section={section} />
      <StudioRecent />
    </HubPage>
  );
}
