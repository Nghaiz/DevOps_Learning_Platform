'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { Settings } from 'lucide-react';
import { t } from '@devops-platform/copy';
import { Button, Num } from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { PageContainer, Split, ToolHeader, WithNums, numSlot } from '../../components/kit';
import { describeProfileCapacity, useCapacity, useViewer } from '../../components/shell';
import { ActiveSessions } from '../../components/me/active-sessions';
import { HistoryTabs } from '../../components/me/history-tabs';
import { LearningNow } from '../../components/me/learning-now';

/**
 * `/me` "Bàn học": đầu trang mang tên người học, rồi ba khối Split đánh số:
 * đang học, phiên đang mở, lịch sử.
 *
 * ⛔ Không `<main>` (hợp đồng C6bis): vỏ ứng dụng sở hữu landmark đó.
 * ⛔ Không hàng thẻ số (design-brief §0.4): hai con số của trang nằm trong câu
 * dẫn, in bằng `Num`.
 *
 * Câu dẫn đọc CÙNG khoá query với hai khối bên dưới (`paths.mine({})`,
 * `me.activeSessions({})`), nên react-query gộp làm một lượt gọi; không có bản
 * sao nào của hai con số.
 */
export function MeClient(): ReactElement {
  const viewer = useViewer();

  return (
    <>
      <ToolHeader
        kicker={t('me.desk.kicker')}
        title={viewer?.name ?? t('me.desk.title-fallback')}
        actions={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Settings aria-hidden="true" />
              {t('me.desk.settings')}
            </Link>
          </Button>
        }
      />
      <PageContainer className="pb-16">
        <DeskLead />
        <Split index="01" title={t('me.learning.title')} aside={t('me.learning.aside')}>
          <LearningNow />
        </Split>
        <Split index="02" title={t('me.sessions.title')} aside={<SessionsAside />}>
          <ActiveSessions />
        </Split>
        <Split index="03" title={t('me.history.title')} aside={t('me.history.aside')}>
          <HistoryTabs />
        </Split>
      </PageContainer>
    </>
  );
}

/** Hai câu dẫn, mỗi câu chỉ hiện khi con số của nó đã đọc được. */
function DeskLead(): ReactElement {
  const paths = api.paths.mine.useQuery({});
  const sessions = api.me.activeSessions.useQuery({});

  const pathCount = paths.data?.items.length ?? null;
  const sessionCount = sessions.data?.items.length ?? null;
  const moreSessions = sessions.data?.nextCursor != null;

  return (
    <p className="max-w-3xl py-8 type-lead text-muted-foreground" aria-live="polite">
      {pathCount !== null &&
        (pathCount === 0 ? (
          t('me.desk.paths-none')
        ) : (
          <WithNums
            text={t('me.desk.paths-count', { n: numSlot(0) })}
            nums={[
              <Num key="paths" tone="primary" className="text-foreground">
                {pathCount}
              </Num>,
            ]}
          />
        ))}{' '}
      {sessionCount !== null &&
        (sessionCount === 0 ? (
          t('me.desk.sessions-none')
        ) : (
          <WithNums
            text={
              moreSessions
                ? t('me.desk.sessions-at-least', { n: numSlot(0) })
                : t('me.desk.sessions-count', { n: numSlot(0) })
            }
            nums={[
              <Num key="sessions" className="text-foreground">
                {sessionCount}
              </Num>,
            ]}
          />
        ))}
    </p>
  );
}

/**
 * Sức chứa của lớp đi cạnh danh sách phiên: kết thúc một phiên là trả một chỗ.
 * `null` = CHƯA BIẾT (quota đọc lỗi), khác hẳn "đã đầy"; không lấp bằng một số đoán.
 */
function SessionsAside(): ReactElement {
  const capacity = useCapacity();
  const reading = capacity.data === null ? null : describeProfileCapacity(capacity.data);
  const unknown = capacity.data !== null && reading === null;
  return (
    <>
      <p>{t('me.sessions.aside')}</p>
      {reading !== null && (
        <p className="mt-3">
          <span className="block font-medium text-foreground">{reading.label}</span>
          <span className="mt-1 block">{reading.detail}</span>
        </p>
      )}
      {unknown && (
        <p className="mt-3">
          <span className="block font-medium text-foreground">{t('me.capacity.unknown')}</span>
          <span className="mt-1 block">{t('me.capacity.unknown-detail')}</span>
        </p>
      )}
    </>
  );
}
