import type { ReactElement } from 'react';
import Link from 'next/link';
import { Play, Timer } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy, t } from '@devops-platform/copy';
import { Alert, AlertDescription, Badge, Button, MarkdownView } from '@devops-platform/ui';
import {
  problemTopicLabels,
  type ProblemStats,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { DifficultyBadge, ViewerStatusBadge } from '../problem-badges';
import { formatAcceptance, formatTimeLimit, topicLabel } from '../problem-labels';
/*
 * Nhập từ `lib/`, KHÔNG từ `author/problems/game-plugin-view` — module đó nhập
 * `PROBLEM_PLUGINS`, và bảng plugin kéo cả hai engine vào bundle của route này.
 * Xem khối đầu `lib/problem-preview-href.ts` về cái giá đã đo.
 */
import { problemPreviewHref } from '../../../../lib/problem-preview-href';

/**
 * Bài ĐÚNG NHƯ NÓ TỚI QUA DÂY, suy từ router thay vì khai lại.
 *
 * ⚠ Bản trước nhận `SolverProblem` nhập thẳng từ `server/problems/solver.ts`, và
 * nó vỡ ngay khi `StoredProblem.initialState` đổi sang `unknown`: `unknown` bao
 * gồm cả `undefined`, nên kiểu đầu ra tRPC suy ra khai `initialState?: unknown`
 * — TUỲ CHỌN — trong khi `SolverProblem` đòi BẮT BUỘC. Với
 * `exactOptionalPropertyTypes: true` thì hai hình dạng đó không gán được cho
 * nhau, và lời khai đúng là lời khai của dây: `JSON.stringify` bỏ hẳn khoá mang
 * `undefined`, nên trường đó THẬT SỰ có thể không tới.
 *
 * Suy từ `inferRouterOutputs` là khuôn đang dùng ở chín trang client khác của
 * app (`labs`, `lessons`, `paths`, `admin/*`…); hai trang `problems` là ngoại lệ
 * duy nhất còn với tay vào `server/` để mượn kiểu. Đưa chúng về khuôn chung thì
 * component không thể đòi một hình dạng mà máy chủ không gửi.
 */
type ProblemDetail = inferRouterOutputs<AppRouter>['problems']['byCode'];

/**
 * Phần đầu trang bài: định danh, phân loại, hạn giờ, đề bài, và nút vào đấu
 * trường. Không state — mọi thứ đến từ props.
 */
export function ProblemOverview(props: {
  /**
   * ⚠ Bản ĐÃ CHE của máy chủ, không phải `ProblemBase` của `packages/games`.
   * Kiểu kia còn mang `check` + `args` của cách chấm và trang này chưa bao giờ
   * đọc tới chúng. Xem `server/problems/solver.ts`.
   */
  readonly problem: ProblemDetail['problem'];
  readonly stats: ProblemStats;
  readonly viewerStatus: ProblemViewerStatus | null;
}): ReactElement {
  const { problem, stats, viewerStatus } = props;
  const playHref = problemPreviewHref(problem.gameId, problem.code);

  return (
    <section
      className={
        problem.gameId === 'git' ? 'git-oj-overview flex flex-col gap-5' : 'flex flex-col gap-5'
      }
    >
      <div className="flex flex-col gap-3">
        <p className="font-mono text-sm text-muted-foreground">{problem.code}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{problem.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge value={problem.difficulty} />
          <ViewerStatusBadge value={viewerStatus} />
          {/*
            Bảng nhãn tra theo `problem.gameId`, không phải bảng K8s cố định
            (§18.D, 2026-09-15). Trước lượt này một bài Git mang chủ đề
            `branching` tra hụt và vẽ ra `Badge` RỖNG — không lỗi, không log,
            không test nào đỏ. `problemTopicLabels` nhập DỮ LIỆU LÁ chứ không
            nhập plugin, nên nó không kéo engine vào route này; lý do đầy đủ ở
            `packages/games/src/problem-topic-labels.ts`.
          */}
          {problem.topics.map((topic) => (
            <Badge key={topic} variant="secondary" icon={null}>
              {topicLabel(topic, problemTopicLabels(problem.gameId))}
            </Badge>
          ))}
          {problem.tags.map((tag) => (
            <Badge key={tag} variant="outline" icon={null}>
              {tag}
            </Badge>
          ))}
        </div>
        {/*
          Cả câu là MỘT khoá, không phải ba mảnh ghép trong JSX: mẫu số là thứ
          nói cho người đọc biết tỉ lệ kia đáng tin tới đâu, nên nó không được
          rơi ra khỏi câu khi ai đó sửa layout.
        */}
        <p className="text-sm text-muted-foreground">
          {t('catalog.problem.stats', {
            acceptance: renderCopy(formatAcceptance(stats)),
            solvers: stats.solverCount,
            attempts: stats.attemptCount,
          })}
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
            <strong className="font-medium">
              {t('catalog.problem.time-limit-lead', {
                limit: renderCopy(formatTimeLimit(problem.timeLimitSec)),
              })}
            </strong>{' '}
            {t('catalog.problem.time-limit-note')}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border bg-card p-5 shadow-elevation-1">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          {t('catalog.problem.statement')}
        </h2>
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
          2026-09-08.

          ⛔ Đường dẫn tra theo `problem.gameId`, KHÔNG chốt cứng `/games/k8s`.
          Bản cũ chốt cứng, và nó đúng cho tới migration 0015: từ đó kho lưu chở
          được bài của game khác, nên một bài Git ở đây mở sang đấu trường K8s —
          không 404, không lỗi, chỉ là một ván K8s mặc định. Người học kết luận
          bài hỏng; người soạn kết luận mình lưu nhầm.

          `null` ⇒ game chưa có đường vào nào, và nút KHÔNG hiện. Một nút dẫn tới
          404 tệ hơn một nút vắng mặt, vì nó hứa một thứ không có.

          `asChild` nên icon phải nằm TRONG `<Link>`: Radix Slot đòi đúng một
          phần tử con, thêm node anh em là ném lỗi lúc chạy.
        */}
        {playHref !== null && (
          <Button asChild size="lg">
            <Link href={playHref}>
              <Play aria-hidden className="size-4" />
              {t('catalog.problem.start')}
            </Link>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm">
          <Link href="/problems">{t('catalog.problem.back')}</Link>
        </Button>
      </div>
    </section>
  );
}
