import Link from 'next/link';
import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy, t } from '@devops-platform/copy';
import { Badge, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@devops-platform/ui';
import { PROBLEM_TOPIC_LABELS } from '@devops-platform/games';
import type { AppRouter } from '../../../server/trpc/routers/app-router';
import { DifficultyBadge, ViewerStatusBadge } from './problem-badges';
import { formatAcceptance, formatTimeLimit, joinTopics } from './problem-labels';

/**
 * Một hàng ĐÚNG NHƯ NÓ TỚI QUA DÂY.
 *
 * Suy từ router thay vì mượn `SolverProblemWithStats` của `server/`: xem khối
 * chú thích cùng việc ở `[code]/problem-overview.tsx`. Ngắn gọn —
 * `initialState: unknown` làm kiểu trên dây khai trường đó TUỲ CHỌN, và một
 * kiểu viết ở tầng máy chủ đòi nó BẮT BUỘC thì không nhận nổi thứ chính máy chủ
 * gửi đi.
 */
type ProblemRow = inferRouterOutputs<AppRouter>['problems']['list']['items'][number];

/** Số tag hiện thẳng trên hàng. Quá số này thì gộp thành "+N": một hàng bảng không phải chỗ liệt kê hết. */
const TAGS_SHOWN = 3;

/**
 * Bảng danh sách bài.
 *
 * Không `'use client'`: bảng chỉ nhận dữ liệu và vẽ, không giữ state nào. Phần
 * có dây nối (query, bộ lọc, con trỏ) nằm ở `problems-client.tsx`.
 *
 * ⚠ Ô mã bài là `<th scope="row">`, không phải `<td>`. Với bảng chín cột thì
 * trình đọc màn hình đọc "tên cột + giá trị" cho mỗi ô; thiếu đầu hàng thì
 * người dùng nghe chín giá trị rời mà không biết chúng thuộc bài nào.
 *
 * Chín tiêu đề cột đi qua `packages/copy` bằng chín khoá RIÊNG, không dùng lại
 * bốn khoá `*-legend` của thanh lọc dù bốn trong số chúng đang trùng chữ: một
 * legend là nhãn của bộ lọc, một `col` là tên cột, và dùng chung khoá nghĩa là
 * sửa nhãn bộ lọc thì tiêu đề bảng đổi theo mà không ai định thế.
 */
export function ProblemsTable({ items }: { readonly items: readonly ProblemRow[] }): ReactElement {
  return (
    <Table>
      <TableCaption>{t('catalog.problems.table-caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{t('catalog.problems.col-code')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-title')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-difficulty')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-topics')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-tags')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-acceptance')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-solvers')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-time-limit')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-status')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(({ problem, stats, viewerStatus }) => (
          <TableRow key={problem.code}>
            <TableHead scope="row" className="font-mono text-sm text-foreground">
              {problem.code}
            </TableHead>
            <TableCell className="min-w-56">
              <Link
                href={`/problems/${problem.code}`}
                className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {problem.title}
              </Link>
            </TableCell>
            <TableCell>
              <DifficultyBadge value={problem.difficulty} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {joinTopics(problem.topics, PROBLEM_TOPIC_LABELS)}
            </TableCell>
            <TableCell>
              <TagCell tags={problem.tags} />
            </TableCell>
            {/*
              `tabular-nums` để cột số không nhảy bề rộng giữa các hàng: với
              phân trang cursor thì mỗi trang là một tập số khác nhau, và cột
              đổi bề rộng mỗi lần sang trang đọc như trang bị vẽ lại.
            */}
            <TableCell className="tabular-nums">{renderCopy(formatAcceptance(stats))}</TableCell>
            <TableCell className="tabular-nums">{stats.solverCount}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
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

function TagCell({ tags }: { readonly tags: readonly string[] }): ReactElement {
  if (tags.length === 0) {
    /*
      CHỮ, không phải một ký tự gạch. Bản cũ vẽ U+2014 trần ở đây; trình đọc màn
      hình đọc ký tự đó ra thành tên của nó hoặc bỏ qua hẳn, nên ô đó vốn đã
      không nói được điều nó định nói.
    */
    return <span className="text-sm text-muted-foreground">{t('catalog.problems.no-tag')}</span>;
  }
  const shown = tags.slice(0, TAGS_SHOWN);
  const hidden = tags.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <Badge key={tag} variant="outline" icon={null}>
          {tag}
        </Badge>
      ))}
      {/*
        `title` mang danh sách đầy đủ cho chuột; chữ hiện ra đã nói rõ "còn N
        tag nữa" nên không cần `aria-label` thay thế, nhãn nhìn thấy được và
        nhãn nghe được là một.
      */}
      {hidden > 0 && (
        <span className="text-xs text-muted-foreground" title={tags.join(', ')}>
          {t('catalog.problems.tags-more', { n: hidden })}
        </span>
      )}
    </div>
  );
}
