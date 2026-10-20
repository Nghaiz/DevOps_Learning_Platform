'use client';

import type { ReactElement } from 'react';
import { t } from '@devops-platform/copy';
import type { GameId } from '@devops-platform/games';
import type { SaveStatus } from '../../../components/author/studio';
import { FormBlock } from '../../../components/author/studio';
import { GAME_NAME, problemPreviewHref } from './game-plugin-view';
import { Button, GameArt, Notice, type GameArtKind } from '@devops-platform/ds';

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
const ART: Readonly<Partial<Record<GameId, GameArtKind>>> = {
  k8s: 'k8s',
  git: 'git',
  cicd: 'cicd',
  netpol: 'netpol',
  dockerfile: 'dockerfile',
};

export function ArenaPreview(props: {
  readonly code: string | null;
  readonly gameId: GameId;
  readonly saveStatus: SaveStatus;
}): ReactElement {
  const href = props.code === null ? null : problemPreviewHref(props.gameId, props.code);
  const art = ART[props.gameId];

  return (
    <FormBlock title={t('author.problem.arena.heading')} note={t('author.problem.arena.lead')}>
      {props.code === null ? (
        <Notice tone="warn" title={t('author.problem.arena.no-code-title')}>{t('author.problem.arena.no-code-body')}</Notice>
      ) : href === null ? (
        <Notice tone="warn" title={t('author.problem.arena.no-route-title')}>
            {t('author.problem.arena.no-route-body', { game: GAME_NAME[props.gameId] })}
          </Notice>
      ) : (
        <div className="flex flex-col gap-4">
          {props.saveStatus !== 'saved' && (
            <Notice tone="warn" title={t('author.problem.arena.stale-title')} className="animate-enter">{t('author.problem.arena.stale-body')}</Notice>
          )}
          <div className="relative flex flex-wrap items-center gap-5 overflow-hidden border border-rule bg-paper p-5">
            {art === undefined ? null : <GameArt kind={art} width={120} className="hidden sm:block" />}
            <p className="relative min-w-0 flex-1">
              <span className="block text-sm text-tp-ink">{GAME_NAME[props.gameId]}</span>
              <span className="block font-mono text-2xl font-medium text-ink">{props.code}</span>
            </p>
            {/*
              `target="_blank"` để trang soạn không mất thứ đang gõ; `rel` đi kèm vì
              thiếu nó thì tab mới với tới được `window.opener`.
            */}
            <Button asChild variant="primary" iconRight="external-link">
              <a href={href} target="_blank" rel="noopener noreferrer">
                {t('author.problem.arena.open', { code: props.code })}
              </a>
            </Button>
          </div>
        </div>
      )}
    </FormBlock>
  );
}
