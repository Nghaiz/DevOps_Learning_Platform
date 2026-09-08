import type { ReactElement } from 'react';
import Link from 'next/link';
import { Play, Timer } from 'lucide-react';
import { Alert, AlertDescription, Badge, Button, MarkdownView } from '@devops-platform/ui';
import {
  PROBLEM_TOPIC_LABELS,
  type ProblemForSolver,
  type ProblemStats,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import { DifficultyBadge, ViewerStatusBadge } from '../problem-badges';
import { formatAcceptance, formatTimeLimit } from '../problem-labels';

/**
 * Phần đầu trang bài: định danh, phân loại, hạn giờ, đề bài, và nút vào đấu
 * trường. Không state — mọi thứ đến từ props.
 */
export function ProblemOverview(props: {
  readonly problem: ProblemForSolver;
  readonly stats: ProblemStats;
  readonly viewerStatus: ProblemViewerStatus | null;
}): ReactElement {
  const { problem, stats, viewerStatus } = props;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="font-mono text-sm text-muted-foreground">{problem.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{problem.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge value={problem.difficulty} />
          <ViewerStatusBadge value={viewerStatus} />
          {problem.topics.map((topic) => (
            <Badge key={topic} variant="secondary" icon={null}>
              {PROBLEM_TOPIC_LABELS[topic]}
            </Badge>
          ))}
          {problem.tags.map((tag) => (
            <Badge key={tag} variant="outline" icon={null}>
              {tag}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Tỉ lệ giải {formatAcceptance(stats)} · {stats.solverCount} người đã giải trên {stats.attemptCount} người đã
          thử
        </p>
      </div>

      {/*
        Hạn giờ nói TRƯỚC khi bấm, không phải sau. Người đọc đề rồi mới biết bài
        chạy đồng hồ đã mất mất một phần thời gian của chính lượt đó.
      */}
      {problem.timeLimitSec !== null && (
        /*
          Câu này nằm trong `AlertDescription` chứ không phải `AlertTitle`, và
          đó là ràng buộc a11y chứ không phải thẩm mỹ: `AlertTitle` render `<h5>`,
          đặt ngay dưới `<h1>` của trang là một bậc tiêu đề nhảy cóc — axe báo
          `heading-order`, và cổng a11y của repo chạy trên các trang này.
        */
        <Alert variant="warning">
          <Timer aria-hidden className="size-4" />
          <AlertDescription>
            <strong className="font-medium">Bài này có hạn giờ: {formatTimeLimit(problem.timeLimitSec)}.</strong> Đồng
            hồ bắt đầu chạy khi bạn mở đấu trường, không phải khi bạn đọc đề.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border bg-card p-5 shadow-elevation-1">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Đề bài</h2>
        {/*
          `resolveAssetUrl` luôn trả `null`: hệ bài tập chưa có đường phục vụ tệp
          đính kèm, nên một ảnh tương đối trong đề là thứ KHÔNG tải được. Trả
          `null` để component vẽ chỗ trống có nhãn — bịa một URL sẽ cho một ảnh
          vỡ mà không ai biết vì sao.
        */}
        <MarkdownView markdown={problem.statement} resolveAssetUrl={() => null} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/*
          `?problem=<mã>` là đường vào chế độ bài tập của đấu trường — lead chốt
          2026-09-08 và đọc tham số này ở `app/games/k8s/page.tsx`.
          `asChild` nên icon phải nằm TRONG `<Link>`: Radix Slot đòi đúng một
          phần tử con, thêm node anh em là ném lỗi lúc chạy.
        */}
        <Button asChild size="lg">
          <Link href={`/games/k8s?problem=${encodeURIComponent(problem.code)}`}>
            <Play aria-hidden className="size-4" />
            Bắt đầu làm bài
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href="/problems">Về danh sách bài</Link>
        </Button>
      </div>
    </section>
  );
}
