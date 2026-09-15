import Link from 'next/link';
import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy } from '@devops-platform/copy';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@devops-platform/ui';
import { problemTopicLabels } from '@devops-platform/games';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { DifficultyBadge, ViewerStatusBadge } from './problem-badges';
import { formatAcceptance, formatTimeLimit, joinTopics } from './problem-labels';

type ProblemRow = inferRouterOutputs<AppRouter>['problems']['list']['items'][number];

export function ProblemsTable({ items }: { readonly items: readonly ProblemRow[] }): ReactElement {
  return (
    <Table className="practice-problems-table">
      <TableCaption className="sr-only">Danh sách bài tập</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Bài tập</TableHead>
          <TableHead scope="col">Độ khó</TableHead>
          <TableHead scope="col">Tỉ lệ đạt</TableHead>
          <TableHead scope="col" className="practice-table-secondary">
            Đã giải
          </TableHead>
          <TableHead scope="col" className="practice-table-secondary">
            Thời gian
          </TableHead>
          <TableHead scope="col">Trạng thái</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(({ problem, stats, viewerStatus }) => (
          <TableRow key={problem.code}>
            <TableHead scope="row" className="practice-problem-title">
              <Link href={`/problems/${problem.code}`}>
                <span>{problem.code}</span>
                <strong>{problem.title}</strong>
              </Link>
              <p>
                {joinTopics(problem.topics, problemTopicLabels(problem.gameId))}
                {problem.tags.length > 0 ? ` · ${problem.tags.join(' · ')}` : ''}
              </p>
            </TableHead>
            <TableCell>
              <DifficultyBadge value={problem.difficulty} />
            </TableCell>
            <TableCell className="tabular-nums">{renderCopy(formatAcceptance(stats))}</TableCell>
            <TableCell className="tabular-nums practice-table-secondary">
              {stats.solverCount}
            </TableCell>
            <TableCell className="practice-table-secondary">
              {renderCopy(formatTimeLimit(problem.timeLimitSec))}
            </TableCell>
            <TableCell>
              <ViewerStatusBadge value={viewerStatus} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
