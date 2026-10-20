'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { Button, Icon, Page, SectionArt, Skeleton } from '@devops-platform/ds';
import { t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { formatWhen } from '../../lib/format-moment';
import { sectionsFor } from '../../components/shell/nav';
import { useViewer } from '../../components/shell/viewer-context';
import { ClassExams } from '../../components/me/class-exams';
import { ContinueLearning } from '../../components/me/continue-learning';
import { HistoryTabs } from '../../components/me/history-tabs';
import { RunningMachines } from '../../components/me/running-machines';
import { describeMySessionStatus, describeSessionExpiry } from '../../components/me/session-summary';
import { examWindow } from '../(session)/exams/exam-status';

const CONTENT_HREF = {
  lesson: (id: string) => `/lessons/${encodeURIComponent(id)}`,
  lab: (id: string) => `/labs/${encodeURIComponent(id)}`,
  playground: (id: string) => `/playgrounds/${encodeURIComponent(id)}`,
} as const;

interface Lead {
  readonly sentence: string;
  readonly action: { readonly label: string; readonly href: string } | null;
}

/**
 * Câu mở đầu nói đúng MỘT việc nên làm tiếp, theo thứ tự: máy đang chạy (đang tốn
 * chỗ của cụm), bài học đang dở, kỳ thi đang mở. Không có gì thì nói thẳng là không có.
 *
 * Ba query trùng khoá với ba khối bên dưới nên react-query gộp làm một lượt gọi.
 * `null` = còn đang tải, để câu không nhảy từ "không có gì" sang "máy đang chạy".
 */
function useLead(): Lead | null {
  const sessions = api.me.activeSessions.useQuery({});
  const progress = api.me.listProgress.useQuery({});
  const exams = api.examSitting.list.useQuery();

  if (sessions.isPending || progress.isPending) return null;

  const machine = sessions.data?.items.find((session) => describeMySessionStatus(session.status).live);
  if (machine !== undefined) {
    const left = describeSessionExpiry(machine.expiresAt, Date.now());
    if (machine.content === null) {
      return {
        sentence: t('me.home.lead-machine-untitled', { left }),
        action: { label: t('me.machines.terminal'), href: `/session/${encodeURIComponent(machine.id)}/terminal` },
      };
    }
    return {
      sentence: t('me.home.lead-machine', { title: machine.content.title, left }),
      action: { label: t('me.machines.resume'), href: CONTENT_HREF[machine.content.kind](machine.content.id) },
    };
  }

  const lesson = (progress.data?.items ?? [])
    .filter((row) => row.completedAt === null && row.lessonTitle !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (lesson !== undefined && lesson.lessonTitle !== null) {
    return {
      sentence: t('me.home.lead-lesson', { title: lesson.lessonTitle, step: lesson.stepIndex + 1 }),
      action: { label: t('me.continue.open'), href: CONTENT_HREF.lesson(lesson.lessonId) },
    };
  }

  const exam = exams.data?.items.find(
    (item) => item.submittedAt === null && examWindow(item, exams.data.serverNow) === 'open',
  );
  if (exam !== undefined && exam.closesAt !== null) {
    return {
      sentence: t('me.home.lead-exam', { title: exam.title, until: formatWhen(exam.closesAt) }),
      action: { label: t('me.exams.enter'), href: `/exams/${encodeURIComponent(exam.id)}` },
    };
  }

  return { sentence: t('me.home.lead-quiet'), action: null };
}

/**
 * `/me`: trang của riêng người học. Đầu trang là lời chào và việc nên làm tiếp; thân
 * trang chia hai cột: việc đang dở bên trái, kỳ thi và lối đi nhanh bên phải.
 *
 * ⛔ Không `<main>`: vỏ ứng dụng sở hữu landmark đó. Không hàng thẻ số liệu.
 */
export function MeClient(): ReactElement {
  const viewer = useViewer();
  const lead = useLead();
  const firstName = viewer?.name.trim().split(/\s+/).at(-1);

  return (
    <Page className="flex flex-col pb-14">
      <header className="group grid items-center gap-8 pb-10 pt-10 sm:pt-12 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            {firstName === undefined || firstName === '' ? t('me.home.greeting-anon') : t('me.home.greeting', { name: firstName })}
          </h1>
          <div aria-live="polite" className="min-h-[3.5rem] max-w-[56ch] text-lg text-ink-2">
            {lead === null ? (
              <span className="flex flex-col gap-2 pt-1.5">
                <Skeleton className="h-4 w-[34ch] max-w-full" />
                <Skeleton className="h-4 w-[22ch] max-w-full" />
              </span>
            ) : (
              <p>{lead.sentence}</p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {lead?.action == null ? (
              <>
                <Button asChild variant="primary" icon="book">
                  <Link href="/lessons">{t('me.home.browse-lessons')}</Link>
                </Button>
                <Button asChild variant="secondary" icon="flask">
                  <Link href="/labs">{t('me.home.browse-labs')}</Link>
                </Button>
              </>
            ) : (
              <Button asChild variant="primary" iconRight="arrow-right">
                <Link href={lead.action.href}>{lead.action.label}</Link>
              </Button>
            )}
            <Button asChild variant="ghost" icon="sliders">
              <Link href="/settings">{t('me.home.settings')}</Link>
            </Button>
          </div>
        </div>
        <SectionArt kind="me" width={240} className="hidden md:block" />
      </header>

      <div className="grid gap-14 border-t border-rule pt-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-14">
          <RunningMachines />
          <ContinueLearning />
          <HistoryTabs />
        </div>
        <aside className="flex flex-col gap-12" aria-label={t('me.home.aside')}>
          <ClassExams />
          <Shortcuts />
        </aside>
      </div>
    </Page>
  );
}

/** Lối đi nhanh tới từng mục lớn, mỗi mục giữ màu riêng của nó. */
function Shortcuts(): ReactElement {
  const viewer = useViewer();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
        <Icon name="target" size={20} tint="acc" className="text-acc-ink" />
        {t('me.home.shortcuts')}
      </h2>
      <ul className="flex flex-col">
        {sectionsFor(viewer).map((section) => (
          <li key={section.id} data-section={section.id} className="border-b border-rule last:border-b-0">
            <Link
              href={section.hub}
              className="group/sc -mx-3 flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 hover:bg-acc-wash"
            >
              <Icon
                name={section.icon}
                size={22}
                tint="acc"
                className="shrink-0 text-acc-ink transition-transform duration-200 ease-out group-hover/sc:-rotate-6"
              />
              <span className="min-w-0 flex-1 font-medium text-ink group-hover/sc:text-acc-ink">{section.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
