import Link from 'next/link';
import type { ReactElement } from 'react';
import { Badge, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@devops-platform/ui';
import { PROBLEM_TOPIC_LABELS, type ProblemWithStats } from '@devops-platform/games';
import { DifficultyBadge, ViewerStatusBadge } from './problem-badges';
import { formatAcceptance, formatTimeLimit, joinTopics } from './problem-labels';

/** Số tag hiện thẳng trên hàng. Quá số này thì gộp thành "+N" — một hàng bảng không phải chỗ liệt kê hết. */
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
 */
export function ProblemsTable({ items }: { readonly items: readonly ProblemWithStats[] }): ReactElement {
  return (
    <Table>
      <TableCaption>Bấm vào tên bài để xem đề và bắt đầu làm.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Mã bài</TableHead>
          <TableHead scope="col">Tên bài</TableHead>
          <TableHead scope="col">Độ khó</TableHead>
          <TableHead scope="col">Chủ đề</TableHead>
          <TableHead scope="col">Tag</TableHead>
          <TableHead scope="col">Tỉ lệ giải</TableHead>
          <TableHead scope="col">Người giải</TableHead>
          <TableHead scope="col">Hạn giờ</TableHead>
          <TableHead scope="col">Trạng thái</TableHead>
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
              `tabular-nums` để cột số không nhảy bề rộng giữa các hàng — với
              phân trang cursor thì mỗi trang là một tập số khác nhau, và cột
              đổi bề rộng mỗi lần sang trang đọc như trang bị vẽ lại.
            */}
            <TableCell className="tabular-nums">{formatAcceptance(stats)}</TableCell>
            <TableCell className="tabular-nums">{stats.solverCount}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{formatTimeLimit(problem.timeLimitSec)}</TableCell>
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
    return <span className="text-sm text-muted-foreground">—</span>;
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
        tag nữa" nên không cần `aria-label` thay thế — nhãn nhìn thấy được và
        nhãn nghe được là một.
      */}
      {hidden > 0 && (
        <span className="text-xs text-muted-foreground" title={tags.join(', ')}>
          còn {hidden} tag nữa
        </span>
      )}
    </div>
  );
}
