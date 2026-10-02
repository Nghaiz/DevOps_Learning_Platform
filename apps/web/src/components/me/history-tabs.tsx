'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { err, t } from '@devops-platform/copy';
import {
  Badge,
  CursorPager,
  EmptyState,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ui';
import { api } from '../../lib/trpc-react';
import { describeTrpcError } from '../../lib/trpc';
import { formatMoment } from '../../lib/format-moment';
import { BoardSkeleton, StationMarker, lineForTopic } from '../kit';
import { summarizeLabAttempt, summarizeQuizAttempt } from './attempt-summary';
import { summarizeLessonProgress } from './lesson-progress';
import { useCursorPages } from './use-cursor-pages';
import { describeEmptyPage, shouldShowPager, type HistoryNotice, type HistoryPageState } from './history-page-notice';

/**
 * Lịch sử: bài học · lab · trắc nghiệm, mỗi tab một sổ cái (design-brief §4.4)
 * phân trang bằng cursor.
 *
 * Radix Tabs KHÔNG render tab đang ẩn, nên `useQuery` của mỗi tab chỉ chạy khi
 * người dùng mở tab đó: `me.listLabAttempts` tính điểm cho từng lần thử, và nạp
 * cả ba danh sách lúc vào trang là ba lượt đọc nặng cho thứ phần lớn người dùng
 * không mở.
 *
 * Mọi điểm số TÍNH lúc đọc ở server; trang này không giữ bản sao nào.
 */
export function HistoryTabs(): ReactElement {
  return (
    <Tabs defaultValue="lessons">
      <TabsList>
        <TabsTrigger value="lessons">{t('me.history.tab.lessons')}</TabsTrigger>
        <TabsTrigger value="labs">{t('me.history.tab.labs')}</TabsTrigger>
        <TabsTrigger value="quizzes">{t('me.history.tab.quizzes')}</TabsTrigger>
      </TabsList>
      <TabsContent value="lessons">
        <LessonHistory />
      </TabsContent>
      <TabsContent value="labs">
        <LabHistory />
      </TabsContent>
      <TabsContent value="quizzes">
        <QuizHistory />
      </TabsContent>
    </Tabs>
  );
}

const TITLE_LINK =
  'inline-flex items-center gap-3 font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring';

function LessonHistory(): ReactElement {
  const pages = useCursorPages();
  const progress = api.me.listProgress.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });

  return (
    <HistoryFrame
      state={progress}
      blank={{ title: t('me.lessons.blank-title'), description: t('me.lessons.blank-description') }}
      page={{
        page: pages.page,
        itemCount: progress.data?.items.length ?? 0,
        hasNext: progress.data?.nextCursor != null,
      }}
      pager={
        <CursorPager
          hasNext={progress.data?.nextCursor != null}
          onNext={() => {
            pages.goNext(progress.data?.nextCursor ?? null);
          }}
          onReset={pages.goFirst}
          page={pages.page}
          loading={progress.isFetching}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('me.lessons.col.lesson')}</TableHead>
            <TableHead>{t('me.lessons.col.status')}</TableHead>
            <TableHead>{t('me.lessons.col.updated')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(progress.data?.items ?? []).map((row) => {
            const summary = summarizeLessonProgress({ stepIndex: row.stepIndex, completedAt: row.completedAt });
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/lessons/${encodeURIComponent(row.lessonId)}`} className={TITLE_LINK}>
                    <StationMarker line={lineForTopic({ id: row.lessonId })} />
                    <LessonTitle lessonId={row.lessonId} />
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge variant={summary.variant}>{summary.label}</Badge>
                    {summary.detail !== null && <span className="text-sm text-muted-foreground">{summary.detail}</span>}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatMoment(row.updatedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </HistoryFrame>
  );
}

/**
 * Tên bài học. `me.listProgress` chỉ trả `lessonId` (dòng `progress` không giữ
 * tên), nên mỗi dòng đọc tên qua `lessons.get`. Id thô không bao giờ hiện ra:
 * đang tải thì nói đang tải, đọc hỏng thì nói nội dung không còn đọc được.
 */
function LessonTitle({ lessonId }: { readonly lessonId: string }): ReactElement {
  const lesson = api.lessons.get.useQuery({ scenarioId: lessonId }, { retry: false, staleTime: 5 * 60_000 });
  if (lesson.isSuccess) {
    return <span>{lesson.data.scenario.title ?? t('me.history.unreadable')}</span>;
  }
  if (lesson.isError) {
    return <span className="text-muted-foreground">{t('me.history.unreadable')}</span>;
  }
  return <span className="text-muted-foreground">{t('me.history.title-loading')}</span>;
}

function LabHistory(): ReactElement {
  const pages = useCursorPages();
  const attempts = api.me.listLabAttempts.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });

  return (
    <HistoryFrame
      state={attempts}
      blank={{ title: t('me.labs.blank-title'), description: t('me.labs.blank-description') }}
      page={{
        page: pages.page,
        itemCount: attempts.data?.items.length ?? 0,
        hasNext: attempts.data?.nextCursor != null,
        // `me.listLabAttempts` bỏ dòng có lab đã bị gỡ; xem `history-page-notice.ts`.
        skipped: attempts.data?.skipped ?? 0,
      }}
      pager={
        <CursorPager
          hasNext={attempts.data?.nextCursor != null}
          onNext={() => {
            pages.goNext(attempts.data?.nextCursor ?? null);
          }}
          onReset={pages.goFirst}
          page={pages.page}
          loading={attempts.isFetching}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('me.labs.col.lab')}</TableHead>
            <TableHead>{t('me.labs.col.result')}</TableHead>
            <TableHead>{t('me.labs.col.score')}</TableHead>
            <TableHead>{t('me.labs.col.duration')}</TableHead>
            <TableHead>{t('me.labs.col.started')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(attempts.data?.items ?? []).map((item) => {
            const summary = summarizeLabAttempt({
              status: item.status,
              score: item.score,
              durationSeconds: item.durationSeconds,
            });
            return (
              <TableRow key={item.attempt.id}>
                <TableCell>
                  <Link href={`/labs/${encodeURIComponent(item.labId)}`} className={TITLE_LINK}>
                    <StationMarker line={lineForTopic({ id: item.labId })} />
                    {item.labTitle}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={summary.statusVariant}>{summary.statusLabel}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm tabular-nums">{summary.scoreLabel}</TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                  {summary.durationLabel}
                </TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatMoment(item.attempt.startedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </HistoryFrame>
  );
}

function QuizHistory(): ReactElement {
  const pages = useCursorPages();
  const attempts = api.me.listQuizAttempts.useQuery(pages.cursor === undefined ? {} : { cursor: pages.cursor });

  return (
    <HistoryFrame
      state={attempts}
      blank={{ title: t('me.quizzes.blank-title'), description: t('me.quizzes.blank-description') }}
      page={{
        page: pages.page,
        itemCount: attempts.data?.items.length ?? 0,
        hasNext: attempts.data?.nextCursor != null,
      }}
      pager={
        <CursorPager
          hasNext={attempts.data?.nextCursor != null}
          onNext={() => {
            pages.goNext(attempts.data?.nextCursor ?? null);
          }}
          onReset={pages.goFirst}
          page={pages.page}
          loading={attempts.isFetching}
        />
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('me.quizzes.col.quiz')}</TableHead>
            <TableHead>{t('me.quizzes.col.result')}</TableHead>
            <TableHead>{t('me.quizzes.col.score')}</TableHead>
            <TableHead>{t('me.quizzes.col.submitted')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(attempts.data?.items ?? []).map((item) => {
            const summary = summarizeQuizAttempt({ score: item.score });
            return (
              <TableRow key={item.attemptId}>
                <TableCell>
                  <Link href={`/quiz/${encodeURIComponent(item.quizId)}`} className={TITLE_LINK}>
                    <StationMarker line={lineForTopic({ id: item.quizId })} />
                    {item.quizTitle ?? t('me.history.unreadable')}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={summary.statusVariant}>{summary.statusLabel}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm tabular-nums">{summary.scoreLabel}</TableCell>
                <TableCell className="font-mono text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                  {formatMoment(item.submittedAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </HistoryFrame>
  );
}

/**
 * Bốn trạng thái dùng chung của một tab: đang tải · lỗi · rỗng · có dữ liệu.
 *
 * Câu cho trang rỗng KHÔNG cố định: `describeEmptyPage` biết trang hiện tại, còn
 * trang sau hay không, và tầng đọc đã bỏ bao nhiêu dòng. Pager đi kèm cả trang
 * rỗng, vì giấu nó là cắt đường sang trang sau và đường về trang đầu.
 */
function HistoryFrame(props: {
  readonly state: {
    readonly isPending: boolean;
    readonly isError: boolean;
    readonly isFetching: boolean;
    readonly error: unknown;
    readonly refetch: () => unknown;
  };
  readonly page: HistoryPageState;
  readonly blank: HistoryNotice;
  readonly pager: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const { state, page, blank, pager, children } = props;

  if (state.isPending) {
    return (
      <div className="mt-6">
        <BoardSkeleton rows={4} label={t('me.history.loading')} />
      </div>
    );
  }

  if (state.isError) {
    const entry = err('me.error.history-load', { reason: describeTrpcError(state.error) });
    return (
      <div className="mt-6">
        <ErrorState
          title={entry.what}
          message={entry.next}
          onRetry={() => void state.refetch()}
          retrying={state.isFetching}
        />
      </div>
    );
  }

  const notice = describeEmptyPage(page, blank);
  return (
    <div className="mt-6 flex flex-col gap-4">
      {notice === null ? children : <EmptyState title={notice.title} description={notice.description} />}
      {shouldShowPager(page) ? pager : null}
    </div>
  );
}
