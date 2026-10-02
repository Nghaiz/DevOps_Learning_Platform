'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { Timer } from 'lucide-react';
import { renderCopy, t } from '@devops-platform/copy';
import {
  Button,
  EmptyState,
  ErrorState,
  LINE_CLASSES,
  MarkdownView,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@devops-platform/ui';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import { PageContainer, ToolHeader, lineForTopic } from '../../../../components/kit';
import { ViewerStatusMark } from '../problem-badges';
import { formatTimeLimit } from '../problem-labels';
import { ProblemOverview } from './problem-overview';
import { ProblemHints } from './problem-hints';
import { ProblemTestcases } from './problem-testcases';
import { ProblemSubmissions } from './problem-submissions';

/** Trang chi tiết chỉ hiện trang đầu lịch sử nộp, xem lý do ở `ProblemSubmissions`. */
const SUBMISSION_PAGE_SIZE = 10;

/**
 * `/problems/[code]`: đề bài như một văn bản đọc (cột trái, 68ch), bảng thông
 * tin + nút vào game (cột phải), rồi ba thẻ Kiểm tra · Gợi ý · Lượt nộp.
 *
 * Ba lượt gọi mạng chứ không phải một, và đó là chủ ý: `byCode` phải
 * `invalidate` được riêng sau khi mở gợi ý mà không kéo theo lịch sử nộp.
 *
 * `mySubmissions` chạy song song và có trạng thái lỗi RIÊNG: máy chủ trả được đề
 * mà hỏng phần lịch sử là chuyện có thật, và khi đó ẩn cả đề là lấy đi thứ người
 * dùng vào đây để đọc.
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

  const crumbs = [{ href: '/problems', label: t('problem.oj.title') }, { label: code }];

  if (detail.isPending) {
    return (
      <>
        <ToolHeader crumbs={crumbs} title={code} />
        <PageContainer className="py-10">
          {/*
            Một vùng `role="status"` có nhãn, không phải ba hình chữ nhật câm:
            không có nhãn thì trình đọc màn hình báo trang đã tải xong trong lúc
            chưa có gì để đọc.
          */}
          <div
            role="status"
            aria-live="polite"
            aria-label={t('problem.oj.detail.loading')}
            className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]"
          >
            <div className="flex flex-col gap-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-full max-w-[68ch]" />
              <Skeleton className="h-4 w-full max-w-[60ch]" />
              <Skeleton className="h-4 w-full max-w-[64ch]" />
              <Skeleton className="h-40 w-full max-w-[68ch]" />
            </div>
            <Skeleton className="h-96 w-full" />
          </div>
        </PageContainer>
      </>
    );
  }

  if (detail.isError) {
    // `NOT_FOUND` gồm cả bài `draft`: bài nháp không hiện với người học KỂ CẢ khi
    // họ biết URL, nên máy chủ trả "không có" chứ không phải "không được xem".
    if (trpcErrorCode(detail.error) === 'NOT_FOUND') {
      return (
        <>
          <ToolHeader crumbs={crumbs} title={code} />
          <PageContainer className="py-10">
            <EmptyState
              title={t('problem.oj.detail.not-found-title', { code })}
              description={t('problem.oj.detail.not-found-body')}
              action={
                <Button asChild variant="outline">
                  <Link href="/problems">{t('problem.oj.detail.back')}</Link>
                </Button>
              }
            />
          </PageContainer>
        </>
      );
    }
    return (
      <>
        <ToolHeader crumbs={crumbs} title={code} />
        <PageContainer className="py-10">
          <ErrorState
            title={t('problem.oj.detail.error-title')}
            message={describeTrpcError(detail.error)}
            retrying={detail.isFetching}
            onRetry={() => void detail.refetch()}
          />
        </PageContainer>
      </>
    );
  }

  const { problem, stats, viewerStatus } = detail.data;
  const line = lineForTopic({ gameId: problem.gameId });
  const latest = submissions.data?.items[0] ?? null;

  return (
    <>
      <ToolHeader
        crumbs={crumbs}
        kicker={problem.code}
        title={problem.title}
        status={<ViewerStatusMark value={viewerStatus} />}
      />
      {/* Dải màu tuyến của game: trang đề mang màu của game nó thuộc về. */}
      <div aria-hidden className={`h-1.5 animate-wipe ${line === 'ink' ? 'bg-ink' : LINE_CLASSES[line].bg}`} />

      <PageContainer className="py-10 md:py-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          {/*
            Bảng thông tin đứng TRƯỚC trong DOM để nút "Mở trong game" là thứ đầu
            tiên bàn phím và màn hẹp gặp; lưới đặt nó sang cột phải trên màn rộng.
          */}
          <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
            <ProblemOverview problem={problem} stats={stats} viewerStatus={viewerStatus} latest={latest} />
          </aside>

          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <article className="max-w-[68ch] animate-rise">
              <h2 className="type-label text-muted-foreground">{t('problem.oj.detail.statement')}</h2>
              {/*
                Hạn giờ nói TRƯỚC khi bấm, không phải sau: người đọc đề rồi mới biết
                bài chạy đồng hồ đã mất một phần thời gian của chính lượt đó.
              */}
              {problem.timeLimitSec !== null && (
                <p className="mt-4 flex items-start gap-2 bg-warning/10 px-4 py-3 text-sm text-warning">
                  <Timer aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('problem.oj.detail.time-limit', {
                    limit: renderCopy(formatTimeLimit(problem.timeLimitSec)),
                  })}
                </p>
              )}
              <div className="mt-6">
                {/*
                  `resolveAssetUrl` luôn trả `null`: hệ bài tập chưa có đường phục
                  vụ tệp đính kèm, nên một ảnh tương đối trong đề là thứ KHÔNG tải
                  được. Trả `null` để component vẽ chỗ trống có nhãn.
                */}
                <MarkdownView markdown={problem.statement} resolveAssetUrl={() => null} />
              </div>
            </article>

            <Tabs defaultValue="checks" className="mt-12">
              <TabsList aria-label={t('problem.oj.detail.tabs')}>
                <TabsTrigger value="checks">{t('problem.oj.detail.tab-checks')}</TabsTrigger>
                <TabsTrigger value="hints">{t('problem.oj.detail.tab-hints')}</TabsTrigger>
                <TabsTrigger value="submissions">{t('problem.oj.detail.tab-subs')}</TabsTrigger>
              </TabsList>
              <TabsContent value="checks" className="mt-6">
                {/*
                  Nhãn của testcase ẩn đã bị MÁY CHỦ cắt trước khi tới đây
                  (`server/problems/solver.ts`); component chỉ vẽ thứ nó nhận được.
                */}
                <ProblemTestcases testcases={problem.testcases} />
              </TabsContent>
              <TabsContent value="hints" className="mt-6">
                <ProblemHints
                  hints={problem.hints}
                  pendingHintId={reveal.isPending ? (reveal.variables?.hintId ?? null) : null}
                  errorMessage={reveal.isError ? describeTrpcError(reveal.error) : null}
                  onReveal={(hintId) => {
                    reveal.mutate({ code, hintId });
                  }}
                />
              </TabsContent>
              <TabsContent value="submissions" className="mt-6">
                <ProblemSubmissions
                  items={submissions.data?.items ?? []}
                  isPending={submissions.isPending}
                  isError={submissions.isError}
                  errorMessage={describeTrpcError(submissions.error)}
                  hasMore={submissions.data?.nextCursor != null}
                  onRetry={() => void submissions.refetch()}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
