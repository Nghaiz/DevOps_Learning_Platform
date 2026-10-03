'use client';

import { useId, useMemo, useState, type ReactElement } from 'react';
import { BadgeCheck, Search, ServerOff, X } from 'lucide-react';
import { renderCopy, t } from '@devops-platform/copy';
import { Button, Chip, EmptyState, Input, type LineId } from '@devops-platform/ui';
import {
  GAMES,
  GAME_META,
  GAME_TOPICS,
  GAME_TOPIC_LABEL,
  describeGameCount,
  filterGames,
  type GameEntry,
  type GameTopic,
} from '../../../app/games/games-catalog';
import { normalizeSearchQuery } from '../../catalog/catalog-search';
import { Board, BoardRow, PageContainer, PosterHeader, Section, lineForTopic } from '../../kit';
import { useViewer } from '../../shell/viewer-context';
import { GameBand } from './game-band';
import { countCompleted, type GameFacts } from './game-facts';
import { useGameProgress, type ProgressByGame } from './use-game-progress';

/**
 * Trang `/games`: ba game chơi được, mỗi game một dải, rồi danh sách game đang
 * dựng, rồi lối sang phần có chấm điểm.
 *
 * Không thẻ, không hàng ô số liệu (design-brief §0): con số nằm trong câu, trong
 * thước đo và trên bảng tuyến. Game chạy hoàn toàn trong trình duyệt, nên trang
 * này cũng không gọi mạng: dữ liệu game là hằng, tiến độ đọc từ `localStorage`.
 */

/** Màu tuyến của một game, theo TÊN game ở `@devops-platform/games` (xem `GameEntry.gameId`). */
function lineOf(game: GameEntry): LineId {
  const line = lineForTopic({ gameId: game.gameId });
  if (line === 'ink') {
    throw new Error(`Game ${game.id} (${game.gameId}) chưa có tuyến màu trong topic-line.ts.`);
  }
  return line;
}

function matchesQuery(game: GameEntry, query: string): boolean {
  if (query === '') return true;
  const haystack = [game.title, game.description, ...game.topics.map((topic) => GAME_TOPIC_LABEL[topic])].join(' ');
  return normalizeSearchQuery(haystack).includes(query);
}

const META_ICON = { sandbox: ServerOff, login: BadgeCheck } as const;

function HubAside({
  facts,
  progress,
}: {
  readonly facts: readonly GameFacts[];
  readonly progress: ProgressByGame | null;
}): ReactElement {
  const total = facts.reduce((sum, game) => sum + game.levelIds.length, 0);
  const done =
    progress === null
      ? null
      : facts.reduce((sum, game) => sum + countCompleted(game.levelIds, progress[game.id].completed), 0);
  return (
    <div className="border-2 border-current p-5 md:p-6">
      <p className="type-label">{t('games.hub.progress.label')}</p>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="type-display tabular-nums">{done === null ? '0' : String(done)}</span>
        <span className="font-mono text-sm">{t('games.hub.progress.unit', { total })}</span>
      </p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {GAME_META.map((item) => {
          const Icon = META_ICON[item.icon];
          return (
            <li key={item.icon} className="inline-flex items-center gap-1.5 border border-current px-2.5 py-1 font-mono text-xs">
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm">{t('games.hub.saved-local')}</p>
    </div>
  );
}

export function GamesHub({ facts }: { readonly facts: readonly GameFacts[] }): ReactElement {
  const viewer = useViewer();
  const progress = useGameProgress();
  const searchId = useId();
  const topicLabelId = useId();
  const [search, setSearch] = useState('');
  const [topic, setTopic] = useState<GameTopic | 'all'>('all');

  const query = normalizeSearchQuery(search);
  const filtering = topic !== 'all' || query !== '';
  const shown = useMemo(
    () => filterGames(GAMES, { topic, difficulty: 'all' }).filter((game) => matchesQuery(game, query)),
    [topic, query],
  );
  const playable = shown.filter((game) => game.href !== null);
  const upcoming = shown.filter((game) => game.href === null);
  const totalLevels = facts.reduce((sum, game) => sum + game.levelIds.length, 0);
  const isAuthor = viewer?.role === 'author' || viewer?.role === 'admin';

  const clear = (): void => {
    setSearch('');
    setTopic('all');
  };

  return (
    <>
      <PosterHeader
        section="games"
        kicker={t('games.hub.kicker', { games: facts.length, levels: totalLevels })}
        title={t('games.hub.title')}
        lead={t('games.hub.lead')}
        aside={<HubAside facts={facts} progress={progress} />}
      />

      <PageContainer>
        <div className="flex flex-col gap-4 border-b border-border py-6 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-labelledby={topicLabelId} className="flex flex-wrap items-center gap-2">
            <span id={topicLabelId} className="mr-2 type-label text-muted-foreground">
              {t('games.hub.filter.label')}
            </span>
            <Chip selected={topic === 'all'} onClick={() => setTopic('all')}>
              {t('games.hub.filter.all')}
            </Chip>
            {GAME_TOPICS.map((value) => (
              <Chip key={value} selected={topic === value} onClick={() => setTopic(value)}>
                {GAME_TOPIC_LABEL[value]}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="relative w-full sm:w-72">
              <label htmlFor={searchId} className="sr-only">
                {t('games.hub.search.label')}
              </label>
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={searchId}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('games.hub.search.placeholder')}
                className="pl-9"
              />
            </div>
            <p className="font-mono text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {renderCopy(describeGameCount(shown.length, filtering))}
            </p>
            {filtering ? (
              <Button variant="ghost" size="sm" onClick={clear} iconLeft={<X aria-hidden="true" />}>
                {t('games.hub.clear')}
              </Button>
            ) : null}
          </div>
        </div>
      </PageContainer>

      {shown.length === 0 ? (
        <PageContainer className="py-12">
          <EmptyState
            title={t('games.hub.empty.title')}
            description={t('games.hub.empty.body')}
            action={
              <Button variant="outline" onClick={clear}>
                {t('games.hub.clear')}
              </Button>
            }
          />
        </PageContainer>
      ) : playable.length === 0 ? (
        <PageContainer className="py-10">
          <p className="max-w-2xl type-lead">
            {t('games.hub.none-playable', {
              topic: topic === 'all' ? t('games.hub.filter.all') : GAME_TOPIC_LABEL[topic],
            })}
          </p>
        </PageContainer>
      ) : (
        <ol aria-label={t('games.hub.playable-label')} className="mt-10 border-t border-foreground">
          {playable.map((game, order) => {
            const gameFacts = facts.find((entry) => entry.id === game.id);
            if (gameFacts === undefined) {
              throw new Error(`Game ${game.id} chơi được mà máy chủ không gửi dữ liệu màn của nó.`);
            }
            return (
              <GameBand
                key={game.id}
                game={game}
                facts={gameFacts}
                line={lineOf(game)}
                progress={progress === null ? null : progress[gameFacts.id]}
                number={GAMES.indexOf(game) + 1}
                order={order}
              />
            );
          })}
        </ol>
      )}

      {upcoming.length > 0 ? (
        <Section kicker={t('games.soon.kicker')} title={t('games.soon.title')}>
          <p className="mb-6 max-w-2xl text-muted-foreground">{t('games.soon.note')}</p>
          <Board label={t('games.soon.title')}>
            {upcoming.map((game, index) => (
              <BoardRow
                key={game.id}
                order={index}
                line={lineOf(game)}
                lineState="locked"
                title={game.title}
                sub={game.description}
                meta={
                  <span className="font-mono text-xs text-muted-foreground">
                    {game.topics.map((item) => GAME_TOPIC_LABEL[item]).join(' · ')}
                  </span>
                }
                state={
                  <span className="border border-border px-2 py-1 type-label text-muted-foreground">
                    {t('games.soon.badge')}
                  </span>
                }
                disabled
              />
            ))}
          </Board>
        </Section>
      ) : null}

      <Section tone="muted">
        <div className={isAuthor ? 'grid gap-10 lg:grid-cols-2' : 'grid gap-10'}>
          <div>
            <p className="type-label text-muted-foreground">{t('games.practice.kicker')}</p>
            <h2 className="mt-1 type-headline">{t('games.practice.title')}</h2>
            <Board label={t('games.practice.title')} className="mt-6">
              <BoardRow
                href="/problems"
                order={0}
                line="iac"
                title={t('games.practice.problems.title')}
                sub={t('games.practice.problems.sub')}
              />
              <BoardRow
                href="/exams"
                order={1}
                line="iac"
                title={t('games.practice.exams.title')}
                sub={t('games.practice.exams.sub')}
              />
            </Board>
          </div>
          {isAuthor ? (
            <div>
              <p className="type-label text-muted-foreground">{t('games.studio.kicker')}</p>
              <h2 className="mt-1 type-headline">{t('games.studio.title')}</h2>
              <Board label={t('games.studio.title')} className="mt-6">
                <BoardRow
                  href="/author/problems/new"
                  order={0}
                  line="cicd"
                  title={t('games.studio.problem.title')}
                  sub={t('games.studio.problem.sub')}
                />
                <BoardRow
                  href="/games/git?mode=builder"
                  order={1}
                  line="cicd"
                  title={t('games.studio.builder.title')}
                  sub={t('games.studio.builder.sub')}
                />
                <BoardRow
                  href="/author/new"
                  order={2}
                  line="cicd"
                  title={t('games.studio.lesson.title')}
                  sub={t('games.studio.lesson.sub')}
                />
              </Board>
            </div>
          ) : null}
        </div>
      </Section>
    </>
  );
}
