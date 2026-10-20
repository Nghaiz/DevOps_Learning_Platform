'use client';

import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { renderCopy, t } from '@devops-platform/copy';
import {
  BackLink,
  Button,
  Empty,
  EmptyArt,
  ErrorBlock,
  GameArt,
  Icon,
  Page,
  PageHeader,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type GameArtKind,
} from '@devops-platform/ds';
import { Markdown } from '@devops-platform/ds/content';
import type { GameId } from '@devops-platform/games';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import { topicLook } from '../../../../lib/topic-look';
import { contentLabels } from '../../../../components/session/practice-labels';
import { ProblemDifficultyMark, ViewerStatusMark } from '../problem-badges';
import { gameName } from '../problem-game';
import { formatTimeLimit } from '../problem-labels';
import { ProblemOverview } from './problem-overview';
import { ProblemHints } from './problem-hints';
import { ProblemTestcases } from './problem-testcases';
import { ProblemSubmissions } from './problem-submissions';

/** Trang chi tiết chỉ hiện trang đầu lịch sử nộp, xem lý do ở `ProblemSubmissions`. */
const SUBMISSION_PAGE_SIZE = 10;

const LABELS = contentLabels();

/**
 * Hệ bài tập chưa có đường phục vụ tệp đính kèm, nên một ảnh tương đối trong đề là
 * thứ KHÔNG tải được. Trả `null` để khối nội dung vẽ chỗ trống có nhãn.
 */
const NO_ASSETS = (): null => null;

/** Minh hoạ của game ở dải đầu trang. Game chưa có hình thì dải chỉ có chữ. */
const GAME_ART: Readonly<Partial<Record<GameId, GameArtKind>>> = {
  k8s: 'k8s',
  git: 'git',
  cicd: 'cicd',
  netpol: 'netpol',
  dockerfile: 'dockerfile',
};

/**
 * `/problems/[code]`: dải đầu trang mang màu của game, rồi đề bài như một văn bản
 * đọc (cột trái), nút vào game + thông tin bài (cột phải), và ba thẻ Kiểm tra, Gợi
 * ý, Lượt nộp dưới đề.
 *
 * Ba lượt gọi mạng chứ không phải một, và đó là chủ ý: `byCode` phải `invalidate`
 * được riêng sau khi mở gợi ý mà không kéo theo lịch sử nộp.
 *
 * `mySubmissions` chạy song song và có trạng thái lỗi RIÊNG: máy chủ trả được đề mà
 * hỏng phần lịch sử là chuyện có thật, và khi đó ẩn cả đề là lấy đi thứ người dùng
 * vào đây để đọc.
 *
 * ⛔ KHÔNG `<main>`: vỏ ứng dụng sở hữu landmark đó; cái thứ hai làm axe đỏ
 * `landmark-unique` (`components/session/landmark-contract.test.ts`).
 */
export function ProblemClient({ code }: { readonly code: string }): ReactElement {
  const utils = api.useUtils();
  const detail = api.problems.byCode.useQuery({ code });
  const submissions = api.problems.mySubmissions.useQuery({ code, limit: SUBMISSION_PAGE_SIZE });
  const reveal = api.problems.revealHint.useMutation({
    onSuccess: async () => {
      // Đọc lại `byCode` thay vì nhét kết quả mutation vào cache bằng tay:
      // `revealed`/`text` do máy chủ quyết, nên máy chủ cũng là chỗ duy nhất được
      // phép nói chúng đã đổi.
      await utils.problems.byCode.invalidate({ code });
    },
  });

  const back = (
    <BackLink asChild>
      <Link href="/problems">{t('problem.oj.title')}</Link>
    </BackLink>
  );

  if (detail.isPending) {
    return (
      <Page>
        <PageHeader back={back} title={<span className="font-mono">{code}</span>} />
        {/*
          Một vùng `role="status"` có nhãn, không phải mấy hình chữ nhật câm: không có
          nhãn thì trình đọc màn hình báo trang đã tải xong trong lúc chưa có gì để đọc.
        */}
        <div
          role="status"
          aria-live="polite"
          aria-label={t('problem.oj.detail.loading')}
          className="grid gap-10 pb-16 lg:grid-cols-[minmax(0,1fr)_20rem]"
        >
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-[68ch]" />
            <Skeleton className="h-4 w-full max-w-[60ch]" />
            <Skeleton className="h-4 w-full max-w-[64ch]" />
            <Skeleton className="mt-3 h-40 w-full max-w-[68ch]" />
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </Page>
    );
  }

  if (detail.isError) {
    // `NOT_FOUND` gồm cả bài `draft`: bài nháp không hiện với người học KỂ CẢ khi họ
    // biết URL, nên máy chủ trả "không có" chứ không phải "không được xem".
    const notFound = trpcErrorCode(detail.error) === 'NOT_FOUND';
    return (
      <Page className="pb-16">
        <PageHeader back={back} title={<span className="font-mono">{code}</span>} />
        {notFound ? (
          <Empty
            title={t('problem.oj.detail.not-found-title', { code })}
            art={<EmptyArt kind="lost" />}
            action={
              <Button asChild variant="secondary" icon="arrow-left">
                <Link href="/problems">{t('problem.oj.detail.back')}</Link>
              </Button>
            }
          >
            {t('problem.oj.detail.not-found-body')}
          </Empty>
        ) : (
          <ErrorBlock
            title={t('problem.oj.detail.error-title')}
            retryLabel={t('common.action.retry')}
            retrying={detail.isFetching}
            onRetry={() => void detail.refetch()}
          >
            {describeTrpcError(detail.error)}
          </ErrorBlock>
        )}
      </Page>
    );
  }

  const { problem, stats, viewerStatus } = detail.data;
  const look = topicLook({ gameId: problem.gameId });
  const art = GAME_ART[problem.gameId];
  const latest = submissions.data?.items[0] ?? null;
  const submissionCount =
    submissions.data === undefined ? undefined : `${submissions.data.items.length}${submissions.data.nextCursor != null ? '+' : ''}`;

  return (
    <div data-topic={look.topic}>
      {/* Dải đầu trang mang màu của game: trang đề thuộc về game của nó. */}
      <div className="border-b border-rule bg-tp-wash">
        <Page className="relative">
          <PageHeader back={back} title={problem.title} className="pb-7 lg:pr-64">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <Icon name={look.icon} size={18} tint="topic" className="text-tp-ink" />
                {gameName(problem.gameId)}
              </span>
              <span className="font-mono text-ink-3">{problem.code}</span>
              <ProblemDifficultyMark value={problem.difficulty} />
              <ViewerStatusMark value={viewerStatus} />
            </div>
          </PageHeader>
          {art === undefined ? null : (
            <GameArt
              kind={art}
              width={208}
              className="pointer-events-none absolute bottom-3 right-8 hidden animate-enter lg:block"
            />
          )}
        </Page>
      </div>

      <Page className="py-10 md:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-14">
          {/*
            Cột thông tin đứng TRƯỚC trong DOM để nút "Mở trong game" là thứ đầu tiên
            bàn phím và màn hẹp gặp; lưới đặt nó sang cột phải trên màn rộng.
          */}
          <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
            <ProblemOverview problem={problem} stats={stats} viewerStatus={viewerStatus} latest={latest} />
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <article className="max-w-[72ch]">
              <h2 className="font-display text-lg font-semibold text-ink">{t('problem.oj.detail.statement')}</h2>
              {/*
                Hạn giờ nói TRƯỚC khi bấm, không phải sau: người đọc đề rồi mới biết bài
                chạy đồng hồ đã mất một phần thời gian của chính lượt đó.
              */}
              {problem.timeLimitSec === null ? null : (
                <TimeLimitNote>
                  {t('problem.oj.detail.time-limit', { limit: renderCopy(formatTimeLimit(problem.timeLimitSec)) })}
                </TimeLimitNote>
              )}
              <div className="mt-5">
                <Markdown markdown={problem.statement} labels={LABELS} resolveAssetUrl={NO_ASSETS} />
              </div>
            </article>

            <Tabs defaultValue="checks" className="mt-12">
              <TabsList aria-label={t('problem.oj.detail.tabs')}>
                <TabsTrigger value="checks" icon="target" count={problem.testcases.length}>
                  {t('problem.oj.detail.tab-checks')}
                </TabsTrigger>
                <TabsTrigger value="hints" icon="lightbulb" count={problem.hints.length}>
                  {t('problem.oj.detail.tab-hints')}
                </TabsTrigger>
                <TabsTrigger value="submissions" icon="history" {...(submissionCount === undefined ? {} : { count: submissionCount })}>
                  {t('problem.oj.detail.tab-subs')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="checks" className="pt-6">
                {/*
                  Nhãn của testcase ẩn đã bị MÁY CHỦ cắt trước khi tới đây
                  (`server/problems/solver.ts`); component chỉ vẽ thứ nó nhận được.
                */}
                <ProblemTestcases testcases={problem.testcases} />
              </TabsContent>
              <TabsContent value="hints" className="pt-6">
                <ProblemHints
                  hints={problem.hints}
                  pendingHintId={reveal.isPending ? (reveal.variables?.hintId ?? null) : null}
                  errorMessage={reveal.isError ? describeTrpcError(reveal.error) : null}
                  onReveal={(hintId) => {
                    reveal.mutate({ code, hintId });
                  }}
                />
              </TabsContent>
              <TabsContent value="submissions" className="pt-6">
                <ProblemSubmissions
                  items={submissions.data?.items ?? []}
                  isPending={submissions.isPending}
                  isError={submissions.isError}
                  errorMessage={describeTrpcError(submissions.error)}
                  hasMore={submissions.data?.nextCursor != null}
                  onRetry={() => void submissions.refetch()}
                  retrying={submissions.isFetching}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </Page>
    </div>
  );
}

function TimeLimitNote({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <p className="mt-4 flex items-start gap-2.5 rounded-md bg-warn-wash px-4 py-3 text-sm text-ink">
      {/* Màu cảnh báo ở biểu tượng, chữ là mực: chữ vàng trên nền vàng nhạt không đủ tương phản. */}
      <Icon name="timer" size={18} className="mt-px shrink-0 text-warn-ink" />
      {children}
    </p>
  );
}
