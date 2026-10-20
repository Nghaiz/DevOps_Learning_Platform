import type { ReactElement, ReactNode } from 'react';
import Link from 'next/link';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, ProgressLine, TopicGlyph } from '@devops-platform/ds';
import {
  problemTopicLabels,
  type ProblemStats,
  type ProblemSubmission,
  type ProblemViewerStatus,
} from '@devops-platform/games';
import type { AppRouter } from '../../../../server/trpc/routers/app-router';
import { topicLook } from '../../../../lib/topic-look';
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
 * Cột phải của trang đề: nút chính "Mở trong game" đứng đầu, rồi các thông tin
 * của bài. Không state, mọi thứ từ props.
 *
 * Không đóng khung: một vạch màu của game ở mép trên tách cột này khỏi đề bài, còn
 * các dòng thông tin ngăn nhau bằng đường kẻ mảnh.
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
  const look = topicLook({ gameId: problem.gameId });
  const percent = acceptancePercent(stats);
  /*
    `?problem=<mã>` là đường vào chế độ bài tập của game. Đường dẫn tra theo
    `problem.gameId`, KHÔNG chốt cứng route của một game: từ migration 0015 kho chở
    bài của game khác, và một bài Git mở sang đấu trường K8s chỉ ra một ván K8s mặc
    định, không lỗi nào báo.
  */
  const playHref = problemPreviewHref(problem.gameId, problem.code);
  const topicLabels = problemTopicLabels(problem.gameId);

  return (
    <section aria-labelledby="problem-facts" data-topic={look.topic} className="flex flex-col gap-6 border-t-2 border-tp-solid pt-5">
      <h2 id="problem-facts" className="sr-only">
        {t('problem.oj.detail.facts')}
      </h2>

      <div className="flex flex-col gap-2.5">
        {/*
          `null` ⇒ game chưa có đường vào nào, và nút KHÔNG hiện. Một nút dẫn tới
          404 tệ hơn một nút vắng mặt, vì nó hứa một thứ không có. Thay nút bằng
          một câu nói ra lý do, để người học không nghĩ trang bị hỏng.
        */}
        {playHref !== null ? (
          <>
            <Button asChild size="lg" variant="primary" icon="play" iconRight="arrow-right" className="w-full">
              <Link href={playHref}>{t('problem.oj.detail.play')}</Link>
            </Button>
            <p className="text-xs leading-relaxed text-ink-3">{t('problem.oj.detail.play-note')}</p>
          </>
        ) : (
          <p className="text-sm text-ink-2">{t('problem.oj.detail.play-missing')}</p>
        )}
      </div>

      <dl className="flex flex-col">
        <Fact label={t('problem.oj.detail.fact-game')}>
          <span className="inline-flex items-center gap-2 text-sm text-ink">
            <TopicGlyph topic={look.topic} icon={look.icon} size={18} />
            {gameName(problem.gameId)}
          </span>
        </Fact>
        <Fact label={t('problem.oj.detail.fact-difficulty')}>
          <ProblemDifficultyMark value={problem.difficulty} className="text-sm text-ink" />
        </Fact>
        <Fact label={t('problem.oj.detail.fact-topics')}>
          <span className="flex flex-wrap gap-1.5">
            {/*
              Bảng nhãn tra theo `problem.gameId`. `problemTopicLabels` là dữ liệu
              lá, không kéo engine vào route này.
            */}
            {problem.topics.map((topic) => (
              <span key={topic} className="inline-flex h-6 items-center rounded-full bg-tp-wash px-2.5 text-xs text-tp-ink">
                {topicLabel(topic, topicLabels)}
              </span>
            ))}
          </span>
        </Fact>
        <Fact label={t('problem.oj.detail.fact-tags')}>
          {problem.tags.length === 0 ? (
            <span className="text-sm text-ink-3">{t('problem.oj.detail.no-tags')}</span>
          ) : (
            <span className="flex flex-wrap gap-x-2.5 gap-y-1 font-mono text-xs text-ink-2">
              {problem.tags.map((tag) => (
                <span key={tag}>#{tag}</span>
              ))}
            </span>
          )}
        </Fact>
        <Fact label={t('problem.oj.detail.fact-time')}>
          <span className="text-sm tabular-nums text-ink">{renderCopy(formatTimeLimit(problem.timeLimitSec))}</span>
        </Fact>
        {problem.parMoves === null ? null : (
          <Fact label={t('problem.oj.detail.fact-par')}>
            <span className="text-sm tabular-nums text-ink">{t('problem.oj.detail.par-value', { n: problem.parMoves })}</span>
          </Fact>
        )}
        <Fact label={t('problem.oj.detail.fact-acceptance')}>
          <span className="flex flex-col gap-2">
            <span className="font-display text-2xl font-semibold tabular-nums text-ink">
              {renderCopy(formatAcceptance(stats))}
            </span>
            {/* Thước chỉ hiện khi đã có người thử: "chưa ai thử" mà kèm thước rỗng đọc ra "0%". */}
            {percent === null ? null : (
              <ProgressLine
                value={percent / 100}
                role="meter"
                tone="ok"
                label={t('problem.oj.acceptance-meter', { percent })}
              />
            )}
            {/*
              Cả câu là MỘT khoá: mẫu số nói cho người đọc biết tỉ lệ kia đáng tin
              tới đâu, nên nó không được rơi khỏi câu khi ai đó sửa layout.
            */}
            <span className="text-xs text-ink-3">
              {t('problem.oj.detail.stats', { solvers: stats.solverCount, attempts: stats.attemptCount })}
            </span>
          </span>
        </Fact>
        {viewerStatus === null ? null : (
          <Fact label={t('problem.oj.detail.fact-result')}>
            <ViewerStatusMark value={viewerStatus} />
          </Fact>
        )}
        {latest === null ? null : (
          <Fact label={t('problem.oj.detail.fact-last')}>
            <VerdictChip submission={latest} />
          </Fact>
        )}
      </dl>
    </section>
  );
}

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 border-b border-rule py-3 last:border-b-0">
      <dt className="pt-0.5 text-sm text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
