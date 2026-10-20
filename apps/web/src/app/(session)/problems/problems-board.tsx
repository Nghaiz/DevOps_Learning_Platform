import Link from 'next/link';
import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy, t } from '@devops-platform/copy';
import { Icon, TBody, TD, TH, THead, TR, Table } from '@devops-platform/ds';
import { problemTopicLabels } from '@devops-platform/games';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { topicLook } from '../../../lib/topic-look';
import { ProblemDifficultyMark, ViewerStatusMark } from './problem-badges';
import { gameName } from './problem-game';
import { acceptancePercent, formatAcceptance, formatTimeLimit, topicLabel } from './problem-labels';

type ProblemRow = inferRouterOutputs<AppRouter>['problems']['list']['items'][number];

/** Số chủ đề hiện thẳng trên dòng; phần dư gom vào một nhãn "+N". */
const VISIBLE_TOPICS = 2;

/**
 * Bảng đề: một dòng một đề, cột thẳng hàng để so nhanh độ khó, tỉ lệ giải và số người
 * giải giữa các đề. Tên đề là liên kết sang trang đề; dòng đổi nền khi rê vào.
 *
 * Cột Game chỉ hiện khi đang xem "Tất cả game": đã chọn một game thì mọi dòng cùng một
 * giá trị, và một cột lặp lại một chữ là nhiễu.
 */
export function ProblemsBoard({
  items,
  showGame,
}: {
  readonly items: readonly ProblemRow[];
  readonly showGame: boolean;
}): ReactElement {
  return (
    <Table label={t('problem.oj.board-label')}>
      <THead>
        <tr>
          <TH className="w-10">
            <span className="sr-only">{t('problem.oj.col.status')}</span>
          </TH>
          <TH>{t('problem.oj.col.problem')}</TH>
          {showGame ? <TH className="hidden md:table-cell">{t('problem.oj.col.game')}</TH> : null}
          <TH className="hidden lg:table-cell">{t('problem.oj.col.topics')}</TH>
          <TH>{t('problem.oj.col.difficulty')}</TH>
          <TH numeric className="hidden sm:table-cell">
            {t('problem.oj.col.acceptance')}
          </TH>
          <TH numeric className="hidden md:table-cell">
            {t('problem.oj.col.solvers')}
          </TH>
          <TH numeric className="hidden xl:table-cell">
            {t('problem.oj.col.time')}
          </TH>
        </tr>
      </THead>
      <TBody>
        {items.map(({ problem, stats, viewerStatus }) => {
          const look = topicLook({ gameId: problem.gameId });
          const labels = problemTopicLabels(problem.gameId);
          const shownTopics = problem.topics.slice(0, VISIBLE_TOPICS);
          const extra = problem.topics.length - shownTopics.length;
          const percent = acceptancePercent(stats);
          return (
            <TR key={problem.code} className="group/row">
              <TD className="w-10">
                <ViewerStatusMark value={viewerStatus} compact />
              </TD>
              <TD className="min-w-[14rem]">
                <Link
                  href={`/problems/${problem.code}`}
                  className="flex flex-col gap-0.5 outline-none focus-visible:underline"
                >
                  <span className="font-medium text-ink transition-colors group-hover/row:text-acc-ink">{problem.title}</span>
                  <span className="font-mono text-xs text-ink-3">{problem.code}</span>
                </Link>
              </TD>
              {showGame ? (
                <TD className="hidden whitespace-nowrap md:table-cell">
                  <span data-topic={look.topic} className="inline-flex items-center gap-1.5 text-tp-ink">
                    <Icon name={look.icon} size={16} tint="topic" />
                    <span className="text-ink-2">{gameName(problem.gameId)}</span>
                  </span>
                </TD>
              ) : null}
              <TD className="hidden lg:table-cell">
                <span className="flex flex-wrap gap-1">
                  {shownTopics.map((topic) => (
                    <span key={topic} data-topic={look.topic} className="inline-flex h-6 items-center rounded-full bg-tp-wash px-2 text-xs text-tp-ink">
                      {topicLabel(topic, labels)}
                    </span>
                  ))}
                  {extra > 0 ? <span className="inline-flex h-6 items-center px-1 text-xs text-ink-3">+{extra}</span> : null}
                </span>
              </TD>
              <TD className="whitespace-nowrap">
                <ProblemDifficultyMark value={problem.difficulty} className="text-ink-2" />
              </TD>
              <TD numeric className="hidden whitespace-nowrap sm:table-cell">
                <span className="inline-flex items-center gap-2">
                  {/* Thước chỉ hiện khi đã có người thử: "chưa ai thử" mà kèm thước rỗng đọc ra "0%". */}
                  {percent === null ? null : (
                    <span aria-hidden="true" className="relative h-1 w-12 overflow-hidden rounded-full bg-well-2">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-ok-solid" style={{ width: `${percent}%` }} />
                    </span>
                  )}
                  <span className="text-ink-2">{renderCopy(formatAcceptance(stats))}</span>
                </span>
              </TD>
              <TD numeric className="hidden text-ink-2 md:table-cell">
                {stats.solverCount}
              </TD>
              <TD numeric className="hidden whitespace-nowrap text-ink-2 xl:table-cell">
                {renderCopy(formatTimeLimit(problem.timeLimitSec))}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
