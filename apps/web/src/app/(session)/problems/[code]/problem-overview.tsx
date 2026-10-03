import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, LINE_CODE, Meter, Num } from '@devops-platform/ui';
import {
  problemTopicLabels,
  type ProblemStats,
  type ProblemSubmission,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { lineFillClass, lineForTopic } from '../../../../components/kit';
import { ProblemDifficultyMark, ViewerStatusMark } from '../problem-badges';
import { acceptancePercent, formatAcceptance, formatTimeLimit, topicLabel } from '../problem-labels';
import { gameName } from '../problem-game';
import { VerdictChip } from './verdict-chip';
/*
 * Nhập từ `lib/`, KHÔNG từ `author/problems/game-plugin-view`: module đó nhập
 * `PROBLEM_PLUGINS`, và bảng plugin kéo cả hai engine vào bundle của route này.
 * Xem khối đầu `lib/problem-preview-href.ts` về cái giá đã đo.
 */
import { problemPreviewHref } from '../../../../lib/problem-preview-href';

/**
 * Bài ĐÚNG NHƯ NÓ TỚI QUA DÂY, suy từ router thay vì khai lại. Với
 * `exactOptionalPropertyTypes` thì kiểu của `server/` và kiểu của dây không gán
 * được cho nhau (`initialState` tuỳ chọn trên dây), và lời khai đúng là của dây.
 */
type ProblemDetail = inferRouterOutputs<AppRouter>['problems']['byCode'];

/**
 * Bảng thông tin bên phải trang đề: game, độ khó, chủ đề, hạn giờ, tỉ lệ giải,
 * kết quả của bạn, và nút chính "Mở trong game". Không state, mọi thứ từ props.
 */
export function ProblemOverview(props: {
  /**
   * ⚠ Bản ĐÃ CHE của máy chủ: không mang `check`/`args` của cách chấm, và trang
   * này chưa bao giờ đọc tới chúng. Xem `server/problems/solver.ts`.
   */
  readonly problem: ProblemDetail['problem'];
  readonly stats: ProblemStats;
  readonly viewerStatus: ProblemViewerStatus | null;
  /** Lượt nộp mới nhất của người xem, `null` khi chưa có hoặc chưa tải xong. */
  readonly latest: ProblemSubmission | null;
}): ReactElement {
  const { problem, stats, viewerStatus, latest } = props;
  const line = lineForTopic({ gameId: problem.gameId });
  const percent = acceptancePercent(stats);
  /*
    `?problem=<mã>` là đường vào chế độ bài tập của game. Đường dẫn tra theo
    `problem.gameId`, KHÔNG chốt cứng `/games/k8s`: từ migration 0015 kho chở bài
    của game khác, và một bài Git mở sang đấu trường K8s chỉ ra một ván K8s mặc
    định, không lỗi nào báo.
  */
  const playHref = problemPreviewHref(problem.gameId, problem.code);
  const topicLabels = problemTopicLabels(problem.gameId);

  return (
    <section aria-labelledby="problem-facts" className="border-2 border-ink bg-card">
      <div className={`flex items-center gap-4 px-5 py-4 ${lineFillClass(line)}`}>
        <span className="font-mono text-2xl font-bold tracking-wider">
          {line === 'ink' ? problem.gameId.toUpperCase() : LINE_CODE[line]}
        </span>
        <span className="min-w-0">
          <span className="block type-label">{t('problem.oj.detail.fact-game')}</span>
          <span className="block type-title">{gameName(problem.gameId)}</span>
        </span>
      </div>

      <h2 id="problem-facts" className="sr-only">
        {t('problem.oj.detail.facts')}
      </h2>

      <dl className="divide-y divide-border px-5">
        <Fact label={t('problem.oj.detail.fact-difficulty')}>
          <ProblemDifficultyMark value={problem.difficulty} className="text-sm" />
        </Fact>
        <Fact label={t('problem.oj.detail.fact-topics')}>
          <span className="flex flex-wrap gap-1.5">
            {/*
              Bảng nhãn tra theo `problem.gameId`. `problemTopicLabels` là dữ liệu
              lá, không kéo engine vào route này.
            */}
            {problem.topics.map((topic) => (
              <span key={topic} className="inline-flex h-6 items-center bg-muted px-2 text-xs">
                {topicLabel(topic, topicLabels)}
              </span>
            ))}
          </span>
        </Fact>
        <Fact label={t('problem.oj.detail.fact-tags')}>
          {problem.tags.length === 0 ? (
            <span className="text-sm text-muted-foreground">{t('problem.oj.detail.no-tags')}</span>
          ) : (
            <span className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-xs">
              {problem.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </span>
          )}
        </Fact>
        <Fact label={t('problem.oj.detail.fact-time')}>
          <span className="font-mono text-sm tabular-nums">
            {renderCopy(formatTimeLimit(problem.timeLimitSec))}
          </span>
        </Fact>
        {problem.parMoves !== null && (
          <Fact label={t('problem.oj.detail.fact-par')}>
            <span className="font-mono text-sm tabular-nums">
              {t('problem.oj.detail.par-value', { n: problem.parMoves })}
            </span>
          </Fact>
        )}
        <Fact label={t('problem.oj.detail.fact-acceptance')}>
          <span className="flex flex-col gap-2">
            <span className="flex items-center gap-3">
              <Num className="text-2xl">{renderCopy(formatAcceptance(stats))}</Num>
              {percent !== null && (
                <Meter
                  value={percent}
                  max={100}
                  segments={10}
                  tone="iac"
                  label={t('problem.oj.acceptance-meter', { percent })}
                  className="flex-1"
                />
              )}
            </span>
            {/*
              Cả câu là MỘT khoá: mẫu số nói cho người đọc biết tỉ lệ kia đáng tin
              tới đâu, nên nó không được rơi khỏi câu khi ai đó sửa layout.
            */}
            <span className="text-xs text-muted-foreground">
              {t('problem.oj.detail.stats', {
                solvers: stats.solverCount,
                attempts: stats.attemptCount,
              })}
            </span>
          </span>
        </Fact>
        {viewerStatus !== null && (
          <Fact label={t('problem.oj.detail.fact-result')}>
            <ViewerStatusMark value={viewerStatus} className="text-sm" />
          </Fact>
        )}
        {latest !== null && (
          <Fact label={t('problem.oj.detail.fact-last')}>
            <VerdictChip submission={latest} />
          </Fact>
        )}
      </dl>

      <div className="flex flex-col gap-3 border-t-2 border-ink p-5">
        {/*
          `null` ⇒ game chưa có đường vào nào, và nút KHÔNG hiện. Một nút dẫn tới
          404 tệ hơn một nút vắng mặt, vì nó hứa một thứ không có. Thay nút bằng
          một câu nói ra lý do, để người học không nghĩ trang bị hỏng.

          `asChild` nên icon phải nằm TRONG `<Link>`: Radix Slot đòi đúng một phần
          tử con.
        */}
        {playHref !== null ? (
          <>
            <Button asChild size="lg" variant="primary" className="group w-full justify-between">
              <Link href={playHref}>
                {t('problem.oj.detail.play')}
                <ArrowRight
                  aria-hidden
                  className="size-5 transition-transform duration-[var(--motion-base)] group-hover:translate-x-1"
                />
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">{t('problem.oj.detail.play-note')}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('problem.oj.detail.play-missing')}</p>
        )}
      </div>
    </section>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 py-3">
      <dt className="pt-0.5 type-label text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
