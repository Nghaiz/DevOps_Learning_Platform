import Link from 'next/link';
import type { ReactElement } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import { renderCopy, t } from '@devops-platform/copy';
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

/**
 * Số tag hiện thẳng trong ô, phần dư gom vào `catalog.problems.tags-more`.
 *
 * Ràng buộc là BỀ RỘNG chứ không phải biên tập: `.practice-problem-title` rộng
 * 44% và tối thiểu 230px (`practice.css`), còn dòng phụ chở CẢ chủ đề lẫn tag
 * từ lượt gộp cột. Một bài tám tag sẽ đẩy dòng phụ xuống ba dòng và làm mọi
 * hàng của bảng cao lệch nhau.
 *
 * ⚠ Con số này chưa đo trên dữ liệu thật, nó chọn theo bề rộng ô. Nếu kho bài
 * thường xuyên có bài nhiều tag thì đo lại ở đây, đừng sửa chữ trong bản đồ.
 */
const VISIBLE_TAGS = 3;

export function ProblemsTable({ items }: { readonly items: readonly ProblemRow[] }): ReactElement {
  return (
    <Table className="practice-problems-table">
      <TableCaption className="sr-only">{t('catalog.problems.table-caption')}</TableCaption>
      <TableHeader>
        <TableRow>
          {/*
            Cột đầu chở CẢ mã bài lẫn tên bài từ lượt gộp cột (bảng sáu cột,
            `docs/frontend-practice-redesign.md`), nên tiêu đề của nó ghép hai
            khoá. Để mỗi `col-title` thì tiêu đề nói thiếu đúng thứ người ta
            quét mắt tìm trước tiên, và `col-code` thành khoá mồ côi.
          */}
          <TableHead scope="col">
            {t('catalog.problems.col-code')} · {t('catalog.problems.col-title')}
          </TableHead>
          <TableHead scope="col">{t('catalog.problems.col-difficulty')}</TableHead>
          <TableHead scope="col">{t('catalog.problems.col-acceptance')}</TableHead>
          <TableHead scope="col" className="practice-table-secondary">
            {t('catalog.problems.col-solvers')}
          </TableHead>
          <TableHead scope="col" className="practice-table-secondary">
            {t('catalog.problems.col-time-limit')}
          </TableHead>
          <TableHead scope="col">{t('catalog.problems.col-status')}</TableHead>
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
              {/*
                Dòng phụ chở chủ đề VÀ tag, hai thứ trước lượt gộp cột nằm ở
                hai cột riêng và tự phân biệt bằng chỗ đứng. Gộp rồi thì chúng
                dùng chung một dấu ngăn, nên nhãn ở đây trả lại đúng thứ phép
                gộp lấy mất: không có nhãn thì "Mạng · ingress" đọc ra là bốn
                thứ cùng loại.
              */}
              <p>
                <span>
                  {t('catalog.problems.col-topics')}:{' '}
                  {joinTopics(problem.topics, problemTopicLabels(problem.gameId))}
                </span>
                {' · '}
                <span>
                  {t('catalog.problems.col-tags')}: {tagSummary(problem.tags)}
                </span>
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

/**
 * Danh sách tag của một bài, thành một chuỗi cho ô bảng hẹp.
 *
 * Ba ca, và ca rỗng KHÔNG trả chuỗi rỗng: dòng phụ có nhãn "Tag:" đứng trước,
 * nên một giá trị rỗng đọc ra như màn hình vỡ chứ không đọc ra là bài này
 * không có tag nào. Đó đúng là việc của `catalog.problems.no-tag`, và chú
 * thích của khoá đó ghi cùng lý do cho bản cũ vốn vẽ một dấu gạch trần.
 *
 * Dấu chấm giữa là DẤU NỐI nên nó ở đây chứ không ở bản đồ, cùng luật với
 * `joinTopics`.
 */
function tagSummary(tags: readonly string[]): string {
  if (tags.length === 0) {
    return t('catalog.problems.no-tag');
  }
  if (tags.length <= VISIBLE_TAGS) {
    return tags.join(' · ');
  }
  const shown = tags.slice(0, VISIBLE_TAGS).join(' · ');
  return `${shown} · ${t('catalog.problems.tags-more', { n: tags.length - VISIBLE_TAGS })}`;
}
