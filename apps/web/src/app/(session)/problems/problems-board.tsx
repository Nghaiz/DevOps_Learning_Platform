import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { Timer, Users } from 'lucide-react';
import { renderCopy, t } from '@devops-platform/copy';
import { Meter } from '@devops-platform/ui';
import { problemTopicLabels } from '@devops-platform/games';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { Board, BoardRow, lineForTopic } from '../../../components/kit';
import { ProblemDifficultyMark, ViewerStatusMark } from './problem-badges';
import { acceptancePercent, formatAcceptance, formatTimeLimit, topicLabel } from './problem-labels';

type ProblemRow = inferRouterOutputs<AppRouter>['problems']['list']['items'][number];

/**
 * Số tag hiện thẳng trên dòng, phần dư gom vào `problem.oj.tags-more`.
 *
 * Ràng buộc là BỀ RỘNG chứ không phải biên tập: dòng phụ chở mã bài, chủ đề và
 * tag, và một bài tám tag sẽ đẩy nó xuống ba dòng, làm các dòng của bảng cao
 * lệch nhau. Con số chưa đo trên dữ liệu thật; đo lại ở đây nếu kho thường có
 * bài nhiều tag.
 */
const VISIBLE_TAGS = 3;

/**
 * Bảng tuyến bài tập (design-brief §4.3). Mỗi dòng là MỘT liên kết sang trang đề.
 *
 * - Dấu tuyến mang màu GAME của bài (K8s chàm, Git cam, CI/CD xanh lá) và tô đặc
 *   khi bạn đã giải: nhìn dọc cột dấu là thấy mình đã đi qua những ga nào.
 * - Cột thông tin có bề rộng cố định để các dòng thẳng hàng như một bảng giờ
 *   tàu, nhưng mỗi giá trị tự nói nó là gì ("12 người giải", "10 phút"), nên
 *   không cần hàng tiêu đề và vẫn đọc được khi xuống dòng trên màn hẹp.
 */
export function ProblemsBoard({ items }: { readonly items: readonly ProblemRow[] }): ReactElement {
  return (
    <Board label={t('problem.oj.board-label')}>
      {items.map(({ problem, stats, viewerStatus }, order) => (
        <BoardRow
          key={problem.code}
          href={`/problems/${problem.code}`}
          order={order}
          line={lineForTopic({ gameId: problem.gameId })}
          lineState={viewerStatus === 'solved' ? 'done' : 'todo'}
          title={problem.title}
          sub={<RowSub problem={problem} />}
          meta={<RowMeta problem={problem} stats={stats} />}
          state={<ViewerStatusMark value={viewerStatus} className="w-24" />}
        />
      ))}
    </Board>
  );
}

function RowSub({ problem }: { readonly problem: ProblemRow['problem'] }): ReactElement {
  const labels = problemTopicLabels(problem.gameId);
  const shownTags = problem.tags.slice(0, VISIBLE_TAGS);
  const extraTags = problem.tags.length - shownTags.length;

  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <span className="font-mono font-medium text-foreground">{problem.code}</span>
      {/*
        Bảng nhãn tra theo `problem.gameId`, không phải bảng K8s cố định: một bài
        Git mang chủ đề `branching` tra hụt bảng K8s và vẽ ra nhãn rỗng mà không
        lỗi nào báo. `problemTopicLabels` là dữ liệu lá, không kéo engine vào
        route này (`engine-leak.test.ts`).
      */}
      {problem.topics.map((topic) => (
        <span
          key={topic}
          className="inline-flex h-5 items-center border border-border bg-card px-1.5 text-xs text-foreground"
        >
          {topicLabel(topic, labels)}
        </span>
      ))}
      {shownTags.map((tag) => (
        <span key={tag} className="font-mono text-xs">
          #{tag}
        </span>
      ))}
      {extraTags > 0 && (
        <span className="font-mono text-xs">{t('problem.oj.tags-more', { n: extraTags })}</span>
      )}
    </span>
  );
}

function RowMeta({
  problem,
  stats,
}: {
  readonly problem: ProblemRow['problem'];
  readonly stats: ProblemRow['stats'];
}): ReactElement {
  const percent = acceptancePercent(stats);

  return (
    <>
      <ProblemDifficultyMark value={problem.difficulty} className="w-28" />
      <span className="flex w-32 items-center gap-2">
        {/*
          Thước chỉ hiện khi đã có người thử. "Chưa ai thử" mà kèm một thước rỗng
          sẽ đọc ra là "0%", đúng câu sai mà `formatAcceptance` sinh ra để tránh.
        */}
        {percent !== null && (
          <Meter
            value={percent}
            max={100}
            tone="iac"
            label={t('problem.oj.acceptance-meter', { percent })}
            className="h-1.5 w-14"
          />
        )}
        <span className="font-mono text-xs tabular-nums">{renderCopy(formatAcceptance(stats))}</span>
      </span>
      <span className="flex w-28 items-center gap-1.5 font-mono text-xs tabular-nums">
        <Users aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        {t('problem.oj.solvers', { n: stats.solverCount })}
      </span>
      <span className="flex w-36 items-center gap-1.5 font-mono text-xs tabular-nums">
        <Timer aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        {renderCopy(formatTimeLimit(problem.timeLimitSec))}
      </span>
    </>
  );
}
