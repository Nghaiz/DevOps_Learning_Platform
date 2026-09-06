'use client';

import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';
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
import { useCursorPages } from './use-cursor-pages';

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
    <section aria-labelledby="lich-su" className="flex flex-col gap-3">
      <h2 id="lich-su" className="text-lg font-medium text-foreground">
        Lịch sử học
      </h2>
      <Tabs defaultValue="lessons">
        <TabsList>
          <TabsTrigger value="lessons">Bài học</TabsTrigger>
          <TabsTrigger value="labs">Lab</TabsTrigger>
          <TabsTrigger value="quizzes">Quiz</TabsTrigger>
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
    </section>
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
      empty={
        <EmptyState
          title="Chưa có bài học nào"
          description="Mở một bài học và tiến độ của bạn sẽ hiện ở đây."
        />
      }
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
      isEmpty={progress.data?.items.length === 0}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bài học</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Cập nhật</TableHead>
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
                <TableCell className="text-muted-foreground">
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
      empty={
        <EmptyState
          title="Chưa có lần thử lab nào"
          description="Bắt đầu một lab và mọi lần thử của bạn sẽ được ghi lại ở đây."
        />
      }
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
      isEmpty={attempts.data?.items.length === 0}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lab</TableHead>
            <TableHead>Kết quả</TableHead>
            <TableHead>Điểm</TableHead>
            <TableHead>Thời lượng</TableHead>
            <TableHead>Bắt đầu</TableHead>
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
                <TableCell className="text-muted-foreground">{summary.durationLabel}</TableCell>
                <TableCell className="text-muted-foreground">
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
      empty={
        <EmptyState
          title="Chưa có lượt làm quiz nào"
          description="Làm một quiz và kết quả từng lượt sẽ hiện ở đây."
        />
      }
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
      isEmpty={attempts.data?.items.length === 0}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quiz</TableHead>
            <TableHead>Kết quả</TableHead>
            <TableHead>Điểm</TableHead>
            <TableHead>Nộp lúc</TableHead>
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
                <TableCell className="text-muted-foreground">
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
 */
function HistoryFrame(props: {
  readonly state: {
    readonly isPending: boolean;
    readonly isError: boolean;
    readonly isFetching: boolean;
    readonly error: unknown;
    readonly refetch: () => unknown;
  };
  readonly isEmpty: boolean;
  readonly empty: ReactNode;
  readonly pager: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  const { state, isEmpty, empty, pager, children } = props;

  if (state.isPending) {
    return <Skeleton className="mt-4 h-40 w-full" />;
  }

  if (state.isError) {
    return (
      <div className="mt-4">
        <ErrorState
          message={describeTrpcError(state.error)}
          onRetry={() => void state.refetch()}
          retrying={state.isFetching}
        />
      </div>
    );
  }

  if (isEmpty) {
    return <div className="mt-4">{empty}</div>;
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {children}
      {pager}
    </div>
  );
}
