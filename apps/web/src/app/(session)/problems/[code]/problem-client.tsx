'use client';

import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { t } from '@devops-platform/copy';
import { Button, EmptyState, ErrorState, Skeleton } from '@devops-platform/ui';
import { api } from '../../../../lib/trpc-react';
import { describeTrpcError, trpcErrorCode } from '../../../../lib/trpc';
import { ProblemOverview } from './problem-overview';
import { ProblemHints } from './problem-hints';
import { ProblemTestcases } from './problem-testcases';
import { ProblemSubmissions } from './problem-submissions';

/** Trang chi tiết chỉ hiện trang đầu lịch sử nộp — xem lý do ở `ProblemSubmissions`. */
const SUBMISSION_PAGE_SIZE = 10;

/**
 * `/problems/[code]` — đề bài, gợi ý có giá, lịch sử nộp, và đường vào đấu
 * trường ở chế độ bài tập.
 *
 * Ba lượt gọi mạng chứ không phải một, và đó là chủ ý: `byCode` phải
 * `invalidate` được riêng sau khi mở gợi ý mà không kéo theo lịch sử nộp (thứ
 * không đổi vì một lượt mở gợi ý). Gộp cả hai vào một procedure sẽ làm mỗi lần
 * mở gợi ý tải lại cả bảng lịch sử.
 *
 * `mySubmissions` chạy song song và có trạng thái lỗi RIÊNG: máy chủ trả được
 * đề bài mà hỏng phần lịch sử là chuyện có thật, và khi đó ẩn luôn cả đề là
 * lấy đi thứ người dùng vào đây để đọc.
 */
export function ProblemClient({ code }: { readonly code: string }): ReactElement {
  const utils = api.useUtils();
  const detail = api.problems.byCode.useQuery({ code });
  const submissions = api.problems.mySubmissions.useQuery({ code, limit: SUBMISSION_PAGE_SIZE });
  const reveal = api.problems.revealHint.useMutation({
    onSuccess: async () => {
      // Đọc lại `byCode` thay vì nhét kết quả mutation vào cache bằng tay:
      // `revealed`/`text` do máy chủ quyết (hợp đồng nói rõ), nên máy chủ cũng
      // là chỗ duy nhất được phép nói chúng đã đổi.
      await utils.problems.byCode.invalidate({ code });
    },
  });

  if (detail.isPending) {
    return (
      <Shell>
        {/*
          Cùng khuôn với khung chờ của lưới danh mục: một vùng `role="status"`
          có nhãn, không phải ba hình chữ nhật câm. Không có nhãn thì trình đọc
          màn hình thông báo trang đã tải xong trong lúc chưa có gì để đọc.
        */}
        <div
          role="status"
          aria-live="polite"
          aria-label={t('catalog.problem.loading')}
          className="flex flex-col gap-8"
        >
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Shell>
    );
  }

  if (detail.isError) {
    // `NOT_FOUND` gồm cả bài `draft`: hợp đồng nói bài nháp không hiện với người
    // học KỂ CẢ khi họ biết URL, nên máy chủ trả "không có" chứ không phải
    // "không được xem" — phân biệt hai câu đó chính là rò rỉ sự tồn tại của bài.
    if (trpcErrorCode(detail.error) === 'NOT_FOUND') {
      return (
        <Shell>
          <EmptyState
            title={t('catalog.problem.not-found-title', { code })}
            description={t('catalog.problem.not-found-body')}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/problems">{t('catalog.problem.back')}</Link>
              </Button>
            }
          />
        </Shell>
      );
    }
    return (
      <Shell>
        <ErrorState
          title={t('catalog.problem.error-title')}
          message={describeTrpcError(detail.error)}
          retrying={detail.isFetching}
          onRetry={() => void detail.refetch()}
        />
      </Shell>
    );
  }

  const { problem, stats, viewerStatus } = detail.data;

  return (
    <Shell>
      <ProblemOverview problem={problem} stats={stats} viewerStatus={viewerStatus} />
      {/*
        §18.B.4 — danh sách testcase. Nhãn của testcase ẩn đã bị MÁY CHỦ cắt
        trước khi tới đây (`server/problems/solver.ts`), nên component chỉ vẽ
        thứ nó nhận được. Đặt trên phần gợi ý vì nó là một phần của ĐỀ BÀI:
        người làm cần biết bài chấm bằng bao nhiêu testcase trước khi quyết
        định có mua gợi ý hay không.
      */}
      <ProblemTestcases testcases={problem.testcases} />
      <ProblemHints
        hints={problem.hints}
        pendingHintId={reveal.isPending ? (reveal.variables?.hintId ?? null) : null}
        errorMessage={reveal.isError ? describeTrpcError(reveal.error) : null}
        onReveal={(hintId) => {
          reveal.mutate({ code, hintId });
        }}
      />
      <ProblemSubmissions
        items={submissions.data?.items ?? []}
        isPending={submissions.isPending}
        isError={submissions.isError}
        errorMessage={describeTrpcError(submissions.error)}
        hasMore={submissions.data?.nextCursor != null}
        onRetry={() => void submissions.refetch()}
      />
    </Shell>
  );
}

/**
 * Khung trang. `max-w-4xl` hẹp hơn `max-w-6xl` của trang danh sách vì đây là
 * VĂN BẢN để đọc — một dòng đề bài kéo dài hết màn hình rộng thì mắt lạc dòng.
 *
 * ⛔ KHÔNG `<main>`: vỏ ứng dụng (`components/shell/app-shell.tsx`) sở hữu
 * landmark đó cho mọi trang, và cái thứ hai làm axe đỏ `landmark-unique` —
 * `components/session/landmark-contract.test.ts` quét tĩnh việc này.
 */
function Shell({ children }: { readonly children: ReactNode }): ReactElement {
  return <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">{children}</div>;
}
