'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Empty,
  EmptyArt,
  ErrorBlock,
  Pager,
  Pill,
  RowsSkeleton,
  Section,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ds';
import { err, t } from '@devops-platform/copy';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatWhen } from '../../lib/format-moment';
import { summarizeLabAttempt, summarizeQuizAttempt } from './attempt-summary';
import { summarizeLessonProgress } from './lesson-progress';
import { useCursorPages, type CursorPages } from './use-cursor-pages';
import { describeEmptyPage, shouldShowPager, type HistoryPageState } from './history-page-notice';

/** Lịch sử học: ba bảng (bài học, lab, trắc nghiệm), chỉ tab đang mở mới tải dữ liệu. */
export function HistoryTabs({ headingLevel = 2 }: { readonly headingLevel?: 2 | 3 }) {
  return (
    <Section title={t('me.history.title')} description={t('me.history.aside')} level={headingLevel} icon="history">
      <Tabs defaultValue="lessons">
        <TabsList>
          <TabsTrigger value="lessons" icon="book">
            {t('me.history.tab.lessons')}
          </TabsTrigger>
          <TabsTrigger value="labs" icon="flask">
            {t('me.history.tab.labs')}
          </TabsTrigger>
          <TabsTrigger value="quizzes" icon="quiz">
            {t('me.history.tab.quizzes')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lessons" className="pt-2">
          <LessonHistory />
        </TabsContent>
        <TabsContent value="labs" className="pt-2">
          <LabHistory />
        </TabsContent>
        <TabsContent value="quizzes" className="pt-2">
          <QuizHistory />
        </TabsContent>
      </Tabs>
    </Section>
  );
}

interface QueryLike {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isFetching: boolean;
  readonly error: unknown;
  refetch(): unknown;
}

function Frame({
  query,
  shape,
  pages,
  nextCursor,
  blank,
  children,
}: {
  query: QueryLike;
  shape: HistoryPageState;
  pages: CursorPages;
  nextCursor: string | null | undefined;
  blank: { title: string; description: string };
  children: ReactNode;
}) {
  if (query.isPending) return <RowsSkeleton rows={4} label={t('me.history.loading')} />;
  if (query.isError) {
    const entry = err('me.error.history-load', { reason: describeTrpcError(query.error) });
    return (
      <ErrorBlock
        title={entry.what}
        retryLabel={t('common.action.retry')}
        retrying={query.isFetching}
        onRetry={() => {
          if (pages.page > 1) pages.goFirst();
          else void query.refetch();
        }}
      >
        {entry.next}
      </ErrorBlock>
    );
  }
  const notice = describeEmptyPage(shape, blank);
  return (
    <div className="flex flex-col">
      {notice === null ? (
        children
      ) : (
        <Empty size="sm" art={<EmptyArt kind="nothing" width={64} />} title={notice.title}>
          {notice.description}
        </Empty>
      )}
      {shouldShowPager(shape) ? (
        <Pager
          status={t('common.pager.page', { page: pages.page })}
          previousLabel={t('common.pager.prev')}
          nextLabel={t('common.pager.next')}
          firstLabel={t('common.pager.first')}
          onFirst={pages.page > 1 ? pages.goFirst : undefined}
          onPrevious={pages.page > 1 ? pages.goPrevious : undefined}
          onNext={nextCursor == null ? undefined : () => pages.goNext(nextCursor)}
          loading={query.isFetching}
        />
      ) : null}
    </div>
  );
}

function LessonHistory() {
  const pages = useCursorPages();
  const progress = api.me.listProgress.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });
  const items = progress.data?.items ?? [];
  return (
    <Frame
      query={progress}
      pages={pages}
      nextCursor={progress.data?.nextCursor}
      shape={{ page: pages.page, itemCount: items.length, hasNext: progress.data?.nextCursor != null }}
      blank={{ title: t('me.lessons.blank-title'), description: t('me.lessons.blank-description') }}
    >
      <Table label={t('me.history.tab.lessons')}>
        <THead>
          <tr>
            <TH>{t('me.lessons.col.lesson')}</TH>
            <TH>{t('me.lessons.col.status')}</TH>
            <TH numeric>{t('me.lessons.col.updated')}</TH>
          </tr>
        </THead>
        <TBody>
          {items.map((row) => {
            const summary = summarizeLessonProgress({ stepIndex: row.stepIndex, completedAt: row.completedAt });
            return (
              <TR key={row.id}>
                <TD className="font-medium">
                  <Link href={`/lessons/${encodeURIComponent(row.lessonId)}`} className="hover:text-acc-ink hover:underline">
                    {row.lessonTitle ?? <span className="text-ink-3">{t('me.history.unreadable')}</span>}
                  </Link>
                </TD>
                <TD>
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={summary.variant}>{summary.label}</Pill>
                    {summary.detail === null ? null : <span className="text-ink-3">{summary.detail}</span>}
                  </span>
                </TD>
                <TD numeric className="whitespace-nowrap text-ink-2">
                  {formatWhen(row.updatedAt)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Frame>
  );
}

function LabHistory() {
  const pages = useCursorPages();
  const attempts = api.me.listLabAttempts.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });
  const items = attempts.data?.items ?? [];
  return (
    <Frame
      query={attempts}
      pages={pages}
      nextCursor={attempts.data?.nextCursor}
      shape={{
        page: pages.page,
        itemCount: items.length,
        hasNext: attempts.data?.nextCursor != null,
        skipped: attempts.data?.skipped ?? 0,
      }}
      blank={{ title: t('me.labs.blank-title'), description: t('me.labs.blank-description') }}
    >
      <Table label={t('me.history.tab.labs')}>
        <THead>
          <tr>
            <TH>{t('me.labs.col.lab')}</TH>
            <TH>{t('me.labs.col.result')}</TH>
            <TH numeric>{t('me.labs.col.score')}</TH>
            <TH numeric>{t('me.labs.col.duration')}</TH>
            <TH numeric>{t('me.labs.col.started')}</TH>
          </tr>
        </THead>
        <TBody>
          {items.map((item) => {
            const summary = summarizeLabAttempt({ status: item.status, score: item.score, durationSeconds: item.durationSeconds });
            return (
              <TR key={item.attempt.id}>
                <TD className="font-medium">
                  <Link href={`/labs/${encodeURIComponent(item.labId)}`} className="hover:text-acc-ink hover:underline">
                    {item.labTitle}
                  </Link>
                </TD>
                <TD>
                  <Pill tone={summary.statusVariant}>{summary.statusLabel}</Pill>
                </TD>
                <TD numeric>{summary.scoreLabel}</TD>
                <TD numeric className="whitespace-nowrap text-ink-2">
                  {summary.durationLabel}
                </TD>
                <TD numeric className="whitespace-nowrap text-ink-2">
                  {formatWhen(item.attempt.startedAt)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Frame>
  );
}

function QuizHistory() {
  const pages = useCursorPages();
  const attempts = api.me.listQuizAttempts.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });
  const items = attempts.data?.items ?? [];
  return (
    <Frame
      query={attempts}
      pages={pages}
      nextCursor={attempts.data?.nextCursor}
      shape={{ page: pages.page, itemCount: items.length, hasNext: attempts.data?.nextCursor != null }}
      blank={{ title: t('me.quizzes.blank-title'), description: t('me.quizzes.blank-description') }}
    >
      <Table label={t('me.history.tab.quizzes')}>
        <THead>
          <tr>
            <TH>{t('me.quizzes.col.quiz')}</TH>
            <TH>{t('me.quizzes.col.result')}</TH>
            <TH numeric>{t('me.quizzes.col.score')}</TH>
            <TH numeric>{t('me.quizzes.col.submitted')}</TH>
          </tr>
        </THead>
        <TBody>
          {items.map((item) => {
            const summary = summarizeQuizAttempt({ score: item.score });
            return (
              <TR key={item.attemptId}>
                <TD className="font-medium">
                  <Link href={`/quiz/${encodeURIComponent(item.quizId)}`} className="hover:text-acc-ink hover:underline">
                    {item.quizTitle}
                  </Link>
                </TD>
                <TD>
                  <Pill tone={summary.statusVariant}>{summary.statusLabel}</Pill>
                </TD>
                <TD numeric>{summary.scoreLabel}</TD>
                <TD numeric className="whitespace-nowrap text-ink-2">
                  {formatWhen(item.submittedAt)}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Frame>
  );
}
