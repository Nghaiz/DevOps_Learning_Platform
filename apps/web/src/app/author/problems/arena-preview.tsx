'use client';

import type { ReactElement } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import { Alert, AlertDescription, AlertTitle, Button, cn } from '@devops-platform/ui';
import type { SaveStatus } from '../../../components/author/studio';
import { Split, lineFillClass, lineForTopic } from '../../../components/kit';
import { GAME_NAME, problemPreviewHref } from './game-plugin-view';

/**
 * Mở game với chính bài đang soạn, để người soạn tự làm thử.
 *
 * Đường vào là tham số truy vấn `problem` của route game, đúng một đường: một
 * điểm gắn thứ hai là hai chỗ quyết định "bài này chơi thế nào", và chúng trôi.
 *
 * Hệ quả phải NÓI RA: đường đó nạp bài từ MÁY CHỦ theo mã.
 * - Bài chưa lưu lần nào thì chưa có mã, tức chưa có đường vào. Nói thẳng thay vì
 *   lấp bằng một nút bấm không làm gì.
 * - Bài đã lưu nhưng đang sửa dở thì game mở bản ĐÃ LƯU. Một nút xem trước mở bản
 *   cũ mà không cảnh báo là kiểu sai lặng lẽ tệ nhất.
 *
 * §18.D.5: đường vào tra theo `gameId` (`problemPreviewHref`), KHÔNG dựng bằng
 * công thức `/games/${gameId}?problem=`: game chưa có route đọc `?problem=` sẽ mở
 * một ván thường, không 404, không log. Lý do đầy đủ ở `lib/problem-preview-href.ts`.
 *
 * Icon `ResourceKind`, nếu một ngày cần, lấy từ `packages/ui`, KHÔNG từ
 * `components/k8s-arena/**`.
 */
export function ArenaPreview(props: {
  readonly code: string | null;
  readonly gameId: GameId;
  readonly saveStatus: SaveStatus;
}): ReactElement {
  const href = props.code === null ? null : problemPreviewHref(props.gameId, props.code);
  const line = lineForTopic({ gameId: props.gameId });

  return (
    <Split index="01" title={t('author.problem.arena.heading')} aside={t('author.problem.arena.lead')}>
      {props.code === null ? (
        <Alert variant="warning">
          <AlertTitle>{t('author.problem.arena.no-code-title')}</AlertTitle>
          <AlertDescription>{t('author.problem.arena.no-code-body')}</AlertDescription>
        </Alert>
      ) : href === null ? (
        <Alert variant="warning">
          <AlertTitle>{t('author.problem.arena.no-route-title')}</AlertTitle>
          <AlertDescription>
            {t('author.problem.arena.no-route-body', { game: GAME_NAME[props.gameId] })}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {props.saveStatus !== 'saved' && (
            <Alert variant="warning" className="animate-rise">
              <AlertTitle>{t('author.problem.arena.stale-title')}</AlertTitle>
              <AlertDescription>{t('author.problem.arena.stale-body')}</AlertDescription>
            </Alert>
          )}
          <div className={cn('relative flex flex-wrap items-center gap-4 overflow-hidden p-5', lineFillClass(line))}>
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-hatch opacity-10" />
            <p className="relative min-w-0 flex-1">
              <span className="block type-label opacity-80">{GAME_NAME[props.gameId]}</span>
              <span className="block font-mono text-2xl font-medium">{props.code}</span>
            </p>
            {/*
              `target="_blank"` để trang soạn không mất thứ đang gõ; `rel` đi kèm vì
              thiếu nó thì tab mới với tới được `window.opener`.
            */}
            <Button asChild variant="ink">
              <a href={href} target="_blank" rel="noopener noreferrer" className="group relative">
                {t('author.problem.arena.open', { code: props.code })}
                <ArrowUpRight
                  aria-hidden
                  className="size-4 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </a>
            </Button>
          </div>
        </div>
      )}
    </Split>
  );
}
