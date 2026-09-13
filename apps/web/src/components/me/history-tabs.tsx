'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
import { err, t } from '@devops-platform/copy';
import {
  Badge,
  CursorPager,
  EmptyState,
  ErrorState,
  Skeleton,
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
import { summarizeLabAttempt, summarizeQuizAttempt } from './attempt-summary';
import { summarizeLessonProgress } from './lesson-progress';
import { formatMoment } from '../../lib/format-moment';
import { MeSection } from './me-section';
import { useCursorPages } from './use-cursor-pages';
import {
  describeEmptyPage,
  shouldShowPager,
  type HistoryNotice,
  type HistoryPageState,
} from './history-page-notice';

/**
 * Lịch sử học: bài học · lab · quiz.
 *
 * ## Vì sao ba danh sách nằm trong Tabs chứ không xếp chồng nhau
 *
 * Radix Tabs KHÔNG render tab đang ẩn, nên `useQuery` trong mỗi tab chỉ bắn khi
 * người dùng mở tab đó. Xếp chồng cả ba sẽ nạp ba danh sách phân trang ngay lúc
 * vào `/me` — và `me.listLabAttempts` nạp thêm `lab_task_results` + định nghĩa
 * lab cho TỪNG lần thử trong trang để tính điểm. Đó là ba lượt đọc nặng cho một
 * trang mà phần lớn người dùng chỉ nhìn hai dòng đầu.
 *
 * ## Mọi điểm số ở đây đều TÍNH lúc đọc
 *
 * `lab_attempts` không có cột `percent`/`status`/`duration`; `quiz_attempts`
 * không có cột `score`. Server tính lại ở mỗi lượt query bằng `computeLabScore`
 * / `gradeQuiz`, và trang này chỉ đọc payload của lượt hiện tại — không
 * `useState` nào giữ một bản sao rồi khẳng định từ nó (13.E mục 19).
 */
export function HistoryTabs(): ReactElement {
  return (
    <MeSection id="lich-su" title={t('me.history.title')}>
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
    </MeSection>
  );
}

function LessonHistory(): ReactElement {
  const pages = useCursorPages();
  const progress = api.me.listProgress.useQuery(
    pages.cursor === undefined ? {} : { cursor: pages.cursor },
  );

  return (
    <HistoryFrame
      state={progress}
      blank={{
        title: t('me.lessons.blank-title'),
        description: t('me.lessons.blank-description'),
      }}
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
            const summary = summarizeLessonProgress({
              stepIndex: row.stepIndex,
              completedAt: row.completedAt,
            });
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    href={`/lessons/${row.lessonId}`}
                    className="rounded-md font-mono text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.lessonId}
                  </Link>
                </TableCell>
                <TableCell className="flex flex-wrap items-center gap-2">
                  <Badge variant={summary.variant}>{summary.label}</Badge>
                  {summary.detail !== null && (
                    <span className="text-xs text-muted-foreground">{summary.detail}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
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

function LabHistory(): ReactElement {
  const pages = useCursorPages();
  const attempts = api.me.listLabAttempts.useQuery(
    pages.cursor === undefined ? {} : { cursor: pages.cursor },
  );

  return (
    <HistoryFrame
      state={attempts}
      blank={{
        title: t('me.labs.blank-title'),
        description: t('me.labs.blank-description'),
      }}
      page={{
        page: pages.page,
        itemCount: attempts.data?.items.length ?? 0,
        hasNext: attempts.data?.nextCursor != null,
        // `me.listLabAttempts` bỏ dòng có lab đã bị gỡ — trang có thể sạch trơn
        // trong khi lịch sử vẫn còn ở trang sau. Xem `history-page-notice.ts`.
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
                  <Link
                    href={`/labs/${item.labId}`}
                    className="rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.labTitle ?? item.labId}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={summary.statusVariant}>{summary.statusLabel}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{summary.scoreLabel}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {summary.durationLabel}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
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
  const attempts = api.me.listQuizAttempts.useQuery(
    pages.cursor === undefined ? {} : { cursor: pages.cursor },
  );

  return (
    <HistoryFrame
      state={attempts}
      blank={{
        title: t('me.quizzes.blank-title'),
        description: t('me.quizzes.blank-description'),
      }}
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
                  <Link
                    href={`/quiz/${item.quizId}`}
                    className="rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.quizTitle ?? item.quizId}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={summary.statusVariant}>{summary.statusLabel}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{summary.scoreLabel}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
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
 * Bốn trạng thái dùng chung của một tab lịch sử: đang tải · lỗi · rỗng · có dữ
 * liệu. Gom vào một chỗ để ba tab không trôi khỏi nhau về cách báo lỗi — và để
 * không tab nào "quên" trạng thái rỗng rồi hiện một cái bảng không có dòng nào.
 *
 * ⚠ Trạng thái rỗng KHÔNG còn là một `ReactNode` cố định do tab truyền xuống.
 * Câu đúng phụ thuộc vào trang hiện tại (`page`), còn trang sau hay không
 * (`hasNext`) và tầng đọc đã bỏ bao nhiêu dòng (`skipped`) — `describeEmptyPage`
 * là nơi duy nhất biết ba thứ đó ghép lại thành câu nào. Tab chỉ đưa `blank`,
 * tức câu cho ca "thật sự chưa có gì".
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
    return <Skeleton className="mt-4 h-40 w-full" />;
  }

  if (state.isError) {
    // Hai nửa vào hai khe RIÊNG: `what` là tiêu đề, `next` là câu dưới. Ghép
    // chúng rồi đổ cả cục vào `message` sẽ để `title` rơi về mặc định của
    // `ErrorState`, thứ nói một chuyện khác với chuyện vừa hỏng.
    const entry = err('me.error.history-load', { reason: describeTrpcError(state.error) });
    return (
      <div className="mt-4">
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
  // Pager đi kèm CẢ hai nhánh: giấu nó ở trang rỗng là cắt luôn đường sang
  // trang sau và đường về trang đầu — xem `shouldShowPager`.
  const nav = shouldShowPager(page) ? pager : null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      {notice === null ? (
        children
      ) : (
        <EmptyState title={notice.title} description={notice.description} />
      )}
      {nav}
    </div>
  );
}
